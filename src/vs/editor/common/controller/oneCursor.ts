/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { SingleCursorState, CursorConfiguration, ICursorSimpleModel, CursorState } from 'vs/editor/common/controller/cursorCommon';
import { Position, IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection, SelectionDirection, ISelection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { MoveOperations } from 'vs/editor/common/controller/cursorMoveOperations';
import { WordOperations } from 'vs/editor/common/controller/cursorWordOperations';
import { ICoordinatesConverter } from 'vs/editor/common/viewModel/viewModel';
import * as types from 'vs/base/common/types';
import { ICommandHandlerDescription } from 'vs/platform/commands/common/commands';

/**
 * Arguments for reveal line command
 */
export interface RevealLineArguments {
	lineNumber?: number;
	at?: string;
};

/**
 * Values for reveal line 'at' argument
 */
export const RevealLineAtArgument = {
	Top: 'top',
	Center: 'center',
	Bottom: 'bottom'
};

/**
 * @internal
 */
const isRevealLineArgs = function (arg): boolean {
	if (!types.isObject(arg)) {
		return false;
	}

	let reveaLineArg: RevealLineArguments = arg;

	if (!types.isNumber(reveaLineArg.lineNumber)) {
		return false;
	}

	if (!types.isUndefined(reveaLineArg.at) && !types.isString(reveaLineArg.at)) {
		return false;
	}

	return true;
};

/**
 * @internal
 */
export var CommandDescription = {

	RevealLine: <ICommandHandlerDescription>{
		description: 'Reveal the given line at the given logical position',
		args: [
			{
				name: 'Reveal line argument object',
				description: `Property-value pairs that can be passed through this argument:
					* 'lineNumber': A mandatory line number value.
					* 'at': Logical position at which line has to be revealed .
						\`\`\`
						'top', 'center', 'bottom'
						\`\`\`
				`,
				constraint: isRevealLineArgs
			}
		]
	}
};

export interface IViewModelHelper {

	coordinatesConverter: ICoordinatesConverter;

	viewModel: ICursorSimpleModel;

	getScrollTop(): number;

	getCompletelyVisibleViewRange(): Range;

	getCompletelyVisibleViewRangeAtScrollTop(scrollTop: number): Range;

	getVerticalOffsetForViewLineNumber(viewLineNumber: number): number;
}

export class CursorContext {
	_cursorContextBrand: void;

	public readonly model: editorCommon.IModel;
	public readonly viewModel: ICursorSimpleModel;
	public readonly config: CursorConfiguration;

	private readonly _viewModelHelper: IViewModelHelper;
	private readonly _coordinatesConverter: ICoordinatesConverter;

	constructor(model: editorCommon.IModel, viewModelHelper: IViewModelHelper, config: CursorConfiguration) {
		this.model = model;
		this.viewModel = viewModelHelper.viewModel;
		this.config = config;
		this._viewModelHelper = viewModelHelper;
		this._coordinatesConverter = viewModelHelper.coordinatesConverter;
	}

	public validateModelPosition(position: IPosition): Position {
		return this.model.validatePosition(position);
	}

	public validateViewPosition(viewPosition: Position, modelPosition: Position): Position {
		return this._coordinatesConverter.validateViewPosition(viewPosition, modelPosition);
	}

	public validateViewRange(viewRange: Range, expectedModelRange: Range): Range {
		return this._coordinatesConverter.validateViewRange(viewRange, expectedModelRange);
	}

	public convertViewSelectionToModelSelection(viewSelection: Selection): Selection {
		return this._coordinatesConverter.convertViewSelectionToModelSelection(viewSelection);
	}

	public convertViewPositionToModelPosition(lineNumber: number, column: number): Position {
		return this._coordinatesConverter.convertViewPositionToModelPosition(new Position(lineNumber, column));
	}

	public convertModelPositionToViewPosition(modelPosition: Position): Position {
		return this._coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
	}

	public convertModelRangeToViewRange(modelRange: Range): Range {
		return this._coordinatesConverter.convertModelRangeToViewRange(modelRange);
	}

	public getScrollTop(): number {
		return this._viewModelHelper.getScrollTop();
	}

	public getCompletelyVisibleViewRange(): Range {
		return this._viewModelHelper.getCompletelyVisibleViewRange();
	}

	public getCompletelyVisibleModelRange(): Range {
		const viewRange = this._viewModelHelper.getCompletelyVisibleViewRange();
		return this._coordinatesConverter.convertViewRangeToModelRange(viewRange);
	}

	public getCompletelyVisibleViewRangeAtScrollTop(scrollTop: number): Range {
		return this._viewModelHelper.getCompletelyVisibleViewRangeAtScrollTop(scrollTop);
	}

	public getCompletelyVisibleModelRangeAtScrollTop(scrollTop: number): Range {
		const viewRange = this._viewModelHelper.getCompletelyVisibleViewRangeAtScrollTop(scrollTop);
		return this._coordinatesConverter.convertViewRangeToModelRange(viewRange);
	}

	public getVerticalOffsetForViewLine(viewLineNumber: number): number {
		return this._viewModelHelper.getVerticalOffsetForViewLineNumber(viewLineNumber);
	}
}

export interface IOneCursorState {
	selectionStart: Range;
	viewSelectionStart: Range;
	position: Position;
	viewPosition: Position;
	leftoverVisibleColumns: number;
	selectionStartLeftoverVisibleColumns: number;
}

export interface ICursor {
	readonly modelState: SingleCursorState;
	readonly viewState: SingleCursorState;
}

export class OneCursor implements ICursor {

	public modelState: SingleCursorState;
	public viewState: SingleCursorState;

	private _selStartMarker: string;
	private _selEndMarker: string;

	constructor(context: CursorContext) {
		this._setState(
			context,
			new SingleCursorState(new Range(1, 1, 1, 1), 0, new Position(1, 1), 0),
			new SingleCursorState(new Range(1, 1, 1, 1), 0, new Position(1, 1), 0),
			false
		);
	}

	/**
	 * Sometimes, the line mapping changes and the stored view position is stale.
	 */
	public ensureValidState(context: CursorContext): void {
		this._setState(context, this.modelState, this.viewState, false);
	}

	private _ensureInEditableRange(context: CursorContext, position: Position): Position {
		let editableRange = context.model.getEditableRange();

		if (position.lineNumber < editableRange.startLineNumber || (position.lineNumber === editableRange.startLineNumber && position.column < editableRange.startColumn)) {
			return new Position(editableRange.startLineNumber, editableRange.startColumn);
		} else if (position.lineNumber > editableRange.endLineNumber || (position.lineNumber === editableRange.endLineNumber && position.column > editableRange.endColumn)) {
			return new Position(editableRange.endLineNumber, editableRange.endColumn);
		}
		return position;
	}

	private _setState(context: CursorContext, modelState: SingleCursorState, viewState: SingleCursorState, ensureInEditableRange: boolean): void {
		// Validate new model state
		let selectionStart = context.model.validateRange(modelState.selectionStart);
		let selectionStartLeftoverVisibleColumns = modelState.selectionStart.equalsRange(selectionStart) ? modelState.selectionStartLeftoverVisibleColumns : 0;

		let position = context.model.validatePosition(modelState.position);
		if (ensureInEditableRange) {
			position = this._ensureInEditableRange(context, position);
		}
		let leftoverVisibleColumns = modelState.position.equals(position) ? modelState.leftoverVisibleColumns : 0;

		modelState = new SingleCursorState(selectionStart, selectionStartLeftoverVisibleColumns, position, leftoverVisibleColumns);

		// Validate new view state
		let viewSelectionStart = context.validateViewRange(viewState.selectionStart, modelState.selectionStart);
		let viewPosition = context.validateViewPosition(viewState.position, modelState.position);
		viewState = new SingleCursorState(viewSelectionStart, selectionStartLeftoverVisibleColumns, viewPosition, leftoverVisibleColumns);

		if (this.modelState && this.viewState && this.modelState.equals(modelState) && this.viewState.equals(viewState)) {
			// No-op, early return
			return;
		}

		this.modelState = modelState;
		this.viewState = viewState;

		this._selStartMarker = this._ensureMarker(context, this._selStartMarker, this.modelState.selection.startLineNumber, this.modelState.selection.startColumn, true);
		this._selEndMarker = this._ensureMarker(context, this._selEndMarker, this.modelState.selection.endLineNumber, this.modelState.selection.endColumn, false);
	}

	private _ensureMarker(context: CursorContext, markerId: string, lineNumber: number, column: number, stickToPreviousCharacter: boolean): string {
		if (!markerId) {
			return context.model._addMarker(0, lineNumber, column, stickToPreviousCharacter);
		} else {
			context.model._changeMarker(markerId, lineNumber, column);
			context.model._changeMarkerStickiness(markerId, stickToPreviousCharacter);
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

	public restoreState(context: CursorContext, state: IOneCursorState): void {
		let position = context.model.validatePosition(state.position);
		let selectionStart: Range;
		if (state.selectionStart) {
			selectionStart = context.model.validateRange(state.selectionStart);
		} else {
			selectionStart = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		}

		let viewPosition = context.validateViewPosition(new Position(state.viewPosition.lineNumber, state.viewPosition.column), position);
		let viewSelectionStart: Range;
		if (state.viewSelectionStart) {
			viewSelectionStart = context.validateViewRange(new Range(state.viewSelectionStart.startLineNumber, state.viewSelectionStart.startColumn, state.viewSelectionStart.endLineNumber, state.viewSelectionStart.endColumn), selectionStart);
		} else {
			viewSelectionStart = context.convertModelRangeToViewRange(selectionStart);
		}

		this._setState(
			context,
			new SingleCursorState(selectionStart, state.selectionStartLeftoverVisibleColumns, position, state.leftoverVisibleColumns),
			new SingleCursorState(viewSelectionStart, state.selectionStartLeftoverVisibleColumns, viewPosition, state.leftoverVisibleColumns),
			false
		);
	}

	public dispose(context: CursorContext): void {
		context.model._removeMarker(this._selStartMarker);
		context.model._removeMarker(this._selEndMarker);
	}

	public setSelection(context: CursorContext, selection: ISelection, viewSelection: ISelection = null): void {
		let position = context.model.validatePosition({
			lineNumber: selection.positionLineNumber,
			column: selection.positionColumn
		});
		let selectionStart = context.model.validatePosition({
			lineNumber: selection.selectionStartLineNumber,
			column: selection.selectionStartColumn
		});

		let viewPosition: Position;
		let viewSelectionStart: Position;

		if (viewSelection) {
			viewPosition = context.validateViewPosition(new Position(viewSelection.positionLineNumber, viewSelection.positionColumn), position);
			viewSelectionStart = context.validateViewPosition(new Position(viewSelection.selectionStartLineNumber, viewSelection.selectionStartColumn), selectionStart);
		} else {
			viewPosition = context.convertModelPositionToViewPosition(position);
			viewSelectionStart = context.convertModelPositionToViewPosition(selectionStart);
		}

		this._setState(
			context,
			new SingleCursorState(new Range(selectionStart.lineNumber, selectionStart.column, selectionStart.lineNumber, selectionStart.column), 0, position, 0),
			new SingleCursorState(new Range(viewSelectionStart.lineNumber, viewSelectionStart.column, viewSelectionStart.lineNumber, viewSelectionStart.column), 0, viewPosition, 0),
			false
		);
	}

	// -------------------- START modifications

	public setState(context: CursorContext, modelState: SingleCursorState, viewState: SingleCursorState, ensureInEditableRange: boolean): void {
		this._setState(context, modelState, viewState, ensureInEditableRange);
	}

	public beginRecoverSelectionFromMarkers(context: CursorContext): Selection {
		const start = context.model._getMarker(this._selStartMarker);
		const end = context.model._getMarker(this._selEndMarker);

		if (this.modelState.selection.getDirection() === SelectionDirection.LTR) {
			return new Selection(start.lineNumber, start.column, end.lineNumber, end.column);
		}

		return new Selection(end.lineNumber, end.column, start.lineNumber, start.column);
	}

	public endRecoverSelectionFromMarkers(context: CursorContext, recoveredSelection: Selection): boolean {

		const selectionStart = new Range(recoveredSelection.selectionStartLineNumber, recoveredSelection.selectionStartColumn, recoveredSelection.selectionStartLineNumber, recoveredSelection.selectionStartColumn);
		const position = new Position(recoveredSelection.positionLineNumber, recoveredSelection.positionColumn);

		const viewSelectionStart = context.convertModelRangeToViewRange(selectionStart);
		const viewPosition = context.convertModelPositionToViewPosition(position);

		this._setState(
			context,
			new SingleCursorState(selectionStart, 0, position, 0),
			new SingleCursorState(viewSelectionStart, 0, viewPosition, 0),
			false
		);

		return true;
	}

	// -------------------- END modifications
}

export class OneCursorOp {

	// -------------------- START handlers that simply change cursor state

	public static moveTo(context: CursorContext, cursor: ICursor, inSelectionMode: boolean, _position: IPosition, _viewPosition: IPosition): CursorState {
		const position = context.validateModelPosition(_position);
		const viewPosition = (
			_viewPosition
				? context.validateViewPosition(new Position(_viewPosition.lineNumber, _viewPosition.column), position)
				: context.convertModelPositionToViewPosition(position)
		);
		return this._fromViewCursorState(context, cursor, cursor.viewState.move(inSelectionMode, viewPosition.lineNumber, viewPosition.column, 0));
	}

	public static move(context: CursorContext, cursors: ICursor[], args: CursorMove.ParsedArguments): CursorState[] {
		const inSelectionMode = args.select;
		const value = args.value;

		switch (args.direction) {
			case CursorMove.Direction.Left: {
				if (args.unit === CursorMove.Unit.HalfLine) {
					// Move left by half the current line length
					return this._moveHalfLineLeft(context, cursors, inSelectionMode);
				} else {
					// Move left by `moveParams.value` columns
					return this._moveLeft(context, cursors, inSelectionMode, value);
				}
			}
			case CursorMove.Direction.Right: {
				if (args.unit === CursorMove.Unit.HalfLine) {
					// Move right by half the current line length
					return this._moveHalfLineRight(context, cursors, inSelectionMode);
				} else {
					// Move right by `moveParams.value` columns
					return this._moveRight(context, cursors, inSelectionMode, value);
				}
			}
			case CursorMove.Direction.Up: {
				if (args.unit === CursorMove.Unit.WrappedLine) {
					// Move up by view lines
					return this._moveUpByViewLines(context, cursors, inSelectionMode, value);
				} else {
					// Move up by model lines
					return this._moveUpByModelLines(context, cursors, inSelectionMode, value);
				}
			}
			case CursorMove.Direction.Down: {
				if (args.unit === CursorMove.Unit.WrappedLine) {
					// Move down by view lines
					return this._moveDownByViewLines(context, cursors, inSelectionMode, value);
				} else {
					// Move down by model lines
					return this._moveDownByModelLines(context, cursors, inSelectionMode, value);
				}
			}
			case CursorMove.Direction.WrappedLineStart: {
				// Move to the beginning of the current view line
				return this._moveToViewMinColumn(context, cursors, inSelectionMode);
			}
			case CursorMove.Direction.WrappedLineFirstNonWhitespaceCharacter: {
				// Move to the first non-whitespace column of the current view line
				return this._moveToViewFirstNonWhitespaceColumn(context, cursors, inSelectionMode);
			}
			case CursorMove.Direction.WrappedLineColumnCenter: {
				// Move to the "center" of the current view line
				return this._moveToViewCenterColumn(context, cursors, inSelectionMode);
			}
			case CursorMove.Direction.WrappedLineEnd: {
				// Move to the end of the current view line
				return this._moveToViewMaxColumn(context, cursors, inSelectionMode);
			}
			case CursorMove.Direction.WrappedLineLastNonWhitespaceCharacter: {
				// Move to the last non-whitespace column of the current view line
				return this._moveToViewLastNonWhitespaceColumn(context, cursors, inSelectionMode);
			}
			case CursorMove.Direction.ViewPortTop: {
				// Move to the nth line start in the viewport (from the top)
				const cursor = cursors[0];
				const visibleModelRange = context.getCompletelyVisibleModelRange();
				const modelLineNumber = this._firstLineNumberInRange(context.model, visibleModelRange, value);
				const modelColumn = context.model.getLineFirstNonWhitespaceColumn(modelLineNumber);
				return [this._moveToModelPosition(context, cursor, inSelectionMode, modelLineNumber, modelColumn)];
			}
			case CursorMove.Direction.ViewPortBottom: {
				// Move to the nth line start in the viewport (from the bottom)
				const cursor = cursors[0];
				const visibleModelRange = context.getCompletelyVisibleModelRange();
				const modelLineNumber = this._lastLineNumberInRange(context.model, visibleModelRange, value);
				const modelColumn = context.model.getLineFirstNonWhitespaceColumn(modelLineNumber);
				return [this._moveToModelPosition(context, cursor, inSelectionMode, modelLineNumber, modelColumn)];
			}
			case CursorMove.Direction.ViewPortCenter: {
				// Move to the line start in the viewport center
				const cursor = cursors[0];
				const visibleModelRange = context.getCompletelyVisibleModelRange();
				const modelLineNumber = Math.round((visibleModelRange.startLineNumber + visibleModelRange.endLineNumber) / 2);
				const modelColumn = context.model.getLineFirstNonWhitespaceColumn(modelLineNumber);
				return [this._moveToModelPosition(context, cursor, inSelectionMode, modelLineNumber, modelColumn)];
			}
			case CursorMove.Direction.ViewPortIfOutside: {
				// Move to a position inside the viewport
				const visibleViewRange = context.getCompletelyVisibleViewRange();
				let result: CursorState[] = [];
				for (let i = 0, len = cursors.length; i < len; i++) {
					const cursor = cursors[i];
					result[i] = this.findPositionInViewportIfOutside(context, cursor, visibleViewRange, inSelectionMode);
				}
				return result;
			}
		}

		return null;
	}

	public static findPositionInViewportIfOutside(context: CursorContext, cursor: ICursor, visibleViewRange: Range, inSelectionMode: boolean): CursorState {
		let viewLineNumber = cursor.viewState.position.lineNumber;

		if (visibleViewRange.startLineNumber <= viewLineNumber && viewLineNumber <= visibleViewRange.endLineNumber - 1) {
			// Nothing to do, cursor is in viewport
			return new CursorState(cursor.modelState, cursor.viewState);

		} else {
			if (viewLineNumber > visibleViewRange.endLineNumber - 1) {
				viewLineNumber = visibleViewRange.endLineNumber - 1;
			}
			if (viewLineNumber < visibleViewRange.startLineNumber) {
				viewLineNumber = visibleViewRange.startLineNumber;
			}
			const viewColumn = context.viewModel.getLineFirstNonWhitespaceColumn(viewLineNumber);
			return this._moveToViewPosition(context, cursor, inSelectionMode, viewLineNumber, viewColumn);
		}
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

	private static _fromModelCursorState(context: CursorContext, cursor: ICursor, modelState: SingleCursorState): CursorState {
		let viewSelectionStart1 = context.convertModelPositionToViewPosition(new Position(modelState.selectionStart.startLineNumber, modelState.selectionStart.startColumn));
		let viewSelectionStart2 = context.convertModelPositionToViewPosition(new Position(modelState.selectionStart.endLineNumber, modelState.selectionStart.endColumn));
		let viewSelectionStart = new Range(viewSelectionStart1.lineNumber, viewSelectionStart1.column, viewSelectionStart2.lineNumber, viewSelectionStart2.column);
		let viewPosition = context.convertModelPositionToViewPosition(modelState.position);
		return new CursorState(
			modelState,
			new SingleCursorState(viewSelectionStart, modelState.selectionStartLeftoverVisibleColumns, viewPosition, modelState.leftoverVisibleColumns)
		);
	}

	private static _fromViewCursorState(context: CursorContext, cursor: ICursor, viewState: SingleCursorState): CursorState {
		let selectionStart1 = context.convertViewPositionToModelPosition(viewState.selectionStart.startLineNumber, viewState.selectionStart.startColumn);
		let selectionStart2 = context.convertViewPositionToModelPosition(viewState.selectionStart.endLineNumber, viewState.selectionStart.endColumn);
		let selectionStart = new Range(selectionStart1.lineNumber, selectionStart1.column, selectionStart2.lineNumber, selectionStart2.column);
		let position = context.convertViewPositionToModelPosition(viewState.position.lineNumber, viewState.position.column);
		return new CursorState(
			new SingleCursorState(selectionStart, viewState.selectionStartLeftoverVisibleColumns, position, viewState.leftoverVisibleColumns),
			viewState
		);
	}

	private static _moveLeft(context: CursorContext, cursors: ICursor[], inSelectionMode: boolean, noOfColumns: number): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromViewCursorState(context, cursor, MoveOperations.moveLeft(context.config, context.viewModel, cursor.viewState, inSelectionMode, noOfColumns));
		}
		return result;
	}

	private static _moveHalfLineLeft(context: CursorContext, cursors: ICursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const halfLine = Math.round(context.viewModel.getLineContent(viewLineNumber).length / 2);
			result[i] = this._fromViewCursorState(context, cursor, MoveOperations.moveLeft(context.config, context.viewModel, cursor.viewState, inSelectionMode, halfLine));
		}
		return result;
	}

	private static _moveRight(context: CursorContext, cursors: ICursor[], inSelectionMode: boolean, noOfColumns: number): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromViewCursorState(context, cursor, MoveOperations.moveRight(context.config, context.viewModel, cursor.viewState, inSelectionMode, noOfColumns));
		}
		return result;
	}

	private static _moveHalfLineRight(context: CursorContext, cursors: ICursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const halfLine = Math.round(context.viewModel.getLineContent(viewLineNumber).length / 2);
			result[i] = this._fromViewCursorState(context, cursor, MoveOperations.moveRight(context.config, context.viewModel, cursor.viewState, inSelectionMode, halfLine));
		}
		return result;
	}

	private static _moveDownByViewLines(context: CursorContext, cursors: ICursor[], inSelectionMode: boolean, linesCount: number): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromViewCursorState(context, cursor, MoveOperations.moveDown(context.config, context.viewModel, cursor.viewState, inSelectionMode, linesCount));
		}
		return result;
	}

	private static _moveDownByModelLines(context: CursorContext, cursors: ICursor[], inSelectionMode: boolean, linesCount: number): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromModelCursorState(context, cursor, MoveOperations.moveDown(context.config, context.model, cursor.modelState, inSelectionMode, linesCount));
		}
		return result;
	}

	private static _moveUpByViewLines(context: CursorContext, cursors: ICursor[], inSelectionMode: boolean, linesCount: number): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromViewCursorState(context, cursor, MoveOperations.moveUp(context.config, context.viewModel, cursor.viewState, inSelectionMode, linesCount));
		}
		return result;
	}

	private static _moveUpByModelLines(context: CursorContext, cursors: ICursor[], inSelectionMode: boolean, linesCount: number): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromModelCursorState(context, cursor, MoveOperations.moveUp(context.config, context.model, cursor.modelState, inSelectionMode, linesCount));
		}
		return result;
	}

	private static _moveToViewPosition(context: CursorContext, cursor: ICursor, inSelectionMode: boolean, toViewLineNumber: number, toViewColumn: number): CursorState {
		return this._fromViewCursorState(context, cursor, cursor.viewState.move(inSelectionMode, toViewLineNumber, toViewColumn, 0));
	}

	private static _moveToModelPosition(context: CursorContext, cursor: ICursor, inSelectionMode: boolean, toModelLineNumber: number, toModelColumn: number): CursorState {
		return this._fromModelCursorState(context, cursor, cursor.modelState.move(inSelectionMode, toModelLineNumber, toModelColumn, 0));
	}

	private static _moveToViewMinColumn(context: CursorContext, cursors: ICursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const viewColumn = context.viewModel.getLineMinColumn(viewLineNumber);
			result[i] = this._moveToViewPosition(context, cursor, inSelectionMode, viewLineNumber, viewColumn);
		}
		return result;
	}

	private static _moveToViewFirstNonWhitespaceColumn(context: CursorContext, cursors: ICursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const viewColumn = context.viewModel.getLineFirstNonWhitespaceColumn(viewLineNumber);
			result[i] = this._moveToViewPosition(context, cursor, inSelectionMode, viewLineNumber, viewColumn);
		}
		return result;
	}

	private static _moveToViewCenterColumn(context: CursorContext, cursors: ICursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const viewColumn = Math.round((context.viewModel.getLineMaxColumn(viewLineNumber) + context.viewModel.getLineMinColumn(viewLineNumber)) / 2);
			result[i] = this._moveToViewPosition(context, cursor, inSelectionMode, viewLineNumber, viewColumn);
		}
		return result;
	}

	private static _moveToViewMaxColumn(context: CursorContext, cursors: ICursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const viewColumn = context.viewModel.getLineMaxColumn(viewLineNumber);
			result[i] = this._moveToViewPosition(context, cursor, inSelectionMode, viewLineNumber, viewColumn);
		}
		return result;
	}

	private static _moveToViewLastNonWhitespaceColumn(context: CursorContext, cursors: ICursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const viewColumn = context.viewModel.getLineLastNonWhitespaceColumn(viewLineNumber);
			result[i] = this._moveToViewPosition(context, cursor, inSelectionMode, viewLineNumber, viewColumn);
		}
		return result;
	}

	public static addCursorDown(context: CursorContext, cursors: ICursor[]): CursorState[] {
		let result: CursorState[] = [], resultLen = 0;
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[resultLen++] = new CursorState(cursor.modelState, cursor.viewState);
			result[resultLen++] = this._fromViewCursorState(context, cursor, MoveOperations.translateDown(context.config, context.viewModel, cursor.viewState));
		}
		return result;
	}

	public static addCursorUp(context: CursorContext, cursors: ICursor[]): CursorState[] {
		let result: CursorState[] = [], resultLen = 0;
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[resultLen++] = new CursorState(cursor.modelState, cursor.viewState);
			result[resultLen++] = this._fromViewCursorState(context, cursor, MoveOperations.translateUp(context.config, context.viewModel, cursor.viewState));
		}
		return result;
	}

	public static moveToBeginningOfLine(context: CursorContext, cursors: ICursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromViewCursorState(context, cursor, MoveOperations.moveToBeginningOfLine(context.config, context.viewModel, cursor.viewState, inSelectionMode));
		}
		return result;
	}

	public static moveToEndOfLine(context: CursorContext, cursors: ICursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromViewCursorState(context, cursor, MoveOperations.moveToEndOfLine(context.config, context.viewModel, cursor.viewState, inSelectionMode));
		}
		return result;
	}

	public static expandLineSelection(context: CursorContext, cursors: ICursor[]): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];

			const viewSelection = cursor.viewState.selection;
			const startLineNumber = viewSelection.startLineNumber;
			const lineCount = context.viewModel.getLineCount();

			let endLineNumber = viewSelection.endLineNumber;
			let endColumn: number;
			if (endLineNumber === lineCount) {
				endColumn = context.viewModel.getLineMaxColumn(lineCount);
			} else {
				endLineNumber++;
				endColumn = 1;
			}

			result[i] = this._fromViewCursorState(context, cursor, new SingleCursorState(
				new Range(startLineNumber, 1, startLineNumber, 1), 0,
				new Position(endLineNumber, endColumn), 0
			));
		}
		return result;
	}

	public static moveToBeginningOfBuffer(context: CursorContext, cursors: ICursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromModelCursorState(context, cursor, MoveOperations.moveToBeginningOfBuffer(context.config, context.model, cursor.modelState, inSelectionMode));
		}
		return result;
	}

	public static moveToEndOfBuffer(context: CursorContext, cursors: ICursor[], inSelectionMode: boolean): CursorState[] {
		let result: CursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._fromModelCursorState(context, cursor, MoveOperations.moveToEndOfBuffer(context.config, context.model, cursor.modelState, inSelectionMode));
		}
		return result;
	}

	public static selectAll(context: CursorContext, cursor: ICursor): CursorState {

		if (context.model.hasEditableRange()) {
			// Toggle between selecting editable range and selecting the entire buffer

			const editableRange = context.model.getEditableRange();
			const selection = cursor.modelState.selection;

			if (!selection.equalsRange(editableRange)) {
				// Selection is not editable range => select editable range
				return this._fromModelCursorState(context, cursor, new SingleCursorState(
					new Range(editableRange.startLineNumber, editableRange.startColumn, editableRange.startLineNumber, editableRange.startColumn), 0,
					new Position(editableRange.endLineNumber, editableRange.endColumn), 0
				));
			}
		}

		const lineCount = context.model.getLineCount();
		const maxColumn = context.model.getLineMaxColumn(lineCount);

		return this._fromModelCursorState(context, cursor, new SingleCursorState(
			new Range(1, 1, 1, 1), 0,
			new Position(lineCount, maxColumn), 0
		));
	}

	public static line(context: CursorContext, cursor: ICursor, inSelectionMode: boolean, _position: IPosition, _viewPosition: IPosition): CursorState {
		const position = context.validateModelPosition(_position);
		const viewPosition = (
			_viewPosition
				? context.validateViewPosition(new Position(_viewPosition.lineNumber, _viewPosition.column), position)
				: context.convertModelPositionToViewPosition(position)
		);

		if (!inSelectionMode || !cursor.modelState.hasSelection()) {
			// Entering line selection for the first time
			const lineCount = context.model.getLineCount();

			let selectToLineNumber = position.lineNumber + 1;
			let selectToColumn = 1;
			if (selectToLineNumber > lineCount) {
				selectToLineNumber = lineCount;
				selectToColumn = context.model.getLineMaxColumn(selectToLineNumber);
			}

			return this._fromModelCursorState(context, cursor, new SingleCursorState(
				new Range(position.lineNumber, 1, selectToLineNumber, selectToColumn), 0,
				new Position(selectToLineNumber, selectToColumn), 0
			));
		}

		// Continuing line selection
		const enteringLineNumber = cursor.modelState.selectionStart.getStartPosition().lineNumber;

		if (position.lineNumber < enteringLineNumber) {

			return this._fromViewCursorState(context, cursor, cursor.viewState.move(
				cursor.modelState.hasSelection(), viewPosition.lineNumber, 1, 0
			));

		} else if (position.lineNumber > enteringLineNumber) {

			const lineCount = context.viewModel.getLineCount();

			let selectToViewLineNumber = viewPosition.lineNumber + 1;
			let selectToViewColumn = 1;
			if (selectToViewLineNumber > lineCount) {
				selectToViewLineNumber = lineCount;
				selectToViewColumn = context.viewModel.getLineMaxColumn(selectToViewLineNumber);
			}

			return this._fromViewCursorState(context, cursor, cursor.viewState.move(
				cursor.modelState.hasSelection(), selectToViewLineNumber, selectToViewColumn, 0
			));

		} else {

			const endPositionOfSelectionStart = cursor.modelState.selectionStart.getEndPosition();
			return this._fromModelCursorState(context, cursor, cursor.modelState.move(
				cursor.modelState.hasSelection(), endPositionOfSelectionStart.lineNumber, endPositionOfSelectionStart.column, 0
			));

		}
	}

	public static word(context: CursorContext, cursor: ICursor, inSelectionMode: boolean, _position: IPosition): CursorState {
		const position = context.validateModelPosition(_position);
		return this._fromModelCursorState(context, cursor, WordOperations.word(context.config, context.model, cursor.modelState, inSelectionMode, position));
	}

	public static cancelSelection(context: CursorContext, cursor: ICursor): CursorState {
		if (!cursor.modelState.hasSelection()) {
			return new CursorState(cursor.modelState, cursor.viewState);
		}

		const lineNumber = cursor.viewState.position.lineNumber;
		const column = cursor.viewState.position.column;

		return this._fromViewCursorState(context, cursor, new SingleCursorState(
			new Range(lineNumber, column, lineNumber, column), 0,
			new Position(lineNumber, column), 0
		));
	}

	// -------------------- STOP handlers that simply change cursor state
}

export namespace CursorMove {

	const isCursorMoveArgs = function (arg): boolean {
		if (!types.isObject(arg)) {
			return false;
		}

		let cursorMoveArg: RawArguments = arg;

		if (!types.isString(cursorMoveArg.to)) {
			return false;
		}

		if (!types.isUndefined(cursorMoveArg.select) && !types.isBoolean(cursorMoveArg.select)) {
			return false;
		}

		if (!types.isUndefined(cursorMoveArg.by) && !types.isString(cursorMoveArg.by)) {
			return false;
		}

		if (!types.isUndefined(cursorMoveArg.value) && !types.isNumber(cursorMoveArg.value)) {
			return false;
		}

		return true;
	};

	export const description = <ICommandHandlerDescription>{
		description: 'Move cursor to a logical position in the view',
		args: [
			{
				name: 'Cursor move argument object',
				description: `Property-value pairs that can be passed through this argument:
					* 'to': A mandatory logical position value providing where to move the cursor.
						\`\`\`
						'left', 'right', 'up', 'down'
						'wrappedLineStart', 'wrappedLineEnd', 'wrappedLineColumnCenter'
						'wrappedLineFirstNonWhitespaceCharacter', 'wrappedLineLastNonWhitespaceCharacter',
						'viewPortTop', 'viewPortCenter', 'viewPortBottom', 'viewPortIfOutside'
						\`\`\`
					* 'by': Unit to move. Default is computed based on 'to' value.
						\`\`\`
						'line', 'wrappedLine', 'character', 'halfLine'
						\`\`\`
					* 'value': Number of units to move. Default is '1'.
					* 'select': If 'true' makes the selection. Default is 'false'.
				`,
				constraint: isCursorMoveArgs
			}
		]
	};

	/**
	 * Positions in the view for cursor move command.
	 */
	export const RawDirection = {
		Left: 'left',
		Right: 'right',
		Up: 'up',
		Down: 'down',

		WrappedLineStart: 'wrappedLineStart',
		WrappedLineFirstNonWhitespaceCharacter: 'wrappedLineFirstNonWhitespaceCharacter',
		WrappedLineColumnCenter: 'wrappedLineColumnCenter',
		WrappedLineEnd: 'wrappedLineEnd',
		WrappedLineLastNonWhitespaceCharacter: 'wrappedLineLastNonWhitespaceCharacter',

		ViewPortTop: 'viewPortTop',
		ViewPortCenter: 'viewPortCenter',
		ViewPortBottom: 'viewPortBottom',

		ViewPortIfOutside: 'viewPortIfOutside'
	};

	/**
	 * Units for Cursor move 'by' argument
	 */
	export const RawUnit = {
		Line: 'line',
		WrappedLine: 'wrappedLine',
		Character: 'character',
		HalfLine: 'halfLine'
	};

	/**
	 * Arguments for Cursor move command
	 */
	export interface RawArguments {
		to: string;
		select?: boolean;
		by?: string;
		value?: number;
	};

	export function parse(args: RawArguments): ParsedArguments {
		if (!args.to) {
			// illegal arguments
			return null;
		}

		let direction: Direction;
		switch (args.to) {
			case RawDirection.Left:
				direction = Direction.Left;
				break;
			case RawDirection.Right:
				direction = Direction.Right;
				break;
			case RawDirection.Up:
				direction = Direction.Up;
				break;
			case RawDirection.Down:
				direction = Direction.Down;
				break;
			case RawDirection.WrappedLineStart:
				direction = Direction.WrappedLineStart;
				break;
			case RawDirection.WrappedLineFirstNonWhitespaceCharacter:
				direction = Direction.WrappedLineFirstNonWhitespaceCharacter;
				break;
			case RawDirection.WrappedLineColumnCenter:
				direction = Direction.WrappedLineColumnCenter;
				break;
			case RawDirection.WrappedLineEnd:
				direction = Direction.WrappedLineEnd;
				break;
			case RawDirection.WrappedLineLastNonWhitespaceCharacter:
				direction = Direction.WrappedLineLastNonWhitespaceCharacter;
				break;
			case RawDirection.ViewPortTop:
				direction = Direction.ViewPortTop;
				break;
			case RawDirection.ViewPortBottom:
				direction = Direction.ViewPortBottom;
				break;
			case RawDirection.ViewPortCenter:
				direction = Direction.ViewPortCenter;
				break;
			case RawDirection.ViewPortIfOutside:
				direction = Direction.ViewPortIfOutside;
				break;
			default:
				// illegal arguments
				return null;
		}

		let unit = Unit.None;
		switch (args.by) {
			case RawUnit.Line:
				unit = Unit.Line;
				break;
			case RawUnit.WrappedLine:
				unit = Unit.WrappedLine;
				break;
			case RawUnit.Character:
				unit = Unit.Character;
				break;
			case RawUnit.HalfLine:
				unit = Unit.HalfLine;
				break;
		}

		return {
			direction: direction,
			unit: unit,
			select: (!!args.select),
			value: (args.value || 1)
		};
	}

	export interface ParsedArguments {
		direction: Direction;
		unit: Unit;
		select: boolean;
		value: number;
	};

	export const enum Direction {
		Left,
		Right,
		Up,
		Down,

		WrappedLineStart,
		WrappedLineFirstNonWhitespaceCharacter,
		WrappedLineColumnCenter,
		WrappedLineEnd,
		WrappedLineLastNonWhitespaceCharacter,

		ViewPortTop,
		ViewPortCenter,
		ViewPortBottom,

		ViewPortIfOutside,
	};

	export const enum Unit {
		None,
		Line,
		WrappedLine,
		Character,
		HalfLine,
	};

}
