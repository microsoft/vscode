/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { PartialFrontMatterArray } from './frontMatterArray.js';
import { PartialFrontMatterString } from './frontMatterString.js';
import { FrontMatterBoolean } from '../tokens/frontMatterBoolean.js';
import { FrontMatterValueToken } from '../tokens/frontMatterToken.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';
import { Word, Quote, DoubleQuote, LeftBracket } from '../../simpleCodec/tokens/index.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../../simpleCodec/parserBase.js';

/**
 * List of tokens that can start a "value" sequence.
 *
 * - {@link Word} - can be a `boolean` value
 * - {@link Quote}, {@link DoubleQuote} - can start a `string` value
 * - {@link LeftBracket} - can start an `array` value
 */
export const VALID_VALUE_START_TOKENS = Object.freeze([
	Word,
	Quote,
	DoubleQuote,
	LeftBracket,
]);

/**
 * Type alias for a token that can start a "value" sequence.
 */
type TValueStartToken = InstanceType<typeof VALID_VALUE_START_TOKENS[number]>;

/**
 * Parser responsible for parsing a "value" sequence in a Front Matter header.
 */
export class PartialFrontMatterValue extends ParserBase<TSimpleDecoderToken, PartialFrontMatterValue | FrontMatterValueToken> {
	/**
	 * Current parser reference responsible for parsing
	 * a specific "value" sequence.
	 */
	private currentValueParser?: PartialFrontMatterString | PartialFrontMatterArray;

	/**
	 * Get the tokens that were accumulated so far.
	 */
	public override get tokens(): readonly TSimpleDecoderToken[] {
		if (this.currentValueParser === undefined) {
			return [];
		}

		return this.currentValueParser.tokens;
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialFrontMatterValue | FrontMatterValueToken> {
		if (this.currentValueParser !== undefined) {
			const acceptResult = this.currentValueParser.accept(token);
			const { result, wasTokenConsumed } = acceptResult;

			// current value parser is consumed with its child value parser
			this.isConsumed = this.currentValueParser.consumed;

			if (result === 'success') {
				const { nextParser } = acceptResult;

				if (nextParser instanceof FrontMatterValueToken) {
					return {
						result: 'success',
						nextParser,
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

			return {
				result: 'failure',
				wasTokenConsumed,
			};
		}

		// if the first token represents a `quote` character, try to parse a string value
		if ((token instanceof Quote) || (token instanceof DoubleQuote)) {
			this.currentValueParser = new PartialFrontMatterString(token);

			return {
				result: 'success',
				nextParser: this,
				wasTokenConsumed: true,
			};
		}

		// if the first token represents a `[` character, try to parse an array value
		if (token instanceof LeftBracket) {
			this.currentValueParser = new PartialFrontMatterArray(token);

			return {
				result: 'success',
				nextParser: this,
				wasTokenConsumed: true,
			};
		}

		// if the first token represents a `word` try to parse a boolean
		if (token instanceof Word) {
			// in either success or failure case, the parser is consumed
			this.isConsumed = true;

			try {
				return {
					result: 'success',
					nextParser: FrontMatterBoolean.fromToken(token),
					wasTokenConsumed: true,
				};
			} catch (_error) {
				return {
					result: 'failure',
					wasTokenConsumed: false,
				};
			}
		}

		// in all other cases fail due to unexpected value sequence
		this.isConsumed = true;
		return {
			result: 'failure',
			wasTokenConsumed: false,
		};
	}

	/**
	 * Check if provided token can be a start of a "value" sequence.
	 * See {@link VALID_VALUE_START_TOKENS} for the list of valid tokens.
	 */
	public static isValueStartToken(
		token: BaseToken,
	): token is TValueStartToken {
		for (const ValidToken of VALID_VALUE_START_TOKENS) {
			if (token instanceof ValidToken) {
				return true;
			}
		}

		return false;
	}
}
