/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ToolResultContentType, type ToolResultContent } from '../../common/state/sessionState.js';
import { SHELL_COMMAND_MAX_OUTPUT_BYTES } from '../shared/shellCommandExecution.js';

const RETAINED_OUTPUT_PREVIEW_MAX_LINES = 3;
const RETAINED_OUTPUT_PREVIEW_MAX_LINE_LENGTH = 80;

/**
 * Codex reports a command's complete output, so it stays inline unless it is
 * longer than the {@link SHELL_COMMAND_MAX_OUTPUT_BYTES} characters of shell
 * output the agent host surfaces in a transcript.
 */
export function shouldRetainCodexCommandOutput(output: string): boolean {
	return output.length > SHELL_COMMAND_MAX_OUTPUT_BYTES;
}

/**
 * Result content for a command whose complete output is retained: the beginning
 * of the output as its preview, and the non-PTY terminal `resource` that serves
 * the rest.
 */
export function codexRetainedCommandOutputContent(resource: string, output: string, exitCode: number | null): ToolResultContent[] {
	const preview = firstOutputLinesPreview(output);
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

function firstOutputLinesPreview(output: string): string {
	const candidates = output.split(/\r?\n/, RETAINED_OUTPUT_PREVIEW_MAX_LINES + 1);
	let shortened = candidates.length > RETAINED_OUTPUT_PREVIEW_MAX_LINES;
	const lines = candidates.slice(0, RETAINED_OUTPUT_PREVIEW_MAX_LINES).map(line => {
		if (line.length <= RETAINED_OUTPUT_PREVIEW_MAX_LINE_LENGTH) {
			return line;
		}
		shortened = true;
		return `${line.slice(0, RETAINED_OUTPUT_PREVIEW_MAX_LINE_LENGTH)}…`;
	});
	if (shortened) {
		lines.push('…');
	}
	return lines.join('\n');
}
