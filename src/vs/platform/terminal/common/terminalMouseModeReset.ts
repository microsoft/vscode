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
 *    {@link TERMINAL_PROCESS_EXIT_RESET}. Unconditional — process is gone.
 * 2. **PTY replay (Reload / reconnect)** — strip mouse-tracking *enable* CSI
 *    only when {@link shouldStripMouseTrackingOnReplay} says so (dead root, or
 *    Windows shell with zero console children). Live full-screen TUIs replay
 *    **verbatim** so mouse stays on without app FocusGained reassert.
 * 3. **Replay complete** — full exit reset only if the root already exited
 *    (`_exitCode` set). No mouse-only reset on the live path (that was itself
 *    a live-TUI regression).
 *
 * Focus-in synthesis (`CSI I` on process stdin) is intentionally **not** done
 * here: emulator ?1004 state can be stale after a dead child TUI, and would
 * inject protocol input into a shell. App-side reassert remains defense-in-depth.
 *
 * Sequence parity: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html
 */

/** Shell-like process titles / types — root is a shell, not a full-screen TUI. */
// Includes VS Code TerminalShellType string values (bash, pwsh, cmd, gitbash, wsl, nu, …).
// Deliberately excludes TUI roots: claude, codex, copilot, gemini, node, python, …
const SHELL_LIKE_RE = /^(bash|sh|zsh|fish|csh|tcsh|ksh|dash|pwsh|powershell|powershell_ise|cmd|cmd\.exe|gitbash|git-bash|wsl|nu|nushell|xonsh|elvish|oil|osh)(\.exe)?$/i;

export interface IMouseReplayStripContext {
	/** Root PTY process still running (not yet exited). */
	processAlive: boolean;
	/** From ChildProcessMonitor / Windows console process list. */
	hasChildProcesses: boolean;
	/** Best-effort shell type or process title. */
	shellTypeOrTitle?: string | undefined;
	/** `process.platform === 'win32'` at the pty host. */
	isWindows: boolean;
}

/**
 * Whether reconnection replay should strip mouse-tracking *enable* CSI.
 *
 * - Dead root → strip (no live owner; exit reset also runs at replay-complete).
 * - Live root + Windows + shell-like + no console children → strip (nested TUI
 *   died under a still-living shell; sticky modes would otherwise re-arm).
 * - Otherwise → do **not** strip (live TUI / shell with children — upstream
 *   serialize re-arm is correct).
 */
export function shouldStripMouseTrackingOnReplay(ctx: IMouseReplayStripContext): boolean {
	if (!ctx.processAlive) {
		return true;
	}
	if (!ctx.isWindows) {
		// POSIX: no reliable child-liveness signal; accept residual nested-dead hole.
		return false;
	}
	if (ctx.hasChildProcesses) {
		return false;
	}
	const name = (ctx.shellTypeOrTitle || '').trim();
	if (!name) {
		// Unknown title — do not strip (could be a TUI as the root process).
		return false;
	}
	// shellType enums are often bare names (PowerShell, GitBash); titles may be "pwsh.exe"
	const normalized = name.replace(/\s+/g, '');
	return SHELL_LIKE_RE.test(normalized) || SHELL_LIKE_RE.test(name.split(/[\\/]/).pop() || '');
}

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
/** Tracking modes without SGR encoding — what SerializeAddon typically re-emits. */
const MOUSE_TRACKING_WITHOUT_SGR = ['9', '1000', '1002', '1003'] as const;

/**
 * True if `data` contains a DECSET enable for any of `modes` (simple CSI or
 * combined `?1000;1002h` form).
 */
function dataEnablesModes(data: string, modes: readonly string[]): boolean {
	if (!data.includes('\x1b[?')) {
		return false;
	}
	for (const m of modes) {
		if (data.includes(`\x1b[?${m}h`)) {
			return true;
		}
	}
	const re = new RegExp(`\\x1b\\[\\?[\\d;]*\\b(?:${modes.join('|')})[\\d;]*h`);
	return re.test(data);
}

/**
 * Returns true if `data` looks like it contains DEC mouse-tracking enable
 * sequences (used by tests / diagnostics). Includes X10 (`?9h`).
 */
export function dataEnablesMouseTracking(data: string): boolean {
	return dataEnablesModes(data, [...MOUSE_TRACKING_ENABLE_MODES]);
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

/**
 * xterm SerializeAddon re-emits mouse *tracking* (?9/?1000/?1002/?1003) from
 * `modes.mouseTrackingMode` but never SGR encoding (?1006). Without ?1006h,
 * post-Reload clicks produce X10-style reports, not `\x1b[<…M`, so modern TUIs
 * (and our smoke oracle) see no SGR log growth even when stripMouse=false.
 *
 * When replay already enables tracking and SGR is missing, append ?1006h.
 * Only for the live-TUI path (caller must not strip mouse).
 */
export function ensureSgrMouseEncodingOnReplay(data: string): string {
	if (!dataEnablesModes(data, MOUSE_TRACKING_WITHOUT_SGR)) {
		return data;
	}
	if (dataEnablesModes(data, ['1006'])) {
		return data;
	}
	return data + '\x1b[?1006h';
}
