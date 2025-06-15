/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type TSimpleDecoderToken } from '../../../simpleCodec/simpleDecoder.js';
import { FrontMatterRecordName, type TRecordNameToken } from '../../tokens/index.js';
import { Colon, Word, Dash, SpacingToken } from '../../../simpleCodec/tokens/tokens.js';
import { type PartialFrontMatterRecordNameWithDelimiter } from './frontMatterRecordNameWithDelimiter.js';
import { assertNotConsumed, ParserBase, type TAcceptTokenResult } from '../../../simpleCodec/parserBase.js';
import { type FrontMatterParserFactory } from '../frontMatterParserFactory.js';

/**
 * Tokens that can be used inside a record name.
 */
const VALID_NAME_TOKENS = [Word, Dash];

/**
 * Type of a next parser that can be returned by {@link PartialFrontMatterRecordName}.
 */
type TNextParser = PartialFrontMatterRecordName | PartialFrontMatterRecordNameWithDelimiter;

/**
 * Parser for a `name` part of a Front Matter record.
 *
 * E.g., `'name'` in the example below:
 *
 * ```
 * name: 'value'
 * ```
 */
export class PartialFrontMatterRecordName extends ParserBase<TRecordNameToken, TNextParser> {
	constructor(
		private readonly factory: FrontMatterParserFactory,
		startToken: Word,
	) {
		super([startToken]);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<TNextParser> {
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
		if ((token instanceof Colon) || (token instanceof SpacingToken)) {
			const recordName = new FrontMatterRecordName(this.currentTokens);

			this.isConsumed = true;
			return {
				result: 'success',
				nextParser: this.factory.createRecordNameWithDelimiter([recordName, token]),
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
