/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { modelSelectorAliases } from '../../common/expPayload.js';
import { addDismissedNotificationId, IChatInputNotificationContext, IChatInputNotificationService, readDismissedNotificationIds } from '../widget/input/chatInputNotificationService.js';
import { ChatExpNotification, IChatExpNotificationMatch, matchesChatExpNotification, parseChatExpNotifications } from './chatExpNotificationConfig.js';

export const CHAT_EXP_NOTIFICATION_TREATMENT = 'chatNotifications';

const DISMISSED_STORAGE_KEY = 'chat.dismissedExpNotificationIds';

/** Payload ids share a global map with built-in notifications, so they are namespaced. */
const ID_PREFIX = 'chat.expNotification.';

/**
 * Renders chat input notifications described by an experiment treatment.
 *
 * The treatment carries the words, the targeting and the buttons, so a notification can be
 * authored or retired without shipping code. Removing the assignment is the kill switch.
 */
export class ChatExpNotificationContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatExpNotification';

	/** Registered payload ids, each mapped to the entry text that produced it. */
	private readonly _registered = new Map<string, string>();
	private _notifications: readonly ChatExpNotification[] = [];
	/** Increments on every refresh so a slow in-flight resolution cannot overwrite a newer one. */
	private _generation = 0;

	constructor(
		@IWorkbenchAssignmentService private readonly _assignmentService: IWorkbenchAssignmentService,
		@IChatInputNotificationService private readonly _notificationService: IChatInputNotificationService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatEntitlementService private readonly _entitlementService: IChatEntitlementService,
		@IStorageService private readonly _storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		void this._resolve();
		this._register(this._assignmentService.onDidRefetchAssignments(() => void this._resolve()));
		this._register(this._notificationService.onDidDismiss(id => this._handleDismissed(id)));
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, DISMISSED_STORAGE_KEY, this._store)(() => this._update()));
		// `when` reads both gates, so mounted widgets must be told to re-evaluate when either flips.
		this._register(this._entitlementService.onDidChangeSentiment(() => this._notificationService.refresh()));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatAIDisabledSettingId)) {
				this._notificationService.refresh();
			}
		}));
	}

	private async _resolve(): Promise<void> {
		const generation = ++this._generation;
		let payload: string | undefined;
		try {
			payload = await this._assignmentService.getTreatment<string>(CHAT_EXP_NOTIFICATION_TREATMENT);
		} catch (err) {
			// A failed lookup is not a retired assignment, so leave what is showing in place.
			this._logService.trace(`[chatExpNotification] failed to resolve treatment: ${err}`);
			return;
		}

		if (generation !== this._generation) {
			return;
		}

		// An absent treatment is how an assignment is removed, so it clears what is showing.
		// Only a thrown lookup is treated as transient.
		const result = payload === undefined ? undefined : parseChatExpNotifications(payload);
		if (result?.error) {
			this._logService.warn(`[chatExpNotification] ignoring invalid payload: ${result.error}`);
		}
		this._notifications = result?.notifications ?? [];

		this._update();
	}

	private _update(): void {
		const dismissed = readDismissedNotificationIds(this._storageService, DISMISSED_STORAGE_KEY);
		const active = this._notifications.filter(notification => !dismissed.has(notification.id));

		for (const id of [...this._registered.keys()]) {
			if (!active.some(notification => notification.id === id)) {
				this._notificationService.deleteNotification(ID_PREFIX + id);
				this._registered.delete(id);
			}
		}

		for (const { match, signature, ...notification } of active) {
			// Persisted dismissals are already filtered out above, so what this protects is the
			// in-memory `autoDismissOnMessage` state that setting a notification would clear.
			if (this._registered.get(notification.id) === signature) {
				continue;
			}
			this._registered.set(notification.id, signature);
			this._notificationService.setNotification({
				...notification,
				id: ID_PREFIX + notification.id,
				when: context => this._matches(match, context),
			});
		}
	}

	private _matches(match: IChatExpNotificationMatch, context: IChatInputNotificationContext): boolean {
		// Checked here rather than by unregistering, so turning AI features off and on again
		// does not discard a dismissal the service only holds in memory.
		if (this._configurationService.getValue<boolean>(ChatAIDisabledSettingId) === true
			|| this._entitlementService.sentiment.hidden) {
			return false;
		}
		const model = context.modelState.currentModel;
		return matchesChatExpNotification(match, {
			sessionType: context.sessionType,
			harness: context.sessionType ? this._chatSessionsService.getChatSessionContribution(context.sessionType)?.agentHostProviderId : undefined,
			selectedModelId: model?.identifier,
			selectedModelAliases: model && modelSelectorAliases(model.metadata),
		});
	}

	private _handleDismissed(id: string): void {
		if (!id.startsWith(ID_PREFIX)) {
			return;
		}
		addDismissedNotificationId(this._storageService, DISMISSED_STORAGE_KEY, id.slice(ID_PREFIX.length));
		this._update();
	}

}
