/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from 'vs/base/common/charCode';
import * as strings from 'vs/base/common/strings';

/**
 * A column in a position is the gap between two adjacent characters. The methods here
 * work with a concept called "visible column". A visible column is a very rough approximation
 * of the horizontal screen position of a column. For example, using a tab size of 4:
 * ```txt
 * |<TAB>|<TAB>|T|ext
 * |     |     | \---- column = 4, visible column = 9
 * |     |     \------ column = 3, visible column = 8
 * |     \------------ column = 2, visible column = 4
 * \------------------ column = 1, visible column = 0
 * ```
 *
 * **NOTE**: Visual columns do not work well for RTL text or variable-width fonts or characters.
 *
 * **NOTE**: These methods work and make sense both on the model and on the view model.
 */
export class CursorColumns {

	private static _nextVisibleColumn(codePoint: number, visibleColumn: number, tabSize: number): number {
		if (codePoint === CharCode.Tab) {
			return CursorColumns.nextRenderTabStop(visibleColumn, tabSize);
		}
		if (strings.isFullWidthCharacter(codePoint) || strings.isEmojiImprecise(codePoint)) {
			return visibleColumn + 2;
		}
		return visibleColumn + 1;
	}

	/**
	 * Returns a visible column from a column.
	 * @see {@link CursorColumns}
	 */
	public static visibleColumnFromColumn(lineContent: string, column: number, tabSize: number): number {
		const textLen = Math.min(column - 1, lineContent.length);
		const text = lineContent.substring(0, textLen);
		const iterator = new strings.GraphemeIterator(text);

		let result = 0;
		while (!iterator.eol()) {
			const codePoint = strings.getNextCodePoint(text, textLen, iterator.offset);
			iterator.nextGraphemeLength();

			result = this._nextVisibleColumn(codePoint, result, tabSize);
		}

		return result;
	}

	/**
	 * Returns the value to display as "Col" in the status bar.
	 * @see {@link CursorColumns}
	 */
	public static toStatusbarColumn(lineContent: string, column: number, tabSize: number): number {
		const text = lineContent.substring(0, Math.min(column - 1, lineContent.length));
		const iterator = new strings.CodePointIterator(text);

		let result = 0;
		while (!iterator.eol()) {
			const codePoint = iterator.nextCodePoint();

			if (codePoint === CharCode.Tab) {
				result = CursorColumns.nextRenderTabStop(result, tabSize);
			} else {
				result = result + 1;
			}
		}

		return result + 1;
	}

	/**
	 * Returns a column from a visible column.
	 * @see {@link CursorColumns}
	 */
	public static columnFromVisibleColumn(lineContent: string, visibleColumn: number, tabSize: number): number {
		if (visibleColumn <= 0) {
			return 1;
		}

		const lineContentLength = lineContent.length;
		const iterator = new strings.GraphemeIterator(lineContent);

		let beforeVisibleColumn = 0;
		let beforeColumn = 1;
		while (!iterator.eol()) {
			const codePoint = strings.getNextCodePoint(lineContent, lineContentLength, iterator.offset);
			iterator.nextGraphemeLength();

			const afterVisibleColumn = this._nextVisibleColumn(codePoint, beforeVisibleColumn, tabSize);
			const afterColumn = iterator.offset + 1;

			if (afterVisibleColumn >= visibleColumn) {
				const beforeDelta = visibleColumn - beforeVisibleColumn;
				const afterDelta = afterVisibleColumn - visibleColumn;
				if (afterDelta < beforeDelta) {
					return afterColumn;
				} else {
					return beforeColumn;
				}
			}

			beforeVisibleColumn = afterVisibleColumn;
			beforeColumn = afterColumn;
		}

		// walked the entire string
		return lineContentLength + 1;
	}

	/**
	 * ATTENTION: This works with 0-based columns (as opposed to the regular 1-based columns)
	 * @see {@link CursorColumns}
	 */
	public static nextRenderTabStop(visibleColumn: number, tabSize: number): number {
		return visibleColumn + tabSize - visibleColumn % tabSize;
	}

	/**
	 * ATTENTION: This works with 0-based columns (as opposed to the regular 1-based columns)
	 * @see {@link CursorColumns}
	 */
	public static nextIndentTabStop(visibleColumn: number, indentSize: number): number {
		return visibleColumn + indentSize - visibleColumn % indentSize;
	}

	/**
	 * ATTENTION: This works with 0-based columns (as opposed to the regular 1-based columns)
	 * @see {@link CursorColumns}
	 */
	public static prevRenderTabStop(column: number, tabSize: number): number {
		return Math.max(0, column - 1 - (column - 1) % tabSize);
	}

	/**
	 * ATTENTION: This works with 0-based columns (as opposed to the regular 1-based columns)
	 * @see {@link CursorColumns}
	 */
	public static prevIndentTabStop(column: number, indentSize: number): number {
		return Math.max(0, column - 1 - (column - 1) % indentSize);
	}
}
