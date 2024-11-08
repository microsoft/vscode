/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseDecoder } from '../baseDecoder.js';
import { Line } from '../linesCodec/tokens/line.js';
import { ReadableStream } from '../../../../base/common/stream.js';
import { Word, Space, Tab, NewLine } from '../simpleCodec/tokens/index.js';

/**
 * A token type that this decoder can handle.
 */
export type TSimpleToken = Word | Space | Tab | NewLine;

/**
 * A decoder that can decode a stream of `Line`s into
 * a stream of `Word`, `Space`, `Tab`, `NewLine` tokens, etc.
 */
export class SimpleDecoder extends BaseDecoder<TSimpleToken, Line> implements ReadableStream<TSimpleToken> {
	// Reference to a previously received line. This is used
	// to emit a `NewLine` token when a new line is received.
	private previousLine?: Line;

	protected override onStreamData(line: Line): void {
		// if not a first line received, emit a `NewLine` token
		// as if it appeared at the end of the previous line
		if (this.previousLine) {
			const newLine = NewLine.newOnLine(
				this.previousLine,
				this.previousLine.range.endColumn,
			);
			this._onData.fire(newLine);
		}
		this.previousLine = line;

		// loop through the text separating it into `Word` and `Space` tokens
		let i = 0;
		while (i < line.text.length) {
			// index is 0-based, but column numbers are 1-based
			const columnNumber = i + 1;

			// if a space character, emit a `Space` token and continue
			if (line.text[i] === ' ') {
				this._onData.fire(Space.newOnLine(line, columnNumber));

				i++;
				continue;
			}

			// if a tab character, emit a `Tab` token and continue
			if (line.text[i] === '\t') {
				this._onData.fire(Tab.newOnLine(line, columnNumber));

				i++;
				continue;
			}

			// if a non-space character, parse out the whole word and
			// emit it, then continue from the last word character position
			let word = '';
			while (i < line.text.length && line.text[i] !== ' ') {
				word += line.text[i];
				i++;
			}

			this._onData.fire(
				Word.newOnLine(word, line, columnNumber),
			);
		}
	}
}
