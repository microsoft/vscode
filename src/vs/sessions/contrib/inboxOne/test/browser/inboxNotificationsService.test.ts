/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { type IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { SessionStatus, type ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { InboxNotificationsService } from '../../browser/inboxNotificationsService.js';
import { InboxNotificationActionKind, InboxNotificationKind, InboxNotificationPriority } from '../../common/inboxNotificationsService.js';

suite('InboxNotificationsService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		disposables.clear();
	});

	function createSession(options: {
		readonly id: string;
		readonly status: SessionStatus;
		readonly updatedAt: number;
		readonly title?: string;
		readonly description?: string;
		readonly isRead?: boolean;
		readonly isArchived?: boolean;
	}): ISession {
		const key = `inboxNotificationsService/${options.id}`;
		return upcastPartial<ISession>({
			sessionId: options.id,
			resource: URI.parse(`test:///session/${options.id}`),
			status: observableValue(`${key}/status`, options.status),
			title: observableValue(`${key}/title`, options.title ?? options.id),
			updatedAt: observableValue(`${key}/updatedAt`, new Date(options.updatedAt)),
			description: observableValue<IMarkdownString | undefined>(`${key}/description`, options.description ? { value: options.description } : undefined),
			isRead: observableValue(`${key}/isRead`, options.isRead ?? true),
			isArchived: observableValue(`${key}/isArchived`, options.isArchived ?? false),
		});
	}

	function createFixture(initialSessions: readonly ISession[], storageService?: InMemoryStorageService): {
		readonly service: InboxNotificationsService;
		readonly storageService: InMemoryStorageService;
		setSessions(sessions: readonly ISession[]): void;
	} {
		const store = disposables.add(new DisposableStore());
		const sessionsChangeEmitter = store.add(new Emitter<ISessionsChangeEvent>());
		let sessions = [...initialSessions];
		const managementService = upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: sessionsChangeEmitter.event,
			getSessions: () => sessions,
		});
		const effectiveStorageService = storageService ?? store.add(new InMemoryStorageService());
		const service = store.add(new InboxNotificationsService(managementService, effectiveStorageService));
		return {
			service,
			storageService: effectiveStorageService,
			setSessions(nextSessions: readonly ISession[]) {
				sessions = [...nextSessions];
				sessionsChangeEmitter.fire({ added: [], removed: [], changed: sessions });
			},
		};
	}

	test('derives prioritized notifications with expected actions', () => {
		const fixture = createFixture([
			createSession({ id: 'confirm', status: SessionStatus.NeedsInput, updatedAt: 100, description: 'awaiting approval from you' }),
			createSession({ id: 'input', status: SessionStatus.NeedsInput, updatedAt: 200, description: 'waiting for user answer' }),
			createSession({ id: 'completed', status: SessionStatus.Completed, updatedAt: 300, isRead: false }),
			createSession({ id: 'ignored', status: SessionStatus.Completed, updatedAt: 400, isRead: true }),
			createSession({ id: 'archived', status: SessionStatus.NeedsInput, updatedAt: 500, isArchived: true }),
		]);

		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			kind: item.kind,
			priority: item.priority,
			actionKinds: item.actions.map(action => action.kind),
		})), [
			{
				kind: InboxNotificationKind.ConfirmationRequested,
				priority: InboxNotificationPriority.Critical,
				actionKinds: [InboxNotificationActionKind.OpenSession, InboxNotificationActionKind.Dismiss],
			},
			{
				kind: InboxNotificationKind.NeedsInput,
				priority: InboxNotificationPriority.High,
				actionKinds: [InboxNotificationActionKind.OpenSession, InboxNotificationActionKind.Dismiss],
			},
			{
				kind: InboxNotificationKind.Completed,
				priority: InboxNotificationPriority.Low,
				actionKinds: [InboxNotificationActionKind.OpenSession, InboxNotificationActionKind.MarkSessionRead, InboxNotificationActionKind.Dismiss],
			},
		]);
	});

	test('persists dismissed notifications across instances', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const sessions = [createSession({ id: 'completed', status: SessionStatus.Completed, updatedAt: 100, isRead: false })];
		const first = createFixture(sessions, storageService);

		const dismissedId = first.service.notifications.get()[0].id;
		first.service.dismissNotification(dismissedId);
		assert.deepStrictEqual(first.service.notifications.get().map(item => item.id), []);

		const second = createFixture(sessions, storageService);
		assert.deepStrictEqual(second.service.notifications.get().map(item => item.id), []);

		second.service.clearDismissedNotifications();
		assert.deepStrictEqual(second.service.notifications.get().map(item => item.kind), [InboxNotificationKind.Completed]);
	});

	test('updates external notifications by id', () => {
		const fixture = createFixture([]);
		fixture.service.publishExternalNotification({
			id: 'external-1',
			title: 'Initial',
			description: 'Initial description',
		});
		fixture.service.publishExternalNotification({
			id: 'external-1',
			title: 'Updated',
			description: 'Updated description',
			priority: InboxNotificationPriority.Critical,
		});

		assert.deepStrictEqual(fixture.service.notifications.get().map(item => ({
			id: item.id,
			title: item.title,
			priority: item.priority,
			actionKinds: item.actions.map(action => action.kind),
		})), [{
			id: 'external-1',
			title: 'Updated',
			priority: InboxNotificationPriority.Critical,
			actionKinds: [InboxNotificationActionKind.Dismiss],
		}]);
	});
});
