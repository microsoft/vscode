/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Position } from 'vs/editor/common/core/position';
import { CharCode } from 'vs/base/common/charCode';
import * as strings from 'vs/base/common/strings';
import { ICommand, IConfigurationChangedEvent, TextModelResolvedOptions, IConfiguration } from 'vs/editor/common/editorCommon';
import { TextModel } from 'vs/editor/common/model/textModel';
import { Selection } from 'vs/editor/common/core/selection';
import { Range } from 'vs/editor/common/core/range';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { onUnexpectedError } from 'vs/base/common/errors';
import { LanguageIdentifier } from 'vs/editor/common/modes';
import { IAutoClosingPair } from 'vs/editor/common/modes/languageConfiguration';

export interface CharacterMap {
	[char: string]: string;
}

export class CursorConfiguration {
	_cursorMoveConfigurationBrand: void;

	public readonly tabSize: number;
	public readonly insertSpaces: boolean;
	public readonly oneIndent: string;
	public readonly pageSize: number;
	public readonly useTabStops: boolean;
	public readonly wordSeparators: string;
	public readonly autoClosingBrackets: boolean;
	public readonly autoClosingPairsOpen: CharacterMap;
	public readonly autoClosingPairsClose: CharacterMap;
	public readonly surroundingPairs: CharacterMap;
	public readonly electricChars: { [key: string]: boolean; };

	public static shouldRecreate(e: IConfigurationChangedEvent): boolean {
		return (
			e.layoutInfo
			|| e.wordSeparators
			|| e.autoClosingBrackets
			|| e.useTabStops
		);
	}

	constructor(
		languageIdentifier: LanguageIdentifier,
		oneIndent: string,
		modelOptions: TextModelResolvedOptions,
		configuration: IConfiguration
	) {
		let c = configuration.editor;

		this.tabSize = modelOptions.tabSize;
		this.insertSpaces = modelOptions.insertSpaces;
		this.oneIndent = oneIndent;
		this.pageSize = Math.floor(c.layoutInfo.height / c.fontInfo.lineHeight) - 2;
		this.useTabStops = c.useTabStops;
		this.wordSeparators = c.wordSeparators;
		this.autoClosingBrackets = c.autoClosingBrackets;

		this.autoClosingPairsOpen = {};
		this.autoClosingPairsClose = {};
		this.surroundingPairs = {};
		this.electricChars = {};

		let electricChars = CursorConfiguration._getElectricCharacters(languageIdentifier);
		if (electricChars) {
			for (let i = 0; i < electricChars.length; i++) {
				this.electricChars[electricChars[i]] = true;
			}
		}

		let autoClosingPairs = CursorConfiguration._getAutoClosingPairs(languageIdentifier);
		if (autoClosingPairs) {
			for (let i = 0; i < autoClosingPairs.length; i++) {
				this.autoClosingPairsOpen[autoClosingPairs[i].open] = autoClosingPairs[i].close;
				this.autoClosingPairsClose[autoClosingPairs[i].close] = autoClosingPairs[i].open;
			}
		}

		let surroundingPairs = CursorConfiguration._getSurroundingPairs(languageIdentifier);
		if (surroundingPairs) {
			for (let i = 0; i < surroundingPairs.length; i++) {
				this.surroundingPairs[surroundingPairs[i].open] = surroundingPairs[i].close;
			}
		}
	}

	public normalizeIndentation(str: string): string {
		return TextModel.normalizeIndentation(str, this.tabSize, this.insertSpaces);
	}

	private static _getElectricCharacters(languageIdentifier: LanguageIdentifier): string[] {
		try {
			return LanguageConfigurationRegistry.getElectricCharacters(languageIdentifier.id);
		} catch (e) {
			onUnexpectedError(e);
			return null;
		}
	}

	private static _getAutoClosingPairs(languageIdentifier: LanguageIdentifier): IAutoClosingPair[] {
		try {
			return LanguageConfigurationRegistry.getAutoClosingPairs(languageIdentifier.id);
		} catch (e) {
			onUnexpectedError(e);
			return null;
		}
	}

	private static _getSurroundingPairs(languageIdentifier: LanguageIdentifier): IAutoClosingPair[] {
		try {
			return LanguageConfigurationRegistry.getSurroundingPairs(languageIdentifier.id);
		} catch (e) {
			onUnexpectedError(e);
			return null;
		}
	}
}

/**
 * Represents a simple model (either the model or the view model).
 */
export interface ICursorSimpleModel {
	getLineCount(): number;
	getLineContent(lineNumber: number): string;
	getLineMinColumn(lineNumber: number): number;
	getLineMaxColumn(lineNumber: number): number;
	getLineFirstNonWhitespaceColumn(lineNumber: number): number;
	getLineLastNonWhitespaceColumn(lineNumber: number): number;
}

/**
 * Represents the cursor state on either the model or on the view model.
 */
export class SingleCursorState {
	_singleCursorStateBrand: void;

	// --- selection can start as a range (think double click and drag)
	public readonly selectionStart: Range;
	public readonly selectionStartLeftoverVisibleColumns: number;
	public readonly position: Position;
	public readonly leftoverVisibleColumns: number;
	public readonly selection: Selection;

	constructor(
		selectionStart: Range,
		selectionStartLeftoverVisibleColumns: number,
		position: Position,
		leftoverVisibleColumns: number,
	) {
		this.selectionStart = selectionStart;
		this.selectionStartLeftoverVisibleColumns = selectionStartLeftoverVisibleColumns;
		this.position = position;
		this.leftoverVisibleColumns = leftoverVisibleColumns;
		this.selection = SingleCursorState._computeSelection(this.selectionStart, this.position);
	}

	public equals(other: SingleCursorState) {
		return (
			this.selectionStartLeftoverVisibleColumns === other.selectionStartLeftoverVisibleColumns
			&& this.leftoverVisibleColumns === other.leftoverVisibleColumns
			&& this.position.equals(other.position)
			&& this.selectionStart.equalsRange(other.selectionStart)
		);
	}

	public hasSelection(): boolean {
		return (!this.selection.isEmpty() || !this.selectionStart.isEmpty());
	}

	public move(inSelectionMode: boolean, lineNumber: number, column: number, leftoverVisibleColumns: number): SingleCursorState {
		if (inSelectionMode) {
			// move just position
			return new SingleCursorState(
				this.selectionStart,
				this.selectionStartLeftoverVisibleColumns,
				new Position(lineNumber, column),
				leftoverVisibleColumns
			);
		} else {
			// move everything
			return new SingleCursorState(
				new Range(lineNumber, column, lineNumber, column),
				leftoverVisibleColumns,
				new Position(lineNumber, column),
				leftoverVisibleColumns
			);
		}
	}

	private static _computeSelection(selectionStart: Range, position: Position): Selection {
		let startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number;
		if (selectionStart.isEmpty()) {
			startLineNumber = selectionStart.startLineNumber;
			startColumn = selectionStart.startColumn;
			endLineNumber = position.lineNumber;
			endColumn = position.column;
		} else {
			if (position.isBeforeOrEqual(selectionStart.getStartPosition())) {
				startLineNumber = selectionStart.endLineNumber;
				startColumn = selectionStart.endColumn;
				endLineNumber = position.lineNumber;
				endColumn = position.column;
			} else {
				startLineNumber = selectionStart.startLineNumber;
				startColumn = selectionStart.startColumn;
				endLineNumber = position.lineNumber;
				endColumn = position.column;
			}
		}
		return new Selection(
			startLineNumber,
			startColumn,
			endLineNumber,
			endColumn
		);
	}
}

export class CursorState {
	_cursorStateBrand: void;

	readonly modelState: SingleCursorState;
	readonly viewState: SingleCursorState;

	constructor(modelState: SingleCursorState, viewState: SingleCursorState) {
		this.modelState = modelState;
		this.viewState = viewState;
	}
}

export class EditOperationResult {
	_editOperationBrand: void;

	readonly command: ICommand;
	readonly shouldPushStackElementBefore: boolean;
	readonly shouldPushStackElementAfter: boolean;
	readonly isAutoWhitespaceCommand: boolean;
	readonly shouldRevealHorizontal: boolean;

	constructor(
		command: ICommand,
		opts: {
			shouldPushStackElementBefore: boolean;
			shouldPushStackElementAfter: boolean;
			isAutoWhitespaceCommand?: boolean;
		}
	) {
		this.command = command;
		this.shouldPushStackElementBefore = opts.shouldPushStackElementBefore;
		this.shouldPushStackElementAfter = opts.shouldPushStackElementAfter;
		this.isAutoWhitespaceCommand = false;
		this.shouldRevealHorizontal = true;

		if (typeof opts.isAutoWhitespaceCommand !== 'undefined') {
			this.isAutoWhitespaceCommand = opts.isAutoWhitespaceCommand;
		}
	}
}

/**
 * Common operations that work and make sense both on the model and on the view model.
 */
export class CursorColumns {

	public static isLowSurrogate(model: ICursorSimpleModel, lineNumber: number, charOffset: number): boolean {
		let lineContent = model.getLineContent(lineNumber);
		if (charOffset < 0 || charOffset >= lineContent.length) {
			return false;
		}
		return strings.isLowSurrogate(lineContent.charCodeAt(charOffset));
	}

	public static isHighSurrogate(model: ICursorSimpleModel, lineNumber: number, charOffset: number): boolean {
		let lineContent = model.getLineContent(lineNumber);
		if (charOffset < 0 || charOffset >= lineContent.length) {
			return false;
		}
		return strings.isHighSurrogate(lineContent.charCodeAt(charOffset));
	}

	public static isInsideSurrogatePair(model: ICursorSimpleModel, lineNumber: number, column: number): boolean {
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

	public static visibleColumnFromColumn2(config: CursorConfiguration, model: ICursorSimpleModel, position: Position): number {
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
	public static nextTabStop(visibleColumn: number, tabSize: number): number {
		return visibleColumn + tabSize - visibleColumn % tabSize;
	}

	/**
	 * ATTENTION: This works with 0-based columns (as oposed to the regular 1-based columns)
	 */
	public static prevTabStop(column: number, tabSize: number): number {
		return column - 1 - (column - 1) % tabSize;
	}
}
