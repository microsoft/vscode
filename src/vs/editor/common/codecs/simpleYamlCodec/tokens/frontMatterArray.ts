/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { FrontMatterString } from './frontMatterString.js';
import { FrontMatterBoolean } from './frontMatterBoolean.js';
import { FrontMatterValueToken } from './frontMatterToken.js';
import { LeftBracket, RightBracket } from '../../simpleCodec/tokens/index.js';

/**
 * TODO: @legomushroom
 */
export type TFrontMatterValue = FrontMatterString | FrontMatterBoolean | FrontMatterArray;

/**
 * TODO: @legomushroom
 */
export class FrontMatterArray extends FrontMatterValueToken {
	constructor(
		// TODO: @legomushroom - add `Comma`?
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
