/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { assert } from '../../../../../base/common/assert.js';
import { PartialFrontMatterValue } from './frontMatterValue.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';
import { Colon, Word, Dash, Space, Tab } from '../../simpleCodec/tokens/index.js';
import { FrontMatterToken, FrontMatterValueToken } from '../tokens/frontMatterToken.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../../simpleCodec/parserBase.js';

/**
 * TODO: @legomushroom
 */
type TNameToken = Word | Dash;

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - any other tokens allowed?
const VALID_NON_VALUE_TOKENS = [
	Space, Tab,
];

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - any other tokens allowed?
const VALID_NAME_TOKENS = [
	Word, Dash,
];

/**
 * TODO: @legomushroom
 */
export class PartialFrontMatterRecordName extends ParserBase<TNameToken, PartialFrontMatterRecordName | PartialFrontMatterRecordNameWithDelimiter> {
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

		if ((token instanceof Space) || (token instanceof Tab) || (token instanceof Colon)) {
			const recordName = new FrontMatterRecordName(this.currentTokens);

			this.isConsumed = true;
			return {
				result: 'success',
				nextParser: new PartialFrontMatterRecordNameWithDelimiter([recordName, token]),
				wasTokenConsumed: true,
			};
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
 * TODO: @legomushroom
 */
export class PartialFrontMatterRecordNameWithDelimiter extends ParserBase<FrontMatterRecordName | Space | Tab | Colon, PartialFrontMatterRecordNameWithDelimiter | PartialFrontMatterRecord> {
	constructor(
		tokens: readonly [FrontMatterRecordName, Space | Tab | Colon],
	) {
		super([...tokens]);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialFrontMatterRecordNameWithDelimiter | PartialFrontMatterRecord> {
		const previousToken = this.currentTokens[this.currentTokens.length - 1];

		const isSpacingToken = (token instanceof Space) || (token instanceof Tab);

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
		for (const ValidToken of VALID_NON_VALUE_TOKENS) {
			if (token instanceof ValidToken) {
				this.currentTokens.push(token);

				return {
					result: 'success',
					nextParser: this,
					wasTokenConsumed: true,
				};
			}
		}

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
 * TODO: @legomushroom
 */
export class FrontMatterRecordName extends FrontMatterToken {
	constructor(
		public readonly tokens: readonly TNameToken[],
	) {
		super(BaseToken.fullRange(tokens));
	}

	public override get text(): string {
		return BaseToken.render(this.tokens);
	}

	public override toString(): string {
		return `front-matter-record-name(${this.shortText()})${this.range}`;
	}
}

/**
 * TODO: @legomushroom
 */
export class FrontMatterRecord extends FrontMatterToken {
	constructor(
		public readonly tokens: readonly [FrontMatterRecordName, FrontMatterRecordDelimiter, FrontMatterValueToken],
	) {
		super(
			BaseToken.fullRange(tokens),
		);
	}

	/**
	 * TODO: @legomushroom
	 */
	public static fromTokens(
		tokens: readonly FrontMatterToken[],
	): FrontMatterRecord {
		assert(
			tokens.length === 3,
			`A front matter record must consist of exactly 3 tokens, got '${tokens.length}'.`,
		);

		const token1 = tokens[0];
		const token2 = tokens[1];
		const token3 = tokens[2];

		assert(
			token1 instanceof FrontMatterRecordName,
			`Token #1 must be a front matter record name, got '${token1}'.`,
		);
		assert(
			token2 instanceof FrontMatterRecordDelimiter,
			`Token #2 must be a front matter record delimiter, got '${token2}'.`,
		);
		assert(
			token3 instanceof FrontMatterValueToken,
			`Token #3 must be a front matter value, got '${token3}'.`,
		);

		return new FrontMatterRecord([
			token1, token2, token3,
		]);
	}

	public override get text(): string {
		return BaseToken.render(this.tokens);
	}
	public override toString(): string {
		return `front-matter-record(${this.shortText()})${this.range}`;
	}
}

/**
 * TODO: @legomushroom
 */
export class FrontMatterRecordDelimiter extends FrontMatterToken {
	constructor(
		public readonly tokens: readonly [Colon, Space | Tab],
	) {
		super(
			BaseToken.fullRange(tokens),
		);
	}

	public override get text(): string {
		return BaseToken.render(this.tokens);
	}

	public override toString(): string {
		return `front-matter-delimiter(${this.shortText()})${this.range}`;
	}
}

/**
 * TODO: @legomushroom
 */
export class PartialFrontMatterRecord extends ParserBase<TSimpleDecoderToken, PartialFrontMatterRecord | FrontMatterRecord> {
	constructor(
		tokens: [FrontMatterRecordName, FrontMatterRecordDelimiter],
	) {
		super(tokens);
	}

	/**
	 * TODO: @legomushroom
	 */
	private currentValueParser?: PartialFrontMatterValue;

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

				this.isConsumed = true;
				try {
					return {
						result: 'success',
						nextParser: FrontMatterRecord.fromTokens([
							this.currentTokens[0],
							this.currentTokens[1],
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
		for (const ValidToken of VALID_NON_VALUE_TOKENS) {
			if (token instanceof ValidToken) {
				this.currentTokens.push(token);

				return {
					result: 'success',
					nextParser: this,
					wasTokenConsumed: true,
				};
			}
		}

		if (PartialFrontMatterValue.isValueStartToken(token)) {
			this.currentValueParser = new PartialFrontMatterValue();

			return this.accept(token);
		}

		// otherwise fail due to the unexpected token type for a record value
		this.isConsumed = true;
		return {
			result: 'failure',
			wasTokenConsumed: false,
		};
	}
}
