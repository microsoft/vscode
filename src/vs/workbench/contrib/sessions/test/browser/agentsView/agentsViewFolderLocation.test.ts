/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
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

	/** `.git` entries: a string is a `.git` file's content, `true` a `.git` directory. Folders listed in `folders` exist. */
	const entries: Record<string, string | boolean> = {
		'/work/vscode/.git': true,
		'/work/vscode.worktrees/feature/.git': 'gitdir: /work/vscode/.git/worktrees/feature\n',
		'/work/other.worktrees/x/.git': 'gitdir: /work/other/.git/worktrees/x\n',
	};
	const folders = ['/work/vscode', '/work/vscode/src', '/work/vscode.worktrees/feature', '/work/other.worktrees/x', '/work/plain'];
	const fileService = upcastPartial<IFileService>({
		stat: async (resource: URI) => {
			const entry = entries[resource.path];
			if (entry === undefined && !folders.includes(resource.path)) {
				throw new FileOperationError('not found', FileOperationResult.FILE_NOT_FOUND);
			}
			return upcastPartial<IFileStatWithMetadata>({ isDirectory: entry !== undefined ? entry === true : true });
		},
		readFile: async (resource: URI) => upcastPartial<IFileContent>({ value: VSBuffer.fromString(String(entries[resource.path])) }),
	});
	const labelService = upcastPartial<ILabelService>({ getUriLabel: (uri: URI) => uri.path });

	function sessionIn(path: string, repository?: string): ISession {
		const workspace = upcastPartial<ISessionWorkspace>({ folders: [{ root: URI.file(path), workingDirectory: URI.file(path), name: path, description: undefined, gitRepository: repository ? { uri: URI.file(repository) } : undefined }] as ISessionWorkspace['folders'] });
		return upcastPartial<ISession>({ workspace: constObservable(workspace) });
	}

	/** The service in a single-folder window at `/work/vscode`, or at `location` of it, recording the folder moves it asks for. */
	function createService(options?: { readonly location?: string; readonly workbenchState?: WorkbenchState; readonly chatEnabled?: boolean }) {
		const instantiationService = disposables.add(new TestInstantiationService());
		const contextKeyService = disposables.add(new ChangingContextKeyService());
		contextKeyService.createKey(ChatContextKeys.enabled.key, options?.chatEnabled ?? true);
		const primary = URI.file('/work/vscode');
		const folder = upcastPartial<IWorkspaceFolder>({ uri: options?.location ? URI.file(options.location) : primary, primaryUri: options?.location ? primary : undefined });
		const moves: string[] = [];
		const notifications: string[] = [];
		let provider: IWorkspaceFolderLocationProvider | undefined;
		const currentLocation = options?.location ? upcastPartial<IResolvedFolderLocation>({ uri: URI.file(options.location), providerId: AGENTS_VIEW_FOLDER_LOCATION_PROVIDER_ID }) : undefined;

		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILabelService, labelService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ remoteAuthority: undefined }));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ info: (message: string) => { notifications.push(message); return undefined!; } }));
		instantiationService.stub(ITerminalService, upcastPartial<ITerminalService>({ instances: [], onDidCreateInstance: Event.None }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkbenchState: () => options?.workbenchState ?? WorkbenchState.FOLDER,
			getWorkspace: () => upcastPartial<IWorkspace>({ folders: [folder] }),
			onDidChangeWorkspaceFolders: Event.None,
		}));
		instantiationService.stub(IWorkspaceEditingService, upcastPartial<IWorkspaceEditingService>({
			setFolderLocation: async (to: URI, location: URI | undefined) => { moves.push(location ? `${to.path} -> ${location.path}` : `${to.path} -> primary`); },
		}));
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({
			currentLocation,
			registerProvider: (registered: IWorkspaceFolderLocationProvider) => { provider = registered; return toDisposable(() => provider = undefined); },
			resolveLocation: async (from: URI, location: URI) => {
				const resolved = await provider?.resolveLocation(from, location, CancellationToken.None);
				return resolved && { ...resolved, providerId: provider!.id, builtIn: true };
			},
		}));

		const service = disposables.add(instantiationService.createInstance(AgentsViewFolderLocationService));
		return { service, moves, notifications, setChatEnabled: (enabled: boolean) => contextKeyService.setValue(ChatContextKeys.enabled.key, enabled) };
	}

	test('the alternate locations of a folder are its linked checkouts, not itself, another repository\'s or a plain folder', async () => {
		const provider = new AgentsViewFolderLocationProvider(fileService, labelService);
		const resolve = async (path: string) => (await provider.resolveLocation(URI.file('/work/vscode'), URI.file(path), CancellationToken.None))?.label ?? 'none';

		assert.deepStrictEqual({
			linked: await resolve('/work/vscode.worktrees/feature'),
			itself: await resolve('/work/vscode'),
			otherRepository: await resolve('/work/other.worktrees/x'),
			plain: await resolve('/work/plain'),
		}, { linked: 'feature', itself: 'none', otherRepository: 'none', plain: 'none' });
	});

	test('opening a session moves the folder to its linked checkout or back, and not for a session elsewhere, a missing folder, a multi-root window or with AI disabled', async () => {
		const moved = async (session: ISession, options?: Parameters<typeof createService>[0]) => {
			const { service, moves, notifications } = createService(options);
			await service.switchToSession(session);
			return notifications.length ? `${moves.join()} notified` : moves.join() || 'none';
		};

		assert.deepStrictEqual({
			toLinked: await moved(sessionIn('/work/vscode.worktrees/feature')),
			inFolder: await moved(sessionIn('/work/vscode/src')),
			backToPrimary: await moved(sessionIn('/work/vscode'), { location: '/work/vscode.worktrees/feature' }),
			elsewhere: await moved(sessionIn('/work/plain')),
			missing: await moved(sessionIn('/work/vscode.worktrees/gone', '/work/vscode')),
			multiRoot: await moved(sessionIn('/work/vscode.worktrees/feature'), { workbenchState: WorkbenchState.WORKSPACE }),
			aiDisabled: await moved(sessionIn('/work/vscode.worktrees/feature'), { chatEnabled: false }),
		}, {
			toLinked: '/work/vscode -> /work/vscode.worktrees/feature',
			inFolder: 'none',
			backToPrimary: '/work/vscode -> primary',
			elsewhere: 'none',
			missing: ' notified',
			multiRoot: 'none',
			aiDisabled: 'none',
		});
	});

	test('disabling AI features returns the folder from a location a session moved it to', async () => {
		const { moves, setChatEnabled } = createService({ location: '/work/vscode.worktrees/feature' });

		const whileEnabled = [...moves];
		setChatEnabled(false);
		await Promise.resolve();

		assert.deepStrictEqual({ whileEnabled, disabled: moves }, { whileEnabled: [], disabled: ['/work/vscode -> primary'] });
	});
});
