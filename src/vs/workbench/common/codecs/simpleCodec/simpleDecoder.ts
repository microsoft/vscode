/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseDecoder } from '../baseDecoder.js';
import { Line } from '../linesCodec/tokens/line.js';
import { ReadableStream } from '../../../../base/common/stream.js';
import { Word, Space, NewLine } from '../simpleCodec/tokens/index.js';

/**
 * A token type that this decoder can handle.
 */
export type TSimpleToken = Word | Space | NewLine;

/**
 * A decoder that can decode a stream of `Line`s into a stream
 * of `Word`, `Space` and `NewLine` tokens.
 */
export class SimpleTokensCodecDecoder extends BaseDecoder<TSimpleToken, Line> implements ReadableStream<TSimpleToken> {
	private lastEmittedToken?: TSimpleToken;

	/**
	 * TODO: @legomushroom
	 */
	protected override onStreamData(line: Line): void {
		// if an empty line is received, emit a `NewLine` token
		// TODO: @legomushroom - we should do this for non-empty lines too
		if (line.text === '') {
			const newLine = new NewLine(line.range);
			this._onData.fire(newLine);
			this.lastEmittedToken = newLine;
			return;
		}

		// split the line by spaces and emit the `Word` and `Space` tokens
		const tokens = line.text.split(' ');
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			const maybeNextToken = tokens[i + 1];

			// Get end column number of the last emitted token, if any.
			const endColumn = this.lastEmittedToken
				? this.lastEmittedToken.range.endColumn
				: 1;

			// calculate the token to emit to the output stream
			const tokenToEmit: TSimpleToken = token === ''
				// if the token is empty, emit a `Space` token
				// because we've split the original string by ` `(space)
				? Space.newOnLine(line, endColumn)
				// token does contain some text, so emit a `Word` token
				: Word.newOnLine(token, line, endColumn);

			this.emitToken(tokenToEmit);

			// if there is a next token that is not space(empty), also emit
			// a `Space` token, because all words are separated by spaces
			if (maybeNextToken) {
				const space = Space.newOnLine(
					line,
					tokenToEmit.range.endColumn,
				);
				this.emitToken(space);
			}
		}
	}

	// Emit specified token to the output stream and
	// update the `lastEmittedToken` reference.
	private emitToken(token: TSimpleToken): void {
		this._onData.fire(token);
		this.lastEmittedToken = token;
	}
}
