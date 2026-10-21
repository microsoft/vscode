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
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IChat, ISession, SessionStatus } from '../../common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../common/sessionsManagement.js';
import { getSessionGroupSectionId, SessionGroupsService, SessionGroupTree } from '../../browser/sessionGroupsService.js';
import { ISessionSectionOrderService, SessionSectionOrderService } from '../../browser/sessionSectionOrderService.js';

function createSession(id: string, isArchived = false, creatorSession?: URI): ISession {
	return {
		sessionId: id,
		resource: URI.parse(`session://${id}`),
		providerId: 'test',
		sessionType: 'test',
		harness: 'copilot',
		environment: 'local',
		application: constObservable({ id: 'vscode', label: 'VS Code' }),
		icon: Codicon.account,
		createdAt: new Date(),
		workspace: observableValue(`workspace-${id}`, undefined),
		createdBySession: constObservable(creatorSession ? { session: creatorSession } : undefined),
		title: observableValue(`title-${id}`, id),
		updatedAt: observableValue(`updatedAt-${id}`, new Date()),
		status: observableValue(`status-${id}`, SessionStatus.Completed),
		modelId: observableValue(`modelId-${id}`, undefined),
		mode: observableValue(`mode-${id}`, undefined),
		loading: observableValue(`loading-${id}`, false),
		isArchived: observableValue(`isArchived-${id}`, isArchived),
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
	let orderService: SessionSectionOrderService;
	let sessionsChangedEmitter: Emitter<ISessionsChangeEvent>;
	let willSendRequestEmitter: Emitter<ISession>;
	let sessionStartedEmitter: Emitter<ISession>;
	let sessionArchivedEmitter: Emitter<ISession>;
	let sessionUnarchivedEmitter: Emitter<ISession>;
	let sessionDeletedEmitter: Emitter<ISession>;
	let sessionReplacedEmitter: Emitter<{ readonly from: ISession; readonly to: ISession }>;
	let newDraftSessionReplacedEmitter: Emitter<{ readonly from: ISession; readonly to: ISession }>;
	let newSessionDiscardedEmitter: Emitter<ISession>;
	let instantiationService: TestInstantiationService;
	let sessions: ISession[];
	let inFlightSessions: ISession[];

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
		orderService = disposables.add(new SessionSectionOrderService(storageService));
		instantiationService.stub(ISessionSectionOrderService, orderService);
		sessionsChangedEmitter = disposables.add(new Emitter<ISessionsChangeEvent>());
		willSendRequestEmitter = disposables.add(new Emitter<ISession>());
		sessionStartedEmitter = disposables.add(new Emitter<ISession>());
		sessionArchivedEmitter = disposables.add(new Emitter<ISession>());
		sessionUnarchivedEmitter = disposables.add(new Emitter<ISession>());
		sessionDeletedEmitter = disposables.add(new Emitter<ISession>());
		sessionReplacedEmitter = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		newDraftSessionReplacedEmitter = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		newSessionDiscardedEmitter = disposables.add(new Emitter<ISession>());
		sessions = [];
		inFlightSessions = [];
		instantiationService.stub(ISessionsManagementService, {
			...mock<ISessionsManagementService>(),
			getSessions: () => sessions,
			getInFlightNewSessionRequests: () => inFlightSessions,
			getSession: resource => sessions.find(session => session.resource.toString() === resource.toString()),
			onDidChangeSessions: sessionsChangedEmitter.event,
			onWillSendRequest: willSendRequestEmitter.event,
			onDidStartSession: sessionStartedEmitter.event,
			onDidArchiveSession: sessionArchivedEmitter.event,
			onDidUnarchiveSession: sessionUnarchivedEmitter.event,
			onDidDeleteSession: sessionDeletedEmitter.event,
			onDidReplaceSession: sessionReplacedEmitter.event,
			onDidReplaceNewDraftSession: newDraftSessionReplacedEmitter.event,
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

	test('copies the creator group once when a created session is added', () => {
		const creator = createSession('creator');
		const createdSession = createSession('created', false, creator.resource);
		sessions = [creator, createdSession];
		const inherited = service.createGroup('Inherited', [creator.sessionId]);
		const userGroup = service.createGroup('User choice');

		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });
		const initialGroup = service.getGroupOfSession(createdSession.sessionId);
		service.addToGroup(createdSession.sessionId, userGroup.id);
		sessionsChangedEmitter.fire({ added: [], removed: [createdSession], changed: [] });
		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });

		assert.deepStrictEqual({
			initialGroup,
			afterUserMoveAndReadd: service.getGroupOfSession(createdSession.sessionId),
		}, {
			initialGroup: inherited.id,
			afterUserMoveAndReadd: userGroup.id,
		});
	});

	test('copies the creator group once when creation metadata arrives after add', () => {
		const creator = createSession('creator');
		const createdBySession = observableValue<{ readonly session: URI } | undefined>('createdBySession', undefined);
		const createdSession: ISession = { ...createSession('created'), createdBySession };
		sessions = [creator, createdSession];
		const inherited = service.createGroup('Inherited', [creator.sessionId]);

		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });
		createdBySession.set({ session: creator.resource }, undefined);
		sessionsChangedEmitter.fire({ added: [], removed: [], changed: [createdSession] });

		assert.strictEqual(service.getGroupOfSession(createdSession.sessionId), inherited.id);
	});

	test('preserves ungrouping that happens before creation metadata arrives', () => {
		const creator = createSession('creator');
		const createdBySession = observableValue<{ readonly session: URI } | undefined>('createdBySession', undefined);
		const createdSession: ISession = { ...createSession('created'), createdBySession };
		sessions = [creator, createdSession];
		const inherited = service.createGroup('Inherited', [creator.sessionId]);
		const temporary = service.createGroup('Temporary', [createdSession.sessionId]);

		service.removeFromGroup(createdSession.sessionId);
		createdBySession.set({ session: creator.resource }, undefined);
		sessionsChangedEmitter.fire({ added: [], removed: [], changed: [createdSession] });

		assert.deepStrictEqual({
			temporaryMembers: service.getSessionIdsInGroup(temporary.id),
			createdGroup: service.getGroupOfSession(createdSession.sessionId),
			creatorGroup: service.getGroupOfSession(creator.sessionId),
		}, {
			temporaryMembers: [],
			createdGroup: undefined,
			creatorGroup: inherited.id,
		});
	});

	test('copies the creator group for sessions that predate service construction', () => {
		const creator = createSession('creator');
		const createdSession = createSession('created', false, creator.resource);
		const inherited = service.createGroup('Inherited', [creator.sessionId]);
		sessions = [creator, createdSession];
		service.dispose();

		service = disposables.add(instantiationService.createInstance(SessionGroupsService));

		assert.strictEqual(service.getGroupOfSession(createdSession.sessionId), inherited.id);
	});

	test('inherits when the creator is grouped later', () => {
		const creator = createSession('creator');
		const createdSession = createSession('created', false, creator.resource);
		sessions = [creator, createdSession];

		const inherited = service.createGroup('Inherited', [creator.sessionId]);

		assert.strictEqual(service.getGroupOfSession(createdSession.sessionId), inherited.id);
	});

	test('inherits when the creator arrives after the created session', () => {
		const creator = createSession('creator');
		const createdSession = createSession('created', false, creator.resource);
		sessions = [createdSession];
		const inherited = service.createGroup('Inherited', [creator.sessionId]);
		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });

		sessions = [createdSession, creator];
		sessionsChangedEmitter.fire({ added: [creator], removed: [], changed: [] });

		assert.strictEqual(service.getGroupOfSession(createdSession.sessionId), inherited.id);
	});

	test('initializes reversed creation chains creator-first', () => {
		const root = createSession('root');
		const child = createSession('child', false, root.resource);
		const grandchild = createSession('grandchild', false, child.resource);
		sessions = [grandchild, child, root];

		const inherited = service.createGroup('Inherited', [root.sessionId]);

		assert.deepStrictEqual({
			child: service.getGroupOfSession(child.sessionId),
			grandchild: service.getGroupOfSession(grandchild.sessionId),
		}, {
			child: inherited.id,
			grandchild: inherited.id,
		});
	});

	test('batches inherited chain membership changes and is idempotent', () => {
		const root = createSession('root');
		const child = createSession('child', false, root.resource);
		const grandchild = createSession('grandchild', false, child.resource);
		const inherited = service.createGroup('Inherited', [root.sessionId]);
		sessions = [grandchild, child, root];
		const events: { groupsChanged: boolean; membershipChanged: string[] }[] = [];
		disposables.add(service.onDidChange(event => events.push({
			groupsChanged: event.groupsChanged,
			membershipChanged: [...event.membershipChanged].sort(),
		})));

		sessionsChangedEmitter.fire({ added: [grandchild, child, root], removed: [], changed: [] });
		sessionsChangedEmitter.fire({ added: [], removed: [], changed: [grandchild, child, root] });

		assert.deepStrictEqual({
			child: service.getGroupOfSession(child.sessionId),
			grandchild: service.getGroupOfSession(grandchild.sessionId),
			events,
		}, {
			child: inherited.id,
			grandchild: inherited.id,
			events: [{
				groupsChanged: false,
				membershipChanged: ['child', 'grandchild'],
			}],
		});
	});

	test('persists an explicitly ungrouped created session', () => {
		const creator = createSession('creator');
		const createdSession = createSession('created', false, creator.resource);
		sessions = [creator, createdSession];
		const inherited = service.createGroup('Inherited', [creator.sessionId]);
		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });
		assert.strictEqual(service.getGroupOfSession(createdSession.sessionId), inherited.id);

		service.removeFromGroup(createdSession.sessionId);
		service.dispose();
		service = disposables.add(instantiationService.createInstance(SessionGroupsService));

		assert.deepStrictEqual({
			group: service.getGroupOfSession(createdSession.sessionId),
			explicitlyUngrouped: service.isExplicitlyUngrouped(createdSession.sessionId),
		}, { group: undefined, explicitlyUngrouped: true });
	});

	test('explicit regrouping clears the persisted ungrouped preference', () => {
		const creator = createSession('creator');
		const createdSession = createSession('created', false, creator.resource);
		sessions = [creator, createdSession];
		const inherited = service.createGroup('Inherited', [creator.sessionId]);
		const selected = service.createGroup('Selected');
		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });

		service.removeFromGroup(createdSession.sessionId);
		service.addToGroup(createdSession.sessionId, selected.id);
		service.dispose();
		service = disposables.add(instantiationService.createInstance(SessionGroupsService));

		assert.deepStrictEqual({
			creatorGroup: service.getGroupOfSession(creator.sessionId),
			createdGroup: service.getGroupOfSession(createdSession.sessionId),
			explicitlyUngrouped: service.isExplicitlyUngrouped(createdSession.sessionId),
		}, {
			creatorGroup: inherited.id,
			createdGroup: selected.id,
			explicitlyUngrouped: false,
		});
	});

	test('deleting an inherited group leaves the created session explicitly ungrouped', () => {
		const creator = createSession('creator');
		const createdSession = createSession('created', false, creator.resource);
		sessions = [creator, createdSession];
		const inherited = service.createGroup('Inherited', [creator.sessionId]);
		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });

		service.deleteGroup(inherited.id);
		service.dispose();
		service = disposables.add(instantiationService.createInstance(SessionGroupsService));
		const replacement = service.createGroup('Replacement', [creator.sessionId]);

		assert.deepStrictEqual({
			creatorGroup: service.getGroupOfSession(creator.sessionId),
			createdGroup: service.getGroupOfSession(createdSession.sessionId),
		}, {
			creatorGroup: replacement.id,
			createdGroup: undefined,
		});
	});

	test('archiving an inherited session leaves it explicitly ungrouped', () => {
		const creator = createSession('creator');
		const createdSession = createSession('created', false, creator.resource);
		sessions = [creator, createdSession];
		const inherited = service.createGroup('Inherited', [creator.sessionId]);
		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });

		sessionArchivedEmitter.fire(createdSession);
		service.dispose();
		service = disposables.add(instantiationService.createInstance(SessionGroupsService));
		sessionsChangedEmitter.fire({ added: [], removed: [], changed: [createdSession] });

		assert.deepStrictEqual({
			creatorGroup: service.getGroupOfSession(creator.sessionId),
			createdGroup: service.getGroupOfSession(createdSession.sessionId),
		}, {
			creatorGroup: inherited.id,
			createdGroup: undefined,
		});
	});

	test('an initially archived created session does not inherit after restoration', () => {
		const creator = createSession('creator');
		const archived = createSession('created', true, creator.resource);
		sessions = [creator, archived];
		const inherited = service.createGroup('Inherited', [creator.sessionId]);
		sessionsChangedEmitter.fire({ added: [archived], removed: [], changed: [] });

		const restored = createSession('created', false, creator.resource);
		sessions = [creator, restored];
		service.dispose();
		service = disposables.add(instantiationService.createInstance(SessionGroupsService));

		assert.deepStrictEqual({
			creatorGroup: service.getGroupOfSession(creator.sessionId),
			restoredGroup: service.getGroupOfSession(restored.sessionId),
		}, {
			creatorGroup: inherited.id,
			restoredGroup: undefined,
		});
	});

	test('deletion clears a persisted ungrouped preference', () => {
		const creator = createSession('creator');
		const createdSession = createSession('created', false, creator.resource);
		sessions = [creator, createdSession];
		const inherited = service.createGroup('Inherited', [creator.sessionId]);
		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });
		service.removeFromGroup(createdSession.sessionId);

		sessionDeletedEmitter.fire(createdSession);
		const replacement = createSession('created', false, creator.resource);
		sessions = [creator, replacement];
		service.dispose();
		service = disposables.add(instantiationService.createInstance(SessionGroupsService));

		assert.strictEqual(service.getGroupOfSession(replacement.sessionId), inherited.id);
	});

	test('an ungrouped preference survives temporary provider eviction', () => {
		const creator = createSession('creator');
		const createdSession = createSession('created', false, creator.resource);
		sessions = [creator, createdSession];
		service.createGroup('Inherited', [creator.sessionId]);
		const temporary = service.createGroup('Temporary', [createdSession.sessionId]);
		service.removeFromGroup(createdSession.sessionId);

		sessions = [creator];
		sessionsChangedEmitter.fire({ added: [], removed: [createdSession], changed: [] });
		sessions = [creator, createdSession];
		sessionsChangedEmitter.fire({ added: [createdSession], removed: [], changed: [] });

		assert.deepStrictEqual({
			createdGroup: service.getGroupOfSession(createdSession.sessionId),
			temporaryMembers: service.getSessionIdsInGroup(temporary.id),
		}, {
			createdGroup: undefined,
			temporaryMembers: [],
		});
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

	test('membership is cleaned up when a session is deleted', () => {
		const a = service.createGroup('A', ['s1', 's2']);
		const session = createSession('s1');
		sessionDeletedEmitter.fire(session);

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

	test('membership survives a session being evicted from the provider list', () => {
		const a = service.createGroup('A', ['s1', 's2']);
		const session = createSession('s1');

		// An agent that cannot answer `listSessions` yet reports no sessions,
		// so the list evicts them until the next refresh. That must not drop
		// the user's grouping.
		sessionsChangedEmitter.fire({ added: [], removed: [session], changed: [] });

		assert.deepStrictEqual({
			membership: service.getGroupOfSession('s1'),
			remainingMembers: service.getSessionIdsInGroup(a.id).sort(),
		}, {
			membership: a.id,
			remainingMembers: ['s1', 's2'],
		});
	});

	test('archiving the last member leaves an empty group', () => {
		const a = service.createGroup('A', ['s1']);

		sessionArchivedEmitter.fire(createSession('s1'));

		assert.deepStrictEqual({
			archivedMembership: service.getGroupOfSession('s1'),
			groupName: service.getGroup(a.id)?.name,
			remainingMembers: service.getSessionIdsInGroup(a.id),
		}, {
			archivedMembership: undefined,
			groupName: 'A',
			remainingMembers: [],
		});
	});

	test('restoring an archived session does not restore its group membership', () => {
		const a = service.createGroup('A', ['s1']);
		const session = createSession('s1');

		sessionArchivedEmitter.fire(session);
		sessionUnarchivedEmitter.fire(session);

		assert.deepStrictEqual({
			membership: service.getGroupOfSession('s1'),
			remainingMembers: service.getSessionIdsInGroup(a.id),
		}, {
			membership: undefined,
			remainingMembers: [],
		});
	});

	test('membership is cleaned up when a provider reports an archived session', () => {
		const a = service.createGroup('A', ['s1', 's2']);
		const session = createSession('s1', true);

		sessionsChangedEmitter.fire({ added: [], removed: [], changed: [session] });

		assert.deepStrictEqual({
			archivedMembership: service.getGroupOfSession('s1'),
			remainingMembers: service.getSessionIdsInGroup(a.id),
		}, {
			archivedMembership: undefined,
			remainingMembers: ['s2'],
		});
	});

	test('membership is cleaned up when a provider adds an archived session', () => {
		const a = service.createGroup('A', ['s1', 's2']);
		const session = createSession('s1', true);

		sessionsChangedEmitter.fire({ added: [session], removed: [], changed: [] });

		assert.deepStrictEqual({
			archivedMembership: service.getGroupOfSession('s1'),
			remainingMembers: service.getSessionIdsInGroup(a.id),
		}, {
			archivedMembership: undefined,
			remainingMembers: ['s2'],
		});
	});

	test('persisted archived membership is cleaned up when the service loads', () => {
		const a = service.createGroup('A', ['s1', 's2']);
		sessions = [createSession('s1', true), createSession('s2')];

		const reloaded = disposables.add(instantiationService.createInstance(SessionGroupsService));

		assert.deepStrictEqual({
			archivedMembership: reloaded.getGroupOfSession('s1'),
			remainingMembers: reloaded.getSessionIdsInGroup(a.id),
		}, {
			archivedMembership: undefined,
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

	test('loads pre-feature group state without explicit ungrouped data', () => {
		storageService.store('sessionsListControl.groups', JSON.stringify({
			groups: [{ id: 'legacy-group', name: 'Legacy', createdAt: 1 }],
			membership: { s1: 'legacy-group' },
		}), StorageScope.PROFILE, StorageTarget.USER);

		service.dispose();
		service = disposables.add(instantiationService.createInstance(SessionGroupsService));

		assert.deepStrictEqual({
			group: service.getGroup('legacy-group')?.name,
			membership: service.getGroupOfSession('s1'),
		}, {
			group: 'Legacy',
			membership: 'legacy-group',
		});
	});

	/** Each group's name mapped to its parent's name, or `null` for a top-level group. */
	function describeNesting(groupsService: SessionGroupsService): Record<string, string | null> {
		return Object.fromEntries(groupsService.getGroups().map(group => [group.name, group.parentId === undefined ? null : groupsService.getGroup(group.parentId)?.name ?? '(missing)']));
	}

	test('nests groups at any depth, never in themselves or their subgroups, and persists the nesting', () => {
		const release = service.createGroup('Release');
		const hotfixes = service.createGroup('Hotfixes', [], release.id);
		const urgent = service.createGroup('Urgent', [], hotfixes.id);
		service.createGroup('Unknown parent', [], 'missing');
		const triage = service.createGroup('Triage');

		service.moveGroup(release.id, urgent.id);
		service.moveGroup(hotfixes.id, hotfixes.id);
		service.moveGroup(triage.id, urgent.id);
		service.moveGroup(hotfixes.id, undefined);
		const reloaded = disposables.add(instantiationService.createInstance(SessionGroupsService));

		assert.deepStrictEqual({ nesting: describeNesting(service), reloaded: describeNesting(reloaded) }, {
			nesting: { 'Unknown parent': null, Release: null, Hotfixes: null, Urgent: 'Hotfixes', Triage: 'Urgent' },
			reloaded: { 'Unknown parent': null, Release: null, Hotfixes: null, Urgent: 'Hotfixes', Triage: 'Urgent' },
		});
	});

	/** Replaces the service with one that loads the given groups. */
	function loadGroups(groups: readonly { readonly id: string; readonly name: string; readonly createdAt: number; readonly parentId?: string }[]): void {
		storageService.store('sessionsListControl.groups', JSON.stringify({ groups, membership: {} }), StorageScope.PROFILE, StorageTarget.USER);
		service.dispose();
		service = disposables.add(instantiationService.createInstance(SessionGroupsService));
	}

	/** The group names in display order, each subgroup indented under its parent. */
	function outline(groupsService: SessionGroupsService, parentId?: string, indent = ''): string[] {
		return groupsService.getTree().getSubgroups(parentId).flatMap(group => [`${indent}${group.name}`, ...outline(groupsService, group.id, `${indent}  `)]);
	}

	test('places a moved group next to a sibling or first among its new siblings, without reordering other groups, and persists the order', () => {
		loadGroups([
			{ id: 'release', name: 'Release', createdAt: 1 },
			{ id: 'docs', name: 'Docs', createdAt: 2, parentId: 'release' },
			{ id: 'hotfixes', name: 'Hotfixes', createdAt: 3, parentId: 'release' },
			{ id: 'urgent', name: 'Urgent', createdAt: 4, parentId: 'release' },
			{ id: 'other', name: 'Other', createdAt: 5 },
			{ id: 'triage', name: 'Triage', createdAt: 6 },
		]);
		let events = 0;
		disposables.add(service.onDidChange(e => events += e.groupsChanged ? 1 : 0));
		const byDefault = outline(service);

		service.moveGroup('docs', 'release', { siblingId: 'urgent', position: 'before' });
		service.moveGroup('docs', 'release', { siblingId: 'urgent', position: 'before' });
		// The sessions list moves Release to the top of its top-level headers.
		const topLevelIds = service.getTree().getSubgroups(undefined).map(group => getSessionGroupSectionId(group.id));
		orderService.reorder(topLevelIds, getSessionGroupSectionId('release'), getSessionGroupSectionId('triage'), 'before');
		service.moveGroup('triage', 'release', { siblingId: 'urgent', position: 'after' });
		service.moveGroup('hotfixes', 'urgent');
		const reloaded = disposables.add(instantiationService.createInstance(SessionGroupsService));

		assert.deepStrictEqual({ byDefault, moved: outline(service), events, reloaded: outline(reloaded) }, {
			byDefault: ['Triage', 'Other', 'Release', '  Urgent', '  Hotfixes', '  Docs'],
			moved: ['Release', '  Docs', '  Urgent', '    Hotfixes', '  Triage', 'Other'],
			events: 3,
			reloaded: ['Release', '  Docs', '  Urgent', '    Hotfixes', '  Triage', 'Other'],
		});
	});

	test('restoring deleted groups restores their order among their siblings', () => {
		loadGroups([
			{ id: 'release', name: 'Release', createdAt: 1 },
			{ id: 'docs', name: 'Docs', createdAt: 2, parentId: 'release' },
			{ id: 'hotfixes', name: 'Hotfixes', createdAt: 3, parentId: 'release' },
			{ id: 'urgent', name: 'Urgent', createdAt: 4, parentId: 'release' },
			{ id: 'a', name: 'A', createdAt: 5, parentId: 'urgent' },
			{ id: 'b', name: 'B', createdAt: 6, parentId: 'urgent' },
		]);
		service.moveGroup('docs', 'release', { siblingId: 'urgent', position: 'after' });
		service.moveGroup('a', 'urgent', { siblingId: 'b', position: 'before' });
		const beforeDelete = outline(service);

		const deleted = service.deleteGroup('urgent')!;
		// Since the deletion, Hotfixes moved above Docs.
		service.moveGroup('hotfixes', 'release', { siblingId: 'docs', position: 'before' });
		service.restoreGroups(deleted);

		assert.deepStrictEqual({ beforeDelete, restored: outline(service) }, {
			beforeDelete: ['Release', '  Urgent', '    A', '    B', '  Docs', '  Hotfixes'],
			restored: ['Release', '  Urgent', '    A', '    B', '  Hotfixes', '  Docs'],
		});
	});

	test('deleting a group deletes its subgroups, and restoring them restores the memberships that are still free', () => {
		sessions = ['s1', 's2', 's3', 's4'].map(id => createSession(id));
		const release = service.createGroup('Release', ['s1']);
		const hotfixes = service.createGroup('Hotfixes', ['s2', 's3'], release.id);
		service.createGroup('Urgent', ['s4'], hotfixes.id);
		const other = service.createGroup('Other');
		const membership = () => Object.fromEntries(sessions.map(session => [session.sessionId, service.getGroup(service.getGroupOfSession(session.sessionId) ?? '')?.name ?? null]));

		const deleted = service.deleteGroup(release.id)!;
		const afterDelete = { nesting: describeNesting(service), membership: membership() };
		// Since the deletion, s2 joined another group and s3 was marked done.
		service.addToGroup('s2', other.id);
		sessions[2] = createSession('s3', true);
		service.restoreGroups(deleted);

		assert.deepStrictEqual({
			deleted: deleted.groups.map(group => group.name),
			afterDelete,
			restored: { nesting: describeNesting(service), membership: membership() },
		}, {
			deleted: ['Release', 'Hotfixes', 'Urgent'],
			afterDelete: { nesting: { Other: null }, membership: { s1: null, s2: null, s3: null, s4: null } },
			restored: {
				nesting: { Other: null, Urgent: 'Hotfixes', Hotfixes: 'Release', Release: null },
				membership: { s1: 'Release', s2: 'Other', s3: null, s4: 'Urgent' },
			},
		});
	});

	test('a restored group whose parent was deleted since becomes a top-level group', () => {
		const release = service.createGroup('Release');
		const hotfixes = service.createGroup('Hotfixes', [], release.id);

		const deleted = service.deleteGroup(hotfixes.id)!;
		service.deleteGroup(release.id);
		service.restoreGroups(deleted);

		assert.deepStrictEqual(describeNesting(service), { Hotfixes: null });
	});

	test('loading makes groups whose stored parent is missing or loops back top-level groups', () => {
		storageService.store('sessionsListControl.groups', JSON.stringify({
			groups: [
				{ id: 'orphan', name: 'Orphan', createdAt: 1, parentId: 'missing' },
				{ id: 'a', name: 'A', createdAt: 2, parentId: 'b' },
				{ id: 'b', name: 'B', createdAt: 3, parentId: 'a' },
				{ id: 'self', name: 'Self', createdAt: 4, parentId: 'self' },
				{ id: 'child', name: 'Child', createdAt: 5, parentId: 'a' },
			],
			membership: {},
		}), StorageScope.PROFILE, StorageTarget.USER);

		service.dispose();
		service = disposables.add(instantiationService.createInstance(SessionGroupsService));

		assert.deepStrictEqual(describeNesting(service), { Child: 'A', Self: null, B: null, A: 'B', Orphan: null });
	});

	test('the group tree reads a hierarchy whose parents loop back without looping', () => {
		const tree = new SessionGroupTree([
			{ id: 'a', name: 'A', createdAt: 1, parentId: 'b' },
			{ id: 'b', name: 'B', createdAt: 2, parentId: 'a' },
			{ id: 'top', name: 'Top', createdAt: 3 },
		]);

		assert.deepStrictEqual({
			topLevel: tree.getSubgroups(undefined).map(group => group.id),
			path: tree.getPath('a').map(group => group.id),
			subtree: tree.getSubtree('a').map(group => group.id),
		}, {
			topLevel: ['top'],
			path: ['b', 'a'],
			subtree: ['a', 'b'],
		});
	});

	test('pending new session group binds the next started session', () => {
		const a = service.createGroup('A');
		service.setPendingNewSessionGroup(a.id);

		sendNewSession('started');

		assert.strictEqual(service.getGroupOfSession('started'), a.id);
		assert.deepStrictEqual(service.getSessionIdsInGroup(a.id), ['started']);
	});

	test('pending group applies while a provisional new session is published', () => {
		const a = service.createGroup('A');
		const draft = createSession('draft');
		const committed = createSession('committed');
		service.setPendingNewSessionGroup(a.id);
		sessions = [draft];
		inFlightSessions = [draft];

		sessionsChangedEmitter.fire({ added: [draft], removed: [], changed: [] });

		assert.strictEqual(service.getGroupOfSession(draft.sessionId), a.id);
		assert.deepStrictEqual(service.getSessionIdsInGroup(a.id), [draft.sessionId]);

		newDraftSessionReplacedEmitter.fire({ from: draft, to: committed });
		sessions = [committed];
		sessionsChangedEmitter.fire({ added: [], removed: [draft], changed: [committed] });
		willSendRequestEmitter.fire(committed);
		sessionStartedEmitter.fire(committed);

		assert.deepStrictEqual({
			draftGroup: service.getGroupOfSession(draft.sessionId),
			committedGroup: service.getGroupOfSession(committed.sessionId),
			groupMembers: service.getSessionIdsInGroup(a.id),
		}, {
			draftGroup: undefined,
			committedGroup: a.id,
			groupMembers: [committed.sessionId],
		});
	});

	test('failed provisional new session clears transient group placement', () => {
		const a = service.createGroup('A');
		const draft = createSession('draft');
		service.setPendingNewSessionGroup(a.id);
		sessions = [draft];
		inFlightSessions = [draft];
		sessionsChangedEmitter.fire({ added: [draft], removed: [], changed: [] });

		sessions = [];
		inFlightSessions = [];
		sessionsChangedEmitter.fire({ added: [], removed: [], changed: [] });

		assert.strictEqual(service.getGroupOfSession(draft.sessionId), undefined);
		assert.deepStrictEqual(service.getSessionIdsInGroup(a.id), []);
	});

	test('moving a provisional session overrides its pending group', () => {
		const a = service.createGroup('A');
		const b = service.createGroup('B');
		const draft = createSession('draft');
		service.setPendingNewSessionGroup(a.id);
		sessions = [draft];
		inFlightSessions = [draft];
		sessionsChangedEmitter.fire({ added: [draft], removed: [], changed: [] });

		service.addToGroup(draft.sessionId, b.id);
		sessionStartedEmitter.fire(draft);

		assert.deepStrictEqual({
			group: service.getGroupOfSession(draft.sessionId),
			aMembers: service.getSessionIdsInGroup(a.id),
			bMembers: service.getSessionIdsInGroup(b.id),
		}, {
			group: b.id,
			aMembers: [],
			bMembers: [draft.sessionId],
		});
	});

	test('removing a provisional session prevents its pending group from returning', () => {
		const a = service.createGroup('A');
		const draft = createSession('draft');
		service.setPendingNewSessionGroup(a.id);
		sessions = [draft];
		inFlightSessions = [draft];
		sessionsChangedEmitter.fire({ added: [draft], removed: [], changed: [] });

		service.removeFromGroup(draft.sessionId);
		sessionStartedEmitter.fire(draft);

		assert.strictEqual(service.getGroupOfSession(draft.sessionId), undefined);
		assert.deepStrictEqual(service.getSessionIdsInGroup(a.id), []);
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
