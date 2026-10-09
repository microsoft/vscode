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
import { Disposable, MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { disposableTimeout } from '../../../../../../../base/common/async.js';
import { autorun, IObservable } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { localize } from '../../../../../../../nls.js';
import { IActionListHeaderLink } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import { COPILOT_VENDOR_ID, getLanguageModelProviderDisplayName, IModelControlEntry, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, isUserProvidedModel } from '../../../../common/languageModels.js';
import { getLanguageModelDisplayNameWithSubscriptionSource } from '../../../../common/languageModelSourcePresentation.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { IModelPickerDelegate } from './modelPickerActionItem.js';
import { CHAT_SETUP_ACTION_ID } from '../../../actions/chatActions.js';
import { IUriIdentityService } from '../../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { GitHubPaths, IDefaultAccountService } from '../../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IUpdateService } from '../../../../../../../platform/update/common/update.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../../platform/workspace/common/workspaceTrust.js';
import { getCompactCodicon } from '../../../chatIcons.js';
import { renderChatInputPickerSplit } from '../chatInputPickerActionItem.js';
import { createManageModelsAction, getModelPickerControlModels, shouldShowManageModelsAction } from './modelPickerItems.js';
import { renderModelConfigurationButton } from './modelPickerConfiguration.js';
import { getCompactModelPickerIcon } from './modelProviderIcons.js';
import { ITabbedModelPickerContext, TabbedModelPicker } from './modelPickerTabbedWidget.js';
import { IModelPickerOpenTrigger, ModelPickerTelemetrySession } from './modelPickerTelemetry.js';
import { whenModelConfigValuesSaved } from './modelPickerModelConfig.js';
import { IModelPickerProviderPlaceholder } from './modelPickerTabs.js';
import { getModelPickerUnavailableReason, isAutoModel, isHydraFusionModel, isHydraFusionUpgradeOnly, ModelPickerUnavailableReason, modelPickerRequiresSetup, shouldShowCacheBreakHint as computeShouldShowCacheBreakHint } from './modelPickerPresentation.js';

/** Trusted caller options for opening a searchable picker without toggling it closed. */
export interface IModelPickerOpenOptions {
	readonly initialFilterValue?: string;
	readonly initialFocusItemId?: string;
}

const CACHE_BREAK_HINT_DISMISSED_STORAGE_KEY = 'chat.cacheBreakHintDismissed';

const MODEL_PICKER_MINIMUM_LABEL_WIDTH = 60;
const MODEL_PICKER_NAME_CHROME_WIDTH = 30;
const MODEL_PICKER_MINIMUM_NAME_WIDTH = MODEL_PICKER_MINIMUM_LABEL_WIDTH + MODEL_PICKER_NAME_CHROME_WIDTH;
const MODEL_PICKER_COMPACT_NAME_WIDTH = 22;
type ChatModelPickerInteraction = 'disabledModelContactAdminClicked' | 'premiumModelUpgradePlanClicked' | 'otherModelsExpanded' | 'otherModelsCollapsed';

type ChatModelPickerInteractionClassification = {
	owner: 'sandy081';
	comment: 'Reporting interactions in the chat model picker';
	interaction: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model picker interaction that occurred' };
};

type ChatModelPickerInteractionEvent = {
	interaction: ChatModelPickerInteraction;
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

	get selectedModel(): ILanguageModelChatMetadataAndIdentifier | undefined {
		return this._selectedModel;
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
	) {
		super();
		if (this._delegate.workflow) {
			this._register(autorun(reader => {
				this._delegate.workflow?.summary.read(reader);
				if (!this._delegate.workflow?.available.read(reader)) {
					this._tabbedPicker.value?.hide();
				}
				this._renderLabel();
			}));
		}
		this._register(this._languageModelsService.onDidChangeLanguageModels(() => {
			if (this._activatingAfterTrust && this._delegate.getModels().length > 0) {
				this._clearActivating();
			}
			this._renderLabel();
			// While unavailable the picker explains why instead of listing models, so it
			// only takes on new models once they can be used.
			if (this._unavailableReason() === undefined) {
				this._tabbedPicker.value?.refresh(this._delegate.getModels());
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
		if (selectedModel && selectedModel !== model) {
			if (this._delegate.setModelProgrammatically) {
				this._delegate.setModelProgrammatically(selectedModel);
			} else {
				this._delegate.setModel(selectedModel);
			}
		}
		this._renderLabel();
	}

	private _normalizeSelectedModel(model: ILanguageModelChatMetadataAndIdentifier | undefined): ILanguageModelChatMetadataAndIdentifier | undefined {
		if (!isHydraFusionUpgradeOnly(this._entitlementService.entitlement) ||
			!model ||
			!isHydraFusionModel(model) ||
			isUserProvidedModel(model, this._languageModelsService)) {
			return model;
		}
		const models = this._delegate.getModels();
		return models.find(model => isAutoModel(model) && !isUserProvidedModel(model, this._languageModelsService))
			?? models.find(model => !isHydraFusionModel(model) || isUserProvidedModel(model, this._languageModelsService))
			?? model;
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
	private _unavailableReason(): ModelPickerUnavailableReason | undefined {
		return getModelPickerUnavailableReason({
			trustInitialized: this._workspaceTrustInitialized,
			trusted: this._workspaceTrustManagementService.isWorkspaceTrusted(),
			pickerModels: this._delegate.getModels(),
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

		// The readout opens Auto choices or the selected model's details.
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
	private _availability(): IModelPickerAvailability {
		// Queried directly rather than through the isRestrictedMode()/isSetupRequired() wrappers,
		// which would each recompute it.
		const reason = this._unavailableReason();
		const empty = this._delegate.getModels().length === 0;
		const activating = reason === undefined && empty && this._activatingAfterTrust;
		const genericNoModels = reason === undefined && !activating && empty && !this._delegate.getPresentationOptions().showAutoModel;
		return { reason, activating, genericNoModels, noModels: reason !== undefined || activating || genericNoModels };
	}

	/** Thin wrapper over {@link computeShouldShowCacheBreakHint} that supplies this picker's live state. */
	private shouldShowCacheBreakHint(excludeAutoModel: boolean): boolean {
		return computeShouldShowCacheBreakHint({
			dismissed: this.isCacheBreakHintDismissed(),
			cacheWarm: this._delegate.isCacheWarm?.() ?? false,
			noModelsAvailable: this._availability().noModels,
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
	private _providerPlaceholders(models: readonly ILanguageModelChatMetadataAndIdentifier[], onLinkClick: (uri: URI) => void): IModelPickerProviderPlaceholder[] {
		const { reason, activating } = this._availability();
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

	private _showTabbedPicker(anchor: HTMLElement, context: ITabbedModelPickerContext, telemetrySession: ModelPickerTelemetrySession, detailsModelId?: string, focusConfiguration = false, options?: IModelPickerOpenOptions): void {
		const picker = this._tabbedPicker.value ?? (this._tabbedPicker.value = this._instantiationService.createInstance(TabbedModelPicker));
		const previouslyFocusedElement = dom.getActiveElement();
		const trigger = detailsModelId ? this._configButton : this._nameButton;
		this._tabbedPickerHideListener.value = picker.onDidHide(() => {
			this._tabbedPickerHideListener.clear();
			telemetrySession.close(whenModelConfigValuesSaved(context.configurationAccess));
			this._nameButton?.setAttribute('aria-expanded', 'false');
			this._configButton?.setAttribute('aria-expanded', 'false');
			this._domNode?.classList.remove('model-picker-active');
			const previous = dom.isHTMLElement(previouslyFocusedElement) && previouslyFocusedElement.isConnected && previouslyFocusedElement.style.display !== 'none' ? previouslyFocusedElement : undefined;
			const target = detailsModelId
				? (trigger?.isConnected && trigger.style.display !== 'none' ? trigger : this._nameButton)
				: previous ?? this._nameButton;
			(target?.isConnected ? target : previous)?.focus();
		});
		trigger?.setAttribute('aria-expanded', 'true');
		// Routing models have no Details, so their readout opens this same list.
		if (this._selectedModel && (isAutoModel(this._selectedModel) || isHydraFusionModel(this._selectedModel))) {
			this._configButton?.setAttribute('aria-expanded', 'true');
		}
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

		const telemetrySession = new ModelPickerTelemetrySession(this._telemetryService, this._languageModelsService, trigger, this._selectedModel, this._delegate.getChatSessionId?.(), this._delegate.getProvider ? this._delegate.getProvider() : 'unknown');

		const onSelect = (model: ILanguageModelChatMetadataAndIdentifier) => {
			telemetrySession.logModelChange(this._selectedModel, model, this._delegate.getChatSessionId?.());
			this._selectedModel = model;
			this._renderLabel();
			this._onDidChangeSelection.fire(model);
		};

		// Models left over from a trusted or signed-in session cannot be used, so none are
		// listed until the picker is available again.
		const restrictedMode = this.isRestrictedMode();
		const unavailable = this._unavailableReason() !== undefined;
		const models = unavailable ? [] : this._delegate.getModels();
		const presentation = this._delegate.getPresentationOptions();
		const canShowManageModelsAction = presentation.showManageModelsAction && shouldShowManageModelsAction(this._entitlementService);
		const manageModelsAction = canShowManageModelsAction ? createManageModelsAction(this._commandService, this._delegate.getSessionType?.()) : undefined;
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

		const placeholders = this._providerPlaceholders(models, onLinkClick);
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
		const showCacheBreakHint = this.shouldShowCacheBreakHint(/* excludeAutoModel */ true);
		const showConfigurationCacheBreakHint = this.shouldShowCacheBreakHint(/* excludeAutoModel */ false);
		this._showTabbedPicker(anchorElement, {
			workflow: this._delegate.workflow,
			models,
			selectedModelId: this._selectedModel?.identifier,
			recentModelIds: this._languageModelsService.getRecentlyUsedModelIds().filter(id => !this._languageModelsService.isModelHidden(id)),
			pinnedModelIds: this._languageModelsService.getPinnedModelIds().filter(id => !this._languageModelsService.isModelHidden(id)),
			controlModels: controlModelsForTier,
			configurationAccess: this._delegate.modelConfiguration ?? this._languageModelsService,
			isUBB: !!this._entitlementService.quotas.usageBasedBilling,
			showManageModels: !!manageModelsAction && !restrictedMode,
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
		}, telemetrySession, showDetails && this._selectedModel && !isAutoModel(this._selectedModel) && !isHydraFusionModel(this._selectedModel) ? this._selectedModel.identifier : undefined, focusConfiguration, options);
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

	private _renderLabel(): void {
		if (!this._domNode || !this._nameButton) {
			return;
		}

		const workflow = this._delegate.workflow?.summary.get();
		const name = workflow ?? (this._selectedModel
			? getLanguageModelDisplayNameWithSubscriptionSource(this._selectedModel)
			: undefined);

		const { reason, activating, genericNoModels, noModels: noModelsAvailable } = this._availability();
		const restrictedMode = reason === ModelPickerUnavailableReason.Restricted;
		const setupRequired = reason === ModelPickerUnavailableReason.SetupRequired;
		const unavailable = reason !== undefined;

		// --- Name section ---
		const nameChildren: (HTMLElement | string)[] = [];
		const modelIcon = workflow ? Codicon.layers : this._selectedModel
			? (this._delegate.getPresentationOptions().showModelIcon
				? getCompactModelPickerIcon(this._selectedModel)
				: this._selectedModel.metadata.statusIcon ? getCompactCodicon(this._selectedModel.metadata.statusIcon) : undefined)
			: undefined;
		const compact = this._compact?.get() ?? false;
		const minimal = this._minimal?.get() ?? false;
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
		const showModelLabel = !compact || !modelIcon || noModelsAvailable;
		const showingAuto = !unavailable && !activating && !genericNoModels && (!this._selectedModel || isAutoModel(this._selectedModel));
		if (showModelLabel) {
			nameChildren.push(dom.$('span.chat-input-picker-label', undefined, modelLabel));
		}
		if (this._badgeIcon) {
			nameChildren.push(this._badgeIcon);
		}
		dom.reset(this._nameButton, ...nameChildren);

		if (this._configButton) {
			const opensDetails = !showingAuto && !(this._selectedModel && isHydraFusionModel(this._selectedModel));
			this._configButton.setAttribute('aria-haspopup', opensDetails ? 'dialog' : 'menu');
			renderModelConfigurationButton(this._configButton, this._selectedModel, this._delegate.modelConfiguration ?? this._languageModelsService, !!workflow || minimal || compact || noModelsAvailable);
		}
		const configVisible = !!this._configButton && this._configButton.style.display !== 'none';
		this._domNode.classList.toggle('has-config', configVisible);
		// Only a name that collapses to its icon becomes the compact square; without an
		// icon to collapse to, the name keeps its label and stays a regular chip.
		this._domNode.classList.toggle('compact', compact && !showModelLabel);
		this._domNode.classList.toggle('icon-only', !showModelLabel && !configVisible);

		// Aria — name the control "Models" to match the visible label; the comma
		// separates the control name from its current value / state.
		const ariaLabel = restrictedMode
			? localize('chat.modelPicker.ariaLabelRestricted', "Models, unavailable while in Restricted mode")
			: setupRequired
				? localize('chat.modelPicker.ariaLabelSetupRequired', "Models, sign in to use Copilot")
				: localize('chat.modelPicker.ariaLabel', "Models, {0}", modelLabel);
		this._domNode.ariaLabel = ariaLabel;
		this._nameButton.ariaLabel = ariaLabel;

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
