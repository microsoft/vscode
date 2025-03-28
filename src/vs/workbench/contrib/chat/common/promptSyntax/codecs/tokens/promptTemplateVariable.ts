/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptToken } from './promptToken.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { BaseToken } from '../../../../../../../editor/common/codecs/baseToken.js';
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
	 * Check if this token is equal to another one.
	 */
	public override equals<T extends BaseToken>(other: T): boolean {
		if (!super.sameRange(other.range)) {
			return false;
		}

		if ((other instanceof PromptTemplateVariable) === false) {
			return false;
		}

		if (this.text.length !== other.text.length) {
			return false;
		}

		return this.text === other.text;
	}

	/**
	 * Return a string representation of the token.
	 */
	public override toString(): string {
		return `${this.text}${this.range}`;
	}
}
