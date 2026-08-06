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
 * @param {{ strip?: boolean, postReplay?: 'none'|'mouseOnly'|'full' }} opts
 */
async function reloadReconnect(ptyHost, opts = {}) {
	const { strip = true, postReplay = 'mouseOnly' } = opts;
	const replayRaw = ptyHost.serializer.serialize();
	const replay = strip ? stripMouseEnables(replayRaw) : replayRaw;
	const renderer = newTerm();
	await write(renderer, replay);
	if (postReplay === 'mouseOnly') {
		await write(renderer, CSI.hostMouseOnlyReset);
	} else if (postReplay === 'full') {
		await write(renderer, CSI.hostExitReset);
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

describe('host policy: strip on replay + post-replay reset', () => {
	it('dead process: strip + mouseOnly reset leaves no mouse reporting for the next shell', async () => {
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		const { renderer } = await reloadReconnect(ptyHost, { strip: true, postReplay: 'mouseOnly' });
		assert.equal(observe(renderer).mouse, 'none', 'no [MC… into the shell');
	});

	it('dead process: paste/focus/alt leak through replay; the dead-at-replay exit reset clears all of it', async () => {
		// The renderer-only resets never reach the pty-host headless terminal,
		// and strip only covers mouse — so the replay re-arms paste/focus and
		// restores the alt buffer with no live owner. terminalInstance now
		// detects exitCode !== undefined at replay-complete and writes the
		// PROCESS_EXIT reset (mouse + paste + focus + leave alt + show cursor).
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		const { renderer } = await reloadReconnect(ptyHost, { strip: true, postReplay: 'mouseOnly' });
		const leaked = observe(renderer);
		assert.equal(leaked.paste, true, 'without the fix: ?2004 replayed for a dead process');
		assert.equal(leaked.focus, true, 'without the fix: ?1004 replayed for a dead process');
		assert.equal(leaked.alt, true, 'without the fix: next shell trapped in the alt screen');
		await write(renderer, CSI.hostProcessExitReset);
		assert.deepEqual(observe(renderer), { mouse: 'none', focus: false, paste: false, alt: false },
			'dead-at-replay exit reset returns the tab to a clean shell state');
	});

	it('live grok: replay restores alt buffer + welcome + focus mode; mouse deliberately off', async () => {
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		const { renderer } = await reloadReconnect(ptyHost, { strip: true, postReplay: 'mouseOnly' });
		const snap = observe(renderer);
		assert.equal(snap.alt, true, 'reconnection replay must restore the alternate buffer');
		assert.equal(snap.focus, true, 'focus reporting must survive so FocusGained reaches grok');
		assert.equal(snap.mouse, 'none', 'mouse stripped — grok reasserts');
		assert.ok(activeBufferText(renderer).includes(WELCOME), 'alt-screen content restored');
	});

	it('post-replay reset must be mouseOnly: a full reset would sever FocusGained', async () => {
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		const { renderer } = await reloadReconnect(ptyHost, { strip: true, postReplay: 'full' });
		// This is the failure mode the mouseOnly choice avoids:
		assert.equal(observe(renderer).focus, false, 'full reset kills ?1004 → grok never gets FocusGained → mouse never reasserted');
	});
});

// --- the TUI's reassert paths ---------------------------------------------------

describe('TUI reassert paths', () => {
	it('path 2 (mouse-only) re-arms mouse without touching the alt buffer content', async () => {
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		const { renderer } = await reloadReconnect(ptyHost);
		await write(renderer, CSI.mouseEnableOnly);
		const snap = observe(renderer);
		assert.equal(snap.mouse, 'any');
		assert.equal(snap.alt, true);
		assert.ok(activeBufferText(renderer).includes(WELCOME), 'no welcome wipe from mouse-only reassert');
	});

	it('path 1 false positive (already in alt): ?1049h re-entry is a no-op in xterm.js — no wipe', async () => {
		// Ground truth (probed): xterm.js only clears the alt buffer when
		// ENTERING from the main buffer; a redundant ?1049h while already in
		// alt preserves content. NOTE: in production, conhost/ConPTY sits in
		// the middle and implements ?1049 itself — its re-entry semantics may
		// differ, so a full reassert must still force a repaint on Windows.
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

	it('path 1 recovery (renderer on main buffer): entering alt WIPES it — full repaint is mandatory', async () => {
		const ptyHost = newPtyHost();
		await grokSession(ptyHost);
		await write(ptyHost.term, CSI.restoreSeq); // legacy RESTORE stranded us on main
		const { renderer } = await reloadReconnect(ptyHost);
		assert.equal(observe(renderer).alt, false);
		await write(renderer, CSI.reassertDisplay);
		const snap = observe(renderer);
		assert.equal(snap.alt, true);
		assert.equal(snap.mouse, 'any');
		assert.ok(!activeBufferText(renderer).includes(WELCOME),
			'alt buffer is cleared on entry from main — grok MUST force_repaint after a full reassert');
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
