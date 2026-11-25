/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import assert from 'assert';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { extUri } from '../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostEnablementService } from '../../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { identityAgentHostResourceUriMapper } from '../../../../../../../platform/agentHost/common/agentHostUri.js';
import { getWorkingDirectoryScopeId } from '../../../../../../../platform/agentHost/common/agentHostWorkingDirectories.js';
import { AgentSession, IAgentHostService, type IAgentSessionMetadata } from '../../../../../../../platform/agentHost/common/agentService.js';
import type { INotification } from '../../../../../../../platform/agentHost/common/state/sessionActions.js';
import { SESSION_META_ISOLATED_CHAT_WORKTREES_KEY, SessionStatus, withFolderScopeGitState, withSessionGitState, withSessionIsolatedChatWorktrees, type RootState, type SessionSummary } from '../../../../../../../platform/agentHost/common/state/sessionState.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { UriIdentityService } from '../../../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspaceFolderLocationProvider } from '../../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, WorkbenchState } from '../../../../../../../platform/workspace/common/workspace.js';
import { TestContextService } from '../../../../../../test/common/workbenchTestServices.js';
import { WorkspaceFolderLocationService } from '../../../../../../services/workspaces/common/workspaceFolderLocationService.js';
import { BrowserWorkspaceEditingService } from '../../../../../../services/workspaces/browser/workspaceEditingService.js';
import { AGENT_HOST_WORKTREE_LOCATIONS_PROVIDER_ID, AgentHostWorktreeLocationProvider, getAgentHostSessionWorktrees } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeLocations.js';
import { IAgentSession } from '../../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../browser/agentSessions/agentSessionsService.js';
import { IChatSessionsService, SessionType } from '../../../../common/chatSessionsService.js';

suite('AgentHostWorktreeLocations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/vscode');

	/** The local agent host's root state, advertising `providers` as its agents. */
	const advertising = (...providers: string[]) => upcastPartial<RootState>({ agents: providers.map(provider => upcastPartial<RootState['agents'][number]>({ provider })) });

	/**
	 * A session the local agent host lists, of its `provider` agent, working in `workingDirectoryPath`, whose project is
	 * `projectPath`: one for each working directory.
	 */
	function session(workingDirectoryPath: string, projectPath: string | undefined, options: { readonly provider?: string; readonly archived?: boolean; readonly branchName?: string } = {}): SessionSummary {
		return upcastPartial<SessionSummary>({
			resource: AgentSession.uri(options.provider ?? 'copilotcli', workingDirectoryPath.replace(/\W/g, '-')).toString(),
			provider: options.provider ?? 'copilotcli',
			title: workingDirectoryPath,
			status: SessionStatus.Idle | (options.archived ? SessionStatus.IsArchived : 0),
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			workingDirectories: [URI.file(workingDirectoryPath).toString()],
			...(projectPath ? { project: { uri: URI.file(projectPath).toString(), displayName: projectPath } } : {}),
			...(options.branchName ? { _meta: withSessionGitState(undefined, { branchName: options.branchName }) } : {}),
		});
	}

	/**
	 * A provider over the sessions the local agent host lists, once `loading` completes (`listFailures` listings fail first), and its one agent `copilotcli`, once
	 * `started` (by default). The shared sessions model, which extensions also
	 * feed, has `sharedModel`. A folder in `realpaths` has that real path, read once `realpathHeld` completes;
	 * `realpathFailures` reads fail first.
	 */
	function createProvider(sessions: readonly SessionSummary[], options: { readonly loading?: Promise<void>; listFailures?: number; readonly started?: boolean; readonly sharedModel?: readonly IAgentSession[]; readonly realpaths?: Record<string, string>; readonly realpathHeld?: Promise<void>; realpathFailures?: number; readonly folders?: readonly URI[] } = {}) {
		const instantiationService = store.add(new TestInstantiationService());
		// The local agent host: what it lists, and tells of
		let listed = [...sessions];
		let listings = 0;
		let rootState: RootState | undefined = options.started === false ? undefined : advertising('copilotcli');
		const onDidChangeRootState = store.add(new Emitter<RootState>());
		const onDidNotification = store.add(new Emitter<INotification>());
		instantiationService.stub(IAgentHostService, upcastPartial<IAgentHostService>({
			rootState: upcastPartial<IAgentHostService['rootState']>({ get value() { return rootState; }, onDidChange: onDidChangeRootState.event }),
			onAgentHostStart: Event.None,
			onDidNotification: onDidNotification.event,
			resourceUris: identityAgentHostResourceUriMapper,
			listSessions: async () => {
				listings++;
				await options.loading;
				if (options.listFailures) {
					options.listFailures--;
					throw new Error('the agent host cannot list its sessions');
				}
				return listed.map(summary => upcastPartial<IAgentSessionMetadata>({
					session: URI.parse(summary.resource),
					provider: summary.provider,
					startTime: 0,
					modifiedTime: 0,
					status: summary.status,
					workingDirectories: summary.workingDirectories?.map(directory => URI.parse(directory)),
					project: summary.project && { uri: URI.parse(summary.project.uri), displayName: summary.project.displayName },
					_meta: summary._meta,
				}));
			},
		}));
		instantiationService.stub(IAgentHostEnablementService, upcastPartial<IAgentHostEnablementService>({ enabled: constObservable(true) }));
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({ registerSessionResource: (session: URI) => session, findSessionResource: () => undefined }));
		instantiationService.stub(ILogService, new NullLogService());
		// The shared sessions model and the chat session types registered, which an extension can register as any type
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({ model: upcastPartial<IAgentSessionsService['model']>({ sessions: [...options.sharedModel ?? []], onDidChangeSessions: Event.None, onDidResolve: Event.None, resolve: async () => { } }) }));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({ getRegisteredChatSessionItemProviders: () => [SessionType.AgentHostCopilot], onDidChangeItemsProviders: Event.None }));
		// The window's workspace: its folders, which can change
		let workspaceFolders = [...options.folders ?? [primary]];
		const onDidChangeWorkspaceFolders = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ uri: workspaceFolders[0], folders: workspaceFolders.map(uri => upcastPartial<IWorkspaceFolder>({ uri })) }),
			onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
			onDidChangeWorkbenchState: Event.None,
		}));
		// A folder reached through a symbolic link, such as `/tmp/x` of `/private/tmp/x` on macOS, has another real path
		const realpathsRead: string[] = [];
		instantiationService.stub(IFileService, upcastPartial<IFileService>({
			realpath: async (resource: URI) => {
				realpathsRead.push(resource.path);
				await options.realpathHeld;
				if (options.realpathFailures) {
					options.realpathFailures--;
					throw new Error('cannot read the real path');
				}
				return URI.file(options.realpaths?.[resource.path] ?? resource.path);
			},
		}));
		const provider = instantiationService.createInstance(AgentHostWorktreeLocationProvider);
		const disposeProvider = () => provider.dispose();
		store.add(provider);
		/** As the local agent host's sessions change, such as one that starts, is archived or reports a branch, as it tells. */
		const changeSessions = (change: (sessions: SessionSummary[]) => void) => {
			const before = new Map(listed.map(summary => [summary.resource, summary]));
			const after = [...listed];
			change(after);
			listed = after;
			for (const summary of after) {
				const previous = before.get(summary.resource);
				if (!previous) {
					onDidNotification.fire(upcastPartial<INotification>({ type: 'root/sessionAdded', summary }));
				} else if (previous !== summary) {
					onDidNotification.fire(upcastPartial<INotification>({ type: 'root/sessionSummaryChanged', session: summary.resource, changes: summary }));
				}
				before.delete(summary.resource);
			}
			for (const resource of before.keys()) {
				onDidNotification.fire(upcastPartial<INotification>({ type: 'root/sessionRemoved', session: resource }));
			}
		};
		/** As the local agent host reports the agents it has. */
		const changeRootState = (state: RootState) => {
			rootState = state;
			onDidChangeRootState.fire(state);
		};
		const openFolder = (folder: URI) => {
			workspaceFolders = [folder];
			onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] });
		};
		return Object.assign(provider, { listings: () => listings, realpathsRead, changeSessions, changeRootState, disposeProvider, openFolder });
	}

	/** The folder location service, with `provider` registered as the built-in provider and `others` after it. */
	function createService(provider: IWorkspaceFolderLocationProvider, ...others: IWorkspaceFolderLocationProvider[]) {
		const service = store.add(new WorkspaceFolderLocationService(store.add(new UriIdentityService(store.add(new FileService(new NullLogService())))), new TestContextService(), upcastPartial<ILabelService>({ registerWorkspaceLabelDecorator: () => toDisposable(() => { }) })));
		store.add(service.registerProvider(provider, { builtIn: true }));
		for (const other of others) {
			store.add(service.registerProvider(other));
		}
		return service;
	}

	const paths = (locations: readonly { readonly uri: URI }[]) => locations.map(location => location.uri.path);
	const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

	test('a worktree of a folder is where a session works whose agent host project is the folder: not the folder itself, nor a folder inside it', () => {
		const offered = (...sessions: SessionSummary[]) => paths(getAgentHostSessionWorktrees(sessions, primary));

		assert.deepStrictEqual({
			projectIsFolder: offered(session('/work/vscode.worktrees/feature', '/work/vscode')),
			theFolderItself: offered(session('/work/vscode', '/work/vscode')),
			insideTheFolder: offered(session('/work/vscode/src', '/work/vscode')),
			anotherProject: offered(session('/work/tools.worktrees/fix', '/work/tools')),
			noProject: offered(session('/work/vscode.worktrees/feature', undefined)),
			archived: offered(session('/work/vscode.worktrees/feature', '/work/vscode', { archived: true })),
			// By normalized paths, one for each worktree
			normalizedOnce: offered(session('/work/vscode.worktrees/feature', '/work/vscode/'), session('/work/vscode.worktrees/./feature/', '/work/vscode')),
		}, {
			projectIsFolder: ['/work/vscode.worktrees/feature'],
			theFolderItself: [],
			insideTheFolder: [],
			anotherProject: [],
			noProject: [],
			archived: [],
			normalizedOnce: ['/work/vscode.worktrees/feature'],
		});
	});

	test('a folder reached through a symbolic link has the worktrees of the project its real path is, which it reads once: after the first lookup, which does not wait for it, as a change', async () => {
		// The window opened /tmp/vscode; git names the project by its real path
		const aliased = URI.file('/tmp/vscode');
		const realpathHeld = new DeferredPromise<void>();
		const provider = createProvider([
			session('/private/tmp/vscode.worktrees/feature', '/private/tmp/vscode'),
			session('/private/tmp/vscode/src', '/private/tmp/vscode'),
			session('/private/tmp/vscode', '/private/tmp/vscode'),
		], { realpaths: { '/tmp/vscode': '/private/tmp/vscode' }, realpathHeld: realpathHeld.p, folders: [aliased] });
		// The first lookup waits for neither the sessions nor the real path: the worktree follows once both are known, which
		// the folder location service, and so whatever asks it, hears of
		const service = createService(provider);
		const first = paths(await service.getLocations(aliased, CancellationToken.None));
		await tick();
		let changes = 0;
		store.add(service.onDidChangeLocations(() => changes++));
		// As a caller does: asks again once the service says the locations changed
		const changed = Event.toPromise(service.onDidChangeLocations);
		await realpathHeld.complete();
		await changed;
		const offered = paths(await service.getLocations(aliased, CancellationToken.None));
		const resolved = (await provider.resolveLocation(aliased, URI.file('/private/tmp/vscode.worktrees/feature'), CancellationToken.None))?.uri.path;

		assert.deepStrictEqual({ first, changes, offered, resolved, realpathsRead: provider.realpathsRead }, {
			first: [],
			changes: 1,
			offered: ['/private/tmp/vscode.worktrees/feature'],
			resolved: '/private/tmp/vscode.worktrees/feature',
			realpathsRead: ['/tmp/vscode'],
		});
	});

	test('offers and resolves only the worktrees of the sessions the local agent host lists, not of the shared sessions model, which extensions also feed', async () => {
		// An extension registers a controller as the local agent host's own session type, claiming a project and a worktree
		const claimed = upcastPartial<IAgentSession>({ providerType: SessionType.AgentHostCopilot, metadata: { workingDirectoryPath: '/work/vscode.worktrees/impostor', projectPath: '/work/vscode' }, isArchived: () => false });
		const provider = createProvider([session('/work/vscode.worktrees/feature', '/work/vscode')], { sharedModel: [claimed] });
		const service = createService(provider);
		const resolved = await service.resolveLocation(primary, URI.file('/work/vscode.worktrees/impostor'), CancellationToken.None);
		await tick();

		assert.deepStrictEqual({
			offered: paths(await provider.provideLocations(primary, CancellationToken.None)),
			resolved,
		}, {
			offered: ['/work/vscode.worktrees/feature'],
			resolved: undefined,
		});
	});

	test('counts the sessions of the agents the local agent host has, as it reports them: none before it starts, and none of an agent it no longer has', async () => {
		const provider = createProvider([session('/work/vscode.worktrees/feature', '/work/vscode')], { started: false });
		const service = createService(provider);
		let changes = 0;
		store.add(service.onDidChangeLocations(() => changes++));
		const feature = URI.file('/work/vscode.worktrees/feature');
		// Asked again as the locations change, as whoever shows them does: resolving lists the sessions, then they are offered
		const state = async () => {
			await tick();
			const resolved = (await provider.resolveLocation(primary, feature, CancellationToken.None))?.uri.path;
			return { offered: paths(await service.getLocations(primary, CancellationToken.None)), resolved, changes };
		};
		const beforeStart = await state();
		provider.changeRootState(advertising('copilotcli'));
		const advertised = await state();
		provider.changeRootState(advertising('claude'));
		const removed = await state();

		assert.deepStrictEqual({ beforeStart, advertised, removed, listings: provider.listings() }, {
			beforeStart: { offered: [], resolved: undefined, changes: 0 },
			// As it reports its agents, and once it lists their sessions
			advertised: { offered: ['/work/vscode.worktrees/feature'], resolved: '/work/vscode.worktrees/feature', changes: 3 },
			removed: { offered: [], resolved: undefined, changes: 5 },
			listings: 1,
		});
	});

	test('asks the local agent host nothing for a folder of a remote window, and lists its sessions once however often it is asked', async () => {
		const remote = URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+host', path: '/work/vscode' });
		const provider = createProvider([session('/work/vscode.worktrees/feature', '/work/vscode')], { folders: [remote] });
		const service = createService(provider);
		await service.getLocations(remote, CancellationToken.None);
		const remoteResolved = await service.resolveLocation(remote, URI.file('/work/vscode.worktrees/feature'), CancellationToken.None);
		await tick();
		const remoteListings = provider.listings();

		const local = createProvider([session('/work/vscode.worktrees/feature', '/work/vscode')]);
		for (let ask = 0; ask < 3; ask++) {
			await local.provideLocations(primary, CancellationToken.None);
			await local.resolveLocation(primary, URI.file('/work/vscode.worktrees/other'), CancellationToken.None);
		}

		assert.deepStrictEqual({ remoteResolved, remoteListings, remoteRealpaths: provider.realpathsRead, localListings: local.listings() }, { remoteResolved: undefined, remoteListings: 0, remoteRealpaths: [], localListings: 1 });
	});

	test('of a session working in the folder, offers the worktrees its agent host lists as created for chats of it that it isolated, by their own branch: not another folder of it, nor any where the agent host lists none', () => {
		const isolated = URI.file('/work/vscode.worktrees/isolated').toString();
		const unrelated = URI.file('/work/other').toString();
		const listed = URI.file('/work/vscode.worktrees/gone').toString();
		const multiChat = (meta: SessionSummary['_meta']) => upcastPartial<SessionSummary>({
			...session('/work/vscode', '/work/vscode'),
			workingDirectories: [primary.toString(), isolated, unrelated],
			_meta: meta,
		});
		const marked = withFolderScopeGitState(withSessionIsolatedChatWorktrees(undefined, [isolated, listed]), getWorkingDirectoryScopeId([isolated]), { branchName: 'agents/isolated' }, [isolated]);
		const describe = (sessions: SessionSummary[]) => getAgentHostSessionWorktrees(sessions, primary).map(({ uri, description }) => ({ path: uri.path, description }));

		assert.deepStrictEqual({
			marked: describe([multiChat(marked)]),
			// The same folder in another form, such as without its escapes
			otherForm: describe([upcastPartial<SessionSummary>({
				...session('/work/vscode', '/work/vscode'),
				workingDirectories: [primary.toString(), URI.file('/work/vscode.worktrees/my wt').toString()],
				_meta: withSessionIsolatedChatWorktrees(undefined, [URI.file('/work/vscode.worktrees/my wt').toString(true)]),
			})]),
			olderHost: describe([multiChat(undefined)]),
			malformed: describe([multiChat({ [SESSION_META_ISOLATED_CHAT_WORKTREES_KEY]: isolated })]),
		}, {
			marked: [{ path: '/work/vscode.worktrees/isolated', description: 'agents/isolated' }],
			otherForm: [{ path: '/work/vscode.worktrees/my wt', description: undefined }],
			olderHost: [],
			malformed: [],
		});
	});

	test('describes a worktree by its name and the branch its session reports, without one where it reports none', () => {
		const locations = getAgentHostSessionWorktrees([
			session('/work/vscode.worktrees/feature', '/work/vscode', { branchName: 'agents/feature' }),
			session('/work/vscode.worktrees/detached', '/work/vscode'),
		], primary);

		assert.deepStrictEqual(locations.map(({ uri, label, description, icon }) => ({ path: uri.path, label, description, icon: icon?.id })), [
			{ path: '/work/vscode.worktrees/feature', label: 'feature', description: 'agents/feature', icon: 'git-branch-checkout' },
			{ path: '/work/vscode.worktrees/detached', label: 'detached', description: undefined, icon: 'git-branch-checkout' },
		]);
	});

	test('offers the worktrees without waiting for the local agent host to list its sessions, which it asks once, nor reading more than the folder\'s real path', async () => {
		const loading = new DeferredPromise<void>();
		const provider = createProvider([session('/work/vscode.worktrees/feature', '/work/vscode')], { loading: loading.p });
		const service = createService(provider);
		const first = paths(await provider.provideLocations(primary, CancellationToken.None));
		const changed = Event.toPromise(service.onDidChangeLocations);
		await loading.complete();
		await changed;
		const offered = paths(await provider.provideLocations(primary, CancellationToken.None));

		assert.deepStrictEqual({ first, offered, listings: provider.listings(), realpathsRead: provider.realpathsRead }, { first: [], offered: ['/work/vscode.worktrees/feature'], listings: 1, realpathsRead: ['/work/vscode'] });
	});

	test('lists the local agent host\'s sessions again as a folder is next asked about after a listing that failed, not as anything else changes', async () => {
		const provider = createProvider([session('/work/vscode.worktrees/feature', '/work/vscode')], { listFailures: 1 });
		const service = createService(provider);
		let changes = 0;
		store.add(service.onDidChangeLocations(() => changes++));
		const failed = paths(await provider.provideLocations(primary, CancellationToken.None));
		await tick();
		const afterFailure = { changes, listings: provider.listings() };
		// Such as another folder's session that starts: no listing
		provider.changeSessions(sessions => sessions.push(session('/work/tools.worktrees/fix', '/work/tools')));
		await tick();
		const listingsOnChange = provider.listings();
		const changed = Event.toPromise(service.onDidChangeLocations);
		await provider.provideLocations(primary, CancellationToken.None);
		await changed;
		const recovered = paths(await provider.provideLocations(primary, CancellationToken.None));

		assert.deepStrictEqual({ failed, afterFailure, listingsOnChange, recovered, listings: provider.listings() }, {
			failed: [],
			afterFailure: { changes: 0, listings: 1 },
			listingsOnChange: 1,
			recovered: ['/work/vscode.worktrees/feature'],
			listings: 2,
		});
	});

	test('after a listing that failed, lists again as the local agent host\'s agents change, not as the rest of its state does, also where each change is asked about again', async () => {
		// Every listing fails, as long as the agent host cannot list its sessions
		const options = { listFailures: 6 };
		const provider = createProvider([session('/work/vscode.worktrees/feature', '/work/vscode')], options);
		const service = createService(provider);
		await provider.provideLocations(primary, CancellationToken.None);
		await tick();
		// Whoever shows the locations asks again as they change
		let changes = 0;
		store.add(service.onDidChangeLocations(() => {
			changes++;
			void service.getLocations(primary, CancellationToken.None);
		}));
		// Such as its terminals, configuration or active sessions changing: the same agents
		for (let change = 0; change < 5; change++) {
			provider.changeRootState(advertising('copilotcli'));
			await tick();
		}
		const unrelated = { changes, listings: provider.listings() };
		// It can list them again, and its agents change
		options.listFailures = 0;
		provider.changeRootState(advertising('copilotcli', 'claude'));
		await tick();

		assert.deepStrictEqual({ unrelated, listings: provider.listings(), offered: paths(await provider.provideLocations(primary, CancellationToken.None)) }, {
			unrelated: { changes: 0, listings: 1 },
			listings: 2,
			offered: ['/work/vscode.worktrees/feature'],
		});
	});

	test('lists the sessions of a folder asked about before the local agent host reported its agents once it does, without being asked again', async () => {
		const provider = createProvider([session('/work/vscode.worktrees/feature', '/work/vscode')], { started: false });
		await provider.provideLocations(primary, CancellationToken.None);
		await tick();
		const beforeStart = provider.listings();
		provider.changeRootState(advertising('copilotcli'));
		await tick();

		assert.deepStrictEqual({ beforeStart, listings: provider.listings(), offered: paths(await provider.provideLocations(primary, CancellationToken.None)) }, { beforeStart: 0, listings: 1, offered: ['/work/vscode.worktrees/feature'] });
	});

	test('is ready once it has listed the local agent host\'s sessions, which it tells, not while they load nor after a listing that failed', async () => {
		const loading = new DeferredPromise<void>();
		const provider = createProvider([session('/work/vscode.worktrees/feature', '/work/vscode')], { loading: loading.p, listFailures: 1 });
		const service = createService(provider);
		await provider.provideLocations(primary, CancellationToken.None);
		const whileLoading = service.areProvidersReady();
		await loading.complete();
		await tick();
		const afterFailure = service.areProvidersReady();
		const becameReady = Event.toPromise(Event.filter(service.onDidChangeLocations, () => service.areProvidersReady()));
		await provider.provideLocations(primary, CancellationToken.None);
		await becameReady;

		assert.deepStrictEqual({ whileLoading, afterFailure, ready: service.areProvidersReady() }, { whileLoading: false, afterFailure: false, ready: true });
	});

	test('resolves a worktree also before the local agent host\'s sessions are listed, such as to restore the folder\'s location, once they are', async () => {
		const loading = new DeferredPromise<void>();
		const provider = createProvider([session('/work/vscode.worktrees/feature', '/work/vscode', { branchName: 'feature' })], { loading: loading.p });
		let resolved: string | undefined;
		const resolving = provider.resolveLocation(primary, URI.file('/work/vscode.worktrees/feature'), CancellationToken.None).then(location => resolved = location?.description);
		await tick();
		const beforeLoad = resolved;
		await loading.complete();
		await resolving;
		const elsewhere = await provider.resolveLocation(primary, URI.file('/work/impostor'), CancellationToken.None);

		assert.deepStrictEqual({ beforeLoad, resolved, elsewhere, listings: provider.listings() }, { beforeLoad: undefined, resolved: 'feature', elsewhere: undefined, listings: 1 });
	});

	test('resolving never waits on what may not come: without a local agent host it is unknown at once, and a later provider resolves', async () => {
		const provider = createProvider([], { started: false });
		const other: IWorkspaceFolderLocationProvider = { id: 'other', provideLocations: async () => [], resolveLocation: async (_primary, location) => ({ uri: location, label: 'other' }) };
		const service = createService(provider, other);

		assert.deepStrictEqual({
			unknown: await provider.resolveLocation(primary, URI.file('/work/vscode.worktrees/feature'), CancellationToken.None),
			byLaterProvider: (await service.resolveLocation(primary, URI.file('/work/vscode.worktrees/feature'), CancellationToken.None))?.providerId,
			listings: provider.listings(),
		}, { unknown: undefined, byLaterProvider: 'other', listings: 0 });
	});

	test('resolving is unknown once its caller cancels or the provider is disposed, while it waits for the folder\'s real path or the sessions', async () => {
		const realpathHeld = new DeferredPromise<void>();
		const cancelled = createProvider([], { realpathHeld: realpathHeld.p });
		const cts = store.add(new CancellationTokenSource());
		const whileReadingRealpath = cancelled.resolveLocation(primary, URI.file('/work/vscode.worktrees/feature'), cts.token);
		cts.cancel();

		const loading = new DeferredPromise<void>();
		const disposed = createProvider([session('/work/vscode.worktrees/feature', '/work/vscode')], { loading: loading.p });
		const whileLoading = disposed.resolveLocation(primary, URI.file('/work/vscode.worktrees/feature'), CancellationToken.None);
		await tick();
		disposed.disposeProvider();

		assert.deepStrictEqual({ cancelled: await whileReadingRealpath, disposed: await whileLoading }, { cancelled: undefined, disposed: undefined });
		await realpathHeld.complete();
		await loading.complete();
	});

	test('tells the folder location service as the worktrees it offered change: as sessions are listed, start, report a branch or are archived, not as others change', async () => {
		const loading = new DeferredPromise<void>();
		const provider = createProvider([session('/work/vscode.worktrees/feature', '/work/vscode')], { loading: loading.p });
		const service = createService(provider);
		const offered: string[][] = [];
		store.add(service.onDidChangeLocations(async () => offered.push((await service.getLocations(primary, CancellationToken.None)).map(location => `${location.uri.path}${location.description ? ` (${location.description})` : ''}`))));
		const step = async (change?: (sessions: SessionSummary[]) => void) => {
			if (change) {
				provider.changeSessions(change);
			}
			await tick();
		};
		const before = paths(await service.getLocations(primary, CancellationToken.None));
		await loading.complete();
		await step();
		await step(sessions => sessions.push(session('/work/vscode.worktrees/fix', '/work/vscode')));
		await step(sessions => { sessions[0] = session('/work/vscode.worktrees/feature', '/work/vscode', { branchName: 'agents/feature' }); });
		await step(sessions => { sessions[1] = session('/work/vscode.worktrees/fix', '/work/vscode', { archived: true }); });
		// Another folder's session
		await step(sessions => sessions.push(session('/work/tools.worktrees/fix', '/work/tools')));

		assert.deepStrictEqual({ before, offered: offered.filter((locations, index) => index === 0 || JSON.stringify(locations) !== JSON.stringify(offered[index - 1])) }, {
			before: [],
			offered: [
				['/work/vscode.worktrees/feature'],
				['/work/vscode.worktrees/feature', '/work/vscode.worktrees/fix'],
				['/work/vscode.worktrees/feature (agents/feature)', '/work/vscode.worktrees/fix'],
				['/work/vscode.worktrees/feature (agents/feature)'],
			],
		});
	});

	test('reads the folder\'s real path again after a failed read, and once for a folder however it is written', async () => {
		const aliased = URI.file('/tmp/vscode');
		const provider = createProvider([session('/private/tmp/vscode.worktrees/feature', '/private/tmp/vscode')], { realpaths: { '/tmp/vscode': '/private/tmp/vscode' }, realpathFailures: 1, folders: [aliased] });
		const afterFailure = await provider.resolveLocation(aliased, URI.file('/private/tmp/vscode.worktrees/feature'), CancellationToken.None);
		const afterRetry = (await provider.resolveLocation(aliased, URI.file('/private/tmp/vscode.worktrees/feature'), CancellationToken.None))?.uri.path;
		await provider.resolveLocation(URI.file('/tmp/vscode/'), URI.file('/private/tmp/vscode.worktrees/feature'), CancellationToken.None);
		await provider.resolveLocation(URI.file('/tmp/./vscode'), URI.file('/private/tmp/vscode.worktrees/feature'), CancellationToken.None);

		assert.deepStrictEqual({ afterFailure, afterRetry, realpathsRead: provider.realpathsRead }, { afterFailure: undefined, afterRetry: '/private/tmp/vscode.worktrees/feature', realpathsRead: ['/tmp/vscode', '/tmp/vscode'] });
	});

	test('does not read a folder\'s real path again as sessions change after a failed read, only as the folder is asked about again', async () => {
		const provider = createProvider([], { realpathFailures: 1 });
		await provider.provideLocations(primary, CancellationToken.None);
		await tick();
		for (let change = 0; change < 3; change++) {
			// Such as a session that is read
			provider.changeSessions(sessions => sessions.push(session(`/work/other${change}`, undefined)));
			await tick();
		}
		const afterChanges = [...provider.realpathsRead];
		await provider.provideLocations(primary, CancellationToken.None);

		assert.deepStrictEqual({ afterChanges, afterAsk: provider.realpathsRead }, { afterChanges: ['/work/vscode'], afterAsk: ['/work/vscode', '/work/vscode'] });
	});

	test('forgets a folder the workspace no longer has, keeps nothing of one it does not have, and does nothing once disposed', async () => {
		const provider = createProvider([]);
		const service = createService(provider);
		await service.getLocations(primary, CancellationToken.None);
		await tick();
		let changes = 0;
		store.add(service.onDidChangeLocations(() => changes++));
		provider.openFolder(URI.file('/work/tools'));
		// A worktree of the folder that is retired
		provider.changeSessions(sessions => sessions.push(session('/work/vscode.worktrees/feature', '/work/vscode')));
		const afterRetiring = changes;
		// Answered without keeping anything of it, or reading its real path
		await service.getLocations(primary, CancellationToken.None);
		provider.changeSessions(sessions => sessions.push(session('/work/vscode.worktrees/other', '/work/vscode')));
		const afterAskingAgain = changes - afterRetiring;
		const realpathsRead = [...provider.realpathsRead];
		provider.disposeProvider();
		provider.changeSessions(sessions => sessions.push(session('/work/vscode.worktrees/fix', '/work/vscode')));

		assert.deepStrictEqual({ afterRetiring, afterAskingAgain, afterDispose: changes - afterRetiring - afterAskingAgain, realpathsRead }, { afterRetiring: 0, afterAskingAgain: 0, afterDispose: 0, realpathsRead: ['/work/vscode'] });
	});

	test('keeps what it knows of every folder of the workspace, however many: each tells of its changes, and its real path is read once', async () => {
		const roots = [1, 2, 3, 4, 5].map(index => URI.file(`/work/root${index}`));
		const provider = createProvider([session('/work/root1.worktrees/feature', '/work/root1')], { folders: roots });
		const service = createService(provider);
		for (let rotation = 0; rotation < 2; rotation++) {
			for (const root of roots) {
				await service.getLocations(root, CancellationToken.None);
				await tick();
			}
		}
		let changes = 0;
		store.add(service.onDidChangeLocations(() => changes++));
		provider.changeSessions(sessions => { sessions[0] = session('/work/root1.worktrees/feature', '/work/root1', { branchName: 'feature' }); });

		assert.deepStrictEqual({ changes, realpathsRead: provider.realpathsRead }, { changes: 1, realpathsRead: roots.map(root => root.path) });
	});

	test('grants the folder\'s trust only to a worktree of a session whose project is the folder, not to a folder of a session of another project', async () => {
		const provider = createProvider([
			session('/work/vscode.worktrees/feature', '/work/vscode'),
			session('/work/impostor', '/work/impostor'),
		]);
		// The workspace grants a location of a built-in provider the trust of the primary location
		const trusted: string[] = [];
		let current = primary;
		const workspaceEditingService = store.add(new (BrowserWorkspaceEditingService as unknown as new (...args: unknown[]) => BrowserWorkspaceEditingService)(
			undefined,
			{
				getWorkbenchState: () => WorkbenchState.FOLDER,
				getWorkspace: () => ({ folders: [{ uri: current }], uri: primary }),
				setFolderLocation: async (location: URI, o?: { onApplied?: () => void }) => { current = location; o?.onApplied?.(); return true; },
			},
			undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
			{ confirm: async () => ({ confirmed: false }) },
			undefined,
			{ extUri },
			{ isWorkspaceTrusted: () => true, getUriTrustInfo: async (uri: URI) => ({ trusted: extUri.isEqual(uri, primary) }), setUrisTrust: async (uris: URI[]) => { trusted.push(...uris.map(uri => uri.path)); } },
			undefined, undefined, undefined,
			{
				canSetLocation: () => true,
				resolveLocation: async (folder: URI, location: URI) => {
					const resolved = await provider.resolveLocation(folder, location, CancellationToken.None);
					return resolved && { ...resolved, providerId: AGENT_HOST_WORKTREE_LOCATIONS_PROVIDER_ID, builtIn: true };
				},
				setLocation: () => { },
			},
			{ isWorkspaceTrustEnabled: () => true }
		));
		const impostorMove = await workspaceEditingService.setFolderLocation(URI.file('/work/impostor')).then(() => 'moved', () => 'refused');
		const impostorTrusted = [...trusted];
		await workspaceEditingService.setFolderLocation(URI.file('/work/vscode.worktrees/feature'));

		assert.deepStrictEqual({ impostorMove, impostorTrusted, trusted }, { impostorMove: 'refused', impostorTrusted: [], trusted: ['/work/vscode.worktrees/feature'] });
	});
});
