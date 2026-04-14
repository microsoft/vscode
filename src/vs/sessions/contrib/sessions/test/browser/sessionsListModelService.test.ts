/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionListModelChangeEvent, SessionListModelChangeKind, SessionsListModelService } from '../../browser/views/sessionsListModelService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { mock } from '../../../../../base/test/common/mock.js';

function createSession(id: string): ISession {
	return {
		sessionId: id,
		resource: URI.parse(`session://${id}`),
		providerId: 'test',
		sessionType: 'test',
		icon: Codicon.account,
		createdAt: new Date(),
		workspace: observableValue(`workspace-${id}`, undefined),
		title: observableValue(`title-${id}`, id),
		updatedAt: observableValue(`updatedAt-${id}`, new Date()),
		status: observableValue(`status-${id}`, SessionStatus.Completed),
		changes: observableValue(`changes-${id}`, []),
		modelId: observableValue(`modelId-${id}`, undefined),
		mode: observableValue(`mode-${id}`, undefined),
		loading: observableValue(`loading-${id}`, false),
		isArchived: observableValue(`isArchived-${id}`, false),
		isRead: observableValue(`isRead-${id}`, true),
		description: observableValue(`description-${id}`, undefined),
		lastTurnEnd: observableValue(`lastTurnEnd-${id}`, undefined),
		gitHubInfo: observableValue(`gitHubInfo-${id}`, undefined),
		chats: observableValue<readonly IChat[]>(`chats-${id}`, []),
		mainChat: undefined!,
	};
}

suite('SessionsListModelService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let service: SessionsListModelService;
	let sessionsChangedEmitter: Emitter<ISessionsChangeEvent>;

	setup(() => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		sessionsChangedEmitter = disposables.add(new Emitter<ISessionsChangeEvent>());
		instantiationService.stub(ISessionsManagementService, {
			...mock<ISessionsManagementService>(),
			onDidChangeSessions: sessionsChangedEmitter.event,
		});
		service = disposables.add(instantiationService.createInstance(SessionsListModelService));
	});

	// -- Pinning --

	test('pinSession marks session as pinned', () => {
		const session = createSession('s1');
		assert.strictEqual(service.isSessionPinned(session), false);

		service.pinSession(session);

		assert.strictEqual(service.isSessionPinned(session), true);
	});

	test('unpinSession marks session as not pinned', () => {
		const session = createSession('s1');
		service.pinSession(session);

		service.unpinSession(session);

		assert.strictEqual(service.isSessionPinned(session), false);
	});

	test('pinSession is idempotent and fires onDidChange only once', () => {
		const session = createSession('s1');
		let changeCount = 0;
		disposables.add(service.onDidChange(() => changeCount++));

		service.pinSession(session);
		service.pinSession(session);

		assert.strictEqual(changeCount, 1);
	});

	test('unpinSession does not fire when not pinned', () => {
		const session = createSession('s1');
		let changeCount = 0;
		disposables.add(service.onDidChange(() => changeCount++));

		service.unpinSession(session);

		assert.strictEqual(changeCount, 0);
	});

	test('pinning one session does not affect another', () => {
		const s1 = createSession('s1');
		const s2 = createSession('s2');

		service.pinSession(s1);

		assert.strictEqual(service.isSessionPinned(s1), true);
		assert.strictEqual(service.isSessionPinned(s2), false);
	});

	// -- Read/Unread --

	test('markRead marks session as read', () => {
		const session = createSession('s1');
		assert.strictEqual(service.isSessionRead(session), false);

		service.markRead(session);

		assert.strictEqual(service.isSessionRead(session), true);
	});

	test('markUnread marks session as unread', () => {
		const session = createSession('s1');
		service.markRead(session);

		service.markUnread(session);

		assert.strictEqual(service.isSessionRead(session), false);
	});

	test('markRead is idempotent', () => {
		const session = createSession('s1');
		let changeCount = 0;
		disposables.add(service.onDidChange(() => changeCount++));

		service.markRead(session);
		service.markRead(session);

		assert.strictEqual(changeCount, 1);
	});

	test('markUnread does not fire when already unread', () => {
		const session = createSession('s1');
		let changeCount = 0;
		disposables.add(service.onDidChange(() => changeCount++));

		service.markUnread(session);

		assert.strictEqual(changeCount, 0);
	});

	test('markAllRead marks multiple sessions as read', () => {
		const s1 = createSession('s1');
		const s2 = createSession('s2');
		const s3 = createSession('s3');

		service.markAllRead([s1, s2, s3]);

		assert.strictEqual(service.isSessionRead(s1), true);
		assert.strictEqual(service.isSessionRead(s2), true);
		assert.strictEqual(service.isSessionRead(s3), true);
	});

	test('markAllRead does not fire when all already read', () => {
		const s1 = createSession('s1');
		service.markRead(s1);

		let changeCount = 0;
		disposables.add(service.onDidChange(() => changeCount++));

		service.markAllRead([s1]);

		assert.strictEqual(changeCount, 0);
	});

	test('markAllRead fires once for multiple new reads', () => {
		const s1 = createSession('s1');
		const s2 = createSession('s2');

		let changeCount = 0;
		disposables.add(service.onDidChange(() => changeCount++));

		service.markAllRead([s1, s2]);

		assert.strictEqual(changeCount, 1);
	});

	// -- Independence --

	test('read and pinned states are independent', () => {
		const session = createSession('s1');

		service.pinSession(session);
		assert.strictEqual(service.isSessionPinned(session), true);
		assert.strictEqual(service.isSessionRead(session), false);

		service.markRead(session);
		assert.strictEqual(service.isSessionPinned(session), true);
		assert.strictEqual(service.isSessionRead(session), true);

		service.unpinSession(session);
		assert.strictEqual(service.isSessionPinned(session), false);
		assert.strictEqual(service.isSessionRead(session), true);
	});

	// -- onDidChange --

	test('onDidChange includes changes array with sessionId and kind', () => {
		const session = createSession('s1');
		const events: ISessionListModelChangeEvent[] = [];
		disposables.add(service.onDidChange(e => events.push(e)));

		service.pinSession(session);
		service.unpinSession(session);
		service.markRead(session);
		service.markUnread(session);

		assert.deepStrictEqual(events, [
			{ changes: [{ sessionId: 's1', kind: SessionListModelChangeKind.Pinned }] },
			{ changes: [{ sessionId: 's1', kind: SessionListModelChangeKind.Pinned }] },
			{ changes: [{ sessionId: 's1', kind: SessionListModelChangeKind.Read }] },
			{ changes: [{ sessionId: 's1', kind: SessionListModelChangeKind.Read }] },
		]);
	});

	test('markAllRead fires single event with all sessions', () => {
		const s1 = createSession('s1');
		const s2 = createSession('s2');
		const events: ISessionListModelChangeEvent[] = [];
		disposables.add(service.onDidChange(e => events.push(e)));

		service.markAllRead([s1, s2]);

		assert.deepStrictEqual(events, [
			{
				changes: [
					{ sessionId: 's1', kind: SessionListModelChangeKind.Read },
					{ sessionId: 's2', kind: SessionListModelChangeKind.Read },
				]
			},
		]);
	});

	// -- Cleanup --

	test('cleans up state when session is removed', () => {
		const session = createSession('s1');
		service.pinSession(session);
		service.markRead(session);

		const events: ISessionListModelChangeEvent[] = [];
		disposables.add(service.onDidChange(e => events.push(e)));

		sessionsChangedEmitter.fire({ added: [], removed: [session], changed: [] });

		assert.strictEqual(service.isSessionPinned(session), false);
		assert.strictEqual(service.isSessionRead(session), false);
		assert.deepStrictEqual(events, [
			{
				changes: [
					{ sessionId: 's1', kind: SessionListModelChangeKind.Pinned },
					{ sessionId: 's1', kind: SessionListModelChangeKind.Read },
				]
			},
		]);
	});

	test('removal does not fire when session has no state', () => {
		const session = createSession('s1');
		let changeCount = 0;
		disposables.add(service.onDidChange(() => changeCount++));

		sessionsChangedEmitter.fire({ added: [], removed: [session], changed: [] });

		assert.strictEqual(changeCount, 0);
	});

	test('removal does not affect other sessions', () => {
		const s1 = createSession('s1');
		const s2 = createSession('s2');
		service.pinSession(s1);
		service.pinSession(s2);

		sessionsChangedEmitter.fire({ added: [], removed: [s1], changed: [] });

		assert.strictEqual(service.isSessionPinned(s1), false);
		assert.strictEqual(service.isSessionPinned(s2), true);
	});

	// -- Storage persistence --

	test('state is loaded from storage on construction', () => {
		const storageService = disposables.add(new InMemoryStorageService());

		// Pre-populate storage
		storageService.store('sessionsListControl.pinnedSessions', JSON.stringify(['s1']), StorageScope.PROFILE, StorageTarget.USER);
		storageService.store('sessionsListControl.readSessions', JSON.stringify(['s2']), StorageScope.PROFILE, StorageTarget.USER);

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ISessionsManagementService, { ...mock<ISessionsManagementService>(), onDidChangeSessions: disposables.add(new Emitter<ISessionsChangeEvent>()).event });
		const loadedService = disposables.add(instantiationService.createInstance(SessionsListModelService));

		assert.strictEqual(loadedService.isSessionPinned(createSession('s1')), true);
		assert.strictEqual(loadedService.isSessionPinned(createSession('s2')), false);
		assert.strictEqual(loadedService.isSessionRead(createSession('s2')), true);
		assert.strictEqual(loadedService.isSessionRead(createSession('s1')), false);
	});

	test('corrupt storage data is handled gracefully', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store('sessionsListControl.pinnedSessions', 'not-valid-json{', StorageScope.PROFILE, StorageTarget.USER);

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ISessionsManagementService, { ...mock<ISessionsManagementService>(), onDidChangeSessions: disposables.add(new Emitter<ISessionsChangeEvent>()).event });
		const loadedService = disposables.add(instantiationService.createInstance(SessionsListModelService));

		// Should not throw and should return empty state
		assert.strictEqual(loadedService.isSessionPinned(createSession('s1')), false);
	});
});
