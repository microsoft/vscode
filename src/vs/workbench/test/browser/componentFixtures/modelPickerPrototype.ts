/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, EventType, getWindow, reset } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event as BaseEvent } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ActionListItemKind, ActionListWidget, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import './modelPickerPrototype.css';

export interface IModelPickerPrototypeModel {
	readonly id: string;
	readonly label: string;
	readonly creator: string;
	readonly icon: ThemeIcon;
	/** Model tier from `LanguageModelChatInformation.category`: lightweight | versatile | powerful. */
	readonly category?: string;
	/** Relative price band from `LanguageModelChatInformation.priceCategory`: low | medium | high | very_high. */
	readonly priceCategory?: string;
	/** Suggested in the Home hub when the user hasn't pinned much yet. */
	readonly recommended?: boolean;
	/** Most-recently used, lowest first — drives the Recent section of the hub. */
	readonly recentRank?: number;
	readonly pinned?: boolean;
	readonly ungrouped?: boolean;
	readonly isAuto?: boolean;
	readonly configuration?: readonly IModelPickerPrototypeConfigurationSection[];
	readonly creditCosts?: IModelPickerPrototypeCreditCosts;
	readonly compatibleHarnesses?: readonly ModelPickerPrototypeHarness[];
}

export interface IModelPickerPrototypeConfigurationOption {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	/** Compact form used by the modified badge, e.g. `1M` for an extended context window. */
	readonly shortLabel?: string;
	readonly usesLongContext?: boolean;
}

export interface IModelPickerPrototypeConfigurationSection {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly defaultValue: string;
	readonly options: readonly IModelPickerPrototypeConfigurationOption[];
}

export interface IModelPickerPrototypeCreditRates {
	readonly input?: number | null;
	readonly output?: number | null;
	readonly cacheRead?: number | null;
	readonly cacheWrite?: number | null;
}

export interface IModelPickerPrototypeCreditCosts {
	readonly default: IModelPickerPrototypeCreditRates;
	readonly longContext?: IModelPickerPrototypeCreditRates;
}

export interface IModelPickerPrototypeSource {
	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly iconClass?: string;
	readonly models: readonly IModelPickerPrototypeModel[];
	readonly compatibleHarnesses?: readonly ModelPickerPrototypeHarness[];
	readonly groupBy?: ModelPickerPrototypeGrouping;
	/**
	 * Where these models arrive from — the account or key they are billed and routed
	 * through, e.g. "GitHub Copilot" or "ChatGPT Free". The tab names the provider; this
	 * names the entitlement, which is what tells two otherwise identical lists apart.
	 */
	readonly account?: string;
	/**
	 * The same provider reaches you differently depending on the harness: a subscription
	 * inside its own harness, an API key everywhere else. Falls back to {@link account}.
	 */
	readonly accountPerHarness?: Partial<Record<ModelPickerPrototypeHarness, string>>;
	/** No account connected yet — the tab shows a sign-in call to action. */
	readonly requiresSetup?: boolean;
	/** Sign-in button label, e.g. "Sign in to use ChatGPT". */
	readonly signInLabel?: string;
}

export type ModelPickerPrototypeGrouping = 'creator' | 'capability';

export type ModelPickerPrototypeHarness = 'copilot' | 'codex' | 'claude';

export interface IModelPickerPrototypeOptions {
	readonly sources: readonly IModelPickerPrototypeSource[];
	readonly activeSourceId: string;
	readonly activeHarness: ModelPickerPrototypeHarness;
	readonly selectedModelId?: string;
	/** Start in Auto mode, with the model list gated. */
	readonly autoEnabled?: boolean;
	readonly searchQuery?: string;
}

export interface IModelPickerPrototypeSelection {
	readonly model: IModelPickerPrototypeModel;
	readonly source: IModelPickerPrototypeSource;
}

interface IModelPickerPrototypeAction {
	readonly id: string;
	readonly enabled: boolean;
	readonly checked: boolean;
	readonly kind: 'model' | 'group' | 'empty' | 'account';
	run(): void;
}

const pinnedSourceId = 'pinned';
/** Recommendations come from Copilot, so they depend on that account being connected. */
const copilotSourceId = 'copilot';
const pickerContentWidth = 232;
const pickerListHeight = 278;
const maxPinnedModels = 3;
const maxRecentModels = 3;
/** Restored when the pointer leaves a rate, which borrows the heading to name itself. */
const creditHeadingLabel = 'Credits per 1M T';

/** Model tiers, most capable first. Mirrors `getCategoryLabel` in `modelPickerHover.ts`. */
const capabilityOrder: readonly string[] = ['powerful', 'versatile', 'lightweight'];
const otherCapabilityLabel = 'Other';

/**
 * Creators VS Code ships a brand glyph for. Everyone else falls back to a lettered
 * monogram, so these lead the creator groups to keep the marks together.
 * Kept in step with the `-creator-*` rules in the stylesheet.
 */
const brandedCreators: ReadonlySet<string> = new Set(['Copilot', 'OpenAI', 'Anthropic', 'Google', 'xAI', 'Moonshot', 'Microsoft']);

function getCategoryLabel(category: string | undefined): string | undefined {
	switch (category) {
		case undefined:
		case '':
			return undefined;
		case 'lightweight':
			return 'Lightweight';
		case 'versatile':
			return 'Versatile';
		case 'powerful':
			return 'Powerful';
		default:
			return category.charAt(0).toUpperCase() + category.slice(1);
	}
}

/** Mirrors `getPriceCategoryLabel` in `modelPickerPresentation.ts`. */
function getPriceCategoryLabel(priceCategory: string | undefined): string | undefined {
	if (typeof priceCategory !== 'string' || priceCategory.length === 0) {
		return undefined;
	}
	switch (priceCategory) {
		case 'low':
			return 'Low cost';
		case 'medium':
			return 'Medium cost';
		case 'high':
			return 'High cost';
		case 'very_high':
			return 'Very high cost';
		default:
			return `${priceCategory.charAt(0).toUpperCase() + priceCategory.slice(1)} cost`;
	}
}

function isHighCostCategory(priceCategory: string | undefined): boolean {
	return priceCategory === 'high' || priceCategory === 'very_high';
}

class ModelPickerPrototypeActionListWidget extends ActionListWidget<IModelPickerPrototypeAction> {

	protected override _getItemHeight(item: IActionListItem<IModelPickerPrototypeAction>): number {
		if (item.item?.kind === 'group') {
			return 36;
		}
		// A caption, not a row: it names the account the list below arrives through.
		if (item.item?.kind === 'account') {
			return 22;
		}
		// Model rows sit on the same 28px control rhythm as the tabs, the buttons
		// and the mode bar, instead of the list default's tighter 24px.
		if (item.item?.kind === 'model') {
			return 28;
		}
		// The empty state carries an icon, a label and a sentence, stacked and centred to
		// match the full-panel empty states.
		if (item.item?.kind === 'empty') {
			return 76;
		}
		return super._getItemHeight(item);
	}
}

export class ModelPickerPrototype extends Disposable {

	readonly domNode = $('.action-widget.model-picker-prototype');

	private readonly _onDidChangeSelection = this._register(new Emitter<IModelPickerPrototypeSelection>());
	readonly onDidChangeSelection: BaseEvent<IModelPickerPrototypeSelection> = this._onDidChangeSelection.event;

	private readonly _onDidRequestManageModels = this._register(new Emitter<void>());
	readonly onDidRequestManageModels: BaseEvent<void> = this._onDidRequestManageModels.event;

	private readonly _onDidRequestAddModelProvider = this._register(new Emitter<void>());
	readonly onDidRequestAddModelProvider: BaseEvent<void> = this._onDidRequestAddModelProvider.event;

	private readonly _onDidRequestHide = this._register(new Emitter<void>());
	readonly onDidRequestHide: BaseEvent<void> = this._onDidRequestHide.event;

	/** Carries the source that asked, since providers connect one at a time. */
	private readonly _onDidRequestSetup = this._register(new Emitter<string>());
	readonly onDidRequestSetup: BaseEvent<string> = this._onDidRequestSetup.event;

	private readonly _onDidChangeAutoEnabled = this._register(new Emitter<boolean>());
	readonly onDidChangeAutoEnabled: BaseEvent<boolean> = this._onDidChangeAutoEnabled.event;

	private readonly _sourceBar = $('.model-picker-prototype-source-bar');
	private readonly _sourceStrip = $('.model-picker-prototype-source-strip');
	private readonly _sourceTabs = $('.model-picker-prototype-source-tabs');
	private readonly _mainNode = $('.model-picker-prototype-main');
	private readonly _setupNode = $('.model-picker-prototype-setup');
	private readonly _setupDisposables = this._register(new DisposableStore());
	private readonly _configurationPane = $('aside.model-picker-prototype-configuration');
	private readonly _tabDisposables = this._register(new DisposableStore());
	private readonly _configurationDisposables = this._register(new DisposableStore());
	private readonly _addMenuDisposables = this._register(new DisposableStore());
	private readonly _list: ActionListWidget<IModelPickerPrototypeAction>;
	private readonly _configurationValues = new Map<string, Map<string, string>>();
	private readonly _addProviderButton: Button;
	private readonly _searchButton: Button;
	private readonly _backButton: Button | undefined;
	private _searchMode = false;
	private _activeSourceId: string;
	private _activeHarness: ModelPickerPrototypeHarness;
	private _selectedModelId: string | undefined;
	/** Auto is a mode over the models, not one of them. */
	private _autoEnabled = false;
	/** Pins the user has changed in this session, overriding the model's own flag. */
	private readonly _pinnedOverrides = new Map<string, boolean>();
	/** The catalogue in force now; starts at the option and changes as providers connect. */
	private _sources: readonly IModelPickerPrototypeSource[];
	/** Restored when Auto is switched back off, so the gate never loses the pick. */
	private _lastExplicitModelId: string | undefined;
	private readonly _autoBarNode = $('.model-picker-prototype-auto-bar');
	private readonly _autoDisposables = this._register(new DisposableStore());
	/** Separate store so re-rendering the segments never tears down the toggle's listener. */
	private readonly _autoRoutingDisposables = this._register(new DisposableStore());
	private _autoToggleNode: HTMLElement | undefined;
	private _autoRoutingNode: HTMLElement | undefined;
	private _autoDetailNode: HTMLElement | undefined;
	private _configurationSelection: IModelPickerPrototypeSelection | undefined;
	private _configurationTrigger: HTMLElement | undefined;
	private _addMenu: HTMLElement | undefined;
	private _sourceButtons: readonly Button[] = [];

	constructor(
		_options: IModelPickerPrototypeOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super();

		this._activeHarness = _options.activeHarness;
		this._sources = _options.sources;
		this._activeSourceId = this._isSourceAvailable(_options.activeSourceId) ? _options.activeSourceId : pinnedSourceId;
		this._selectedModelId = _options.selectedModelId;
		this._autoEnabled = !!_options.autoEnabled;
		this._lastExplicitModelId = _options.selectedModelId;

		this._list = this._register(instantiationService.createInstance(
			ModelPickerPrototypeActionListWidget,
			'ModelPickerPrototype',
			false,
			this._getBrowseItems(),
			{
				onSelect: action => action.run(),
				onHide: () => { },
				onFilter: filter => Promise.resolve(this._getItems(filter)),
			},
			{
				getAriaLabel: item => [item.label, item.badge].filter(Boolean).join(', ') || null,
				isChecked: item => item.item?.kind === 'model' ? item.item.checked : undefined,
				getRole: item => item.item?.kind === 'model' ? 'menuitemradio' : item.item?.kind === 'group' ? 'button' : 'separator',
				getWidgetRole: () => 'menu',
			},
			{
				showFilter: true,
				filterPlaceholder: 'Search',
				focusFilterOnOpen: false,
				minWidth: pickerContentWidth,
				maxWidth: pickerContentWidth,
				reserveSubmenuSpace: false,
				hideDefaultKeybindingTooltip: true,
				className: 'model-picker-prototype-list',
			},
		));

		if (this._list.filterContainer) {
			this._backButton = this._register(new Button(this._list.filterContainer, {
				ariaLabel: 'Back to Sources',
				supportIcons: true,
				title: 'Back to Sources',
			}));
			this._backButton.element.classList.add('model-picker-prototype-search-back');
			this._backButton.label = `$(${Codicon.close.id})`;
			this._register(this._backButton.onDidClick(() => this._exitSearchMode()));
		}

		this._sourceTabs.setAttribute('role', 'tablist');
		this._sourceTabs.setAttribute('aria-label', 'Model sources');
		// The add button rides inside the scrolling strip so it always follows the
		// last tab, and only meets search when the tabs push it there.
		this._sourceStrip.appendChild(this._sourceTabs);
		this._sourceBar.appendChild(this._sourceStrip);

		this._addProviderButton = this._register(new Button(this._sourceStrip, {
			ariaLabel: 'Model Options',
			supportIcons: true,
			title: 'Model Options',
		}));
		this._addProviderButton.element.classList.add('model-picker-prototype-add-provider');
		this._addProviderButton.element.setAttribute('aria-haspopup', 'menu');
		this._addProviderButton.label = `$(${Codicon.add.id})`;
		this._register(this._addProviderButton.onDidClick(() => this._toggleAddMenu()));

		// The search field takes the tabs' place inside the same bar, so the search button
		// itself never moves — it just becomes the active tab.
		if (this._list.filterContainer) {
			this._sourceBar.appendChild(this._list.filterContainer);
		}

		this._searchButton = this._register(new Button(this._sourceBar, {
			ariaLabel: 'Search Models',
			supportIcons: true,
			title: 'Search Models',
		}));
		this._searchButton.element.classList.add('model-picker-prototype-search-toggle');
		this._searchButton.label = `$(${Codicon.search.id})`;
		this._register(this._searchButton.onDidClick(() => this._enterSearchMode()));

		this._mainNode.appendChild(this._sourceBar);
		this._mainNode.appendChild(this._autoBarNode);
		this._mainNode.appendChild(this._list.domNode);
		this._mainNode.appendChild(this._setupNode);
		this.domNode.appendChild(this._mainNode);
		this.domNode.appendChild(this._configurationPane);
		this._renderSourceTabs();
		this._renderEmptyPanel();
		this._renderAutoBar();
		this._applyAutoGate();
		this._list.layout(pickerListHeight, pickerContentWidth);
		this._observeListHeight();
		this._list.clearFocus();

		if (_options.searchQuery && this._list.filterInput) {
			this._searchMode = true;
			this.domNode.classList.add('search-mode');
			this._searchButton.element.classList.add('active');
			this._list.filterInput.value = _options.searchQuery;
			this._list.filterInput.dispatchEvent(new Event('input'));
			this._renderAutoBar();
		}

		if (this._list.filterInput) {
			this._register(addDisposableListener(this._list.filterInput, EventType.INPUT, () => {
				this._hideConfiguration(false);
				// Typing can empty the results, which swaps the list for the empty panel.
				this._renderEmptyPanel();
			}));
			this._register(addDisposableListener(this._list.filterInput, EventType.KEY_DOWN, event => this._handleListKeyDown(event, true)));
		}
		this._register(addDisposableListener(this._list.domNode, EventType.KEY_DOWN, event => this._handleListKeyDown(event, false)));

		this._register(addDisposableListener(this._sourceTabs, EventType.KEY_DOWN, event => {
			if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
				return;
			}
			const activeIndex = this._getTabs().findIndex(source => source.id === this._activeSourceId);
			const direction = event.key === 'ArrowRight' ? 1 : -1;
			const nextIndex = (activeIndex + direction + this._sourceButtons.length) % this._sourceButtons.length;
			event.preventDefault();
			this._activateSource(this._getTabs()[nextIndex].id);
			this._sourceButtons[nextIndex].focus();
		}));

		this._register(addDisposableListener(this._configurationPane, EventType.KEY_DOWN, event => {
			if (event.key === 'Escape') {
				event.preventDefault();
				this._hideConfiguration();
			}
		}));

		this._register(addDisposableListener(this.domNode.ownerDocument, EventType.POINTER_DOWN, event => {
			if (this._configurationSelection && !event.composedPath().includes(this.domNode)) {
				this._hideConfiguration(false);
			}
			if (this._addMenu && !event.composedPath().includes(this._addMenu) && !event.composedPath().includes(this._addProviderButton.element)) {
				this._hideAddMenu(false);
			}
		}, true));
	}

	private _observeListHeight(): void {
		const ResizeObserverCtor = getWindow(this.domNode).ResizeObserver;
		if (!ResizeObserverCtor) {
			return;
		}
		let lastHeight = pickerListHeight;
		let revealedInitialSelection = false;
		const observer = new ResizeObserverCtor(() => {
			// `clientHeight` includes the well's padding, which the rows cannot use. Handing
			// that number to the list makes it believe in a viewport taller than the one you
			// can see, so revealing a row at the bottom leaves it clipped by the padding.
			const styles = getWindow(this.domNode).getComputedStyle(this._list.domNode);
			const padding = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
			const height = Math.round(this._list.domNode.clientHeight - padding);
			if (height <= 0) {
				return;
			}
			if (height !== lastHeight) {
				lastHeight = height;
				this._list.layout(height, pickerContentWidth);
			}
			if (!revealedInitialSelection) {
				revealedInitialSelection = true;
				this._revealInitialSelection();
			}
		});
		observer.observe(this._list.domNode);
		this._register(toDisposable(() => observer.disconnect()));
	}

	/**
	 * The list reveals the chosen model before it has been laid out, so every item counts as
	 * off screen and even a selection near the top scrolls its own headings away. Once the
	 * real height is known this starts from the top and reveals it again: a selection that
	 * already fits is left where it is, and one further down still opens in view.
	 */
	private _revealInitialSelection(): void {
		this._list.scrollToTop();
		// A parked selection is not drawn as chosen while Auto holds the list, so there is
		// nothing to reveal and the list should simply open at its beginning.
		const gated = this._autoEnabled && !!this._getAutoModel();
		if (this._selectedModelId && !gated) {
			this._list.revealItemById(this._selectedModelId);
		}
	}

	private _refreshItems(): void {
		if (this._list.filterInput) {
			this._list.filterInput.dispatchEvent(new Event('input'));
			return;
		}
		this._list.updateItems(this._getItems(''));
	}

	private _enterSearchMode(): void {
		if (this._searchMode) {
			return;
		}
		this._searchMode = true;
		this._hideConfiguration(false);
		this._hideAddMenu(false);
		this.domNode.classList.add('search-mode');
		// Search becomes the selected tab rather than a separate mode.
		this._searchButton.element.classList.add('active');
		this._renderAutoBar();
		this._refreshItems();
		this._renderEmptyPanel();
		this._list.filterInput?.focus();
	}

	private _exitSearchMode(): void {
		if (!this._searchMode) {
			return;
		}
		this._searchMode = false;
		this._hideConfiguration(false);
		if (this._list.filterInput) {
			this._list.filterInput.value = '';
		}
		this.domNode.classList.remove('search-mode');
		this._searchButton.element.classList.remove('active');
		this._renderAutoBar();
		this._refreshItems();
		this._renderEmptyPanel();
		this._list.clearFocus();
		this._searchButton.focus();
	}

	private _getSearchSources(): readonly IModelPickerPrototypeSource[] {
		return this._getAvailableSources();
	}

	private _handleListKeyDown(event: KeyboardEvent, fromFilter: boolean): void {
		if (!fromFilter && event.target instanceof HTMLElement && event.target.closest('.action-list-item-toolbar')) {
			return;
		}
		// The gate is a mode, so it has to hold for the keyboard as well.
		if (this._autoEnabled && !!this._getAutoModel() && (event.key === 'Enter' || event.key === ' ')) {
			event.preventDefault();
			return;
		}
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				this._list.focusNext();
				break;
			case 'ArrowUp':
				event.preventDefault();
				this._list.focusPrevious();
				break;
			case 'ArrowLeft':
				if (!fromFilter) {
					event.preventDefault();
					this._list.collapseFocusedSection();
				}
				break;
			case 'ArrowRight':
				if (!fromFilter) {
					event.preventDefault();
					this._list.expandFocusedSection();
				}
				break;
			case 'Enter':
				event.preventDefault();
				this._list.acceptSelected();
				break;
			case ' ':
				if (!fromFilter) {
					event.preventDefault();
					if (!this._list.toggleFocusedSection()) {
						this._list.acceptSelected();
					}
				}
				break;
			case 'Escape':
				if (this._searchMode) {
					event.preventDefault();
					this._exitSearchMode();
					return;
				}
				this._onDidRequestHide.fire();
				break;
		}
	}

	/**
	 * Replaces the model catalogue, as happens when a provider connects or disconnects.
	 * The active tab is kept when it survives the swap so signing in reveals the models
	 * in place rather than throwing the user back to the hub.
	 */
	setSources(sources: readonly IModelPickerPrototypeSource[]): void {
		this._sources = sources;
		this._hideConfiguration(false);
		this._hideAddMenu(false);
		if (!this._isSourceAvailable(this._activeSourceId)) {
			this._activeSourceId = pinnedSourceId;
		}
		this._renderSourceTabs();
		this._renderEmptyPanel();
		this._renderAutoBar();
		this._applyAutoGate();
		this._list.updateItems(this._getItems(this._list.filterInput?.value ?? ''));
		this._list.clearFocus();
	}

	setHarness(harness: ModelPickerPrototypeHarness): void {
		if (harness === this._activeHarness) {
			return;
		}

		this._activeHarness = harness;
		this._hideConfiguration();
		if (!this._isSourceAvailable(this._activeSourceId)) {
			this._activeSourceId = this._getAvailableSources().find(source =>
				source.models.some(model => model.id === this._selectedModelId))?.id
				?? this._getAvailableSources()[0]?.id
				?? pinnedSourceId;
		}
		this._renderSourceTabs();
		this._renderEmptyPanel();
		this._renderAutoBar();
		this._applyAutoGate();
		this._list.updateItems(this._getItems(this._list.filterInput?.value ?? ''));
		this._list.clearFocus();
	}

	private _getAvailableSources(): readonly IModelPickerPrototypeSource[] {
		return this._getAvailableProviderSources();
	}

	private _getAvailableProviderSources(): readonly IModelPickerPrototypeSource[] {
		return this._sources
			.filter(source => this._isCompatible(source.compatibleHarnesses))
			.map(source => ({
				...source,
				models: source.models.filter(model => this._isCompatible(model.compatibleHarnesses)),
			}))
			// A signed-out provider still owns a tab; it just can't list models yet.
			.filter(source => source.models.length > 0 || source.requiresSetup);
	}

	private _isCompatible(compatibleHarnesses: readonly ModelPickerPrototypeHarness[] | undefined): boolean {
		return !compatibleHarnesses || compatibleHarnesses.includes(this._activeHarness);
	}

	private _getTabs(): readonly IModelPickerPrototypeSource[] {
		const availableSources = this._getAvailableSources();
		return [{
			id: pinnedSourceId,
			label: 'Pinned',
			icon: Codicon.home,
			models: availableSources.flatMap(source => source.models.filter(model => model.pinned)),
		}, ...availableSources];
	}

	private _isSourceAvailable(sourceId: string): boolean {
		return sourceId === pinnedSourceId || this._getAvailableSources().some(source => source.id === sourceId);
	}

	private _renderSourceTabs(): void {
		this._tabDisposables.clear();
		reset(this._sourceTabs);
		const tabs = this._getTabs();
		// The leftmost tab shares the well's left edge, so the well's rounded corner would
		// notch out from under it. Squaring it makes the two read as one surface.
		this.domNode.classList.toggle('first-tab-active', tabs[0]?.id === this._activeSourceId);
		this._sourceButtons = tabs.map(source => {
			const active = source.id === this._activeSourceId;
			const button = this._tabDisposables.add(new Button(this._sourceTabs, {
				ariaLabel: source.label,
				supportIcons: true,
				title: source.label,
			}));
			button.element.classList.add('model-picker-prototype-source-tab');
			if (source.iconClass) {
				button.element.classList.add(source.iconClass);
			}
			button.element.classList.toggle('active', active);
			button.element.setAttribute('role', 'tab');
			button.element.setAttribute('aria-selected', String(active));
			button.element.tabIndex = active ? 0 : -1;
			button.label = `$(${source.icon.id})`;
			this._tabDisposables.add(button.onDidClick(() => this._activateSource(source.id)));
			return button;
		});
		this._revealActiveSource();
	}

	private _activateSource(sourceId: string): void {
		if (sourceId === this._activeSourceId) {
			return;
		}
		this._hideConfiguration(false);
		this._activeSourceId = sourceId;
		this._renderSourceTabs();
		this._renderEmptyPanel();
		this._renderAutoBar();
		if (!this._list.filterInput?.value.trim()) {
			this._list.updateItems(this._getBrowseItems());
		}
		// A tab is a whole new list, so it starts at its own beginning rather than at
		// whatever offset the previous tab happened to be scrolled to.
		this._list.scrollToTop();
		this._list.clearFocus();
	}

	private _revealActiveSource(): void {
		this._sourceTabs.querySelector<HTMLElement>('.model-picker-prototype-source-tab.active')
			?.scrollIntoView({ inline: 'center', block: 'nearest' });
	}

	private _getItems(filter: string): readonly IActionListItem<IModelPickerPrototypeAction>[] {
		if (this._searchMode) {
			return filter.trim() ? this._getSearchItems(filter) : this._getSearchBrowseItems();
		}
		return filter.trim() ? this._getSearchItems(filter) : this._getBrowseItems();
	}

	private _getGroupLabel(model: IModelPickerPrototypeModel, source: IModelPickerPrototypeSource): string {
		if (source.groupBy !== 'capability') {
			return model.creator;
		}
		return getCategoryLabel(model.category) ?? otherCapabilityLabel;
	}

	private _sortGroups(groups: Map<string, readonly unknown[]>, grouping: ModelPickerPrototypeGrouping | undefined): readonly string[] {
		const keys = Array.from(groups.keys());
		if (grouping !== 'capability') {
			// Creators with a real mark lead, so the branded rows read as a block instead of
			// alternating with lettered placeholders. Order is otherwise preserved.
			return keys.sort((left, right) => Number(!brandedCreators.has(left)) - Number(!brandedCreators.has(right)));
		}
		const rank = (label: string) => {
			const index = capabilityOrder.findIndex(category => getCategoryLabel(category) === label);
			return index < 0 ? capabilityOrder.length : index;
		};
		return keys.sort((left, right) => rank(left) - rank(right));
	}

	private _getSearchBrowseItems(): readonly IActionListItem<IModelPickerPrototypeAction>[] {
		const groups = new Map<string, IModelPickerPrototypeSelection[]>();
		for (const source of this._getSearchSources()) {
			for (const model of source.models.filter(candidate => !candidate.isAuto)) {
				const entries = groups.get(model.creator) ?? [];
				entries.push({ model, source });
				groups.set(model.creator, entries);
			}
		}
		if (groups.size === 0) {
			return [this._createEmptyItem('No models available', 'Add a provider to get started.')];
		}
		return Array.from(groups).flatMap(([creator, entries]) => [
			this._createGroupItem(creator, 'creator', entries.length),
			...entries.map(({ model, source }) => this._createModelItem(model, source, true)),
		]);
	}

	private _getBrowseItems(): readonly IActionListItem<IModelPickerPrototypeAction>[] {
		if (this._activeSourceId === pinnedSourceId) {
			return this._getPinnedHubItems();
		}

		const source = this._getAvailableSources().find(candidate => candidate.id === this._activeSourceId);
		if (!source || source.models.length === 0) {
			return [this._createEmptyItem('No models available', 'Configure this source in Manage Models.')];
		}

		const grouping = source.groupBy ?? 'creator';
		// Auto lives in the mode bar now, so it never appears as a row.
		const listedModels = source.models.filter(model => !model.isAuto);
		const ungroupedModels = listedModels.filter(model => model.ungrouped);
		const groups = new Map<string, IModelPickerPrototypeModel[]>();
		for (const model of listedModels.filter(model => !model.ungrouped)) {
			const key = this._getGroupLabel(model, source);
			const models = groups.get(key) ?? [];
			models.push(model);
			groups.set(key, models);
		}

		const items: IActionListItem<IModelPickerPrototypeAction>[] = ungroupedModels.map(model => this._createModelItem(model, source, false));
		for (const groupLabel of this._sortGroups(groups, grouping)) {
			const models = groups.get(groupLabel) ?? [];
			const section = `${source.id}:${groupLabel}`;
			items.push(this._createGroupItem(groupLabel, grouping, models.length, section));
			items.push(...models.map(model => ({ ...this._createModelItem(model, source, false), section })));
		}
		// The tab names the provider; this names the account those models come through, so
		// two lists of the same models are told apart by how they are reached and billed.
		const account = this._getAccountLabel(source);
		if (account) {
			items.unshift(this._createAccountItem(account));
		}
		return items;
	}

	/** A provider is a subscription in its own harness and a key everywhere else. */
	private _getAccountLabel(source: IModelPickerPrototypeSource): string | undefined {
		return source.accountPerHarness?.[this._activeHarness] ?? source.account;
	}

	/** Auto is a Copilot-scoped mode, so it shows on that tab and on Home, once signed in. */
	private _getAutoModel(): IModelPickerPrototypeSelection | undefined {
		// Auto belongs to a provider, so it only appears on that provider's tab — the hub
		// is about what you have chosen, not about switching routing mode.
		if (this._activeSourceId === pinnedSourceId) {
			return undefined;
		}
		for (const source of this._getAvailableSources().filter(candidate => candidate.id === this._activeSourceId)) {
			if (source.requiresSetup) {
				continue;
			}
			const model = source.models.find(candidate => candidate.isAuto);
			if (model) {
				return { model, source };
			}
		}
		return undefined;
	}

	private _getSearchMatches(filter: string): readonly IModelPickerPrototypeSelection[] {
		const query = filter.trim().toLocaleLowerCase();
		return this._getSearchSources()
			.flatMap(source => source.models.filter(model => !model.isAuto).map(model => ({ model, source })))
			.filter(({ model, source }) =>
				model.label.toLocaleLowerCase().includes(query) ||
				model.creator.toLocaleLowerCase().includes(query) ||
				source.label.toLocaleLowerCase().includes(query))
			.sort((left, right) => this._getSearchRank(left, query) - this._getSearchRank(right, query) || left.model.label.localeCompare(right.model.label));
	}

	private _getSearchItems(filter: string): readonly IActionListItem<IModelPickerPrototypeAction>[] {
		const matches = this._getSearchMatches(filter);

		if (matches.length === 0) {
			return [this._createEmptyItem('No matching models', 'Try another model, creator, or source.')];
		}

		const groups = new Map<string, IModelPickerPrototypeSelection[]>();
		for (const match of matches) {
			const entries = groups.get(match.model.creator) ?? [];
			entries.push(match);
			groups.set(match.model.creator, entries);
		}
		return Array.from(groups).flatMap(([creator, entries]) => [
			this._createGroupItem(creator, 'creator', entries.length),
			...entries.map(({ model, source }) => this._createModelItem(model, source, true)),
		]);
	}

	private _getSearchRank(entry: IModelPickerPrototypeSelection, query: string): number {
		const model = entry.model.label.toLocaleLowerCase();
		const creator = entry.model.creator.toLocaleLowerCase();
		const source = entry.source.label.toLocaleLowerCase();
		if (model.startsWith(query)) {
			return 0;
		}
		if (model.includes(query)) {
			return 1;
		}
		if (creator.startsWith(query) || source.startsWith(query)) {
			return 2;
		}
		return 3;
	}

	private _getPinnedModels(): readonly IModelPickerPrototypeSelection[] {
		return this._getAvailableSources().flatMap(source =>
			source.models.filter(model => this._isPinned(model) && !model.isAuto).map(model => ({ model, source })))
			.slice(0, maxPinnedModels);
	}

	/** Each hub section is exclusive, so a model never appears twice. */
	private _getRecommendedModels(): readonly IModelPickerPrototypeSelection[] {
		// Recommendations come from Copilot, so there is nothing to suggest until it is
		// connected — an empty suggestion list would just be noise.
		const copilot = this._getAvailableSources().find(source => source.id === copilotSourceId);
		if (!copilot || copilot.requiresSetup) {
			return [];
		}
		const pinnedIds = new Set(this._getPinnedModels().map(({ model }) => model.id));
		return this._getAvailableSources().flatMap(source =>
			source.models
				.filter(model => model.recommended && !model.isAuto && !pinnedIds.has(model.id))
				.map(model => ({ model, source })));
	}

	/** Recently used, newest first. Excludes anything already shown above it. */
	private _getRecentModels(): readonly IModelPickerPrototypeSelection[] {
		const shown = new Set([
			...this._getPinnedModels().map(({ model }) => model.id),
			...this._getRecommendedModels().map(({ model }) => model.id),
		]);
		return this._getAvailableSources()
			.flatMap(source => source.models
				.filter(model => model.recentRank !== undefined && !model.isAuto && !shown.has(model.id))
				.map(model => ({ model, source })))
			.sort((left, right) => (left.model.recentRank ?? 0) - (right.model.recentRank ?? 0))
			.slice(0, maxRecentModels);
	}

	private _getPinnedHubItems(): readonly IActionListItem<IModelPickerPrototypeAction>[] {
		const items: IActionListItem<IModelPickerPrototypeAction>[] = [];
		// Every section behaves the same way: it exists only when it has something to show.
		// With all three empty the hub falls through to its centred empty panel.
		for (const [label, entries] of [
			['Pinned', this._getPinnedModels()],
			['Recommended', this._getRecommendedModels()],
			['Recent', this._getRecentModels()],
		] as const) {
			if (entries.length === 0) {
				continue;
			}
			items.push(this._createGroupItem(label, 'section', entries.length));
			items.push(...entries.map(({ model, source }) => this._createModelItem(model, source, true)));
		}
		return items;
	}

	private _getModifiedOptions(model: IModelPickerPrototypeModel): readonly IModelPickerPrototypeConfigurationOption[] {
		const values = this._configurationValues.get(model.id);
		if (!values || !model.configuration?.length) {
			return [];
		}
		const modified: IModelPickerPrototypeConfigurationOption[] = [];
		for (const section of model.configuration) {
			const value = values.get(section.id) ?? section.defaultValue;
			if (value === section.defaultValue) {
				continue;
			}
			const option = section.options.find(candidate => candidate.id === value);
			if (option) {
				modified.push(option);
			}
		}
		return modified;
	}

	/** Compact "what changed" summary so customized models stand out in the list. */
	private _getModifiedBadge(model: IModelPickerPrototypeModel): string | undefined {
		const modified = this._getModifiedOptions(model);
		return modified.length > 0
			? modified.map(option => option.shortLabel ?? option.label).join(' · ')
			: undefined;
	}

	private _createModelItem(
		model: IModelPickerPrototypeModel,
		source: IModelPickerPrototypeSource,
		showSource: boolean,
	): IActionListItem<IModelPickerPrototypeAction> {
		const gated = this._autoEnabled && !!this._getAutoModel();
		const checked = !gated && model.id === this._selectedModelId;
		const editing = model.id === this._configurationSelection?.model.id;
		const modifiedBadge = this._getModifiedBadge(model);
		const className = [
			editing
				? checked ? 'model-picker-prototype-editing-selected-model' : 'model-picker-prototype-editing-model'
				: showSource
					? checked ? 'model-picker-prototype-search-result-selected' : 'model-picker-prototype-search-result'
					: checked ? 'model-picker-prototype-selected-model' : '',
			modifiedBadge ? 'model-picker-prototype-modified-model' : '',
		].filter(Boolean).join(' ') || undefined;
		return {
			item: {
				id: model.id,
				enabled: true,
				checked,
				kind: 'model',
				run: () => {
					if (gated) {
						return;
					}
					this._selectModel(model, source);
				},
			},
			kind: ActionListItemKind.Action,
			label: model.label,
			badge: modifiedBadge ?? (showSource ? source.label : undefined),
			group: { title: '', icon: checked ? Codicon.check : Codicon.blank },
			hideIcon: false,
			className,
			showAlways: showSource || editing,
			toolbarActions: gated ? undefined : this._getRowActions(model, source, editing),
		};
	}

	/**
	 * Pin first, then settings — pinning changes where the model lives, so it reads as the
	 * more consequential of the two.
	 */
	private _getRowActions(
		model: IModelPickerPrototypeModel,
		source: IModelPickerPrototypeSource,
		editing: boolean,
	): IAction[] | undefined {
		const actions: IAction[] = [];
		if (!model.isAuto) {
			const pinned = this._isPinned(model);
			// Unpinning always works; pinning stops at the cap, and the action says why
			// rather than silently doing nothing.
			const atCapacity = !pinned && this._getPinnedModels().length >= maxPinnedModels;
			actions.push(toAction({
				id: `modelPickerPrototype.pin.${model.id}`,
				label: pinned
					? `Unpin ${model.label}`
					: atCapacity
						? `Can't pin ${model.label} — unpin one of your ${maxPinnedModels} first`
						: `Pin ${model.label}`,
				class: ThemeIcon.asClassName(pinned ? Codicon.pinned : Codicon.pin),
				enabled: !atCapacity,
				run: () => this._togglePinned(model),
			}));
		}
		if (model.configuration?.length) {
			actions.push(toAction({
				id: `modelPickerPrototype.configure.${model.id}`,
				label: editing ? `Hide settings for ${model.label}` : `Show settings for ${model.label}`,
				class: ThemeIcon.asClassName(editing ? Codicon.chevronLeft : Codicon.chevronRight),
				run: () => {
					if (editing) {
						this._hideConfiguration();
						return;
					}
					this._showConfiguration(model, source);
				},
			}));
		}
		return actions.length ? actions : undefined;
	}

	private _isPinned(model: IModelPickerPrototypeModel): boolean {
		return this._pinnedOverrides.get(model.id) ?? !!model.pinned;
	}

	private _togglePinned(model: IModelPickerPrototypeModel): void {
		const pinned = this._isPinned(model);
		if (!pinned && this._getPinnedModels().length >= maxPinnedModels) {
			status(`Pinned models are limited to ${maxPinnedModels}. Unpin one first.`);
			return;
		}
		this._pinnedOverrides.set(model.id, !pinned);
		status(pinned ? `${model.label} unpinned.` : `${model.label} pinned.`);
		// Unpinning the last one can empty the hub, which changes which surface shows.
		this._renderEmptyPanel();
		// The filter-event path does not reliably repaint rows, so drive the list directly.
		this._list.updateItems(this._getItems(this._list.filterInput?.value ?? ''));
	}

	private _selectModel(model: IModelPickerPrototypeModel, source: IModelPickerPrototypeSource): void {
		this._selectedModelId = model.id;
		this._lastExplicitModelId = model.id;
		// An explicit pick is an override, so it releases the Auto gate.
		if (this._autoEnabled) {
			this._autoEnabled = false;
			this._applyAutoGate();
			this._renderAutoBar();
		}
		this._hideConfiguration(false);
		this._list.updateItems(this._getItems(this._list.filterInput?.value ?? ''));
		this._onDidChangeSelection.fire({ model, source });
	}

	private _toggleAddMenu(): void {
		if (this._addMenu) {
			this._hideAddMenu();
			return;
		}

		this._addMenuDisposables.clear();
		const menu = $('.model-picker-prototype-add-menu');
		menu.setAttribute('role', 'menu');
		menu.setAttribute('aria-label', 'Model Options');
		const addProvider = $('button.model-picker-prototype-add-menu-item') as HTMLButtonElement;
		addProvider.type = 'button';
		addProvider.setAttribute('role', 'menuitem');
		addProvider.textContent = 'Add Model Provider';
		const manageModels = $('button.model-picker-prototype-add-menu-item') as HTMLButtonElement;
		manageModels.type = 'button';
		manageModels.setAttribute('role', 'menuitem');
		manageModels.textContent = 'Manage Models';
		menu.append(addProvider, manageModels);
		this.domNode.appendChild(menu);
		this._addMenu = menu;
		this._addProviderButton.element.setAttribute('aria-expanded', 'true');

		this._addMenuDisposables.add(addDisposableListener(addProvider, EventType.CLICK, () => {
			this._hideAddMenu(false);
			this._onDidRequestAddModelProvider.fire();
		}));
		this._addMenuDisposables.add(addDisposableListener(manageModels, EventType.CLICK, () => {
			this._hideAddMenu(false);
			this._onDidRequestManageModels.fire();
		}));
		this._addMenuDisposables.add(addDisposableListener(menu, EventType.KEY_DOWN, event => {
			if (event.key === 'Escape') {
				event.preventDefault();
				this._hideAddMenu();
				return;
			}
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				const buttons = [addProvider, manageModels];
				const activeIndex = buttons.indexOf(this.domNode.ownerDocument.activeElement as HTMLButtonElement);
				const direction = event.key === 'ArrowDown' ? 1 : -1;
				event.preventDefault();
				buttons[(activeIndex + direction + buttons.length) % buttons.length].focus();
			}
		}));
		addProvider.focus();
	}

	private _hideAddMenu(restoreFocus = true): void {
		this._addMenuDisposables.clear();
		this._addMenu?.remove();
		this._addMenu = undefined;
		this._addProviderButton.element.setAttribute('aria-expanded', 'false');
		if (restoreFocus) {
			this._addProviderButton.focus();
		}
	}

	private _createGroupItem(label: string, grouping: ModelPickerPrototypeGrouping | 'section', modelCount: number, section?: string): IActionListItem<IModelPickerPrototypeAction> {
		const slug = label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-');
		return {
			item: {
				id: `group.${this._activeSourceId}.${label}`,
				enabled: !!section,
				checked: false,
				kind: 'group',
				run: () => { },
			},
			kind: ActionListItemKind.Action,
			label,
			badge: modelCount === 1 ? '1 model' : `${modelCount} models`,
			group: { title: '', icon: section ? Codicon.chevronDown : Codicon.blank },
			hideIcon: true,
			disabled: !section,
			isSectionToggle: !!section,
			section,
			showAlways: true,
			// Every heading carries a mark in the gutter: hub sections name a purpose,
			// capability tiers a level, creators a brand.
			className: grouping === 'section'
				? `model-picker-prototype-group model-picker-prototype-section-${slug}`
				: grouping === 'capability'
					? `model-picker-prototype-group model-picker-prototype-tier-${slug}`
					: `model-picker-prototype-group model-picker-prototype-creator-${slug}`,
		};
	}
	private _showConfiguration(model: IModelPickerPrototypeModel, source: IModelPickerPrototypeSource): void {
		this._configurationTrigger = undefined;
		this._configurationSelection = { model, source };
		if (!this._configurationValues.has(model.id)) {
			this._configurationValues.set(model.id, new Map(model.configuration?.map(section => [section.id, section.defaultValue])));
		}
		this.domNode.classList.add('configuration-visible');
		this._list.updateItems(this._getItems(this._list.filterInput?.value ?? ''));
		this._renderConfiguration();
	}

	private _hideConfiguration(restoreFocus = true): void {
		if (!this._configurationSelection) {
			return;
		}
		const configurationModelId = this._configurationSelection?.model.id;
		this._configurationSelection = undefined;
		this._configurationDisposables.clear();
		reset(this._configurationPane);
		this.domNode.classList.remove('configuration-visible');
		if (configurationModelId) {
			this._list.updateItems(this._getItems(this._list.filterInput?.value ?? ''));
		}
		if (restoreFocus && configurationModelId) {
			this._list.focusItemById(configurationModelId);
		} else if (restoreFocus && this._configurationTrigger?.isConnected) {
			this._configurationTrigger.focus();
		}
		this._configurationTrigger = undefined;
	}

	private _renderConfiguration(focusSectionId?: string, focusOptionId?: string): void {
		const selection = this._configurationSelection;
		if (!selection) {
			return;
		}

		this._configurationDisposables.clear();
		reset(this._configurationPane);
		this._configurationPane.setAttribute('aria-label', `Configure ${selection.model.label}`);

		const header = $('.model-picker-prototype-configuration-header');
		const titleRow = $('.model-picker-prototype-configuration-title-row');
		const title = $('h2.model-picker-prototype-configuration-title');
		title.textContent = selection.model.label;
		titleRow.appendChild(title);
		// The tier already leads its group in the list, so the title stays a title.
		// Reset is quiet at rest — it only appears once there is something to undo.
		if (this._getModifiedOptions(selection.model).length > 0) {
			const resetButton = this._configurationDisposables.add(new Button(titleRow, {
				ariaLabel: 'Reset to Default',
				supportIcons: true,
				title: 'Reset to Default',
			}));
			resetButton.element.classList.add('model-picker-prototype-configuration-reset');
			resetButton.label = `$(${Codicon.discard.id})`;
			this._configurationDisposables.add(resetButton.onDidClick(() => this._resetConfiguration()));
		}
		const closeButton = this._configurationDisposables.add(new Button(titleRow, {
			ariaLabel: 'Hide Model Settings',
			supportIcons: true,
			title: 'Hide Model Settings',
		}));
		closeButton.element.classList.add('model-picker-prototype-configuration-close');
		closeButton.label = `$(${Codicon.chevronLeft.id})`;
		this._configurationDisposables.add(closeButton.onDidClick(() => this._hideConfiguration()));
		header.appendChild(titleRow);
		this._configurationPane.appendChild(header);

		const content = $('.model-picker-prototype-configuration-content');
		const values = this._configurationValues.get(selection.model.id);
		if (selection.model.configuration?.length && values) {
			for (const section of selection.model.configuration) {
				const sectionNode = $('section.model-picker-prototype-configuration-section');
				const sectionTitle = $('h3.model-picker-prototype-configuration-section-title');
				sectionTitle.textContent = section.label;
				const selectedOption = section.options.find(option => option.id === values.get(section.id));
				const sectionDescription = $('.model-picker-prototype-configuration-section-description');
				sectionDescription.textContent = selectedOption?.description ?? '';
				sectionDescription.title = selectedOption?.description ?? '';
				sectionNode.append(sectionTitle, sectionDescription);
				const options = this._renderRadioGroup(
					section,
					values.get(section.id),
					this._configurationDisposables,
					{
						groupClass: 'model-picker-prototype-configuration-options',
						optionClass: 'model-picker-prototype-configuration-option',
						indicator: true,
					},
					optionId => this._setConfigurationValue(section.id, optionId),
				);

				sectionNode.appendChild(options);
				content.appendChild(sectionNode);
			}
		} else {
			const empty = $('.model-picker-prototype-configuration-empty');
			empty.textContent = 'This model has no configurable options.';
			content.appendChild(empty);
		}
		this._configurationPane.appendChild(content);

		const footer = $('.model-picker-prototype-configuration-footer');
		footer.setAttribute('aria-live', 'polite');
		this._renderCreditFooter(footer, selection.model, values);
		this._configurationPane.appendChild(footer);

		if (focusSectionId && focusOptionId) {
			Array.from(this._configurationPane.querySelectorAll<HTMLButtonElement>('.model-picker-prototype-configuration-option'))
				.find(button => button.dataset.sectionId === focusSectionId && button.dataset.optionId === focusOptionId)
				?.focus();
		}
	}

	/**
	 * Radio behaviour shared by the configuration card's stacked options and the Auto bar's
	 * segmented control: semantics, roving tabIndex and arrow-key wrap-around. Only the
	 * per-option markup differs between the two presentations, so the interaction can never
	 * drift between them.
	 */
	private _renderRadioGroup(
		section: IModelPickerPrototypeConfigurationSection,
		checkedOptionId: string | undefined,
		disposables: DisposableStore,
		presentation: { readonly groupClass: string; readonly optionClass: string; readonly indicator: boolean },
		onSelect: (optionId: string) => void,
	): HTMLElement {
		const group = $(`.${presentation.groupClass}`);
		group.setAttribute('role', 'radiogroup');
		group.setAttribute('aria-label', section.label);

		for (const option of section.options) {
			const checked = checkedOptionId === option.id;
			const optionButton = $(`button.${presentation.optionClass}`) as HTMLButtonElement;
			optionButton.type = 'button';
			optionButton.tabIndex = checked ? 0 : -1;
			optionButton.dataset.sectionId = section.id;
			optionButton.dataset.optionId = option.id;
			optionButton.setAttribute('role', 'radio');
			optionButton.setAttribute('aria-checked', String(checked));
			optionButton.setAttribute('aria-label', `${option.label}: ${option.description}`);
			optionButton.title = option.description;
			optionButton.classList.toggle('checked', checked);
			if (presentation.indicator) {
				const optionIndicator = $('.model-picker-prototype-configuration-option-indicator');
				optionIndicator.setAttribute('aria-hidden', 'true');
				if (checked) {
					optionIndicator.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
				}
				optionButton.appendChild(optionIndicator);
			}
			const optionLabel = $('.model-picker-prototype-configuration-option-label');
			optionLabel.textContent = option.label;
			// Lets the chosen weight's width be reserved in CSS, so choosing an option
			// never re-flows a row of them.
			optionLabel.dataset.label = option.label;
			optionButton.appendChild(optionLabel);
			disposables.add(addDisposableListener(optionButton, EventType.CLICK, () => onSelect(option.id)));
			group.appendChild(optionButton);
		}

		disposables.add(addDisposableListener(group, EventType.KEY_DOWN, event => {
			const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown'
				? 1
				: event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
			if (!direction) {
				return;
			}
			// Read the current selection from the DOM rather than closing over it, so the
			// handler stays correct for presentations that update in place.
			const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>(`.${presentation.optionClass}`));
			const activeIndex = buttons.findIndex(button => button.classList.contains('checked'));
			const next = buttons[(activeIndex + direction + buttons.length) % buttons.length];
			if (!next?.dataset.optionId) {
				return;
			}
			event.preventDefault();
			onSelect(next.dataset.optionId);
		}));

		return group;
	}

	private _setConfigurationValue(sectionId: string, optionId: string): void {
		const modelId = this._configurationSelection?.model.id;
		if (!modelId) {
			return;
		}
		this._configurationValues.get(modelId)?.set(sectionId, optionId);
		this._list.updateItems(this._getItems(this._list.filterInput?.value ?? ''));
		this._renderConfiguration(sectionId, optionId);
	}

	private _resetConfiguration(): void {
		const model = this._configurationSelection?.model;
		if (!model?.configuration?.length) {
			return;
		}
		this._configurationValues.set(model.id, new Map(model.configuration.map(section => [section.id, section.defaultValue])));
		this._list.updateItems(this._getItems(this._list.filterInput?.value ?? ''));
		this._renderConfiguration();
	}

	private _renderCreditFooter(container: HTMLElement, model: IModelPickerPrototypeModel, values: ReadonlyMap<string, string> | undefined): void {
		const longContext = this._usesLongContext(model, values) && !!model.creditCosts?.longContext;
		const heading = $('.model-picker-prototype-credit-heading');
		// The rates below already reflect the selected context tier, so the heading
		// doesn't need to restate it.
		heading.textContent = creditHeadingLabel;
		const headingRow = $('.model-picker-prototype-credit-heading-row');
		headingRow.appendChild(heading);
		const priceCategoryLabel = getPriceCategoryLabel(model.priceCategory);
		if (priceCategoryLabel) {
			const costNode = $('.model-picker-prototype-credit-tag');
			costNode.classList.toggle('high-cost', isHighCostCategory(model.priceCategory));
			costNode.textContent = priceCategoryLabel;
			headingRow.appendChild(costNode);
		}
		container.appendChild(headingRow);

		const costs = model.creditCosts;
		if (!costs) {
			const unavailable = $('.model-picker-prototype-credit-note');
			unavailable.textContent = 'Rates unavailable';
			container.appendChild(unavailable);
			return;
		}

		const rates = longContext && costs.longContext ? costs.longContext : costs.default;

		// Full arrows for live tokens; at the compact size they balance against the
		// circled cache glyphs without reading oversized.
		const table = $('.model-picker-prototype-credit-table');
		for (const [label, value, icon] of [
			['Input', rates.input, Codicon.arrowDown],
			['Output', rates.output, Codicon.arrowUp],
			['Cache Read', rates.cacheRead, Codicon.arrowCircleDown],
			['Cache Write', rates.cacheWrite, Codicon.arrowCircleUp],
		] as const) {
			const display = value === undefined || value === null ? '—' : String(value);
			const description = `${label} · ${display} credits per 1M tokens`;
			const cell = $('.model-picker-prototype-credit-cell');
			cell.setAttribute('aria-label', description);
			cell.dataset.rateLabel = label;
			// `title` as well as the managed hover: the fixture stubs IHoverService,
			// so without it the prototype can't explain the glyphs during review.
			cell.title = description;
			this._configurationDisposables.add(this._hoverService.setupManagedHover(
				getDefaultHoverDelegate('element'), cell, description));
			const cellIcon = $('span.model-picker-prototype-credit-icon');
			cellIcon.className = `model-picker-prototype-credit-icon ${ThemeIcon.asClassName(icon)}`;
			cellIcon.setAttribute('aria-hidden', 'true');
			const cellValue = $('span.model-picker-prototype-credit-value');
			cellValue.textContent = display;
			cellValue.setAttribute('aria-hidden', 'true');
			cell.append(cellIcon, cellValue);
			table.appendChild(cell);
		}

		// Four unlabelled glyphs are a rebus, and a tooltip is a slow way to read one. The
		// heading already labels the numbers beneath it, so pointing at a rate makes it name
		// that rate — detail on demand, with no room reserved for it.
		//
		// Delegated to the row rather than each cell: per-cell leave/enter pairs fire in that
		// order, so crossing from one rate to the next flashed the default heading in between.
		let hoveredCell: HTMLElement | undefined;
		const setHoveredCell = (cell: HTMLElement | undefined) => {
			if (cell === hoveredCell) {
				return;
			}
			hoveredCell?.classList.remove('hovered');
			hoveredCell = cell;
			hoveredCell?.classList.add('hovered');
			heading.textContent = cell?.dataset.rateLabel ?? creditHeadingLabel;
		};
		this._configurationDisposables.add(addDisposableListener(table, EventType.MOUSE_OVER, event => {
			const target = event.target as HTMLElement | null;
			const cell = target?.closest<HTMLElement>('.model-picker-prototype-credit-cell');
			// The gaps between cells belong to the row, so crossing one must not clear the
			// label — only actually leaving the row does.
			if (cell) {
				setHoveredCell(cell);
			}
		}));
		this._configurationDisposables.add(addDisposableListener(table, EventType.MOUSE_LEAVE, () => setHoveredCell(undefined)));
		container.appendChild(table);
	}

	private _usesLongContext(model: IModelPickerPrototypeModel, values: ReadonlyMap<string, string> | undefined): boolean {
		return !!model.configuration?.some(section => {
			const selectedValue = values?.get(section.id) ?? section.defaultValue;
			return section.options.find(option => option.id === selectedValue)?.usesLongContext;
		});
	}

	/** Signed-out empty state: one clear call to action rather than a list row. */
	/**
	 * The one centred panel the picker shows whenever the well has nothing to list:
	 * a source needing sign-in, an empty hub, or search with no query or no matches.
	 * The `setup-*` class names describe that shared treatment.
	 */
	private _renderEmptyPanel(): void {
		this._setupDisposables.clear();
		reset(this._setupNode);
		const source = this._getTabs().find(candidate => candidate.id === this._activeSourceId);
		const needsSetup = !this._searchMode && !!source?.requiresSetup;
		this.domNode.classList.toggle('setup-required', needsSetup);

		const query = this._list.filterInput?.value.trim() ?? '';
		const searchIdle = this._searchMode && !query;
		// A search with no hits still returns one placeholder row, so count real models.
		const searchEmpty = this._searchMode
			&& !!query
			&& this._getSearchItems(query).every(item => item.item?.kind !== 'model');
		// With nothing pinned, recent or recommended there is no list to head, so the hub
		// gets the same centred treatment rather than a lone heading over blank space.
		const hubEmpty = !needsSetup
			&& !this._searchMode
			&& this._activeSourceId === pinnedSourceId
			&& this._getPinnedModels().length === 0
			&& this._getRecommendedModels().length === 0
			&& this._getRecentModels().length === 0;
		this.domNode.classList.toggle('hub-empty', hubEmpty || searchIdle || searchEmpty);
		if (!needsSetup && !hubEmpty && !searchIdle && !searchEmpty) {
			return;
		}

		const panel = $('.model-picker-prototype-setup-panel');
		const icon = $('.model-picker-prototype-setup-icon');
		icon.setAttribute('aria-hidden', 'true');
		const title = $('h2.model-picker-prototype-setup-title');
		const detail = $('.model-picker-prototype-setup-detail');

		if (searchIdle || searchEmpty) {
			icon.classList.add(...ThemeIcon.asClassNameArray(searchEmpty ? Codicon.searchStop : Codicon.search));
			title.textContent = searchEmpty ? 'No matches' : 'Search every model';
			detail.textContent = searchEmpty
				? 'Try another name, creator, or provider.'
				: 'Look across every provider by name, creator, or provider.';
			panel.append(icon, title, detail);
			this._setupNode.appendChild(panel);
			return;
		}

		if (hubEmpty) {
			icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.pin));
			title.textContent = 'Nothing here yet';
			detail.textContent = 'Pick a model from a provider tab, then pin it to keep it here.';
			panel.append(icon, title, detail);
			this._setupNode.appendChild(panel);
			return;
		}

		icon.classList.add(...ThemeIcon.asClassNameArray(source!.icon));
		if (source!.iconClass) {
			icon.classList.add(source!.iconClass);
		}
		title.textContent = source!.signInLabel?.replace(/^Sign in to use /, '') ?? source!.label;
		detail.textContent = 'Sign in to see available models.';
		panel.append(icon, title, detail);

		// The icon and title already name the provider, so the button only has to say what
		// it does. The full phrasing stays as the accessible name, where context is lost.
		const label = source!.signInLabel ?? `Sign in to use ${source!.label}`;
		const signIn = this._setupDisposables.add(new Button(panel, {
			ariaLabel: label,
			title: label,
			supportIcons: true,
		}));
		signIn.element.classList.add('model-picker-prototype-setup-button');
		signIn.label = 'Sign in';
		this._setupDisposables.add(signIn.onDidClick(() => this._onDidRequestSetup.fire(source!.id)));
		this._setupNode.appendChild(panel);
	}

	/** Auto is a mode over the models: a switch, not a row in the list. */
	private _renderAutoBar(): void {
		this._autoDisposables.clear();
		this._autoRoutingDisposables.clear();
		reset(this._autoBarNode);
		this._autoToggleNode = undefined;
		this._autoRoutingNode = undefined;
		this._autoDetailNode = undefined;
		const auto = this._getAutoModel();
		const visible = !!auto && !this._searchMode;
		this.domNode.classList.toggle('auto-available', visible);
		if (!auto || !visible) {
			this.domNode.classList.remove('auto-enabled');
			return;
		}

		// Set before any collapsing node is built: a freshly inserted element has no previous
		// computed value, so it lands at its final size instead of transitioning into it.
		this.domNode.classList.toggle('auto-enabled', this._autoEnabled);

		const row = $('.model-picker-prototype-auto-row');
		const heading = $('.model-picker-prototype-auto-heading');
		const title = $('.model-picker-prototype-auto-title');
		title.textContent = auto.model.label;
		// Off, the bar is a single line, so the discount rides along with the title rather
		// than costing a caption row of its own.
		const titleNote = $('.model-picker-prototype-auto-title-note');
		titleNote.textContent = '· 10% off';
		heading.append(title, titleNote);
		row.appendChild(heading);

		// Tiers and switch share one track, so the whole mode reads as a single control.
		// The switch leads and the tiers follow it, so turning Auto on carries the switch
		// left and fills the space it opens, left to right.
		const control = $('.model-picker-prototype-auto-control');
		const toggle = $('button.model-picker-prototype-auto-toggle') as HTMLButtonElement;
		toggle.type = 'button';
		toggle.setAttribute('role', 'switch');
		toggle.setAttribute('aria-label', auto.model.label);
		const track = $('.model-picker-prototype-auto-track');
		track.setAttribute('aria-hidden', 'true');
		track.appendChild($('.model-picker-prototype-auto-thumb'));
		toggle.appendChild(track);
		this._autoDisposables.add(addDisposableListener(toggle, EventType.CLICK, () => this._setAutoEnabled(!this._autoEnabled)));
		this._autoToggleNode = toggle;
		control.appendChild(toggle);

		if (auto.model.configuration?.length) {
			const routing = $('.model-picker-prototype-auto-routing');
			const routingInner = $('.model-picker-prototype-auto-routing-inner');
			routing.appendChild(routingInner);
			this._autoRoutingNode = routing;
			control.appendChild(routing);
		}

		row.appendChild(control);

		// The caption only describes the chosen tier, so it collapses along with them.
		const detailClip = $('.model-picker-prototype-auto-detail-clip');
		const detailInner = $('.model-picker-prototype-auto-detail-inner');
		this._autoDetailNode = $('.model-picker-prototype-auto-detail');
		detailInner.appendChild(this._autoDetailNode);
		detailClip.appendChild(detailInner);

		this._autoBarNode.append(row, detailClip);
		this._renderAutoRouting();
		this._updateAutoBarState();
	}

	/**
	 * Syncs the bar's mutable state. Called at the end of a build (where the nodes are
	 * new, so nothing animates) and directly on toggle (where they are not, so it does).
	 */
	private _updateAutoBarState(): void {
		const enabled = this._autoEnabled && this.domNode.classList.contains('auto-available');
		this.domNode.classList.toggle('auto-enabled', enabled);
		this._autoToggleNode?.setAttribute('aria-checked', String(enabled));
		// A collapsed grid track is still focusable, so it has to leave the tree entirely.
		this._autoRoutingNode?.toggleAttribute('inert', !enabled);
		this._autoRoutingNode?.setAttribute('aria-hidden', String(!enabled));
		this._updateRoutingChecked();
		this._updateAutoDetail();
	}

	/** The caption names what the chosen tier does; the discount is always true. */
	private _updateAutoDetail(): void {
		const auto = this._getAutoModel();
		const section = auto?.model.configuration?.[0];
		if (!this._autoDetailNode || !auto || !section) {
			return;
		}
		const selected = section.options.find(option => option.id === this._configurationValues.get(auto.model.id)?.get(section.id));
		this._autoDetailNode.textContent = `${selected?.description ?? section.description} · 10% off`;
		this._autoDetailNode.title = 'Auto routes your request through a pool of supported Copilot models based on your task and real-time system health and model performance. Auto requests are discounted 10%.';
	}

	private _renderAutoRouting(): void {
		const container = this._autoRoutingNode?.firstElementChild as HTMLElement | null;
		const auto = this._getAutoModel();
		const section = auto?.model.configuration?.[0];
		if (!container || !auto || !section) {
			return;
		}
		this._autoRoutingDisposables.clear();
		reset(container);
		if (!this._configurationValues.has(auto.model.id)) {
			this._configurationValues.set(auto.model.id, new Map(auto.model.configuration?.map(entry => [entry.id, entry.defaultValue])));
		}
		const values = this._configurationValues.get(auto.model.id);
		container.appendChild(this._renderRadioGroup(
			section,
			values?.get(section.id),
			this._autoRoutingDisposables,
			{
				groupClass: 'model-picker-prototype-auto-segments',
				optionClass: 'model-picker-prototype-auto-segment',
				// No check here: the tiers sit on one line beside the switch, and a mark that
				// only the chosen one carries either widens the row past the title or has to
				// be reserved on all three. The fill and the weight already say "chosen".
				indicator: false,
			},
			optionId => this._setAutoRoutingValue(section.id, optionId),
		));
	}

	/**
	 * Repaints the selection in place. Rebuilding would restart the reveal and drop the
	 * focus the keyboard depends on.
	 */
	private _updateRoutingChecked(): void {
		const group = this._autoRoutingNode?.querySelector('.model-picker-prototype-auto-segments');
		const auto = this._getAutoModel();
		const section = auto?.model.configuration?.[0];
		if (!group || !auto || !section) {
			return;
		}
		const checkedId = this._configurationValues.get(auto.model.id)?.get(section.id);
		for (const button of group.querySelectorAll<HTMLButtonElement>('.model-picker-prototype-auto-segment')) {
			const checked = button.dataset.optionId === checkedId;
			button.classList.toggle('checked', checked);
			button.setAttribute('aria-checked', String(checked));
			button.tabIndex = checked ? 0 : -1;
			const indicator = button.querySelector('.model-picker-prototype-configuration-option-indicator');
			for (const className of ThemeIcon.asClassNameArray(Codicon.check)) {
				indicator?.classList.toggle(className, checked);
			}
		}
	}

	private _setAutoRoutingValue(sectionId: string, optionId: string): void {
		const auto = this._getAutoModel();
		if (!auto) {
			return;
		}
		this._configurationValues.get(auto.model.id)?.set(sectionId, optionId);
		this._updateRoutingChecked();
		this._updateAutoDetail();
		// Focus follows the selection so arrow keys keep working; the radio's own
		// checked state is what gets announced, so there is no extra live message.
		this._autoRoutingNode
			?.querySelector<HTMLButtonElement>(`.model-picker-prototype-auto-segment[data-option-id="${optionId}"]`)
			?.focus();
	}

	private _setAutoEnabled(enabled: boolean): void {
		if (enabled === this._autoEnabled) {
			return;
		}
		this._autoEnabled = enabled;
		if (enabled) {
			// Park the explicit pick rather than discarding it.
			this._lastExplicitModelId = this._selectedModelId ?? this._lastExplicitModelId;
			this._selectedModelId = undefined;
			this._hideConfiguration(false);
		} else {
			this._selectedModelId = this._lastExplicitModelId;
			this._hideConfiguration(false);
		}
		this._applyAutoGate();
		this._resetAutoRouting();
		// Mutate in place rather than rebuilding, so the routing panel can transition.
		this._updateAutoBarState();
		this._list.updateItems(this._getItems(this._list.filterInput?.value ?? ''));
		const auto = this._getAutoModel();
		if (auto) {
			status(enabled
				? `${auto.model.label} on. Model list disabled.`
				: `${auto.model.label} off. Model list enabled.`);
		}
		if (enabled) {
			this._onDidChangeAutoEnabled.fire(true);
		} else {
			this._onDidChangeAutoEnabled.fire(false);
		}
	}

	/**
	 * Routing is not remembered across toggles: turning Auto on is a fresh decision, so it
	 * always starts from the default tier rather than resuming an earlier session's pick.
	 */
	private _resetAutoRouting(): void {
		const auto = this._getAutoModel();
		const section = auto?.model.configuration?.[0];
		if (!auto || !section) {
			return;
		}
		this._configurationValues.get(auto.model.id)?.set(section.id, section.defaultValue);
	}

	/** The gate: the list stays visible but inert while Auto is in charge. */
	private _applyAutoGate(): void {
		const gated = this._autoEnabled && !!this._getAutoModel();
		this._list.domNode.classList.toggle('auto-gated', gated);
		this._list.domNode.setAttribute('aria-disabled', String(gated));
	}

	/** Names the account the list arrives through. Quiet by design: context, not a choice. */
	private _createAccountItem(label: string): IActionListItem<IModelPickerPrototypeAction> {
		return {
			item: { id: `account.${this._activeSourceId}`, enabled: false, checked: false, kind: 'account', run: () => { } },
			kind: ActionListItemKind.Action,
			label,
			group: { title: '', icon: Codicon.blank },
			hideIcon: true,
			disabled: true,
			showAlways: true,
			className: 'model-picker-prototype-account-row',
		};
	}

	private _createEmptyItem(label: string, detail: string): IActionListItem<IModelPickerPrototypeAction> {
		return {
			item: { id: `empty.${this._activeSourceId}`, enabled: false, checked: false, kind: 'empty', run: () => { } },
			kind: ActionListItemKind.Action,
			label,
			detail,
			group: { title: '', icon: Codicon.blank },
			disabled: true,
			hideIcon: false,
			showAlways: true,
			className: 'model-picker-prototype-empty-row',
		};
	}
}
