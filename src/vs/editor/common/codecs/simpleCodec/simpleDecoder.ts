/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Line } from '../linesCodec/tokens/line.js';
import { NewLine } from '../linesCodec/tokens/newLine.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ReadableStream } from '../../../../base/common/stream.js';
import { CarriageReturn } from '../linesCodec/tokens/carriageReturn.js';
import { BaseDecoder } from '../../../../base/common/codecs/baseDecoder.js';
import { LinesDecoder, TLineBreakToken, TLineToken } from '../linesCodec/linesDecoder.js';
import {
	At,
	Tab,
	Word,
	Hash,
	Dash,
	Colon,
	Slash,
	Space,
	Quote,
	Comma,
	FormFeed,
	DollarSign,
	DoubleQuote,
	VerticalTab,
	type TBracket,
	LeftBracket,
	RightBracket,
	type TCurlyBrace,
	LeftCurlyBrace,
	RightCurlyBrace,
	ExclamationMark,
	type TParenthesis,
	LeftParenthesis,
	RightParenthesis,
	type TAngleBracket,
	LeftAngleBracket,
	RightAngleBracket,
} from './tokens/index.js';
import { pick } from '../../../../base/common/arrays.js';
import { ISimpleTokenClass, SimpleToken } from './tokens/simpleToken.js';

/**
 * Type for all simple tokens.
 */
export type TSimpleToken = Space | Tab | VerticalTab | At | Quote | DoubleQuote
	| CarriageReturn | NewLine | FormFeed | TBracket | TAngleBracket | TCurlyBrace
	| TParenthesis | Colon | Hash | Dash | ExclamationMark | Slash | DollarSign | Comma
	| TLineBreakToken;

/**
* Type of tokens emitted by this decoder.
*/
export type TSimpleDecoderToken = TSimpleToken | Word;

/**
 * List of well-known distinct tokens that this decoder emits (excluding
 * the word stop characters defined below). Everything else is considered
 * an arbitrary "text" sequence and is emitted as a single {@link Word} token.
 */
export const WELL_KNOWN_TOKENS: readonly ISimpleTokenClass<TSimpleToken>[] = Object.freeze([
	LeftParenthesis, RightParenthesis, LeftBracket, RightBracket, LeftCurlyBrace, RightCurlyBrace,
	LeftAngleBracket, RightAngleBracket, Space, Tab, VerticalTab, FormFeed, Colon, Hash, Dash,
	ExclamationMark, At, Slash, DollarSign, Quote, DoubleQuote, Comma,
]);

/**
 * A {@link Word} sequence stops when one of the well-known tokens are encountered.
 * Note! the `\r` and `\n` are excluded from the list because this decoder based on
 *       the {@link LinesDecoder} which emits {@link Line} tokens without them.
 */
const WORD_STOP_CHARACTERS: readonly string[] = Object.freeze(
	WELL_KNOWN_TOKENS.map(pick('symbol')),
);

/**
 * A decoder that can decode a stream of `Line`s into a stream
 * of simple token, - `Word`, `Space`, `Tab`, `NewLine`, etc.
 */
export class SimpleDecoder extends BaseDecoder<TSimpleDecoderToken, TLineToken> {
	constructor(
		stream: ReadableStream<VSBuffer>,
	) {
		super(new LinesDecoder(stream));
	}

	protected override onStreamData(line: TLineToken): void {
		// re-emit new line tokens immediately
		if (line instanceof CarriageReturn || line instanceof NewLine) {
			this._onData.fire(line);

			return;
		}

		// loop through the text separating it into `Word` and `well-known` tokens
		const lineText = line.text.split('');
		let i = 0;
		while (i < lineText.length) {
			// index is 0-based, but column numbers are 1-based
			const columnNumber = i + 1;

			// check if the current character is a well-known token
			const tokenConstructor = WELL_KNOWN_TOKENS
				.find((wellKnownToken) => {
					return wellKnownToken.symbol === lineText[i];
				});

			// if it is a well-known token, emit it and continue to the next one
			if (tokenConstructor) {
				this._onData.fire(SimpleToken.newOnLine(line, columnNumber, tokenConstructor));

				i++;
				continue;
			}

			// otherwise, it is an arbitrary "text" sequence of characters,
			// that needs to be collected into a single `Word` token, hence
			// read all the characters until a stop character is encountered
			let word = '';
			while (i < lineText.length && !(WORD_STOP_CHARACTERS.includes(lineText[i]))) {
				word += lineText[i];
				i++;
			}

			// emit a "text" sequence of characters as a single `Word` token
			this._onData.fire(
				Word.newOnLine(word, line, columnNumber),
			);
		}
	}
}
