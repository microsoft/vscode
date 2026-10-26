/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The Copilot CLI names its shell tools after the shell it runs — `bash` and
 * friends on POSIX, `powershell` and friends on Windows — so a fixture recorded
 * on one platform instructs the agent to call a tool that does not exist on the
 * other, and the turn fails with "Tool does not exist".
 *
 * Store the platform-neutral placeholder in the fixture and expand it back to
 * the running platform's name on replay, so a single capture drives every
 * platform. Only the names that actually vary are mapped: Claude's `Bash` and
 * Codex's `shell` are fixed strings their SDKs use everywhere.
 */
const SHELL_TOOL_PREFIXES = ['', 'read_', 'write_', 'stop_', 'list_'] as const;
const SHELL_TOOL_PLACEHOLDERS = new Map<string, string>();
for (const prefix of SHELL_TOOL_PREFIXES) {
	const placeholder = `\${${prefix}shell}`;
	SHELL_TOOL_PLACEHOLDERS.set(`${prefix}bash`, placeholder);
	SHELL_TOOL_PLACEHOLDERS.set(`${prefix}powershell`, placeholder);
}
SHELL_TOOL_PLACEHOLDERS.set('bash_shutdown', '${shell_shutdown}');
SHELL_TOOL_PLACEHOLDERS.set('powershell_shutdown', '${shell_shutdown}');

/** Rewrites a platform-specific shell tool name to its stable placeholder. */
export function normalizeShellToolNameForCapture(toolName: string): string {
	return SHELL_TOOL_PLACEHOLDERS.get(toolName) ?? toolName;
}

/**
 * Expands a shell tool placeholder to the name the given platform uses.
 *
 * `platform` is injectable so both branches are testable from either host;
 * it defaults to the running platform.
 */
export function expandShellToolName(toolName: string, platform: NodeJS.Platform = process.platform): string {
	const match = /^\$\{(?<prefix>read_|write_|stop_|list_)?shell(?<shutdown>_shutdown)?\}$/.exec(toolName);
	if (!match) {
		return toolName;
	}
	const shell = platform === 'win32' ? 'powershell' : 'bash';
	return match.groups?.shutdown ? `${shell}_shutdown` : `${match.groups?.prefix ?? ''}${shell}`;
}
