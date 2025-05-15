/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FrontMatterValueToken } from './frontMatterToken.js';
import { Word, SpacingToken } from '../../simpleCodec/tokens/index.js';
import { type TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';

/**
 * Token represents a generic sequence of tokens in a Front Matter header.
 */
export class FrontMatterSequence extends FrontMatterValueToken<string, readonly TSimpleDecoderToken[]> {
	/**
	 * @override Because this token represent a generic sequence of tokens,
	 *           the type name is represented by the sequence of tokens itself
	 */
	public override get valueTypeName(): this {
		return this;
	}

	public override toString(): string {
		return this.text;
	}

	/**
	 * TODO: @legomushroom
	 */
	// TODO: @legomushroom - cache the result?
	// TODO: @legomushroom - unit test?
	public trimEnd(): readonly SpacingToken[] {
		const trimmedTokens = [];

		let index = this.childTokens.length - 1;
		while (index >= 0) {
			const token = this.childTokens[index];

			if (token instanceof SpacingToken) {
				trimmedTokens.push(token);
				index--;

				continue;
			}

			break;
		}

		// TODO: @legomushroom
		this.childTokens.length = index + 1;
		if (this.childTokens.length === 0) {
			this.collapseRangeToStart();
			// TODO: @legomushroom - add description
			this.childTokens.push(
				new Word(this.range, ''),
			);
		}

		// TODO: @legomushroom
		this.withRange(
			BaseToken.fullRange(this.childTokens),
		);

		// TODO: @legomushroom
		return trimmedTokens.reverse();
	}

	public override toString(): string {
		return `front-matter-sequence(${this.shortText()})${this.range}`;
	}
}
