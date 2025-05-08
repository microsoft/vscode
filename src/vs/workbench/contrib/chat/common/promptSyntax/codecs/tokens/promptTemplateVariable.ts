/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptToken } from './promptToken.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { DollarSign } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/dollarSign.js';
import { LeftCurlyBrace, RightCurlyBrace } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/curlyBraces.js';

/**
 * Represents a `${variable}` token in a prompt text.
 */
export class PromptTemplateVariable extends PromptToken {
	constructor(
		range: Range,
		/**
		 * The contents of the template variable, excluding
		 * the surrounding `${}` characters.
		 */
		public readonly contents: string,
	) {
		super(range);
	}

	/**
	 * Get full text of the token.
	 */
	public get text(): string {
		return [
			DollarSign.symbol,
			LeftCurlyBrace.symbol,
			this.contents,
			RightCurlyBrace.symbol,
		].join('');
	}

	/**
	 * Return a string representation of the token.
	 */
	public override toString(): string {
		return `${this.text}${this.range}`;
	}
}
