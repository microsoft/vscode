/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Position } from 'vs/editor/common/core/position';
import { CharCode } from 'vs/base/common/charCode';
import * as strings from 'vs/base/common/strings';
import { ICommand, TextModelResolvedOptions, IConfiguration, IModel, ScrollType } from 'vs/editor/common/editorCommon';
import { TextModel } from 'vs/editor/common/model/textModel';
import { Selection, ISelection } from 'vs/editor/common/core/selection';
import { Range } from 'vs/editor/common/core/range';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { onUnexpectedError } from 'vs/base/common/errors';
import { LanguageIdentifier } from 'vs/editor/common/modes';
import { IAutoClosingPair } from 'vs/editor/common/modes/languageConfiguration';
import { IConfigurationChangedEvent } from 'vs/editor/common/config/editorOptions';
import { IViewModel } from 'vs/editor/common/viewModel/viewModel';
import { CursorChangeReason } from 'vs/editor/common/controller/cursorEvents';
import { VerticalRevealType } from 'vs/editor/common/view/viewEvents';

export interface IColumnSelectData {
	toViewLineNumber: number;
	toViewVisualColumn: number;
}

export const enum RevealTarget {
	Primary = 0,
	TopMost = 1,
	BottomMost = 2
}

export interface ICursors {
	readonly context: CursorContext;
	getPrimaryCursor(): CursorState;
	getLastAddedCursorIndex(): number;
	getAll(): CursorState[];

	getColumnSelectData(): IColumnSelectData;
	setColumnSelectData(columnSelectData: IColumnSelectData): void;

	setStates(source: string, reason: CursorChangeReason, states: CursorState[]): void;
	reveal(horizontal: boolean, target: RevealTarget, scrollType: ScrollType): void;
	revealRange(revealHorizontal: boolean, viewRange: Range, verticalType: VerticalRevealType, scrollType: ScrollType): void;

	scrollTo(desiredScrollTop: number): void;
}

export interface CharacterMap {
	[char: string]: string;
}

export class CursorConfiguration {
	_cursorMoveConfigurationBrand: void;

	public readonly readOnly: boolean;
	public readonly tabSize: number;
	public readonly insertSpaces: boolean;
	public readonly oneIndent: string;
	public readonly pageSize: number;
	public readonly lineHeight: number;
	public readonly useTabStops: boolean;
	public readonly wordSeparators: string;
	public readonly emptySelectionClipboard: boolean;
	public readonly autoClosingBrackets: boolean;
	public readonly autoIndent: boolean;
	public readonly autoClosingPairsOpen: CharacterMap;
	public readonly autoClosingPairsClose: CharacterMap;
	public readonly surroundingPairs: CharacterMap;
	public readonly electricChars: { [key: string]: boolean; };

	public static shouldRecreate(e: IConfigurationChangedEvent): boolean {
		return (
			e.layoutInfo
			|| e.wordSeparators
			|| e.emptySelectionClipboard
			|| e.autoClosingBrackets
			|| e.useTabStops
			|| e.lineHeight
			|| e.readOnly
		);
	}

	constructor(
		languageIdentifier: LanguageIdentifier,
		oneIndent: string,
		modelOptions: TextModelResolvedOptions,
		configuration: IConfiguration
	) {
		let c = configuration.editor;

		this.readOnly = c.readOnly;
		this.tabSize = modelOptions.tabSize;
		this.insertSpaces = modelOptions.insertSpaces;
		this.oneIndent = oneIndent;
		this.pageSize = Math.floor(c.layoutInfo.height / c.fontInfo.lineHeight) - 2;
		this.lineHeight = c.lineHeight;
		this.useTabStops = c.useTabStops;
		this.wordSeparators = c.wordSeparators;
		this.emptySelectionClipboard = c.emptySelectionClipboard;
		this.autoClosingBrackets = c.autoClosingBrackets;
		this.autoIndent = c.autoIndent;

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

export class CursorContext {
	_cursorContextBrand: void;

	public readonly model: IModel;
	public readonly viewModel: IViewModel;
	public readonly config: CursorConfiguration;

	constructor(configuration: IConfiguration, model: IModel, viewModel: IViewModel) {
		this.model = model;
		this.viewModel = viewModel;
		this.config = new CursorConfiguration(
			this.model.getLanguageIdentifier(),
			this.model.getOneIndent(),
			this.model.getOptions(),
			configuration
		);
	}

	public validateViewPosition(viewPosition: Position, modelPosition: Position): Position {
		return this.viewModel.coordinatesConverter.validateViewPosition(viewPosition, modelPosition);
	}

	public validateViewRange(viewRange: Range, expectedModelRange: Range): Range {
		return this.viewModel.coordinatesConverter.validateViewRange(viewRange, expectedModelRange);
	}

	public convertViewRangeToModelRange(viewRange: Range): Range {
		return this.viewModel.coordinatesConverter.convertViewRangeToModelRange(viewRange);
	}

	public convertViewPositionToModelPosition(lineNumber: number, column: number): Position {
		return this.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(lineNumber, column));
	}

	public convertModelPositionToViewPosition(modelPosition: Position): Position {
		return this.viewModel.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
	}

	public convertModelRangeToViewRange(modelRange: Range): Range {
		return this.viewModel.coordinatesConverter.convertModelRangeToViewRange(modelRange);
	}

	public getCurrentScrollTop(): number {
		return this.viewModel.viewLayout.getCurrentScrollTop();
	}

	public getCompletelyVisibleViewRange(): Range {
		return this.viewModel.getCompletelyVisibleViewRange();
	}

	public getCompletelyVisibleModelRange(): Range {
		const viewRange = this.viewModel.getCompletelyVisibleViewRange();
		return this.viewModel.coordinatesConverter.convertViewRangeToModelRange(viewRange);
	}

	public getCompletelyVisibleViewRangeAtScrollTop(scrollTop: number): Range {
		return this.viewModel.getCompletelyVisibleViewRangeAtScrollTop(scrollTop);
	}

	public getCompletelyVisibleModelRangeAtScrollTop(scrollTop: number): Range {
		const viewRange = this.viewModel.getCompletelyVisibleViewRangeAtScrollTop(scrollTop);
		return this.viewModel.coordinatesConverter.convertViewRangeToModelRange(viewRange);
	}

	public getVerticalOffsetForViewLine(viewLineNumber: number): number {
		return this.viewModel.viewLayout.getVerticalOffsetForLineNumber(viewLineNumber);
	}
}

export class CursorState {
	_cursorStateBrand: void;

	public static fromModelState(modelState: SingleCursorState): CursorState {
		return new CursorState(modelState, null);
	}

	public static fromViewState(viewState: SingleCursorState): CursorState {
		return new CursorState(null, viewState);
	}

	public static fromModelSelection(modelSelection: ISelection): CursorState {
		const selectionStartLineNumber = modelSelection.selectionStartLineNumber;
		const selectionStartColumn = modelSelection.selectionStartColumn;
		const positionLineNumber = modelSelection.positionLineNumber;
		const positionColumn = modelSelection.positionColumn;
		const modelState = new SingleCursorState(
			new Range(selectionStartLineNumber, selectionStartColumn, selectionStartLineNumber, selectionStartColumn), 0,
			new Position(positionLineNumber, positionColumn), 0
		);
		return CursorState.fromModelState(modelState);
	}

	public static fromModelSelections(modelSelections: ISelection[]): CursorState[] {
		let states: CursorState[] = [];
		for (let i = 0, len = modelSelections.length; i < len; i++) {
			states[i] = this.fromModelSelection(modelSelections[i]);
		}
		return states;
	}

	public static ensureInEditableRange(context: CursorContext, states: CursorState[]): CursorState[] {
		const model = context.model;
		if (!model.hasEditableRange()) {
			return states;
		}

		const modelEditableRange = model.getEditableRange();
		const viewEditableRange = context.convertModelRangeToViewRange(modelEditableRange);

		let result: CursorState[] = [];
		for (let i = 0, len = states.length; i < len; i++) {
			const state = states[i];

			if (state.modelState) {
				const newModelState = CursorState._ensureInEditableRange(state.modelState, modelEditableRange);
				result[i] = newModelState ? CursorState.fromModelState(newModelState) : state;
			} else {
				const newViewState = CursorState._ensureInEditableRange(state.viewState, viewEditableRange);
				result[i] = newViewState ? CursorState.fromViewState(newViewState) : state;
			}
		}
		return result;
	}

	private static _ensureInEditableRange(state: SingleCursorState, editableRange: Range): SingleCursorState {
		const position = state.position;

		if (position.lineNumber < editableRange.startLineNumber || (position.lineNumber === editableRange.startLineNumber && position.column < editableRange.startColumn)) {
			return new SingleCursorState(
				state.selectionStart, state.selectionStartLeftoverVisibleColumns,
				new Position(editableRange.startLineNumber, editableRange.startColumn), 0
			);
		}

		if (position.lineNumber > editableRange.endLineNumber || (position.lineNumber === editableRange.endLineNumber && position.column > editableRange.endColumn)) {
			return new SingleCursorState(
				state.selectionStart, state.selectionStartLeftoverVisibleColumns,
				new Position(editableRange.endLineNumber, editableRange.endColumn), 0
			);
		}

		return null;
	}

	readonly modelState: SingleCursorState;
	readonly viewState: SingleCursorState;

	constructor(modelState: SingleCursorState, viewState: SingleCursorState) {
		this.modelState = modelState;
		this.viewState = viewState;
	}

	public equals(other: CursorState): boolean {
		return (this.viewState.equals(other.viewState) && this.modelState.equals(other.modelState));
	}
}

export class EditOperationResult {
	_editOperationResultBrand: void;

	readonly commands: ICommand[];
	readonly shouldPushStackElementBefore: boolean;
	readonly shouldPushStackElementAfter: boolean;

	constructor(
		commands: ICommand[],
		opts: {
			shouldPushStackElementBefore: boolean;
			shouldPushStackElementAfter: boolean;
		}
	) {
		this.commands = commands;
		this.shouldPushStackElementBefore = opts.shouldPushStackElementBefore;
		this.shouldPushStackElementAfter = opts.shouldPushStackElementAfter;
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
