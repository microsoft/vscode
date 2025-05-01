/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VALID_SPACE_TOKENS } from '../constants.js';
import { assert } from '../../../../../base/common/assert.js';
import { PartialFrontMatterValue } from './frontMatterValue.js';
import { FrontMatterArray } from '../tokens/frontMatterArray.js';
import { assertDefined } from '../../../../../base/common/types.js';
import { FrontMatterValueToken } from '../tokens/frontMatterToken.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';
import { Comma, LeftBracket, RightBracket } from '../../simpleCodec/tokens/index.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../../simpleCodec/parserBase.js';

/**
 * List of tokens that can go in-between array items
 * and array brackets.
 */
const VALID_DELIMITER_TOKENS = Object.freeze([
	...VALID_SPACE_TOKENS,
	Comma,
]);

/**
 * Responsible for parsing an array syntax (or "inline sequence"
 * in YAML terms), e.g. `[1, '2', true, 2.54]`
*/
// TODO: @legomushroom - parse "sequence" item values too
export class PartialFrontMatterArray extends ParserBase<TSimpleDecoderToken, PartialFrontMatterArray | FrontMatterArray> {
	/**
	 * Current parser reference responsible for parsing an array "value".
	 */
	private currentValueParser?: PartialFrontMatterValue;

	/**
	 * Whether an array item is allowed in the current position
	 * of the token sequence. E.g., items are allowed after
	 * a command or a open bracket, but not immediately after
	 * another item in the array.
	 */
	private arrayItemAllowed = true;

	constructor(
		private readonly startToken: LeftBracket,
	) {
		super([startToken]);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialFrontMatterArray | FrontMatterArray> {
		// TODO: @legomushroom
		const isRightBracket = (token instanceof RightBracket);
		const isComma = (token instanceof Comma);
		if ((isRightBracket || isComma) && this.currentValueParser && (this.currentValueParser instanceof PartialFrontMatterValue) && (this.currentValueParser.isSequence)) {
			this.currentTokens.push(
				// TODO: @legomushroom - trim spaces at the end?
				this.currentValueParser.asSequenceToken(),
			);

			delete this.currentValueParser;
		}

		if (this.currentValueParser !== undefined) {
			const acceptResult = this.currentValueParser.accept(token);
			const { result, wasTokenConsumed } = acceptResult;

			if (result === 'failure') {
				this.isConsumed = true;

				return {
					result: 'failure',
					wasTokenConsumed,
				};
			}

			const { nextParser } = acceptResult;

			if (nextParser instanceof FrontMatterValueToken) {
				this.currentTokens.push(nextParser);
				delete this.currentValueParser;

				return {
					result: 'success',
					nextParser: this,
					wasTokenConsumed,
				};
			}

			this.currentValueParser = nextParser;
			return {
				result: 'success',
				nextParser: this,
				wasTokenConsumed,
			};
		}

		if (isRightBracket) {
			// sanity check in case this block moves around
			// to a different place in the code
			assert(
				this.currentValueParser === undefined,
				`Unexpected end of array. Last value is not finished.`,
			);

			this.currentTokens.push(token);

			this.isConsumed = true;
			return {
				result: 'success',
				nextParser: this.asArrayToken(),
				wasTokenConsumed: true,
			};
		}

		// iterate until a valid value start token is found
		for (const ValidToken of VALID_DELIMITER_TOKENS) {
			if (token instanceof ValidToken) {
				this.currentTokens.push(token);

				if ((this.arrayItemAllowed === false) && token instanceof Comma) {
					this.arrayItemAllowed = true;
				}

				return {
					result: 'success',
					nextParser: this,
					wasTokenConsumed: true,
				};
			}
		}

		// once we found a valid start value token, create a new value parser
		if ((this.arrayItemAllowed === true) && PartialFrontMatterValue.isValueStartToken(token)) {
			this.currentValueParser = new PartialFrontMatterValue();
			this.arrayItemAllowed = false;

			return this.accept(token);
		}

		// in all other cases fail because of the unexpected token type
		this.isConsumed = true;
		return {
			result: 'failure',
			wasTokenConsumed: false,
		};
	}

	/**
	 * Convert current parser into a {@link FrontMatterArray} token,
	 * if possible.
	 *
	 * @throws if the last token in the accumulated token list
	 * 		   is not a closing bracket ({@link RightBracket}).
	 */
	public asArrayToken(): FrontMatterArray {
		this.isConsumed = true;
		const endToken = this.currentTokens[this.currentTokens.length - 1];

		assertDefined(
			endToken,
			`No tokens found.`,
		);

		assert(
			endToken instanceof RightBracket,
			'Cannot find a closing bracket of the array.',
		);

		const valueTokens: FrontMatterValueToken[] = [];
		for (const currentToken of this.currentTokens) {
			if (currentToken instanceof FrontMatterValueToken) {
				valueTokens.push(currentToken);
			}
		}

		return new FrontMatterArray([
			this.startToken,
			...valueTokens,
			endToken,
		]);
	}
}
