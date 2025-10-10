/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { URI } from '../../../../../base/common/uri.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope, keyFromOverrideIdentifiers } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { WorkspaceService } from '../../browser/configurationService.js';
import { ConfigurationEditingErrorCode } from '../../common/configurationEditing.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFoldersChangeEvent, ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from '../../../../../platform/workspace/common/workspace.js';
import { ConfigurationTarget, IConfigurationService, IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { workbenchInstantiationService, RemoteFileSystemProvider, TestEnvironmentService, TestTextFileService } from '../../../../test/browser/workbenchTestServices.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITextFileService } from '../../../textfile/common/textfiles.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { TextModelResolverService } from '../../../textmodelResolver/common/textModelResolverService.js';
import { IJSONEditingService } from '../../common/jsonEditing.js';
import { JSONEditingService } from '../../common/jsonEditingService.js';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath, dirname, basename } from '../../../../../base/common/resources.js';
import { isLinux, isMacintosh } from '../../../../../base/common/platform.js';
import { IRemoteAgentService } from '../../../remote/common/remoteAgentService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { APPLY_ALL_PROFILES_SETTING, IConfigurationCache } from '../../common/configuration.js';
import { SignService } from '../../../../../platform/sign/browser/signService.js';
import { FileUserDataProvider } from '../../../../../platform/userData/common/fileUserDataProvider.js';
import { IKeybindingEditingService, KeybindingsEditingService } from '../../../keybinding/common/keybindingEditing.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { BrowserWorkbenchEnvironmentService, IBrowserWorkbenchEnvironmentService } from '../../../environment/browser/environmentService.js';
import { RemoteAgentService } from '../../../remote/browser/remoteAgentService.js';
import { RemoteAuthorityResolverService } from '../../../../../platform/remote/browser/remoteAuthorityResolverService.js';
import { hash } from '../../../../../base/common/hash.js';
import { TestProductService } from '../../../../test/common/workbenchTestServices.js';
import { IUserDataProfilesService, toUserDataProfile, UserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { NullPolicyService } from '../../../../../platform/policy/common/policy.js';
import { FilePolicyService } from '../../../../../platform/policy/common/filePolicyService.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { UserDataProfileService } from '../../../userDataProfile/common/userDataProfileService.js';
import { IUserDataProfileService } from '../../../userDataProfile/common/userDataProfile.js';
import { TasksSchemaProperties } from '../../../../contrib/tasks/common/tasks.js';
import { RemoteSocketFactoryService } from '../../../../../platform/remote/common/remoteSocketFactoryService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

function convertToWorkspacePayload(folder: URI): ISingleFolderWorkspaceIdentifier {
	return {
		id: hash(folder.toString()).toString(16),
		uri: folder
	};
}

class ConfigurationCache implements IConfigurationCache {
	needsCaching(resource: URI): boolean { return false; }
	async read(): Promise<string> { return ''; }
	async write(): Promise<void> { }
	async remove(): Promise<void> { }
}

const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });

suite('WorkspaceContextService - Folder', () => {

	const folderName = 'Folder A';
	let folder: URI;
	let testObject: WorkspaceService;
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		folder = joinPath(ROOT, folderName);
		await fileService.createFolder(folder);

		const environmentService = TestEnvironmentService;
		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		const userDataProfilesService = disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new FileUserDataProvider(ROOT.scheme, fileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, new NullLogService()))));
		const userDataProfileService = disposables.add(new UserDataProfileService(userDataProfilesService.defaultProfile));
		testObject = disposables.add(new WorkspaceService(
			{ configurationCache: new ConfigurationCache() },
			environmentService,
			userDataProfileService,
			userDataProfilesService,
			fileService,
			disposables.add(new RemoteAgentService(
				new RemoteSocketFactoryService(),
				userDataProfileService,
				environmentService,
				TestProductService,
				disposables.add(new RemoteAuthorityResolverService(false, undefined, undefined, undefined, TestProductService, logService)),
				new SignService(TestProductService), new NullLogService())),
			uriIdentityService,
			new NullLogService(),
			new NullPolicyService()));
		await (<WorkspaceService>testObject).initialize(convertToWorkspacePayload(folder));
	});

	test('getWorkspace()', () => {
		const actual = testObject.getWorkspace();

		assert.strictEqual(actual.folders.length, 1);
		assert.strictEqual(actual.folders[0].uri.path, folder.path);
		assert.strictEqual(actual.folders[0].name, folderName);
		assert.strictEqual(actual.folders[0].index, 0);
		assert.ok(!actual.configuration);
	});

	test('getWorkbenchState()', () => {
		const actual = testObject.getWorkbenchState();

		assert.strictEqual(actual, WorkbenchState.FOLDER);
	});

	test('getWorkspaceFolder()', () => {
		const actual = testObject.getWorkspaceFolder(joinPath(folder, 'a'));

		assert.strictEqual(actual, testObject.getWorkspace().folders[0]);
	});

	test('getWorkspaceFolder() - queries in workspace folder', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {

		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		const folder = joinPath(ROOT, folderName).with({ query: 'myquery=1' });
		await fileService.createFolder(folder);

		const environmentService = TestEnvironmentService;
		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		const userDataProfilesService = disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new FileUserDataProvider(ROOT.scheme, fileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, new NullLogService()))));
		const userDataProfileService = disposables.add(new UserDataProfileService(userDataProfilesService.defaultProfile));
		const testObject = disposables.add(new WorkspaceService(
			{ configurationCache: new ConfigurationCache() },
			environmentService,
			userDataProfileService,
			userDataProfilesService,
			fileService,
			disposables.add(new RemoteAgentService(new RemoteSocketFactoryService(), userDataProfileService, environmentService, TestProductService, disposables.add(new RemoteAuthorityResolverService(false, undefined, undefined, undefined, TestProductService, logService)), new SignService(TestProductService), new NullLogService())),
			uriIdentityService,
			new NullLogService(),
			new NullPolicyService()));
		await (<WorkspaceService>testObject).initialize(convertToWorkspacePayload(folder));

		const actual = testObject.getWorkspaceFolder(joinPath(folder, 'a'));

		assert.strictEqual(actual, testObject.getWorkspace().folders[0]);
	}));

	test('getWorkspaceFolder() - queries in resource', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {

		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		const folder = joinPath(ROOT, folderName);
		await fileService.createFolder(folder);

		const environmentService = TestEnvironmentService;
		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		const userDataProfilesService = disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new FileUserDataProvider(ROOT.scheme, fileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, new NullLogService()))));
		const userDataProfileService = disposables.add(new UserDataProfileService(userDataProfilesService.defaultProfile));
		const testObject = disposables.add(new WorkspaceService(
			{ configurationCache: new ConfigurationCache() },
			environmentService,
			userDataProfileService,
			userDataProfilesService,
			fileService,
			disposables.add(new RemoteAgentService(new RemoteSocketFactoryService(), userDataProfileService, environmentService, TestProductService, disposables.add(new RemoteAuthorityResolverService(false, undefined, undefined, undefined, TestProductService, logService)), new SignService(TestProductService), new NullLogService())),
			uriIdentityService,
			new NullLogService(),
			new NullPolicyService()));
		await testObject.initialize(convertToWorkspacePayload(folder));

		const actual = testObject.getWorkspaceFolder(joinPath(folder, 'a').with({ query: 'myquery=1' }));

		assert.strictEqual(actual, testObject.getWorkspace().folders[0]);
	}));

	test('isCurrentWorkspace() => true', () => {
		assert.ok(testObject.isCurrentWorkspace(folder));
	});

	test('isCurrentWorkspace() => false', () => {
		assert.ok(!testObject.isCurrentWorkspace(joinPath(dirname(folder), 'abc')));
	});

	test('workspace is complete', () => testObject.getCompleteWorkspace());
});

suite('WorkspaceContextService - Workspace', () => {

	let testObject: WorkspaceService;
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		const appSettingsHome = joinPath(ROOT, 'user');
		const folderA = joinPath(ROOT, 'a');
		const folderB = joinPath(ROOT, 'b');
		const configResource = joinPath(ROOT, 'vsctests.code-workspace');
		const workspace = { folders: [{ path: folderA.path }, { path: folderB.path }] };

		await fileService.createFolder(appSettingsHome);
		await fileService.createFolder(folderA);
		await fileService.createFolder(folderB);
		await fileService.writeFile(configResource, VSBuffer.fromString(JSON.stringify(workspace, null, '\t')));

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const environmentService = TestEnvironmentService;
		const remoteAgentService = disposables.add(disposables.add(instantiationService.createInstance(RemoteAgentService)));
		instantiationService.stub(IRemoteAgentService, remoteAgentService);
		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		const userDataProfilesService = instantiationService.stub(IUserDataProfilesService, disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService)));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new FileUserDataProvider(ROOT.scheme, fileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, new NullLogService()))));
		testObject = disposables.add(new WorkspaceService(
			{ configurationCache: new ConfigurationCache() },
			environmentService,
			disposables.add(new UserDataProfileService(userDataProfilesService.defaultProfile)),
			userDataProfilesService, fileService, remoteAgentService, uriIdentityService, new NullLogService(), new NullPolicyService()));

		instantiationService.stub(IWorkspaceContextService, testObject);
		instantiationService.stub(IConfigurationService, testObject);
		instantiationService.stub(IEnvironmentService, environmentService);

		await testObject.initialize(getWorkspaceIdentifier(configResource));
		testObject.acquireInstantiationService(instantiationService);
	});

	test('workspace folders', () => {
		const actual = testObject.getWorkspace().folders;

		assert.strictEqual(actual.length, 2);
		assert.strictEqual(basename(actual[0].uri), 'a');
		assert.strictEqual(basename(actual[1].uri), 'b');
	});

	test('getWorkbenchState()', () => {
		const actual = testObject.getWorkbenchState();

		assert.strictEqual(actual, WorkbenchState.WORKSPACE);
	});


	test('workspace is complete', () => testObject.getCompleteWorkspace());

});

suite('WorkspaceContextService - Workspace Editing', () => {

	let testObject: WorkspaceService, fileService: IFileService;
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		const logService = new NullLogService();
		fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		const appSettingsHome = joinPath(ROOT, 'user');
		const folderA = joinPath(ROOT, 'a');
		const folderB = joinPath(ROOT, 'b');
		const configResource = joinPath(ROOT, 'vsctests.code-workspace');
		const workspace = { folders: [{ path: folderA.path }, { path: folderB.path }] };

		await fileService.createFolder(appSettingsHome);
		await fileService.createFolder(folderA);
		await fileService.createFolder(folderB);
		await fileService.writeFile(configResource, VSBuffer.fromString(JSON.stringify(workspace, null, '\t')));

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const environmentService = TestEnvironmentService;
		const remoteAgentService = disposables.add(instantiationService.createInstance(RemoteAgentService));
		instantiationService.stub(IRemoteAgentService, remoteAgentService);
		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		const userDataProfilesService = instantiationService.stub(IUserDataProfilesService, disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService)));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new FileUserDataProvider(ROOT.scheme, fileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, new NullLogService()))));
		testObject = disposables.add(new WorkspaceService(
			{ configurationCache: new ConfigurationCache() },
			environmentService,
			disposables.add(new UserDataProfileService(userDataProfilesService.defaultProfile)),
			userDataProfilesService, fileService, remoteAgentService, uriIdentityService, new NullLogService(), new NullPolicyService()));

		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IWorkspaceContextService, testObject);
		instantiationService.stub(IConfigurationService, testObject);
		instantiationService.stub(IEnvironmentService, environmentService);

		await testObject.initialize(getWorkspaceIdentifier(configResource));
		instantiationService.stub(ITextFileService, disposables.add(instantiationService.createInstance(TestTextFileService)));
		instantiationService.stub(ITextModelService, disposables.add(instantiationService.createInstance(TextModelResolverService)));
		instantiationService.stub(IJSONEditingService, instantiationService.createInstance(JSONEditingService));
		testObject.acquireInstantiationService(instantiationService);
	});

	test('add folders', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.addFolders([{ uri: joinPath(ROOT, 'd') }, { uri: joinPath(ROOT, 'c') }]);
		const actual = testObject.getWorkspace().folders;

		assert.strictEqual(actual.length, 4);
		assert.strictEqual(basename(actual[0].uri), 'a');
		assert.strictEqual(basename(actual[1].uri), 'b');
		assert.strictEqual(basename(actual[2].uri), 'd');
		assert.strictEqual(basename(actual[3].uri), 'c');
	}));

	test('add folders (at specific index)', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.addFolders([{ uri: joinPath(ROOT, 'd') }, { uri: joinPath(ROOT, 'c') }], 0);
		const actual = testObject.getWorkspace().folders;

		assert.strictEqual(actual.length, 4);
		assert.strictEqual(basename(actual[0].uri), 'd');
		assert.strictEqual(basename(actual[1].uri), 'c');
		assert.strictEqual(basename(actual[2].uri), 'a');
		assert.strictEqual(basename(actual[3].uri), 'b');
	}));

	test('add folders (at specific wrong index)', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.addFolders([{ uri: joinPath(ROOT, 'd') }, { uri: joinPath(ROOT, 'c') }], 10);
		const actual = testObject.getWorkspace().folders;

		assert.strictEqual(actual.length, 4);
		assert.strictEqual(basename(actual[0].uri), 'a');
		assert.strictEqual(basename(actual[1].uri), 'b');
		assert.strictEqual(basename(actual[2].uri), 'd');
		assert.strictEqual(basename(actual[3].uri), 'c');
	}));

	test('add folders (with name)', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.addFolders([{ uri: joinPath(ROOT, 'd'), name: 'DDD' }, { uri: joinPath(ROOT, 'c'), name: 'CCC' }]);
		const actual = testObject.getWorkspace().folders;

		assert.strictEqual(actual.length, 4);
		assert.strictEqual(basename(actual[0].uri), 'a');
		assert.strictEqual(basename(actual[1].uri), 'b');
		assert.strictEqual(basename(actual[2].uri), 'd');
		assert.strictEqual(basename(actual[3].uri), 'c');
		assert.strictEqual(actual[2].name, 'DDD');
		assert.strictEqual(actual[3].name, 'CCC');
	}));

	test('add folders triggers change event', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const target = sinon.spy();
		disposables.add(testObject.onWillChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeWorkspaceFolders(target));

		const addedFolders = [{ uri: joinPath(ROOT, 'd') }, { uri: joinPath(ROOT, 'c') }];
		await testObject.addFolders(addedFolders);

		assert.strictEqual(target.callCount, 2, `Should be called only once but called ${target.callCount} times`);
		const actual_1 = (<IWorkspaceFoldersChangeEvent>target.args[1][0]);
		assert.deepStrictEqual(actual_1.added.map(r => r.uri.toString()), addedFolders.map(a => a.uri.toString()));
		assert.deepStrictEqual(actual_1.removed, []);
		assert.deepStrictEqual(actual_1.changed, []);
	}));

	test('remove folders', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.removeFolders([testObject.getWorkspace().folders[0].uri]);
		const actual = testObject.getWorkspace().folders;

		assert.strictEqual(actual.length, 1);
		assert.strictEqual(basename(actual[0].uri), 'b');
	}));

	test('remove folders triggers change event', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const target = sinon.spy();
		disposables.add(testObject.onWillChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeWorkspaceFolders(target));
		const removedFolder = testObject.getWorkspace().folders[0];
		await testObject.removeFolders([removedFolder.uri]);

		assert.strictEqual(target.callCount, 2, `Should be called only once but called ${target.callCount} times`);
		const actual_1 = (<IWorkspaceFoldersChangeEvent>target.args[1][0]);
		assert.deepStrictEqual(actual_1.added, []);
		assert.deepStrictEqual(actual_1.removed.map(r => r.uri.toString()), [removedFolder.uri.toString()]);
		assert.deepStrictEqual(actual_1.changed.map(c => c.uri.toString()), [testObject.getWorkspace().folders[0].uri.toString()]);
	}));

	test('remove folders and add them back by writing into the file', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folders = testObject.getWorkspace().folders;
		await testObject.removeFolders([folders[0].uri]);

		const promise = new Promise<void>((resolve, reject) => {
			disposables.add(testObject.onDidChangeWorkspaceFolders(actual => {
				try {
					assert.deepStrictEqual(actual.added.map(r => r.uri.toString()), [folders[0].uri.toString()]);
					resolve();
				} catch (error) {
					reject(error);
				}
			}));
		});

		const workspace = { folders: [{ path: folders[0].uri.path }, { path: folders[1].uri.path }] };
		await fileService.writeFile(testObject.getWorkspace().configuration!, VSBuffer.fromString(JSON.stringify(workspace, null, '\t')));
		await promise;
	}));

	test('update folders (remove last and add to end)', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const target = sinon.spy();
		disposables.add(testObject.onWillChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeWorkspaceFolders(target));
		const addedFolders = [{ uri: joinPath(ROOT, 'd') }, { uri: joinPath(ROOT, 'c') }];
		const removedFolders = [testObject.getWorkspace().folders[1]].map(f => f.uri);
		await testObject.updateFolders(addedFolders, removedFolders);

		assert.strictEqual(target.callCount, 2, `Should be called only once but called ${target.callCount} times`);
		const actual_1 = (<IWorkspaceFoldersChangeEvent>target.args[1][0]);
		assert.deepStrictEqual(actual_1.added.map(r => r.uri.toString()), addedFolders.map(a => a.uri.toString()));
		assert.deepStrictEqual(actual_1.removed.map(r_1 => r_1.uri.toString()), removedFolders.map(a_1 => a_1.toString()));
		assert.deepStrictEqual(actual_1.changed, []);
	}));

	test('update folders (rename first via add and remove)', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const target = sinon.spy();
		disposables.add(testObject.onWillChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeWorkspaceFolders(target));
		const addedFolders = [{ uri: joinPath(ROOT, 'a'), name: 'The Folder' }];
		const removedFolders = [testObject.getWorkspace().folders[0]].map(f => f.uri);
		await testObject.updateFolders(addedFolders, removedFolders, 0);

		assert.strictEqual(target.callCount, 2, `Should be called only once but called ${target.callCount} times`);
		const actual_1 = (<IWorkspaceFoldersChangeEvent>target.args[1][0]);
		assert.deepStrictEqual(actual_1.added, []);
		assert.deepStrictEqual(actual_1.removed, []);
		assert.deepStrictEqual(actual_1.changed.map(r => r.uri.toString()), removedFolders.map(a => a.toString()));
	}));

	test('update folders (remove first and add to end)', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const target = sinon.spy();
		disposables.add(testObject.onWillChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeWorkspaceFolders(target));
		const addedFolders = [{ uri: joinPath(ROOT, 'd') }, { uri: joinPath(ROOT, 'c') }];
		const removedFolders = [testObject.getWorkspace().folders[0]].map(f => f.uri);
		const changedFolders = [testObject.getWorkspace().folders[1]].map(f => f.uri);
		await testObject.updateFolders(addedFolders, removedFolders);

		assert.strictEqual(target.callCount, 2, `Should be called only once but called ${target.callCount} times`);
		const actual_1 = (<IWorkspaceFoldersChangeEvent>target.args[1][0]);
		assert.deepStrictEqual(actual_1.added.map(r => r.uri.toString()), addedFolders.map(a => a.uri.toString()));
		assert.deepStrictEqual(actual_1.removed.map(r_1 => r_1.uri.toString()), removedFolders.map(a_1 => a_1.toString()));
		assert.deepStrictEqual(actual_1.changed.map(r_2 => r_2.uri.toString()), changedFolders.map(a_2 => a_2.toString()));
	}));

	test('reorder folders trigger change event', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const target = sinon.spy();
		disposables.add(testObject.onWillChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeWorkspaceFolders(target));
		const workspace = { folders: [{ path: testObject.getWorkspace().folders[1].uri.path }, { path: testObject.getWorkspace().folders[0].uri.path }] };
		await fileService.writeFile(testObject.getWorkspace().configuration!, VSBuffer.fromString(JSON.stringify(workspace, null, '\t')));
		await testObject.reloadConfiguration();

		assert.strictEqual(target.callCount, 2, `Should be called only once but called ${target.callCount} times`);
		const actual_1 = (<IWorkspaceFoldersChangeEvent>target.args[1][0]);
		assert.deepStrictEqual(actual_1.added, []);
		assert.deepStrictEqual(actual_1.removed, []);
		assert.deepStrictEqual(actual_1.changed.map(c => c.uri.toString()), testObject.getWorkspace().folders.map(f => f.uri.toString()).reverse());
	}));

	test('rename folders trigger change event', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const target = sinon.spy();
		disposables.add(testObject.onWillChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeWorkspaceFolders(target));
		const workspace = { folders: [{ path: testObject.getWorkspace().folders[0].uri.path, name: '1' }, { path: testObject.getWorkspace().folders[1].uri.path }] };
		fileService.writeFile(testObject.getWorkspace().configuration!, VSBuffer.fromString(JSON.stringify(workspace, null, '\t')));
		await testObject.reloadConfiguration();

		assert.strictEqual(target.callCount, 2, `Should be called only once but called ${target.callCount} times`);
		const actual_1 = (<IWorkspaceFoldersChangeEvent>target.args[1][0]);
		assert.deepStrictEqual(actual_1.added, []);
		assert.deepStrictEqual(actual_1.removed, []);
		assert.deepStrictEqual(actual_1.changed.map(c => c.uri.toString()), [testObject.getWorkspace().folders[0].uri.toString()]);
	}));

});

suite('WorkspaceService - Initialization', () => {

	let configResource: URI, testObject: WorkspaceService, fileService: IFileService, environmentService: BrowserWorkbenchEnvironmentService, userDataProfileService: IUserDataProfileService;
	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suiteSetup(() => {
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'initialization.testSetting1': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.RESOURCE
				},
				'initialization.testSetting2': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.RESOURCE
				}
			}
		});
	});

	setup(async () => {
		const logService = new NullLogService();
		fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		const appSettingsHome = joinPath(ROOT, 'user');
		const folderA = joinPath(ROOT, 'a');
		const folderB = joinPath(ROOT, 'b');
		configResource = joinPath(ROOT, 'vsctests.code-workspace');
		const workspace = { folders: [{ path: folderA.path }, { path: folderB.path }] };

		await fileService.createFolder(appSettingsHome);
		await fileService.createFolder(folderA);
		await fileService.createFolder(folderB);
		await fileService.writeFile(configResource, VSBuffer.fromString(JSON.stringify(workspace, null, '\t')));

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		environmentService = TestEnvironmentService;
		const remoteAgentService = disposables.add(instantiationService.createInstance(RemoteAgentService));
		instantiationService.stub(IRemoteAgentService, remoteAgentService);
		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		const userDataProfilesService = instantiationService.stub(IUserDataProfilesService, disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService)));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new FileUserDataProvider(ROOT.scheme, fileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, new NullLogService()))));
		userDataProfileService = instantiationService.stub(IUserDataProfileService, disposables.add(new UserDataProfileService(userDataProfilesService.defaultProfile)));
		testObject = disposables.add(new WorkspaceService(
			{ configurationCache: new ConfigurationCache() },
			environmentService,
			userDataProfileService,
			userDataProfilesService, fileService, remoteAgentService, uriIdentityService, new NullLogService(), new NullPolicyService()));
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IWorkspaceContextService, testObject);
		instantiationService.stub(IConfigurationService, testObject);
		instantiationService.stub(IEnvironmentService, environmentService);

		await testObject.initialize({ id: '' });
		instantiationService.stub(ITextFileService, disposables.add(instantiationService.createInstance(TestTextFileService)));
		instantiationService.stub(ITextModelService, disposables.add(instantiationService.createInstance(TextModelResolverService)));
		testObject.acquireInstantiationService(instantiationService);
	});

	(isMacintosh ? test.skip : test)('initialize a folder workspace from an empty workspace with no configuration changes', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {

		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "initialization.testSetting1": "userValue" }'));

		await testObject.reloadConfiguration();
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeWorkbenchState(target));
		disposables.add(testObject.onDidChangeWorkspaceName(target));
		disposables.add(testObject.onWillChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeConfiguration(target));

		const folder = joinPath(ROOT, 'a');
		await testObject.initialize(convertToWorkspacePayload(folder));

		assert.strictEqual(testObject.getValue('initialization.testSetting1'), 'userValue');
		assert.strictEqual(target.callCount, 4);
		assert.deepStrictEqual(target.args[0], [WorkbenchState.FOLDER]);
		assert.deepStrictEqual(target.args[1], [undefined]);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[3][0]).added.map(f => f.uri.toString()), [folder.toString()]);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[3][0]).removed, []);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[3][0]).changed, []);

	}));

	(isMacintosh ? test.skip : test)('initialize a folder workspace from an empty workspace with configuration changes', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {

		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "initialization.testSetting1": "userValue" }'));

		await testObject.reloadConfiguration();
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeWorkbenchState(target));
		disposables.add(testObject.onDidChangeWorkspaceName(target));
		disposables.add(testObject.onWillChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeConfiguration(target));

		const folder = joinPath(ROOT, 'a');
		await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "initialization.testSetting1": "workspaceValue" }'));
		await testObject.initialize(convertToWorkspacePayload(folder));

		assert.strictEqual(testObject.getValue('initialization.testSetting1'), 'workspaceValue');
		assert.strictEqual(target.callCount, 5);
		assert.deepStrictEqual([...(<IConfigurationChangeEvent>target.args[0][0]).affectedKeys], ['initialization.testSetting1']);
		assert.deepStrictEqual(target.args[1], [WorkbenchState.FOLDER]);
		assert.deepStrictEqual(target.args[2], [undefined]);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[4][0]).added.map(f => f.uri.toString()), [folder.toString()]);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[4][0]).removed, []);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[4][0]).changed, []);

	}));

	(isMacintosh ? test.skip : test)('initialize a multi root workspace from an empty workspace with no configuration changes', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {

		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "initialization.testSetting1": "userValue" }'));

		await testObject.reloadConfiguration();
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeWorkbenchState(target));
		disposables.add(testObject.onDidChangeWorkspaceName(target));
		disposables.add(testObject.onWillChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeConfiguration(target));

		await testObject.initialize(getWorkspaceIdentifier(configResource));

		assert.strictEqual(target.callCount, 4);
		assert.deepStrictEqual(target.args[0], [WorkbenchState.WORKSPACE]);
		assert.deepStrictEqual(target.args[1], [undefined]);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[3][0]).added.map(folder => folder.uri.toString()), [joinPath(ROOT, 'a').toString(), joinPath(ROOT, 'b').toString()]);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[3][0]).removed, []);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[3][0]).changed, []);

	}));

	(isMacintosh ? test.skip : test)('initialize a multi root workspace from an empty workspace with configuration changes', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {

		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "initialization.testSetting1": "userValue" }'));

		await testObject.reloadConfiguration();
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeWorkbenchState(target));
		disposables.add(testObject.onDidChangeWorkspaceName(target));
		disposables.add(testObject.onWillChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeConfiguration(target));

		await fileService.writeFile(joinPath(ROOT, 'a', '.vscode', 'settings.json'), VSBuffer.fromString('{ "initialization.testSetting1": "workspaceValue1" }'));
		await fileService.writeFile(joinPath(ROOT, 'b', '.vscode', 'settings.json'), VSBuffer.fromString('{ "initialization.testSetting2": "workspaceValue2" }'));
		await testObject.initialize(getWorkspaceIdentifier(configResource));

		assert.strictEqual(target.callCount, 5);
		assert.deepStrictEqual([...(<IConfigurationChangeEvent>target.args[0][0]).affectedKeys], ['initialization.testSetting1', 'initialization.testSetting2']);
		assert.deepStrictEqual(target.args[1], [WorkbenchState.WORKSPACE]);
		assert.deepStrictEqual(target.args[2], [undefined]);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[4][0]).added.map(folder => folder.uri.toString()), [joinPath(ROOT, 'a').toString(), joinPath(ROOT, 'b').toString()]);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[4][0]).removed, []);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[4][0]).changed, []);

	}));

	(isMacintosh ? test.skip : test)('initialize a folder workspace from a folder workspace with no configuration changes', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {

		await testObject.initialize(convertToWorkspacePayload(joinPath(ROOT, 'a')));
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "initialization.testSetting1": "userValue" }'));
		await testObject.reloadConfiguration();
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeWorkbenchState(target));
		disposables.add(testObject.onDidChangeWorkspaceName(target));
		disposables.add(testObject.onWillChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeConfiguration(target));

		await testObject.initialize(convertToWorkspacePayload(joinPath(ROOT, 'b')));

		assert.strictEqual(testObject.getValue('initialization.testSetting1'), 'userValue');
		assert.strictEqual(target.callCount, 2);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[1][0]).added.map(folder_1 => folder_1.uri.toString()), [joinPath(ROOT, 'b').toString()]);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[1][0]).removed.map(folder_2 => folder_2.uri.toString()), [joinPath(ROOT, 'a').toString()]);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[1][0]).changed, []);

	}));

	(isMacintosh ? test.skip : test)('initialize a folder workspace from a folder workspace with configuration changes', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {

		await testObject.initialize(convertToWorkspacePayload(joinPath(ROOT, 'a')));
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeWorkbenchState(target));
		disposables.add(testObject.onDidChangeWorkspaceName(target));
		disposables.add(testObject.onWillChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeConfiguration(target));

		await fileService.writeFile(joinPath(ROOT, 'b', '.vscode', 'settings.json'), VSBuffer.fromString('{ "initialization.testSetting1": "workspaceValue2" }'));
		await testObject.initialize(convertToWorkspacePayload(joinPath(ROOT, 'b')));

		assert.strictEqual(testObject.getValue('initialization.testSetting1'), 'workspaceValue2');
		assert.strictEqual(target.callCount, 3);
		assert.deepStrictEqual([...(<IConfigurationChangeEvent>target.args[0][0]).affectedKeys], ['initialization.testSetting1']);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[2][0]).added.map(folder_1 => folder_1.uri.toString()), [joinPath(ROOT, 'b').toString()]);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[2][0]).removed.map(folder_2 => folder_2.uri.toString()), [joinPath(ROOT, 'a').toString()]);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[2][0]).changed, []);

	}));

	(isMacintosh ? test.skip : test)('initialize a multi folder workspace from a folder workspacce triggers change events in the right order', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.initialize(convertToWorkspacePayload(joinPath(ROOT, 'a')));
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeWorkbenchState(target));
		disposables.add(testObject.onDidChangeWorkspaceName(target));
		disposables.add(testObject.onWillChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeWorkspaceFolders(target));
		disposables.add(testObject.onDidChangeConfiguration(target));

		await fileService.writeFile(joinPath(ROOT, 'a', '.vscode', 'settings.json'), VSBuffer.fromString('{ "initialization.testSetting1": "workspaceValue2" }'));
		await testObject.initialize(getWorkspaceIdentifier(configResource));

		assert.strictEqual(target.callCount, 5);
		assert.deepStrictEqual([...(<IConfigurationChangeEvent>target.args[0][0]).affectedKeys], ['initialization.testSetting1']);
		assert.deepStrictEqual(target.args[1], [WorkbenchState.WORKSPACE]);
		assert.deepStrictEqual(target.args[2], [undefined]);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[4][0]).added.map(folder_1 => folder_1.uri.toString()), [joinPath(ROOT, 'b').toString()]);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[4][0]).removed, []);
		assert.deepStrictEqual((<IWorkspaceFoldersChangeEvent>target.args[4][0]).changed, []);
	}));

});

suite('WorkspaceConfigurationService - Folder', () => {

	let testObject: WorkspaceService, workspaceService: WorkspaceService, fileService: IFileService, environmentService: IBrowserWorkbenchEnvironmentService, userDataProfileService: IUserDataProfileService, instantiationService: TestInstantiationService;
	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suiteSetup(() => {
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.folder.applicationSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.APPLICATION
				},
				'configurationService.folder.machineSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.MACHINE
				},
				'configurationService.folder.applicationMachineSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.APPLICATION_MACHINE
				},
				'configurationService.folder.machineOverridableSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.MACHINE_OVERRIDABLE
				},
				'configurationService.folder.testSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.RESOURCE
				},
				'configurationService.folder.languageSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
				},
				'configurationService.folder.restrictedSetting': {
					'type': 'string',
					'default': 'isSet',
					restricted: true
				},
				'configurationService.folder.policySetting': {
					'type': 'string',
					'default': 'isSet',
					policy: {
						name: 'configurationService.folder.policySetting',
						minimumVersion: '1.0.0',
					}
				},
				'configurationService.folder.policyObjectSetting': {
					'type': 'object',
					'default': {},
					policy: {
						name: 'configurationService.folder.policyObjectSetting',
						minimumVersion: '1.0.0',
					}
				},
			}
		});

		configurationRegistry.registerDefaultConfigurations([{
			overrides: {
				'[jsonc]': {
					'configurationService.folder.languageSetting': 'languageValue'
				}
			}
		}]);
	});

	setup(async () => {
		const logService = new NullLogService();
		fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		const folder = joinPath(ROOT, 'a');
		await fileService.createFolder(folder);

		instantiationService = workbenchInstantiationService(undefined, disposables);
		environmentService = TestEnvironmentService;
		environmentService.policyFile = joinPath(folder, 'policies.json');
		const remoteAgentService = disposables.add(instantiationService.createInstance(RemoteAgentService));
		instantiationService.stub(IRemoteAgentService, remoteAgentService);
		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		const userDataProfilesService = instantiationService.stub(IUserDataProfilesService, disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService)));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new FileUserDataProvider(ROOT.scheme, fileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, new NullLogService()))));
		userDataProfileService = instantiationService.stub(IUserDataProfileService, disposables.add(new UserDataProfileService(userDataProfilesService.defaultProfile)));
		workspaceService = testObject = disposables.add(new WorkspaceService(
			{ configurationCache: new ConfigurationCache() },
			environmentService, userDataProfileService, userDataProfilesService,
			fileService, remoteAgentService, uriIdentityService, new NullLogService(),
			disposables.add(new FilePolicyService(environmentService.policyFile, fileService, logService))));
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IWorkspaceContextService, testObject);
		instantiationService.stub(IConfigurationService, testObject);
		instantiationService.stub(IEnvironmentService, environmentService);

		await workspaceService.initialize(convertToWorkspacePayload(folder));
		instantiationService.stub(IKeybindingEditingService, disposables.add(instantiationService.createInstance(KeybindingsEditingService)));
		instantiationService.stub(ITextFileService, disposables.add(instantiationService.createInstance(TestTextFileService)));
		instantiationService.stub(ITextModelService, <ITextModelService>disposables.add(instantiationService.createInstance(TextModelResolverService)));
		workspaceService.acquireInstantiationService(instantiationService);
	});

	test('defaults', () => {
		assert.deepStrictEqual(testObject.getValue('configurationService'),
			{
				'folder': {
					'applicationSetting': 'isSet',
					'machineSetting': 'isSet',
					'applicationMachineSetting': 'isSet',
					'machineOverridableSetting': 'isSet',
					'testSetting': 'isSet',
					'languageSetting': 'isSet',
					'restrictedSetting': 'isSet',
					'policySetting': 'isSet',
					'policyObjectSetting': {}
				}
			});
	});

	test('globals override defaults', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.testSetting": "userValue" }'));
		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.folder.testSetting'), 'userValue');
	}));

	test('globals', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "testworkbench.editor.tabs": true }'));
		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('testworkbench.editor.tabs'), true);
	}));

	test('workspace settings', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "testworkbench.editor.icons": true }'));
		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('testworkbench.editor.icons'), true);
	}));

	test('workspace settings override user settings', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.testSetting": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.testSetting": "workspaceValue" }'));
		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.folder.testSetting'), 'workspaceValue');
	}));

	test('machine overridable settings override user Settings', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.machineOverridableSetting": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.machineOverridableSetting": "workspaceValue" }'));
		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.folder.machineOverridableSetting'), 'workspaceValue');
	}));

	test('workspace settings override user settings after defaults are registered ', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.newSetting": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.newSetting": "workspaceValue" }'));
		await testObject.reloadConfiguration();
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.folder.newSetting': {
					'type': 'string',
					'default': 'isSet'
				}
			}
		});
		assert.strictEqual(testObject.getValue('configurationService.folder.newSetting'), 'workspaceValue');
	}));

	test('machine overridable settings override user settings after defaults are registered ', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.newMachineOverridableSetting": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.newMachineOverridableSetting": "workspaceValue" }'));
		await testObject.reloadConfiguration();
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.folder.newMachineOverridableSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.MACHINE_OVERRIDABLE
				}
			}
		});
		assert.strictEqual(testObject.getValue('configurationService.folder.newMachineOverridableSetting'), 'workspaceValue');
	}));

	test('application settings are not read from workspace', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.applicationSetting": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.applicationSetting": "workspaceValue" }'));

		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.folder.applicationSetting'), 'userValue');
	}));

	test('application settings are not read from workspace when workspace folder uri is passed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.applicationSetting": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.applicationSetting": "workspaceValue" }'));

		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.folder.applicationSetting', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
	}));

	test('machine settings are not read from workspace', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.machineSetting": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.machineSetting": "workspaceValue" }'));

		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.folder.machineSetting', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
	}));

	test('machine settings are not read from workspace when workspace folder uri is passed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.machineSetting": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.machineSetting": "workspaceValue" }'));

		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.folder.machineSetting', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
	}));

	test('application machine overridable settings are not read from workspace', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.applicationMachineSetting": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.applicationMachineSetting": "workspaceValue" }'));

		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.folder.applicationMachineSetting'), 'userValue');
	}));

	test('application machine overridable settings are not read from workspace when workspace folder uri is passed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.applicationMachineSetting": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.applicationMachineSetting": "workspaceValue" }'));

		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.folder.applicationMachineSetting', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
	}));

	test('get application scope settings are loaded after defaults are registered', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.applicationSetting-2": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.applicationSetting-2": "workspaceValue" }'));

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.folder.applicationSetting-2'), 'workspaceValue');

		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.folder.applicationSetting-2': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.APPLICATION
				}
			}
		});

		assert.strictEqual(testObject.getValue('configurationService.folder.applicationSetting-2'), 'userValue');

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.folder.applicationSetting-2'), 'userValue');
	}));

	test('get application scope settings are not loaded after defaults are registered when workspace folder uri is passed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.applicationSetting-3": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.applicationSetting-3": "workspaceValue" }'));

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.folder.applicationSetting-3', { resource: workspaceService.getWorkspace().folders[0].uri }), 'workspaceValue');

		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.folder.applicationSetting-3': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.APPLICATION
				}
			}
		});

		assert.strictEqual(testObject.getValue('configurationService.folder.applicationSetting-3', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.folder.applicationSetting-3', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
	}));

	test('get application machine overridable scope settings are loaded after defaults are registered', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.applicationMachineSetting-2": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.applicationMachineSetting-2": "workspaceValue" }'));

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.folder.applicationMachineSetting-2'), 'workspaceValue');

		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.folder.applicationMachineSetting-2': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.APPLICATION
				}
			}
		});

		assert.strictEqual(testObject.getValue('configurationService.folder.applicationMachineSetting-2'), 'userValue');

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.folder.applicationMachineSetting-2'), 'userValue');
	}));

	test('get application machine overridable scope settings are loaded after defaults are registered when workspace folder uri is passed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.applicationMachineSetting-3": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.applicationMachineSetting-3": "workspaceValue" }'));

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.folder.applicationMachineSetting-3', { resource: workspaceService.getWorkspace().folders[0].uri }), 'workspaceValue');

		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.folder.applicationMachineSetting-3': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.APPLICATION
				}
			}
		});

		assert.strictEqual(testObject.getValue('configurationService.folder.applicationMachineSetting-3', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.folder.applicationMachineSetting-3', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
	}));

	test('get machine scope settings are not loaded after defaults are registered', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.machineSetting-2": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.machineSetting-2": "workspaceValue" }'));

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.folder.machineSetting-2'), 'workspaceValue');

		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.folder.machineSetting-2': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.MACHINE
				}
			}
		});

		assert.strictEqual(testObject.getValue('configurationService.folder.machineSetting-2'), 'userValue');

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.folder.machineSetting-2'), 'userValue');
	}));

	test('get machine scope settings are not loaded after defaults are registered when workspace folder uri is passed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.machineSetting-3": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.machineSetting-3": "workspaceValue" }'));

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.folder.machineSetting-3', { resource: workspaceService.getWorkspace().folders[0].uri }), 'workspaceValue');

		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.folder.machineSetting-3': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.MACHINE
				}
			}
		});

		assert.strictEqual(testObject.getValue('configurationService.folder.machineSetting-3', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.folder.machineSetting-3', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
	}));

	test('policy value override all', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const result = await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const promise = Event.toPromise(testObject.onDidChangeConfiguration);
			await fileService.writeFile(environmentService.policyFile!, VSBuffer.fromString('{ "configurationService.folder.policySetting": "policyValue" }'));
			return promise;
		});
		assert.deepStrictEqual([...result.affectedKeys], ['configurationService.folder.policySetting']);
		assert.strictEqual(testObject.getValue('configurationService.folder.policySetting'), 'policyValue');
		assert.strictEqual(testObject.inspect('configurationService.folder.policySetting').policyValue, 'policyValue');
	}));

	test('policy settings when policy value is not set', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.policySetting": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.policySetting": "workspaceValue" }'));
		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.folder.policySetting'), 'workspaceValue');
		assert.strictEqual(testObject.inspect('configurationService.folder.policySetting').policyValue, undefined);
	}));

	test('policy value override all for object type setting', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const promise = Event.toPromise(testObject.onDidChangeConfiguration);
			await fileService.writeFile(environmentService.policyFile!, VSBuffer.fromString('{ "configurationService.folder.policyObjectSetting": {"a": true} }'));
			return promise;
		});

		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.policyObjectSetting": {"b": true} }'));
		await testObject.reloadConfiguration();

		assert.deepStrictEqual(testObject.getValue('configurationService.folder.policyObjectSetting'), { a: true });
	}));

	test('reload configuration emits events after global configuraiton changes', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "testworkbench.editor.tabs": true }'));
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeConfiguration(target));
		await testObject.reloadConfiguration();
		assert.ok(target.called);
	}));

	test('reload configuration emits events after workspace configuraiton changes', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.testSetting": "workspaceValue" }'));
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeConfiguration(target));
		await testObject.reloadConfiguration();
		assert.ok(target.called);
	}));

	test('reload configuration should not emit event if no changes', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "testworkbench.editor.tabs": true }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.testSetting": "workspaceValue" }'));
		await testObject.reloadConfiguration();
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeConfiguration(() => { target(); }));
		await testObject.reloadConfiguration();
		assert.ok(!target.called);
	}));

	test('inspect', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		let actual = testObject.inspect('something.missing');
		assert.strictEqual(actual.defaultValue, undefined);
		assert.strictEqual(actual.application, undefined);
		assert.strictEqual(actual.userValue, undefined);
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, undefined);

		actual = testObject.inspect('configurationService.folder.testSetting');
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.application, undefined);
		assert.strictEqual(actual.userValue, undefined);
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, 'isSet');

		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.testSetting": "userValue" }'));
		await testObject.reloadConfiguration();
		actual = testObject.inspect('configurationService.folder.testSetting');
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.application, undefined);
		assert.strictEqual(actual.userValue, 'userValue');
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, 'userValue');

		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.testSetting": "workspaceValue" }'));
		await testObject.reloadConfiguration();
		actual = testObject.inspect('configurationService.folder.testSetting');
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.application, undefined);
		assert.strictEqual(actual.userValue, 'userValue');
		assert.strictEqual(actual.workspaceValue, 'workspaceValue');
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, 'workspaceValue');

		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'tasks.json'), VSBuffer.fromString('{ "configurationService.tasks.testSetting": "tasksValue" }'));
		await testObject.reloadConfiguration();
		actual = testObject.inspect('tasks');
		assert.strictEqual(actual.defaultValue, undefined);
		assert.strictEqual(actual.application, undefined);
		assert.deepStrictEqual(actual.userValue, {});
		assert.deepStrictEqual(actual.workspaceValue, {
			"configurationService": {
				"tasks": {
					"testSetting": "tasksValue"
				}
			}
		});
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.deepStrictEqual(actual.value, {
			"configurationService": {
				"tasks": {
					"testSetting": "tasksValue"
				}
			}
		});
	}));

	test('inspect restricted settings', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		testObject.updateWorkspaceTrust(false);
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.restrictedSetting": "userRestrictedValue" }'));
		await testObject.reloadConfiguration();
		let actual = testObject.inspect('configurationService.folder.restrictedSetting');
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.application, undefined);
		assert.strictEqual(actual.userValue, 'userRestrictedValue');
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, 'userRestrictedValue');

		testObject.updateWorkspaceTrust(true);
		await testObject.reloadConfiguration();
		actual = testObject.inspect('configurationService.folder.restrictedSetting');
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.application, undefined);
		assert.strictEqual(actual.userValue, 'userRestrictedValue');
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, 'userRestrictedValue');

		testObject.updateWorkspaceTrust(false);
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.restrictedSetting": "workspaceRestrictedValue" }'));
		await testObject.reloadConfiguration();
		actual = testObject.inspect('configurationService.folder.restrictedSetting');
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.application, undefined);
		assert.strictEqual(actual.userValue, 'userRestrictedValue');
		assert.strictEqual(actual.workspaceValue, 'workspaceRestrictedValue');
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, 'userRestrictedValue');

		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'tasks.json'), VSBuffer.fromString('{ "configurationService.tasks.testSetting": "tasksValue" }'));
		await testObject.reloadConfiguration();
		actual = testObject.inspect('tasks');
		assert.strictEqual(actual.defaultValue, undefined);
		assert.strictEqual(actual.application, undefined);
		assert.deepStrictEqual(actual.userValue, {});
		assert.deepStrictEqual(actual.workspaceValue, {
			"configurationService": {
				"tasks": {
					"testSetting": "tasksValue"
				}
			}
		});
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.deepStrictEqual(actual.value, {
			"configurationService": {
				"tasks": {
					"testSetting": "tasksValue"
				}
			}
		});

		testObject.updateWorkspaceTrust(true);
		await testObject.reloadConfiguration();
		actual = testObject.inspect('configurationService.folder.restrictedSetting');
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.application, undefined);
		assert.strictEqual(actual.userValue, 'userRestrictedValue');
		assert.strictEqual(actual.workspaceValue, 'workspaceRestrictedValue');
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, 'workspaceRestrictedValue');

		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'tasks.json'), VSBuffer.fromString('{ "configurationService.tasks.testSetting": "tasksValue" }'));
		await testObject.reloadConfiguration();
		actual = testObject.inspect('tasks');
		assert.strictEqual(actual.defaultValue, undefined);
		assert.strictEqual(actual.application, undefined);
		assert.deepStrictEqual(actual.userValue, {});
		assert.deepStrictEqual(actual.workspaceValue, {
			"configurationService": {
				"tasks": {
					"testSetting": "tasksValue"
				}
			}
		});
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.deepStrictEqual(actual.value, {
			"configurationService": {
				"tasks": {
					"testSetting": "tasksValue"
				}
			}
		});
	}));

	test('inspect restricted settings after change', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		testObject.updateWorkspaceTrust(false);
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.restrictedSetting": "userRestrictedValue" }'));
		await testObject.reloadConfiguration();

		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.restrictedSetting": "workspaceRestrictedValue" }'));
		const event = await promise;

		const actual = testObject.inspect('configurationService.folder.restrictedSetting');
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.application, undefined);
		assert.strictEqual(actual.userValue, 'userRestrictedValue');
		assert.strictEqual(actual.workspaceValue, 'workspaceRestrictedValue');
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, 'userRestrictedValue');
		assert.strictEqual(event.affectsConfiguration('configurationService.folder.restrictedSetting'), true);
	}));

	test('keys', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		let actual = testObject.keys();
		assert.ok(actual.default.indexOf('configurationService.folder.testSetting') !== -1);
		assert.deepStrictEqual(actual.user, []);
		assert.deepStrictEqual(actual.workspace, []);
		assert.deepStrictEqual(actual.workspaceFolder, []);

		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.testSetting": "userValue" }'));
		await testObject.reloadConfiguration();
		actual = testObject.keys();
		assert.ok(actual.default.indexOf('configurationService.folder.testSetting') !== -1);
		assert.deepStrictEqual(actual.user, ['configurationService.folder.testSetting']);
		assert.deepStrictEqual(actual.workspace, []);
		assert.deepStrictEqual(actual.workspaceFolder, []);

		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.testSetting": "workspaceValue" }'));
		await testObject.reloadConfiguration();
		actual = testObject.keys();
		assert.ok(actual.default.indexOf('configurationService.folder.testSetting') !== -1);
		assert.deepStrictEqual(actual.user, ['configurationService.folder.testSetting']);
		assert.deepStrictEqual(actual.workspace, ['configurationService.folder.testSetting']);
		assert.deepStrictEqual(actual.workspaceFolder, []);
	}));

	test('update user configuration', () => {
		return testObject.updateValue('configurationService.folder.testSetting', 'value', ConfigurationTarget.USER)
			.then(() => assert.strictEqual(testObject.getValue('configurationService.folder.testSetting'), 'value'));
	});

	test('update workspace configuration', () => {
		return testObject.updateValue('tasks.service.testSetting', 'value', ConfigurationTarget.WORKSPACE)
			.then(() => assert.strictEqual(testObject.getValue(TasksSchemaProperties.ServiceTestSetting), 'value'));
	});

	test('update resource configuration', () => {
		return testObject.updateValue('configurationService.folder.testSetting', 'value', { resource: workspaceService.getWorkspace().folders[0].uri }, ConfigurationTarget.WORKSPACE_FOLDER)
			.then(() => assert.strictEqual(testObject.getValue('configurationService.folder.testSetting'), 'value'));
	});

	test('update language configuration using configuration overrides', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('configurationService.folder.languageSetting', 'abcLangValue', { overrideIdentifier: 'abclang' });
		assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { overrideIdentifier: 'abclang' }), 'abcLangValue');
	}));

	test('update language configuration using configuration update overrides', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('configurationService.folder.languageSetting', 'abcLangValue', { overrideIdentifiers: ['abclang'] });
		assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { overrideIdentifier: 'abclang' }), 'abcLangValue');
	}));

	test('update language configuration for multiple languages', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('configurationService.folder.languageSetting', 'multiLangValue', { overrideIdentifiers: ['xyzlang', 'deflang'] }, ConfigurationTarget.USER);
		assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { overrideIdentifier: 'deflang' }), 'multiLangValue');
		assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { overrideIdentifier: 'xyzlang' }), 'multiLangValue');
		assert.deepStrictEqual(testObject.getValue(keyFromOverrideIdentifiers(['deflang', 'xyzlang'])), { 'configurationService.folder.languageSetting': 'multiLangValue' });
	}));

	test('update language configuration for multiple languages when already set', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "[deflang][xyzlang]": { "configurationService.folder.languageSetting": "userValue" }}'));
		await testObject.updateValue('configurationService.folder.languageSetting', 'multiLangValue', { overrideIdentifiers: ['xyzlang', 'deflang'] }, ConfigurationTarget.USER);
		assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { overrideIdentifier: 'deflang' }), 'multiLangValue');
		assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { overrideIdentifier: 'xyzlang' }), 'multiLangValue');
		assert.deepStrictEqual(testObject.getValue(keyFromOverrideIdentifiers(['deflang', 'xyzlang'])), { 'configurationService.folder.languageSetting': 'multiLangValue' });
		const actualContent = (await fileService.readFile(userDataProfileService.currentProfile.settingsResource)).value.toString();
		assert.deepStrictEqual(JSON.parse(actualContent), { '[deflang][xyzlang]': { 'configurationService.folder.languageSetting': 'multiLangValue' } });
	}));

	test('update resource language configuration', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('configurationService.folder.languageSetting', 'value', { resource: workspaceService.getWorkspace().folders[0].uri }, ConfigurationTarget.WORKSPACE_FOLDER);
		assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting'), 'value');
	}));

	test('update resource language configuration for a language using configuration overrides', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { resource: workspaceService.getWorkspace().folders[0].uri, overrideIdentifier: 'jsonc' }), 'languageValue');
		await testObject.updateValue('configurationService.folder.languageSetting', 'languageValueUpdated', { resource: workspaceService.getWorkspace().folders[0].uri, overrideIdentifier: 'jsonc' }, ConfigurationTarget.WORKSPACE_FOLDER);
		assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { resource: workspaceService.getWorkspace().folders[0].uri, overrideIdentifier: 'jsonc' }), 'languageValueUpdated');
	}));

	test('update resource language configuration for a language using configuration update overrides', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { resource: workspaceService.getWorkspace().folders[0].uri, overrideIdentifier: 'jsonc' }), 'languageValue');
		await testObject.updateValue('configurationService.folder.languageSetting', 'languageValueUpdated', { resource: workspaceService.getWorkspace().folders[0].uri, overrideIdentifiers: ['jsonc'] }, ConfigurationTarget.WORKSPACE_FOLDER);
		assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { resource: workspaceService.getWorkspace().folders[0].uri, overrideIdentifier: 'jsonc' }), 'languageValueUpdated');
	}));

	test('update application setting into workspace configuration in a workspace is not supported', () => {
		return testObject.updateValue('configurationService.folder.applicationSetting', 'workspaceValue', {}, ConfigurationTarget.WORKSPACE, { donotNotifyError: true })
			.then(() => assert.fail('Should not be supported'), (e) => assert.strictEqual(e.code, ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION));
	});

	test('update application machine overridable setting into workspace configuration in a workspace is not supported', () => {
		return testObject.updateValue('configurationService.folder.applicationMachineSetting', 'workspaceValue', {}, ConfigurationTarget.WORKSPACE, { donotNotifyError: true })
			.then(() => assert.fail('Should not be supported'), (e) => assert.strictEqual(e.code, ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION));
	});

	test('update machine setting into workspace configuration in a workspace is not supported', () => {
		return testObject.updateValue('configurationService.folder.machineSetting', 'workspaceValue', {}, ConfigurationTarget.WORKSPACE, { donotNotifyError: true })
			.then(() => assert.fail('Should not be supported'), (e) => assert.strictEqual(e.code, ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE));
	});

	test('update tasks configuration', () => {
		return testObject.updateValue('tasks', { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }, ConfigurationTarget.WORKSPACE)
			.then(() => assert.deepStrictEqual(testObject.getValue(TasksSchemaProperties.Tasks), { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }));
	});

	test('update user configuration should trigger change event before promise is resolve', () => {
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeConfiguration(target));
		return testObject.updateValue('configurationService.folder.testSetting', 'value', ConfigurationTarget.USER)
			.then(() => assert.ok(target.called));
	});

	test('update workspace configuration should trigger change event before promise is resolve', () => {
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeConfiguration(target));
		return testObject.updateValue('configurationService.folder.testSetting', 'value', ConfigurationTarget.WORKSPACE)
			.then(() => assert.ok(target.called));
	});

	test('update memory configuration', () => {
		return testObject.updateValue('configurationService.folder.testSetting', 'memoryValue', ConfigurationTarget.MEMORY)
			.then(() => assert.strictEqual(testObject.getValue('configurationService.folder.testSetting'), 'memoryValue'));
	});

	test('update memory configuration should trigger change event before promise is resolve', () => {
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeConfiguration(target));
		return testObject.updateValue('configurationService.folder.testSetting', 'memoryValue', ConfigurationTarget.MEMORY)
			.then(() => assert.ok(target.called));
	});

	test('remove setting from all targets', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const key = 'configurationService.folder.testSetting';
		await testObject.updateValue(key, 'workspaceValue', ConfigurationTarget.WORKSPACE);
		await testObject.updateValue(key, 'userValue', ConfigurationTarget.USER);

		await testObject.updateValue(key, undefined);
		await testObject.reloadConfiguration();

		const actual = testObject.inspect(key, { resource: workspaceService.getWorkspace().folders[0].uri });
		assert.strictEqual(actual.userValue, undefined);
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
	}));

	test('update user configuration to default value when target is not passed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('configurationService.folder.testSetting', 'value', ConfigurationTarget.USER);
		await testObject.updateValue('configurationService.folder.testSetting', 'isSet');
		assert.strictEqual(testObject.inspect('configurationService.folder.testSetting').userValue, undefined);
	}));

	test('update user configuration to default value when target is passed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('configurationService.folder.testSetting', 'value', ConfigurationTarget.USER);
		await testObject.updateValue('configurationService.folder.testSetting', 'isSet', ConfigurationTarget.USER);
		assert.strictEqual(testObject.inspect('configurationService.folder.testSetting').userValue, 'isSet');
	}));

	test('update task configuration should trigger change event before promise is resolve', () => {
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeConfiguration(target));
		return testObject.updateValue('tasks', { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }, ConfigurationTarget.WORKSPACE)
			.then(() => assert.ok(target.called));
	});

	test('no change event when there are no global tasks', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeConfiguration(target));
		await timeout(5);
		assert.ok(target.notCalled);
	}));

	test('change event when there are global tasks', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(joinPath(environmentService.userRoamingDataHome, 'tasks.json'), VSBuffer.fromString('{ "version": "1.0.0", "tasks": [{ "taskName": "myTask" }'));
		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await testObject.reloadLocalUserConfiguration();
		await promise;
	}));

	test('creating workspace settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.testSetting": "userValue" }'));
		await testObject.reloadConfiguration();
		await new Promise<void>((c, e) => {
			const disposable = testObject.onDidChangeConfiguration(e => {
				assert.ok(e.affectsConfiguration('configurationService.folder.testSetting'));
				assert.strictEqual(testObject.getValue('configurationService.folder.testSetting'), 'workspaceValue');
				disposable.dispose();
				c();
			});
			fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.testSetting": "workspaceValue" }')).catch(e);
		});
	}));

	test('deleting workspace settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.testSetting": "userValue" }'));
		const workspaceSettingsResource = joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json');
		await fileService.writeFile(workspaceSettingsResource, VSBuffer.fromString('{ "configurationService.folder.testSetting": "workspaceValue" }'));
		await testObject.reloadConfiguration();
		const e = await new Promise<IConfigurationChangeEvent>((c, e) => {
			Event.once(testObject.onDidChangeConfiguration)(c);
			fileService.del(workspaceSettingsResource).catch(e);
		});
		assert.ok(e.affectsConfiguration('configurationService.folder.testSetting'));
		assert.strictEqual(testObject.getValue('configurationService.folder.testSetting'), 'userValue');
	}));

	test('restricted setting is read from workspace when workspace is trusted', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		testObject.updateWorkspaceTrust(true);

		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.restrictedSetting": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.restrictedSetting": "workspaceValue" }'));
		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.folder.restrictedSetting', { resource: workspaceService.getWorkspace().folders[0].uri }), 'workspaceValue');
		assert.ok(testObject.restrictedSettings.default.includes('configurationService.folder.restrictedSetting'));
		assert.strictEqual(testObject.restrictedSettings.userLocal, undefined);
		assert.strictEqual(testObject.restrictedSettings.userRemote, undefined);
		assert.deepStrictEqual(testObject.restrictedSettings.workspace, ['configurationService.folder.restrictedSetting']);
		assert.strictEqual(testObject.restrictedSettings.workspaceFolder?.size, 1);
		assert.deepStrictEqual(testObject.restrictedSettings.workspaceFolder?.get(workspaceService.getWorkspace().folders[0].uri), ['configurationService.folder.restrictedSetting']);
	}));

	test('restricted setting is not read from workspace when workspace is changed to trusted', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		testObject.updateWorkspaceTrust(true);

		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.restrictedSetting": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.restrictedSetting": "workspaceValue" }'));
		await testObject.reloadConfiguration();

		testObject.updateWorkspaceTrust(false);

		assert.strictEqual(testObject.getValue('configurationService.folder.restrictedSetting', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
		assert.ok(testObject.restrictedSettings.default.includes('configurationService.folder.restrictedSetting'));
		assert.strictEqual(testObject.restrictedSettings.userLocal, undefined);
		assert.strictEqual(testObject.restrictedSettings.userRemote, undefined);
		assert.deepStrictEqual(testObject.restrictedSettings.workspace, ['configurationService.folder.restrictedSetting']);
		assert.strictEqual(testObject.restrictedSettings.workspaceFolder?.size, 1);
		assert.deepStrictEqual(testObject.restrictedSettings.workspaceFolder?.get(workspaceService.getWorkspace().folders[0].uri), ['configurationService.folder.restrictedSetting']);
	}));

	test('change event is triggered when workspace is changed to untrusted', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		testObject.updateWorkspaceTrust(true);

		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.restrictedSetting": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.restrictedSetting": "workspaceValue" }'));
		await testObject.reloadConfiguration();

		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		testObject.updateWorkspaceTrust(false);

		const event = await promise;
		assert.ok(event.affectedKeys.has('configurationService.folder.restrictedSetting'));
		assert.ok(event.affectsConfiguration('configurationService.folder.restrictedSetting'));
	}));

	test('restricted setting is not read from workspace when workspace is not trusted', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		testObject.updateWorkspaceTrust(false);

		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.restrictedSetting": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.restrictedSetting": "workspaceValue" }'));
		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.folder.restrictedSetting', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
		assert.ok(testObject.restrictedSettings.default.includes('configurationService.folder.restrictedSetting'));
		assert.strictEqual(testObject.restrictedSettings.userLocal, undefined);
		assert.strictEqual(testObject.restrictedSettings.userRemote, undefined);
		assert.deepStrictEqual(testObject.restrictedSettings.workspace, ['configurationService.folder.restrictedSetting']);
		assert.strictEqual(testObject.restrictedSettings.workspaceFolder?.size, 1);
		assert.deepStrictEqual(testObject.restrictedSettings.workspaceFolder?.get(workspaceService.getWorkspace().folders[0].uri), ['configurationService.folder.restrictedSetting']);
	}));

	test('restricted setting is read when workspace is changed to trusted', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		testObject.updateWorkspaceTrust(false);

		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.restrictedSetting": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.restrictedSetting": "workspaceValue" }'));
		await testObject.reloadConfiguration();

		testObject.updateWorkspaceTrust(true);

		assert.strictEqual(testObject.getValue('configurationService.folder.restrictedSetting', { resource: workspaceService.getWorkspace().folders[0].uri }), 'workspaceValue');
		assert.ok(testObject.restrictedSettings.default.includes('configurationService.folder.restrictedSetting'));
		assert.strictEqual(testObject.restrictedSettings.userLocal, undefined);
		assert.strictEqual(testObject.restrictedSettings.userRemote, undefined);
		assert.deepStrictEqual(testObject.restrictedSettings.workspace, ['configurationService.folder.restrictedSetting']);
		assert.strictEqual(testObject.restrictedSettings.workspaceFolder?.size, 1);
		assert.deepStrictEqual(testObject.restrictedSettings.workspaceFolder?.get(workspaceService.getWorkspace().folders[0].uri), ['configurationService.folder.restrictedSetting']);
	}));

	test('change event is triggered when workspace is changed to trusted', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		testObject.updateWorkspaceTrust(false);

		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.restrictedSetting": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.restrictedSetting": "workspaceValue" }'));
		await testObject.reloadConfiguration();

		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		testObject.updateWorkspaceTrust(true);

		const event = await promise;
		assert.ok(event.affectedKeys.has('configurationService.folder.restrictedSetting'));
		assert.ok(event.affectsConfiguration('configurationService.folder.restrictedSetting'));
	}));

	test('adding an restricted setting triggers change event', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.restrictedSetting": "userValue" }'));
		testObject.updateWorkspaceTrust(false);

		const promise = Event.toPromise(testObject.onDidChangeRestrictedSettings);
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.restrictedSetting": "workspaceValue" }'));

		return promise;
	}));

	test('remove an unregistered setting', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const key = 'configurationService.folder.unknownSetting';
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.unknownSetting": "userValue" }'));
		await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.unknownSetting": "workspaceValue" }'));

		await testObject.reloadConfiguration();
		await testObject.updateValue(key, undefined);

		const actual = testObject.inspect(key, { resource: workspaceService.getWorkspace().folders[0].uri });
		assert.strictEqual(actual.userValue, undefined);
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
	}));
});

suite('WorkspaceConfigurationService - Profiles', () => {

	let testObject: WorkspaceService, workspaceService: WorkspaceService, fileService: IFileService, environmentService: IBrowserWorkbenchEnvironmentService, userDataProfileService: IUserDataProfileService, instantiationService: TestInstantiationService;
	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suiteSetup(() => {
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				[APPLY_ALL_PROFILES_SETTING]: {
					'type': 'array',
					'default': [],
					'scope': ConfigurationScope.APPLICATION,
				},
				'configurationService.profiles.applicationSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.APPLICATION
				},
				'configurationService.profiles.applicationMachineSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.APPLICATION_MACHINE
				},
				'configurationService.profiles.testSetting': {
					'type': 'string',
					'default': 'isSet',
				},
				'configurationService.profiles.applicationSetting2': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.APPLICATION
				},
				'configurationService.profiles.testSetting2': {
					'type': 'string',
					'default': 'isSet',
				},
			}
		});
	});

	setup(async () => {
		const logService = new NullLogService();
		fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		const folder = joinPath(ROOT, 'a');
		await fileService.createFolder(folder);

		instantiationService = workbenchInstantiationService(undefined, disposables);
		environmentService = TestEnvironmentService;
		environmentService.policyFile = joinPath(folder, 'policies.json');
		const remoteAgentService = disposables.add(instantiationService.createInstance(RemoteAgentService));
		instantiationService.stub(IRemoteAgentService, remoteAgentService);
		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		const userDataProfilesService = instantiationService.stub(IUserDataProfilesService, disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService)));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new FileUserDataProvider(ROOT.scheme, fileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, new NullLogService()))));
		userDataProfileService = instantiationService.stub(IUserDataProfileService, disposables.add(new UserDataProfileService(toUserDataProfile('custom', 'custom', joinPath(environmentService.userRoamingDataHome, 'profiles', 'temp'), joinPath(environmentService.cacheHome, 'profilesCache')))));
		workspaceService = testObject = disposables.add(new WorkspaceService(
			{ configurationCache: new ConfigurationCache() },
			environmentService, userDataProfileService, userDataProfilesService,
			fileService, remoteAgentService, uriIdentityService, new NullLogService(),
			disposables.add(new FilePolicyService(environmentService.policyFile, fileService, logService))));
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IWorkspaceContextService, testObject);
		instantiationService.stub(IConfigurationService, testObject);
		instantiationService.stub(IEnvironmentService, environmentService);

		await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.applicationSetting2": "applicationValue", "configurationService.profiles.testSetting2": "userValue" }'));
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.applicationSetting2": "profileValue", "configurationService.profiles.testSetting2": "profileValue" }'));
		await workspaceService.initialize(convertToWorkspacePayload(folder));
		instantiationService.stub(IKeybindingEditingService, disposables.add(instantiationService.createInstance(KeybindingsEditingService)));
		instantiationService.stub(ITextFileService, disposables.add(instantiationService.createInstance(TestTextFileService)));
		instantiationService.stub(ITextModelService, disposables.add(instantiationService.createInstance(TextModelResolverService)));
		workspaceService.acquireInstantiationService(instantiationService);
	});

	test('initialize', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		assert.strictEqual(testObject.getValue('configurationService.profiles.applicationSetting2'), 'applicationValue');
		assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting2'), 'profileValue');
	}));

	test('inspect', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		let actual = testObject.inspect('something.missing');
		assert.strictEqual(actual.defaultValue, undefined);
		assert.strictEqual(actual.application, undefined);
		assert.strictEqual(actual.userValue, undefined);
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, undefined);

		actual = testObject.inspect('configurationService.profiles.applicationSetting');
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.application, undefined);
		assert.strictEqual(actual.userValue, undefined);
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, 'isSet');

		await fileService.writeFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.applicationSetting": "applicationValue" }'));
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.applicationSetting": "profileValue" }'));
		await testObject.reloadConfiguration();
		actual = testObject.inspect('configurationService.profiles.applicationSetting');
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.applicationValue, 'applicationValue');
		assert.strictEqual(actual.userValue, 'profileValue');
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, 'applicationValue');

		await fileService.writeFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.testSetting": "applicationValue" }'));
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.testSetting": "profileValue" }'));
		await testObject.reloadConfiguration();
		actual = testObject.inspect('configurationService.profiles.testSetting');
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.applicationValue, undefined);
		assert.strictEqual(actual.userValue, 'profileValue');
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, 'profileValue');
	}));

	test('update application scope setting', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('configurationService.profiles.applicationSetting', 'applicationValue');

		assert.deepStrictEqual(JSON.parse((await fileService.readFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource)).value.toString()), { 'configurationService.profiles.applicationSetting': 'applicationValue', 'configurationService.profiles.applicationSetting2': 'applicationValue', 'configurationService.profiles.testSetting2': 'userValue' });
		assert.strictEqual(testObject.getValue('configurationService.profiles.applicationSetting'), 'applicationValue');
	}));

	test('update application machine setting', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('configurationService.profiles.applicationMachineSetting', 'applicationValue');

		assert.deepStrictEqual(JSON.parse((await fileService.readFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource)).value.toString()), { 'configurationService.profiles.applicationMachineSetting': 'applicationValue', 'configurationService.profiles.applicationSetting2': 'applicationValue', 'configurationService.profiles.testSetting2': 'userValue' });
		assert.strictEqual(testObject.getValue('configurationService.profiles.applicationMachineSetting'), 'applicationValue');
	}));

	test('update normal setting', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('configurationService.profiles.testSetting', 'profileValue');

		assert.deepStrictEqual(JSON.parse((await fileService.readFile(userDataProfileService.currentProfile.settingsResource)).value.toString()), { 'configurationService.profiles.testSetting': 'profileValue', 'configurationService.profiles.testSetting2': 'profileValue', 'configurationService.profiles.applicationSetting2': 'profileValue' });
		assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting'), 'profileValue');
	}));

	test('registering normal setting after init', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.testSetting3": "defaultProfile" }'));
		await testObject.reloadConfiguration();

		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.profiles.testSetting3': {
					'type': 'string',
					'default': 'isSet',
				}
			}
		});

		assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting3'), 'isSet');
	}));

	test('registering application scope setting after init', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.applicationSetting3": "defaultProfile" }'));
		await testObject.reloadConfiguration();

		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.profiles.applicationSetting3': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.APPLICATION
				}
			}
		});

		assert.strictEqual(testObject.getValue('configurationService.profiles.applicationSetting3'), 'defaultProfile');
	}));

	test('non registering setting should not be read from default profile', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.nonregistered": "defaultProfile" }'));
		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.profiles.nonregistered'), undefined);
	}));

	test('initialize with custom all profiles settings', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue(APPLY_ALL_PROFILES_SETTING, ['configurationService.profiles.testSetting2'], ConfigurationTarget.USER_LOCAL);

		await testObject.initialize(convertToWorkspacePayload(joinPath(ROOT, 'a')));

		assert.strictEqual(testObject.getValue('configurationService.profiles.applicationSetting2'), 'applicationValue');
		assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting2'), 'userValue');
	}));

	test('update all profiles settings', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await testObject.updateValue(APPLY_ALL_PROFILES_SETTING, ['configurationService.profiles.testSetting2'], ConfigurationTarget.USER_LOCAL);

		const changeEvent = await promise;
		assert.deepStrictEqual([...changeEvent.affectedKeys], [APPLY_ALL_PROFILES_SETTING, 'configurationService.profiles.testSetting2']);
		assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting2'), 'userValue');
	}));

	test('setting applied to all profiles is registered later', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.testSetting4": "userValue" }'));
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.testSetting4": "profileValue" }'));
		await testObject.updateValue(APPLY_ALL_PROFILES_SETTING, ['configurationService.profiles.testSetting4'], ConfigurationTarget.USER_LOCAL);
		assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting4'), 'userValue');

		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.profiles.testSetting4': {
					'type': 'string',
					'default': 'isSet',
				}
			}
		});

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting4'), 'userValue');
	}));

	test('update setting that is applied to all profiles', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue(APPLY_ALL_PROFILES_SETTING, ['configurationService.profiles.testSetting2'], ConfigurationTarget.USER_LOCAL);
		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await testObject.updateValue('configurationService.profiles.testSetting2', 'updatedValue', ConfigurationTarget.USER_LOCAL);

		const changeEvent = await promise;
		assert.deepStrictEqual([...changeEvent.affectedKeys], ['configurationService.profiles.testSetting2']);
		assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting2'), 'updatedValue');
	}));

	test('test isSettingAppliedToAllProfiles', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		assert.strictEqual(testObject.isSettingAppliedForAllProfiles('configurationService.profiles.applicationSetting2'), true);
		assert.strictEqual(testObject.isSettingAppliedForAllProfiles('configurationService.profiles.testSetting2'), false);

		await testObject.updateValue(APPLY_ALL_PROFILES_SETTING, ['configurationService.profiles.testSetting2'], ConfigurationTarget.USER_LOCAL);
		assert.strictEqual(testObject.isSettingAppliedForAllProfiles('configurationService.profiles.testSetting2'), true);
	}));

	test('switch to default profile', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.applicationSetting": "applicationValue", "configurationService.profiles.testSetting": "userValue" }'));
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.applicationSetting": "profileValue", "configurationService.profiles.testSetting": "profileValue" }'));
		await testObject.reloadConfiguration();

		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await userDataProfileService.updateCurrentProfile(instantiationService.get(IUserDataProfilesService).defaultProfile);

		const changeEvent = await promise;
		assert.deepStrictEqual([...changeEvent.affectedKeys], ['configurationService.profiles.testSetting']);
		assert.strictEqual(testObject.getValue('configurationService.profiles.applicationSetting'), 'applicationValue');
		assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting'), 'userValue');
	}));

	test('switch to non default profile', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.applicationSetting": "applicationValue", "configurationService.profiles.testSetting": "userValue" }'));
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.applicationSetting": "profileValue", "configurationService.profiles.testSetting": "profileValue" }'));
		await testObject.reloadConfiguration();

		const profile = toUserDataProfile('custom2', 'custom2', joinPath(environmentService.userRoamingDataHome, 'profiles', 'custom2'), joinPath(environmentService.cacheHome, 'profilesCache'));
		await fileService.writeFile(profile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.applicationSetting": "profileValue2", "configurationService.profiles.testSetting": "profileValue2" }'));
		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await userDataProfileService.updateCurrentProfile(profile);

		const changeEvent = await promise;
		assert.deepStrictEqual([...changeEvent.affectedKeys], ['configurationService.profiles.testSetting']);
		assert.strictEqual(testObject.getValue('configurationService.profiles.applicationSetting'), 'applicationValue');
		assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting'), 'profileValue2');
	}));

	test('switch to non default profile using settings from default profile', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.applicationSetting": "applicationValue", "configurationService.profiles.testSetting": "userValue" }'));
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.applicationSetting": "profileValue", "configurationService.profiles.testSetting": "profileValue" }'));
		await testObject.reloadConfiguration();

		const profile = toUserDataProfile('custom3', 'custom3', joinPath(environmentService.userRoamingDataHome, 'profiles', 'custom2'), joinPath(environmentService.cacheHome, 'profilesCache'), { useDefaultFlags: { settings: true } }, instantiationService.get(IUserDataProfilesService).defaultProfile);
		await fileService.writeFile(profile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.applicationSetting": "applicationValue2", "configurationService.profiles.testSetting": "profileValue2" }'));
		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await userDataProfileService.updateCurrentProfile(profile);

		const changeEvent = await promise;
		assert.deepStrictEqual([...changeEvent.affectedKeys], ['configurationService.profiles.applicationSetting', 'configurationService.profiles.testSetting']);
		assert.strictEqual(testObject.getValue('configurationService.profiles.applicationSetting'), 'applicationValue2');
		assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting'), 'profileValue2');
	}));

	test('In non-default profile, changing application settings shall include only application scope settings in the change event', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString('{}'));
		await testObject.reloadConfiguration();

		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await fileService.writeFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.applicationSetting": "applicationValue", "configurationService.profiles.testSetting": "applicationValue" }'));

		const changeEvent = await promise;
		assert.deepStrictEqual([...changeEvent.affectedKeys], ['configurationService.profiles.applicationSetting']);
		assert.strictEqual(testObject.getValue('configurationService.profiles.applicationSetting'), 'applicationValue');
		assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting'), 'isSet');
	}));

	test('switch to default profile with settings applied to all profiles', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue(APPLY_ALL_PROFILES_SETTING, ['configurationService.profiles.testSetting2'], ConfigurationTarget.USER_LOCAL);

		await userDataProfileService.updateCurrentProfile(instantiationService.get(IUserDataProfilesService).defaultProfile);

		assert.strictEqual(testObject.getValue('configurationService.profiles.applicationSetting2'), 'applicationValue');
		assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting2'), 'userValue');
	}));

	test('switch to non default profile with settings applied to all profiles', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue(APPLY_ALL_PROFILES_SETTING, ['configurationService.profiles.testSetting2'], ConfigurationTarget.USER_LOCAL);

		const profile = toUserDataProfile('custom2', 'custom2', joinPath(environmentService.userRoamingDataHome, 'profiles', 'custom2'), joinPath(environmentService.cacheHome, 'profilesCache'));
		await fileService.writeFile(profile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.testSetting": "profileValue", "configurationService.profiles.testSetting2": "profileValue2" }'));
		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await userDataProfileService.updateCurrentProfile(profile);

		const changeEvent = await promise;
		assert.deepStrictEqual([...changeEvent.affectedKeys], ['configurationService.profiles.testSetting']);
		assert.strictEqual(testObject.getValue('configurationService.profiles.applicationSetting2'), 'applicationValue');
		assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting2'), 'userValue');
		assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting'), 'profileValue');
	}));

	test('switch to non default from default profile with settings applied to all profiles', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue(APPLY_ALL_PROFILES_SETTING, ['configurationService.profiles.testSetting2'], ConfigurationTarget.USER_LOCAL);
		await userDataProfileService.updateCurrentProfile(instantiationService.get(IUserDataProfilesService).defaultProfile);

		const profile = toUserDataProfile('custom2', 'custom2', joinPath(environmentService.userRoamingDataHome, 'profiles', 'custom2'), joinPath(environmentService.cacheHome, 'profilesCache'));
		await fileService.writeFile(profile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.testSetting": "profileValue", "configurationService.profiles.testSetting2": "profileValue2" }'));
		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await userDataProfileService.updateCurrentProfile(profile);

		const changeEvent = await promise;
		assert.deepStrictEqual([...changeEvent.affectedKeys], ['configurationService.profiles.testSetting']);
		assert.strictEqual(testObject.getValue('configurationService.profiles.applicationSetting2'), 'applicationValue');
		assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting2'), 'userValue');
		assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting'), 'profileValue');
	}));

});

suite('WorkspaceConfigurationService-Multiroot', () => {

	let workspaceContextService: IWorkspaceContextService, jsonEditingServce: IJSONEditingService, testObject: WorkspaceService, fileService: IFileService, environmentService: BrowserWorkbenchEnvironmentService, userDataProfileService: IUserDataProfileService;
	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suiteSetup(() => {
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.workspace.testSetting': {
					'type': 'string',
					'default': 'isSet'
				},
				'configurationService.workspace.applicationSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.APPLICATION
				},
				'configurationService.workspace.machineSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.MACHINE
				},
				'configurationService.workspace.machineOverridableSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.MACHINE_OVERRIDABLE
				},
				'configurationService.workspace.testResourceSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.RESOURCE
				},
				'configurationService.workspace.testLanguageSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
				},
				'configurationService.workspace.testRestrictedSetting1': {
					'type': 'string',
					'default': 'isSet',
					restricted: true,
					scope: ConfigurationScope.RESOURCE
				},
				'configurationService.workspace.testRestrictedSetting2': {
					'type': 'string',
					'default': 'isSet',
					restricted: true,
					scope: ConfigurationScope.RESOURCE
				}
			}
		});
	});

	setup(async () => {
		const logService = new NullLogService();
		fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		const appSettingsHome = joinPath(ROOT, 'user');
		const folderA = joinPath(ROOT, 'a');
		const folderB = joinPath(ROOT, 'b');
		const configResource = joinPath(ROOT, 'vsctests.code-workspace');
		const workspace = { folders: [{ path: folderA.path }, { path: folderB.path }] };

		await fileService.createFolder(appSettingsHome);
		await fileService.createFolder(folderA);
		await fileService.createFolder(folderB);
		await fileService.writeFile(configResource, VSBuffer.fromString(JSON.stringify(workspace, null, '\t')));

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		environmentService = TestEnvironmentService;
		const remoteAgentService = disposables.add(instantiationService.createInstance(RemoteAgentService));
		instantiationService.stub(IRemoteAgentService, remoteAgentService);
		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		const userDataProfilesService = instantiationService.stub(IUserDataProfilesService, disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService)));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new FileUserDataProvider(ROOT.scheme, fileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, new NullLogService()))));
		userDataProfileService = instantiationService.stub(IUserDataProfileService, disposables.add(new UserDataProfileService(userDataProfilesService.defaultProfile)));
		const workspaceService = disposables.add(new WorkspaceService(
			{ configurationCache: new ConfigurationCache() },
			environmentService, userDataProfileService, userDataProfilesService,
			fileService, remoteAgentService, uriIdentityService, new NullLogService(), new NullPolicyService()));

		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IWorkspaceContextService, workspaceService);
		instantiationService.stub(IConfigurationService, workspaceService);
		instantiationService.stub(IWorkbenchEnvironmentService, environmentService);
		instantiationService.stub(IEnvironmentService, environmentService);

		await workspaceService.initialize(getWorkspaceIdentifier(configResource));
		instantiationService.stub(IKeybindingEditingService, disposables.add(instantiationService.createInstance(KeybindingsEditingService)));
		instantiationService.stub(ITextFileService, disposables.add(instantiationService.createInstance(TestTextFileService)));
		instantiationService.stub(ITextModelService, disposables.add(instantiationService.createInstance(TextModelResolverService)));
		jsonEditingServce = instantiationService.createInstance(JSONEditingService);
		instantiationService.stub(IJSONEditingService, jsonEditingServce);
		workspaceService.acquireInstantiationService(instantiationService);

		workspaceContextService = workspaceService;
		testObject = workspaceService;
	});

	test('application settings are not read from workspace', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.applicationSetting": "userValue" }'));
		await jsonEditingServce.write(workspaceContextService.getWorkspace().configuration!, [{ path: ['settings'], value: { 'configurationService.workspace.applicationSetting': 'workspaceValue' } }], true);

		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.workspace.applicationSetting'), 'userValue');
	}));

	test('application settings are not read from workspace when folder is passed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.applicationSetting": "userValue" }'));
		await jsonEditingServce.write(workspaceContextService.getWorkspace().configuration!, [{ path: ['settings'], value: { 'configurationService.workspace.applicationSetting': 'workspaceValue' } }], true);

		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.workspace.applicationSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');
	}));

	test('machine settings are not read from workspace', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.machineSetting": "userValue" }'));
		await jsonEditingServce.write(workspaceContextService.getWorkspace().configuration!, [{ path: ['settings'], value: { 'configurationService.workspace.machineSetting': 'workspaceValue' } }], true);

		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.folder.machineSetting'), 'userValue');
	}));

	test('machine settings are not read from workspace when folder is passed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.machineSetting": "userValue" }'));
		await jsonEditingServce.write(workspaceContextService.getWorkspace().configuration!, [{ path: ['settings'], value: { 'configurationService.workspace.machineSetting': 'workspaceValue' } }], true);

		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.folder.machineSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');
	}));

	test('get application scope settings are not loaded after defaults are registered', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.newSetting": "userValue" }'));
		await jsonEditingServce.write(workspaceContextService.getWorkspace().configuration!, [{ path: ['settings'], value: { 'configurationService.workspace.newSetting': 'workspaceValue' } }], true);

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.workspace.newSetting'), 'workspaceValue');

		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.workspace.newSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.APPLICATION
				}
			}
		});

		assert.strictEqual(testObject.getValue('configurationService.workspace.newSetting'), 'userValue');

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.workspace.newSetting'), 'userValue');
	}));

	test('get application scope settings are not loaded after defaults are registered when workspace folder is passed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.newSetting-2": "userValue" }'));
		await jsonEditingServce.write(workspaceContextService.getWorkspace().configuration!, [{ path: ['settings'], value: { 'configurationService.workspace.newSetting-2': 'workspaceValue' } }], true);

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.workspace.newSetting-2', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'workspaceValue');

		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.workspace.newSetting-2': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.APPLICATION
				}
			}
		});

		assert.strictEqual(testObject.getValue('configurationService.workspace.newSetting-2', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.workspace.newSetting-2', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');
	}));

	test('workspace settings override user settings after defaults are registered for machine overridable settings ', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.newMachineOverridableSetting": "userValue" }'));
		await jsonEditingServce.write(workspaceContextService.getWorkspace().configuration!, [{ path: ['settings'], value: { 'configurationService.workspace.newMachineOverridableSetting': 'workspaceValue' } }], true);

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.workspace.newMachineOverridableSetting'), 'workspaceValue');

		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.workspace.newMachineOverridableSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.MACHINE_OVERRIDABLE
				}
			}
		});

		assert.strictEqual(testObject.getValue('configurationService.workspace.newMachineOverridableSetting'), 'workspaceValue');

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.workspace.newMachineOverridableSetting'), 'workspaceValue');

	}));

	test('application settings are not read from workspace folder', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.applicationSetting": "userValue" }'));
		await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.applicationSetting": "workspaceFolderValue" }'));

		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.workspace.applicationSetting'), 'userValue');
	}));

	test('application settings are not read from workspace folder when workspace folder is passed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.applicationSetting": "userValue" }'));
		await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.applicationSetting": "workspaceFolderValue" }'));

		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.workspace.applicationSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');
	}));

	test('machine settings are not read from workspace folder', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.machineSetting": "userValue" }'));
		await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.machineSetting": "workspaceFolderValue" }'));

		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.workspace.machineSetting'), 'userValue');
	}));

	test('machine settings are not read from workspace folder when workspace folder is passed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.machineSetting": "userValue" }'));
		await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.machineSetting": "workspaceFolderValue" }'));

		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.workspace.machineSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');
	}));

	test('application settings are not read from workspace folder after defaults are registered', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.testNewApplicationSetting": "userValue" }'));
		await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.testNewApplicationSetting": "workspaceFolderValue" }'));

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.workspace.testNewApplicationSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'workspaceFolderValue');

		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.workspace.testNewApplicationSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.APPLICATION
				}
			}
		});

		assert.strictEqual(testObject.getValue('configurationService.workspace.testNewApplicationSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.workspace.testNewApplicationSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');
	}));

	test('machine settings are not read from workspace folder after defaults are registered', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.testNewMachineSetting": "userValue" }'));
		await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.testNewMachineSetting": "workspaceFolderValue" }'));
		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.workspace.testNewMachineSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'workspaceFolderValue');

		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.workspace.testNewMachineSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.MACHINE
				}
			}
		});

		assert.strictEqual(testObject.getValue('configurationService.workspace.testNewMachineSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');

		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('configurationService.workspace.testNewMachineSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');
	}));

	test('resource setting in folder is read after it is registered later', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.testNewResourceSetting2": "workspaceFolderValue" }'));
		await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration!), [{ path: ['settings'], value: { 'configurationService.workspace.testNewResourceSetting2': 'workspaceValue' } }], true);
		await testObject.reloadConfiguration();
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.workspace.testNewResourceSetting2': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.RESOURCE
				}
			}
		});
		assert.strictEqual(testObject.getValue('configurationService.workspace.testNewResourceSetting2', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'workspaceFolderValue');
	}));

	test('resource language setting in folder is read after it is registered later', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.testNewResourceLanguageSetting2": "workspaceFolderValue" }'));
		await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration!), [{ path: ['settings'], value: { 'configurationService.workspace.testNewResourceLanguageSetting2': 'workspaceValue' } }], true);
		await testObject.reloadConfiguration();
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.workspace.testNewResourceLanguageSetting2': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
				}
			}
		});
		assert.strictEqual(testObject.getValue('configurationService.workspace.testNewResourceLanguageSetting2', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'workspaceFolderValue');
	}));

	test('machine overridable setting in folder is read after it is registered later', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.testNewMachineOverridableSetting2": "workspaceFolderValue" }'));
		await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration!), [{ path: ['settings'], value: { 'configurationService.workspace.testNewMachineOverridableSetting2': 'workspaceValue' } }], true);
		await testObject.reloadConfiguration();
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.workspace.testNewMachineOverridableSetting2': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.MACHINE_OVERRIDABLE
				}
			}
		});
		assert.strictEqual(testObject.getValue('configurationService.workspace.testNewMachineOverridableSetting2', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'workspaceFolderValue');
	}));

	test('inspect', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		let actual = testObject.inspect('something.missing');
		assert.strictEqual(actual.defaultValue, undefined);
		assert.strictEqual(actual.userValue, undefined);
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, undefined);

		actual = testObject.inspect('configurationService.workspace.testResourceSetting');
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.userValue, undefined);
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, 'isSet');

		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.testResourceSetting": "userValue" }'));
		await testObject.reloadConfiguration();
		actual = testObject.inspect('configurationService.workspace.testResourceSetting');
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.userValue, 'userValue');
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, 'userValue');

		await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration!), [{ path: ['settings'], value: { 'configurationService.workspace.testResourceSetting': 'workspaceValue' } }], true);
		await testObject.reloadConfiguration();
		actual = testObject.inspect('configurationService.workspace.testResourceSetting');
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.userValue, 'userValue');
		assert.strictEqual(actual.workspaceValue, 'workspaceValue');
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, 'workspaceValue');

		await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.testResourceSetting": "workspaceFolderValue" }'));
		await testObject.reloadConfiguration();
		actual = testObject.inspect('configurationService.workspace.testResourceSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri });
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.userValue, 'userValue');
		assert.strictEqual(actual.workspaceValue, 'workspaceValue');
		assert.strictEqual(actual.workspaceFolderValue, 'workspaceFolderValue');
		assert.strictEqual(actual.value, 'workspaceFolderValue');
	}));

	test('inspect restricted settings', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		testObject.updateWorkspaceTrust(false);
		await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration!), [{ path: ['settings'], value: { 'configurationService.workspace.testRestrictedSetting1': 'workspaceRestrictedValue' } }], true);
		await testObject.reloadConfiguration();
		let actual = testObject.inspect('configurationService.workspace.testRestrictedSetting1', { resource: workspaceContextService.getWorkspace().folders[0].uri });
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.application, undefined);
		assert.strictEqual(actual.userValue, undefined);
		assert.strictEqual(actual.workspaceValue, 'workspaceRestrictedValue');
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, 'isSet');

		testObject.updateWorkspaceTrust(true);
		await testObject.reloadConfiguration();
		actual = testObject.inspect('configurationService.workspace.testRestrictedSetting1', { resource: workspaceContextService.getWorkspace().folders[0].uri });
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.application, undefined);
		assert.strictEqual(actual.userValue, undefined);
		assert.strictEqual(actual.workspaceValue, 'workspaceRestrictedValue');
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, 'workspaceRestrictedValue');

		testObject.updateWorkspaceTrust(false);
		await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.testRestrictedSetting1": "workspaceFolderRestrictedValue" }'));
		await testObject.reloadConfiguration();
		actual = testObject.inspect('configurationService.workspace.testRestrictedSetting1', { resource: workspaceContextService.getWorkspace().folders[0].uri });
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.application, undefined);
		assert.strictEqual(actual.userValue, undefined);
		assert.strictEqual(actual.workspaceValue, 'workspaceRestrictedValue');
		assert.strictEqual(actual.workspaceFolderValue, 'workspaceFolderRestrictedValue');
		assert.strictEqual(actual.value, 'isSet');

		testObject.updateWorkspaceTrust(true);
		await testObject.reloadConfiguration();
		actual = testObject.inspect('configurationService.workspace.testRestrictedSetting1', { resource: workspaceContextService.getWorkspace().folders[0].uri });
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.application, undefined);
		assert.strictEqual(actual.userValue, undefined);
		assert.strictEqual(actual.workspaceValue, 'workspaceRestrictedValue');
		assert.strictEqual(actual.workspaceFolderValue, 'workspaceFolderRestrictedValue');
		assert.strictEqual(actual.value, 'workspaceFolderRestrictedValue');
	}));

	test('inspect restricted settings after change', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		testObject.updateWorkspaceTrust(false);
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.testRestrictedSetting1": "userRestrictedValue" }'));
		await testObject.reloadConfiguration();

		let promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration!), [{ path: ['settings'], value: { 'configurationService.workspace.testRestrictedSetting1': 'workspaceRestrictedValue' } }], true);
		let event = await promise;

		let actual = testObject.inspect('configurationService.workspace.testRestrictedSetting1', { resource: workspaceContextService.getWorkspace().folders[0].uri });
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.application, undefined);
		assert.strictEqual(actual.userValue, 'userRestrictedValue');
		assert.strictEqual(actual.workspaceValue, 'workspaceRestrictedValue');
		assert.strictEqual(actual.workspaceFolderValue, undefined);
		assert.strictEqual(actual.value, 'userRestrictedValue');
		assert.strictEqual(event.affectsConfiguration('configurationService.workspace.testRestrictedSetting1'), true);

		promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.testRestrictedSetting1": "workspaceFolderRestrictedValue" }'));
		event = await promise;

		actual = testObject.inspect('configurationService.workspace.testRestrictedSetting1', { resource: workspaceContextService.getWorkspace().folders[0].uri });
		assert.strictEqual(actual.defaultValue, 'isSet');
		assert.strictEqual(actual.application, undefined);
		assert.strictEqual(actual.userValue, 'userRestrictedValue');
		assert.strictEqual(actual.workspaceValue, 'workspaceRestrictedValue');
		assert.strictEqual(actual.workspaceFolderValue, 'workspaceFolderRestrictedValue');
		assert.strictEqual(actual.value, 'userRestrictedValue');
		assert.strictEqual(event.affectsConfiguration('configurationService.workspace.testRestrictedSetting1'), true);
	}));

	test('get launch configuration', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const expectedLaunchConfiguration = {
			'version': '0.1.0',
			'configurations': [
				{
					'type': 'node',
					'request': 'launch',
					'name': 'Gulp Build',
					'program': '${workspaceFolder}/node_modules/gulp/bin/gulp.js',
					'stopOnEntry': true,
					'args': [
						'watch-extension:json-client'
					],
					'cwd': '${workspaceFolder}'
				}
			]
		};
		await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration!), [{ path: ['launch'], value: expectedLaunchConfiguration }], true);
		await testObject.reloadConfiguration();
		const actual = testObject.getValue('launch');
		assert.deepStrictEqual(actual, expectedLaunchConfiguration);
	}));

	test('inspect launch configuration', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const expectedLaunchConfiguration = {
			'version': '0.1.0',
			'configurations': [
				{
					'type': 'node',
					'request': 'launch',
					'name': 'Gulp Build',
					'program': '${workspaceFolder}/node_modules/gulp/bin/gulp.js',
					'stopOnEntry': true,
					'args': [
						'watch-extension:json-client'
					],
					'cwd': '${workspaceFolder}'
				}
			]
		};
		await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration!), [{ path: ['launch'], value: expectedLaunchConfiguration }], true);
		await testObject.reloadConfiguration();
		const actual = testObject.inspect('launch').workspaceValue;
		assert.deepStrictEqual(actual, expectedLaunchConfiguration);
	}));


	test('get tasks configuration', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const expectedTasksConfiguration = {
			'version': '2.0.0',
			'tasks': [
				{
					'label': 'Run Dev',
					'type': 'shell',
					'command': './scripts/code.sh',
					'windows': {
						'command': '.\\scripts\\code.bat'
					},
					'problemMatcher': []
				}
			]
		};
		await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration!), [{ path: ['tasks'], value: expectedTasksConfiguration }], true);
		await testObject.reloadConfiguration();
		const actual = testObject.getValue(TasksSchemaProperties.Tasks);
		assert.deepStrictEqual(actual, expectedTasksConfiguration);
	}));

	test('inspect tasks configuration', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const expectedTasksConfiguration = {
			'version': '2.0.0',
			'tasks': [
				{
					'label': 'Run Dev',
					'type': 'shell',
					'command': './scripts/code.sh',
					'windows': {
						'command': '.\\scripts\\code.bat'
					},
					'problemMatcher': []
				}
			]
		};
		await jsonEditingServce.write(workspaceContextService.getWorkspace().configuration!, [{ path: ['tasks'], value: expectedTasksConfiguration }], true);
		await testObject.reloadConfiguration();
		const actual = testObject.inspect('tasks').workspaceValue;
		assert.deepStrictEqual(actual, expectedTasksConfiguration);
	}));

	test('update user configuration', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('configurationService.workspace.testSetting', 'userValue', ConfigurationTarget.USER);
		assert.strictEqual(testObject.getValue('configurationService.workspace.testSetting'), 'userValue');
	}));

	test('update user configuration should trigger change event before promise is resolve', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeConfiguration(target));
		await testObject.updateValue('configurationService.workspace.testSetting', 'userValue', ConfigurationTarget.USER);
		assert.ok(target.called);
	}));

	test('update workspace configuration', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('configurationService.workspace.testSetting', 'workspaceValue', ConfigurationTarget.WORKSPACE);
		assert.strictEqual(testObject.getValue('configurationService.workspace.testSetting'), 'workspaceValue');
	}));

	test('update workspace configuration should trigger change event before promise is resolve', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeConfiguration(target));
		await testObject.updateValue('configurationService.workspace.testSetting', 'workspaceValue', ConfigurationTarget.WORKSPACE);
		assert.ok(target.called);
	}));

	test('update application setting into workspace configuration in a workspace is not supported', () => {
		return testObject.updateValue('configurationService.workspace.applicationSetting', 'workspaceValue', {}, ConfigurationTarget.WORKSPACE, { donotNotifyError: true })
			.then(() => assert.fail('Should not be supported'), (e) => assert.strictEqual(e.code, ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION));
	});

	test('update machine setting into workspace configuration in a workspace is not supported', () => {
		return testObject.updateValue('configurationService.workspace.machineSetting', 'workspaceValue', {}, ConfigurationTarget.WORKSPACE, { donotNotifyError: true })
			.then(() => assert.fail('Should not be supported'), (e) => assert.strictEqual(e.code, ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE));
	});

	test('update workspace folder configuration', () => {
		const workspace = workspaceContextService.getWorkspace();
		return testObject.updateValue('configurationService.workspace.testResourceSetting', 'workspaceFolderValue', { resource: workspace.folders[0].uri }, ConfigurationTarget.WORKSPACE_FOLDER)
			.then(() => assert.strictEqual(testObject.getValue('configurationService.workspace.testResourceSetting', { resource: workspace.folders[0].uri }), 'workspaceFolderValue'));
	});

	test('update resource language configuration in workspace folder', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const workspace = workspaceContextService.getWorkspace();
		await testObject.updateValue('configurationService.workspace.testLanguageSetting', 'workspaceFolderValue', { resource: workspace.folders[0].uri }, ConfigurationTarget.WORKSPACE_FOLDER);
		assert.strictEqual(testObject.getValue('configurationService.workspace.testLanguageSetting', { resource: workspace.folders[0].uri }), 'workspaceFolderValue');
	}));

	test('update workspace folder configuration should trigger change event before promise is resolve', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const workspace = workspaceContextService.getWorkspace();
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeConfiguration(target));
		await testObject.updateValue('configurationService.workspace.testResourceSetting', 'workspaceFolderValue', { resource: workspace.folders[0].uri }, ConfigurationTarget.WORKSPACE_FOLDER);
		assert.ok(target.called);
	}));

	test('update workspace folder configuration second time should trigger change event before promise is resolve', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const workspace = workspaceContextService.getWorkspace();
		await testObject.updateValue('configurationService.workspace.testResourceSetting', 'workspaceFolderValue', { resource: workspace.folders[0].uri }, ConfigurationTarget.WORKSPACE_FOLDER);
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeConfiguration(target));
		await testObject.updateValue('configurationService.workspace.testResourceSetting', 'workspaceFolderValue2', { resource: workspace.folders[0].uri }, ConfigurationTarget.WORKSPACE_FOLDER);
		assert.ok(target.called);
	}));

	test('update machine overridable setting in folder', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const workspace = workspaceContextService.getWorkspace();
		await testObject.updateValue('configurationService.workspace.machineOverridableSetting', 'workspaceFolderValue', { resource: workspace.folders[0].uri }, ConfigurationTarget.WORKSPACE_FOLDER);
		assert.strictEqual(testObject.getValue('configurationService.workspace.machineOverridableSetting', { resource: workspace.folders[0].uri }), 'workspaceFolderValue');
	}));

	test('update memory configuration', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('configurationService.workspace.testSetting', 'memoryValue', ConfigurationTarget.MEMORY);
		assert.strictEqual(testObject.getValue('configurationService.workspace.testSetting'), 'memoryValue');
	}));

	test('update memory configuration should trigger change event before promise is resolve', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const target = sinon.spy();
		disposables.add(testObject.onDidChangeConfiguration(target));
		await testObject.updateValue('configurationService.workspace.testSetting', 'memoryValue', ConfigurationTarget.MEMORY);
		assert.ok(target.called);
	}));

	test('remove setting from all targets', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const workspace = workspaceContextService.getWorkspace();
		const key = 'configurationService.workspace.testResourceSetting';
		await testObject.updateValue(key, 'workspaceFolderValue', { resource: workspace.folders[0].uri }, ConfigurationTarget.WORKSPACE_FOLDER);
		await testObject.updateValue(key, 'workspaceValue', ConfigurationTarget.WORKSPACE);
		await testObject.updateValue(key, 'userValue', ConfigurationTarget.USER);

		await testObject.updateValue(key, undefined, { resource: workspace.folders[0].uri });
		await testObject.reloadConfiguration();

		const actual = testObject.inspect(key, { resource: workspace.folders[0].uri });
		assert.strictEqual(actual.userValue, undefined);
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
	}));

	test('update tasks configuration in a folder', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const workspace = workspaceContextService.getWorkspace();
		await testObject.updateValue('tasks', { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }, { resource: workspace.folders[0].uri }, ConfigurationTarget.WORKSPACE_FOLDER);
		assert.deepStrictEqual(testObject.getValue(TasksSchemaProperties.Tasks, { resource: workspace.folders[0].uri }), { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] });
	}));

	test('update launch configuration in a workspace', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const workspace = workspaceContextService.getWorkspace();
		await testObject.updateValue('launch', { 'version': '1.0.0', configurations: [{ 'name': 'myLaunch' }] }, { resource: workspace.folders[0].uri }, ConfigurationTarget.WORKSPACE, { donotNotifyError: true });
		assert.deepStrictEqual(testObject.getValue('launch'), { 'version': '1.0.0', configurations: [{ 'name': 'myLaunch' }] });
	}));

	test('update tasks configuration in a workspace', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const workspace = workspaceContextService.getWorkspace();
		const tasks = { 'version': '2.0.0', tasks: [{ 'label': 'myTask' }] };
		await testObject.updateValue('tasks', tasks, { resource: workspace.folders[0].uri }, ConfigurationTarget.WORKSPACE, { donotNotifyError: true });
		assert.deepStrictEqual(testObject.getValue(TasksSchemaProperties.Tasks), tasks);
	}));

	test('configuration of newly added folder is available on configuration change event', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const workspaceService = <WorkspaceService>testObject;
		const uri = workspaceService.getWorkspace().folders[1].uri;
		await workspaceService.removeFolders([uri]);
		await fileService.writeFile(joinPath(uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.workspace.testResourceSetting": "workspaceFolderValue" }'));

		return new Promise<void>((c, e) => {
			disposables.add(testObject.onDidChangeConfiguration(() => {
				try {
					assert.strictEqual(testObject.getValue('configurationService.workspace.testResourceSetting', { resource: uri }), 'workspaceFolderValue');
					c();
				} catch (error) {
					e(error);
				}
			}));
			workspaceService.addFolders([{ uri }]);
		});
	}));

	test('restricted setting is read from workspace folders when workspace is trusted', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		testObject.updateWorkspaceTrust(true);

		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.testRestrictedSetting1": "userValue", "configurationService.workspace.testRestrictedSetting2": "userValue" }'));
		await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration!), [{ path: ['settings'], value: { 'configurationService.workspace.testRestrictedSetting1': 'workspaceValue' } }], true);
		await fileService.writeFile(joinPath(testObject.getWorkspace().folders[1].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.workspace.testRestrictedSetting2": "workspaceFolder2Value" }'));
		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.workspace.testRestrictedSetting1', { resource: testObject.getWorkspace().folders[0].uri }), 'workspaceValue');
		assert.strictEqual(testObject.getValue('configurationService.workspace.testRestrictedSetting2', { resource: testObject.getWorkspace().folders[1].uri }), 'workspaceFolder2Value');
		assert.ok(testObject.restrictedSettings.default.includes('configurationService.workspace.testRestrictedSetting1'));
		assert.ok(testObject.restrictedSettings.default.includes('configurationService.workspace.testRestrictedSetting2'));
		assert.strictEqual(testObject.restrictedSettings.userLocal, undefined);
		assert.strictEqual(testObject.restrictedSettings.userRemote, undefined);
		assert.deepStrictEqual(testObject.restrictedSettings.workspace, ['configurationService.workspace.testRestrictedSetting1']);
		assert.strictEqual(testObject.restrictedSettings.workspaceFolder?.size, 1);
		assert.strictEqual(testObject.restrictedSettings.workspaceFolder?.get(testObject.getWorkspace().folders[0].uri), undefined);
		assert.deepStrictEqual(testObject.restrictedSettings.workspaceFolder?.get(testObject.getWorkspace().folders[1].uri), ['configurationService.workspace.testRestrictedSetting2']);
	}));

	test('restricted setting is not read from workspace when workspace is not trusted', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		testObject.updateWorkspaceTrust(false);

		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.testRestrictedSetting1": "userValue", "configurationService.workspace.testRestrictedSetting2": "userValue" }'));
		await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration!), [{ path: ['settings'], value: { 'configurationService.workspace.testRestrictedSetting1': 'workspaceValue' } }], true);
		await fileService.writeFile(joinPath(testObject.getWorkspace().folders[1].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.workspace.testRestrictedSetting2": "workspaceFolder2Value" }'));
		await testObject.reloadConfiguration();

		assert.strictEqual(testObject.getValue('configurationService.workspace.testRestrictedSetting1', { resource: testObject.getWorkspace().folders[0].uri }), 'userValue');
		assert.strictEqual(testObject.getValue('configurationService.workspace.testRestrictedSetting2', { resource: testObject.getWorkspace().folders[1].uri }), 'userValue');
		assert.ok(testObject.restrictedSettings.default.includes('configurationService.workspace.testRestrictedSetting1'));
		assert.ok(testObject.restrictedSettings.default.includes('configurationService.workspace.testRestrictedSetting2'));
		assert.strictEqual(testObject.restrictedSettings.userLocal, undefined);
		assert.strictEqual(testObject.restrictedSettings.userRemote, undefined);
		assert.deepStrictEqual(testObject.restrictedSettings.workspace, ['configurationService.workspace.testRestrictedSetting1']);
		assert.strictEqual(testObject.restrictedSettings.workspaceFolder?.size, 1);
		assert.strictEqual(testObject.restrictedSettings.workspaceFolder?.get(testObject.getWorkspace().folders[0].uri), undefined);
		assert.deepStrictEqual(testObject.restrictedSettings.workspaceFolder?.get(testObject.getWorkspace().folders[1].uri), ['configurationService.workspace.testRestrictedSetting2']);
	}));

	test('remove an unregistered setting', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const key = 'configurationService.workspace.unknownSetting';
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.unknownSetting": "userValue" }'));
		await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration!), [{ path: ['settings'], value: { 'configurationService.workspace.unknownSetting': 'workspaceValue' } }], true);
		await fileService.writeFile(joinPath(workspaceContextService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.workspace.unknownSetting": "workspaceFolderValue1" }'));
		await fileService.writeFile(joinPath(workspaceContextService.getWorkspace().folders[1].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.workspace.unknownSetting": "workspaceFolderValue2" }'));

		await testObject.reloadConfiguration();
		await testObject.updateValue(key, undefined, { resource: workspaceContextService.getWorkspace().folders[0].uri });

		let actual = testObject.inspect(key, { resource: workspaceContextService.getWorkspace().folders[0].uri });
		assert.strictEqual(actual.userValue, undefined);
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);

		await testObject.updateValue(key, undefined, { resource: workspaceContextService.getWorkspace().folders[1].uri });
		actual = testObject.inspect(key, { resource: workspaceContextService.getWorkspace().folders[1].uri });
		assert.strictEqual(actual.userValue, undefined);
		assert.strictEqual(actual.workspaceValue, undefined);
		assert.strictEqual(actual.workspaceFolderValue, undefined);
	}));

});

suite('WorkspaceConfigurationService - Remote Folder', () => {

	let testObject: WorkspaceService, folder: URI,
		machineSettingsResource: URI, remoteSettingsResource: URI, fileSystemProvider: InMemoryFileSystemProvider, resolveRemoteEnvironment: () => void,
		instantiationService: TestInstantiationService, fileService: IFileService, environmentService: BrowserWorkbenchEnvironmentService, userDataProfileService: IUserDataProfileService;
	const remoteAuthority = 'configuraiton-tests';
	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suiteSetup(() => {
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.remote.applicationSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.APPLICATION
				},
				'configurationService.remote.machineSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.MACHINE
				},
				'configurationService.remote.applicationMachineSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.APPLICATION_MACHINE
				},
				'configurationService.remote.machineOverridableSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.MACHINE_OVERRIDABLE
				},
				'configurationService.remote.testSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.RESOURCE
				}
			}
		});
	});

	setup(async () => {
		const logService = new NullLogService();
		fileService = disposables.add(new FileService(logService));
		fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		const appSettingsHome = joinPath(ROOT, 'user');
		folder = joinPath(ROOT, 'a');
		await fileService.createFolder(folder);
		await fileService.createFolder(appSettingsHome);
		machineSettingsResource = joinPath(ROOT, 'machine-settings.json');
		remoteSettingsResource = machineSettingsResource.with({ scheme: Schemas.vscodeRemote, authority: remoteAuthority });

		instantiationService = workbenchInstantiationService(undefined, disposables);
		environmentService = TestEnvironmentService;
		const remoteEnvironmentPromise = new Promise<Partial<IRemoteAgentEnvironment>>(c => resolveRemoteEnvironment = () => c({ settingsPath: remoteSettingsResource }));
		const remoteAgentService = instantiationService.stub(IRemoteAgentService, <Partial<IRemoteAgentService>>{ getEnvironment: () => remoteEnvironmentPromise });
		const configurationCache: IConfigurationCache = { read: () => Promise.resolve(''), write: () => Promise.resolve(), remove: () => Promise.resolve(), needsCaching: () => false };
		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		const userDataProfilesService = instantiationService.stub(IUserDataProfilesService, disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService)));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new FileUserDataProvider(ROOT.scheme, fileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, new NullLogService()))));
		userDataProfileService = instantiationService.stub(IUserDataProfileService, disposables.add(new UserDataProfileService(userDataProfilesService.defaultProfile)));
		testObject = disposables.add(new WorkspaceService({ configurationCache, remoteAuthority }, environmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, new NullLogService(), new NullPolicyService()));
		instantiationService.stub(IWorkspaceContextService, testObject);
		instantiationService.stub(IConfigurationService, testObject);
		instantiationService.stub(IEnvironmentService, environmentService);
		instantiationService.stub(IFileService, fileService);
	});

	async function initialize(): Promise<void> {
		await testObject.initialize(convertToWorkspacePayload(folder));
		instantiationService.stub(ITextFileService, disposables.add(instantiationService.createInstance(TestTextFileService)));
		instantiationService.stub(ITextModelService, <ITextModelService>disposables.add(instantiationService.createInstance(TextModelResolverService)));
		instantiationService.stub(IJSONEditingService, instantiationService.createInstance(JSONEditingService));
		testObject.acquireInstantiationService(instantiationService);
	}

	function registerRemoteFileSystemProvider(): void {
		disposables.add(instantiationService.get(IFileService).registerProvider(Schemas.vscodeRemote, new RemoteFileSystemProvider(fileSystemProvider, remoteAuthority)));
	}

	function registerRemoteFileSystemProviderOnActivation(): void {
		const disposable = disposables.add(instantiationService.get(IFileService).onWillActivateFileSystemProvider(e => {
			if (e.scheme === Schemas.vscodeRemote) {
				disposable.dispose();
				e.join(Promise.resolve().then(() => registerRemoteFileSystemProvider()));
			}
		}));
	}

	test('remote machine settings override globals', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(machineSettingsResource, VSBuffer.fromString('{ "configurationService.remote.machineSetting": "remoteValue" }'));
		registerRemoteFileSystemProvider();
		resolveRemoteEnvironment();
		await initialize();
		assert.strictEqual(testObject.getValue('configurationService.remote.machineSetting'), 'remoteValue');
	}));

	test('remote machine settings override globals after remote provider is registered on activation', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(machineSettingsResource, VSBuffer.fromString('{ "configurationService.remote.machineSetting": "remoteValue" }'));
		resolveRemoteEnvironment();
		registerRemoteFileSystemProviderOnActivation();
		await initialize();
		assert.strictEqual(testObject.getValue('configurationService.remote.machineSetting'), 'remoteValue');
	}));

	test('remote machine settings override globals after remote environment is resolved', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(machineSettingsResource, VSBuffer.fromString('{ "configurationService.remote.machineSetting": "remoteValue" }'));
		registerRemoteFileSystemProvider();
		await initialize();
		const promise = new Promise<void>((c, e) => {
			disposables.add(testObject.onDidChangeConfiguration(event => {
				try {
					assert.strictEqual(event.source, ConfigurationTarget.USER);
					assert.deepStrictEqual([...event.affectedKeys], ['configurationService.remote.machineSetting']);
					assert.strictEqual(testObject.getValue('configurationService.remote.machineSetting'), 'remoteValue');
					c();
				} catch (error) {
					e(error);
				}
			}));
		});
		resolveRemoteEnvironment();
		return promise;
	}));

	test('remote settings override globals after remote provider is registered on activation and remote environment is resolved', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(machineSettingsResource, VSBuffer.fromString('{ "configurationService.remote.machineSetting": "remoteValue" }'));
		registerRemoteFileSystemProviderOnActivation();
		await initialize();
		const promise = new Promise<void>((c, e) => {
			disposables.add(testObject.onDidChangeConfiguration(event => {
				try {
					assert.strictEqual(event.source, ConfigurationTarget.USER);
					assert.deepStrictEqual([...event.affectedKeys], ['configurationService.remote.machineSetting']);
					assert.strictEqual(testObject.getValue('configurationService.remote.machineSetting'), 'remoteValue');
					c();
				} catch (error) {
					e(error);
				}
			}));
		});
		resolveRemoteEnvironment();
		return promise;
	}));

	test('machine settings in local user settings does not override defaults', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.remote.machineSetting": "globalValue" }'));
		registerRemoteFileSystemProvider();
		resolveRemoteEnvironment();
		await initialize();
		assert.strictEqual(testObject.getValue('configurationService.remote.machineSetting'), 'isSet');
	}));

	test('remote application machine settings override globals', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(machineSettingsResource, VSBuffer.fromString('{ "configurationService.remote.applicationMachineSetting": "remoteValue" }'));
		registerRemoteFileSystemProvider();
		resolveRemoteEnvironment();
		await initialize();
		assert.strictEqual(testObject.getValue('configurationService.remote.applicationMachineSetting'), 'remoteValue');
	}));

	test('remote application machine settings override globals after remote provider is registered on activation', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(machineSettingsResource, VSBuffer.fromString('{ "configurationService.remote.applicationMachineSetting": "remoteValue" }'));
		resolveRemoteEnvironment();
		registerRemoteFileSystemProviderOnActivation();
		await initialize();
		assert.strictEqual(testObject.getValue('configurationService.remote.applicationMachineSetting'), 'remoteValue');
	}));

	test('remote application machine settings override globals after remote environment is resolved', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(machineSettingsResource, VSBuffer.fromString('{ "configurationService.remote.applicationMachineSetting": "remoteValue" }'));
		registerRemoteFileSystemProvider();
		await initialize();
		const promise = new Promise<void>((c, e) => {
			disposables.add(testObject.onDidChangeConfiguration(event => {
				try {
					assert.strictEqual(event.source, ConfigurationTarget.USER);
					assert.deepStrictEqual([...event.affectedKeys], ['configurationService.remote.applicationMachineSetting']);
					assert.strictEqual(testObject.getValue('configurationService.remote.applicationMachineSetting'), 'remoteValue');
					c();
				} catch (error) {
					e(error);
				}
			}));
		});
		resolveRemoteEnvironment();
		return promise;
	}));

	test('remote application machine settings override globals after remote provider is registered on activation and remote environment is resolved', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(machineSettingsResource, VSBuffer.fromString('{ "configurationService.remote.applicationMachineSetting": "remoteValue" }'));
		registerRemoteFileSystemProviderOnActivation();
		await initialize();
		const promise = new Promise<void>((c, e) => {
			disposables.add(testObject.onDidChangeConfiguration(event => {
				try {
					assert.strictEqual(event.source, ConfigurationTarget.USER);
					assert.deepStrictEqual([...event.affectedKeys], ['configurationService.remote.applicationMachineSetting']);
					assert.strictEqual(testObject.getValue('configurationService.remote.applicationMachineSetting'), 'remoteValue');
					c();
				} catch (error) {
					e(error);
				}
			}));
		});
		resolveRemoteEnvironment();
		return promise;
	}));

	test('application machine settings in local user settings does not override defaults', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.remote.applicationMachineSetting": "globalValue" }'));
		registerRemoteFileSystemProvider();
		resolveRemoteEnvironment();
		await initialize();
		assert.strictEqual(testObject.getValue('configurationService.remote.applicationMachineSetting'), 'isSet');
	}));

	test('machine overridable settings in local user settings does not override defaults', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.remote.machineOverridableSetting": "globalValue" }'));
		registerRemoteFileSystemProvider();
		resolveRemoteEnvironment();
		await initialize();
		assert.strictEqual(testObject.getValue('configurationService.remote.machineOverridableSetting'), 'isSet');
	}));

	test('non machine setting is written in local settings', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		registerRemoteFileSystemProvider();
		resolveRemoteEnvironment();
		await initialize();
		await testObject.updateValue('configurationService.remote.applicationSetting', 'applicationValue');
		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.inspect('configurationService.remote.applicationSetting').userLocalValue, 'applicationValue');
	}));

	test('machine setting is written in remote settings', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		registerRemoteFileSystemProvider();
		resolveRemoteEnvironment();
		await initialize();
		await testObject.updateValue('configurationService.remote.machineSetting', 'machineValue');
		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.inspect('configurationService.remote.machineSetting').userRemoteValue, 'machineValue');
	}));

	test('application machine setting is written in remote settings', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		registerRemoteFileSystemProvider();
		resolveRemoteEnvironment();
		await initialize();
		await testObject.updateValue('configurationService.remote.applicationMachineSetting', 'machineValue');
		await testObject.reloadConfiguration();
		const actual = testObject.inspect('configurationService.remote.applicationMachineSetting');
		assert.strictEqual(actual.userRemoteValue, 'machineValue');
	}));

	test('machine overridable setting is written in remote settings', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		registerRemoteFileSystemProvider();
		resolveRemoteEnvironment();
		await initialize();
		await testObject.updateValue('configurationService.remote.machineOverridableSetting', 'machineValue');
		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.inspect('configurationService.remote.machineOverridableSetting').userRemoteValue, 'machineValue');
	}));

	test('machine settings in local user settings does not override defaults after defalts are registered ', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.remote.newMachineSetting": "userValue" }'));
		registerRemoteFileSystemProvider();
		resolveRemoteEnvironment();
		await initialize();
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.remote.newMachineSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.MACHINE
				}
			}
		});
		assert.strictEqual(testObject.getValue('configurationService.remote.newMachineSetting'), 'isSet');
	}));

	test('machine overridable settings in local user settings does not override defaults after defaults are registered ', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.remote.newMachineOverridableSetting": "userValue" }'));
		registerRemoteFileSystemProvider();
		resolveRemoteEnvironment();
		await initialize();
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configurationService.remote.newMachineOverridableSetting': {
					'type': 'string',
					'default': 'isSet',
					scope: ConfigurationScope.MACHINE_OVERRIDABLE
				}
			}
		});
		assert.strictEqual(testObject.getValue('configurationService.remote.newMachineOverridableSetting'), 'isSet');
	}));

});

function getWorkspaceId(configPath: URI): string {
	let workspaceConfigPath = configPath.toString();
	if (!isLinux) {
		workspaceConfigPath = workspaceConfigPath.toLowerCase(); // sanitize for platform file system
	}
	return hash(workspaceConfigPath).toString(16);
}

function getWorkspaceIdentifier(configPath: URI): IWorkspaceIdentifier {
	return {
		configPath,
		id: getWorkspaceId(configPath)
	};
}
