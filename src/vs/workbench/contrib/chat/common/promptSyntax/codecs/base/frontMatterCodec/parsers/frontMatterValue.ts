/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { type PartialFrontMatterArray } from './frontMatterArray.js';
import { type PartialFrontMatterString } from './frontMatterString.js';
import { asBoolean, FrontMatterBoolean } from '../tokens/frontMatterBoolean.js';
import { FrontMatterValueToken } from '../tokens/frontMatterToken.js';
import { PartialFrontMatterSequence } from './frontMatterSequence.js';
import { FrontMatterSequence } from '../tokens/frontMatterSequence.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';
import { Word, Quote, DoubleQuote, LeftBracket } from '../../simpleCodec/tokens/tokens.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../../simpleCodec/parserBase.js';
import { type FrontMatterParserFactory } from './frontMatterParserFactory.js';

/**
 * List of tokens that can start a "value" sequence.
 *
 * - {@link Word} - can be a `boolean` value
 * - {@link Quote}, {@link DoubleQuote} - can start a `string` value
 * - {@link LeftBracket} - can start an `array` value
 */
export const VALID_VALUE_START_TOKENS = Object.freeze([
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
	private currentValueParser?: PartialFrontMatterString | PartialFrontMatterArray | PartialFrontMatterSequence;

	/**
	 * Get the tokens that were accumulated so far.
	 */
	public override get tokens(): readonly TSimpleDecoderToken[] {
		if (this.currentValueParser === undefined) {
			return [];
		}

		return this.currentValueParser.tokens;
	}

	constructor(
		private readonly factory: FrontMatterParserFactory,
		/**
		 * Callback function to pass to the {@link PartialFrontMatterSequence}
		 * if the current "value" sequence is not of a specific type.
		 */
		private readonly shouldStop: (token: BaseToken) => boolean,
	) {
		super();
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
			this.currentValueParser = this.factory.createString(token);

			return {
				result: 'success',
				nextParser: this,
				wasTokenConsumed: true,
			};
		}

		// if the first token represents a `[` character, try to parse an array value
		if (token instanceof LeftBracket) {
			this.currentValueParser = this.factory.createArray(token);

			return {
				result: 'success',
				nextParser: this,
				wasTokenConsumed: true,
			};
		}

		// if the first token represents a `word` try to parse a boolean
		const maybeBoolean = FrontMatterBoolean.tryFromToken(token);
		if (maybeBoolean !== null) {
			this.isConsumed = true;

			return {
				result: 'success',
				nextParser: maybeBoolean,
				wasTokenConsumed: true,
			};
		}

		// in all other cases, collect all the subsequent tokens into
		// a generic sequence of tokens until stopped by the `this.shouldStop`
		// callback or the call to the 'this.asSequenceToken' method
		this.currentValueParser = this.factory.createSequence(this.shouldStop);

		return this.accept(token);
	}

	/**
	 * Check if provided token can be a start of a "value" sequence.
	 * See {@link VALID_VALUE_START_TOKENS} for the list of valid tokens.
	 */
	public static isValueStartToken(
		token: BaseToken,
	): token is TValueStartToken | Word<'true' | 'false'> {
		for (const ValidToken of VALID_VALUE_START_TOKENS) {
			if (token instanceof ValidToken) {
				return true;
			}
		}

		if ((token instanceof Word) && (asBoolean(token) !== null)) {
			return true;
		}

		return false;
	}

	/**
	 * Check if the current 'value' sequence does not have a specific type
	 * and is represented by a generic sequence of tokens ({@link PartialFrontMatterSequence}).
	 */
	public get isSequence(): boolean {
		if (this.currentValueParser === undefined) {
			return false;
		}

		return (this.currentValueParser instanceof PartialFrontMatterSequence);
	}

	/**
	 * Convert current parser into a generic sequence of tokens.
	 */
	public asSequenceToken(): FrontMatterSequence {
		this.isConsumed = true;

		return new FrontMatterSequence(this.tokens);
	}
}
