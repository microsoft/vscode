/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { Line } from '../../linesCodec/tokens/line.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Position } from '../../../../../editor/common/core/position.js';

/**
 * A token that represent a word - a set of continuous
 * characters without stop characters, like a `space`,
 * a `tab`, or a `new line`.
 */
export class Word extends BaseToken {
	constructor(
		/**
		 * The word range.
		 */
		range: Range,

		/**
		 * The string value of the word.
		 */
		public readonly text: string,
	) {
		super(range);
	}

	/**
	 * Create new `Word` token with the given `text` and the range
	 * inside the given `Line` at the specified `column number`.
	 */
	public static newOnLine(
		text: string,
		line: Line,
		atColumnNumber: number,
	): Word {
		const { range } = line;

		const startPosition = new Position(range.startLineNumber, atColumnNumber);
		const endPosition = new Position(range.startLineNumber, atColumnNumber + text.length);

		return new Word(
			Range.fromPositions(startPosition, endPosition),
			text,
		);
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `word("${this.shortText()}")${this.range}`;
	}
}
