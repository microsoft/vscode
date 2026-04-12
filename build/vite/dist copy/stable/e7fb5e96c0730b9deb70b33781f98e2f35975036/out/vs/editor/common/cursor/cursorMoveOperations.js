/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as strings from '../../../base/common/strings.js';
import { CursorColumns } from '../core/cursorColumns.js';
import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { AtomicTabMoveOperations } from './cursorAtomicMoveOperations.js';
import { SingleCursorState } from '../cursorCommon.js';
export class CursorPosition {
    constructor(lineNumber, column, leftoverVisibleColumns) {
        this._cursorPositionBrand = undefined;
        this.lineNumber = lineNumber;
        this.column = column;
        this.leftoverVisibleColumns = leftoverVisibleColumns;
    }
}
export class MoveOperations {
    static leftPosition(model, position) {
        if (position.column > model.getLineMinColumn(position.lineNumber)) {
            return position.delta(undefined, -strings.prevCharLength(model.getLineContent(position.lineNumber), position.column - 1));
        }
        else if (position.lineNumber > 1) {
            const newLineNumber = position.lineNumber - 1;
            return new Position(newLineNumber, model.getLineMaxColumn(newLineNumber));
        }
        else {
            return position;
        }
    }
    static leftPositionAtomicSoftTabs(model, position, tabSize) {
        if (position.column <= model.getLineIndentColumn(position.lineNumber)) {
            const minColumn = model.getLineMinColumn(position.lineNumber);
            const lineContent = model.getLineContent(position.lineNumber);
            const newPosition = AtomicTabMoveOperations.atomicPosition(lineContent, position.column - 1, tabSize, 0 /* Direction.Left */);
            if (newPosition !== -1 && newPosition + 1 >= minColumn) {
                return new Position(position.lineNumber, newPosition + 1);
            }
        }
        return this.leftPosition(model, position);
    }
    static left(config, model, position) {
        const pos = config.stickyTabStops
            ? MoveOperations.leftPositionAtomicSoftTabs(model, position, config.tabSize)
            : MoveOperations.leftPosition(model, position);
        return new CursorPosition(pos.lineNumber, pos.column, 0);
    }
    /**
     * @param noOfColumns Must be either `1`
     * or `Math.round(viewModel.getLineContent(viewLineNumber).length / 2)` (for half lines).
    */
    static moveLeft(config, model, cursor, inSelectionMode, noOfColumns) {
        let lineNumber, column;
        if (cursor.hasSelection() && !inSelectionMode) {
            // If the user has a selection and does not want to extend it,
            // put the cursor at the beginning of the selection.
            lineNumber = cursor.selection.startLineNumber;
            column = cursor.selection.startColumn;
        }
        else {
            // This has no effect if noOfColumns === 1.
            // It is ok to do so in the half-line scenario.
            const pos = cursor.position.delta(undefined, -(noOfColumns - 1));
            // We clip the position before normalization, as normalization is not defined
            // for possibly negative columns.
            const normalizedPos = model.normalizePosition(MoveOperations.clipPositionColumn(pos, model), 0 /* PositionAffinity.Left */);
            const p = MoveOperations.left(config, model, normalizedPos);
            lineNumber = p.lineNumber;
            column = p.column;
        }
        return cursor.move(inSelectionMode, lineNumber, column, 0);
    }
    /**
     * Adjusts the column so that it is within min/max of the line.
    */
    static clipPositionColumn(position, model) {
        return new Position(position.lineNumber, MoveOperations.clipRange(position.column, model.getLineMinColumn(position.lineNumber), model.getLineMaxColumn(position.lineNumber)));
    }
    static clipRange(value, min, max) {
        if (value < min) {
            return min;
        }
        if (value > max) {
            return max;
        }
        return value;
    }
    static rightPosition(model, lineNumber, column) {
        if (column < model.getLineMaxColumn(lineNumber)) {
            column = column + strings.nextCharLength(model.getLineContent(lineNumber), column - 1);
        }
        else if (lineNumber < model.getLineCount()) {
            lineNumber = lineNumber + 1;
            column = model.getLineMinColumn(lineNumber);
        }
        return new Position(lineNumber, column);
    }
    static rightPositionAtomicSoftTabs(model, lineNumber, column, tabSize, indentSize) {
        if (column < model.getLineIndentColumn(lineNumber)) {
            const lineContent = model.getLineContent(lineNumber);
            const newPosition = AtomicTabMoveOperations.atomicPosition(lineContent, column - 1, tabSize, 1 /* Direction.Right */);
            if (newPosition !== -1) {
                return new Position(lineNumber, newPosition + 1);
            }
        }
        return this.rightPosition(model, lineNumber, column);
    }
    static right(config, model, position) {
        const pos = config.stickyTabStops
            ? MoveOperations.rightPositionAtomicSoftTabs(model, position.lineNumber, position.column, config.tabSize, config.indentSize)
            : MoveOperations.rightPosition(model, position.lineNumber, position.column);
        return new CursorPosition(pos.lineNumber, pos.column, 0);
    }
    static moveRight(config, model, cursor, inSelectionMode, noOfColumns) {
        let lineNumber, column;
        if (cursor.hasSelection() && !inSelectionMode) {
            // If we are in selection mode, move right without selection cancels selection and puts cursor at the end of the selection
            lineNumber = cursor.selection.endLineNumber;
            column = cursor.selection.endColumn;
        }
        else {
            const pos = cursor.position.delta(undefined, noOfColumns - 1);
            const normalizedPos = model.normalizePosition(MoveOperations.clipPositionColumn(pos, model), 1 /* PositionAffinity.Right */);
            const r = MoveOperations.right(config, model, normalizedPos);
            lineNumber = r.lineNumber;
            column = r.column;
        }
        return cursor.move(inSelectionMode, lineNumber, column, 0);
    }
    static vertical(config, model, lineNumber, column, leftoverVisibleColumns, newLineNumber, allowMoveOnEdgeLine, normalizationAffinity) {
        const currentVisibleColumn = CursorColumns.visibleColumnFromColumn(model.getLineContent(lineNumber), column, config.tabSize) + leftoverVisibleColumns;
        const lineCount = model.getLineCount();
        const wasOnFirstPosition = (lineNumber === 1 && column === 1);
        const wasOnLastPosition = (lineNumber === lineCount && column === model.getLineMaxColumn(lineNumber));
        const wasAtEdgePosition = (newLineNumber < lineNumber ? wasOnFirstPosition : wasOnLastPosition);
        lineNumber = newLineNumber;
        if (lineNumber < 1) {
            lineNumber = 1;
            if (allowMoveOnEdgeLine) {
                column = model.getLineMinColumn(lineNumber);
            }
            else {
                column = Math.min(model.getLineMaxColumn(lineNumber), column);
            }
        }
        else if (lineNumber > lineCount) {
            lineNumber = lineCount;
            if (allowMoveOnEdgeLine) {
                column = model.getLineMaxColumn(lineNumber);
            }
            else {
                column = Math.min(model.getLineMaxColumn(lineNumber), column);
            }
        }
        else {
            column = config.columnFromVisibleColumn(model, lineNumber, currentVisibleColumn);
        }
        if (wasAtEdgePosition) {
            leftoverVisibleColumns = 0;
        }
        else {
            leftoverVisibleColumns = currentVisibleColumn - CursorColumns.visibleColumnFromColumn(model.getLineContent(lineNumber), column, config.tabSize);
        }
        if (normalizationAffinity !== undefined) {
            const position = new Position(lineNumber, column);
            const newPosition = model.normalizePosition(position, normalizationAffinity);
            leftoverVisibleColumns = leftoverVisibleColumns + (column - newPosition.column);
            lineNumber = newPosition.lineNumber;
            column = newPosition.column;
        }
        return new CursorPosition(lineNumber, column, leftoverVisibleColumns);
    }
    static down(config, model, lineNumber, column, leftoverVisibleColumns, count, allowMoveOnLastLine) {
        return this.vertical(config, model, lineNumber, column, leftoverVisibleColumns, lineNumber + count, allowMoveOnLastLine, 4 /* PositionAffinity.RightOfInjectedText */);
    }
    static moveDown(config, model, cursor, inSelectionMode, linesCount) {
        let lineNumber, column;
        if (cursor.hasSelection() && !inSelectionMode) {
            // If we are in selection mode, move down acts relative to the end of selection
            lineNumber = cursor.selection.endLineNumber;
            column = cursor.selection.endColumn;
        }
        else {
            lineNumber = cursor.position.lineNumber;
            column = cursor.position.column;
        }
        let i = 0;
        let r;
        do {
            r = MoveOperations.down(config, model, lineNumber + i, column, cursor.leftoverVisibleColumns, linesCount, true);
            const np = model.normalizePosition(new Position(r.lineNumber, r.column), 2 /* PositionAffinity.None */);
            if (np.lineNumber > lineNumber) {
                break;
            }
        } while (i++ < 10 && lineNumber + i < model.getLineCount());
        return cursor.move(inSelectionMode, r.lineNumber, r.column, r.leftoverVisibleColumns);
    }
    static translateDown(config, model, cursor) {
        const selection = cursor.selection;
        const selectionStart = MoveOperations.down(config, model, selection.selectionStartLineNumber, selection.selectionStartColumn, cursor.selectionStartLeftoverVisibleColumns, 1, false);
        const position = MoveOperations.down(config, model, selection.positionLineNumber, selection.positionColumn, cursor.leftoverVisibleColumns, 1, false);
        return new SingleCursorState(new Range(selectionStart.lineNumber, selectionStart.column, selectionStart.lineNumber, selectionStart.column), 0 /* SelectionStartKind.Simple */, selectionStart.leftoverVisibleColumns, new Position(position.lineNumber, position.column), position.leftoverVisibleColumns);
    }
    static up(config, model, lineNumber, column, leftoverVisibleColumns, count, allowMoveOnFirstLine) {
        return this.vertical(config, model, lineNumber, column, leftoverVisibleColumns, lineNumber - count, allowMoveOnFirstLine, 3 /* PositionAffinity.LeftOfInjectedText */);
    }
    static moveUp(config, model, cursor, inSelectionMode, linesCount) {
        let lineNumber, column;
        if (cursor.hasSelection() && !inSelectionMode) {
            // If we are in selection mode, move up acts relative to the beginning of selection
            lineNumber = cursor.selection.startLineNumber;
            column = cursor.selection.startColumn;
        }
        else {
            lineNumber = cursor.position.lineNumber;
            column = cursor.position.column;
        }
        const r = MoveOperations.up(config, model, lineNumber, column, cursor.leftoverVisibleColumns, linesCount, true);
        return cursor.move(inSelectionMode, r.lineNumber, r.column, r.leftoverVisibleColumns);
    }
    static translateUp(config, model, cursor) {
        const selection = cursor.selection;
        const selectionStart = MoveOperations.up(config, model, selection.selectionStartLineNumber, selection.selectionStartColumn, cursor.selectionStartLeftoverVisibleColumns, 1, false);
        const position = MoveOperations.up(config, model, selection.positionLineNumber, selection.positionColumn, cursor.leftoverVisibleColumns, 1, false);
        return new SingleCursorState(new Range(selectionStart.lineNumber, selectionStart.column, selectionStart.lineNumber, selectionStart.column), 0 /* SelectionStartKind.Simple */, selectionStart.leftoverVisibleColumns, new Position(position.lineNumber, position.column), position.leftoverVisibleColumns);
    }
    static _isBlankLine(model, lineNumber) {
        if (model.getLineFirstNonWhitespaceColumn(lineNumber) === 0) {
            // empty or contains only whitespace
            return true;
        }
        return false;
    }
    static moveToPrevBlankLine(config, model, cursor, inSelectionMode) {
        let lineNumber = cursor.position.lineNumber;
        // If our current line is blank, move to the previous non-blank line
        while (lineNumber > 1 && this._isBlankLine(model, lineNumber)) {
            lineNumber--;
        }
        // Find the previous blank line
        while (lineNumber > 1 && !this._isBlankLine(model, lineNumber)) {
            lineNumber--;
        }
        return cursor.move(inSelectionMode, lineNumber, model.getLineMinColumn(lineNumber), 0);
    }
    static moveToNextBlankLine(config, model, cursor, inSelectionMode) {
        const lineCount = model.getLineCount();
        let lineNumber = cursor.position.lineNumber;
        // If our current line is blank, move to the next non-blank line
        while (lineNumber < lineCount && this._isBlankLine(model, lineNumber)) {
            lineNumber++;
        }
        // Find the next blank line
        while (lineNumber < lineCount && !this._isBlankLine(model, lineNumber)) {
            lineNumber++;
        }
        return cursor.move(inSelectionMode, lineNumber, model.getLineMinColumn(lineNumber), 0);
    }
    static moveToBeginningOfLine(config, model, cursor, inSelectionMode) {
        const lineNumber = cursor.position.lineNumber;
        const minColumn = model.getLineMinColumn(lineNumber);
        const firstNonBlankColumn = model.getLineFirstNonWhitespaceColumn(lineNumber) || minColumn;
        let column;
        const relevantColumnNumber = cursor.position.column;
        if (relevantColumnNumber === firstNonBlankColumn) {
            column = minColumn;
        }
        else {
            column = firstNonBlankColumn;
        }
        return cursor.move(inSelectionMode, lineNumber, column, 0);
    }
    static moveToEndOfLine(config, model, cursor, inSelectionMode, sticky) {
        const lineNumber = cursor.position.lineNumber;
        const maxColumn = model.getLineMaxColumn(lineNumber);
        return cursor.move(inSelectionMode, lineNumber, maxColumn, sticky ? 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */ - maxColumn : 0);
    }
    static moveToBeginningOfBuffer(config, model, cursor, inSelectionMode) {
        return cursor.move(inSelectionMode, 1, 1, 0);
    }
    static moveToEndOfBuffer(config, model, cursor, inSelectionMode) {
        const lastLineNumber = model.getLineCount();
        const lastColumn = model.getLineMaxColumn(lastLineNumber);
        return cursor.move(inSelectionMode, lastLineNumber, lastColumn, 0);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3Vyc29yTW92ZU9wZXJhdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL2N1cnNvci9jdXJzb3JNb3ZlT3BlcmF0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssT0FBTyxNQUFNLGlDQUFpQyxDQUFDO0FBRTNELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDL0MsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ3pDLE9BQU8sRUFBRSx1QkFBdUIsRUFBYSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3JGLE9BQU8sRUFBK0QsaUJBQWlCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUdwSCxNQUFNLE9BQU8sY0FBYztJQU8xQixZQUFZLFVBQWtCLEVBQUUsTUFBYyxFQUFFLHNCQUE4QjtRQU45RSx5QkFBb0IsR0FBUyxTQUFTLENBQUM7UUFPdEMsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7UUFDN0IsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLHNCQUFzQixHQUFHLHNCQUFzQixDQUFDO0lBQ3RELENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxjQUFjO0lBQ25CLE1BQU0sQ0FBQyxZQUFZLENBQUMsS0FBeUIsRUFBRSxRQUFrQjtRQUN2RSxJQUFJLFFBQVEsQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1lBQ25FLE9BQU8sUUFBUSxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxjQUFj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