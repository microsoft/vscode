/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NewLine } from '../../linesCodec/tokens/newLine.js';
import { FrontMatterSequence } from '../tokens/frontMatterSequence.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../../simpleCodec/parserBase.js';

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - rename to 'unknown sequence'?
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

		// TODO: @legomushroom
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
	 * TODO: @legomushroom
	 */
	public asSequenceToken(): FrontMatterSequence {
		this.isConsumed = true;

		return new FrontMatterSequence(this.currentTokens);
	}
}
