/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { FrontMatterSequence } from '../tokens/frontMatterSequence.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../../simpleCodec/parserBase.js';

/**
 * Parser responsible for parsing a "generic sequence of tokens"
 * of an arbitrary length in a Front Matter header.
 */
export class PartialFrontMatterSequence extends ParserBase<
	TSimpleDecoderToken,
	PartialFrontMatterSequence | FrontMatterSequence
> {
	constructor(
		/**
		 * Callback function that is called to check if the current token
		 * should stop the parsing process of the current generic "value"
		 * sequence of arbitrary tokens by returning `true`.
		 *
		 * When this happens, the parser *will not consume* the token that
		 * was passed to the `shouldStop` callback or to its `accept` method.
		 * On the other hand, the parser will be "consumed" hence using it
		 * to process other tokens will yield an error.
		 */
		private readonly shouldStop: (token: BaseToken) => boolean,
	) {
		super([]);
	}

	@assertNotConsumed
	public accept(
		token: TSimpleDecoderToken,
	): TAcceptTokenResult<PartialFrontMatterSequence | FrontMatterSequence> {

		// collect all tokens until an end of the sequence is found
		if (this.shouldStop(token)) {
			this.isConsumed = true;

			return {
				result: 'success',
				nextParser: this.asSequenceToken(),
				wasTokenConsumed: false,
			};
		}

		this.currentTokens.push(token);
		return {
			result: 'success',
			nextParser: this,
			wasTokenConsumed: true,
		};
	}

	/**
	 * Add provided tokens to the list of the current parsed tokens.
	 */
	public addTokens(
		tokens: readonly TSimpleDecoderToken[],
	): this {
		this.currentTokens.push(...tokens);

		return this;
	}

	/**
	 * Convert the current parser into a {@link FrontMatterSequence} token.
	 */
	public asSequenceToken(): FrontMatterSequence {
		this.isConsumed = true;

		return new FrontMatterSequence(this.currentTokens);
	}
}
