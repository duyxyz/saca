import chalk from 'chalk';
import { state, summaryStats, getCurrentItem } from './state.js';

// Premium Cohesive Accent Palette (Truecolor Hex Codes)
const COLORS = {
    GREEN_NEON: '#81C784',    // Softer, premium matte sage green (easy on the eyes)
    GREEN_EMERALD: '#388E3C', // Softer rich forest/emerald green for selected states
    GREEN_PALE: '#C8E6C9',    // Extremely light pale green for focus indicators and soft highlights
    RED_LIGHT: '#FF8A80',     // Premium soft light red for warnings/errors like "No matches"
    WHITE: '#FFFFFF',         // Crisp clean white for focused/active items & primary titles
    GRAY_LIGHT: '#CCCCCC',    // Light gray for secondary text, labels, and status stats
    GRAY_MUTED: '#777777',    // Muted dark-gray for standard package names and inactive states
    BORDER: '#333333'         // Dark neutral border/rule lines
};

export function stripAnsi(text) {
    return String(text).replace(/\x1B\[[0-9;]*m/g, '');
}

export function pad(text, width) {
    const plainLength = stripAnsi(text).length;
    if (plainLength >= width) return text;
    return text + ' '.repeat(width - plainLength);
}

export function truncate(text, width) {
    if (width <= 0) return '';
    const plain = stripAnsi(text);
    if (plain.length <= width) return pad(text, width);
    if (width === 1) return '…';
    return plain.slice(0, width - 1) + '…';
}

export function line(width, left = '', right = '') {
    const rightText = right ? ` ${right}` : '';
    const available = Math.max(0, width - stripAnsi(rightText).length);
    return truncate(left, available) + rightText;
}

export function fullWidthRule(width, color = chalk.hex(COLORS.BORDER)) {
    return color('─'.repeat(Math.max(0, width)));
}

export function getTerminalSize() {
    return {
        width: process.stdout.columns || 100,
        height: process.stdout.rows || 32,
    };
}

export function getListHeight() {
    const { height } = getTerminalSize();
    return Math.max(1, height - 10);
}

export function renderLoading(width, height) {
    const rows = [];
    rows.push(chalk.hex(COLORS.GREEN_NEON).bold('SACA'));
    rows.push(chalk.hex(COLORS.GRAY_MUTED)('Full-screen ADB debloat session'));
    rows.push('');
    rows.push(chalk.hex(COLORS.GREEN_NEON).bold(state.message));
    while (rows.length < height - 2) rows.push('');
    rows.push(fullWidthRule(width));
    rows.push(chalk.hex(COLORS.GRAY_MUTED)('Waiting for ADB response...'));
    return rows;
}

export function renderError(width, height) {
    const rows = [];
    rows.push(chalk.red.bold('Connection Error'));
    rows.push('');
    for (const part of state.error.split('\n')) rows.push(chalk.white(part));
    rows.push('');
    rows.push(chalk.hex(COLORS.GRAY_MUTED)('Press Ctrl+Q or Ctrl+C to exit.'));
    while (rows.length < height) rows.push('');
    return rows.slice(0, height);
}

export function renderHeader(width) {
    const device = state.device;
    const deviceName = device ? [device.brand, device.model].filter(Boolean).join(' ').trim() : 'No device';
    const right = state.query ? chalk.yellow.bold(`filter: ${state.query}`) : chalk.hex(COLORS.GRAY_MUTED)('filter: all');
    return [
        line(width, chalk.hex(COLORS.GREEN_NEON).bold('SACA'), chalk.hex(COLORS.GRAY_LIGHT).bold('ADB CLEANER')),
        line(width, device ? chalk.hex(COLORS.WHITE).bold(deviceName) : chalk.hex(COLORS.RED_LIGHT).bold('No device connected'), right),
        fullWidthRule(width),
    ];
}

export function renderFooter(width, left = '', right = '') {
    return [line(width, left, right)];
}

export function renderList(width, height) {
    const rows = [];
    const { systemCount, userCount } = summaryStats();
    const selectedCount = state.selected.size;
    const current = getCurrentItem();
    const systemVisible = state.filteredByGroup.System.slice(state.scrollByGroup.System, state.scrollByGroup.System + Math.max(4, height - 5));
    const userVisible = state.filteredByGroup.User.slice(state.scrollByGroup.User, state.scrollByGroup.User + Math.max(4, height - 5));

    const leftText = chalk.hex(COLORS.GREEN_NEON).bold('Packages ') + chalk.hex(COLORS.GRAY_LIGHT)(state.items.length);
    const rightText = chalk.hex(COLORS.GREEN_NEON).bold('targets : ') + chalk.hex(COLORS.GRAY_LIGHT)(selectedCount);
    rows.push(line(width, leftText, rightText));
    rows.push(fullWidthRule(width));

    const leftWidth = Math.max(20, Math.floor((width - 3) / 2));
    const rightWidth = Math.max(20, width - leftWidth - 3);
    const maxPaneHeight = Math.max(4, height - 4);

    const renderPane = (group, visible, paneWidth) => {
        const paneRows = [];
        const isActivePane = state.activePane === group;
        const title = isActivePane ? chalk.hex(COLORS.GREEN_PALE).bold(`${group} Apps`) : chalk.hex(COLORS.WHITE)(`${group} Apps`);
        const count = isActivePane ? chalk.hex(COLORS.GRAY_LIGHT)(state.filteredByGroup[group].length) : chalk.hex(COLORS.GRAY_MUTED)(state.filteredByGroup[group].length);
        
        const label = `${title} ${count}`;
        const plainLength = stripAnsi(label).length;
        let headerLine;
        if (plainLength >= paneWidth) {
            headerLine = truncate(label, paneWidth);
        } else {
            const leftPad = Math.floor((paneWidth - plainLength) / 2);
            const rightPad = paneWidth - plainLength - leftPad;
            headerLine = ' '.repeat(leftPad) + label + ' '.repeat(rightPad);
        }
        paneRows.push(headerLine);
        paneRows.push(chalk.hex(COLORS.BORDER)('─'.repeat(Math.max(0, paneWidth))));

        if (visible.length === 0) {
            paneRows.push(chalk.hex(COLORS.RED_LIGHT).bold('No matches'));
            paneRows.push(chalk.hex(COLORS.GRAY_MUTED)('Adjust filter'));
        } else {
            for (let index = 0; index < visible.length; index++) {
                const absoluteIndex = state.scrollByGroup[group] + index;
                const item = visible[index];
                const isActive = isActivePane && absoluteIndex === state.cursorByGroup[group];
                const isSelected = state.selected.has(item.pkg);
                const marker = isActive ? chalk.hex(COLORS.GREEN_NEON)('❯') : ' ';
                const bullet = isSelected ? chalk.hex(COLORS.GREEN_NEON)('●') : chalk.hex(COLORS.GRAY_MUTED)('○');
                
                let pkgColor;
                if (isSelected && isActive) {
                    pkgColor = chalk.hex(COLORS.GREEN_NEON).bold;
                } else if (isSelected) {
                    pkgColor = chalk.hex(COLORS.GREEN_NEON);
                } else if (isActive) {
                    pkgColor = chalk.hex(COLORS.WHITE).bold;
                } else {
                    pkgColor = chalk.hex(COLORS.GRAY_MUTED);
                }

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
        rows.push(`${pad(leftPane[i] || '', leftWidth)} ${chalk.hex(COLORS.BORDER)('│')} ${pad(rightPane[i] || '', rightWidth)}`);
    }

    const info = current 
        ? `${chalk.hex(COLORS.WHITE).bold(current.pkg)} ${chalk.hex(COLORS.BORDER)('|')} ${chalk.hex(COLORS.GREEN_PALE)(current.group + ' app')}` 
        : chalk.hex(COLORS.GRAY_MUTED)('No package selected');

    const help = [
        chalk.hex(COLORS.GREEN_NEON)('up/down') + chalk.hex(COLORS.GRAY_LIGHT)(' move'),
        chalk.hex(COLORS.GREEN_NEON)('left/right') + chalk.hex(COLORS.GRAY_LIGHT)(' pane'),
        chalk.hex(COLORS.GREEN_NEON)('space') + chalk.hex(COLORS.GRAY_LIGHT)(' toggle'),
        chalk.hex(COLORS.GREEN_NEON)('enter') + chalk.hex(COLORS.GRAY_LIGHT)(' uninstall'),
        chalk.hex(COLORS.GREEN_NEON)('esc') + chalk.hex(COLORS.GRAY_LIGHT)(' clear'),
        chalk.hex(COLORS.GREEN_NEON)('ctrl+q') + chalk.hex(COLORS.GRAY_LIGHT)(' quit')
    ].join(chalk.hex(COLORS.BORDER)(' | '));

    while (rows.length < height - 2) rows.push('');
    rows.push(fullWidthRule(width));
    rows.push(...renderFooter(width, info, help));
    return rows.slice(0, height);
}

export function renderConfirm(width, height) {
    const rows = [];
    const pending = state.pending;
    rows.push(chalk.hex(COLORS.WHITE).bold('Review Selection'));
    rows.push(chalk.hex(COLORS.GRAY_LIGHT)(`Ready to uninstall ${pending.length} package(s) for user 0.`));
    rows.push(fullWidthRule(width));
    for (const pkg of pending.slice(0, Math.max(3, height - 6))) rows.push(chalk.red(`- ${pkg}`));
    if (pending.length > Math.max(3, height - 6)) rows.push(chalk.hex(COLORS.GRAY_MUTED)(`... and ${pending.length - Math.max(3, height - 6)} more`));
    while (rows.length < height - 2) rows.push('');
    rows.push(fullWidthRule(width));
    rows.push(...renderFooter(width, chalk.hex(COLORS.WHITE)('Press Enter to confirm'), chalk.hex(COLORS.GREEN_NEON)('Enter') + chalk.hex(COLORS.GRAY_LIGHT)(' confirm | ') + chalk.hex(COLORS.GREEN_NEON)('Esc') + chalk.hex(COLORS.GRAY_LIGHT)(' back | ') + chalk.hex(COLORS.GREEN_NEON)('ctrl+q') + chalk.hex(COLORS.GRAY_LIGHT)(' quit')));
    return rows.slice(0, height);
}

export function renderRunning(width, height) {
    const rows = [];
    rows.push(chalk.hex(COLORS.WHITE).bold('Uninstalling Packages'));
    rows.push(chalk.hex(COLORS.GRAY_LIGHT)(`Processing ${state.progressIndex}/${state.pending.length}`));
    rows.push(fullWidthRule(width));
    const barWidth = Math.max(10, width - 10);
    const ratio = state.pending.length === 0 ? 0 : state.progressIndex / state.pending.length;
    const filled = Math.round(barWidth * ratio);
    const bar = chalk.hex(COLORS.GREEN_NEON)('█'.repeat(filled)) + chalk.hex(COLORS.BORDER)('░'.repeat(Math.max(0, barWidth - filled)));
    rows.push(bar);
    rows.push('');
    rows.push(line(width, chalk.white(state.currentPackage || 'Preparing...'), chalk.hex(COLORS.GRAY_LIGHT)(`${state.successCount} ok / ${state.failCount} failed`)));
    while (rows.length < height - 2) rows.push('');
    rows.push(fullWidthRule(width));
    rows.push(...renderFooter(width, chalk.hex(COLORS.WHITE)('Working...'), chalk.hex(COLORS.GRAY_LIGHT)('Do not disconnect the device')));
    return rows.slice(0, height);
}

export function renderSummary(width, height) {
    const rows = [];
    rows.push(chalk.hex(COLORS.WHITE).bold('Summary'));
    rows.push(chalk.hex(COLORS.GREEN_NEON)(`Success: ${state.successCount}`));
    rows.push(state.failCount > 0 ? chalk.red(`Failed: ${state.failCount}`) : chalk.hex(COLORS.GRAY_MUTED)('Failed: 0'));
    rows.push(fullWidthRule(width));
    rows.push(chalk.hex(COLORS.GRAY_LIGHT)('Press Enter or Esc to return to the list. Press Ctrl+Q or Ctrl+C to exit.'));
    while (rows.length < height) rows.push('');
    return rows.slice(0, height);
}

let lastFrame = '';

export function render() {
    if (!state.running) return;
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
