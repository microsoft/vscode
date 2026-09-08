/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** The metadata key for VS Code-owned chat-surface information. */
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

/** Metadata describing an editor inline-chat surface. */
export interface IEditorInlineChatSurfaceMeta {
	readonly surface: 'editorInline';
	readonly languageId?: string;
	readonly targetUri?: string;
}

/** VS Code-owned metadata describing the chat surface that created a session. */
export type IChatSurfaceMeta = ITerminalChatSurfaceMeta | IEditorInlineChatSurfaceMeta;

/** Reads recognized chat-surface metadata, dropping malformed values. */
export function readChatSurfaceMeta(source: IHasChatSurfaceMeta): IChatSurfaceMeta | undefined {
	// eslint-disable-next-line local/code-no-untyped-meta-access -- sanctioned first hop into the namespaced chat-surface slot.
	const value = source._meta?.[VSCODE_CHAT_SURFACE_META_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}

	const raw = value as Record<string, unknown>;
	switch (raw['surface']) {
		case 'terminal':
			if ((raw['shellType'] !== undefined && typeof raw['shellType'] !== 'string')
				|| typeof raw['osName'] !== 'string') {
				return undefined;
			}

			return {
				surface: 'terminal',
				...(typeof raw['shellType'] === 'string' ? { shellType: raw['shellType'] } : {}),
				osName: raw['osName'],
			};
		case 'editorInline':
			if (raw['languageId'] !== undefined && typeof raw['languageId'] !== 'string') {
				return undefined;
			}

			return {
				surface: 'editorInline',
				...(typeof raw['languageId'] === 'string' ? { languageId: raw['languageId'] } : {}),
				...(typeof raw['targetUri'] === 'string' ? { targetUri: raw['targetUri'] } : {}),
			};
		default:
			return undefined;
	}
}

/** Adds VS Code's typed chat-surface metadata to an open request metadata bag. */
export function withChatSurfaceMeta(meta: Record<string, unknown> | undefined, surface: IChatSurfaceMeta | undefined): Record<string, unknown> | undefined {
	if (!surface) {
		return meta;
	}

	const serializedSurface = surface.surface === 'terminal'
		? {
			surface: surface.surface,
			...(surface.shellType !== undefined ? { shellType: surface.shellType } : {}),
			osName: surface.osName,
		}
		: {
			surface: 'editorInline',
			...(surface.languageId !== undefined ? { languageId: surface.languageId } : {}),
			...(surface.targetUri !== undefined ? { targetUri: surface.targetUri } : {}),
		};

	return {
		...(meta ?? {}),
		[VSCODE_CHAT_SURFACE_META_KEY]: serializedSurface,
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
		'- Always put each command in its own fenced Markdown code block using triple backticks, never in plain text or inline code. Use the shell type as the code block language when known.',
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

/**
 * Builds the per-turn host instruction for an editor inline-chat surface.
 */
export function createEditorInlineChatInstruction(surface: IEditorInlineChatSurfaceMeta): string {
	return [
		'<editor_inline_chat>',
		'You specialize in focused inline edits. Make the requested change directly.',
		'- Edit only the file attached as the current editor context. Do not create, delete, or modify other files.',
		'- Make the smallest edit that satisfies the request; preserve surrounding style and indentation.',
		'- Focus on the user\'s selected range when one is provided.',
		'- Avoid broad repository exploration or context-gathering unless required to resolve ambiguity.',
		'- After making the edit, stop; do not run tests, builds, linters, or other verification, and never summarize the change.',
		'- Produce the edit directly rather than explaining it or writing a tutorial.',
		...(surface.languageId !== undefined ? [`- The file's language is ${surface.languageId}.`] : []),
		'</editor_inline_chat>',
	].join('\n');
}
