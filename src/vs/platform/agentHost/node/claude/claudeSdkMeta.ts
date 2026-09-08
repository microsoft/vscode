/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const TOOL_USE_ID_META_KEY = 'claudecode/toolUseId';

/** Reads the Claude SDK's originating tool-use id from an MCP handler callback. */
export function extractToolUseId(extra: unknown): string | undefined {
	if (!extra || typeof extra !== 'object') {
		return undefined;
	}
	const meta = (extra as { _meta?: unknown })._meta;
	if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
		return undefined;
	}
	const value = (meta as Record<string, unknown>)[TOOL_USE_ID_META_KEY];
	return typeof value === 'string' ? value : undefined;
}
