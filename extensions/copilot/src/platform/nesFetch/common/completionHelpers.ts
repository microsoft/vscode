/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableEmitter, AsyncIterableObject } from '../../../util/vs/base/common/async';
import { assertType } from '../../../util/vs/base/common/types';
import { Completion } from './completionsAPI';


namespace LineOfText {
	export type LineOfText = string & { _brand: 'LineOfText' };

	export function make(s: string) {
		return s as LineOfText;
	}
}

/**
 * Split an incoming stream of text to a stream of lines.
 */
export function streamLines(completions: AsyncIterable<Completion>, initialBuffer = ''): AsyncIterableObject<{
	line: LineOfText.LineOfText;
	finishReason: Completion.FinishReason | null;
}> {

	async function splitLines(emitter: AsyncIterableEmitter<{
		line: LineOfText.LineOfText;
		finishReason: Completion.FinishReason | null;
	}>) {

		let buffer = initialBuffer;
		let finishReason: Completion.FinishReason | null = null;

		for await (const completion of completions) {

			const choice = completion.choices.at(0);
			assertType(choice !== undefined, 'we should have choices[0] to be defined');

			buffer += choice.text ?? '';
			finishReason = choice.finish_reason;

			do {
				const newlineIndex = buffer.indexOf('\n');
				if (newlineIndex === -1) {
					break;
				}

				// take the first line
				const line = buffer.substring(0, newlineIndex);
				buffer = buffer.substring(newlineIndex + 1);

				emitter.emitOne({ line: LineOfText.make(line), finishReason });
			} while (true);
		}

		if (buffer.length > 0) {
			// last line which doesn't end with \n
			emitter.emitOne({ line: LineOfText.make(buffer), finishReason });
		}
	}

	return new AsyncIterableObject(splitLines);
}
