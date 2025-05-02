/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { FrontMatterValueToken } from './frontMatterToken.js';
import { Quote, DoubleQuote } from '../../simpleCodec/tokens/index.js';

/**
 * Type for any quote token that can be used to wrap a string.
 */
export type TQuoteToken = Quote | DoubleQuote;

/**
 * Token that represents a string value in a Front Matter header.
 */
export class FrontMatterString<TQuote extends TQuoteToken = Quote> extends FrontMatterValueToken<'string'> {
	/**
	 * Name of the `string` value type.
	 */
	public override readonly valueTypeName = 'string';

	constructor(
		public readonly tokens: readonly [TQuote, ...BaseToken[], TQuote],
	) {
		super(BaseToken.fullRange(tokens));
	}

	/**
	 * Text of the string value without the wrapping quotes.
	 */
	public get cleanText(): string {
		return BaseToken.render(
			this.tokens.slice(1, this.tokens.length - 1),
		);
	}

	public override get text(): string {
		return BaseToken.render(this.tokens);
	}

	public override toString(): string {
		return `front-matter-string(${this.shortText()})${this.range}`;
	}
}
