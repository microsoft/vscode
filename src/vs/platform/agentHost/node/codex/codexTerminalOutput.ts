/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ToolResultContentType, type ToolResultContent } from '../../common/state/sessionState.js';

/** Maximum inline Codex command output, measured in UTF-16 code units. */
export const CODEX_COMMAND_OUTPUT_INLINE_CHAR_LIMIT = 80_000;
const RETAINED_OUTPUT_PREVIEW_LENGTH = 400;

export function shouldRetainCodexCommandOutput(output: string): boolean {
	return output.length > CODEX_COMMAND_OUTPUT_INLINE_CHAR_LIMIT;
}

/**
 * Result content for a command whose complete output is retained: a raw prefix
 * of the output as its preview, and the non-PTY terminal `resource` that serves
 * the rest.
 */
export function codexRetainedCommandOutputContent(resource: string, output: string, exitCode: number | null): ToolResultContent[] {
	const preview = output.slice(0, RETAINED_OUTPUT_PREVIEW_LENGTH);
	return [
		{ type: ToolResultContentType.Text, text: preview },
		{
			type: ToolResultContentType.Terminal,
			resource,
			title: 'Run shell command',
			isPty: false,
			result: {
				...(exitCode !== null ? { exitCode } : {}),
				preview,
				truncated: true,
			},
		},
	];
}
