#!/usr/bin/env node

import chalk from 'chalk';
import readline from 'readline';
import { checkAdb, getPackages, uninstallPackage } from '../lib/adb.js';

const KEY = {
  CTRL_C: '\u0003',
  CTRL_Q: '\u0011',
  ESC: '\u001b',
  RETURN: '\r',
  NEWLINE: '\n',
  BACKSPACE: '\u007f',
  BACKSPACE_WIN: '\b',
  SPACE: ' ',
  TAB: '\t',
};

const KEY_SEQUENCES = {
  up: ['\u001b[A', '\u001bOA', '\u0000H', '\u00e0H'],
  down: ['\u001b[B', '\u001bOB', '\u0000P', '\u00e0P'],
  left: ['\u001b[D', '\u001bOD', '\u0000K', '\u00e0K', '\u001b[Z'],
  right: ['\u001b[C', '\u001bOC', '\u0000M', '\u00e0M', KEY.TAB],
  pageup: ['\u001b[5~', '\u0000I', '\u00e0I'],
  pagedown: ['\u001b[6~', '\u0000Q', '\u00e0Q'],
};

const state = {
  phase: 'boot',
  screen: 'loading',
  message: 'Initializing session...',
  error: '',
  device: null,
  items: [],
  filteredByGroup: {
    System: [],
    User: [],
  },
  cursorByGroup: {
    System: 0,
    User: 0,
  },
  scrollByGroup: {
    System: 0,
    User: 0,
  },
  activePane: 'System',
  query: '',
  selected: new Set(),
  pending: [],
  currentPackage: '',
  progressIndex: 0,
  successCount: 0,
  failCount: 0,
  running: true,
};

let isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
let rawModeEnabled = false;

function stripAnsi(text) {
  return String(text).replace(/\x1B\[[0-9;]*m/g, '');
}

function enterAltScreen() {
  if (!isInteractive) return;
  process.stdout.write('\x1b[?1049h\x1b[?25l');
}

function leaveAltScreen() {
  if (!isInteractive) return;
  process.stdout.write('\x1b[?25h\x1b[?1049l');
}

function cleanupAndExit(code = 0) {
  state.running = false;
  if (isInteractive) {
    process.stdin.off('keypress', onKeypress);
    process.stdout.off('resize', render);
    if (rawModeEnabled) {
      process.stdin.setRawMode(false);
      rawModeEnabled = false;
    }
    leaveAltScreen();
  }
  process.exit(code);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pad(text, width) {
  const plainLength = stripAnsi(text).length;
  if (plainLength >= width) return text;
  return text + ' '.repeat(width - plainLength);
}

function truncate(text, width) {
  if (width <= 0) return '';
  const plain = stripAnsi(text);
  if (plain.length <= width) return pad(text, width);
  if (width === 1) return '…';
  return plain.slice(0, width - 1) + '…';
}

function line(width, left = '', right = '') {
  const rightText = right ? ` ${right}` : '';
  const available = Math.max(0, width - stripAnsi(rightText).length);
  return truncate(left, available) + rightText;
}

function fullWidthRule(width, color = chalk.dim) {
  return color('─'.repeat(Math.max(0, width)));
}

function createItems(sysPackages, userPackages) {
  return [
    ...sysPackages.map((pkg) => ({ pkg, group: 'System' })),
    ...userPackages.map((pkg) => ({ pkg, group: 'User' })),
  ];
}

function filterItems() {
  const query = state.query.trim().toLowerCase();
  state.filteredByGroup.System = state.items.filter((item) => (
    item.group === 'System' &&
    (!query || item.pkg.toLowerCase().includes(query) || item.group.toLowerCase().includes(query))
  ));
  state.filteredByGroup.User = state.items.filter((item) => (
    item.group === 'User' &&
    (!query || item.pkg.toLowerCase().includes(query) || item.group.toLowerCase().includes(query))
  ));

  for (const group of ['System', 'User']) {
    const list = state.filteredByGroup[group];
    if (list.length === 0) {
      state.cursorByGroup[group] = 0;
      state.scrollByGroup[group] = 0;
      continue;
    }
    state.cursorByGroup[group] = clamp(state.cursorByGroup[group], 0, list.length - 1);
    syncScroll(group);
  }

  if (state.filteredByGroup[state.activePane].length === 0) {
    state.activePane = state.filteredByGroup.System.length > 0 ? 'System' : 'User';
  }
}

function getListHeight() {
  const { height } = getTerminalSize();
  // Header(3) + ListHeader(2) + Footer(2) + Buffer(1) = 8 lines of UI around list content
  // maxPaneHeight is bodyHeight - 5. bodyHeight is height - 3.
  // total items = (height - 3) - 5 - 2 (pane title + rule) = height - 10
  return Math.max(1, height - 10);
}

function syncScroll(group = state.activePane) {
  const list = state.filteredByGroup[group];
  const listHeight = getListHeight();
  if (listHeight <= 0 || list.length === 0) {
    state.scrollByGroup[group] = 0;
    return;
  }
  if (state.cursorByGroup[group] < state.scrollByGroup[group]) {
    state.scrollByGroup[group] = state.cursorByGroup[group];
  }
  const lastVisible = state.scrollByGroup[group] + listHeight - 1;
  if (state.cursorByGroup[group] > lastVisible) {
    state.scrollByGroup[group] = state.cursorByGroup[group] - listHeight + 1;
  }
  const maxScroll = Math.max(0, list.length - listHeight);
  state.scrollByGroup[group] = clamp(state.scrollByGroup[group], 0, maxScroll);
}

function moveCursor(delta) {
  const group = state.activePane;
  const list = state.filteredByGroup[group];
  if (list.length === 0) return;
  state.cursorByGroup[group] = clamp(state.cursorByGroup[group] + delta, 0, list.length - 1);
  syncScroll(group);
}

function switchPane(direction) {
  const oldPane = state.activePane;
  const nextPane = direction > 0 ? 'User' : 'System';

  if (oldPane === nextPane) return;

  const nextList = state.filteredByGroup[nextPane];
  if (nextList.length > 0) {
    // Get relative vertical position on screen
    const relativeIndex = state.cursorByGroup[oldPane] - state.scrollByGroup[oldPane];

    state.activePane = nextPane;

    // Apply the same relative position to the new pane
    state.cursorByGroup[nextPane] = clamp(
      state.scrollByGroup[nextPane] + relativeIndex,
      0,
      nextList.length - 1
    );

    syncScroll(nextPane);
  }
}

function toggleCurrent() {
  const item = getCurrentItem();
  if (!item) return;
  if (state.selected.has(item.pkg)) {
    state.selected.delete(item.pkg);
  } else {
    state.selected.add(item.pkg);
  }
}

function getCurrentItem() {
  const group = state.activePane;
  return state.filteredByGroup[group][state.cursorByGroup[group]] || null;
}

function getTerminalSize() {
  return {
    width: process.stdout.columns || 100,
    height: process.stdout.rows || 32,
  };
}

function summaryStats() {
  const systemCount = state.items.filter((item) => item.group === 'System').length;
  const userCount = state.items.length - systemCount;
  return { systemCount, userCount };
}

function renderLoading(width, height) {
  const rows = [];
  rows.push(chalk.white.bold('ADB App Remove'));
  rows.push(chalk.dim('Full-screen ADB debloat session'));
  rows.push('');
  rows.push(chalk.cyan(state.message));
  while (rows.length < height - 2) rows.push('');
  rows.push(fullWidthRule(width));
  rows.push(chalk.dim('Waiting for ADB response...'));
  return rows;
}

function renderError(width, height) {
  const rows = [];
  rows.push(chalk.red.bold('Connection Error'));
  rows.push('');
  for (const part of state.error.split('\n')) rows.push(chalk.white(part));
  rows.push('');
  rows.push(chalk.dim('Press Ctrl+Q or Ctrl+C to exit.'));
  while (rows.length < height) rows.push('');
  return rows.slice(0, height);
}

function renderHeader(width) {
  const device = state.device;
  const deviceName = device ? [device.brand, device.model].filter(Boolean).join(' ').trim() : 'No device';
  const right = state.query ? chalk.yellow(`filter: ${state.query}`) : chalk.dim('filter: all');
  return [
    line(width, chalk.white.bold('ADB App Remove'), chalk.dim('FULL SCREEN')),
    line(width, chalk.dim(deviceName || 'Unknown device'), right),
    fullWidthRule(width),
  ];
}

function renderFooter(width, left = '', right = '') {
  return [line(width, chalk.dim(left), chalk.dim(right))];
}

function renderList(width, height) {
  const rows = [];
  const { systemCount, userCount } = summaryStats();
  const selectedCount = state.selected.size;
  const current = getCurrentItem();
  const systemVisible = state.filteredByGroup.System.slice(state.scrollByGroup.System, state.scrollByGroup.System + Math.max(4, height - 6));
  const userVisible = state.filteredByGroup.User.slice(state.scrollByGroup.User, state.scrollByGroup.User + Math.max(4, height - 6));

  rows.push(line(width, chalk.white(`Packages ${chalk.dim(`(${state.items.length})`)}`), chalk.dim(`selected ${selectedCount}`)));
  rows.push(line(width, chalk.dim(`system ${state.filteredByGroup.System.length}/${systemCount}  |  user ${state.filteredByGroup.User.length}/${userCount}`), chalk.dim(`focus ${state.activePane.toLowerCase()}`)));
  rows.push(fullWidthRule(width));

  const leftWidth = Math.max(20, Math.floor((width - 3) / 2));
  const rightWidth = Math.max(20, width - leftWidth - 3);
  const maxPaneHeight = Math.max(4, height - 5);

  const renderPane = (group, visible, paneWidth) => {
    const paneRows = [];
    const isActivePane = state.activePane === group;
    const title = isActivePane ? chalk.cyan.bold(`${group} Apps`) : chalk.white(`${group} Apps`);
    const count = chalk.dim(`(${state.filteredByGroup[group].length})`);
    paneRows.push(line(paneWidth, title, count));
    paneRows.push(chalk.dim('─'.repeat(Math.max(0, paneWidth))));

    if (visible.length === 0) {
      paneRows.push(chalk.yellow('No matches'));
      paneRows.push(chalk.dim('Adjust filter'));
    } else {
      for (let index = 0; index < visible.length; index++) {
        const absoluteIndex = state.scrollByGroup[group] + index;
        const item = visible[index];
        const isActive = isActivePane && absoluteIndex === state.cursorByGroup[group];
        const isSelected = state.selected.has(item.pkg);
        const marker = isActive ? chalk.cyan('❯') : ' ';
        const bullet = isSelected ? chalk.green('●') : chalk.dim('○');
        const pkgColor = isSelected ? chalk.green : (isActive ? chalk.white : chalk.dim);
        const rowText = `${marker} ${bullet} ${item.pkg}`;
        const formattedRow = line(paneWidth, isActive ? chalk.bold(rowText) : rowText);
        paneRows.push(pkgColor(formattedRow));
      }
    }
    return paneRows.slice(0, maxPaneHeight);
  };

  const leftPane = renderPane('System', systemVisible, leftWidth);
  const rightPane = renderPane('User', userVisible, rightWidth);
  const paneHeight = Math.max(leftPane.length, rightPane.length);

  for (let i = 0; i < paneHeight; i++) {
    rows.push(`${pad(leftPane[i] || '', leftWidth)} ${chalk.dim('│')} ${pad(rightPane[i] || '', rightWidth)}`);
  }

  const info = current ? `${current.pkg}  |  ${current.group} app` : 'No package selected';
  while (rows.length < height - 2) rows.push('');
  rows.push(fullWidthRule(width));
  rows.push(...renderFooter(width, info, 'up/down move | left/right switch | space toggle | enter review | esc clear | ctrl+q quit'));
  return rows.slice(0, height);
}

function renderConfirm(width, height) {
  const rows = [];
  const pending = state.pending;
  rows.push(chalk.white.bold('Review Selection'));
  rows.push(chalk.dim(`Ready to uninstall ${pending.length} package(s) for user 0.`));
  rows.push(fullWidthRule(width));
  for (const pkg of pending.slice(0, Math.max(3, height - 6))) rows.push(chalk.red(`- ${pkg}`));
  if (pending.length > Math.max(3, height - 6)) rows.push(chalk.dim(`... and ${pending.length - Math.max(3, height - 6)} more`));
  while (rows.length < height - 2) rows.push('');
  rows.push(fullWidthRule(width));
  rows.push(...renderFooter(width, 'Press Enter to confirm', 'Enter confirm | Esc back | ctrl+q quit'));
  return rows.slice(0, height);
}

function renderRunning(width, height) {
  const rows = [];
  rows.push(chalk.white.bold('Uninstalling Packages'));
  rows.push(chalk.dim(`Processing ${state.progressIndex}/${state.pending.length}`));
  rows.push(fullWidthRule(width));
  const barWidth = Math.max(10, width - 10);
  const ratio = state.pending.length === 0 ? 0 : state.progressIndex / state.pending.length;
  const filled = Math.round(barWidth * ratio);
  const bar = chalk.cyan('█'.repeat(filled)) + chalk.dim('░'.repeat(Math.max(0, barWidth - filled)));
  rows.push(bar);
  rows.push('');
  rows.push(line(width, chalk.white(state.currentPackage || 'Preparing...'), chalk.dim(`${state.successCount} ok / ${state.failCount} failed`)));
  while (rows.length < height - 2) rows.push('');
  rows.push(fullWidthRule(width));
  rows.push(...renderFooter(width, 'Working...', 'Do not disconnect the device'));
  return rows.slice(0, height);
}

function renderSummary(width, height) {
  const rows = [];
  rows.push(chalk.white.bold('Summary'));
  rows.push(chalk.green(`Success: ${state.successCount}`));
  rows.push(state.failCount > 0 ? chalk.red(`Failed: ${state.failCount}`) : chalk.dim('Failed: 0'));
  rows.push(fullWidthRule(width));
  rows.push(chalk.dim('Press Enter or Esc to return to the list. Press Ctrl+Q or Ctrl+C to exit.'));
  while (rows.length < height) rows.push('');
  return rows.slice(0, height);
}

let lastFrame = '';

function render() {
  if (!isInteractive || !state.running) return;
  const { width, height } = getTerminalSize();
  const bodyHeight = Math.max(6, height - 3);
  let rows;
  if (state.screen === 'loading') rows = renderLoading(width, height);
  else if (state.screen === 'error') rows = renderError(width, height);
  else if (state.screen === 'list') rows = [...renderHeader(width), ...renderList(width, bodyHeight)];
  else if (state.screen === 'confirm') rows = [...renderHeader(width), ...renderConfirm(width, bodyHeight)];
  else if (state.screen === 'running') rows = [...renderHeader(width), ...renderRunning(width, bodyHeight)];
  else rows = [...renderHeader(width), ...renderSummary(width, bodyHeight)];

  while (rows.length < height) rows.push('');
  const frame = rows.slice(0, height).map((row) => truncate(row, width)).join('\n');

  if (frame !== lastFrame) {
    process.stdout.write('\x1b[H' + frame + '\x1b[J');
    lastFrame = frame;
  }
}

function isKeyMatch(key, input, name, sequences = []) {
  if (key?.name === name) return true;
  return sequences.includes(input);
}

async function refreshList() {
  state.message = 'Refreshing package list...';
  const oldScreen = state.screen;
  state.screen = 'loading';
  render();

  try {
    const { sysPackages, userPackages } = getPackages(state.device.adbPath);
    state.items = createItems(sysPackages, userPackages);
    state.selected.clear();
    state.pending = [];
    state.currentPackage = '';
    state.progressIndex = 0;
    state.successCount = 0;
    state.failCount = 0;
    filterItems();
    state.screen = 'list';
  } catch (error) {
    state.screen = 'error';
    state.error = error.message;
  }
  render();
}

function onKeypress(str, key) {
  if (!state.running) return;
  const input = typeof str === 'string' ? str : '';
  const lowerInput = input.toLowerCase();
  if ((key && key.ctrl && key.name === 'c') || input === KEY.CTRL_C) {
    cleanupAndExit(0);
    return;
  }
  if (state.screen === 'error' || state.screen === 'summary') {
    if (state.screen === 'summary' && (isKeyMatch(key, input, 'return', [KEY.RETURN, KEY.NEWLINE]) || isKeyMatch(key, input, 'escape', [KEY.ESC]))) {
      void refreshList();
      return;
    }
    if (!key || ['return', 'escape'].includes(key.name) || lowerInput === KEY.CTRL_Q) cleanupAndExit(0);
    return;
  }
  if (state.screen === 'running') return;
  if ((key && key.ctrl && key.name === 'q') || input === KEY.CTRL_Q) {
    cleanupAndExit(0);
    return;
  }
  if (state.screen === 'confirm') {
    if (isKeyMatch(key, input, 'return', [KEY.RETURN, KEY.NEWLINE])) {
      void startUninstall();
      return;
    }
    if (isKeyMatch(key, input, 'escape', [KEY.ESC])) {
      state.screen = 'list';
      render();
    }
    return;
  }
  if (isKeyMatch(key, input, 'up', KEY_SEQUENCES.up)) {
    moveCursor(-1);
    render();
    return;
  }
  if (isKeyMatch(key, input, 'down', KEY_SEQUENCES.down)) {
    moveCursor(1);
    render();
    return;
  }
  if (isKeyMatch(key, input, 'left', KEY_SEQUENCES.left)) {
    switchPane(-1);
    render();
    return;
  }
  if (isKeyMatch(key, input, 'tab', [KEY.TAB])) {
    switchPane(state.activePane === 'System' ? 1 : -1);
    render();
    return;
  }
  if (isKeyMatch(key, input, 'right', KEY_SEQUENCES.right)) {
    switchPane(1);
    render();
    return;
  }
  if (isKeyMatch(key, input, 'pageup', KEY_SEQUENCES.pageup)) {
    moveCursor(-getListHeight());
    render();
    return;
  }
  if (isKeyMatch(key, input, 'pagedown', KEY_SEQUENCES.pagedown)) {
    moveCursor(getListHeight());
    render();
    return;
  }
  if (isKeyMatch(key, input, 'return', [KEY.RETURN, KEY.NEWLINE])) {
    if (state.selected.size > 0) {
      state.pending = Array.from(state.selected);
      state.screen = 'confirm';
      render();
    }
    return;
  }
  if (isKeyMatch(key, input, 'backspace', [KEY.BACKSPACE, KEY.BACKSPACE_WIN])) {
    if (state.query.length > 0) {
      state.query = state.query.slice(0, -1);
      filterItems();
      render();
    }
    return;
  }
  if (isKeyMatch(key, input, 'escape', [KEY.ESC])) {
    if (state.query) {
      state.query = '';
      filterItems();
      render();
    }
    return;
  }
  if (input === KEY.SPACE) {
    toggleCurrent();
    render();
    return;
  }
  if (input && !key?.ctrl && !key?.meta && /^[\w.-]$/i.test(input)) {
    state.query += input;
    filterItems();
    render();
  }
}

async function startUninstall() {
  state.screen = 'running';
  state.progressIndex = 0;
  state.successCount = 0;
  state.failCount = 0;
  render();
  for (const pkg of state.pending) {
    state.progressIndex += 1;
    state.currentPackage = pkg;
    render();
    const success = uninstallPackage(state.device.adbPath, pkg);
    if (success) state.successCount += 1;
    else state.failCount += 1;
  }
  state.screen = 'summary';
  state.currentPackage = '';
  render();
}

function printFallback(message) {
  process.stdout.write(`${message}\n`);
}

async function bootstrap() {
  if (!isInteractive) {
    printFallback('This command now expects an interactive terminal (TTY).');
    process.exit(1);
  }
  enterAltScreen();
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  rawModeEnabled = true;
  process.stdin.on('keypress', onKeypress);
  process.stdout.on('resize', render);
  render();
  state.message = 'Checking ADB connection...';
  render();
  try {
    state.device = checkAdb();
  } catch (error) {
    state.screen = 'error';
    state.error = error.message;
    render();
    return;
  }
  state.message = 'Loading installed packages...';
  render();
  try {
    const { sysPackages, userPackages } = getPackages(state.device.adbPath);
    state.items = createItems(sysPackages, userPackages);
    filterItems();
    state.screen = 'list';
    render();
  } catch (error) {
    state.screen = 'error';
    state.error = error.message;
    render();
  }
}

process.on('SIGINT', () => cleanupAndExit(0));
process.on('uncaughtException', (error) => {
  if (isInteractive) leaveAltScreen();
  console.error(error);
  process.exit(1);
});
process.on('exit', () => {
  if (isInteractive && rawModeEnabled) process.stdin.setRawMode(false);
  leaveAltScreen();
});
bootstrap().catch((error) => {
  leaveAltScreen();
  console.error(error);
  process.exit(1);
});
