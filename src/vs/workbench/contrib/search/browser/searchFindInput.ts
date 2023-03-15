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
import { NotebookFindInputFilter } from 'vs/workbench/contrib/notebook/browser/contrib/find/notebookFindReplaceWidget';
import * as nls from 'vs/nls';

export class SearchFindInput extends ContextScopedFindInput {
	private _findFilter: NotebookFindInputFilter;
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
			new NotebookFindInputFilter(
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
		this._filterChecked = this.filters.markupPreview || this.filters.codeOutput;
		if (this.regex) {
			if (this._filterChecked && this._visible) {
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
