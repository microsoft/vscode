/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IChat, ISession, SessionStatus } from '../../common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../common/sessionsManagement.js';
import { ISessionListModelChangeEvent, SessionListModelChangeKind, SessionsListModelService } from '../../browser/sessionsListModelService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { mock } from '../../../../../base/test/common/mock.js';

function createSession(id: string, status: SessionStatus = SessionStatus.Completed, opts?: { createdAt?: Date; updatedAt?: Date }): ISession {
	return {
		sessionId: id,
		resource: URI.parse(`session://${id}`),
		providerId: 'test',
		sessionType: 'test',
		icon: Codicon.account,
		createdAt: opts?.createdAt ?? new Date(),
		workspace: observableValue(`workspace-${id}`, undefined),
		title: observableValue(`title-${id}`, id),
		updatedAt: observableValue(`updatedAt-${id}`, opts?.updatedAt ?? new Date()),
		status: observableValue(`status-${id}`, status),
		changesets: observableValue(`changesets-${id}`, []),
		changes: observableValue(`changes-${id}`, []),
		modelId: observableValue(`modelId-${id}`, undefined),
		mode: observableValue(`mode-${id}`, undefined),
		loading: observableValue(`loading-${id}`, false),
		isArchived: observableValue(`isArchived-${id}`, false),
		isRead: observableValue(`isRead-${id}`, true),
		description: observableValue(`description-${id}`, undefined),
		lastTurnEnd: observableValue(`lastTurnEnd-${id}`, undefined),
		chats: observableValue<readonly IChat[]>(`chats-${id}`, []),
		mainChat: constObservable<IChat>(undefined!),
		capabilities: constObservable({ supportsMultipleChats: false }),
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

	test('unpinSessions unpins multiple sessions and fires once', () => {
		const s1 = createSession('s1');
		const s2 = createSession('s2');
		const s3 = createSession('s3');
		service.pinSession(s1);
		service.pinSession(s2);
		let changeCount = 0;
		disposables.add(service.onDidChange(() => changeCount++));

		service.unpinSessions([s1, s2, s3]);

		assert.deepStrictEqual(
			[service.isSessionPinned(s1), service.isSessionPinned(s2), changeCount],
			[false, false, 1]
		);
	});

	test('unpinSessions does not fire when none are pinned', () => {
		const s1 = createSession('s1');
		const s2 = createSession('s2');
		let changeCount = 0;
		disposables.add(service.onDidChange(() => changeCount++));

		service.unpinSessions([s1, s2]);

		assert.strictEqual(changeCount, 0);
	});

	// -- onDidChange --

	test('onDidChange includes changes array with sessionId and kind', () => {
		const session = createSession('s1');
		const events: ISessionListModelChangeEvent[] = [];
		disposables.add(service.onDidChange(e => events.push(e)));

		service.pinSession(session);
		service.unpinSession(session);

		assert.deepStrictEqual(events, [
			{ changes: [{ sessionId: 's1', kind: SessionListModelChangeKind.Pinned }] },
			{ changes: [{ sessionId: 's1', kind: SessionListModelChangeKind.Pinned }] },
		]);
	});

	// -- Cleanup --

	test('cleans up state when session is removed', () => {
		const session = createSession('s1');
		service.pinSession(session);

		const events: ISessionListModelChangeEvent[] = [];
		disposables.add(service.onDidChange(e => events.push(e)));

		sessionsChangedEmitter.fire({ added: [], removed: [session], changed: [] });

		assert.strictEqual(service.isSessionPinned(session), false);
		assert.deepStrictEqual(events, [
			{ changes: [{ sessionId: 's1', kind: SessionListModelChangeKind.Pinned }] },
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

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ISessionsManagementService, { ...mock<ISessionsManagementService>(), onDidChangeSessions: disposables.add(new Emitter<ISessionsChangeEvent>()).event });
		const loadedService = disposables.add(instantiationService.createInstance(SessionsListModelService));

		assert.strictEqual(loadedService.isSessionPinned(createSession('s1')), true);
		assert.strictEqual(loadedService.isSessionPinned(createSession('s2')), false);
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

	// -- Legacy read-state migration --

	suite('migrateLegacyReadState', () => {

		const LEGACY_KEY = 'sessionsListControl.readSessions';
		// Fixed reference points relative to the migration's 2026-05-12 cutoff.
		const PRE_CUTOFF = new Date('2026-01-01T00:00:00.000Z');
		const POST_CUTOFF = new Date('2026-06-01T00:00:00.000Z');

		function createServiceWithLegacyRead(ids: string[] | undefined): { service: SessionsListModelService; storage: InMemoryStorageService; readMarks: string[]; unreadMarks: string[] } {
			const storage = disposables.add(new InMemoryStorageService());
			if (ids !== undefined) {
				storage.store(LEGACY_KEY, JSON.stringify(ids), StorageScope.PROFILE, StorageTarget.USER);
			}
			const readMarks: string[] = [];
			const unreadMarks: string[] = [];
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IStorageService, storage);
			instantiationService.stub(ISessionsManagementService, {
				...mock<ISessionsManagementService>(),
				onDidChangeSessions: disposables.add(new Emitter<ISessionsChangeEvent>()).event,
				markRead: async (session: ISession) => { readMarks.push(session.sessionId); },
				markUnread: async (session: ISession) => { unreadMarks.push(session.sessionId); },
			});
			const service = disposables.add(instantiationService.createInstance(SessionsListModelService));
			return { service, storage, readMarks, unreadMarks };
		}

		test('marks a session with a legacy read entry read', () => {
			const { readMarks, unreadMarks, service } = createServiceWithLegacyRead(['s1']);
			service.migrateLegacyReadState(createSession('s1', SessionStatus.Completed, { updatedAt: POST_CUTOFF }));

			assert.deepStrictEqual({ readMarks, unreadMarks }, { readMarks: ['s1'], unreadMarks: [] });
		});

		test('marks a pre-cutoff session read even without a legacy read entry', () => {
			const { readMarks, unreadMarks, service } = createServiceWithLegacyRead(undefined);
			service.migrateLegacyReadState(createSession('old', SessionStatus.Completed, { updatedAt: PRE_CUTOFF }));

			assert.deepStrictEqual({ readMarks, unreadMarks }, { readMarks: ['old'], unreadMarks: [] });
		});

		test('never marks a session unread (recent session without a legacy read entry is left alone)', () => {
			const { readMarks, unreadMarks, service } = createServiceWithLegacyRead(['other']);
			service.migrateLegacyReadState(createSession('s1', SessionStatus.Completed, { updatedAt: POST_CUTOFF }));

			assert.deepStrictEqual({ readMarks, unreadMarks }, { readMarks: [], unreadMarks: [] });
		});

		test('is a no-op when there is no legacy read state and the session is recent', () => {
			const { readMarks, unreadMarks, service } = createServiceWithLegacyRead(undefined);
			service.migrateLegacyReadState(createSession('s1', SessionStatus.Completed, { updatedAt: POST_CUTOFF }));

			assert.deepStrictEqual({ readMarks, unreadMarks }, { readMarks: [], unreadMarks: [] });
		});

		test('migrating the same read session twice marks it once', () => {
			const { readMarks, unreadMarks, service } = createServiceWithLegacyRead(['s1']);
			const session = createSession('s1', SessionStatus.Completed, { updatedAt: POST_CUTOFF });
			service.migrateLegacyReadState(session);
			service.migrateLegacyReadState(session);

			assert.deepStrictEqual({ readMarks, unreadMarks }, { readMarks: ['s1'], unreadMarks: [] });
		});

		test('persists migrated read sessions so a fresh service does not re-mark them', () => {
			const storage = disposables.add(new InMemoryStorageService());
			storage.store(LEGACY_KEY, JSON.stringify(['s1']), StorageScope.PROFILE, StorageTarget.USER);
			const readMarks: string[] = [];
			const unreadMarks: string[] = [];
			const makeService = () => {
				const instantiationService = disposables.add(new TestInstantiationService());
				instantiationService.stub(IStorageService, storage);
				instantiationService.stub(ISessionsManagementService, {
					...mock<ISessionsManagementService>(),
					onDidChangeSessions: disposables.add(new Emitter<ISessionsChangeEvent>()).event,
					markRead: async (session: ISession) => { readMarks.push(session.sessionId); },
					markUnread: async (session: ISession) => { unreadMarks.push(session.sessionId); },
				});
				return disposables.add(instantiationService.createInstance(SessionsListModelService));
			};
			const session = createSession('s1', SessionStatus.Completed, { updatedAt: POST_CUTOFF });

			makeService().migrateLegacyReadState(session);
			// A later launch reloads the persisted "done" set and must skip it,
			// so a subsequent unread (e.g. a new turn) is not re-flipped to read.
			makeService().migrateLegacyReadState(session);

			assert.deepStrictEqual({ readMarks, unreadMarks }, { readMarks: ['s1'], unreadMarks: [] });
		});
	});
});
