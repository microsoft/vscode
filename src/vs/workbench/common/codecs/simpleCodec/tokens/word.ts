/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Line } from '../../linesCodec/tokens/line.js';
import { RangedToken } from '../../rangedToken.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Position } from '../../../../../editor/common/core/position.js';

/**
 * A token that represent a word - a set of continuous
 * characters without `spaces` or `new lines`.
 */
export class Word extends RangedToken {
	constructor(
		/**
		 * The word range.
		 */
		range: Range,
		/**
		 * The string value of the word.
		 */
		public readonly value: string,
	) {
		super(range);
	}

	// TODO: @legomushroom
	public static newOnLine(
		// string value of the word,
		value: string,
		// TODO: @legomushroom
		line: Line,
		// TODO: @legomushroom
		atColumnNumber: number,
	): Word {
		const { range } = line;

		const endPosition = new Position(range.startLineNumber, atColumnNumber + value.length);

		return new Word(
			Range.fromPositions(
				range.getStartPosition(),
				endPosition,
			),
			value,
		);
	}
}
