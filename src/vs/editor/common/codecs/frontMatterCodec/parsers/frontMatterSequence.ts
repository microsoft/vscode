/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NewLine } from '../../linesCodec/tokens/newLine.js';
import { FrontMatterSequence } from '../tokens/frontMatterSequence.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../../simpleCodec/parserBase.js';

/**
 * Parser responsible for parsing a generic sequence of
 * tokens of an arbitrary length in a Front Matter header.
 */
export class PartialFrontMatterSequence extends ParserBase<
	TSimpleDecoderToken,
	PartialFrontMatterSequence | FrontMatterSequence
> {
	constructor(
		startToken: TSimpleDecoderToken,
	) {
		super([startToken]);
	}

	@assertNotConsumed
	public accept(
		token: TSimpleDecoderToken,
	): TAcceptTokenResult<PartialFrontMatterSequence | FrontMatterSequence> {
		this.currentTokens.push(token);

		// collect all tokens until a new line is found which
		// indicates the end of the generic tokens sequence
		// TODO: @legomushroom - don't consume the last token?
		// TODO: @legomushroom - accept a token type that stops the sequence instead?
		if (token instanceof NewLine) {
			this.isConsumed = true;

			return {
				result: 'success',
				nextParser: this.asSequenceToken(),
				wasTokenConsumed: true,
			};
		}

		return {
			result: 'success',
			nextParser: this,
			wasTokenConsumed: true,
		};
	}

	/**
	 * Convert the current parser into a {@link FrontMatterSequence} token.
	 */
	public asSequenceToken(): FrontMatterSequence {
		this.isConsumed = true;

		return new FrontMatterSequence(this.currentTokens);
	}
}
