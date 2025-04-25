/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { FrontMatterValueToken, TValueTypeName } from './frontMatterToken.js';
import { LeftBracket, RightBracket } from '../../simpleCodec/tokens/index.js';

/**
 * Token that represents an `array` value in a Front Matter header.
 */
export class FrontMatterArray extends FrontMatterValueToken<'array'> {
	/**
	 * Name of the `array` value type.
	 */
	public override readonly valueTypeName = 'array';

	constructor(
		/**
		 * List of tokens of the array value. Must start and end
		 * with square brackets, but tokens in the middle hold
		 * only the value tokens, omitting commas and spaces.
		 */
		public readonly tokens: readonly [
			LeftBracket,
			...FrontMatterValueToken<TValueTypeName>[],
			RightBracket,
		],
	) {
		super(
			BaseToken.fullRange(tokens),
		);
	}

	/**
	 * List of the array items.
	 */
	public get items(): readonly FrontMatterValueToken<TValueTypeName>[] {
		const result = [];

		for (const token of this.tokens) {
			if (token instanceof FrontMatterValueToken) {
				result.push(token);
			}
		}

		return result;
	}

	public override get text(): string {
		return BaseToken.render(this.tokens);
	}
	public override toString(): string {
		return `front-matter-array(${this.shortText()})${this.range}`;
	}
}
