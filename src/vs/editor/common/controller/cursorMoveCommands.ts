/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as types from 'vs/base/common/types';
import { CursorContext, CursorState, ICursorSimpleModel, PartialCursorState, SingleCursorState } from 'vs/editor/common/controller/cursorCommon';
import { MoveOperations } from 'vs/editor/common/controller/cursorMoveOperations';
import { WordOperations } from 'vs/editor/common/controller/cursorWordOperations';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ICommandHandlerDescription } from 'vs/platform/commands/common/commands';

export class CursorMoveCommands {

	public static addCursorDown(context: CursorContext, cursors: CursorState[], useLogicalLine: boolean): PartialCursorState[] {
		let result: PartialCursorState[] = [], resultLen = 0;
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[resultLen++] = new CursorState(cursor.modelState, cursor.viewState);
			if (useLogicalLine) {
				result[resultLen++] = CursorState.fromModelState(MoveOperations.translateDown(context.config, context.model, cursor.modelState));
			} else {
				result[resultLen++] = CursorState.fromViewState(MoveOperations.translateDown(context.config, context.viewModel, cursor.viewState));
			}
		}
		return result;
	}

	public static addCursorUp(context: CursorContext, cursors: CursorState[], useLogicalLine: boolean): PartialCursorState[] {
		let result: PartialCursorState[] = [], resultLen = 0;
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[resultLen++] = new CursorState(cursor.modelState, cursor.viewState);
			if (useLogicalLine) {
				result[resultLen++] = CursorState.fromModelState(MoveOperations.translateUp(context.config, context.model, cursor.modelState));
			} else {
				result[resultLen++] = CursorState.fromViewState(MoveOperations.translateUp(context.config, context.viewModel, cursor.viewState));
			}
		}
		return result;
	}

	public static moveToBeginningOfLine(context: CursorContext, cursors: CursorState[], inSelectionMode: boolean): PartialCursorState[] {
		let result: PartialCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._moveToLineStart(context, cursor, inSelectionMode);
		}

		return result;
	}

	private static _moveToLineStart(context: CursorContext, cursor: CursorState, inSelectionMode: boolean): PartialCursorState {
		const currentViewStateColumn = cursor.viewState.position.column;
		const currentModelStateColumn = cursor.modelState.position.column;
		const isFirstLineOfWrappedLine = currentViewStateColumn === currentModelStateColumn;

		const currentViewStatelineNumber = cursor.viewState.position.lineNumber;
		const firstNonBlankColumn = context.viewModel.getLineFirstNonWhitespaceColumn(currentViewStatelineNumber);
		const isBeginningOfViewLine = currentViewStateColumn === firstNonBlankColumn;

		if (!isFirstLineOfWrappedLine && !isBeginningOfViewLine) {
			return this._moveToLineStartByView(context, cursor, inSelectionMode);
		} else {
			return this._moveToLineStartByModel(context, cursor, inSelectionMode);
		}
	}

	private static _moveToLineStartByView(context: CursorContext, cursor: CursorState, inSelectionMode: boolean): PartialCursorState {
		return CursorState.fromViewState(
			MoveOperations.moveToBeginningOfLine(context.config, context.viewModel, cursor.viewState, inSelectionMode)
		);
	}

	private static _moveToLineStartByModel(context: CursorContext, cursor: CursorState, inSelectionMode: boolean): PartialCursorState {
		return CursorState.fromModelState(
			MoveOperations.moveToBeginningOfLine(context.config, context.model, cursor.modelState, inSelectionMode)
		);
	}

	public static moveToEndOfLine(context: CursorContext, cursors: CursorState[], inSelectionMode: boolean): PartialCursorState[] {
		let result: PartialCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = this._moveToLineEnd(context, cursor, inSelectionMode);
		}

		return result;
	}

	private static _moveToLineEnd(context: CursorContext, cursor: CursorState, inSelectionMode: boolean): PartialCursorState {
		const viewStatePosition = cursor.viewState.position;
		const viewModelMaxColumn = context.viewModel.getLineMaxColumn(viewStatePosition.lineNumber);
		const isEndOfViewLine = viewStatePosition.column === viewModelMaxColumn;

		const modelStatePosition = cursor.modelState.position;
		const modelMaxColumn = context.model.getLineMaxColumn(modelStatePosition.lineNumber);
		const isEndLineOfWrappedLine = viewModelMaxColumn - viewStatePosition.column === modelMaxColumn - modelStatePosition.column;

		if (isEndOfViewLine || isEndLineOfWrappedLine) {
			return this._moveToLineEndByModel(context, cursor, inSelectionMode);
		} else {
			return this._moveToLineEndByView(context, cursor, inSelectionMode);
		}
	}

	private static _moveToLineEndByView(context: CursorContext, cursor: CursorState, inSelectionMode: boolean): PartialCursorState {
		return CursorState.fromViewState(
			MoveOperations.moveToEndOfLine(context.config, context.viewModel, cursor.viewState, inSelectionMode)
		);
	}

	private static _moveToLineEndByModel(context: CursorContext, cursor: CursorState, inSelectionMode: boolean): PartialCursorState {
		return CursorState.fromModelState(
			MoveOperations.moveToEndOfLine(context.config, context.model, cursor.modelState, inSelectionMode)
		);
	}

	public static expandLineSelection(context: CursorContext, cursors: CursorState[]): PartialCursorState[] {
		let result: PartialCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];

			const startLineNumber = cursor.modelState.selection.startLineNumber;
			const lineCount = context.model.getLineCount();

			let endLineNumber = cursor.modelState.selection.endLineNumber;
			let endColumn: number;
			if (endLineNumber === lineCount) {
				endColumn = context.model.getLineMaxColumn(lineCount);
			} else {
				endLineNumber++;
				endColumn = 1;
			}

			result[i] = CursorState.fromModelState(new SingleCursorState(
				new Range(startLineNumber, 1, startLineNumber, 1), 0,
				new Position(endLineNumber, endColumn), 0
			));
		}
		return result;
	}

	public static moveToBeginningOfBuffer(context: CursorContext, cursors: CursorState[], inSelectionMode: boolean): PartialCursorState[] {
		let result: PartialCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = CursorState.fromModelState(MoveOperations.moveToBeginningOfBuffer(context.config, context.model, cursor.modelState, inSelectionMode));
		}
		return result;
	}

	public static moveToEndOfBuffer(context: CursorContext, cursors: CursorState[], inSelectionMode: boolean): PartialCursorState[] {
		let result: PartialCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = CursorState.fromModelState(MoveOperations.moveToEndOfBuffer(context.config, context.model, cursor.modelState, inSelectionMode));
		}
		return result;
	}

	public static selectAll(context: CursorContext, cursor: CursorState): PartialCursorState {
		const lineCount = context.model.getLineCount();
		const maxColumn = context.model.getLineMaxColumn(lineCount);

		return CursorState.fromModelState(new SingleCursorState(
			new Range(1, 1, 1, 1), 0,
			new Position(lineCount, maxColumn), 0
		));
	}

	public static line(context: CursorContext, cursor: CursorState, inSelectionMode: boolean, _position: IPosition, _viewPosition: IPosition): PartialCursorState {
		const position = context.model.validatePosition(_position);
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

			return CursorState.fromModelState(new SingleCursorState(
				new Range(position.lineNumber, 1, selectToLineNumber, selectToColumn), 0,
				new Position(selectToLineNumber, selectToColumn), 0
			));
		}

		// Continuing line selection
		const enteringLineNumber = cursor.modelState.selectionStart.getStartPosition().lineNumber;

		if (position.lineNumber < enteringLineNumber) {

			return CursorState.fromViewState(cursor.viewState.move(
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

			return CursorState.fromViewState(cursor.viewState.move(
				cursor.modelState.hasSelection(), selectToViewLineNumber, selectToViewColumn, 0
			));

		} else {

			const endPositionOfSelectionStart = cursor.modelState.selectionStart.getEndPosition();
			return CursorState.fromModelState(cursor.modelState.move(
				cursor.modelState.hasSelection(), endPositionOfSelectionStart.lineNumber, endPositionOfSelectionStart.column, 0
			));

		}
	}

	public static word(context: CursorContext, cursor: CursorState, inSelectionMode: boolean, _position: IPosition): PartialCursorState {
		const position = context.model.validatePosition(_position);
		return CursorState.fromModelState(WordOperations.word(context.config, context.model, cursor.modelState, inSelectionMode, position));
	}

	public static cancelSelection(context: CursorContext, cursor: CursorState): PartialCursorState {
		if (!cursor.modelState.hasSelection()) {
			return new CursorState(cursor.modelState, cursor.viewState);
		}

		const lineNumber = cursor.viewState.position.lineNumber;
		const column = cursor.viewState.position.column;

		return CursorState.fromViewState(new SingleCursorState(
			new Range(lineNumber, column, lineNumber, column), 0,
			new Position(lineNumber, column), 0
		));
	}

	public static moveTo(context: CursorContext, cursor: CursorState, inSelectionMode: boolean, _position: IPosition, _viewPosition: IPosition): PartialCursorState {
		const position = context.model.validatePosition(_position);
		const viewPosition = (
			_viewPosition
				? context.validateViewPosition(new Position(_viewPosition.lineNumber, _viewPosition.column), position)
				: context.convertModelPositionToViewPosition(position)
		);
		return CursorState.fromViewState(cursor.viewState.move(inSelectionMode, viewPosition.lineNumber, viewPosition.column, 0));
	}

	public static move(context: CursorContext, cursors: CursorState[], args: CursorMove.ParsedArguments): PartialCursorState[] | null {
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
				let result: PartialCursorState[] = [];
				for (let i = 0, len = cursors.length; i < len; i++) {
					const cursor = cursors[i];
					result[i] = this.findPositionInViewportIfOutside(context, cursor, visibleViewRange, inSelectionMode);
				}
				return result;
			}
		}

		return null;
	}


	public static findPositionInViewportIfOutside(context: CursorContext, cursor: CursorState, visibleViewRange: Range, inSelectionMode: boolean): PartialCursorState {
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

	private static _moveLeft(context: CursorContext, cursors: CursorState[], inSelectionMode: boolean, noOfColumns: number): PartialCursorState[] {
		let result: PartialCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];

			let newViewState = MoveOperations.moveLeft(context.config, context.viewModel, cursor.viewState, inSelectionMode, noOfColumns);

			if (!cursor.viewState.hasSelection() && noOfColumns === 1 && newViewState.position.lineNumber !== cursor.viewState.position.lineNumber) {
				// moved over to the previous view line
				const newViewModelPosition = context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(newViewState.position);
				if (newViewModelPosition.lineNumber === cursor.modelState.position.lineNumber) {
					// stayed on the same model line => pass wrapping point where 2 view positions map to a single model position
					newViewState = MoveOperations.moveLeft(context.config, context.viewModel, newViewState, inSelectionMode, 1);
				}
			}

			result[i] = CursorState.fromViewState(newViewState);
		}
		return result;
	}

	private static _moveHalfLineLeft(context: CursorContext, cursors: CursorState[], inSelectionMode: boolean): PartialCursorState[] {
		let result: PartialCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const halfLine = Math.round(context.viewModel.getLineContent(viewLineNumber).length / 2);
			result[i] = CursorState.fromViewState(MoveOperations.moveLeft(context.config, context.viewModel, cursor.viewState, inSelectionMode, halfLine));
		}
		return result;
	}

	private static _moveRight(context: CursorContext, cursors: CursorState[], inSelectionMode: boolean, noOfColumns: number): PartialCursorState[] {
		let result: PartialCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			let newViewState = MoveOperations.moveRight(context.config, context.viewModel, cursor.viewState, inSelectionMode, noOfColumns);

			if (!cursor.viewState.hasSelection() && noOfColumns === 1 && newViewState.position.lineNumber !== cursor.viewState.position.lineNumber) {
				// moved over to the next view line
				const newViewModelPosition = context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(newViewState.position);
				if (newViewModelPosition.lineNumber === cursor.modelState.position.lineNumber) {
					// stayed on the same model line => pass wrapping point where 2 view positions map to a single model position
					newViewState = MoveOperations.moveRight(context.config, context.viewModel, newViewState, inSelectionMode, 1);
				}
			}

			result[i] = CursorState.fromViewState(newViewState);
		}
		return result;
	}

	private static _moveHalfLineRight(context: CursorContext, cursors: CursorState[], inSelectionMode: boolean): PartialCursorState[] {
		let result: PartialCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const halfLine = Math.round(context.viewModel.getLineContent(viewLineNumber).length / 2);
			result[i] = CursorState.fromViewState(MoveOperations.moveRight(context.config, context.viewModel, cursor.viewState, inSelectionMode, halfLine));
		}
		return result;
	}

	private static _moveDownByViewLines(context: CursorContext, cursors: CursorState[], inSelectionMode: boolean, linesCount: number): PartialCursorState[] {
		let result: PartialCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = CursorState.fromViewState(MoveOperations.moveDown(context.config, context.viewModel, cursor.viewState, inSelectionMode, linesCount));
		}
		return result;
	}

	private static _moveDownByModelLines(context: CursorContext, cursors: CursorState[], inSelectionMode: boolean, linesCount: number): PartialCursorState[] {
		let result: PartialCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = CursorState.fromModelState(MoveOperations.moveDown(context.config, context.model, cursor.modelState, inSelectionMode, linesCount));
		}
		return result;
	}

	private static _moveUpByViewLines(context: CursorContext, cursors: CursorState[], inSelectionMode: boolean, linesCount: number): PartialCursorState[] {
		let result: PartialCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = CursorState.fromViewState(MoveOperations.moveUp(context.config, context.viewModel, cursor.viewState, inSelectionMode, linesCount));
		}
		return result;
	}

	private static _moveUpByModelLines(context: CursorContext, cursors: CursorState[], inSelectionMode: boolean, linesCount: number): PartialCursorState[] {
		let result: PartialCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			result[i] = CursorState.fromModelState(MoveOperations.moveUp(context.config, context.model, cursor.modelState, inSelectionMode, linesCount));
		}
		return result;
	}

	private static _moveToViewPosition(context: CursorContext, cursor: CursorState, inSelectionMode: boolean, toViewLineNumber: number, toViewColumn: number): PartialCursorState {
		return CursorState.fromViewState(cursor.viewState.move(inSelectionMode, toViewLineNumber, toViewColumn, 0));
	}

	private static _moveToModelPosition(context: CursorContext, cursor: CursorState, inSelectionMode: boolean, toModelLineNumber: number, toModelColumn: number): PartialCursorState {
		return CursorState.fromModelState(cursor.modelState.move(inSelectionMode, toModelLineNumber, toModelColumn, 0));
	}

	private static _moveToViewMinColumn(context: CursorContext, cursors: CursorState[], inSelectionMode: boolean): PartialCursorState[] {
		let result: PartialCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const viewColumn = context.viewModel.getLineMinColumn(viewLineNumber);
			result[i] = this._moveToViewPosition(context, cursor, inSelectionMode, viewLineNumber, viewColumn);
		}
		return result;
	}

	private static _moveToViewFirstNonWhitespaceColumn(context: CursorContext, cursors: CursorState[], inSelectionMode: boolean): PartialCursorState[] {
		let result: PartialCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const viewColumn = context.viewModel.getLineFirstNonWhitespaceColumn(viewLineNumber);
			result[i] = this._moveToViewPosition(context, cursor, inSelectionMode, viewLineNumber, viewColumn);
		}
		return result;
	}

	private static _moveToViewCenterColumn(context: CursorContext, cursors: CursorState[], inSelectionMode: boolean): PartialCursorState[] {
		let result: PartialCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const viewColumn = Math.round((context.viewModel.getLineMaxColumn(viewLineNumber) + context.viewModel.getLineMinColumn(viewLineNumber)) / 2);
			result[i] = this._moveToViewPosition(context, cursor, inSelectionMode, viewLineNumber, viewColumn);
		}
		return result;
	}

	private static _moveToViewMaxColumn(context: CursorContext, cursors: CursorState[], inSelectionMode: boolean): PartialCursorState[] {
		let result: PartialCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const viewColumn = context.viewModel.getLineMaxColumn(viewLineNumber);
			result[i] = this._moveToViewPosition(context, cursor, inSelectionMode, viewLineNumber, viewColumn);
		}
		return result;
	}

	private static _moveToViewLastNonWhitespaceColumn(context: CursorContext, cursors: CursorState[], inSelectionMode: boolean): PartialCursorState[] {
		let result: PartialCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const viewLineNumber = cursor.viewState.position.lineNumber;
			const viewColumn = context.viewModel.getLineLastNonWhitespaceColumn(viewLineNumber);
			result[i] = this._moveToViewPosition(context, cursor, inSelectionMode, viewLineNumber, viewColumn);
		}
		return result;
	}
}

export namespace CursorMove {

	const isCursorMoveArgs = function (arg: any): boolean {
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
						'wrappedLineFirstNonWhitespaceCharacter', 'wrappedLineLastNonWhitespaceCharacter'
						'viewPortTop', 'viewPortCenter', 'viewPortBottom', 'viewPortIfOutside'
						\`\`\`
					* 'by': Unit to move. Default is computed based on 'to' value.
						\`\`\`
						'line', 'wrappedLine', 'character', 'halfLine'
						\`\`\`
					* 'value': Number of units to move. Default is '1'.
					* 'select': If 'true' makes the selection. Default is 'false'.
				`,
				constraint: isCursorMoveArgs,
				schema: {
					'type': 'object',
					'required': ['to'],
					'properties': {
						'to': {
							'type': 'string',
							'enum': ['left', 'right', 'up', 'down', 'wrappedLineStart', 'wrappedLineEnd', 'wrappedLineColumnCenter', 'wrappedLineFirstNonWhitespaceCharacter', 'wrappedLineLastNonWhitespaceCharacter', 'viewPortTop', 'viewPortCenter', 'viewPortBottom', 'viewPortIfOutside']
						},
						'by': {
							'type': 'string',
							'enum': ['line', 'wrappedLine', 'character', 'halfLine']
						},
						'value': {
							'type': 'number',
							'default': 1
						},
						'select': {
							'type': 'boolean',
							'default': false
						}
					}
				}
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
	}

	export function parse(args: RawArguments): ParsedArguments | null {
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
	}

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
	}

	export const enum Unit {
		None,
		Line,
		WrappedLine,
		Character,
		HalfLine,
	}

}
