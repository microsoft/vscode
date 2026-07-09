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
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../common/languageModels.js';
import { IChatWidgetService } from './chat.js';
import { ChatInputNotificationSeverity, IChatInputNotificationService } from './widget/input/chatInputNotificationService.js';

const PROMO_NOTIFICATION_ID = 'copilot.promoNotification';
const DISMISSED_PROMOS_STORAGE_KEY = 'chat.dismissedPromoIds';
const USE_PROMO_MODEL_COMMAND_ID = 'workbench.action.chat.usePromoModel';

/**
 * Watches for models with active promotions and shows a one-time
 * chat input notification the first time a promo appears. Dismissals
 * are persisted by promo id so the same promo is never shown again.
 */
export class ChatPromoNotificationContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatPromoNotification';

	constructor(
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IChatInputNotificationService private readonly _chatInputNotificationService: IChatInputNotificationService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		this._register(CommandsRegistry.registerCommand(USE_PROMO_MODEL_COMMAND_ID, (accessor: ServicesAccessor, modelId: string) => {
			const chatWidgetService = accessor.get(IChatWidgetService);
			const widget = chatWidgetService.lastFocusedWidget;
			if (widget) {
				widget.input.switchModelByIdentifier(modelId);
			}
			this._chatInputNotificationService.dismissNotification(PROMO_NOTIFICATION_ID);
			this._persistDismissedPromo();
		}));

		this._register(this._languageModelsService.onDidChangeLanguageModels(() => this._update()));
		this._register(this._chatInputNotificationService.onDidDismiss(id => {
			if (id === PROMO_NOTIFICATION_ID) {
				this._persistDismissedPromo();
			}
		}));
		this._update();
	}

	private _currentPromoId: string | undefined;

	private _update(): void {
		const dismissed = this._getDismissedPromoIds();
		const modelIds = this._languageModelsService.getLanguageModelIds();

		// Find the first model with a promo that hasn't been dismissed
		let promoMetadata: ILanguageModelChatMetadata | undefined;
		let promoIdentifier: string | undefined;
		for (const id of modelIds) {
			const meta = this._languageModelsService.lookupLanguageModel(id);
			if (meta?.promo && !dismissed.has(meta.promo.id)) {
				promoMetadata = meta;
				promoIdentifier = id;
				break;
			}
		}

		if (!promoMetadata?.promo || !promoIdentifier) {
			if (this._currentPromoId) {
				this._chatInputNotificationService.deleteNotification(PROMO_NOTIFICATION_ID);
				this._currentPromoId = undefined;
			}
			return;
		}

		// Don't re-show the same promo notification
		if (this._currentPromoId === promoMetadata.promo.id) {
			return;
		}

		this._currentPromoId = promoMetadata.promo.id;
		const endsAtDate = new Date(promoMetadata.promo.endsAt);
		const formattedDate = endsAtDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

		this._chatInputNotificationService.setNotification({
			id: PROMO_NOTIFICATION_ID,
			severity: ChatInputNotificationSeverity.Info,
			message: promoMetadata.promo.message,
			description: localize('chat.promo.endsAt', "Ends {0}.", formattedDate),
			actions: [{
				label: localize('chat.promo.useModel', "Use {0}", promoMetadata.name),
				commandId: USE_PROMO_MODEL_COMMAND_ID,
				commandArgs: [promoIdentifier],
			}],
			dismissible: true,
			autoDismissOnMessage: false,
		});
	}

	private _persistDismissedPromo(): void {
		if (!this._currentPromoId) {
			return;
		}
		const dismissed = this._getDismissedPromoIds();
		dismissed.add(this._currentPromoId);
		this._storageService.store(
			DISMISSED_PROMOS_STORAGE_KEY,
			JSON.stringify([...dismissed]),
			StorageScope.APPLICATION,
			StorageTarget.USER,
		);
		this._currentPromoId = undefined;
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
