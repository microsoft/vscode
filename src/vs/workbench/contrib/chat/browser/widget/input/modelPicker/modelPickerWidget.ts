/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/modelPicker.css';

import * as dom from '../../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../../base/browser/keyboardEvent.js';
import { EventType as TouchEventType, Gesture } from '../../../../../../../base/browser/touch.js';
import { renderIcon } from '../../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { getBaseLayerHoverDelegate } from '../../../../../../../base/browser/ui/hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IStringDictionary } from '../../../../../../../base/common/collections.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { KeyCode } from '../../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { disposableTimeout } from '../../../../../../../base/common/async.js';
import { autorun, IObservable } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { localize } from '../../../../../../../nls.js';
import { IActionListHeaderLink } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IAgentConnection } from '../../../../../../../platform/agentHost/common/agentService.js';
import { LocalModelEnabledSettingId } from '../../../../../../../platform/agentHost/common/localModel.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { COPILOT_HYDRA_FUSION_MAX_MODEL_ID, COPILOT_HYDRA_FUSION_MODEL_ID, isCopilotHydraFusionModelId } from '../../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import { COPILOT_VENDOR_ID, getLanguageModelProviderDisplayName, IModelControlEntry, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, isUserProvidedModel } from '../../../../common/languageModels.js';
import { getAddModelsUnavailableReason, SessionType } from '../../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { getLanguageModelDisplayNameWithSubscriptionSource } from '../../../../common/languageModelSourcePresentation.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { IModelPickerDelegate } from './modelPickerActionItem.js';
import { CHAT_SETUP_ACTION_ID } from '../../../actions/chatActions.js';
import { IUriIdentityService } from '../../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { GitHubPaths, IDefaultAccountService } from '../../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IUpdateService } from '../../../../../../../platform/update/common/update.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchEnvironmentService } from '../../../../../../services/environment/common/environmentService.js';
import { getCompactCodicon } from '../../../chatIcons.js';
import { renderChatInputPickerSplit } from '../chatInputPickerActionItem.js';
import { createManageModelsAction, getModelPickerControlModels, shouldShowManageModelsAction } from './modelPickerItems.js';
import { requiresNewerVSCode } from './modelPickerItemPrimitives.js';
import { renderModelConfigurationButton } from './modelPickerConfiguration.js';
import { getCompactModelPickerIcon } from './modelProviderIcons.js';
import { ITabbedModelPickerContext, TabbedModelPicker } from './modelPickerTabbedWidget.js';
import { IModelPickerOpenTrigger, ModelPickerTelemetrySession } from './modelPickerTelemetry.js';
import { getModelConfigProperty, MODEL_CONFIG_GROUP_EFFORT, whenModelConfigValuesSaved } from './modelPickerModelConfig.js';
import { IModelPickerProviderPlaceholder } from './modelPickerTabs.js';
import { getOrganizationDefaultDescription, getOrganizationDefaultModel } from './modelPickerBadges.js';
import { formatLocalModelOnDeviceName, ILocalModelPickerActionEvent, isLocalModelDirectRow, ModelPickerLocalModels } from './modelPickerLocalModelItems.js';
import { getFusionTierLabel, getHydraFusionTierLabel, getModelPickerUnavailableReason, isAutoModel, isHydraFusionModel, isHydraFusionUpgradeOnly, ModelPickerUnavailableReason, modelPickerRequiresSetup, shouldShowCacheBreakHint as computeShouldShowCacheBreakHint } from './modelPickerPresentation.js';

/** Trusted caller options for opening a searchable picker without toggling it closed. */
export interface IModelPickerOpenOptions {
	readonly startComparison?: boolean;
	readonly initialFilterValue?: string;
	readonly initialFocusItemId?: string;
	/** Opens the "On This Device" tab at this family's detail page, including one that needs setup and has no model to select yet. */
	readonly localModelFamilyId?: string;
}

const CACHE_BREAK_HINT_DISMISSED_STORAGE_KEY = 'chat.cacheBreakHintDismissed';

const MODEL_PICKER_MINIMUM_LABEL_WIDTH = 60;
const MODEL_PICKER_NAME_CHROME_WIDTH = 30;
const MODEL_PICKER_MINIMUM_NAME_WIDTH = MODEL_PICKER_MINIMUM_LABEL_WIDTH + MODEL_PICKER_NAME_CHROME_WIDTH;
const MODEL_PICKER_COMPACT_NAME_WIDTH = 22;
type ChatModelPickerInteraction = 'disabledModelContactAdminClicked' | 'premiumModelUpgradePlanClicked' | 'otherModelsExpanded' | 'otherModelsCollapsed' | 'localModelActionInvoked' | 'localModelSelected';

type ChatModelPickerInteractionClassification = {
	owner: 'sandy081';
	comment: 'Reporting interactions in the chat model picker';
	interaction: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model picker interaction that occurred' };
};

type ChatModelPickerInteractionEvent = {
	interaction: ChatModelPickerInteraction;
};

type LocalModelPickerActionClassification = {
	owner: 'lramos15';
	comment: 'Reports actions taken on the on-device model detail pages of the chat model picker, to understand how the setup and management flows are used.';
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The detail page action that was invoked, or makeActive or start when selecting an on-device model loaded it.' };
	fromReadiness: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The derived readiness of the family the row showed when the action was invoked.' };
	installedFamilies: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many on-device model families are installed.' };
};

type LocalModelPickerActionEvent = {
	action: string;
	fromReadiness: string;
	installedFamilies: number;
};

type ModelPickerBadge = 'info' | 'warning';

/** Why the picker has no model to offer, and the label states that follow from it. */
interface IModelPickerAvailability {
	/** Untrusted workspace or sign-in / setup required, or `undefined` when a model is available. */
	readonly reason: ModelPickerUnavailableReason | undefined;
	/** Trusted, but models are still loading while the chat extension activates. */
	readonly activating: boolean;
	/** Trusted and set up, but the list is empty and there is no Auto fallback. */
	readonly genericNoModels: boolean;
	/** Any of the above: the picker has nothing to offer. */
	readonly noModels: boolean;
}

/**
 * A model selection dropdown widget.
 *
 * Renders a button showing the currently selected model name, followed by a
 * readout of its configuration. Both open a {@link TabbedModelPicker} with a
 * tab per provider and a details page for each model.
 *
 * The widget owns its state - set models, selection, and curated IDs via setters.
 * Listen for selection changes via `onDidChangeSelection`.
 */
export class ModelPickerWidget extends Disposable {

	private readonly _onDidChangeSelection = this._register(new Emitter<ILanguageModelChatMetadataAndIdentifier>());
	readonly onDidChangeSelection: Event<ILanguageModelChatMetadataAndIdentifier> = this._onDidChangeSelection.event;
	private readonly _onDidChangeMinimumWidth = this._register(new Emitter<number>());
	readonly onDidChangeMinimumWidth: Event<number> = this._onDidChangeMinimumWidth.event;

	private _selectedModel: ILanguageModelChatMetadataAndIdentifier | undefined;
	/** Reused by the hover without rebuilding the model catalog. */
	private _organizationDefaultDescription: string | undefined;
	private _fusionDisplayName: string | undefined;
	private _badge: ModelPickerBadge | undefined;
	private _compact: IObservable<boolean> | undefined;
	private _minimal: IObservable<boolean> | undefined;
	private _contextViewLayer: number | undefined;
	private _workspaceTrustInitialized = false;
	private _activatingAfterTrust = false;
	private readonly _activatingTimer = this._register(new MutableDisposable());

	private _domNode: HTMLElement | undefined;
	private _badgeIcon: HTMLElement | undefined;
	private _nameButton: HTMLElement | undefined;
	private _configButton: HTMLElement | undefined;
	private _minimumWidth = MODEL_PICKER_MINIMUM_NAME_WIDTH;
	private readonly _tabbedPicker = this._register(new MutableDisposable<TabbedModelPicker>());
	private readonly _tabbedPickerHideListener = this._register(new MutableDisposable());
	/** The on-device rows of this picker, bound to the chat's Agent Host connection, with their refresh listener. */
	private readonly _localModels = this._register(new MutableDisposable<DisposableStore>());
	private _localModelsController: ModelPickerLocalModels | undefined;
	private _localModelsConnection: IAgentConnection | undefined;

	get selectedModel(): ILanguageModelChatMetadataAndIdentifier | undefined {
		return this._selectedModel;
	}

	/** The selected model's name as Fusion presents it, e.g. "Fusion Max", when Fusion stands for it. */
	get fusionDisplayName(): string | undefined {
		return this._fusionDisplayName;
	}

	get domNode(): HTMLElement | undefined {
		return this._domNode;
	}

	get nameButton(): HTMLElement | undefined {
		return this._nameButton;
	}

	get minimumWidth(): number {
		return this._minimumWidth;
	}

	private _updateMinimumWidth(nameWidth: number): void {
		let configurationWidth = 0;
		if (this._configButton && this._configButton.offsetWidth > 0) {
			const margins = dom.getTotalWidth(this._configButton) - this._configButton.offsetWidth;
			// Preserve fractional text widths so rounding does not leave space after the readout.
			configurationWidth = this._configButton.getBoundingClientRect().width + margins;
		}
		const minimumWidth = nameWidth + configurationWidth;
		if (this._minimumWidth !== minimumWidth) {
			this._minimumWidth = minimumWidth;
			this._onDidChangeMinimumWidth.fire(minimumWidth);
		}
	}

	constructor(
		private readonly _delegate: IModelPickerDelegate,
		@ICommandService private readonly _commandService: ICommandService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IProductService private readonly _productService: IProductService,
		@IChatEntitlementService private readonly _entitlementService: IChatEntitlementService,
		@IUpdateService private readonly _updateService: IUpdateService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkspaceTrustRequestService private readonly _workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IStorageService private readonly _storageService: IStorageService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		if (this._delegate.comparison) {
			this._register(autorun(reader => {
				this._delegate.comparison?.summary.read(reader);
				this._delegate.comparisonBusy?.read(reader);
				if (!this._delegate.comparison?.available.read(reader)) {
					this._tabbedPicker.value?.hide();
				}
				this._renderLabel();
			}));
		}
		this._register(this._languageModelsService.onDidChangeLanguageModels(() => {
			const models = this._delegate.getModels();
			if (this._activatingAfterTrust && models.length > 0) {
				this._clearActivating();
			}
			this._renderLabel(models);
			// While unavailable the picker explains why instead of listing models, so it
			// only takes on new models once they can be used.
			if (this._tabbedPicker.value?.isVisible && this._unavailableReason(models) === undefined) {
				this._tabbedPicker.value.refresh(models, this._delegate.getComparisonModels?.());
			}
		}));

		// Reflect Restricted Mode immediately when trust changes. When trust is
		// granted but no models are available yet, briefly show an "Activating..."
		// state while the chat extension comes up and loads them, rather than a
		// misleading "Auto" fallback.
		this._register(this._workspaceTrustManagementService.onDidChangeTrust(trusted => {
			// What the picker can list depends on trust, so it closes rather than going stale.
			this._tabbedPicker.value?.hide();
			if (trusted && this._delegate.getPresentationOptions().showAutoModel && this._delegate.getModels().length === 0) {
				this._activatingAfterTrust = true;
				this._activatingTimer.value = disposableTimeout(() => {
					this._activatingAfterTrust = false;
					this._renderLabel();
				}, 15000);
			} else {
				this._clearActivating();
			}
			this._renderLabel();
		}));

		// Trust reads as untrusted until initialization resolves; gate on it so a
		// trusted workspace doesn't briefly render as restricted at startup.
		this._workspaceTrustManagementService.workspaceTrustInitialized.then(() => {
			if (this._store.isDisposed) {
				return;
			}
			this._workspaceTrustInitialized = true;
			this._renderLabel();
		});

		this._register(this._entitlementService.onDidChangeUsageBasedBilling(() => {
			this._renderLabel();
		}));

		// The setup-required state derives from entitlement / sentiment / anonymous
		// access, so refresh the label when any of those change (e.g. after sign-in).
		this._register(this._entitlementService.onDidChangeEntitlement(() => this.setSelectedModel(this._selectedModel)));
		this._register(this._entitlementService.onDidChangeSentiment(() => this._renderLabel()));
		this._register(this._entitlementService.onDidChangeAnonymous(() => this._renderLabel()));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.DefaultModel)) {
				this._renderLabel();
			}
		}));

		// Also refresh the label when the per-editor config layer (if any) reports
		// a change. The global service path is already covered above via
		// `onDidChangeLanguageModels` which fires from `setModelConfiguration`.
		if (this._delegate.modelConfiguration?.onDidChange) {
			this._register(this._delegate.modelConfiguration.onDidChange(() => {
				this._renderLabel();
			}));
		}
	}

	setCompact(compact: IObservable<boolean>): void {
		this._compact = compact;
		this._register(autorun(reader => {
			compact.read(reader);
			this._renderLabel();
		}));
	}

	setMinimal(minimal: IObservable<boolean>): void {
		this._minimal = minimal;
		this._register(autorun(reader => {
			const isMinimal = minimal.read(reader);
			this._domNode?.classList.toggle('minimal', isMinimal);
			this._renderLabel();
		}));
	}

	setContextViewLayer(contextViewLayer: number | undefined): void {
		this._contextViewLayer = contextViewLayer;
	}

	setSelectedModel(model: ILanguageModelChatMetadataAndIdentifier | undefined): void {
		const selectedModel = this._normalizeSelectedModel(model);
		this._selectedModel = selectedModel;
		this._tabbedPicker.value?.setSelectedModel(selectedModel?.identifier);
		if (selectedModel && selectedModel.identifier !== model?.identifier) {
			if (this._delegate.setModelProgrammatically) {
				this._delegate.setModelProgrammatically(selectedModel);
			} else {
				this._delegate.setModel(selectedModel);
			}
		}
		this._renderLabel();
	}

	private _normalizeSelectedModel(model: ILanguageModelChatMetadataAndIdentifier | undefined): ILanguageModelChatMetadataAndIdentifier | undefined {
		if (!model || isUserProvidedModel(model, this._languageModelsService)) {
			return model;
		}
		const models = this._delegate.getModels();
		if (isHydraFusionModel(model) && isHydraFusionUpgradeOnly(this._entitlementService.entitlement)) {
			return models.find(model => isAutoModel(model) && !isUserProvidedModel(model, this._languageModelsService))
				?? models.find(model => !isHydraFusionModel(model) || isUserProvidedModel(model, this._languageModelsService))
				?? model;
		}
		return this._normalizeHydraFusionTier(model, models) ?? this._normalizeAutoHydraFusionTier(model, models) ?? model;
	}

	/**
	 * Shows a chat on Auto at a HydraFusion tier Auto no longer offers, such as Fusion's High once Auto is no longer
	 * presented as Fusion, as that HydraFusion model, so the chat keeps HydraFusion rather than Auto's default tier.
	 */
	private _normalizeAutoHydraFusionTier(model: ILanguageModelChatMetadataAndIdentifier, models: readonly ILanguageModelChatMetadataAndIdentifier[]): ILanguageModelChatMetadataAndIdentifier | undefined {
		if (!isAutoModel(model) || isHydraFusionUpgradeOnly(this._entitlementService.entitlement)) {
			return undefined;
		}
		const configurationAccess = this._delegate.modelConfiguration ?? this._languageModelsService;
		const tier = getModelConfigProperty(model, configurationAccess, MODEL_CONFIG_GROUP_EFFORT);
		const saved = tier && configurationAccess.getModelConfiguration(model.identifier)?.[tier.key];
		if (!tier || typeof saved !== 'string' || !isCopilotHydraFusionModelId(saved) || tier.value === saved) {
			return undefined;
		}
		return models.find(candidate => candidate.metadata.id === saved && isHydraFusionModel(candidate) && !isUserProvidedModel(candidate, this._languageModelsService));
	}

	/**
	 * Shows a chat on a HydraFusion model as Fusion with that tier. Presented for this chat only: the
	 * chat may be on the model just because it was the first available, so it must not become a preference.
	 */
	private _normalizeHydraFusionTier(model: ILanguageModelChatMetadataAndIdentifier, models: readonly ILanguageModelChatMetadataAndIdentifier[]): ILanguageModelChatMetadataAndIdentifier | undefined {
		const scopedConfiguration = this._delegate.modelConfiguration;
		if (!isHydraFusionModel(model) || !scopedConfiguration?.presentModelConfiguration || isHydraFusionUpgradeOnly(this._entitlementService.entitlement)) {
			return undefined;
		}
		// Only a Fusion the picker offers can take the chat.
		const runnable = this._getRunnablePredicate(models);
		const fusion = models.find(candidate => candidate.metadata.autoModelFusion && runnable(candidate));
		const tier = fusion && getModelConfigProperty(fusion, scopedConfiguration, MODEL_CONFIG_GROUP_EFFORT);
		const index = tier ? tier.schema.enum?.indexOf(model.metadata.id) ?? -1 : -1;
		if (!fusion || !tier || index < 0 || tier.schema.enumItemDisabled?.[index] || tier.schema.readOnly) {
			return undefined;
		}
		scopedConfiguration.presentModelConfiguration(fusion.identifier, { [tier.key]: model.metadata.id });
		return fusion;
	}

	/**
	 * The model a HydraFusion tier is shown as, with that tier: Fusion for one of
	 * Fusion's tiers, or HydraFusion for HydraFusion's own Default or Max.
	 */
	private _getRoutingTier(model: ILanguageModelChatMetadataAndIdentifier, models: readonly ILanguageModelChatMetadataAndIdentifier[]): { readonly shownModel: ILanguageModelChatMetadataAndIdentifier; readonly label: string } | undefined {
		if (!isHydraFusionModel(model) || isUserProvidedModel(model, this._languageModelsService)) {
			return undefined;
		}
		const runnable = this._getRunnablePredicate(models);
		const fusion = models.find(candidate => candidate.metadata.autoModelFusion && runnable(candidate));
		if (fusion) {
			const label = getFusionTierLabel(fusion.metadata, model.metadata.id);
			return label ? { shownModel: fusion, label } : undefined;
		}
		// HydraFusion's own tiers need both of its models.
		const hydraFusion = (id: string) => models.find(candidate => candidate.metadata.id === id && isHydraFusionModel(candidate) && runnable(candidate));
		const defaultTier = hydraFusion(COPILOT_HYDRA_FUSION_MODEL_ID);
		return defaultTier && hydraFusion(COPILOT_HYDRA_FUSION_MAX_MODEL_ID)
			? { shownModel: defaultTier, label: getHydraFusionTierLabel(model.metadata.id) }
			: undefined;
	}

	/** Returns a predicate that tests whether the picker offers a built-in model: one this build can run, as the picker only offers those. */
	private _getRunnablePredicate(models: readonly ILanguageModelChatMetadataAndIdentifier[]): (candidate: ILanguageModelChatMetadataAndIdentifier) => boolean {
		const controlModels = getModelPickerControlModels(this._languageModelsService.getModelsControlManifest(), this._entitlementService.entitlement, models);
		return candidate => !isUserProvidedModel(candidate, this._languageModelsService) && !requiresNewerVSCode(candidate, controlModels, this._productService.version);
	}

	setEnabled(enabled: boolean): void {
		if (this._domNode) {
			this._domNode.classList.toggle('disabled', !enabled);
			this._domNode.setAttribute('aria-disabled', String(!enabled));
		}
	}

	setBadge(badge: ModelPickerBadge | undefined): void {
		this._badge = badge;
		this._updateBadge();
	}

	/**
	 * Why the picker currently has no model to offer (untrusted vs. needs
	 * sign-in/setup), or `undefined` when a model is available. See
	 * {@link getModelPickerUnavailableReason}.
	 */
	private _unavailableReason(models: readonly ILanguageModelChatMetadataAndIdentifier[] = this._delegate.getModels()): ModelPickerUnavailableReason | undefined {
		return getModelPickerUnavailableReason({
			trustInitialized: this._workspaceTrustInitialized,
			trusted: this._workspaceTrustManagementService.isWorkspaceTrusted(),
			pickerModels: models,
			liveModelIds: this._languageModelsService.getLanguageModelIds(),
			requiresSetup: this._requiresSetup(),
		});
	}

	private _requiresSetup(): boolean {
		return modelPickerRequiresSetup({
			entitlement: this._entitlementService.entitlement,
			anonymous: this._entitlementService.anonymous,
			hasByokModels: this._entitlementService.hasByokModels,
		});
	}

	/**
	 * Whether the picker has no usable model specifically because the workspace
	 * is untrusted (Restricted Mode disables the chat model providers).
	 */
	isRestrictedMode(): boolean {
		return this._unavailableReason() === ModelPickerUnavailableReason.Restricted;
	}

	/**
	 * Whether the picker has no usable model because Chat still needs sign-in /
	 * setup (and the workspace is trusted, so it is not Restricted Mode). BYOK
	 * and anonymous access never report this state.
	 */
	isSetupRequired(): boolean {
		return this._unavailableReason() === ModelPickerUnavailableReason.SetupRequired;
	}

	private _clearActivating(): void {
		this._activatingAfterTrust = false;
		this._activatingTimer.clear();
	}

	/**
	 * Prompts the user to trust the workspace. On grant, providers register their
	 * models and `onDidChangeLanguageModels` refreshes the picker.
	 */
	private async _requestWorkspaceTrust(): Promise<void> {
		await this._workspaceTrustRequestService.requestWorkspaceTrust({
			message: localize('chat.modelPicker.trustMessage', "Trusting this workspace enables AI models and chat features.")
		});
	}

	/**
	 * Starts the Chat setup / sign-in flow (same command as the title-bar Sign In
	 * affordance). On completion the entitlement and model registry change, which
	 * refreshes the picker.
	 */
	private _requestSetup(): void {
		this._commandService.executeCommand(CHAT_SETUP_ACTION_ID);
	}

	render(container: HTMLElement): void {
		this._domNode = dom.append(container, dom.$('div.action-label.model-picker-split'));
		const { primaryButton, secondaryButton } = renderChatInputPickerSplit(this._domNode);

		// Apply initial minimal state now that _domNode exists
		if (this._minimal?.get()) {
			this._domNode.classList.toggle('minimal', true);
		}

		this._nameButton = primaryButton;
		this._nameButton.classList.add('model-picker-section', 'model-picker-name');

		// The readout opens Auto choices, the selected model's details, or an on-device model's detail page.
		this._configButton = secondaryButton;
		this._configButton.classList.add('model-picker-section', 'model-picker-config', 'model-picker-config-summary');
		this._configButton.style.display = 'none';

		this._badgeIcon = dom.$('span.model-picker-badge');
		this._updateBadge();

		this._renderLabel();

		this._registerButtonAction(this._nameButton, fromKeyboard => this.show(undefined, false, false, { entryPoint: 'modelName', inputMethod: fromKeyboard ? 'keyboard' : 'mouse' }));
		this._registerButtonAction(this._configButton, fromKeyboard => this.show(undefined, true, true, { entryPoint: 'configuration', inputMethod: fromKeyboard ? 'keyboard' : 'mouse' }));

		// Managed hover for the combined configuration button
		this._register(getBaseLayerHoverDelegate().setupManagedHover(
			getDefaultHoverDelegate('mouse'),
			this._configButton,
			() => this._configButton?.ariaLabel ?? localize('chat.modelPicker.configTooltip', "Configure Model")
		));
	}

	/**
	 * Registers mouse-down, touch tap, and Enter/Space key handlers on a button element.
	 */
	private _registerButtonAction(element: HTMLElement, action: (fromKeyboard: boolean) => void): void {
		this._register(dom.addDisposableListener(element, dom.EventType.MOUSE_DOWN, e => {
			if (e.button !== 0) {
				return;
			}
			dom.EventHelper.stop(e, true);
			action(false);
		}));
		// Touch and pen need an explicit tap handler: an ancestor `Gesture` target
		// (e.g. the view pane container) cancels the touch, which suppresses the
		// compatibility `mousedown` the browser would otherwise synthesize.
		this._register(Gesture.addTarget(element));
		this._register(dom.addDisposableListener(element, TouchEventType.Tap, e => {
			dom.EventHelper.stop(e, true);
			action(false);
		}));
		this._register(dom.addDisposableListener(element, dom.EventType.KEY_DOWN, (e) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				dom.EventHelper.stop(e, true);
				action(true);
			}
		}));
	}

	/** The "Learn more" header link for cache-break hints; `undefined` when the product has no URL. */
	private getCacheBreakLearnMoreLink(): IActionListHeaderLink | undefined {
		const url = this._productService.defaultChatAgent?.optimizeUsageDocumentationUrl;
		return url ? { label: localize('chat.cacheBreak.learnMore', "Learn more"), uri: URI.parse(url) } : undefined;
	}

	private isCacheBreakHintDismissed(): boolean {
		return this._storageService.getBoolean(CACHE_BREAK_HINT_DISMISSED_STORAGE_KEY, StorageScope.APPLICATION, false);
	}

	private dismissCacheBreakHint(): void {
		this._storageService.store(CACHE_BREAK_HINT_DISMISSED_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
	}

	/**
	 * The picker's current availability, derived once so the label states and the "nothing to switch
	 * to" hint suppression (#325185) cannot disagree.
	 */
	private _availability(models: readonly ILanguageModelChatMetadataAndIdentifier[] = this._delegate.getModels()): IModelPickerAvailability {
		// Queried directly rather than through the isRestrictedMode()/isSetupRequired() wrappers,
		// which would each recompute it.
		const reason = this._unavailableReason(models);
		const empty = models.length === 0;
		const activating = reason === undefined && empty && this._activatingAfterTrust;
		const genericNoModels = reason === undefined && !activating && empty && !this._delegate.getPresentationOptions().showAutoModel;
		return { reason, activating, genericNoModels, noModels: reason !== undefined || activating || genericNoModels };
	}

	/** Thin wrapper over {@link computeShouldShowCacheBreakHint} that supplies this picker's live state. */
	private shouldShowCacheBreakHint(excludeAutoModel: boolean, availability: IModelPickerAvailability): boolean {
		return computeShouldShowCacheBreakHint({
			dismissed: this.isCacheBreakHintDismissed(),
			cacheWarm: this._delegate.isCacheWarm?.() ?? false,
			noModelsAvailable: availability.noModels,
			excludeAutoModel,
			selectedModelIsAuto: !!this._selectedModel && isAutoModel(this._selectedModel),
		});
	}

	/**
	 * Explains why the built-in provider has no models to list, in place of its list, with
	 * the action that resolves it: trusting the workspace, signing in, or upgrading.
	 * Providers the user has not set up are reached through "Add Models" rather than
	 * given a tab.
	 */
	private _providerPlaceholders(models: readonly ILanguageModelChatMetadataAndIdentifier[], { reason, activating }: IModelPickerAvailability, onLinkClick: (uri: URI) => void): IModelPickerProviderPlaceholder[] {
		const vendor = COPILOT_VENDOR_ID;
		const label = getLanguageModelProviderDisplayName(this._languageModelsService, COPILOT_VENDOR_ID);
		if (reason === ModelPickerUnavailableReason.Restricted) {
			return [{
				vendor,
				label: localize('chat.modelPicker.restrictedMode.title', "Restricted Mode"),
				icon: Codicon.workspaceUntrusted,
				message: localize('chat.modelPicker.restrictedMode.message', "Trust this workspace to enable models."),
				action: {
					label: localize('chat.modelPicker.restrictedMode.trustWorkspace', "Trust Workspace"),
					run: () => {
						this._tabbedPicker.value?.hide();
						void this._requestWorkspaceTrust();
					},
				},
			}];
		}
		if (reason === ModelPickerUnavailableReason.SetupRequired) {
			return [{
				vendor,
				label,
				message: localize('chat.modelPicker.signInMessage', "Sign in to see available models."),
				action: { label: localize('chat.modelPicker.signIn', "Sign in"), run: () => this._requestSetup() },
			}];
		}
		if (models.length > 0) {
			return [];
		}
		if (activating) {
			return [{ vendor, label, message: localize('chat.modelPicker.loadingModels', "Loading models...") }];
		}
		if (this._delegate.getPresentationOptions().showAutoModel) {
			return [{ vendor, label, message: localize('chat.modelPicker.modelsPending', "Models will appear here once they are available.") }];
		}
		const entitlement = this._entitlementService.entitlement;
		const canUpgrade = entitlement === ChatEntitlement.Free || entitlement === ChatEntitlement.EDU;
		return [{
			vendor,
			label,
			message: canUpgrade
				? localize('chat.modelPicker.noModelsUpgradeMessage', "No models are available. Upgrade to GitHub Copilot Pro to use the best models.")
				: localize('chat.modelPicker.noModelsMessage', "No models are available."),
			action: canUpgrade ? {
				label: localize('chat.modelPicker.upgrade', "Upgrade"),
				run: () => {
					this._tabbedPicker.value?.hide();
					onLinkClick(URI.parse('command:workbench.action.chat.upgradePlan'));
				},
			} : undefined,
		}];
	}

	/** The on-device rows for this picker, only while the setting is on for a local Copilot chat; created on demand so pickers of users who haven't opted in never bind to the service. */
	private _getLocalModels(): ModelPickerLocalModels | undefined {
		const connection = this._delegate.getLocalModelConnection?.();
		const applies = this._configurationService.getValue<boolean>(LocalModelEnabledSettingId) === true
			&& this._delegate.getSessionType?.() === SessionType.AgentHostCopilot
			&& (!this._delegate.getLocalModelConnection || !!connection);
		if (!applies) {
			this._localModels.clear();
			this._localModelsController = undefined;
			this._localModelsConnection = undefined;
			return undefined;
		}
		if (!this._localModelsController || this._localModelsConnection !== connection) {
			const store = new DisposableStore();
			const controller = store.add(this._instantiationService.createInstance(ModelPickerLocalModels, connection, (event: ILocalModelPickerActionEvent) => this._logLocalModelPickerAction(event)));
			store.add(controller.onDidChange(() => this._refreshLocalModels()));
			this._localModels.value = store;
			this._localModelsController = controller;
			this._localModelsConnection = connection;
		}
		return this._localModelsController;
	}

	/** Updates an open picker's on-device rows in place, keeping keyboard focus on the row, and an on-device model's readout. */
	private _refreshLocalModels(): void {
		if (this._tabbedPicker.value?.isVisible) {
			this._tabbedPicker.value.setLocalModels(this._localModelsController?.getPresentation());
		}
		if (this._selectedModel && isLocalModelDirectRow(this._selectedModel)) {
			this._renderLabel();
		}
	}

	private _logLocalModelPickerAction(event: ILocalModelPickerActionEvent): void {
		this._telemetryService.publicLog2<LocalModelPickerActionEvent, LocalModelPickerActionClassification>('localModel.pickerAction', {
			action: event.action,
			fromReadiness: event.fromReadiness,
			installedFamilies: event.installedFamilies,
		});
		if (!event.fromSelection) {
			this._telemetryService.publicLog2<ChatModelPickerInteractionEvent, ChatModelPickerInteractionClassification>('chat.modelPickerInteraction', { interaction: 'localModelActionInvoked' });
		}
	}

	private _showTabbedPicker(anchor: HTMLElement, context: ITabbedModelPickerContext, telemetrySession: ModelPickerTelemetrySession, detailsModelId?: string, focusConfiguration = false, options?: IModelPickerOpenOptions): void {
		const picker = this._tabbedPicker.value ?? (this._tabbedPicker.value = this._instantiationService.createInstance(TabbedModelPicker));
		const previouslyFocusedElement = dom.getActiveElement();
		const trigger = detailsModelId ? this._configButton : this._nameButton;
		this._tabbedPickerHideListener.value = picker.onDidHide(({ finishedComparison }) => {
			this._tabbedPickerHideListener.clear();
			telemetrySession.close(whenModelConfigValuesSaved(context.configurationAccess));
			this._nameButton?.setAttribute('aria-expanded', 'false');
			this._configButton?.setAttribute('aria-expanded', 'false');
			this._domNode?.classList.remove('model-picker-active');
			if (finishedComparison && this._delegate.focusInput) {
				this._delegate.focusInput();
				return;
			}
			const previous = dom.isHTMLElement(previouslyFocusedElement) && previouslyFocusedElement.isConnected && previouslyFocusedElement.style.display !== 'none' ? previouslyFocusedElement : undefined;
			const target = detailsModelId
				? (trigger?.isConnected && trigger.style.display !== 'none' ? trigger : this._nameButton)
				: previous ?? this._nameButton;
			(target?.isConnected ? target : previous)?.focus();
		});
		trigger?.setAttribute('aria-expanded', 'true');
		this._domNode?.classList.add('model-picker-active');
		picker.show(anchor, context, detailsModelId, focusConfiguration, this._contextViewLayer, options);
		if (!picker.isVisible) {
			// Nothing to show, e.g. every model was filtered out, so the open ends here.
			this._tabbedPickerHideListener.clear();
			telemetrySession.close();
			this._nameButton?.setAttribute('aria-expanded', 'false');
			this._configButton?.setAttribute('aria-expanded', 'false');
			this._domNode?.classList.remove('model-picker-active');
		}
	}

	canOpenWithFilter(): boolean {
		return !!this._domNode?.isConnected && !this._domNode.classList.contains('disabled')
			&& !this.isRestrictedMode() && !this.isSetupRequired();
	}

	show(anchor?: HTMLElement, showDetails = false, focusConfiguration = false, trigger: IModelPickerOpenTrigger = { entryPoint: 'command', inputMethod: 'unknown' }, options?: IModelPickerOpenOptions): void {
		const anchorElement = anchor ?? this._domNode;
		if (!anchorElement || this._domNode?.classList.contains('disabled')) {
			return;
		}
		if (this._tabbedPicker.value?.isVisible) {
			if (options) {
				this._tabbedPicker.value.openWithFilter(options);
			} else {
				this._tabbedPicker.value.hide();
			}
			return;
		}

		const telemetrySession = new ModelPickerTelemetrySession(this._telemetryService, this._languageModelsService, trigger, this._selectedModel, {
			chatSessionId: this._delegate.getChatSessionId?.(),
			agentSessionId: this._delegate.getAgentSessionId?.(),
		}, this._delegate.getProvider ? this._delegate.getProvider() : 'unknown');

		const localModels = this._getLocalModels();
		const applySelection = (model: ILanguageModelChatMetadataAndIdentifier) => {
			telemetrySession.logModelChange(this._selectedModel, model);
			this._selectedModel = model;
			this._renderLabel();
			this._onDidChangeSelection.fire(model);
		};
		const onSelect = (model: ILanguageModelChatMetadataAndIdentifier) => {
			// Selecting an installed on-device model loads it at once, without asking: the notice above
			// the chat input shows it waiting for running responses and loading, with Cancel.
			if (localModels?.loadOnSelect(model)) {
				logModelPickerInteraction('localModelSelected');
			}
			applySelection(model);
		};

		// Models left over from a trusted or signed-in session cannot be used, so none are
		// listed until the picker is available again.
		const pickerModels = this._delegate.getModels();
		const availability = this._availability(pickerModels);
		const restrictedMode = availability.reason === ModelPickerUnavailableReason.Restricted;
		const unavailable = availability.reason !== undefined;
		const models = unavailable ? [] : pickerModels;
		const comparisonModels = unavailable ? [] : this._delegate.getComparisonModels?.();
		const presentation = this._delegate.getPresentationOptions();
		const canShowManageModelsAction = presentation.showManageModelsAction && shouldShowManageModelsAction(this._entitlementService);
		const manageModelsAction = canShowManageModelsAction ? createManageModelsAction(this._commandService, this._delegate.getSessionType?.()) : undefined;
		const manageModelsDisabledReason = manageModelsAction ? getAddModelsUnavailableReason(this._delegate.getSessionType?.(), this._environmentService.remoteAuthority) : undefined;
		const logModelPickerInteraction = (interaction: ChatModelPickerInteraction) => {
			this._telemetryService.publicLog2<ChatModelPickerInteractionEvent, ChatModelPickerInteractionClassification>('chat.modelPickerInteraction', { interaction });
		};
		const manageSettingsUrl = this._defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings);
		const onLinkClick = (uri: URI) => {
			if (uri.scheme === 'command' && uri.path === 'workbench.action.chat.upgradePlan') {
				logModelPickerInteraction('premiumModelUpgradePlanClicked');
			} else if (manageSettingsUrl && this._uriIdentityService.extUri.isEqual(uri, URI.parse(manageSettingsUrl))) {
				logModelPickerInteraction('disabledModelContactAdminClicked');
			}
			void this._openerService.open(uri, { allowCommands: true });
		};

		const placeholders = this._providerPlaceholders(models, availability, onLinkClick);
		const manifest = this._languageModelsService.getModelsControlManifest();
		const controlModelsForTier: IStringDictionary<IModelControlEntry> = unavailable ? {} : getModelPickerControlModels(manifest, this._entitlementService.entitlement, models);
		const onDidToggleOtherModels = (collapsed: boolean) => {
			if (!collapsed) {
				telemetrySession.logOtherModelsExpanded();
			}
			logModelPickerInteraction(collapsed ? 'otherModelsCollapsed' : 'otherModelsExpanded');
		};
		const onTogglePin = (modelIdentifier: string, pinned: boolean) => {
			const telemetry = { pickerSessionId: telemetrySession.id };
			if (pinned) {
				this._languageModelsService.pinModel(modelIdentifier, telemetry);
			} else {
				this._languageModelsService.unpinModel(modelIdentifier, telemetry);
			}
		};
		const showCacheBreakHint = this.shouldShowCacheBreakHint(/* excludeAutoModel */ true, availability);
		const showConfigurationCacheBreakHint = this.shouldShowCacheBreakHint(/* excludeAutoModel */ false, availability);
		this._showTabbedPicker(anchorElement, {
			comparison: this._delegate.comparison,
			models,
			comparisonModels,
			selectedModelId: this._selectedModel?.identifier,
			recentModelIds: this._languageModelsService.getRecentlyUsedModelIds().filter(id => !this._languageModelsService.isModelHidden(id)),
			pinnedModelIds: this._languageModelsService.getPinnedModelIds().filter(id => !this._languageModelsService.isModelHidden(id)),
			controlModels: controlModelsForTier,
			configurationAccess: this._delegate.modelConfiguration ?? this._languageModelsService,
			isUBB: !!this._entitlementService.quotas.usageBasedBilling,
			showManageModels: !!manageModelsAction && !restrictedMode,
			manageModelsDisabledReason,
			providerPlaceholders: placeholders,
			unavailableContext: {
				show: presentation.showUnavailableFeatured,
				currentVSCodeVersion: this._productService.version,
				manageSettingsUrl,
				updateStateType: this._updateService.state.type,
			},
			onUnavailableLinkClick: onLinkClick,
			onSelect,
			onTogglePin,
			onManageModels: () => manageModelsAction?.run(),
			onDidToggleOtherModels,
			onDidSearch: () => telemetrySession.logSearch(),
			onConfigurationChanged: (model, group, key, fromValue, toValue, requestedAt) => {
				telemetrySession.logConfigurationChange(model, group, key, fromValue, toValue, requestedAt);
				this._renderLabel();
			},
			cacheBreakHint: showCacheBreakHint ? {
				text: localize('chat.modelPicker.cacheBreakHint', "Switching models mid-session resets the prompt cache and may increase cost."),
				link: this.getCacheBreakLearnMoreLink(),
				dismiss: () => this.dismissCacheBreakHint(),
			} : undefined,
			configurationCacheBreakHint: showConfigurationCacheBreakHint ? {
				text: localize('chat.config.cacheBreakHint', "Changing these options mid-session resets the prompt cache and may increase cost."),
				link: this.getCacheBreakLearnMoreLink(),
				dismiss: () => this.dismissCacheBreakHint(),
			} : undefined,
			localModels: localModels?.getPresentation(),
		}, telemetrySession, showDetails ? this._selectedModel?.identifier : undefined, focusConfiguration, options);
	}

	private _updateBadge(): void {
		if (this._badgeIcon) {
			if (this._badge) {
				const icon = this._badge === 'info' ? Codicon.info : Codicon.warningCompact;
				dom.reset(this._badgeIcon, renderIcon(icon));
				this._badgeIcon.style.display = '';
				this._badgeIcon.classList.toggle('info', this._badge === 'info');
				this._badgeIcon.classList.toggle('warning', this._badge === 'warning');
			} else {
				this._badgeIcon.style.display = 'none';
			}
		}
	}

	get organizationDefaultDescription(): string | undefined {
		return this._organizationDefaultDescription;
	}

	private _renderLabel(models?: readonly ILanguageModelChatMetadataAndIdentifier[]): void {
		if (!this._domNode || !this._nameButton) {
			return;
		}

		models ??= this._delegate.getModels();
		const comparisonSummary = this._delegate.comparison?.summary.get();
		const comparisonBusy = !!comparisonSummary && (this._delegate.comparisonBusy?.get() ?? false);
		const routingTier = !comparisonSummary && this._selectedModel ? this._getRoutingTier(this._selectedModel, models) : undefined;
		const shownModel = routingTier?.shownModel ?? this._selectedModel;
		const displayName = shownModel ? getLanguageModelDisplayNameWithSubscriptionSource(shownModel) : undefined;
		const configurationAccess = this._delegate.modelConfiguration ?? this._languageModelsService;
		// A HydraFusion model shown as one of Fusion's tiers is named by that tier, even where the label shows only Fusion.
		this._fusionDisplayName = !comparisonSummary && routingTier && shownModel?.metadata.autoModelFusion ? localize('chat.modelPicker.fusionTier', "Copilot Fusion {0}", routingTier.label) : undefined;
		// A directly selected on-device model reads "<model> · On-device", like the Copilot CLI and app.
		const name = comparisonSummary ?? (shownModel && displayName !== undefined && isLocalModelDirectRow(shownModel) ? formatLocalModelOnDeviceName(displayName) : displayName);

		const { reason, activating, genericNoModels, noModels: noModelsAvailable } = this._availability(models);
		const restrictedMode = reason === ModelPickerUnavailableReason.Restricted;
		const setupRequired = reason === ModelPickerUnavailableReason.SetupRequired;
		const unavailable = reason !== undefined;
		const organizationDefaultModel = !unavailable && !comparisonSummary ? getOrganizationDefaultModel(this._configurationService, models) : undefined;
		this._organizationDefaultDescription = organizationDefaultModel ? getOrganizationDefaultDescription(organizationDefaultModel.metadata.name) : undefined;

		// --- Name section ---
		const nameChildren: (HTMLElement | string)[] = [];
		const compact = this._compact?.get() ?? false;
		const minimal = this._minimal?.get() ?? false;
		const modelIcon = comparisonBusy ? Codicon.loadingCompact : comparisonSummary ? Codicon.compare : shownModel
			? (this._delegate.getPresentationOptions().showModelIcon
				? getCompactModelPickerIcon(shownModel)
				: shownModel.metadata.statusIcon ? getCompactCodicon(shownModel.metadata.statusIcon) : undefined)
			: undefined;
		if (modelIcon && !noModelsAvailable) {
			nameChildren.push(renderIcon(modelIcon));
		}
		// A "Models" placeholder (no badge) beats a dead-end label while unavailable — the hover and
		// dropdown carry the Restricted Mode explanation and the Trust Workspace / Sign In action.
		// "Activating..." is transient while models load after a Trust grant; "No models available"
		// is the genuinely empty state (e.g. an agent-host session with no Auto fallback).
		const modelLabel = unavailable
			? localize('chat.modelPicker.modelsLabel', "Models")
			: activating
				? localize('chat.modelPicker.activating', "Activating...")
				: genericNoModels
					? localize('chat.modelPicker.noModels', "No models available")
					: (name ?? localize('chat.modelPicker.auto', "Auto"));
		const showModelLabel = (!comparisonSummary || noModelsAvailable) && (!compact || !modelIcon || noModelsAvailable);
		if (showModelLabel) {
			nameChildren.push(dom.$('span.chat-input-picker-label', undefined, modelLabel));
		}
		if (this._badgeIcon) {
			nameChildren.push(this._badgeIcon);
		}
		dom.reset(this._nameButton, ...nameChildren);

		if (this._configButton) {
			this._configButton.setAttribute('aria-haspopup', 'dialog');
			// An on-device model's readout is its state and settings, and opens its family's detail page.
			const localModelReadout = this._selectedModel && isLocalModelDirectRow(this._selectedModel)
				? this._getLocalModels()?.getPresentation()?.getDirectModel(this._selectedModel, configurationAccess)?.readout
				: undefined;
			renderModelConfigurationButton(this._configButton, shownModel, configurationAccess, !!comparisonSummary || minimal || compact || noModelsAvailable, routingTier?.label, localModelReadout);
		}
		const configVisible = !!this._configButton && this._configButton.style.display !== 'none';
		this._domNode.classList.toggle('has-config', configVisible);
		// Only a name that collapses to its icon becomes the compact square; without an
		// icon to collapse to, the name keeps its label and stays a regular chip.
		this._domNode.classList.toggle('compact', compact && !showModelLabel);
		this._domNode.classList.toggle('icon-only', !showModelLabel && !configVisible);
		this._domNode.classList.toggle('comparison-busy', comparisonBusy);

		// Aria — name the control "Models" to match the visible label; the comma
		// separates the control name from its current value / state.
		const ariaLabel = restrictedMode
			? localize('chat.modelPicker.ariaLabelRestricted', "Models, unavailable while in Restricted mode")
			: setupRequired
				? localize('chat.modelPicker.ariaLabelSetupRequired', "Models, sign in to use Copilot")
				: localize('chat.modelPicker.ariaLabel', "Models, {0}", modelLabel);
		this._domNode.ariaLabel = ariaLabel;
		this._nameButton.ariaLabel = ariaLabel;
		this._nameButton.ariaDescription = this.organizationDefaultDescription ?? '';

		const nameMinimumWidth = showModelLabel ? this._getNameMinimumWidth(this._nameButton) : MODEL_PICKER_COMPACT_NAME_WIDTH;
		// A name narrower than the minimum is held at exactly its own width; a pixel value
		// rounded from its measurement could cut into the label and ellipsize it.
		this._nameButton.style.minWidth = showModelLabel && nameMinimumWidth < MODEL_PICKER_MINIMUM_NAME_WIDTH ? 'max-content' : `${nameMinimumWidth}px`;
		this._updateMinimumWidth(nameMinimumWidth);
	}

	/**
	 * How narrow the name may get before the picker compacts. A long name shrinks to
	 * the minimum label width and ellipsizes; a shorter one keeps its own width, as
	 * raising it to that minimum would pad it with empty space before the
	 * configuration readout.
	 *
	 * The name is measured unconstrained, so the result depends only on its content
	 * and styles, not on the width it currently has. Rendering again from the
	 * resize-driven compact autorun therefore settles.
	 */
	private _getNameMinimumWidth(nameButton: HTMLElement): number {
		const { flex, width, minWidth } = nameButton.style;
		nameButton.style.flex = 'none';
		nameButton.style.width = 'max-content';
		nameButton.style.minWidth = '0';
		const contentWidth = nameButton.getBoundingClientRect().width;
		nameButton.style.flex = flex;
		nameButton.style.width = width;
		nameButton.style.minWidth = minWidth;
		// Nothing to measure until the picker is laid out (e.g. while detached); keep
		// the full minimum until a later render can measure it.
		if (contentWidth === 0) {
			return MODEL_PICKER_MINIMUM_NAME_WIDTH;
		}
		return Math.min(contentWidth, MODEL_PICKER_MINIMUM_NAME_WIDTH);
	}

}
