/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, IReader, ISettableObservable, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { localize } from '../../../../nls.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { SessionStatus, type ISession } from '../../../services/sessions/common/session.js';
import {
	compareInboxNotifications,
	IExternalInboxNotification,
	IInboxNotificationAction,
	IInboxNotificationItem,
	IInboxNotificationsService,
	InboxNotificationActionKind,
	InboxNotificationKind,
	InboxNotificationPriority,
} from '../common/inboxNotificationsService.js';

const DISMISSED_NOTIFICATION_IDS_STORAGE_KEY = 'sessions.inboxNotifications.dismissedIds';

export class InboxNotificationsService extends Disposable implements IInboxNotificationsService {

	declare readonly _serviceBrand: undefined;

	private readonly _dismissedIds: ISettableObservable<ReadonlySet<string>>;
	private readonly _externalItems: ISettableObservable<readonly IInboxNotificationItem[]>;

	readonly notifications: IObservable<readonly IInboxNotificationItem[]>;

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this._dismissedIds = observableValue('sessionsInboxNotificationsDismissed', this.loadDismissedIds());
		this._externalItems = observableValue('sessionsInboxNotificationsExternal', []);

		const sessionsChanged = observableSignalFromEvent(this, this.sessionsManagementService.onDidChangeSessions);

		this.notifications = derived(this, reader => {
			sessionsChanged.read(reader);

			const dismissed = this._dismissedIds.read(reader);
			const itemsById = new Map<string, IInboxNotificationItem>();

			for (const session of this.sessionsManagementService.getSessions()) {
				this.collectSessionNotifications(itemsById, session, reader);
			}

			for (const item of this._externalItems.read(reader)) {
				itemsById.set(item.id, item);
			}

			return [...itemsById.values()]
				.filter(item => !dismissed.has(item.id))
				.sort(compareInboxNotifications);
		});
	}

	publishExternalNotification(notification: IExternalInboxNotification): void {
		const item: IInboxNotificationItem = {
			id: notification.id,
			kind: InboxNotificationKind.External,
			priority: notification.priority ?? InboxNotificationPriority.Normal,
			title: notification.title,
			description: notification.description,
			timestamp: notification.timestamp ?? Date.now(),
			sessionResource: notification.sessionResource,
			actions: notification.actions ?? this.dismissActionOnly(),
		};

		const existing = this._externalItems.get();
		const idx = existing.findIndex(candidate => candidate.id === item.id);
		if (idx === -1) {
			this._externalItems.set([...existing, item], undefined);
			return;
		}
		const updated = existing.slice();
		updated[idx] = item;
		this._externalItems.set(updated, undefined);
	}

	dismissNotification(id: string): void {
		if (this._dismissedIds.get().has(id)) {
			return;
		}
		const next = new Set(this._dismissedIds.get());
		next.add(id);
		this._dismissedIds.set(next, undefined);
		this.persistDismissedIds(next);
	}

	clearDismissedNotifications(): void {
		const next = new Set<string>();
		this._dismissedIds.set(next, undefined);
		this.persistDismissedIds(next);
	}

	private collectSessionNotifications(itemsById: Map<string, IInboxNotificationItem>, session: ISession, reader: IReader): void {
		if (session.isArchived.read(reader)) {
			return;
		}

		const status = session.status.read(reader);
		const title = session.title.read(reader);
		const updatedAt = session.updatedAt.read(reader).getTime();
		const statusDescription = (session.description.read(reader)?.value ?? '').toLowerCase();

		if (status === SessionStatus.NeedsInput) {
			const confirmationRequested = /\b(confirm|confirmation|approve|approval)\b/.test(statusDescription);
			const kind = confirmationRequested ? InboxNotificationKind.ConfirmationRequested : InboxNotificationKind.NeedsInput;
			const id = `${session.sessionId}:${kind}:${updatedAt}`;
			itemsById.set(id, {
				id,
				kind,
				priority: confirmationRequested ? InboxNotificationPriority.Critical : InboxNotificationPriority.High,
				title: confirmationRequested
					? localize('inboxNotifications.confirmation.title', "Confirmation Requested for {0}", title)
					: localize('inboxNotifications.needsInput.title', "Input Needed for {0}", title),
				description: confirmationRequested
					? localize('inboxNotifications.confirmation.description', "Open this session to confirm or deny the requested action.")
					: localize('inboxNotifications.needsInput.description', "Open this session to answer the pending question and continue."),
				timestamp: updatedAt,
				sessionResource: session.resource,
				actions: this.sessionActions(true, false),
			});
		}

		if (status === SessionStatus.Completed && !session.isRead.read(reader)) {
			const id = `${session.sessionId}:completed:${updatedAt}`;
			itemsById.set(id, {
				id,
				kind: InboxNotificationKind.Completed,
				priority: InboxNotificationPriority.Low,
				title: localize('inboxNotifications.completed.title', "Completed: {0}", title),
				description: localize('inboxNotifications.completed.description', "Review this completed session or mark it as read."),
				timestamp: updatedAt,
				sessionResource: session.resource,
				actions: this.sessionActions(true, true),
			});
		}
	}

	private sessionActions(includeOpen: boolean, includeMarkRead: boolean): readonly IInboxNotificationAction[] {
		const actions: IInboxNotificationAction[] = [];
		if (includeOpen) {
			actions.push({
				id: 'open-session',
				label: localize('inboxNotifications.action.open', "Open Session"),
				kind: InboxNotificationActionKind.OpenSession,
				primary: true,
			});
		}
		if (includeMarkRead) {
			actions.push({
				id: 'mark-read',
				label: localize('inboxNotifications.action.markRead', "Mark as Read"),
				kind: InboxNotificationActionKind.MarkSessionRead,
			});
		}
		actions.push({
			id: 'dismiss',
			label: localize('inboxNotifications.action.dismiss', "Dismiss"),
			kind: InboxNotificationActionKind.Dismiss,
		});
		return actions;
	}

	private dismissActionOnly(): readonly IInboxNotificationAction[] {
		return [{
			id: 'dismiss',
			label: localize('inboxNotifications.action.dismiss', "Dismiss"),
			kind: InboxNotificationActionKind.Dismiss,
		}];
	}

	private loadDismissedIds(): ReadonlySet<string> {
		try {
			const raw = this.storageService.get(DISMISSED_NOTIFICATION_IDS_STORAGE_KEY, StorageScope.APPLICATION);
			const parsed = raw ? JSON.parse(raw) : [];
			return new Set(Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []);
		} catch (error) {
			onUnexpectedError(error);
			return new Set();
		}
	}

	private persistDismissedIds(ids: ReadonlySet<string>): void {
		this.storageService.store(
			DISMISSED_NOTIFICATION_IDS_STORAGE_KEY,
			JSON.stringify([...ids]),
			StorageScope.APPLICATION,
			StorageTarget.USER,
		);
	}
}
