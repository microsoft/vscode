/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { Selection } from '../core/selection.js';
export class ReplaceCommand {
    constructor(range, text, insertsAutoWhitespace = false) {
        this._range = range;
        this._text = text;
        this.insertsAutoWhitespace = insertsAutoWhitespace;
    }
    getEditOperations(model, builder) {
        builder.addTrackedEditOperation(this._range, this._text);
    }
    computeCursorState(model, helper) {
        const inverseEditOperations = helper.getInverseEditOperations();
        const srcRange = inverseEditOperations[0].range;
        return Selection.fromPositions(srcRange.getEndPosition());
    }
}
export class ReplaceOvertypeCommand {
    constructor(range, text, insertsAutoWhitespace = false) {
        this._range = range;
        this._text = text;
        this.insertsAutoWhitespace = insertsAutoWhitespace;
    }
    getEditOperations(model, builder) {
        const initialStartPosition = this._range.getStartPosition();
        const initialEndPosition = this._range.getEndPosition();
        const initialEndLineNumber = initialEndPosition.lineNumber;
        const offsetDelta = this._text.length + (this._range.isEmpty() ? 0 : -1);
        let endPosition = addPositiveOffsetToModelPosition(model, initialEndPosition, offsetDelta);
        if (endPosition.lineNumber > initialEndLineNumber) {
            endPosition = new Position(initialEndLineNumber, model.getLineMaxColumn(initialEndLineNumber));
        }
        const replaceRange = Range.fromPositions(initialStartPosition, endPosition);
        builder.addTrackedEditOperation(replaceRange, this._text);
    }
    computeCursorState(model, helper) {
        const inverseEditOperations = helper.getInverseEditOperations();
        const srcRange = inverseEditOperations[0].range;
        return Selection.fromPositions(srcRange.getEndPosition());
    }
}
export class ReplaceCommandThatSelectsText {
    constructor(range, text) {
        this._range = range;
        this._text = text;
    }
    getEditOperations(model, builder) {
        builder.addTrackedEditOperation(this._range, this._text);
    }
    computeCursorState(model, helper) {
        const inverseEditOperations = helper.getInverseEditOperations();
        const srcRange = inverseEditOperations[0].range;
        return Selection.fromRange(srcRange, 0 /* SelectionDirection.LTR */);
    }
}
export class ReplaceCommandWithoutChangingPosition {
    constructor(range, text, insertsAutoWhitespace = false) {
        this._range = range;
        this._text = text;
        this.insertsAutoWhitespace = insertsAutoWhitespace;
    }
    getEditOperations(model, builder) {
        builder.addTrackedEditOperation(this._range, this._text);
    }
    computeCursorState(model, helper) {
        const inverseEditOperations = helper.getInverseEditOperations();
        const srcRange = inverseEditOperations[0].range;
        return Selection.fromPositions(srcRange.getStartPosition());
    }
}
export class ReplaceCommandWithOffsetCursorState {
    constructor(range, text, lineNumberDeltaOffset, columnDeltaOffset, insertsAutoWhitespace = false) {
        this._range = range;
        this._text = text;
        this._columnDeltaOffset = columnDeltaOffset;
        this._lineNumberDeltaOffset = lineNumberDeltaOffset;
        this.insertsAutoWhitespace = insertsAutoWhitespace;
    }
    getEditOperations(model, builder) {
        builder.addTrackedEditOperation(this._range, this._text);
    }
    computeCursorState(model, helper) {
        const inverseEditOperations = helper.getInverseEditOperations();
        const srcRange = inverseEditOperations[0].range;
        return Selection.fromPositions(srcRange.getEndPosition().delta(this._lineNumberDeltaOffset, this._columnDeltaOffset));
    }
}
export class ReplaceOvertypeCommandOnCompositionEnd {
    constructor(range) {
        this._range = range;
    }
    getEditOperations(model, builder) {
        const text = model.getValueInRange(this._range);
        const initialEndPosition = this._range.getEndPosition();
        const initialEndLineNumber = initialEndPosition.lineNumber;
        let endPosition = addPositiveOffsetToModelPosition(model, initialEndPosition, text.length);
        if (endPosition.lineNumber > initialEndLineNumber) {
            endPosition = new Position(initialEndLineNumber, model.getLineMaxColumn(initialEndLineNumber));
        }
        const replaceRange = Range.fromPositions(initialEndPosition, endPosition);
        builder.addTrackedEditOperation(replaceRange, '');
    }
    computeCursorState(model, helper) {
        const inverseEditOperations = helper.getInverseEditOperations();
        const srcRange = inverseEditOperations[0].range;
        return Selection.fromPositions(srcRange.getEndPosition());
    }
}
export class ReplaceCommandThatPreservesSelection {
    constructor(editRange, text, initialSelection, forceMoveMarkers = false) {
        this._range = editRange;
        this._text = text;
        this._initialSelection = initialSelection;
        this._forceMoveMarkers = forceMoveMarkers;
        this._selectionId = null;
    }
    getEditOperations(model, builder) {
        builder.addTrackedEditOperation(this._range, this._text, this._forceMoveMarkers);
        this._selectionId = builder.trackSelection(this._initialSelection);
    }
    computeCursorState(model, helper) {
        return helper.getTrackedSelection(this._selectionId);
    }
}
function addPositiveOffsetToModelPosition(model, position, offset) {
    if (offset < 0) {
        throw new Error('Unexpected negative delta');
    }
    const lineCount = model.getLineCount();
    let endPosition = new Position(lineCount, model.getLineMaxColumn(lineCount));
    for (let lineNumber = position.lineNumber; lineNumber <= lineCount; lineNumber++) {
        if (lineNumber === position.lineNumber) {
            const futureOffset = offset - model.getLineMaxColumn(position.lineNumber) + position.column;
            if (futureOffset <= 0) {
                endPosition = new Position(position.lineNumber, position.column + offset);
                break;
            }
            offset = futureOffset;
        }
        else {
            const futureOffset = offset - model.getLineMaxColumn(lineNumber);
            if (futureOffset <= 0) {
                endPosition = new Position(lineNumber, offset);
                break;
            }
            offset = futureOffset;
        }
    }
    return endPosition;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwbGFjZUNvbW1hbmQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL2NvbW1hbmRzL3JlcGxhY2VDb21tYW5kLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUMvQyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDekMsT0FBTyxFQUFFLFNBQVMsRUFBc0IsTUFBTSxzQkFBc0IsQ0FBQztBQUlyRSxNQUFNLE9BQU8sY0FBYztJQU0xQixZQUFZLEtBQVksRUFBRSxJQUFZLEVBQUUsd0JBQWlDLEtBQUs7UUFDN0UsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFDcEIsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7UUFDbEIsSUFBSSxDQUFDLHFCQUFxQixHQUFHLHFCQUFxQixDQUFDO0lBQ3BELENBQUM7SUFFTSxpQkFBaUIsQ0FBQyxLQUFpQixFQUFFLE9BQThCO1FBQ3pFLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUMxRCxDQUFDO0lBRU0sa0JBQWtCLENBQUMsS0FBaUIsRUFBRSxNQUFnQztRQUM1RSxNQUFNLHFCQUFxQixHQUFHLE1BQU0sQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1FBQ2hFLE1BQU0sUUFBUSxHQUFHLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztRQUNoRCxPQUFPLFNBQVMsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7SUFDM0QsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLHNCQUFzQjtJQU1sQyxZQUFZLEtBQVksRUFBRSxJQUFZLEVBQUUsd0JB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