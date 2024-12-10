/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../../../editor/common/core/range.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { CellKind, IOutputDto, NotebookCellMetadata, SelectionStateType } from '../../common/notebookCommon.js';
import { IResourceUndoRedoElement, UndoRedoElementType } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { URI } from '../../../../../base/common/uri.js';
import { BaseCellViewModel } from './baseCellViewModel.js';
import { CellFocusMode } from '../notebookBrowser.js';
import { NotebookCellTextModel } from '../../common/model/notebookCellTextModel.js';
import { ITextCellEditingDelegate } from '../../common/model/cellEdit.js';


export interface IViewCellEditingDelegate extends ITextCellEditingDelegate {
	createCellViewModel?(cell: NotebookCellTextModel): BaseCellViewModel;
	createCell?(index: number, source: string, language: string, type: CellKind, metadata: NotebookCellMetadata | undefined, outputs: IOutputDto[]): BaseCellViewModel;
}

export class JoinCellEdit implements IResourceUndoRedoElement {
	type: UndoRedoElementType.Resource = UndoRedoElementType.Resource;
	label: string = 'Join Cell';
	code: string = 'undoredo.textBufferEdit';
	private _deletedRawCell: NotebookCellTextModel;
	constructor(
		public resource: URI,
		private index: number,
		private direction: 'above' | 'below',
		private cell: BaseCellViewModel,
		private selections: Selection[],
		private inverseRange: Range,
		private insertContent: string,
		private removedCell: BaseCellViewModel,
		private editingDelegate: IViewCellEditingDelegate,
	) {
		this._deletedRawCell = this.removedCell.model;
	}

	async undo(): Promise<void> {
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
		} else {
			this.editingDelegate.insertCell(this.index, cell.model, { kind: SelectionStateType.Handle, primary: this.cell.handle, selections: [this.cell.handle] });
			this.cell.focusMode = CellFocusMode.Editor;
		}
	}

	async redo(): Promise<void> {
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
