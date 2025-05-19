/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { NewLine } from '../../linesCodec/tokens/newLine.js';
import { PartialFrontMatterValue } from './frontMatterValue.js';
import { assertDefined } from '../../../../../base/common/types.js';
import { PartialFrontMatterSequence } from './frontMatterSequence.js';
import { assert, assertNever } from '../../../../../base/common/assert.js';
import { CarriageReturn } from '../../linesCodec/tokens/carriageReturn.js';
import { type TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../../simpleCodec/parserBase.js';
import { Colon, Word, Dash, Space, Tab, FormFeed, VerticalTab } from '../../simpleCodec/tokens/index.js';
import { FrontMatterValueToken, FrontMatterRecordName, type TRecordNameToken, type TRecordSpaceToken, FrontMatterRecordDelimiter, FrontMatterRecord } from '../tokens/index.js';

/**
 * Tokens that can be used inside a record name.
 */
const VALID_NAME_TOKENS = [
	Word, Dash,
];

/**
 * List of a "space" tokens that are allowed in between
 * record name, delimiter and value tokens inside a record.
 *
 * E.g. the following is a valid record with `\t` used as a "space" token:
 *
 * ```
 * \t\tname\t\t:\t\t'value'\t\t\n
 * ```
 */
const VALID_SPACE_TOKENS = [
	Space, Tab, VerticalTab,
];

/**
 * List of tokens that terminate a record name.
 */
const VALID_NAME_STOP_TOKENS = [
	...VALID_SPACE_TOKENS,
	Colon,
];

/**
 * Parser for a `name` part of a Front Matter record.
 *
 * E.g., `'name'` in the example below:
 *
 * ```
 * name: 'value'
 * ```
 */
export class PartialFrontMatterRecordName extends ParserBase<TRecordNameToken, PartialFrontMatterRecordName | PartialFrontMatterRecordNameWithDelimiter> {
	constructor(
		startToken: Word,
	) {
		super([startToken]);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialFrontMatterRecordName | PartialFrontMatterRecordNameWithDelimiter> {
		for (const ValidToken of VALID_NAME_TOKENS) {
			if (token instanceof ValidToken) {
				this.currentTokens.push(token);

				return {
					result: 'success',
					nextParser: this,
					wasTokenConsumed: true,
				};
			}
		}

		// once name is followed by a "space" token or a "colon", we have the full
		// record name hence can transition to the next parser
		for (const SpaceOrDelimiterToken of VALID_NAME_STOP_TOKENS) {
			if (token instanceof SpaceOrDelimiterToken) {
				const recordName = new FrontMatterRecordName(this.currentTokens);

				this.isConsumed = true;
				return {
					result: 'success',
					nextParser: new PartialFrontMatterRecordNameWithDelimiter([recordName, token]),
					wasTokenConsumed: true,
				};
			}
		}

		// in all other cases fail due to the unexpected token type for a record name
		this.isConsumed = true;
		return {
			result: 'failure',
			wasTokenConsumed: false,
		};
	}
}

/**
 * Parser for a record `name` with the `: ` delimiter.
 *
 *  * E.g., `name:` in the example below:
 *
 * ```
 * name: 'value'
 * ```
 */
export class PartialFrontMatterRecordNameWithDelimiter extends ParserBase<FrontMatterRecordName | TRecordSpaceToken | Colon, PartialFrontMatterRecordNameWithDelimiter | PartialFrontMatterRecord> {
	constructor(
		tokens: readonly [FrontMatterRecordName, TRecordSpaceToken | Colon],
	) {
		super([...tokens]);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialFrontMatterRecordNameWithDelimiter | PartialFrontMatterRecord> {
		const previousToken = this.currentTokens[this.currentTokens.length - 1];

		const isSpacingToken = (token instanceof Space) || (token instanceof Tab);

		// delimiter must always be a `:` followed by a "space" character
		// once we encounter that sequence, we can transition to the next parser
		if ((isSpacingToken === true) && (previousToken instanceof Colon)) {
			const recordDelimiter = new FrontMatterRecordDelimiter([
				previousToken,
				token,
			]);

			const recordName = this.currentTokens[0];

			// sanity check
			assert(
				recordName instanceof FrontMatterRecordName,
				`Expected a front matter record name, got '${recordName}'.`,
			);

			this.isConsumed = true;
			return {
				result: 'success',
				nextParser: new PartialFrontMatterRecord(
					[recordName, recordDelimiter],
				),
				wasTokenConsumed: true,
			};
		}

		// allow some spacing before the colon delimiter
		for (const ValidToken of VALID_SPACE_TOKENS) {
			if (token instanceof ValidToken) {
				this.currentTokens.push(token);

				return {
					result: 'success',
					nextParser: this,
					wasTokenConsumed: true,
				};
			}
		}

		// include the colon delimiter
		if (token instanceof Colon) {
			this.currentTokens.push(token);

			return {
				result: 'success',
				nextParser: this,
				wasTokenConsumed: true,
			};
		}

		// otherwise fail due to the unexpected token type between
		// record name and record name delimiter tokens
		this.isConsumed = true;
		return {
			result: 'failure',
			wasTokenConsumed: false,
		};
	}
}

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
export class PartialFrontMatterRecord extends ParserBase<TSimpleDecoderToken, PartialFrontMatterRecord | FrontMatterRecord> {
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
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialFrontMatterRecord | FrontMatterRecord> {
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

				// sanity checks on the original tokens the parser was created with
				assert(
					this.currentTokens[0] instanceof FrontMatterRecordName,
					`Expected a front matter record name, got '${this.currentTokens[0]}'.`,
				);
				assert(
					this.currentTokens[1] instanceof FrontMatterRecordDelimiter,
					`Expected a front matter record delimiter, got '${this.currentTokens[1]}'.`,
				);

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

		// iterate until the first "value" token is found
		for (const ValidToken of VALID_SPACE_TOKENS) {
			if (token instanceof ValidToken) {
				this.currentTokens.push(token);

				return {
					result: 'success',
					nextParser: this,
					wasTokenConsumed: true,
				};
			}
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
