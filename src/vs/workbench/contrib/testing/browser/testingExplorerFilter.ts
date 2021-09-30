/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { BaseActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { DropdownMenuActionViewItem } from 'vs/base/browser/ui/dropdown/dropdownActionViewItem';
import { Action, IAction, IActionRunner, Separator } from 'vs/base/common/actions';
import { Delayer } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { splitGlobAware } from 'vs/base/common/glob';
import { Iterable } from 'vs/base/common/iterator';
import { localize } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IThemeService, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { TestTag } from 'vs/workbench/api/common/extHostTypeConverters';
import { attachSuggestEnabledInputBoxStyler, ContextScopedSuggestEnabledInputWithHistory, SuggestEnabledInputWithHistory, SuggestResultsProvider } from 'vs/workbench/contrib/codeEditor/browser/suggestEnabledInput/suggestEnabledInput';
import { testingFilterIcon } from 'vs/workbench/contrib/testing/browser/icons';
import { Testing } from 'vs/workbench/contrib/testing/common/constants';
import { IObservableValue, MutableObservableValue } from 'vs/workbench/contrib/testing/common/observableValue';
import { StoredValue } from 'vs/workbench/contrib/testing/common/storedValue';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';

export interface ITestExplorerFilterState {
	_serviceBrand: undefined;
	readonly text: IObservableValue<string>;

	/** Test ID the user wants to reveal in the explorer */
	readonly reveal: MutableObservableValue<string | undefined>;

	readonly onDidRequestInputFocus: Event<void>;

	/**
	 * Glob list to filter for based on the {@link text}
	 */
	readonly globList: readonly { include: boolean; text: string }[];

	/**
	 * The user requested to filter for only the specified tags.
	 */
	readonly onlyTags: ReadonlySet<string>;

	/**
	 * Focuses the filter input in the test explorer view.
	 */
	focusInput(): void;

	/**
	 * Replaces the filter {@link text}.
	 */
	setText(text: string): void;

	/**
	 * Sets whether the {@link text} is filtering for a special term.
	 */
	isFilteringFor(term: TestFilterTerm): boolean;

	/**
	 * Sets whether the {@link text} includes a special filter term.
	 */
	toggleFilteringFor(term: TestFilterTerm, shouldFilter?: boolean): void;
}

export const ITestExplorerFilterState = createDecorator<ITestExplorerFilterState>('testingFilterState');

const tagRe = /@([^ ,]*)/g;
const testTagRe = /^@(.+?):(.+)$/;
const trimExtraWhitespace = (str: string) => str.replace(/\s\s+/g, ' ').trim();

export class TestExplorerFilterState implements ITestExplorerFilterState {
	declare _serviceBrand: undefined;
	private readonly focusEmitter = new Emitter<void>();
	/**
	 * Mapping of terms to whether they're included in the text.
	 */
	private termFilterState: { [K in TestFilterTerm]?: true } = {};

	/** @inheritdoc */
	public globList: { include: boolean; text: string }[] = [];

	/** @inheritdoc */
	public onlyTags = new Set<string>();

	/** @inheritdoc */
	public readonly text = new MutableObservableValue('');

	public readonly reveal = new MutableObservableValue</* test ID */string | undefined>(undefined);

	public readonly onDidRequestInputFocus = this.focusEmitter.event;

	/** @inheritdoc */
	public focusInput() {
		this.focusEmitter.fire();
	}

	/** @inheritdoc */
	public setText(text: string) {
		if (text === this.text.value) {
			return;
		}

		this.termFilterState = {};
		this.globList = [];
		this.onlyTags.clear();

		let globText = '';
		let lastIndex = 0;
		for (const match of text.matchAll(tagRe)) {
			globText += text.slice(lastIndex, match.index);
			lastIndex = match.index! + match[0].length;

			const tag = match[0];
			if (allTestFilterTerms.includes(tag as TestFilterTerm)) {
				this.termFilterState[tag as TestFilterTerm] = true;
			}

			const tagMatch = testTagRe.exec(tag);
			if (tagMatch) {
				this.onlyTags.add(TestTag.namespace(tagMatch[1], tagMatch[2]));
			}
		}

		globText += text.slice(lastIndex).trim();

		if (globText.length) {
			for (const filter of splitGlobAware(globText, ',').map(s => s.trim()).filter(s => !!s.length)) {
				if (filter.startsWith('!')) {
					this.globList.push({ include: false, text: filter.slice(1).toLowerCase() });
				} else {
					this.globList.push({ include: true, text: filter.toLowerCase() });
				}
			}
		}

		this.text.value = text; // purposely afterwards so everything is updated when the change event happen
	}

	/** @inheritdoc */
	public isFilteringFor(term: TestFilterTerm) {
		return !!this.termFilterState[term];
	}

	/** @inheritdoc */
	public toggleFilteringFor(term: TestFilterTerm, shouldFilter?: boolean) {
		const text = this.text.value.trim();
		if (shouldFilter !== false && !this.termFilterState[term]) {
			this.setText(text ? `${text} ${term}` : term);
		} else if (shouldFilter !== true && this.termFilterState[term]) {
			this.setText(trimExtraWhitespace(text.replace(term, '')));
		}
	}
}

export const enum TestFilterTerm {
	Failed = '@failed',
	Executed = '@executed',
	CurrentDoc = '@doc',
	Hidden = '@hidden',
}

const testFilterDescriptions: { [K in TestFilterTerm]: string } = {
	[TestFilterTerm.Failed]: localize('testing.filters.showOnlyFailed', "Show Only Failed Tests"),
	[TestFilterTerm.Executed]: localize('testing.filters.showOnlyExecuted', "Show Only Executed Tests"),
	[TestFilterTerm.CurrentDoc]: localize('testing.filters.currentFile', "Show in Active File Only"),
	[TestFilterTerm.Hidden]: localize('testing.filters.showExcludedTests', "Show Hidden Tests"),
};

export const allTestFilterTerms = Object.keys(testFilterDescriptions) as readonly TestFilterTerm[];

export class TestingExplorerFilter extends BaseActionViewItem {
	private input!: SuggestEnabledInputWithHistory;
	private wrapper!: HTMLDivElement;
	private readonly history: StoredValue<string[]> = this.instantiationService.createInstance(StoredValue, {
		key: 'testing.filterHistory2',
		scope: StorageScope.WORKSPACE,
		target: StorageTarget.USER
	});

	private readonly filtersAction = new Action('markersFiltersAction', localize('testing.filters.menu', "More Filters..."), 'testing-filter-button ' + ThemeIcon.asClassName(testingFilterIcon));

	constructor(
		action: IAction,
		@ITestExplorerFilterState private readonly state: ITestExplorerFilterState,
		@IThemeService private readonly themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITestService private readonly testService: ITestService,
	) {
		super(null, action);
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

		const input = this.input = this._register(this.instantiationService.createInstance(ContextScopedSuggestEnabledInputWithHistory, {
			id: 'testing.explorer.filter',
			ariaLabel: localize('testExplorerFilterLabel', "Filter text for tests in the explorer"),
			parent: wrapper,
			suggestionProvider: {
				triggerCharacters: ['@'],
				provideResults: () => [
					...Object.entries(testFilterDescriptions).map(([label, detail]) => ({ label, detail })),
					...Iterable.map(this.testService.collection.tags.values(), tag => {
						const { ctrlId, tagId } = TestTag.denamespace(tag.id);
						return ({
							label: `@${ctrlId}:${tagId}`,
							detail: tag.label ? `${tag.ctrlLabel} › ${tag.label}` : tag.ctrlLabel,
						});
					}),
				].filter(r => !this.state.text.value.includes(r.label)),
			} as SuggestResultsProvider,
			resourceHandle: 'testing:filter',
			suggestOptions: {
				value: this.state.text.value,
				placeholderText: localize('testExplorerFilter', "Filter (e.g. text, !exclude, @tag)"),
			},
			history: this.history.get([]),
		}));
		this._register(attachSuggestEnabledInputBoxStyler(input, this.themeService));

		this._register(this.state.text.onDidChange(newValue => {
			if (input.getValue() !== newValue) {
				input.setValue(newValue);
			}
		}));

		this._register(this.state.onDidRequestInputFocus(() => {
			input.focus();
		}));

		this._register(input.onInputDidChange(() => updateDelayer.trigger(() => {
			input.addToHistory();
			this.state.setText(input.getValue());
		})));

		const actionbar = this._register(new ActionBar(container, {
			actionViewItemProvider: action => {
				if (action.id === this.filtersAction.id) {
					return this.instantiationService.createInstance(FiltersDropdownMenuActionViewItem, action, this.state, this.actionRunner);
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
			/* line height */ 27 - /* editor padding */ 4,
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
		const history = this.input.getHistory();
		if (history.length) {
			this.history.store(history);
		} else {
			this.history.delete();
		}
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
			...[TestFilterTerm.Failed, TestFilterTerm.Executed, TestFilterTerm.CurrentDoc].map(term => ({
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
				checked: this.filters.isFilteringFor(TestFilterTerm.Hidden),
				class: undefined,
				enabled: this.testService.excluded.hasAny,
				id: 'showExcluded',
				label: localize('testing.filters.showExcludedTests', "Show Hidden Tests"),
				run: () => this.filters.toggleFilteringFor(TestFilterTerm.Hidden),
				tooltip: '',
				dispose: () => null
			},
			{
				checked: false,
				class: undefined,
				enabled: this.testService.excluded.hasAny,
				id: 'removeExcluded',
				label: localize('testing.filters.removeTestExclusions', "Unhide All Tests"),
				run: async () => this.testService.excluded.clear(),
				tooltip: '',
				dispose: () => null
			}
		];
	}

	override updateChecked(): void {
		this.element!.classList.toggle('checked', this._action.checked);
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: Testing.FilterActionId,
			title: localize('filter', "Filter"),
		});
	}
	async run(): Promise<void> { }
});
