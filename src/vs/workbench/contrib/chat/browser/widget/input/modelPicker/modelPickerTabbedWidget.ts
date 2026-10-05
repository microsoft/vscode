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
import { AnchorPosition } from '../../../../../../../base/common/layout.js';
import { onUnexpectedError } from '../../../../../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { ActionListItemKind, IActionListHeaderLink, IActionListItem } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetDropdownAction } from '../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ITabBarAction, ITabDescriptor, TabbedActionListWidget } from '../../../../../../../platform/actionWidget/browser/tabbedActionListWidget.js';
import { COPILOT_HYDRA_FUSION_MODEL_ID } from '../../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IContextViewService } from '../../../../../../../platform/contextview/browser/contextView.js';
import { defaultButtonStyles, defaultSelectBoxStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import { StateType } from '../../../../../../../platform/update/common/update.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, IModelControlEntry, isUserProvidedModel } from '../../../../common/languageModels.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { resolveConfiguredModel } from '../../../../common/modelSelection.js';
import { withChatInputPickerMotion } from '../chatInputPickerActionItem.js';
import { getModelConfigChoices, getModelConfigDescription, getModelConfigProperty, getModelConfigSummary, IModelConfigProperty, IModelConfigurationAccess, MODEL_CONFIG_GROUP_EFFORT, ModelConfigChangeListener, setModelConfigValues } from './modelPickerModelConfig.js';
import { IModelCardOptions, IPricingDisclosure, ModelCard } from './modelPickerCard.js';
import { getPreferredSpeedVariant, IModelSpeedVariants } from './modelPickerVariants.js';
import { getModelBadge, getOrganizationDefaultDescription, organizationDefaultLabel } from './modelPickerBadges.js';
import { createModelAction, createModelItem, createUnavailableModelItem, getUnavailableReason, requiresNewerVSCode } from './modelPickerItemPrimitives.js';
import { getModelPickerAccessibilityProvider, getModelPickerControlModels } from './modelPickerItems.js';
import { filterModelPickerControlModelsForEntitlement, filterModelPickerModelsForEntitlement, isAutoModel, isHydraFusionModel, isHydraFusionUpgradeOnly } from './modelPickerPresentation.js';
import { buildModelPickerDestinations, buildModelPickerSections, getModelProviderLabel, hasPromotedModels, IModelPickerDestination, IModelPickerProviderPlaceholder, IModelPickerSections, IModelPickerUnavailableEntry, MODEL_PICKER_BUILT_IN_DESTINATION } from './modelPickerTabs.js';
import { ModelPickerWelcome } from './modelPickerWelcome.js';
import { createMessageBanner, HYDRA_FUSION_LEARN_MORE_URL } from './modelPickerHover.js';
import { IModelPickerWorkflow } from './modelPickerWorkflow.js';

/** The collapsible section holding models that are neither pinned, recommended nor recent. */
const OTHER_MODELS_SECTION = 'other';
const PICKER_WIDTH = 320;
const PRICING_EXPANDED_STORAGE_KEY = 'chat.modelPicker.pricingExpanded';
const MODEL_DETAILS_ACTION_ID = 'chat.modelPicker.details';
const AUTO_TIER_ACTION_PREFIX = 'autoTier:';

/** Everything the picker needs for one showing, gathered by the owning widget. */
export interface ITabbedModelPickerContext {
	readonly workflow?: IModelPickerWorkflow;
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
	/** Reports that the user opened search or typed a search query. */
	readonly onDidSearch: () => void;
	/** Reports a configuration change made from a model's details. */
	readonly onConfigurationChanged: (model: ILanguageModelChatMetadataAndIdentifier, ...change: Parameters<ModelConfigChangeListener>) => void;
	/** Warning banner shown when switching options mid-session would reset the prompt cache. */
	readonly cacheBreakHint: { readonly text: string; readonly link: IActionListHeaderLink | undefined; readonly dismiss: () => void } | undefined;
	readonly configurationCacheBreakHint?: ITabbedModelPickerContext['cacheBreakHint'];
}

/** A provider-tabbed picker with Copilot routing modes and a drill-in configuration page. */
export class TabbedModelPicker extends Disposable {

	private readonly _onDidHide = this._register(new Emitter<void>());
	readonly onDidHide = this._onDidHide.event;

	private readonly _widget: TabbedActionListWidget;
	private readonly _cards = this._register(new DisposableMap<string, ModelCard>());
	private readonly _configurationListener = this._register(new MutableDisposable());
	private _detailsModelId: string | undefined;
	private _detailsCard: ModelCard | undefined;
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
	private readonly _speedVariants = new Map<string, IModelSpeedVariants>();
	private readonly _preferredSpeedVariants = new Map<string, string>();
	private _selectionVersion = 0;
	private _models: readonly ILanguageModelChatMetadataAndIdentifier[] = [];
	/** The manual Copilot model to restore when Auto is switched off. */
	private _lastExplicitModelId: string | undefined;
	private _lastRoutingModelId: string | undefined;
	/** Copilot's view mode is retained while another provider is being browsed. */
	private _autoMode = false;

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
	) {
		super();
		this._widget = this._register(instantiationService.createInstance(TabbedActionListWidget));
		this._register(this._widget.onDidChangeTab(id => { this._activeDestination = id; }));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.DefaultModel)) {
				this.refresh();
			}
		}));
		this._register(this._entitlementService.onDidChangeEntitlement(() => {
			if (!this.isVisible || !this._context) {
				return;
			}
			this._context = this._refreshContextForModels(this._context, this._models);
			if (this._context.selectedModelId && !this._context.models.some(model => model.identifier === this._context?.selectedModelId)) {
				const fallback = this._autoModel(this._context) ?? this._fallbackModel(this._context);
				if (fallback) {
					this._applyModelSelection(fallback, this._context, false);
				}
			}
			this.refresh();
		}));
		this._register(this._widget.onDidHide(() => {
			this._context?.workflow?.cancel();
			// Search is a transient view. Left on, it would also size the next popup from
			// its flattened cross-provider list.
			this._searchVisible = false;
			this._filterValue = '';
			this._selectionVersion++;
			this._detailsModelId = undefined;
			this._detailsCard = undefined;
			this._configurationListener.clear();
			this._cards.clearAndDisposeAll();
			this._onDidHide.fire();
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

	openWithFilter(options: IModelPickerOpenOptions): void {
		this._searchVisible = true;
		this._showCurrent(options.initialFilterValue, options.initialFocusItemId);
	}

	show(anchor: HTMLElement, context: ITabbedModelPickerContext, detailsModelId?: string, focusConfiguration = false, contextViewLayer?: number, options?: IModelPickerOpenOptions): void {
		if (!this._widget.isVisible) {
			this._activeDestination = undefined;
			if (context.workflow?.available.get() && context.workflow.summary.get()) {
				context.workflow.start();
			}
		}
		this._anchor = anchor;
		this._selectionVersion++;
		this._models = context.models;
		const pickerContext = this._filterModelsForEntitlement(context);
		this._context = pickerContext;
		this._configurationListener.value = context.configurationAccess.onDidChange?.(() => this.refresh());
		this._contextViewLayer = contextViewLayer;
		this._rememberSelection(pickerContext.selectedModelId);
		if (options?.initialFilterValue !== undefined) {
			this._searchVisible = true;
		}
		this._showCurrent(options?.initialFilterValue, options?.initialFocusItemId);
		const detailsModel = pickerContext.models.find(model => model.identifier === detailsModelId);
		if (detailsModel && !isAutoModel(detailsModel) && !isHydraFusionModel(detailsModel)) {
			this._showModelDetails(detailsModel, focusConfiguration);
		}
	}

	setSelectedModel(modelId: string | undefined): void {
		if (this._context && this._context.selectedModelId !== modelId) {
			this._selectionVersion++;
			this._context = { ...this._context, selectedModelId: modelId };
			this._rememberSelection(modelId);
			this.refresh();
		}
	}

	refresh(models?: readonly ILanguageModelChatMetadataAndIdentifier[]): void {
		if (!this.isVisible || !this._context) {
			return;
		}
		if (models) {
			this._models = models;
			this._context = this._refreshContextForModels(this._context, this._models);
		}
		const destinations = this._buildDestinations(this._context);
		if (!destinations.length) {
			this.hide();
			return;
		}
		if (models) {
			this._speedVariants.clear();
			for (const destination of destinations) {
				this._buildSections(destination, this._context);
			}
		}
		const model = this._context.models.find(model => model.identifier === this._detailsModelId);
		if (this._detailsModelId && !model) {
			this._widget.refreshActiveList();
			this._widget.hideDetails();
			return;
		} else if (model) {
			this._getModelCard(model, this._context).refresh();
		}
		this._widget.refreshActiveList();
	}

	private _filterModelsForEntitlement(context: ITabbedModelPickerContext): ITabbedModelPickerContext {
		return {
			...context,
			models: filterModelPickerModelsForEntitlement(context.models, this._entitlementService.entitlement, this._languageModelsService),
			controlModels: filterModelPickerControlModelsForEntitlement(context.controlModels, context.models, this._entitlementService.entitlement, this._languageModelsService),
		};
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
		const context = this._context;
		const anchor = this._anchor;
		if (!context || !anchor) {
			return;
		}
		this._filterValue = this._searchVisible ? initialFilterValue ?? '' : '';

		this._speedVariants.clear();
		this._detailsModelId = undefined;
		this._detailsCard = undefined;
		this._cards.clearAndDisposeAll();
		const workflow = context.workflow?.available.get() ? context.workflow : undefined;
		const step = workflow?.state.get();
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
			tabs: destinations.map((destination): ITabDescriptor => {
				// Auto can't be turned off when it's the only choice, so the tab is named after it.
				const label = destination.id === MODEL_PICKER_BUILT_IN_DESTINATION && this._isAutoOnly(context)
					? localize('chat.modelPicker.auto', "Auto")
					: destination.label;
				return {
					id: destination.id,
					label,
					icon: destination.icon,
					tooltip: label,
					toggle: !step && destination.id === MODEL_PICKER_BUILT_IN_DESTINATION ? {
						label: localize('chat.modelPicker.auto', "Auto"),
						ariaLabel: localize('chat.modelPicker.autoModeToggle', "Use Auto mode in {0}", destination.label),
						getState: () => this._getAutoModeToggleState(this._context ?? context),
						onChange: enabled => this._toggleAutoMode(enabled),
					} : undefined,
				};
			}),
			initialTab: this._activeDestination,
			// The built-in provider fixes the popup's height, unless all it lists is what an
			// upgrade would unlock, which is too short to hold another provider's models.
			sizingTab: this._hasBuiltInChoices(context) ? MODEL_PICKER_BUILT_IN_DESTINATION : undefined,
			contextViewLayer: this._contextViewLayer,
			tabBarActions: this._buildTabBarActions(context),
			tabBarClassName: 'chat-model-picker-tabbar',
			widgetClassNames: () => [
				'chat-model-picker-widget',
				...(step ? ['model-picker-workflow'] : []),
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
				const isBuiltIn = destination.id === MODEL_PICKER_BUILT_IN_DESTINATION;
				// Size to the Copilot tab, whichever Copilot mode is selected: the taller of
				// its model list and its Auto view, unless Auto is all there is.
				const showAuto = !step && isBuiltIn && (forSizing
					? this._isAutoOnly(current)
					: this._isAutoMode(current));
				const alternateSizingItems = forSizing && isBuiltIn && !showAuto && (this._autoModel(current) || this._hydraFusionModel(current))
					? [this._buildAutoModeItems(destination, sections, current)]
					: undefined;
				// Search spans every destination at once, so each model names its provider.
				const searching = this._searchVisible && !forSizing;
				const items = searching
					? currentDestinations.flatMap(candidate => this._buildSearchItems(candidate, candidate === destination ? sections : this._buildSections(candidate, current), current))
					: showAuto
						? this._buildAutoModeItems(destination, sections, current)
						: this._buildItems(destination, sections, current);
				const hint = step ? { text: `${step.title}\n${step.description}`, link: undefined, dismiss: undefined } : current.cacheBreakHint ?? current.configurationCacheBreakHint;
				const baseListOptions = withChatInputPickerMotion({
					className: 'chat-model-picker-dropdown chat-model-picker-tabbed',
					stopToolbarPointerPropagation: true,
					tabThroughItemActions: true,
					detailItemHeight: 64,
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
					collapsedByDefault: !step && hasPromotedModels(sections) ? new Set([OTHER_MODELS_SECTION]) : undefined,
					onDidToggleSection: (section, collapsed) => {
						if (section === OTHER_MODELS_SECTION) {
							current.onDidToggleOtherModels(collapsed);
						}
					},
					linkHandler: uri => current.onUnavailableLinkClick(uri),
					maxWidth: PICKER_WIDTH,
					hideDefaultKeybindingTooltip: true,
					reserveSubmenuSpace: false,
				});
				const listOptions = anchor.closest('.monaco-dialog-box')
					? { ...baseListOptions, anchorPosition: AnchorPosition.BELOW }
					: baseListOptions;
				return {
					items: step ? items.filter(item => !item.item || !current.models.some(model => model.identifier === item.item?.id && (isAutoModel(model) || isHydraFusionModel(model)))) : items,
					listOptions,
					alternateSizingItems,
				};
			},
			renderFooter: workflow && step ? container => this._renderWorkflowFooter(container, workflow) : undefined,
			renderEmpty: (container, activeTab) => {
				const destination = destinations.find(candidate => candidate.id === activeTab);
				if (!destination?.placeholders.length) {
					return undefined;
				}
				const welcome = new ModelPickerWelcome(destination);
				container.appendChild(welcome.element);
				return welcome;
			},
			delegate: {
				onSelect: action => {
					void action.run();
					if (!step) {
						this._widget.hide();
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

	private _buildDestinations(context: ITabbedModelPickerContext): IModelPickerDestination[] {
		const autoModel = this._autoModel(context);
		const hydraFusionModel = this._hydraFusionModel(context);
		return buildModelPickerDestinations(context.models, this._languageModelsService, context.providerPlaceholders, model => model === autoModel || model === hydraFusionModel, this._hasBuiltInUpsells(context));
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
		return !!(this._autoModel(context) || this._hydraFusionModel(context) || this._fallbackModel(context));
	}

	private _autoModel(context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier | undefined {
		return context.models.find(model => isAutoModel(model) && !isUserProvidedModel(model, this._languageModelsService) && !requiresNewerVSCode(model, context.controlModels, context.unavailableContext.currentVSCodeVersion));
	}

	/** Only offer HydraFusion as a routing choice when this build can run it. */
	private _hydraFusionModel(context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier | undefined {
		return context.models.find(model => isHydraFusionModel(model) && !isUserProvidedModel(model, this._languageModelsService) && !requiresNewerVSCode(model, context.controlModels, context.unavailableContext.currentVSCodeVersion));
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

	private _isAutoMode(context: ITabbedModelPickerContext): boolean {
		return (this._autoMode || this._isAutoOnly(context)) && !!(this._autoModel(context) || this._hydraFusionModel(context));
	}

	/** Whether the plan offers Copilot only through routing, with no individual Copilot model to switch to. */
	private _isAutoOnly(context: ITabbedModelPickerContext): boolean {
		return !!(this._autoModel(context) || this._hydraFusionModel(context)) && !this._fallbackModel(context);
	}

	private _rememberSelection(modelId: string | undefined): void {
		const model = this._context?.models.find(model => model.identifier === modelId);
		if (!model || isUserProvidedModel(model, this._languageModelsService)) {
			return;
		}
		this._autoMode = isAutoModel(model) || isHydraFusionModel(model);
		if (this._autoMode) {
			this._lastRoutingModelId = model.identifier;
		} else {
			this._lastExplicitModelId = model.identifier;
		}
	}

	private _destinationForSelectedModel(destinations: readonly IModelPickerDestination[], context: ITabbedModelPickerContext): string | undefined {
		if (context.selectedModelId === this._autoModel(context)?.identifier || context.selectedModelId === this._hydraFusionModel(context)?.identifier) {
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
		const configuredDefault = this._configurationService.inspect<string>(ChatConfiguration.DefaultModel).policyValue?.trim();
		return resolveConfiguredModel(configuredDefault, context.models);
	}

	private _getOrganizationDefaultForModel(model: ILanguageModelChatMetadataAndIdentifier, context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier | undefined {
		const defaultModel = this._getOrganizationDefaultModel(context);
		const variants = this._speedVariants.get(model.identifier);
		return defaultModel && (defaultModel.identifier === model.identifier
			|| defaultModel.identifier === variants?.standard.identifier
			|| defaultModel.identifier === variants?.fast.identifier) ? defaultModel : undefined;
	}

	private _buildTabBarActions(context: ITabbedModelPickerContext): ITabBarAction[] {
		const actions: ITabBarAction[] = [];
		const workflow = context.workflow;
		if (workflow?.available.get()) {
			actions.push({
				id: 'workflow',
				icon: Codicon.layers,
				tooltip: workflow.label,
				checked: !!workflow.state.get(),
				run: () => {
					if (workflow.state.get()) {
						workflow.cancel();
					} else {
						workflow.start();
					}
					this._showCurrent();
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
		return actions;
	}

	private _renderWorkflowFooter(container: HTMLElement, workflow: IModelPickerWorkflow): DisposableStore {
		const store = new DisposableStore();
		const step = workflow.state.get()!;
		container.classList.add('model-picker-workflow-footer');
		if (step.count) {
			const count = step.count;
			const row = dom.append(container, dom.$('.model-picker-workflow-count'));
			dom.append(row, dom.$('span')).textContent = count.label;
			const select = store.add(new SelectBox(
				Array.from({ length: count.max - count.min + 1 }, (_, index) => ({ text: String(index + count.min) })),
				count.value - count.min, this._contextViewService, defaultSelectBoxStyles,
				{ ariaLabel: count.label, contextViewLayer: (this._contextViewLayer ?? 0) + 1 },
			));
			select.render(row);
			store.add(select.onDidSelect(event => workflow.setCount(event.index + count.min)));
		}
		const actions = dom.append(container, dom.$('.model-picker-workflow-actions'));
		const cancel = store.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
		cancel.label = localize('modelPicker.workflow.cancel', "Cancel");
		store.add(cancel.onDidClick(() => this._widget.hide()));
		if (step.canGoBack) {
			const back = store.add(new Button(actions, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
			back.label = localize('modelPicker.workflow.back', "{0} Back", '$(arrow-left)');
			store.add(back.onDidClick(() => {
				workflow.back();
				this._searchVisible = false;
				this._showCurrent();
				status(workflow.state.get()!.title);
			}));
		}
		const next = store.add(new Button(actions, { ...defaultButtonStyles, supportIcons: true }));
		next.label = step.canFinish ? localize('modelPicker.workflow.done', "Done") : localize('modelPicker.workflow.next', "Next {0}", '$(arrow-right)');
		next.enabled = step.canFinish || step.canGoNext;
		store.add(next.onDidClick(() => {
			if (step.canFinish) {
				workflow.finish();
				this._widget.hide();
			} else {
				workflow.next();
				this._searchVisible = false;
				this._showCurrent();
				status(workflow.state.get()!.title);
			}
		}));
		return store;
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
		const upsellLabel = destination.id === MODEL_PICKER_BUILT_IN_DESTINATION && !this._fallbackModel(context)
			? this._getUpsellSectionLabel(sections.unavailable, context)
			: undefined;
		if (upsellLabel) {
			appendSection(undefined, sections.suggested);
			appendSection(upsellLabel, [], sections.unavailable);
		} else {
			appendSection(undefined, sections.suggested, sections.unavailable);
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
		const routingModels = destination.id === MODEL_PICKER_BUILT_IN_DESTINATION
			? [this._autoModel(context), this._hydraFusionModel(context)].filter((model): model is ILanguageModelChatMetadataAndIdentifier => !!model)
			: [];
		return [...sections.pinned, ...sections.suggested, ...sections.other, ...routingModels]
			.sort((left, right) => left.metadata.name.localeCompare(right.metadata.name))
			.map(model => this._createModelItem(model, context, undefined, getModelProviderLabel(model, this._languageModelsService)));
	}

	private _buildAutoModeItems(destination: IModelPickerDestination, sections: IModelPickerSections, context: ITabbedModelPickerContext): IActionListItem<IActionWidgetDropdownAction>[] {
		const items: IActionListItem<IActionWidgetDropdownAction>[] = [];
		const auto = this._autoModel(context);
		if (auto) {
			const property = getModelConfigProperty(auto, context.configurationAccess, MODEL_CONFIG_GROUP_EFFORT);
			if (property) {
				const title = property.schema.title ?? localize('chat.modelPicker.optimizeFor', "Optimize for");
				items.push({
					kind: ActionListItemKind.Separator,
					label: auto.metadata.detail ? localize('chat.modelPicker.autoHeading', "{0} · {1}", title, auto.metadata.detail) : title,
					additionalBadges: this._getOrganizationDefaultBadges(auto, context),
				});
				for (const { index, value, label, description: detail, checked: tierChecked, readOnly } of getModelConfigChoices(property)) {
					const id = `${AUTO_TIER_ACTION_PREFIX}${auto.identifier}/${index}`;
					const checked = context.selectedModelId === auto.identifier && tierChecked;
					const disabled = readOnly && !tierChecked;
					items.push({
						...createModelItem(toAction({
							id, label, checked, enabled: !disabled,
							tooltip: [label, detail].filter(Boolean).join(' \u00b7 '),
							run: () => this._selectAutoTier(auto, property, value).catch(onUnexpectedError),
						})),
						detail,
						disabled,
						ariaDescription: detail,
						className: ['chat-model-picker-model', 'chat-model-picker-routing-model', ...(checked ? ['chat-model-picker-current'] : [])].join(' '),
					});
				}
			} else {
				items.push(this._createModelItem(auto, context));
			}
		}

		const hydra = this._hydraFusionModel(context);
		const unavailableHydra = sections.unavailable.filter(entry => entry.id === COPILOT_HYDRA_FUSION_MODEL_ID);
		if (hydra || unavailableHydra.length) {
			items.push({ kind: ActionListItemKind.Separator, label: localize('chat.modelPicker.alternativeRouting', "Alternative routing") });
			if (hydra) {
				const item = this._createModelItem(hydra, context);
				const description = localize('chat.modelPicker.hydraFusionDescription', "Picks a workflow per task, using one or more models to draft, review, or escalate.");
				items.push({
					...item,
					detail: description,
					detailLink: { label: localize('chat.modelPicker.learnMore', "Learn more"), uri: HYDRA_FUSION_LEARN_MORE_URL },
					badge: item.badge ?? hydra.metadata.detail,
					ariaDescription: [item.ariaDescription, description].filter(Boolean).join(', '),
					tooltip: [item.tooltip, description].filter(Boolean).join(' \u00b7 '),
					className: `${item.className} chat-model-picker-routing-model${!item.badge && hydra.metadata.detail ? ' chat-model-picker-badge-preview' : ''}`,
				});
			}
			for (const unavailableEntry of unavailableHydra) {
				items.push(createUnavailableModelItem(unavailableEntry.id, unavailableEntry.entry, this._getUnavailableReason(unavailableEntry, context), context.unavailableContext.manageSettingsUrl, context.unavailableContext.updateStateType, this._entitlementService));
			}
		}
		if (!this._fallbackModel(context)) {
			items.push(...this._buildItems(destination, { ...sections, unavailable: sections.unavailable.filter(entry => entry.id !== COPILOT_HYDRA_FUSION_MODEL_ID) }, context));
		}
		return items;
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

	private async _selectAutoTier(model: ILanguageModelChatMetadataAndIdentifier, property: IModelConfigProperty, value: IModelConfigProperty['value']): Promise<void> {
		const context = this._context;
		if (!context) {
			return;
		}
		this._selectionVersion++;
		if (!property.schema.readOnly) {
			await setModelConfigValues(model, context.configurationAccess, { [property.key]: value },
				(...change) => context.onConfigurationChanged(model, ...change));
		}
		// Choosing a tier closes the picker, so this can run after it hid. Switch to
		// Auto only once the tier is saved, and not over a model chosen since.
		const current = this._context;
		if (current?.configurationAccess === context.configurationAccess && current.selectedModelId === context.selectedModelId && current.selectedModelId !== model.identifier) {
			this._applyModelSelection(model, current);
		}
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
		const workflow = context.workflow;
		const step = workflow?.state.get();
		if (workflow && step) {
			const checked = step.selectedModelIds.includes(model.identifier);
			const disabled = step.multiple && !checked && step.selectedModelIds.length >= step.maxSelections;
			const { action, ariaDescription } = createModelAction(model, undefined, () => {
				workflow.select(model.identifier);
				this._showCurrent(this._filterValue, model.identifier);
			}, section, true);
			return {
				item: { ...action, checked, enabled: !disabled },
				kind: ActionListItemKind.Action,
				label: action.label,
				ariaDescription,
				group: { title: '', icon: checked ? Codicon.check : Codicon.blank },
				hideIcon: false,
				section,
				disabled,
				className: 'chat-model-picker-model',
			};
		}
		const { action, ariaDescription } = createModelAction(model, context.selectedModelId, next => {
			this._selectionVersion++;
			const pair = this._speedVariants.get(next.identifier);
			const selected = pair
				? getPreferredSpeedVariant(pair, this._context?.selectedModelId, this._preferredSpeedVariants.get(pair.standard.identifier))
				: next;
			this._applyModelSelection(selected, this._context ?? context);
			if (isAutoModel(selected) || isHydraFusionModel(selected)) {
				this.refresh();
			}
		}, section, true);
		const badge = getModelBadge(model, { providerLabel });
		const summary = getModelConfigSummary(model, context.configurationAccess);
		const defaultModel = this._getOrganizationDefaultForModel(model, context);
		const defaultDescription = defaultModel && getOrganizationDefaultDescription(defaultModel.metadata.name);
		return {
			item: action,
			kind: ActionListItemKind.Action,
			label: action.label,
			description: badge ? undefined : action.description,
			badge: badge?.text,
			additionalBadges: this._getOrganizationDefaultBadges(model, context),
			ariaDescription: [ariaDescription, getModelConfigDescription(model, context.configurationAccess)].filter(Boolean).join(', '),
			group: { title: '', icon: action.icon ?? ThemeIcon.fromId(action.checked ? Codicon.check.id : Codicon.blank.id) },
			hideIcon: false,
			section,
			className: ['chat-model-picker-model', ...(action.checked ? ['chat-model-picker-current'] : []), ...(badge ? [`chat-model-picker-badge-${badge.tone}`] : [])].join(' '),
			toolbarLabels: true,
			toolbarActions: isAutoModel(model) || isHydraFusionModel(model) ? undefined : [this._createDetailsAction(model, summary)],
			tooltip: [model.metadata.name, summary, defaultDescription].filter(Boolean).join(' \u00b7 '),
		};
	}

	private _createDetailsAction(model: ILanguageModelChatMetadataAndIdentifier, summary?: string): IAction {
		return toAction({
			id: MODEL_DETAILS_ACTION_ID,
			label: summary ?? localize('chat.modelPicker.details', "Details"),
			tooltip: summary
				? localize('chat.modelPicker.configurationDetails', "{0} Details, {1}", model.metadata.name, summary)
				: localize('chat.modelPicker.modelDetails', "{0} Details", model.metadata.name),
			run: () => this._showModelDetails(model, true),
		});
	}

	private _getModelCard(model: ILanguageModelChatMetadataAndIdentifier, context: ITabbedModelPickerContext): ModelCard {
		let selectionVersion = this._selectionVersion;
		const routingModel = isAutoModel(model) || isHydraFusionModel(model);
		const cardOptions: IModelCardOptions = {
			model,
			configurationAccess: context.configurationAccess,
			isUBB: context.isUBB,
			openerService: this._openerService,
			isPinned: this._pinnedVariantIds(model.identifier, context).length > 0,
			organizationDefaultModel: this._getOrganizationDefaultForModel(model, context),
			externalHeader: true,
			pricingDisclosure: this._pricingDisclosure,
			speedVariants: this._speedVariants.get(model.identifier),
			onWillSelect: () => { selectionVersion = ++this._selectionVersion; },
			onSelect: next => {
				if (selectionVersion === this._selectionVersion && this._widget.isVisible && next.identifier !== (this._context ?? context).selectedModelId) {
					this._rememberSpeedVariant(next.identifier);
					this._detailsModelId = next.identifier;
					this._applyModelSelection(next, this._context ?? context);
				}
			},
			onDidAccept: () => {
				this.refresh();
			},
			onTogglePin: context.onTogglePin && !routingModel
				? pinned => this._togglePin(model.identifier, pinned)
				: undefined,
			onDidChangeConfiguration: (...change) => {
				context.onConfigurationChanged(model, ...change);
			},
		};
		const key = this._speedVariants.get(model.identifier)?.standard.identifier ?? model.identifier;
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

	private _showModelDetails(model: ILanguageModelChatMetadataAndIdentifier, focusConfiguration = false): void {
		const context = this._context;
		if (!context) {
			return;
		}
		this._selectionVersion++;
		this._detailsCard = undefined;
		this._detailsModelId = model.identifier;
		const card = this._getModelCard(model, context);
		card.refresh();
		this._detailsCard = card;
		this._widget.showDetails({
			label: localize('chat.modelPicker.modelDetails', "{0} Details", model.metadata.name),
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
			restoreFocus: () => this._widget.focusItemAction(this._detailsModelId ?? model.identifier, MODEL_DETAILS_ACTION_ID),
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

	private _getAutoModeToggleState(context: ITabbedModelPickerContext): ReturnType<NonNullable<ITabDescriptor['toggle']>['getState']> {
		if (!this._autoModel(context) && !this._hydraFusionModel(context)) {
			return undefined;
		}
		if (this._isAutoOnly(context)) {
			return undefined;
		}
		const defaultModel = this._getOrganizationDefaultModel(context);
		return {
			checked: this._isAutoMode(context),
			enabled: true,
			description: defaultModel && isAutoModel(defaultModel)
				? getOrganizationDefaultDescription(defaultModel.metadata.name)
				: undefined,
		};
	}

	private _toggleAutoMode(enabled: boolean): void {
		const context = this._context;
		if (!context) {
			return;
		}
		const routingModels = [this._autoModel(context), this._hydraFusionModel(context)];
		const next = enabled
			? routingModels.find(model => model?.identifier === this._lastRoutingModelId) ?? routingModels.find(model => !!model)
			: this._fallbackModel(context);
		if (!next) {
			return;
		}
		this._selectionVersion++;
		this._applyModelSelection(next, context);
		this.refresh();
	}

	private _applyModelSelection(model: ILanguageModelChatMetadataAndIdentifier, context: ITabbedModelPickerContext, resetWorkflow = true): void {
		if (resetWorkflow) {
			context.workflow?.reset();
		}
		this._context = { ...context, selectedModelId: model.identifier };
		this._rememberSelection(model.identifier);
		context.onSelect(model);
	}

	/** Restores a usable manual model from Copilot, never a routing model or another provider. */
	private _fallbackModel(context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier | undefined {
		const isCandidate = (model: ILanguageModelChatMetadataAndIdentifier) => !isAutoModel(model) && !isHydraFusionModel(model)
			&& !isUserProvidedModel(model, this._languageModelsService)
			&& !requiresNewerVSCode(model, context.controlModels, context.unavailableContext.currentVSCodeVersion);
		const candidates = [this._lastExplicitModelId, ...context.recentModelIds, ...context.pinnedModelIds];
		for (const id of candidates) {
			const model = context.models.find(candidate => candidate.identifier === id);
			if (model && isCandidate(model)) {
				return model;
			}
		}
		return context.models.find(isCandidate);
	}
}
