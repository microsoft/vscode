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
import { IStorageService, InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IChat, ISession, SessionStatus } from '../../common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../common/sessionsManagement.js';
import { SessionGroupsService } from '../../browser/sessionGroupsService.js';

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

suite('SessionGroupsService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let service: SessionGroupsService;
	let storageService: InMemoryStorageService;
	let sessionsChangedEmitter: Emitter<ISessionsChangeEvent>;
	let willSendRequestEmitter: Emitter<ISession>;
	let sessionStartedEmitter: Emitter<ISession>;
	let sessionReplacedEmitter: Emitter<{ readonly from: ISession; readonly to: ISession }>;
	let newSessionDiscardedEmitter: Emitter<ISession>;
	let instantiationService: TestInstantiationService;

	/** Simulate a new-session send: dispatch (`onWillSendRequest`) then start. */
	function sendNewSession(draftId: string, committedId: string = draftId): void {
		willSendRequestEmitter.fire(createSession(draftId));
		if (committedId !== draftId) {
			sessionReplacedEmitter.fire({ from: createSession(draftId), to: createSession(committedId) });
		}
		sessionStartedEmitter.fire(createSession(committedId));
	}

	setup(() => {
		instantiationService = disposables.add(new TestInstantiationService());
		storageService = disposables.add(new InMemoryStorageService());
		instantiationService.stub(IStorageService, storageService);
		sessionsChangedEmitter = disposables.add(new Emitter<ISessionsChangeEvent>());
		willSendRequestEmitter = disposables.add(new Emitter<ISession>());
		sessionStartedEmitter = disposables.add(new Emitter<ISession>());
		sessionReplacedEmitter = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		newSessionDiscardedEmitter = disposables.add(new Emitter<ISession>());
		instantiationService.stub(ISessionsManagementService, {
			...mock<ISessionsManagementService>(),
			onDidChangeSessions: sessionsChangedEmitter.event,
			onWillSendRequest: willSendRequestEmitter.event,
			onDidStartSession: sessionStartedEmitter.event,
			onDidReplaceSession: sessionReplacedEmitter.event,
			onDidDiscardNewSession: newSessionDiscardedEmitter.event,
		});
		service = disposables.add(instantiationService.createInstance(SessionGroupsService));
	});

	test('create group with members and look up membership', () => {
		const group = service.createGroup('Group A', ['s1', 's2']);

		assert.strictEqual(service.getGroup(group.id)?.name, 'Group A');
		assert.strictEqual(service.getGroupOfSession('s1'), group.id);
		assert.strictEqual(service.getGroupOfSession('s2'), group.id);
		assert.deepStrictEqual(service.getSessionIdsInGroup(group.id).sort(), ['s1', 's2']);
	});

	test('a session belongs to at most one group; adding moves it', () => {
		const a = service.createGroup('A', ['s1']);
		const b = service.createGroup('B');

		service.addToGroup('s1', b.id);

		assert.strictEqual(service.getGroupOfSession('s1'), b.id);
		assert.deepStrictEqual(service.getSessionIdsInGroup(a.id), []);
		assert.deepStrictEqual(service.getSessionIdsInGroup(b.id), ['s1']);
	});

	test('addToGroup adds multiple sessions in a single change event', () => {
		const a = service.createGroup('A');
		let changeCount = 0;
		disposables.add(service.onDidChange(() => changeCount++));

		service.addToGroup(['s1', 's2', 's3'], a.id);

		assert.deepStrictEqual(
			[service.getSessionIdsInGroup(a.id), changeCount],
			[['s1', 's2', 's3'], 1]
		);
	});

	test('addToGroup with multiple sessions does not fire when none change', () => {
		const a = service.createGroup('A', ['s1', 's2']);
		let changeCount = 0;
		disposables.add(service.onDidChange(() => changeCount++));

		service.addToGroup(['s1', 's2'], a.id);

		assert.strictEqual(changeCount, 0);
	});

	test('remove from group clears membership', () => {
		const a = service.createGroup('A', ['s1', 's2']);
		service.removeFromGroup('s1');

		assert.strictEqual(service.getGroupOfSession('s1'), undefined);
		assert.deepStrictEqual(service.getSessionIdsInGroup(a.id), ['s2']);
	});

	test('rename group', () => {
		const a = service.createGroup('A');
		service.renameGroup(a.id, 'Renamed');
		assert.strictEqual(service.getGroup(a.id)?.name, 'Renamed');
	});

	test('delete group removes group and membership', () => {
		const a = service.createGroup('A', ['s1', 's2']);
		service.deleteGroup(a.id);

		assert.strictEqual(service.getGroup(a.id), undefined);
		assert.strictEqual(service.getGroupOfSession('s1'), undefined);
		assert.strictEqual(service.getGroupOfSession('s2'), undefined);
	});

	test('membership is cleaned up when a session is removed', () => {
		const a = service.createGroup('A', ['s1', 's2']);
		const session = createSession('s1');
		sessionsChangedEmitter.fire({ added: [], removed: [session], changed: [] });

		assert.deepStrictEqual({
			groupName: service.getGroup(a.id)?.name,
			removedMembership: service.getGroupOfSession('s1'),
			remainingMembers: service.getSessionIdsInGroup(a.id),
		}, {
			groupName: 'A',
			removedMembership: undefined,
			remainingMembers: ['s2'],
		});
	});

	test('empty groups persist until explicitly deleted', () => {
		for (const name of ['1', '2', '3', '4']) {
			service.createGroup(name);
		}

		const reloaded = disposables.add(instantiationService.createInstance(SessionGroupsService));
		assert.deepStrictEqual(reloaded.getGroups().map(group => group.name).sort(), ['1', '2', '3', '4']);
	});

	test('state persists across reload', () => {
		const a = service.createGroup('Persisted', ['s1', 's2']);

		const reloaded = disposables.add(instantiationService.createInstance(SessionGroupsService));
		assert.strictEqual(reloaded.getGroup(a.id)?.name, 'Persisted');
		assert.strictEqual(reloaded.getGroupOfSession('s1'), a.id);
		assert.strictEqual(reloaded.getGroupOfSession('s2'), a.id);
	});

	test('pending new session group binds the next started session', () => {
		const a = service.createGroup('A');
		service.setPendingNewSessionGroup(a.id);

		sendNewSession('started');

		assert.strictEqual(service.getGroupOfSession('started'), a.id);
		assert.deepStrictEqual(service.getSessionIdsInGroup(a.id), ['started']);
	});

	test('pending group follows the draft as it graduates to a committed id', () => {
		const a = service.createGroup('A');
		service.setPendingNewSessionGroup(a.id);

		sendNewSession('draft', 'committed');

		assert.strictEqual(service.getGroupOfSession('committed'), a.id);
		assert.strictEqual(service.getGroupOfSession('draft'), undefined);
	});

	test('pending new session group is consumed once', () => {
		const a = service.createGroup('A');
		service.setPendingNewSessionGroup(a.id);

		sendNewSession('s1');
		sendNewSession('s2');

		assert.strictEqual(service.getGroupOfSession('s1'), a.id);
		assert.strictEqual(service.getGroupOfSession('s2'), undefined);
	});

	test('a concurrent send for another group does not rebind an in-flight send', () => {
		const a = service.createGroup('A');
		const b = service.createGroup('B');

		// Dispatch a send for A, then arm B before A's start commits.
		service.setPendingNewSessionGroup(a.id);
		willSendRequestEmitter.fire(createSession('a-draft'));
		service.setPendingNewSessionGroup(b.id);

		sessionStartedEmitter.fire(createSession('a-draft'));

		assert.strictEqual(service.getGroupOfSession('a-draft'), a.id);
		assert.strictEqual(service.getGroupOfSession('b-draft'), undefined);
	});

	test('discarding the new session clears the pending group', () => {
		const a = service.createGroup('A');
		service.setPendingNewSessionGroup(a.id);

		newSessionDiscardedEmitter.fire(createSession('draft'));
		sendNewSession('unrelated');

		assert.strictEqual(service.getGroupOfSession('unrelated'), undefined);
		assert.deepStrictEqual(service.getSessionIdsInGroup(a.id), []);
	});

	test('pending group for a non-existent group is ignored', () => {
		service.setPendingNewSessionGroup('missing');
		sendNewSession('s1');
		assert.strictEqual(service.getGroupOfSession('s1'), undefined);
	});

	test('deleting the pending group clears the pending intent', () => {
		const a = service.createGroup('A');
		service.setPendingNewSessionGroup(a.id);
		service.deleteGroup(a.id);

		const b = service.createGroup('B');
		sendNewSession('s1');

		assert.strictEqual(service.getGroupOfSession('s1'), undefined);
		assert.deepStrictEqual(service.getSessionIdsInGroup(b.id), []);
	});
});
