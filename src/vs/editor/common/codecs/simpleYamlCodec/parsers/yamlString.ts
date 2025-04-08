/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { YamlString } from '../tokens/yamlString.js';
import { PartialYamlObject, PartialYamlRecord } from './yamlObject.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../../simpleCodec/parserBase.js';
import { Colon, Word, Dash, Space, Quote, DoubleQuote, Slash, LeftParenthesis, RightParenthesis, LeftAngleBracket, RightAngleBracket } from '../../simpleCodec/tokens/index.js';

/**
 * TODO: @legomushroom
 */
const VALID_NAME_TOKENS = [
	Word, Dash, Space, Quote, DoubleQuote,
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

	/**
	 * TODO: @legomushroom
	 */
	private get startToken(): TStartToken | null {
		return this.currentTokens[0] || null;
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialYamlString | PartialYamlObject | YamlString> {
		// iterate until the first non-space token is found
		// TODO: @legomushroom - account for possible indentation sequence
		if (this.startToken === null) {
			if (token instanceof Space) {
				return {
					result: 'success',
					nextParser: this,
					wasTokenConsumed: false,
				};
			}

			// TODO: @legomushroom - check for a valid token start (`VALID_STRING_START_TOKENS`)
			this.currentTokens.push(token);

			return {
				result: 'success',
				nextParser: this,
				wasTokenConsumed: true,
			};
		}

		// TODO: @legomushroom
		// if (this.startToken instanceof DoubleQuote) {
		// 	this.currentTokens.push(token);

		// 	if (token instanceof DoubleQuote) {
		// 		this.isConsumed = true;

		// 		return {
		// 			result: 'success',
		// 			nextParser: YamlString.fromTokens(this.currentTokens),
		// 			wasTokenConsumed: true,
		// 		};
		// 	}

		// 	return {
		// 		result: 'success',
		// 		nextParser: this,
		// 		wasTokenConsumed: true,
		// 	};
		// }

		const previousToken = this.currentTokens[this.currentTokens.length - 1];

		if ((token instanceof Space) && (previousToken instanceof Colon)) {
			const yamlString = YamlString.fromTokens([
				...this.currentTokens.slice(0, this.currentTokens.length - 1),
			]);

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

		if (token instanceof Colon) {
			this.currentTokens.push(token);

			return {
				result: 'success',
				nextParser: this,
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

	/**
	 * Converts current parser to a `YamlString` instance.
	 *
	 * @throws if conversion is not possible.
	 */
	public asYamlString(): YamlString {
		this.isConsumed = true;

		return YamlString.fromTokens(this.currentTokens);
	}
}
