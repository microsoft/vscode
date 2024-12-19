/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { Range } from '../../../core/range.js';
import { assert } from '../../../../../base/common/assert.js';

/**
 * A token that represent a `markdown link` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class MarkdownLink extends BaseToken {
	constructor(
		// the line index
		// Note! 1-based indexing
		lineNumber: number,
		columnNumber: number,
		private readonly caption: string,
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

		super(
			new Range(
				lineNumber,
				columnNumber,
				lineNumber,
				columnNumber + caption.length + reference.length + 1, // TODO: @legomushroom
			),
		);
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

	// TODO: @legomushroom - remove or implement?
	// public static newOnLine(
	// 	line: Line,
	// 	atColumnNumber: number,
	// ): MarkdownLink {
	// 	const { range } = line;

	// 	const startPosition = new Position(range.startLineNumber, atColumnNumber);
	// 	// the tab token length is 1, hence `+ 1`
	// 	const endPosition = new Position(range.startLineNumber, atColumnNumber + this.symbol.length);

	// 	return new MarkdownLink(Range.fromPositions(
	// 		startPosition,
	// 		endPosition,
	// 	));
	// }

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `md-link("${this.text}")${this.range}`;
	}
}
