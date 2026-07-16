/**
 * Deterministic sticky-mouse / Reload Window scenarios (Opus-aligned policy).
 *
 *   node --test scripts/sticky-mouse-reload/scenarios.test.mjs
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	CSI,
	applyOutput,
	createDecModeState,
	decrqmIndicatesReset,
	decrqmRequest,
	isMouseOwnedByApp,
	isTuiScreenLocked,
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

describe('Reload Window (Opus-aligned soft reattach)', () => {
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

	it('soft reattach + raw reassert → locked + mouse (preferred)', () => {
		const snap = simulateReload(recordTuiSession(), {
			softReattach: true,
			hostPostReplay: 'mouseOnly',
			stripMouseOnReplay: true,
			tuiReassert: true,
		});
		assert.equal(isTuiScreenLocked(snap), true);
		assert.equal(isMouseOwnedByApp(snap), true);
	});

	it('soft reattach without reassert: mouse off after host (no sticky)', () => {
		const snap = simulateReload(recordTuiSession(), {
			softReattach: true,
			hostPostReplay: 'mouseOnly',
			stripMouseOnReplay: true,
			tuiReassert: false,
		});
		// May or may not have alt from stripped history — mouse must be off.
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

	it('cold start: spurious FocusGained must not wipe welcome', () => {
		const { afterWelcome, afterSpuriousFocus } = simulateColdStartWithSpuriousFocus();
		assert.equal(afterWelcome.altScreen, true);
		assert.equal(afterWelcome.mouse, true);
		assert.deepEqual(afterSpuriousFocus, afterWelcome);
	});

	it('reassertDisplay enters alt and mouse without leave', () => {
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
});
