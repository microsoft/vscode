/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../core/range.js';
import { BaseToken } from '../../baseToken.js';
import { YamlToken } from '../tokens/yamlToken.js';
import { YamlObject } from '../tokens/yamlObject.js';
import { YamlString } from '../tokens/yamlString.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../../simpleCodec/parserBase.js';
import { Colon, Word, Dash, Space, Quote, DoubleQuote, Slash, LeftParenthesis, RightParenthesis, LeftAngleBracket, RightAngleBracket } from '../../simpleCodec/tokens/index.js';

/**
 * TODO: @legomushroom
 */
const VALID_NAME_TOKENS = [
	Word, Dash, Space, Quote, DoubleQuote,
];

/**
 * TODO: @legomushroom
 */
type TNameToken = Word | Dash | Space | Quote | DoubleQuote;

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - add `QuestionMark`?
// TODO: @legomushroom - add `Hash` (comment)?
type TStartToken = Word | Dash | Space | Quote | DoubleQuote | Slash | LeftParenthesis | RightParenthesis | LeftAngleBracket | RightAngleBracket;

/**
 * TODO: @legomushroom
 */
export class PartialYamlString extends ParserBase<TNameToken, PartialYamlString | PartialYamlObject | YamlString> {
	constructor(
		private readonly indentation: readonly Space[],
		startToken: TStartToken | null,
	) {
		const tokens = (startToken === null)
			? []
			: [startToken];

		super(tokens);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialYamlString | PartialYamlObject | YamlString> {
		const previousToken = this.currentTokens[this.currentTokens.length - 1];

		if ((token instanceof Space) && (previousToken instanceof Colon)) {
			const yamlString = YamlString.fromTokens(this.currentTokens);

			this.isConsumed = true;
			return {
				result: 'success',
				nextParser: new PartialYamlObject(
					this.indentation,
					new PartialYamlRecord(
						this.indentation,
						yamlString,
						[previousToken, token],
					),
				),
				wasTokenConsumed: true,
			};
		}

		for (const validToken of VALID_NAME_TOKENS) {
			if (token instanceof validToken) {
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

	public onStreamEnd(): TAcceptTokenResult<PartialYamlString | PartialYamlObject | YamlString> {

	}
}

// /**
//  * TODO: @legomushroom
//  */
// export class PartialYamlArray extends ParserBase<TSimpleDecoderToken | YamlRecordName, PartialYamlArray | YamlArray> {
// 	constructor(tokens: [YamlRecordName, Colon]) {
// 		super(tokens);
// 	}

// 	@assertNotConsumed
// 	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialYamlArray | YamlArray> {
// 		// // if received `>` while current token sequence ends with `--`,
// 		// // then this is the end of the comment sequence
// 		// if (token instanceof RightAngleBracket && this.endsWithDashes) {
// 		// 	this.currentTokens.push(token);

// 		// 	return {
// 		// 		result: 'success',
// 		// 		nextParser: this.asMarkdownComment(),
// 		// 		wasTokenConsumed: true,
// 		// 	};
// 		// }

// 		// this.currentTokens.push(token);

// 		// return {
// 		// 	result: 'success',
// 		// 	nextParser: this,
// 		// 	wasTokenConsumed: true,
// 		// };

// 		throw new Error('TODO: @legomushroom');
// 	}
// }

/**
 * TODO: @legomushroom
 */
export class YamlRecord extends YamlToken {
	constructor(
		range: Range,
		public readonly name: YamlString,
		private readonly delimiter: readonly [Colon, Space],
		public readonly value: YamlString | YamlObject,
	) {
		super(range);
	}


	public override get text(): string {
		throw new Error('TODO: @legomushroom');
	}
	public override toString(): string {
		throw new Error('TODO: @legomushroom');
	}
}

/**
 * TODO: @legomushroom
 */
export class PartialYamlRecord extends ParserBase<TSimpleDecoderToken, PartialYamlRecord | YamlRecord> {
	/**
	 * TODO: @legomushroom
	 */
	private valueParser: PartialYamlString | PartialYamlObject;

	constructor(
		private readonly indentation: readonly Space[],
		private readonly recordName: YamlString,
		private readonly delimiter: readonly [Colon, Space],
	) {
		super([recordName, ...delimiter]);

		this.valueParser = new PartialYamlString(this.indentation, null);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialYamlRecord | YamlRecord> {
		const acceptResult = this.valueParser.accept(token);
		const { result, wasTokenConsumed } = acceptResult;

		if (result === 'success') {
			if ((acceptResult.nextParser instanceof YamlString) || (acceptResult.nextParser instanceof YamlObject)) {
				const yamlRecord = new YamlRecord(
					BaseToken.fullRange([this.recordName, acceptResult.nextParser]),
					this.recordName,
					this.delimiter,
					acceptResult.nextParser,
				);

				return {
					result: 'success',
					nextParser: yamlRecord,
					wasTokenConsumed,
				};
			}

			this.valueParser = acceptResult.nextParser;
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
}


/**
 * TODO: @legomushroom
 */
export class PartialYamlObject extends ParserBase<YamlRecord, PartialYamlObject | YamlObject> {
	constructor(
		private readonly indentation: readonly Space[],
		private currentRecord: PartialYamlRecord,
	) {
		super([]);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialYamlObject | YamlObject> {
		const acceptResult = this.currentRecord.accept(token);
		const { result, wasTokenConsumed } = acceptResult;

		if (result === 'success') {
			if (acceptResult.nextParser instanceof YamlRecord) {
				this.currentTokens.push(acceptResult.nextParser);

				// TODO: @legomushroom - continue to parse the next record?

				return {
					result: 'success',
					nextParser: this,
					wasTokenConsumed,
				};
			}

			this.currentRecord = acceptResult.nextParser;

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
}
