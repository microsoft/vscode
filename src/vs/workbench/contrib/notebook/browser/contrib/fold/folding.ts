/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { INotebookEditor, INotebookEditorMouseEvent, ICellRange } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import * as DOM from 'vs/base/browser/dom';
import { CellFoldingState, FoldingModel } from 'vs/workbench/contrib/notebook/browser/contrib/fold/foldingModel';

export class FoldingController extends Disposable {
	private _foldingModel: FoldingModel;
	constructor(
		private readonly _notebookEditor: INotebookEditor

	) {
		super();

		this._register(this._notebookEditor.onMouseUp(e => { this.onMouseUp(e); }));
		this._register(this._notebookEditor.viewModel!.onDidFoldingRegionChanged(() => {
			const hiddenRanges = this._notebookEditor.viewModel!.getHiddenRanges();
			this._notebookEditor.setHiddenAreas(hiddenRanges);
		}));

		this._foldingModel = new FoldingModel();
		this._foldingModel.attachViewModel(this._notebookEditor.viewModel!);

		this._register(this._foldingModel.onDidFoldingRegionChanged(() => {
			this._notebookEditor.viewModel!.updateFoldingRanges(this._foldingModel.regions);
		}));
	}

	applyMemento(state: ICellRange[]) {
		this._foldingModel.applyMemento(state);
		this._notebookEditor.viewModel!.updateFoldingRanges(this._foldingModel.regions);
	}

	getMemento(): ICellRange[] {
		return this._foldingModel.getMemento();
	}

	setFoldingState(index: number, state: CellFoldingState) {
		const range = this._foldingModel.regions.findRange(index + 1);
		const startIndex = this._foldingModel.regions.getStartLineNumber(range) - 1;

		if (startIndex !== index) {
			return;
		}

		this._foldingModel.setCollapsed(range, state === CellFoldingState.Collapsed);
		this._notebookEditor.viewModel!.updateFoldingRanges(this._foldingModel.regions);

	}

	onMouseUp(e: INotebookEditorMouseEvent) {
		if (!e.event.target) {
			return;
		}

		const viewModel = this._notebookEditor.viewModel;

		if (!viewModel) {
			return;
		}

		const target = e.event.target as HTMLElement;

		if (DOM.hasClass(target, 'codicon-chevron-down') || DOM.hasClass(target, 'codicon-chevron-right')) {
			const parent = target.parentElement as HTMLElement;

			if (!DOM.hasClass(parent, 'notebook-folding-indicator')) {
				return;
			}

			// folding icon

			const cellViewModel = e.target;
			const modelIndex = viewModel.getCellIndex(cellViewModel);
			const state = viewModel.getFoldingState(modelIndex);

			if (state === CellFoldingState.None) {
				return;
			}

			this.setFoldingState(modelIndex, state === CellFoldingState.Collapsed ? CellFoldingState.Expanded : CellFoldingState.Collapsed);
		}

		return;
	}
}
