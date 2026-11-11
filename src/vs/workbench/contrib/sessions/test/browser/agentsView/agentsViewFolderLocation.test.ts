/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { extUri } from '../../../../../../base/common/resources.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
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
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IResolvedFolderLocation, IWorkspaceFolderLocationProvider, IWorkspaceFolderLocationService } from '../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { ISession, ISessionWorkspace } from '../../../../../services/sessions/common/session.js';
import { IWorkspaceEditingService } from '../../../../../services/workspaces/common/workspaceEditing.js';
import { BrowserWorkspaceEditingService } from '../../../../../services/workspaces/browser/workspaceEditingService.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { ITerminalService } from '../../../../terminal/browser/terminal.js';
import { AGENTS_VIEW_FOLDER_LOCATION_PROVIDER_ID, AgentsViewFolderLocationProvider, AgentsViewFolderLocationService } from '../../../browser/agentsView/agentsViewFolderLocation.js';

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
		// Points into the primary's worktrees, but git's entry names another folder back
		'/work/forged/.git': 'gitdir: /work/vscode/.git/worktrees/feature\n',
		// Points to an entry that git does not have
		'/work/ghost/.git': 'gitdir: /work/vscode/.git/worktrees/ghost\n',
		'/work/other.worktrees/x/.git': 'gitdir: /work/other/.git/worktrees/x\n',
		'/work/denied/.git': false,
	};
	const folders = ['/work/vscode', '/work/vscode/src', '/work/vscode.worktrees/feature', '/work/forged', '/work/ghost', '/work/other.worktrees/x', '/work/plain', '/work/denied'];
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
	const fileService = upcastPartial<IFileService>({
		stat: async (resource: URI) => upcastPartial<IFileStatWithMetadata>({ isDirectory: (lookup(resource) ?? true) === true }),
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
		return upcastPartial<ISession>({ workspace: constObservable(workspace) });
	}

	/**
	 * The service, started, in a single-folder window at `/work/vscode` (or at `location` of it), with the real workspace
	 * editing service, whose resolving of a location waits for `resolution` when one is given.
	 */
	function createService(options?: { readonly location?: string; readonly workbenchState?: WorkbenchState; readonly chatEnabled?: boolean; readonly resolution?: DeferredPromise<void> }) {
		const instantiationService = disposables.add(new TestInstantiationService());
		const contextKeyService = disposables.add(new ChangingContextKeyService());
		contextKeyService.createKey(ChatContextKeys.enabled.key, options?.chatEnabled ?? true);
		const primary = URI.file('/work/vscode');
		const folder = upcastPartial<IWorkspaceFolder>({ uri: options?.location ? URI.file(options.location) : primary, primaryUri: options?.location ? primary : undefined });
		const moves: string[] = [];
		const notifications: string[] = [];
		let provider: IWorkspaceFolderLocationProvider | undefined;
		const currentLocation = options?.location ? upcastPartial<IResolvedFolderLocation>({ uri: URI.file(options.location), providerId: AGENTS_VIEW_FOLDER_LOCATION_PROVIDER_ID }) : undefined;
		const workspaceContextService = {
			getWorkbenchState: () => options?.workbenchState ?? WorkbenchState.FOLDER,
			getWorkspace: () => upcastPartial<IWorkspace>({ folders: [folder] }),
			onDidChangeWorkspaceFolders: Event.None,
			setFolderLocation: async (_primary: URI, location: URI | undefined) => { moves.push(location ? location.path : 'primary'); },
		};
		const folderLocationService = {
			currentLocation,
			registerProvider: (registered: IWorkspaceFolderLocationProvider) => { provider = registered; return toDisposable(() => provider = undefined); },
			resolveLocation: async (from: URI, location: URI) => {
				await options?.resolution?.p;
				const resolved = await provider?.resolveLocation(from, location, CancellationToken.None);
				return resolved && { ...resolved, providerId: provider!.id, builtIn: true };
			},
			setCurrentLocation: () => { },
		};
		// The real one: only its latest request applies
		const workspaceEditingService = disposables.add(new (BrowserWorkspaceEditingService as unknown as new (...args: unknown[]) => BrowserWorkspaceEditingService)(
			undefined, workspaceContextService, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
			{ extUri }, { getUriTrustInfo: async () => ({ trusted: true }), setUrisTrust: async () => { } }, undefined, undefined, undefined, folderLocationService));

		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILabelService, labelService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ remoteAuthority: undefined }));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({
			info: (message: string) => { notifications.push(`info: ${message}`); return undefined!; },
			error: (message: string) => { notifications.push(`error: ${message.split(':')[0]}`); },
		}));
		instantiationService.stub(ITerminalService, upcastPartial<ITerminalService>({ instances: [], onDidCreateInstance: Event.None }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>(workspaceContextService));
		instantiationService.stub(IWorkspaceEditingService, workspaceEditingService);
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>(folderLocationService));

		const service = disposables.add(instantiationService.createInstance(AgentsViewFolderLocationService));
		service.start();
		return { service, moves, notifications, hasProvider: () => !!provider, setChatEnabled: (enabled: boolean) => contextKeyService.setValue(ChatContextKeys.enabled.key, enabled) };
	}

	test('the alternate locations of a folder are its linked checkouts, which git links both ways', async () => {
		const provider = new AgentsViewFolderLocationProvider(fileService, labelService);
		const resolve = async (path: string) => (await provider.resolveLocation(URI.file('/work/vscode'), URI.file(path), CancellationToken.None))?.label ?? 'none';

		assert.deepStrictEqual({
			linked: await resolve('/work/vscode.worktrees/feature'),
			itself: await resolve('/work/vscode'),
			forgedWithoutBacklink: await resolve('/work/forged'),
			entryGitDoesNotHave: await resolve('/work/ghost'),
			otherRepository: await resolve('/work/other.worktrees/x'),
			plain: await resolve('/work/plain'),
			unreadable: await resolve('/work/denied').then(() => 'read', () => 'throws'),
		}, { linked: 'feature', itself: 'none', forgedWithoutBacklink: 'none', entryGitDoesNotHave: 'none', otherRepository: 'none', plain: 'none', unreadable: 'throws' });
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
			missing: await moved(sessionIn('/work/vscode.worktrees/gone', '/work/vscode')),
			unreadable: await moved(sessionIn('/work/denied')),
			multiRoot: await moved(sessionIn('/work/vscode.worktrees/feature'), { workbenchState: WorkbenchState.WORKSPACE }),
			aiDisabled: await moved(sessionIn('/work/vscode.worktrees/feature'), { chatEnabled: false }),
		}, {
			toLinked: '/work/vscode.worktrees/feature',
			inFolder: 'primary',
			backToPrimary: 'primary',
			elsewhere: 'primary',
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

		assert.deepStrictEqual({ elsewhere: await readsOf('/work/plain'), failing: await readsOf('/work/denied') }, { elsewhere: 1, failing: 2 });
	});

	test('a later open that keeps the folder where it is supersedes an earlier move still under way', async () => {
		const resolution = new DeferredPromise<void>();
		const { service, moves } = createService({ resolution });

		const pending = service.switchToSession(sessionIn('/work/vscode.worktrees/feature'));
		await timeout(0);
		await service.switchToSession(sessionIn('/work/vscode/src'));
		resolution.complete();
		await pending;

		assert.deepStrictEqual(moves, ['primary']);
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
