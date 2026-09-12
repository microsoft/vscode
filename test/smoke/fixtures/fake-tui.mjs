#!/usr/bin/env node
/**
 * Deterministic fake full-screen TUI for sticky-mouse / Reload smoke tests.
 *
 * - Enables alt-screen + button-event mouse (SGR) + focus reporting
 * - Prints FAKE_TUI_READY so tests can wait without internal probing
 * - Appends every SGR mouse report (\x1b[<…M/m) to --log
 * - Writes --pid for nested-dead / hard-kill scenarios
 * - On clean exit (SIGINT / SIGTERM / q / Ctrl-C), writes restore sequences
 *
 * Usage:
 *   node fake-tui.mjs --log <path> [--pid <path>] [--no-restore-on-exit]
 *
 * Do not use real grok_local here — LLM nondeterminism; this fixture is the
 * behavioral oracle (Playwright click → log file grows).
 */
import fs from 'node:fs';
import path from 'node:path';

function argValue(flag) {
	const i = process.argv.indexOf(flag);
	if (i === -1 || i + 1 >= process.argv.length) {
		return undefined;
	}
	return process.argv[i + 1];
}

const logPath = argValue('--log') || path.join(process.cwd(), 'fake-tui-mouse.log');
const pidPath = argValue('--pid');
const noRestoreOnExit = process.argv.includes('--no-restore-on-exit');

const CSI = {
	enterAlt: '\x1b[?1049h',
	leaveAlt: '\x1b[?1049l',
	// button-event + SGR (matches common TUI enable set)
	mouseOn: '\x1b[?1002h\x1b[?1006h',
	mouseOff: '\x1b[?1002l\x1b[?1006l\x1b[?1000l\x1b[?9l',
	focusOn: '\x1b[?1004h',
	focusOff: '\x1b[?1004l',
	pasteOn: '\x1b[?2004h',
	pasteOff: '\x1b[?2004l',
	hideCursor: '\x1b[?25l',
	showCursor: '\x1b[?25h',
};

function enable() {
	process.stdout.write(
		CSI.enterAlt +
		CSI.mouseOn +
		CSI.focusOn +
		CSI.pasteOn +
		CSI.hideCursor +
		'FAKE_TUI_READY\r\n' +
		'click the terminal — SGR mouse reports land in the log\r\n'
	);
}

function restore() {
	if (noRestoreOnExit) {
		return;
	}
	try {
		process.stdout.write(
			CSI.showCursor +
			CSI.mouseOff +
			CSI.focusOff +
			CSI.pasteOff +
			CSI.leaveAlt
		);
	} catch {
		// stdout may already be closed
	}
}

// Fresh log each run
try {
	fs.mkdirSync(path.dirname(logPath), { recursive: true });
} catch {
	// ignore
}
fs.writeFileSync(logPath, '', 'utf8');
if (pidPath) {
	try {
		fs.mkdirSync(path.dirname(pidPath), { recursive: true });
	} catch {
		// ignore
	}
	fs.writeFileSync(pidPath, String(process.pid), 'utf8');
}

enable();

// Raw stdin so mouse reports are not cooked by the TTY layer
if (process.stdin.isTTY) {
	try {
		process.stdin.setRawMode(true);
	} catch {
		// non-TTY (piped) — still listen
	}
}
process.stdin.resume();
process.stdin.setEncoding('utf8');

/** @type {string} */
let buf = '';
const SGR_MOUSE_RE = /\x1b\[<\d+;\d+;\d+[Mm]/g;

process.stdin.on('data', (chunk) => {
	const s = String(chunk);
	// Ctrl-C or 'q' → clean exit
	if (s.includes('\u0003') || s === 'q' || s === 'Q') {
		restore();
		process.exit(0);
		return;
	}
	buf += s;
	// Keep a bounded window so multi-chunk sequences still match
	if (buf.length > 4096) {
		buf = buf.slice(-2048);
	}
	SGR_MOUSE_RE.lastIndex = 0;
	let m;
	while ((m = SGR_MOUSE_RE.exec(buf)) !== null) {
		try {
			fs.appendFileSync(logPath, m[0] + '\n', 'utf8');
		} catch {
			// ignore write races
		}
	}
	// Drop fully-consumed prefix up to last match end
	const last = buf.lastIndexOf('\x1b[');
	if (last > 0) {
		buf = buf.slice(last);
	}
});

function onExit() {
	restore();
}
process.on('SIGINT', () => {
	onExit();
	process.exit(0);
});
process.on('SIGTERM', () => {
	onExit();
	process.exit(0);
});
process.on('exit', onExit);

// Stay alive
setInterval(() => { /* keep event loop */ }, 60_000);
