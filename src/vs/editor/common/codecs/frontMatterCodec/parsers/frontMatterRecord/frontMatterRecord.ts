/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../../baseToken.js';
import { NewLine } from '../../../linesCodec/tokens/newLine.js';
import { PartialFrontMatterValue } from '../frontMatterValue.js';
import { assertNever } from '../../../../../../base/common/assert.js';
import { assertDefined } from '../../../../../../base/common/types.js';
import { PartialFrontMatterSequence } from '../frontMatterSequence.js';
import { CarriageReturn } from '../../../linesCodec/tokens/carriageReturn.js';
import { type TSimpleDecoderToken } from '../../../simpleCodec/simpleDecoder.js';
import { Word, FormFeed, EmptySpaceToken } from '../../../simpleCodec/tokens/index.js';
import { assertNotConsumed, ParserBase, type TAcceptTokenResult } from '../../../simpleCodec/parserBase.js';
import { FrontMatterValueToken, FrontMatterRecordName, FrontMatterRecordDelimiter, FrontMatterRecord } from '../../tokens/index.js';

/**
 * TODO: @legomushroom
 */
type TNextParser = PartialFrontMatterRecord | FrontMatterRecord;

/**
 * Parser for a `record` inside a Front Matter header.
 *
 *  * E.g., `name: 'value'` in the example below:
 *
 * ```
 * ---
 * name: 'value'
 * isExample: true
 * ---
 * ```
 */
export class PartialFrontMatterRecord extends ParserBase<TSimpleDecoderToken, TNextParser> {
	/**
	 * Token that represents the 'name' part of the record.
	 */
	private readonly recordNameToken: FrontMatterRecordName;

	/**
	 * Token that represents the 'delimiter' part of the record.
	 */
	private readonly recordDelimiterToken: FrontMatterRecordDelimiter;

	constructor(
		tokens: [FrontMatterRecordName, FrontMatterRecordDelimiter],
	) {
		super(tokens);
		this.recordNameToken = tokens[0];
		this.recordDelimiterToken = tokens[1];
	}

	/**
	 * Current parser reference responsible for parsing the "value" part of the record.
	 */
	private currentValueParser?: PartialFrontMatterValue | PartialFrontMatterSequence;

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<TNextParser> {
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

				this.isConsumed = true;
				try {
					return {
						result: 'success',
						nextParser: new FrontMatterRecord([
							this.recordNameToken,
							this.recordDelimiterToken,
							nextParser,
						]),
						wasTokenConsumed,
					};
				} catch (_error) {
					return {
						result: 'failure',
						wasTokenConsumed,
					};
				}
			}

			this.currentValueParser = nextParser;
			return {
				result: 'success',
				nextParser: this,
				wasTokenConsumed,
			};
		}

		// iterate until the first non-space token is found
		if (token instanceof EmptySpaceToken) {
			this.currentTokens.push(token);

			return {
				result: 'success',
				nextParser: this,
				wasTokenConsumed: true,
			};
		}

		// if token can start a "value" sequence, parse the value
		if (PartialFrontMatterValue.isValueStartToken(token)) {
			this.currentValueParser = new PartialFrontMatterValue(shouldEndTokenSequence);

			return this.accept(token);
		}

		// in all other cases, collect all the subsequent tokens into
		// a "sequence of tokens" until a new line is found
		this.currentValueParser = new PartialFrontMatterSequence(
			shouldEndTokenSequence,
		);

		// if we reached this "generic sequence" parser point, and the current token
		// is already of a type that stops the sequence, we must have accumulated
		// some space tokens already, so pass those to the parser and end the sequence
		if (shouldEndTokenSequence(token)) {
			const spaceTokens = this.currentTokens.slice(this.startTokensCount);

			// TODO: @legomushroom - fix this - use trimEnd?

			// if no space tokens accumulated at all, create an "empty" one
			if (spaceTokens.length === 0) {
				spaceTokens.push(
					Word.newOnLine(
						'',
						token.range.startLineNumber,
						token.range.startColumn,
					),
				);
			}

			this.currentValueParser.addTokens(spaceTokens);

			return {
				result: 'success',
				nextParser: this.asRecordToken(),
				wasTokenConsumed: false,
			};
		}

		return this.accept(token);
	}

	/**
	 * Convert current parser into a {@link FrontMatterRecord} token.
	 *
	 * @throws if no current parser is present, or it is not of the {@link PartialFrontMatterValue}
	 *         or {@link PartialFrontMatterSequence} types
	 */
	public asRecordToken(): FrontMatterRecord {
		assertDefined(
			this.currentValueParser,
			'Current value parser must be defined.'
		);

		if (
			(this.currentValueParser instanceof PartialFrontMatterValue)
			|| (this.currentValueParser instanceof PartialFrontMatterSequence)
		) {
			const valueToken = this.currentValueParser.asSequenceToken();
			this.currentTokens.push(valueToken);

			this.isConsumed = true;
			return new FrontMatterRecord([
				this.recordNameToken,
				this.recordDelimiterToken,
				valueToken,
			]);
		}

		assertNever(
			this.currentValueParser,
			`Unexpected value parser '${this.currentValueParser}'.`,
		);
	}
}

/**
 * Callback to check if a current token should end a
 * record value that is a generic sequence of tokens.
 */
const shouldEndTokenSequence = (
	token: BaseToken,
): token is (NewLine | CarriageReturn | FormFeed) => {
	return (
		(token instanceof NewLine)
		|| (token instanceof CarriageReturn)
		|| (token instanceof FormFeed)
	);
};
