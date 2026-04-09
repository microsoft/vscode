/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { toTextParts } from '../../../platform/chat/common/globalStringUtils';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';


/**
 * Remove backticks on the first and last lines.
 */
export async function* linesWithBackticksRemoved(linesStream: AsyncIterable<string>): AsyncIterable<string> {
	let lineN = -1;

	let bufferedBacktickLine: string | undefined;

	for await (const line of linesStream) {
		++lineN;

		if (bufferedBacktickLine) {
			yield bufferedBacktickLine;
			bufferedBacktickLine = undefined;
		}

		if (line.match(/^```[a-z]*$/)) {
			if (lineN === 0) {
				continue;
			} else {
				// maybe middle of stream or last line
				// we set it to buffer; if it's midle of stream, it will be emitted
				// if last line, it will be omitted
				bufferedBacktickLine = line;
			}
		} else {
			yield line;
		}
	}

	// ignore bufferedLine
}

export function constructMessages({ systemMsg, userMsg }: { systemMsg: string; userMsg: string }): Raw.ChatMessage[] {
	return [
		{
			role: Raw.ChatRole.System,
			content: toTextParts(systemMsg)
		},
		{
			role: Raw.ChatRole.User,
			content: toTextParts(userMsg)
		}
	] satisfies Raw.ChatMessage[];
}

export function charCount(messages: Raw.ChatMessage[]): number {
	const promptCharCount = messages.reduce((total, msg) => total + msg.content.reduce((subtotal, part) => subtotal + (part.type === Raw.ChatCompletionContentPartKind.Text ? part.text.length : 0), 0), 0);
	return promptCharCount;
}
/**
 * Finds the range of lines containing merge conflict markers within a specified edit window.
 *
 * @param lines - Array of strings representing the lines of text to search through
 * @param editWindowRange - The range within which to search for merge conflict markers
 * @param maxMergeConflictLines - Maximum number of lines to search for conflict markers
 * @returns An OffsetRange object representing the start and end of the conflict markers, or undefined if not found
 */

export function findMergeConflictMarkersRange(lines: string[], editWindowRange: OffsetRange, maxMergeConflictLines: number): OffsetRange | undefined {
	for (let i = editWindowRange.start; i < Math.min(lines.length, editWindowRange.endExclusive); ++i) {
		if (!lines[i].startsWith('<<<<<<<')) {
			continue;
		}

		// found start of merge conflict markers -- now find the end
		for (let j = i + 1; j < lines.length && (j - i) < maxMergeConflictLines; ++j) {
			if (lines[j].startsWith('>>>>>>>')) {
				return new OffsetRange(i, j + 1 /* because endExclusive */);
			}
		}
	}
	return undefined;
}
