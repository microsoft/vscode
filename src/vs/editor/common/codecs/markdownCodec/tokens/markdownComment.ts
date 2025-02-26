/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { Range } from '../../../core/range.js';
import { MarkdownToken } from './markdownToken.js';
import { TSimpleToken } from '../../simpleCodec/simpleDecoder.js';

/**
 * A token that represent a `markdown comment` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class MarkdownComment extends MarkdownToken {
	constructor(
		range: Range,
		public readonly tokens: readonly TSimpleToken[],
	) {
		// TODO: @lego - validate tokens
		super(range);
		// assert(
		// 	!isNaN(lineNumber),
		// 	`The line number must not be a NaN.`,
		// );

		// assert(
		// 	lineNumber > 0,
		// 	`The line number must be >= 1, got "${lineNumber}".`,
		// );

		// assert(
		// 	columnNumber > 0,
		// 	`The column number must be >= 1, got "${columnNumber}".`,
		// );

		// assert(
		// 	caption[0] === '[' && caption[caption.length - 1] === ']',
		// 	`The caption must be enclosed in square brackets, got "${caption}".`,
		// );

		// assert(
		// 	reference[0] === '(' && reference[reference.length - 1] === ')',
		// 	`The reference must be enclosed in parentheses, got "${reference}".`,
		// );

		// super(
		// 	new Range(
		// 		lineNumber,
		// 		columnNumber,
		// 		lineNumber,
		// 		columnNumber + caption.length + reference.length,
		// 	),
		// );

		// // set up the `isURL` flag based on the current
		// try {
		// 	new URL(this.path);
		// 	this.isURL = true;
		// } catch {
		// 	this.isURL = false;
		// }
	}

	/**
	 * Check if this token is equal to another one.
	 */
	public override equals<T extends BaseToken>(other: T): boolean {
		if (!super.sameRange(other.range)) {
			return false;
		}

		if (!(other instanceof MarkdownComment)) {
			return false;
		}

		return this.text === other.text;
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `md-comment("${this.text}")${this.range}`;
	}
}
