/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ToolResultContentType, type ToolResultContent } from '../../common/state/sessionState.js';

/**
 * Command output longer than this many characters is retained in the chat's
 * session database and shown as a preview, matching the size above which the
 * workbench terminal tool saves its output to a file.
 */
const RETAINED_OUTPUT_THRESHOLD = 20_000;

/** Characters of retained output kept inline as its preview. */
const RETAINED_OUTPUT_PREVIEW_LENGTH = 2_000;

export function shouldRetainCodexCommandOutput(output: string): boolean {
	return output.length > RETAINED_OUTPUT_THRESHOLD;
}

/**
 * Result content for a command whose complete output is retained: a bounded
 * preview, and the non-PTY terminal `resource` that serves the rest.
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
