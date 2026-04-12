/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Range } from '../core/range.js';
import { Selection } from '../core/selection.js';
export class SurroundSelectionCommand {
    constructor(range, charBeforeSelection, charAfterSelection) {
        this._range = range;
        this._charBeforeSelection = charBeforeSelection;
        this._charAfterSelection = charAfterSelection;
    }
    getEditOperations(model, builder) {
        builder.addTrackedEditOperation(new Range(this._range.startLineNumber, this._range.startColumn, this._range.startLineNumber, this._range.startColumn), this._charBeforeSelection);
        builder.addTrackedEditOperation(new Range(this._range.endLineNumber, this._range.endColumn, this._range.endLineNumber, this._range.endColumn), this._charAfterSelection || null); // addTrackedEditOperation() ignores us if the text == ''. Causing a chain of errors in computeCursorState()
    }
    computeCursorState(model, helper) {
        const inverseEditOperations = helper.getInverseEditOperations();
        const firstOperationRange = inverseEditOperations[0].range;
        const secondOperationRange = inverseEditOperations[1].range;
        return new Selection(firstOperationRange.endLineNumber, firstOperationRange.endColumn, secondOperationRange.endLineNumber, secondOperationRange.endColumn - this._charAfterSelection.length);
    }
}
/**
 * A surround selection command that runs after composition finished.
 */
export class CompositionSurroundSelectionCommand {
    constructor(_position, _text, _charAfter) {
        this._position = _position;
        this._text = _text;
        this._charAfter = _charAfter;
    }
    getEditOperations(model, builder) {
        builder.addTrackedEditOperation(new Range(this._position.lineNumber, this._position.column, this._position.lineNumber, this._position.column), this._text + this._charAfter);
    }
    computeCursorState(model, helper) {
        const inverseEditOperations = helper.getInverseEditOperations();
        const opRange = inverseEditOperations[0].range;
        return new Selection(opRange.endLineNumber, opRange.startColumn, opRange.endLineNumber, opRange.endColumn - this._charAfter.length);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3Vycm91bmRTZWxlY3Rpb25Db21tYW5kLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9jb21tYW5kcy9zdXJyb3VuZFNlbGVjdGlvbkNvbW1hbmQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBRXpDLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUlqRCxNQUFNLE9BQU8sd0JBQXdCO0lBS3BDLFlBQVksS0FBZ0IsRUFBRSxtQkFBMkIsRUFBRSxrQkFBMEI7UUFDcEYsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFDcEIsSUFBSSxDQUFDLG9CQUFvQixHQUFHLG1CQUFtQixDQUFDO1FBQ2hELElBQUksQ0FBQyxtQkFBbUIsR0FBRyxrQkFBa0IsQ0FBQztJQUMvQyxDQUFDO0lBRU0saUJBQWlCLENBQUMsS0FBaUIsRUFBRSxPQUE4QjtRQUN6RSxPQUFPLENBQUMsdUJBQXVCLENBQUMsSUFBSSxLQUFLLENBQ3hDLElBQUksQ0FBQyxNQUFNLENBQUMsZUFBZSxFQUMzQixJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFDdkIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQzNCLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUN2QixFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBRTlCLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLEtBQUssQ0FDeEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQ3pCLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUNyQixJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFDekIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQ3JCLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsNEdBQTRHO0lBQ25KLENBQUM7SUFFTSxrQkFBa0IsQ0FBQyxLQUFpQixFQUFFLE1BQWdDO1FBQzVFLE1BQU0scUJBQXFCLEdBQUcsTUFBTSxDQUFDLHdCQUF3QixFQUFFLENBQUM7UUFDaEUsTUFBTSxtQkFBbUIsR0FBRyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7UUFDM0QsTUFBTSxvQkFBb0IsR0FBRyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7UUFFNUQsT0FBTyxJQUFJLFNBQVMsQ0FDbkIsbUJBQW1CLENBQUMsYUFBYSxFQUNqQyxtQkFBbUIsQ0FBQyxTQUFTLEVBQzdCLG9CQUFvQixDQUFDLGFBQWEsRUFDbEMsb0JBQW9CLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQ2hFLENBQUM7SUFDSCxDQUFDO0NBQ0Q7QUFFRDs7R0FFRztBQUNILE1BQU0sT0FBTyxtQ0FBbUM7SUFFL0MsWUFDa0IsU0FBbUIsRUFDbkIsS0FBYSxFQUNiLFVBQWtCO1FBRmxCLGNBQVMsR0FBVCxTQUFTLENBQVU7UUFDbkIsVUFBSyxHQUFMLEtBQUssQ0FBUTtRQUNiLGVBQVUsR0FBVixVQUFVLENBQVE7SUFDaEMsQ0FBQztJQUVFLGlCQUFpQixDQUFDLEtBQWlCLEVBQUUsT0FBOEI7UUFDekUsT0FBTyxDQUFDLHVCQUF1QixDQUFDLElBQUksS0FBSyxDQUN4QyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFDekIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQ3JCLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUN6QixJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FDckIsRUFBRSxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBRU0sa0JBQWtCLENBQUMsS0FBaUIsRUFBRSxNQUFnQztRQUM1RSxNQUFNLHFCQUFxQixHQUFHLE1BQU0sQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1FBQ2hFLE1BQU0sT0FBTyxHQUFHLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztRQUUvQyxPQUFPLElBQUksU0FBUyxDQUNuQixPQUFPLENBQUMsYUFBYSxFQUNyQixPQUFPLENBQUMsV0FBVyxFQUNuQixPQUFPLENBQUMsYUFBYSxFQUNyQixPQUFPLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUMxQyxDQUFDO0lBQ0gsQ0FBQztDQUNEIn0=