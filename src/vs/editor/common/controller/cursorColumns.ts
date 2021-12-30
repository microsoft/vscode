/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from 'vs/base/common/charCode';
import * as strings from 'vs/base/common/strings';
import { CursorConfiguration, ICursorSimpleModel } from 'vs/editor/common/controller/cursorCommon';
import { Position } from 'vs/editor/common/core/position';

/**
 * Common operations that work and make sense both on the model and on the view model.
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

	public static visibleColumnFromColumn2(config: CursorConfiguration, model: ICursorSimpleModel, position: Position): number {
		return this.visibleColumnFromColumn(model.getLineContent(position.lineNumber), position.column, config.tabSize);
	}

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

	public static columnFromVisibleColumn2(config: CursorConfiguration, model: ICursorSimpleModel, lineNumber: number, visibleColumn: number): number {
		let result = this.columnFromVisibleColumn(model.getLineContent(lineNumber), visibleColumn, config.tabSize);

		let minColumn = model.getLineMinColumn(lineNumber);
		if (result < minColumn) {
			return minColumn;
		}

		let maxColumn = model.getLineMaxColumn(lineNumber);
		if (result > maxColumn) {
			return maxColumn;
		}

		return result;
	}

	/**
	 * ATTENTION: This works with 0-based columns (as oposed to the regular 1-based columns)
	 */
	public static nextRenderTabStop(visibleColumn: number, tabSize: number): number {
		return visibleColumn + tabSize - visibleColumn % tabSize;
	}

	/**
	 * ATTENTION: This works with 0-based columns (as oposed to the regular 1-based columns)
	 */
	public static nextIndentTabStop(visibleColumn: number, indentSize: number): number {
		return visibleColumn + indentSize - visibleColumn % indentSize;
	}

	/**
	 * ATTENTION: This works with 0-based columns (as opposed to the regular 1-based columns)
	 */
	public static prevRenderTabStop(column: number, tabSize: number): number {
		return Math.max(0, column - 1 - (column - 1) % tabSize);
	}

	/**
	 * ATTENTION: This works with 0-based columns (as opposed to the regular 1-based columns)
	 */
	public static prevIndentTabStop(column: number, indentSize: number): number {
		return Math.max(0, column - 1 - (column - 1) % indentSize);
	}
}
