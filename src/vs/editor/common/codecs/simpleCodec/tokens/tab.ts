/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { Line } from '../../linesCodec/tokens/line.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Position } from '../../../../../editor/common/core/position.js';

/**
 * A token that represent a `tab` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class Tab extends BaseToken {
	/**
	 * The underlying symbol of the `Tab` token.
	 */
	public static readonly symbol: string = '\t';

	/**
	 * Return text representation of the token.
	 */
	public get text(): string {
		return Tab.symbol;
	}

	/**
	 * Create new `Tab` token with range inside
	 * the given `Line` at the given `column number`.
	 */
	public static newOnLine(
		line: Line,
		atColumnNumber: number,
	): Tab {
		const { range } = line;

		const startPosition = new Position(range.startLineNumber, atColumnNumber);
		// the tab token length is 1, hence `+ 1`
		const endPosition = new Position(range.startLineNumber, atColumnNumber + this.symbol.length);

		return new Tab(Range.fromPositions(
			startPosition,
			endPosition,
		));
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `tab${this.range}`;
	}
}
