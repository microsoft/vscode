/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { matchesFuzzy } from 'vs/base/common/filters';
import { splitGlobAware } from 'vs/base/common/glob';
import * as strings from 'vs/base/common/strings';
import { ITreeFilter, TreeVisibility, TreeFilterResult } from 'vs/base/browser/ui/tree/tree';
import { IReplElement } from 'vs/workbench/contrib/debug/common/debug';
import * as DOM from 'vs/base/browser/dom';
import { BaseActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { Delayer } from 'vs/base/common/async';
import { IAction } from 'vs/base/common/actions';
import { HistoryInputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { toDisposable, Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ContextScopedHistoryInputBox } from 'vs/platform/browser/contextScopedHistoryWidget';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';


type ParsedQuery = {
	type: 'include' | 'exclude',
	query: string,
};

export class ReplFilter implements ITreeFilter<IReplElement> {

	static matchQuery = matchesFuzzy;

	private _parsedQueries: ParsedQuery[] = [];
	set filterQuery(query: string) {
		this._parsedQueries = [];
		query = query.trim();

		if (query && query !== '') {
			const filters = splitGlobAware(query, ',').map(s => s.trim()).filter(s => !!s.length);
			for (const f of filters) {
				if (strings.startsWith(f, '!')) {
					this._parsedQueries.push({ type: 'exclude', query: f.slice(1) });
				} else {
					this._parsedQueries.push({ type: 'include', query: f });
				}
			}
		}
	}

	filter(element: IReplElement, parentVisibility: TreeVisibility): TreeFilterResult<void> {
		if (this._parsedQueries.length === 0) {
			return parentVisibility;
		}

		let includeQueryPresent = false;
		let includeQueryMatched = false;

		const text = element.toString();

		for (let { type, query } of this._parsedQueries) {
			if (type === 'exclude' && ReplFilter.matchQuery(query, text)) {
				// If exclude query matches, ignore all other queries and hide
				return false;
			} else if (type === 'include') {
				includeQueryPresent = true;
				if (ReplFilter.matchQuery(query, text)) {
					includeQueryMatched = true;
				}
			}
		}

		return includeQueryPresent ? includeQueryMatched : parentVisibility;
	}
}

export interface IReplFiltersChangeEvent {
	filterText?: boolean;
	layout?: boolean;
}

export interface IReplFiltersOptions {
	filterText: string;
	filterHistory: string[];
	layout: DOM.Dimension;
}

export class TreeFilterState extends Disposable {

	private readonly _onDidChange: Emitter<IReplFiltersChangeEvent> = this._register(new Emitter<IReplFiltersChangeEvent>());
	readonly onDidChange: Event<IReplFiltersChangeEvent> = this._onDidChange.event;

	constructor(options: IReplFiltersOptions) {
		super();
		this._filterText = options.filterText;
		this.filterHistory = options.filterHistory;
		this._layout = options.layout;
	}

	private _filterText: string;
	get filterText(): string {
		return this._filterText;
	}
	set filterText(filterText: string) {
		if (this._filterText !== filterText) {
			this._filterText = filterText;
			this._onDidChange.fire({ filterText: true });
		}
	}

	filterHistory: string[];

	private _layout: DOM.Dimension = new DOM.Dimension(0, 0);
	get layout(): DOM.Dimension {
		return this._layout;
	}
	set layout(layout: DOM.Dimension) {
		if (this._layout.width !== layout.width || this._layout.height !== layout.height) {
			this._layout = layout;
			this._onDidChange.fire(<IReplFiltersChangeEvent>{ layout: true });
		}
	}
}

export class TreeFilterPanelActionViewItem extends BaseActionViewItem {

	private delayedFilterUpdate: Delayer<void>;
	private container: HTMLElement | undefined;
	private filterInputBox: HistoryInputBox | undefined;

	constructor(
		action: IAction,
		private placeholder: string,
		private filters: TreeFilterState,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService private readonly themeService: IThemeService,
		@IContextViewService private readonly contextViewService: IContextViewService) {
		super(null, action);
		this.delayedFilterUpdate = new Delayer<void>(200);
		this._register(toDisposable(() => this.delayedFilterUpdate.cancel()));
	}

	render(container: HTMLElement): void {
		this.container = container;
		DOM.addClass(this.container, 'panel-action-tree-filter-container');

		this.element = DOM.append(this.container, DOM.$(''));
		this.element.className = this.class;
		this.createInput(this.element);
		this.updateClass();

		this.adjustInputBox();
	}

	focus(): void {
		if (this.filterInputBox) {
			this.filterInputBox.focus();
		}
	}

	private clearFilterText(): void {
		if (this.filterInputBox) {
			this.filterInputBox.value = '';
		}
	}

	private createInput(container: HTMLElement): void {
		this.filterInputBox = this._register(this.instantiationService.createInstance(ContextScopedHistoryInputBox, container, this.contextViewService, {
			placeholder: this.placeholder,
			history: this.filters.filterHistory
		}));
		this._register(attachInputBoxStyler(this.filterInputBox, this.themeService));
		this.filterInputBox.value = this.filters.filterText;
		this._register(this.filterInputBox.onDidChange(() => this.delayedFilterUpdate.trigger(() => this.onDidInputChange(this.filterInputBox!))));
		this._register(this.filters.onDidChange((event: IReplFiltersChangeEvent) => {
			if (event.filterText) {
				this.filterInputBox!.value = this.filters.filterText;
			}
		}));
		this._register(DOM.addStandardDisposableListener(this.filterInputBox.inputElement, DOM.EventType.KEY_DOWN, (e: any) => this.onInputKeyDown(e)));
		this._register(DOM.addStandardDisposableListener(container, DOM.EventType.KEY_DOWN, this.handleKeyboardEvent));
		this._register(DOM.addStandardDisposableListener(container, DOM.EventType.KEY_UP, this.handleKeyboardEvent));
		this._register(DOM.addStandardDisposableListener(this.filterInputBox.inputElement, DOM.EventType.CLICK, (e) => {
			e.stopPropagation();
			e.preventDefault();
		}));
		this._register(this.filters.onDidChange(e => this.onDidFiltersChange(e)));
	}

	private onDidFiltersChange(e: IReplFiltersChangeEvent): void {
		if (e.layout) {
			this.updateClass();
		}
	}

	private onDidInputChange(inputbox: HistoryInputBox) {
		inputbox.addToHistory();
		this.filters.filterText = inputbox.value;
		this.filters.filterHistory = inputbox.getHistory();
	}

	// Action toolbar is swallowing some keys for action items which should not be for an input box
	private handleKeyboardEvent(event: StandardKeyboardEvent) {
		if (event.equals(KeyCode.Space)
			|| event.equals(KeyCode.LeftArrow)
			|| event.equals(KeyCode.RightArrow)
			|| event.equals(KeyCode.Escape)
		) {
			event.stopPropagation();
		}
	}

	private onInputKeyDown(event: StandardKeyboardEvent) {
		if (event.equals(KeyCode.Escape)) {
			this.clearFilterText();
			event.stopPropagation();
			event.preventDefault();
		}
	}

	private adjustInputBox(): void {
		if (this.element && this.filterInputBox) {
			this.filterInputBox.inputElement.style.paddingRight = DOM.hasClass(this.element, 'small') ? '25px' : '150px';
		}
	}

	protected updateClass(): void {
		if (this.element && this.container) {
			this.element.className = this.class;
			DOM.toggleClass(this.container, 'grow', DOM.hasClass(this.element, 'grow'));
			this.adjustInputBox();
		}
	}

	protected get class(): string {
		if (this.filters.layout.width > 800) {
			return 'panel-action-tree-filter grow';
		} else if (this.filters.layout.width < 600) {
			return 'panel-action-tree-filter small';
		} else {
			return 'panel-action-tree-filter';
		}
	}
}
