/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { FrontMatterValueToken } from './frontMatterToken.js';
import { Word, SpacingToken } from '../../simpleCodec/tokens/tokens.js';
import { type TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';


/**
 * Token represents a generic sequence of tokens in a Front Matter header.
 */
export class FrontMatterSequence extends FrontMatterValueToken<FrontMatterSequence, readonly TSimpleDecoderToken[]> {
	/**
	 * @override Because this token represent a generic sequence of tokens,
	 *           the type name is represented by the sequence of tokens itself
	 */
	public override get valueTypeName(): this {
		return this;
	}

	/**
	 * Text of the sequence value. The method exists to provide a
	 * consistent interface with {@link FrontMatterString} token.
	 *
	 * Note! that this method does not automatically trim spacing tokens
	 *       in the sequence. If you need to get a trimmed value, call
	 *       {@link trimEnd} method first.
	 */
	public get cleanText(): string {
		return this.text;
	}

	/**
	 * Trim spacing tokens at the end of the sequence.
	 */
	public trimEnd(): readonly SpacingToken[] {
		const trimmedTokens = [];

		// iterate the tokens list from the end to the start, collecting
		// all the spacing tokens we encounter until we reach a non-spacing token
		let lastNonSpace = this.childTokens.length - 1;
		while (lastNonSpace >= 0) {
			const token = this.childTokens[lastNonSpace];

			if (token instanceof SpacingToken) {
				trimmedTokens.push(token);
				lastNonSpace--;

				continue;
			}

			break;
		}
		this.childTokens.length = lastNonSpace + 1;

		// if there are only spacing tokens were present add a single
		// empty token to the sequence, so it has something to work with
		if (this.childTokens.length === 0) {
			this.collapseRangeToStart();
			this.childTokens.push(new Word(this.range, ''));
		}

		// update the current range to reflect the current trimmed value
		this.withRange(
			BaseToken.fullRange(this.childTokens),
		);

		// trimmed tokens are collected starting from the end,
		// moving to the start, hence reverse them before returning
		return trimmedTokens.reverse();
	}

	public override toString(): string {
		return `front-matter-sequence(${this.shortText()})${this.range}`;
	}
}
