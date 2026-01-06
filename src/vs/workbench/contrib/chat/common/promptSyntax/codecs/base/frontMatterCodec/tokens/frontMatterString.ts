/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { FrontMatterValueToken } from './frontMatterToken.js';
import { Quote, DoubleQuote } from '../../simpleCodec/tokens/tokens.js';

/**
 * Type for any quote token that can be used to wrap a string.
 */
export type TQuoteToken = Quote | DoubleQuote;

/**
 * Token that represents a string value in a Front Matter header.
 */
export class FrontMatterString<TQuote extends TQuoteToken = Quote> extends FrontMatterValueToken<
	'quoted-string',
	readonly [TQuote, ...BaseToken[], TQuote]
> {
	/**
	 * Name of the `string` value type.
	 */
	public override readonly valueTypeName = 'quoted-string';

	/**
	 * Text of the string value without the wrapping quotes.
	 */
	public get cleanText(): string {
		return BaseToken.render(
			this.children.slice(1, this.children.length - 1),
		);
	}

	public override toString(): string {
		return `front-matter-string(${this.shortText()})${this.range}`;
	}
}
