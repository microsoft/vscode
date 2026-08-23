/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { BaseActionViewItem, IActionViewItemOptions, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { AnchorAlignment } from '../../../../base/browser/ui/contextview/contextview.js';
import { DropdownMenuActionViewItem } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { Action, IAction, IActionRunner, Separator } from '../../../../base/common/actions.js';
import { Delayer } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ContextScopedSuggestEnabledInputWithHistory, SuggestEnabledInputWithHistory, SuggestResultsProvider } from '../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js';
import { testingFilterIcon } from './icons.js';
import { StoredValue } from '../common/storedValue.js';
import { ITestExplorerFilterState, TestFilterTerm } from '../common/testExplorerFilterState.js';
import { ITestService } from '../common/testService.js';
import { denamespaceTestTag } from '../common/testTypes.js';

const testFilterDescriptions: { [K in TestFilterTerm]: string } = {
	[TestFilterTerm.Failed]: localize('testing.filters.showOnlyFailed', "Show Only Failed Tests"),
	[TestFilterTerm.Executed]: localize('testing.filters.showOnlyExecuted', "Show Only Executed Tests"),
	[TestFilterTerm.CurrentDoc]: localize('testing.filters.currentFile', "Show in Active File Only"),
	[TestFilterTerm.OpenedFiles]: localize('testing.filters.openedFiles', "Show in Opened Files Only"),
	[TestFilterTerm.Hidden]: localize('testing.filters.showExcludedTests', "Show Hidden Tests"),
};

export class TestingExplorerFilter extends BaseActionViewItem {
	private input!: SuggestEnabledInputWithHistory;
	private wrapper!: HTMLDivElement;
	private readonly focusEmitter = this._register(new Emitter<void>());
	public readonly onDidFocus = this.focusEmitter.event;
	private readonly history: StoredValue<{ values: string[]; lastValue: string } | string[]>;

	private readonly filtersAction = new Action('markersFiltersAction', localize('testing.filters.menu', "More Filters..."), 'testing-filter-button ' + ThemeIcon.asClassName(testingFilterIcon));

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		@ITestExplorerFilterState private readonly state: ITestExplorerFilterState,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITestService private readonly testService: ITestService,
	) {
		super(null, action, options);
		this.history = this._register(instantiationService.createInstance(StoredValue, {
			key: 'testing.filterHistory2',
			scope: StorageScope.WORKSPACE,
			target: StorageTarget.MACHINE
		}));
		this.updateFilterActiveState();
		this._register(testService.excluded.onTestExclusionsChanged(this.updateFilterActiveState, this));
	}

	/**
	 * @override
	 */
	public override render(container: HTMLElement) {
		container.classList.add('testing-filter-action-item');

		const updateDelayer = this._register(new Delayer<void>(400));
		const wrapper = this.wrapper = dom.$('.testing-filter-wrapper');
		container.appendChild(wrapper);

		let history = this.history.get({ lastValue: '', values: [] });
		if (history instanceof Array) {
			history = { lastValue: '', values: history };
		}
		if (history.lastValue) {
			this.state.setText(history.lastValue);
		}

		const input = this.input = this._register(this.instantiationService.createInstance(ContextScopedSuggestEnabledInputWithHistory, {
			id: 'testing.explorer.filter',
			ariaLabel: localize('testExplorerFilterLabel', "Filter text for tests in the explorer"),
			parent: wrapper,
			suggestionProvider: {
				triggerCharacters: ['@'],
				provideResults: () => [
					...Object.entries(testFilterDescriptions).map(([label, detail]) => ({ label, detail })),
					...Iterable.map(this.testService.collection.tags.values(), tag => {
						const { ctrlId, tagId } = denamespaceTestTag(tag.id);
						const insertText = `@${ctrlId}:${tagId}`;
						return ({
							label: `@${ctrlId}:${tagId}`,
							detail: this.testService.collection.getNodeById(ctrlId)?.item.label,
							insertText: tagId.includes(' ') ? `@${ctrlId}:"${tagId.replace(/(["\\])/g, '\\$1')}"` : insertText,
						});
					}),
				].filter(r => !this.state.text.value.includes(r.label)),
			} satisfies SuggestResultsProvider,
			resourceHandle: 'testing:filter',
			suggestOptions: {
				value: this.state.text.value,
				placeholderText: localize('testExplorerFilter', "Filter (e.g. text, !exclude, @tag)"),
			},
			history: history.values
		}));

		this._register(this.state.text.onDidChange(newValue => {
			if (input.getValue() !== newValue) {
				input.setValue(newValue);
			}
		}));

		this._register(this.state.onDidRequestInputFocus(() => {
			input.focus();
		}));

		this._register(input.onDidFocus(() => {
			this.focusEmitter.fire();
		}));

		this._register(input.onInputDidChange(() => updateDelayer.trigger(() => {
			input.addToHistory();
			this.state.setText(input.getValue());
		})));

		const actionbar = this._register(new ActionBar(container, {
			actionViewItemProvider: (action, options) => {
				if (action.id === this.filtersAction.id) {
					return this.instantiationService.createInstance(FiltersDropdownMenuActionViewItem, action, options, this.state, this.actionRunner);
				}
				return undefined;
			},
		}));
		actionbar.push(this.filtersAction, { icon: true, label: false });

		this.layout(this.wrapper.clientWidth);
	}

	public layout(width: number) {
		this.input.layout(new dom.Dimension(
			width - /* horizontal padding */ 24 - /* editor padding */ 8 - /* filter button padding */ 22,
			20, // line height from suggestEnabledInput.ts
		));
	}


	/**
	 * Focuses the filter input.
	 */
	public override focus(): void {
		this.input.focus();
	}

	/**
	 * Persists changes to the input history.
	 */
	public saveState() {
		this.history.store({ lastValue: this.input.getValue(), values: this.input.getHistory() });
	}

	/**
	 * @override
	 */
	public override dispose() {
		this.saveState();
		super.dispose();
	}

	/**
	 * Updates the 'checked' state of the filter submenu.
	 */
	private updateFilterActiveState() {
		this.filtersAction.checked = this.testService.excluded.hasAny;
	}
}


class FiltersDropdownMenuActionViewItem extends DropdownMenuActionViewItem {

	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		private readonly filters: ITestExplorerFilterState,
		actionRunner: IActionRunner,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITestService private readonly testService: ITestService,
	) {
		super(action,
			{ getActions: () => this.getActions() },
			contextMenuService,
			{
				actionRunner,
				classNames: action.class,
				anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
				menuAsChild: true
			}
		);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.updateChecked();
	}

	private getActions(): IAction[] {
		return [
			...[TestFilterTerm.Failed, TestFilterTerm.Executed, TestFilterTerm.CurrentDoc, TestFilterTerm.OpenedFiles].map(term => ({
				checked: this.filters.isFilteringFor(term),
				class: undefined,
				enabled: true,
				id: term,
				label: testFilterDescriptions[term],
				run: () => this.filters.toggleFilteringFor(term),
				tooltip: '',
				dispose: () => null
			})),
			new Separator(),
			{
				checked: this.filters.fuzzy.value,
				class: undefined,
				enabled: true,
				id: 'fuzzy',
				label: localize('testing.filters.fuzzyMatch', "Fuzzy Match"),
				run: () => this.filters.fuzzy.value = !this.filters.fuzzy.value,
				tooltip: ''
			},
			new Separator(),
			{
				checked: this.filters.isFilteringFor(TestFilterTerm.Hidden),
				class: undefined,
				enabled: this.testService.excluded.hasAny,
				id: 'showExcluded',
				label: localize('testing.filters.showExcludedTests', "Show Hidden Tests"),
				run: () => this.filters.toggleFilteringFor(TestFilterTerm.Hidden),
				tooltip: ''
			},
			{
				class: undefined,
				enabled: this.testService.excluded.hasAny,
				id: 'removeExcluded',
				label: localize('testing.filters.removeTestExclusions', "Unhide All Tests"),
				run: async () => this.testService.excluded.clear(),
				tooltip: ''
			}
		];
	}

	protected override updateChecked(): void {
		this.element!.classList.toggle('checked', this._action.checked);
	}
}
