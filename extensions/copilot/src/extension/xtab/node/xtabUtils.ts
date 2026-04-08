/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { toTextParts } from '../../../platform/chat/common/globalStringUtils';


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
