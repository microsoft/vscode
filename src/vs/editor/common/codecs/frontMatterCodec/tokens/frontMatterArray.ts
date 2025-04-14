/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { FrontMatterValueToken } from './frontMatterToken.js';
import { LeftBracket, RightBracket } from '../../simpleCodec/tokens/index.js';

/**
 * Token that represents an `array` value in a Front Matter header.
 */
export class FrontMatterArray extends FrontMatterValueToken {
	constructor(
		/**
		 * List of tokens of the array value. Must start and end
		 * with square brackets, but tokens in the middle hold
		 * only the value tokens, omitting commas and spaces.
		 */
		public readonly tokens: readonly [
			LeftBracket,
			...FrontMatterValueToken[],
			RightBracket,
		],
	) {
		super(
			BaseToken.fullRange(tokens),
		);
	}

	public override get text(): string {
		return BaseToken.render(this.tokens);
	}
	public override toString(): string {
		return `front-matter-array(${this.shortText()})${this.range}`;
	}
}
