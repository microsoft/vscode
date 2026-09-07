/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Codex reports a shell command as the exact invocation it hands to the OS —
 * the user's login shell wrapping the actual script, e.g.
 * `/bin/zsh -lc 'touch ~/foo'`. That wrapper is noise in the chat UI and makes
 * Codex's terminal pills (and its approval / denial cards) look different from
 * Claude's (which surface the bare `touch ~/foo`). Peel off a leading
 * `<shell> -[l]c <script>` wrapper and return the inner script so both agents
 * render identically. Falls back to the raw command when it doesn't match the
 * wrapper shape.
 *
 * This is a display-only transform: callers must keep the raw command for any
 * identity/round-trip purpose (accept-for-session memo keys, re-sending the
 * exact action to the app-server, etc.).
 */
export function unwrapShellInvocation(command: string): string {
	const match = /^\s*\S*sh(?:\.exe)?\s+-[a-z]*c\s+([\s\S]+)$/i.exec(command);
	if (!match) {
		return command;
	}
	return unquoteShellArg(match[1].trim());
}

/**
 * Strips the surrounding quotes the shell wrapper added around a script
 * argument and undoes the corresponding escaping (POSIX `'\''` for single
 * quotes; backslash escapes for double quotes). Returns the argument unchanged
 * when it is not quoted.
 */
function unquoteShellArg(arg: string): string {
	if (arg.length >= 2 && arg[0] === '\'' && arg[arg.length - 1] === '\'') {
		return arg.slice(1, -1).replace(/'\\''/g, '\'');
	}
	if (arg.length >= 2 && arg[0] === '"' && arg[arg.length - 1] === '"') {
		return arg.slice(1, -1).replace(/\\(["\\$`])/g, '$1');
	}
	return arg;
}
