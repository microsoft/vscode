/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RangedToken } from '../../rangedToken.js';
import { Line } from '../../linesCodec/tokens/line.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Position } from '../../../../../editor/common/core/position.js';

/**
 * A token that represent a `new line` with a `range`.
 * The `range` reflects the position of the token in the original data.
 */
export class NewLine extends RangedToken {
	/**
	 * Return a string representation of the token.
	 */
	public override toString(): string {
		return `newline${this.range}`;
	}

	// TODO: @legomushroom
	public static newOnLine(
		// TODO: @legomushroom
		line: Line,
		// TODO: @legomushroom
		atColumnNumber: number,
	): NewLine {
		const { range } = line;

		const startPosition = new Position(range.startLineNumber, atColumnNumber);
		// the newline token length is 1, hence `+ 1`
		const endPosition = new Position(range.startLineNumber, atColumnNumber + 1);

		return new NewLine(
			Range.fromPositions(startPosition, endPosition),
		);
	}
}
