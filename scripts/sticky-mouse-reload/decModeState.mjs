/**
 * Minimal DEC private-mode state machine for sticky-mouse / Reload scenarios.
 * Pure JS — no VS Code GUI. Run: node --test scenarios.test.mjs
 */

const MOUSE_MODES = new Set([9, 1000, 1002, 1003, 1006, 1015]);

/** @returns {{ altScreen: boolean, mouse: boolean, focus: boolean, paste: boolean }} */
export function createDecModeState() {
	return {
		altScreen: false,
		mouse: false,
		focus: false,
		paste: false,
		_mouseSet: new Set(),
	};
}

/**
 * @param {ReturnType<typeof createDecModeState>} state
 * @param {string} data
 */
export function applyOutput(state, data) {
	const re = /\x1b\[\?([\d;]+)([hl])/g;
	let m;
	while ((m = re.exec(data)) !== null) {
		const modes = m[1].split(';').map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n));
		const on = m[2] === 'h';
		for (const mode of modes) {
			applyOne(state, mode, on);
		}
	}
}

function applyOne(state, mode, on) {
	if (mode === 1049 || mode === 1047 || mode === 47) {
		state.altScreen = on;
		return;
	}
	if (mode === 1004) {
		state.focus = on;
		return;
	}
	if (mode === 2004) {
		state.paste = on;
		return;
	}
	if (MOUSE_MODES.has(mode)) {
		if (on) state._mouseSet.add(mode);
		else state._mouseSet.delete(mode);
		state.mouse = state._mouseSet.size > 0;
	}
}

export function snapshot(state) {
	return {
		altScreen: state.altScreen,
		mouse: state.mouse,
		focus: state.focus,
		paste: state.paste,
	};
}

export const CSI = {
	enterAlt: '\x1b[?1049h',
	leaveAlt: '\x1b[?1049l',
	mouseEnable: '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1015h\x1b[?1006h',
	/** X10 mouse enable (xterm serialize re-emits when mouseTrackingMode is x10). */
	mouseX10Enable: '\x1b[?9h',
	mouseDisable: '\x1b[?9l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1015l\x1b[?1006l',
	focusEnable: '\x1b[?1004h',
	focusDisable: '\x1b[?1004l',
	pasteEnable: '\x1b[?2004h',
	pasteDisable: '\x1b[?2004l',
	/** Real exit RESTORE_SEQ (leave alt + clear modes). */
	restoreSeq:
		'\x1b[?2026l\x1b[?25h\x1b[?9l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1015l\x1b[?1006l\x1b[?2004l\x1b[?1004l\x1b[<u\x1b[?1049l',
	/** Host full mode reset (mouse + paste + focus; keeps alt). */
	hostExitReset:
		'\x1b[?9l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1015l\x1b[?1006l\x1b[?2004l\x1b[?1004l',
	/** Host process-exit reset: full reset + leave alt screen + show cursor. */
	hostProcessExitReset:
		'\x1b[?9l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1015l\x1b[?1006l\x1b[?2004l\x1b[?1004l\x1b[?1049l\x1b[?25h',
	/** Host mouse-only after replay (no CSI I focus synthesis — that is app-side). */
	hostMouseOnlyReset:
		'\x1b[?9l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1015l\x1b[?1006l',
	/** Grok REASSERT_DISPLAY_SEQ (raw CSI). */
	reassertDisplay:
		'\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1015h\x1b[?1006h\x1b[?1004h\x1b[?2004h\x1b[?25l',
	/** Mouse enables only (after host strip on replay). */
	mouseEnableOnly: '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1015h\x1b[?1006h',
};

export function tuiEnterFullscreen(state) {
	applyOutput(state, CSI.mouseDisable);
	applyOutput(state, CSI.enterAlt + CSI.mouseEnable + CSI.focusEnable + CSI.pasteEnable);
	applyOutput(state, 'Grok TUI content\n');
}

/** Strip mouse-enable CSI (host basePty policy). */
export function stripMouseEnables(data) {
	return data.replace(/\x1b\[\?([\d;]+)([hl])/g, (full, modes, flag) => {
		if (flag === 'l') return full;
		const parts = modes.split(';');
		const mouse = new Set(['9', '1000', '1002', '1003', '1006', '1015']);
		const kept = parts.filter(p => !mouse.has(p));
		if (kept.length === parts.length) return full;
		if (kept.length === 0) return '';
		return `\x1b[?${kept.join(';')}h`;
	});
}

/**
 * DECRQM helpers (mirror xai-crash-handler pure API).
 */
export function decrqmRequest(mode) {
	return `\x1b[?${mode}$p`;
}

/** @returns {{ mode: number, ps: number } | null} */
export function parseDecrqmReply(data) {
	const m = data.match(/\x1b\[\?(\d+);(\d+)\$y/);
	if (!m) return null;
	return { mode: parseInt(m[1], 10), ps: parseInt(m[2], 10) };
}

export function decrqmIndicatesReset(ps) {
	return ps === 0 || ps === 2 || ps === 4;
}

/**
 * Simulate Reload under Opus-aligned policy:
 * - Soft CTRL_CLOSE does NOT write RESTORE_SEQ (process may survive).
 * - New xterm starts clean; host strips mouse enables from any replayed history.
 * - Host mouse-only post-replay.
 * - If softReattach + tuiReassert: raw REASSERT_DISPLAY_SEQ once.
 *
 * @param {string} recordedOutput
 * @param {{ hostPostReplay?: 'none'|'mouseOnly'|'full', tuiReassert?: boolean, softReattach?: boolean, stripMouseOnReplay?: boolean, oldRestoreOnCtrlClose?: boolean }} opts
 */
export function simulateReload(recordedOutput, opts = {}) {
	const {
		hostPostReplay = 'mouseOnly',
		tuiReassert = false,
		softReattach = false,
		stripMouseOnReplay = true,
		/** Legacy bad path: CTRL_CLOSE wrote RESTORE_SEQ (for regression tests). */
		oldRestoreOnCtrlClose = false,
	} = opts;

	let stream = recordedOutput;
	if (oldRestoreOnCtrlClose) {
		stream += CSI.restoreSeq;
	}
	if (stripMouseOnReplay) {
		stream = stripMouseEnables(stream);
	}

	// Soft reattach: new emulator is empty (renderer recreated). Replay may
	// still have history, but without oldRestore the process never left alt
	// on the *old* emulator — the *new* one starts default. Model: empty state
	// then apply stripped replay (content only mostly).
	const state = createDecModeState();
	if (softReattach && !oldRestoreOnCtrlClose) {
		// New xterm: no modes. Replay stripped history for content/alt from buffer.
		applyOutput(state, stream);
	} else {
		applyOutput(state, stream);
	}

	if (hostPostReplay === 'mouseOnly') {
		applyOutput(state, CSI.hostMouseOnlyReset);
	} else if (hostPostReplay === 'full') {
		applyOutput(state, CSI.hostExitReset);
	}

	// Soft reattach: full display reassert. Else host strip left mouse off —
	// mouse-only reassert (no EnterAlternateScreen).
	if (tuiReassert && softReattach) {
		applyOutput(state, CSI.reassertDisplay);
	} else if (tuiReassert && !softReattach) {
		applyOutput(state, CSI.mouseEnableOnly);
	}

	return snapshot(state);
}

export function simulateColdStartWithSpuriousFocus() {
	const state = createDecModeState();
	tuiEnterFullscreen(state);
	const afterWelcome = snapshot(state);
	// No soft-reattach flag → no reassert on FocusGained.
	return { afterWelcome, afterSpuriousFocus: snapshot(state) };
}

export function isTuiScreenLocked(snap) {
	return snap.altScreen === true;
}

export function isMouseOwnedByApp(snap) {
	return snap.mouse === true;
}
