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
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { ActionListItemKind, IActionListHeaderLink, IActionListItem } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetDropdownAction, withActionWidgetDropdownMotion } from '../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ITabBarAction, ITabDescriptor, TabbedActionListWidget } from '../../../../../../../platform/actionWidget/browser/tabbedActionListWidget.js';
import { COPILOT_HYDRA_FUSION_MAX_MODEL_ID, COPILOT_HYDRA_FUSION_MODEL_ID, COPILOT_HYDRA_FUSION_MODEL_NAMES } from '../../../../../../../platform/agentHost/common/copilotCliConfig.js';
import type { AutoModeTier } from '../../../../../../../platform/agentHost/common/autoModeTiers.js';
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
import { getModelConfigDescription, getModelConfigProperty, getModelConfigSummary, IModelConfigurationAccess, MODEL_CONFIG_GROUP_EFFORT, ModelConfigChangeListener } from './modelPickerModelConfig.js';
import { IModelCardOptions, IPricingDisclosure, ModelCard } from './modelPickerCard.js';
import { getPreferredSpeedVariant, IModelSpeedVariants } from './modelPickerVariants.js';
import { getModelBadge, getOrganizationDefaultDescription, organizationDefaultLabel } from './modelPickerBadges.js';
import { createModelAction, createUnavailableModelItem, getUnavailableReason, requiresNewerVSCode } from './modelPickerItemPrimitives.js';
import { getModelPickerAccessibilityProvider, getModelPickerControlModels } from './modelPickerItems.js';
import { filterModelPickerControlModelsForEntitlement, filterModelPickerModelsForEntitlement, getEnsembleTierLabel, getHydraFusionTierLabel, isAutoModel, isHydraFusionModel, isHydraFusionUpgradeOnly } from './modelPickerPresentation.js';
import { buildModelPickerDestinations, buildModelPickerSections, getModelProviderLabel, hasPromotedModels, IModelPickerDestination, IModelPickerProviderPlaceholder, IModelPickerSections, IModelPickerUnavailableEntry, MODEL_PICKER_BUILT_IN_DESTINATION } from './modelPickerTabs.js';
import { ModelPickerWelcome } from './modelPickerWelcome.js';
import { createMessageBanner, HYDRA_FUSION_LEARN_MORE_URL } from './modelPickerHover.js';
import { IModelPickerWorkflow } from './modelPickerWorkflow.js';

/** The collapsible section holding models that are neither pinned, recommended nor recent. */
const OTHER_MODELS_SECTION = 'other';
const PICKER_WIDTH = 320;
const PRICING_EXPANDED_STORAGE_KEY = 'chat.modelPicker.pricingExpanded';
const OTHER_MODELS_EXPANDED_STORAGE_KEY = 'chat.modelPicker.otherModelsExpanded';
const MODEL_DETAILS_ACTION_ID = 'chat.modelPicker.details';

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

/** A provider-tabbed picker with Auto leading the Copilot tab and a drill-in configuration page. */
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
			this._otherModelsExpandedOnOpen = this._isOtherModelsExpanded();
			if (context.workflow?.available.get() && context.workflow.summary.get()) {
				context.workflow.start();
			}
		}
		this._anchor = anchor;
		this._selectionVersion++;
		this._models = context.models;
		const pickerContext = this._filterModelsForEntitlement(context);
		this._context = pickerContext;
		this._rememberHydraFusionTier(pickerContext);
		this._configurationListener.value = context.configurationAccess.onDidChange?.(() => this.refresh());
		this._contextViewLayer = contextViewLayer;
		if (options?.initialFilterValue !== undefined) {
			this._searchVisible = true;
		}
		this._showCurrent(options?.initialFilterValue, options?.initialFocusItemId);
		const requestedModel = pickerContext.models.find(model => model.identifier === detailsModelId);
		const detailsModel = requestedModel && this._getDetailsModel(requestedModel, pickerContext);
		if (detailsModel) {
			this._showModelDetails(detailsModel, focusConfiguration);
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
				// Search spans every destination at once, so each model names its provider.
				const searching = this._searchVisible && !forSizing;
				const items = searching
					? currentDestinations.flatMap(candidate => this._buildSearchItems(candidate, candidate === destination ? sections : this._buildSections(candidate, current), current))
					: this._buildItems(destination, sections, current);
				const hint = step ? { text: `${step.title}\n${step.description}`, link: undefined, dismiss: undefined } : current.cacheBreakHint ?? current.configurationCacheBreakHint;
				const baseListOptions = withActionWidgetDropdownMotion({
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
					collapsedByDefault: !step && hasPromotedModels(sections) && !(forSizing ? this._otherModelsExpandedOnOpen : this._isOtherModelsExpanded()) ? new Set([OTHER_MODELS_SECTION]) : undefined,
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
			openItemDetails: item => this._openItemDetails(item),
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

	private _isOtherModelsExpanded(): boolean {
		return this._storageService.getBoolean(OTHER_MODELS_EXPANDED_STORAGE_KEY, StorageScope.APPLICATION, false);
	}

	private _buildDestinations(context: ITabbedModelPickerContext): IModelPickerDestination[] {
		const autoModel = this._autoModel(context);
		const hydraFusionModels = this._hydraFusionModels(context);
		// Ensemble's HydraFusion is never a row of its own, even when Ensemble does not offer it.
		const ensembleHydraFusion = (model: ILanguageModelChatMetadataAndIdentifier) => !!autoModel?.metadata.autoModelEnsemble && isHydraFusionModel(model) && !isUserProvidedModel(model, this._languageModelsService);
		return buildModelPickerDestinations(context.models, this._languageModelsService, context.providerPlaceholders, model => model === autoModel || hydraFusionModels.includes(model) || ensembleHydraFusion(model), this._hasBuiltInUpsells(context));
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

	/**
	 * The HydraFusion routing models this build can run, HydraFusion before HydraFusion Max.
	 * The host only offers HydraFusion Max with HydraFusion v2, and Ensemble only offers
	 * HydraFusion as its Intelligence.
	 */
	private _hydraFusionModels(context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier[] {
		const ensemble = this._autoModel(context)?.metadata.autoModelEnsemble;
		return [...COPILOT_HYDRA_FUSION_MODEL_NAMES.keys()]
			.filter(id => id !== COPILOT_HYDRA_FUSION_MODEL_ID || !ensemble || ensemble.intelligenceUsesHydraFusion)
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
	 * Whether HydraFusion is offered among Ensemble's tiers, which needs an Ensemble with
	 * tiers to join. Otherwise HydraFusion keeps a row of its own beside Auto.
	 */
	private _hostsHydraFusion(context: ITabbedModelPickerContext): boolean {
		const auto = this._autoModel(context);
		return !!auto?.metadata.autoModelEnsemble && this._hydraFusionModels(context).length > 0 && !!getModelConfigProperty(auto, context.configurationAccess, MODEL_CONFIG_GROUP_EFFORT);
	}

	/**
	 * HydraFusion's own tiers outside Ensemble, Default before Max. HydraFusion and
	 * HydraFusion Max then share one row, and its details choose between them.
	 */
	private _hydraFusionTiers(context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier[] {
		if (this._autoModel(context)?.metadata.autoModelEnsemble) {
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

	private _getHydraFusionTier(hydraFusion: ILanguageModelChatMetadataAndIdentifier, context: ITabbedModelPickerContext): { readonly label: string; readonly replacesTier?: AutoModeTier } {
		const label = getEnsembleTierLabel(this._autoModel(context)?.metadata, hydraFusion.metadata.id);
		if (!label) {
			return { label: hydraFusion.metadata.name };
		}
		return { label, replacesTier: hydraFusion.metadata.id === COPILOT_HYDRA_FUSION_MODEL_ID ? 'intelligence' : undefined };
	}

	/** The model whose details stand for the given one: Auto's for an Ensemble tier, its own for HydraFusion with tiers, none otherwise. */
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
		const configuredDefault = this._configurationService.inspect<string>(ChatConfiguration.DefaultModel).policyValue?.trim();
		return resolveConfiguredModel(configuredDefault, context.models);
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
		const isBuiltIn = destination.id === MODEL_PICKER_BUILT_IN_DESTINATION;
		// Auto leads the built-in provider's list, ahead of any section. Guided selection
		// compares individual models, so it leaves routing out.
		const items: IActionListItem<IActionWidgetDropdownAction>[] = isBuiltIn && !context.workflow?.state.get() ? this._buildRoutingItems(context) : [];
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
			? [this._autoModel(context), ...this._hydraFusionRowModels(context)].filter((model): model is ILanguageModelChatMetadataAndIdentifier => !!model)
			: [];
		return [...sections.pinned, ...sections.suggested, ...sections.other, ...routingModels]
			.sort((left, right) => this._getRowLabel(left, context).localeCompare(this._getRowLabel(right, context)))
			.map(model => this._createModelItem(model, context, undefined, getModelProviderLabel(model, this._languageModelsService)));
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
	 * Auto, listed like any other model, with its tiers in its details. Ensemble offers
	 * HydraFusion among its tiers; otherwise HydraFusion gets a row of its own, with
	 * Default and Max as its tiers when HydraFusion Max is available.
	 */
	private _buildRoutingItems(context: ITabbedModelPickerContext): IActionListItem<IActionWidgetDropdownAction>[] {
		const items: IActionListItem<IActionWidgetDropdownAction>[] = [];
		const auto = this._autoModel(context);
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
		const hydraFusionTier = isAutoModel(model) ? this._selectedHydraFusionTier(context) : undefined;
		// HydraFusion as Auto's tier is shown as Auto, with HydraFusion in place of its tier.
		const { action, ariaDescription } = createModelAction(model, hydraFusionTier ? model.identifier : context.selectedModelId, next => {
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
		// HydraFusion with tiers of its own is shown as HydraFusion, with its tier as the readout.
		const ownTierLabel = this._hydraFusionTiers(context).includes(model) ? getHydraFusionTierLabel(model.metadata.id) : undefined;
		const tierLabel = hydraFusionTierLabel ?? ownTierLabel;
		const rowLabel = this._getRowLabel(model, context);
		const summary = tierLabel ?? getModelConfigSummary(model, context.configurationAccess);
		const configDescription = hydraFusionTierLabel
			? localize('chat.modelPicker.autoTierValue', "{0}: {1}", getModelConfigProperty(model, context.configurationAccess, MODEL_CONFIG_GROUP_EFFORT)?.schema.title ?? localize('chat.modelPicker.optimizeFor', "Optimize for"), hydraFusionTierLabel)
			: ownTierLabel
				? localize('chat.modelPicker.hydraFusionTierValue', "Tier: {0}", ownTierLabel)
				: getModelConfigDescription(model, context.configurationAccess);
		const defaultModel = this._getOrganizationDefaultForModel(model, context);
		const defaultDescription = defaultModel && getOrganizationDefaultDescription(defaultModel.metadata.name);
		// Auto opens its tiers like any model's details; HydraFusion only when it has tiers of its own.
		const hasDetails = !isHydraFusionModel(model) || !!ownTierLabel;
		return {
			item: rowLabel === action.label ? action : { ...action, label: rowLabel, tooltip: rowLabel },
			kind: ActionListItemKind.Action,
			label: rowLabel,
			description: modelBadge || routingBadge ? undefined : action.description,
			badge: modelBadge?.text ?? routingBadge,
			additionalBadges: this._getOrganizationDefaultBadges(model, context),
			ariaDescription: [ariaDescription, configDescription].filter(Boolean).join(', '),
			// Right Arrow on the row opens the same details as its button.
			opensDialog: hasDetails,
			group: { title: '', icon: action.icon ?? ThemeIcon.fromId(action.checked ? Codicon.check.id : Codicon.blank.id) },
			hideIcon: false,
			section,
			className: ['chat-model-picker-model', ...(action.checked ? ['chat-model-picker-current'] : []), ...(badgeClassName ? [badgeClassName] : [])].join(' '),
			toolbarLabels: true,
			toolbarActions: hasDetails ? [this._createDetailsAction(model, rowLabel, summary)] : undefined,
			toolbarDialogActionIds: [MODEL_DETAILS_ACTION_ID],
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
		const model = item.toolbarActions?.some(action => action.id === MODEL_DETAILS_ACTION_ID)
			? this._context?.models.find(candidate => candidate.identifier === item.item?.id)
			: undefined;
		if (!model) {
			return false;
		}
		this._showModelDetails(model, true, true);
		return true;
	}

	private _getModelCard(model: ILanguageModelChatMetadataAndIdentifier, context: ITabbedModelPickerContext): ModelCard {
		let selectionVersion = this._selectionVersion;
		const routingModel = isAutoModel(model) || isHydraFusionModel(model);
		const hydraFusionModels = isAutoModel(model) && this._hostsHydraFusion(context) ? this._hydraFusionModels(context) : [];
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
			modelChoices: ownTiers.length ? {
				ariaLabel: localize('chat.modelPicker.hydraFusionTiers', "HydraFusion tier"),
				choices: ownTiers.map(tier => ({ label: getHydraFusionTierLabel(tier.metadata.id), model: tier })),
			} : undefined,
			// Only Ensemble offers HydraFusion among its tiers, each described as the tier it is.
			routingAlternatives: hydraFusionModels.map(hydraFusion => {
				const tier = this._getHydraFusionTier(hydraFusion, context);
				return {
					model: hydraFusion,
					label: tier.label,
					replacesTier: tier.replacesTier,
					description: hydraFusion.metadata.id === COPILOT_HYDRA_FUSION_MAX_MODEL_ID
						? localize('chat.modelPicker.ensembleMaxDescription', "Max uses multiple models on every task for the most thorough results.")
						: localize('chat.modelPicker.ensembleIntelligenceDescription', "High picks a workflow per task, using one or more models."),
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

	private _applyModelSelection(model: ILanguageModelChatMetadataAndIdentifier, context: ITabbedModelPickerContext, resetWorkflow = true): void {
		if (resetWorkflow) {
			context.workflow?.reset();
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

	/** Restores a usable manual model from Copilot, never a routing model or another provider. */
	private _fallbackModel(context: ITabbedModelPickerContext): ILanguageModelChatMetadataAndIdentifier | undefined {
		const isCandidate = (model: ILanguageModelChatMetadataAndIdentifier) => !isAutoModel(model) && !isHydraFusionModel(model)
			&& !isUserProvidedModel(model, this._languageModelsService)
			&& !requiresNewerVSCode(model, context.controlModels, context.unavailableContext.currentVSCodeVersion);
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
