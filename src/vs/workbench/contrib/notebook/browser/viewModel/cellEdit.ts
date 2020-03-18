/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICell } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IResourceUndoRedoElement, UndoRedoElementType } from 'vs/platform/undoRedo/common/undoRedo';
import { URI } from 'vs/base/common/uri';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookCellViewModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';


/**
 * It should not modify Undo/Redo stack
 */
export interface ICellEditingDelegate {
	insertCell?(index: number, viewCell: CellViewModel): void;
	deleteCell?(index: number, cell: ICell): void;
	moveCell?(fromIndex: number, toIndex: number): void;
}

export class InsertCellEdit implements IResourceUndoRedoElement {
	type: UndoRedoElementType.Resource = UndoRedoElementType.Resource;
	label: string = 'Insert Cell';
	constructor(
		public resource: URI,
		private insertIndex: number,
		private cell: CellViewModel,
		private editingDelegate: ICellEditingDelegate
	) {
	}

	undo(): void | Promise<void> {
		if (!this.editingDelegate.deleteCell) {
			throw new Error('Notebook Delete Cell not implemented for Undo/Redo');
		}

		this.editingDelegate.deleteCell(this.insertIndex, this.cell.cell);
	}
	redo(): void | Promise<void> {
		if (!this.editingDelegate.insertCell) {
			throw new Error('Notebook Insert Cell not implemented for Undo/Redo');
		}

		this.editingDelegate.insertCell(this.insertIndex, this.cell);
	}
}

export class DeleteCellEdit implements IResourceUndoRedoElement {
	type: UndoRedoElementType.Resource = UndoRedoElementType.Resource;
	label: string = 'Delete Cell';

	private _rawCell: ICell;
	constructor(
		public resource: URI,
		private insertIndex: number,
		cell: CellViewModel,
		private editingDelegate: ICellEditingDelegate,
		private instantiationService: IInstantiationService,
		private notebookViewModel: NotebookViewModel
	) {
		this._rawCell = cell.cell;

		// save inmem text to `ICell`
		this._rawCell.source = [cell.getText()];
	}

	undo(): void | Promise<void> {
		if (!this.editingDelegate.insertCell) {
			throw new Error('Notebook Insert Cell not implemented for Undo/Redo');
		}

		const cell = this.instantiationService.createInstance(CellViewModel, this.notebookViewModel.viewType, this.notebookViewModel.handle, this._rawCell);
		this.editingDelegate.insertCell(this.insertIndex, cell);
	}

	redo(): void | Promise<void> {
		if (!this.editingDelegate.deleteCell) {
			throw new Error('Notebook Delete Cell not implemented for Undo/Redo');
		}

		this.editingDelegate.deleteCell(this.insertIndex, this._rawCell);
	}
}

export class MoveCellEdit implements IResourceUndoRedoElement {
	type: UndoRedoElementType.Resource = UndoRedoElementType.Resource;
	label: string = 'Delete Cell';

	constructor(
		public resource: URI,
		private fromIndex: number,
		private toIndex: number,
		private editingDelegate: ICellEditingDelegate
	) {
	}

	undo(): void | Promise<void> {
		if (!this.editingDelegate.moveCell) {
			throw new Error('Notebook Move Cell not implemented for Undo/Redo');
		}

		this.editingDelegate.moveCell(this.toIndex, this.fromIndex);
	}

	redo(): void | Promise<void> {
		if (!this.editingDelegate.moveCell) {
			throw new Error('Notebook Move Cell not implemented for Undo/Redo');
		}

		this.editingDelegate.moveCell(this.fromIndex, this.toIndex);
	}
}
