/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { Action, IAction } from 'vs/base/common/actions';
import { localize } from 'vs/nls';
import { NotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookEditor';
import { INotebookKernelMatchResult, INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';

export class NotebooKernelActionViewItem extends ActionViewItem {

	constructor(
		actualAction: IAction,
		private readonly _editor: NotebookEditor,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
	) {
		super(
			undefined,
			new Action('fakeAction', undefined, undefined, true, (event) => actualAction.run(event)),
			{ label: true, icon: false }
		);
		this._register(_editor.onDidChangeModel(this._update, this));
	}

	override render(container: HTMLElement): void {
		this._update();
		super.render(container);
		this.label!.style.display = 'inline-block';
	}

	private _update(): void {
		const widget = this._editor.getControl();
		if (!widget || !widget.hasModel()) {
			this._resetAction();
			return;
		}
		const notebook = widget.viewModel.notebookDocument;
		const info = this._notebookKernelService.getMatchingKernel(notebook);
		this._updateActionFromKernelInfo(info);
	}

	private _updateActionFromKernelInfo(info: INotebookKernelMatchResult): void {

		if (info.all.length === 0) {
			// should not happen - means "bad" context keys
			this._resetAction();
			return;
		}

		this._action.enabled = true;
		const selectedOrSuggested = info.selected ?? info.suggested;
		if (selectedOrSuggested) {
			// selected or suggested kernel
			this._action.label = selectedOrSuggested.label;
			this._action.tooltip = selectedOrSuggested.description ?? selectedOrSuggested.detail ?? '';
			if (!info.selected) {
				// special UI for selected kernel?
			}

		} else {
			// many kernels
			this._action.label = localize('select', "Select Kernel");
			this._action.tooltip = '';
		}
	}

	private _resetAction(): void {
		this._action.enabled = false;
		this._action.label = '';
		this._action.class = '';
	}
}
