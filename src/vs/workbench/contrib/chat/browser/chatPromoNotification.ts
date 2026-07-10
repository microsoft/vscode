/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { localChatSessionType } from '../common/chatSessionsService.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../common/languageModels.js';
import { IChatWidgetService } from './chat.js';
import { ChatInputNotificationSeverity, IChatInputNotificationService } from './widget/input/chatInputNotificationService.js';

const PROMO_NOTIFICATION_ID = 'copilot.promoNotification';
const DISMISSED_PROMOS_STORAGE_KEY = 'chat.dismissedPromoIds';
const USE_PROMO_MODEL_COMMAND_ID = 'workbench.action.chat.usePromoModel';

interface IUsePromoModelArgs {
	/** Identifier of the model to switch to. */
	readonly modelIdentifier: string;
	/** Notification to dismiss once the model has been selected. */
	readonly notificationId: string;
}

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

		this._register(CommandsRegistry.registerCommand(USE_PROMO_MODEL_COMMAND_ID, (accessor: ServicesAccessor, args: IUsePromoModelArgs) => {
			const chatWidgetService = accessor.get(IChatWidgetService);
			const widget = chatWidgetService.lastFocusedWidget;
			widget?.input.switchModelByIdentifier(args.modelIdentifier);
			// Dismissing fires `onDidDismiss`, which persists this promo so it isn't shown again.
			this._chatInputNotificationService.dismissNotification(args.notificationId);
		}));

		this._register(this._languageModelsService.onDidChangeLanguageModels(() => this._update()));
		this._register(this._chatInputNotificationService.onDidDismiss(id => {
			const promoId = this._shownNotifications.get(id);
			if (promoId) {
				this._persistDismissedPromo(promoId);
				this._update();
			}
		}));
		this._update();
	}

	/** Maps each currently shown notification id to the promo id it represents. */
	private readonly _shownNotifications = new Map<string, string>();

	private _update(): void {
		const dismissed = this._getDismissedPromoIds();
		const modelIds = this._languageModelsService.getLanguageModelIds();

		// A promo can appear in several harnesses at once (e.g. the same model
		// offered in the Local, Copilot, and Codex sessions). Each harness has its
		// own model copy, so the notification must advertise the model that belongs
		// to the harness the chat input is actually in — otherwise the "Use <model>"
		// action would switch to a model that isn't valid for that session. Bucket
		// the first non-dismissed promo per harness (a model's `targetChatSessionType`,
		// or the local pool when unset).
		const promoByHarness = new Map<string, { readonly promo: NonNullable<ILanguageModelChatMetadata['promo']>; readonly name: string; readonly identifier: string }>();
		for (const id of modelIds) {
			const meta = this._languageModelsService.lookupLanguageModel(id);
			if (!meta?.promo || dismissed.has(meta.promo.id)) {
				continue;
			}
			const harness = meta.targetChatSessionType ?? localChatSessionType;
			if (!promoByHarness.has(harness)) {
				promoByHarness.set(harness, { promo: meta.promo, name: meta.name, identifier: id });
			}
		}

		// Refresh the notification for every harness that has an eligible promo,
		// scoping each one to its harness so it only renders in matching sessions.
		const desired = new Set<string>();
		for (const [harness, { promo, name, identifier }] of promoByHarness) {
			const notificationId = `${PROMO_NOTIFICATION_ID}.${harness}`;
			desired.add(notificationId);

			// Don't re-push an unchanged notification: re-setting it would clear a
			// pending user dismissal in the notification service.
			if (this._shownNotifications.get(notificationId) === promo.id) {
				continue;
			}
			this._shownNotifications.set(notificationId, promo.id);

			const endsAtDate = new Date(promo.endsAt);
			const formattedDate = endsAtDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

			this._chatInputNotificationService.setNotification({
				id: notificationId,
				severity: ChatInputNotificationSeverity.Info,
				message: promo.message,
				description: localize('chat.promo.endsAt', "Ends {0}.", formattedDate),
				actions: [{
					label: localize('chat.promo.useModel', "Use {0}", name),
					commandId: USE_PROMO_MODEL_COMMAND_ID,
					commandArgs: [{ modelIdentifier: identifier, notificationId } satisfies IUsePromoModelArgs],
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
