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
	/** App FocusGained reassert: mouse only (MOUSE_ENABLE_SEQ; no alt, no ?1004). */
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
 * Simulate Reload under simplified app policy:
 * - Soft CTRL_CLOSE does NOT write RESTORE_SEQ (process may survive).
 * - Host may strip mouse enables from replayed history.
 * - App FocusGained: always reassert **mouse/focus enables only** (idempotent).
 *   Never EnterAlternateScreen on focus.
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

	// softReattach models "CTRL_CLOSE did not RESTORE" (process may live).
	// Renderer still replays stripped history into a fresh mode state.
	const state = createDecModeState();
	applyOutput(state, stream);

	if (hostPostReplay === 'mouseOnly') {
		applyOutput(state, CSI.hostMouseOnlyReset);
	} else if (hostPostReplay === 'full') {
		applyOutput(state, CSI.hostExitReset);
	}

	// Desired-state: FocusGained always reasserts non-destructive input modes.
	// softReattach no longer selects full display reassert (alt wipe risk).
	if (tuiReassert) {
		applyOutput(state, CSI.mouseEnableOnly);
		void softReattach; // policy flag retained for scenario naming only
	}

	return snapshot(state);
}

export function simulateColdStartWithSpuriousFocus() {
	const state = createDecModeState();
	tuiEnterFullscreen(state);
	const afterWelcome = snapshot(state);
	// Idempotent mouse reassert on FocusGained must not leave alt / wipe content.
	applyOutput(state, CSI.mouseEnableOnly);
	return { afterWelcome, afterSpuriousFocus: snapshot(state) };
}

export function isTuiScreenLocked(snap) {
	return snap.altScreen === true;
}

export function isMouseOwnedByApp(snap) {
	return snap.mouse === true;
}

/**
 * Drain coalescing: each element is the number of request_mouse_reassert()
 * calls in one event-loop drain. Writes = one per non-empty drain.
 * Mirrors pager: N FocusGained+Resize in one batch → one mouse CSI write.
 * Regression: per-event write without coalesce froze VS Code/ConPTY.
 *
 * @param {number[]} requestsPerDrain
 */
export function countMouseReassertWrites(requestsPerDrain) {
	return requestsPerDrain.filter((n) => n > 0).length;
}

/**
 * Mouse-only reassert CSI must not embed focus (?1004) or alt (?1049).
 * Focus reporting is startup-only; re-firing ?1004h storms CSI I.
 */
export function mouseEnableSeqIsSafe(seq) {
	const s = String(seq);
	const hasMouse = s.includes('?1006h') || s.includes('?1000h');
	const noFocus = !s.includes('1004');
	const noAlt = !s.includes('1049');
	return hasMouse && noFocus && noAlt;
}

/**
 * Shell-garbage pattern after sticky focus/mouse modes (user screenshot).
 * Host exit-reset + no app CSI I into bare shells prevent this.
 */
export const SHELL_FOCUS_GARBAGE_RE = /\[I(\[I)+/;
