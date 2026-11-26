/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { extUri, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { FileChangesEvent, IFileService, IFileSystemWatcher } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ISessionsRecentWorkspacesService, IVSCodeRecentWorkspaceFile } from '../../browser/sessionsRecentWorkspacesService.js';
import { SessionWorkspacesContextKeys } from '../../browser/sessionWorkspacesContextKeys.js';
import { SessionWorkspacesService } from '../../browser/sessionWorkspacesService.js';
import { SessionWorkspacesEnabledContext } from '../../common/contextkeys.js';
import { SESSIONS_WORKSPACES_ENABLED_SETTING } from '../../common/sessionConfig.js';
import { parseSessionWorkspaceFile } from '../../common/sessionWorkspaceFile.js';
import { IRecentSessionWorkspace } from '../../common/sessionWorkspaces.js';

suite('SessionWorkspacesService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const vscode = URI.file('/work/vscode');
	const chat = URI.file('/work/vscode-copilot-chat');
	const docs = URI.file('/work/vscode-docs');
	const ownedHome = URI.file('/user/AgentsWorkspaces');

	function createFileService(): FileService {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
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
		readonly configuration?: TestConfigurationService;
	}

	/** Creates the service and waits for its first read of the workspace files. */
	async function createService(options: ITestOptions = {}) {
		const storage = options.storage ?? disposables.add(new TestStorageService());
		const fileService = options.fileService ?? createFileService();
		const recentWorkspaceFiles = options.recentWorkspaceFiles ?? observableValue<readonly IVSCodeRecentWorkspaceFile[]>('recentWorkspaceFiles', []);
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri }));
		instantiationService.stub(IEnvironmentService, upcastPartial<IEnvironmentService>({ untitledWorkspacesHome: URI.file('/user/Workspaces') }));
		instantiationService.stub(IConfigurationService, options.configuration ?? new TestConfigurationService({ [SESSIONS_WORKSPACES_ENABLED_SETTING]: true }));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ISessionsRecentWorkspacesService, upcastPartial<ISessionsRecentWorkspacesService>({ vsCodeRecentWorkspaceFiles: recentWorkspaceFiles }));
		const warnings: string[] = [];
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ warn: message => { warnings.push(String(message)); } }));
		const service = disposables.add(instantiationService.createInstance(SessionWorkspacesService));
		await service.refresh();
		return { service, fileService, storage, warnings };
	}

	function snapshot(workspaces: readonly IRecentSessionWorkspace[]) {
		return workspaces.map(workspace => ({ name: workspace.name, folders: workspace.folders.map(folder => folder.path), owned: workspace.owned, missing: workspace.missing }));
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
			content: { folders: [{ path: '/work/vscode' }, { path: '/work/vscode-copilot-chat' }], name: 'VS Code Agents' },
			workspaces: [{ name: 'VS Code Agents', folders: ['/work/vscode', '/work/vscode-copilot-chat'], owned: true, missing: undefined }],
		});
	});

	test('renaming renames an owned workspace file, which old sessions still find it by, but never a file the user opened', async () => {
		const fileService = createFileService();
		const storage = disposables.add(new TestStorageService());
		const { service } = await createService({ storage, fileService });
		const owned = await service.createWorkspace('Agents', [vscode, chat]);
		const renamed = await service.updateWorkspace(owned.uri, { name: 'Platform' });
		const external = URI.file('/work/external.code-workspace');
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
			previousUrisAfterRestart: restarted.getWorkspace(owned.uri)?.previousUris?.map(previous => previous.path),
			externalKeepsItsFile: externalRenamed.uri.path,
		}, {
			file: 'Platform.code-workspace',
			sameFolder: true,
			oldFileExists: false,
			name: 'Platform',
			byOldFile: 'Platform',
			previousUrisAfterRestart: [owned.uri.path],
			externalKeepsItsFile: '/work/external.code-workspace',
		});
	});

	test('edits keep the rest of an existing workspace file', async () => {
		const { service, fileService } = await createService();
		const file = URI.file('/work/platform.code-workspace');
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
		const fileService = createFileService();
		const storage = disposables.add(new TestStorageService());
		const { service } = await createService({ storage, fileService });
		const owned = await service.createWorkspace('Owned', [vscode, chat]);
		const external = URI.file('/work/external.code-workspace');
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
			folderWorkspace: { uri: folderWorkspace.uri.path, ...snapshot([folderWorkspace])[0] },
			filesAfterCreate,
			grown: { inOwnedHome: extUri.isEqualOrParent(grown.uri, ownedHome), exists: grownFileExists, ...snapshot([grown])[0] },
			shrunk: { uri: shrunk.uri.path, previousUris: shrunk.previousUris?.map(previous => previous.path), ...snapshot([shrunk])[0] },
			grownFileExistsAfterShrink: await fileService.exists(grown.uri),
			workspaces: snapshot(service.managedWorkspaces.get()),
		}, {
			folderWorkspace: { uri: '/work/vscode', name: 'Agents', folders: ['/work/vscode'], owned: true, missing: undefined },
			filesAfterCreate: 0,
			grown: { inOwnedHome: true, exists: true, name: 'Agents', folders: ['/work/vscode', '/work/vscode-copilot-chat'], owned: true, missing: undefined },
			shrunk: { uri: '/work/vscode-copilot-chat', previousUris: [grown.uri.path], name: 'Renamed', folders: ['/work/vscode-copilot-chat'], owned: true, missing: undefined },
			grownFileExistsAfterShrink: false,
			workspaces: [{ name: 'Renamed', folders: ['/work/vscode-copilot-chat'], owned: true, missing: undefined }],
		});
	});

	test('rejects a workspace without folders and a workspace file without folders', async () => {
		const { service, fileService } = await createService();
		const empty = URI.file('/work/empty.code-workspace');
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
		const file = URI.file('/work/tools.code-workspace');
		await fileService.writeFile(file, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }], "icon": "rocket" }'));

		const resolved = await service.resolveWorkspaceFile(file);

		assert.deepStrictEqual({ resolved: { ...snapshot([resolved])[0], icon: resolved.icon }, workspaces: service.managedWorkspaces.get().length }, {
			resolved: { name: 'tools', folders: ['/work/vscode', '/work/vscode-docs'], owned: false, missing: undefined, icon: 'rocket' },
			workspaces: 0,
		});
	});

	test('keeps the icon and color of a folder on this computer and of a workspace file in the file, across edits and restarts, until they are reset', async () => {
		const fileService = createFileService();
		const storage = disposables.add(new TestStorageService());
		const { service } = await createService({ storage, fileService });
		const folderWorkspace = await service.createWorkspace('Agents', [vscode], { icon: 'rocket', color: 'charts.green' });
		const multi = await service.createWorkspace('Docs', [docs, chat]);
		await service.updateWorkspace(multi.uri, { icon: 'beaker', color: '#ff8800' });
		const multiFile = parseSessionWorkspaceFile(await readFile(fileService, multi.uri), multi.uri, extUri);
		const restarted = (await createService({ storage, fileService })).service.managedWorkspaces.get().map(workspace => [workspace.name, workspace.icon, workspace.color]);
		const grown = await service.updateWorkspace(folderWorkspace.uri, { folders: [vscode, chat] });
		const grownFile = parseSessionWorkspaceFile(await readFile(fileService, grown.uri), grown.uri, extUri);
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
		const fileService = createFileService();
		const storage = disposables.add(new TestStorageService());
		const { service, warnings } = await createService({ storage, fileService });
		const platform = URI.file('/work/platform.code-workspace');
		await fileService.writeFile(platform, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }] }'));
		await service.openWorkspace(platform);
		const writeFile = fileService.writeFile.bind(fileService);
		fileService.writeFile = (resource, ...rest) => extUri.isEqual(resource, platform) ? Promise.reject(new Error('read-only')) : writeFile(resource, ...rest);

		await service.updateWorkspace(platform, { icon: 'rocket', color: 'charts.green' });
		const { service: restarted } = await createService({ storage, fileService });
		const afterRestart = restarted.managedWorkspaces.get().map(workspace => [workspace.icon, workspace.color]);
		await writeFile(platform, VSBuffer.fromString('{ "folders": [{ "path": "vscode" }, { "path": "vscode-docs" }], "icon": "tools" }'));
		await restarted.refresh();

		assert.deepStrictEqual({
			workspace: service.managedWorkspaces.get().map(workspace => [workspace.icon, workspace.color]),
			afterRestart,
			fileWins: restarted.managedWorkspaces.get().map(workspace => [workspace.icon, workspace.color]),
			warnings: warnings.length,
		}, {
			workspace: [['rocket', 'charts.green']],
			afterRestart: [['rocket', 'charts.green']],
			fileWins: [['tools', 'charts.green']],
			warnings: 1,
		});
	});

	test('picks up a name, icon and color edited in a workspace file elsewhere', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fileService = createFileService();
		const changed = disposables.add(new Emitter<FileChangesEvent>());
		fileService.createWatcher = () => upcastPartial<IFileSystemWatcher>({ onDidChange: changed.event, dispose: () => { } });
		const { service } = await createService({ fileService });
		const platform = URI.file('/work/platform.code-workspace');
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
		const platform = URI.file('/work/platform.code-workspace');
		const known = URI.file('/work/known.code-workspace');
		const untitled = URI.file('/user/Workspaces/1234/workspace.json');
		const single = URI.file('/work/single.code-workspace');
		const remote = URI.file('/work/remote.code-workspace');
		const many = Array.from({ length: 25 }, (_, index) => ({ uri: URI.file(`/work/many-${index}.code-workspace`), name: `many-${index}`, folders: [vscode, docs] }));
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
			recent: recent.slice(0, 2).map(file => ({ uri: file.uri.path, name: file.name, owned: file.owned, icon: file.icon })),
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
		const platform = URI.file('/work/platform.code-workspace');
		const tools = URI.file('/work/tools.code-workspace');
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
		const platform = URI.file('/work/platform.code-workspace');
		const tools = URI.file('/work/tools.code-workspace');
		const fileService = createFileService();
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
			// Opened, it is a managed workspace; removed as one, VS Code's recent file is listed again
			afterOpenAndRemove: restarted.recentWorkspaceFiles.get().map(file => file.name),
			filesKept: [await fileService.exists(platform), await fileService.exists(tools)],
		}, {
			afterRemove: [],
			afterRestart: [],
			afterOpenAndRemove: ['tools'],
			filesKept: [true, true],
		});
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
