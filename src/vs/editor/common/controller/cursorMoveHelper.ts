/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Selection } from 'vs/editor/common/core/selection';
import { Position } from 'vs/editor/common/core/position';
import { CharCode } from 'vs/base/common/charCode';
import { IViewColumnSelectResult } from 'vs/editor/common/controller/cursorColumnSelection';
import * as strings from 'vs/base/common/strings';
import { IModeConfiguration } from 'vs/editor/common/controller/oneCursor';
import { IConfigurationChangedEvent, TextModelResolvedOptions, IConfiguration } from 'vs/editor/common/editorCommon';

export interface CharacterMap {
	[char: string]: string;
}

export class CursorMoveConfiguration {
	_cursorMoveConfigurationBrand: void;

	public readonly tabSize: number;
	public readonly pageSize: number;
	public readonly useTabStops: boolean;
	public readonly wordSeparators: string;
	public readonly autoClosingBrackets: boolean;
	public readonly autoClosingPairsOpen: CharacterMap;

	public static shouldRecreate(e: IConfigurationChangedEvent): boolean {
		return (
			e.layoutInfo
			|| e.wordSeparators
			|| e.autoClosingBrackets
			|| e.useTabStops
		);
	}

	constructor(
		modelOptions: TextModelResolvedOptions,
		configuration: IConfiguration,
		modeConfiguration: IModeConfiguration
	) {
		let c = configuration.editor;

		this.tabSize = modelOptions.tabSize;
		this.pageSize = Math.floor(c.layoutInfo.height / c.fontInfo.lineHeight) - 2;
		this.useTabStops = c.useTabStops;
		this.wordSeparators = c.wordSeparators;
		this.autoClosingBrackets = c.autoClosingBrackets;
		this.autoClosingPairsOpen = modeConfiguration.autoClosingPairsOpen;
	}
}

export interface ICursorMoveHelperModel {
	getLineCount(): number;
	getLineContent(lineNumber: number): string;
	getLineMinColumn(lineNumber: number): number;
	getLineMaxColumn(lineNumber: number): number;
	getLineFirstNonWhitespaceColumn(lineNumber: number): number;
	getLineLastNonWhitespaceColumn(lineNumber: number): number;
}

/**
 * Common operations that work and make sense both on the model and on the view model.
 */
export class CursorMove {

	public static isLowSurrogate(model: ICursorMoveHelperModel, lineNumber: number, charOffset: number): boolean {
		let lineContent = model.getLineContent(lineNumber);
		if (charOffset < 0 || charOffset >= lineContent.length) {
			return false;
		}
		return strings.isLowSurrogate(lineContent.charCodeAt(charOffset));
	}

	public static isHighSurrogate(model: ICursorMoveHelperModel, lineNumber: number, charOffset: number): boolean {
		let lineContent = model.getLineContent(lineNumber);
		if (charOffset < 0 || charOffset >= lineContent.length) {
			return false;
		}
		return strings.isHighSurrogate(lineContent.charCodeAt(charOffset));
	}

	public static isInsideSurrogatePair(model: ICursorMoveHelperModel, lineNumber: number, column: number): boolean {
		return this.isHighSurrogate(model, lineNumber, column - 2);
	}

	public static visibleColumnFromColumn(lineContent: string, column: number, tabSize: number): number {
		let endOffset = lineContent.length;
		if (endOffset > column - 1) {
			endOffset = column - 1;
		}

		let result = 0;
		for (let i = 0; i < endOffset; i++) {
			let charCode = lineContent.charCodeAt(i);
			if (charCode === CharCode.Tab) {
				result = this.nextTabStop(result, tabSize);
			} else {
				result = result + 1;
			}
		}
		return result;
	}

	public static visibleColumnFromColumn2(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, position: Position): number {
		return this.visibleColumnFromColumn(model.getLineContent(position.lineNumber), position.column, config.tabSize);
	}

	public static columnFromVisibleColumn(lineContent: string, visibleColumn: number, tabSize: number): number {
		if (visibleColumn <= 0) {
			return 1;
		}

		const lineLength = lineContent.length;

		let beforeVisibleColumn = 0;
		for (let i = 0; i < lineLength; i++) {
			let charCode = lineContent.charCodeAt(i);

			let afterVisibleColumn: number;
			if (charCode === CharCode.Tab) {
				afterVisibleColumn = this.nextTabStop(beforeVisibleColumn, tabSize);
			} else {
				afterVisibleColumn = beforeVisibleColumn + 1;
			}

			if (afterVisibleColumn >= visibleColumn) {
				let prevDelta = visibleColumn - beforeVisibleColumn;
				let afterDelta = afterVisibleColumn - visibleColumn;
				if (afterDelta < prevDelta) {
					return i + 2;
				} else {
					return i + 1;
				}
			}

			beforeVisibleColumn = afterVisibleColumn;
		}

		// walked the entire string
		return lineLength + 1;
	}

	public static columnFromVisibleColumn2(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, lineNumber: number, visibleColumn: number): number {
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
	public static nextTabStop(visibleColumn: number, tabSize: number): number {
		return visibleColumn + tabSize - visibleColumn % tabSize;
	}
}



export interface IColumnSelectResult extends IViewColumnSelectResult {
	selections: Selection[];
	toLineNumber: number;
	toVisualColumn: number;
}


export class CursorMoveHelper {

	public static getColumnAtBeginningOfLine(model: ICursorMoveHelperModel, lineNumber: number, column: number): number {
		var firstNonBlankColumn = model.getLineFirstNonWhitespaceColumn(lineNumber) || 1;
		var minColumn = model.getLineMinColumn(lineNumber);

		if (column !== minColumn && column <= firstNonBlankColumn) {
			column = minColumn;
		} else {
			column = firstNonBlankColumn;
		}

		return column;
	}

	public static getColumnAtEndOfLine(model: ICursorMoveHelperModel, lineNumber: number, column: number): number {
		var maxColumn = model.getLineMaxColumn(lineNumber);
		var lastNonBlankColumn = model.getLineLastNonWhitespaceColumn(lineNumber) || maxColumn;

		if (column !== maxColumn && column >= lastNonBlankColumn) {
			column = maxColumn;
		} else {
			column = lastNonBlankColumn;
		}

		return column;
	}

	public static visibleColumnFromColumn(model: ICursorMoveHelperModel, lineNumber: number, column: number, tabSize: number): number {
		return CursorMoveHelper.visibleColumnFromColumn2(model.getLineContent(lineNumber), column, tabSize);
	}

	public static visibleColumnFromColumn2(line: string, column: number, tabSize: number): number {
		return CursorMove.visibleColumnFromColumn(line, column, tabSize);
	}

	/**
	 * ATTENTION: This works with 0-based columns (as oposed to the regular 1-based columns)
	 */
	public static nextTabColumn(column: number, tabSize: number): number {
		return CursorMove.nextTabStop(column, tabSize);
	}

	/**
	 * ATTENTION: This works with 0-based columns (as oposed to the regular 1-based columns)
	 */
	public static prevTabColumn(column: number, tabSize: number): number {
		return column - 1 - (column - 1) % tabSize;
	}
}