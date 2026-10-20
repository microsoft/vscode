/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../../base/browser/ui/button/button.js';
import { status } from '../../../../../../../base/browser/ui/aria/aria.js';
import { SelectBox } from '../../../../../../../base/browser/ui/selectBox/selectBox.js';
import type { IModelPickerOpenOptions } from './modelPickerWidget.js';
import { ActionBar } from '../../../../../../../base/browser/ui/actionbar/actionbar.js';
import { IAction, toAction } from '../../../../../../../base/common/actions.js';
import { IStringDictionary } from '../../../../../../../base/common/collections.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { isThenable } from '../../../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../../../base/common/errors.js';
import { AnchorPosition } from '../../../../../../../base/common/layout.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { IAccessibilityService } from '../../../../../../../platform/accessibility/common/accessibility.js';
import { ActionListItemKind, IActionListHeaderLink, IActionListItem } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetDropdownAction, withActionWidgetDropdownMotion } from '../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ITabBarAction, ITabDescriptor, TabbedActionListWidget } from '../../../../../../../platform/actionWidget/browser/tabbedActionListWidget.js';
import { COPILOT_HYDRA_FUSION_MAX_MODEL_ID, COPILOT_HYDRA_FUSION_MODEL_ID, COPILOT_HYDRA_FUSION_MODEL_NAMES } from '../../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IContextViewService } from '../../../../../../../platform/contextview/browser/contextView.js';
import { defaultButtonStyles, defaultSelectBoxStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import { StateType } from '../../../../../../../platform/update/common/update.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, IModelControlEntry, isUserProvidedModel } from '../../../../common/languageModels.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { getModelConfigChoices, getModelConfigDescription, getModelConfigProperty, getModelConfigSummary, IModelConfigurationAccess, MODEL_CONFIG_GROUP_EFFORT, ModelConfigChangeListener, setModelConfigValues } from './modelPickerModelConfig.js';
import { IModelCardOptions, IPricingDisclosure, ModelCard } from './modelPickerCard.js';
import { getPreferredSpeedVariant, IModelSpeedVariants } from './modelPickerVariants.js';
import { getModelBadge, getOrganizationDefaultDescription, getOrganizationDefaultModel, organizationDefaultLabel } from './modelPickerBadges.js';
import { createModelAction, createUnavailableModelItem, getUnavailableReason, requiresNewerVSCode } from './modelPickerItemPrimitives.js';
import { getModelPickerAccessibilityProvider, getModelPickerControlModels } from './modelPickerItems.js';
import { filterModelPickerControlModelsForEntitlement, filterModelPickerModelsForEntitlement, getFusionTierLabel, getHydraFusionTierLabel, getInlineFusionTierDetail, getInlineFusionTierLabel, isAutoModel, isHydraFusionModel, isHydraFusionUpgradeOnly } from './modelPickerPresentation.js';
import { buildModelPickerDestinations, buildModelPickerSections, getModelProviderLabel, hasPromotedModels, IModelPickerDestination, IModelPickerProviderPlaceholder, IModelPickerSections, IModelPickerUnavailableEntry, MODEL_PICKER_BUILT_IN_DESTINATION, MODEL_PICKER_ON_DEVICE_DESTINATION } from './modelPickerTabs.js';
import { ModelPickerWelcome } from './modelPickerWelcome.js';
import { createMessageBanner, HYDRA_FUSION_LEARN_MORE_URL } from './modelPickerHover.js';
import { createLocalModelDetailsAction, isLocalModelDirectRow, LOCAL_MODEL_DETAILS_ACTION_ID, LOCAL_MODEL_PICKER_ITEM_PREFIX, type ILocalModelDetails, type IModelPickerLocalModels } from './modelPickerLocalModelItems.js';
import { LocalModelCard } from './modelPickerLocalModelCard.js';
import { IModelPickerComparison, ModelComparisonAvailableContext, ModelComparisonPickerFocusedContext } from './modelPickerComparison.js';

/** The collapsible section holding models that are neither pinned, recommended nor recent. */
const OTHER_MODELS_SECTION = 'other';
const PICKER_WIDTH = 320;
const PRICING_EXPANDED_STORAGE_KEY = 'chat.modelPicker.pricingExpanded';
const OTHER_MODELS_EXPANDED_STORAGE_KEY = 'chat.modelPicker.otherModelsExpanded';
const MODEL_DETAILS_ACTION_ID = 'chat.modelPicker.details';

function isComparisonConfigurationValue(value: unknown): value is string | number | boolean | null {
	return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** Everything the picker needs for one showing, gathered by the owning widget. */
export interface ITabbedModelPickerContext {
	readonly comparison?: IModelPickerComparison;
	readonly models: readonly ILanguageModelChatMetadataAndIdentifier[];
	/** Models from every harness that can participate in a comparison. */
	readonly comparisonModels?: readonly ILanguageModelChatMetadataAndIdentifier[];
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
	/** Reports that the user opened search or typed a search query. */
	readonly onDidSearch: () => void;
	/** Reports a configuration change made from a model's details. */
	readonly onConfigurationChanged: (model: ILanguageModelChatMetadataAndIdentifier, ...change: Parameters<ModelConfigChangeListener>) => void;
	/** Warning banner shown when switching options mid-session would reset the prompt cache. */
	readonly cacheBreakHint: { readonly text: string; readonly link: IActionListHeaderLink | undefined; readonly dismiss: () => void } | undefined;
	readonly configurationCacheBreakHint?: ITabbedModelPickerContext['cacheBreakHint'];
	/** The "On This Device" tab's rows and direct-row presentation, when the chat's Agent Host offers on-device models. */
	readonly localModels?: IModelPickerLocalModels;
}

/** Why the picker closed, so its owner can choose where focus goes next. */
export interface ITabbedModelPickerHideEvent {
	/** The picker closed because a guided selection was completed, so the user is ready to write the prompt. */
	readonly finishedComparison: boolean;
}

/** A provider-tabbed picker with Auto leading the Copilot tab and a drill-in configuration page. */
export class TabbedModelPicker extends Disposable {

	private readonly _onDidHide = this._register(new Emitter<ITabbedModelPickerHideEvent>());
	readonly onDidHide = this._onDidHide.event;

	private readonly _widget: TabbedActionListWidget;
	private readonly _cards = this._register(new DisposableMap<string, ModelCard>());
	private readonly _configurationListener = this._register(new MutableDisposable());
	private _detailsModelId: string | undefined;
	private _detailsCard: ModelCard | undefined;
	/** The detail page of an on-device model family, while it is shown. */
	private readonly _localModelCard = this._register(new MutableDisposable<LocalModelCard>());
	/** The "On This Device" tab came or went while a detail page covered the list. */
	private _localModelRebuildPending = false;
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
	private _contextViewLayer: number | undefined;
	private _activeDestination: string | undefined;
	private _searchVisible = false;
	private _filterValue = '';
	/** Set while Done closes the picker, so the hide is reported as a completed guided selection. */
	private _finishingComparison = false;
	/**
	 * Whether Other Models was expanded when the popup opened. The popup's height is
	 * measured from it, so toggling the section while open doesn't resize the popup.
	 */
	private _otherModelsExpandedOnOpen = false;
	private readonly _speedVariants = new Map<string, IModelSpeedVariants>();
	private readonly _preferredSpeedVariants = new Map<string, string>();
	/** The HydraFusion tier last chosen, which HydraFusion's row stands for while another model is in use. */
	private _preferredHydraFusionTier: string | undefined;
	private _selectionVersion = 0;
	private _models: readonly ILanguageModelChatMetadataAndIdentifier[] = [];
	private _comparisonModels: readonly ILanguageModelChatMetadataAndIdentifier[] | undefined;

	get isVisible(): boolean {
		return this._widget.isVisible;
	}

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatEntitlementService private readonly _entitlementService: IChatEntitlementService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();
		this._widget = this._register(instantiationService.createInstance(TabbedActionListWidget));
		this._register(this._widget.onDidChangeTab(id => { this._activeDestination = id; }));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.DefaultModel) || e.affectsConfiguration(ChatConfiguration.FusionModelPickerInlineTiers)) {
				this.refresh();
			}
		}));
		this._register(this._entitlementService.onDidChangeEntitlement(() => {
			if (!this.isVisible || !this._context) {
				return;
			}
			this._context = this._refreshContextForModels({
				...this._context,
				comparisonModels: this._comparisonModels
					? filterModelPickerModelsForEntitlement(this._comparisonModels, this._entitlementService.entitlement, this._languageModelsService)
					: undefined,
			}, this._models);
			if (this._context.selectedModelId && !this._context.models.some(model => model.identifier === this._context?.selectedModelId)) {
				const fallback = this._autoModel(this._context) ?? this._fallbackModel(this._context);
				if (fallback) {
					this._applyModelSelection(fallback, this._context, false);
				}
			}
			this.refresh();
		}));
		this._register(this._widget.onDidHide(() => {
			const finishedComparison = this._finishingComparison;
			this._finishingComparison = false;
			this._context?.comparison?.cancel();
			// Search is a transient view. Left on, it would also size the next popup from
			// its flattened cross-provider list.
			this._searchVisible = false;
			this._filterValue = '';
			this._selectionVersion++;
			this._detailsModelId = undefined;
			this._detailsCard = undefined;
			this._localModelCard.clear();
			this._localModelRebuildPending = false;
			this._configurationListener.clear();
			this._cards.clearAndDisposeAll();
			this._onDidHide.fire({ finishedComparison });
		}));
	}

	hide(): void {
		this._widget.hide();
	}

	override dispose(): void {
		// Close an open popup while its hide listeners are still registered, so
		// callers observe every open ending.
		this.hide();
		super.dispose();
	}

	/** Updates an open picker: shows an on-device model family's detail page, or opens search with an initial query and focused row. */
	openWithFilter(options: IModelPickerOpenOptions): void {
		if (options.startComparison) {
			const comparison = this._context?.comparison;
			if (comparison?.available.get()) {
				this._selectionVersion++;
				if (!comparison.state.get()) {
					comparison.start();
				}
				this._searchVisible = false;
				this._showCurrent();
			}
			return;
		}
		if (options.localModelFamilyId !== undefined) {
			this._searchVisible = false;
			this._showLocalModelDetailsOnOpen(options.localModelFamilyId);
			return;
		}
		this._searchVisible = true;
		this._showCurrent(options.initialFilterValue, options.initialFocusItemId);
	}

	show(anchor: HTMLElement, context: ITabbedModelPickerContext, detailsModelId?: string, focusConfiguration = false, contextViewLayer?: number, options?: IModelPickerOpenOptions): void {
		if (!this._widget.isVisible) {
			this._activeDestination = undefined;
			this._otherModelsExpandedOnOpen = this._isOtherModelsExpanded();
			if (context.comparison?.available.get() && (context.comparison.summary.get() || options?.startComparison)) {
				context.comparison.start();
			}
		}
		this._anchor = anchor;
		this._selectionVersion++;
		this._models = context.models;
		this._comparisonModels = context.comparisonModels;
		const pickerContext = this._filterModelsForEntitlement(context);
		this._context = pickerContext;
		this._rememberHydraFusionTier(pickerContext);
		this._configurationListener.value = context.configurationAccess.onDidChange?.(() => this.refresh());
		this._contextViewLayer = contextViewLayer;
		const requestedModel = pickerContext.models.find(model => model.identifier === detailsModelId);
		// An on-device direct model's details are its family's page in the "On This Device" tab.
		const localModelFamilyId = options?.localModelFamilyId ?? (requestedModel ? pickerContext.localModels?.getDirectModel(requestedModel)?.familyId : undefined);
		if (localModelFamilyId !== undefined || (requestedModel && isLocalModelDirectRow(requestedModel))) {
			this._showLocalModelDetailsOnOpen(localModelFamilyId);
			return;
		}
		if (options?.initialFilterValue !== undefined) {
			this._searchVisible = true;
		}
		this._showCurrent(options?.initialFilterValue, options?.initialFocusItemId);
		const detailsModel = requestedModel && this._getDetailsModel(requestedModel, pickerContext);
		if (detailsModel) {
			this._showModelDetails(detailsModel, focusConfiguration);
		}
	}

	/** Shows the "On This Device" tab with the detail page of `familyId` on top, or just the tab when the family isn't listed. */
	private _showLocalModelDetailsOnOpen(familyId: string | undefined): void {
		if (!this._context) {
			return;
		}
		if (this._showsOnDeviceTab(this._context)) {
			this._activeDestination = MODEL_PICKER_ON_DEVICE_DESTINATION;
		}
		this._showCurrent();
		if (familyId !== undefined) {
			this._showLocalModelDetails(familyId);
		}
	}

	setSelectedModel(modelId: string | undefined): void {
		if (this._context && this._context.selectedModelId !== modelId) {
			this._selectionVersion++;
			this._context = { ...this._context, selectedModelId: modelId };
			this._rememberHydraFusionTier(this._context);
			this.refresh();
		}
	}

	/** Replaces the on-device rows of an open picker, keeping focus and updating a shown detail page; the tab strip is rebuilt when the tab comes or goes. */
	setLocalModels(localModels: IModelPickerLocalModels | undefined): void {
		if (!this._context || (!localModels && !this._context.localModels)) {
			return;
		}
		const previous = this._context;
		this._context = { ...previous, localModels };
		const hadTab = this._showsOnDeviceTab(previous);
		const hasTab = this._showsOnDeviceTab(this._context);
		if (!hasTab && this._activeDestination === MODEL_PICKER_ON_DEVICE_DESTINATION) {
			this._activeDestination = MODEL_PICKER_BUILT_IN_DESTINATION;
		}
		if (!this.isVisible || this._detailsModelId) {
			return;
		}
		// Search hides the tab strip, so only its results need to change.
		const rebuild = !this._searchVisible && hadTab !== hasTab;
		const card = this._localModelCard.value;
		if (card) {
			// The list behind the page is rebuilt or refreshed when the page is left.
			this._localModelRebuildPending ||= rebuild;
			const details = hasTab ? this._getLocalModelDetails(card.familyId, this._context) : undefined;
			if (details) {
				card.update(details);
				this._widget.refreshActiveList({ preserveHover: true, preserveScrollPosition: true });
			} else {
				this._widget.hideDetails();
			}
			return;
		}
		if (rebuild) {
			this._showCurrent();
		} else {
			this._widget.refreshActiveList({ preserveHover: true, preserveScrollPosition: true });
		}
	}

	refresh(
		models?: readonly ILanguageModelChatMetadataAndIdentifier[],
		comparisonModels?: readonly ILanguageModelChatMetadataAndIdentifier[],
	): void {
		if (!this.isVisible || !this._context) {
			return;
		}
		if (models) {
			this._models = models;
			if (comparisonModels !== undefined) {
				this._comparisonModels = comparisonModels;
			}
			this._context = this._refreshContextForModels({
				...this._context,
				...(comparisonModels !== undefined ? {
					comparisonModels: filterModelPickerModelsForEntitlement(comparisonModels, this._entitlementService.entitlement, this._languageModelsService),
				} : {}),
			}, this._models);
		}
		const context = this._getActiveContext(this._context);
		const destinations = this._buildDestinations(context);
		if (!destinations.length) {
			this.hide();
			return;
		}
		if (models) {
			this._speedVariants.clear();
			for (const destination of destinations) {
				this._buildSections(destination, context);
			}
		}
		const model = context.models.find(model => model.identifier === this._detailsModelId);
		if (this._detailsModelId && !model) {
			this._widget.refreshActiveList();
			this._widget.hideDetails();
			return;
		} else if (model) {
			this._getModelCard(model, context).refresh();
		}
		// While models are chosen to compare, the popup keeps its size and its rows update in place,
		// e.g. when a model's effort changes: measuring the list again would resize the popup, which
		// can push it beside its anchor.
		this._widget.refreshActiveList(this._context.comparison?.state.get() ? { preserveScrollPosition: true, preserveSize: true } : undefined);
	}

	private _filterModelsForEntitlement(context: ITabbedModelPickerContext): ITabbedModelPickerContext {
		return {
			...context,
			models: filterModelPickerModelsForEntitlement(context.models, this._entitlementService.entitlement, this._languageModelsService),
			comparisonModels: context.comparisonModels
				? filterModelPickerModelsForEntitlement(context.comparisonModels, this._entitlementService.entitlement, this._languageModelsService)
				: undefined,
			controlModels: filterModelPickerControlModelsForEntitlement(context.controlModels, context.models, this._entitlementService.entitlement, this._languageModelsService),
		};
	}

	private _getActiveContext(context: ITabbedModelPickerContext): ITabbedModelPickerContext {
		return context.comparison?.state.get() && context.comparisonModels
			? this._refreshContextForModels(context, context.comparisonModels)
			: context;
	}

	private _refreshContextForModels(context: ITabbedModelPickerContext, models: readonly ILanguageModelChatMetadataAndIdentifier[]): ITabbedModelPickerContext {
		const controlModels = getModelPickerControlModels(
			this._languageModelsService.getModelsControlManifest(),
			this._entitlementService.entitlement,
			models,
		);
		return this._filterModelsForEntitlement({ ...context, models, controlModels });
	}

	private _showCurrent(initialFilterValue?: string, initialFocusItemId?: string): void {
		const baseContext = this._context;
		const anchor = this._anchor;
		if (!baseContext || !anchor) {
			return;
		}
		const context = this._getActiveContext(baseContext);
		this._filterValue = this._searchVisible ? initialFilterValue ?? '' : '';

		this._speedVariants.clear();
		this._detailsModelId = undefined;
		this._detailsCard = undefined;
		this._localModelCard.clear();
		this._localModelRebuildPending = false;
		this._cards.clearAndDisposeAll();
		const comparison = context.comparison?.available.get() ? context.comparison : undefined;
		const step = comparison?.state.get();
		const destinations = this._buildDestinations(context);
		if (!destinations.length) {
			return;
		}
		if (!this._activeDestination || !destinations.some(destination => destination.id === this._activeDestination)) {
			this._activeDestination = this._destinationForSelectedModel(destinations, context) ?? destinations[0].id;
		}

		this._widget.show<IActionWidgetDropdownAction>({
			user: 'ChatTabbedModelPicker',
			anchor,
			tabs: destinations.map((destination): ITabDescriptor => ({
				id: destination.id,
				label: destination.label,
				icon: destination.icon,
				tooltip: destination.label,
			})),
			initialTab: this._activeDestination,
			// The built-in provider fixes the popup's height, unless all it lists is what an
			// upgrade would unlock, which is too short to hold another provider's models.
			sizingTab: this._hasBuiltInChoices(context) ? MODEL_PICKER_BUILT_IN_DESTINATION : undefined,
			sizingKey: step ? 'comparison' : 'single',
			contextViewLayer: this._contextViewLayer,
			tabBarActions: this._buildTabBarActions(context),
			tabBarClassName: 'chat-model-picker-tabbar',
			widgetClassNames: () => [
				'chat-model-picker-widget',
				...(step ? ['model-picker-comparison'] : []),
				...(this._searchVisible ? ['search-mode'] : []),
			],
			renderWidget: comparison ? widget => {
				const context = this._contextKeyService.createScoped(widget);
				ModelComparisonAvailableContext.bindTo(context).set(true);
				ModelComparisonPickerFocusedContext.bindTo(context).set(true);
				return context;
			} : undefined,
			tabLabels: 'active',
			filterInTabBar: true,
			width: PICKER_WIDTH,
			createActionList: (activeTab, forSizing) => {
				const current = forSizing ? this._context ?? baseContext : this._getActiveContext(this._context ?? baseContext);
				const currentDestinations = this._buildDestinations(current);
				const destination = currentDestinations.find(candidate => candidate.id === activeTab) ?? currentDestinations[0];
				const sections = this._buildSections(destination, current);
				const isOnDevice = destination.id === MODEL_PICKER_ON_DEVICE_DESTINATION;
				// Search spans every destination at once, so each model names its provider.
				const searching = this._searchVisible && !forSizing;
				const items = searching
					? currentDestinations.flatMap(candidate => this._buildSearchItems(candidate, candidate === destination ? sections : this._buildSections(candidate, current), current))
					: isOnDevice
						? this._buildLocalModelItems(current)
						: this._buildItems(destination, sections, current);
				const hint = step ? { text: step.description, link: undefined, dismiss: undefined } : current.cacheBreakHint ?? current.configurationCacheBreakHint;
				const baseListOptions = withActionWidgetDropdownMotion({
					className: 'chat-model-picker-dropdown chat-model-picker-tabbed',
					stopToolbarPointerPropagation: true,
					tabThroughItemActions: true,
					detailItemHeight: this._inlineFusionModel(current) && !isOnDevice ? 48 : 64,
					showFilter: searching,
					filterPlaceholder: localize('chat.modelPicker.search', "Search models"),
					focusFilterOnOpen: searching,
					initialFilterValue,
					initialFocusItemId,
					filterAsCombobox: true,
					onType: text => {
						this._searchVisible = true;
						current.onDidSearch();
						this._showCurrent(text);
					},
					onDidChangeFilter: text => {
						this._filterValue = text;
						current.onDidSearch();
					},
					headerText: hint?.text,
					headerIcon: hint ? Codicon.info : undefined,
					headerLink: hint?.link,
					headerDismiss: hint?.dismiss,
					// A tab with nothing promoted would open on an empty list, so leave it expanded.
					collapsedByDefault: hasPromotedModels(sections) && !(forSizing ? this._otherModelsExpandedOnOpen : this._isOtherModelsExpanded()) ? new Set([OTHER_MODELS_SECTION]) : undefined,
					onDidToggleSection: (section, collapsed) => {
						if (section === OTHER_MODELS_SECTION) {
							this._storageService.store(OTHER_MODELS_EXPANDED_STORAGE_KEY, !collapsed, StorageScope.APPLICATION, StorageTarget.USER);
							current.onDidToggleOtherModels(collapsed);
						}
					},
					linkHandler: uri => current.onUnavailableLinkClick(uri),
					maxWidth: PICKER_WIDTH,
					hideDefaultKeybindingTooltip: true,
					reserveSubmenuSpace: false,
				});
				// Above the input like the other input pickers, unless the input sits too close to
				// the top for it, e.g. inline chat at the top of an editor.
				const listOptions = anchor.closest('.monaco-dialog-box')
					? { ...baseListOptions, anchorPosition: AnchorPosition.BELOW }
					: { ...baseListOptions, preferredAnchorPosition: AnchorPosition.ABOVE };
				return {
					items: step ? items.filter(item => !item.item || !current.models.some(model => model.identifier === item.item?.id && (isAutoModel(model) || isHydraFusionModel(model)))) : items,
					listOptions,
				};
			},
			renderFooter: comparison && (step || comparison.showPickerHint?.get()) ? container => step
				? this._renderComparisonFooter(container, comparison)
				: this._renderStartComparisonFooter(container, comparison) : undefined,
			renderEmpty: (container, activeTab) => {
				const destination = destinations.find(candidate => candidate.id === activeTab);
				if (!destination?.placeholders.length) {
					return undefined;
				}
				const welcome = new ModelPickerWelcome(destination);
				container.appendChild(welcome.element);
				return welcome;
			},
			openItemDetails: item => this._openItemDetails(item),
			delegate: {
				onSelect: action => {
					const result = action.run();
					const selectionVersion = this._selectionVersion;
					const accept = () => {
						// A row that opens its detail page, such as an on-device model to set up, keeps the picker open.
						if (!step && !this._widget.isShowingDetails && selectionVersion === this._selectionVersion) {
							this._widget.hide();
						}
					};
					if (isThenable(result)) {
						result.then(accept, onUnexpectedError);
					} else {
						accept();
					}
				},
				onHide: () => { },
			},
			accessibilityProvider: getModelPickerAccessibilityProvider(this._searchVisible, step?.multiple ?? false),
		});
		if (this._context?.selectedModelId) {
			this._rememberSpeedVariant(this._context.selectedModelId);
		}
	}

	private _isOtherModelsExpanded(): boolean {
		return this._storageService.getBoolean(OTHER_MODELS_EXPANDED_STORAGE_KEY, StorageScope.APPLICATION, false);
	}

	private _buildDestinations(context: ITabbedModelPickerContext): IModelPickerDestination[] {
		const autoModel = this._autoModel(context);
		const hydraFusionModels = this._hydraFusionModels(context);
		// Fusion's HydraFusion is never a row of its own, even when Fusion does not offer it.
		const fusionHydraFusion = (model: ILanguageModelChatMetadataAndIdentifier) => !!autoModel?.metadata.autoModelFusion && isHydraFusionModel(model) && !isUserProvidedModel(model, this._languageModelsService);
		// On-device direct models are listed only in the "On This Device" tab, never under a provider of their own or among
		// the cloud models (even while status is unavailable), and comparisons don't offer them.
		const localModels = context.localModels;
		const models = context.models.filter(model => !isLocalModelDirectRow(model) && !localModels?.getDirectModel(model));
		const destinations = buildModelPickerDestinations(models, this._languageModelsService, context.providerPlaceholders, model => model === autoModel || hydraFusionModels.includes(model) || fusionHydraFusion(model), this._hasBuiltInUpsells(context));
		if (this._showsOnDeviceTab(context)) {
			destinations.splice(destinations[0]?.id === MODEL_PICKER_BUILT_IN_DESTINATION ? 1 : 0, 0, {
				id: MODEL_PICKER_ON_DEVICE_DESTINATION,
				label: localize('chat.modelPicker.onDevice', "On This Device"),
				icon: Codicon.vm,
				models: this._localDirectModels(context),
				placeholders: [],
			});
		}
		return destinations;
	}

	/** Whether the "On This Device" tab is shown: the chat offers on-device models, outside a comparison. */
	private _showsOnDeviceTab(context: ITabbedModelPickerContext): boolean {
		return !!context.localModels && !context.comparison?.state.get();
	}

	/**
	 * Whether a Free or Student plan has curated models to offer as an upgrade. Those
	 * plans can never select them, so they are shown even while Copilot lists nothing
	 * selectable here, rather than the Copilot tab disappearing behind added providers.
	 */
	private _hasBuiltInUpsells(context: ITabbedModelPickerContext): boolean {
		const entitlement = this._entitlementService.entitlement;
		return (entitlement === ChatEntitlement.Free || entitlement === ChatEntitlement.EDU)
			&& this._buildSections({ id: MODEL_PICKER_BUILT_IN_DESTINATION, models: [] }, context).unavailable.length > 0;
	}

	/** Whether Copilot offers anything selectable, as opposed to only models to unlock. */
	private _hasBuiltInChoices(context: ITabbedModelPickerContext): boolean {
		return !!(this._autoModel(context) || this._hydraFusionModels(context).length || this._fallbackModel(context));
	}

	private _autoModel(context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier | undefined {
		return context.models.find(model => isAutoModel(model) && !isUserProvidedModel(model, this._languageModelsService) && !requiresNewerVSCode(model, context.controlModels, context.unavailableContext.currentVSCodeVersion));
	}

	private _inlineFusionModel(context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier | undefined {
		const auto = this._autoModel(context);
		return auto?.metadata.autoModelFusion && !context.comparison?.state.get()
			&& this._configurationService.getValue<boolean>(ChatConfiguration.FusionModelPickerInlineTiers)
			&& getModelConfigProperty(auto, context.configurationAccess, MODEL_CONFIG_GROUP_EFFORT) ? auto : undefined;
	}

	/**
	 * The HydraFusion routing models this build can run, HydraFusion before HydraFusion Max.
	 * The host only offers HydraFusion Max with HydraFusion v2, and Fusion only offers
	 * HydraFusion as its High.
	 */
	private _hydraFusionModels(context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier[] {
		const auto = this._autoModel(context)?.metadata;
		const fusion = auto?.autoModelFusion;
		return [...COPILOT_HYDRA_FUSION_MODEL_NAMES.keys()]
			// Provider tiers offer HydraFusion as a tier of their own, whether or not Fusion's High would use it.
			.filter(id => id !== COPILOT_HYDRA_FUSION_MODEL_ID || !fusion || fusion.balanceUsesHydraFusion || !!getFusionTierLabel(auto, id))
			.map(id => context.models.find(model => model.metadata.id === id && isHydraFusionModel(model) && !isUserProvidedModel(model, this._languageModelsService) && !requiresNewerVSCode(model, context.controlModels, context.unavailableContext.currentVSCodeVersion)))
			.filter((model): model is ILanguageModelChatMetadataAndIdentifier => !!model);
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

	/**
	 * Whether HydraFusion is offered among Fusion's tiers, which needs a Fusion with
	 * tiers to join. Otherwise HydraFusion keeps a row of its own beside Auto.
	 */
	private _hostsHydraFusion(context: ITabbedModelPickerContext): boolean {
		const auto = this._autoModel(context);
		return !!auto?.metadata.autoModelFusion && this._hydraFusionModels(context).length > 0 && !!getModelConfigProperty(auto, context.configurationAccess, MODEL_CONFIG_GROUP_EFFORT);
	}

	/**
	 * HydraFusion's own tiers outside Fusion, Default before Max. HydraFusion and
	 * HydraFusion Max then share one row, and its details choose between them.
	 */
	private _hydraFusionTiers(context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier[] {
		if (this._autoModel(context)?.metadata.autoModelFusion) {
			return [];
		}
		const models = this._hydraFusionModels(context);
		return models.length > 1 ? models : [];
	}

	/** The tier HydraFusion's row stands for: the one in use, else the last one chosen, else the organization default, else Default. */
	private _hydraFusionRowModel(tiers: readonly ILanguageModelChatMetadataAndIdentifier[], context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier {
		const organizationDefault = this._getOrganizationDefaultModel(context);
		return tiers.find(model => model.identifier === context.selectedModelId)
			?? tiers.find(model => model.identifier === this._preferredHydraFusionTier)
			?? tiers.find(model => model.identifier === organizationDefault?.identifier)
			?? tiers[0];
	}

	/** The HydraFusion model selected as one of Auto's tiers, which Auto then represents. */
	private _selectedHydraFusionTier(context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier | undefined {
		return context.selectedModelId && this._hostsHydraFusion(context)
			? this._hydraFusionModels(context).find(model => model.identifier === context.selectedModelId)
			: undefined;
	}

	private _getHydraFusionTier(hydraFusion: ILanguageModelChatMetadataAndIdentifier, context: ITabbedModelPickerContext): { readonly label: string; readonly replacesTier?: string; readonly selectsTier?: boolean } {
		const auto = this._autoModel(context);
		const label = getFusionTierLabel(auto?.metadata, hydraFusion.metadata.id);
		if (!label) {
			return { label: hydraFusion.metadata.name };
		}
		// Provider tiers offer the HydraFusion model as a tier of the same id, which moves the chat to Fusion.
		if (auto && getModelConfigProperty(auto, context.configurationAccess, MODEL_CONFIG_GROUP_EFFORT)?.schema.enum?.includes(hydraFusion.metadata.id)) {
			return { label, replacesTier: hydraFusion.metadata.id, selectsTier: true };
		}
		return { label, replacesTier: hydraFusion.metadata.id === COPILOT_HYDRA_FUSION_MODEL_ID ? 'intelligence' : undefined };
	}

	/** The model whose details stand for the given one: Auto's for a Fusion tier, its own for HydraFusion with tiers, none otherwise. */
	private _getDetailsModel(model: ILanguageModelChatMetadataAndIdentifier, context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier | undefined {
		if (!isHydraFusionModel(model) || this._hydraFusionTiers(context).includes(model)) {
			return model;
		}
		return this._hydraFusionModels(context).includes(model) && this._hostsHydraFusion(context) ? this._autoModel(context) : undefined;
	}

	private _destinationForSelectedModel(destinations: readonly IModelPickerDestination[], context: ITabbedModelPickerContext): string | undefined {
		if (context.selectedModelId === this._autoModel(context)?.identifier || this._hydraFusionModels(context).some(model => model.identifier === context.selectedModelId)) {
			return MODEL_PICKER_BUILT_IN_DESTINATION;
		}
		return destinations.find(destination => destination.models.some(model => model.identifier === context.selectedModelId))?.id;
	}

	private _buildSections(destination: Pick<IModelPickerDestination, 'id' | 'models'>, context: ITabbedModelPickerContext): IModelPickerSections {
		const isBuiltIn = destination.id === MODEL_PICKER_BUILT_IN_DESTINATION;
		const sections = buildModelPickerSections({
			models: destination.models,
			selectedModelId: context.selectedModelId,
			organizationDefaultModelId: this._getOrganizationDefaultModel(context)?.identifier,
			recentModelIds: context.recentModelIds,
			pinnedModelIds: context.pinnedModelIds,
			controlModels: context.controlModels,
			preferredSpeedVariants: this._preferredSpeedVariants,
			// Only the built-in provider curates a shortlist. A provider the user added
			// gets a tab of its own, which is already the whole of what it offers.
			showSuggested: isBuiltIn,
			// Only the built-in provider has a curated catalogue to compare against.
			showUnavailable: isBuiltIn && context.unavailableContext.show,
			alwaysShowUnavailableModelIds: isBuiltIn && isHydraFusionUpgradeOnly(this._entitlementService.entitlement)
				? new Set([COPILOT_HYDRA_FUSION_MODEL_ID])
				: undefined,
			currentVSCodeVersion: context.unavailableContext.currentVSCodeVersion,
		});
		for (const [id, pair] of sections.speedVariants) {
			this._speedVariants.set(id, pair);
		}
		return sections;
	}

	private _getOrganizationDefaultModel(context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier | undefined {
		return getOrganizationDefaultModel(this._configurationService, context.models);
	}

	private _getOrganizationDefaultForModel(model: ILanguageModelChatMetadataAndIdentifier, context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier | undefined {
		const defaultModel = this._getOrganizationDefaultModel(context);
		const variants = this._speedVariants.get(model.identifier);
		// HydraFusion's tiers share one row, which carries the organization default of either.
		const hydraFusionTiers = this._hydraFusionTiers(context);
		return defaultModel && (defaultModel.identifier === model.identifier
			|| defaultModel.identifier === variants?.standard.identifier
			|| defaultModel.identifier === variants?.fast.identifier
			|| (hydraFusionTiers.includes(model) && hydraFusionTiers.includes(defaultModel))) ? defaultModel : undefined;
	}

	private _buildTabBarActions(context: ITabbedModelPickerContext): ITabBarAction[] {
		const actions: ITabBarAction[] = [];
		const comparison = context.comparison;
		if (comparison?.available.get()) {
			// Grouped with Search at the end of the tab bar, away from the provider tabs.
			actions.push({
				id: 'comparison',
				icon: Codicon.trophy,
				tooltip: this._labelWithKeybinding(comparison.label, comparison.startCommandId),
				alignEnd: true,
				useManagedHover: true,
				checked: !!comparison.state.get(),
				run: () => {
					// Starting or leaving a comparison supersedes a pending selection.
					this._selectionVersion++;
					if (comparison.state.get()) {
						comparison.cancel();
					} else {
						comparison.start();
					}
					this._showCurrent(this._filterValue);
				},
			});
		}
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
		// With no models there is nothing to search, only the reason shown in their place.
		if (context.models.length) {
			actions.push({
				id: 'search',
				icon: Codicon.search,
				tooltip: localize('chat.modelPicker.searchToggle', "Search Models"),
				alignEnd: true,
				checked: this._searchVisible,
				run: () => {
					this._searchVisible = !this._searchVisible;
					if (this._searchVisible) {
						context.onDidSearch();
					}
					this._showCurrent();
				},
			});
		}
		return actions;
	}

	private _labelWithKeybinding(label: string, commandId: string | undefined, context?: IContextKeyService): string {
		const keybinding = commandId ? this._keybindingService.lookupKeybinding(commandId, context)?.getLabel() : undefined;
		return keybinding ? localize('modelPicker.comparison.withKeybinding', "{0} ({1})", label, keybinding) : label;
	}

	private _renderStartComparisonFooter(container: HTMLElement, comparison: IModelPickerComparison): DisposableStore {
		const store = new DisposableStore();
		const label = localize('modelPicker.comparison.start', "Send Query to Multiple Models");
		const context = store.add(this._contextKeyService.createScoped(container));
		ModelComparisonAvailableContext.bindTo(context).set(true);
		ModelComparisonPickerFocusedContext.bindTo(context).set(true);
		const hint = this._labelWithKeybinding(label, comparison.startCommandId, context);
		const button = store.add(new Button(container, { ...defaultButtonStyles, secondary: true, ariaLabel: hint }));
		button.label = hint;
		store.add(button.onDidClick(() => {
			this._selectionVersion++;
			comparison.start();
			this._searchVisible = false;
			this._showCurrent();
			status(comparison.state.get()!.title);
		}));
		return store;
	}

	private _renderComparisonFooter(container: HTMLElement, comparison: IModelPickerComparison): DisposableStore {
		const store = new DisposableStore();
		const step = comparison.state.get()!;
		container.classList.add('model-picker-comparison-footer');
		if (step.count) {
			const count = step.count;
			const row = dom.append(container, dom.$('.model-picker-comparison-count'));
			dom.append(row, dom.$('span')).textContent = count.label;
			const select = store.add(new SelectBox(
				Array.from({ length: count.max - count.min + 1 }, (_, index) => ({ text: String(index + count.min) })),
				count.value - count.min, this._contextViewService, defaultSelectBoxStyles,
				{ ariaLabel: count.label, contextViewLayer: (this._contextViewLayer ?? 0) + 1 },
			));
			select.render(row);
			store.add(select.onDidSelect(event => comparison.setCount(event.index + count.min)));
		}
		const actions = dom.append(container, dom.$('.model-picker-comparison-actions'));
		const showStep = (move: () => void) => {
			move();
			this._searchVisible = false;
			this._showCurrent();
			status(comparison.state.get()!.title);
		};
		const leading = dom.append(actions, dom.$('.model-picker-comparison-leading'));
		let stepStatus: HTMLElement | undefined;
		if (step.canGoBack) {
			const backLabel = localize('modelPicker.comparison.back', "Back");
			// Unthemed, so the quiet text style from CSS applies instead of the secondary button fill.
			const back = store.add(new Button(leading, {
				...defaultButtonStyles, secondary: true, supportIcons: true, ariaLabel: backLabel,
				buttonSecondaryBackground: undefined, buttonSecondaryHoverBackground: undefined, buttonSecondaryForeground: undefined, buttonSecondaryBorder: undefined,
			}));
			back.label = `$(${Codicon.chevronLeft.id}) ${backLabel}`;
			back.element.classList.add('model-picker-comparison-back');
			store.add(back.onDidClick(() => showStep(() => comparison.back())));
		} else {
			stepStatus = dom.append(leading, dom.$('span.model-picker-comparison-status'));
		}
		// Done and Next keep their places and are disabled until the selection can be used.
		const trailing = dom.append(actions, dom.$('.model-picker-comparison-trailing'));
		const done = store.add(new Button(trailing, { ...defaultButtonStyles }));
		done.label = localize('modelPicker.comparison.done', "Done");
		done.element.classList.add('model-picker-comparison-done');
		store.add(done.onDidClick(() => {
			comparison.finish();
			this._finishingComparison = true;
			this._widget.hide();
		}));
		const next = store.add(new Button(trailing, { ...defaultButtonStyles, secondary: true }));
		next.label = localize('modelPicker.comparison.next', "Next");
		next.element.classList.add('model-picker-comparison-next');
		store.add(next.onDidClick(() => showStep(() => comparison.next())));
		// Checking a model updates the rows in place, so the footer follows the comparison state.
		store.add(autorun(reader => {
			const current = comparison.state.read(reader);
			if (!current) {
				return;
			}
			done.enabled = current.canFinish;
			next.enabled = current.canGoNext;
			dom.setVisibility(current.hasNextStep ?? current.canGoNext, next.element);
			if (stepStatus) {
				stepStatus.textContent = current.status?.text ?? '';
				stepStatus.classList.toggle('warning', !!current.status?.warning);
			}
		}));
		return store;
	}

	private _buildItems(destination: IModelPickerDestination, sections: IModelPickerSections, context: ITabbedModelPickerContext): IActionListItem<IActionWidgetDropdownAction>[] {
		const isBuiltIn = destination.id === MODEL_PICKER_BUILT_IN_DESTINATION;
		// Auto leads the built-in provider's list, ahead of any section. Guided selection
		// compares individual models, so it leaves routing out.
		const items: IActionListItem<IActionWidgetDropdownAction>[] = isBuiltIn && !context.comparison?.state.get() ? this._buildRoutingItems(context) : [];
		// A plan that grants only Auto still lists the models it could unlock, so the
		// welcome body is reserved for having genuinely nothing to say.
		if (!items.length && !destination.models.length && !sections.unavailable.length) {
			return [];
		}
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
			for (const unavailableEntry of unavailable) {
				const { unavailableContext } = context;
				items.push(createUnavailableModelItem(
					unavailableEntry.id,
					unavailableEntry.entry,
					this._getUnavailableReason(unavailableEntry, context),
					unavailableContext.manageSettingsUrl,
					unavailableContext.updateStateType,
					this._entitlementService,
				));
			}
		};

		appendSection(localize('chat.modelPicker.pinned', "Pinned"), sections.pinned);
		// The shortlist is the default state, so it goes unlabelled. When Copilot offers no
		// model to pick by hand, though, the plan is Auto alone, and the models it lacks
		// are headed as what an upgrade would add.
		const upsellLabel = isBuiltIn && !this._fallbackModel(context)
			? this._getUpsellSectionLabel(sections.unavailable, context)
			: undefined;
		if (upsellLabel) {
			appendSection(undefined, sections.suggested);
			appendSection(upsellLabel, [], sections.unavailable);
		} else {
			appendSection(isBuiltIn && this._inlineFusionModel(context) ? localize('chat.modelPicker.individualModels', "Individual models") : undefined, sections.suggested, sections.unavailable);
		}

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
		// On-device models are found under the name of their tab, which no provider shares.
		if (destination.id === MODEL_PICKER_ON_DEVICE_DESTINATION) {
			return [...destination.models]
				.sort((left, right) => left.metadata.name.localeCompare(right.metadata.name))
				.map(model => this._createModelItem(model, context, undefined, destination.label));
		}
		const routingModels = destination.id === MODEL_PICKER_BUILT_IN_DESTINATION
			? [this._autoModel(context), ...this._hydraFusionRowModels(context)].filter((model): model is ILanguageModelChatMetadataAndIdentifier => !!model)
			: [];
		const inlineFusion = destination.id === MODEL_PICKER_BUILT_IN_DESTINATION ? this._inlineFusionModel(context) : undefined;
		if (inlineFusion) {
			return [
				...this._buildFusionItems(context, inlineFusion).filter(item => !!item.item).map(item => ({ ...item, label: localize('chat.modelPicker.fusionTier', "Fusion {0}", item.label) })),
				...[...sections.pinned, ...sections.suggested, ...sections.other]
					.sort((left, right) => this._getRowLabel(left, context).localeCompare(this._getRowLabel(right, context)))
					.map(model => this._createModelItem(model, context, undefined, getModelProviderLabel(model, this._languageModelsService))),
			];
		}
		return [...sections.pinned, ...sections.suggested, ...sections.other, ...routingModels]
			.sort((left, right) => this._getRowLabel(left, context).localeCompare(this._getRowLabel(right, context)))
			.map(model => this._createModelItem(model, context, undefined, getModelProviderLabel(model, this._languageModelsService)));
	}

	/** The installed on-device models' direct rows, listed only in the "On This Device" tab. */
	private _localDirectModels(context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier[] {
		const localModels = context.localModels;
		return localModels ? context.models.filter(model => !!localModels.getDirectModel(model)) : [];
	}

	/** The "On This Device" tab: a row per family; an installed family's row is also its direct model's, so each model is listed once. */
	private _buildLocalModelItems(context: ITabbedModelPickerContext): IActionListItem<IActionWidgetDropdownAction>[] {
		return context.localModels?.getItems({
			models: this._localDirectModels(context),
			selectedModelId: context.selectedModelId,
			configurationAccess: context.configurationAccess,
			select: model => {
				this._selectionVersion++;
				this._applyModelSelection(model, this._context ?? context);
			},
			showDetails: familyId => this._showLocalModelDetails(familyId),
		}) ?? [];
	}

	/** The id of the row of an on-device family: its direct model's, or the family's own. */
	private _getLocalModelRowId(familyId: string, context: ITabbedModelPickerContext): string {
		return this._getLocalDirectModel(familyId, context)?.identifier ?? `${LOCAL_MODEL_PICKER_ITEM_PREFIX}${familyId}`;
	}

	private _getLocalDirectModel(familyId: string, context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier | undefined {
		return this._localDirectModels(context).find(candidate => context.localModels?.getDirectModel(candidate)?.familyId === familyId);
	}

	/** The detail page content of an on-device family, with its direct model and the chat's configuration of it. */
	private _getLocalModelDetails(familyId: string, context: ITabbedModelPickerContext): ILocalModelDetails | undefined {
		const details = context.localModels?.getDetails(familyId);
		const model = details && this._getLocalDirectModel(familyId, context);
		if (!details || !model) {
			return details;
		}
		return {
			...details,
			directModel: {
				model,
				configurationAccess: context.configurationAccess,
				onDidChangeConfiguration: (...change) => {
					context.onConfigurationChanged(model, ...change);
					this._widget.refreshActiveList({ preserveHover: true, preserveScrollPosition: true });
				},
			},
		};
	}

	/** Shows an on-device family's detail page over the open list; it follows {@link setLocalModels}, and Back returns focus to the family's row. */
	private _showLocalModelDetails(familyId: string, returnFocusToRow = false): void {
		const context = this._context;
		const details = context && this._getLocalModelDetails(familyId, context);
		if (!context || !details || !this._showsOnDeviceTab(context)) {
			return;
		}
		this._selectionVersion++;
		this._detailsModelId = undefined;
		this._detailsCard = undefined;
		const card = new LocalModelCard(details, this._openerService, this._accessibilityService);
		this._localModelCard.value = card;
		this._widget.showDetails({
			label: localize('chat.modelPicker.modelDetails', "{0} Details", details.family.displayName),
			backLabel: localize('chat.modelPicker.backToModels', "Back to Models"),
			renderHeader: container => {
				container.appendChild(card.headerElement);
				return toDisposable(() => card.headerElement.remove());
			},
			render: container => {
				container.appendChild(card.element);
				return toDisposable(() => card.element.remove());
			},
			// The page, not its first button, so a repeated Enter can't agree to a download.
			focus: container => container.focus(),
			restoreFocus: () => {
				const rowId = this._getLocalModelRowId(familyId, this._context ?? context);
				return returnFocusToRow ? this._widget.focusItem(rowId) : this._widget.focusItemAction(rowId, LOCAL_MODEL_DETAILS_ACTION_ID);
			},
			onBack: () => {
				this._selectionVersion++;
				if (this._localModelCard.value === card) {
					this._localModelCard.clear();
				}
				if (this._localModelRebuildPending) {
					this._localModelRebuildPending = false;
					this._showCurrent();
				}
			},
		});
	}

	/** HydraFusion's rows: one standing for its tiers when it has them, else one per model. */
	private _hydraFusionRowModels(context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier[] {
		const tiers = this._hydraFusionTiers(context);
		return tiers.length ? [this._hydraFusionRowModel(tiers, context)] : this._hydraFusionModels(context);
	}

	/** The name a row shows: HydraFusion for either of its tiers, the model's own name otherwise. */
	private _getRowLabel(model: ILanguageModelChatMetadataAndIdentifier, context: ITabbedModelPickerContext): string {
		const tiers = this._hydraFusionTiers(context);
		return tiers.includes(model) ? tiers[0].metadata.name : model.metadata.name;
	}

	/**
	 * Auto, listed like any other model, with its tiers in its details. Fusion offers
	 * HydraFusion among its tiers; otherwise HydraFusion gets a row of its own, with
	 * Default and Max as its tiers when HydraFusion Max is available.
	 */
	private _buildRoutingItems(context: ITabbedModelPickerContext): IActionListItem<IActionWidgetDropdownAction>[] {
		const items: IActionListItem<IActionWidgetDropdownAction>[] = [];
		const auto = this._autoModel(context);
		const inlineFusion = this._inlineFusionModel(context);
		if (inlineFusion) {
			return this._buildFusionItems(context, inlineFusion);
		}
		if (auto) {
			items.push(this._createModelItem(auto, context));
		}
		if (this._hostsHydraFusion(context)) {
			return items;
		}
		for (const hydra of this._hydraFusionRowModels(context)) {
			items.push(this._createModelItem(hydra, context));
		}
		return items;
	}

	private _buildFusionItems(context: ITabbedModelPickerContext, fusion: ILanguageModelChatMetadataAndIdentifier): IActionListItem<IActionWidgetDropdownAction>[] {
		const property = getModelConfigProperty(fusion, context.configurationAccess, MODEL_CONFIG_GROUP_EFFORT)!;
		const choices = getModelConfigChoices(property);
		// The provider's tiers already offer HydraFusion's tiers, so its models are listed only while the chat is on one.
		const providerTiers = !!fusion.metadata.autoModelProviderTiers;
		const alternatives = this._hostsHydraFusion(context)
			? this._hydraFusionModels(context).filter(model => !providerTiers || model.identifier === context.selectedModelId)
			: [];
		const selectedAlternative = alternatives.find(model => model.identifier === context.selectedModelId);
		const entries: { readonly choice?: ReturnType<typeof getModelConfigChoices>[number]; readonly model: ILanguageModelChatMetadataAndIdentifier }[] = providerTiers
			? [
				// A chat on a HydraFusion model is shown on the provider tier of the same name. Choosing that tier
				// moves the chat to Fusion, unless the tier is unavailable and the chat has to stay where it is.
				...choices.map(choice => ({ choice, model: selectedAlternative && choice.readOnly && selectedAlternative.metadata.id === choice.value ? selectedAlternative : fusion })),
				...alternatives.filter(model => !choices.some(choice => choice.value === model.metadata.id)).map(model => ({ choice: undefined, model })),
			]
			: [
				...choices.map(choice => ({ choice, model: alternatives.find(model => this._getHydraFusionTier(model, context).replacesTier === choice.value) ?? fusion })),
				...alternatives.filter(model => !this._getHydraFusionTier(model, context).replacesTier).map(model => ({ choice: undefined, model })),
			];
		const organizationDefault = this._getOrganizationDefaultForModel(fusion, context);
		// The organization default is Fusion at its default tier, else its first.
		const organizationDefaultIndex = organizationDefault ? Math.max(0, entries.findIndex(({ choice }) => choice?.isDefault)) : -1;
		const now = Date.now();
		return [
			{ kind: ActionListItemKind.Separator, label: fusion.metadata.name, detail: localize('chat.modelPicker.fusionSubtitle', "Choose the capability for your task") },
			...entries.map(({ choice, model }, index): IActionListItem<IActionWidgetDropdownAction> => {
				const value = choice?.value ?? model.metadata.id;
				const label = getInlineFusionTierLabel(value, choice?.label ?? this._getHydraFusionTier(model, context).label);
				const checked = model === fusion && !!choice && providerTiers && selectedAlternative?.metadata.id === choice.value
					|| model.identifier === context.selectedModelId && (model !== fusion || !!choice?.checked && !selectedAlternative);
				const detail = getInlineFusionTierDetail(value, choice);
				// A managed tier still selects Fusion at the tier in effect; only other managed or unavailable tiers are off.
				const disabled = !!choice?.readOnly && !checked && !(choice.checked && !choice.unavailable);
				const routesFusion = model === fusion && !!choice && !choice.unavailable;
				const discount = routesFusion ? ILanguageModelChatMetadata.getAutoTierDiscountPercent(fusion.metadata, value, now) : undefined;
				const promotion = routesFusion ? ILanguageModelChatMetadata.getAutoTierPromotion(fusion.metadata, value, now) : undefined;
				const promotionWhen = promotion && (ILanguageModelChatMetadata.isAutoTierPromotionUpcoming(promotion, now)
					? ILanguageModelChatMetadata.getPromoStartsAtLabel(promotion.startsAt)
					: ILanguageModelChatMetadata.getPromoEndsAtLabel(promotion.endsAt));
				const promotionText = promotion?.message ? [promotion.message, promotionWhen].filter(Boolean).join(' ') : undefined;
				const organizationDefaultDescription = index === organizationDefaultIndex && organizationDefault ? getOrganizationDefaultDescription(organizationDefault.metadata.name) : undefined;
				const managed = choice && property.schema.readOnly ? localize('chat.modelPicker.fusionManaged', "Managed by the agent host") : undefined;
				return {
					kind: ActionListItemKind.Action,
					label, detail, disabled,
					badge: discount !== undefined ? localize('chat.modelPicker.fusionTierDiscount', "{0}% discount", discount) : undefined,
					additionalBadges: index === organizationDefaultIndex ? this._getOrganizationDefaultBadges(fusion, context) : undefined,
					ariaDescription: [detail, managed, promotionText, organizationDefaultDescription].filter(Boolean).join(', ') || undefined,
					group: { title: '', icon: checked ? Codicon.check : Codicon.blank },
					className: ['chat-model-picker-fusion-tier', ...(discount !== undefined ? ['chat-model-picker-badge-preview'] : [])].join(' '),
					item: {
						id: choice ? `${fusion.identifier}:${choice.value}` : model.identifier,
						label, tooltip: [detail, managed, promotionText, organizationDefaultDescription].filter(Boolean).join(' \u00b7 '), enabled: !disabled, checked, class: undefined,
						run: async () => {
							const version = ++this._selectionVersion;
							if (model === fusion && choice && !choice.readOnly) {
								await setModelConfigValues(fusion, context.configurationAccess, { [property.key]: choice.value }, (...change) => context.onConfigurationChanged(fusion, ...change));
							}
							if (version === this._selectionVersion && this._widget.isVisible) {
								this._applyModelSelection(model, this._context ?? context);
							}
						},
					},
				};
			}),
		];
	}

	private _getUnavailableReason({ entry, needsUpdate }: IModelPickerUnavailableEntry, context: ITabbedModelPickerContext): ReturnType<typeof getUnavailableReason> {
		return needsUpdate ? 'update' : getUnavailableReason(entry, this._entitlementService, context.unavailableContext.currentVSCodeVersion);
	}

	/** Heads models the plan lacks when every one of them is unlocked by upgrading. */
	private _getUpsellSectionLabel(unavailable: readonly IModelPickerUnavailableEntry[], context: ITabbedModelPickerContext): string | undefined {
		return unavailable.length && unavailable.every(entry => this._getUnavailableReason(entry, context) === 'upgrade')
			? localize('chat.modelPicker.upgradeForMoreModels', "Upgrade for More Models")
			: undefined;
	}

	private _getOrganizationDefaultBadges(model: ILanguageModelChatMetadataAndIdentifier, context: ITabbedModelPickerContext): IActionListItem<IActionWidgetDropdownAction>['additionalBadges'] {
		const defaultModel = this._getOrganizationDefaultForModel(model, context);
		return defaultModel ? [{
			label: organizationDefaultLabel,
			className: 'chat-model-picker-org-default-badge',
			tooltip: getOrganizationDefaultDescription(defaultModel.metadata.name),
		}] : undefined;
	}

	private _createModelItem(
		model: ILanguageModelChatMetadataAndIdentifier,
		context: ITabbedModelPickerContext,
		section?: string,
		providerLabel?: string,
	): IActionListItem<IActionWidgetDropdownAction> {
		const comparison = context.comparison;
		const step = comparison?.state.get();
		const useModelConfigurationSchema = !!step;
		const comparisonChecked = !!step?.selectedModelIds.includes(model.identifier);
		const comparisonDisabled = !!step?.multiple && !comparisonChecked && step.selectedModelIds.length >= step.maxSelections;
		const hydraFusionTier = !step && isAutoModel(model) ? this._selectedHydraFusionTier(context) : undefined;
		// HydraFusion as Auto's tier is shown as Auto, with HydraFusion in place of its tier.
		const { action, ariaDescription } = createModelAction(model, step ? undefined : hydraFusionTier ? model.identifier : context.selectedModelId, next => {
			if (comparison && step) {
				// Choosing models to compare supersedes a pending selection.
				this._selectionVersion++;
				comparison.select(model.identifier);
				if (this._searchVisible) {
					// Showing the filtered list again keeps the search field focused with its text.
					this._showCurrent(this._filterValue, model.identifier);
				} else {
					// Update the rows in place, so the list keeps its scroll position and the popup its
					// size; showing the picker again would reveal the checked row at the top of a new list.
					this._widget.refreshActiveList({ focusItemId: model.identifier, preserveScrollPosition: true, preserveSize: true });
				}
				return;
			}
			this._selectionVersion++;
			// Auto with a HydraFusion tier is already in use, so picking Auto keeps it.
			if (isAutoModel(next) && this._selectedHydraFusionTier(this._context ?? context)) {
				return;
			}
			const pair = this._speedVariants.get(next.identifier);
			const selected = pair
				? getPreferredSpeedVariant(pair, this._context?.selectedModelId, this._preferredSpeedVariants.get(pair.standard.identifier))
				: next;
			this._applyModelSelection(selected, this._context ?? context);
		}, section, true);
		const routingModel = isAutoModel(model) || isHydraFusionModel(model);
		const modelBadge = getModelBadge(model, { providerLabel });
		// A routing model's detail, e.g. Auto's discount, is its badge when nothing outranks it.
		// Auto with its HydraFusion tier shows HydraFusion's instead.
		const routingBadge = !modelBadge && routingModel ? (hydraFusionTier ?? model).metadata.detail : undefined;
		const badgeClassName = modelBadge ? `chat-model-picker-badge-${modelBadge.tone}` : routingBadge ? 'chat-model-picker-badge-preview' : undefined;
		const hydraFusionTierLabel = hydraFusionTier && this._getHydraFusionTier(hydraFusionTier, context).label;
		const localDirect = context.localModels?.getDirectModel(model, context.configurationAccess);
		// HydraFusion with tiers of its own is shown as HydraFusion, with its tier as the readout.
		const ownTierLabel = this._hydraFusionTiers(context).includes(model) ? getHydraFusionTierLabel(model.metadata.id) : undefined;
		const tierLabel = hydraFusionTierLabel ?? ownTierLabel;
		const rowLabel = this._getRowLabel(model, context);
		// An on-device model's summary is its family's thinking level and context size.
		const baseSummary = localDirect ? localDirect.summary?.label : tierLabel ?? getModelConfigSummary(model, context.configurationAccess, useModelConfigurationSchema);
		const variants = comparison && step?.multiple && comparisonChecked ? comparison.getVariants(model.identifier) : [];
		// A compared row with variants also names how many extra attempts of it are queued, e.g.
		// "High · 1M +1", so the list reflects the comparison's real attempt count at a glance.
		const summary = variants.length && baseSummary ? localize('chat.modelPicker.comparisonSummaryWithVariants', "{0} +{1}", baseSummary, variants.length) : baseSummary;
		const configDescription = hydraFusionTierLabel
			? localize('chat.modelPicker.autoTierValue', "{0}: {1}", getModelConfigProperty(model, context.configurationAccess, MODEL_CONFIG_GROUP_EFFORT, useModelConfigurationSchema)?.schema.title ?? localize('chat.modelPicker.optimizeFor', "Optimize for"), hydraFusionTierLabel)
			: ownTierLabel
				? localize('chat.modelPicker.hydraFusionTierValue', "Tier: {0}", ownTierLabel)
				: getModelConfigDescription(model, context.configurationAccess, useModelConfigurationSchema);
		const defaultModel = this._getOrganizationDefaultForModel(model, context);
		const defaultDescription = defaultModel && getOrganizationDefaultDescription(defaultModel.metadata.name);
		// Auto opens its tiers like any model's details; HydraFusion only when it has tiers of its own.
		const hasDetails = !isHydraFusionModel(model) || !!ownTierLabel;
		return {
			item: {
				...action,
				label: rowLabel,
				tooltip: rowLabel === action.label ? action.tooltip : rowLabel,
				checked: step ? comparisonChecked : action.checked,
				enabled: step ? !comparisonDisabled : action.enabled,
			},
			kind: ActionListItemKind.Action,
			label: rowLabel,
			description: modelBadge || routingBadge ? undefined : action.description,
			badge: modelBadge?.text ?? routingBadge,
			additionalBadges: this._getOrganizationDefaultBadges(model, context),
			ariaDescription: localDirect
				? localDirect.ariaDescription
				: [ariaDescription, configDescription].filter(Boolean).join(', '),
			// Right Arrow on the row opens the same details as its button.
			opensDialog: hasDetails,
			group: { title: '', icon: step ? (comparisonChecked ? Codicon.check : Codicon.blank) : action.icon ?? ThemeIcon.fromId(action.checked ? Codicon.check.id : Codicon.blank.id) },
			// Choosing several models reads as checkboxes; a single role keeps the plain check mark.
			iconClasses: step?.multiple ? ['chat-model-picker-comparison-checkbox', ...(comparisonChecked ? ['checked', ...ThemeIcon.asClassNameArray(Codicon.check)] : [])] : undefined,
			hideIcon: false,
			section,
			disabled: comparisonDisabled,
			className: ['chat-model-picker-model', ...(!step && action.checked ? ['chat-model-picker-current'] : []), ...(step?.multiple && comparisonChecked ? ['chat-model-picker-comparison-checked'] : []), ...(badgeClassName ? [badgeClassName] : [])].join(' '),
			toolbarLabels: true,
			// An on-device model's details page is its family's.
			toolbarActions: !hasDetails
				? undefined
				: localDirect
					? [createLocalModelDetailsAction(rowLabel, () => this._showLocalModelDetails(localDirect.familyId), summary)]
					: [this._createDetailsAction(model, rowLabel, summary)],
			toolbarDialogActionIds: [MODEL_DETAILS_ACTION_ID, LOCAL_MODEL_DETAILS_ACTION_ID],
			tooltip: [rowLabel, summary, defaultDescription].filter(Boolean).join(' \u00b7 '),
		};
	}

	private _createDetailsAction(model: ILanguageModelChatMetadataAndIdentifier, name: string, summary?: string): IAction {
		return toAction({
			id: MODEL_DETAILS_ACTION_ID,
			label: summary ?? localize('chat.modelPicker.details', "Details"),
			tooltip: summary
				? localize('chat.modelPicker.configurationDetails', "{0} Details, {1}", name, summary)
				: localize('chat.modelPicker.modelDetails', "{0} Details", name),
			run: () => this._showModelDetails(model, true),
		});
	}

	/** Opens a row's details from the keyboard, as its details button does, and returns to the row on Back. */
	private _openItemDetails(item: IActionListItem<IActionWidgetDropdownAction>): boolean {
		const context = this._context;
		const itemId = item.item?.id;
		if (!context || !itemId) {
			return false;
		}
		if (item.toolbarActions?.some(action => action.id === LOCAL_MODEL_DETAILS_ACTION_ID)) {
			const model = context.models.find(candidate => candidate.identifier === itemId);
			const familyId = model
				? context.localModels?.getDirectModel(model)?.familyId
				: itemId.startsWith(LOCAL_MODEL_PICKER_ITEM_PREFIX) ? itemId.slice(LOCAL_MODEL_PICKER_ITEM_PREFIX.length) : undefined;
			if (familyId === undefined) {
				return false;
			}
			this._showLocalModelDetails(familyId, true);
			return true;
		}
		const model = item.toolbarActions?.some(action => action.id === MODEL_DETAILS_ACTION_ID)
			? context.models.find(candidate => candidate.identifier === itemId)
			: undefined;
		if (!model) {
			return false;
		}
		this._showModelDetails(model, true, true);
		return true;
	}

	/**
	 * Shows a queued effort variant in the model's open Details card and in its row, which
	 * only changes the row's summary, so the popup keeps its size once Details closes.
	 */
	private _refreshComparisonVariants(model: ILanguageModelChatMetadataAndIdentifier, context: ITabbedModelPickerContext): void {
		this._getModelCard(model, this._context ?? context).refresh();
		this._widget.refreshActiveList({ preserveScrollPosition: true, preserveSize: true });
	}

	private _getModelCard(model: ILanguageModelChatMetadataAndIdentifier, context: ITabbedModelPickerContext): ModelCard {
		let selectionVersion = this._selectionVersion;
		const routingModel = isAutoModel(model) || isHydraFusionModel(model);
		const comparisonStep = context.comparison?.state.get();
		const isCheckedAttempt = !!(context.comparison && comparisonStep?.multiple && comparisonStep.selectedModelIds.includes(model.identifier));
		// The provider's tiers decide which HydraFusion tiers Fusion offers, including hidden ones, so its
		// models are not added beside them unless the chat is on one.
		const hydraFusionModels = isAutoModel(model) && this._hostsHydraFusion(context)
			? this._hydraFusionModels(context).filter(hydraFusion => !model.metadata.autoModelProviderTiers || hydraFusion.identifier === context.selectedModelId)
			: [];
		const hydraFusionTiers = this._hydraFusionTiers(context);
		const ownTiers = hydraFusionTiers.includes(model) ? hydraFusionTiers : [];
		const cardOptions: IModelCardOptions = {
			model,
			name: ownTiers.length ? this._getRowLabel(model, context) : undefined,
			// Both tiers share HydraFusion's description.
			description: ownTiers[0]?.metadata.tooltip,
			configurationAccess: context.configurationAccess,
			isUBB: context.isUBB,
			openerService: this._openerService,
			isPinned: this._pinnedVariantIds(model.identifier, context).length > 0,
			organizationDefaultModel: this._getOrganizationDefaultForModel(model, context),
			externalHeader: true,
			pricingDisclosure: this._pricingDisclosure,
			speedVariants: this._speedVariants.get(model.identifier),
			comparisonVariants: isCheckedAttempt ? {
				list: context.comparison!.getVariants(model.identifier),
				onAdd: (configuration, label, baseConfiguration) => {
					context.comparison!.addVariant(model.identifier, configuration, label, baseConfiguration);
					this._refreshComparisonVariants(model, context);
				},
				onRemove: index => {
					context.comparison!.removeVariant(model.identifier, index);
					this._refreshComparisonVariants(model, context);
				},
			} : undefined,
			modelChoices: ownTiers.length ? {
				ariaLabel: localize('chat.modelPicker.hydraFusionTiers', "HydraFusion tier"),
				choices: ownTiers.map(tier => ({ label: getHydraFusionTierLabel(tier.metadata.id), model: tier })),
			} : undefined,
			// Only Fusion offers HydraFusion among its tiers, each described as the tier it is.
			routingAlternatives: hydraFusionModels.map(hydraFusion => {
				const tier = this._getHydraFusionTier(hydraFusion, context);
				return {
					model: hydraFusion,
					label: tier.label,
					replacesTier: tier.replacesTier,
					selectsTier: tier.selectsTier,
					description: hydraFusion.metadata.id === COPILOT_HYDRA_FUSION_MAX_MODEL_ID
						? localize('chat.modelPicker.fusionMaxDescription', "Max uses multiple models on every task for the most thorough results.")
						: localize('chat.modelPicker.fusionHighDescription', "High picks a workflow per task, using one or more models."),
					learnMoreUrl: HYDRA_FUSION_LEARN_MORE_URL,
					selected: context.selectedModelId === hydraFusion.identifier,
				};
			}),
			onWillSelect: () => { selectionVersion = ++this._selectionVersion; },
			onSelect: next => {
				if (selectionVersion === this._selectionVersion && this._widget.isVisible && next.identifier !== (this._context ?? context).selectedModelId) {
					this._rememberSpeedVariant(next.identifier);
					// HydraFusion is chosen from Auto's tiers, so Auto's details stay open.
					if (!hydraFusionModels.includes(next)) {
						this._detailsModelId = next.identifier;
					}
					this._applyModelSelection(next, this._context ?? context);
				}
			},
			selectModelOnConfigurationChange: !context.comparison?.state.get(),
			useModelConfigurationSchema: !!comparisonStep,
			onDidAccept: () => {
				this.refresh();
			},
			onTogglePin: context.onTogglePin && !routingModel
				? pinned => this._togglePin(model.identifier, pinned)
				: undefined,
			onDidChangeConfiguration: (...change) => {
				const [group, key, , toValue] = change;
				if (context.comparison?.state.get() && group === MODEL_CONFIG_GROUP_EFFORT && isComparisonConfigurationValue(toValue)) {
					context.comparison?.reconcileVariants?.(model.identifier, { [key]: toValue });
				}
				context.onConfigurationChanged(model, ...change);
			},
		};
		const key = this._speedVariants.get(model.identifier)?.standard.identifier ?? ownTiers[0]?.identifier ?? model.identifier;
		let card = this._detailsModelId === model.identifier ? this._detailsCard : undefined;
		card ??= this._cards.get(key);
		if (card) {
			card.update(cardOptions);
		} else {
			card = new ModelCard(cardOptions);
			this._cards.set(key, card);
		}
		return card;
	}

	private _showModelDetails(model: ILanguageModelChatMetadataAndIdentifier, focusConfiguration = false, returnFocusToRow = false): void {
		const context = this._context;
		if (!context) {
			return;
		}
		this._selectionVersion++;
		this._detailsCard = undefined;
		this._localModelCard.clear();
		this._detailsModelId = model.identifier;
		const card = this._getModelCard(model, context);
		card.refresh();
		this._detailsCard = card;
		this._widget.showDetails({
			label: localize('chat.modelPicker.modelDetails', "{0} Details", this._getRowLabel(model, context)),
			backLabel: localize('chat.modelPicker.backToModels', "Back to Models"),
			renderHeader: container => {
				container.appendChild(card.headerElement);
				return toDisposable(() => card.headerElement.remove());
			},
			render: container => {
				const store = new DisposableStore();
				const hint = context.configurationCacheBreakHint;
				if (hint) {
					const message = hint.link ? `${hint.text} [${hint.link.label}](${hint.link.uri.toString()})` : hint.text;
					const banner = createMessageBanner(message, 'chat-model-picker-configuration-hint', Codicon.info, store, this._openerService);
					const actions = store.add(new ActionBar(banner));
					actions.push(toAction({
						id: 'chat.modelPicker.dismissConfigurationHint',
						label: localize('chat.modelPicker.dismissConfigurationHint', "Dismiss Hint"),
						class: ThemeIcon.asClassName(Codicon.close),
						run: () => {
							hint.dismiss();
							card.focus();
							banner.remove();
							if (this._context) {
								this._context = { ...this._context, cacheBreakHint: undefined, configurationCacheBreakHint: undefined };
							}
							this._widget.refreshActiveList();
						},
					}), { icon: true, label: false });
					container.appendChild(banner);
				}
				container.appendChild(card.element);
				store.add(toDisposable(() => card.element.remove()));
				return store;
			},
			focus: container => {
				if (focusConfiguration) {
					card.focus();
				} else {
					container.focus();
				}
			},
			restoreFocus: () => returnFocusToRow
				? this._widget.focusItem(this._detailsModelId ?? model.identifier)
				: this._widget.focusItemAction(this._detailsModelId ?? model.identifier, MODEL_DETAILS_ACTION_ID),
			onBack: () => {
				this._selectionVersion++;
				this._detailsModelId = undefined;
				this._detailsCard = undefined;
			},
		});
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
		this.refresh();
	}

	private _applyModelSelection(model: ILanguageModelChatMetadataAndIdentifier, context: ITabbedModelPickerContext, resetComparison = true): void {
		if (resetComparison) {
			context.comparison?.reset();
		}
		this._context = { ...context, selectedModelId: model.identifier };
		this._rememberHydraFusionTier(this._context);
		context.onSelect(model);
	}

	/** Remembers a HydraFusion tier in use, so HydraFusion's row keeps standing for it once another model is chosen. */
	private _rememberHydraFusionTier(context: ITabbedModelPickerContext): void {
		if (this._hydraFusionTiers(context).some(model => model.identifier === context.selectedModelId)) {
			this._preferredHydraFusionTier = context.selectedModelId;
		}
	}

	/** Restores a usable manual model from Copilot: never a routing model, another provider, or an on-device model (selecting one loads it). */
	private _fallbackModel(context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier | undefined {
		const isCandidate = (model: ILanguageModelChatMetadataAndIdentifier) => !isAutoModel(model) && !isHydraFusionModel(model)
			&& !isUserProvidedModel(model, this._languageModelsService)
			&& !requiresNewerVSCode(model, context.controlModels, context.unavailableContext.currentVSCodeVersion)
			&& !context.localModels?.getDirectModel(model);
		const candidates = [...context.recentModelIds, ...context.pinnedModelIds];
		for (const id of candidates) {
			const model = context.models.find(candidate => candidate.identifier === id);
			if (model && isCandidate(model)) {
				return model;
			}
		}
		return context.models.find(isCandidate);
	}
}
