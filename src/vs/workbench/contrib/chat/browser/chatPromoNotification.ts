/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { localChatSessionType } from '../common/chatSessionsService.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../common/languageModels.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationService } from './widget/input/chatInputNotificationService.js';

const PROMO_NOTIFICATION_ID = 'copilot.promoNotification';
const DISMISSED_PROMOS_STORAGE_KEY = 'chat.dismissedPromoIds';

/**
 * Watches for models with active promotions and surfaces a chat input
 * notification per harness (chat session type) the first time each promo
 * appears. Each notification is scoped to the session type of the model that
 * carries the promo, so a chat input only advertises a model it can actually
 * switch to. Dismissals are persisted by promo id so the same promo is never
 * shown again.
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
				this._persistDismissedPromo(promoId);
				this._update();
			}
		}));
		this._update();
	}

	private readonly _shownNotifications = new Map<string, { promoId: string; modelIdentifier: string }>();

	private _update(): void {
		const dismissed = this._getDismissedPromoIds();
		const modelIds = this._languageModelsService.getLanguageModelIds();

		// A promo can appear in several harnesses at once (e.g. the same model
		// offered in the Local, Copilot, and Codex sessions). Bucket the first
		// non-dismissed promo per harness (a model's `targetChatSessionType`,
		// or the local pool when unset).
		const promoByHarness = new Map<string, ILanguageModelChatMetadataAndIdentifier>();
		for (const id of modelIds) {
			const meta = this._languageModelsService.lookupLanguageModel(id);
			if (!meta || !ILanguageModelChatMetadata.hasPromoDiscount(meta) || dismissed.has(meta.promo.id)) {
				continue;
			}
			const harness = meta.targetChatSessionType ?? localChatSessionType;
			if (!promoByHarness.has(harness)) {
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

			const endsAtDate = new Date(promo.endsAt);
			const formattedDate = endsAtDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

			this._chatInputNotificationService.setNotification({
				id: notificationId,
				telemetryId: promo.id,
				severity: ChatInputNotificationSeverity.Info,
				message: promo.message,
				description: localize('chat.promo.endsAt', "Ends {0}.", formattedDate),
				actions: [{
					label: localize('chat.promo.tryModel', "Try {0}", model.metadata.name),
					kind: ChatInputNotificationActionKind.SwitchToModel,
					modelIdentifier: model.identifier,
				}],
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

	private _persistDismissedPromo(promoId: string): void {
		const dismissed = this._getDismissedPromoIds();
		if (dismissed.has(promoId)) {
			return;
		}
		dismissed.add(promoId);
		this._storageService.store(
			DISMISSED_PROMOS_STORAGE_KEY,
			JSON.stringify([...dismissed]),
			StorageScope.APPLICATION,
			StorageTarget.USER,
		);
	}

	private _getDismissedPromoIds(): Set<string> {
		const raw = this._storageService.get(DISMISSED_PROMOS_STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return new Set();
		}
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				return new Set(parsed.filter((v): v is string => typeof v === 'string'));
			}
		} catch {
			// ignore malformed data
		}
		return new Set();
	}
}
