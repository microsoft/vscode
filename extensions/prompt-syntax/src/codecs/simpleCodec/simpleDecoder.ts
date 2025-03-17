/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseDecoder } from '../baseDecoder';
import { NewLine, CarriageReturn } from '../linesCodec/tokens';
import { VSBuffer, type ReadableStream } from '../../utils/vscode';
import { LinesDecoder, TLineToken } from '../linesCodec/linesDecoder';
import {
	Hash, Dash, Colon, FormFeed, Tab, Word, VerticalTab, Space, ExclamationMark,
	LeftAngleBracket, RightAngleBracket, TAngleBracket, LeftParenthesis, RightParenthesis, TParenthesis,
	LeftBracket, RightBracket, TBracket,
} from './tokens';

/**
 * A token type that this decoder can handle.
 */
export type TSimpleToken = Word | Space | Tab | VerticalTab | NewLine | FormFeed
	| CarriageReturn | TBracket | TAngleBracket | TParenthesis
	| Colon | Hash | Dash | ExclamationMark;

/**
 * List of well-known distinct tokens that this decoder emits (excluding
 * the word stop characters defined below). Everything else is considered
 * an arbitrary "text" sequence and is emitted as a single `Word` token.
 */
const WELL_KNOWN_TOKENS = Object.freeze([
	Space, Tab, VerticalTab, FormFeed,
	LeftBracket, RightBracket, LeftAngleBracket, RightAngleBracket,
	LeftParenthesis, RightParenthesis, Colon, Hash, Dash, ExclamationMark,
]);

/**
 * Characters that stop a "word" sequence.
 * Note! the `\r` and `\n` are excluded from the list because this decoder based on `LinesDecoder` which
 * 	     already handles the `carriagereturn`/`newline` cases and emits lines that don't contain them.
 */
const WORD_STOP_CHARACTERS: readonly string[] = Object.freeze([
	Space.symbol, Tab.symbol, VerticalTab.symbol, FormFeed.symbol,
	LeftBracket.symbol, RightBracket.symbol, LeftAngleBracket.symbol, RightAngleBracket.symbol,
	LeftParenthesis.symbol, RightParenthesis.symbol,
	Colon.symbol, Hash.symbol, Dash.symbol, ExclamationMark.symbol,
]);

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
		// re-emit new line tokens immediately
		if (token instanceof CarriageReturn || token instanceof NewLine) {
			this._onData.fire(token);

			return;
		}

		// loop through the text separating it into `Word` and `Space` tokens
		let i = 0;
		while (i < token.text.length) {
			// index is 0-based, but column numbers are 1-based
			const columnNumber = i + 1;

			// check if the current character is a well-known token
			const tokenConstructor = WELL_KNOWN_TOKENS
				.find((wellKnownToken) => {
					return wellKnownToken.symbol === token.text[i];
				});

			// if it is a well-known token, emit it and continue to the next one
			if (tokenConstructor) {
				this._onData.fire(tokenConstructor.newOnLine(token, columnNumber));

				i++;
				continue;
			}

			// otherwise, it is an arbitrary "text" sequence of characters,
			// that needs to be collected into a single `Word` token, hence
			// read all the characters until a stop character is encountered
			let word = '';
			while (i < token.text.length && !(WORD_STOP_CHARACTERS.includes(token.text[i]))) {
				word += token.text[i];
				i++;
			}

			// emit a "text" sequence of characters as a single `Word` token
			this._onData.fire(
				Word.newOnLine(word, token, columnNumber),
			);
		}
	}
}
