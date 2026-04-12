/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SelectionStateType } from '../../common/notebookCommon.js';
import { CellFocusMode } from '../notebookBrowser.js';
export class JoinCellEdit {
    constructor(resource, index, direction, cell, selections, inverseRange, insertContent, removedCell, editingDelegate) {
        this.resource = resource;
        this.index = index;
        this.direction = direction;
        this.cell = cell;
        this.selections = selections;
        this.inverseRange = inverseRange;
        this.insertContent = insertContent;
        this.removedCell = removedCell;
        this.editingDelegate = editingDelegate;
        this.type = 0 /* UndoRedoElementType.Resource */;
        this.label = 'Join Cell';
        this.code = 'undoredo.textBufferEdit';
        this._deletedRawCell = this.removedCell.model;
    }
    async undo() {
        if (!this.editingDelegate.insertCell || !this.editingDelegate.createCellViewModel) {
            throw new Error('Notebook Insert Cell not implemented for Undo/Redo');
        }
        await this.cell.resolveTextModel();
        this.cell.textModel?.applyEdits([
            { range: this.inverseRange, text: '' }
        ]);
        this.cell.setSelections(this.selections);
        const cell = this.editingDelegate.createCellViewModel(this._deletedRawCell);
        if (this.direction === 'above') {
            this.editingDelegate.insertCell(this.index, this._deletedRawCell, { kind: SelectionStateType.Handle, primary: cell.handle, selections: [cell.handle] });
            cell.focusMode = CellFocusMode.Editor;
        }
        else {
            this.editingDelegate.insertCell(this.index, cell.model, { kind: SelectionStateType.Handle, primary: this.cell.handle, selections: [this.cell.handle] });
            this.cell.focusMode = CellFocusMode.Editor;
        }
    }
    async redo() {
        if (!this.editingDelegate.deleteCell) {
            throw new Error('Notebook Delete Cell not implemented for Undo/Redo');
        }
        await this.cell.resolveTextModel();
        this.cell.textModel?.applyEdits([
            { range: this.inverseRange, text: this.insertContent }
        ]);
        this.editingDelegate.deleteCell(this.index, { kind: SelectionStateType.Handle, primary: this.cell.handle, selections: [this.cell.handle] });
        this.cell.focusMode = CellFocusMode.Editor;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbEVkaXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL3ZpZXdNb2RlbC9jZWxsRWRpdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxPQUFPLEVBQThDLGtCQUFrQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFJaEgsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBVXRELE1BQU0sT0FBTyxZQUFZO0lBS3hCLFlBQ1EsUUFBYSxFQUNaLEtBQWEsRUFDYixTQUE0QixFQUM1QixJQUF1QixFQUN2QixVQUF1QixFQUN2QixZQUFtQixFQUNuQixhQUFxQixFQUNyQixXQUE4QixFQUM5QixlQUF5QztRQVIxQyxhQUFRLEdBQVIsUUFBUSxDQUFLO1FBQ1osVUFBSyxHQUFMLEtBQUssQ0FBUTtRQUNiLGNBQVMsR0FBVCxTQUFTLENBQW1CO1FBQzVCLFNBQUksR0FBSixJQUFJLENBQW1CO1FBQ3ZCLGVBQVUsR0FBVixVQUFVLENBQWE7UUFDdkIsaUJBQVksR0FBWixZQUFZLENBQU87UUFDbkIsa0JBQWEsR0FBYixhQUFhLENBQVE7UUFDckIsZ0JBQVcsR0FBWCxXQUFXLENBQW1CO1FBQzlCLG9CQUFlLEdBQWYsZUFBZSxDQUEwQjtRQWJsRCxTQUFJLHdDQUE4RDtRQUNsRSxVQUFLLEdBQVcsV0FBVyxDQUFDO1FBQzVCLFNBQUksR0FBVyx5QkFBeUIsQ0FBQztRQWF4QyxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDO0lBQy9DLENBQUM7SUFFRCxLQUFLLENBQUMsSUFBSTtRQUNULElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLFVBQVUsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUNuRixNQUFNLElBQUksS0FBSyxDQUFDLG9EQUFvRCxDQUFDLENBQUM7UUFDdkUsQ0FBQztRQUVELE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBRW5DLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLFVBQVUsQ0FBQztZQUMvQixFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsWUFBWSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUU7U0FDdEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRXpDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQzVFLElBQUksSUFBSSxDQUFDLFNBQVMsS0FBSyxPQUFPLEVBQUUsQ0FBQztZQUNoQyxJQUFJLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUUsRUFBRSxJQUFJLEVBQUUsa0JBQWtCLENBQUMsTUFBTSxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDeEosSUFBSSxDQUFDLFNBQVMsR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFDO1FBQ3ZDLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDeEosSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEdBQUcsYUFBYSxDQUFDLE1BQU0sQ0FBQztRQUM1QyxDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxJQUFJO1FBQ1QsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDdEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxvREFBb0QsQ0FBQyxDQUFDO1FBQ3ZFLENBQUM7UUFFRCxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUM7WUFDL0IsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLFlBQVksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLGFBQWEsRUFBRTtTQUN0RCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDNUksSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEdBQUcsYUFBYSxDQUFDLE1BQU0sQ0FBQztJQUM1QyxDQUFDO0NBQ0QifQ==