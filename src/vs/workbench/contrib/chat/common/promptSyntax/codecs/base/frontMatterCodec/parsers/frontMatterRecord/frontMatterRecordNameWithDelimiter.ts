/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../../../../../../../../base/common/assert.js';
import { type PartialFrontMatterRecord } from './frontMatterRecord.js';
import { Colon, SpacingToken } from '../../../simpleCodec/tokens/tokens.js';
import { type TSimpleDecoderToken } from '../../../simpleCodec/simpleDecoder.js';
import { FrontMatterRecordName, FrontMatterRecordDelimiter } from '../../tokens/index.js';
import { assertNotConsumed, ParserBase, type TAcceptTokenResult } from '../../../simpleCodec/parserBase.js';
import { type FrontMatterParserFactory } from '../frontMatterParserFactory.js';

/**
 * Type for tokens that stop a front matter record name sequence.
 */
export type TNameStopToken = Colon | SpacingToken;

/**
 * Type for the next parser that can be returned by {@link PartialFrontMatterRecordNameWithDelimiter}.
 */
type TNextParser = PartialFrontMatterRecordNameWithDelimiter | PartialFrontMatterRecord;

/**
 * Parser for a record `name` with the `: ` delimiter.
 *
 *  * E.g., `name:` in the example below:
 *
 * ```
 * name: 'value'
 * ```
 */
export class PartialFrontMatterRecordNameWithDelimiter extends ParserBase<
	FrontMatterRecordName | TNameStopToken,
	TNextParser
> {
	constructor(
		private readonly factory: FrontMatterParserFactory,
		tokens: readonly [FrontMatterRecordName, TNameStopToken],
	) {
		super([...tokens]);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<TNextParser> {
		const previousToken = this.currentTokens[this.currentTokens.length - 1];
		const isSpacingToken = (token instanceof SpacingToken);

		// delimiter must always be a `:` followed by a "space" character
		// once we encounter that sequence, we can transition to the next parser
		if (isSpacingToken && (previousToken instanceof Colon)) {
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
				nextParser: this.factory.createRecord(
					[recordName, recordDelimiter],
				),
				wasTokenConsumed: true,
			};
		}

		// allow some spacing before the colon delimiter
		if (token instanceof SpacingToken) {
			this.currentTokens.push(token);

			return {
				result: 'success',
				nextParser: this,
				wasTokenConsumed: true,
			};
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
