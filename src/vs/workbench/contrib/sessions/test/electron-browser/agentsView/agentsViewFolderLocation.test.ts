/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ISessionChange, ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { SESSION_WORKTREE_ICON } from '../../../common/sessionWorktreeIcon.js';
import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { extUri } from '../../../../../../base/common/resources.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IContextKeyChangeEvent, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { FileOperationError, FileOperationResult, IFileContent, IFileService, IFileStatWithMetadata } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IFolderLocationChangeEvent, IResolvedFolderLocation, IWorkspaceFolderLocationProvider, IWorkspaceFolderLocationService } from '../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspace, IWorkspaceFoldersChangeEvent, IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { ISession, ISessionWorkspace } from '../../../../../services/sessions/common/session.js';
import { IWorkspaceEditingService } from '../../../../../services/workspaces/common/workspaceEditing.js';
import { BrowserWorkspaceEditingService } from '../../../../../services/workspaces/browser/workspaceEditingService.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { ITerminalService } from '../../../../terminal/browser/terminal.js';
import { AGENTS_VIEW_FOLDER_LOCATION_PROVIDER_ID, AgentsViewFolderLocationProvider, AgentsViewFolderLocationService } from '../../../browser/agentsView/agentsViewFolderLocation.js';
import { IAgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
import { AgentsViewLocationSessions } from '../../../browser/agentsView/agentsViewLocationSessions.js';

/** A context key service whose keys change as a test sets them, such as AI features being disabled. */
class ChangingContextKeyService extends MockContextKeyService {
	private readonly onDidChangeContextEmitter = new Emitter<IContextKeyChangeEvent>();
	override get onDidChangeContext() { return this.onDidChangeContextEmitter.event; }
	setValue(key: string, value: boolean): void {
		this.createKey(key, value);
		this.onDidChangeContextEmitter.fire(upcastPartial<IContextKeyChangeEvent>({ affectsSome: keys => keys.has(key) }));
	}
	override dispose(): void {
		this.onDidChangeContextEmitter.dispose();
	}
}

suite('AgentsViewFolderLocation', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** Files: a string is a file's content, `true` a directory, `false` one that fails to read. Folders listed in `folders` exist. */
	const entries: Record<string, string | boolean> = {
		'/work/vscode/.git': true,
		'/work/vscode.worktrees/feature/.git': 'gitdir: /work/vscode/.git/worktrees/feature\n',
		'/work/vscode/.git/worktrees/feature/gitdir': '/work/vscode.worktrees/feature/.git\n',
		'/work/vscode/.git/worktrees/feature/HEAD': 'ref: refs/heads/agents/feature\n',
		// A linked checkout at a detached commit, and one without HEAD
		'/work/vscode.worktrees/detached/.git': 'gitdir: /work/vscode/.git/worktrees/detached\n',
		'/work/vscode/.git/worktrees/detached/gitdir': '/work/vscode.worktrees/detached/.git\n',
		'/work/vscode/.git/worktrees/detached/HEAD': '0123456789abcdef0123456789abcdef01234567\n',
		'/work/vscode.worktrees/headless/.git': 'gitdir: /work/vscode/.git/worktrees/headless\n',
		'/work/vscode/.git/worktrees/headless/gitdir': '/work/vscode.worktrees/headless/.git\n',
		// Points into the primary's worktrees, but git's entry names another folder back
		'/work/forged/.git': 'gitdir: /work/vscode/.git/worktrees/feature\n',
		// Points to an entry that git does not have
		'/work/ghost/.git': 'gitdir: /work/vscode/.git/worktrees/ghost\n',
		'/work/other.worktrees/x/.git': 'gitdir: /work/other/.git/worktrees/x\n',
		// An ordinary checkout of another repository
		'/work/ordinary/.git': true,
		'/work/denied/.git': false,
	};
	const folders = ['/work/vscode', '/work/vscode/src', '/work/vscode.worktrees/feature', '/work/vscode.worktrees/detached', '/work/vscode.worktrees/headless', '/work/forged', '/work/ghost', '/work/other.worktrees/x', '/work/ordinary', '/work/plain', '/work/denied'];
	const lookup = (resource: URI) => {
		const entry = entries[resource.path];
		if (entry === false) {
			throw new FileOperationError('permission denied', FileOperationResult.FILE_PERMISSION_DENIED);
		}
		if (entry === undefined && !folders.includes(resource.path)) {
			throw new FileOperationError('not found', FileOperationResult.FILE_NOT_FOUND);
		}
		return entry;
	};
	let reads = 0;
	/** Holds reading whether a folder exists, per folder, until a test releases it. */
	const heldStats = new ResourceMap<DeferredPromise<void>>();
	teardown(() => heldStats.clear());
	const fileService = upcastPartial<IFileService>({
		stat: async (resource: URI) => {
			await heldStats.get(resource)?.p;
			return upcastPartial<IFileStatWithMetadata>({ isDirectory: (lookup(resource) ?? true) === true });
		},
		readFile: async (resource: URI) => {
			reads++;
			const entry = lookup(resource);
			if (typeof entry !== 'string') {
				throw new FileOperationError('not a file', FileOperationResult.FILE_IS_DIRECTORY);
			}
			return upcastPartial<IFileContent>({ value: VSBuffer.fromString(entry) });
		},
		realpath: async (resource: URI) => resource,
	});
	const labelService = upcastPartial<ILabelService>({ getUriLabel: (uri: URI) => uri.path });

	function sessionIn(path: string, repository?: string): ISession {
		const workspace = upcastPartial<ISessionWorkspace>({ folders: [{ root: URI.file(path), workingDirectory: URI.file(path), name: path, description: undefined, gitRepository: repository ? { uri: URI.file(repository) } : undefined }] as ISessionWorkspace['folders'] });
		return upcastPartial<ISession>({ resource: URI.parse(`session:${path}`), workspace: constObservable(workspace) });
	}

	/**
	 * The service, started, in a single-folder window at `/work/vscode` (or at `location` of it), with the real workspace
	 * editing service, whose resolving of a location waits for `resolution` when one is given.
	 */
	function createService(options?: { readonly location?: string; readonly cannotSetLocation?: boolean; readonly chatEnabled?: boolean; readonly resolution?: DeferredPromise<void>; readonly application?: DeferredPromise<void>; readonly storage?: InMemoryStorageService }) {
		const instantiationService = disposables.add(new TestInstantiationService());
		const contextKeyService = disposables.add(new ChangingContextKeyService());
		contextKeyService.createKey(ChatContextKeys.enabled.key, options?.chatEnabled ?? true);
		const primary = URI.file('/work/vscode');
		// Where the folder is: it follows the moves the workspace applies
		let at = options?.location ? URI.file(options.location) : undefined;
		/** The window's folders, while a test has changed them from the single movable folder. */
		let otherFolders: URI[] | undefined;
		const onDidChangeWorkspaceFolders = disposables.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const onDidChangeLocation = disposables.add(new Emitter<IFolderLocationChangeEvent>());
		const telemetry: string[] = [];
		const moves: string[] = [];
		const trusted: string[] = [];
		const notifications: string[] = [];
		let provider: IWorkspaceFolderLocationProvider | undefined;
		// The workspace's own location is the folder's primary location; it does not change as the folder moves
		const workspaceContextService = {
			getWorkbenchState: () => WorkbenchState.FOLDER,
			getWorkspace: () => otherFolders
				? upcastPartial<IWorkspace>({ uri: otherFolders.length ? URI.file('/work/multi.code-workspace') : undefined, folders: otherFolders.map(uri => upcastPartial<IWorkspaceFolder>({ uri })) })
				: upcastPartial<IWorkspace>({ uri: primary, folders: [upcastPartial<IWorkspaceFolder>({ uri: at ?? primary })] }),
			onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
			onDidChangeWorkbenchState: Event.None,
			// As the workspace applies a switch: queued, and skipped when no longer current as its turn comes
			setFolderLocation: async (location: URI, applyOptions?: { readonly isCurrent?: () => boolean; readonly onApplied?: () => void }) => {
				await options?.application?.p;
				if (otherFolders || applyOptions?.isCurrent?.() === false) {
					return;
				}
				const toPrimary = extUri.isEqual(location, primary);
				moves.push(toPrimary ? 'primary' : location.path);
				at = toPrimary ? undefined : location;
				applyOptions?.onApplied?.();
			},
		};
		const folderLocationService = {
			canSetLocation: () => !options?.cannotSetLocation && !otherFolders,
			isAtAlternateLocation: (folder: IWorkspaceFolder) => !!at && !otherFolders && extUri.isEqual(folder.uri, at),
			onDidChangeLocation: onDidChangeLocation.event,
			getLocation: () => at && upcastPartial<IResolvedFolderLocation>({ uri: at, providerId: AGENTS_VIEW_FOLDER_LOCATION_PROVIDER_ID }),
			registerProvider: (registered: IWorkspaceFolderLocationProvider) => { provider = registered; return toDisposable(() => provider = undefined); },
			resolveLocation: async (from: URI, location: URI) => {
				await options?.resolution?.p;
				const resolved = await provider?.resolveLocation(from, location, CancellationToken.None);
				return resolved && { ...resolved, providerId: provider!.id, builtIn: true };
			},
			setLocation: (folder: IWorkspaceFolder) => onDidChangeLocation.fire({ folder, reason: 'user' }),
		};
		// The real one: only its latest request applies
		const workspaceEditingService = disposables.add(new (BrowserWorkspaceEditingService as unknown as new (...args: unknown[]) => BrowserWorkspaceEditingService)(
			undefined, workspaceContextService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
			{ extUri }, { isWorkspaceTrusted: () => true, getUriTrustInfo: async () => ({ trusted: true }), setUrisTrust: async (uris: URI[]) => { trusted.push(...uris.map(uri => uri.path)); } }, undefined, undefined, undefined, folderLocationService,
			{ isWorkspaceTrustEnabled: () => true }));

		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILabelService, labelService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, upcastPartial<ITelemetryService>({ publicLog2: (_event: string, data?: object) => { telemetry.push(Object.values(data ?? {}).join(':')); } }));
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ remoteAuthority: undefined }));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({
			info: (message: string) => { notifications.push(`info: ${message}`); return undefined!; },
			error: (message: string) => { notifications.push(`error: ${message.split(':')[0]}`); },
		}));
		instantiationService.stub(ITerminalService, upcastPartial<ITerminalService>({ instances: [], onDidCreateInstance: Event.None }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>(workspaceContextService));
		instantiationService.stub(IWorkspaceEditingService, workspaceEditingService);
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>(folderLocationService));
		instantiationService.stub(IStorageService, options?.storage ?? disposables.add(new InMemoryStorageService()));
		const sessionsChanged = disposables.add(new Emitter<readonly ISessionChange[]>());
		const sessionReplaced = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({ onDidChangeSession: sessionsChanged.event, onDidReplaceSession: sessionReplaced.event }));

		const service = disposables.add(instantiationService.createInstance(AgentsViewFolderLocationService));
		service.start();
		const setFolders = (folders: URI[]) => { otherFolders = folders; onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] }); };
		return { service, workspaceEditingService, moves, trusted, notifications, telemetry, setFolders, removeSession: (session: ISession) => sessionsChanged.fire([{ session, kind: 'removed' }]), replaceSession: (from: ISession, to: ISession) => sessionReplaced.fire({ from, to }), hasProvider: () => !!provider, setChatEnabled: (enabled: boolean) => contextKeyService.setValue(ChatContextKeys.enabled.key, enabled) };
	}

	/** The recall of a location's last session over `service`, with a chat part that moves the folder as it opens a session, unless asked to keep it. */
	function createRecall(service: AgentsViewFolderLocationService, sessions: ISession[]) {
		const onDidChangeLocation = disposables.add(new Emitter<IFolderLocationChangeEvent>());
		const opened: string[] = [];
		disposables.add(new AgentsViewLocationSessions(
			upcastPartial<IWorkspaceFolderLocationService>({ onDidChangeLocation: onDidChangeLocation.event }),
			service,
			upcastPartial<ISessionsManagementService>({ getSession: resource => sessions.find(session => session.resource.toString() === resource.toString()) }),
			upcastPartial<IAgentsChatPartService>({ openChat: async (session, _chat, options) => { opened.push(session.resource.toString()); if (!options?.keepFolder) { await service.switchToSession(session); } } }),
			upcastPartial<IContextKeyService>({ getContextKeyValue: <T>() => true as T }),
		));
		const pick = async (path: string) => {
			onDidChangeLocation.fire({ folder: upcastPartial<IWorkspaceFolder>({ uri: URI.file(path) }), reason: 'user' });
			await timeout(0);
		};
		return { opened, pick };
	}

	test('a linked checkout shows with the worktree icon of the composer\'s folder picker and the Sessions list\'s Worktree sections', async () => {
		const provider = new AgentsViewFolderLocationProvider(fileService, new NullLogService());

		const location = await provider.resolveLocation(URI.file('/work/vscode'), URI.file('/work/vscode.worktrees/feature'), CancellationToken.None);

		assert.strictEqual(location?.icon, SESSION_WORKTREE_ICON);
	});

	test('a linked checkout is described by its branch, the short commit of a detached HEAD, or nothing without HEAD', async () => {
		const provider = new AgentsViewFolderLocationProvider(fileService, new NullLogService());
		const describe = async (name: string) => (await provider.resolveLocation(URI.file('/work/vscode'), URI.file(`/work/vscode.worktrees/${name}`), CancellationToken.None))?.description;

		assert.deepStrictEqual({ branch: await describe('feature'), detached: await describe('detached'), withoutHead: await describe('headless') }, { branch: 'agents/feature', detached: '0123456', withoutHead: undefined });
	});

	test('the locations of a folder are its linked checkouts, read with the primary\'s real path once, also past one that fails to read, and none once cancelled', async () => {
		const realpaths: string[] = [];
		const listing = upcastPartial<IFileService>({
			...fileService,
			resolve: async (resource: URI) => upcastPartial<IFileStatWithMetadata>({
				children: resource.path === '/work/vscode/.git/worktrees'
					? ['feature', 'broken', 'detached', 'headless'].map(name => upcastPartial<IFileStatWithMetadata>({ resource: URI.file(`/work/vscode/.git/worktrees/${name}`), isDirectory: true }))
					: [],
			}),
			realpath: async (resource: URI) => { realpaths.push(resource.path); return resource; },
			// A worktree that fails to read, as one whose folder another process removes
			readFile: async (resource: URI) => {
				if (resource.path === '/work/vscode/.git/worktrees/broken/gitdir') {
					throw new Error('EIO');
				}
				return fileService.readFile(resource);
			},
		});
		const provider = new AgentsViewFolderLocationProvider(listing, new NullLogService());
		const locations = (await provider.provideLocations(URI.file('/work/vscode'), CancellationToken.None)).map(location => location.label);
		const primaryRealpaths = realpaths.filter(path => path === '/work/vscode').length;
		const cancellation = new CancellationTokenSource();
		cancellation.cancel();
		const cancelled = await provider.provideLocations(URI.file('/work/vscode'), cancellation.token);
		cancellation.dispose();

		assert.deepStrictEqual({ locations, primaryRealpaths, cancelled }, { locations: ['feature', 'detached', 'headless'], primaryRealpaths: 1, cancelled: [] });
	});

	test('the alternate locations of a folder are its linked checkouts, which git links both ways', async () => {
		const provider = new AgentsViewFolderLocationProvider(fileService, new NullLogService());
		const resolve = async (path: string) => (await provider.resolveLocation(URI.file('/work/vscode'), URI.file(path), CancellationToken.None))?.label ?? 'none';

		assert.deepStrictEqual({
			linked: await resolve('/work/vscode.worktrees/feature'),
			itself: await resolve('/work/vscode'),
			forgedWithoutBacklink: await resolve('/work/forged'),
			entryGitDoesNotHave: await resolve('/work/ghost'),
			otherRepository: await resolve('/work/other.worktrees/x'),
			ordinaryCheckout: await resolve('/work/ordinary'),
			plain: await resolve('/work/plain'),
			unreadable: await resolve('/work/denied').then(() => 'read', () => 'throws'),
		}, { linked: 'feature', itself: 'none', forgedWithoutBacklink: 'none', entryGitDoesNotHave: 'none', otherRepository: 'none', ordinaryCheckout: 'none', plain: 'none', unreadable: 'throws' });
	});

	test('opening a session moves the folder to its linked checkout or back, and keeps it for a session elsewhere, a missing or unreadable folder', async () => {
		const moved = async (session: ISession, options?: Parameters<typeof createService>[0]) => {
			const { service, moves, notifications } = createService(options);
			await service.switchToSession(session);
			return [...moves, ...notifications].join(', ') || 'none';
		};

		assert.deepStrictEqual({
			toLinked: await moved(sessionIn('/work/vscode.worktrees/feature')),
			inFolder: await moved(sessionIn('/work/vscode/src')),
			backToPrimary: await moved(sessionIn('/work/vscode'), { location: '/work/vscode.worktrees/feature' }),
			elsewhere: await moved(sessionIn('/work/plain')),
			ordinaryCheckout: await moved(sessionIn('/work/ordinary')),
			missing: await moved(sessionIn('/work/vscode.worktrees/gone', '/work/vscode')),
			unreadable: await moved(sessionIn('/work/denied')),
			multiRoot: await moved(sessionIn('/work/vscode.worktrees/feature'), { cannotSetLocation: true }),
			aiDisabled: await moved(sessionIn('/work/vscode.worktrees/feature'), { chatEnabled: false }),
		}, {
			toLinked: '/work/vscode.worktrees/feature',
			inFolder: 'primary',
			backToPrimary: 'primary',
			elsewhere: 'primary',
			ordinaryCheckout: 'primary',
			missing: 'primary, info: The folder /work/vscode.worktrees/gone of this session no longer exists.',
			unreadable: 'primary, error: Could not move the folder to /work/denied',
			multiRoot: 'none',
			aiDisabled: 'none',
		});
	});

	test('a working directory that is no location is read once, a failed read again', async () => {
		const { service } = createService();
		const readsOf = async (path: string) => {
			const before = reads;
			await service.switchToSession(sessionIn(path));
			await service.switchToSession(sessionIn(path));
			return reads - before;
		};

		assert.deepStrictEqual({ elsewhere: await readsOf('/work/plain'), ordinaryCheckout: await readsOf('/work/ordinary'), failing: await readsOf('/work/denied') }, { elsewhere: 1, ordinaryCheckout: 1, failing: 2 });
	});

	test('a failure is reported where the open starts, which does not reject', async () => {
		const { service, notifications } = createService();
		const broken = upcastPartial<ISession>({ workspace: upcastPartial<ISession['workspace']>({ read: () => { throw new Error('broken'); } }) });

		const result = await service.switchToSession(broken).then(() => 'resolved', () => 'rejected');

		assert.deepStrictEqual({ result, notifications }, { result: 'resolved', notifications: ['error: Could not move the folder to the location of the session'] });
	});

	test('remembers the session last picked at each location of the folder, also after a reload, and forgets a deleted one', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const { service, removeSession } = createService({ storage });
		const atWorktree = sessionIn('/work/vscode.worktrees/feature');
		const atFolder = sessionIn('/work/vscode/src');
		const last = (svc: typeof service, path: string) => svc.getLastSession(URI.file(path))?.toString() ?? 'none';

		await service.switchToSession(atWorktree);
		await service.switchToSession(atFolder);
		const picked = { worktree: last(service, '/work/vscode.worktrees/feature'), folder: last(service, '/work/vscode') };
		const reloaded = createService({ storage }).service;
		const afterReload = { worktree: last(reloaded, '/work/vscode.worktrees/feature'), folder: last(reloaded, '/work/vscode') };
		removeSession(atWorktree);

		assert.deepStrictEqual({ picked, afterReload, afterDelete: last(service, '/work/vscode.worktrees/feature') }, {
			picked: { worktree: atWorktree.resource.toString(), folder: atFolder.resource.toString() },
			afterReload: { worktree: atWorktree.resource.toString(), folder: atFolder.resource.toString() },
			afterDelete: 'none',
		});
	});

	test('a session the user opens again stays the most recent, so it is not the one to go once there are too many', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const atFolder = sessionIn('/work/vscode/src');
		// The folder's own session is the oldest of a full list
		const stored = [[URI.file('/work/vscode').toString(), atFolder.resource.toString()], ...Array.from({ length: 19 }, (_, index) => [URI.file(`/work/other${index}`).toString(), `session:/other${index}`])];
		storage.store('agentsView.folderLocation.lastSessions', JSON.stringify(stored), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const { service } = createService({ storage });

		await service.switchToSession(atFolder);
		await service.switchToSession(sessionIn('/work/vscode.worktrees/feature'));

		assert.deepStrictEqual({
			folder: service.getLastSession(URI.file('/work/vscode'))?.toString(),
			oldest: service.getLastSession(URI.file('/work/other0'))?.toString(),
		}, { folder: atFolder.resource.toString(), oldest: undefined });
	});

	test('a location the user picks again, which shows its last session, stays the most recent, so it is not the one to go once there are too many', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const atFolder = sessionIn('/work/vscode/src');
		// The folder's own session is the oldest of a full list
		const stored = [[URI.file('/work/vscode').toString(), atFolder.resource.toString()], ...Array.from({ length: 19 }, (_, index) => [URI.file(`/work/other${index}`).toString(), `session:/other${index}`])];
		storage.store('agentsView.folderLocation.lastSessions', JSON.stringify(stored), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const { service, moves } = createService({ storage });
		const { opened, pick } = createRecall(service, [atFolder]);

		await pick('/work/vscode');
		await service.switchToSession(sessionIn('/work/vscode.worktrees/feature'));

		assert.deepStrictEqual({
			opened,
			moves,
			folder: service.getLastSession(URI.file('/work/vscode'))?.toString(),
			oldest: service.getLastSession(URI.file('/work/other0'))?.toString(),
		}, { opened: [atFolder.resource.toString()], moves: ['/work/vscode.worktrees/feature'], folder: atFolder.resource.toString(), oldest: undefined });
	});

	test('a session that a provider replaces stays the last one of its location; a deleted one does not', async () => {
		const { service, replaceSession, removeSession } = createService();
		const atWorktree = sessionIn('/work/vscode.worktrees/feature');
		const rebound = { ...atWorktree, resource: URI.parse('session:/rebound') };
		const last = () => service.getLastSession(URI.file('/work/vscode.worktrees/feature'))?.toString() ?? 'none';

		await service.switchToSession(atWorktree);
		// As providers do: the replacement first, then the replaced session's removal
		replaceSession(atWorktree, rebound);
		removeSession(atWorktree);
		const afterRebind = last();
		removeSession(rebound);

		assert.deepStrictEqual({ afterRebind, afterDelete: last() }, { afterRebind: rebound.resource.toString(), afterDelete: 'none' });
	});

	test('a session that comes to work in a new worktree is that worktree\'s last session only: returning to the folder shows nothing and stays', async () => {
		const { service, moves } = createService();
		const atFolder = sessionIn('/work/vscode/src');
		const inWorktree = { ...atFolder, workspace: sessionIn('/work/vscode.worktrees/feature').workspace };
		const { opened, pick } = createRecall(service, [inWorktree]);

		// The session opens at the folder, then its agent moves it into a new worktree, which the folder follows
		await service.switchToSession(atFolder);
		await service.switchToSession(inWorktree);
		const followed = moves.splice(0);
		await pick('/work/vscode');
		const returned = { opened: opened.splice(0), moves: moves.splice(0) };
		await pick('/work/vscode.worktrees/feature');

		assert.deepStrictEqual({ followed, returned, picked: { opened, moves } }, {
			followed: ['primary', '/work/vscode.worktrees/feature'],
			returned: { opened: [], moves: [] },
			picked: { opened: [atFolder.resource.toString()], moves: [] },
		});
	});

	test('a later open that keeps the folder where it is supersedes an earlier move still under way', async () => {
		const resolution = new DeferredPromise<void>();
		const { service, moves, trusted } = createService({ resolution });

		// The move to the linked checkout waits inside the workspace's resolving, before it grants trust
		const pending = service.switchToSession(sessionIn('/work/vscode.worktrees/feature'));
		await timeout(0);
		await service.switchToSession(sessionIn('/work/vscode/src'));
		resolution.complete();
		await pending;

		assert.deepStrictEqual({ moves, trusted }, { moves: ['primary'], trusted: [] });
	});

	test('an automatic switch, such as following a tab\'s session or a composer\'s first send, gives way to a switch under way; one the user asks for supersedes it', async () => {
		/** Holds a switch the user picked in the window's title (to the linked checkout) inside the workspace, then completes `then` and the switch. */
		const whileSwitching = async (then: (service: AgentsViewFolderLocationService) => Promise<void>) => {
			const resolution = new DeferredPromise<void>();
			const { service, workspaceEditingService, moves } = createService({ resolution });
			const manual = workspaceEditingService.setFolderLocation(URI.file('/work/vscode.worktrees/feature'), { reason: 'user' });
			await timeout(0);
			const done = then(service);
			resolution.complete();
			await Promise.all([manual, done]);
			return moves;
		};
		/** Holds a switch the user asked of the service (to the linked checkout), then completes `then` and the switch. */
		const whileServiceSwitching = async (then: (service: AgentsViewFolderLocationService) => Promise<void>) => {
			const resolution = new DeferredPromise<void>();
			const { service, moves } = createService({ resolution });
			const manual = service.switchToSession(sessionIn('/work/vscode.worktrees/feature'));
			await timeout(0);
			const done = then(service);
			resolution.complete();
			await Promise.all([manual, done]);
			return moves;
		};

		assert.deepStrictEqual({
			// (a) a followed tab's session that comes to work in another linked checkout, (b) a composer's first send there
			followedTab: await whileSwitching(service => service.switchToSession(sessionIn('/work/vscode.worktrees/detached'), { automatic: true })),
			composerSend: await whileSwitching(service => service.switchToSession(sessionIn('/work/vscode.worktrees/headless'), { automatic: true })),
			// Keeping the folder where it is does not ask the workspace, which would supersede the user's switch
			keepCurrent: await whileSwitching(service => service.switchToSession(sessionIn('/work/vscode/src'), { automatic: true })),
			ofTheService: await whileServiceSwitching(service => service.switchToSession(sessionIn('/work/vscode.worktrees/detached'), { automatic: true })),
			// A tab the user picks supersedes the switch under way
			tabPick: await whileSwitching(service => service.switchToSession(sessionIn('/work/vscode.worktrees/detached'))),
		}, {
			followedTab: ['/work/vscode.worktrees/feature'],
			composerSend: ['/work/vscode.worktrees/feature'],
			keepCurrent: ['/work/vscode.worktrees/feature'],
			ofTheService: ['/work/vscode.worktrees/feature'],
			tabPick: ['/work/vscode.worktrees/detached'],
		});
	});

	test('an automatic switch that read where its session works while the user switched the folder does not apply after that switch completed, in either order', async () => {
		/** An automatic switch to the detached checkout, whose reading where its session works waits, and the user's switch to the linked checkout. */
		const race = async (userFirst: boolean) => {
			const { service, workspaceEditingService, moves, telemetry } = createService();
			const read = new DeferredPromise<void>();
			heldStats.set(URI.file('/work/vscode.worktrees/detached'), read);
			const user = () => workspaceEditingService.setFolderLocation(URI.file('/work/vscode.worktrees/feature'), { reason: 'user' });
			let manual = userFirst ? user() : undefined;
			const automatic = service.switchToSession(sessionIn('/work/vscode.worktrees/detached'), { automatic: true });
			await timeout(0);
			manual ??= user();
			await manual;
			read.complete();
			await automatic;
			return { moves, telemetry };
		};

		assert.deepStrictEqual({ automaticFirst: await race(false), userFirst: await race(true) }, {
			automaticFirst: { moves: ['/work/vscode.worktrees/feature'], telemetry: ['toAlternate:superseded'] },
			userFirst: { moves: ['/work/vscode.worktrees/feature'], telemetry: ['toAlternate:superseded'] },
		});
	});

	test('an automatic return that the window turns multi-root or empty during is not taken for applied, and does not change the last sessions', async () => {
		const returning = async (folders: URI[]) => {
			const application = new DeferredPromise<void>();
			const { service, moves, telemetry, setFolders } = createService({ location: '/work/vscode.worktrees/feature', application });
			const automatic = service.switchToSession(sessionIn('/work/vscode/src'), { automatic: true });
			await timeout(0);
			setFolders(folders);
			application.complete();
			await automatic;
			return { moves, telemetry, last: service.getLastSession(URI.file('/work/vscode'))?.toString() ?? null };
		};

		assert.deepStrictEqual({ multiRoot: await returning([URI.file('/work/vscode'), URI.file('/work/plain')]), empty: await returning([]) }, {
			multiRoot: { moves: [], telemetry: ['toPrimary:superseded'], last: null },
			empty: { moves: [], telemetry: ['toPrimary:superseded'], last: null },
		});
	});

	test('an automatic switch moves the folder when no other switch is under way, and asks nothing to keep it where it is', async () => {
		const { service, moves } = createService();

		await service.switchToSession(sessionIn('/work/vscode/src'), { automatic: true });
		const kept = moves.splice(0);
		await service.switchToSession(sessionIn('/work/vscode.worktrees/feature'), { automatic: true });

		assert.deepStrictEqual({ kept, moved: moves, last: service.getLastSession(URI.file('/work/vscode.worktrees/feature'))?.toString() }, { kept: [], moved: ['/work/vscode.worktrees/feature'], last: sessionIn('/work/vscode.worktrees/feature').resource.toString() });
	});

	test('disabling AI features stops offering locations, cancels a move under way, and returns the folder from a session\'s location', async () => {
		const resolution = new DeferredPromise<void>();
		const pendingMove = createService({ resolution });
		const pending = pendingMove.service.switchToSession(sessionIn('/work/vscode.worktrees/feature'));
		await timeout(0);
		pendingMove.setChatEnabled(false);
		resolution.complete();
		await pending;
		await timeout(0);

		const atLocation = createService({ location: '/work/vscode.worktrees/feature' });
		atLocation.setChatEnabled(false);
		await timeout(0);

		assert.deepStrictEqual({
			pending: { moves: pendingMove.moves, offers: pendingMove.hasProvider() },
			atLocation: atLocation.moves,
		}, { pending: { moves: ['primary'], offers: false }, atLocation: ['primary'] });
	});
});
