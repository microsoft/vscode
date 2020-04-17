/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { INotebookEditor, INotebookEditorMouseEvent } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import * as DOM from 'vs/base/browser/dom';
import { CellFoldingState } from 'vs/workbench/contrib/notebook/browser/viewModel/foldingModel';

export class FoldingController extends Disposable {
	constructor(
		private readonly _notebookEditor: INotebookEditor

	) {
		super();

		this._register(this._notebookEditor.onMouseUp(e => { this.onMouseUp(e); }));
		this._register(this._notebookEditor.viewModel!.onDidFoldingRegionChanged(() => {
			const hiddenRanges = this._notebookEditor.viewModel!.getHiddenRanges();
			this._notebookEditor.setHiddenAreas(hiddenRanges);
		}));
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
			const state = viewModel.getFoldingState(cellViewModel);

			if (state === CellFoldingState.None) {
				return;
			}

			viewModel.setFoldingState(cellViewModel, state === CellFoldingState.Collapsed ? CellFoldingState.Expanded : CellFoldingState.Collapsed);
		}

		return;
	}
}
