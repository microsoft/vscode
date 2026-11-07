/**
 * Deterministic sticky-mouse / Reload Window scenarios (Opus-aligned policy).
 *
 *   node --test scripts/sticky-mouse-reload/scenarios.test.mjs
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	CSI,
	SHELL_FOCUS_GARBAGE_RE,
	applyOutput,
	countMouseReassertWrites,
	createDecModeState,
	decrqmIndicatesReset,
	decrqmRequest,
	isMouseOwnedByApp,
	isTuiScreenLocked,
	mouseEnableSeqIsSafe,
	parseDecrqmReply,
	simulateColdStartWithSpuriousFocus,
	simulateReload,
	snapshot,
	stripMouseEnables,
	tuiEnterFullscreen,
} from './decModeState.mjs';

function recordTuiSession() {
	return (
		CSI.mouseDisable +
		CSI.enterAlt +
		CSI.mouseEnable +
		CSI.focusEnable +
		CSI.pasteEnable +
		'Grok UI\n'
	);
}

describe('DEC mode state machine', () => {
	it('starts unlocked with mouse off', () => {
		const s = createDecModeState();
		assert.deepEqual(snapshot(s), {
			altScreen: false,
			mouse: false,
			focus: false,
			paste: false,
		});
	});

	it('TUI fullscreen init locks screen and enables mouse', () => {
		const s = createDecModeState();
		tuiEnterFullscreen(s);
		const snap = snapshot(s);
		assert.equal(isTuiScreenLocked(snap), true);
		assert.equal(isMouseOwnedByApp(snap), true);
	});

	it('clean RESTORE_SEQ unlocks screen and clears mouse (real exit)', () => {
		const s = createDecModeState();
		tuiEnterFullscreen(s);
		applyOutput(s, CSI.restoreSeq);
		const snap = snapshot(s);
		assert.equal(isTuiScreenLocked(snap), false);
		assert.equal(isMouseOwnedByApp(snap), false);
	});

	it('unclean kill leaves sticky mouse; host exit reset clears it', () => {
		const s = createDecModeState();
		tuiEnterFullscreen(s);
		assert.equal(snapshot(s).mouse, true);
		applyOutput(s, CSI.hostExitReset);
		assert.equal(snapshot(s).mouse, false);
	});

	it('stripMouseEnables keeps alt-screen enables', () => {
		const raw = CSI.enterAlt + CSI.mouseEnable + 'hi';
		const stripped = stripMouseEnables(raw);
		assert.ok(stripped.includes('\x1b[?1049h'));
		assert.ok(!stripped.includes('\x1b[?1000h'));
		assert.ok(stripped.includes('hi'));
	});

	it('stripMouseEnables drops X10 ?9h (serializer x10 path)', () => {
		const stripped = stripMouseEnables(CSI.mouseX10Enable + CSI.enterAlt);
		assert.ok(!stripped.includes('\x1b[?9h'));
		assert.ok(stripped.includes('\x1b[?1049h'));
		assert.equal(stripMouseEnables('\x1b[?1049;9;1002h'), '\x1b[?1049h');
	});
});

describe('DECRQM helpers', () => {
	it('formats request', () => {
		assert.equal(decrqmRequest(1049), '\x1b[?1049$p');
		assert.equal(decrqmRequest(1006), '\x1b[?1006$p');
	});

	it('parses set/reset replies', () => {
		assert.deepEqual(parseDecrqmReply('\x1b[?1049;1$y'), { mode: 1049, ps: 1 });
		assert.deepEqual(parseDecrqmReply('\x1b[?1006;2$y'), { mode: 1006, ps: 2 });
		assert.equal(parseDecrqmReply('nope'), null);
	});

	it('reset ps means reassert needed', () => {
		assert.equal(decrqmIndicatesReset(1), false);
		assert.equal(decrqmIndicatesReset(2), true);
		assert.equal(decrqmIndicatesReset(0), true);
	});
});

describe('Reload Window (idempotent FocusGained mouse reassert)', () => {
	it('host strip: alt from buffer, mouse not re-armed from history', () => {
		const snap = simulateReload(recordTuiSession(), {
			hostPostReplay: 'none',
			stripMouseOnReplay: true,
			softReattach: false,
		});
		assert.equal(isTuiScreenLocked(snap), true);
		assert.equal(isMouseOwnedByApp(snap), false);
	});

	it('without strip, mouse re-arms from history (sticky risk)', () => {
		const snap = simulateReload(recordTuiSession(), {
			hostPostReplay: 'none',
			stripMouseOnReplay: false,
			softReattach: false,
		});
		assert.equal(isMouseOwnedByApp(snap), true);
	});

	it('LEGACY BUG: CTRL_CLOSE RESTORE while alive → scroll escapes', () => {
		const snap = simulateReload(recordTuiSession(), {
			oldRestoreOnCtrlClose: true,
			hostPostReplay: 'none',
			stripMouseOnReplay: false,
			tuiReassert: false,
			softReattach: false,
		});
		assert.equal(isTuiScreenLocked(snap), false);
		assert.equal(isMouseOwnedByApp(snap), false);
	});

	it('FocusGained mouse reassert after host strip → locked + mouse', () => {
		// Preferred: soft CTRL_CLOSE (no RESTORE) + FocusGained mouse-only.
		const snap = simulateReload(recordTuiSession(), {
			softReattach: true,
			hostPostReplay: 'mouseOnly',
			stripMouseOnReplay: true,
			tuiReassert: true,
		});
		assert.equal(isTuiScreenLocked(snap), true);
		assert.equal(isMouseOwnedByApp(snap), true);
	});

	it('host strip without app reassert: mouse off after host (no sticky)', () => {
		const snap = simulateReload(recordTuiSession(), {
			softReattach: true,
			hostPostReplay: 'mouseOnly',
			stripMouseOnReplay: true,
			tuiReassert: false,
		});
		assert.equal(isMouseOwnedByApp(snap), false);
	});

	it('host strip + mouse-only reassert (no CTRL_CLOSE): clicks work, no alt wipe', () => {
		// Live process after Reload: host clears mouse; TUI re-enables mouse
		// only (no second EnterAlternateScreen).
		const snap = simulateReload(recordTuiSession(), {
			softReattach: false,
			hostPostReplay: 'mouseOnly',
			stripMouseOnReplay: true,
			tuiReassert: true,
		});
		assert.equal(isTuiScreenLocked(snap), true, 'alt kept from stripped replay');
		assert.equal(isMouseOwnedByApp(snap), true, 'mouse re-enabled without wipe');
	});

	it('cold start: FocusGained mouse reassert must not leave alt / wipe welcome', () => {
		const { afterWelcome, afterSpuriousFocus } = simulateColdStartWithSpuriousFocus();
		assert.equal(afterWelcome.altScreen, true);
		assert.equal(afterWelcome.mouse, true);
		assert.equal(afterSpuriousFocus.altScreen, true);
		assert.equal(afterSpuriousFocus.mouse, true);
		// Idempotent re-enable may set focus reporting; alt+mouse must stay.
		assert.deepEqual(
			{ alt: afterSpuriousFocus.altScreen, mouse: afterSpuriousFocus.mouse },
			{ alt: afterWelcome.altScreen, mouse: afterWelcome.mouse },
		);
	});

	it('legacy REASSERT_DISPLAY enters alt and mouse without leave', () => {
		const s = createDecModeState();
		applyOutput(s, CSI.reassertDisplay);
		assert.equal(snapshot(s).altScreen, true);
		assert.equal(snapshot(s).mouse, true);
		assert.equal(snapshot(s).focus, true);
	});

	it('init must not write leave-alt after enter-alt (RESTORE after EnterAlternateScreen)', () => {
		// Models the grok_local bug: EnterAlternateScreen then RESTORE_SEQ.
		const s = createDecModeState();
		applyOutput(s, CSI.enterAlt);
		assert.equal(snapshot(s).altScreen, true);
		applyOutput(s, CSI.restoreSeq); // bad: leave-alt inside RESTORE
		assert.equal(snapshot(s).altScreen, false, 'RESTORE undoes fullscreen');
		// Fixed order: enter alt, mouse reset only (no leave), mouse enable.
		const good = createDecModeState();
		applyOutput(good, CSI.enterAlt + CSI.mouseDisable + CSI.mouseEnable + CSI.focusEnable);
		assert.equal(snapshot(good).altScreen, true);
		assert.equal(snapshot(good).mouse, true);
	});
});

describe('prompt focus restore policy', () => {
	/**
	 * Mirrors event_loop FocusGained gate:
	 * restore = should_restore && (needs_input_overlay || external_focus)
	 */
	function shouldApplyRestore(shouldRestore, needsInputOverlay, externalFocus) {
		return shouldRestore && (needsInputOverlay || externalFocus);
	}

	it('idle non-vim on scrollback: restore only after FocusLost (external)', () => {
		const shouldRestore = true; // idle non-vim on scrollback
		const needsInput = false;
		assert.equal(shouldApplyRestore(shouldRestore, needsInput, false), false);
		assert.equal(shouldApplyRestore(shouldRestore, needsInput, true), true);
	});

	it('needs-input overlay: restore even without FocusLost', () => {
		assert.equal(shouldApplyRestore(true, true, false), true);
	});

	it('already on prompt: should_restore false → no switch', () => {
		assert.equal(shouldApplyRestore(false, false, true), false);
	});
});

describe('acceptance', () => {
	it('documents pass: soft reattach + reassert', () => {
		const pass = simulateReload(CSI.enterAlt + CSI.mouseEnable + 'chat\n', {
			softReattach: true,
			tuiReassert: true,
			hostPostReplay: 'mouseOnly',
			stripMouseOnReplay: true,
		});
		assert.equal(pass.altScreen, true);
		assert.equal(pass.mouse, true);
	});

	it('documents fail: legacy RESTORE on CTRL_CLOSE, no reassert', () => {
		const fail = simulateReload(CSI.enterAlt + CSI.mouseEnable + 'chat\n', {
			oldRestoreOnCtrlClose: true,
			tuiReassert: false,
			hostPostReplay: 'none',
			stripMouseOnReplay: false,
		});
		assert.equal(fail.altScreen, false);
		assert.equal(fail.mouse, false);
	});

	it('unclean kill: host process-exit reset clears mouse+focus (shell stays clean)', () => {
		// Screenshot symptom: `[I[II…00[0…` at a bare shell = focus/mouse modes stuck.
		// Host owns modes that outlive the process — full exit reset after death.
		const s = createDecModeState();
		tuiEnterFullscreen(s);
		assert.equal(snapshot(s).mouse, true);
		assert.equal(snapshot(s).focus, true);
		// Process dies without app RESTORE (kill -9 / crash) → host exit reset.
		applyOutput(s, CSI.hostProcessExitReset);
		const after = snapshot(s);
		assert.equal(after.mouse, false, 'mouse off — no [MC… / 00[0 garbage');
		assert.equal(after.focus, false, 'focus off — no [I / [O garbage');
		assert.equal(after.altScreen, false, 'left alt screen for shell');
	});
});

describe('FocusGained reassert coalescing (freeze + [I[II) regression', () => {
	it('mouse enable CSI is safe (no ?1004 / no alt)', () => {
		assert.equal(mouseEnableSeqIsSafe(CSI.mouseEnableOnly), true);
		assert.equal(mouseEnableSeqIsSafe(CSI.mouseEnableOnly + CSI.focusEnable), false);
		assert.equal(mouseEnableSeqIsSafe(CSI.reassertDisplay), false, 'full reassert is not mouse-only');
	});

	it('one drain with FocusGained×N + Resize → exactly 1 write', () => {
		// Event-loop coalescing: request N times, flush once per drain.
		assert.equal(countMouseReassertWrites([3]), 1); // FG, FG, Resize
		assert.equal(countMouseReassertWrites([50]), 1); // storm in one batch
		assert.equal(countMouseReassertWrites([0]), 0);
	});

	it('separate drains each get a write if requested (no wall-clock suppress)', () => {
		// Real host strip 700ms later must still repair — not blocked by cooldown.
		assert.equal(countMouseReassertWrites([1, 1]), 2);
		assert.equal(countMouseReassertWrites([2, 0, 1]), 2);
	});

	it('documents shell focus garbage pattern from stuck ?1004', () => {
		const junk = '>[I[II';
		assert.match(junk, SHELL_FOCUS_GARBAGE_RE);
		assert.doesNotMatch('> hello', SHELL_FOCUS_GARBAGE_RE);
	});
});
