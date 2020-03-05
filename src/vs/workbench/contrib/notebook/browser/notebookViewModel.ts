/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { NotebookEditorModel } from 'vs/workbench/contrib/notebook/browser/notebookEditorInput';
import { CellFindMatch } from 'vs/workbench/contrib/notebook/browser/notebookFindWidget';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/renderers/cellViewModel';
import { NotebookCellsSplice } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export interface INotebookEditorViewState {
	editingCells: { [key: number]: boolean };
	editorViewStates: { [key: number]: editorCommon.ICodeEditorViewState | null };
}

export class NotebookViewModel extends Disposable {
	private _localStore: DisposableStore = this._register(new DisposableStore());
	private _viewCells: CellViewModel[] = [];

	get viewCells() {
		return this._viewCells;
	}

	get notebookDocument() {
		return this._model.notebook;
	}

	get renderers() {
		return this._model.notebook!.renderers;
	}

	get handle() {
		return this._model.notebook.handle;
	}

	get languages() {
		return this._model.notebook.languages;
	}

	get uri() {
		return this._model.notebook.uri;
	}

	private readonly _onDidChangeCells = new Emitter<NotebookCellsSplice[]>();
	get onDidChangeCells(): Event<NotebookCellsSplice[]> { return this._onDidChangeCells.event; }

	constructor(
		public viewType: string,
		private _model: NotebookEditorModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._register(this._model.onDidChangeCells(e => this._onDidChangeCells.fire(e)));
		this._viewCells = this._model!.notebook!.cells.map(cell => {
			const viewCell = this.instantiationService.createInstance(CellViewModel, this.viewType, this._model!.notebook!.handle, cell);
			this._localStore.add(viewCell);
			return viewCell;
		});
	}

	isDirty() {
		return this._model.isDirty();
	}

	hide() {
		this.viewCells.forEach(cell => {
			if (cell.getText() !== '') {
				cell.isEditing = false;
			}
		});
	}

	getViewCellIndex(cell: CellViewModel) {
		return this.viewCells.indexOf(cell);
	}

	find(value: string): CellFindMatch[] {
		let matches: CellFindMatch[] = [];
		this.viewCells.forEach(cell => {
			let cellMatches = cell.startFind(value);
			matches.push(...cellMatches);
		});

		return matches;
	}

	insertCell(index: number, newCell: CellViewModel) {
		this.viewCells!.splice(index, 0, newCell);
		this._model.insertCell(newCell.cell, index);
	}

	deleteCell(index: number) {
		let viewCell = this.viewCells[index];
		this.viewCells.splice(index, 1);
		this._model.deleteCell(viewCell.cell);
	}

	saveEditorViewState(): INotebookEditorViewState {
		const state: { [key: number]: boolean } = {};
		this.viewCells.filter(cell => cell.isEditing).forEach(cell => state[cell.cell.handle] = true);
		const editorViewStates: { [key: number]: editorCommon.ICodeEditorViewState } = {};
		this.viewCells.map(cell => ({ handle: cell.cell.handle, state: cell.saveEditorViewState() })).forEach(viewState => {
			if (viewState.state) {
				editorViewStates[viewState.handle] = viewState.state;
			}
		});

		return {
			editingCells: state,
			editorViewStates: editorViewStates
		};
	}

	restoreEditorViewState(viewState: INotebookEditorViewState | undefined): void {
		if (!viewState) {
			return;
		}

		this._viewCells.forEach(cell => {
			const isEditing = viewState.editingCells && viewState.editingCells[cell.handle];
			const editorViewState = viewState.editorViewStates && viewState.editorViewStates[cell.handle];

			cell.isEditing = isEditing;
			cell.restoreEditorViewState(editorViewState);
		});
	}

	equal(model: NotebookEditorModel) {
		return this._model === model;
	}

	dispose() {
		this._localStore.clear();
		this._viewCells.forEach(cell => {
			cell.save();
		});

		super.dispose();
	}
}
