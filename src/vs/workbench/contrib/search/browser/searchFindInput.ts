/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { IFindInputOptions } from 'vs/base/browser/ui/findinput/findInput';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ContextScopedFindInput } from 'vs/platform/history/browser/contextScopedHistoryWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { NotebookFindFilters } from 'vs/workbench/contrib/notebook/browser/contrib/find/findFilters';
import { NotebookFindInputFilterButton } from 'vs/workbench/contrib/notebook/browser/contrib/find/notebookFindReplaceWidget';
import * as nls from 'vs/nls';

export class SearchFindInput extends ContextScopedFindInput {
	private _findFilter: NotebookFindInputFilterButton;
	private _filterChecked: boolean = false;
	private _visible: boolean = false;

	constructor(
		container: HTMLElement | null,
		contextViewProvider: IContextViewProvider,
		options: IFindInputOptions,
		contextKeyService: IContextKeyService,
		readonly contextMenuService: IContextMenuService,
		readonly instantiationService: IInstantiationService,
		readonly filters: NotebookFindFilters,
		filterStartVisiblitity: boolean
	) {
		super(container, contextViewProvider, options, contextKeyService);
		this._findFilter = this._register(
			new NotebookFindInputFilterButton(
				filters,
				contextMenuService,
				instantiationService,
				options,
				nls.localize('searchFindInputNotebookFilter.label', "Notebook Find Filters")
			));
		this.inputBox.paddingRight = (this.caseSensitive?.width() ?? 0) + (this.wholeWords?.width() ?? 0) + (this.regex?.width() ?? 0) + this._findFilter.width;
		this.controls.appendChild(this._findFilter.container);
		this._findFilter.container.classList.add('monaco-custom-toggle');

		this.filterVisible = filterStartVisiblitity;
	}

	set filterVisible(show: boolean) {
		this._findFilter.container.style.display = show ? '' : 'none';
		this._visible = show;
		this.updateStyles();
	}

	override setEnabled(enabled: boolean) {
		super.setEnabled(enabled);
		if (enabled && (!this._filterChecked || !this._visible)) {
			this.regex?.enable();
		} else {
			this.regex?.disable();
		}
	}

	updateStyles() {
		// filter is checked if it's in a non-default state
		this._filterChecked =
			!this.filters.markupInput ||
			this.filters.markupPreview ||
			!this.filters.codeInput ||
			!this.filters.codeOutput;

		// for now, allow the default state to enable regex, since it would be strange for regex to suddenly
		// be disabled when a notebook is opened. However, since regex isn't supported for outputs, this should
		// be revisted.
		if (this.regex) {
			if ((this.filters.markupPreview || this.filters.codeOutput) && this._filterChecked && this._visible) {
				this.regex.disable();
				this.regex.domNode.tabIndex = -1;
				this.regex.domNode.classList.toggle('disabled', true);
			} else {
				this.regex.enable();
				this.regex.domNode.tabIndex = 0;
				this.regex.domNode.classList.toggle('disabled', false);
			}
		}
		this._findFilter.applyStyles(this._filterChecked);
	}
}
