/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { FrontMatterValueToken } from './frontMatterToken.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';

/**
 * Token represents a generic sequence of tokens in a Front Matter header.
 */
export class FrontMatterSequence extends FrontMatterValueToken<string> {
	/**
	 * @override Because this token represent a generic sequence of tokens,
	 * the type name is represented by the text of sequence itself.
	 */
	public override get valueTypeName(): string {
		return this.text;
	}

	constructor(
		public override readonly tokens: readonly TSimpleDecoderToken[],
	) {
		super(BaseToken.fullRange(tokens));
	}

	public override toString(): string {
		return `front-matter-sequence(${this.shortText()})${this.range}`;
	}
}
