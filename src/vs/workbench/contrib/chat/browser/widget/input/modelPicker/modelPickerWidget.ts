/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/modelPicker.css';

import * as dom from '../../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../../base/browser/keyboardEvent.js';
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
import { IActionWidgetService } from '../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction } from '../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import { TelemetryTrustedValue } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IModelControlEntry, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../common/languageModels.js';
import { ChatEntitlement, chatRequiresSetup, IChatEntitlementService } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { IModelPickerDelegate } from './modelPickerActionItem.js';
import { CHAT_SETUP_ACTION_ID } from '../../../actions/chatActions.js';
import { IUriIdentityService } from '../../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { GitHubPaths, IDefaultAccountService } from '../../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IUpdateService } from '../../../../../../../platform/update/common/update.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../../platform/workspace/common/workspaceTrust.js';
import { withChatInputPickerMotion } from '../chatInputPickerActionItem.js';
import { buildModelPickerItems, createManageModelsAction, getControlModelsForEntitlement, getModelPickerAccessibilityProvider, ModelPickerSection, shouldShowManageModelsAction } from './modelPickerItems.js';
import { ModelPickerConfiguration } from './modelPickerConfiguration.js';
import { getModelPickerIcon } from './modelProviderIcons.js';
import { getModelPickerUnavailableReason, isAutoModel, ModelPickerUnavailableReason, shouldShowCacheBreakHint as computeShouldShowCacheBreakHint } from './modelPickerPresentation.js';

const CACHE_BREAK_HINT_DISMISSED_STORAGE_KEY = 'chat.cacheBreakHintDismissed';
type ChatModelChangeClassification = {
	owner: 'lramos15';
	comment: 'Reporting when the model picker is switched';
	fromModel?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous chat model' };
	toModel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new chat model' };
	chatSessionId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the current chat session, used to correlate the model switch with the session.' };
};

type ChatModelChangeEvent = {
	fromModel: string | TelemetryTrustedValue<string> | undefined;
	toModel: string | TelemetryTrustedValue<string>;
	chatSessionId?: string;
};

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
 * Renders a button showing the currently selected model name.
 * On click, opens a grouped picker popup with:
 * Auto → Promoted (recently used + curated) → Other Models (collapsed with search).
 *
 * The widget owns its state - set models, selection, and curated IDs via setters.
 * Listen for selection changes via `onDidChangeSelection`.
 */
export class ModelPickerWidget extends Disposable {

	private readonly _onDidChangeSelection = this._register(new Emitter<ILanguageModelChatMetadataAndIdentifier>());
	readonly onDidChangeSelection: Event<ILanguageModelChatMetadataAndIdentifier> = this._onDidChangeSelection.event;

	private _selectedModel: ILanguageModelChatMetadataAndIdentifier | undefined;
	private _badge: ModelPickerBadge | undefined;
	private _compact: IObservable<boolean> | undefined;
	private _workspaceTrustInitialized = false;
	private _activatingAfterTrust = false;
	private readonly _activatingTimer = this._register(new MutableDisposable());

	private _domNode: HTMLElement | undefined;
	private _badgeIcon: HTMLElement | undefined;
	private _nameButton: HTMLElement | undefined;
	private _configButton: HTMLElement | undefined;
	private readonly _configuration: ModelPickerConfiguration;

	get selectedModel(): ILanguageModelChatMetadataAndIdentifier | undefined {
		return this._selectedModel;
	}

	get domNode(): HTMLElement | undefined {
		return this._domNode;
	}

	get nameButton(): HTMLElement | undefined {
		return this._nameButton;
	}

	constructor(
		private readonly _delegate: IModelPickerDelegate,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
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
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._configuration = instantiationService.createInstance(ModelPickerConfiguration, {
			getSelectedModel: () => this._selectedModel,
			getConfigurationAccess: () => this._delegate.modelConfiguration ?? this._languageModelsService,
			isDisabled: () => !!this._domNode?.classList.contains('disabled'),
			shouldShowCacheBreakHint: () => this.shouldShowCacheBreakHint(/* excludeAutoModel */ false),
			getCacheBreakLearnMoreLink: () => this.getCacheBreakLearnMoreLink(),
			dismissCacheBreakHint: () => this.dismissCacheBreakHint(),
		});
		this._register(this._languageModelsService.onDidChangeLanguageModels(() => {
			if (this._activatingAfterTrust && this._delegate.getModels().length > 0) {
				this._clearActivating();
			}
			this._renderLabel();
		}));

		// Reflect Restricted Mode immediately when trust changes. When trust is
		// granted but no models are available yet, briefly show an "Activating..."
		// state while the chat extension comes up and loads them, rather than a
		// misleading "Auto" fallback.
		this._register(this._workspaceTrustManagementService.onDidChangeTrust(trusted => {
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
		this._register(this._entitlementService.onDidChangeEntitlement(() => this._renderLabel()));
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
			const isCompact = compact.read(reader);
			if (this._domNode) {
				this._domNode.classList.toggle('compact', isCompact);
			}
			this._renderLabel();
		}));
	}

	setSelectedModel(model: ILanguageModelChatMetadataAndIdentifier | undefined): void {
		this._selectedModel = model;
		this._renderLabel();
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
		const sentiment = this._entitlementService.sentiment;
		return chatRequiresSetup({
			completed: !!sentiment.completed,
			disabled: !!sentiment.disabled,
			// Don't derive `untrusted` from sentiment (it lags after a Trust grant): trust is handled
			// authoritatively by the Restricted branch, which runs first, so it's false here.
			untrusted: false,
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
		this._domNode.setAttribute('role', 'group');
		// The container groups the individual buttons; only the buttons should be
		// tab stops, not the container itself.
		this._domNode.tabIndex = -1;

		// Apply initial collapsed state now that _domNode exists
		if (this._compact?.get()) {
			this._domNode.classList.toggle('compact', true);
		}

		// Model name button
		this._nameButton = dom.append(this._domNode, dom.$('a.model-picker-section.model-picker-name'));
		this._nameButton.tabIndex = 0;
		this._nameButton.setAttribute('role', 'button');
		this._nameButton.setAttribute('aria-haspopup', 'true');
		this._nameButton.setAttribute('aria-expanded', 'false');

		// Combined configuration button (conditionally visible): opens a single
		// dropdown with Thinking Effort and Context Size sections.
		this._configButton = dom.append(this._domNode, dom.$('a.model-picker-section.model-picker-config'));
		this._configButton.tabIndex = 0;
		this._configButton.setAttribute('role', 'button');
		this._configButton.setAttribute('aria-haspopup', 'true');
		this._configButton.setAttribute('aria-expanded', 'false');
		this._configButton.style.display = 'none';

		this._badgeIcon = dom.$('span.model-picker-badge');
		this._updateBadge();

		this._renderLabel();

		this._registerButtonAction(this._nameButton, () => this.show());
		this._registerButtonAction(this._configButton, () => this._configuration.show(this._configButton));

		// Managed hover for the combined configuration button
		this._register(getBaseLayerHoverDelegate().setupManagedHover(
			getDefaultHoverDelegate('mouse'),
			this._configButton,
			localize('chat.modelPicker.configTooltip', "Configure Model")
		));
	}

	/**
	 * Registers mouse-down and Enter/Space key handlers on a button element.
	 */
	private _registerButtonAction(element: HTMLElement, action: () => void): void {
		this._register(dom.addDisposableGenericMouseDownListener(element, e => {
			if (e.button !== 0) {
				return;
			}
			dom.EventHelper.stop(e, true);
			action();
		}));
		this._register(dom.addDisposableListener(element, dom.EventType.KEY_DOWN, (e) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				dom.EventHelper.stop(e, true);
				action();
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

	show(anchor?: HTMLElement): void {
		const anchorElement = anchor ?? this._domNode;
		if (!anchorElement || this._domNode?.classList.contains('disabled')) {
			return;
		}
		if (this._nameButton?.getAttribute('aria-expanded') === 'true') {
			this._actionWidgetService.hide(true);
			return;
		}

		const previousModel = this._selectedModel;

		const onSelect = (model: ILanguageModelChatMetadataAndIdentifier) => {
			this._telemetryService.publicLog2<ChatModelChangeEvent, ChatModelChangeClassification>('chat.modelChange', {
				fromModel: previousModel?.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(previousModel.identifier) : 'unknown',
				toModel: model.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(model.identifier) : 'unknown',
				chatSessionId: this._delegate.getChatSessionId?.()
			});
			this._selectedModel = model;
			this._renderLabel();
			this._onDidChangeSelection.fire(model);
		};

		// Selecting a model from a hover's config button: apply the selection,
		// close the model picker, then open the config picker focused on the
		// requested section (Thinking Effort or Context Size).
		const onConfigure = (model: ILanguageModelChatMetadataAndIdentifier, group: string) => {
			onSelect(model);
			this._actionWidgetService.hide();
			this._configuration.show(this._configButton, group);
		};

		const models = this._delegate.getModels();
		const presentation = this._delegate.getPresentationOptions();
		const isSignedOut = this._entitlementService.entitlement === ChatEntitlement.Unknown;
		const manifest = this._languageModelsService.getModelsControlManifest();
		// Signed-out users (e.g. offline-BYOK) should not see Copilot control-manifest entries
		const controlModelsForTier: IStringDictionary<IModelControlEntry> = isSignedOut ? {} : getControlModelsForEntitlement(manifest, this._entitlementService.entitlement);
		const canShowManageModelsAction = presentation.showManageModelsAction && shouldShowManageModelsAction(this._entitlementService);
		const manageModelsAction = canShowManageModelsAction ? createManageModelsAction(this._commandService) : undefined;
		const logModelPickerInteraction = (interaction: ChatModelPickerInteraction) => {
			this._telemetryService.publicLog2<ChatModelPickerInteractionEvent, ChatModelPickerInteractionClassification>('chat.modelPickerInteraction', { interaction });
		};
		const manageSettingsUrl = this._defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings);
		const onTogglePin = (modelIdentifier: string, pinned: boolean) => {
			if (pinned) {
				this._languageModelsService.pinModel(modelIdentifier);
			} else {
				this._languageModelsService.unpinModel(modelIdentifier);
			}
			// Re-show the picker to reflect the updated pin state
			this._actionWidgetService.hide();
			this.show(anchorElement);
		};

		const items = buildModelPickerItems({
			models,
			selectedModelId: this._selectedModel?.identifier,
			recentModelIds: this._languageModelsService.getRecentlyUsedModelIds().filter(id => !this._languageModelsService.isModelHidden(id)),
			pinnedModelIds: this._languageModelsService.getPinnedModelIds().filter(id => !this._languageModelsService.isModelHidden(id)),
			controlModels: controlModelsForTier,
			currentVSCodeVersion: this._productService.version,
			updateStateType: this._updateService.state.type,
			manageSettingsUrl,
			manageModelsAction,
			chatEntitlementService: this._entitlementService,
			languageModelsService: this._languageModelsService,
			openerService: this._openerService,
			presentation: {
				...presentation,
				restrictedMode: this.isRestrictedMode(),
				setupRequired: this.isSetupRequired(),
				isUBB: !!this._entitlementService.quotas.usageBasedBilling,
			},
			actions: {
				onSelect,
				onTogglePin,
				onConfigure,
				onRequestTrust: () => { void this._requestWorkspaceTrust(); },
				onRequestSetup: () => { this._requestSetup(); },
			},
		});

		// Collect all hover disposables so they are properly cleaned up when the
		// picker is hidden. The ActionListWidget only tracks the disposable for the
		// currently-shown hover; all other items' hover disposables would leak.
		const hoverDisposables = new DisposableStore();
		for (const item of items) {
			if (item.hover?.disposable) {
				hoverDisposables.add(item.hover.disposable);
			}
		}

		// Hide the filter in the unavailable states (Restricted Mode / setup
		// required): the only entries are the explanatory header and the Trust /
		// Sign In action, so a search field would just let users filter through
		// stale, unusable models. Shown otherwise (it also hosts the secondary
		// heading).
		const unavailable = this.isRestrictedMode() || this.isSetupRequired();
		const showCacheBreakHint = this.shouldShowCacheBreakHint(/* excludeAutoModel */ true);
		const listOptions = withChatInputPickerMotion({
			className: 'chat-model-picker-dropdown',
			headerText: showCacheBreakHint ? localize('chat.modelPicker.cacheBreakHint', "Switching models mid-session resets the prompt cache and may increase cost.") : undefined,
			headerIcon: showCacheBreakHint ? Codicon.info : undefined,
			headerLink: showCacheBreakHint ? this.getCacheBreakLearnMoreLink() : undefined,
			headerDismiss: showCacheBreakHint ? () => this.dismissCacheBreakHint() : undefined,
			showFilter: !unavailable,
			filterPlaceholder: localize('chat.modelPicker.search', "Search models"),
			focusFilterOnOpen: true,
			collapsedByDefault: new Set([ModelPickerSection.Other]),
			onDidToggleSection: (section: string, collapsed: boolean) => {
				if (section === ModelPickerSection.Other) {
					logModelPickerInteraction(collapsed ? 'otherModelsCollapsed' : 'otherModelsExpanded');
				}
			},
			linkHandler: (uri: URI) => {
				if (uri.scheme === 'command' && uri.path === 'workbench.action.chat.upgradePlan') {
					logModelPickerInteraction('premiumModelUpgradePlanClicked');
				} else if (manageSettingsUrl && this._uriIdentityService.extUri.isEqual(uri, URI.parse(manageSettingsUrl))) {
					logModelPickerInteraction('disabledModelContactAdminClicked');
				}
				void this._openerService.open(uri, { allowCommands: true });
			},
			minWidth: 200,
		});
		const previouslyFocusedElement = dom.getActiveElement();

		const delegate = {
			onSelect: (action: IActionWidgetDropdownAction) => {
				this._actionWidgetService.hide();
				action.run();
			},
			onHide: () => {
				hoverDisposables.dispose();
				this._nameButton?.setAttribute('aria-expanded', 'false');
				if (dom.isHTMLElement(previouslyFocusedElement)) {
					previouslyFocusedElement.focus();
				}
			}
		};

		this._nameButton?.setAttribute('aria-expanded', 'true');

		this._actionWidgetService.show(
			'ChatModelPicker',
			false,
			items,
			delegate,
			anchorElement,
			undefined,
			[],
			getModelPickerAccessibilityProvider(),
			listOptions
		);
	}

	private _updateBadge(): void {
		if (this._badgeIcon) {
			if (this._badge) {
				const icon = this._badge === 'info' ? Codicon.info : Codicon.warning;
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

		const { name } = this._selectedModel?.metadata || {};

		const { reason, activating, genericNoModels, noModels: noModelsAvailable } = this._availability();
		const restrictedMode = reason === ModelPickerUnavailableReason.Restricted;
		const setupRequired = reason === ModelPickerUnavailableReason.SetupRequired;
		const unavailable = reason !== undefined;

		// --- Name section ---
		const nameChildren: (HTMLElement | string)[] = [];
		const modelIcon = this._selectedModel ? getModelPickerIcon(this._selectedModel, this._delegate.getPresentationOptions().useGenericModelIcon) : undefined;
		const compact = this._compact?.get() ?? false;
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
		if (!compact || !modelIcon || noModelsAvailable) {
			nameChildren.push(dom.$('span.chat-input-picker-label', undefined, modelLabel));
		}
		if (this._badgeIcon) {
			nameChildren.push(this._badgeIcon);
		}
		dom.reset(this._nameButton, ...nameChildren);

		if (this._configButton) {
			this._configuration.renderButton(this._configButton, compact, noModelsAvailable);
		}

		// Aria — name the control "Models" to match the visible label; the comma
		// separates the control name from its current value / state.
		const ariaLabel = restrictedMode
			? localize('chat.modelPicker.ariaLabelRestricted', "Models, unavailable while in Restricted mode")
			: setupRequired
				? localize('chat.modelPicker.ariaLabelSetupRequired', "Models, sign in to use Copilot")
				: localize('chat.modelPicker.ariaLabel', "Models, {0}", modelLabel);
		this._domNode.ariaLabel = ariaLabel;
		this._nameButton.ariaLabel = ariaLabel;
	}

}
