/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { Quote, DoubleQuote } from '../../simpleCodec/tokens/index.js';
import { FrontMatterValueToken } from './frontMatterToken.js';

/**
 * TODO: @legomushroom
 */
export type TQuoteToken = Quote | DoubleQuote;

/**
 * TODO: @legomushroom
 */
export class FrontMatterString<TQuote extends TQuoteToken = Quote> extends FrontMatterValueToken {
	constructor(
		public readonly tokens: readonly [TQuote, ...BaseToken[], TQuote],
	) {
		// TODO: @legomushroom - validate that the tokens in the middle don't have a quote?
		super(BaseToken.fullRange(tokens));
	}

	public override get text(): string {
		return BaseToken.render(this.tokens);
	}

	public override toString(): string {
		return `front-matter-string(${this.shortText()})${this.range}`;
	}
}
