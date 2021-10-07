/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from 'vs/base/common/charCode';
import * as strings from 'vs/base/common/strings';
import { Constants } from 'vs/base/common/uint';
import { CursorConfiguration, ICursorSimpleModel } from 'vs/editor/common/controller/cursorCommon';
import { Position } from 'vs/editor/common/core/position';

/**
 * Common operations that work and make sense both on the model and on the view model.
 */
export class CursorColumns {
	public static visibleColumnFromColumn(lineContent: string, column: number, tabSize: number): number {
		const lineContentLength = lineContent.length;
		const endOffset = column - 1 < lineContentLength ? column - 1 : lineContentLength;

		let result = 0;
		let i = 0;
		while (i < endOffset) {
			const codePoint = strings.getNextCodePoint(lineContent, endOffset, i);
			i += (codePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN ? 2 : 1);

			if (codePoint === CharCode.Tab) {
				result = CursorColumns.nextRenderTabStop(result, tabSize);
			} else {
				let graphemeBreakType = strings.getGraphemeBreakType(codePoint);
				while (i < endOffset) {
					const nextCodePoint = strings.getNextCodePoint(lineContent, endOffset, i);
					const nextGraphemeBreakType = strings.getGraphemeBreakType(nextCodePoint);
					if (strings.breakBetweenGraphemeBreakType(graphemeBreakType, nextGraphemeBreakType)) {
						break;
					}
					i += (nextCodePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN ? 2 : 1);
					graphemeBreakType = nextGraphemeBreakType;
				}
				if (strings.isFullWidthCharacter(codePoint) || strings.isEmojiImprecise(codePoint)) {
					result = result + 2;
				} else {
					result = result + 1;
				}
			}
		}
		return result;
	}

	/**
	 * Returns an array that maps one based columns to one based visible columns. The entry at position 0 is -1.
	*/
	public static visibleColumnsByColumns(lineContent: string, tabSize: number): number[] {
		const endOffset = lineContent.length;

		let result = new Array<number>();
		result.push(-1);
		let pos = 0;
		let i = 0;
		while (i < endOffset) {
			const codePoint = strings.getNextCodePoint(lineContent, endOffset, i);
			i += (codePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN ? 2 : 1);

			result.push(pos);
			if (codePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN) {
				result.push(pos);
			}

			if (codePoint === CharCode.Tab) {
				pos = CursorColumns.nextRenderTabStop(pos, tabSize);
			} else {
				let graphemeBreakType = strings.getGraphemeBreakType(codePoint);
				while (i < endOffset) {
					const nextCodePoint = strings.getNextCodePoint(lineContent, endOffset, i);
					const nextGraphemeBreakType = strings.getGraphemeBreakType(nextCodePoint);
					if (strings.breakBetweenGraphemeBreakType(graphemeBreakType, nextGraphemeBreakType)) {
						break;
					}
					i += (nextCodePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN ? 2 : 1);

					result.push(pos);
					if (codePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN) {
						result.push(pos);
					}

					graphemeBreakType = nextGraphemeBreakType;
				}
				if (strings.isFullWidthCharacter(codePoint) || strings.isEmojiImprecise(codePoint)) {
					pos = pos + 2;
				} else {
					pos = pos + 1;
				}
			}
		}
		result.push(pos);
		return result;
	}

	public static toStatusbarColumn(lineContent: string, column: number, tabSize: number): number {
		const lineContentLength = lineContent.length;
		const endOffset = column - 1 < lineContentLength ? column - 1 : lineContentLength;

		let result = 0;
		let i = 0;
		while (i < endOffset) {
			const codePoint = strings.getNextCodePoint(lineContent, endOffset, i);
			i += (codePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN ? 2 : 1);

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

		const lineLength = lineContent.length;

		let beforeVisibleColumn = 0;
		let beforeColumn = 1;
		let i = 0;
		while (i < lineLength) {
			const codePoint = strings.getNextCodePoint(lineContent, lineLength, i);
			i += (codePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN ? 2 : 1);

			let afterVisibleColumn: number;
			if (codePoint === CharCode.Tab) {
				afterVisibleColumn = CursorColumns.nextRenderTabStop(beforeVisibleColumn, tabSize);
			} else {
				let graphemeBreakType = strings.getGraphemeBreakType(codePoint);
				while (i < lineLength) {
					const nextCodePoint = strings.getNextCodePoint(lineContent, lineLength, i);
					const nextGraphemeBreakType = strings.getGraphemeBreakType(nextCodePoint);
					if (strings.breakBetweenGraphemeBreakType(graphemeBreakType, nextGraphemeBreakType)) {
						break;
					}
					i += (nextCodePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN ? 2 : 1);
					graphemeBreakType = nextGraphemeBreakType;
				}
				if (strings.isFullWidthCharacter(codePoint) || strings.isEmojiImprecise(codePoint)) {
					afterVisibleColumn = beforeVisibleColumn + 2;
				} else {
					afterVisibleColumn = beforeVisibleColumn + 1;
				}
			}
			const afterColumn = i + 1;

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
		return lineLength + 1;
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
