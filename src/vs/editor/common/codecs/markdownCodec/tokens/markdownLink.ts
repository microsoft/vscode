/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { Range } from '../../../core/range.js';
import { MarkdownToken } from './markdownToken.js';
import { assert } from '../../../../../base/common/assert.js';

/**
 * A token that represent a `markdown link` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class MarkdownLink extends MarkdownToken {
	/**
	 * Check if this `markdown link` points to a valid URL address.
	 */
	public readonly isURL: boolean;

	constructor(
		/**
		 * The starting line number of the link (1-based indexing).
		 */
		lineNumber: number,
		/**
		 * The starting column number of the link (1-based indexing).
		 */
		columnNumber: number,
		/**
		 * The caprtion of the link, including the square brackets.
		 */
		private readonly caption: string,
		/**
		 * The reference of the link, including the parentheses.
		 */
		private readonly reference: string,
	) {
		assert(
			!isNaN(lineNumber),
			`The line number must not be a NaN.`,
		);

		assert(
			lineNumber > 0,
			`The line number must be >= 1, got "${lineNumber}".`,
		);

		assert(
			columnNumber > 0,
			`The column number must be >= 1, got "${columnNumber}".`,
		);

		assert(
			caption[0] === '[' && caption[caption.length - 1] === ']',
			`The caption must be enclosed in square brackets, got "${caption}".`,
		);

		assert(
			reference[0] === '(' && reference[reference.length - 1] === ')',
			`The reference must be enclosed in parentheses, got "${reference}".`,
		);

		super(
			new Range(
				lineNumber,
				columnNumber,
				lineNumber,
				columnNumber + caption.length + reference.length,
			),
		);

		// set up the `isURL` flag based on the current
		try {
			new URL(this.path);
			this.isURL = true;
		} catch {
			this.isURL = false;
		}
	}

	public override get text(): string {
		return `${this.caption}${this.reference}`;
	}

	/**
	 * Returns the `reference` part of the link without enclosing parentheses.
	 */
	public get path(): string {
		return this.reference.slice(1, this.reference.length - 1);
	}

	/**
	 * Check if this token is equal to another one.
	 */
	public override equals<T extends BaseToken>(other: T): boolean {
		if (!super.sameRange(other.range)) {
			return false;
		}

		if (!(other instanceof MarkdownLink)) {
			return false;
		}

		return this.text === other.text;
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `md-link("${this.text}")${this.range}`;
	}
}
