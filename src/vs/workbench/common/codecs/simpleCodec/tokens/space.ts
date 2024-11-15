/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RangedToken } from '../../rangedToken.js';
import { Line } from '../../linesCodec/tokens/line.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Position } from '../../../../../editor/common/core/position.js';

/**
 * A token that represent a single `space` with a `range`.
 * The `range` reflects the position of the space in the original data.
 */
export class Space extends RangedToken {
	// TODO: @legomushroom
	public static newOnLine(
		// TODO: @legomushroom
		line: Line,
		// TODO: @legomushroom
		atColumnNumber: number,
	): Space {
		const { range } = line;

		const startPosition = new Position(range.startLineNumber, atColumnNumber);
		// the space token length is 1, hence `+ 1`
		const endPosition = new Position(range.startLineNumber, atColumnNumber + 1);

		return new Space(Range.fromPositions(
			startPosition,
			endPosition,
		));
	}

	/**
	 * Return a string representation of the token.
	 */
	public override toString(): string {
		return `space${this.range}`;
	}

	/**
	 * Check if this token is equal to another one.
	 */
	public equals(other: Space): boolean {
		return super.sameRange(other.range);
	}
}
