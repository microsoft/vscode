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
import { IFindInputToggleOpts } from 'vs/base/browser/ui/findinput/findInputToggles';
import { Codicon } from 'vs/base/common/codicons';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { Toggle } from 'vs/base/browser/ui/toggle/toggle';
import { Emitter } from 'vs/base/common/event';

const NLS_AI_TOGGLE_LABEL = nls.localize('aiDescription', "Use AI");

export class SearchFindInput extends ContextScopedFindInput {
	private _findFilter: NotebookFindInputFilterButton;
	private _aiButton: AIToggle;
	private _filterChecked: boolean = false;
	private readonly _onDidChangeAIToggle = this._register(new Emitter<boolean>());
	public readonly onDidChangeAIToggle = this._onDidChangeAIToggle.event;
	private shouldNotebookFilterBeVisible: boolean = false; // followed, but overriden by the whether aiToggle is visible

	constructor(
		container: HTMLElement | null,
		contextViewProvider: IContextViewProvider,
		options: IFindInputOptions,
		contextKeyService: IContextKeyService,
		readonly contextMenuService: IContextMenuService,
		readonly instantiationService: IInstantiationService,
		readonly filters: NotebookFindFilters,
		shouldShowAIButton: boolean, // caller responsible for updating this when it changes,
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

		this._aiButton = this._register(
			new AIToggle({
				appendTitle: '',
				isChecked: false,
				...options.toggleStyles
			}));

		this.setAdditionalToggles([this._aiButton]);

		this._updatePadding();

		this.controls.appendChild(this._findFilter.container);
		this._findFilter.container.classList.add('monaco-custom-toggle');
		this.filterVisible = filterStartVisiblitity;
		// ensure that ai button is visible if it should be
		this.sparkleVisible = shouldShowAIButton;

		this._register(this._aiButton.onChange(() => {
			if (this.regex) {
				this.regex.visible = !this._aiButton.checked;
			}
			if (this.wholeWords) {
				this.wholeWords.visible = !this._aiButton.checked;
			}
			if (this.caseSensitive) {
				this.caseSensitive.visible = !this._aiButton.checked;
			}
			if (this._aiButton.checked) {
				this._findFilter.visible = false;
			} else {
				this.filterVisible = this.shouldNotebookFilterBeVisible;
			}
			this._updatePadding();

		}));
	}

	private _updatePadding() {
		this.inputBox.paddingRight =
			(this.caseSensitive?.visible ? this.caseSensitive.width() : 0) +
			(this.wholeWords?.visible ? this.wholeWords.width() : 0) +
			(this.regex?.visible ? this.regex.width() : 0) +
			(this._findFilter.visible ? this._findFilter.width() : 0) +
			(this._aiButton.visible ? this._aiButton.width() : 0);
	}

	set sparkleVisible(visible: boolean) {
		this._aiButton.visible = visible;
		this._updatePadding();
	}

	set filterVisible(visible: boolean) {
		this.shouldNotebookFilterBeVisible = visible;
		if (this._aiButton.visible && this._aiButton.checked) {
			return;
		}
		this._findFilter.visible = visible;
		this.updateFilterStyles();
		this._updatePadding();
	}

	override setEnabled(enabled: boolean) {
		super.setEnabled(enabled);
		if (enabled && (!this._filterChecked || !this._findFilter.visible)) {
			this.regex?.enable();
		} else {
			this.regex?.disable();
		}
	}

	updateFilterStyles() {
		// filter is checked if it's in a non-default state
		this._filterChecked =
			!this.filters.markupInput ||
			!this.filters.markupPreview ||
			!this.filters.codeInput ||
			!this.filters.codeOutput;

		// TODO: find a way to express that searching notebook output and markdown preview don't support regex.
		this._findFilter.applyStyles(this._filterChecked);
	}

	get isAIEnabled() {
		return this._aiButton.checked;
	}
}

class AIToggle extends Toggle {
	constructor(opts: IFindInputToggleOpts) {
		super({
			icon: Codicon.sparkle,
			title: NLS_AI_TOGGLE_LABEL + opts.appendTitle,
			isChecked: opts.isChecked,
			hoverDelegate: opts.hoverDelegate ?? getDefaultHoverDelegate('element'),
			inputActiveOptionBorder: opts.inputActiveOptionBorder,
			inputActiveOptionForeground: opts.inputActiveOptionForeground,
			inputActiveOptionBackground: opts.inputActiveOptionBackground
		});
	}
}
