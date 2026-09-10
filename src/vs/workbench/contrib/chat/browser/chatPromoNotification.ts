/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService, isConfigured } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { localChatSessionType } from '../common/chatSessionsService.js';
import { ChatClosedPromoNotification, ChatConfiguration } from '../common/constants.js';
import { COPILOT_VENDOR_ID, ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../common/languageModels.js';
import { getChatSessionType } from '../common/model/chatUri.js';
import { CHAT_OPEN_ACTION_ID } from './actions/chatActions.js';
import { ChatViewId, IChatWidgetService } from './chat.js';
import { ARM_CHAT_PROMO_COMMAND_ID, CHAT_PROMO_DISMISS_COMMAND_ID, CHAT_PROMO_TRY_MODEL_COMMAND_ID, DISARM_CHAT_PROMO_COMMAND_ID, findChatIconAnchor, IChatPromoCardInput } from './chatPromoWidget.js';
import { addDismissedNotificationId, ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationContext, IChatInputNotificationService, IChatInputNotificationSwitchToModelAction, matchesModelIdentifier, readDismissedNotificationIds } from './widget/input/chatInputNotificationService.js';

const PROMO_NOTIFICATION_ID = 'copilot.promoNotification';
const DISMISSED_PROMOS_STORAGE_KEY = 'chat.dismissedPromoIds';
const SEEN_PROMOS_STORAGE_KEY = 'chat.seenPromoIds';
export const CHAT_CLOSED_PROMO_TREATMENT = `config.${ChatConfiguration.ChatClosedPromoNotification}`;

export { CHAT_PROMO_DISMISS_COMMAND_ID, CHAT_PROMO_TRY_MODEL_COMMAND_ID };

function isPromoVisible(context: IChatInputNotificationContext): boolean {
	return context.deferredNotificationsEnabled && !context.isTransientChat && !context.sessionStarted;
}

/**
 * Surfaces a model's promo as a chat input notification, scoped to the harness
 * (chat session type) of the model that carries it. Promos only render where a
 * model switch is still plausible: persistent chat surfaces whose session has
 * not started yet, and only when the promo is banner-eligible (`showBanner` is
 * not `false`). Dismissals are persisted by promo id in application storage,
 * so they survive reloads and apply to every open window, as is the fact that a
 * promo has been seen: one sale is offered at most once, either in an open chat
 * or through the collapsed-chat pip, never both.
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
		@IViewsService private readonly _viewsService: IViewsService,
		@IWorkbenchAssignmentService private readonly _assignmentService: IWorkbenchAssignmentService,
		@ILogService private readonly _logService: ILogService,
		@ILayoutService private readonly _layoutService: ILayoutService,
	) {
		super();

		this._register(CommandsRegistry.registerCommand(CHAT_PROMO_DISMISS_COMMAND_ID, (_accessor, promoId?: string) => {
			this._promoPipPayload = undefined;
			if (typeof promoId === 'string') {
				addDismissedNotificationId(this._storageService, DISMISSED_PROMOS_STORAGE_KEY, promoId);
			}
		}));
		this._register(CommandsRegistry.registerCommand(CHAT_PROMO_TRY_MODEL_COMMAND_ID, async (_accessor, modelIdentifier?: string) => {
			await this._openChatAndSwitchModel(typeof modelIdentifier === 'string' ? modelIdentifier : undefined);
		}));

		this._register(this._languageModelsService.onDidChangeLanguageModels(() => this._update()));
		this._register(this._layoutService.onDidLayoutMainContainer(() => this._update()));
		this._register(this._assignmentService.onDidRefetchAssignments(() => {
			this._popupTreatmentGeneration++;
			this._popupTreatment = undefined;
			this._popupTreatmentPending = false;
			this._update();
		}));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.ChatClosedPromoNotification)) {
				this._update();
			}
		}));
		this._register(this._chatInputNotificationService.onDidDismiss(id => {
			const promoId = this._shownNotifications.get(id)?.promoId;
			if (promoId) {
				addDismissedNotificationId(this._storageService, DISMISSED_PROMOS_STORAGE_KEY, promoId);
				this._update();
			}
		}));

		// A dismissal in another window writes to the same application-scoped key,
		// which is broadcast to every window. Re-drive so the promo also disappears
		// here instead of lingering until this window reloads.
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, DISMISSED_PROMOS_STORAGE_KEY, this._store)(() => this._update()));
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, SEEN_PROMOS_STORAGE_KEY, this._store)(() => this._update()));
		this._register(this._viewsService.onDidChangeViewVisibility(e => {
			if (e.id === ChatViewId) {
				this._update();
			}
		}));

		this._update();
	}

	private readonly _shownNotifications = new Map<string, { promoId: string; modelIdentifier: string; kind: ChatClosedPromoNotification }>();
	private _promoPipPayload: IChatPromoCardInput | undefined;
	private _popupTreatment: boolean | undefined;
	private _popupTreatmentPending = false;
	private _popupTreatmentGeneration = 0;

	private _isPopupEnabled(): boolean {
		const config = this._configurationService.inspect<ChatClosedPromoNotification>(ChatConfiguration.ChatClosedPromoNotification);
		if (isConfigured(config) || config.policyValue !== undefined || config.memoryValue !== undefined) {
			return config.value === ChatClosedPromoNotification.CopilotIconPopup;
		}
		const anchor = findChatIconAnchor(this._layoutService.mainContainer);
		if (!anchor?.getClientRects().length) {
			return false;
		}
		if (this._popupTreatment === undefined && !this._popupTreatmentPending) {
			void this._resolvePopupTreatment();
		}
		return this._popupTreatment === true;
	}

	private async _resolvePopupTreatment(): Promise<void> {
		const generation = this._popupTreatmentGeneration;
		this._popupTreatmentPending = true;
		let enabled = false;
		try {
			enabled = await this._assignmentService.getTreatment<ChatClosedPromoNotification>(CHAT_CLOSED_PROMO_TREATMENT) === ChatClosedPromoNotification.CopilotIconPopup;
		} catch (error) {
			this._logService.warn('[ChatPromoNotification] Failed to resolve promo treatment', error);
		}
		if (this._store.isDisposed || generation !== this._popupTreatmentGeneration) {
			return;
		}
		this._popupTreatmentPending = false;
		this._popupTreatment = enabled;
		this._update();
	}

	/**
	 * GitHub Copilot chat (local harness). Codex and Claude CLI promos stay on the
	 * input banner for their own session type and never drive the status-bar pip.
	 */
	private _isGitHubCopilotPromo(model: ILanguageModelChatMetadataAndIdentifier): boolean {
		const harness = model.metadata.targetChatSessionType ?? localChatSessionType;
		if (harness !== localChatSessionType) {
			return false;
		}
		const vendor = model.metadata.vendor;
		return !vendor || vendor === COPILOT_VENDOR_ID;
	}

	private _update(): void {
		const dismissed = readDismissedNotificationIds(this._storageService, DISMISSED_PROMOS_STORAGE_KEY);
		const seen = readDismissedNotificationIds(this._storageService, SEEN_PROMOS_STORAGE_KEY);
		const modelIds = this._languageModelsService.getLanguageModelIds();

		// Bucket one non-dismissed promo per harness (a model's `targetChatSessionType`,
		// or the local pool when unset), preferring a discounted promo over a message-only one.
		const promoByHarness = new Map<string, ILanguageModelChatMetadataAndIdentifier>();
		for (const id of modelIds) {
			const meta = this._languageModelsService.lookupLanguageModel(id);
			if (!meta || !ILanguageModelChatMetadata.hasPromoBanner(meta) || dismissed.has(meta.promo.id)) {
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
		let pendingPopupPayload: IChatPromoCardInput | undefined;
		for (const [harness, model] of promoByHarness) {
			const promo = model.metadata.promo!;
			const notificationId = `${PROMO_NOTIFICATION_ID}.${harness}`;
			desired.add(notificationId);

			// The pip is a second exposure of a sale the user may already have met in
			// an open chat, so it stands down once this promo has been seen anywhere.
			// The experiment is read last, so an ineligible user is never assigned.
			const showPip = ILanguageModelChatMetadata.hasPromoDiscount(model.metadata)
				&& this._isGitHubCopilotPromo(model)
				&& !this._viewsService.isViewVisible(ChatViewId)
				&& !seen.has(promo.id)
				&& this._isPopupEnabled();
			const kind = showPip ? ChatClosedPromoNotification.CopilotIconPopup : ChatClosedPromoNotification.None;
			// Don't re-push an unchanged notification: re-setting it would clear a
			// pending user dismissal in the notification service.
			const shownNotification = this._shownNotifications.get(notificationId);
			if (shownNotification?.modelIdentifier === model.identifier && shownNotification.promoId === promo.id && shownNotification.kind === kind) {
				if (showPip) {
					pendingPopupPayload = this._promoCardPayload(model);
				}
				continue;
			}
			this._shownNotifications.set(notificationId, { promoId: promo.id, modelIdentifier: model.identifier, kind });

			if (showPip) {
				this._chatInputNotificationService.deleteNotification(notificationId);
				pendingPopupPayload = this._promoCardPayload(model);
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
				onDidShow: () => this._markPromoSeen(promo.id),
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

		if (pendingPopupPayload) {
			if (!equals(this._promoPipPayload, pendingPopupPayload)) {
				this._promoPipPayload = pendingPopupPayload;
				void this._commandService.executeCommand(ARM_CHAT_PROMO_COMMAND_ID, pendingPopupPayload);
			}
		} else if (this._promoPipPayload) {
			this._promoPipPayload = undefined;
			void this._commandService.executeCommand(DISARM_CHAT_PROMO_COMMAND_ID);
		}
	}

	/**
	 * Records that the user has met this sale, so the collapsed-chat pip does not
	 * offer the same promo a second time. Kept per promo id in application storage
	 * (through the shared notification id-set helpers) so it holds across windows
	 * and reloads, while a later sale still gets its own pip.
	 */
	private _markPromoSeen(promoId: string): void {
		if (readDismissedNotificationIds(this._storageService, SEEN_PROMOS_STORAGE_KEY).has(promoId)) {
			return;
		}
		addDismissedNotificationId(this._storageService, SEEN_PROMOS_STORAGE_KEY, promoId);
		this._update();
	}

	private _promoCardPayload(model: ILanguageModelChatMetadataAndIdentifier): IChatPromoCardInput | undefined {
		const promo = model.metadata.promo;
		if (!promo) {
			return undefined;
		}
		return {
			title: promo.message.replace(/\.+$/, ''),
			subtitle: ILanguageModelChatMetadata.getPromoEndsAtLabel(promo.endsAt)?.replace(/\.+$/, ''),
			promoId: promo.id,
			tryLabel: localize('chat.promo.tryModel', "Try {0}", model.metadata.name),
			modelIdentifier: model.identifier,
		};
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
}
