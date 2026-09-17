/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { localChatSessionType } from '../common/chatSessionsService.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../common/languageModels.js';
import { addDismissedNotificationId, ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationContext, IChatInputNotificationService, IChatInputNotificationSwitchToModelAction, matchesModelIdentifier, readDismissedNotificationIds } from './widget/input/chatInputNotificationService.js';

const PROMO_NOTIFICATION_ID = 'copilot.promoNotification';
const DISMISSED_PROMOS_STORAGE_KEY = 'chat.dismissedPromoIds';

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
	) {
		super();

		this._register(this._languageModelsService.onDidChangeLanguageModels(() => this._update()));
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

		this._update();
	}

	private readonly _shownNotifications = new Map<string, { promoId: string; modelIdentifier: string }>();

	private _update(): void {
		const dismissed = readDismissedNotificationIds(this._storageService, DISMISSED_PROMOS_STORAGE_KEY);
		const modelIds = this._languageModelsService.getLanguageModelIds();

		// Bucket one non-dismissed promo per harness (a model's `targetChatSessionType`,
		// or the local pool when unset), preferring a discounted promo over a message-only one.
		// Promos that opt out of the banner (`showBanner: false`) stay in the model picker only.
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
		for (const [harness, model] of promoByHarness) {
			const promo = model.metadata.promo!;
			const notificationId = `${PROMO_NOTIFICATION_ID}.${harness}`;
			desired.add(notificationId);

			// Don't re-push an unchanged notification: re-setting it would clear a
			// pending user dismissal in the notification service.
			const shownNotification = this._shownNotifications.get(notificationId);
			if (shownNotification?.modelIdentifier === model.identifier && shownNotification.promoId === promo.id) {
				continue;
			}
			this._shownNotifications.set(notificationId, { promoId: promo.id, modelIdentifier: model.identifier });
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
	}


}
