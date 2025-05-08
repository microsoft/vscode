/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../../../base/common/assert.js';
import { SimpleToken } from '../../simpleCodec/tokens/index.js';
import { assertDefined } from '../../../../../base/common/types.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';
import { FrontMatterString, TQuoteToken } from '../tokens/frontMatterString.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../../simpleCodec/parserBase.js';

/**
 * Parser responsible for parsing a string value.
 */
export class PartialFrontMatterString extends ParserBase<TSimpleDecoderToken, PartialFrontMatterString | FrontMatterString<TQuoteToken>> {
	constructor(
		private readonly startToken: TQuoteToken,
	) {
		super([startToken]);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialFrontMatterString | FrontMatterString<TQuoteToken>> {
		this.currentTokens.push(token);

		// iterate until a `matching end quote` is found
		if ((token instanceof SimpleToken) && (this.startToken.sameType(token))) {
			return {
				result: 'success',
				nextParser: this.asStringToken(),
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
	 * Convert the current parser into a {@link FrontMatterString} token,
	 * if possible.
	 *
	 * @throws if the first and last tokens are not quote tokens of the same type.
	 */
	public asStringToken(): FrontMatterString<TQuoteToken> {
		const endToken = this.currentTokens[this.currentTokens.length - 1];

		assertDefined(
			endToken,
			`No matching end token found.`,
		);

		assert(
			this.startToken.sameType(endToken),
			`String starts with \`${this.startToken.text}\`, but ends with \`${endToken.text}\`.`,
		);

		return new FrontMatterString([
			this.startToken,
			...this.currentTokens
				.slice(1, this.currentTokens.length - 1),
			endToken,
		]);
	}
}
