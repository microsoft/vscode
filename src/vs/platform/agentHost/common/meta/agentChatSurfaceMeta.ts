/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** VS Code-owned metadata describing the chat surface that created a session. */
export const VSCODE_CHAT_SURFACE_META_KEY = 'vscode.chat.surface';

interface IHasChatSurfaceMeta {
	readonly _meta?: Record<string, unknown>;
}

/** Typed metadata for a terminal-backed chat session. */
export interface ITerminalChatSurfaceMeta {
	readonly surface: 'terminal';
	readonly shellType?: string;
	readonly osName: string;
}

/** Reads recognized chat-surface metadata, dropping malformed values. */
export function readChatSurfaceMeta(source: IHasChatSurfaceMeta): ITerminalChatSurfaceMeta | undefined {
	// eslint-disable-next-line local/code-no-untyped-meta-access -- sanctioned first hop into the namespaced chat-surface slot.
	const value = source._meta?.[VSCODE_CHAT_SURFACE_META_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}

	const raw = value as Record<string, unknown>;
	if (raw['surface'] !== 'terminal'
		|| (raw['shellType'] !== undefined && typeof raw['shellType'] !== 'string')
		|| typeof raw['osName'] !== 'string') {
		return undefined;
	}

	return {
		surface: 'terminal',
		...(typeof raw['shellType'] === 'string' ? { shellType: raw['shellType'] } : {}),
		osName: raw['osName'],
	};
}

/** Adds VS Code's typed chat-surface metadata to an open request metadata bag. */
export function withChatSurfaceMeta(meta: Record<string, unknown> | undefined, surface: ITerminalChatSurfaceMeta | undefined): Record<string, unknown> | undefined {
	if (!surface) {
		return meta;
	}
	return {
		...(meta ?? {}),
		[VSCODE_CHAT_SURFACE_META_KEY]: {
			surface: surface.surface,
			...(surface.shellType !== undefined ? { shellType: surface.shellType } : {}),
			osName: surface.osName,
		},
	};
}

function isPowerShell(shellType: string): boolean {
	return shellType === 'ps1' || shellType === 'pwsh' || shellType === 'powershell';
}

/**
 * Builds the per-turn host instruction for a terminal chat surface.
 *
 * Lives next to {@link ITerminalChatSurfaceMeta} because it is a pure function
 * of that shape, so the prompt and the metadata it consumes cannot drift.
 *
 * This is additive context layered on top of the harness's own system prompt —
 * it biases toward terse, shell-appropriate command answers but does not by
 * itself prevent an agentic harness from exploring with tools first.
 */
export function createTerminalChatInstruction(surface: ITerminalChatSurfaceMeta): string {
	const shellType = surface.shellType;
	return [
		'<terminal_chat>',
		'You specialize in the command line. Help the user craft a command to run.',
		`- You're targeting ${surface.osName}.`,
		...(shellType ? [`- The active shell is ${shellType}.`] : []),
		'- Prefer single-line commands. Omit explanations unless the command is complex; then be concise.',
		'- Use `{placeholder_text}` for required replacement text that the user did not provide.',
		...(shellType && isPowerShell(shellType)
			? [
				'- Prefer idiomatic PowerShell: use `Stop-Process` or `Get-NetTCPConnection` instead of `kill` or `lsof`.',
				'- Prefer cross-platform PowerShell and use Unix utilities only when PowerShell has no equivalent.',
			]
			: shellType ? ['- Only use Python or Perl when the shell cannot accomplish the task.'] : []),
		`- Do not try to accomplish the task yourself, instead provide a${shellType ? ` ${shellType}` : ''} command to run.`,
		'- Avoid extraneous steps or context-gathering prior to providing the command, unless context is required to resolve ambiguity.',
		'</terminal_chat>',
	].join('\n');
}
