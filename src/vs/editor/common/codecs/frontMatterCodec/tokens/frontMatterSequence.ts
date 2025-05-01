/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { FrontMatterValueToken } from './frontMatterToken.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - unit test that extends 'FrontMatterValueToken'?
export class FrontMatterSequence extends FrontMatterValueToken<string> {
	/**
	 * TODO: @legomushroom
	 */
	public override get valueTypeName(): string {
		return this.text;
	}

	constructor(
		// TODO: @legomushroom - exclude new lines?
		public readonly tokens: readonly TSimpleDecoderToken[],
	) {
		super(BaseToken.fullRange(tokens));
	}

	public override get text(): string {
		return BaseToken.render(this.tokens);
	}

	public override toString(): string {
		return `front-matter-sequence(${this.shortText()})${this.range}`;
	}
}
