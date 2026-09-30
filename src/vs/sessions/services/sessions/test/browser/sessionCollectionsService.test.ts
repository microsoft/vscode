/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { SessionPaletteColor, SessionTextColorMode } from '../../common/sessionColors.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus } from '../../common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../common/sessionsManagement.js';
import { ISessionCollectionsService, SessionCollectionsService } from '../../browser/sessionCollectionsService.js';
import { ISessionGroupsService, SessionGroupsService } from '../../browser/sessionGroupsService.js';
import { SessionSectionColorsService } from '../../browser/sessionSectionColorsService.js';

function createWorkspace(label: string): ISessionWorkspace {
	return { uri: URI.file(`/repos/${label}`), label, icon: Codicon.folder, folders: [], requiresWorkspaceTrust: false, isVirtualWorkspace: false };
}

function createSession(id: string, options?: { readonly workspace?: string; readonly creator?: URI; readonly status?: SessionStatus }): ISession {
	return {
		sessionId: id,
		resource: URI.parse(`session://${id}`),
		providerId: 'test',
		sessionType: 'test',
		icon: Codicon.account,
		createdAt: new Date(),
		workspace: observableValue(`workspace-${id}`, options?.workspace ? createWorkspace(options.workspace) : undefined),
		createdBySession: constObservable(options?.creator ? { session: options.creator } : undefined),
		title: observableValue(`title-${id}`, id),
		updatedAt: observableValue(`updatedAt-${id}`, new Date()),
		status: observableValue(`status-${id}`, options?.status ?? SessionStatus.Completed),
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

interface ITestContext {
	readonly storageService: InMemoryStorageService;
	readonly sessions: ISession[];
	readonly sessionsChanged: Emitter<ISessionsChangeEvent>;
	readonly willSendRequest: Emitter<ISession>;
	readonly sessionStarted: Emitter<ISession>;
	readonly sessionArchived: Emitter<ISession>;
	readonly sessionDeleted: Emitter<ISession>;
	readonly newSession: IObservable<ISession | undefined>;
}

function createContext(disposables: Pick<DisposableStore, 'add'>, storageService = disposables.add(new InMemoryStorageService())): ITestContext {
	return {
		storageService,
		sessions: [],
		sessionsChanged: disposables.add(new Emitter<ISessionsChangeEvent>()),
		willSendRequest: disposables.add(new Emitter<ISession>()),
		sessionStarted: disposables.add(new Emitter<ISession>()),
		sessionArchived: disposables.add(new Emitter<ISession>()),
		sessionDeleted: disposables.add(new Emitter<ISession>()),
		newSession: observableValue<ISession | undefined>('newSession', undefined),
	};
}

/** Creates the three list-owned services over a shared management stub and storage. */
function createServices(disposables: Pick<DisposableStore, 'add'>, context: ITestContext) {
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.stub(IStorageService, context.storageService);
	instantiationService.stub(ISessionsManagementService, {
		...mock<ISessionsManagementService>(),
		getSessions: () => context.sessions,
		getSession: resource => context.sessions.find(session => session.resource.toString() === resource.toString()),
		newSession: context.newSession,
		onDidChangeSessions: context.sessionsChanged.event,
		onWillSendRequest: context.willSendRequest.event,
		onDidStartSession: context.sessionStarted.event,
		onDidArchiveSession: context.sessionArchived.event,
		onDidUnarchiveSession: new Emitter<ISession>().event,
		onDidDeleteSession: context.sessionDeleted.event,
		onDidReplaceSession: new Emitter<{ readonly from: ISession; readonly to: ISession }>().event,
		onDidDiscardNewSession: new Emitter<ISession>().event,
	});
	const groups = disposables.add(instantiationService.createInstance(SessionGroupsService));
	instantiationService.stub(ISessionGroupsService, groups);
	const colors = disposables.add(instantiationService.createInstance(SessionSectionColorsService));
	const collections = disposables.add(instantiationService.createInstance(SessionCollectionsService));
	instantiationService.stub(ISessionCollectionsService, collections);
	return { groups, colors, collections };
}

suite('SessionSectionColorsService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('new groups get the next unused color; deleting a group drops its color', () => {
		const { groups, colors } = createServices(disposables, createContext(disposables));
		const a = groups.createGroup('A');
		const b = groups.createGroup('B');
		colors.setColor(`group:${b.id}`, { color: SessionPaletteColor.Yellow, textColor: SessionTextColorMode.Dark });
		const c = groups.createGroup('C');
		colors.setColor(`group:${c.id}`, undefined);
		groups.deleteGroup(a.id);

		assert.deepStrictEqual([...colors.colors.get()], [
			[`group:${b.id}`, { color: SessionPaletteColor.Yellow, textColor: SessionTextColorMode.Dark }],
			[`group:${c.id}`, { color: SessionPaletteColor.Red, textColor: SessionTextColorMode.Auto }],
		]);
	});

	test('groups created before colors existed are colored once, in creation order, and persisted', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new DisposableStore());
		const legacy = createServices(store, createContext(store, storageService));
		const older = legacy.groups.createGroup('Older');
		const newer = legacy.groups.createGroup('Newer');
		store.clear();
		// Simulate storage that predates colors.
		storageService.remove('sessionsListControl.sectionColors', StorageScope.PROFILE);

		const first = createServices(store, createContext(store, storageService));
		const firstColors = [...first.colors.colors.get()];
		store.clear();
		const reloaded = createServices(disposables, createContext(disposables, storageService));

		// Groups created in the same millisecond are ordered by id, so compare the assigned set.
		assert.deepStrictEqual({
			groups: firstColors.map(([sectionId]) => sectionId).sort(),
			colors: firstColors.map(([, color]) => `${color.color}/${color.textColor}`).sort(),
			reloaded: [...reloaded.colors.colors.get()],
		}, {
			groups: [`group:${older.id}`, `group:${newer.id}`].sort(),
			colors: ['blue/auto', 'red/auto'],
			reloaded: firstColors,
		});
	});

	test('workspace and built-in sections are uncolored until colored, and only colorable sections accept a color', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new DisposableStore());
		const { colors } = createServices(store, createContext(store, storageService));
		const initial = ['workspace:vscode', 'pinned', 'quickchats'].map(id => colors.getColor(id));
		colors.setColor('workspace:vscode', { color: '#ABC', textColor: SessionTextColorMode.Light });
		colors.setColor('pinned', { color: SessionPaletteColor.Green, textColor: SessionTextColorMode.Auto });
		colors.setColor('quickchats', { color: SessionPaletteColor.Pink, textColor: SessionTextColorMode.Auto });
		colors.setColor('quickchats', undefined);
		colors.setColor('archived', { color: SessionPaletteColor.Red, textColor: SessionTextColorMode.Auto });
		colors.setColor('workspace:other', { color: '#nothex' as `#${string}`, textColor: SessionTextColorMode.Auto });
		store.clear();
		const reloaded = createServices(disposables, createContext(disposables, storageService));

		assert.deepStrictEqual({ initial, reloaded: [...reloaded.colors.colors.get()] }, {
			initial: [undefined, undefined, undefined],
			reloaded: [
				['workspace:vscode', { color: '#aabbcc', textColor: SessionTextColorMode.Light }],
				['pinned', { color: SessionPaletteColor.Green, textColor: SessionTextColorMode.Auto }],
			],
		});
	});
});

suite('SessionCollectionsService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('starts with one default collection that owns everything and stores nothing', () => {
		const context = createContext(disposables);
		const session = createSession('s1', { workspace: 'vscode' });
		context.sessions.push(session);
		const { groups, collections } = createServices(disposables, context);
		const group = groups.createGroup('Group', [session.sessionId]);

		assert.deepStrictEqual({
			collections: collections.collections.get().map(c => ({ id: c.id, name: c.name, icon: c.icon, color: c.color })),
			active: collections.activeCollectionId.get(),
			session: collections.getSessionCollection(session),
			group: collections.getGroupCollection(group.id),
			stored: context.storageService.get('sessionsListControl.collections', StorageScope.PROFILE),
		}, {
			collections: [{ id: 'default', name: 'General', icon: 'layers', color: SessionPaletteColor.Blue }],
			active: 'default',
			session: 'default',
			group: 'default',
			stored: undefined,
		});
	});

	test('resolves group, then explicit, then creator, then workspace, then default', () => {
		const context = createContext(disposables);
		const grouped = createSession('grouped', { workspace: 'vscode' });
		const explicit = createSession('explicit', { workspace: 'vscode' });
		const creator = createSession('creator');
		const created = createSession('created', { workspace: 'vscode', creator: creator.resource });
		const workspace = createSession('workspace', { workspace: 'vscode' });
		const quickChat = createSession('quickChat');
		context.sessions.push(grouped, explicit, creator, created, workspace, quickChat);
		const { groups, collections } = createServices(disposables, context);
		const work = collections.createCollection({ name: 'Work' });
		const home = collections.createCollection({ name: 'Home' });
		const misc = collections.createCollection({ name: 'Misc' });

		collections.moveWorkspaceToCollection('workspace:vscode', work.id, []);
		collections.moveSessionsToCollection([creator], home.id);
		collections.moveSessionsToCollection([explicit], misc.id);
		collections.setActiveCollection(misc.id);
		groups.createGroup('Misc group', [grouped.sessionId]);

		assert.deepStrictEqual([grouped, explicit, creator, created, workspace, quickChat].map(session => collections.getCollection(collections.getSessionCollection(session))?.name), [
			'Misc', 'Misc', 'Home', 'Home', 'Work', 'General',
		]);
	});

	test('sessions leaving a group stay in its collection', () => {
		const context = createContext(disposables);
		const [a, b, c] = ['a', 'b', 'c'].map(id => createSession(id, { workspace: 'vscode' }));
		context.sessions.push(a, b, c);
		const { groups, collections } = createServices(disposables, context);
		const work = collections.createCollection({ name: 'Work' });
		collections.setActiveCollection(work.id);
		const group = groups.createGroup('Group', [a.sessionId, b.sessionId]);
		const other = groups.createGroup('Other', [c.sessionId]);

		groups.removeFromGroup(a.sessionId);
		context.sessionArchived.fire(c);
		groups.deleteGroup(group.id);

		assert.deepStrictEqual({
			a: collections.getSessionCollection(a),
			b: collections.getSessionCollection(b),
			c: collections.getSessionCollection(c),
			otherGroup: collections.getGroupCollection(other.id),
		}, { a: work.id, b: work.id, c: work.id, otherGroup: work.id });
	});

	test('moving sessions out of a group in another collection ungroups them, and undo restores both', () => {
		const context = createContext(disposables);
		const session = createSession('s1', { workspace: 'vscode' });
		context.sessions.push(session);
		const { groups, collections } = createServices(disposables, context);
		const work = collections.createCollection({ name: 'Work' });
		const group = groups.createGroup('Group', [session.sessionId]);

		const undo = collections.moveSessionsToCollection([session], work.id);
		const moved = { collection: collections.getSessionCollection(session), group: groups.getGroupOfSession(session.sessionId) };
		undo();

		assert.deepStrictEqual({ moved, undone: { collection: collections.getSessionCollection(session), group: groups.getGroupOfSession(session.sessionId) } }, {
			moved: { collection: work.id, group: undefined },
			undone: { collection: 'default', group: group.id },
		});
	});

	test('moving a group or a workspace moves their sessions; undo restores them', () => {
		const context = createContext(disposables);
		const grouped = createSession('grouped', { workspace: 'vscode' });
		const visible = createSession('visible', { workspace: 'vscode' });
		const elsewhere = createSession('elsewhere', { workspace: 'vscode' });
		context.sessions.push(grouped, visible, elsewhere);
		const { groups, collections } = createServices(disposables, context);
		const work = collections.createCollection({ name: 'Work' });
		const home = collections.createCollection({ name: 'Home' });
		const group = groups.createGroup('Group', [grouped.sessionId]);
		collections.moveSessionsToCollection([elsewhere], home.id);

		const undoGroup = collections.moveGroupToCollection(group.id, work.id);
		const undoWorkspace = collections.moveWorkspaceToCollection('workspace:vscode', work.id, [visible]);
		const later = createSession('later', { workspace: 'vscode' });
		context.sessions.push(later);
		const moved = [grouped, visible, elsewhere, later].map(s => collections.getSessionCollection(s));
		undoWorkspace();
		undoGroup();

		assert.deepStrictEqual({ moved, undone: [grouped, visible, elsewhere, later].map(s => collections.getSessionCollection(s)) }, {
			moved: [work.id, work.id, home.id, work.id],
			undone: ['default', 'default', home.id, 'default'],
		});
	});

	test('a new session joins the collection that was active when it was sent', () => {
		const context = createContext(disposables);
		const { collections } = createServices(disposables, context);
		const work = collections.createCollection({ name: 'Work' });
		collections.setActiveCollection(work.id);
		const draft = createSession('draft', { workspace: 'vscode', status: SessionStatus.Untitled });

		context.willSendRequest.fire(draft);
		collections.setActiveCollection('default');
		context.sessions.push(draft);
		context.sessionStarted.fire(draft);

		assert.strictEqual(collections.getSessionCollection(draft), work.id);
	});

	test('assignments survive transient catalog removal and are dropped on deletion', () => {
		const context = createContext(disposables);
		const session = createSession('s1');
		context.sessions.push(session);
		const { collections } = createServices(disposables, context);
		const work = collections.createCollection({ name: 'Work' });
		collections.moveSessionsToCollection([session], work.id);
		collections.setLastSession(work.id, session.resource);

		context.sessionsChanged.fire({ added: [], removed: [session], changed: [] });
		const afterRemoval = { collection: collections.getSessionCollection(session), last: collections.getLastSession(work.id)?.toString() };
		context.sessionDeleted.fire(session);

		assert.deepStrictEqual({ afterRemoval, afterDeletion: { collection: collections.getSessionCollection(session), last: collections.getLastSession(work.id)?.toString() } }, {
			afterRemoval: { collection: work.id, last: session.resource.toString() },
			afterDeletion: { collection: 'default', last: undefined },
		});
	});

	test('deleting a collection moves its contents; undo restores them', () => {
		const context = createContext(disposables);
		const session = createSession('s1', { workspace: 'vscode' });
		context.sessions.push(session);
		const { groups, collections } = createServices(disposables, context);
		const work = collections.createCollection({ name: 'Work' });
		collections.setActiveCollection(work.id);
		const group = groups.createGroup('Group');
		collections.moveWorkspaceToCollection('workspace:vscode', work.id, [session]);

		const undo = collections.deleteCollection(work.id, 'default');
		const deleted = { names: collections.collections.get().map(c => c.name), active: collections.activeCollectionId.get(), group: collections.getGroupCollection(group.id), session: collections.getSessionCollection(session) };
		undo?.();

		assert.deepStrictEqual({ deleted, undone: { names: collections.collections.get().map(c => c.name), active: collections.activeCollectionId.get(), group: collections.getGroupCollection(group.id), session: collections.getSessionCollection(session) } }, {
			deleted: { names: ['General'], active: 'default', group: 'default', session: 'default' },
			undone: { names: ['General', 'Work'], active: work.id, group: work.id, session: work.id },
		});
	});

	test('collections, the active collection and assignments persist', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new DisposableStore());
		const context = createContext(store, storageService);
		const session = createSession('s1', { workspace: 'vscode' });
		context.sessions.push(session);
		const first = createServices(store, context);
		const work = first.collections.createCollection({ name: 'Work', icon: 'rocket', color: SessionPaletteColor.Orange });
		first.collections.updateCollection(work.id, { name: 'Engineering' });
		first.collections.moveCollection(work.id, 0);
		first.collections.moveSessionsToCollection([session], work.id);
		first.collections.setActiveCollection(work.id);
		store.clear();

		const reloadedContext = createContext(disposables, storageService);
		reloadedContext.sessions.push(session);
		const { collections } = createServices(disposables, reloadedContext);

		assert.deepStrictEqual({
			collections: collections.collections.get().map(c => `${c.name}/${c.icon}/${c.color}`),
			active: collections.activeCollectionId.get(),
			session: collections.getSessionCollection(session),
		}, {
			collections: ['Engineering/rocket/orange', 'General/layers/blue'],
			active: work.id,
			session: work.id,
		});
	});
});
