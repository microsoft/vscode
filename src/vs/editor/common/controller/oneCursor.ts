/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { illegalArgument } from 'vs/base/common/errors';
import { SingleCursorState, CursorConfiguration, ICursorSimpleModel } from 'vs/editor/common/controller/cursorCommon';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection, SelectionDirection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IDisposable } from 'vs/base/common/lifecycle';
import { MoveOperations, SingleMoveOperationResult } from 'vs/editor/common/controller/cursorMoveOperations';
import { WordOperations, WordNavigationType } from 'vs/editor/common/controller/cursorWordOperations';

export interface IOneCursorOperationContext {
	cursorPositionChangeReason: editorCommon.CursorChangeReason;
	shouldReveal: boolean;
	shouldRevealVerticalInCenter: boolean;
	shouldRevealHorizontal: boolean;
	shouldPushStackElementBefore: boolean;
	shouldPushStackElementAfter: boolean;
	executeCommand: editorCommon.ICommand;
	isAutoWhitespaceCommand: boolean;
}

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

	viewModel: ICursorSimpleModel;

	getCurrentCompletelyVisibleViewLinesRangeInViewport(): Range;
	getCurrentCompletelyVisibleModelLinesRangeInViewport(): Range;

	convertModelPositionToViewPosition(lineNumber: number, column: number): Position;
	convertModelRangeToViewRange(modelRange: Range): Range;

	convertViewToModelPosition(lineNumber: number, column: number): Position;
	convertViewSelectionToModelSelection(viewSelection: Selection): Selection;

	validateViewPosition(viewPosition: Position, modelPosition: Position): Position;
	validateViewRange(viewRange: Range, modelRange: Range): Range;
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

export class MoveOperationResult {

	readonly modelState: SingleCursorState;
	readonly viewState: SingleCursorState;
	readonly ensureInEditableRange: boolean;
	readonly reason: editorCommon.CursorChangeReason;

	constructor(
		modelState: SingleCursorState,
		viewState: SingleCursorState,
		ensureInEditableRange: boolean,
		reason: editorCommon.CursorChangeReason
	) {
		this.modelState = modelState;
		this.viewState = viewState;
		this.ensureInEditableRange = ensureInEditableRange;
		this.reason = reason;
	}

}

export class OneCursor implements IOneCursor {

	// --- contextual state
	public readonly model: editorCommon.IModel;
	public readonly viewModel: ICursorSimpleModel;
	private readonly configuration: editorCommon.IConfiguration;
	private readonly viewModelHelper: IViewModelHelper;

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
		let viewSelectionStart = this.viewModelHelper.validateViewRange(viewState.selectionStart, modelState.selectionStart);
		let viewPosition = this.viewModelHelper.validateViewPosition(viewState.position, modelState.position);
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

		let viewPosition = this.viewModelHelper.validateViewPosition(new Position(state.viewPosition.lineNumber, state.viewPosition.column), position);
		let viewSelectionStart: Range;
		if (state.viewSelectionStart) {
			viewSelectionStart = this.viewModelHelper.validateViewRange(new Range(state.viewSelectionStart.startLineNumber, state.viewSelectionStart.startColumn, state.viewSelectionStart.endLineNumber, state.viewSelectionStart.endColumn), selectionStart);
		} else {
			viewSelectionStart = this.viewModelHelper.convertModelRangeToViewRange(selectionStart);
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

	public duplicate(): OneCursor {
		let result = new OneCursor(this.model, this.configuration, this.modeConfiguration, this.viewModelHelper);
		result._setState(
			this.modelState,
			this.viewState,
			false
		);
		return result;
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
			viewPosition = this.viewModelHelper.validateViewPosition(new Position(viewSelection.positionLineNumber, viewSelection.positionColumn), position);
			viewSelectionStart = this.viewModelHelper.validateViewPosition(new Position(viewSelection.selectionStartLineNumber, viewSelection.selectionStartColumn), selectionStart);
		} else {
			viewPosition = this.viewModelHelper.convertModelPositionToViewPosition(position.lineNumber, position.column);
			viewSelectionStart = this.viewModelHelper.convertModelPositionToViewPosition(selectionStart.lineNumber, selectionStart.column);
		}

		this._setState(
			new SingleCursorState(new Range(selectionStart.lineNumber, selectionStart.column, selectionStart.lineNumber, selectionStart.column), 0, position, 0),
			new SingleCursorState(new Range(viewSelectionStart.lineNumber, viewSelectionStart.column, viewSelectionStart.lineNumber, viewSelectionStart.column), 0, viewPosition, 0),
			false
		);
	}

	// -------------------- START modifications

	public setSelectionStart(range: Range): void {
		this._setState(
			this.modelState.withSelectionStart(range),
			this.viewState.withSelectionStart(this.viewModelHelper.convertModelRangeToViewRange(range)),
			false
		);
	}

	public collapseSelection(): void {
		this._setState(
			this.modelState.collapse(),
			this.viewState.collapse(),
			false
		);
	}

	public moveModelPosition(inSelectionMode: boolean, lineNumber: number, column: number, leftoverVisibleColumns: number, ensureInEditableRange: boolean): void {
		let viewPosition = this.viewModelHelper.convertModelPositionToViewPosition(lineNumber, column);
		this._move(inSelectionMode, lineNumber, column, viewPosition.lineNumber, viewPosition.column, leftoverVisibleColumns, ensureInEditableRange);
	}

	public moveViewPosition(inSelectionMode: boolean, viewLineNumber: number, viewColumn: number, leftoverVisibleColumns: number, ensureInEditableRange: boolean): void {
		let modelPosition = this.viewModelHelper.convertViewToModelPosition(viewLineNumber, viewColumn);
		this._move(inSelectionMode, modelPosition.lineNumber, modelPosition.column, viewLineNumber, viewColumn, leftoverVisibleColumns, ensureInEditableRange);
	}

	private _move(inSelectionMode: boolean, lineNumber: number, column: number, viewLineNumber: number, viewColumn: number, leftoverVisibleColumns: number, ensureInEditableRange: boolean): void {
		this._setState(
			this.modelState.move(inSelectionMode, new Position(lineNumber, column), leftoverVisibleColumns),
			this.viewState.move(inSelectionMode, new Position(viewLineNumber, viewColumn), leftoverVisibleColumns),
			ensureInEditableRange
		);
	}

	public setState(modelState: SingleCursorState, viewState: SingleCursorState, ensureInEditableRange: boolean): void {
		this._setState(modelState, viewState, ensureInEditableRange);
	}

	public beginRecoverSelectionFromMarkers(): Selection {
		let start = this.model._getMarker(this._selStartMarker);
		let end = this.model._getMarker(this._selEndMarker);

		if (this.modelState.selection.getDirection() === SelectionDirection.LTR) {
			return new Selection(start.lineNumber, start.column, end.lineNumber, end.column);
		}

		return new Selection(end.lineNumber, end.column, start.lineNumber, start.column);
	}

	public endRecoverSelectionFromMarkers(ctx: IOneCursorOperationContext, recoveredSelection: Selection): boolean {
		ctx.cursorPositionChangeReason = editorCommon.CursorChangeReason.RecoverFromMarkers;
		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;
		ctx.shouldReveal = false;
		ctx.shouldRevealHorizontal = false;

		let selectionStart = new Range(recoveredSelection.selectionStartLineNumber, recoveredSelection.selectionStartColumn, recoveredSelection.selectionStartLineNumber, recoveredSelection.selectionStartColumn);
		let position = new Position(recoveredSelection.positionLineNumber, recoveredSelection.positionColumn);

		let viewSelectionStart = this.viewModelHelper.convertModelRangeToViewRange(selectionStart);
		let viewPosition = this.viewModelHelper.convertViewToModelPosition(position.lineNumber, position.column);

		this._setState(
			new SingleCursorState(selectionStart, 0, position, 0),
			new SingleCursorState(viewSelectionStart, 0, viewPosition, 0),
			false
		);

		return true;
	}

	// -------------------- END modifications

	// -------------------- START reading API

	public setSelectionStartLeftoverVisibleColumns(value: number): void {
		this._setState(
			this.modelState.withSelectionStartLeftoverVisibleColumns(value),
			this.viewState.withSelectionStartLeftoverVisibleColumns(value),
			false
		);
	}

	// -- utils
	public validatePosition(position: editorCommon.IPosition): Position {
		return this.model.validatePosition(position);
	}
	public validateViewPosition(viewLineNumber: number, viewColumn: number, modelPosition: Position): Position {
		return this.viewModelHelper.validateViewPosition(new Position(viewLineNumber, viewColumn), modelPosition);
	}
	public convertViewSelectionToModelSelection(viewSelection: Selection): Selection {
		return this.viewModelHelper.convertViewSelectionToModelSelection(viewSelection);
	}
	public convertViewToModelPosition(lineNumber: number, column: number): Position {
		return this.viewModelHelper.convertViewToModelPosition(lineNumber, column);
	}

	public convertModelPositionToViewPosition(lineNumber: number, column: number): Position {
		return this.viewModelHelper.convertModelPositionToViewPosition(lineNumber, column);
	}

	// -- model
	public getRangeToRevealModelLinesBeforeViewPortTop(noOfLinesBeforeTop: number): Range {
		let visibleModelRange = this.viewModelHelper.getCurrentCompletelyVisibleModelLinesRangeInViewport();

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
		let visibleModelRange = this.viewModelHelper.getCurrentCompletelyVisibleModelLinesRangeInViewport();

		// Last line in the view port is not considered revealed because scroll bar would cover it
		// Hence consider last line to reveal in the range
		let startLineNumber = visibleModelRange.endLineNumber + (noOfLinesAfterBottom - 1);
		startLineNumber = this.model.validateRange({ startLineNumber, startColumn: 1, endLineNumber: startLineNumber, endColumn: 1 }).startLineNumber;
		let startColumn = this.model.getLineMinColumn(startLineNumber);
		let endColumn = this.model.getLineMaxColumn(startLineNumber);

		return new Range(startLineNumber, startColumn, startLineNumber, endColumn);
	}
	public getLineFromViewPortTop(lineFromTop: number = 1): number {
		let visibleRange = this.viewModelHelper.getCurrentCompletelyVisibleModelLinesRangeInViewport();
		let startColumn = this.model.getLineMinColumn(visibleRange.startLineNumber);
		// Use next line if the first line is partially visible
		let visibleLineNumber = visibleRange.startColumn === startColumn ? visibleRange.startLineNumber : visibleRange.startLineNumber + 1;
		visibleLineNumber = visibleLineNumber + lineFromTop - 1;
		return visibleLineNumber > visibleRange.endLineNumber ? visibleRange.endLineNumber : visibleLineNumber;
	}
	public getCenterLineInViewPort(): number {
		return Math.round((this.getLineFromViewPortTop() + this.getLineFromViewPortBottom() - 1) / 2);
	}
	public getLineFromViewPortBottom(lineFromBottom: number = 1): number {
		let visibleRange = this.viewModelHelper.getCurrentCompletelyVisibleModelLinesRangeInViewport();
		let visibleLineNumber = visibleRange.endLineNumber - (lineFromBottom - 1);
		return visibleLineNumber > visibleRange.startLineNumber ? visibleLineNumber : this.getLineFromViewPortTop();
	}

	// -- view
	public isLastLineVisibleInViewPort(): boolean {
		return this.viewModel.getLineCount() <= this.getCompletelyVisibleViewLinesRangeInViewport().getEndPosition().lineNumber;
	}
	public getCompletelyVisibleViewLinesRangeInViewport(): Range {
		return this.viewModelHelper.getCurrentCompletelyVisibleViewLinesRangeInViewport();
	}
	public getRevealViewLinesRangeInViewport(): Range {
		let visibleRange = this.getCompletelyVisibleViewLinesRangeInViewport().cloneRange();
		if (!this.isLastLineVisibleInViewPort() && visibleRange.endLineNumber > visibleRange.startLineNumber) {
			visibleRange = new Range(
				visibleRange.startLineNumber,
				visibleRange.startColumn,
				visibleRange.endLineNumber - 1,
				this.viewModel.getLineLastNonWhitespaceColumn(visibleRange.endLineNumber - 1)
			);
		}
		return visibleRange;
	}
	public getNearestRevealViewPositionInViewport(): Position {
		const position = this.viewState.position;
		const revealRange = this.getRevealViewLinesRangeInViewport();

		if (position.lineNumber < revealRange.startLineNumber) {
			return new Position(revealRange.startLineNumber, this.viewModel.getLineFirstNonWhitespaceColumn(revealRange.startLineNumber));
		}

		if (position.lineNumber > revealRange.endLineNumber) {
			return new Position(revealRange.endLineNumber, this.viewModel.getLineFirstNonWhitespaceColumn(revealRange.endLineNumber));
		}

		return position;
	}
	// -------------------- END reading API
}

export class OneCursorOp {

	// -------------------- START handlers that simply change cursor state

	public static moveTo(cursor: OneCursor, inSelectionMode: boolean, position: editorCommon.IPosition, viewPosition: editorCommon.IPosition, eventSource: string, ctx: IOneCursorOperationContext): boolean {
		let validatedPosition = cursor.model.validatePosition(position);
		let validatedViewPosition: editorCommon.IPosition;
		if (viewPosition) {
			validatedViewPosition = cursor.validateViewPosition(viewPosition.lineNumber, viewPosition.column, validatedPosition);
		} else {
			validatedViewPosition = cursor.convertModelPositionToViewPosition(validatedPosition.lineNumber, validatedPosition.column);
		}

		let reason = (eventSource === 'mouse' ? editorCommon.CursorChangeReason.Explicit : editorCommon.CursorChangeReason.NotSet);
		if (eventSource === 'api') {
			ctx.shouldRevealVerticalInCenter = true;
		}
		if (reason) {
			ctx.cursorPositionChangeReason = reason;
		}
		cursor.moveViewPosition(inSelectionMode, validatedViewPosition.lineNumber, validatedViewPosition.column, 0, false);
		return true;
	}

	private static _getViewHalfLineSize(cursor: OneCursor, lineNumber: number): number {
		return Math.round((cursor.viewModel.getLineMaxColumn(lineNumber) - cursor.viewModel.getLineMinColumn(lineNumber)) / 2);
	}

	public static move(cursor: OneCursor, moveParams: CursorMoveArguments, eventSource: string, ctx: IOneCursorOperationContext): boolean {
		if (!moveParams.to) {
			illegalArgument('to');
		}

		let inSelectionMode = !!moveParams.select;
		let validatedViewPosition = cursor.viewState.position;
		let viewLineNumber = validatedViewPosition.lineNumber;
		let viewColumn: number;
		switch (moveParams.to) {
			case editorCommon.CursorMovePosition.Left:
				return this._moveLeft(cursor, inSelectionMode, editorCommon.CursorMoveByUnit.HalfLine === moveParams.by ? this._getViewHalfLineSize(cursor, viewLineNumber) : moveParams.value, ctx);
			case editorCommon.CursorMovePosition.Right:
				return this._moveRight(cursor, inSelectionMode, editorCommon.CursorMoveByUnit.HalfLine === moveParams.by ? this._getViewHalfLineSize(cursor, viewLineNumber) : moveParams.value, ctx);
			case editorCommon.CursorMovePosition.Up:
				return this._moveUp(cursor, moveParams, ctx);
			case editorCommon.CursorMovePosition.Down:
				return this._moveDown(cursor, moveParams, ctx);
			case editorCommon.CursorMovePosition.WrappedLineStart:
				viewColumn = cursor.viewModel.getLineMinColumn(viewLineNumber);
				break;
			case editorCommon.CursorMovePosition.WrappedLineFirstNonWhitespaceCharacter:
				viewColumn = cursor.viewModel.getLineFirstNonWhitespaceColumn(viewLineNumber);
				break;
			case editorCommon.CursorMovePosition.WrappedLineColumnCenter:
				viewColumn = Math.round((cursor.viewModel.getLineMaxColumn(viewLineNumber) + cursor.viewModel.getLineMinColumn(viewLineNumber)) / 2);
				break;
			case editorCommon.CursorMovePosition.WrappedLineEnd:
				viewColumn = cursor.viewModel.getLineMaxColumn(viewLineNumber);
				break;
			case editorCommon.CursorMovePosition.WrappedLineLastNonWhitespaceCharacter:
				viewColumn = cursor.viewModel.getLineLastNonWhitespaceColumn(viewLineNumber);
				break;
			case editorCommon.CursorMovePosition.ViewPortTop:
				viewLineNumber = cursor.convertModelPositionToViewPosition(cursor.getLineFromViewPortTop(moveParams.value), 1).lineNumber;
				viewColumn = cursor.viewModel.getLineFirstNonWhitespaceColumn(viewLineNumber);
				break;
			case editorCommon.CursorMovePosition.ViewPortBottom:
				viewLineNumber = cursor.convertModelPositionToViewPosition(cursor.getLineFromViewPortBottom(moveParams.value), 1).lineNumber;;
				viewColumn = cursor.viewModel.getLineFirstNonWhitespaceColumn(viewLineNumber);
				break;
			case editorCommon.CursorMovePosition.ViewPortCenter:
				viewLineNumber = cursor.convertModelPositionToViewPosition(cursor.getCenterLineInViewPort(), 1).lineNumber;;
				viewColumn = cursor.viewModel.getLineFirstNonWhitespaceColumn(viewLineNumber);
				break;
			case editorCommon.CursorMovePosition.ViewPortIfOutside:
				const position = cursor.getNearestRevealViewPositionInViewport();
				viewLineNumber = position.lineNumber;
				viewColumn = position.column;
				break;
			default:
				return false;
		}
		ctx.cursorPositionChangeReason = editorCommon.CursorChangeReason.Explicit;
		cursor.moveViewPosition(inSelectionMode, viewLineNumber, viewColumn, 0, true);
		return true;
	}

	private static _applyMoveOperationResult(cursor: OneCursor, ctx: IOneCursorOperationContext, r: MoveOperationResult): boolean {
		ctx.cursorPositionChangeReason = r.reason;
		cursor.setState(r.modelState, r.viewState, r.ensureInEditableRange);
		return true;
	}

	private static _fromModelCursorState(cursor: OneCursor, r: SingleMoveOperationResult): MoveOperationResult {
		let viewSelectionStart1 = cursor.convertModelPositionToViewPosition(r.state.selectionStart.startLineNumber, r.state.selectionStart.startColumn);
		let viewSelectionStart2 = cursor.convertModelPositionToViewPosition(r.state.selectionStart.endLineNumber, r.state.selectionStart.endColumn);
		let viewSelectionStart = new Range(viewSelectionStart1.lineNumber, viewSelectionStart1.column, viewSelectionStart2.lineNumber, viewSelectionStart2.column);
		let viewPosition = cursor.convertModelPositionToViewPosition(r.state.position.lineNumber, r.state.position.column);
		return new MoveOperationResult(
			r.state,
			new SingleCursorState(viewSelectionStart, r.state.selectionStartLeftoverVisibleColumns, viewPosition, r.state.leftoverVisibleColumns),
			r.ensureInEditableRange,
			r.reason
		);
	}

	private static _fromViewCursorState(cursor: OneCursor, r: SingleMoveOperationResult): MoveOperationResult {
		let selectionStart1 = cursor.convertViewToModelPosition(r.state.selectionStart.startLineNumber, r.state.selectionStart.startColumn);
		let selectionStart2 = cursor.convertViewToModelPosition(r.state.selectionStart.endLineNumber, r.state.selectionStart.endColumn);
		let selectionStart = new Range(selectionStart1.lineNumber, selectionStart1.column, selectionStart2.lineNumber, selectionStart2.column);
		let position = cursor.convertViewToModelPosition(r.state.position.lineNumber, r.state.position.column);
		return new MoveOperationResult(
			new SingleCursorState(selectionStart, r.state.selectionStartLeftoverVisibleColumns, position, r.state.leftoverVisibleColumns),
			r.state,
			r.ensureInEditableRange,
			r.reason
		);
	}

	private static _moveLeft(cursor: OneCursor, inSelectionMode: boolean, noOfColumns: number = 1, ctx: IOneCursorOperationContext): boolean {
		return this._applyMoveOperationResult(
			cursor, ctx,
			this._fromViewCursorState(cursor, MoveOperations.moveLeft(cursor.config, cursor.viewModel, cursor.viewState, inSelectionMode, noOfColumns))
		);
	}

	public static moveWordLeft(cursor: OneCursor, inSelectionMode: boolean, wordNavigationType: WordNavigationType, ctx: IOneCursorOperationContext): boolean {
		return this._applyMoveOperationResult(
			cursor, ctx,
			this._fromModelCursorState(cursor, WordOperations.moveWordLeft(cursor.config, cursor.model, cursor.modelState, inSelectionMode, wordNavigationType))
		);
	}

	private static _moveRight(cursor: OneCursor, inSelectionMode: boolean, noOfColumns: number = 1, ctx: IOneCursorOperationContext): boolean {
		return this._applyMoveOperationResult(
			cursor, ctx,
			this._fromViewCursorState(cursor, MoveOperations.moveRight(cursor.config, cursor.viewModel, cursor.viewState, inSelectionMode, noOfColumns))
		);
	}

	public static moveWordRight(cursor: OneCursor, inSelectionMode: boolean, wordNavigationType: WordNavigationType, ctx: IOneCursorOperationContext): boolean {
		return this._applyMoveOperationResult(
			cursor, ctx,
			this._fromModelCursorState(cursor, WordOperations.moveWordRight(cursor.config, cursor.model, cursor.modelState, inSelectionMode, wordNavigationType))
		);
	}

	private static _moveDown(cursor: OneCursor, moveArguments: CursorMoveArguments, ctx: IOneCursorOperationContext): boolean {
		let linesCount = (moveArguments.isPaged ? (moveArguments.pageSize || cursor.config.pageSize) : moveArguments.value) || 1;
		if (editorCommon.CursorMoveByUnit.WrappedLine === moveArguments.by) {
			return this._moveDownByViewLines(cursor, moveArguments.select, linesCount, ctx);
		}
		return this._moveDownByModelLines(cursor, moveArguments.select, linesCount, ctx);
	}

	private static _moveDownByViewLines(cursor: OneCursor, inSelectionMode: boolean, linesCount: number, ctx: IOneCursorOperationContext): boolean {
		return this._applyMoveOperationResult(
			cursor, ctx,
			this._fromViewCursorState(cursor, MoveOperations.moveDown(cursor.config, cursor.viewModel, cursor.viewState, inSelectionMode, linesCount))
		);
	}

	private static _moveDownByModelLines(cursor: OneCursor, inSelectionMode: boolean, linesCount: number, ctx: IOneCursorOperationContext): boolean {
		return this._applyMoveOperationResult(
			cursor, ctx,
			this._fromModelCursorState(cursor, MoveOperations.moveDown(cursor.config, cursor.model, cursor.modelState, inSelectionMode, linesCount))
		);
	}

	public static translateDown(cursor: OneCursor, ctx: IOneCursorOperationContext): boolean {
		return this._applyMoveOperationResult(
			cursor, ctx,
			this._fromViewCursorState(cursor, MoveOperations.translateDown(cursor.config, cursor.viewModel, cursor.viewState))
		);
	}

	private static _moveUp(cursor: OneCursor, moveArguments: CursorMoveArguments, ctx: IOneCursorOperationContext): boolean {
		let linesCount = (moveArguments.isPaged ? (moveArguments.pageSize || cursor.config.pageSize) : moveArguments.value) || 1;
		if (editorCommon.CursorMoveByUnit.WrappedLine === moveArguments.by) {
			return this._moveUpByViewLines(cursor, moveArguments.select, linesCount, ctx);
		}
		return this._moveUpByModelLines(cursor, moveArguments.select, linesCount, ctx);
	}

	private static _moveUpByViewLines(cursor: OneCursor, inSelectionMode: boolean, linesCount: number, ctx: IOneCursorOperationContext): boolean {
		return this._applyMoveOperationResult(
			cursor, ctx,
			this._fromViewCursorState(cursor, MoveOperations.moveUp(cursor.config, cursor.viewModel, cursor.viewState, inSelectionMode, linesCount))
		);
	}

	private static _moveUpByModelLines(cursor: OneCursor, inSelectionMode: boolean, linesCount: number, ctx: IOneCursorOperationContext): boolean {
		return this._applyMoveOperationResult(
			cursor, ctx,
			this._fromModelCursorState(cursor, MoveOperations.moveUp(cursor.config, cursor.model, cursor.modelState, inSelectionMode, linesCount))
		);
	}

	public static translateUp(cursor: OneCursor, ctx: IOneCursorOperationContext): boolean {
		return this._applyMoveOperationResult(
			cursor, ctx,
			this._fromViewCursorState(cursor, MoveOperations.translateUp(cursor.config, cursor.viewModel, cursor.viewState))
		);
	}

	public static moveToBeginningOfLine(cursor: OneCursor, inSelectionMode: boolean, ctx: IOneCursorOperationContext): boolean {
		return this._applyMoveOperationResult(
			cursor, ctx,
			this._fromViewCursorState(cursor, MoveOperations.moveToBeginningOfLine(cursor.config, cursor.viewModel, cursor.viewState, inSelectionMode))
		);
	}

	public static moveToEndOfLine(cursor: OneCursor, inSelectionMode: boolean, ctx: IOneCursorOperationContext): boolean {
		return this._applyMoveOperationResult(
			cursor, ctx,
			this._fromViewCursorState(cursor, MoveOperations.moveToEndOfLine(cursor.config, cursor.viewModel, cursor.viewState, inSelectionMode))
		);
	}

	public static expandLineSelection(cursor: OneCursor, ctx: IOneCursorOperationContext): boolean {
		ctx.cursorPositionChangeReason = editorCommon.CursorChangeReason.Explicit;
		let viewSel = cursor.viewState.selection;

		let viewStartLineNumber = viewSel.startLineNumber;
		let viewStartColumn = viewSel.startColumn;
		let viewEndLineNumber = viewSel.endLineNumber;
		let viewEndColumn = viewSel.endColumn;

		let viewEndMaxColumn = cursor.viewModel.getLineMaxColumn(viewEndLineNumber);
		if (viewStartColumn !== 1 || viewEndColumn !== viewEndMaxColumn) {
			viewStartColumn = 1;
			viewEndColumn = viewEndMaxColumn;
		} else {
			// Expand selection with one more line down
			let moveResult = MoveOperations.down(cursor.config, cursor.viewModel, viewEndLineNumber, viewEndColumn, 0, 1, true);
			viewEndLineNumber = moveResult.lineNumber;
			viewEndColumn = cursor.viewModel.getLineMaxColumn(viewEndLineNumber);
		}

		cursor.moveViewPosition(false, viewStartLineNumber, viewStartColumn, 0, true);
		cursor.moveViewPosition(true, viewEndLineNumber, viewEndColumn, 0, true);
		return true;
	}

	public static moveToBeginningOfBuffer(cursor: OneCursor, inSelectionMode: boolean, ctx: IOneCursorOperationContext): boolean {
		return this._applyMoveOperationResult(
			cursor, ctx,
			this._fromModelCursorState(cursor, MoveOperations.moveToBeginningOfBuffer(cursor.config, cursor.model, cursor.modelState, inSelectionMode))
		);
	}

	public static moveToEndOfBuffer(cursor: OneCursor, inSelectionMode: boolean, ctx: IOneCursorOperationContext): boolean {
		return this._applyMoveOperationResult(
			cursor, ctx,
			this._fromModelCursorState(cursor, MoveOperations.moveToEndOfBuffer(cursor.config, cursor.model, cursor.modelState, inSelectionMode))
		);
	}

	public static selectAll(cursor: OneCursor, ctx: IOneCursorOperationContext): boolean {

		let selectEntireBuffer = true;
		let newSelectionStartLineNumber: number,
			newSelectionStartColumn: number,
			newPositionLineNumber: number,
			newPositionColumn: number;

		if (cursor.model.hasEditableRange()) {
			// Toggle between selecting editable range and selecting the entire buffer

			let editableRange = cursor.model.getEditableRange();
			let selection = cursor.modelState.selection;

			if (!selection.equalsRange(editableRange)) {
				// Selection is not editable range => select editable range
				selectEntireBuffer = false;
				newSelectionStartLineNumber = editableRange.startLineNumber;
				newSelectionStartColumn = editableRange.startColumn;
				newPositionLineNumber = editableRange.endLineNumber;
				newPositionColumn = editableRange.endColumn;
			}
		}

		if (selectEntireBuffer) {
			newSelectionStartLineNumber = 1;
			newSelectionStartColumn = 1;
			newPositionLineNumber = cursor.model.getLineCount();
			newPositionColumn = cursor.model.getLineMaxColumn(newPositionLineNumber);
		}

		cursor.moveModelPosition(false, newSelectionStartLineNumber, newSelectionStartColumn, 0, false);
		cursor.moveModelPosition(true, newPositionLineNumber, newPositionColumn, 0, false);

		ctx.shouldReveal = false;
		ctx.shouldRevealHorizontal = false;
		return true;
	}

	public static line(cursor: OneCursor, inSelectionMode: boolean, _position: editorCommon.IPosition, _viewPosition: editorCommon.IPosition, ctx: IOneCursorOperationContext): boolean {
		// TODO@Alex -> select in editable range

		let position = cursor.validatePosition(_position);
		let viewPosition = (
			_viewPosition ?
				cursor.validateViewPosition(_viewPosition.lineNumber, _viewPosition.column, position)
				: cursor.convertModelPositionToViewPosition(position.lineNumber, position.column)
		);

		ctx.cursorPositionChangeReason = editorCommon.CursorChangeReason.Explicit;
		ctx.shouldRevealHorizontal = false;

		if (!inSelectionMode || !cursor.modelState.hasSelection()) {
			// Entering line selection for the first time

			let selectToLineNumber = position.lineNumber + 1;
			let selectToColumn = 1;
			if (selectToLineNumber > cursor.model.getLineCount()) {
				selectToLineNumber = cursor.model.getLineCount();
				selectToColumn = cursor.model.getLineMaxColumn(selectToLineNumber);
			}

			let selectionStartRange = new Range(position.lineNumber, 1, selectToLineNumber, selectToColumn);
			cursor.setSelectionStart(selectionStartRange);
			cursor.moveModelPosition(cursor.modelState.hasSelection(), selectionStartRange.endLineNumber, selectionStartRange.endColumn, 0, false);

			return true;
		} else {
			// Continuing line selection
			let enteringLineNumber = cursor.modelState.selectionStart.getStartPosition().lineNumber;

			if (position.lineNumber < enteringLineNumber) {

				cursor.moveViewPosition(cursor.modelState.hasSelection(), viewPosition.lineNumber, 1, 0, false);

			} else if (position.lineNumber > enteringLineNumber) {

				let selectToViewLineNumber = viewPosition.lineNumber + 1;
				let selectToViewColumn = 1;
				if (selectToViewLineNumber > cursor.viewModel.getLineCount()) {
					selectToViewLineNumber = cursor.viewModel.getLineCount();
					selectToViewColumn = cursor.viewModel.getLineMaxColumn(selectToViewLineNumber);
				}
				cursor.moveViewPosition(cursor.modelState.hasSelection(), selectToViewLineNumber, selectToViewColumn, 0, false);

			} else {

				let endPositionOfSelectionStart = cursor.modelState.selectionStart.getEndPosition();
				cursor.moveModelPosition(cursor.modelState.hasSelection(), endPositionOfSelectionStart.lineNumber, endPositionOfSelectionStart.column, 0, false);

			}


			return true;
		}

	}

	public static word(cursor: OneCursor, inSelectionMode: boolean, validatedPosition: Position, ctx: IOneCursorOperationContext): boolean {
		return this._applyMoveOperationResult(
			cursor, ctx,
			this._fromModelCursorState(cursor, WordOperations.word(cursor.config, cursor.model, cursor.modelState, inSelectionMode, validatedPosition))
		);
	}

	public static cancelSelection(cursor: OneCursor, ctx: IOneCursorOperationContext): boolean {
		if (!cursor.modelState.hasSelection()) {
			return false;
		}

		cursor.collapseSelection();
		return true;
	}

	// -------------------- STOP handlers that simply change cursor state
}
