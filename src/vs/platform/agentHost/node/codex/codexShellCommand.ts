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
 * `<shell> -[l]c <script>` or PowerShell `-Command <script>` wrapper and return
 * the inner script so both agents render identically. Falls back to the raw
 * command when it doesn't match a supported wrapper shape.
 *
 * Use the result for display or inspecting the inner script, but keep the raw
 * command for identity and round-tripping, including pre-flight coalescing and
 * accept-for-session memo keys.
 */
export function unwrapShellInvocation(command: string): string {
	const shellMatch = /^\s*\S*sh(?:\.exe)?\s+-[a-z]*c\s+([\s\S]+)$/i.exec(command);
	if (shellMatch) {
		return unquoteShellArg(shellMatch[1].trim());
	}
	const powershellMatch = /^\s*(?:"[^"]*(?:powershell|pwsh)(?:\.exe)?"|'[^']*(?:powershell|pwsh)(?:\.exe)?'|\S*(?:powershell|pwsh)(?:\.exe)?)\s+(?:(?:-(?:NoLogo|NoProfile|NonInteractive|NoExit|Sta|Mta))\s+|(?:-ExecutionPolicy\s+\S+\s+))*-(?:Command|C)\s+([\s\S]+)$/i.exec(command);
	return powershellMatch ? unquoteShellArg(powershellMatch[1].trim()) : command;
}

/** Reads the standalone shell patch forms intercepted by Codex without executing the command. */
export function extractCodexShellPatch(command: string): { patch: string; directory?: string } | undefined {
	const invocation = /^(?:cd\s+(?<directory>'[^']*'|"[^"]*"|[^\s;&|]+)\s*&&\s*)?(?:apply_patch|applypatch)\s+(?<arguments>[\s\S]+)$/.exec(unwrapShellInvocation(command).trim());
	if (!invocation?.groups) {
		return undefined;
	}
	const argument = invocation.groups.arguments;
	let patch: string;
	if (argument.startsWith('<<')) {
		const heredoc = /^<<(?<stripTabs>-?)\s*(?<delimiter>'[^'\r\n]+'|"[^"\r\n]+"|[A-Za-z_][A-Za-z0-9_]*)\r?\n(?<body>[\s\S]+)$/.exec(argument);
		if (!heredoc?.groups) {
			return undefined;
		}
		const delimiter = unquoteShellArg(heredoc.groups.delimiter);
		const { body, stripTabs } = heredoc.groups;
		const lines = body.trimEnd().split(/\r?\n/).map(line => stripTabs ? line.replace(/^\t+/, '') : line);
		if (lines.pop() !== delimiter) {
			return undefined;
		}
		patch = lines.join('\n');
	} else if (argument.startsWith('\'') && argument.endsWith('\'')) {
		patch = unquoteShellArg(argument);
	} else {
		return undefined;
	}
	if (!patch.startsWith('*** Begin Patch\n') || !patch.trimEnd().endsWith('\n*** End Patch')) {
		return undefined;
	}
	return { patch, directory: invocation.groups.directory ? unquoteShellArg(invocation.groups.directory) : undefined };
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
