/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { SingleCursorState, CursorConfiguration, ICursorSimpleModel, CursorState } from 'vs/editor/common/controller/cursorCommon';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection, SelectionDirection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IDisposable } from 'vs/base/common/lifecycle';
import { MoveOperations } from 'vs/editor/common/controller/cursorMoveOperations';
import { WordOperations } from 'vs/editor/common/controller/cursorWordOperations';
import { ICoordinatesConverter } from 'vs/editor/common/viewModel/viewModel';

export interface IModeConfiguration {

	electricChars: {
		[key: string]: boolean;
	};

	autoClosingPairsOpen: {
		[key: string]: string;
	};

	autoClosingPairsClose: {
		[key: string]: string;
	};

	surroundingPairs: {
		[key: string]: string;
	};
}

export interface CursorMoveArguments extends editorCommon.CursorMoveArguments {
	pageSize?: number;
	isPaged?: boolean;
}

export interface IViewModelHelper {

	coordinatesConverter: ICoordinatesConverter;

	viewModel: ICursorSimpleModel;

	getCompletelyVisibleViewRange(): Range;
}

export interface IOneCursorState {
	selectionStart: Range;
	viewSelectionStart: Range;
	position: Position;
	viewPosition: Position;
	leftoverVisibleColumns: number;
	selectionStartLeftoverVisibleColumns: number;
}

export interface IOneCursor {
	readonly modelState: SingleCursorState;
	readonly viewState: SingleCursorState;
	readonly config: CursorConfiguration;
}

export class OneCursor implements IOneCursor {

	// --- contextual state
	public readonly model: editorCommon.IModel;
	public readonly viewModel: ICursorSimpleModel;
	private readonly configuration: editorCommon.IConfiguration;
	private readonly viewModelHelper: IViewModelHelper;
	private readonly coordinatesConverter: ICoordinatesConverter;

	private readonly _modelOptionsListener: IDisposable;
	private readonly _configChangeListener: IDisposable;

	private modeConfiguration: IModeConfiguration;
	public config: CursorConfiguration;

	public modelState: SingleCursorState;
	public viewState: SingleCursorState;

	// --- computed properties
	private _selStartMarker: string;
	private _selEndMarker: string;

	constructor(
		model: editorCommon.IModel,
		configuration: editorCommon.IConfiguration,
		modeConfiguration: IModeConfiguration,
		viewModelHelper: IViewModelHelper
	) {
		this.model = model;
		this.configuration = configuration;
		this.modeConfiguration = modeConfiguration;
		this.viewModelHelper = viewModelHelper;
		this.coordinatesConverter = viewModelHelper.coordinatesConverter;
		this.viewModel = this.viewModelHelper.viewModel;

		this._recreateCursorConfig();

		this._modelOptionsListener = model.onDidChangeOptions(() => this._recreateCursorConfig());

		this._configChangeListener = this.configuration.onDidChange((e) => {
			if (CursorConfiguration.shouldRecreate(e)) {
				this._recreateCursorConfig();
			}
		});

		this._setState(
			new SingleCursorState(new Range(1, 1, 1, 1), 0, new Position(1, 1), 0),
			new SingleCursorState(new Range(1, 1, 1, 1), 0, new Position(1, 1), 0),
			false
		);
	}

	/**
	 * Sometimes, the line mapping changes and the stored view position is stale.
	 */
	public ensureValidState(): void {
		this._setState(this.modelState, this.viewState, false);
	}

	private _recreateCursorConfig(): void {
		this.config = new CursorConfiguration(
			this.model.getOneIndent(),
			this.model.getOptions(),
			this.configuration,
			this.modeConfiguration
		);
	}

	private _ensureInEditableRange(position: Position): Position {
		let editableRange = this.model.getEditableRange();

		if (position.lineNumber < editableRange.startLineNumber || (position.lineNumber === editableRange.startLineNumber && position.column < editableRange.startColumn)) {
			return new Position(editableRange.startLineNumber, editableRange.startColumn);
		} else if (position.lineNumber > editableRange.endLineNumber || (position.lineNumber === editableRange.endLineNumber && position.column > editableRange.endColumn)) {
			return new Position(editableRange.endLineNumber, editableRange.endColumn);
		}
		return position;
	}

	private _setState(modelState: SingleCursorState, viewState: SingleCursorState, ensureInEditableRange: boolean): void {
		// Validate new model state
		let selectionStart = this.model.validateRange(modelState.selectionStart);
		let selectionStartLeftoverVisibleColumns = modelState.selectionStart.equalsRange(selectionStart) ? modelState.selectionStartLeftoverVisibleColumns : 0;

		let position = this.model.validatePosition(modelState.position);
		if (ensureInEditableRange) {
			position = this._ensureInEditableRange(position);
		}
		let leftoverVisibleColumns = modelState.position.equals(position) ? modelState.leftoverVisibleColumns : 0;

		modelState = new SingleCursorState(selectionStart, selectionStartLeftoverVisibleColumns, position, leftoverVisibleColumns);

		// Validate new view state
		let viewSelectionStart = this.coordinatesConverter.validateViewRange(viewState.selectionStart, modelState.selectionStart);
		let viewPosition = this.coordinatesConverter.validateViewPosition(viewState.position, modelState.position);
		viewState = new SingleCursorState(viewSelectionStart, selectionStartLeftoverVisibleColumns, viewPosition, leftoverVisibleColumns);

		if (this.modelState && this.viewState && this.modelState.equals(modelState) && this.viewState.equals(viewState)) {
			// No-op, early return
			return;
		}

		this.modelState = modelState;
		this.viewState = viewState;

		this._selStartMarker = this._ensureMarker(this._selStartMarker, this.modelState.selection.startLineNumber, this.modelState.selection.startColumn, true);
		this._selEndMarker = this._ensureMarker(this._selEndMarker, this.modelState.selection.endLineNumber, this.modelState.selection.endColumn, false);
	}

	private _ensureMarker(markerId: string, lineNumber: number, column: number, stickToPreviousCharacter: boolean): string {
		if (!markerId) {
			return this.model._addMarker(0, lineNumber, column, stickToPreviousCharacter);
		} else {
			this.model._changeMarker(markerId, lineNumber, column);
			this.model._changeMarkerStickiness(markerId, stickToPreviousCharacter);
			return markerId;
		}
	}

	public saveState(): IOneCursorState {
		return {
			selectionStart: this.modelState.selectionStart,
			viewSelectionStart: this.viewState.selectionStart,
			position: this.modelState.position,
			viewPosition: this.viewState.position,
			leftoverVisibleColumns: this.modelState.leftoverVisibleColumns,
			selectionStartLeftoverVisibleColumns: this.modelState.selectionStartLeftoverVisibleColumns
		};
	}

	public restoreState(state: IOneCursorState): void {
		let position = this.model.validatePosition(state.position);
		let selectionStart: Range;
		if (state.selectionStart) {
			selectionStart = this.model.validateRange(state.selectionStart);
		} else {
			selectionStart = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		}

		let viewPosition = this.coordinatesConverter.validateViewPosition(new Position(state.viewPosition.lineNumber, state.viewPosition.column), position);
		let viewSelectionStart: Range;
		if (state.viewSelectionStart) {
			viewSelectionStart = this.coordinatesConverter.validateViewRange(new Range(state.viewSelectionStart.startLineNumber, state.viewSelectionStart.startColumn, state.viewSelectionStart.endLineNumber, state.viewSelectionStart.endColumn), selectionStart);
		} else {
			viewSelectionStart = this.coordinatesConverter.convertModelRangeToViewRange(selectionStart);
		}

		this._setState(
			new SingleCursorState(selectionStart, state.selectionStartLeftoverVisibleColumns, position, state.leftoverVisibleColumns),
			new SingleCursorState(viewSelectionStart, state.selectionStartLeftoverVisibleColumns, viewPosition, state.leftoverVisibleColumns),
			false
		);
	}

	public updateModeConfiguration(modeConfiguration: IModeConfiguration): void {
		this.modeConfiguration = modeConfiguration;
		this._recreateCursorConfig();
	}

	public dispose(): void {
		this._modelOptionsListener.dispose();
		this._configChangeListener.dispose();
		this.model._removeMarker(this._selStartMarker);
		this.model._removeMarker(this._selEndMarker);
	}

	public setSelection(selection: editorCommon.ISelection, viewSelection: editorCommon.ISelection = null): void {
		let position = this.model.validatePosition({
			lineNumber: selection.positionLineNumber,
			column: selection.positionColumn
		});
		let selectionStart = this.model.validatePosition({
			lineNumber: selection.selectionStartLineNumber,
			column: selection.selectionStartColumn
		});

		let viewPosition: Position;
		let viewSelectionStart: Position;

		if (viewSelection) {
			viewPosition = this.coordinatesConverter.validateViewPosition(new Position(viewSelection.positionLineNumber, viewSelection.positionColumn), position);
			viewSelectionStart = this.coordinatesConverter.validateViewPosition(new Position(viewSelection.selectionStartLineNumber, viewSelection.selectionStartColumn), selectionStart);
		} else {
			viewPosition = this.coordinatesConverter.convertModelPositionToViewPosition(position);
			viewSelectionStart = this.coordinatesConverter.convertModelPositionToViewPosition(selectionStart);
		}

		this._setState(
			new SingleCursorState(new Range(selectionStart.lineNumber, selectionStart.column, selectionStart.lineNumber, selectionStart.column), 0, position, 0),
			new SingleCursorState(new Range(viewSelectionStart.lineNumber, viewSelectionStart.column, viewSelectionStart.lineNumber, viewSelectionStart.column), 0, viewPosition, 0),
			false
		);
	}

	// -------------------- START modifications

	public setState(modelState: SingleCursorState, viewState: SingleCursorState, ensureInEditableRange: boolean): void {
		this._setState(modelState, viewState, ensureInEditableRange);
	}

	public beginRecoverSelectionFromMarkers(): Selection {
		const start = this.model._getMarker(this._selStartMarker);
		const end = this.model._getMarker(this._selEndMarker);

		if (this.modelState.selection.getDirection() === SelectionDirection.LTR) {
			return new Selection(start.lineNumber, start.column, end.lineNumber, end.column);
		}

		return new Selection(end.lineNumber, end.column, start.lineNumber, start.column);
	}

	public endRecoverSelectionFromMarkers(recoveredSelection: Selection): boolean {

		const selectionStart = new Range(recoveredSelection.selectionStartLineNumber, recoveredSelection.selectionStartColumn, recoveredSelection.selectionStartLineNumber, recoveredSelection.selectionStartColumn);
		const position = new Position(recoveredSelection.positionLineNumber, recoveredSelection.positionColumn);

		const viewSelectionStart = this.coordinatesConverter.convertModelRangeToViewRange(selectionStart);
		const viewPosition = this.coordinatesConverter.convertViewPositionToModelPosition(position);

		this._setState(
			new SingleCursorState(selectionStart, 0, position, 0),
			new SingleCursorState(viewSelectionStart, 0, viewPosition, 0),
			false
		);

		return true;
	}

	// -------------------- END modifications

	// -------------------- START reading API

	public validatePosition(position: editorCommon.IPosition): Position {
		return this.model.validatePosition(position);
	}

	public validateViewPosition(viewLineNumber: number, viewColumn: number, modelPosition: Position): Position {
		return this.coordinatesConverter.validateViewPosition(new Position(viewLineNumber, viewColumn), modelPosition);
	}

	public convertViewSelectionToModelSelection(viewSelection: Selection): Selection {
		return this.coordinatesConverter.convertViewSelectionToModelSelection(viewSelection);
	}

	public convertViewToModelPosition(lineNumber: number, column: number): Position {
		return this.coordinatesConverter.convertViewPositionToModelPosition(new Position(lineNumber, column));
	}

	public convertModelPositionToViewPosition(lineNumber: number, column: number): Position {
		return this.coordinatesConverter.convertModelPositionToViewPosition(new Position(lineNumber, column));
	}

	public getCurrentCompletelyVisibleViewLinesRangeInViewport(): Range {
		return this.viewModelHelper.getCompletelyVisibleViewRange();
	}

	public getCurrentCompletelyVisibleModelLinesRangeInViewport(): Range {
		const viewRange = this.viewModelHelper.getCompletelyVisibleViewRange();
		return this.coordinatesConverter.convertViewRangeToModelRange(viewRange);
	}

	// -- model
	public getRangeToRevealModelLinesBeforeViewPortTop(noOfLinesBeforeTop: number): Range {
		let visibleModelRange = this.getCurrentCompletelyVisibleModelLinesRangeInViewport();

		let startLineNumber: number;
		if (this.model.getLineMinColumn(visibleModelRange.startLineNumber) !== visibleModelRange.startColumn) {
			// Start line is partially visible by wrapping so reveal start line
			startLineNumber = visibleModelRange.startLineNumber;
		} else {
			// Reveal previous line
			startLineNumber = visibleModelRange.startLineNumber - 1;
		}

		startLineNumber -= (noOfLinesBeforeTop - 1);
		startLineNumber = this.model.validateRange({ startLineNumber, startColumn: 1, endLineNumber: startLineNumber, endColumn: 1 }).startLineNumber;
		let startColumn = this.model.getLineMinColumn(startLineNumber);
		let endColumn = this.model.getLineMaxColumn(visibleModelRange.startLineNumber);

		return new Range(startLineNumber, startColumn, startLineNumber, endColumn);
	}

	public getRangeToRevealModelLinesAfterViewPortBottom(noOfLinesAfterBottom: number): Range {
		let visibleModelRange = this.getCurrentCompletelyVisibleModelLinesRangeInViewport();

		// Last line in the view port is not considered revealed because scroll bar would cover it
		// Hence consider last line to reveal in the range
		let startLineNumber = visibleModelRange.endLineNumber + (noOfLinesAfterBottom - 1);
		startLineNumber = this.model.validateRange({ startLineNumber, startColumn: 1, endLineNumber: startLineNumber, endColumn: 1 }).startLineNumber;
		let startColumn = this.model.getLineMinColumn(startLineNumber);
		let endColumn = this.model.getLineMaxColumn(startLineNumber);

		return new Range(startLineNumber, startColumn, startLineNumber, endColumn);
	}

	// -- view

	public isLastLineVisibleInViewPort(): boolean {
		return this.viewModel.getLineCount() <= this.getCurrentCompletelyVisibleViewLinesRangeInViewport().getEndPosition().lineNumber;
	}

	// -------------------- END reading API
}

export class OneCursorOp {

	// -------------------- START handlers that simply change cursor state

	public static moveTo(cursor: OneCursor, inSelectionMode: boolean, _position: editorCommon.IPosition, _viewPosition: editorCommon.IPosition): CursorState {
		const position = cursor.model.validatePosition(_position);
		const viewPosition = (
			_viewPosition
				? cursor.validateViewPosition(_viewPosition.lineNumber, _viewPosition.column, position)
				: cursor.convertModelPositionToViewPosition(position.lineNumber, position.column)
		);
		return this._fromViewCursorState(cursor, cursor.viewState.move(inSelectionMode, viewPosition.lineNumber, viewPosition.column, 0));
	}

	public static move(cursors: OneCursor[], moveParams: CursorMoveArguments): CursorState[] {
		if (!moveParams.to) {
			return null;
		}

		const inSelectionMode = !!moveParams.select;
		switch (moveParams.to) {
			case editorCommon.CursorMovePosition.Left: {
				if (moveParams.by === editorCommon.CursorMoveByUnit.HalfLine) {
					// Move left by half the current line length
					return this._moveHalfLineLeft(cursors, inSelectionMode);
				} else {
					// Move left by `moveParams.value` columns
					return this._moveLeft(cursors, inSelectionMode, moveParams.value);
				}
			}
			case editorCommon.CursorMovePosition.Right: {
				if (moveParams.by === editorCommon.CursorMoveByUnit.HalfLine) {
					// Move right by half the current line length
					return this._moveHalfLineRight(cursors, inSelectionMode);
				} else {
					// Move right by `moveParams.value` columns
					return this._moveRight(cursors, inSelectionMode, moveParams.value);
				}
			}
			case editorCommon.CursorMovePosition.Up: {
				const linesCount = (moveParams.isPaged ? (moveParams.pageSize || cursors[0].config.pageSize) : moveParams.value) || 1;
				if (moveParams.by === editorCommon.CursorMoveByUnit.WrappedLine) {
					// Move up by `linesCount` view lines
					return this._moveUpByViewLines(cursors, inSelectionMode, linesCount);
				} else {
					// Move up by `linesCount` model lines
					return this._moveUpByModelLines(cursors, inSelectionMode, linesCount);
				}
			}
			case editorCommon.CursorMovePosition.Down: {
				const linesCount = (moveParams.isPaged ? (moveParams.pageSize || cursors[0].config.pageSize) : moveParams.value) || 1;
				if (editorCommon.CursorMoveByUnit.WrappedLine === moveParams.by) {
					// Move down by `linesCount` view lines
					return this._moveDownByViewLines(cursors, inSelectionMode, linesCount);
				} else {
					// Move down by `linesCount` model lines
					return this._moveDownByModelLines(cursors, inSelectionMode, linesCount);
				}
			}
			case editorCommon.CursorMovePosition.WrappedLineStart: {
				// Move to the beginning of the current view line
				return this._moveToViewMinColumn(cursors, inSelectionMode);
			}
			case editorCommon.CursorMovePosition.WrappedLineFirstNonWhitespaceCharacter: {
				// Move to the first non-whitespace column of the current view line
				return this._moveToViewFirstNonWhitespaceColumn(cursors, inSelectionMode);
			}
			case editorCommon.CursorMovePosition.WrappedLineColumnCenter: {
				// Move to the "center" of the current view line
				return this._moveToViewCenterColumn(cursors, inSelectionMode);
			}
			case editorCommon.CursorMovePosition.WrappedLineEnd: {
				// Move to the end of the current view line
				return this._moveToViewMaxColumn(cursors, inSelectionMode);
			}
			case editorCommon.CursorMovePosition.WrappedLineLastNonWhitespaceCharacter: {
				// Move to the last non-whitespace column of the current view line
				return this._moveToViewLastNonWhitespaceColumn(cursors, inSelectionMode);
			}
			case editorCommon.CursorMovePosition.ViewPortTop: {
				// Move to the nth line start in the viewport (from the top)
				const cnt = (moveParams.value || 1);
				const cursor = cursors[0];
				const visibleModelRange = cursor.getCurrentCompletelyVisibleModelLinesRangeInViewport();
				const modelLineNumber = this._firstLineNumberInRange(cursor.model, visibleModelRange, cnt);
				const modelColumn = cursor.model.getLineFirstNonWhitespaceColumn(modelLineNumber);
				return [this._moveToModelPosition(cursor, inSelectionMode, modelLineNumber, modelColumn)];
			}
			case editorCommon.CursorMovePosition.ViewPortBottom: {
				// Move to the nth line start in the viewport (from the bottom)
				const cnt = (moveParams.value || 1);
				const cursor = cursors[0];
				const visibleModelRange = cursor.getCurrentCompletelyVisibleModelLinesRangeInViewport();
				const modelLineNumber = this._lastLineNumberInRange(cursor.model, visibleModelRange, cnt);
				const modelColumn = cursor.model.getLineFirstNonWhitespaceColumn(modelLineNumber);
				return [this._moveToModelPosition(cursor, inSelectionMode, modelLineNumber, modelColumn)];
			}
			case editorCommon.CursorMovePosition.ViewPortCenter: {
				// Move to the line start in the viewport center
				const cursor = cursors[0];
				const visibleModelRange = cursor.getCurrentCompletelyVisibleModelLinesRangeInViewport();
				const modelLineNumber = Math.round((visibleModelRange.startLineNumber + visibleModelRange.endLineNumber) / 2);
				const modelColumn = cursor.model.getLineFirstNonWhitespaceColumn(modelLineNumber);
				return [this._moveToModelPosition(cursor, inSelectionMode, modelLineNumber, modelColumn)];
			}
			case editorCommon.CursorMovePosition.ViewPortIfOutside: {
				// Move to a position inside the viewport
				const visibleViewRange = cursors[0].getCurrentCompletelyVisibleViewLinesRangeInViewport();
				let result: CursorState[] = [];
				for (let i = 0, len = cursors.length; i < len; i++) {
					const cursor = cursors[i];
					let viewLineNumber = cursor.viewState.position.lineNumber;

					if (visibleViewRange.startLineNumber <= viewLineNumber && viewLineNumber <= visibleViewRange.endLineNumber) {
						// Nothing to do, cursor is in viewport
						result[i] = new CursorState(cursor.modelState, cursor.viewState);

					} else {
						if (viewLineNumber > visibleViewRange.endLineNumber) {
							viewLineNumber = visibleViewRange.endLineNumber - 1;
						}
						if (viewLineNumber < visibleViewRange.startLineNumber) {
							viewLineNumber = visibleViewRange.startLineNumber;
						}
						const viewColumn = cursor.viewModel.getLineFirstNonWhitespaceColumn(viewLineNumber);
						result[i] = this._moveToViewPosition(cursor, inSelectionMode, viewLineNumber, viewColumn);
					}
				}
				return result;
			}
		}

		return null;
	}

	/**
	 * Find the nth line start included in the range (from the start).
	 */
	private static _firstLineNumberInRange(model: ICursorSimpleModel, range: Range, count: number): number {
		let startLineNumber = range.startLineNumber;
		if (range.startColumn !== model.getLineMinColumn(startLineNumber)) {
			// Move on to the second line if the first line start is not included in the range
			startLineNumber++;
		}

		return Math.min(range.endLineNumber, startLineNumber + count - 1);
	}

	/**
	 * Find the nth line start included in the range (from the end).
	 */
	private static _lastLineNumberInRange(model: ICursorSimpleModel, range: Range, count: number): number {
		let startLineNumber = range.startLineNumber;
		if (range.startColumn !== model.getLineMinColumn(startLineNumber)) {
			// Move on to the second line if the first line start is not included in the range
			startLineNumber++;
		}

		return Math.max(startLineNumber, range.endLineNumber - count + 1);
	}

	private static _fromModelCursorState(cursor: OneCursor, modelState: SingleCursorState): CursorState {
		let viewSelectionStart1 = cursor.convertModelPositionToViewPosition(modelState.selectionStart.startLineNumber, modelState.selectionStart.startColumn);
		let viewSelectionStart2 = cursor.convertModelPositionToViewPosition(modelState.selectionStart.endLineNumber, modelState.selectionStart.endColumn);
		let viewSelectionStart = new Range(viewSelectionStart1.lineNumber, viewSelectionStart1.column, viewSelectionStart2.lineNumber, viewSelectionStart2.column);
		let viewPosition = cursor.convertModelPositionToViewPosition(modelState.position.lineNumber, modelState.position.column);
		return new CursorState(
			modelState,
			new SingleCursorState(viewSelectionStart, modelState.selectionStartLeftoverVisibleColumns, viewPosition, modelState.leftoverVisibleColumns)
		);
	}

	private static _fromViewCursorState(cursor: OneCursor, viewState: SingleCursorState): CursorState {
		let selectionStart1 = cursor.convertViewToModelPosition(viewState.selectionStart.startLineNumber, viewState.selectionStart.startColumn);
		let selectionStart2 = cursor.convertViewToModelPosition(viewState.selectionStart.endLineNumber, viewState.selectionStart.endColumn);
		let selectionStart = new Range(selectionStart1.lineNumber, selectionStart1.column, selectionStart2.lineNumber, selectionStart2.column);
		let position = cursor.convertViewToModelPosition(viewState.position.lineNumber, viewState.position.column);
		return new CursorState(
			new SingleCursorState(selectionStart, viewState.selectionStartLeftoverVisibleColumns, position, viewState.leftoverVisibleColumns),
			viewState
		);
	}

	private static _moveLeft(cursors: OneCursor[], inSelectionMode: boolean, noOfColumns: number = 1): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromViewCursorState(cursor, MoveOperations.moveLeft(cursor.config, cursor.viewModel, cursor.viewState, inSelectionMode, noOfColumns));
		}
		return result;
	}

	private static _moveHalfLineLeft(cursors: OneCursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const halfLine = Math.round(cursor.viewModel.getLineContent(viewLineNumber).length / 2);
			result[i] = this._fromViewCursorState(cursor, MoveOperations.moveLeft(cursor.config, cursor.viewModel, cursor.viewState, inSelectionMode, halfLine));
		}
		return result;
	}

	private static _moveRight(cursors: OneCursor[], inSelectionMode: boolean, noOfColumns: number = 1): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromViewCursorState(cursor, MoveOperations.moveRight(cursor.config, cursor.viewModel, cursor.viewState, inSelectionMode, noOfColumns));
		}
		return result;
	}

	private static _moveHalfLineRight(cursors: OneCursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const halfLine = Math.round(cursor.viewModel.getLineContent(viewLineNumber).length / 2);
			result[i] = this._fromViewCursorState(cursor, MoveOperations.moveRight(cursor.config, cursor.viewModel, cursor.viewState, inSelectionMode, halfLine));
		}
		return result;
	}

	private static _moveDownByViewLines(cursors: OneCursor[], inSelectionMode: boolean, linesCount: number): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromViewCursorState(cursor, MoveOperations.moveDown(cursor.config, cursor.viewModel, cursor.viewState, inSelectionMode, linesCount));
		}
		return result;
	}

	private static _moveDownByModelLines(cursors: OneCursor[], inSelectionMode: boolean, linesCount: number): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromModelCursorState(cursor, MoveOperations.moveDown(cursor.config, cursor.model, cursor.modelState, inSelectionMode, linesCount));
		}
		return result;
	}

	private static _moveUpByViewLines(cursors: OneCursor[], inSelectionMode: boolean, linesCount: number): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromViewCursorState(cursor, MoveOperations.moveUp(cursor.config, cursor.viewModel, cursor.viewState, inSelectionMode, linesCount));
		}
		return result;
	}

	private static _moveUpByModelLines(cursors: OneCursor[], inSelectionMode: boolean, linesCount: number): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromModelCursorState(cursor, MoveOperations.moveUp(cursor.config, cursor.model, cursor.modelState, inSelectionMode, linesCount));
		}
		return result;
	}

	private static _moveToViewPosition(cursor: OneCursor, inSelectionMode: boolean, toViewLineNumber: number, toViewColumn: number): CursorState {
		return this._fromViewCursorState(cursor, cursor.viewState.move(inSelectionMode, toViewLineNumber, toViewColumn, 0));
	}

	private static _moveToModelPosition(cursor: OneCursor, inSelectionMode: boolean, toModelLineNumber: number, toModelColumn: number): CursorState {
		return this._fromModelCursorState(cursor, cursor.modelState.move(inSelectionMode, toModelLineNumber, toModelColumn, 0));
	}

	private static _moveToViewMinColumn(cursors: OneCursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const viewColumn = cursor.viewModel.getLineMinColumn(viewLineNumber);
			result[i] = this._moveToViewPosition(cursor, inSelectionMode, viewLineNumber, viewColumn);
		}
		return result;
	}

	private static _moveToViewFirstNonWhitespaceColumn(cursors: OneCursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const viewColumn = cursor.viewModel.getLineFirstNonWhitespaceColumn(viewLineNumber);
			result[i] = this._moveToViewPosition(cursor, inSelectionMode, viewLineNumber, viewColumn);
		}
		return result;
	}

	private static _moveToViewCenterColumn(cursors: OneCursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const viewColumn = Math.round((cursor.viewModel.getLineMaxColumn(viewLineNumber) + cursor.viewModel.getLineMinColumn(viewLineNumber)) / 2);
			result[i] = this._moveToViewPosition(cursor, inSelectionMode, viewLineNumber, viewColumn);
		}
		return result;
	}

	private static _moveToViewMaxColumn(cursors: OneCursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const viewColumn = cursor.viewModel.getLineMaxColumn(viewLineNumber);
			result[i] = this._moveToViewPosition(cursor, inSelectionMode, viewLineNumber, viewColumn);
		}
		return result;
	}

	private static _moveToViewLastNonWhitespaceColumn(cursors: OneCursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const viewColumn = cursor.viewModel.getLineLastNonWhitespaceColumn(viewLineNumber);
			result[i] = this._moveToViewPosition(cursor, inSelectionMode, viewLineNumber, viewColumn);
		}
		return result;
	}

	public static addCursorDown(cursors: OneCursor[]): CursorState[] {
		let result: CursorState[] = [], resultLen = 0;
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[resultLen++] = new CursorState(cursor.modelState, cursor.viewState);
			result[resultLen++] = this._fromViewCursorState(cursor, MoveOperations.translateDown(cursor.config, cursor.viewModel, cursor.viewState));
		}
		return result;
	}

	public static addCursorUp(cursors: OneCursor[]): CursorState[] {
		let result: CursorState[] = [], resultLen = 0;
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[resultLen++] = new CursorState(cursor.modelState, cursor.viewState);
			result[resultLen++] = this._fromViewCursorState(cursor, MoveOperations.translateUp(cursor.config, cursor.viewModel, cursor.viewState));
		}
		return result;
	}

	public static moveToBeginningOfLine(cursors: OneCursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromViewCursorState(cursor, MoveOperations.moveToBeginningOfLine(cursor.config, cursor.viewModel, cursor.viewState, inSelectionMode));
		}
		return result;
	}

	public static moveToEndOfLine(cursors: OneCursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromViewCursorState(cursor, MoveOperations.moveToEndOfLine(cursor.config, cursor.viewModel, cursor.viewState, inSelectionMode));
		}
		return result;
	}

	public static expandLineSelection(cursors: OneCursor[]): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];

			const viewSelection = cursor.viewState.selection;
			const startLineNumber = viewSelection.startLineNumber;
			const lineCount = cursor.viewModel.getLineCount();

			let endLineNumber = viewSelection.endLineNumber;
			let endColumn: number;
			if (endLineNumber === lineCount) {
				endColumn = cursor.viewModel.getLineMaxColumn(lineCount);
			} else {
				endLineNumber++;
				endColumn = 1;
			}

			result[i] = this._fromViewCursorState(cursor, new SingleCursorState(
				new Range(startLineNumber, 1, startLineNumber, 1), 0,
				new Position(endLineNumber, endColumn), 0
			));
		}
		return result;
	}

	public static moveToBeginningOfBuffer(cursors: OneCursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromModelCursorState(cursor, MoveOperations.moveToBeginningOfBuffer(cursor.config, cursor.model, cursor.modelState, inSelectionMode));
		}
		return result;
	}

	public static moveToEndOfBuffer(cursors: OneCursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromModelCursorState(cursor, MoveOperations.moveToEndOfBuffer(cursor.config, cursor.model, cursor.modelState, inSelectionMode));
		}
		return result;
	}

	public static selectAll(cursor: OneCursor): CursorState {

		if (cursor.model.hasEditableRange()) {
			// Toggle between selecting editable range and selecting the entire buffer

			const editableRange = cursor.model.getEditableRange();
			const selection = cursor.modelState.selection;

			if (!selection.equalsRange(editableRange)) {
				// Selection is not editable range => select editable range
				return this._fromModelCursorState(cursor, new SingleCursorState(
					new Range(editableRange.startLineNumber, editableRange.startColumn, editableRange.startLineNumber, editableRange.startColumn), 0,
					new Position(editableRange.endLineNumber, editableRange.endColumn), 0
				));
			}
		}

		const lineCount = cursor.model.getLineCount();
		const maxColumn = cursor.model.getLineMaxColumn(lineCount);

		return this._fromModelCursorState(cursor, new SingleCursorState(
			new Range(1, 1, 1, 1), 0,
			new Position(lineCount, maxColumn), 0
		));
	}

	public static line(cursor: OneCursor, inSelectionMode: boolean, _position: editorCommon.IPosition, _viewPosition: editorCommon.IPosition): CursorState {
		const position = cursor.validatePosition(_position);
		const viewPosition = (
			_viewPosition
				? cursor.validateViewPosition(_viewPosition.lineNumber, _viewPosition.column, position)
				: cursor.convertModelPositionToViewPosition(position.lineNumber, position.column)
		);

		if (!inSelectionMode || !cursor.modelState.hasSelection()) {
			// Entering line selection for the first time
			const lineCount = cursor.model.getLineCount();

			let selectToLineNumber = position.lineNumber + 1;
			let selectToColumn = 1;
			if (selectToLineNumber > lineCount) {
				selectToLineNumber = lineCount;
				selectToColumn = cursor.model.getLineMaxColumn(selectToLineNumber);
			}

			return this._fromModelCursorState(cursor, new SingleCursorState(
				new Range(position.lineNumber, 1, selectToLineNumber, selectToColumn), 0,
				new Position(selectToLineNumber, selectToColumn), 0
			));
		}

		// Continuing line selection
		const enteringLineNumber = cursor.modelState.selectionStart.getStartPosition().lineNumber;

		if (position.lineNumber < enteringLineNumber) {

			return this._fromViewCursorState(cursor, cursor.viewState.move(
				cursor.modelState.hasSelection(), viewPosition.lineNumber, 1, 0
			));

		} else if (position.lineNumber > enteringLineNumber) {

			const lineCount = cursor.viewModel.getLineCount();

			let selectToViewLineNumber = viewPosition.lineNumber + 1;
			let selectToViewColumn = 1;
			if (selectToViewLineNumber > lineCount) {
				selectToViewLineNumber = lineCount;
				selectToViewColumn = cursor.viewModel.getLineMaxColumn(selectToViewLineNumber);
			}

			return this._fromViewCursorState(cursor, cursor.viewState.move(
				cursor.modelState.hasSelection(), selectToViewLineNumber, selectToViewColumn, 0
			));

		} else {

			const endPositionOfSelectionStart = cursor.modelState.selectionStart.getEndPosition();
			return this._fromModelCursorState(cursor, cursor.modelState.move(
				cursor.modelState.hasSelection(), endPositionOfSelectionStart.lineNumber, endPositionOfSelectionStart.column, 0
			));

		}
	}

	public static word(cursor: OneCursor, inSelectionMode: boolean, _position: editorCommon.IPosition): CursorState {
		const position = cursor.validatePosition(_position);
		return this._fromModelCursorState(cursor, WordOperations.word(cursor.config, cursor.model, cursor.modelState, inSelectionMode, position));
	}

	public static cancelSelection(cursor: OneCursor): CursorState {
		if (!cursor.modelState.hasSelection()) {
			return new CursorState(cursor.modelState, cursor.viewState);
		}

		const lineNumber = cursor.viewState.position.lineNumber;
		const column = cursor.viewState.position.column;

		return this._fromViewCursorState(cursor, new SingleCursorState(
			new Range(lineNumber, column, lineNumber, column), 0,
			new Position(lineNumber, column), 0
		));
	}

	// -------------------- STOP handlers that simply change cursor state
}
