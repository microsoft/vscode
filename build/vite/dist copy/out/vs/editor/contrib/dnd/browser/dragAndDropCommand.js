/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
export class DragAndDropCommand {
    constructor(selection, targetPosition, copy) {
        this.selection = selection;
        this.targetPosition = targetPosition;
        this.copy = copy;
        this.targetSelection = null;
    }
    getEditOperations(model, builder) {
        const text = model.getValueInRange(this.selection);
        if (!this.copy) {
            builder.addEditOperation(this.selection, null);
        }
        builder.addEditOperation(new Range(this.targetPosition.lineNumber, this.targetPosition.column, this.targetPosition.lineNumber, this.targetPosition.column), text);
        if (this.selection.containsPosition(this.targetPosition) && !(this.copy && (this.selection.getEndPosition().equals(this.targetPosition) || this.selection.getStartPosition().equals(this.targetPosition)) // we allow users to paste content beside the selection
        )) {
            this.targetSelection = this.selection;
            return;
        }
        if (this.copy) {
            this.targetSelection = new Selection(this.targetPosition.lineNumber, this.targetPosition.column, this.selection.endLineNumber - this.selection.startLineNumber + this.targetPosition.lineNumber, this.selection.startLineNumber === this.selection.endLineNumber ?
                this.targetPosition.column + this.selection.endColumn - this.selection.startColumn :
                this.selection.endColumn);
            return;
        }
        if (this.targetPosition.lineNumber > this.selection.endLineNumber) {
            // Drag the selection downwards
            this.targetSelection = new Selection(this.targetPosition.lineNumber - this.selection.endLineNumber + this.selection.startLineNumber, this.targetPosition.column, this.targetPosition.lineNumber, this.selection.startLineNumber === this.selection.endLineNumber ?
                this.targetPosition.column + this.selection.endColumn - this.selection.startColumn :
                this.selection.endColumn);
            return;
        }
        if (this.targetPosition.lineNumber < this.selection.endLineNumber) {
            // Drag the selection upwards
            this.targetSelection = new Selection(this.targetPosition.lineNumber, this.targetPosition.column, this.targetPosition.lineNumber + this.selection.endLineNumber - this.selection.startLineNumber, this.selection.startLineNumber === this.selection.endLineNumber ?
                this.targetPosition.column + this.selection.endColumn - this.selection.startColumn :
                this.selection.endColumn);
            return;
        }
        // The target position is at the same line as the selection's end position.
        if (this.selection.endColumn <= this.targetPosition.column) {
            // The target position is after the selection's end position
            this.targetSelection = new Selection(this.targetPosition.lineNumber - this.selection.endLineNumber + this.selection.startLineNumber, this.selection.startLineNumber === this.selection.endLineNumber ?
                this.targetPosition.column - this.selection.endColumn + this.selection.startColumn :
                this.targetPosition.column - this.selection.endColumn + this.selection.startColumn, this.targetPosition.lineNumber, this.selection.startLineNumber === this.selection.endLineNumber ?
                this.targetPosition.column :
                this.selection.endColumn);
        }
        else {
            // The target position is before the selection's end position. Since the selection doesn't contain the target position, the selection is one-line and target position is before this selection.
            this.targetSelection = new Selection(this.targetPosition.lineNumber - this.selection.endLineNumber + this.selection.startLineNumber, this.targetPosition.column, this.targetPosition.lineNumber, this.targetPosition.column + this.selection.endColumn - this.selection.startColumn);
        }
    }
    computeCursorState(model, helper) {
        return this.targetSelection;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHJhZ0FuZERyb3BDb21tYW5kLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvZG5kL2Jyb3dzZXIvZHJhZ0FuZERyb3BDb21tYW5kLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFLOUQsTUFBTSxPQUFPLGtCQUFrQjtJQU85QixZQUFZLFNBQW9CLEVBQUUsY0FBd0IsRUFBRSxJQUFhO1FBQ3hFLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1FBQzNCLElBQUksQ0FBQyxjQUFjLEdBQUcsY0FBYyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDO0lBQzdCLENBQUM7SUFFTSxpQkFBaUIsQ0FBQyxLQUFpQixFQUFFLE9BQThCO1FBQ3pFLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ25ELElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsT0FBTyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDaEQsQ0FBQztRQUNELE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFD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