/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tool display name and message helpers for the native agent's built-in tools.
 * Analogous to `copilotToolDisplay.ts` for the Copilot SDK agent.
 */

/** Maps a native tool name to a human-readable display name. */
export function getToolDisplayName(toolName: string): string {
	switch (toolName) {
		case 'bash': return 'Bash';
		case 'read_file': return 'Read File';
		default: return toolName;
	}
}

/** Returns a present-tense message describing a tool invocation in progress. */
export function getInvocationMessage(toolName: string, args: Record<string, unknown>): string {
	switch (toolName) {
		case 'bash': {
			const cmd = typeof args['command'] === 'string' ? args['command'] : '';
			return `Running \`${truncate(cmd, 80)}\``;
		}
		case 'read_file': {
			const path = typeof args['path'] === 'string' ? args['path'] : '';
			return `Reading ${truncate(path, 80)}`;
		}
		default:
			return `Running ${toolName}`;
	}
}

/** Returns a past-tense message describing a completed tool invocation. */
export function getPastTenseMessage(toolName: string, args: Record<string, unknown>): string {
	switch (toolName) {
		case 'bash': {
			const cmd = typeof args['command'] === 'string' ? args['command'] : '';
			return `Ran \`${truncate(cmd, 80)}\``;
		}
		case 'read_file': {
			const path = typeof args['path'] === 'string' ? args['path'] : '';
			return `Read ${truncate(path, 80)}`;
		}
		default:
			return `Ran ${toolName}`;
	}
}

/**
 * Returns the tool kind hint for the renderer.
 * 'terminal' triggers terminal-style rendering.
 */
export function getToolKind(toolName: string): 'terminal' | undefined {
	if (toolName === 'bash') {
		return 'terminal';
	}
	return undefined;
}

/** Returns a representative input string for display in the UI. */
export function getToolInputString(toolName: string, args: Record<string, unknown>): string | undefined {
	switch (toolName) {
		case 'bash':
			return typeof args['command'] === 'string' ? args['command'] : undefined;
		case 'read_file':
			return typeof args['path'] === 'string' ? args['path'] : undefined;
		default:
			return undefined;
	}
}

/** Returns the language identifier for syntax highlighting (for terminal tools). */
export function getShellLanguage(toolName: string): string | undefined {
	if (toolName === 'bash') {
		return 'shellscript';
	}
	return undefined;
}

function truncate(str: string, maxLen: number): string {
	if (str.length <= maxLen) {
		return str;
	}
	return str.substring(0, maxLen - 3) + '...';
}
