/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { Line } from '../../linesCodec/tokens/line.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Position } from '../../../../../editor/common/core/position.js';

/**
 * Token that represent a `vertical tab` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class VerticalTab extends BaseToken {
	/**
	 * The underlying symbol of the `VerticalTab` token.
	 */
	public static readonly symbol: string = '\v';

	/**
	 * Return text representation of the token.
	 */
	public get text(): string {
		return VerticalTab.symbol;
	}

	/**
	 * Create new `VerticalTab` token with range inside
	 * the given `Line` at the given `column number`.
	 */
	public static newOnLine(
		line: Line,
		atColumnNumber: number,
	): VerticalTab {
		const { range } = line;

		const startPosition = new Position(range.startLineNumber, atColumnNumber);
		const endPosition = new Position(range.startLineNumber, atColumnNumber + this.symbol.length);

		return new VerticalTab(Range.fromPositions(
			startPosition,
			endPosition,
		));
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `vtab${this.range}`;
	}
}
