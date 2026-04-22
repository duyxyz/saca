#!/usr/bin/env node

import readline from 'readline';
import { checkAdb, getPackages, uninstallPackage, getDeviceSummary } from '../lib/adb.js';
import {
  state,
  filterItems,
  moveCursor,
  switchPane,
  toggleCurrent,
  createItems,
  setListHeightResolver,
} from '../lib/state.js';
import {
  render,
  getListHeight,
} from '../lib/ui.js';

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

// Connect state logic with UI config
setListHeightResolver(getListHeight);

let isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
let rawModeEnabled = false;
let lastSummary = '';

async function pollDeviceStatus() {
  if (!state.running || state.screen === 'running' || state.screen === 'loading') return;

  const devices = getDeviceSummary();
  const currentSummary = devices.length > 0 ? devices[0] : '';

  if (currentSummary !== lastSummary) {
    const isNewConnection = !lastSummary && currentSummary;
    lastSummary = currentSummary;

    if (!currentSummary) {
      state.screen = 'error';
      state.error = 'Device disconnected.\nConnect a device to continue.';
      state.device = null;
      render();
    } else if (isNewConnection || (state.device && state.device.serial !== currentSummary.split(':')[0])) {
      try {
        state.device = checkAdb();
        await refreshList();
      } catch (error) {
        state.screen = 'error';
        state.error = error.message;
        render();
      }
    }
  }
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

function isKeyMatch(key, input, name, sequences = []) {
  if (key?.name === name) return true;
  return sequences.includes(input);
}

async function refreshList() {
  state.message = 'Refreshing package list...';
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
    lastSummary = `${state.device.serial}:${state.device.state}`;
    setInterval(pollDeviceStatus, 2000);
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
