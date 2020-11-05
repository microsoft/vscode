/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IResourceUndoRedoElement, UndoRedoElementType } from 'vs/platform/undoRedo/common/undoRedo';
import { URI } from 'vs/base/common/uri';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { NotebookCellMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';

/**
 * It should not modify Undo/Redo stack
 */
export interface ITextCellEditingDelegate {
	insertCell?(index: number, cell: NotebookCellTextModel, endSelections?: number[]): void;
	deleteCell?(index: number, endSelections?: number[]): void;
	moveCell?(fromIndex: number, length: number, toIndex: number, beforeSelections: number[] | undefined, endSelections: number[] | undefined): void;
	updateCellMetadata?(index: number, newMetadata: NotebookCellMetadata): void;
}

export class MoveCellEdit implements IResourceUndoRedoElement {
	type: UndoRedoElementType.Resource = UndoRedoElementType.Resource;
	label: string = 'Move Cell';

	constructor(
		public resource: URI,
		private fromIndex: number,
		private length: number,
		private toIndex: number,
		private editingDelegate: ITextCellEditingDelegate,
		private beforedSelections: number[] | undefined,
		private endSelections: number[] | undefined
	) {
	}

	undo(): void {
		if (!this.editingDelegate.moveCell) {
			throw new Error('Notebook Move Cell not implemented for Undo/Redo');
		}

		this.editingDelegate.moveCell(this.toIndex, this.length, this.fromIndex, this.endSelections, this.beforedSelections);
	}

	redo(): void {
		if (!this.editingDelegate.moveCell) {
			throw new Error('Notebook Move Cell not implemented for Undo/Redo');
		}

		this.editingDelegate.moveCell(this.fromIndex, this.length, this.toIndex, this.beforedSelections, this.endSelections);
	}
}

export class SpliceCellsEdit implements IResourceUndoRedoElement {
	type: UndoRedoElementType.Resource = UndoRedoElementType.Resource;
	label: string = 'Insert Cell';
	constructor(
		public resource: URI,
		private diffs: [number, NotebookCellTextModel[], NotebookCellTextModel[]][],
		private editingDelegate: ITextCellEditingDelegate,
		private beforeHandles: number[] | undefined,
		private endHandles: number[] | undefined
	) {
	}

	undo(): void {
		if (!this.editingDelegate.deleteCell || !this.editingDelegate.insertCell) {
			throw new Error('Notebook Insert/Delete Cell not implemented for Undo/Redo');
		}

		this.diffs.forEach(diff => {
			for (let i = 0; i < diff[2].length; i++) {
				this.editingDelegate.deleteCell!(diff[0], this.beforeHandles);
			}

			diff[1].reverse().forEach(cell => {
				this.editingDelegate.insertCell!(diff[0], cell, this.beforeHandles);
			});
		});
	}

	redo(): void {
		if (!this.editingDelegate.deleteCell || !this.editingDelegate.insertCell) {
			throw new Error('Notebook Insert/Delete Cell not implemented for Undo/Redo');
		}

		this.diffs.reverse().forEach(diff => {
			for (let i = 0; i < diff[1].length; i++) {
				this.editingDelegate.deleteCell!(diff[0], this.endHandles);
			}

			diff[2].reverse().forEach(cell => {
				this.editingDelegate.insertCell!(diff[0], cell, this.endHandles);
			});
		});
	}
}

export class CellMetadataEdit implements IResourceUndoRedoElement {
	type: UndoRedoElementType.Resource = UndoRedoElementType.Resource;
	label: string = 'Update Cell Metadata';
	constructor(
		public resource: URI,
		readonly index: number,
		readonly oldMetadata: NotebookCellMetadata,
		readonly newMetadata: NotebookCellMetadata,
		private editingDelegate: ITextCellEditingDelegate,
	) {

	}

	undo(): void {
		if (!this.editingDelegate.updateCellMetadata) {
			return;
		}

		this.editingDelegate.updateCellMetadata(this.index, this.oldMetadata);
	}

	redo(): void | Promise<void> {
		if (!this.editingDelegate.updateCellMetadata) {
			return;
		}

		this.editingDelegate.updateCellMetadata(this.index, this.newMetadata);
	}
}
