/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../../baseToken.js';
import { NewLine } from '../../../linesCodec/tokens/newLine.js';
import { PartialFrontMatterValue } from '../frontMatterValue.js';
import { assertNever } from '../../../../../../../../../../base/common/assert.js';
import { assertDefined } from '../../../../../../../../../../base/common/types.js';
import { PartialFrontMatterSequence } from '../frontMatterSequence.js';
import { CarriageReturn } from '../../../linesCodec/tokens/carriageReturn.js';
import { type TSimpleDecoderToken } from '../../../simpleCodec/simpleDecoder.js';
import { Word, FormFeed, SpacingToken } from '../../../simpleCodec/tokens/tokens.js';
import { assertNotConsumed, ParserBase, type TAcceptTokenResult } from '../../../simpleCodec/parserBase.js';
import { FrontMatterValueToken, FrontMatterRecordName, FrontMatterRecordDelimiter, FrontMatterRecord } from '../../tokens/index.js';
import { type FrontMatterParserFactory } from '../frontMatterParserFactory.js';

/**
 * Type of a next parser that can be returned by {@link PartialFrontMatterRecord}.
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
		private readonly factory: FrontMatterParserFactory,
		tokens: [FrontMatterRecordName, FrontMatterRecordDelimiter],
	) {
		super(tokens);
		this.recordNameToken = tokens[0];
		this.recordDelimiterToken = tokens[1];
	}

	/**
	 * Current parser reference responsible for parsing the "value" part of the record.
	 */
	private valueParser?: PartialFrontMatterValue | PartialFrontMatterSequence;

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<TNextParser> {
		if (this.valueParser !== undefined) {
			const acceptResult = this.valueParser.accept(token);
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
				delete this.valueParser;

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

			this.valueParser = nextParser;
			return {
				result: 'success',
				nextParser: this,
				wasTokenConsumed,
			};
		}

		// iterate until the first non-space token is found
		if (token instanceof SpacingToken) {
			this.currentTokens.push(token);

			return {
				result: 'success',
				nextParser: this,
				wasTokenConsumed: true,
			};
		}

		// if token can start a "value" sequence, parse the value
		if (PartialFrontMatterValue.isValueStartToken(token)) {
			this.valueParser = this.factory.createValue(shouldEndTokenSequence);

			return this.accept(token);
		}

		// in all other cases, collect all the subsequent tokens into
		// a "sequence of tokens" until a new line is found
		this.valueParser = this.factory.createSequence(
			shouldEndTokenSequence,
		);

		// if we reached this "generic sequence" parser point, but the current token is
		// already of a type that stops such sequence, we must have accumulated some
		// spacing tokens, hence pass those to the parser and end the sequence immediately
		if (shouldEndTokenSequence(token)) {
			const spaceTokens = this.currentTokens
				.slice(this.startTokensCount);

			// if no space tokens accumulated at all, create an "empty" one this is needed
			// to ensure that the parser always has at least one token hence it can have
			// a valid range and can be interpreted as a real "value" token of the record
			if (spaceTokens.length === 0) {
				spaceTokens.push(
					Word.newOnLine(
						'',
						token.range.startLineNumber,
						token.range.startColumn,
					),
				);
			}

			this.valueParser.addTokens(spaceTokens);

			return {
				result: 'success',
				nextParser: this.asRecordToken(),
				wasTokenConsumed: false,
			};
		}

		// otherwise use the "generic sequence" parser moving on
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
			this.valueParser,
			'Current value parser must be defined.'
		);

		if (
			(this.valueParser instanceof PartialFrontMatterValue)
			|| (this.valueParser instanceof PartialFrontMatterSequence)
		) {
			const valueToken = this.valueParser.asSequenceToken();
			this.currentTokens.push(valueToken);

			this.isConsumed = true;
			return new FrontMatterRecord([
				this.recordNameToken,
				this.recordDelimiterToken,
				valueToken,
			]);
		}

		assertNever(
			this.valueParser,
			`Unexpected value parser '${this.valueParser}'.`,
		);
	}
}

/**
 * Callback to check if a current token should end a
 * record value that is a generic sequence of tokens.
 */
function shouldEndTokenSequence(token: BaseToken): token is (NewLine | CarriageReturn | FormFeed) {
	return (
		(token instanceof NewLine)
		|| (token instanceof CarriageReturn)
		|| (token instanceof FormFeed)
	);
}
