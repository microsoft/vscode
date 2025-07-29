/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { Line } from '../../linesCodec/tokens/line.js';
import { Range } from '../../../../../../../../../editor/common/core/range.js';

/**
 * A token that represent a word - a set of continuous
 * characters without stop characters, like a `space`,
 * a `tab`, or a `new line`.
 */
export class Word<TText extends string = string> extends BaseToken<TText> {
	constructor(
		/**
		 * The word range.
		 */
		range: Range,

		/**
		 * The string value of the word.
		 */
		public readonly text: TText,
	) {
		super(range);
	}

	/**
	 * Create new `Word` token with the given `text` and the range
	 * inside the given `Line` at the specified `column number`.
	 */
	public static newOnLine(
		text: string,
		line: Line | number,
		atColumnNumber: number,
	): Word {
		const startLineNumber = (typeof line === 'number')
			? line
			: line.range.startLineNumber;

		const range = new Range(
			startLineNumber, atColumnNumber,
			startLineNumber, atColumnNumber + text.length
		);

		return new Word(
			range,
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
