/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { NewLine } from '../../linesCodec/tokens/newLine.js';
import { FrontMatterString } from '../tokens/frontMatterString.js';
import { assertDefined } from '../../../../../base/common/types.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';
import { CarriageReturn } from '../../linesCodec/tokens/carriageReturn.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../../simpleCodec/parserBase.js';
import { Colon, Word, Dash, Space, Quote, DoubleQuote, Slash, LeftParenthesis, RightParenthesis, LeftAngleBracket, RightAngleBracket } from '../../simpleCodec/tokens/index.js';
import { FrontMatterToken } from '../tokens/frontMatterToken.js';
import { FrontMatterBoolean } from '../tokens/frontMatterBoolean.js';
import { TFrontMatterValue } from '../tokens/frontMatterArray.js';

/**
 * TODO: @legomushroom
 */
const VALID_NAME_TOKENS = [
	Word, Dash, Space,
];

// /**
//  * TODO: @legomushroom
//  */
// const VALID_STRING_START_TOKENS = [
// 	Word, Dash, Space, Quote, DoubleQuote,
// 	Slash, LeftParenthesis, RightParenthesis, LeftAngleBracket, RightAngleBracket,
// ];

/**
 * TODO: @legomushroom
 */
type TNameToken = Word | Dash | Space;

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - add `QuestionMark`?
// TODO: @legomushroom - add `Hash` (comment)?
type TStartToken = Word | Dash | Space | Quote | DoubleQuote | Slash | LeftParenthesis | RightParenthesis | LeftAngleBracket | RightAngleBracket;

/**
 * TODO: @legomushroom
 */
export class PartialFrontMatterRecordName extends ParserBase<TNameToken, PartialFrontMatterRecordName | PartialFrontMatterRecord> {
	/**
	 * TODO: @legomushroom
	 */
	private get startToken(): TStartToken | null {
		if (this.currentTokens.length === 0) {
			return null;
		}

		const firstToken = this.currentTokens[0];
		assertDefined(
			firstToken,
			'First token must be defined.',
		);

		return firstToken;
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialFrontMatterRecordName | PartialFrontMatterRecord> {
		// iterate until the first non-space token is found
		if (this.startToken === null) {
			if (token instanceof Space) {
				return {
					result: 'success',
					nextParser: this,
					wasTokenConsumed: false,
				};
			}

			// TODO: @legomushroom - check for a valid name start
			this.currentTokens.push(token);

			return {
				result: 'success',
				nextParser: this,
				wasTokenConsumed: true,
			};
		}

		const previousToken = this.currentTokens[this.currentTokens.length - 1];

		if ((token instanceof Space) && (previousToken instanceof Colon)) {
			const recordDelimiter = new FrontMatterRecordDelimiter([
				previousToken,
				token,
			]);

			const recordName = new FrontMatterRecordName(
				// remove the trailing colon (previous token)
				this.currentTokens.slice(0, this.currentTokens.length - 1),
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
class FrontMatterRecordName extends FrontMatterToken {
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
class FrontMatterRecord extends FrontMatterToken {
	constructor(
		public readonly tokens: readonly [FrontMatterRecordName, FrontMatterRecordDelimiter, TFrontMatterValue],
	) {
		super(
			BaseToken.fullRange(tokens),
		);
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
class FrontMatterRecordDelimiter extends FrontMatterToken {
	constructor(
		public readonly tokens: readonly [Colon, Space],
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
export class PartialFrontMatterRecord extends ParserBase<TNameToken, PartialFrontMatterRecord | FrontMatterRecord> {
	constructor(
		tokens: [FrontMatterRecordName, FrontMatterRecordDelimiter],
	) {
		super(tokens);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialFrontMatterRecord | FrontMatterRecord> {
		throw new Error('TODO: @legomushroom');
	}
}

/**
 * TODO: @legomushroom
 */
export class PartialFrontMatterValue extends ParserBase<TSimpleDecoderToken, PartialFrontMatterValue | TFrontMatterValue> {
	/**
	 * TODO: @legomushroom
	 */
	private get startToken(): TStartToken | null {
		if (this.currentTokens.length === 0) {
			return null;
		}

		const firstToken = this.currentTokens[0];
		assertDefined(
			firstToken,
			'First token must be defined.',
		);

		return firstToken;
	}

	// TODO: @legomushroom
	private isBooleanValue(
		token: Word,
	): boolean | null {
		if (token.text.toLowerCase() === 'true') {
			return true;
		}

		if (token.text.toLowerCase() === 'false') {
			return false;
		}

		return null;
	}

	/**
	 * TODO: @legomushroom
	 */
	private endToken: TSimpleDecoderToken | null = null;

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialFrontMatterValue | TFrontMatterValue> {
		// iterate until the first non-space token is found
		// TODO: @legomushroom - take into account other stop characters
		if (this.startToken === null) {
			if (token instanceof Space) {
				return {
					result: 'success',
					nextParser: this,
					wasTokenConsumed: false,
				};
			}

			this.currentTokens.push(token);
			this.endToken = token;

			return {
				result: 'success',
				nextParser: this,
				wasTokenConsumed: true,
			};
		}

		// TODO: @legomushroom - consider other stop characters too
		if (token instanceof NewLine) {
			this.isConsumed = true;

			// TODO: @legomushroom - do the same for `DoubleQuote` token
			if (this.startToken instanceof Quote) {
				const endToken = this.endToken;

				if (endToken === null) {
					return {
						result: 'failure',
						wasTokenConsumed: false,
					};
				}

				if ((endToken instanceof Quote) === false) {
					return {
						result: 'failure',
						wasTokenConsumed: false,
					};
				}

				// collect all tokens between the start and end token
				const stringTokens = [];
				for (const currentToken of this.currentTokens) {
					if (currentToken === this.startToken) {
						continue;
					}

					if (currentToken === endToken) {
						break;
					}

					stringTokens.push(currentToken);
				}

				return {
					result: 'success',
					nextParser: new FrontMatterString([
						this.startToken,
						...stringTokens,
						endToken,
					]),
					wasTokenConsumed: false,
				};
			}

			// sanity check to ensure we don't compare `null` to `null` below
			assertDefined(
				this.startToken,
				'Start token must be defined.',
			);

			const maybeBooleanValue = this.isBooleanValue(this.startToken);
			if ((this.startToken === this.endToken) && (maybeBooleanValue !== null)) {
				return {
					result: 'success',
					nextParser: new FrontMatterBoolean(
						BaseToken.fullRange(this.currentTokens),
						maybeBooleanValue,
					),
					wasTokenConsumed: true,
				};
			}

			// TODO: @legomushroom - try to parse out an `array`

			return {
				result: 'failure',
				wasTokenConsumed: false, // TODO: @legomushroom - mark the token as consumed?`
			};
		}

		this.currentTokens.push(token);

		// TODO: @legomushroom - consider other stop characters
		if (((token instanceof Space) === false) && ((token instanceof CarriageReturn) === false)) {
			this.endToken = token;
		}

		return {
			result: 'success',
			nextParser: this,
			wasTokenConsumed: true,
		};
	}
}
