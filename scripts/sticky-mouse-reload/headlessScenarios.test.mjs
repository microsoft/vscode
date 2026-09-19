/**
 * Ground-truth sticky-mouse / Reload scenarios with the REAL terminal engine.
 *
 * Unlike scenarios.test.mjs (hand-rolled DEC state machine), this file puts
 * `@xterm/headless` + `@xterm/addon-serialize` in the loop — the exact
 * libraries the VS Code pty host uses for persistent-session replay. The
 * "pty host" terminal accumulates app output; Reload Window is modeled as
 * `serialize()` written into a brand-new terminal (the recreated renderer),
 * mirroring `XtermSerializer.generateReplayEvent` in ptyService.ts:
 *   - reconnection (Reload Window): serialize() with NO excludes
 *   - revive (window restart):      serialize({ excludeModes, excludeAltBuffer })
 *
 * Run: node --test .\scripts\sticky-mouse-reload\headlessScenarios.test.mjs
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';
import { CSI, stripMouseEnables } from './decModeState.mjs';

const require = createRequire(import.meta.url);
const { Terminal } = require('@xterm/headless');
const { SerializeAddon } = require('@xterm/addon-serialize');

// --- helpers ---------------------------------------------------------------

function newTerm() {
	return new Terminal({ cols: 80, rows: 24, scrollback: 1000, allowProposedApi: true });
}

function write(term, data) {
	return new Promise(resolve => term.write(data, resolve));
}

/** Pty-host side: headless terminal + serializer (source of truth). */
function newPtyHost() {
	const term = newTerm();
	const serializer = new SerializeAddon();
	term.loadAddon(serializer);
	return { term, serializer };
}

/** Observable renderer state via the public xterm modes/buffer API. */
function observe(term) {
	return {
		mouse: term.modes.mouseTrackingMode,        // 'none' | 'x10' | 'vt200' | 'drag' | 'any'
		focus: term.modes.sendFocusMode,            // ?1004
		paste: term.modes.bracketedPasteMode,       // ?2004
		alt: term.buffer.active.type === 'alternate',
	};
}

function activeBufferText(term) {
	const buf = term.buffer.active;
	const lines = [];
	for (let i = 0; i < buf.length; i++) {
		lines.push(buf.getLine(i)?.translateToString(true) ?? '');
	}
	return lines.join('\n');
}

const SHELL_PROMPT = 'PS C:\\Users\\Louis> ';
const WELCOME = 'Welcome to Grok build';

/** Shell history, then grok enters fullscreen (alt + mouse + focus + paste). */
async function grokSession(ptyHost) {
	await write(ptyHost.term, SHELL_PROMPT + 'grok\r\n');
	await write(ptyHost.term, CSI.enterAlt + CSI.mouseEnable + CSI.focusEnable + CSI.pasteEnable);
	await write(ptyHost.term, WELCOME + '\r\n');
}

/**
 * Reload Window (reconnection path): replay = serialize() with no excludes,
 * optionally passed through the fork's basePty mouse strip, into a fresh
 * renderer; then the fork's post-replay reset.
 * @param {{ strip?: boolean, postReplay?: 'none'|'mouseOnly'|'full'|'processExit' }} opts
 *   full = mouse+paste+focus (keeps alt); processExit = TERMINAL_PROCESS_EXIT_RESET (leave alt)
 */
async function reloadReconnect(ptyHost, opts = {}) {
	const { strip = true, postReplay = 'none' } = opts;
	const replayRaw = ptyHost.serializer.serialize();
	const replay = strip ? stripMouseEnables(replayRaw) : replayRaw;
	const renderer = newTerm();
	await write(renderer, replay);
	if (postReplay === 'mouseOnly') {
		await write(renderer, CSI.hostMouseOnlyReset);
	} else if (postReplay === 'full') {
		await write(renderer, CSI.hostExitReset);
	} else if (postReplay === 'processExit') {
		await write(renderer, CSI.hostProcessExitReset);
	}
	return { renderer, replayRaw, replay };
}

/** Revive (window restart): ptyService serializeNormalBuffer → normalBufferOnly. */
async function reviveReplay(ptyHost) {
	const replay = ptyHost.serializer.serialize({ excludeModes: true, excludeAltBuffer: true });
	const renderer = newTerm();
	await write(renderer, replay);
	return { renderer, replay };
}

// --- root-cause ground truth -------------------------------------------------

describe('ground truth: serialize() replay re-arms modes (root cause of sticky [MC…)', () => {
	it('unstripped reconnection replay restores mouse+alt+focus onto a fresh renderer', async () => {
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		// Sanity: pty-host truth has everything on.
		assert.deepEqual(observe(ptyHost.term), { mouse: 'any', focus: true, paste: true, alt: true });

		const { renderer, replayRaw } = await reloadReconnect(ptyHost, { strip: false, postReplay: 'none' });
		// The replay itself carries DECSET re-enables emitted from *state*, not history.
		assert.ok(/\x1b\[\?100[023]h/.test(replayRaw), 'serialize() must emit mouse DECSETs');
		assert.deepEqual(observe(renderer), { mouse: 'any', focus: true, paste: true, alt: true });
	});

	it('dead process + unstripped replay = sticky mouse over a shell (symptom 1)', async () => {
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		// Grok killed hard (TerminateProcess / lost RESTORE race): pty host never
		// sees teardown. Upstream VS Code (no strip, no reset) replays it all:
		const { renderer } = await reloadReconnect(ptyHost, { strip: false, postReplay: 'none' });
		assert.equal(observe(renderer).mouse, 'any', 'upstream behavior: mouse re-armed over a dead process');
	});
});

// --- the fork's host policy ---------------------------------------------------

describe('host policy: conditional strip + exit-only post-replay reset', () => {
	it('dead process: strip + process-exit reset leaves clean shell', async () => {
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		// Dead-at-generation: strip mouse enables; TERMINAL_PROCESS_EXIT_RESET at complete.
		const { renderer } = await reloadReconnect(ptyHost, { strip: true, postReplay: 'processExit' });
		assert.deepEqual(observe(renderer), { mouse: 'none', focus: false, paste: false, alt: false },
			'dead path: strip + process-exit reset → clean shell');
	});

	it('dead process without exit reset: paste/focus/alt still leak (why exit reset is required)', async () => {
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		const { renderer } = await reloadReconnect(ptyHost, { strip: true, postReplay: 'none' });
		const leaked = observe(renderer);
		assert.equal(leaked.mouse, 'none', 'strip alone clears mouse');
		assert.equal(leaked.paste, true, '?2004 still re-armed without exit reset');
		assert.equal(leaked.focus, true, '?1004 still re-armed without exit reset');
		assert.equal(leaked.alt, true, 'alt buffer restored with no live owner');
		await write(renderer, CSI.hostProcessExitReset);
		assert.deepEqual(observe(renderer), { mouse: 'none', focus: false, paste: false, alt: false });
	});

	it('live TUI: verbatim replay keeps mouse+alt+focus (no strip, no post-replay reset)', async () => {
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		// Conditional strip OFF for live root TUI — upstream serialize re-arm is correct.
		const { renderer } = await reloadReconnect(ptyHost, { strip: false, postReplay: 'none' });
		const snap = observe(renderer);
		assert.equal(snap.alt, true, 'reconnection restores alternate buffer');
		assert.equal(snap.focus, true, 'focus reporting survives');
		assert.equal(snap.mouse, 'any', 'live TUI keeps mouse — no app reassert required');
		assert.ok(activeBufferText(renderer).includes(WELCOME), 'alt-screen content restored');
	});

	it('live TUI + full exit reset would kill mouse/focus (must not run on live path)', async () => {
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		const { renderer } = await reloadReconnect(ptyHost, { strip: false, postReplay: 'full' });
		assert.equal(observe(renderer).mouse, 'none', 'full reset wrongly clears live mouse');
		assert.equal(observe(renderer).focus, false, 'full reset kills ?1004');
	});

	it('Windows nested-dead shell policy: strip when shell has no children', async () => {
		// Policy unit is in terminalMouseModeReset.test.ts; here verify strip
		// alone is enough to prevent sticky mouse over a shell after reload.
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		const { renderer } = await reloadReconnect(ptyHost, { strip: true, postReplay: 'none' });
		assert.equal(observe(renderer).mouse, 'none', 'stripped nested-dead: no [MC… into shell');
		assert.equal(observe(renderer).alt, true, 'alt may remain until exit reset if root dies');
	});
});

// --- the TUI's reassert paths ---------------------------------------------------

describe('TUI reassert paths', () => {
	it('FocusGained mouse-only re-arms mouse without touching alt buffer content', async () => {
		// Preferred app policy: idempotent DECSET enables, no EnterAlternateScreen.
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		const { renderer } = await reloadReconnect(ptyHost);
		await write(renderer, CSI.mouseEnableOnly);
		const snap = observe(renderer);
		assert.equal(snap.mouse, 'any');
		assert.equal(snap.alt, true);
		assert.ok(activeBufferText(renderer).includes(WELCOME), 'no welcome wipe from mouse-only reassert');
	});

	it('legacy full reassert while already in alt: xterm.js no-op (no wipe)', async () => {
		// Kept for ConPTY comparison notes — app no longer uses full reassert on FocusGained.
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		const { renderer } = await reloadReconnect(ptyHost);
		assert.equal(observe(renderer).alt, true);
		await write(renderer, CSI.reassertDisplay);
		const snap = observe(renderer);
		assert.equal(snap.alt, true);
		assert.equal(snap.mouse, 'any');
		assert.ok(activeBufferText(renderer).includes(WELCOME), 'xterm.js: redundant re-entry does not wipe');
	});

	it('legacy RESTORE strands main buffer: full reassert recovers but wipes — prefer not to use on FocusGained', async () => {
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		await write(ptyHost.term, CSI.restoreSeq); // legacy RESTORE stranded us on main
		const { renderer } = await reloadReconnect(ptyHost);
		assert.equal(observe(renderer).alt, false);
		await write(renderer, CSI.mouseEnableOnly);
		assert.equal(observe(renderer).alt, false, 'mouse-only cannot recover buffer ownership');
		await write(renderer, CSI.reassertDisplay);
		const snap = observe(renderer);
		assert.equal(snap.alt, true);
		assert.equal(snap.mouse, 'any');
		assert.ok(!activeBufferText(renderer).includes(WELCOME),
			'alt buffer is cleared on entry from main — only for rare recovery, not FocusGained');
	});
});

// --- legacy / production grok and revive ---------------------------------------

describe('legacy + revive regressions', () => {
	it('production grok 0.2.101: RESTORE_SEQ before reload strands a live TUI on the main buffer (symptom 2)', async () => {
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		// Old CTRL_CLOSE handler wrote RESTORE_SEQ into the pty; pty host applied it.
		await write(ptyHost.term, CSI.restoreSeq);
		const { renderer } = await reloadReconnect(ptyHost);
		const snap = observe(renderer);
		assert.equal(snap.alt, false, 'renderer lands on main buffer — terminal owns scroll');
		assert.equal(snap.mouse, 'none');
		// Mouse-only reassert is NOT sufficient here (still main buffer):
		await write(renderer, CSI.mouseEnableOnly);
		assert.equal(observe(renderer).alt, false, 'path 2 cannot recover buffer ownership');
		// Only the full display reassert recovers:
		await write(renderer, CSI.reassertDisplay);
		const recovered = observe(renderer);
		assert.equal(recovered.alt, true);
		assert.equal(recovered.mouse, 'any');
	});

	it('revive (normalBufferOnly): alt buffer and modes are excluded by design', async () => {
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		const { renderer, replay } = await reviveReplay(ptyHost);
		const snap = observe(renderer);
		assert.equal(snap.alt, false, 'upstream: revive never restores the alt buffer');
		assert.equal(snap.mouse, 'none');
		assert.equal(snap.focus, false);
		assert.ok(!replay.includes(WELCOME), 'alt-screen content is not in the revive payload');
		assert.ok(activeBufferText(renderer).includes('grok'), 'normal-buffer history (the launch command) survives');
	});
});

// --- strip robustness against the real parser -----------------------------------

describe('strip robustness (real emulator as oracle)', () => {
	it('combined DECSET params: mouse stripped, alt-screen preserved', async () => {
		const combined = '\x1b[?1049;1002;1006h' + WELCOME;
		const stripped = stripMouseEnables(combined);
		const renderer = newTerm();
		await write(renderer, stripped);
		const snap = observe(renderer);
		assert.equal(snap.alt, true, 'combined ?1049 must survive the strip');
		assert.equal(snap.mouse, 'none');
	});

	it('strip never touches resets (l) — a clean teardown replays as clean', async () => {
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		await write(ptyHost.term, CSI.restoreSeq); // clean exit teardown
		await write(ptyHost.term, SHELL_PROMPT);   // shell prompt back
		const { renderer } = await reloadReconnect(ptyHost);
		const snap = observe(renderer);
		assert.deepEqual(snap, { mouse: 'none', focus: false, paste: false, alt: false });
		assert.ok(activeBufferText(renderer).includes(SHELL_PROMPT.trimEnd()));
	});
});
