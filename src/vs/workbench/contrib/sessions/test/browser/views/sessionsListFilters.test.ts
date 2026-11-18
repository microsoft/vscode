/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { autorun, constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { getSessionApplication } from '../../../../../services/sessions/common/sessionApplication.js';
import { ISession, ISessionEnvironment, ISessionWorkspace } from '../../../../../services/sessions/common/session.js';
import { buildTestSession, buildTestWorkspace } from '../../common/testSessionBuilder.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from '../../../../../../platform/workspace/common/workspace.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { AGENT_HOST_SCHEME } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { UriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { getInboxWorkspaceFilter, getInboxWorkspaceOptions, getSessionFilterOptions, getWorktreeFilterKeys, listsQuickChatsIn, sessionFilterKey, SessionsListFilters, SessionsWorktreeOpener } from '../../../browser/views/sessionsListFilters.js';
import { AutomationSessionsListMode, SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING } from '../../../common/sessionConfig.js';

suite('SessionsListFilters', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const listAll = () => true;

	function createFilters(storage = store.add(new InMemoryStorageService()), configurationService: IConfigurationService = new TestConfigurationService()): SessionsListFilters {
		return store.add(new SessionsListFilters(storage, store.add(new NullLogService()), configurationService, upcastPartial<IUriIdentityService>({ extUri: extUriBiasedIgnorePathCase })));
	}

	test('tells apart worktree folders whose paths differ only in case where their file system does, such as an agent host\'s', () => {
		// The URI identity of the window, with an agent host's file system, which is case sensitive
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(AGENT_HOST_SCHEME, store.add(new InMemoryFileSystemProvider())));
		const uriIdentityService = store.add(new UriIdentityService(fileService));
		const inFolder = (id: string, path: string): ISession => {
			const root = URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'host', path });
			const workspace: ISessionWorkspace = {
				uri: root, label: id, icon: Codicon.folder, requiresWorkspaceTrust: false, isVirtualWorkspace: false,
				folders: [{ root, workingDirectory: root, name: id, description: undefined, gitRepository: undefined }],
			};
			return { ...buildTestSession({ id, title: id }).session, workspace: constObservable(workspace) };
		};
		const sessions = [inFolder('main', '/work/repo'), inFolder('upper', '/work/repo.worktrees/Fix'), inFolder('lower', '/work/repo.worktrees/fix')];
		const filters = store.add(new SessionsListFilters(store.add(new InMemoryStorageService()), store.add(new NullLogService()), new TestConfigurationService(), uriIdentityService));
		const available = getWorktreeFilterKeys(sessions, listAll, uriIdentityService.extUri);
		const options = getSessionFilterOptions(sessions, [], listAll, uriIdentityService.extUri).filter(option => option.filter.kind === 'worktree');
		const visible = (label: string) => {
			filters.setSelectedWorktree(options.find(option => option.label === label)?.filter.id);
			return sessions.filter(session => filters.matches(session, false, available)).map(session => session.sessionId);
		};

		assert.deepStrictEqual({ options: options.map(option => option.label), upper: visible('Fix'), lower: visible('fix') }, {
			options: ['repo', 'fix', 'Fix'],
			upper: ['upper'],
			lower: ['lower'],
		});
	});

	test('offers no worktree folder whose listed sessions are all archived, shows all while the selected one\'s are, and it again as one is unarchived', () => {
		const archived = observableValue('archived', false);
		const inFolder = (id: string, path: string, isArchived = constObservable(false)): ISession => {
			const root = URI.file(path);
			const workspace: ISessionWorkspace = {
				uri: root, label: id, icon: Codicon.folder, requiresWorkspaceTrust: false, isVirtualWorkspace: false,
				folders: [{ root, workingDirectory: root, name: id, description: undefined, gitRepository: undefined }],
			};
			return { ...buildTestSession({ id, title: id }).session, workspace: constObservable(workspace), isArchived };
		};
		const main = inFolder('main', '/work/vscode');
		const first = inFolder('first', '/work/vscode.worktrees/first', archived);
		const second = inFolder('second', '/work/vscode.worktrees/second');
		const sessions = [main, first, second];
		const filters = createFilters();
		const state = () => {
			const available = getWorktreeFilterKeys(sessions, listAll, extUriBiasedIgnorePathCase);
			const options = getSessionFilterOptions(sessions, [], listAll, extUriBiasedIgnorePathCase).filter(option => option.filter.kind === 'worktree');
			const selected = filters.getSelectedWorktree(available);
			return {
				options: options.map(option => option.label),
				checked: selected === undefined ? 'All Worktrees' : options.find(option => option.filter.id === selected)?.label,
				visible: sessions.filter(session => filters.matches(session, false, available)).map(session => session.sessionId),
			};
		};
		filters.setSelectedWorktree(getSessionFilterOptions(sessions, [], listAll, extUriBiasedIgnorePathCase).find(option => option.filter.kind === 'worktree' && option.label === 'first')!.filter.id);
		const selected = state();
		archived.set(true, undefined);
		const lastArchived = state();
		archived.set(false, undefined);

		assert.deepStrictEqual({ selected, lastArchived, unarchived: state() }, {
			selected: { options: ['vscode', 'first', 'second'], checked: 'first', visible: ['first'] },
			lastArchived: { options: ['vscode', 'second'], checked: 'All Worktrees', visible: ['main', 'first', 'second'] },
			unarchived: { options: ['vscode', 'first', 'second'], checked: 'first', visible: ['first'] },
		});
	});

	test('picking a worktree folder opens the session of it shown last, else its most recent one not archived, and nothing while the shown one works in it', async () => {
		const inFolder = (id: string, path: string, minutesAgo: number, isArchived = false): ISession => {
			const root = URI.file(path);
			const workspace: ISessionWorkspace = {
				uri: root, label: id, icon: Codicon.folder, requiresWorkspaceTrust: false, isVirtualWorkspace: false,
				folders: [{ root, workingDirectory: root, name: id, description: undefined, gitRepository: undefined }],
			};
			return { ...buildTestSession({ id, title: id, minutesAgo, isArchived }).session, workspace: constObservable(workspace) };
		};
		const main = inFolder('main', '/work/vscode', 1);
		const olderArchived = observableValue('olderArchived', false);
		const older = { ...inFolder('older', '/work/vscode.worktrees/first', 30), isArchived: olderArchived };
		const newer = inFolder('newer', '/work/vscode.worktrees/first', 20);
		// The most recent of the folder, but archived
		const archived = inFolder('archived', '/work/vscode.worktrees/first', 5, true);
		const second = inFolder('second', '/work/vscode.worktrees/second', 10);
		const sessions = [main, older, newer, archived, second];
		const first = getSessionFilterOptions(sessions, [], listAll, extUriBiasedIgnorePathCase).find(option => option.filter.kind === 'worktree' && option.label === 'first')!.filter.id;
		const shown = observableValue<ISession | undefined>('shown', main);
		const opened: string[] = [];
		const opener = store.add(new SessionsWorktreeOpener(shown, () => sessions, async () => true, session => opened.push(session.sessionId), Event.None, upcastPartial<IUriIdentityService>({ extUri: extUriBiasedIgnorePathCase })));

		await opener.open(first);
		const mostRecent = [...opened];
		// The user shows the older one of the folder, then another folder's
		shown.set(older, undefined);
		shown.set(second, undefined);
		await opener.open(first);
		const remembered = opened.slice(mostRecent.length);
		shown.set(newer, undefined);
		await opener.open(first);
		const alreadyShown = opened.slice(mostRecent.length + remembered.length);
		// The remembered one is archived, then works in another folder: the folder's most recent one opens instead
		shown.set(older, undefined);
		shown.set(second, undefined);
		olderArchived.set(true, undefined);
		await opener.open(first);
		olderArchived.set(false, undefined);
		const movedRoot = URI.file('/work/vscode.worktrees/second');
		const moved = { ...older, workspace: constObservable<ISessionWorkspace>({ uri: movedRoot, label: 'older', icon: Codicon.folder, requiresWorkspaceTrust: false, isVirtualWorkspace: false, folders: [{ root: movedRoot, workingDirectory: movedRoot, name: 'older', description: undefined, gitRepository: undefined }] }) };
		sessions.splice(sessions.indexOf(older), 1, moved);
		await opener.open(first);

		assert.deepStrictEqual({ mostRecent, remembered, alreadyShown, fallback: opened.slice(mostRecent.length + remembered.length + alreadyShown.length) }, {
			mostRecent: ['newer'],
			remembered: ['older'],
			alreadyShown: [],
			fallback: ['newer', 'newer'],
		});
	});

	test('opens nothing where the session it asked for is archived, removed or moved meanwhile, or it was disposed, rather than another not asked for', async () => {
		const workspaceOf = (path: string): ISessionWorkspace => {
			const root = URI.file(path);
			return { uri: root, label: 'w', icon: Codicon.folder, requiresWorkspaceTrust: false, isVirtualWorkspace: false, folders: [{ root, workingDirectory: root, name: 'w', description: undefined, gitRepository: undefined }] };
		};
		const run = async (change: 'archive' | 'remove' | 'move' | 'dispose' | 'none') => {
			const archived = observableValue('archived', false);
			const workspace = observableValue<ISessionWorkspace | undefined>('workspace', workspaceOf('/work/vscode.worktrees/first'));
			const remembered: ISession = { ...buildTestSession({ id: 'remembered', title: 'remembered', minutesAgo: 30 }).session, workspace, isArchived: archived };
			const other = { ...buildTestSession({ id: 'other', title: 'other', minutesAgo: 10 }).session, workspace: constObservable(workspaceOf('/work/vscode.worktrees/first')) };
			const elsewhere = { ...buildTestSession({ id: 'elsewhere', title: 'elsewhere', minutesAgo: 5 }).session, workspace: constObservable(workspaceOf('/work/vscode.worktrees/second')) };
			let sessions: ISession[] = [remembered, other, elsewhere];
			const shown = observableValue<ISession | undefined>('shown', remembered);
			const allowed = new DeferredPromise<boolean>();
			const opened: string[] = [];
			const disposables = new DisposableStore();
			const opener = disposables.add(new SessionsWorktreeOpener(shown, () => sessions, () => allowed.p, session => opened.push(session.sessionId), Event.None, upcastPartial<IUriIdentityService>({ extUri: extUriBiasedIgnorePathCase })));
			shown.set(elsewhere, undefined);
			const opening = opener.open(getSessionFilterOptions(sessions, [], listAll, extUriBiasedIgnorePathCase).find(option => option.filter.kind === 'worktree' && option.label === 'first')!.filter.id);
			if (change === 'archive') {
				archived.set(true, undefined);
			} else if (change === 'remove') {
				sessions = [other, elsewhere];
			} else if (change === 'move') {
				workspace.set(workspaceOf('/work/vscode.worktrees/second'), undefined);
			} else if (change === 'dispose') {
				disposables.dispose();
			}
			allowed.complete(true);
			await opening;
			disposables.dispose();
			return opened;
		};

		assert.deepStrictEqual({
			unchanged: await run('none'),
			archived: await run('archive'),
			removed: await run('remove'),
			moved: await run('move'),
			disposed: await run('dispose'),
		}, { unchanged: ['remembered'], archived: [], removed: [], moved: [], disposed: [] });
	});

	test('remembers the session shown of a worktree folder also once its workspace becomes known after it shows', async () => {
		const workspaceOf = (path: string): ISessionWorkspace => {
			const root = URI.file(path);
			return { uri: root, label: 'first', icon: Codicon.folder, requiresWorkspaceTrust: false, isVirtualWorkspace: false, folders: [{ root, workingDirectory: root, name: 'first', description: undefined, gitRepository: undefined }] };
		};
		const inFolder = (id: string, path: string | undefined, minutesAgo: number): ISession & { readonly hydrate: (path: string) => void } => {
			const workspace = observableValue<ISessionWorkspace | undefined>(`workspace-${id}`, path ? workspaceOf(path) : undefined);
			return { ...buildTestSession({ id, title: id, minutesAgo }).session, workspace, hydrate: folder => workspace.set(workspaceOf(folder), undefined) };
		};
		// Shown before its workspace is known, as a restored session is
		const hydrating = inFolder('hydrating', undefined, 30);
		const newer = inFolder('newer', '/work/vscode.worktrees/first', 10);
		const elsewhere = inFolder('elsewhere', '/work/vscode.worktrees/second', 5);
		const sessions = [hydrating, newer, elsewhere];
		const shown = observableValue<ISession | undefined>('shown', hydrating);
		const opened: string[] = [];
		const opener = store.add(new SessionsWorktreeOpener(shown, () => sessions, async () => true, session => opened.push(session.sessionId), Event.None, upcastPartial<IUriIdentityService>({ extUri: extUriBiasedIgnorePathCase })));
		hydrating.hydrate('/work/vscode.worktrees/first');
		shown.set(elsewhere, undefined);
		await opener.open(getSessionFilterOptions(sessions, [], listAll, extUriBiasedIgnorePathCase).find(option => option.filter.kind === 'worktree' && option.label === 'first')!.filter.id);

		assert.deepStrictEqual(opened, ['hydrating']);
	});

	test('shows the sessions of all worktree folders or of the one selected, until All Worktrees or reset, and all where the selected or a stored hidden folder is not offered', () => {
		const inFolder = (id: string, path: string, repository?: { readonly uri: string; readonly workTree?: string }): ISession => {
			const root = URI.file(path);
			const workspace: ISessionWorkspace = {
				uri: root, label: id, icon: Codicon.folder, requiresWorkspaceTrust: false, isVirtualWorkspace: false,
				folders: [{
					root, workingDirectory: root, name: id, description: undefined,
					gitRepository: repository && { uri: URI.file(repository.uri), workTreeUri: repository.workTree ? URI.file(repository.workTree) : undefined, baseBranchName: undefined, gitHubInfo: constObservable(undefined) },
				}],
			};
			return { ...buildTestSession({ id, title: id }).session, workspace: constObservable(workspace) };
		};
		const main = inFolder('main', '/work/vscode', { uri: '/work/vscode' });
		const first = inFolder('first', '/work/vscode.worktrees/first', { uri: '/work/vscode', workTree: '/work/vscode.worktrees/first' });
		const second = inFolder('second', '/work/vscode.worktrees/second');
		// Quick chats never hide
		const quick = buildTestSession({ id: 'quick', title: 'Quick', isQuickChat: true }).session;
		const storage = store.add(new InMemoryStorageService());
		const filters = createFilters(storage);
		const keyOf = (label: string) => getSessionFilterOptions([main, first, second], [], listAll, extUriBiasedIgnorePathCase).find(option => option.filter.kind === 'worktree' && option.label === label)!.filter.id;
		const state = (sessions: readonly ISession[], target = filters) => {
			const available = getWorktreeFilterKeys(sessions, listAll, extUriBiasedIgnorePathCase);
			const options = getSessionFilterOptions(sessions, [], listAll, extUriBiasedIgnorePathCase).filter(option => option.filter.kind === 'worktree');
			const selected = target.getSelectedWorktree(available);
			return {
				checked: selected === undefined ? 'All Worktrees' : options.find(option => option.filter.id === selected)?.label,
				visible: sessions.filter(session => target.matches(session, false, available)).map(session => session.sessionId),
			};
		};
		const sessions = [main, first, second, quick];

		const withoutWorktrees = getSessionFilterOptions([main, quick], [], listAll, extUriBiasedIgnorePathCase).filter(option => option.filter.kind === 'worktree').map(option => option.label);
		const offered = getSessionFilterOptions(sessions, [], listAll, extUriBiasedIgnorePathCase).filter(option => option.filter.kind === 'worktree').map(option => option.label);
		const initial = state(sessions);
		filters.setSelectedWorktree(keyOf('first'));
		const firstOnly = state(sessions);
		const restored = state(sessions, createFilters(storage));
		filters.setSelectedWorktree(keyOf('second'));
		const secondOnly = state(sessions);
		filters.setSelectedWorktree(undefined);
		const all = state(sessions);
		filters.setSelectedWorktree(keyOf('first'));
		filters.reset();
		const reset = state(sessions);
		filters.setSelectedWorktree(keyOf('second'));
		// Its last session goes: the folder is no longer offered, and all folders show again
		const stale = state([main, first, quick]);
		// Earlier builds stored hidden folders with the other filters
		const legacyStorage = store.add(new InMemoryStorageService());
		legacyStorage.store('sessionsListControl.filters', JSON.stringify([[sessionFilterKey({ kind: 'worktree', id: keyOf('first') }), true]]), StorageScope.PROFILE, StorageTarget.USER);
		const legacy = state(sessions, createFilters(legacyStorage));

		const everything = { checked: 'All Worktrees', visible: ['main', 'first', 'second', 'quick'] };
		assert.deepStrictEqual({ withoutWorktrees, offered, initial, firstOnly, restored, secondOnly, all, reset, stale, legacy }, {
			withoutWorktrees: [],
			offered: ['vscode', 'first', 'second'],
			initial: everything,
			firstOnly: { checked: 'first', visible: ['first', 'quick'] },
			restored: { checked: 'first', visible: ['first', 'quick'] },
			secondOnly: { checked: 'second', visible: ['second', 'quick'] },
			all: everything,
			reset: everything,
			stale: { checked: 'All Worktrees', visible: ['main', 'first', 'quick'] },
			legacy: everything,
		});
	});

	test('scheduled-only filtering persists and participates in reset and undo', () => {
		const storage = store.add(new InMemoryStorageService());
		const filters = createFilters(storage);
		filters.setScheduledOnly(true);
		const restored = createFilters(storage);
		const persisted = restored.isScheduledOnly();
		const undo = restored.capture();
		restored.reset();
		const reset = restored.isScheduledOnly();
		undo();
		assert.deepStrictEqual({ persisted, reset, undone: restored.isScheduledOnly() }, { persisted: true, reset: false, undone: true });
	});

	test('Inbox scope distinguishes exact workspaces and environments without separating harnesses', () => {
		const filters = createFilters();
		const sessions = [
			buildTestSession({ id: 'local', title: 'Local', workspace: 'app' }).session,
			buildTestSession({ id: 'claude', title: 'Claude', workspace: 'app', harness: 'claude' }).session,
			buildTestSession({ id: 'other-folder', title: 'Other folder', workspace: 'app', workspaceFolders: ['other/app'] }).session,
			buildTestSession({ id: 'remote', title: 'Remote', workspace: 'app', environment: 'ssh:work' }).session,
		];
		const visible = () => sessions.filter(session => filters.matchesInboxScope(session)).map(session => session.sessionId);
		const all = visible();
		filters.setInboxEnvironment({ id: 'ssh:work', label: 'Work' });
		const environmentOnly = visible();
		filters.setInboxEnvironment(undefined);
		filters.setInboxWorkspace(getInboxWorkspaceFilter(sessions[0]));
		const workspaceOnly = visible();
		filters.setInboxEnvironment({ id: 'local', label: 'This Computer' });
		const combined = visible();
		const resetWorkspace = filters.setInboxEnvironment({ id: 'ssh:work', label: 'Work' });
		assert.deepStrictEqual({
			all, environmentOnly, workspaceOnly, combined, resetWorkspace, afterEnvironmentChange: visible(),
			options: getInboxWorkspaceOptions(sessions).map(option => [option.environment, option.resource]),
		}, {
			all: ['local', 'claude', 'other-folder', 'remote'],
			environmentOnly: ['remote'],
			workspaceOnly: ['local', 'claude'],
			combined: ['local', 'claude'],
			resetWorkspace: true,
			afterEnvironmentChange: ['remote'],
			options: [
				['local', 'file:///home/user/projects/app'],
				['ssh:work', 'file:///home/user/projects/app'],
				['local', 'file:///home/user/projects/other/app'],
			],
		});
	});

	test('Inbox scope persists, resets and restores independently of ordinary environment filters', () => {
		const storage = store.add(new InMemoryStorageService());
		const filters = createFilters(storage);
		const session = buildTestSession({ id: 'app', title: 'App', workspace: 'app' }).session;
		filters.setExcluded({ kind: 'environment', id: 'local' }, true);
		filters.setInboxWorkspace(getInboxWorkspaceFilter(session));
		filters.setInboxEnvironment({ id: 'local', label: 'This Computer' });
		const reloaded = createFilters(storage);
		const scope = reloaded.inboxScope;
		const undo = reloaded.capture();
		reloaded.reset();
		const reset = { scope: reloaded.inboxScope, ordinary: reloaded.matches(session) };
		undo();
		const restored = { scope: reloaded.inboxScope, ordinary: reloaded.matches(session), inbox: reloaded.matches(session, true) && reloaded.matchesInboxScope(session) };
		reloaded.setInboxWorkspace(undefined);
		reloaded.setInboxEnvironment(undefined);
		const scopeReset = { scope: createFilters(storage).inboxScope, ordinary: reloaded.matches(session) };
		const newEnvironment = buildTestSession({ id: 'new-host', title: 'New host', environment: 'new-host' }).session;
		assert.deepStrictEqual({ reset, restored, scopeReset, newEnvironmentMatchesAll: reloaded.matchesInboxScope(newEnvironment) }, {
			reset: { scope: {}, ordinary: true },
			restored: { scope, ordinary: false, inbox: true },
			scopeReset: { scope: {}, ordinary: false },
			newEnvironmentMatchesAll: true,
		});
	});

	test('No Workspace excludes hydrating sessions and workspace options react to metadata', () => {
		const filters = createFilters();
		const workspace = observableValue<ISessionWorkspace | undefined>('workspace', undefined);
		const pending = { ...buildTestSession({ id: 'pending', title: 'Pending' }).session, workspace, isQuickChat: constObservable(false) };
		const quick = buildTestSession({ id: 'quick', title: 'Quick', isQuickChat: true }).session;
		const options: string[][] = [];
		store.add(autorun(reader => {
			options.push(getInboxWorkspaceOptions([pending, quick], undefined, reader).map(option => option.label));
		}));
		filters.setInboxWorkspace('none');
		const before = [pending, quick].filter(session => filters.matchesInboxScope(session)).map(session => session.sessionId);
		workspace.set(buildTestWorkspace('app'), undefined);
		filters.setInboxWorkspace(getInboxWorkspaceFilter(pending));
		workspace.set(undefined, undefined);
		const absent = filters.matchesInboxScope(pending);
		workspace.set(buildTestWorkspace('app'), undefined);
		assert.deepStrictEqual({ before, options, absent, restored: filters.matchesInboxScope(pending) }, {
			before: ['quick'], options: [[], ['app'], [], ['app']], absent: false, restored: true,
		});
	});

	test('always offers the three harnesses, This Computer and Cloud, and their VS Code application choices', () => {
		assert.deepStrictEqual(getSessionFilterOptions([], [], listAll, extUriBiasedIgnorePathCase), [
			{ filter: { kind: 'harness', id: 'copilot' }, label: 'Copilot', group: '1_harnesses' },
			{ filter: { kind: 'harness', id: 'claude' }, label: 'Claude', group: '1_harnesses' },
			{ filter: { kind: 'harness', id: 'codex' }, label: 'Codex', group: '1_harnesses' },
			{ filter: { kind: 'environment', id: 'local' }, label: 'This Computer', group: '2_environments' },
			{ filter: { kind: 'environment', id: 'cloud' }, label: 'Cloud', group: '2_environments' },
			{ filter: { kind: 'application', environment: 'local', id: 'vscode' }, label: 'VS Code (This Computer)', group: '3_applications_000000' },
			{ filter: { kind: 'application', environment: 'cloud', id: 'vscode' }, label: 'VS Code (Cloud)', group: '3_applications_000001' },
		]);
	});

	test('offers VS Code for connected hosts without sessions and for disconnected hosts with cached applications', () => {
		const disconnected = observableValue('disconnected', false);
		const sessions = [
			buildTestSession({ id: 'cloud-custom', title: 'Cloud Custom', environment: 'cloud', application: 'custom_cloud_APP' }).session,
			buildTestSession({ id: 'cached-cli', title: 'Cached CLI', environment: 'cached-host', application: 'github/cli' }).session,
		];
		const options = getSessionFilterOptions(sessions, [
			{ id: 'connected-host', label: 'Connected Host' },
			{ id: 'cached-host', label: 'Cached Host', isConnected: disconnected },
			{ id: 'empty-host', label: 'Empty Host', isConnected: disconnected },
		], listAll, extUriBiasedIgnorePathCase);
		assert.deepStrictEqual({
			environments: options.filter(option => option.filter.kind === 'environment').map(option => option.label),
			applications: options.filter(option => option.filter.kind === 'application').map(option => option.label),
		}, {
			environments: ['This Computer', 'Cloud', 'Connected Host'],
			applications: ['VS Code (This Computer)', 'Custom Cloud App (Cloud)', 'VS Code (Cloud)', 'Copilot CLI (Cached Host)', 'VS Code (Cached Host)', 'VS Code (Connected Host)'],
		});
	});

	test('composes harness, environment and application filters without coupling their selections', () => {
		const filters = createFilters();
		filters.setExcluded({ kind: 'application', environment: 'local', id: 'claude' }, false);
		filters.setExcluded({ kind: 'application', environment: 'remote-id', id: 'github/cli' }, false);
		const sessions = [
			buildTestSession({ id: 'editor', title: 'Editor' }).session,
			buildTestSession({ id: 'claude', title: 'Claude', harness: 'claude', application: 'claude' }).session,
			buildTestSession({ id: 'cloud', title: 'Cloud', environment: 'cloud', application: 'github/autopilot' }).session,
			buildTestSession({ id: 'remote', title: 'Remote', harness: 'codex', environment: 'remote-id', application: 'github/cli' }).session,
		];
		const visible = () => sessions.filter(session => filters.matches(session)).map(session => session.sessionId);
		const states = [visible()];
		filters.setExcluded({ kind: 'harness', id: 'claude' }, true);
		states.push(visible());
		filters.setExcluded({ kind: 'environment', id: 'cloud' }, true);
		states.push(visible());
		filters.setExcluded({ kind: 'application', environment: 'local', id: 'vscode' }, true);
		states.push(visible());
		filters.setExcluded({ kind: 'harness', id: 'claude' }, false);
		states.push(visible());
		assert.deepStrictEqual(states, [
			['editor', 'claude', 'cloud', 'remote'],
			['editor', 'cloud', 'remote'],
			['editor', 'remote'],
			['remote'],
			['claude', 'remote'],
		]);
	});

	test('filters task client applications independently of external status and reuses existing preferences', () => {
		const filters = createFilters();
		const sessions = ['copilot-vscode', 'copilot-cli', 'copilot-app'].map(application =>
			buildTestSession({ id: application, title: application, environment: 'cloud', application, isExternal: false }).session);
		const before = sessions.filter(session => filters.matches(session)).map(session => session.sessionId);
		filters.setExcluded({ kind: 'application', environment: 'cloud', id: 'github/cli' }, true);
		assert.deepStrictEqual({
			before,
			after: sessions.filter(session => filters.matches(session)).map(session => session.sessionId),
			external: sessions.map(session => session.isExternal?.get()),
			applications: getSessionFilterOptions(sessions, [], listAll, extUriBiasedIgnorePathCase)
				.filter(option => option.filter.kind === 'application' && option.filter.environment === 'cloud')
				.map(option => option.label),
		}, {
			before: ['copilot-vscode', 'copilot-cli', 'copilot-app'],
			after: ['copilot-vscode', 'copilot-app'],
			external: [false, false, false],
			applications: ['Copilot App (Cloud)', 'Copilot CLI (Cloud)', 'VS Code (Cloud)'],
		});
	});

	test('offers the creating applications of automation sessions only while the list includes them', () => {
		const automation = (id: string, application: string): ISession => ({ ...buildTestSession({ id, title: id, environment: 'cloud', application }).session, isAutomation: constObservable(true) });
		const sessions = [automation('shown', 'copilot-cli'), automation('hidden', 'copilot-app')];
		const cloudApplications = (options: ReturnType<typeof getSessionFilterOptions>) => options
			.filter(option => option.filter.kind === 'application' && option.filter.environment === 'cloud')
			.map(option => option.label);
		const shownIds = observableValue<ReadonlySet<string>>('shownIds', new Set());
		const snapshots: string[][] = [];
		store.add(autorun(reader => {
			snapshots.push(cloudApplications(getSessionFilterOptions(sessions, [], (session, reader) => !session.isAutomation?.read(reader) || shownIds.read(reader).has(session.sessionId), extUriBiasedIgnorePathCase, reader)));
		}));
		shownIds.set(new Set(['shown']), undefined);

		assert.deepStrictEqual(snapshots, [['VS Code (Cloud)'], ['Copilot CLI (Cloud)', 'VS Code (Cloud)']]);
	});

	test('omits unknown creating applications without hiding their sessions', () => {
		const filters = createFilters();
		const sessions = ['agent_tasks_api', 'agent_tasks_public_api', 'api_call_received', 'unknown'].map(application =>
			buildTestSession({ id: application, title: application, environment: 'cloud', application }).session);
		for (const id of ['vscode', 'unknown', 'agent_tasks_api']) {
			filters.setExcluded({ kind: 'application', environment: 'cloud', id }, true);
		}
		const visible = () => sessions.filter(session => filters.matches(session)).map(session => session.sessionId);
		const before = visible();
		filters.setExcluded({ kind: 'environment', id: 'cloud' }, true);
		const excludedEnvironment = visible();
		filters.setExcluded({ kind: 'environment', id: 'cloud' }, false);
		filters.setExcluded({ kind: 'harness', id: 'copilot' }, true);
		assert.deepStrictEqual({
			applications: getSessionFilterOptions(sessions, [], listAll, extUriBiasedIgnorePathCase)
				.filter(option => option.filter.kind === 'application' && option.filter.environment === 'cloud')
				.map(option => option.label),
			before,
			excludedEnvironment,
			excludedHarness: visible(),
		}, {
			applications: ['VS Code (Cloud)'],
			before: ['agent_tasks_api', 'agent_tasks_public_api', 'api_call_received', 'unknown'],
			excludedEnvironment: [],
			excludedHarness: [],
		});
	});

	for (const environment of ['local', 'remote-id', 'agenthost-build-server:8080']) {
		test(`defaults ${environment} applications to VS Code and preserves explicit choices through reload and reset`, () => {
			const storage = store.add(new InMemoryStorageService());
			const filters = createFilters(storage);
			const sessions = ['vscode', 'vscode-editor-window', 'vscode-agents-window', 'github/cli', 'github/autopilot', 'claude', 'codex', 'slack', 'teams', 'third-party'].map(application =>
				buildTestSession({ id: application, title: application, environment, application }).session);
			const visible = (filters: SessionsListFilters) => sessions.filter(session => filters.matches(session)).map(session => session.sessionId);
			const defaults = visible(filters);
			for (const id of ['github/cli', 'claude', 'codex', 'third-party']) {
				filters.setExcluded({ kind: 'application', environment, id }, false);
			}
			filters.setExcluded({ kind: 'application', environment, id: 'vscode' }, true);
			const selected = visible(filters);
			const restored = createFilters(storage);
			const reloaded = visible(restored);
			restored.reset();

			assert.deepStrictEqual({ defaults, selected, reloaded, reset: visible(restored) }, {
				defaults: ['vscode', 'vscode-editor-window', 'vscode-agents-window'],
				selected: ['github/cli', 'claude', 'codex', 'third-party'],
				reloaded: selected,
				reset: defaults,
			});
		});
	}

	test('defaults cloud Slack and Teams off, persists opt-ins, and resets to defaults', () => {
		const storage = store.add(new InMemoryStorageService());
		const filters = createFilters(storage);
		const sessions = ['local', 'cloud', 'remote-id'].flatMap(environment =>
			['slack', 'teams', 'github/autopilot'].map(application =>
				buildTestSession({ id: `${environment}/${application}`, title: application, environment, application }).session));
		const visible = (filters: SessionsListFilters) => sessions.filter(session => filters.matches(session)).map(session => session.sessionId);
		const defaults = visible(filters);
		filters.setExcluded({ kind: 'application', environment: 'cloud', id: 'slack' }, false);
		const restored = createFilters(storage);
		const optedIn = visible(restored);
		restored.reset();
		assert.deepStrictEqual({ defaults, optedIn, reset: visible(restored) }, {
			defaults: ['cloud/github/autopilot'],
			optedIn: ['cloud/slack', 'cloud/github/autopilot'],
			reset: defaults,
		});
	});

	class MigrationConfigurationService extends TestConfigurationService {
		writable = true;
		readonly updates: unknown[][] = [];
		override async updateValue(key: string, value: unknown, ...rest: unknown[]): Promise<void> {
			this.updates.push([key, value, ...rest]);
			if (this.writable) {
				await this.setUserConfiguration(key, value);
			}
		}
	}

	test('moves an enabled Show Automation Runs filter to the automation listing setting where it takes effect', async () => {
		const storage = store.add(new InMemoryStorageService());
		const configurationService = new MigrationConfigurationService({ [SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING]: AutomationSessionsListMode.AfterReply });
		const load = async (stored?: readonly [string, boolean][]) => {
			if (stored) {
				storage.store('sessionsListControl.filters', JSON.stringify(stored), StorageScope.PROFILE, StorageTarget.USER);
			}
			const filters = createFilters(storage, configurationService);
			await timeout(0);
			return { scheduledOnly: filters.isScheduledOnly(), stored: storage.get('sessionsListControl.filters', StorageScope.PROFILE) };
		};

		const enabled = await load([['showAutomationRuns', true], ['scheduledOnly', true]]);
		const reloaded = await load();
		const disabled = await load([['showAutomationRuns', false]]);

		assert.deepStrictEqual({ enabled, reloaded, disabled, setting: configurationService.getValue(SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING), updates: configurationService.updates }, {
			enabled: { scheduledOnly: true, stored: JSON.stringify([['scheduledOnly', true]]) },
			reloaded: enabled,
			disabled: { scheduledOnly: false, stored: undefined },
			setting: AutomationSessionsListMode.Always,
			updates: [[SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING, AutomationSessionsListMode.Always]],
		});
	});

	test('retries a failed Show Automation Runs migration without overwriting a later choice of the setting', async () => {
		const configurationService = new MigrationConfigurationService({ [SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING]: AutomationSessionsListMode.AfterReply });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		configurationService.writable = false;
		const setMode = (mode: AutomationSessionsListMode) => configurationService.setUserConfiguration(SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING, mode);
		const withEnabledFilter = () => {
			const storage = store.add(new InMemoryStorageService());
			storage.store('sessionsListControl.filters', JSON.stringify([['showAutomationRuns', true]]), StorageScope.PROFILE, StorageTarget.USER);
			return storage;
		};
		const isPending = (storage: InMemoryStorageService) => storage.get('sessionsListControl.filters', StorageScope.PROFILE) !== undefined;
		const load = async (storage: InMemoryStorageService) => {
			createFilters(storage, configurationService);
			await timeout(0);
			return isPending(storage);
		};

		// Changed in Settings while the app was closed
		const closed = withEnabledFilter();
		const failed = await load(closed);
		const retried = await load(closed);
		setMode(AutomationSessionsListMode.Never);
		const changedWhileClosed = await load(closed);

		// Chosen during the session whose write failed, even the value that session saw
		setMode(AutomationSessionsListMode.AfterReply);
		const open = withEnabledFilter();
		await load(open);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => key === SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING,
			affectedKeys: new Set([SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING]),
			change: { keys: [SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING], overrides: [] },
			source: ConfigurationTarget.USER,
		});
		const chosenInSession = isPending(open);
		const reloadedAfterChoice = await load(open);

		assert.deepStrictEqual({ failed, retried, changedWhileClosed, chosenInSession, reloadedAfterChoice, writes: configurationService.updates.length }, {
			failed: true,
			retried: true,
			changedWhileClosed: false,
			chosenInSession: false,
			reloadedAfterChoice: false,
			writes: 3,
		});
	});

	test('keeps cached application groups when a remote disconnects and tracks metadata hydration', () => {
		const connected = observableValue('connected', true);
		const local = buildTestSession({ id: 'local', title: 'Local' });
		const remote = buildTestSession({ id: 'remote', title: 'Remote', environment: 'remote-id' });
		const catalog = observableValue<readonly ISession[]>('catalog', [local.session, remote.session]);
		const environments: ISessionEnvironment[] = [{ id: 'remote-id', label: 'Workstation', isConnected: connected }];
		const snapshots: string[][] = [];
		store.add(autorun(reader => {
			snapshots.push(getSessionFilterOptions(catalog.read(reader), environments, listAll, extUriBiasedIgnorePathCase, reader).slice(3).map(option => `${option.group}: ${option.label}`));
		}));
		connected.set(false, undefined);
		remote.application.set(getSessionApplication('github/cli'), undefined);
		catalog.set([local.session], undefined);
		assert.deepStrictEqual(snapshots, [
			['2_environments: This Computer', '2_environments: Cloud', '2_environments: Workstation', '3_applications_000000: VS Code (This Computer)', '3_applications_000001: VS Code (Cloud)', '3_applications_000002: VS Code (Workstation)'],
			['2_environments: This Computer', '2_environments: Cloud', '3_applications_000000: VS Code (This Computer)', '3_applications_000001: VS Code (Cloud)', '3_applications_000002: VS Code (Workstation)'],
			['2_environments: This Computer', '2_environments: Cloud', '3_applications_000000: VS Code (This Computer)', '3_applications_000001: VS Code (Cloud)', '3_applications_000002: Copilot CLI (Workstation)', '3_applications_000002: VS Code (Workstation)'],
			['2_environments: This Computer', '2_environments: Cloud', '3_applications_000000: VS Code (This Computer)', '3_applications_000001: VS Code (Cloud)'],
		]);
	});

	test('remembers environment and application choices through rename, disappearance and reload', () => {
		const storage = store.add(new InMemoryStorageService());
		const filters = createFilters(storage);
		const session = buildTestSession({ id: 'remote', title: 'Remote', environment: 'remote-id', application: 'github/cli' }).session;
		const environmentFilter = { kind: 'environment', id: 'remote-id' } as const;
		const applicationFilter = { kind: 'application', environment: 'remote-id', id: 'github/cli' } as const;
		filters.setExcluded({ kind: 'application', environment: 'local', id: 'github/cli' }, false);
		filters.setExcluded(environmentFilter, true);
		filters.setExcluded(applicationFilter, true);
		const absent = getSessionFilterOptions([], [{ id: 'remote-id', label: 'Old Name' }], listAll, extUriBiasedIgnorePathCase);
		const restored = createFilters(storage);
		restored.setExcluded(environmentFilter, false);
		const renamed = getSessionFilterOptions([session], [{ id: 'remote-id', label: 'New Name' }], listAll, extUriBiasedIgnorePathCase);
		assert.deepStrictEqual({
			absentApplications: absent.filter(option => option.filter.kind === 'application').map(option => option.label),
			label: renamed.find(option => sessionFilterKey(option.filter) === sessionFilterKey(applicationFilter))?.label,
			excluded: restored.isExcluded(applicationFilter),
			visible: restored.matches(session),
			localChoice: restored.isExcluded({ kind: 'application', environment: 'local', id: 'github/cli' }),
		}, {
			absentApplications: ['VS Code (This Computer)', 'VS Code (Cloud)', 'VS Code (Old Name)'],
			label: 'Copilot CLI (New Name)',
			excluded: true,
			visible: false,
			localChoice: false,
		});
	});

	test('groups editor surfaces together but retains CLI, App, and unfamiliar application identities', () => {
		assert.deepStrictEqual([
			getSessionApplication('vscode-editor-window'),
			getSessionApplication('vscode-agents-window'),
			getSessionApplication('visual_studio_code_remote_agent_tool_invoked'),
			getSessionApplication('github/cli'),
			getSessionApplication('github/autopilot'),
			getSessionApplication('issues_agent_assignment'),
			getSessionApplication('CUSTOM_EVENT'),
			getSessionApplication('custom_cloud_APPLICATION'),
			getSessionApplication('another cloud application'),
			getSessionApplication('third-party-client', 'Third Party'),
			getSessionApplication('custom_client', 'Custom Client Brand'),
		], [
			{ id: 'vscode', label: 'VS Code' },
			{ id: 'vscode', label: 'VS Code' },
			{ id: 'vscode', label: 'VS Code' },
			{ id: 'github/cli', label: 'Copilot CLI' },
			{ id: 'github/autopilot', label: 'Copilot App' },
			{ id: 'copilot-web', label: 'GitHub' },
			{ id: 'CUSTOM_EVENT', label: 'Custom Event' },
			{ id: 'custom_cloud_APPLICATION', label: 'Custom Cloud Application' },
			{ id: 'another cloud application', label: 'Another Cloud Application' },
			{ id: 'third-party-client', label: 'Third Party' },
			{ id: 'custom_client', label: 'Custom Client Brand' },
		]);
	});

	test('lists quick chats in the Agents window, and in an editor window only while it has no folder, following its folders', () => {
		const folders: URI[] = [];
		const onDidChangeWorkspaceFolders = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const workspace = upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
			getWorkspace: () => upcastPartial<IWorkspace>({ folders: folders.map(uri => upcastPartial<IWorkspaceFolder>({ uri })) }),
		});
		const changeFolders = (change: () => void) => { change(); onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] }); };
		const editorWindow = listsQuickChatsIn(false, workspace);
		const agentsWindow = listsQuickChatsIn(true, workspace);
		const seen: boolean[] = [];
		store.add(autorun(reader => { seen.push(editorWindow.read(reader)); }));

		changeFolders(() => folders.push(URI.file('/work/vscode')));
		const withFolder = { editorWindow: editorWindow.get(), agentsWindow: agentsWindow.get() };
		changeFolders(() => folders.pop());

		assert.deepStrictEqual({ seen, withFolder }, {
			// Empty, a folder added, the last folder removed
			seen: [true, false, true],
			withFolder: { editorWindow: false, agentsWindow: true },
		});
	});
});
