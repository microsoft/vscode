/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IListRenderer, IListVirtualDelegate, NotSelectableGroupId } from '../../../../../base/browser/ui/list/list.js';
import { Delayer } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { IMatch, matchesContiguousSubString } from '../../../../../base/common/filters.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { AccessibilityVerbositySettingId } from '../../../../contrib/accessibility/browser/accessibilityConfiguration.js';
import { AICustomizationManagementSection } from './aiCustomizationManagement.js';

const $ = DOM.$;
const SEARCH_RESULT_HEIGHT = 48;
const SEARCH_GROUP_HEIGHT = 36;

export interface IAICustomizationOverviewSourceItem {
	readonly id: string;
	readonly name: string;
	readonly description?: string;
	readonly state: 'inUse' | 'available';
	readonly keywords?: readonly string[];
	readonly open?: () => void | Promise<void>;
	readonly action?: {
		readonly label: string;
		readonly ariaLabel: string;
		readonly run: () => void | Promise<void>;
	};
}

export interface IAICustomizationOverviewSearchItem extends IAICustomizationOverviewSourceItem {
	readonly section: AICustomizationManagementSection;
	readonly sectionLabel: string;
	readonly sectionIcon: ThemeIcon;
}

export interface IAICustomizationOverviewSourceSearchResult {
	readonly items: readonly IAICustomizationOverviewSourceItem[];
	readonly warning?: string;
}

interface ISearchGroupEntry {
	readonly type: 'group';
	readonly id: string;
	readonly label: string;
	readonly count: number;
}

interface ISearchResultEntry {
	readonly type: 'result';
	readonly item: IAICustomizationOverviewSearchItem;
	readonly nameMatches?: IMatch[];
	readonly descriptionMatches?: IMatch[];
}

type SearchEntry = ISearchGroupEntry | ISearchResultEntry;

export interface IAICustomizationOverviewSearchMatches {
	readonly item: IAICustomizationOverviewSearchItem;
	readonly nameMatches?: IMatch[];
	readonly descriptionMatches?: IMatch[];
}

export function filterAICustomizationOverviewSearchItems(items: readonly IAICustomizationOverviewSearchItem[], query: string): readonly IAICustomizationOverviewSearchMatches[] {
	const normalizedQuery = query.toLowerCase();
	const results: IAICustomizationOverviewSearchMatches[] = [];
	for (const item of items) {
		const nameMatches = matchesContiguousSubString(normalizedQuery, item.name) ?? undefined;
		const descriptionMatches = item.description ? matchesContiguousSubString(normalizedQuery, item.description) ?? undefined : undefined;
		const keywordMatches = item.keywords?.some(keyword => !!matchesContiguousSubString(normalizedQuery, keyword));
		if (nameMatches || descriptionMatches || keywordMatches) {
			results.push({ item, nameMatches, descriptionMatches });
		}
	}
	results.sort((a, b) => a.item.name.localeCompare(b.item.name));
	return results;
}

interface ISearchGroupTemplate {
	readonly label: HTMLElement;
	readonly count: HTMLElement;
}

interface ISearchResultTemplate {
	readonly container: HTMLElement;
	readonly icon: HTMLElement;
	readonly name: HighlightedLabel;
	readonly type: HTMLElement;
	readonly description: HighlightedLabel;
	readonly action: HTMLButtonElement;
	readonly elementDisposables: DisposableStore;
}

export interface IAICustomizationOverviewSearchResult {
	readonly items: readonly IAICustomizationOverviewSearchItem[];
	readonly warning?: string;
}

export interface IAICustomizationOverviewSearchCallbacks {
	search(query: string, token: CancellationToken): Promise<IAICustomizationOverviewSearchResult>;
	open(item: IAICustomizationOverviewSearchItem): void;
	setActive(active: boolean): void;
}

class OverviewSearchDelegate implements IListVirtualDelegate<SearchEntry> {
	getHeight(element: SearchEntry): number {
		return element.type === 'group' ? SEARCH_GROUP_HEIGHT : SEARCH_RESULT_HEIGHT;
	}

	getTemplateId(element: SearchEntry): string {
		return element.type;
	}
}

class OverviewSearchGroupRenderer implements IListRenderer<ISearchGroupEntry, ISearchGroupTemplate> {
	readonly templateId = 'group';

	renderTemplate(container: HTMLElement): ISearchGroupTemplate {
		container.classList.add('overview-search-group');
		const label = DOM.append(container, $('.overview-search-group-label'));
		const count = DOM.append(container, $('.overview-search-group-count'));
		return { label, count };
	}

	renderElement(element: ISearchGroupEntry, _index: number, templateData: ISearchGroupTemplate): void {
		templateData.label.textContent = element.label;
		templateData.count.textContent = String(element.count);
	}

	disposeTemplate(): void { }
}

class OverviewSearchResultRenderer implements IListRenderer<ISearchResultEntry, ISearchResultTemplate> {
	readonly templateId = 'result';

	constructor(
		private readonly hoverService: IHoverService,
		private readonly onDidRunAction: () => void,
	) { }

	renderTemplate(container: HTMLElement): ISearchResultTemplate {
		container.classList.add('overview-search-result');
		const icon = DOM.append(container, $('.overview-search-result-icon'));
		const details = DOM.append(container, $('.overview-search-result-details'));
		const title = DOM.append(details, $('.overview-search-result-title'));
		const nameContainer = DOM.append(title, $('.overview-search-result-name'));
		const name = new HighlightedLabel(nameContainer);
		const type = DOM.append(title, $('.overview-search-result-type'));
		const descriptionContainer = DOM.append(details, $('.overview-search-result-description'));
		const description = new HighlightedLabel(descriptionContainer);
		const action = DOM.append(container, $('button.overview-search-result-action')) as HTMLButtonElement;
		action.type = 'button';
		return { container, icon, name, type, description, action, elementDisposables: new DisposableStore() };
	}

	renderElement(element: ISearchResultEntry, _index: number, templateData: ISearchResultTemplate): void {
		templateData.elementDisposables.clear();
		templateData.icon.className = 'overview-search-result-icon';
		templateData.icon.classList.add(...ThemeIcon.asClassNameArray(element.item.sectionIcon));
		templateData.name.set(element.item.name, element.nameMatches);
		templateData.type.textContent = element.item.sectionLabel;
		templateData.description.set(element.item.description ?? '', element.descriptionMatches);
		templateData.description.element.style.display = element.item.description ? '' : 'none';
		templateData.action.style.display = element.item.action ? '' : 'none';
		if (element.item.action) {
			templateData.action.textContent = element.item.action.label;
			templateData.action.setAttribute('aria-label', element.item.action.ariaLabel);
			templateData.elementDisposables.add(DOM.addDisposableListener(templateData.action, 'click', async event => {
				DOM.EventHelper.stop(event, true);
				try {
					await element.item.action?.run();
					this.onDidRunAction();
				} catch (error) {
					onUnexpectedError(error);
				}
			}));
			templateData.elementDisposables.add(DOM.addDisposableListener(templateData.action, 'mousedown', event => DOM.EventHelper.stop(event, true)));
			templateData.elementDisposables.add(DOM.addDisposableListener(templateData.action, 'mouseup', event => DOM.EventHelper.stop(event, true)));
			templateData.elementDisposables.add(DOM.addDisposableListener(templateData.action, 'dblclick', event => DOM.EventHelper.stop(event, true)));
		}
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.container, {
			content: element.item.description ? `${element.item.name}\n${element.item.description}` : element.item.name,
		}));
	}

	disposeTemplate(templateData: ISearchResultTemplate): void {
		templateData.name.dispose();
		templateData.description.dispose();
		templateData.elementDisposables.dispose();
	}
}

export class AICustomizationOverviewSearch extends Disposable {

	readonly element: HTMLElement;

	private readonly searchInput: InputBox;
	private readonly list: WorkbenchList<SearchEntry>;
	private readonly resultsContainer: HTMLElement;
	private readonly listContainer: HTMLElement;
	private readonly emptyContainer: HTMLElement;
	private readonly emptyText: HTMLElement;
	private readonly warningText: HTMLElement;
	private readonly searchDelayer = this._register(new Delayer<void>(200));
	private searchSequence = 0;
	private readonly searchCts = this._register(new MutableDisposable<CancellationTokenSource>());
	private pendingSearch = Promise.resolve();

	constructor(
		parent: HTMLElement,
		private readonly callbacks: IAICustomizationOverviewSearchCallbacks,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService hoverService: IHoverService,
		@IAccessibleViewService accessibleViewService: IAccessibleViewService,
	) {
		super();

		this.element = DOM.append(parent, $('.welcome-prompts-explore'));
		DOM.append(this.element, $('h3.welcome-prompts-explore-heading')).textContent = localize('exploreCustomizations', "Explore Customizations");
		DOM.append(this.element, $('p.welcome-prompts-explore-description')).textContent = localize('exploreCustomizationsDescription', "Search across all customization types, or browse by type.");

		const searchContainer = DOM.append(this.element, $('.welcome-prompts-explore-search'));
		this.searchInput = this._register(new InputBox(searchContainer, contextViewService, {
			placeholder: localize('searchAllCustomizationsPlaceholder', "Search all customizations"),
			ariaLabel: [
				localize('searchAllCustomizationsAriaLabel', "Search all customization types"),
				accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.AICustomizations),
			].filter(Boolean).join('. '),
			inputBoxStyles: defaultInputBoxStyles,
		}));

		this.resultsContainer = DOM.append(this.element, $('.overview-search-results'));
		this.resultsContainer.style.display = 'none';
		this.emptyContainer = DOM.append(this.resultsContainer, $('.overview-search-empty'));
		this.emptyContainer.style.display = 'none';
		this.emptyText = DOM.append(this.emptyContainer, $('.overview-search-empty-text'));
		this.warningText = DOM.append(this.resultsContainer, $('.overview-search-warning'));
		this.warningText.style.display = 'none';
		this.listContainer = DOM.append(this.resultsContainer, $('.overview-search-list'));

		this.list = this._register(instantiationService.createInstance(
			WorkbenchList<SearchEntry>,
			'AICustomizationOverviewSearch',
			this.listContainer,
			new OverviewSearchDelegate(),
			[
				new OverviewSearchGroupRenderer(),
				new OverviewSearchResultRenderer(hoverService, () => {
					this.refresh();
					this.searchInput.focus();
				}),
			],
			{
				multipleSelectionSupport: false,
				horizontalScrolling: false,
				openOnSingleClick: true,
				accessibilityProvider: {
					getAriaLabel: entry => entry.type === 'group'
						? localize('overviewSearchGroupAriaLabel', "{0}, {1} results", entry.label, entry.count)
						: localize('overviewSearchResultAriaLabel', "{0}, {1}, {2}", entry.item.name, entry.item.sectionLabel, entry.item.state === 'available' ? localize('available', "Available") : localize('inUse', "In use")),
					getWidgetAriaLabel: () => localize('overviewSearchResultsAriaLabel', "Customization search results"),
				},
				identityProvider: {
					getId: entry => entry.type === 'group' ? entry.id : `${entry.item.section}:${entry.item.id}`,
					getGroupId: entry => entry.type === 'group' ? NotSelectableGroupId : 0,
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: entry => entry.type === 'result' ? entry.item.name : undefined,
				},
			},
		));

		this._register(this.list.onDidOpen(event => {
			if (event.element?.type === 'result') {
				this.callbacks.open(event.element.item);
			}
		}));

		this._register(this.searchInput.onDidChange(() => {
			const sequence = ++this.searchSequence;
			const active = this.searchInput.value.trim().length > 0;
			this.callbacks.setActive(active);
			this.resultsContainer.style.display = active ? '' : 'none';
			if (!active) {
				this.searchCts.clear();
				this.list.splice(0, this.list.length, []);
				return;
			}
			const query = this.searchInput.value.trim();
			this.pendingSearch = this.searchDelayer.trigger(() => this.runSearch(query, sequence));
		}));
		this._register(DOM.addDisposableListener(this.searchInput.inputElement, 'keydown', event => {
			if (event.key === 'ArrowDown' && this.list.length > 0) {
				let firstResultIndex = -1;
				for (let index = 0; index < this.list.length; index++) {
					if (this.list.element(index).type === 'result') {
						firstResultIndex = index;
						break;
					}
				}
				if (firstResultIndex === -1) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				this.list.setFocus([firstResultIndex]);
				this.list.reveal(firstResultIndex);
				this.list.domFocus();
			}
		}));

		const resizeObserver = this._register(new DOM.DisposableResizeObserver('AICustomizationOverviewSearch.results', () => this.layoutList()));
		this._register(resizeObserver.observe(this.resultsContainer));
	}

	async setQuery(query: string): Promise<void> {
		this.searchInput.value = query;
		await this.pendingSearch;
	}

	focus(): void {
		this.searchInput.focus();
	}

	refresh(): void {
		const query = this.searchInput.value.trim();
		if (!query) {
			return;
		}
		const sequence = ++this.searchSequence;
		this.pendingSearch = this.runSearch(query, sequence);
	}

	private async runSearch(query: string, sequence: number): Promise<void> {
		this.showMessage(localize('searchingCustomizations', "Searching customizations..."));
		const cts = new CancellationTokenSource();
		this.searchCts.value = cts;
		try {
			const result = await this.callbacks.search(query, cts.token);
			if (sequence !== this.searchSequence || cts.token.isCancellationRequested) {
				return;
			}
			this.renderResults(query, result);
		} catch (error) {
			if (sequence !== this.searchSequence || cts.token.isCancellationRequested) {
				return;
			}
			onUnexpectedError(error);
			this.showMessage(localize('searchCustomizationsFailed', "Unable to search customizations."));
		}
	}

	private renderResults(query: string, result: IAICustomizationOverviewSearchResult): void {
		const results: ISearchResultEntry[] = filterAICustomizationOverviewSearchItems(result.items, query)
			.map(match => ({ type: 'result', ...match }));
		const entries: SearchEntry[] = [];
		this.appendGroup(entries, 'in-use', localize('inUseGroup', "In use"), results.filter(result => result.item.state === 'inUse'));
		this.appendGroup(entries, 'available', localize('availableGroup', "Available"), results.filter(result => result.item.state === 'available'));

		if (entries.length === 0) {
			this.list.splice(0, this.list.length, []);
			this.resultsContainer.style.display = 'none';
			this.callbacks.setActive(false);
			status(localize('noCustomizationSearchResultsStatus', "No customization search results."));
			return;
		}

		this.callbacks.setActive(true);
		this.resultsContainer.style.display = '';
		this.emptyContainer.style.display = 'none';
		this.listContainer.style.display = '';
		this.warningText.style.display = result.warning ? '' : 'none';
		this.warningText.textContent = result.warning ?? '';
		this.list.splice(0, this.list.length, entries);
		this.layoutList();
		status(localize('customizationSearchResultsStatus', "{0} customization search results.", results.length));
	}

	private appendGroup(entries: SearchEntry[], id: string, label: string, results: readonly ISearchResultEntry[]): void {
		if (results.length === 0) {
			return;
		}
		entries.push({ type: 'group', id, label, count: results.length }, ...results);
	}

	private showMessage(message: string): void {
		this.list.splice(0, this.list.length, []);
		this.listContainer.style.display = 'none';
		this.warningText.style.display = 'none';
		this.emptyContainer.style.display = 'flex';
		this.emptyText.textContent = message;
	}

	private layoutList(): void {
		if (this.resultsContainer.style.display === 'none' || this.listContainer.style.display === 'none') {
			return;
		}
		this.list.layout(this.resultsContainer.clientHeight, this.resultsContainer.clientWidth);
	}
}
