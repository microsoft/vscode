/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as types from '../../../base/common/types.js';
import { CursorState, SingleCursorState } from '../cursorCommon.js';
import { MoveOperations } from './cursorMoveOperations.js';
import { WordOperations } from './cursorWordOperations.js';
import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { TextDirection } from '../model.js';
export class CursorMoveCommands {
    static addCursorDown(viewModel, cursors, useLogicalLine) {
        const result = [];
        let resultLen = 0;
        for (let i = 0, len = cursors.length; i < len; i++) {
            const cursor = cursors[i];
            result[resultLen++] = new CursorState(cursor.modelState, cursor.viewState);
            if (useLogicalLine) {
                result[resultLen++] = CursorState.fromModelState(MoveOperations.translateDown(viewModel.cursorConfig, viewModel.model, cursor.modelState));
            }
            else {
                result[resultLen++] = CursorState.fromViewState(MoveOperations.translateDown(viewModel.cursorConfig, viewModel, cursor.viewState));
            }
        }
        return result;
    }
    static addCursorUp(viewModel, cursors, useLogicalLine) {
        const result = [];
        let resultLen = 0;
        for (let i = 0, len = cursors.length; i < len; i++) {
            const cursor = cursors[i];
            result[resultLen++] = new CursorState(cursor.modelState, cursor.viewState);
            if (useLogicalLine) {
                result[resultLen++] = CursorState.fromModelState(MoveOperations.translateUp(viewModel.cursorConfig, viewModel.model, cursor.modelState));
            }
            else {
                result[resultLen++] = CursorState.fromViewState(MoveOperations.translateUp(viewModel.cursorConfig, viewModel, cursor.viewState));
            }
        }
        return result;
    }
    static moveToBeginningOfLine(viewModel, cursors, inSelectionMode) {
        const result = [];
        for (let i = 0, len = cursors.length; i < len; i++) {
            const cursor = cursors[i];
            result[i] = this._moveToLineStart(viewModel, cursor, inSelectionMode);
        }
        return result;
    }
    static _moveToLineStart(viewModel, cursor, inSelectionMode) {
        const currentViewStateColumn = cursor.viewState.position.column;
        const currentModelStateColumn = cursor.modelState.position.column;
        const isFirstLineOfWrappedLine = currentViewStateColumn === currentModelStateColumn;
        const currentViewStatelineNumber = cursor.viewState.position.lineNumber;
        const firstNonBlankColumn = viewModel.getLineFirstNonWhitespaceColumn(currentViewStatelineNumber);
        const isBeginningOfViewLine = currentViewStateColumn === firstNonBlankColumn;
        if (!isFirstLineOfWrappedLine && !isBeginningOfViewLine) {
            return this._moveToLineStartByView(viewModel, cursor, inSelectionMode);
        }
        else {
            return this._moveToLineStartByModel(viewModel, cursor, inSelectionMode);
        }
    }
    static _moveToLineStartByView(viewModel, cursor, inSelectionMode) {
        return CursorState.fromViewState(MoveOperations.moveToBeginningOfLine(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode));
    }
    static _moveToLineStartByModel(viewModel, cursor, inSelectionMode) {
        return CursorState.fromModelState(MoveOperations.moveToBeginningOfLine(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode));
    }
    static moveToEndOfLine(viewModel, cursors, inSelectionMode, sticky) {
        const result = [];
        for (let i = 0, len = cursors.length; i < len; i++) {
            const cursor = cursors[i];
            result[i] = this._moveToLineEnd(viewModel, cursor, inSelectionMode, sticky);
        }
        return result;
    }
    static _moveToLineEnd(viewModel, cursor, inSelectionMode, sticky) {
        const viewStatePosition = cursor.viewState.position;
        const viewModelMaxColumn = viewModel.getLineMaxColumn(viewStatePosition.lineNumber);
        const isEndOfViewLine = viewStatePosition.column === viewModelMaxColumn;
        const modelStatePosition = cursor.modelState.position;
        const modelMaxColumn = viewModel.model.getLineMaxColumn(modelStatePosition.lineNumber);
        const isEndLineOfWrappedLine = viewModelMaxColumn - viewStatePosition.column === modelMaxColumn - modelStatePosition.column;
        if (isEndOfViewLine || isEndLineOfWrappedLine) {
            return this._moveToLineEndByModel(viewModel, cursor, inSelectionMode, sticky);
        }
        else {
            return this._moveToLineEndByView(viewModel, cursor, inSelectionMode, sticky);
        }
    }
    static _moveToLineEndByView(viewModel, cursor, inSelectionMode, sticky) {
        return CursorState.fromViewState(MoveOperations.moveToEndOfLine(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, sticky));
    }
    static _moveToLineEndByModel(viewModel, cursor, inSelectionMode, sticky) {
        return CursorState.fromModelState(MoveOperations.moveToEndOfLine(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode, sticky));
    }
    static expandLineSelection(viewModel, cursors) {
        const result = [];
        for (let i = 0, len = cursors.length; i < len; i++) {
            const cursor = cursors[i];
            const startLineNumber = cursor.modelState.selection.startLineNumber;
            const lineCount = viewModel.model.getLineCount();
            let endLineNumber = cursor.modelState.selection.endLineNumber;
            let endColumn;
            if (endLineNumber === lineCount) {
                endColumn = viewModel.model.getLineMaxColumn(lineCount);
            }
            else {
                endLineNumber++;
                endColumn = 1;
            }
            result[i] = CursorState.fromModelState(new SingleCursorState(new Range(startLineNumber, 1, startLineNumber, 1), 0 /* SelectionStartKind.Simple */, 0, new Position(endLineNumber, endColumn), 0));
        }
        return result;
    }
    static moveToBeginningOfBuffer(viewModel, cursors, inSelectionMode) {
        const result = [];
        for (let i = 0, len = cursors.length; i < len; i++) {
            const cursor = cursors[i];
            result[i] = CursorState.fromModelState(MoveOperations.moveToBeginningOfBuffer(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode));
        }
        return result;
    }
    static moveToEndOfBuffer(viewModel, cursors, inSelectionMode) {
        const result = [];
        for (let i = 0, len = cursors.length; i < len; i++) {
            const cursor = cursors[i];
            result[i] = CursorState.fromModelState(MoveOperations.moveToEndOfBuffer(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode));
        }
        return result;
    }
    static selectAll(viewModel, cursor) {
        const lineCount = viewModel.model.getLineCount();
        const maxColumn = viewModel.model.getLineMaxColumn(lineCount);
        return CursorState.fromModelState(new SingleCursorState(new Range(1, 1, 1, 1), 0 /* SelectionStartKind.Simple */, 0, new Position(lineCount, maxColumn), 0));
    }
    static line(viewModel, cursor, inSelectionMode, _position, _viewPosition) {
        const position = viewModel.model.validatePosition(_position);
        const viewPosition = (_viewPosition
            ? viewModel.coordinatesConverter.validateViewPosition(new Position(_viewPosition.lineNumber, _viewPosition.column), position)
            : viewModel.coordinatesConverter.convertModelPositionToViewPosition(position));
        if (!inSelectionMode) {
            // Entering line selection for the first time
            const lineCount = viewModel.model.getLineCount();
            let selectToLineNumber = position.lineNumber + 1;
            let selectToColumn = 1;
            if (selectToLineNumber > lineCount) {
                selectToLineNumber = lineCount;
                selectToColumn = viewModel.model.getLineMaxColumn(selectToLineNumber);
            }
            return CursorState.fromModelState(new SingleCursorState(new Range(position.lineNumber, 1, selectToLineNumber, selectToColumn), 2 /* SelectionStartKind.Line */, 0, new Position(selectToLineNumber, selectToColumn), 0));
        }
        // Continuing line selection
        const enteringLineNumber = cursor.modelState.selectionStart.getStartPosition().lineNumber;
        if (position.lineNumber < enteringLineNumber) {
            return CursorState.fromViewState(cursor.viewState.move(true, viewPosition.lineNumber, 1, 0));
        }
        else if (position.lineNumber > enteringLineNumber) {
            const lineCount = viewModel.getLineCount();
            let selectToViewLineNumber = viewPosition.lineNumber + 1;
            let selectToViewColumn = 1;
            if (selectToViewLineNumber > lineCount) {
                selectToViewLineNumber = lineCount;
                selectToViewColumn = viewModel.getLineMaxColumn(selectToViewLineNumber);
            }
            return CursorState.fromViewState(cursor.viewState.move(true, selectToViewLineNumber, selectToViewColumn, 0));
        }
        else {
            const endPositionOfSelectionStart = cursor.modelState.selectionStart.getEndPosition();
            return CursorState.fromModelState(cursor.modelState.move(true, endPositionOfSelectionStart.lineNumber, endPositionOfSelectionStart.column, 0));
        }
    }
    static word(viewModel, cursor, inSelectionMode, _position) {
        const position = viewModel.model.validatePosition(_position);
        return CursorState.fromModelState(WordOperations.word(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode, position));
    }
    static cancelSelection(viewModel, cursor) {
        if (!cursor.modelState.hasSelection()) {
            return new CursorState(cursor.modelState, cursor.viewState);
        }
        const lineNumber = cursor.viewState.position.lineNumber;
        const column = cursor.viewState.position.column;
        return CursorState.fromViewState(new SingleCursorState(new Range(lineNumber, column, lineNumber, column), 0 /* SelectionStartKind.Simple */, 0, new Position(lineNumber, column), 0));
    }
    static moveTo(viewModel, cursor, inSelectionMode, _position, _viewPosition) {
        if (inSelectionMode) {
            if (cursor.modelState.selectionStartKind === 1 /* SelectionStartKind.Word */) {
                return this.word(viewModel, cursor, inSelectionMode, _position);
            }
            if (cursor.modelState.selectionStartKind === 2 /* SelectionStartKind.Line */) {
                return this.line(viewModel, cursor, inSelectionMode, _position, _viewPosition);
            }
        }
        const position = viewModel.model.validatePosition(_position);
        const viewPosition = (_viewPosition
            ? viewModel.coordinatesConverter.validateViewPosition(new Position(_viewPosition.lineNumber, _viewPosition.column), position)
            : viewModel.coordinatesConverter.convertModelPositionToViewPosition(position));
        return CursorState.fromViewState(cursor.viewState.move(inSelectionMode, viewPosition.lineNumber, viewPosition.column, 0));
    }
    static simpleMove(viewModel, cursors, direction, inSelectionMode, value, unit) {
        switch (direction) {
            case 0 /* CursorMove.Direction.Left */: {
                if (unit === 4 /* CursorMove.Unit.HalfLine */) {
                    // Move left by half the current line length
                    return this._moveHalfLineLeft(viewModel, cursors, inSelectionMode);
                }
                else {
                    // Move left by `moveParams.value` columns
                    return this._moveLeft(viewModel, cursors, inSelectionMode, value);
                }
            }
            case 1 /* CursorMove.Direction.Right */: {
                if (unit === 4 /* CursorMove.Unit.HalfLine */) {
                    // Move right by half the current line length
                    return this._moveHalfLineRight(viewModel, cursors, inSelectionMode);
                }
                else {
                    // Move right by `moveParams.value` columns
                    return this._moveRight(viewModel, cursors, inSelectionMode, value);
                }
            }
            case 2 /* CursorMove.Direction.Up */: {
                if (unit === 2 /* CursorMove.Unit.WrappedLine */) {
                    // Move up by view lines
                    return this._moveUpByViewLines(viewModel, cursors, inSelectionMode, value);
                }
                else if (unit === 5 /* CursorMove.Unit.FoldedLine */) {
                    // Move up by model lines, skipping over folded regions
                    return this._moveUpByFoldedLines(viewModel, cursors, inSelectionMode, value);
                }
                else {
                    // Move up by model lines
                    return this._moveUpByModelLines(viewModel, cursors, inSelectionMode, value);
                }
            }
            case 3 /* CursorMove.Direction.Down */: {
                if (unit === 2 /* CursorMove.Unit.WrappedLine */) {
                    // Move down by view lines
                    return this._moveDownByViewLines(viewModel, cursors, inSelectionMode, value);
                }
                else if (unit === 5 /* CursorMove.Unit.FoldedLine */) {
                    // Move down by model lines, skipping over folded regions
                    return this._moveDownByFoldedLines(viewModel, cursors, inSelectionMode, value);
                }
                else {
                    // Move down by model lines
                    return this._moveDownByModelLines(viewModel, cursors, inSelectionMode, value);
                }
            }
            case 4 /* CursorMove.Direction.PrevBlankLine */: {
                if (unit === 2 /* CursorMove.Unit.WrappedLine */) {
                    return cursors.map(cursor => CursorState.fromViewState(MoveOperations.moveToPrevBlankLine(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode)));
                }
                else {
                    return cursors.map(cursor => CursorState.fromModelState(MoveOperations.moveToPrevBlankLine(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode)));
                }
            }
            case 5 /* CursorMove.Direction.NextBlankLine */: {
                if (unit === 2 /* CursorMove.Unit.WrappedLine */) {
                    return cursors.map(cursor => CursorState.fromViewState(MoveOperations.moveToNextBlankLine(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode)));
                }
                else {
                    return cursors.map(cursor => CursorState.fromModelState(MoveOperations.moveToNextBlankLine(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode)));
                }
            }
            case 6 /* CursorMove.Direction.WrappedLineStart */: {
                // Move to the beginning of the current view line
                return this._moveToViewMinColumn(viewModel, cursors, inSelectionMode);
            }
            case 7 /* CursorMove.Direction.WrappedLineFirstNonWhitespaceCharacter */: {
                // Move to the first non-whitespace column of the current view line
                return this._moveToViewFirstNonWhitespaceColumn(viewModel, cursors, inSelectionMode);
            }
            case 8 /* CursorMove.Direction.WrappedLineColumnCenter */: {
                // Move to the "center" of the current view line
                return this._moveToViewCenterColumn(viewModel, cursors, inSelectionMode);
            }
            case 9 /* CursorMove.Direction.WrappedLineEnd */: {
                // Move to the end of the current view line
                return this._moveToViewMaxColumn(viewModel, cursors, inSelectionMode);
            }
            case 10 /* CursorMove.Direction.WrappedLineLastNonWhitespaceCharacter */: {
                // Move to the last non-whitespace column of the current view line
                return this._moveToViewLastNonWhitespaceColumn(viewModel, cursors, inSelectionMode);
            }
            default:
                return null;
        }
    }
    static viewportMove(viewModel, cursors, direction, inSelectionMode, value) {
        const visibleViewRange = viewModel.getCompletelyVisibleViewRange();
        const visibleModelRange = viewModel.coordinatesConverter.convertViewRangeToModelRange(visibleViewRange);
        switch (direction) {
            case 11 /* CursorMove.Direction.ViewPortTop */: {
                // Move to the nth line start in the viewport (from the top)
                const modelLineNumber = this._firstLineNumberInRange(viewModel.model, visibleModelRange, value);
                const modelColumn = viewModel.model.getLineFirstNonWhitespaceColumn(modelLineNumber);
                return [this._moveToModelPosition(viewModel, cursors[0], inSelectionMode, modelLineNumber, modelColumn)];
            }
            case 13 /* CursorMove.Direction.ViewPortBottom */: {
                // Move to the nth line start in the viewport (from the bottom)
                const modelLineNumber = this._lastLineNumberInRange(viewModel.model, visibleModelRange, value);
                const modelColumn = viewModel.model.getLineFirstNonWhitespaceColumn(modelLineNumber);
                return [this._moveToModelPosition(viewModel, cursors[0], inSelectionMode, modelLineNumber, modelColumn)];
            }
            case 12 /* CursorMove.Direction.ViewPortCenter */: {
                // Move to the line start in the viewport center
                const modelLineNumber = Math.round((visibleModelRange.startLineNumber + visibleModelRange.endLineNumber) / 2);
                const modelColumn = viewModel.model.getLineFirstNonWhitespaceColumn(modelLineNumber);
                return [this._moveToModelPosition(viewModel, cursors[0], inSelectionMode, modelLineNumber, modelColumn)];
            }
            case 14 /* CursorMove.Direction.ViewPortIfOutside */: {
                // Move to a position inside the viewport
                const result = [];
                for (let i = 0, len = cursors.length; i < len; i++) {
                    const cursor = cursors[i];
                    result[i] = this.findPositionInViewportIfOutside(viewModel, cursor, visibleViewRange, inSelectionMode);
                }
                return result;
            }
            default:
                return null;
        }
    }
    static findPositionInViewportIfOutside(viewModel, cursor, visibleViewRange, inSelectionMode) {
        const viewLineNumber = cursor.viewState.position.lineNumber;
        if (visibleViewRange.startLineNumber <= viewLineNumber && viewLineNumber <= visibleViewRange.endLineNumber - 1) {
            // Nothing to do, cursor is in viewport
            return new CursorState(cursor.modelState, cursor.viewState);
        }
        else {
            let newViewLineNumber;
            if (viewLineNumber > visibleViewRange.endLineNumber - 1) {
                newViewLineNumber = visibleViewRange.endLineNumber - 1;
            }
            else if (viewLineNumber < visibleViewRange.startLineNumber) {
                newViewLineNumber = visibleViewRange.startLineNumber;
            }
            else {
                newViewLineNumber = viewLineNumber;
            }
            const position = MoveOperations.vertical(viewModel.cursorConfig, viewModel, viewLineNumber, cursor.viewState.position.column, cursor.viewState.leftoverVisibleColumns, newViewLineNumber, false);
            return CursorState.fromViewState(cursor.viewState.move(inSelectionMode, position.lineNumber, position.column, position.leftoverVisibleColumns));
        }
    }
    /**
     * Find the nth line start included in the range (from the start).
     */
    static _firstLineNumberInRange(model, range, count) {
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
    static _lastLineNumberInRange(model, range, count) {
        let startLineNumber = range.startLineNumber;
        if (range.startColumn !== model.getLineMinColumn(startLineNumber)) {
            // Move on to the second line if the first line start is not included in the range
            startLineNumber++;
        }
        return Math.max(startLineNumber, range.endLineNumber - count + 1);
    }
    static _moveLeft(viewModel, cursors, inSelectionMode, noOfColumns) {
        return cursors.map(cursor => {
            const direction = viewModel.getTextDirection(cursor.viewState.position.lineNumber);
            const isRtl = direction === TextDirection.RTL;
            return CursorState.fromViewState(isRtl
                ? MoveOperations.moveRight(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, noOfColumns)
                : MoveOperations.moveLeft(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, noOfColumns));
        });
    }
    static _moveHalfLineLeft(viewModel, cursors, inSelectionMode) {
        const result = [];
        for (let i = 0, len = cursors.length; i < len; i++) {
            const cursor = cursors[i];
            const viewLineNumber = cursor.viewState.position.lineNumber;
            const halfLine = Math.round(viewModel.getLineLength(viewLineNumber) / 2);
            result[i] = CursorState.fromViewState(MoveOperations.moveLeft(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, halfLine));
        }
        return result;
    }
    static _moveRight(viewModel, cursors, inSelectionMode, noOfColumns) {
        return cursors.map(cursor => {
            const direction = viewModel.getTextDirection(cursor.viewState.position.lineNumber);
            const isRtl = direction === TextDirection.RTL;
            return CursorState.fromViewState(isRtl
                ? MoveOperations.moveLeft(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, noOfColumns)
                : MoveOperations.moveRight(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, noOfColumns));
        });
    }
    static _moveHalfLineRight(viewModel, cursors, inSelectionMode) {
        const result = [];
        for (let i = 0, len = cursors.length; i < len; i++) {
            const cursor = cursors[i];
            const viewLineNumber = cursor.viewState.position.lineNumber;
            const halfLine = Math.round(viewModel.getLineLength(viewLineNumber) / 2);
            result[i] = CursorState.fromViewState(MoveOperations.moveRight(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, halfLine));
        }
        return result;
    }
    static _moveDownByViewLines(viewModel, cursors, inSelectionMode, linesCount) {
        const result = [];
        for (let i = 0, len = cursors.length; i < len; i++) {
            const cursor = cursors[i];
            result[i] = CursorState.fromViewState(MoveOperations.moveDown(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, linesCount));
        }
        return result;
    }
    static _moveDownByModelLines(viewModel, cursors, inSelectionMode, linesCount) {
        const result = [];
        for (let i = 0, len = cursors.length; i < len; i++) {
            const cursor = cursors[i];
            result[i] = CursorState.fromModelState(MoveOperations.moveDown(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode, linesCount));
        }
        return result;
    }
    static _moveUpByViewLines(viewModel, cursors, inSelectionMode, linesCount) {
        const result = [];
        for (let i = 0, len = cursors.length; i < len; i++) {
            const cursor = cursors[i];
            result[i] = CursorState.fromViewState(MoveOperations.moveUp(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, linesCount));
        }
        return result;
    }
    static _moveUpByModelLines(viewModel, cursors, inSelectionMode, linesCount) {
        const result = [];
        for (let i = 0, len = cursors.length; i < len; i++) {
            const cursor = cursors[i];
            result[i] = CursorState.fromModelState(MoveOperations.moveUp(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode, linesCount));
        }
        return result;
    }
    static _moveDownByFoldedLines(viewModel, cursors, inSelectionMode, count) {
        const model = viewModel.model;
        const lineCount = model.getLineCount();
        const hiddenAreas = viewModel.getHiddenAreas();
        return cursors.map(cursor => {
            const startLine = cursor.modelState.hasSelection() && !inSelectionMode
                ? cursor.modelState.selection.endLineNumber
                : cursor.modelState.position.lineNumber;
            const targetLine = CursorMoveCommands._targetFoldedDown(startLine, count, hiddenAreas, lineCount);
            const delta = targetLine - startLine;
            if (delta === 0) {
                return CursorState.fromModelState(cursor.modelState);
            }
            return CursorState.fromModelState(MoveOperations.moveDown(viewModel.cursorConfig, model, cursor.modelState, inSelectionMode, delta));
        });
    }
    static _moveUpByFoldedLines(viewModel, cursors, inSelectionMode, count) {
        const model = viewModel.model;
        const hiddenAreas = viewModel.getHiddenAreas();
        return cursors.map(cursor => {
            const startLine = cursor.modelState.hasSelection() && !inSelectionMode
                ? cursor.modelState.selection.startLineNumber
                : cursor.modelState.position.lineNumber;
            const targetLine = CursorMoveCommands._targetFoldedUp(startLine, count, hiddenAreas);
            const delta = startLine - targetLine;
            if (delta === 0) {
                return CursorState.fromModelState(cursor.modelState);
            }
            return CursorState.fromModelState(MoveOperations.moveUp(viewModel.cursorConfig, model, cursor.modelState, inSelectionMode, delta));
        });
    }
    // Compute the target line after moving `count` steps downward from `startLine`,
    // treating each folded region as a single step.
    static _targetFoldedDown(startLine, count, hiddenAreas, lineCount) {
        let line = startLine;
        let i = 0;
        while (i < hiddenAreas.length && hiddenAreas[i].endLineNumber < line + 1) {
            i++;
        }
        for (let step = 0; step < count; step++) {
            if (line >= lineCount) {
                return lineCount;
            }
            let candidate = line + 1;
            while (i < hiddenAreas.length && hiddenAreas[i].endLineNumber < candidate) {
                i++;
            }
            if (i < hiddenAreas.length && hiddenAreas[i].startLineNumber <= candidate) {
                candidate = hiddenAreas[i].endLineNumber + 1;
            }
            if (candidate > lineCount) {
                // The next visible line does not exist (e.g. a fold reaches EOF).
                return line;
            }
            line = candidate;
        }
        return line;
    }
    // Compute the target line after moving `count` steps upward from `startLine`,
    // treating each folded region as a single step.
    static _targetFoldedUp(startLine, count, hiddenAreas) {
        let line = startLine;
        let i = hiddenAreas.length - 1;
        while (i >= 0 && hiddenAreas[i].startLineNumber > line - 1) {
            i--;
        }
        for (let step = 0; step < count; step++) {
            if (line <= 1) {
                return 1;
            }
            let candidate = line - 1;
            while (i >= 0 && hiddenAreas[i].startLineNumber > candidate) {
                i--;
            }
            if (i >= 0 && hiddenAreas[i].endLineNumber >= candidate) {
                candidate = hiddenAreas[i].startLineNumber - 1;
            }
            if (candidate < 1) {
                // The previous visible line does not exist (e.g. a fold reaches BOF).
                return line;
            }
            line = candidate;
        }
        return line;
    }
    static _moveToViewPosition(viewModel, cursor, inSelectionMode, toViewLineNumber, toViewColumn) {
        return CursorState.fromViewState(cursor.viewState.move(inSelectionMode, toViewLineNumber, toViewColumn, 0));
    }
    static _moveToModelPosition(viewModel, cursor, inSelectionMode, toModelLineNumber, toModelColumn) {
        return CursorState.fromModelState(cursor.modelState.move(inSelectionMode, toModelLineNumber, toModelColumn, 0));
    }
    static _moveToViewMinColumn(viewModel, cursors, inSelectionMode) {
        const result = [];
        for (let i = 0, len = cursors.length; i < len; i++) {
            const cursor = cursors[i];
            const viewLineNumber = cursor.viewState.position.lineNumber;
            const viewColumn = viewModel.getLineMinColumn(viewLineNumber);
            result[i] = this._moveToViewPosition(viewModel, cursor, inSelectionMode, viewLineNumber, viewColumn);
        }
        return result;
    }
    static _moveToViewFirstNonWhitespaceColumn(viewModel, cursors, inSelectionMode) {
        const result = [];
        for (let i = 0, len = cursors.length; i < len; i++) {
            const cursor = cursors[i];
            const viewLineNumber = cursor.viewState.position.lineNumber;
            const viewColumn = viewModel.getLineFirstNonWhitespaceColumn(viewLineNumber);
            result[i] = this._moveToViewPosition(viewModel, cursor, inSelectionMode, viewLineNumber, viewColumn);
        }
        return result;
    }
    static _moveToViewCenterColumn(viewModel, cursors, inSelectionMode) {
        const result = [];
        for (let i = 0, len = cursors.length; i < len; i++) {
            const cursor = cursors[i];
            const viewLineNumber = cursor.viewState.position.lineNumber;
            const viewColumn = Math.round((viewModel.getLineMaxColumn(viewLineNumber) + viewModel.getLineMinColumn(viewLineNumber)) / 2);
            result[i] = this._moveToViewPosition(viewModel, cursor, inSelectionMode, viewLineNumber, viewColumn);
        }
        return result;
    }
    static _moveToViewMaxColumn(viewModel, cursors, inSelectionMode) {
        const result = [];
        for (let i = 0, len = cursors.length; i < len; i++) {
            const cursor = cursors[i];
            const viewLineNumber = cursor.viewState.position.lineNumber;
            const viewColumn = viewModel.getLineMaxColumn(viewLineNumber);
            result[i] = this._moveToViewPosition(viewModel, cursor, inSelectionMode, viewLineNumber, viewColumn);
        }
        return result;
    }
    static _moveToViewLastNonWhitespaceColumn(viewModel, cursors, inSelectionMode) {
        const result = [];
        for (let i = 0, len = cursors.length; i < len; i++) {
            const cursor = cursors[i];
            const viewLineNumber = cursor.viewState.position.lineNumber;
            const viewColumn = viewModel.getLineLastNonWhitespaceColumn(viewLineNumber);
            result[i] = this._moveToViewPosition(viewModel, cursor, inSelectionMode, viewLineNumber, viewColumn);
        }
        return result;
    }
}
export var CursorMove;
(function (CursorMove) {
    const isCursorMoveArgs = function (arg) {
        if (!types.isObject(arg)) {
            return false;
        }
        const cursorMoveArg = arg;
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
        if (!types.isUndefined(cursorMoveArg.noHistory) && !types.isBoolean(cursorMoveArg.noHistory)) {
            return false;
        }
        return true;
    };
    CursorMove.metadata = {
        description: 'Move cursor to a logical position in the view',
        args: [
            {
                name: 'Cursor move argument object',
                description: `Property-value pairs that can be passed through this argument:
					* 'to': A mandatory logical position value providing where to move the cursor.
						\`\`\`
						'left', 'right', 'up', 'down', 'prevBlankLine', 'nextBlankLine',
						'wrappedLineStart', 'wrappedLineEnd', 'wrappedLineColumnCenter'
						'wrappedLineFirstNonWhitespaceCharacter', 'wrappedLineLastNonWhitespaceCharacter'
						'viewPortTop', 'viewPortCenter', 'viewPortBottom', 'viewPortIfOutside'
						\`\`\`
					* 'by': Unit to move. Default is computed based on 'to' value.
						\`\`\`
						'line', 'wrappedLine', 'character', 'halfLine', 'foldedLine'
						\`\`\`
						Use 'foldedLine' with 'up'/'down' to move by logical lines while treating each
						folded region as a single step.
					* 'value': Number of units to move. Default is '1'.
					* 'select': If 'true' makes the selection. Default is 'false'.
					* 'noHistory': If 'true' does not add the movement to navigation history. Default is 'false'.
				`,
                constraint: isCursorMoveArgs,
                schema: {
                    'type': 'object',
                    'required': ['to'],
                    'properties': {
                        'to': {
                            'type': 'string',
                            'enum': ['left', 'right', 'up', 'down', 'prevBlankLine', 'nextBlankLine', 'wrappedLineStart', 'wrappedLineEnd', 'wrappedLineColumnCenter', 'wrappedLineFirstNonWhitespaceCharacter', 'wrappedLineLastNonWhitespaceCharacter', 'viewPortTop', 'viewPortCenter', 'viewPortBottom', 'viewPortIfOutside']
                        },
                        'by': {
                            'type': 'string',
                            'enum': ['line', 'wrappedLine', 'character', 'halfLine', 'foldedLine']
                        },
                        'value': {
                            'type': 'number',
                            'default': 1
                        },
                        'select': {
                            'type': 'boolean',
                            'default': false
                        },
                        'noHistory': {
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
    CursorMove.RawDirection = {
        Left: 'left',
        Right: 'right',
        Up: 'up',
        Down: 'down',
        PrevBlankLine: 'prevBlankLine',
        NextBlankLine: 'nextBlankLine',
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
    CursorMove.RawUnit = {
        Line: 'line',
        WrappedLine: 'wrappedLine',
        Character: 'character',
        HalfLine: 'halfLine',
        FoldedLine: 'foldedLine'
    };
    function parse(args) {
        if (!args.to) {
            // illegal arguments
            return null;
        }
        let direction;
        switch (args.to) {
            case CursorMove.RawDirection.Left:
                direction = 0 /* Direction.Left */;
                break;
            case CursorMove.RawDirection.Right:
                direction = 1 /* Direction.Right */;
                break;
            case CursorMove.RawDirection.Up:
                direction = 2 /* Direction.Up */;
                break;
            case CursorMove.RawDirection.Down:
                direction = 3 /* Direction.Down */;
                break;
            case CursorMove.RawDirection.PrevBlankLine:
                direction = 4 /* Direction.PrevBlankLine */;
                break;
            case CursorMove.RawDirection.NextBlankLine:
                direction = 5 /* Direction.NextBlankLine */;
                break;
            case CursorMove.RawDirection.WrappedLineStart:
                direction = 6 /* Direction.WrappedLineStart */;
                break;
            case CursorMove.RawDirection.WrappedLineFirstNonWhitespaceCharacter:
                direction = 7 /* Direction.WrappedLineFirstNonWhitespaceCharacter */;
                break;
            case CursorMove.RawDirection.WrappedLineColumnCenter:
                direction = 8 /* Direction.WrappedLineColumnCenter */;
                break;
            case CursorMove.RawDirection.WrappedLineEnd:
                direction = 9 /* Direction.WrappedLineEnd */;
                break;
            case CursorMove.RawDirection.WrappedLineLastNonWhitespaceCharacter:
                direction = 10 /* Direction.WrappedLineLastNonWhitespaceCharacter */;
                break;
            case CursorMove.RawDirection.ViewPortTop:
                direction = 11 /* Direction.ViewPortTop */;
                break;
            case CursorMove.RawDirection.ViewPortBottom:
                direction = 13 /* Direction.ViewPortBottom */;
                break;
            case CursorMove.RawDirection.ViewPortCenter:
                direction = 12 /* Direction.ViewPortCenter */;
                break;
            case CursorMove.RawDirection.ViewPortIfOutside:
                direction = 14 /* Direction.ViewPortIfOutside */;
                break;
            default:
                // illegal arguments
                return null;
        }
        let unit = 0 /* Unit.None */;
        switch (args.by) {
            case CursorMove.RawUnit.Line:
                unit = 1 /* Unit.Line */;
                break;
            case CursorMove.RawUnit.WrappedLine:
                unit = 2 /* Unit.WrappedLine */;
                break;
            case CursorMove.RawUnit.Character:
                unit = 3 /* Unit.Character */;
                break;
            case CursorMove.RawUnit.HalfLine:
                unit = 4 /* Unit.HalfLine */;
                break;
            case CursorMove.RawUnit.FoldedLine:
                unit = 5 /* Unit.FoldedLine */;
                break;
        }
        return {
            direction: direction,
            unit: unit,
            select: (!!args.select),
            value: (args.value || 1),
            noHistory: (!!args.noHistory)
        };
    }
    CursorMove.parse = parse;
    let Direction;
    (function (Direction) {
        Direction[Direction["Left"] = 0] = "Left";
        Direction[Direction["Right"] = 1] = "Right";
        Direction[Direction["Up"] = 2] = "Up";
        Direction[Direction["Down"] = 3] = "Down";
        Direction[Direction["PrevBlankLine"] = 4] = "PrevBlankLine";
        Direction[Direction["NextBlankLine"] = 5] = "NextBlankLine";
        Direction[Direction["WrappedLineStart"] = 6] = "WrappedLineStart";
        Direction[Direction["WrappedLineFirstNonWhitespaceCharacter"] = 7] = "WrappedLineFirstNonWhitespaceCharacter";
        Direction[Direction["WrappedLineColumnCenter"] = 8] = "WrappedLineColumnCenter";
        Direction[Direction["WrappedLineEnd"] = 9] = "WrappedLineEnd";
        Direction[Direction["WrappedLineLastNonWhitespaceCharacter"] = 10] = "WrappedLineLastNonWhitespaceCharacter";
        Direction[Direction["ViewPortTop"] = 11] = "ViewPortTop";
        Direction[Direction["ViewPortCenter"] = 12] = "ViewPortCenter";
        Direction[Direction["ViewPortBottom"] = 13] = "ViewPortBottom";
        Direction[Direction["ViewPortIfOutside"] = 14] = "ViewPortIfOutside";
    })(Direction = CursorMove.Direction || (CursorMove.Direction = {}));
    let Unit;
    (function (Unit) {
        Unit[Unit["None"] = 0] = "None";
        Unit[Unit["Line"] = 1] = "Line";
        Unit[Unit["WrappedLine"] = 2] = "WrappedLine";
        Unit[Unit["Character"] = 3] = "Character";
        Unit[Unit["HalfLine"] = 4] = "HalfLine";
        Unit[Unit["FoldedLine"] = 5] = "FoldedLine";
    })(Unit = CursorMove.Unit || (CursorMove.Unit = {}));
})(CursorMove || (CursorMove = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3Vyc29yTW92ZUNvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9jdXJzb3IvY3Vyc29yTW92ZUNvbW1hbmRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxLQUFLLE1BQU0sK0JBQStCLENBQUM7QUFDdkQsT0FBTyxFQUFFLFdBQVcsRUFBOEQsaUJBQWlCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNoSSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDM0QsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQzNELE9BQU8sRUFBYSxRQUFRLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFHekMsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUU1QyxNQUFNLE9BQU8sa0JBQWtCO0lBRXZCLE1BQU0sQ0FBQyxhQUFhLENBQUMsU0FBcUIsRUFBRSxPQUFzQixFQUFFLGNBQXVCO1FBQ2pHLE1BQU0sTUFBTSxHQUF5QixFQUFFLENBQUM7UUFDeEMsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO1FBQ2xCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNwRCxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDMUIsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLEdBQUcsSUFBSSxXQUFXLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDM0UsSUFB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