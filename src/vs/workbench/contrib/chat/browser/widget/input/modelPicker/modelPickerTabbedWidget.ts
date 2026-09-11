/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../../../../base/common/collections.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable, MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { ActionListItemKind, IActionListHeaderLink, IActionListItem } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetDropdownAction } from '../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ITabBarAction, ITabDescriptor, TabbedActionListWidget } from '../../../../../../../platform/actionWidget/browser/tabbedActionListWidget.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import { StateType } from '../../../../../../../platform/update/common/update.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IChatEntitlementService } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, IModelControlEntry } from '../../../../common/languageModels.js';
import { withChatInputPickerMotion } from '../chatInputPickerActionItem.js';
import { IModelConfigurationAccess } from './modelPickerModelConfig.js';
import { ModelPickerAutoRow } from './modelPickerAutoRow.js';
import { IModelCardOptions, IPricingDisclosure, ModelCard } from './modelPickerCard.js';
import { getPreferredSpeedVariant, IModelSpeedVariants } from './modelPickerVariants.js';
import { getModelBadge } from './modelPickerBadges.js';
import { createModelAction, createUnavailableModelItem, getUnavailableReason } from './modelPickerItemPrimitives.js';
import { getModelPickerAccessibilityProvider } from './modelPickerItems.js';
import { isAutoModel } from './modelPickerPresentation.js';
import { buildModelPickerDestinations, buildModelPickerSections, getModelProviderLabel, hasPromotedModels, IModelPickerDestination, IModelPickerProviderPlaceholder, IModelPickerSections, IModelPickerUnavailableEntry, MODEL_PICKER_BUILT_IN_DESTINATION } from './modelPickerTabs.js';
import { ModelPickerWelcome } from './modelPickerWelcome.js';

/** The collapsible section holding models that are neither pinned, recommended nor recent. */
const OTHER_MODELS_SECTION = 'other';
const PICKER_WIDTH = 320;
const PRICING_EXPANDED_STORAGE_KEY = 'chat.modelPicker.pricingExpanded';

/** Everything the picker needs for one showing, gathered by the owning widget. */
export interface ITabbedModelPickerContext {
	readonly models: readonly ILanguageModelChatMetadataAndIdentifier[];
	readonly selectedModelId: string | undefined;
	readonly recentModelIds: readonly string[];
	readonly pinnedModelIds: readonly string[];
	readonly controlModels: IStringDictionary<IModelControlEntry>;
	readonly configurationAccess: IModelConfigurationAccess;
	/** Whether the account is billed by credits, which is when cost numbers are shown. */
	readonly isUBB: boolean;
	readonly showManageModels: boolean;
	/**
	 * What it takes to unlock a curated model the user cannot select yet, used to
	 * offer the upgrade, admin or update path instead of simply omitting the model.
	 */
	readonly unavailableContext: {
		readonly show: boolean;
		readonly currentVSCodeVersion: string;
		readonly manageSettingsUrl: string | undefined;
		readonly updateStateType: StateType;
	};
	/** Reports a click on an upgrade or contact-admin link in an unavailable model row. */
	readonly onUnavailableLinkClick: (uri: URI) => void;
	/** Providers the user can add models from but has none from yet, e.g. one that needs signing in. */
	readonly providerPlaceholders: readonly IModelPickerProviderPlaceholder[];
	readonly onSelect: (model: ILanguageModelChatMetadataAndIdentifier) => void;
	readonly onTogglePin: ((modelIdentifier: string, pinned: boolean) => void) | undefined;
	readonly onManageModels: () => void;
	readonly onDidToggleOtherModels: (collapsed: boolean) => void;
	/** Reports a configuration change made from the Auto row or a model's detail card. */
	readonly onConfigurationChanged: (model: ILanguageModelChatMetadataAndIdentifier, group: string, key: string, fromValue: unknown, toValue: unknown) => void;
	/** Warning banner shown when switching options mid-session would reset the prompt cache. */
	readonly cacheBreakHint: { readonly text: string; readonly link: IActionListHeaderLink | undefined; readonly dismiss: () => void } | undefined;
}

/**
 * A provider-tabbed model picker with a detail card beside the hovered model and an
 * Auto row pinned below. With only the built-in provider there is no tab bar.
 */
export class TabbedModelPicker extends Disposable {

	private readonly _onDidHide = this._register(new Emitter<void>());
	readonly onDidHide = this._onDidHide.event;

	private readonly _widget: TabbedActionListWidget;
	private readonly _cards = this._register(new DisposableMap<string, ModelCard>());
	private readonly _autoRow = this._register(new MutableDisposable<ModelPickerAutoRow>());
	private readonly _onDidChangePricingDisclosure = this._register(new Emitter<void>());
	/** Shared by every card, and remembered, so the breakdown is opened once rather than per model. */
	private readonly _pricingDisclosure: IPricingDisclosure = {
		isExpanded: () => this._storageService.getBoolean(PRICING_EXPANDED_STORAGE_KEY, StorageScope.APPLICATION, false),
		setExpanded: expanded => {
			this._storageService.store(PRICING_EXPANDED_STORAGE_KEY, expanded, StorageScope.APPLICATION, StorageTarget.USER);
			this._onDidChangePricingDisclosure.fire();
		},
		onDidChange: this._onDidChangePricingDisclosure.event,
	};

	private _context: ITabbedModelPickerContext | undefined;
	private _anchor: HTMLElement | undefined;
	private _activeDestination: string | undefined;
	private _searchVisible = false;
	private readonly _speedVariants = new Map<string, IModelSpeedVariants>();
	private readonly _preferredSpeedVariants = new Map<string, string>();
	private _selectionVersion = 0;
	/** The model to fall back to when Auto is switched off. */
	private _lastExplicitModelId: string | undefined;

	get isVisible(): boolean {
		return this._widget.isVisible;
	}

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatEntitlementService private readonly _entitlementService: IChatEntitlementService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._widget = this._register(instantiationService.createInstance(TabbedActionListWidget));
		this._register(this._widget.onDidChangeTab(id => { this._activeDestination = id; }));
		this._register(this._widget.onDidHide(() => {
			// Search is a transient view. Left on, it would also size the next popup from
			// its flattened cross-provider list.
			this._searchVisible = false;
			this._cards.clearAndDisposeAll();
			this._onDidHide.fire();
		}));
	}

	hide(): void {
		this._widget.hide();
	}

	show(anchor: HTMLElement, context: ITabbedModelPickerContext): void {
		if (!this._widget.isVisible) {
			this._activeDestination = undefined;
		}
		this._anchor = anchor;
		this._context = context;
		if (context.selectedModelId && !this._isAutoSelected(context)) {
			this._lastExplicitModelId = context.selectedModelId;
		}
		this._showCurrent();
	}

	private _showCurrent(initialFilterValue?: string): void {
		const context = this._context;
		const anchor = this._anchor;
		if (!context || !anchor) {
			return;
		}

		this._speedVariants.clear();
		this._cards.clearAndDisposeAll();
		const destinations = this._buildDestinations(context);
		if (!destinations.length) {
			return;
		}
		if (!this._activeDestination || !destinations.some(destination => destination.id === this._activeDestination)) {
			this._activeDestination = this._destinationForSelectedModel(destinations, context) ?? destinations[0].id;
		}

		const autoModel = context.models.find(isAutoModel);
		this._widget.show<IActionWidgetDropdownAction>({
			user: 'ChatTabbedModelPicker',
			anchor,
			tabs: destinations.map((destination): ITabDescriptor => ({ id: destination.id, label: destination.label, icon: destination.icon, tooltip: destination.label })),
			initialTab: this._activeDestination,
			// The built-in provider fixes the popup's height.
			sizingTab: MODEL_PICKER_BUILT_IN_DESTINATION,
			showCheckedItemHover: !this._isAutoSelected(context),
			tabBarActions: this._buildTabBarActions(context),
			tabBarClassName: 'chat-model-picker-tabbar',
			// Recomputed on every render so a tab switch reflects the current Auto state.
			widgetClassNames: () => [
				'chat-model-picker-widget',
				...(this._isAutoSelected(this._context ?? context) ? ['auto-enabled'] : []),
				...(this._searchVisible ? ['search-mode'] : []),
			],
			tabLabels: 'active',
			filterInTabBar: true,
			width: PICKER_WIDTH,
			createActionList: (activeTab, forSizing) => {
				const current = this._context ?? context;
				const currentDestinations = this._buildDestinations(current);
				const destination = currentDestinations.find(candidate => candidate.id === activeTab) ?? currentDestinations[0];
				const sections = this._buildSections(destination, current);
				// Search spans every destination at once, so each model names its provider.
				const searching = this._searchVisible && !forSizing;
				const items = searching
					? currentDestinations.flatMap(candidate => this._buildSearchItems(candidate, candidate === destination ? sections : this._buildSections(candidate, current), current))
					: this._buildItems(destination, sections, current);
				return {
					items,
					listOptions: withChatInputPickerMotion({
						className: 'chat-model-picker-dropdown chat-model-picker-tabbed',
						persistentHover: true,
						showFilter: searching,
						filterPlaceholder: localize('chat.modelPicker.search', "Search models"),
						focusFilterOnOpen: searching,
						initialFilterValue,
						filterAsCombobox: true,
						onType: text => {
							this._searchVisible = true;
							this._showCurrent(text);
						},
						headerText: current.cacheBreakHint?.text,
						headerIcon: current.cacheBreakHint ? Codicon.info : undefined,
						headerLink: current.cacheBreakHint?.link,
						headerDismiss: current.cacheBreakHint?.dismiss,
						// A tab with nothing promoted would open on an empty list, so leave it expanded.
						collapsedByDefault: hasPromotedModels(sections) ? new Set([OTHER_MODELS_SECTION]) : undefined,
						onDidToggleSection: (section, collapsed) => {
							if (section === OTHER_MODELS_SECTION) {
								current.onDidToggleOtherModels(collapsed);
							}
						},
						linkHandler: uri => current.onUnavailableLinkClick(uri),
						maxWidth: PICKER_WIDTH,
						hideDefaultKeybindingTooltip: true,
						reserveSubmenuSpace: false,
					}),
				};
			},
			renderEmpty: (container, activeTab) => {
				const destination = destinations.find(candidate => candidate.id === activeTab);
				if (!destination?.placeholders.length) {
					return undefined;
				}
				const welcome = new ModelPickerWelcome(destination);
				container.appendChild(welcome.element);
				return welcome;
			},
			renderFooter: autoModel ? container => this._renderAutoRow(container, autoModel, context) : undefined,
			delegate: {
				onSelect: action => {
					void action.run();
					this._widget.hide();
				},
				onHide: () => { },
			},
			accessibilityProvider: getModelPickerAccessibilityProvider(this._searchVisible),
		});
		if (this._context?.selectedModelId) {
			this._rememberSpeedVariant(this._context.selectedModelId);
		}
	}

	private _buildDestinations(context: ITabbedModelPickerContext): IModelPickerDestination[] {
		return buildModelPickerDestinations(context.models, this._languageModelsService, context.providerPlaceholders);
	}

	private _rememberSpeedVariant(modelIdentifier: string): void {
		const pair = this._speedVariants.get(modelIdentifier);
		if (pair) {
			this._preferredSpeedVariants.set(pair.standard.identifier, modelIdentifier);
		}
	}

	private _pinnedVariantIds(modelIdentifier: string, context: ITabbedModelPickerContext): string[] {
		const pair = this._speedVariants.get(modelIdentifier);
		return context.pinnedModelIds.filter(id => id === modelIdentifier || id === pair?.standard.identifier || id === pair?.fast.identifier);
	}

	private _isAutoSelected(context: ITabbedModelPickerContext): boolean {
		const selected = context.models.find(model => model.identifier === context.selectedModelId);
		return !!selected && isAutoModel(selected);
	}

	private _destinationForSelectedModel(destinations: readonly IModelPickerDestination[], context: ITabbedModelPickerContext): string | undefined {
		return destinations.find(destination => destination.models.some(model => model.identifier === context.selectedModelId))?.id;
	}

	private _buildSections(destination: IModelPickerDestination, context: ITabbedModelPickerContext): IModelPickerSections {
		const isBuiltIn = destination.id === MODEL_PICKER_BUILT_IN_DESTINATION;
		const sections = buildModelPickerSections({
			models: destination.models,
			selectedModelId: context.selectedModelId,
			recentModelIds: context.recentModelIds,
			pinnedModelIds: context.pinnedModelIds,
			controlModels: context.controlModels,
			preferredSpeedVariants: this._preferredSpeedVariants,
			// Only the built-in provider curates a shortlist. A provider the user added
			// gets a tab of its own, which is already the whole of what it offers.
			showSuggested: isBuiltIn,
			// Only the built-in provider has a curated catalogue to compare against.
			showUnavailable: isBuiltIn && context.unavailableContext.show,
			currentVSCodeVersion: context.unavailableContext.currentVSCodeVersion,
		});
		for (const [id, pair] of sections.speedVariants) {
			this._speedVariants.set(id, pair);
		}
		return sections;
	}

	private _buildTabBarActions(context: ITabbedModelPickerContext): ITabBarAction[] {
		const actions: ITabBarAction[] = [];
		// Hidden while searching, when the filter takes the tab strip's place.
		if (context.showManageModels && !this._searchVisible) {
			actions.push({
				id: 'addProvider',
				icon: Codicon.add,
				tooltip: localize('chat.modelPicker.addProvider', "Add Models..."),
				run: () => {
					this._widget.hide();
					context.onManageModels();
				},
			});
		}
		actions.push({
			id: 'search',
			icon: Codicon.search,
			tooltip: localize('chat.modelPicker.searchToggle', "Search Models"),
			alignEnd: true,
			checked: this._searchVisible,
			run: () => {
				this._searchVisible = !this._searchVisible;
				this._showCurrent();
			},
		});
		return actions;
	}

	private _buildItems(destination: IModelPickerDestination, sections: IModelPickerSections, context: ITabbedModelPickerContext): IActionListItem<IActionWidgetDropdownAction>[] {
		// A plan that grants only Auto still lists the models it could unlock, so the
		// welcome body is reserved for having genuinely nothing to say.
		if (!destination.models.length && !sections.unavailable.length) {
			return [];
		}
		const items: IActionListItem<IActionWidgetDropdownAction>[] = [];
		const appendSection = (
			label: string | undefined,
			models: readonly ILanguageModelChatMetadataAndIdentifier[],
			unavailable: readonly IModelPickerUnavailableEntry[] = [],
		) => {
			if (!models.length && !unavailable.length) {
				return;
			}
			// An unlabelled run still needs a rule when something precedes it.
			if (label || items.length) {
				items.push({ kind: ActionListItemKind.Separator, label });
			}
			for (const model of models) {
				items.push(this._createModelItem(model, context, undefined));
			}
			// Listed after the models that can be picked, so the section leads with what works.
			for (const { id, entry, needsUpdate } of unavailable) {
				const { unavailableContext } = context;
				const reason = needsUpdate ? 'update' : getUnavailableReason(entry, this._entitlementService, unavailableContext.currentVSCodeVersion);
				items.push(createUnavailableModelItem(
					id,
					entry,
					reason,
					unavailableContext.manageSettingsUrl,
					unavailableContext.updateStateType,
					this._entitlementService,
				));
			}
		};

		appendSection(localize('chat.modelPicker.pinned', "Pinned"), sections.pinned);
		// The shortlist is the default state, so it goes unlabelled.
		appendSection(undefined, sections.suggested, sections.unavailable);

		if (sections.other.length) {
			const collapsible = hasPromotedModels(sections);
			const section = collapsible ? OTHER_MODELS_SECTION : undefined;
			if (collapsible) {
				const label = localize('chat.modelPicker.otherModels', "Other Models");
				const count = sections.other.length;
				items.push({
					item: { id: 'otherModels', enabled: true, checked: false, class: undefined, tooltip: label, label, run: () => { } },
					kind: ActionListItemKind.Action,
					label,
					ariaDescription: localize('chat.modelPicker.otherModelsCount', "{0} more models", count),
					group: { title: '', icon: Codicon.chevronDown },
					hideIcon: false,
					section: OTHER_MODELS_SECTION,
					isSectionToggle: true,
					className: 'chat-model-picker-section-toggle',
				});
			}
			for (const model of sections.other) {
				items.push(this._createModelItem(model, context, section));
			}
		}
		return items;
	}

	/**
	 * Every model in one destination as flat rows, for searching. Sections would only
	 * get in the way of a result list, but each row still names its provider.
	 */
	private _buildSearchItems(destination: IModelPickerDestination, sections: IModelPickerSections, context: ITabbedModelPickerContext): IActionListItem<IActionWidgetDropdownAction>[] {
		return [...sections.pinned, ...sections.suggested, ...sections.other]
			.sort((left, right) => left.metadata.name.localeCompare(right.metadata.name))
			.map(model => this._createModelItem(model, context, undefined, getModelProviderLabel(model, this._languageModelsService)));
	}

	private _createModelItem(
		model: ILanguageModelChatMetadataAndIdentifier,
		context: ITabbedModelPickerContext,
		section?: string,
		providerLabel?: string,
	): IActionListItem<IActionWidgetDropdownAction> {
		const { action, ariaDescription } = createModelAction(model, context.selectedModelId, next => {
			this._selectionVersion++;
			const pair = this._speedVariants.get(next.identifier);
			context.onSelect(pair
				? getPreferredSpeedVariant(pair, this._context?.selectedModelId, this._preferredSpeedVariants.get(pair.standard.identifier))
				: next);
		}, section, true);
		const badge = getModelBadge(model, { configurationAccess: context.configurationAccess, providerLabel });
		// While Auto is choosing, a model's settings do not apply, so the card that edits
		// them stays shut. The row is still selectable, which is what turns Auto off.
		const autoEnabled = this._isAutoSelected(context);
		let selectionVersion = this._selectionVersion;
		const cardOptions: IModelCardOptions = {
			model,
			configurationAccess: context.configurationAccess,
			isUBB: context.isUBB,
			openerService: this._openerService,
			isPinned: this._pinnedVariantIds(model.identifier, context).length > 0,
			pricingDisclosure: this._pricingDisclosure,
			speedVariants: this._speedVariants.get(model.identifier),
			onWillSelect: () => { selectionVersion = ++this._selectionVersion; },
			onSelect: next => {
				if (selectionVersion === this._selectionVersion && this._widget.isVisible && next.identifier !== (this._context ?? context).selectedModelId) {
					this._rememberSpeedVariant(next.identifier);
					context.onSelect(next);
					this._context = { ...(this._context ?? context), selectedModelId: next.identifier };
					this._lastExplicitModelId = next.identifier;
				}
			},
			onDidAccept: () => {
				this._widget.refreshActiveList({
					focusItemId: selectionVersion === this._selectionVersion ? this._context?.selectedModelId : undefined,
					preserveHover: true,
				});
			},
			onTogglePin: context.onTogglePin
				? pinned => this._togglePin(model.identifier, pinned)
				: undefined,
			onDidChangeConfiguration: (group, key, fromValue, toValue) => {
				context.onConfigurationChanged(model, group, key, fromValue, toValue);
			},
		};
		const createCard = () => {
			const key = this._speedVariants.get(model.identifier)?.standard.identifier ?? model.identifier;
			let card = this._cards.get(key);
			if (card) {
				card.update(cardOptions);
			} else {
				card = new ModelCard(cardOptions);
				this._cards.set(key, card);
			}
			return card.element;
		};
		return {
			item: action,
			kind: ActionListItemKind.Action,
			label: action.label,
			description: badge ? undefined : action.description,
			badge: badge?.text,
			ariaDescription,
			group: { title: '', icon: action.icon ?? ThemeIcon.fromId(action.checked ? Codicon.check.id : Codicon.blank.id) },
			hideIcon: false,
			section,
			className: badge ? `chat-model-picker-badge-${badge.tone}` : undefined,
			hover: autoEnabled ? undefined : { content: createCard, expandable: true, showIndicator: false, panelClassName: 'chat-model-card-panel', alignToParent: true, preserveVerticalPosition: true },
			tooltip: action.tooltip,
		};
	}

	private _togglePin(modelIdentifier: string, pinned: boolean): void {
		const context = this._context;
		if (!context?.onTogglePin) {
			return;
		}
		const pinnedVariantIds = this._pinnedVariantIds(modelIdentifier, context);
		if (pinned) {
			context.onTogglePin(modelIdentifier, true);
		} else {
			for (const id of pinnedVariantIds) {
				context.onTogglePin(id, false);
			}
		}
		this._context = {
			...context,
			pinnedModelIds: pinned
				? [...context.pinnedModelIds, modelIdentifier]
				: context.pinnedModelIds.filter(id => !pinnedVariantIds.includes(id)),
		};
		this._widget.refreshActiveList({
			focusItemId: modelIdentifier,
			preserveHover: true,
			animateItemMove: true,
		});
	}

	private _renderAutoRow(container: HTMLElement, autoModel: ILanguageModelChatMetadataAndIdentifier, context: ITabbedModelPickerContext): IDisposable {
		const row = new ModelPickerAutoRow({
			autoModel,
			configurationAccess: context.configurationAccess,
			isEnabled: () => this._isAutoSelected(this._context ?? context),
			onToggle: enabled => this._toggleAuto(enabled, autoModel),
			onDidChangeConfiguration: (group, key, fromValue, toValue) => context.onConfigurationChanged(autoModel, group, key, fromValue, toValue),
		});
		this._autoRow.value = row;
		container.appendChild(row.element);
		return row;
	}

	private _toggleAuto(enabled: boolean, autoModel: ILanguageModelChatMetadataAndIdentifier): void {
		const context = this._context;
		if (!context) {
			return;
		}
		const next = enabled ? autoModel : this._fallbackModel(context);
		if (!next) {
			// Auto is the only model, so there is nothing to switch back to.
			this._autoRow.value?.render();
			return;
		}
		this._selectionVersion++;
		context.onSelect(next);
		this._context = { ...context, selectedModelId: next.identifier };
		// Updated in place rather than re-shown: rebuilding the popup would move focus
		// off the switch the user just clicked, and can dismiss it outright.
		this._widget.refreshActiveList();
		this._autoRow.value?.render();
	}

	/** The model to select when Auto is switched off: the last explicit pick, else the most recent one. */
	private _fallbackModel(context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier | undefined {
		const candidates = [this._lastExplicitModelId, ...context.recentModelIds, ...context.pinnedModelIds];
		for (const id of candidates) {
			const model = context.models.find(candidate => candidate.identifier === id);
			if (model && !isAutoModel(model)) {
				return model;
			}
		}
		return context.models.find(model => !isAutoModel(model));
	}
}
