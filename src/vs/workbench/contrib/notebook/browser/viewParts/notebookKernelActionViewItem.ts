/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./notebookKernelActionViewItem';
import { ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { Action, IAction } from 'vs/base/common/actions';
import { localize } from 'vs/nls';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { NotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookEditor';
import { selectKernelIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { INotebookKernelMatchResult, INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

export class NotebooKernelActionViewItem extends ActionViewItem {

	private _kernelLabel?: HTMLAnchorElement;

	constructor(
		actualAction: IAction,
		private readonly _editor: NotebookEditor | INotebookEditor,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
	) {
		super(
			undefined,
			new Action('fakeAction', undefined, ThemeIcon.asClassName(selectKernelIcon), true, (event) => actualAction.run(event)),
			{ label: false, icon: true }
		);
		this._register(_editor.onDidChangeModel(this._update, this));
		this._register(_notebookKernelService.onDidChangeNotebookAffinity(this._update, this));
		this._register(_notebookKernelService.onDidChangeSelectedNotebooks(this._update, this));
	}

	override render(container: HTMLElement): void {
		this._update();
		super.render(container);
		container.classList.add('kernel-action-view-item');
		this._kernelLabel = document.createElement('a');
		container.appendChild(this._kernelLabel);
		this.updateLabel();
	}

	override updateLabel() {
		if (this._kernelLabel) {
			this._kernelLabel.classList.add('kernel-label');
			this._kernelLabel.innerText = this._action.label;
			this._kernelLabel.title = this._action.tooltip;
		}
	}

	protected _update(): void {
		const notebook = this._editor.textModel;

		if (!notebook) {
			this._resetAction();
			return;
		}

		const info = this._notebookKernelService.getMatchingKernel(notebook);
		this._updateActionFromKernelInfo(info);
	}

	private _updateActionFromKernelInfo(info: INotebookKernelMatchResult): void {

		this._action.enabled = true;
		const selectedOrSuggested = info.selected ?? (info.all.length === 1 && info.suggestions.length === 1 ? info.suggestions[0] : undefined);
		if (selectedOrSuggested) {
			// selected or suggested kernel
			this._action.label = selectedOrSuggested.label;
			this._action.tooltip = selectedOrSuggested.description ?? selectedOrSuggested.detail ?? '';
			if (!info.selected) {
				// special UI for selected kernel?
			}

		} else {
			// many kernels or no kernels
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
