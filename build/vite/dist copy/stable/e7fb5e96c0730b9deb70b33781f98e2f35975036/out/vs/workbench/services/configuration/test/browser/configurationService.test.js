/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { URI } from '../../../../../base/common/uri.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { Extensions as ConfigurationExtensions, keyFromOverrideIdentifiers } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { WorkspaceService } from '../../browser/configurationService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { workbenchInstantiationService, RemoteFileSystemProvider, TestEnvironmentService, TestTextFileService } from '../../../../test/browser/workbenchTestServices.js';
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
import { APPLY_ALL_PROFILES_SETTING } from '../../common/configuration.js';
import { SignService } from '../../../../../platform/sign/browser/signService.js';
import { FileUserDataProvider } from '../../../../../platform/userData/common/fileUserDataProvider.js';
import { IKeybindingEditingService, KeybindingsEditingService } from '../../../keybinding/common/keybindingEditing.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
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
import { RemoteSocketFactoryService } from '../../../../../platform/remote/common/remoteSocketFactoryService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PolicyCategory } from '../../../../../base/common/policy.js';
function convertToWorkspacePayload(folder) {
    return {
        id: hash(folder.toString()).toString(16),
        uri: folder
    };
}
class ConfigurationCache {
    needsCaching(resource) { return false; }
    async read() { return ''; }
    async write() { }
    async remove() { }
}
const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });
suite('WorkspaceContextService - Folder', () => {
    const folderName = 'Folder A';
    let folder;
    let testObject;
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
        testObject = disposables.add(new WorkspaceService({ configurationCache: new ConfigurationCache() }, environmentService, userDataProfileService, userDataProfilesService, fileService, disposables.add(new RemoteAgentService(new RemoteSocketFactoryService(), userDataProfileService, environmentService, TestProductService, disposables.add(new RemoteAuthorityResolverService(false, undefined, undefined, undefined, TestProductService, logService)), new SignService(TestProductService), new NullLogService())), uriIdentityService, new NullLogService(), new NullPolicyService()));
        await testObject.initialize(convertToWorkspacePayload(folder));
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
        assert.strictEqual(actual, 2 /* WorkbenchState.FOLDER */);
    });
    test('getWorkspaceFolder()', () => {
        const actual = testObject.getWorkspaceFolder(joinPath(folder, 'a'));
        assert.strictEqual(actual, testObject.getWorkspace().folders[0]);
    });
    test('getWorkspaceFolder() - queries in workspace folder', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
        const testObject = disposables.add(new WorkspaceService({ configurationCache: new ConfigurationCache() }, environmentService, userDataProfileService, userDataProfilesService, fileService, disposables.add(new RemoteAgentService(new RemoteSocketFactoryService(), userDataProfileService, environmentService, TestProductService, disposables.add(new RemoteAuthorityResolverService(false, undefined, undefined, undefined, TestProductService, logService)), new SignService(TestProductService), new NullLogService())), uriIdentityService, new NullLogService(), new NullPolicyService()));
        await testObject.initialize(convertToWorkspacePayload(folder));
        const actual = testObject.getWorkspaceFolder(joinPath(folder, 'a'));
        assert.strictEqual(actual, testObject.getWorkspace().folders[0]);
    }));
    test('getWorkspaceFolder() - queries in resource', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
        const testObject = disposables.add(new WorkspaceService({ configurationCache: new ConfigurationCache() }, environmentService, userDataProfileService, userDataProfilesService, fileService, disposables.add(new RemoteAgentService(new RemoteSocketFactoryService(), userDataProfileService, environmentService, TestProductService, disposables.add(new RemoteAuthorityResolverService(false, undefined, undefined, undefined, TestProductService, logService)), new SignService(TestProductService), new NullLogService())), uriIdentityService, new NullLogService(), new NullPolicyService()));
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
    let testObject;
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
        testObject = disposables.add(new WorkspaceService({ configurationCache: new ConfigurationCache() }, environmentService, disposables.add(new UserDataProfileService(userDataProfilesService.defaultProfile)), userDataProfilesService, fileService, remoteAgentService, uriIdentityService, new NullLogService(), new NullPolicyService()));
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
        assert.strictEqual(actual, 3 /* WorkbenchState.WORKSPACE */);
    });
    test('workspace is complete', () => testObject.getCompleteWorkspace());
});
suite('WorkspaceContextService - Workspace Editing', () => {
    let testObject, fileService;
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
        testObject = disposables.add(new WorkspaceService({ configurationCache: new ConfigurationCache() }, environmentService, disposables.add(new UserDataProfileService(userDataProfilesService.defaultProfile)), userDataProfilesService, fileService, remoteAgentService, uriIdentityService, new NullLogService(), new NullPolicyService()));
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
    test('add folders', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.addFolders([{ uri: joinPath(ROOT, 'd') }, { uri: joinPath(ROOT, 'c') }]);
        const actual = testObject.getWorkspace().folders;
        assert.strictEqual(actual.length, 4);
        assert.strictEqual(basename(actual[0].uri), 'a');
        assert.strictEqual(basename(actual[1].uri), 'b');
        assert.strictEqual(basename(actual[2].uri), 'd');
        assert.strictEqual(basename(actual[3].uri), 'c');
    }));
    test('add folders (at specific index)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.addFolders([{ uri: joinPath(ROOT, 'd') }, { uri: joinPath(ROOT, 'c') }], 0);
        const actual = testObject.getWorkspace().folders;
        assert.strictEqual(actual.length, 4);
        assert.strictEqual(basename(actual[0].uri), 'd');
        assert.strictEqual(basename(actual[1].uri), 'c');
        assert.strictEqual(basename(actual[2].uri), 'a');
        assert.strictEqual(basename(actual[3].uri), 'b');
    }));
    test('add folders (at specific wrong index)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.addFolders([{ uri: joinPath(ROOT, 'd') }, { uri: joinPath(ROOT, 'c') }], 10);
        const actual = testObject.getWorkspace().folders;
        assert.strictEqual(actual.length, 4);
        assert.strictEqual(basename(actual[0].uri), 'a');
        assert.strictEqual(basename(actual[1].uri), 'b');
        assert.strictEqual(basename(actual[2].uri), 'd');
        assert.strictEqual(basename(actual[3].uri), 'c');
    }));
    test('add folders (with name)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
    test('add folders triggers change event', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const target = sinon.spy();
        disposables.add(testObject.onWillChangeWorkspaceFolders(target));
        disposables.add(testObject.onDidChangeWorkspaceFolders(target));
        const addedFolders = [{ uri: joinPath(ROOT, 'd') }, { uri: joinPath(ROOT, 'c') }];
        await testObject.addFolders(addedFolders);
        assert.strictEqual(target.callCount, 2, `Should be called only once but called ${target.callCount} times`);
        const actual_1 = target.args[1][0];
        assert.deepStrictEqual(actual_1.added.map(r => r.uri.toString()), addedFolders.map(a => a.uri.toString()));
        assert.deepStrictEqual(actual_1.removed, []);
        assert.deepStrictEqual(actual_1.changed, []);
    }));
    test('remove folders', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.removeFolders([testObject.getWorkspace().folders[0].uri]);
        const actual = testObject.getWorkspace().folders;
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(basename(actual[0].uri), 'b');
    }));
    test('remove folders triggers change event', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const target = sinon.spy();
        disposables.add(testObject.onWillChangeWorkspaceFolders(target));
        disposables.add(testObject.onDidChangeWorkspaceFolders(target));
        const removedFolder = testObject.getWorkspace().folders[0];
        await testObject.removeFolders([removedFolder.uri]);
        assert.strictEqual(target.callCount, 2, `Should be called only once but called ${target.callCount} times`);
        const actual_1 = target.args[1][0];
        assert.deepStrictEqual(actual_1.added, []);
        assert.deepStrictEqual(actual_1.removed.map(r => r.uri.toString()), [removedFolder.uri.toString()]);
        assert.deepStrictEqual(actual_1.changed.map(c => c.uri.toString()), [testObject.getWorkspace().folders[0].uri.toString()]);
    }));
    test('remove folders and add them back by writing into the file', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const folders = testObject.getWorkspace().folders;
        await testObject.removeFolders([folders[0].uri]);
        const promise = new Promise((resolve, reject) => {
            disposables.add(testObject.onDidChangeWorkspaceFolders(actual => {
                try {
                    assert.deepStrictEqual(actual.added.map(r => r.uri.toString()), [folders[0].uri.toString()]);
                    resolve();
                }
                catch (error) {
                    reject(error);
                }
            }));
        });
        const workspace = { folders: [{ path: folders[0].uri.path }, { path: folders[1].uri.path }] };
        await fileService.writeFile(testObject.getWorkspace().configuration, VSBuffer.fromString(JSON.stringify(workspace, null, '\t')));
        await promise;
    }));
    test('update folders (remove last and add to end)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const target = sinon.spy();
        disposables.add(testObject.onWillChangeWorkspaceFolders(target));
        disposables.add(testObject.onDidChangeWorkspaceFolders(target));
        const addedFolders = [{ uri: joinPath(ROOT, 'd') }, { uri: joinPath(ROOT, 'c') }];
        const removedFolders = [testObject.getWorkspace().folders[1]].map(f => f.uri);
        await testObject.updateFolders(addedFolders, removedFolders);
        assert.strictEqual(target.callCount, 2, `Should be called only once but called ${target.callCount} times`);
        const actual_1 = target.args[1][0];
        assert.deepStrictEqual(actual_1.added.map(r => r.uri.toString()), addedFolders.map(a => a.uri.toString()));
        assert.deepStrictEqual(actual_1.removed.map(r_1 => r_1.uri.toString()), removedFolders.map(a_1 => a_1.toString()));
        assert.deepStrictEqual(actual_1.changed, []);
    }));
    test('update folders (rename first via add and remove)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const target = sinon.spy();
        disposables.add(testObject.onWillChangeWorkspaceFolders(target));
        disposables.add(testObject.onDidChangeWorkspaceFolders(target));
        const addedFolders = [{ uri: joinPath(ROOT, 'a'), name: 'The Folder' }];
        const removedFolders = [testObject.getWorkspace().folders[0]].map(f => f.uri);
        await testObject.updateFolders(addedFolders, removedFolders, 0);
        assert.strictEqual(target.callCount, 2, `Should be called only once but called ${target.callCount} times`);
        const actual_1 = target.args[1][0];
        assert.deepStrictEqual(actual_1.added, []);
        assert.deepStrictEqual(actual_1.removed, []);
        assert.deepStrictEqual(actual_1.changed.map(r => r.uri.toString()), removedFolders.map(a => a.toString()));
    }));
    test('update folders (remove first and add to end)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const target = sinon.spy();
        disposables.add(testObject.onWillChangeWorkspaceFolders(target));
        disposables.add(testObject.onDidChangeWorkspaceFolders(target));
        const addedFolders = [{ uri: joinPath(ROOT, 'd') }, { uri: joinPath(ROOT, 'c') }];
        const removedFolders = [testObject.getWorkspace().folders[0]].map(f => f.uri);
        const changedFolders = [testObject.getWorkspace().folders[1]].map(f => f.uri);
        await testObject.updateFolders(addedFolders, removedFolders);
        assert.strictEqual(target.callCount, 2, `Should be called only once but called ${target.callCount} times`);
        const actual_1 = target.args[1][0];
        assert.deepStrictEqual(actual_1.added.map(r => r.uri.toString()), addedFolders.map(a => a.uri.toString()));
        assert.deepStrictEqual(actual_1.removed.map(r_1 => r_1.uri.toString()), removedFolders.map(a_1 => a_1.toString()));
        assert.deepStrictEqual(actual_1.changed.map(r_2 => r_2.uri.toString()), changedFolders.map(a_2 => a_2.toString()));
    }));
    test('reorder folders trigger change event', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const target = sinon.spy();
        disposables.add(testObject.onWillChangeWorkspaceFolders(target));
        disposables.add(testObject.onDidChangeWorkspaceFolders(target));
        const workspace = { folders: [{ path: testObject.getWorkspace().folders[1].uri.path }, { path: testObject.getWorkspace().folders[0].uri.path }] };
        await fileService.writeFile(testObject.getWorkspace().configuration, VSBuffer.fromString(JSON.stringify(workspace, null, '\t')));
        await testObject.reloadConfiguration();
        assert.strictEqual(target.callCount, 2, `Should be called only once but called ${target.callCount} times`);
        const actual_1 = target.args[1][0];
        assert.deepStrictEqual(actual_1.added, []);
        assert.deepStrictEqual(actual_1.removed, []);
        assert.deepStrictEqual(actual_1.changed.map(c => c.uri.toString()), testObject.getWorkspace().folders.map(f => f.uri.toString()).reverse());
    }));
    test('rename folders trigger change event', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const target = sinon.spy();
        disposables.add(testObject.onWillChangeWorkspaceFolders(target));
        disposables.add(testObject.onDidChangeWorkspaceFolders(target));
        const workspace = { folders: [{ path: testObject.getWorkspace().folders[0].uri.path, name: '1' }, { path: testObject.getWorkspace().folders[1].uri.path }] };
        fileService.writeFile(testObject.getWorkspace().configuration, VSBuffer.fromString(JSON.stringify(workspace, null, '\t')));
        await testObject.reloadConfiguration();
        assert.strictEqual(target.callCount, 2, `Should be called only once but called ${target.callCount} times`);
        const actual_1 = target.args[1][0];
        assert.deepStrictEqual(actual_1.added, []);
        assert.deepStrictEqual(actual_1.removed, []);
        assert.deepStrictEqual(actual_1.changed.map(c => c.uri.toString()), [testObject.getWorkspace().folders[0].uri.toString()]);
    }));
});
suite('WorkspaceService - Initialization', () => {
    let configResource, testObject, fileService, environmentService, userDataProfileService;
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    suiteSetup(() => {
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                'initialization.testSetting1': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 5 /* ConfigurationScope.RESOURCE */
                },
                'initialization.testSetting2': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 5 /* ConfigurationScope.RESOURCE */
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
        testObject = disposables.add(new WorkspaceService({ configurationCache: new ConfigurationCache() }, environmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, new NullLogService(), new NullPolicyService()));
        instantiationService.stub(IFileService, fileService);
        instantiationService.stub(IWorkspaceContextService, testObject);
        instantiationService.stub(IConfigurationService, testObject);
        instantiationService.stub(IEnvironmentService, environmentService);
        await testObject.initialize({ id: '' });
        instantiationService.stub(ITextFileService, disposables.add(instantiationService.createInstance(TestTextFileService)));
        instantiationService.stub(ITextModelService, disposables.add(instantiationService.createInstance(TextModelResolverService)));
        testObject.acquireInstantiationService(instantiationService);
    });
    (isMacintosh ? test.skip : test)('initialize a folder workspace from an empty workspace with no configuration changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
        assert.deepStrictEqual(target.args[0], [2 /* WorkbenchState.FOLDER */]);
        assert.deepStrictEqual(target.args[1], [undefined]);
        assert.deepStrictEqual(target.args[3][0].added.map(f => f.uri.toString()), [folder.toString()]);
        assert.deepStrictEqual(target.args[3][0].removed, []);
        assert.deepStrictEqual(target.args[3][0].changed, []);
    }));
    (isMacintosh ? test.skip : test)('initialize a folder workspace from an empty workspace with configuration changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
        assert.deepStrictEqual([...target.args[0][0].affectedKeys], ['initialization.testSetting1']);
        assert.deepStrictEqual(target.args[1], [2 /* WorkbenchState.FOLDER */]);
        assert.deepStrictEqual(target.args[2], [undefined]);
        assert.deepStrictEqual(target.args[4][0].added.map(f => f.uri.toString()), [folder.toString()]);
        assert.deepStrictEqual(target.args[4][0].removed, []);
        assert.deepStrictEqual(target.args[4][0].changed, []);
    }));
    (isMacintosh ? test.skip : test)('initialize a multi root workspace from an empty workspace with no configuration changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
        assert.deepStrictEqual(target.args[0], [3 /* WorkbenchState.WORKSPACE */]);
        assert.deepStrictEqual(target.args[1], [undefined]);
        assert.deepStrictEqual(target.args[3][0].added.map(folder => folder.uri.toString()), [joinPath(ROOT, 'a').toString(), joinPath(ROOT, 'b').toString()]);
        assert.deepStrictEqual(target.args[3][0].removed, []);
        assert.deepStrictEqual(target.args[3][0].changed, []);
    }));
    (isMacintosh ? test.skip : test)('initialize a multi root workspace from an empty workspace with configuration changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
        assert.deepStrictEqual([...target.args[0][0].affectedKeys], ['initialization.testSetting1', 'initialization.testSetting2']);
        assert.deepStrictEqual(target.args[1], [3 /* WorkbenchState.WORKSPACE */]);
        assert.deepStrictEqual(target.args[2], [undefined]);
        assert.deepStrictEqual(target.args[4][0].added.map(folder => folder.uri.toString()), [joinPath(ROOT, 'a').toString(), joinPath(ROOT, 'b').toString()]);
        assert.deepStrictEqual(target.args[4][0].removed, []);
        assert.deepStrictEqual(target.args[4][0].changed, []);
    }));
    (isMacintosh ? test.skip : test)('initialize a folder workspace from a folder workspace with no configuration changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
        assert.deepStrictEqual(target.args[1][0].added.map(folder_1 => folder_1.uri.toString()), [joinPath(ROOT, 'b').toString()]);
        assert.deepStrictEqual(target.args[1][0].removed.map(folder_2 => folder_2.uri.toString()), [joinPath(ROOT, 'a').toString()]);
        assert.deepStrictEqual(target.args[1][0].changed, []);
    }));
    (isMacintosh ? test.skip : test)('initialize a folder workspace from a folder workspace with configuration changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
        assert.deepStrictEqual([...target.args[0][0].affectedKeys], ['initialization.testSetting1']);
        assert.deepStrictEqual(target.args[2][0].added.map(folder_1 => folder_1.uri.toString()), [joinPath(ROOT, 'b').toString()]);
        assert.deepStrictEqual(target.args[2][0].removed.map(folder_2 => folder_2.uri.toString()), [joinPath(ROOT, 'a').toString()]);
        assert.deepStrictEqual(target.args[2][0].changed, []);
    }));
    (isMacintosh ? test.skip : test)('initialize a multi folder workspace from a folder workspacce triggers change events in the right order', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
        assert.deepStrictEqual([...target.args[0][0].affectedKeys], ['initialization.testSetting1']);
        assert.deepStrictEqual(target.args[1], [3 /* WorkbenchState.WORKSPACE */]);
        assert.deepStrictEqual(target.args[2], [undefined]);
        assert.deepStrictEqual(target.args[4][0].added.map(folder_1 => folder_1.uri.toString()), [joinPath(ROOT, 'b').toString()]);
        assert.deepStrictEqual(target.args[4][0].removed, []);
        assert.deepStrictEqual(target.args[4][0].changed, []);
    }));
});
suite('WorkspaceConfigurationService - Folder', () => {
    let testObject, workspaceService, fileService, environmentService, userDataProfileService, instantiationService;
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    suiteSetup(() => {
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                'configurationService.folder.applicationSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 1 /* ConfigurationScope.APPLICATION */
                },
                'configurationService.folder.machineSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 2 /* ConfigurationScope.MACHINE */
                },
                'configurationService.folder.applicationMachineSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 3 /* ConfigurationScope.APPLICATION_MACHINE */
                },
                'configurationService.folder.machineOverridableSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 7 /* ConfigurationScope.MACHINE_OVERRIDABLE */
                },
                'configurationService.folder.testSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 5 /* ConfigurationScope.RESOURCE */
                },
                'configurationService.folder.languageSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */
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
                        category: PolicyCategory.Extensions,
                        minimumVersion: '1.0.0',
                        localization: { description: { key: '', value: '' } }
                    }
                },
                'configurationService.folder.policyObjectSetting': {
                    'type': 'object',
                    'default': {},
                    policy: {
                        name: 'configurationService.folder.policyObjectSetting',
                        category: PolicyCategory.Extensions,
                        minimumVersion: '1.0.0',
                        localization: { description: { key: '', value: '' } }
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
        workspaceService = testObject = disposables.add(new WorkspaceService({ configurationCache: new ConfigurationCache() }, environmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, new NullLogService(), disposables.add(new FilePolicyService(environmentService.policyFile, fileService, logService))));
        instantiationService.stub(IFileService, fileService);
        instantiationService.stub(IWorkspaceContextService, testObject);
        instantiationService.stub(IConfigurationService, testObject);
        instantiationService.stub(IEnvironmentService, environmentService);
        await workspaceService.initialize(convertToWorkspacePayload(folder));
        instantiationService.stub(IKeybindingEditingService, disposables.add(instantiationService.createInstance(KeybindingsEditingService)));
        instantiationService.stub(ITextFileService, disposables.add(instantiationService.createInstance(TestTextFileService)));
        instantiationService.stub(ITextModelService, disposables.add(instantiationService.createInstance(TextModelResolverService)));
        workspaceService.acquireInstantiationService(instantiationService);
    });
    test('defaults', () => {
        assert.deepStrictEqual(testObject.getValue('configurationService'), {
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
    test('globals override defaults', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.testSetting": "userValue" }'));
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.folder.testSetting'), 'userValue');
    }));
    test('globals', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "testworkbench.editor.tabs": true }'));
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('testworkbench.editor.tabs'), true);
    }));
    test('workspace settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "testworkbench.editor.icons": true }'));
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('testworkbench.editor.icons'), true);
    }));
    test('workspace settings override user settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.testSetting": "userValue" }'));
        await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.testSetting": "workspaceValue" }'));
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.folder.testSetting'), 'workspaceValue');
    }));
    test('machine overridable settings override user Settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.machineOverridableSetting": "userValue" }'));
        await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.machineOverridableSetting": "workspaceValue" }'));
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.folder.machineOverridableSetting'), 'workspaceValue');
    }));
    test('workspace settings override user settings after defaults are registered ', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
    test('machine overridable settings override user settings after defaults are registered ', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
                    scope: 7 /* ConfigurationScope.MACHINE_OVERRIDABLE */
                }
            }
        });
        assert.strictEqual(testObject.getValue('configurationService.folder.newMachineOverridableSetting'), 'workspaceValue');
    }));
    test('application settings are not read from workspace', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.applicationSetting": "userValue" }'));
        await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.applicationSetting": "workspaceValue" }'));
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.folder.applicationSetting'), 'userValue');
    }));
    test('application settings are not read from workspace when workspace folder uri is passed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.applicationSetting": "userValue" }'));
        await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.applicationSetting": "workspaceValue" }'));
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.folder.applicationSetting', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
    }));
    test('machine settings are not read from workspace', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.machineSetting": "userValue" }'));
        await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.machineSetting": "workspaceValue" }'));
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.folder.machineSetting', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
    }));
    test('machine settings are not read from workspace when workspace folder uri is passed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.machineSetting": "userValue" }'));
        await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.machineSetting": "workspaceValue" }'));
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.folder.machineSetting', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
    }));
    test('application machine overridable settings are not read from workspace', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.applicationMachineSetting": "userValue" }'));
        await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.applicationMachineSetting": "workspaceValue" }'));
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.folder.applicationMachineSetting'), 'userValue');
    }));
    test('application machine overridable settings are not read from workspace when workspace folder uri is passed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.applicationMachineSetting": "userValue" }'));
        await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.applicationMachineSetting": "workspaceValue" }'));
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.folder.applicationMachineSetting', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
    }));
    test('get application scope settings are loaded after defaults are registered', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
                    scope: 1 /* ConfigurationScope.APPLICATION */
                }
            }
        });
        assert.strictEqual(testObject.getValue('configurationService.folder.applicationSetting-2'), 'userValue');
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.folder.applicationSetting-2'), 'userValue');
    }));
    test('get application scope settings are not loaded after defaults are registered when workspace folder uri is passed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
                    scope: 1 /* ConfigurationScope.APPLICATION */
                }
            }
        });
        assert.strictEqual(testObject.getValue('configurationService.folder.applicationSetting-3', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.folder.applicationSetting-3', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
    }));
    test('get application machine overridable scope settings are loaded after defaults are registered', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
                    scope: 1 /* ConfigurationScope.APPLICATION */
                }
            }
        });
        assert.strictEqual(testObject.getValue('configurationService.folder.applicationMachineSetting-2'), 'userValue');
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.folder.applicationMachineSetting-2'), 'userValue');
    }));
    test('get application machine overridable scope settings are loaded after defaults are registered when workspace folder uri is passed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
                    scope: 1 /* ConfigurationScope.APPLICATION */
                }
            }
        });
        assert.strictEqual(testObject.getValue('configurationService.folder.applicationMachineSetting-3', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.folder.applicationMachineSetting-3', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
    }));
    test('get machine scope settings are not loaded after defaults are registered', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
                    scope: 2 /* ConfigurationScope.MACHINE */
                }
            }
        });
        assert.strictEqual(testObject.getValue('configurationService.folder.machineSetting-2'), 'userValue');
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.folder.machineSetting-2'), 'userValue');
    }));
    test('get machine scope settings are not loaded after defaults are registered when workspace folder uri is passed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
                    scope: 2 /* ConfigurationScope.MACHINE */
                }
            }
        });
        assert.strictEqual(testObject.getValue('configurationService.folder.machineSetting-3', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.folder.machineSetting-3', { resource: workspaceService.getWorkspace().folders[0].uri }), 'userValue');
    }));
    test('policy value override all', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const result = await runWithFakedTimers({ useFakeTimers: true }, async () => {
            const promise = Event.toPromise(testObject.onDidChangeConfiguration);
            await fileService.writeFile(environmentService.policyFile, VSBuffer.fromString('{ "configurationService.folder.policySetting": "policyValue" }'));
            return promise;
        });
        assert.deepStrictEqual([...result.affectedKeys], ['configurationService.folder.policySetting']);
        assert.strictEqual(testObject.getValue('configurationService.folder.policySetting'), 'policyValue');
        assert.strictEqual(testObject.inspect('configurationService.folder.policySetting').policyValue, 'policyValue');
    }));
    test('policy settings when policy value is not set', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.policySetting": "userValue" }'));
        await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.policySetting": "workspaceValue" }'));
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.folder.policySetting'), 'workspaceValue');
        assert.strictEqual(testObject.inspect('configurationService.folder.policySetting').policyValue, undefined);
    }));
    test('policy value override all for object type setting', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await runWithFakedTimers({ useFakeTimers: true }, async () => {
            const promise = Event.toPromise(testObject.onDidChangeConfiguration);
            await fileService.writeFile(environmentService.policyFile, VSBuffer.fromString('{ "configurationService.folder.policyObjectSetting": {"a": true} }'));
            return promise;
        });
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.policyObjectSetting": {"b": true} }'));
        await testObject.reloadConfiguration();
        assert.deepStrictEqual(testObject.getValue('configurationService.folder.policyObjectSetting'), { a: true });
    }));
    test('reload configuration emits events after global configuraiton changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "testworkbench.editor.tabs": true }'));
        const target = sinon.spy();
        disposables.add(testObject.onDidChangeConfiguration(target));
        await testObject.reloadConfiguration();
        assert.ok(target.called);
    }));
    test('reload configuration emits events after workspace configuraiton changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.testSetting": "workspaceValue" }'));
        const target = sinon.spy();
        disposables.add(testObject.onDidChangeConfiguration(target));
        await testObject.reloadConfiguration();
        assert.ok(target.called);
    }));
    test('reload configuration should not emit event if no changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "testworkbench.editor.tabs": true }'));
        await fileService.writeFile(joinPath(workspaceService.getWorkspace().folders[0].uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.folder.testSetting": "workspaceValue" }'));
        await testObject.reloadConfiguration();
        const target = sinon.spy();
        disposables.add(testObject.onDidChangeConfiguration(() => { target(); }));
        await testObject.reloadConfiguration();
        assert.ok(!target.called);
    }));
    test('inspect', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
            'configurationService': {
                'tasks': {
                    'testSetting': 'tasksValue'
                }
            }
        });
        assert.strictEqual(actual.workspaceFolderValue, undefined);
        assert.deepStrictEqual(actual.value, {
            'configurationService': {
                'tasks': {
                    'testSetting': 'tasksValue'
                }
            }
        });
    }));
    test('inspect restricted settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
            'configurationService': {
                'tasks': {
                    'testSetting': 'tasksValue'
                }
            }
        });
        assert.strictEqual(actual.workspaceFolderValue, undefined);
        assert.deepStrictEqual(actual.value, {
            'configurationService': {
                'tasks': {
                    'testSetting': 'tasksValue'
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
            'configurationService': {
                'tasks': {
                    'testSetting': 'tasksValue'
                }
            }
        });
        assert.strictEqual(actual.workspaceFolderValue, undefined);
        assert.deepStrictEqual(actual.value, {
            'configurationService': {
                'tasks': {
                    'testSetting': 'tasksValue'
                }
            }
        });
    }));
    test('inspect restricted settings after change', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
    test('keys', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
        return testObject.updateValue('configurationService.folder.testSetting', 'value', 2 /* ConfigurationTarget.USER */)
            .then(() => assert.strictEqual(testObject.getValue('configurationService.folder.testSetting'), 'value'));
    });
    test('update workspace configuration', () => {
        return testObject.updateValue('tasks.service.testSetting', 'value', 5 /* ConfigurationTarget.WORKSPACE */)
            .then(() => assert.strictEqual(testObject.getValue("tasks.service.testSetting" /* TasksSchemaProperties.ServiceTestSetting */), 'value'));
    });
    test('update resource configuration', () => {
        return testObject.updateValue('configurationService.folder.testSetting', 'value', { resource: workspaceService.getWorkspace().folders[0].uri }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */)
            .then(() => assert.strictEqual(testObject.getValue('configurationService.folder.testSetting'), 'value'));
    });
    test('update language configuration using configuration overrides', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue('configurationService.folder.languageSetting', 'abcLangValue', { overrideIdentifier: 'abclang' });
        assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { overrideIdentifier: 'abclang' }), 'abcLangValue');
    }));
    test('update language configuration using configuration update overrides', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue('configurationService.folder.languageSetting', 'abcLangValue', { overrideIdentifiers: ['abclang'] });
        assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { overrideIdentifier: 'abclang' }), 'abcLangValue');
    }));
    test('update language configuration for multiple languages', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue('configurationService.folder.languageSetting', 'multiLangValue', { overrideIdentifiers: ['xyzlang', 'deflang'] }, 2 /* ConfigurationTarget.USER */);
        assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { overrideIdentifier: 'deflang' }), 'multiLangValue');
        assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { overrideIdentifier: 'xyzlang' }), 'multiLangValue');
        assert.deepStrictEqual(testObject.getValue(keyFromOverrideIdentifiers(['deflang', 'xyzlang'])), { 'configurationService.folder.languageSetting': 'multiLangValue' });
    }));
    test('update language configuration for multiple languages when already set', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "[deflang][xyzlang]": { "configurationService.folder.languageSetting": "userValue" }}'));
        await testObject.updateValue('configurationService.folder.languageSetting', 'multiLangValue', { overrideIdentifiers: ['xyzlang', 'deflang'] }, 2 /* ConfigurationTarget.USER */);
        assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { overrideIdentifier: 'deflang' }), 'multiLangValue');
        assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { overrideIdentifier: 'xyzlang' }), 'multiLangValue');
        assert.deepStrictEqual(testObject.getValue(keyFromOverrideIdentifiers(['deflang', 'xyzlang'])), { 'configurationService.folder.languageSetting': 'multiLangValue' });
        const actualContent = (await fileService.readFile(userDataProfileService.currentProfile.settingsResource)).value.toString();
        assert.deepStrictEqual(JSON.parse(actualContent), { '[deflang][xyzlang]': { 'configurationService.folder.languageSetting': 'multiLangValue' } });
    }));
    test('update resource language configuration', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue('configurationService.folder.languageSetting', 'value', { resource: workspaceService.getWorkspace().folders[0].uri }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting'), 'value');
    }));
    test('update resource language configuration for a language using configuration overrides', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { resource: workspaceService.getWorkspace().folders[0].uri, overrideIdentifier: 'jsonc' }), 'languageValue');
        await testObject.updateValue('configurationService.folder.languageSetting', 'languageValueUpdated', { resource: workspaceService.getWorkspace().folders[0].uri, overrideIdentifier: 'jsonc' }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { resource: workspaceService.getWorkspace().folders[0].uri, overrideIdentifier: 'jsonc' }), 'languageValueUpdated');
    }));
    test('update resource language configuration for a language using configuration update overrides', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { resource: workspaceService.getWorkspace().folders[0].uri, overrideIdentifier: 'jsonc' }), 'languageValue');
        await testObject.updateValue('configurationService.folder.languageSetting', 'languageValueUpdated', { resource: workspaceService.getWorkspace().folders[0].uri, overrideIdentifiers: ['jsonc'] }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        assert.strictEqual(testObject.getValue('configurationService.folder.languageSetting', { resource: workspaceService.getWorkspace().folders[0].uri, overrideIdentifier: 'jsonc' }), 'languageValueUpdated');
    }));
    test('update application setting into workspace configuration in a workspace is not supported', () => {
        return testObject.updateValue('configurationService.folder.applicationSetting', 'workspaceValue', {}, 5 /* ConfigurationTarget.WORKSPACE */, { donotNotifyError: true })
            .then(() => assert.fail('Should not be supported'), (e) => assert.strictEqual(e.code, 1 /* ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION */));
    });
    test('update application machine overridable setting into workspace configuration in a workspace is not supported', () => {
        return testObject.updateValue('configurationService.folder.applicationMachineSetting', 'workspaceValue', {}, 5 /* ConfigurationTarget.WORKSPACE */, { donotNotifyError: true })
            .then(() => assert.fail('Should not be supported'), (e) => assert.strictEqual(e.code, 1 /* ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION */));
    });
    test('update machine setting into workspace configuration in a workspace is not supported', () => {
        return testObject.updateValue('configurationService.folder.machineSetting', 'workspaceValue', {}, 5 /* ConfigurationTarget.WORKSPACE */, { donotNotifyError: true })
            .then(() => assert.fail('Should not be supported'), (e) => assert.strictEqual(e.code, 2 /* ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE */));
    });
    test('update tasks configuration', () => {
        return testObject.updateValue('tasks', { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }, 5 /* ConfigurationTarget.WORKSPACE */)
            .then(() => assert.deepStrictEqual(testObject.getValue("tasks" /* TasksSchemaProperties.Tasks */), { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }));
    });
    test('update user configuration should trigger change event before promise is resolve', () => {
        const target = sinon.spy();
        disposables.add(testObject.onDidChangeConfiguration(target));
        return testObject.updateValue('configurationService.folder.testSetting', 'value', 2 /* ConfigurationTarget.USER */)
            .then(() => assert.ok(target.called));
    });
    test('update workspace configuration should trigger change event before promise is resolve', () => {
        const target = sinon.spy();
        disposables.add(testObject.onDidChangeConfiguration(target));
        return testObject.updateValue('configurationService.folder.testSetting', 'value', 5 /* ConfigurationTarget.WORKSPACE */)
            .then(() => assert.ok(target.called));
    });
    test('update memory configuration', () => {
        return testObject.updateValue('configurationService.folder.testSetting', 'memoryValue', 8 /* ConfigurationTarget.MEMORY */)
            .then(() => assert.strictEqual(testObject.getValue('configurationService.folder.testSetting'), 'memoryValue'));
    });
    test('update memory configuration should trigger change event before promise is resolve', () => {
        const target = sinon.spy();
        disposables.add(testObject.onDidChangeConfiguration(target));
        return testObject.updateValue('configurationService.folder.testSetting', 'memoryValue', 8 /* ConfigurationTarget.MEMORY */)
            .then(() => assert.ok(target.called));
    });
    test('remove setting from all targets', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const key = 'configurationService.folder.testSetting';
        await testObject.updateValue(key, 'workspaceValue', 5 /* ConfigurationTarget.WORKSPACE */);
        await testObject.updateValue(key, 'userValue', 2 /* ConfigurationTarget.USER */);
        await testObject.updateValue(key, undefined);
        await testObject.reloadConfiguration();
        const actual = testObject.inspect(key, { resource: workspaceService.getWorkspace().folders[0].uri });
        assert.strictEqual(actual.userValue, undefined);
        assert.strictEqual(actual.workspaceValue, undefined);
        assert.strictEqual(actual.workspaceFolderValue, undefined);
    }));
    test('update user configuration to default value when target is not passed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue('configurationService.folder.testSetting', 'value', 2 /* ConfigurationTarget.USER */);
        await testObject.updateValue('configurationService.folder.testSetting', 'isSet');
        assert.strictEqual(testObject.inspect('configurationService.folder.testSetting').userValue, undefined);
    }));
    test('update user configuration to default value when target is passed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue('configurationService.folder.testSetting', 'value', 2 /* ConfigurationTarget.USER */);
        await testObject.updateValue('configurationService.folder.testSetting', 'isSet', 2 /* ConfigurationTarget.USER */);
        assert.strictEqual(testObject.inspect('configurationService.folder.testSetting').userValue, 'isSet');
    }));
    test('update task configuration should trigger change event before promise is resolve', () => {
        const target = sinon.spy();
        disposables.add(testObject.onDidChangeConfiguration(target));
        return testObject.updateValue('tasks', { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }, 5 /* ConfigurationTarget.WORKSPACE */)
            .then(() => assert.ok(target.called));
    });
    test('no change event when there are no global tasks', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const target = sinon.spy();
        disposables.add(testObject.onDidChangeConfiguration(target));
        await timeout(5);
        assert.ok(target.notCalled);
    }));
    test('change event when there are global tasks', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(joinPath(environmentService.userRoamingDataHome, 'tasks.json'), VSBuffer.fromString('{ "version": "1.0.0", "tasks": [{ "taskName": "myTask" }'));
        const promise = Event.toPromise(testObject.onDidChangeConfiguration);
        await testObject.reloadLocalUserConfiguration();
        await promise;
    }));
    test('creating workspace settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.testSetting": "userValue" }'));
        await testObject.reloadConfiguration();
        await new Promise((c, e) => {
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
        const e = await new Promise((c, e) => {
            Event.once(testObject.onDidChangeConfiguration)(c);
            fileService.del(workspaceSettingsResource).catch(e);
        });
        assert.ok(e.affectsConfiguration('configurationService.folder.testSetting'));
        assert.strictEqual(testObject.getValue('configurationService.folder.testSetting'), 'userValue');
    }));
    test('restricted setting is read from workspace when workspace is trusted', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
    test('restricted setting is not read from workspace when workspace is changed to trusted', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
    test('change event is triggered when workspace is changed to untrusted', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
    test('restricted setting is not read from workspace when workspace is not trusted', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
    test('restricted setting is read when workspace is changed to trusted', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
    test('change event is triggered when workspace is changed to trusted', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
    test('remove an unregistered setting', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
    let testObject, workspaceService, fileService, environmentService, userDataProfileService, instantiationService;
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    suiteSetup(() => {
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                [APPLY_ALL_PROFILES_SETTING]: {
                    'type': 'array',
                    'default': [],
                    'scope': 1 /* ConfigurationScope.APPLICATION */,
                },
                'configurationService.profiles.applicationSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 1 /* ConfigurationScope.APPLICATION */
                },
                'configurationService.profiles.applicationMachineSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 3 /* ConfigurationScope.APPLICATION_MACHINE */
                },
                'configurationService.profiles.testSetting': {
                    'type': 'string',
                    'default': 'isSet',
                },
                'configurationService.profiles.applicationSetting2': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 1 /* ConfigurationScope.APPLICATION */
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
        workspaceService = testObject = disposables.add(new WorkspaceService({ configurationCache: new ConfigurationCache() }, environmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, new NullLogService(), disposables.add(new FilePolicyService(environmentService.policyFile, fileService, logService))));
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
    test('initialize', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        assert.strictEqual(testObject.getValue('configurationService.profiles.applicationSetting2'), 'applicationValue');
        assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting2'), 'profileValue');
    }));
    test('inspect', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
    test('update application scope setting', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue('configurationService.profiles.applicationSetting', 'applicationValue');
        assert.deepStrictEqual(JSON.parse((await fileService.readFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource)).value.toString()), { 'configurationService.profiles.applicationSetting': 'applicationValue', 'configurationService.profiles.applicationSetting2': 'applicationValue', 'configurationService.profiles.testSetting2': 'userValue' });
        assert.strictEqual(testObject.getValue('configurationService.profiles.applicationSetting'), 'applicationValue');
    }));
    test('update application machine setting', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue('configurationService.profiles.applicationMachineSetting', 'applicationValue');
        assert.deepStrictEqual(JSON.parse((await fileService.readFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource)).value.toString()), { 'configurationService.profiles.applicationMachineSetting': 'applicationValue', 'configurationService.profiles.applicationSetting2': 'applicationValue', 'configurationService.profiles.testSetting2': 'userValue' });
        assert.strictEqual(testObject.getValue('configurationService.profiles.applicationMachineSetting'), 'applicationValue');
    }));
    test('update normal setting', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue('configurationService.profiles.testSetting', 'profileValue');
        assert.deepStrictEqual(JSON.parse((await fileService.readFile(userDataProfileService.currentProfile.settingsResource)).value.toString()), { 'configurationService.profiles.testSetting': 'profileValue', 'configurationService.profiles.testSetting2': 'profileValue', 'configurationService.profiles.applicationSetting2': 'profileValue' });
        assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting'), 'profileValue');
    }));
    test('registering normal setting after init', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
    test('registering application scope setting after init', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.applicationSetting3": "defaultProfile" }'));
        await testObject.reloadConfiguration();
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                'configurationService.profiles.applicationSetting3': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 1 /* ConfigurationScope.APPLICATION */
                }
            }
        });
        assert.strictEqual(testObject.getValue('configurationService.profiles.applicationSetting3'), 'defaultProfile');
    }));
    test('non registering setting should not be read from default profile', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.nonregistered": "defaultProfile" }'));
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.profiles.nonregistered'), undefined);
    }));
    test('initialize with custom all profiles settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue(APPLY_ALL_PROFILES_SETTING, ['configurationService.profiles.testSetting2'], 3 /* ConfigurationTarget.USER_LOCAL */);
        await testObject.initialize(convertToWorkspacePayload(joinPath(ROOT, 'a')));
        assert.strictEqual(testObject.getValue('configurationService.profiles.applicationSetting2'), 'applicationValue');
        assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting2'), 'userValue');
    }));
    test('update all profiles settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const promise = Event.toPromise(testObject.onDidChangeConfiguration);
        await testObject.updateValue(APPLY_ALL_PROFILES_SETTING, ['configurationService.profiles.testSetting2'], 3 /* ConfigurationTarget.USER_LOCAL */);
        const changeEvent = await promise;
        assert.deepStrictEqual([...changeEvent.affectedKeys], [APPLY_ALL_PROFILES_SETTING, 'configurationService.profiles.testSetting2']);
        assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting2'), 'userValue');
    }));
    test('setting applied to all profiles is registered later', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.testSetting4": "userValue" }'));
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.testSetting4": "profileValue" }'));
        await testObject.updateValue(APPLY_ALL_PROFILES_SETTING, ['configurationService.profiles.testSetting4'], 3 /* ConfigurationTarget.USER_LOCAL */);
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
    test('update setting that is applied to all profiles', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue(APPLY_ALL_PROFILES_SETTING, ['configurationService.profiles.testSetting2'], 3 /* ConfigurationTarget.USER_LOCAL */);
        const promise = Event.toPromise(testObject.onDidChangeConfiguration);
        await testObject.updateValue('configurationService.profiles.testSetting2', 'updatedValue', 3 /* ConfigurationTarget.USER_LOCAL */);
        const changeEvent = await promise;
        assert.deepStrictEqual([...changeEvent.affectedKeys], ['configurationService.profiles.testSetting2']);
        assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting2'), 'updatedValue');
    }));
    test('test isSettingAppliedToAllProfiles', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        assert.strictEqual(testObject.isSettingAppliedForAllProfiles('configurationService.profiles.applicationSetting2'), true);
        assert.strictEqual(testObject.isSettingAppliedForAllProfiles('configurationService.profiles.testSetting2'), false);
        await testObject.updateValue(APPLY_ALL_PROFILES_SETTING, ['configurationService.profiles.testSetting2'], 3 /* ConfigurationTarget.USER_LOCAL */);
        assert.strictEqual(testObject.isSettingAppliedForAllProfiles('configurationService.profiles.testSetting2'), true);
    }));
    test('switch to default profile', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
    test('switch to non default profile', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
    test('switch to non default profile using settings from default profile', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
    test('In non-default profile, changing application settings shall include only application scope settings in the change event', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString('{}'));
        await testObject.reloadConfiguration();
        const promise = Event.toPromise(testObject.onDidChangeConfiguration);
        await fileService.writeFile(instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString('{ "configurationService.profiles.applicationSetting": "applicationValue", "configurationService.profiles.testSetting": "applicationValue" }'));
        const changeEvent = await promise;
        assert.deepStrictEqual([...changeEvent.affectedKeys], ['configurationService.profiles.applicationSetting']);
        assert.strictEqual(testObject.getValue('configurationService.profiles.applicationSetting'), 'applicationValue');
        assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting'), 'isSet');
    }));
    test('switch to default profile with settings applied to all profiles', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue(APPLY_ALL_PROFILES_SETTING, ['configurationService.profiles.testSetting2'], 3 /* ConfigurationTarget.USER_LOCAL */);
        await userDataProfileService.updateCurrentProfile(instantiationService.get(IUserDataProfilesService).defaultProfile);
        assert.strictEqual(testObject.getValue('configurationService.profiles.applicationSetting2'), 'applicationValue');
        assert.strictEqual(testObject.getValue('configurationService.profiles.testSetting2'), 'userValue');
    }));
    test('switch to non default profile with settings applied to all profiles', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue(APPLY_ALL_PROFILES_SETTING, ['configurationService.profiles.testSetting2'], 3 /* ConfigurationTarget.USER_LOCAL */);
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
    test('switch to non default from default profile with settings applied to all profiles', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue(APPLY_ALL_PROFILES_SETTING, ['configurationService.profiles.testSetting2'], 3 /* ConfigurationTarget.USER_LOCAL */);
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
    let workspaceContextService, jsonEditingServce, testObject, fileService, environmentService, userDataProfileService;
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
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
                    scope: 1 /* ConfigurationScope.APPLICATION */
                },
                'configurationService.workspace.machineSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 2 /* ConfigurationScope.MACHINE */
                },
                'configurationService.workspace.machineOverridableSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 7 /* ConfigurationScope.MACHINE_OVERRIDABLE */
                },
                'configurationService.workspace.testResourceSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 5 /* ConfigurationScope.RESOURCE */
                },
                'configurationService.workspace.testLanguageSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */
                },
                'configurationService.workspace.testRestrictedSetting1': {
                    'type': 'string',
                    'default': 'isSet',
                    restricted: true,
                    scope: 5 /* ConfigurationScope.RESOURCE */
                },
                'configurationService.workspace.testRestrictedSetting2': {
                    'type': 'string',
                    'default': 'isSet',
                    restricted: true,
                    scope: 5 /* ConfigurationScope.RESOURCE */
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
        const workspaceService = disposables.add(new WorkspaceService({ configurationCache: new ConfigurationCache() }, environmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, new NullLogService(), new NullPolicyService()));
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
    test('application settings are not read from workspace', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.applicationSetting": "userValue" }'));
        await jsonEditingServce.write(workspaceContextService.getWorkspace().configuration, [{ path: ['settings'], value: { 'configurationService.workspace.applicationSetting': 'workspaceValue' } }], true);
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.workspace.applicationSetting'), 'userValue');
    }));
    test('application settings are not read from workspace when folder is passed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.applicationSetting": "userValue" }'));
        await jsonEditingServce.write(workspaceContextService.getWorkspace().configuration, [{ path: ['settings'], value: { 'configurationService.workspace.applicationSetting': 'workspaceValue' } }], true);
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.workspace.applicationSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');
    }));
    test('machine settings are not read from workspace', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.machineSetting": "userValue" }'));
        await jsonEditingServce.write(workspaceContextService.getWorkspace().configuration, [{ path: ['settings'], value: { 'configurationService.workspace.machineSetting': 'workspaceValue' } }], true);
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.folder.machineSetting'), 'userValue');
    }));
    test('machine settings are not read from workspace when folder is passed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.folder.machineSetting": "userValue" }'));
        await jsonEditingServce.write(workspaceContextService.getWorkspace().configuration, [{ path: ['settings'], value: { 'configurationService.workspace.machineSetting': 'workspaceValue' } }], true);
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.folder.machineSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');
    }));
    test('get application scope settings are not loaded after defaults are registered', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.newSetting": "userValue" }'));
        await jsonEditingServce.write(workspaceContextService.getWorkspace().configuration, [{ path: ['settings'], value: { 'configurationService.workspace.newSetting': 'workspaceValue' } }], true);
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.workspace.newSetting'), 'workspaceValue');
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                'configurationService.workspace.newSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 1 /* ConfigurationScope.APPLICATION */
                }
            }
        });
        assert.strictEqual(testObject.getValue('configurationService.workspace.newSetting'), 'userValue');
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.workspace.newSetting'), 'userValue');
    }));
    test('get application scope settings are not loaded after defaults are registered when workspace folder is passed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.newSetting-2": "userValue" }'));
        await jsonEditingServce.write(workspaceContextService.getWorkspace().configuration, [{ path: ['settings'], value: { 'configurationService.workspace.newSetting-2': 'workspaceValue' } }], true);
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.workspace.newSetting-2', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'workspaceValue');
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                'configurationService.workspace.newSetting-2': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 1 /* ConfigurationScope.APPLICATION */
                }
            }
        });
        assert.strictEqual(testObject.getValue('configurationService.workspace.newSetting-2', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.workspace.newSetting-2', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');
    }));
    test('workspace settings override user settings after defaults are registered for machine overridable settings ', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.newMachineOverridableSetting": "userValue" }'));
        await jsonEditingServce.write(workspaceContextService.getWorkspace().configuration, [{ path: ['settings'], value: { 'configurationService.workspace.newMachineOverridableSetting': 'workspaceValue' } }], true);
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.workspace.newMachineOverridableSetting'), 'workspaceValue');
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                'configurationService.workspace.newMachineOverridableSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 7 /* ConfigurationScope.MACHINE_OVERRIDABLE */
                }
            }
        });
        assert.strictEqual(testObject.getValue('configurationService.workspace.newMachineOverridableSetting'), 'workspaceValue');
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.workspace.newMachineOverridableSetting'), 'workspaceValue');
    }));
    test('application settings are not read from workspace folder', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.applicationSetting": "userValue" }'));
        await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.applicationSetting": "workspaceFolderValue" }'));
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.workspace.applicationSetting'), 'userValue');
    }));
    test('application settings are not read from workspace folder when workspace folder is passed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.applicationSetting": "userValue" }'));
        await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.applicationSetting": "workspaceFolderValue" }'));
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.workspace.applicationSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');
    }));
    test('machine settings are not read from workspace folder', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.machineSetting": "userValue" }'));
        await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.machineSetting": "workspaceFolderValue" }'));
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.workspace.machineSetting'), 'userValue');
    }));
    test('machine settings are not read from workspace folder when workspace folder is passed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.machineSetting": "userValue" }'));
        await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.machineSetting": "workspaceFolderValue" }'));
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.workspace.machineSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');
    }));
    test('application settings are not read from workspace folder after defaults are registered', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
                    scope: 1 /* ConfigurationScope.APPLICATION */
                }
            }
        });
        assert.strictEqual(testObject.getValue('configurationService.workspace.testNewApplicationSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.workspace.testNewApplicationSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');
    }));
    test('machine settings are not read from workspace folder after defaults are registered', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
                    scope: 2 /* ConfigurationScope.MACHINE */
                }
            }
        });
        assert.strictEqual(testObject.getValue('configurationService.workspace.testNewMachineSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.getValue('configurationService.workspace.testNewMachineSetting', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'userValue');
    }));
    test('resource setting in folder is read after it is registered later', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.testNewResourceSetting2": "workspaceFolderValue" }'));
        await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration), [{ path: ['settings'], value: { 'configurationService.workspace.testNewResourceSetting2': 'workspaceValue' } }], true);
        await testObject.reloadConfiguration();
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                'configurationService.workspace.testNewResourceSetting2': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 5 /* ConfigurationScope.RESOURCE */
                }
            }
        });
        assert.strictEqual(testObject.getValue('configurationService.workspace.testNewResourceSetting2', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'workspaceFolderValue');
    }));
    test('resource language setting in folder is read after it is registered later', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.testNewResourceLanguageSetting2": "workspaceFolderValue" }'));
        await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration), [{ path: ['settings'], value: { 'configurationService.workspace.testNewResourceLanguageSetting2': 'workspaceValue' } }], true);
        await testObject.reloadConfiguration();
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                'configurationService.workspace.testNewResourceLanguageSetting2': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */
                }
            }
        });
        assert.strictEqual(testObject.getValue('configurationService.workspace.testNewResourceLanguageSetting2', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'workspaceFolderValue');
    }));
    test('machine overridable setting in folder is read after it is registered later', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(workspaceContextService.getWorkspace().folders[0].toResource('.vscode/settings.json'), VSBuffer.fromString('{ "configurationService.workspace.testNewMachineOverridableSetting2": "workspaceFolderValue" }'));
        await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration), [{ path: ['settings'], value: { 'configurationService.workspace.testNewMachineOverridableSetting2': 'workspaceValue' } }], true);
        await testObject.reloadConfiguration();
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                'configurationService.workspace.testNewMachineOverridableSetting2': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 7 /* ConfigurationScope.MACHINE_OVERRIDABLE */
                }
            }
        });
        assert.strictEqual(testObject.getValue('configurationService.workspace.testNewMachineOverridableSetting2', { resource: workspaceContextService.getWorkspace().folders[0].uri }), 'workspaceFolderValue');
    }));
    test('inspect', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
        await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration), [{ path: ['settings'], value: { 'configurationService.workspace.testResourceSetting': 'workspaceValue' } }], true);
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
    test('inspect restricted settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        testObject.updateWorkspaceTrust(false);
        await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration), [{ path: ['settings'], value: { 'configurationService.workspace.testRestrictedSetting1': 'workspaceRestrictedValue' } }], true);
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
    test('inspect restricted settings after change', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        testObject.updateWorkspaceTrust(false);
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.testRestrictedSetting1": "userRestrictedValue" }'));
        await testObject.reloadConfiguration();
        let promise = Event.toPromise(testObject.onDidChangeConfiguration);
        await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration), [{ path: ['settings'], value: { 'configurationService.workspace.testRestrictedSetting1': 'workspaceRestrictedValue' } }], true);
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
    test('get launch configuration', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
        await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration), [{ path: ['launch'], value: expectedLaunchConfiguration }], true);
        await testObject.reloadConfiguration();
        const actual = testObject.getValue('launch');
        assert.deepStrictEqual(actual, expectedLaunchConfiguration);
    }));
    test('inspect launch configuration', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
        await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration), [{ path: ['launch'], value: expectedLaunchConfiguration }], true);
        await testObject.reloadConfiguration();
        const actual = testObject.inspect('launch').workspaceValue;
        assert.deepStrictEqual(actual, expectedLaunchConfiguration);
    }));
    test('get tasks configuration', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
        await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration), [{ path: ['tasks'], value: expectedTasksConfiguration }], true);
        await testObject.reloadConfiguration();
        const actual = testObject.getValue("tasks" /* TasksSchemaProperties.Tasks */);
        assert.deepStrictEqual(actual, expectedTasksConfiguration);
    }));
    test('inspect tasks configuration', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
        await jsonEditingServce.write(workspaceContextService.getWorkspace().configuration, [{ path: ['tasks'], value: expectedTasksConfiguration }], true);
        await testObject.reloadConfiguration();
        const actual = testObject.inspect('tasks').workspaceValue;
        assert.deepStrictEqual(actual, expectedTasksConfiguration);
    }));
    test('update user configuration', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue('configurationService.workspace.testSetting', 'userValue', 2 /* ConfigurationTarget.USER */);
        assert.strictEqual(testObject.getValue('configurationService.workspace.testSetting'), 'userValue');
    }));
    test('update user configuration should trigger change event before promise is resolve', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const target = sinon.spy();
        disposables.add(testObject.onDidChangeConfiguration(target));
        await testObject.updateValue('configurationService.workspace.testSetting', 'userValue', 2 /* ConfigurationTarget.USER */);
        assert.ok(target.called);
    }));
    test('update workspace configuration', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue('configurationService.workspace.testSetting', 'workspaceValue', 5 /* ConfigurationTarget.WORKSPACE */);
        assert.strictEqual(testObject.getValue('configurationService.workspace.testSetting'), 'workspaceValue');
    }));
    test('update workspace configuration should trigger change event before promise is resolve', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const target = sinon.spy();
        disposables.add(testObject.onDidChangeConfiguration(target));
        await testObject.updateValue('configurationService.workspace.testSetting', 'workspaceValue', 5 /* ConfigurationTarget.WORKSPACE */);
        assert.ok(target.called);
    }));
    test('update application setting into workspace configuration in a workspace is not supported', () => {
        return testObject.updateValue('configurationService.workspace.applicationSetting', 'workspaceValue', {}, 5 /* ConfigurationTarget.WORKSPACE */, { donotNotifyError: true })
            .then(() => assert.fail('Should not be supported'), (e) => assert.strictEqual(e.code, 1 /* ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION */));
    });
    test('update machine setting into workspace configuration in a workspace is not supported', () => {
        return testObject.updateValue('configurationService.workspace.machineSetting', 'workspaceValue', {}, 5 /* ConfigurationTarget.WORKSPACE */, { donotNotifyError: true })
            .then(() => assert.fail('Should not be supported'), (e) => assert.strictEqual(e.code, 2 /* ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE */));
    });
    test('update workspace folder configuration', () => {
        const workspace = workspaceContextService.getWorkspace();
        return testObject.updateValue('configurationService.workspace.testResourceSetting', 'workspaceFolderValue', { resource: workspace.folders[0].uri }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */)
            .then(() => assert.strictEqual(testObject.getValue('configurationService.workspace.testResourceSetting', { resource: workspace.folders[0].uri }), 'workspaceFolderValue'));
    });
    test('update resource language configuration in workspace folder', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const workspace = workspaceContextService.getWorkspace();
        await testObject.updateValue('configurationService.workspace.testLanguageSetting', 'workspaceFolderValue', { resource: workspace.folders[0].uri }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        assert.strictEqual(testObject.getValue('configurationService.workspace.testLanguageSetting', { resource: workspace.folders[0].uri }), 'workspaceFolderValue');
    }));
    test('update workspace folder configuration should trigger change event before promise is resolve', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const workspace = workspaceContextService.getWorkspace();
        const target = sinon.spy();
        disposables.add(testObject.onDidChangeConfiguration(target));
        await testObject.updateValue('configurationService.workspace.testResourceSetting', 'workspaceFolderValue', { resource: workspace.folders[0].uri }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        assert.ok(target.called);
    }));
    test('update workspace folder configuration second time should trigger change event before promise is resolve', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const workspace = workspaceContextService.getWorkspace();
        await testObject.updateValue('configurationService.workspace.testResourceSetting', 'workspaceFolderValue', { resource: workspace.folders[0].uri }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        const target = sinon.spy();
        disposables.add(testObject.onDidChangeConfiguration(target));
        await testObject.updateValue('configurationService.workspace.testResourceSetting', 'workspaceFolderValue2', { resource: workspace.folders[0].uri }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        assert.ok(target.called);
    }));
    test('update machine overridable setting in folder', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const workspace = workspaceContextService.getWorkspace();
        await testObject.updateValue('configurationService.workspace.machineOverridableSetting', 'workspaceFolderValue', { resource: workspace.folders[0].uri }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        assert.strictEqual(testObject.getValue('configurationService.workspace.machineOverridableSetting', { resource: workspace.folders[0].uri }), 'workspaceFolderValue');
    }));
    test('update memory configuration', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await testObject.updateValue('configurationService.workspace.testSetting', 'memoryValue', 8 /* ConfigurationTarget.MEMORY */);
        assert.strictEqual(testObject.getValue('configurationService.workspace.testSetting'), 'memoryValue');
    }));
    test('update memory configuration should trigger change event before promise is resolve', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const target = sinon.spy();
        disposables.add(testObject.onDidChangeConfiguration(target));
        await testObject.updateValue('configurationService.workspace.testSetting', 'memoryValue', 8 /* ConfigurationTarget.MEMORY */);
        assert.ok(target.called);
    }));
    test('remove setting from all targets', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const workspace = workspaceContextService.getWorkspace();
        const key = 'configurationService.workspace.testResourceSetting';
        await testObject.updateValue(key, 'workspaceFolderValue', { resource: workspace.folders[0].uri }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        await testObject.updateValue(key, 'workspaceValue', 5 /* ConfigurationTarget.WORKSPACE */);
        await testObject.updateValue(key, 'userValue', 2 /* ConfigurationTarget.USER */);
        await testObject.updateValue(key, undefined, { resource: workspace.folders[0].uri });
        await testObject.reloadConfiguration();
        const actual = testObject.inspect(key, { resource: workspace.folders[0].uri });
        assert.strictEqual(actual.userValue, undefined);
        assert.strictEqual(actual.workspaceValue, undefined);
        assert.strictEqual(actual.workspaceFolderValue, undefined);
    }));
    test('update tasks configuration in a folder', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const workspace = workspaceContextService.getWorkspace();
        await testObject.updateValue('tasks', { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] }, { resource: workspace.folders[0].uri }, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        assert.deepStrictEqual(testObject.getValue("tasks" /* TasksSchemaProperties.Tasks */, { resource: workspace.folders[0].uri }), { 'version': '1.0.0', tasks: [{ 'taskName': 'myTask' }] });
    }));
    test('update launch configuration in a workspace', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const workspace = workspaceContextService.getWorkspace();
        await testObject.updateValue('launch', { 'version': '1.0.0', configurations: [{ 'name': 'myLaunch' }] }, { resource: workspace.folders[0].uri }, 5 /* ConfigurationTarget.WORKSPACE */, { donotNotifyError: true });
        assert.deepStrictEqual(testObject.getValue('launch'), { 'version': '1.0.0', configurations: [{ 'name': 'myLaunch' }] });
    }));
    test('update tasks configuration in a workspace', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const workspace = workspaceContextService.getWorkspace();
        const tasks = { 'version': '2.0.0', tasks: [{ 'label': 'myTask' }] };
        await testObject.updateValue('tasks', tasks, { resource: workspace.folders[0].uri }, 5 /* ConfigurationTarget.WORKSPACE */, { donotNotifyError: true });
        assert.deepStrictEqual(testObject.getValue("tasks" /* TasksSchemaProperties.Tasks */), tasks);
    }));
    test('configuration of newly added folder is available on configuration change event', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const workspaceService = testObject;
        const uri = workspaceService.getWorkspace().folders[1].uri;
        await workspaceService.removeFolders([uri]);
        await fileService.writeFile(joinPath(uri, '.vscode', 'settings.json'), VSBuffer.fromString('{ "configurationService.workspace.testResourceSetting": "workspaceFolderValue" }'));
        return new Promise((c, e) => {
            disposables.add(testObject.onDidChangeConfiguration(() => {
                try {
                    assert.strictEqual(testObject.getValue('configurationService.workspace.testResourceSetting', { resource: uri }), 'workspaceFolderValue');
                    c();
                }
                catch (error) {
                    e(error);
                }
            }));
            workspaceService.addFolders([{ uri }]);
        });
    }));
    test('restricted setting is read from workspace folders when workspace is trusted', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        testObject.updateWorkspaceTrust(true);
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.testRestrictedSetting1": "userValue", "configurationService.workspace.testRestrictedSetting2": "userValue" }'));
        await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration), [{ path: ['settings'], value: { 'configurationService.workspace.testRestrictedSetting1': 'workspaceValue' } }], true);
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
    test('restricted setting is not read from workspace when workspace is not trusted', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        testObject.updateWorkspaceTrust(false);
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.testRestrictedSetting1": "userValue", "configurationService.workspace.testRestrictedSetting2": "userValue" }'));
        await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration), [{ path: ['settings'], value: { 'configurationService.workspace.testRestrictedSetting1': 'workspaceValue' } }], true);
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
    test('remove an unregistered setting', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const key = 'configurationService.workspace.unknownSetting';
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.workspace.unknownSetting": "userValue" }'));
        await jsonEditingServce.write((workspaceContextService.getWorkspace().configuration), [{ path: ['settings'], value: { 'configurationService.workspace.unknownSetting': 'workspaceValue' } }], true);
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
    let testObject, folder, machineSettingsResource, remoteSettingsResource, fileSystemProvider, resolveRemoteEnvironment, instantiationService, fileService, environmentService, userDataProfileService;
    const remoteAuthority = 'configuraiton-tests';
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    suiteSetup(() => {
        configurationRegistry.registerConfiguration({
            'id': '_test',
            'type': 'object',
            'properties': {
                'configurationService.remote.applicationSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 1 /* ConfigurationScope.APPLICATION */
                },
                'configurationService.remote.machineSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 2 /* ConfigurationScope.MACHINE */
                },
                'configurationService.remote.applicationMachineSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 3 /* ConfigurationScope.APPLICATION_MACHINE */
                },
                'configurationService.remote.machineOverridableSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 7 /* ConfigurationScope.MACHINE_OVERRIDABLE */
                },
                'configurationService.remote.testSetting': {
                    'type': 'string',
                    'default': 'isSet',
                    scope: 5 /* ConfigurationScope.RESOURCE */
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
        const remoteEnvironmentPromise = new Promise(c => resolveRemoteEnvironment = () => c({ settingsPath: remoteSettingsResource }));
        const remoteAgentService = instantiationService.stub(IRemoteAgentService, { getEnvironment: () => remoteEnvironmentPromise });
        const configurationCache = { read: () => Promise.resolve(''), write: () => Promise.resolve(), remove: () => Promise.resolve(), needsCaching: () => false };
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
    async function initialize() {
        await testObject.initialize(convertToWorkspacePayload(folder));
        instantiationService.stub(ITextFileService, disposables.add(instantiationService.createInstance(TestTextFileService)));
        instantiationService.stub(ITextModelService, disposables.add(instantiationService.createInstance(TextModelResolverService)));
        instantiationService.stub(IJSONEditingService, instantiationService.createInstance(JSONEditingService));
        testObject.acquireInstantiationService(instantiationService);
    }
    function registerRemoteFileSystemProvider() {
        disposables.add(instantiationService.get(IFileService).registerProvider(Schemas.vscodeRemote, new RemoteFileSystemProvider(fileSystemProvider, remoteAuthority)));
    }
    function registerRemoteFileSystemProviderOnActivation() {
        const disposable = disposables.add(instantiationService.get(IFileService).onWillActivateFileSystemProvider(e => {
            if (e.scheme === Schemas.vscodeRemote) {
                disposable.dispose();
                e.join(Promise.resolve().then(() => registerRemoteFileSystemProvider()));
            }
        }));
    }
    test('remote machine settings override globals', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(machineSettingsResource, VSBuffer.fromString('{ "configurationService.remote.machineSetting": "remoteValue" }'));
        registerRemoteFileSystemProvider();
        resolveRemoteEnvironment();
        await initialize();
        assert.strictEqual(testObject.getValue('configurationService.remote.machineSetting'), 'remoteValue');
    }));
    test('remote machine settings override globals after remote provider is registered on activation', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(machineSettingsResource, VSBuffer.fromString('{ "configurationService.remote.machineSetting": "remoteValue" }'));
        resolveRemoteEnvironment();
        registerRemoteFileSystemProviderOnActivation();
        await initialize();
        assert.strictEqual(testObject.getValue('configurationService.remote.machineSetting'), 'remoteValue');
    }));
    test('remote machine settings override globals after remote environment is resolved', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(machineSettingsResource, VSBuffer.fromString('{ "configurationService.remote.machineSetting": "remoteValue" }'));
        registerRemoteFileSystemProvider();
        await initialize();
        const promise = new Promise((c, e) => {
            disposables.add(testObject.onDidChangeConfiguration(event => {
                try {
                    assert.strictEqual(event.source, 2 /* ConfigurationTarget.USER */);
                    assert.deepStrictEqual([...event.affectedKeys], ['configurationService.remote.machineSetting']);
                    assert.strictEqual(testObject.getValue('configurationService.remote.machineSetting'), 'remoteValue');
                    c();
                }
                catch (error) {
                    e(error);
                }
            }));
        });
        resolveRemoteEnvironment();
        return promise;
    }));
    test('remote settings override globals after remote provider is registered on activation and remote environment is resolved', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(machineSettingsResource, VSBuffer.fromString('{ "configurationService.remote.machineSetting": "remoteValue" }'));
        registerRemoteFileSystemProviderOnActivation();
        await initialize();
        const promise = new Promise((c, e) => {
            disposables.add(testObject.onDidChangeConfiguration(event => {
                try {
                    assert.strictEqual(event.source, 2 /* ConfigurationTarget.USER */);
                    assert.deepStrictEqual([...event.affectedKeys], ['configurationService.remote.machineSetting']);
                    assert.strictEqual(testObject.getValue('configurationService.remote.machineSetting'), 'remoteValue');
                    c();
                }
                catch (error) {
                    e(error);
                }
            }));
        });
        resolveRemoteEnvironment();
        return promise;
    }));
    test('machine settings in local user settings does not override defaults', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.remote.machineSetting": "globalValue" }'));
        registerRemoteFileSystemProvider();
        resolveRemoteEnvironment();
        await initialize();
        assert.strictEqual(testObject.getValue('configurationService.remote.machineSetting'), 'isSet');
    }));
    test('remote application machine settings override globals', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(machineSettingsResource, VSBuffer.fromString('{ "configurationService.remote.applicationMachineSetting": "remoteValue" }'));
        registerRemoteFileSystemProvider();
        resolveRemoteEnvironment();
        await initialize();
        assert.strictEqual(testObject.getValue('configurationService.remote.applicationMachineSetting'), 'remoteValue');
    }));
    test('remote application machine settings override globals after remote provider is registered on activation', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(machineSettingsResource, VSBuffer.fromString('{ "configurationService.remote.applicationMachineSetting": "remoteValue" }'));
        resolveRemoteEnvironment();
        registerRemoteFileSystemProviderOnActivation();
        await initialize();
        assert.strictEqual(testObject.getValue('configurationService.remote.applicationMachineSetting'), 'remoteValue');
    }));
    test('remote application machine settings override globals after remote environment is resolved', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(machineSettingsResource, VSBuffer.fromString('{ "configurationService.remote.applicationMachineSetting": "remoteValue" }'));
        registerRemoteFileSystemProvider();
        await initialize();
        const promise = new Promise((c, e) => {
            disposables.add(testObject.onDidChangeConfiguration(event => {
                try {
                    assert.strictEqual(event.source, 2 /* ConfigurationTarget.USER */);
                    assert.deepStrictEqual([...event.affectedKeys], ['configurationService.remote.applicationMachineSetting']);
                    assert.strictEqual(testObject.getValue('configurationService.remote.applicationMachineSetting'), 'remoteValue');
                    c();
                }
                catch (error) {
                    e(error);
                }
            }));
        });
        resolveRemoteEnvironment();
        return promise;
    }));
    test('remote application machine settings override globals after remote provider is registered on activation and remote environment is resolved', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(machineSettingsResource, VSBuffer.fromString('{ "configurationService.remote.applicationMachineSetting": "remoteValue" }'));
        registerRemoteFileSystemProviderOnActivation();
        await initialize();
        const promise = new Promise((c, e) => {
            disposables.add(testObject.onDidChangeConfiguration(event => {
                try {
                    assert.strictEqual(event.source, 2 /* ConfigurationTarget.USER */);
                    assert.deepStrictEqual([...event.affectedKeys], ['configurationService.remote.applicationMachineSetting']);
                    assert.strictEqual(testObject.getValue('configurationService.remote.applicationMachineSetting'), 'remoteValue');
                    c();
                }
                catch (error) {
                    e(error);
                }
            }));
        });
        resolveRemoteEnvironment();
        return promise;
    }));
    test('application machine settings in local user settings does not override defaults', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.remote.applicationMachineSetting": "globalValue" }'));
        registerRemoteFileSystemProvider();
        resolveRemoteEnvironment();
        await initialize();
        assert.strictEqual(testObject.getValue('configurationService.remote.applicationMachineSetting'), 'isSet');
    }));
    test('machine overridable settings in local user settings does not override defaults', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "configurationService.remote.machineOverridableSetting": "globalValue" }'));
        registerRemoteFileSystemProvider();
        resolveRemoteEnvironment();
        await initialize();
        assert.strictEqual(testObject.getValue('configurationService.remote.machineOverridableSetting'), 'isSet');
    }));
    test('non machine setting is written in local settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        registerRemoteFileSystemProvider();
        resolveRemoteEnvironment();
        await initialize();
        await testObject.updateValue('configurationService.remote.applicationSetting', 'applicationValue');
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.inspect('configurationService.remote.applicationSetting').userLocalValue, 'applicationValue');
    }));
    test('machine setting is written in remote settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        registerRemoteFileSystemProvider();
        resolveRemoteEnvironment();
        await initialize();
        await testObject.updateValue('configurationService.remote.machineSetting', 'machineValue');
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.inspect('configurationService.remote.machineSetting').userRemoteValue, 'machineValue');
    }));
    test('application machine setting is written in remote settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        registerRemoteFileSystemProvider();
        resolveRemoteEnvironment();
        await initialize();
        await testObject.updateValue('configurationService.remote.applicationMachineSetting', 'machineValue');
        await testObject.reloadConfiguration();
        const actual = testObject.inspect('configurationService.remote.applicationMachineSetting');
        assert.strictEqual(actual.userRemoteValue, 'machineValue');
    }));
    test('machine overridable setting is written in remote settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        registerRemoteFileSystemProvider();
        resolveRemoteEnvironment();
        await initialize();
        await testObject.updateValue('configurationService.remote.machineOverridableSetting', 'machineValue');
        await testObject.reloadConfiguration();
        assert.strictEqual(testObject.inspect('configurationService.remote.machineOverridableSetting').userRemoteValue, 'machineValue');
    }));
    test('machine settings in local user settings does not override defaults after defalts are registered ', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
                    scope: 2 /* ConfigurationScope.MACHINE */
                }
            }
        });
        assert.strictEqual(testObject.getValue('configurationService.remote.newMachineSetting'), 'isSet');
    }));
    test('machine overridable settings in local user settings does not override defaults after defaults are registered ', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
                    scope: 7 /* ConfigurationScope.MACHINE_OVERRIDABLE */
                }
            }
        });
        assert.strictEqual(testObject.getValue('configurationService.remote.newMachineOverridableSetting'), 'isSet');
    }));
});
function getWorkspaceId(configPath) {
    let workspaceConfigPath = configPath.toString();
    if (!isLinux) {
        workspaceConfigPath = workspaceConfigPath.toLowerCase(); // sanitize for platform file system
    }
    return hash(workspaceConfigPath).toString(16);
}
function getWorkspaceIdentifier(configPath) {
    return {
        configPath,
        id: getWorkspaceId(configPath)
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvblNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL3Rlc3QvYnJvd3Nlci9jb25maWd1cmF0aW9uU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssS0FBSyxNQUFNLE9BQU8sQ0FBQztBQUMvQixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ2hHLE9BQU8sRUFBMEIsVUFBVSxJQUFJLHVCQUF1QixFQUFzQiwwQkFBMEIsRUFBRSxNQUFNLHVFQUF1RSxDQUFDO0FBQ3RNLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRXpFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUsd0JBQXdCLEVBQXdHLE1BQU0sdURBQXVELENBQUM7QUFDdk0sT0FBTyxFQUF1QixxQkFBcUIsRUFBNkIsTUFBTSwrREFBK0QsQ0FBQztBQUN0SixPQUFPLEVBQUUsNkJBQTZCLEVBQUUsd0JBQXdCLEVBQUUsc0JBQXNCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUV6SyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM3RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztB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