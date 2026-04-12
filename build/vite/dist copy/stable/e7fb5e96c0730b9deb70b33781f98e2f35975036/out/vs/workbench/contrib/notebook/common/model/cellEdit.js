/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class MoveCellEdit {
    get label() {
        return this.length === 1 ? 'Move Cell' : 'Move Cells';
    }
    constructor(resource, fromIndex, length, toIndex, editingDelegate, beforedSelections, endSelections) {
        this.resource = resource;
        this.fromIndex = fromIndex;
        this.length = length;
        this.toIndex = toIndex;
        this.editingDelegate = editingDelegate;
        this.beforedSelections = beforedSelections;
        this.endSelections = endSelections;
        this.type = 0 /* UndoRedoElementType.Resource */;
        this.code = 'undoredo.textBufferEdit';
    }
    undo() {
        if (!this.editingDelegate.moveCell) {
            throw new Error('Notebook Move Cell not implemented for Undo/Redo');
        }
        this.editingDelegate.moveCell(this.toIndex, this.length, this.fromIndex, this.endSelections, this.beforedSelections);
    }
    redo() {
        if (!this.editingDelegate.moveCell) {
            throw new Error('Notebook Move Cell not implemented for Undo/Redo');
        }
        this.editingDelegate.moveCell(this.fromIndex, this.length, this.toIndex, this.beforedSelections, this.endSelections);
    }
}
export class SpliceCellsEdit {
    get label() {
        // Compute the most appropriate labels
        if (this.diffs.length === 1 && this.diffs[0][1].length === 0) {
            return this.diffs[0][2].length > 1 ? 'Insert Cells' : 'Insert Cell';
        }
        if (this.diffs.length === 1 && this.diffs[0][2].length === 0) {
            return this.diffs[0][1].length > 1 ? 'Delete Cells' : 'Delete Cell';
        }
        // Default to Insert Cell
        return 'Insert Cell';
    }
    constructor(resource, diffs, editingDelegate, beforeHandles, endHandles) {
        this.resource = resource;
        this.diffs = diffs;
        this.editingDelegate = editingDelegate;
        this.beforeHandles = beforeHandles;
        this.endHandles = endHandles;
        this.type = 0 /* UndoRedoElementType.Resource */;
        this.code = 'undoredo.textBufferEdit';
    }
    undo() {
        if (!this.editingDelegate.replaceCell) {
            throw new Error('Notebook Replace Cell not implemented for Undo/Redo');
        }
        this.diffs.forEach(diff => {
            this.editingDelegate.replaceCell(diff[0], diff[2].length, diff[1], this.beforeHandles);
        });
    }
    redo() {
        if (!this.editingDelegate.replaceCell) {
            throw new Error('Notebook Replace Cell not implemented for Undo/Redo');
        }
        this.diffs.reverse().forEach(diff => {
            this.editingDelegate.replaceCell(diff[0], diff[1].length, diff[2], this.endHandles);
        });
    }
}
export class CellMetadataEdit {
    constructor(resource, index, oldMetadata, newMetadata, editingDelegate) {
        this.resource = resource;
        this.index = index;
        this.oldMetadata = oldMetadata;
        this.newMetadata = newMetadata;
        this.editingDelegate = editingDelegate;
        this.type = 0 /* UndoRedoElementType.Resource */;
        this.label = 'Update Cell Metadata';
        this.code = 'undoredo.textBufferEdit';
    }
    undo() {
        if (!this.editingDelegate.updateCellMetadata) {
            return;
        }
        this.editingDelegate.updateCellMetadata(this.index, this.oldMetadata);
    }
    redo() {
        if (!this.editingDelegate.updateCellMetadata) {
            return;
        }
        this.editingDelegate.updateCellMetadata(this.index, this.newMetadata);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbEVkaXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9jb21tb24vbW9kZWwvY2VsbEVkaXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFrQmhHLE1BQU0sT0FBTyxZQUFZO0lBRXhCLElBQUksS0FBSztRQUNSLE9BQU8sSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDO0lBQ3ZELENBQUM7SUFHRCxZQUNRLFFBQWEsRUFDWixTQUFpQixFQUNqQixNQUFjLEVBQ2QsT0FBZSxFQUNmLGVBQXlDLEVBQ3pDLGlCQUE4QyxFQUM5QyxhQUEwQztRQU4zQyxhQUFRLEdBQVIsUUFBUSxDQUFLO1FBQ1osY0FBUyxHQUFULFNBQVMsQ0FBUTtRQUNqQixXQUFNLEdBQU4sTUFBTSxDQUFRO1FBQ2QsWUFBTyxHQUFQLE9BQU8sQ0FBUTtRQUNmLG9CQUFlLEdBQWYsZUFBZSxDQUEwQjtRQUN6QyxzQkFBaUIsR0FBakIsaUJBQWlCLENBQTZCO1FBQzlDLGtCQUFhLEdBQWIsYUFBYSxDQUE2QjtRQWJuRCxTQUFJLHdDQUE4RDtRQUlsRSxTQUFJLEdBQVcseUJBQXlCLENBQUM7SUFXekMsQ0FBQztJQUVELElBQUk7UUFDSCxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNwQyxNQUFNLElBQUksS0FBSyxDQUFDLGtEQUFrRCxDQUFDLENBQUM7UUFDckUsQ0FBQztRQUVELElBQUksQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixD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