/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { extUri, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { FileChangesEvent, FileSystemProviderCapabilities, IFileService, IFileSystemWatcher } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IRecentlyOpened, IWorkspacesService } from '../../../../../platform/workspaces/common/workspaces.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ISessionsRecentWorkspacesService, IVSCodeRecentWorkspaceFile } from '../../browser/sessionsRecentWorkspacesService.js';
import { SessionWorkspacesContextKeys } from '../../browser/sessionWorkspacesContextKeys.js';
import { SessionWorkspacesService } from '../../browser/sessionWorkspacesService.js';
import { SessionWorkspacesEnabledContext } from '../../common/contextkeys.js';
import { SESSIONS_WORKSPACES_ENABLED_SETTING } from '../../common/sessionConfig.js';
import { SessionWorkspaceFile } from '../../common/sessionWorkspaceFile.js';
import { IRecentSessionWorkspace, SessionWorkspaceError } from '../../common/sessionWorkspaces.js';
import { localDrive, localFile, pathOf } from '../common/sessionWorkspaceTestPaths.js';

suite('SessionWorkspacesService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const vscode = localFile('/work/vscode');
	const chat = localFile('/work/vscode-copilot-chat');
	const docs = localFile('/work/vscode-docs');
	const ownedHome = localFile('/user/AgentsWorkspaces');

	/**
	 * A file service whose moves wait for {@link moveBarrier}, to run other work in the middle of a rename, that runs
	 * {@link beforeStat} before a stat, {@link beforeRead} before and {@link afterRead} after a read, and
	 * {@link beforeDelete} before a delete, and whose deletes fail with {@link deleteError}.
	 */
	class DelayedMoveFileService extends FileService {
		moveBarrier: DeferredPromise<void> | undefined;
		beforeStat: (() => Promise<void>) | undefined;
		deleteError: Error | undefined;
		beforeRead: (() => Promise<void>) | undefined;
		afterRead: (() => Promise<void>) | undefined;
		beforeDelete: (() => Promise<void>) | undefined;
		override async move(...args: Parameters<FileService['move']>): ReturnType<FileService['move']> {
			await this.moveBarrier?.p;
			return super.move(...args);
		}
		override async stat(...args: Parameters<FileService['stat']>): ReturnType<FileService['stat']> {
			await this.beforeStat?.();
			return super.stat(...args);
		}
		override async readFile(...args: Parameters<FileService['readFile']>): ReturnType<FileService['readFile']> {
			await this.beforeRead?.();
			const content = await super.readFile(...args);
			await this.afterRead?.();
			return content;
		}
		override async del(...args: Parameters<FileService['del']>): ReturnType<FileService['del']> {
			await this.beforeDelete?.();
			if (this.deleteError) {
				throw this.deleteError;
			}
			return super.del(...args);
		}
	}

	/** An in-memory file system with a trash, like the local disk. */
	class TrashInMemoryFileSystemProvider extends InMemoryFileSystemProvider {
		override get capabilities(): FileSystemProviderCapabilities { return super.capabilities | FileSystemProviderCapabilities.Trash; }
	}

	async function createFileService(options?: { readonly trash?: boolean }): Promise<DelayedMoveFileService> {
		const fileService = disposables.add(new DelayedMoveFileService(new NullLogService()));
		const provider = disposables.add(options?.trash === false ? new InMemoryFileSystemProvider() : new TrashInMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, provider));
		if (isWindows) {
			// The file service assumes the drive root exists; seed it with the provider's own path
			await provider.mkdir(URI.from({ scheme: Schemas.inMemory, path: '/C:' }));
		}
		return fileService;
	}

	function changeConfiguration(configuration: TestConfigurationService, enabled: boolean): void {
		configuration.setUserConfiguration(SESSIONS_WORKSPACES_ENABLED_SETTING, enabled);
		configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: (key: string) => key === SESSIONS_WORKSPACES_ENABLED_SETTING }));
	}

	interface ITestOptions {
		readonly storage?: TestStorageService;
		readonly fileService?: FileService;
		/** The `.code-workspace` files VS Code opened recently, as the recent workspaces service reads them. */
		readonly recentWorkspaceFiles?: ReturnType<typeof observableValue<readonly IVSCodeRecentWorkspaceFile[]>>;
		/** The workspaces in VS Code's recently opened list, or the error reading it fails with. */
		readonly recentlyOpened?: IRecentlyOpened['workspaces'] | Error;
		readonly configuration?: TestConfigurationService;
	}

	/** Creates the service and waits for its first read of the workspace files. */
	async function createService(options: ITestOptions = {}) {
		const storage = options.storage ?? disposables.add(new TestStorageService());
		const fileService = options.fileService ?? await createFileService();
		const recentWorkspaceFiles = options.recentWorkspaceFiles ?? observableValue<readonly IVSCodeRecentWorkspaceFile[]>('recentWorkspaceFiles', []);
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri }));
		instantiationService.stub(IEnvironmentService, upcastPartial<IEnvironmentService>({ untitledWorkspacesHome: localFile('/user/Workspaces') }));
		instantiationService.stub(IConfigurationService, options.configuration ?? new TestConfigurationService({ [SESSIONS_WORKSPACES_ENABLED_SETTING]: true }));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ISessionsRecentWorkspacesService, upcastPartial<ISessionsRecentWorkspacesService>({ vsCodeRecentWorkspaceFiles: recentWorkspaceFiles }));
		const recentlyOpened = { reads: 0 };
		instantiationService.stub(IWorkspacesService, upcastPartial<IWorkspacesService>({
			getRecentlyOpened: async () => {
				recentlyOpened.reads++;
				if (options.recentlyOpened instanceof Error) {
					throw options.recentlyOpened;
				}
				return { workspaces: options.recentlyOpened ?? [], files: [] };
			}
		}));
		const warnings: string[] = [];
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ warn: message => { warnings.push(String(message)); } }));
		const service = disposables.add(instantiationService.createInstance(SessionWorkspacesService));
		await service.refresh();
		return { service, fileService, storage, warnings, recentlyOpened };
	}

	function snapshot(workspaces: readonly IRecentSessionWorkspace[]) {
		return workspaces.map(workspace => ({ name: workspace.name, folders: workspace.folders.map(pathOf), owned: workspace.owned, missing: workspace.missing }));
	}

	/** The code of a {@link SessionWorkspaceError} that the call is refused with, or the message of another error. */
	async function refusal(promise: Promise<unknown>): Promise<string | undefined> {
		try {
			await promise;
			return undefined;
		} catch (error) {
			return error instanceof SessionWorkspaceError ? error.code : String(error);
		}
	}

	async function readFile(fileService: IFileService, uri: URI): Promise<string> {
		return (await fileService.readFile(uri)).value.toString();
	}

	test('creates a workspace of several folders as an owned workspace file with absolute folders, default folder first', async () => {
		const { service, fileService } = await createService();
		const workspace = await service.createWorkspace('VS Code Agents', [vscode, chat]);

		assert.deepStrictEqual({
			file: extUri.relativePath(ownedHome, workspace.uri)?.split('/')[1],
			content: JSON.parse(await readFile(fileService, workspace.uri)),
			workspaces: snapshot(service.managedWorkspaces.get()),
		}, {
			file: 'VS Code Agents.code-workspace',
			content: { folders: [{ path: `${localDrive}/work/vscode` }, { path: `${localDrive}/work/vscode-copilot-chat` }], name: 'VS Code Agents' },
			workspaces: [{ name: 'VS Code Agents', folders: ['/work/vscode', '/work/vscode-copilot-chat'], owned: true, missing: undefined }],
		});
	});

	test('renaming renames an owned workspace file, which old sessions still find it by, but never a file the user opened', async () => {
		const fileService = await createFileService();
		const storage = disposables.add(new TestStorageService());
		const { service } = await createService({ storage, fileService });
		const owned = await service.createWorkspace('Agents', [vscode, chat]);
		const renamed = await service.updateWorkspace(owned.uri, { name: 'Platform' });
		const external = localFile('/work/external.code-workspace');
		await fileService.writeFile(external, VSBuffer.fromString('{ "folders": [{ "path": "/work/vscode" }, { "path": "/work/vscode-docs" }] }'));
		await service.openWorkspace(external);
		const externalRenamed = await service.updateWorkspace(external, { name: 'Renamed' });
		const { service: restarted } = await createService({ storage, fileService });

		assert.deepStrictEqual({
			file: extUri.relativePath(ownedHome, renamed.uri)?.split('/')[1],
			sameFolder: extUri.isEqual(extUri.dirname(renamed.uri), extUri.dirname(owned.uri)),
			oldFileExists: await fileService.exists(owned.uri),
			name: JSON.parse(await readFile(fileService, renamed.uri)).name,
			byOldFile: restarted.getWorkspace(owned.uri)?.name,
			previousUrisAfterRestart: restarted.getWorkspace(owned.uri)?.previousUris?.map(pathOf),
			externalKeepsItsFile: pathOf(externalRenamed.uri),
		}, {
			file: 'Platform.code-workspace',
			sameFolder: true,
			oldFileExists: false,
			name: 'Platform',
			byOldFile: 'Platform',
			previousUrisAfterRestart: [pathOf(owned.uri)],
			externalKeepsItsFile: '/work/external.code-workspace',
		});
	});

	test('edits keep the rest of an existing workspace file', async () => {
		const { service, fileService } = await createService();
		const file = localFile('/work/platform.code-workspace');
		await fileService.writeFile(file, VSBuffer.fromString('{\n\t// my folders\n\t"folders": [{ "path": "vscode" }],\n\t"settings": { "a": 1 }\n}\n'));

		const opened = await service.openWorkspace(file);
		const edited = await service.updateWorkspace(file, { name: 'Platform', folders: [docs, vscode] });

		assert.deepStrictEqual({
			opened: snapshot([opened]),
			edited: snapshot([edited]),
			content: await readFile(fileService, file),
		}, {
			opened: [{ name: 'platform', folders: ['/work/vscode'], owned: false, missing: undefined }],
			edited: [{ name: 'Platform', folders: ['/work/vscode-docs', '/work/vscode'], owned: false, missing: undefined }],
			content: '{\n\t// my folders\n\t"folders": [\n\t\t{\n\t\t\t"path": "vscode-docs"\n\t\t},\n\t\t{\n\t\t\t"path": "vscode"\n\t\t}\n\t],\n\t"settings": {\n\t\t"a": 1\n\t},\n\t"name": "Platform"\n}\n',
		});
	});

	test('keeps workspaces most recently used first across restarts, and removing one keeps its file unless asked to delete it', async () => {
		const fileService = await createFileService();
		const storage = disposables.add(new TestStorageService());
		const { service } = await createService({ storage, fileService });
		const owned = await service.createWorkspace('Owned', [vscode, chat]);
		const external = localFile('/work/external.code-workspace');
		await fileService.writeFile(external, VSBuffer.fromString('{ "folders": [{ "path": "/work/vscode-docs" }] }'));
		await service.openWorkspace(external);
		service.touchWorkspace(owned.uri);
		const restarted = (await createService({ storage, fileService })).service.managedWorkspaces.get().map(workspace => workspace.name);

		await service.removeWorkspace(owned.uri);
		await service.removeWorkspace(external, { deleteFile: true });

		assert.deepStrictEqual({
			restarted,
			afterRemove: service.managedWorkspaces.get().length,
			ownedExists: await fileService.exists(owned.uri),
			externalExists: await fileService.exists(external),
		}, {
			restarted: ['Owned', 'external'],
			afterRemove: 0,
			ownedExists: true,
			externalExists: false,
		});
	});

	test('a workspace of one folder is the folder, with no file, and gets or loses its owned file as it crosses one folder', async () => {
		const { service, fileService } = await createService();
		const folderWorkspace = await service.createWorkspace('Agents', [vscode]);
		const filesAfterCreate = (await fileService.resolve(ownedHome).catch(() => undefined))?.children?.length ?? 0;

		const grown = await service.updateWorkspace(folderWorkspace.uri, { folders: [vscode, chat] });
		const grownFileExists = await fileService.exists(grown.uri);
		const shrunk = await service.updateWorkspace(grown.uri, { name: 'Renamed', folders: [chat] });

		assert.deepStrictEqual({
			folderWorkspace: { uri: pathOf(folderWorkspace.uri), ...snapshot([folderWorkspace])[0] },
			filesAfterCreate,
			grown: { inOwnedHome: extUri.isEqualOrParent(grown.uri, ownedHome), exists: grownFileExists, ...snapshot([grown])[0] },
			shrunk: { uri: pathOf(shrunk.uri), previousUris: shrunk.previousUris?.map(pathOf), ...snapshot([shrunk])[0] },
			grownFileExistsAfterShrink: await fileService.exists(grown.uri),
			workspaces: snapshot(service.managedWorkspaces.get()),
		}, {
			folderWorkspace: { uri: '/work/vscode', name: 'Agents', folders: ['/work/vscode'], owned: true, missing: undefined },
			filesAfterCreate: 0,
			grown: { inOwnedHome: true, exists: true, name: 'Agents', folders: ['/work/vscode', '/work/vscode-copilot-chat'], owned: true, missing: undefined },
			shrunk: { uri: '/work/vscode-copilot-chat', previousUris: [pathOf(grown.uri)], name: 'Renamed', folders: ['/work/vscode-copilot-chat'], owned: true, missing: undefined },
			grownFileExistsAfterShrink: false,
			workspaces: [{ name: 'Renamed', folders: ['/work/vscode-copilot-chat'], owned: true, missing: undefined }],
		});
	});

	test('growing a workspace of one folder twice at once gives it one owned workspace file', async () => {
		const { service, fileService } = await createService();
		const folderWorkspace = await service.createWorkspace('Agents', [vscode]);

		const [first, second] = await Promise.all([
			service.updateWorkspace(folderWorkspace.uri, { folders: [vscode, chat] }),
			service.updateWorkspace(folderWorkspace.uri, { folders: [vscode, docs] }),
		]);

		assert.deepStrictEqual({
			sameFile: extUri.isEqual(first.uri, second.uri),
			ownedFiles: (await fileService.resolve(ownedHome)).children?.length,
			workspaces: snapshot(service.managedWorkspaces.get()),
		}, {
			sameFile: true,
			ownedFiles: 1,
			workspaces: [{ name: 'Agents', folders: ['/work/vscode', '/work/vscode-docs'], owned: true, missing: undefined }],
		});
	});

	test('an update waiting for another one is dropped when its workspace is removed meanwhile, and does not write its file again', async () => {
		const fileService = await createFileService();
		const { service } = await createService({ fileService });
		const removed = await service.createWorkspace('Removed', [vscode, chat]);
		const renamed = await service.createWorkspace('Agents', [vscode, docs]);

		fileService.moveBarrier = new DeferredPromise<void>();
		const renaming = service.updateWorkspace(renamed.uri, { name: 'Platform' });
		const waiting = service.updateWorkspace(removed.uri, { folders: [vscode, docs] }).then(() => 'updated', error => isCancellationError(error) ? 'dropped' : String(error));
		await service.removeWorkspace(removed.uri, { deleteFile: true });
		fileService.moveBarrier.complete();
		await renaming;

		assert.deepStrictEqual({
			waiting: await waiting,
			removedFileExists: await fileService.exists(removed.uri),
			workspaces: service.managedWorkspaces.get().map(workspace => workspace.name),
		}, { waiting: 'dropped', removedFileExists: false, workspaces: ['Platform'] });
	});

	test('rejects a workspace without folders and a workspace file without folders', async () => {
		const { service, fileService } = await createService();
		const empty = localFile('/work/empty.code-workspace');
		await fileService.writeFile(empty, VSBuffer.fromString('{ "folders": [] }'));

		const errors = await Promise.all([
			service.createWorkspace('None', []).then(() => undefined, (error: Error) => error.message),
			service.openWorkspace(empty).then(() => undefined, (error: Error) => error.message),
		]);

		assert.deepStrictEqual({ errors, workspaces: service.managedWorkspaces.get().length }, {
			errors: ['A workspace needs at least one folder.', 'The workspace file has no folders.'],
			workspaces: 0,
		});
	});

	test('marks a workspace whose file is gone as missing and keeps its name and folders', async () => {
		const { service, fileService } = await createService();
		const workspace = await service.createWorkspace('Gone', [vscode, chat]);
		await fileService.del(workspace.uri);

		await service.refresh();

		assert.deepStrictEqual(snapshot(service.managedWorkspaces.get()), [{ name: 'Gone', folders: ['/work/vscode', '/work/vscode-copilot-chat'], owned: true, missing: true }]);
	});

	test('resolves a workspace file without adding it, naming it after its file when it has no name', async () => {
		const { service, fileService } = await createService();
		const file = localFile('/work/tools.code-workspace');
		await fileService.writeFile(file, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }], "icon": "rocket" }'));

		const resolved = await service.resolveWorkspaceFile(file);

		assert.deepStrictEqual({ resolved: { ...snapshot([resolved])[0], icon: resolved.icon }, workspaces: service.managedWorkspaces.get().length }, {
			resolved: { name: 'tools', folders: ['/work/vscode', '/work/vscode-docs'], owned: false, missing: undefined, icon: 'rocket' },
			workspaces: 0,
		});
	});

	test('keeps the icon and color of a folder on this computer and of a workspace file in the file, across edits and restarts, until they are reset', async () => {
		const fileService = await createFileService();
		const storage = disposables.add(new TestStorageService());
		const { service } = await createService({ storage, fileService });
		const folderWorkspace = await service.createWorkspace('Agents', [vscode], { icon: 'rocket', color: 'charts.green' });
		const multi = await service.createWorkspace('Docs', [docs, chat]);
		await service.updateWorkspace(multi.uri, { icon: 'beaker', color: '#ff8800' });
		const workspaceFile = new SessionWorkspaceFile(extUri);
		const multiFile = workspaceFile.parse(await readFile(fileService, multi.uri), multi.uri);
		const restarted = (await createService({ storage, fileService })).service.managedWorkspaces.get().map(workspace => [workspace.name, workspace.icon, workspace.color]);
		const grown = await service.updateWorkspace(folderWorkspace.uri, { folders: [vscode, chat] });
		const grownFile = workspaceFile.parse(await readFile(fileService, grown.uri), grown.uri);
		const reset = await service.updateWorkspace(grown.uri, { name: 'Renamed', icon: null, color: null });

		assert.deepStrictEqual({
			multiFile: [multiFile.icon, multiFile.color],
			restarted,
			grownFile: [grownFile.icon, grownFile.color],
			afterReset: service.managedWorkspaces.get().map(workspace => [workspace.name, workspace.icon, workspace.color]),
			resetFileHasAppearance: /"icon"|"color"/.test(await readFile(fileService, reset.uri)),
		}, {
			multiFile: ['beaker', '#ff8800'],
			restarted: [['Docs', 'beaker', '#ff8800'], ['Agents', 'rocket', 'charts.green']],
			grownFile: ['rocket', 'charts.green'],
			afterReset: [['Docs', 'beaker', '#ff8800'], ['Renamed', undefined, undefined]],
			resetFileHasAppearance: false,
		});
	});

	test('keeps the icon and color on this computer, and says so, when a workspace file cannot be written; the file\'s own icon and color win once it has them', async () => {
		const fileService = await createFileService();
		const storage = disposables.add(new TestStorageService());
		const { service, warnings } = await createService({ storage, fileService });
		const platform = localFile('/work/platform.code-workspace');
		await fileService.writeFile(platform, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }] }'));
		await service.openWorkspace(platform);
		const writeFile = fileService.writeFile.bind(fileService);
		fileService.writeFile = (resource, ...rest) => extUri.isEqual(resource, platform) ? Promise.reject(new Error('read-only')) : writeFile(resource, ...rest);

		await service.updateWorkspace(platform, { icon: 'rocket', color: 'charts.green' });
		const { service: restarted } = await createService({ storage, fileService });
		const afterRestart = restarted.managedWorkspaces.get().map(workspace => [workspace.icon, workspace.color]);
		await writeFile(platform, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }], "icon": "tools" }'));
		await restarted.refresh();
		const fileWins = restarted.managedWorkspaces.get().map(workspace => [workspace.icon, workspace.color]);

		// Writable again: an update writes only what it sets, so the color kept on this computer stays out of the file
		fileService.writeFile = writeFile;
		await restarted.updateWorkspace(platform, { icon: 'beaker' });

		assert.deepStrictEqual({
			workspace: service.managedWorkspaces.get().map(workspace => [workspace.icon, workspace.color]),
			afterRestart,
			fileWins,
			afterUpdate: restarted.managedWorkspaces.get().map(workspace => [workspace.icon, workspace.color]),
			file: JSON.parse((await fileService.readFile(platform)).value.toString()),
			warnings: warnings.length,
		}, {
			workspace: [['rocket', 'charts.green']],
			afterRestart: [['rocket', 'charts.green']],
			fileWins: [['tools', 'charts.green']],
			afterUpdate: [['beaker', 'charts.green']],
			file: { folders: [{ path: 'vscode' }, { path: 'vscode-docs' }], icon: 'beaker' },
			warnings: 1,
		});
	});

	test('changing only the icon of a workspace file takes the name and folders that the file has then, and marks a file that is gone as missing', async () => {
		const { service, fileService, warnings } = await createService();
		const platform = await service.createWorkspace('Platform', [vscode, chat]);
		const gone = await service.createWorkspace('Gone', [vscode, docs]);
		// Edited elsewhere, and deleted, before a refresh reads them
		await fileService.writeFile(platform.uri, VSBuffer.fromString(JSON.stringify({ name: 'Edited', folders: [{ uri: docs.toString() }] })));
		await fileService.del(gone.uri);

		const edited = await service.updateWorkspace(platform.uri, { icon: 'rocket' });
		const goneEdited = await service.updateWorkspace(gone.uri, { icon: 'rocket' });

		assert.deepStrictEqual({ edited: snapshot([edited]), gone: snapshot([goneEdited]), icons: [edited.icon, goneEdited.icon], warnings: warnings.length }, {
			edited: [{ name: 'Edited', folders: ['/work/vscode-docs'], owned: true, missing: undefined }],
			gone: [{ name: 'Gone', folders: ['/work/vscode', '/work/vscode-docs'], owned: true, missing: true }],
			icons: ['rocket', 'rocket'],
			warnings: 1,
		});
	});

	test('picks up a name, icon and color edited in a workspace file elsewhere', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fileService = await createFileService();
		const changed = disposables.add(new Emitter<FileChangesEvent>());
		fileService.createWatcher = () => upcastPartial<IFileSystemWatcher>({ onDidChange: changed.event, dispose: () => { } });
		const { service } = await createService({ fileService });
		const platform = localFile('/work/platform.code-workspace');
		await fileService.writeFile(platform, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }] }'));
		await service.openWorkspace(platform);

		await fileService.writeFile(platform, VSBuffer.fromString('{ "name": "Platform", "icon": "rocket", "color": "#00aa00", "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }] }'));
		changed.fire(upcastPartial<FileChangesEvent>({ affects: (resource: URI) => extUri.isEqual(resource, platform) }));
		await timeout(500);

		assert.deepStrictEqual(service.managedWorkspaces.get().map(workspace => [workspace.name, workspace.icon, workspace.color]), [['Platform', 'rocket', '#00aa00']]);
	}));

	test('deleting a file deletes the folder of an owned file when it is empty, never the owned workspaces folder', async () => {
		const { service, fileService } = await createService();
		const alone = await service.createWorkspace('Alone', [vscode, docs]);
		const created = await service.createWorkspace('Created', [vscode, chat]);
		const opened = joinPath(ownedHome, 'opened.code-workspace');
		await fileService.writeFile(opened, VSBuffer.fromString('{ "folders": [{ "path": "/work/vscode" }] }'));
		const openedWorkspace = await service.openWorkspace(opened);
		const sibling = joinPath(created.uri, '..', 'sibling.code-workspace');
		await fileService.writeFile(sibling, VSBuffer.fromString('{ "folders": [] }'));

		await service.removeWorkspace(opened, { deleteFile: true });
		await service.removeWorkspace(alone.uri, { deleteFile: true });
		await service.removeWorkspace(created.uri, { deleteFile: true });

		assert.deepStrictEqual({
			owned: [openedWorkspace.owned, alone.owned, created.owned],
			openedExists: await fileService.exists(opened),
			aloneFolderExists: await fileService.exists(extUri.dirname(alone.uri)),
			createdExists: await fileService.exists(created.uri),
			siblingExists: await fileService.exists(sibling),
			ownedHomeExists: await fileService.exists(ownedHome),
		}, { owned: [false, true, true], openedExists: false, aloneFolderExists: false, createdExists: false, siblingExists: true, ownedHomeExists: true });
	});

	test('lists the workspace files recently opened in VS Code after the managed workspaces, without duplicates, untitled workspaces, single folders or remote folders, at most twenty', async () => {
		const platform = localFile('/work/platform.code-workspace');
		const known = localFile('/work/known.code-workspace');
		const untitled = localFile('/user/Workspaces/1234/workspace.json');
		const single = localFile('/work/single.code-workspace');
		const remote = localFile('/work/remote.code-workspace');
		const many = Array.from({ length: 25 }, (_, index) => ({ uri: localFile(`/work/many-${index}.code-workspace`), name: `many-${index}`, folders: [vscode, docs] }));
		const recentWorkspaceFiles = observableValue<readonly IVSCodeRecentWorkspaceFile[]>('recentWorkspaceFiles', []);
		const { service, fileService } = await createService({ recentWorkspaceFiles });
		await fileService.writeFile(known, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-copilot-chat" }] }'));
		await service.openWorkspace(known);
		// A workspace made and renamed since, whose old file VS Code still remembers
		const before = await service.createWorkspace('Before', [docs, chat]);
		await service.updateWorkspace(before.uri, { name: 'After' });
		recentWorkspaceFiles.set([
			{ uri: platform, name: 'Platform', folders: [vscode, docs], icon: 'rocket' },
			{ uri: known, name: 'known', folders: [vscode, chat] },
			{ uri: before.uri, name: 'Before', folders: [docs, chat] },
			{ uri: untitled, name: 'workspace', folders: [vscode, docs] },
			{ uri: single, name: 'single', folders: [vscode] },
			{ uri: remote, name: 'remote', folders: [vscode, URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+box', path: '/src' })] },
			...many,
		], undefined);

		const recent = service.recentWorkspaceFiles.get();

		assert.deepStrictEqual({
			recent: recent.slice(0, 2).map(file => ({ uri: pathOf(file.uri), name: file.name, owned: file.owned, icon: file.icon })),
			recentCount: recent.length,
			workspaces: service.workspaces.get().slice(0, 5).map(workspace => workspace.name),
			getWorkspace: service.getWorkspace(platform)?.name,
		}, {
			recent: [{ uri: '/work/platform.code-workspace', name: 'Platform', owned: false, icon: 'rocket' }, { uri: '/work/many-0.code-workspace', name: 'many-0', owned: false, icon: undefined }],
			recentCount: 20,
			workspaces: ['After', 'known', 'Platform', 'many-0', 'many-1'],
			getWorkspace: 'Platform',
		});
	});

	test('lists no recent workspace files while workspaces are disabled, and follows the recent list as it changes', async () => {
		const platform = localFile('/work/platform.code-workspace');
		const tools = localFile('/work/tools.code-workspace');
		const configuration = new TestConfigurationService({ [SESSIONS_WORKSPACES_ENABLED_SETTING]: false });
		const recentWorkspaceFiles = observableValue<readonly IVSCodeRecentWorkspaceFile[]>('recentWorkspaceFiles', [{ uri: platform, name: 'platform', folders: [vscode, docs] }]);
		const { service } = await createService({ recentWorkspaceFiles, configuration });
		const names = () => service.recentWorkspaceFiles.get().map(file => file.name);

		const disabled = [service.enabled.get(), ...names()];
		changeConfiguration(configuration, true);
		const enabled = [service.enabled.get(), ...names()];
		recentWorkspaceFiles.set([{ uri: tools, name: 'tools', folders: [chat, docs] }, { uri: platform, name: 'platform', folders: [vscode, docs] }], undefined);

		assert.deepStrictEqual({ disabled, enabled, changed: names() }, { disabled: [false], enabled: [true, 'platform'], changed: ['tools', 'platform'] });
	});

	test('removing a recent workspace file forgets it, keeping its file, across restarts, until it is opened', async () => {
		const platform = localFile('/work/platform.code-workspace');
		const tools = localFile('/work/tools.code-workspace');
		const fileService = await createFileService();
		const storage = disposables.add(new TestStorageService());
		const recentWorkspaceFiles = observableValue<readonly IVSCodeRecentWorkspaceFile[]>('recentWorkspaceFiles', [
			{ uri: platform, name: 'platform', folders: [vscode, docs] },
			{ uri: tools, name: 'tools', folders: [chat, docs] },
		]);
		const { service } = await createService({ storage, fileService, recentWorkspaceFiles });
		await fileService.writeFile(platform, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }] }'));
		await fileService.writeFile(tools, VSBuffer.fromString('{ "folders": [{ "path": "vscode-copilot-chat" }, { "path": "vscode-docs" }] }'));

		await service.removeWorkspace(platform);
		await service.removeWorkspace(tools);
		const afterRemove = service.recentWorkspaceFiles.get().map(file => file.name);
		const { service: restarted } = await createService({ storage, fileService, recentWorkspaceFiles });
		const afterRestart = restarted.recentWorkspaceFiles.get().map(file => file.name);
		await restarted.openWorkspace(tools);
		await restarted.removeWorkspace(tools);

		assert.deepStrictEqual({
			afterRemove,
			afterRestart,
			// Opened, it is a managed workspace; removed as one, it is forgotten again
			afterOpenAndRemove: restarted.recentWorkspaceFiles.get().map(file => file.name),
			filesKept: [await fileService.exists(platform), await fileService.exists(tools)],
		}, {
			afterRemove: [],
			afterRestart: [],
			afterOpenAndRemove: [],
			filesKept: [true, true],
		});
	});

	test('edits never write an invalid workspace file, and leave the icon and color they do not change as they are in the file', async () => {
		const { service, fileService, warnings } = await createService();
		const file = localFile('/work/platform.code-workspace');
		const recent = localFile('/work/recent.code-workspace');
		await fileService.writeFile(file, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }], "icon": "rocket", "color": "red" }'));
		await fileService.writeFile(recent, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }], "icon": "star", "color": "green" }'));
		await service.openWorkspace(file);

		// Edited in another editor after it was read
		await fileService.writeFile(file, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }], "icon": "rocket", "color": "blue" }'));
		const iconChanged = await service.updateWorkspace(file, { icon: 'beaker' });
		const renamed = await service.updateWorkspace(file, { name: 'Platform' });
		// A recent workspace file that is not managed yet
		const recentRenamed = await service.updateWorkspace(recent, { name: 'Recent' });

		const invalid = '{ "folders": [';
		await fileService.writeFile(file, VSBuffer.fromString(invalid));
		const renameError = await service.updateWorkspace(file, { name: 'Other' }).then(() => undefined, error => String(error));
		await service.updateWorkspace(file, { color: 'yellow' });

		assert.deepStrictEqual({
			iconChanged: { icon: iconChanged.icon, color: iconChanged.color },
			renamed: { name: renamed.name, icon: renamed.icon, color: renamed.color },
			recentRenamed: { name: recentRenamed.name, icon: recentRenamed.icon, color: recentRenamed.color, file: JSON.parse(await readFile(fileService, recent)) },
			renameError,
			warnings: warnings.length,
			invalidFileKept: await readFile(fileService, file),
		}, {
			iconChanged: { icon: 'beaker', color: 'blue' },
			renamed: { name: 'Platform', icon: 'beaker', color: 'blue' },
			recentRenamed: { name: 'Recent', icon: 'star', color: 'green', file: { folders: [{ path: 'vscode' }, { path: 'vscode-docs' }], icon: 'star', color: 'green', name: 'Recent' } },
			renameError: 'Error: \'platform.code-workspace\' is not a valid workspace file.',
			warnings: 1,
			invalidFileKept: invalid,
		});
	});

	test('a refresh in the middle of renaming an owned workspace keeps the renamed workspace', async () => {
		const fileService = await createFileService();
		const { service } = await createService({ fileService });
		const owned = await service.createWorkspace('Agents', [vscode, chat]);
		// Edited in another editor, so that the refresh reads something new
		const content = JSON.parse(await readFile(fileService, owned.uri));
		await fileService.writeFile(owned.uri, VSBuffer.fromString(JSON.stringify({ ...content, color: 'blue' })));

		fileService.moveBarrier = new DeferredPromise<void>();
		const renaming = service.updateWorkspace(owned.uri, { name: 'Platform' });
		await service.refresh();
		fileService.moveBarrier.complete();
		const renamed = await renaming;

		assert.deepStrictEqual({
			file: extUri.basename(renamed.uri),
			workspaces: service.managedWorkspaces.get().map(workspace => ({ file: extUri.basename(workspace.uri), name: workspace.name, color: workspace.color })),
		}, {
			file: 'Platform.code-workspace',
			workspaces: [{ file: 'Platform.code-workspace', name: 'Platform', color: 'blue' }],
		});
	});

	test('a refresh that finds nothing changed keeps the catalogue and writes nothing', async () => {
		const storage = disposables.add(new TestStorageService());
		const { service } = await createService({ storage });
		await service.createWorkspace('Platform', [vscode, chat]);
		const before = service.managedWorkspaces.get();
		let writes = 0;
		const listeners = disposables.add(new DisposableStore());
		listeners.add(storage.onDidChangeValue(StorageScope.PROFILE, undefined, listeners)(() => writes++));

		await service.refresh();

		assert.deepStrictEqual({ same: service.managedWorkspaces.get() === before, writes }, { same: true, writes: 0 });
	});

	test('an edit made elsewhere while a workspace file is written is kept, also when it keeps the size of the file', async () => {
		const fileService = await createFileService();
		const { service } = await createService({ fileService });
		const file = localFile('/work/platform.code-workspace');
		await fileService.writeFile(file, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }], "color": "red" }'));
		await service.openWorkspace(file);

		let edited = false;
		fileService.beforeStat = async () => {
			if (!edited) {
				edited = true;
				await timeout(5);
				await fileService.writeFile(file, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }], "color": "tan" }'));
			}
		};
		const updated = await service.updateWorkspace(file, { icon: 'beaker' });
		fileService.beforeStat = undefined;

		assert.deepStrictEqual({ icon: updated.icon, color: updated.color, file: JSON.parse(await readFile(fileService, file)) }, {
			icon: 'beaker',
			color: 'tan',
			file: { folders: [{ path: 'vscode' }, { path: 'vscode-docs' }], color: 'tan', icon: 'beaker' },
		});
	});

	test('a workspace file deleted while it is written is not written again', async () => {
		const fileService = await createFileService();
		const { service } = await createService({ fileService });
		const file = localFile('/work/platform.code-workspace');
		await fileService.writeFile(file, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }] }'));
		await service.openWorkspace(file);

		fileService.beforeStat = async () => {
			fileService.beforeStat = undefined;
			await fileService.del(file);
		};
		const failed = await service.updateWorkspace(file, { name: 'Platform' }).then(() => false, () => true);

		assert.deepStrictEqual({ failed, exists: await fileService.exists(file) }, { failed: true, exists: false });
	});

	test('reads and edits a workspace file that VS Code opened in a remote, whose folders are all paths on the remote, keeping them', async () => {
		const file = localFile('/work/wsl.code-workspace');
		const { service, fileService } = await createService({ recentlyOpened: [{ workspace: { id: 'wsl', configPath: file }, remoteAuthority: 'wsl+Ubuntu' }] });
		await fileService.writeFile(file, VSBuffer.fromString('{ "folders": [{ "path": "/home/me/vscode" }, { "path": "/home/me/docs" }] }'));

		const resolved = await service.resolveWorkspaceFile(file);
		const updated = await service.updateWorkspace(file, { folders: [vscode, chat] });

		assert.deepStrictEqual({ resolved: resolved.folders.map(pathOf), updated: updated.folders.map(pathOf), file: JSON.parse(await readFile(fileService, file)).folders }, {
			resolved: [],
			updated: ['/work/vscode', '/work/vscode-copilot-chat'],
			file: [{ uri: vscode.toString(true) }, { uri: chat.toString(true) }, { path: '/home/me/vscode' }, { path: '/home/me/docs' }],
		});
	});

	test('when VS Code\'s recently opened list cannot be read, the folder paths of a workspace file are never rewritten, and the list is read once per refresh', async () => {
		const file = localFile('/work/wsl.code-workspace');
		const content = '{ "folders": [{ "path": "/home/me/vscode" }, { "path": "/home/me/docs" }] }';
		const { service, fileService } = await createService({ recentlyOpened: new Error('unavailable') });
		await fileService.writeFile(file, VSBuffer.fromString(content));

		const foldersFailed = await refusal(service.updateWorkspace(file, { folders: [vscode, chat] }));
		const renameFailed = await refusal(service.updateWorkspace(file, { name: 'WSL' }));
		const unchanged = await readFile(fileService, file) === content;
		const managed = service.managedWorkspaces.get().length;

		const { service: other, fileService: otherFiles, recentlyOpened } = await createService();
		await other.createWorkspace('One', [vscode, chat]);
		await other.createWorkspace('Two', [vscode, docs]);
		await otherFiles.writeFile(file, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }] }'));
		await other.openWorkspace(file);
		const before = recentlyOpened.reads;
		await other.refresh();

		assert.deepStrictEqual({ foldersFailed, renameFailed, unchanged, managed, readsPerRefresh: recentlyOpened.reads - before }, { foldersFailed: 'foldersUnknown', renameFailed: 'foldersUnknown', unchanged: true, managed: 0, readsPerRefresh: 1 });
	});

	test('removing a renamed workspace keeps the workspace that now has its former file', async () => {
		const { service, fileService } = await createService();
		const agents = await service.createWorkspace('Agents', [vscode, chat]);
		const platform = await service.updateWorkspace(agents.uri, { name: 'Platform' });
		await fileService.writeFile(agents.uri, VSBuffer.fromString(JSON.stringify({ folders: [{ path: vscode.fsPath }, { path: docs.fsPath }], name: 'Agents again' })));
		await service.openWorkspace(agents.uri);

		await service.removeWorkspace(platform.uri, { deleteFile: true });
		const afterRemove = snapshot(service.managedWorkspaces.get());
		const updated = await service.updateWorkspace(agents.uri, { folders: [vscode, chat] });

		assert.deepStrictEqual({ afterRemove, updated: updated.name, workspaces: snapshot(service.managedWorkspaces.get()), agentsExists: await fileService.exists(agents.uri) }, {
			afterRemove: [{ name: 'Agents again', folders: ['/work/vscode', '/work/vscode-docs'], owned: true, missing: undefined }],
			updated: 'Agents again',
			workspaces: [{ name: 'Agents again', folders: ['/work/vscode', '/work/vscode-copilot-chat'], owned: true, missing: undefined }],
			agentsExists: true,
		});
	});

	test('when VS Code\'s recently opened list cannot be read, workspaces keep what is known about them, the list is read once per refresh, and an owned file is not reduced to one folder', async () => {
		const { service, fileService, recentlyOpened } = await createService({ recentlyOpened: new Error('unavailable') });
		const agents = await service.createWorkspace('Agents', [vscode, chat]);
		await service.createWorkspace('Docs', [vscode, docs]);
		const edited = '{ "name": "Agents", "folders": [{ "path": "/home/me/vscode" }, { "path": "/home/me/docs" }] }';
		await fileService.writeFile(agents.uri, VSBuffer.fromString(edited));
		const unknownFile = localFile('/work/wsl.code-workspace');
		await fileService.writeFile(unknownFile, VSBuffer.fromString('{ "folders": [{ "path": "/home/me/vscode" }] }'));

		const before = recentlyOpened.reads;
		await service.refresh();
		const readsPerRefresh = recentlyOpened.reads - before;
		const resolved = await service.resolveWorkspaceFile(agents.uri);
		const unknownFailed = await refusal(service.resolveWorkspaceFile(unknownFile));
		const collapseFailed = await refusal(service.updateWorkspace(agents.uri, { folders: [vscode] }));
		const unchanged = await readFile(fileService, agents.uri) === edited;
		const renamed = await service.updateWorkspace(agents.uri, { name: 'Platform' });

		assert.deepStrictEqual({ readsPerRefresh, resolved: resolved.folders.map(pathOf), unknownFailed, collapseFailed, unchanged, sameFile: renamed.uri.toString() === agents.uri.toString(), fileFolders: JSON.parse(await readFile(fileService, agents.uri)).folders, workspaces: snapshot(service.managedWorkspaces.get()) }, {
			readsPerRefresh: 1,
			resolved: ['/work/vscode', '/work/vscode-copilot-chat'],
			unknownFailed: 'foldersUnknown',
			collapseFailed: 'foldersUnknown',
			unchanged: true,
			sameFile: true,
			fileFolders: [{ path: '/home/me/vscode' }, { path: '/home/me/docs' }],
			workspaces: [
				{ name: 'Docs', folders: ['/work/vscode', '/work/vscode-docs'], owned: true, missing: undefined },
				{ name: 'Platform', folders: ['/work/vscode', '/work/vscode-copilot-chat'], owned: true, missing: undefined },
			],
		});
	});

	test('an owned workspace file that only VS Code\'s recently opened list tells is on a remote keeps its file name when renamed, and so stays on the remote', async () => {
		const recentlyOpened: IRecentlyOpened['workspaces'] = [];
		const { service, fileService } = await createService({ recentlyOpened });
		const agents = await service.createWorkspace('Agents', [vscode, chat]);
		recentlyOpened.push({ workspace: { id: 'agents', configPath: agents.uri }, remoteAuthority: 'wsl+Ubuntu' });
		await fileService.writeFile(agents.uri, VSBuffer.fromString('{ "name": "Agents", "folders": [{ "path": "/home/me/vscode" }, { "path": "/home/me/docs" }] }'));
		await service.refresh();

		const renamed = await service.updateWorkspace(agents.uri, { name: 'Platform' });
		await service.refresh();

		assert.deepStrictEqual({ sameFile: renamed.uri.toString() === agents.uri.toString(), workspaces: snapshot(service.managedWorkspaces.get()), fileFolders: JSON.parse(await readFile(fileService, agents.uri)).folders }, {
			sameFile: true,
			workspaces: [{ name: 'Platform', folders: [], owned: true, missing: undefined }],
			fileFolders: [{ path: '/home/me/vscode' }, { path: '/home/me/docs' }],
		});
	});

	test('an owned workspace file with folders on a remote that are not shown keeps them, rather than becoming a folder, when reduced to one folder', async () => {
		const { service, fileService } = await createService();
		const agents = await service.createWorkspace('Agents', [vscode, chat]);
		await fileService.writeFile(agents.uri, VSBuffer.fromString('{ "name": "Agents", "remoteAuthority": "wsl+Ubuntu", "folders": [{ "uri": "file:///work/vscode" }, { "uri": "file:///work/vscode-copilot-chat" }, { "path": "/home/me/docs" }] }'));
		await service.refresh();

		const updated = await service.updateWorkspace(agents.uri, { folders: [vscode] });

		assert.deepStrictEqual({ sameFile: updated.uri.toString() === agents.uri.toString(), folders: updated.folders.map(pathOf), file: JSON.parse(await readFile(fileService, agents.uri)).folders }, {
			sameFile: true,
			folders: ['/work/vscode'],
			file: [{ uri: vscode.toString(true) }, { path: '/home/me/docs' }],
		});
	});

	test('an owned workspace file with settings keeps them, rather than becoming a folder, when reduced to one folder', async () => {
		const { service, fileService } = await createService();
		const agents = await service.createWorkspace('Agents', [vscode, chat]);
		const content = JSON.parse(await readFile(fileService, agents.uri));
		await fileService.writeFile(agents.uri, VSBuffer.fromString(JSON.stringify({ ...content, settings: { 'editor.tabSize': 2 } })));

		const updated = await service.updateWorkspace(agents.uri, { folders: [vscode] });

		assert.deepStrictEqual({ sameFile: extUri.isEqual(updated.uri, agents.uri), workspace: snapshot([updated]), settings: JSON.parse(await readFile(fileService, agents.uri)).settings }, {
			sameFile: true,
			workspace: [{ name: 'Agents', folders: ['/work/vscode'], owned: true, missing: undefined }],
			settings: { 'editor.tabSize': 2 },
		});
	});

	test('an owned workspace file that names the folder it is reduced to keeps that name, rather than becoming a folder', async () => {
		const { service, fileService } = await createService();
		const named = await service.createWorkspace('Agents', [vscode, chat]);
		const droppedName = await service.createWorkspace('Docs', [vscode, docs]);
		for (const [workspace, index] of [[named, 0], [droppedName, 1]] as const) {
			const content = JSON.parse(await readFile(fileService, workspace.uri));
			content.folders[index].name = 'Core';
			await fileService.writeFile(workspace.uri, VSBuffer.fromString(JSON.stringify(content)));
		}

		const kept = await service.updateWorkspace(named.uri, { folders: [vscode] });
		const collapsed = await service.updateWorkspace(droppedName.uri, { folders: [vscode] });

		assert.deepStrictEqual({
			kept: { sameFile: extUri.isEqual(kept.uri, named.uri), folders: JSON.parse(await readFile(fileService, named.uri)).folders.map((folder: { name?: string }) => folder.name) },
			collapsed: { uri: pathOf(collapsed.uri), fileExists: await fileService.exists(droppedName.uri) },
		}, {
			kept: { sameFile: true, folders: ['Core'] },
			collapsed: { uri: '/work/vscode', fileExists: false },
		});
	});

	test('a workspace file deleted after a change made elsewhere is found while it is written stays deleted', async () => {
		const fileService = await createFileService();
		const { service } = await createService({ fileService });
		const file = localFile('/work/platform.code-workspace');
		await fileService.writeFile(file, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }] }'));
		await service.openWorkspace(file);

		fileService.beforeStat = async () => {
			fileService.beforeStat = undefined;
			await fileService.writeFile(file, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }], "color": "tan" }'));
			fileService.beforeRead = async () => {
				fileService.beforeRead = undefined;
				await fileService.del(file);
			};
		};
		const failed = await service.updateWorkspace(file, { name: 'Platform' }).then(() => false, () => true);

		assert.deepStrictEqual({ failed, exists: await fileService.exists(file) }, { failed: true, exists: false });
	});

	test('removing a workspace removes it also when a refresh replaces it while its file is deleted, and when its file is gone already', async () => {
		const fileService = await createFileService();
		const { service } = await createService({ fileService });
		const owned = await service.createWorkspace('Owned', [vscode, chat]);
		const gone = await service.createWorkspace('Gone', [vscode, docs]);
		await fileService.del(gone.uri);
		await service.refresh();

		fileService.beforeDelete = async () => {
			fileService.beforeDelete = undefined;
			await fileService.writeFile(owned.uri, VSBuffer.fromString(JSON.stringify({ folders: [{ path: vscode.fsPath }, { path: chat.fsPath }], name: 'Renamed elsewhere' })));
			await service.refresh();
		};
		await service.removeWorkspace(owned.uri, { deleteFile: true });
		await service.removeWorkspace(gone.uri, { deleteFile: true });

		assert.deepStrictEqual({ workspaces: service.managedWorkspaces.get().map(workspace => workspace.name), ownedExists: await fileService.exists(owned.uri) }, { workspaces: [], ownedExists: false });
	});

	test('a refresh started while another one runs reads the workspace file after it, so an older read never wins', async () => {
		const fileService = await createFileService();
		const { service } = await createService({ fileService });
		const file = localFile('/work/platform.code-workspace');
		await fileService.writeFile(file, VSBuffer.fromString('{ "name": "Zero", "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }] }'));
		await service.openWorkspace(file);
		await fileService.writeFile(file, VSBuffer.fromString('{ "name": "One", "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }] }'));

		const reads: DeferredPromise<void>[] = [];
		fileService.afterRead = () => {
			const read = new DeferredPromise<void>();
			reads.push(read);
			return read.p;
		};
		const first = service.refresh();
		await timeout(0);
		await fileService.writeFile(file, VSBuffer.fromString('{ "name": "Two", "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }] }'));
		const second = service.refresh();
		await timeout(0);
		fileService.afterRead = undefined;
		for (const read of reads) {
			read.complete();
		}
		await Promise.all([first, second]);

		assert.deepStrictEqual(service.managedWorkspaces.get().map(workspace => workspace.name), ['Two']);
	});

	test('a workspace whose file cannot be deleted stays, and removing another workspace does not drop an update in progress', async () => {
		const fileService = await createFileService();
		const { service } = await createService({ fileService });
		const owned = await service.createWorkspace('Owned', [vscode, chat]);
		fileService.deleteError = new Error('busy');
		const deleteError = await service.removeWorkspace(owned.uri, { deleteFile: true }).then(() => undefined, error => String(error));
		fileService.deleteError = undefined;
		const afterFailedDelete = service.managedWorkspaces.get().map(workspace => workspace.name);

		const recent = localFile('/work/recent.code-workspace');
		await fileService.writeFile(recent, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }] }'));
		const barrier = new DeferredPromise<void>();
		fileService.beforeStat = () => barrier.p;
		const renaming = service.updateWorkspace(recent, { name: 'Recent' });
		await timeout(0);
		await service.removeWorkspace(owned.uri);
		barrier.complete();
		await renaming;
		fileService.beforeStat = undefined;

		assert.deepStrictEqual({ deleteError, afterFailedDelete, afterRename: service.managedWorkspaces.get().map(workspace => workspace.name) }, {
			deleteError: 'Error: busy',
			afterFailedDelete: ['Owned'],
			afterRename: ['Recent'],
		});
	});

	test('without a trash, refuses to delete a user\'s workspace file and keeps its workspace, but deletes an owned file', async () => {
		const fileService = await createFileService({ trash: false });
		const { service } = await createService({ fileService });
		const owned = await service.createWorkspace('Owned', [vscode, chat]);
		const external = localFile('/work/external.code-workspace');
		await fileService.writeFile(external, VSBuffer.fromString('{ "folders": [{ "path": "/work/vscode-docs" }] }'));
		await service.openWorkspace(external);

		const refused = await refusal(service.removeWorkspace(external, { deleteFile: true }));
		await service.removeWorkspace(owned.uri, { deleteFile: true });

		assert.deepStrictEqual({
			refused,
			workspaces: service.managedWorkspaces.get().map(workspace => workspace.name),
			externalExists: await fileService.exists(external),
			ownedExists: await fileService.exists(owned.uri),
		}, { refused: 'noTrash', workspaces: ['external'], externalExists: true, ownedExists: false });
	});

	test('never deletes a folder named like a workspace file, also a workspace of that one folder, and keeps the workspaces as they are', async () => {
		const fileService = await createFileService();
		const { service } = await createService({ fileService });
		const folder = localFile('/work/notes.code-workspace');
		await fileService.writeFile(URI.joinPath(folder, 'notes.md'), VSBuffer.fromString('notes'));
		const empty = localFile('/work/x.code-workspace');
		await fileService.createFolder(empty);
		const standalone = await service.createWorkspace('X', [empty]);

		const refusedFolder = await refusal(service.removeWorkspace(folder, { deleteFile: true }));
		const refusedStandalone = await refusal(service.removeWorkspace(standalone.uri, { deleteFile: true }));

		assert.deepStrictEqual({
			refusedFolder,
			refusedStandalone,
			workspaces: service.managedWorkspaces.get().map(workspace => pathOf(workspace.uri)),
			kept: await fileService.exists(URI.joinPath(folder, 'notes.md')),
			emptyKept: await fileService.exists(empty),
		}, { refusedFolder: 'folderNotWorkspaceFile', refusedStandalone: 'folderNotWorkspaceFile', workspaces: ['/work/x.code-workspace'], kept: true, emptyKept: true });
	});

	test('names an owned workspace file after the workspace, falling back for names the file system reserves', () => {
		const workspaceFile = new SessionWorkspaceFile(extUri);
		assert.deepStrictEqual(
			['Platform', 'a/b', 'CON', 'nul', 'Lpt1', '...', ''].map(name => workspaceFile.toFileName(name, true)),
			['Platform.code-workspace', 'a-b.code-workspace', 'workspace.code-workspace', 'workspace.code-workspace', 'workspace.code-workspace', 'workspace.code-workspace', 'workspace.code-workspace']);
	});

	test('the workspaces context key follows its setting from startup, without the workspaces service', () => {
		const configuration = new TestConfigurationService({ [SESSIONS_WORKSPACES_ENABLED_SETTING]: true });
		const contextKeyService = disposables.add(new MockContextKeyService());
		disposables.add(new SessionWorkspacesContextKeys(contextKeyService, configuration));
		const atStartup = contextKeyService.getContextKeyValue(SessionWorkspacesEnabledContext.key);

		changeConfiguration(configuration, false);

		assert.deepStrictEqual({ atStartup, afterChange: contextKeyService.getContextKeyValue(SessionWorkspacesEnabledContext.key) }, { atStartup: true, afterChange: false });
	});
});
