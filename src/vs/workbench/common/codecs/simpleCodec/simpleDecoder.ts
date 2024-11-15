/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseDecoder } from '../baseDecoder.js';
import { NewLine } from '../linesCodec/tokens/index.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ReadableStream } from '../../../../base/common/stream.js';
import { Word, Space, Tab, } from '../simpleCodec/tokens/index.js';
import { LinesDecoder, TLineToken } from '../linesCodec/linesDecoder.js';

/**
 * A token type that this decoder can handle.
 */
export type TSimpleToken = Word | Space | Tab | NewLine;

// Note! the `\n` is excluded because this decoder based on lines
// Characters that stop a word sequence.
// 	     hence can't ever receive a line that contains a `newline`.
const STOP_CHARACTERS = [Space.symbol, Tab.symbol];

/**
 * A decoder that can decode a stream of `Line`s into a stream
 * of simple token, - `Word`, `Space`, `Tab`, `NewLine`, etc.
 */
export class SimpleDecoder extends BaseDecoder<TSimpleToken, TLineToken> {
	constructor(
		stream: ReadableStream<VSBuffer>,
	) {
		super(new LinesDecoder(stream));
	}

	protected override onStreamData(token: TLineToken): void {
		// re-emit new lines
		if (token instanceof NewLine) {
			this._onData.fire(token);

			return;
		}

		// loop through the text separating it into `Word` and `Space` tokens
		let i = 0;
		while (i < token.text.length) {
			// index is 0-based, but column numbers are 1-based
			const columnNumber = i + 1;

			// if a space character, emit a `Space` token and continue
			if (token.text[i] === Space.symbol) {
				this._onData.fire(Space.newOnLine(token, columnNumber));

				i++;
				continue;
			}

			// if a tab character, emit a `Tab` token and continue
			if (token.text[i] === Tab.symbol) {
				this._onData.fire(Tab.newOnLine(token, columnNumber));

				i++;
				continue;
			}

			// if a non-space character, parse out the whole word and
			// emit it, then continue from the last word character position
			let word = '';
			while (i < token.text.length && !(STOP_CHARACTERS.includes(token.text[i]))) {
				word += token.text[i];
				i++;
			}

			this._onData.fire(
				Word.newOnLine(word, token, columnNumber),
			);
		}
	}
}
