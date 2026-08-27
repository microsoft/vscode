/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IChat, ISession, SessionStatus } from '../../common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../common/sessionsManagement.js';
import { ISessionListModelChangeEvent, SessionListModelChangeKind, SessionsListModelService } from '../../browser/sessionsListModelService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { mock } from '../../../../../base/test/common/mock.js';

function createSession(id: string, status: SessionStatus = SessionStatus.Completed, opts?: { createdAt?: Date; updatedAt?: Date; createdBySession?: URI }): ISession {
	return {
		sessionId: id,
		resource: URI.parse(`session://${id}`),
		providerId: 'test',
		sessionType: 'test',
		icon: Codicon.account,
		createdAt: opts?.createdAt ?? new Date(),
		workspace: observableValue(`workspace-${id}`, undefined),
		createdBySession: constObservable(opts?.createdBySession ? { session: opts.createdBySession } : undefined),
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
	let sessionDeletedEmitter: Emitter<ISession>;
	let sessions: ISession[];
	let instantiationService: TestInstantiationService;
	let storageService: InMemoryStorageService;

	setup(() => {
		instantiationService = disposables.add(new TestInstantiationService());
		storageService = disposables.add(new InMemoryStorageService());
		instantiationService.stub(IStorageService, storageService);
		sessionsChangedEmitter = disposables.add(new Emitter<ISessionsChangeEvent>());
		sessionDeletedEmitter = disposables.add(new Emitter<ISession>());
		sessions = [];
		instantiationService.stub(ISessionsManagementService, {
			...mock<ISessionsManagementService>(),
			getSessions: () => sessions,
			getSession: resource => sessions.find(session => session.resource.toString() === resource.toString()),
			onDidChangeSessions: sessionsChangedEmitter.event,
			onDidDeleteSession: sessionDeletedEmitter.event,
		});
		service = disposables.add(instantiationService.createInstance(SessionsListModelService));
	});

	test('unread state takes precedence over the completed-state icon', () => {
		const completedStateIcon = Codicon.gitPullRequest;
		const unreadIcon = service.getStatusIcon(SessionStatus.Completed, false, false, completedStateIcon);
		const readIcon = service.getStatusIcon(SessionStatus.Completed, true, false, completedStateIcon);

		assert.deepStrictEqual({
			unread: { id: unreadIcon.id, color: unreadIcon.color?.id },
			read: { id: readIcon.id, color: readIcon.color?.id },
		}, {
			unread: { id: Codicon.circleFilled.id, color: 'textLink.foreground' },
			read: { id: Codicon.gitPullRequest.id, color: undefined },
		});
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

	test('places a created session after its creator once and preserves later user ordering', () => {
		const creator = createSession('creator', SessionStatus.Completed, {
			createdAt: new Date('2024-06-03'),
			updatedAt: new Date('2024-06-03'),
		});
		const next = createSession('next', SessionStatus.Completed, {
			createdAt: new Date('2024-06-01'),
			updatedAt: new Date('2024-06-01'),
		});
		const createdSession = createSession('created', SessionStatus.Completed, {
			createdAt: new Date('2024-06-04'),
			updatedAt: new Date('2024-06-04'),
			createdBySession: creator.resource,
		});
		sessions = [createdSession, creator, next];

		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });
		const initialCreatedKey = service.getSortKey(createdSession, 'created');
		const initialUpdatedKey = service.getSortKey(createdSession, 'updated');
		service.applySortChanges('created', new Map([[createdSession.sessionId, creator.createdAt.getTime() + 60_000]]), []);
		sessionsChangedEmitter.fire({ added: [], removed: [createdSession], changed: [] });
		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });

		assert.deepStrictEqual({
			initialCreatedBetweenCreatorAndNext: creator.createdAt.getTime() > initialCreatedKey && initialCreatedKey > next.createdAt.getTime(),
			initialUpdatedBetweenCreatorAndNext: creator.updatedAt.get().getTime() > initialUpdatedKey && initialUpdatedKey > next.updatedAt.get().getTime(),
			createdAfterUserReorderAndReadd: service.getSortKey(createdSession, 'created'),
		}, {
			initialCreatedBetweenCreatorAndNext: true,
			initialUpdatedBetweenCreatorAndNext: true,
			createdAfterUserReorderAndReadd: creator.createdAt.getTime() + 60_000,
		});
	});

	test('batches default sort placement and is idempotent', () => {
		const creator = createSession('creator', SessionStatus.Completed, { createdAt: new Date('2024-06-03') });
		const createdSession = createSession('created', SessionStatus.Completed, {
			createdAt: new Date('2024-06-04'),
			createdBySession: creator.resource,
		});
		sessions = [createdSession, creator];
		const events: ISessionListModelChangeEvent[] = [];
		disposables.add(service.onDidChange(event => events.push(event)));

		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });
		sessionsChangedEmitter.fire({ added: [], removed: [], changed: [createdSession] });

		assert.deepStrictEqual(events, [{
			changes: [{ sessionId: createdSession.sessionId, kind: SessionListModelChangeKind.Sort }],
		}]);
	});

	test('updated default placement expires when the created session becomes more recent', () => {
		const updatedAt = observableValue('created-updatedAt', new Date('2024-06-04'));
		const creator = createSession('creator', SessionStatus.Completed, {
			updatedAt: new Date('2024-06-03'),
		});
		const next = createSession('next', SessionStatus.Completed, {
			updatedAt: new Date('2024-06-01'),
		});
		const createdSession: ISession = {
			...createSession('created', SessionStatus.Completed, { createdBySession: creator.resource }),
			updatedAt,
		};
		sessions = [createdSession, creator, next];
		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });

		updatedAt.set(new Date('2024-06-05'), undefined);
		sessionsChangedEmitter.fire({ added: [], removed: [], changed: [createdSession] });
		service.dispose();
		service = disposables.add(instantiationService.createInstance(SessionsListModelService));

		assert.deepStrictEqual({
			hasOverride: service.hasSortOverride(createdSession.sessionId, 'updated'),
			sortKey: service.getSortKey(createdSession, 'updated'),
		}, {
			hasOverride: false,
			sortKey: new Date('2024-06-05').getTime(),
		});
	});

	test('places a created session when creation metadata arrives after add', () => {
		const creator = createSession('creator', SessionStatus.Completed, { createdAt: new Date('2024-06-03') });
		const next = createSession('next', SessionStatus.Completed, { createdAt: new Date('2024-06-01') });
		const createdBySession = observableValue<{ readonly session: URI } | undefined>('createdBySession', undefined);
		const createdSession: ISession = { ...createSession('created', SessionStatus.Completed, { createdAt: new Date('2024-06-04') }), createdBySession };
		sessions = [createdSession, creator, next];

		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });
		createdBySession.set({ session: creator.resource }, undefined);
		sessionsChangedEmitter.fire({ added: [], removed: [], changed: [createdSession] });

		const createdSessionKey = service.getSortKey(createdSession, 'created');
		assert.strictEqual(creator.createdAt.getTime() > createdSessionKey && createdSessionKey > next.createdAt.getTime(), true);
	});

	test('places created sessions that predate service construction', () => {
		const creator = createSession('creator', SessionStatus.Completed, { createdAt: new Date('2024-06-03') });
		const next = createSession('next', SessionStatus.Completed, { createdAt: new Date('2024-06-01') });
		const createdSession = createSession('created', SessionStatus.Completed, {
			createdAt: new Date('2024-06-04'),
			createdBySession: creator.resource,
		});
		sessions = [createdSession, creator, next];
		service.dispose();

		service = disposables.add(instantiationService.createInstance(SessionsListModelService));

		const createdSessionKey = service.getSortKey(createdSession, 'created');
		assert.strictEqual(creator.createdAt.getTime() > createdSessionKey && createdSessionKey > next.createdAt.getTime(), true);
	});

	test('places a created session when its creator arrives later', () => {
		const creator = createSession('creator', SessionStatus.Completed, { createdAt: new Date('2024-06-03') });
		const next = createSession('next', SessionStatus.Completed, { createdAt: new Date('2024-06-01') });
		const createdSession = createSession('created', SessionStatus.Completed, {
			createdAt: new Date('2024-06-04'),
			createdBySession: creator.resource,
		});
		sessions = [createdSession, next];
		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });

		sessions = [createdSession, creator, next];
		sessionsChangedEmitter.fire({ added: [creator], removed: [], changed: [] });

		const createdSessionKey = service.getSortKey(createdSession, 'created');
		assert.strictEqual(creator.createdAt.getTime() > createdSessionKey && createdSessionKey > next.createdAt.getTime(), true);
	});

	test('initializes reversed creation chains creator-first', () => {
		const root = createSession('root', SessionStatus.Completed, { createdAt: new Date('2024-06-03') });
		const child = createSession('child', SessionStatus.Completed, {
			createdAt: new Date('2024-06-04'),
			createdBySession: root.resource,
		});
		const grandchild = createSession('grandchild', SessionStatus.Completed, {
			createdAt: new Date('2024-06-05'),
			createdBySession: child.resource,
		});
		sessions = [grandchild, child, root];
		service.dispose();

		service = disposables.add(instantiationService.createInstance(SessionsListModelService));

		assert.strictEqual(
			service.getSortKey(root, 'created') > service.getSortKey(child, 'created')
			&& service.getSortKey(child, 'created') > service.getSortKey(grandchild, 'created'),
			true,
		);
	});

	test('does not create overrides for cyclic creation provenance', () => {
		const firstCreatedBy = observableValue<{ readonly session: URI } | undefined>('firstCreatedBy', undefined);
		const secondCreatedBy = observableValue<{ readonly session: URI } | undefined>('secondCreatedBy', undefined);
		const first: ISession = { ...createSession('first'), createdBySession: firstCreatedBy };
		const second: ISession = { ...createSession('second'), createdBySession: secondCreatedBy };
		firstCreatedBy.set({ session: second.resource }, undefined);
		secondCreatedBy.set({ session: first.resource }, undefined);
		sessions = [first, second];
		let changeCount = 0;
		disposables.add(service.onDidChange(() => changeCount++));

		sessionsChangedEmitter.fire({ added: [first, second], removed: [], changed: [] });

		assert.deepStrictEqual({
			firstCreated: service.hasSortOverride(first.sessionId, 'created'),
			firstUpdated: service.hasSortOverride(first.sessionId, 'updated'),
			secondCreated: service.hasSortOverride(second.sessionId, 'created'),
			secondUpdated: service.hasSortOverride(second.sessionId, 'updated'),
			changeCount,
		}, {
			firstCreated: false,
			firstUpdated: false,
			secondCreated: false,
			secondUpdated: false,
			changeCount: 0,
		});
	});

	test('does not create overrides for self-referential creation provenance', () => {
		const createdBySession = observableValue<{ readonly session: URI } | undefined>('createdBySession', undefined);
		const session: ISession = { ...createSession('self'), createdBySession };
		createdBySession.set({ session: session.resource }, undefined);
		sessions = [session];

		sessionsChangedEmitter.fire({ added: [session], removed: [], changed: [] });

		assert.deepStrictEqual({
			created: service.hasSortOverride(session.sessionId, 'created'),
			updated: service.hasSortOverride(session.sessionId, 'updated'),
		}, {
			created: false,
			updated: false,
		});
	});

	test('keeps an explicit natural-order placement across service reconstruction', () => {
		const creator = createSession('creator', SessionStatus.Completed, { createdAt: new Date('2024-06-03') });
		const createdSession = createSession('created', SessionStatus.Completed, {
			createdAt: new Date('2024-06-04'),
			createdBySession: creator.resource,
		});
		sessions = [createdSession, creator];
		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });

		service.applySortChanges('created', new Map(), [createdSession.sessionId]);
		service.dispose();
		service = disposables.add(instantiationService.createInstance(SessionsListModelService));

		assert.deepStrictEqual({
			hasOverride: service.hasSortOverride(createdSession.sessionId, 'created'),
			sortKey: service.getSortKey(createdSession, 'created'),
		}, {
			hasOverride: true,
			sortKey: createdSession.createdAt.getTime(),
		});
	});

	test('clearing a normal session override restores absence and is idempotent', () => {
		const session = createSession('normal');
		sessions = [session];
		service.applySortChanges('created', new Map([[session.sessionId, 42]]), []);
		let changeCount = 0;
		disposables.add(service.onDidChange(() => changeCount++));

		service.applySortChanges('created', new Map(), [session.sessionId]);
		service.applySortChanges('created', new Map(), [session.sessionId]);

		assert.deepStrictEqual({
			hasOverride: service.hasSortOverride(session.sessionId, 'created'),
			changeCount,
		}, {
			hasOverride: false,
			changeCount: 1,
		});
	});

	test('preserves a persisted mode override while filling only the missing mode', () => {
		const creator = createSession('creator', SessionStatus.Completed, {
			createdAt: new Date('2024-06-03'),
			updatedAt: new Date('2024-06-03'),
		});
		const createdSession = createSession('created', SessionStatus.Completed, {
			createdAt: new Date('2024-06-04'),
			updatedAt: new Date('2024-06-04'),
			createdBySession: creator.resource,
		});
		sessions = [createdSession, creator];
		const persistedCreatedKey = 123;
		storageService.store('sessionsListControl.sortOverrides', JSON.stringify({
			created: { [createdSession.sessionId]: persistedCreatedKey },
		}), StorageScope.PROFILE, StorageTarget.USER);
		service.dispose();

		service = disposables.add(instantiationService.createInstance(SessionsListModelService));

		assert.deepStrictEqual({
			createdKey: service.getSortKey(createdSession, 'created'),
			hasUpdatedOverride: service.hasSortOverride(createdSession.sessionId, 'updated'),
		}, {
			createdKey: persistedCreatedKey,
			hasUpdatedOverride: true,
		});
	});

	// -- Cleanup --

	test('cleans up state when session is deleted', () => {
		const session = createSession('s1');
		service.pinSession(session);

		const events: ISessionListModelChangeEvent[] = [];
		disposables.add(service.onDidChange(e => events.push(e)));

		sessionDeletedEmitter.fire(session);

		assert.strictEqual(service.isSessionPinned(session), false);
		assert.deepStrictEqual(events, [
			{ changes: [{ sessionId: 's1', kind: SessionListModelChangeKind.Pinned }] },
		]);
	});

	test('deletion removes created and updated sort overrides', () => {
		const creator = createSession('creator');
		const createdSession = createSession('created', SessionStatus.Completed, { createdBySession: creator.resource });
		sessions = [creator, createdSession];
		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });
		assert.strictEqual(service.hasSortOverride(createdSession.sessionId, 'created'), true);
		assert.strictEqual(service.hasSortOverride(createdSession.sessionId, 'updated'), true);

		sessionDeletedEmitter.fire(createdSession);
		service.dispose();
		sessions = [creator];
		service = disposables.add(instantiationService.createInstance(SessionsListModelService));

		assert.deepStrictEqual({
			created: service.hasSortOverride(createdSession.sessionId, 'created'),
			updated: service.hasSortOverride(createdSession.sessionId, 'updated'),
		}, {
			created: false,
			updated: false,
		});
	});

	test('pin survives a session being evicted from the provider list', () => {
		const session = createSession('s1');
		service.pinSession(session);

		let changeCount = 0;
		disposables.add(service.onDidChange(() => changeCount++));

		// An agent that cannot answer `listSessions` yet reports no sessions,
		// so the list evicts them until the next refresh. That must not unpin.
		sessionsChangedEmitter.fire({ added: [], removed: [session], changed: [] });

		assert.strictEqual(service.isSessionPinned(session), true);
		assert.strictEqual(changeCount, 0);
	});

	test('sort overrides survive temporary provider eviction', () => {
		const creator = createSession('creator');
		const createdSession = createSession('created', SessionStatus.Completed, { createdBySession: creator.resource });
		sessions = [creator, createdSession];
		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });
		const createdKey = service.getSortKey(createdSession, 'created');
		const updatedKey = service.getSortKey(createdSession, 'updated');
		let changeCount = 0;
		disposables.add(service.onDidChange(() => changeCount++));

		sessions = [creator];
		sessionsChangedEmitter.fire({ added: [], removed: [createdSession], changed: [] });
		sessions = [creator, createdSession];
		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });

		assert.deepStrictEqual({
			createdKey: service.getSortKey(createdSession, 'created'),
			updatedKey: service.getSortKey(createdSession, 'updated'),
			changeCount,
		}, {
			createdKey,
			updatedKey,
			changeCount: 0,
		});
	});

	test('deletion does not fire when session has no state', () => {
		const session = createSession('s1');
		let changeCount = 0;
		disposables.add(service.onDidChange(() => changeCount++));

		sessionDeletedEmitter.fire(session);

		assert.strictEqual(changeCount, 0);
	});

	test('deletion does not affect other sessions', () => {
		const s1 = createSession('s1');
		const s2 = createSession('s2');
		service.pinSession(s1);
		service.pinSession(s2);

		sessionDeletedEmitter.fire(s1);

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
		instantiationService.stub(ISessionsManagementService, { ...mock<ISessionsManagementService>(), getSessions: () => [], getSession: () => undefined, onDidChangeSessions: Event.None, onDidDeleteSession: disposables.add(new Emitter<ISession>()).event });
		const loadedService = disposables.add(instantiationService.createInstance(SessionsListModelService));

		assert.strictEqual(loadedService.isSessionPinned(createSession('s1')), true);
		assert.strictEqual(loadedService.isSessionPinned(createSession('s2')), false);
	});

	test('corrupt storage data is handled gracefully', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store('sessionsListControl.pinnedSessions', 'not-valid-json{', StorageScope.PROFILE, StorageTarget.USER);

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ISessionsManagementService, { ...mock<ISessionsManagementService>(), getSessions: () => [], getSession: () => undefined, onDidChangeSessions: Event.None, onDidDeleteSession: disposables.add(new Emitter<ISession>()).event });
		const loadedService = disposables.add(instantiationService.createInstance(SessionsListModelService));

		// Should not throw and should return empty state
		assert.strictEqual(loadedService.isSessionPinned(createSession('s1')), false);
	});

	test('corrupt sort storage falls back to default placement', () => {
		const creator = createSession('creator');
		const createdSession = createSession('created', SessionStatus.Completed, { createdBySession: creator.resource });
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store('sessionsListControl.sortOverrides', 'not-valid-json{', StorageScope.PROFILE, StorageTarget.USER);
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ISessionsManagementService, {
			...mock<ISessionsManagementService>(),
			getSessions: () => [createdSession, creator],
			getSession: resource => resource.toString() === creator.resource.toString() ? creator : undefined,
			onDidChangeSessions: Event.None,
			onDidDeleteSession: disposables.add(new Emitter<ISession>()).event,
		});

		const loadedService = disposables.add(instantiationService.createInstance(SessionsListModelService));

		assert.deepStrictEqual({
			created: loadedService.hasSortOverride(createdSession.sessionId, 'created'),
			updated: loadedService.hasSortOverride(createdSession.sessionId, 'updated'),
		}, {
			created: true,
			updated: true,
		});
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
				getSessions: () => [],
				getSession: () => undefined,
				onDidChangeSessions: Event.None,
				onDidDeleteSession: disposables.add(new Emitter<ISession>()).event,
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
					getSessions: () => [],
					getSession: () => undefined,
					onDidChangeSessions: Event.None,
					onDidDeleteSession: disposables.add(new Emitter<ISession>()).event,
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
