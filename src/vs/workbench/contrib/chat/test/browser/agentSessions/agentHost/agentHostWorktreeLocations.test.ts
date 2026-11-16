/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { extUri } from '../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { UriIdentityService } from '../../../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspaceFolderLocationProvider } from '../../../../../../../platform/workspace/common/folderLocations.js';
import { WorkbenchState } from '../../../../../../../platform/workspace/common/workspace.js';
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

	/** A session of `providerType` working in `workingDirectoryPath`, whose agent host project is `projectPath`. */
	function session(workingDirectoryPath: string | undefined, projectPath: string | undefined, options: { readonly providerType?: string; readonly archived?: boolean; readonly branchName?: string } = {}): IAgentSession {
		return upcastPartial<IAgentSession>({
			providerType: options.providerType ?? SessionType.AgentHostCopilot,
			metadata: { workingDirectoryPath, projectPath, branchName: options.branchName },
			isArchived: () => options.archived ?? false,
		});
	}

	/**
	 * A provider over the sessions the sessions list has, and those it has only once the local agent host provider resolves,
	 * which `loading` holds. Without `registered`, the window has no local agent host's sessions. A folder in `realpaths` has
	 * that real path, read once `realpathHeld` completes; `realpathFailures` reads fail first.
	 */
	function createProvider(sessions: readonly IAgentSession[], options: { readonly uncached?: readonly IAgentSession[]; readonly loading?: Promise<void>; readonly registered?: boolean; readonly realpaths?: Record<string, string>; readonly realpathHeld?: Promise<void>; realpathFailures?: number } = {}) {
		const onDidResolve = store.add(new Emitter<string>());
		const onDidChangeSessions = store.add(new Emitter<void>());
		const resolving: string[] = [];
		const model = {
			sessions: [...sessions],
			onDidResolve: onDidResolve.event,
			onDidChangeSessions: onDidChangeSessions.event,
			resolve: async (providers: string[]) => {
				resolving.push(...providers);
				await options.loading;
				model.sessions.push(...options.uncached ?? []);
				providers.forEach(provider => onDidResolve.fire(provider));
				onDidChangeSessions.fire();
			},
		};
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({ model: upcastPartial<IAgentSessionsService['model']>(model) }));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({ getRegisteredChatSessionItemProviders: () => options.registered ?? true ? ['remote', SessionType.AgentHostCopilot] : ['remote'] }));
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
		// Another provider resolved first
		onDidResolve.fire('remote');
		/** As sessions change, such as one that starts, is archived or reports a branch. */
		const changeSessions = (change: (sessions: IAgentSession[]) => void) => {
			change(model.sessions);
			onDidChangeSessions.fire();
		};
		return Object.assign(provider, { resolving, realpathsRead, changeSessions, disposeProvider });
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

	test('a worktree of a folder is where a session works whose agent host project is the folder: not the folder itself, nor a folder inside it', () => {
		const offered = (...sessions: IAgentSession[]) => paths(getAgentHostSessionWorktrees(sessions, primary));

		assert.deepStrictEqual({
			projectIsFolder: offered(session('/work/vscode.worktrees/feature', '/work/vscode')),
			theFolderItself: offered(session('/work/vscode', '/work/vscode')),
			insideTheFolder: offered(session('/work/vscode/src', '/work/vscode')),
			anotherProject: offered(session('/work/tools.worktrees/fix', '/work/tools')),
			noProject: offered(session('/work/vscode.worktrees/feature', undefined)),
			archived: offered(session('/work/vscode.worktrees/feature', '/work/vscode', { archived: true })),
			localChat: offered(session('/work/vscode.worktrees/feature', '/work/vscode', { providerType: SessionType.Local })),
			extension: offered(session('/work/vscode.worktrees/feature', '/work/vscode', { providerType: SessionType.CopilotCLI })),
			// By normalized paths, one for each worktree
			normalizedOnce: offered(session('/work/vscode.worktrees/feature', '/work/vscode/'), session('/work/vscode.worktrees/./feature/', '/work/vscode')),
		}, {
			projectIsFolder: ['/work/vscode.worktrees/feature'],
			theFolderItself: [],
			insideTheFolder: [],
			anotherProject: [],
			noProject: [],
			archived: [],
			localChat: [],
			extension: [],
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
		], { realpaths: { '/tmp/vscode': '/private/tmp/vscode' }, realpathHeld: realpathHeld.p });
		// The first lookup does not wait for the real path: the worktree follows once it is known, which the folder location
		// service, and so whatever asks it, hears of
		const service = createService(provider);
		let changes = 0;
		store.add(service.onDidChangeLocations(() => changes++));
		const first = paths(await service.getLocations(aliased, CancellationToken.None));
		const changesBeforeRealpath = changes;
		// As a caller does: asks again once the service says the locations changed
		const changed = Event.toPromise(service.onDidChangeLocations);
		await realpathHeld.complete();
		await changed;
		const offered = paths(await service.getLocations(aliased, CancellationToken.None));
		const resolved = (await provider.resolveLocation(aliased, URI.file('/private/tmp/vscode.worktrees/feature'), CancellationToken.None))?.uri.path;

		assert.deepStrictEqual({ first, changesBeforeRealpath, changes, offered, resolved, realpathsRead: provider.realpathsRead }, {
			first: [],
			changesBeforeRealpath: 0,
			changes: 1,
			offered: ['/private/tmp/vscode.worktrees/feature'],
			resolved: '/private/tmp/vscode.worktrees/feature',
			realpathsRead: ['/tmp/vscode'],
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

	test('offers the worktrees of the sessions the sessions list has now, without making it resolve more or reading more than the folder\'s real path', async () => {
		const provider = createProvider([session('/work/vscode.worktrees/feature', '/work/vscode')], { uncached: [session('/work/vscode.worktrees/later', '/work/vscode')] });
		const offered = paths(await provider.provideLocations(primary, CancellationToken.None));

		assert.deepStrictEqual({ offered, resolving: provider.resolving, realpathsRead: provider.realpathsRead }, { offered: ['/work/vscode.worktrees/feature'], resolving: [], realpathsRead: ['/work/vscode'] });
	});

	test('resolves a worktree also before the sessions list resolves the local agent host\'s sessions, such as to restore the folder\'s location, once they load', async () => {
		const loading = new DeferredPromise<void>();
		const provider = createProvider([], { uncached: [session('/work/vscode.worktrees/feature', '/work/vscode', { branchName: 'feature' })], loading: loading.p });
		let resolved: string | undefined;
		const resolving = provider.resolveLocation(primary, URI.file('/work/vscode.worktrees/feature'), CancellationToken.None).then(location => resolved = location?.description);
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		const beforeLoad = resolved;
		await loading.complete();
		await resolving;
		const elsewhere = await provider.resolveLocation(primary, URI.file('/work/impostor'), CancellationToken.None);

		assert.deepStrictEqual({ beforeLoad, resolved, resolving: provider.resolving, elsewhere }, { beforeLoad: undefined, resolved: 'feature', resolving: [SessionType.AgentHostCopilot], elsewhere: undefined });
	});

	test('resolving never waits on what may not come: without a local agent host it is unknown at once, and a later provider resolves', async () => {
		const provider = createProvider([], { registered: false });
		const other: IWorkspaceFolderLocationProvider = { id: 'other', provideLocations: async () => [], resolveLocation: async (_primary, location) => ({ uri: location, label: 'other' }) };
		const service = createService(provider, other);

		assert.deepStrictEqual({
			unknown: await provider.resolveLocation(primary, URI.file('/work/vscode.worktrees/feature'), CancellationToken.None),
			byLaterProvider: (await service.resolveLocation(primary, URI.file('/work/vscode.worktrees/feature'), CancellationToken.None))?.providerId,
		}, { unknown: undefined, byLaterProvider: 'other' });
	});

	test('resolving is unknown once its caller cancels or the provider is disposed, while it waits for the folder\'s real path or the sessions', async () => {
		const realpathHeld = new DeferredPromise<void>();
		const cancelled = createProvider([], { realpathHeld: realpathHeld.p });
		const cts = store.add(new CancellationTokenSource());
		const whileReadingRealpath = cancelled.resolveLocation(primary, URI.file('/work/vscode.worktrees/feature'), cts.token);
		cts.cancel();

		const loading = new DeferredPromise<void>();
		const disposed = createProvider([], { uncached: [session('/work/vscode.worktrees/feature', '/work/vscode')], loading: loading.p });
		const whileLoading = disposed.resolveLocation(primary, URI.file('/work/vscode.worktrees/feature'), CancellationToken.None);
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		disposed.disposeProvider();

		assert.deepStrictEqual({ cancelled: await whileReadingRealpath, disposed: await whileLoading }, { cancelled: undefined, disposed: undefined });
		await realpathHeld.complete();
		await loading.complete();
	});

	test('tells the folder location service as the worktrees it offered change: as sessions load, start, report a branch or are archived, not as others change', async () => {
		const loading = new DeferredPromise<void>();
		const provider = createProvider([], { uncached: [session('/work/vscode.worktrees/feature', '/work/vscode')], loading: loading.p });
		const service = createService(provider);
		const offered: string[][] = [];
		store.add(service.onDidChangeLocations(async () => offered.push((await service.getLocations(primary, CancellationToken.None)).map(location => `${location.uri.path}${location.description ? ` (${location.description})` : ''}`))));
		const step = async (change?: (sessions: IAgentSession[]) => void) => {
			if (change) {
				provider.changeSessions(change);
			}
			await new Promise<void>(resolve => setTimeout(resolve, 0));
		};
		const before = paths(await service.getLocations(primary, CancellationToken.None));
		// The sessions load, as resolving a location makes them
		const resolving = provider.resolveLocation(primary, URI.file('/work/vscode.worktrees/other'), CancellationToken.None);
		await loading.complete();
		await resolving;
		await step();
		await step(sessions => sessions.push(session('/work/vscode.worktrees/fix', '/work/vscode')));
		await step(sessions => { sessions[0] = session('/work/vscode.worktrees/feature', '/work/vscode', { branchName: 'agents/feature' }); });
		await step(sessions => { sessions[1] = session('/work/vscode.worktrees/fix', '/work/vscode', { archived: true }); });
		// Another folder's session
		await step(sessions => sessions.push(session('/work/tools.worktrees/fix', '/work/tools')));

		assert.deepStrictEqual({ before, offered }, {
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
		const provider = createProvider([session('/private/tmp/vscode.worktrees/feature', '/private/tmp/vscode')], { realpaths: { '/tmp/vscode': '/private/tmp/vscode' }, realpathFailures: 1 });
		const aliased = URI.file('/tmp/vscode');
		const afterFailure = await provider.resolveLocation(aliased, URI.file('/private/tmp/vscode.worktrees/feature'), CancellationToken.None);
		const afterRetry = (await provider.resolveLocation(aliased, URI.file('/private/tmp/vscode.worktrees/feature'), CancellationToken.None))?.uri.path;
		await provider.resolveLocation(URI.file('/tmp/vscode/'), URI.file('/private/tmp/vscode.worktrees/feature'), CancellationToken.None);
		await provider.resolveLocation(URI.file('/tmp/./vscode'), URI.file('/private/tmp/vscode.worktrees/feature'), CancellationToken.None);

		assert.deepStrictEqual({ afterFailure, afterRetry, realpathsRead: provider.realpathsRead }, { afterFailure: undefined, afterRetry: '/private/tmp/vscode.worktrees/feature', realpathsRead: ['/tmp/vscode', '/tmp/vscode'] });
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
