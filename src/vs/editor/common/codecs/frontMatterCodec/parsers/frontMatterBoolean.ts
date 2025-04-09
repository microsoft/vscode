/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NewLine } from '../../linesCodec/tokens/newLine.js';
import { assert } from '../../../../../base/common/assert.js';
import { assertDefined } from '../../../../../base/common/types.js';
import { FormFeed, Space, Tab, VerticalTab, Word } from '../../simpleCodec/tokens/index.js';
import { FrontMatterBoolean } from '../tokens/frontMatterBoolean.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';
import { CarriageReturn } from '../../linesCodec/tokens/carriageReturn.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../../simpleCodec/parserBase.js';

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - any other tokens allowed?
const EMPTY_TOKENS = [
	Space, Tab, CarriageReturn, NewLine, VerticalTab, FormFeed,
];

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - remove
export class PartialFrontMatterBoolean extends ParserBase<TSimpleDecoderToken, PartialFrontMatterBoolean | FrontMatterBoolean> {
	/**
	 * TODO: @legomushroom - throws
	 */
	constructor(
		private readonly startToken: Word,
	) {

		assert(
			isBooleanWord(startToken),
			`Expected a word that can be converted to a boolean, got '${startToken.text}'.`,
		);

		super([startToken]);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialFrontMatterBoolean | FrontMatterBoolean> {
		// the initial boolean word can be followed only by an "empty" token
		for (const EmptyToken of EMPTY_TOKENS) {
			if (token instanceof EmptyToken) {
				this.isConsumed = true;

				return {
					result: 'success',
					nextParser: this.asBooleanToken(),
					wasTokenConsumed: false,
				};
			}
		}

		return {
			result: 'failure',
			wasTokenConsumed: false,
		};
	}

	/**
	 * TODO: @legomushroom
	 */
	public asBooleanToken(): FrontMatterBoolean {
		const value = asBoolean(this.startToken);
		assertDefined(
			value,
			`Expected a word that can be converted to a boolean, got '${this.startToken}'.`,
		);

		return new FrontMatterBoolean(
			this.startToken.range,
			value,
		);
	}
}

/**
 * TODO: @legomushroom
 */
const asBoolean = (
	token: Word,
): boolean | null => {
	if (token.text.toLowerCase() === 'true') {
		return true;
	}

	if (token.text.toLowerCase() === 'false') {
		return false;
	}

	return null;
};

/**
 * TODO: @legomushroom
 */
const isBooleanWord = (
	token: Word,
): boolean => {
	const result = asBoolean(token);

	return (result !== null);
};
