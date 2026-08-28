/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { localChatSessionType } from '../common/chatSessionsService.js';
import { ChatClosedSaleNotification, ChatConfiguration } from '../common/constants.js';
import { COPILOT_VENDOR_ID, ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../common/languageModels.js';
import { getChatSessionType } from '../common/model/chatUri.js';
import { CHAT_OPEN_ACTION_ID } from './actions/chatActions.js';
import { ChatViewId, IChatWidgetService } from './chat.js';
import { ARM_SALE_PROMO_COMMAND_ID, DISARM_SALE_PROMO_COMMAND_ID, SHOW_SALE_PROMO_COMMAND_ID } from './salePromoWidget.js';
import { getModelProviderIcon } from './widget/input/modelPicker/modelProviderIcons.js';
import { addDismissedNotificationId, ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationContext, IChatInputNotificationService, IChatInputNotificationSwitchToModelAction, matchesModelIdentifier, readDismissedNotificationIds } from './widget/input/chatInputNotificationService.js';

const PROMO_NOTIFICATION_ID = 'copilot.promoNotification';
const DISMISSED_PROMOS_STORAGE_KEY = 'chat.dismissedPromoIds';

export const CHAT_PROMO_TRY_MODEL_COMMAND_ID = '_chat.tryPromoModel';
export const CHAT_PROMO_DISMISS_COMMAND_ID = '_chat.dismissPromo';
export const SHOW_LIVE_SALE_PROMO_COMMAND_ID = '_chat.showLiveSalePromo';

function isPromoVisible(context: IChatInputNotificationContext): boolean {
	return context.deferredNotificationsEnabled && !context.isTransientChat && !context.sessionStarted;
}

/**
 * Surfaces a model's promo as a chat input notification, scoped to the harness
 * (chat session type) of the model that carries it. Promos only render where a
 * model switch is still plausible: persistent chat surfaces whose session has
 * not started yet, and only when the promo is banner-eligible (`showBanner` is
 * not `false`). Dismissals are persisted by promo id in application storage,
 * so they survive reloads and apply to every open window.
 */
export class ChatPromoNotificationContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatPromoNotification';

	constructor(
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IChatInputNotificationService private readonly _chatInputNotificationService: IChatInputNotificationService,
		@IStorageService private readonly _storageService: IStorageService,
		@ICommandService private readonly _commandService: ICommandService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatEntitlementService private readonly _entitlementService: IChatEntitlementService,
		@IViewsService private readonly _viewsService: IViewsService,
	) {
		super();

		this._register(CommandsRegistry.registerCommand(CHAT_PROMO_DISMISS_COMMAND_ID, (_accessor, promoId?: string) => {
			this._salePipForced = false;
			this._salePipActive = false;
			this._saleBannerForced = false;
			if (typeof promoId === 'string') {
				this._persistDismissedPromo(promoId);
			}
		}));
		this._register(CommandsRegistry.registerCommand(CHAT_PROMO_TRY_MODEL_COMMAND_ID, async (_accessor, _promoId?: string, modelIdentifier?: string) => {
			await this._openChatAndSwitchModel(typeof modelIdentifier === 'string' ? modelIdentifier : undefined);
		}));
		this._register(CommandsRegistry.registerCommand(SHOW_LIVE_SALE_PROMO_COMMAND_ID, () => this._showLiveSaleCard()));

		this._register(this._languageModelsService.onDidChangeLanguageModels(() => this._update()));
		this._register(this._entitlementService.onDidChangeEntitlement(() => {
			const signedIn = this._isSignedIn();
			if (signedIn && !this._wasSignedIn) {
				this._salePopupArmed = true;
				this._shownSaleCards.clear();
			}
			this._wasSignedIn = signedIn;
			this._update();
		}));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.ChatClosedSaleNotification)) {
				this._update();
			}
		}));
		this._register(this._chatInputNotificationService.onDidDismiss(id => {
			const promoId = this._shownNotifications.get(id)?.promoId;
			if (promoId) {
				this._persistDismissedPromo(promoId);
				this._update();
			}
		}));

		// A dismissal in another window writes to the same application-scoped key,
		// which is broadcast to every window. Re-drive so the promo also disappears
		// here instead of lingering until this window reloads.
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, DISMISSED_PROMOS_STORAGE_KEY, this._store)(() => this._update()));
		this._register(this._viewsService.onDidChangeViewVisibility(e => {
			if (e.id === ChatViewId) {
				this._update();
			}
		}));

		this._update();
	}

	private readonly _shownNotifications = new Map<string, { promoId: string; modelIdentifier: string; kind: ChatClosedSaleNotification }>();
	private readonly _shownSaleCards = new Set<string>();
	private _salePopupArmed = true;
	private _salePipActive = false;
	private _salePipForced = false;
	private _saleBannerForced = false;
	private _wasSignedIn = this._isSignedIn();

	private _isSignedIn(): boolean {
		return this._entitlementService.entitlement !== ChatEntitlement.Unknown;
	}

	private _isChatBarExpanded(): boolean {
		return this._viewsService.isViewVisible(ChatViewId);
	}

	private _shouldArmSalePip(): boolean {
		return this._salePipForced || !this._isChatBarExpanded();
	}

	/**
	 * GitHub Copilot chat (local harness). Codex and Claude CLI sales stay on the
	 * input banner for their own session type and never drive the status-bar pip.
	 */
	private _isGitHubCopilotSale(model: ILanguageModelChatMetadataAndIdentifier): boolean {
		const harness = model.metadata.targetChatSessionType ?? localChatSessionType;
		if (harness !== localChatSessionType) {
			return false;
		}
		const vendor = model.metadata.vendor;
		return !vendor || vendor === COPILOT_VENDOR_ID;
	}

	private _isBlockedSaleSku(): boolean {
		if (this._entitlementService.entitlement === ChatEntitlement.Free) {
			return true;
		}
		const sku = this._entitlementService.sku;
		if (!sku) {
			return false;
		}
		const normalized = sku.toUpperCase().replace(/-/g, '_');
		return normalized === 'FREE'
			|| normalized === 'COMPLIMENTARY_EDU'
			|| normalized === 'FREE_LIMITED_COPILOT'
			|| normalized === 'FREE_EDUCATIONAL_QUOTA';
	}

	private _hideAllPromos(): void {
		for (const notificationId of [...this._shownNotifications.keys()]) {
			this._chatInputNotificationService.deleteNotification(notificationId);
			this._shownNotifications.delete(notificationId);
		}
		if (this._salePipActive && !this._salePipForced) {
			this._salePipActive = false;
			void this._commandService.executeCommand(DISARM_SALE_PROMO_COMMAND_ID);
		}
	}

	private _update(): void {
		const dismissed = this._getDismissedPromoIds();
		const modelIds = this._languageModelsService.getLanguageModelIds();

		if (!this._salePipForced && !this._saleBannerForced && this._isBlockedSaleSku()) {
			this._hideAllPromos();
			if (this._salePopupArmed && modelIds.length > 0) {
				this._salePopupArmed = false;
			}
			return;
		}

		// Bucket one non-dismissed promo per harness (a model's `targetChatSessionType`,
		// or the local pool when unset), preferring a discounted promo over a message-only one.
		const promoByHarness = new Map<string, ILanguageModelChatMetadataAndIdentifier>();
		for (const id of modelIds) {
			const meta = this._languageModelsService.lookupLanguageModel(id);
			if (!meta || meta.isUserSelectable === false || !ILanguageModelChatMetadata.hasPromoBanner(meta) || dismissed.has(meta.promo.id)) {
				continue;
			}
			const harness = meta.targetChatSessionType ?? localChatSessionType;
			const current = promoByHarness.get(harness);
			if (!current || (!ILanguageModelChatMetadata.hasPromoDiscount(current.metadata) && ILanguageModelChatMetadata.hasPromoDiscount(meta))) {
				promoByHarness.set(harness, { identifier: id, metadata: meta });
			}
		}

		// Refresh the notification for every harness that has an eligible promo,
		// scoping each one to its harness so it only renders in matching sessions.
		const desired = new Set<string>();
		let pendingPopupPayload: string | undefined;
		const popupSetting = !this._saleBannerForced
			&& this._configurationService.getValue(ChatConfiguration.ChatClosedSaleNotification) === ChatClosedSaleNotification.CopilotIconPopup;
		for (const [harness, model] of promoByHarness) {
			if (popupSetting && ILanguageModelChatMetadata.hasPromoDiscount(model.metadata) && !this._isGitHubCopilotSale(model)) {
				continue;
			}

			const promo = model.metadata.promo!;
			const notificationId = `${PROMO_NOTIFICATION_ID}.${harness}`;
			desired.add(notificationId);

			// Don't re-push an unchanged notification: re-setting it would clear a
			// pending user dismissal in the notification service.
			const usePopup = popupSetting
				&& ILanguageModelChatMetadata.hasPromoDiscount(model.metadata)
				&& this._isGitHubCopilotSale(model);
			const kind = usePopup ? ChatClosedSaleNotification.CopilotIconPopup : ChatClosedSaleNotification.None;
			const shownNotification = this._shownNotifications.get(notificationId);
			if (shownNotification?.modelIdentifier === model.identifier && shownNotification.promoId === promo.id && shownNotification.kind === kind) {
				if (usePopup && this._shouldArmSalePip()) {
					pendingPopupPayload = this._saleCardPayload(model);
				}
				continue;
			}
			this._shownNotifications.set(notificationId, { promoId: promo.id, modelIdentifier: model.identifier, kind });

			if (usePopup) {
				this._chatInputNotificationService.deleteNotification(notificationId);
				if (this._shouldArmSalePip()) {
					pendingPopupPayload = this._saleCardPayload(model);
				}
				continue;
			}

			const description = ILanguageModelChatMetadata.getPromoEndsAtLabel(promo.endsAt);
			const action: IChatInputNotificationSwitchToModelAction = {
				label: localize('chat.promo.tryModel', "Try {0}", model.metadata.name),
				kind: ChatInputNotificationActionKind.SwitchToModel,
				matchesModel: matchesModelIdentifier(model.identifier),
			};

			this._chatInputNotificationService.setNotification({
				id: notificationId,
				telemetryId: promo.id,
				severity: ChatInputNotificationSeverity.Info,
				message: promo.message,
				description,
				actions: [action],
				when: isPromoVisible,
				dismissible: true,
				autoDismissOnMessage: false,
				sessionTypes: [harness],
			});
		}

		// Remove notifications whose promo has been dismissed or is no longer offered.
		for (const notificationId of [...this._shownNotifications.keys()]) {
			if (!desired.has(notificationId)) {
				this._chatInputNotificationService.deleteNotification(notificationId);
				this._shownNotifications.delete(notificationId);
			}
		}

		// Background model refreshes (the 10-minute catalog poll) must not
		// open the sale card mid-session. After the first catalog that actually
		// contains models, wait for the next app start or sign-in.
		if (pendingPopupPayload) {
			this._salePipActive = true;
			void this._commandService.executeCommand(ARM_SALE_PROMO_COMMAND_ID, pendingPopupPayload);
		} else if (this._salePipActive && !this._salePipForced) {
			this._salePipActive = false;
			void this._commandService.executeCommand(DISARM_SALE_PROMO_COMMAND_ID);
		}

		if (this._salePopupArmed && modelIds.length > 0) {
			this._salePopupArmed = false;
		}
	}

	private _showLiveSaleCard(): void {
		const model = this._pickLiveSaleModel();
		const payload = model ? this._saleCardPayload(model) : this._previewSalePayload();
		if (!payload) {
			return;
		}
		if (model?.metadata.promo) {
			this._unpersistDismissedPromo(model.metadata.promo.id);
		}
		this._saleBannerForced = false;
		this._salePipForced = true;
		this._salePipActive = true;
		this._shownNotifications.clear();
		void this._commandService.executeCommand(ARM_SALE_PROMO_COMMAND_ID, payload);
	}

	private _previewSalePayload(): string {
		return JSON.stringify({
			title: localize('chat.promo.previewTitle', "Enjoy 50% off GPT-5.6 Sol"),
			subtitle: localize('chat.promo.previewSubtitle', "Ends September 30, 2026"),
			providerIcon: '$(openai)',
			dismissCommandId: CHAT_PROMO_DISMISS_COMMAND_ID,
			dismissArgs: ['dev-preview'],
			buttons: [{
				label: localize('chat.promo.tryModel', "Try {0}", 'GPT-5.6 Sol'),
				commandId: CHAT_PROMO_TRY_MODEL_COMMAND_ID,
				args: ['dev-preview'],
				style: 'primary',
			}],
		});
	}

	private _pickLiveSaleModel(): ILanguageModelChatMetadataAndIdentifier | undefined {
		let fallback: ILanguageModelChatMetadataAndIdentifier | undefined;
		for (const id of this._languageModelsService.getLanguageModelIds()) {
			const meta = this._languageModelsService.lookupLanguageModel(id);
			if (!meta || !ILanguageModelChatMetadata.hasPromoBanner(meta)) {
				continue;
			}
			const model = { identifier: id, metadata: meta };
			if (ILanguageModelChatMetadata.hasPromoDiscount(meta)) {
				return model;
			}
			fallback ??= model;
		}
		return fallback;
	}

	private _saleCardPayload(model: ILanguageModelChatMetadataAndIdentifier): string | undefined {
		const promo = model.metadata.promo;
		if (!promo) {
			return undefined;
		}
		return JSON.stringify({
			title: stripTrailingPeriod(promo.message),
			subtitle: stripTrailingPeriod(ILanguageModelChatMetadata.getPromoEndsAtLabel(promo.endsAt)),
			providerIcon: getSaleProviderCodicon(model),
			dismissCommandId: CHAT_PROMO_DISMISS_COMMAND_ID,
			dismissArgs: [promo.id],
			buttons: [
				{
					label: localize('chat.promo.tryModel', "Try {0}", model.metadata.name),
					commandId: CHAT_PROMO_TRY_MODEL_COMMAND_ID,
					args: [promo.id, model.identifier],
					style: 'primary',
				},
			],
		});
	}

	private _showSaleCard(model: ILanguageModelChatMetadataAndIdentifier): void {
		const promo = model.metadata.promo;
		if (!promo || this._shownSaleCards.has(promo.id)) {
			return;
		}
		this._shownSaleCards.add(promo.id);
		const payload = this._saleCardPayload(model);
		if (payload) {
			void this._commandService.executeCommand(SHOW_SALE_PROMO_COMMAND_ID, payload);
		}
	}

	private async _openChatAndSwitchModel(modelIdentifier: string | undefined): Promise<void> {
		const targetHarness = this._targetHarnessForModel(modelIdentifier);
		await this._commandService.executeCommand(CHAT_OPEN_ACTION_ID);
		let widget = await this._chatWidgetService.revealWidget();
		widget?.focusInput();

		const sessionResource = widget?.viewModel?.sessionResource;
		const currentHarness = sessionResource ? getChatSessionType(sessionResource) : localChatSessionType;
		if (currentHarness !== targetHarness) {
			await this._commandService.executeCommand(`workbench.action.chat.openNewChatSessionInPlace.${targetHarness}`, 'sidebar');
			widget = await this._chatWidgetService.revealWidget() ?? widget;
			widget?.focusInput();
		}

		if (!modelIdentifier || !widget) {
			return;
		}
		if (!widget.input.switchModelByIdentifier(modelIdentifier, true, true)) {
			await widget.input.requestModelByIdentifier(modelIdentifier);
		}
	}

	private _targetHarnessForModel(modelIdentifier: string | undefined): string {
		if (!modelIdentifier) {
			return localChatSessionType;
		}
		const meta = this._languageModelsService.lookupLanguageModel(modelIdentifier);
		return meta?.targetChatSessionType ?? localChatSessionType;
	}

	private _unpersistDismissedPromo(promoId: string): void {
		const dismissed = this._getDismissedPromoIds();
		if (!dismissed.delete(promoId)) {
			return;
		}
		this._storageService.store(
			DISMISSED_PROMOS_STORAGE_KEY,
			JSON.stringify([...dismissed]),
			StorageScope.APPLICATION,
			StorageTarget.USER,
		);
	}

	private _persistDismissedPromo(promoId: string): void {
		addDismissedNotificationId(this._storageService, DISMISSED_PROMOS_STORAGE_KEY, promoId);
	}

	private _getDismissedPromoIds(): Set<string> {
		return readDismissedNotificationIds(this._storageService, DISMISSED_PROMOS_STORAGE_KEY);
	}
}

function stripTrailingPeriod(value: string | undefined): string | undefined {
	return value?.replace(/\.+$/, '');
}

const PROVIDER_ICON_TO_CODICON: Record<string, string> = {
	'chat-model-provider-microsoft': 'microsoft',
	'chat-model-provider-openai': 'openai',
	'chat-model-provider-claude': 'claude',
	'chat-model-provider-gemini': 'google-gemini',
	'chat-model-provider-kimi': 'kimi',
	'chat-model-provider-xai': 'xai',
	'chat-model-provider-copilot': 'copilot-compact',
	'chat-model-provider-generic': 'sparkle',
};

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'chat.armSalePromoPreview',
			title: localize('chat.armSalePromoPreview', "Arm Sale Promo"),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 100,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyS,
			},
		});
	}

	run(accessor: ServicesAccessor): void {
		void accessor.get(ICommandService).executeCommand(SHOW_LIVE_SALE_PROMO_COMMAND_ID);
	}
});

function getSaleProviderCodicon(model: ILanguageModelChatMetadataAndIdentifier): string {
	const identity = `${model.identifier} ${model.metadata.vendor} ${model.metadata.family} ${model.metadata.id} ${model.metadata.name}`.toLowerCase();
	if (identity.includes('mai') || identity.includes('microsoft')) {
		return '$(microsoft)';
	}
	const mapped = PROVIDER_ICON_TO_CODICON[getModelProviderIcon(model).id];
	return `$(${mapped ?? 'sparkle'})`;
}
