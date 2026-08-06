/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * DEC private-mode resets for mouse tracking (and related sticky modes).
 *
 * Full-screen TUIs (vim, less, Claude Code, …) enable mouse reporting via
 * CSI ?9/?1000/?1002/?1003/?1015/?1006. If those modes stay on when the
 * consumer is a shell, xterm.js reports mouse as SGR/X10 text (`[M…`, `[MC…`).
 *
 * Host strategy (narrow, intentional scope):
 * 1. **Root process exit** — when the terminal's root PTY process exits, write
 *    {@link TERMINAL_PROCESS_EXIT_RESET}. This is the shell/process that VS Code
 *    owns — not an intermediate child TUI (vim under bash). Child→shell sticky
 *    modes still require the app's own teardown or a future foreground-command
 *    signal.
 * 2. **PTY replay (Reload / reconnect)** — strip mouse-tracking *enable* CSI
 *    from serialized replay (keep alt-screen and ?1004 so a live full-screen
 *    app can still receive real FocusGained from the emulator).
 * 3. **Replay complete** — mouse-only reset if the process is still live;
 *    full exit reset if exit already raced ahead of replay.
 *
 * Focus-in synthesis (`CSI I` on process stdin) is intentionally **not** done
 * here: emulator ?1004 state can be stale after a dead child TUI, and would
 * inject protocol input into a shell. Reassert is the app's job on real focus.
 *
 * Sequence parity: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html
 */

/** Mouse tracking only — safe after replay (preserves focus / bracketed paste). */
export const TERMINAL_MOUSE_TRACKING_RESET =
	'\x1b[?9l' +    // X10 mouse tracking (serializer may re-emit ?9h)
	'\x1b[?1000l' + // normal tracking
	'\x1b[?1002l' + // button-event tracking
	'\x1b[?1003l' + // any-event tracking
	'\x1b[?1015l' + // urxvt extended
	'\x1b[?1006l';  // SGR extended

/**
 * Full sticky-mode cleanup for root-process exit (mouse + paste + focus).
 * Prefer this when the process is gone and the tab may host a shell next.
 */
export const TERMINAL_MOUSE_MODE_RESET =
	TERMINAL_MOUSE_TRACKING_RESET +
	'\x1b[?2004l' + // bracketed paste
	'\x1b[?1004l';  // focus in/out

/**
 * Root-process exit reset: {@link TERMINAL_MOUSE_MODE_RESET} plus leave the
 * alternate screen and show the cursor. Only for paths where the **root** PTY
 * process is known dead — never write this while a process lives.
 *
 * Scope note: this runs on terminal process exit (the shell / root child of the
 * PTY), not when a nested TUI exits back to a still-running shell.
 */
export const TERMINAL_PROCESS_EXIT_RESET =
	TERMINAL_MOUSE_MODE_RESET +
	'\x1b[?1049l' + // leave alternate screen
	'\x1b[?25h';    // show cursor

/** DEC private modes that enable mouse reporting (incl. X10 ?9). */
const MOUSE_TRACKING_ENABLE_MODES = new Set(['9', '1000', '1002', '1003', '1006', '1015']);

/**
 * Returns true if `data` looks like it contains DEC mouse-tracking enable
 * sequences (used by tests / diagnostics). Includes X10 (`?9h`).
 */
export function dataEnablesMouseTracking(data: string): boolean {
	return (
		data.includes('\x1b[?9h') ||
		data.includes('\x1b[?1000h') ||
		data.includes('\x1b[?1002h') ||
		data.includes('\x1b[?1003h') ||
		data.includes('\x1b[?1006h') ||
		data.includes('\x1b[?1015h') ||
		/\x1b\[\?[\d;]*\b(?:9|1000|1002|1003|1006|1015)[\d;]*h/.test(data)
	);
}

/**
 * Remove mouse-tracking **enable** modes from CSI DECSET sequences in `data`
 * (including X10 `?9`). Resets (`l`) and non-mouse modes (e.g. ?1049, ?1004,
 * ?2004) are preserved. Used only on PTY **replay** data — live process
 * output must not be filtered.
 */
export function stripMouseTrackingEnableFromData(data: string): string {
	if (!data.includes('\x1b[?')) {
		return data;
	}
	return data.replace(/\x1b\[\?([\d;]+)([hl])/g, (full, modes: string, flag: string) => {
		if (flag === 'l') {
			return full;
		}
		const parts = modes.split(';');
		const kept = parts.filter(p => !MOUSE_TRACKING_ENABLE_MODES.has(p));
		if (kept.length === parts.length) {
			return full;
		}
		if (kept.length === 0) {
			return '';
		}
		return `\x1b[?${kept.join(';')}h`;
	});
}
