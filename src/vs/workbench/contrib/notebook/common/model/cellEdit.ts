/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IResourceUndoRedoElement, UndoRedoElementType } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { URI } from '../../../../../base/common/uri.js';
import { NotebookCellTextModel } from './notebookCellTextModel.js';
import { ISelectionState, NotebookCellMetadata } from '../notebookCommon.js';

/**
 * It should not modify Undo/Redo stack
 */
export interface ITextCellEditingDelegate {
	insertCell?(index: number, cell: NotebookCellTextModel, endSelections?: ISelectionState): void;
	deleteCell?(index: number, endSelections?: ISelectionState): void;
	replaceCell?(index: number, count: number, cells: NotebookCellTextModel[], endSelections?: ISelectionState): void;
	moveCell?(fromIndex: number, length: number, toIndex: number, beforeSelections: ISelectionState | undefined, endSelections?: ISelectionState): void;
	updateCellMetadata?(index: number, newMetadata: NotebookCellMetadata): void;
}

export class MoveCellEdit implements IResourceUndoRedoElement {
	type: UndoRedoElementType.Resource = UndoRedoElementType.Resource;
	get label() {
		return this.length === 1 ? 'Move Cell' : 'Move Cells';
	}
	code: string = 'undoredo.textBufferEdit';

	constructor(
		public resource: URI,
		private fromIndex: number,
		private length: number,
		private toIndex: number,
		private editingDelegate: ITextCellEditingDelegate,
		private beforedSelections: ISelectionState | undefined,
		private endSelections: ISelectionState | undefined
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
	code: string = 'undoredo.textBufferEdit';
	constructor(
		public resource: URI,
		private diffs: [number, NotebookCellTextModel[], NotebookCellTextModel[]][],
		private editingDelegate: ITextCellEditingDelegate,
		private beforeHandles: ISelectionState | undefined,
		private endHandles: ISelectionState | undefined
	) {
	}

	undo(): void {
		if (!this.editingDelegate.replaceCell) {
			throw new Error('Notebook Replace Cell not implemented for Undo/Redo');
		}

		this.diffs.forEach(diff => {
			this.editingDelegate.replaceCell!(diff[0], diff[2].length, diff[1], this.beforeHandles);
		});
	}

	redo(): void {
		if (!this.editingDelegate.replaceCell) {
			throw new Error('Notebook Replace Cell not implemented for Undo/Redo');
		}

		this.diffs.reverse().forEach(diff => {
			this.editingDelegate.replaceCell!(diff[0], diff[1].length, diff[2], this.endHandles);
		});
	}
}

export class CellMetadataEdit implements IResourceUndoRedoElement {
	type: UndoRedoElementType.Resource = UndoRedoElementType.Resource;
	label: string = 'Update Cell Metadata';
	code: string = 'undoredo.textBufferEdit';
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
