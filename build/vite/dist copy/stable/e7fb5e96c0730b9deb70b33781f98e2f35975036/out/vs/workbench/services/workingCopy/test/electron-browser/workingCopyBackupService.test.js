/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { isWindows } from '../../../../../base/common/platform.js';
import { insert } from '../../../../../base/common/arrays.js';
import { hash } from '../../../../../base/common/hash.js';
import { isEqual, joinPath, dirname } from '../../../../../base/common/resources.js';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { WorkingCopyBackupsModel, hashIdentifier } from '../../common/workingCopyBackupService.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { Schemas } from '../../../../../base/common/network.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { LogLevel, NullLogService } from '../../../../../platform/log/common/log.js';
import { NativeWorkbenchEnvironmentService } from '../../../environment/electron-browser/environmentService.js';
import { toBufferOrReadable } from '../../../textfile/common/textfiles.js';
import { NativeWorkingCopyBackupService } from '../../electron-browser/workingCopyBackupService.js';
import { FileUserDataProvider } from '../../../../../platform/userData/common/fileUserDataProvider.js';
import { bufferToReadable, bufferToStream, streamToBuffer, VSBuffer } from '../../../../../base/common/buffer.js';
import { TestLifecycleService, toTypedWorkingCopyId, toUntypedWorkingCopyId } from '../../../../test/browser/workbenchTestServices.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { consumeStream } from '../../../../../base/common/stream.js';
import { TestProductService } from '../../../../test/common/workbenchTestServices.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import product from '../../../../../platform/product/common/product.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { UserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
const homeDir = URI.file('home').with({ scheme: Schemas.inMemory });
const tmpDir = URI.file('tmp').with({ scheme: Schemas.inMemory });
const NULL_PROFILE = {
    name: '',
    id: '',
    shortName: '',
    isDefault: false,
    location: homeDir,
    settingsResource: joinPath(homeDir, 'settings.json'),
    globalStorageHome: joinPath(homeDir, 'globalStorage'),
    keybindingsResource: joinPath(homeDir, 'keybindings.json'),
    tasksResource: joinPath(homeDir, 'tasks.json'),
    mcpResource: joinPath(homeDir, 'mcp.json'),
    snippetsHome: joinPath(homeDir, 'snippets'),
    promptsHome: joinPath(homeDir, 'prompts'),
    extensionsResource: joinPath(homeDir, 'extensions.json'),
    cacheHome: joinPath(homeDir, 'cache')
};
const TestNativeWindowConfiguration = {
    windowId: 0,
    machineId: 'testMachineId',
    sqmId: 'testSqmId',
    devDeviceId: 'testdevDeviceId',
    isPortable: false,
    logLevel: LogLevel.Error,
    loggers: [],
    mainPid: 0,
    appRoot: '',
    userEnv: {},
    execPath: process.execPath,
    perfMarks: [],
    colorScheme: { dark: true, highContrast: false },
    os: { release: 'unknown', hostname: 'unknown', arch: 'unknown' },
    product,
    homeDir: homeDir.fsPath,
    tmpDir: tmpDir.fsPath,
    userDataDir: joinPath(homeDir, product.nameShort).fsPath,
    profiles: { profile: NULL_PROFILE, all: [NULL_PROFILE], home: homeDir },
    nls: {
        messages: [],
        language: 'en'
    },
    _: []
};
export class TestNativeWorkbenchEnvironmentService extends NativeWorkbenchEnvironmentService {
    constructor(testDir, backupPath) {
        super({ ...TestNativeWindowConfiguration, backupPath: backupPath.fsPath, 'user-data-dir': testDir.fsPath }, TestProductService);
    }
}
export class NodeTestWorkingCopyBackupService extends NativeWorkingCopyBackupService {
    constructor(testDir, workspaceBackupPath) {
        const environmentService = new TestNativeWorkbenchEnvironmentService(testDir, workspaceBackupPath);
        const logService = new NullLogService();
        const fileService = new FileService(logService);
        const lifecycleService = new TestLifecycleService();
        super(environmentService, fileService, logService, lifecycleService);
        const fsp = new InMemoryFileSystemProvider();
        fileService.registerProvider(Schemas.inMemory, fsp);
        const uriIdentityService = new UriIdentityService(fileService);
        const userDataProfilesService = new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService);
        fileService.registerProvider(Schemas.vscodeUserData, new FileUserDataProvider(Schemas.file, fsp, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, logService));
        this._fileService = fileService;
        this.backupResourceJoiners = [];
        this.discardBackupJoiners = [];
        this.discardedBackups = [];
        this.pendingBackupsArr = [];
        this.discardedAllBackups = false;
    }
    testGetFileService() {
        return this.fileService;
    }
    async waitForAllBackups() {
        await Promise.all(this.pendingBackupsArr);
    }
    joinBackupResource() {
        return new Promise(resolve => this.backupResourceJoiners.push(resolve));
    }
    async backup(identifier, content, versionId, meta, token) {
        const p = super.backup(identifier, content, versionId, meta, token);
        const removeFromPendingBackups = insert(this.pendingBackupsArr, p.then(undefined, undefined));
        try {
            await p;
        }
        finally {
            removeFromPendingBackups();
        }
        while (this.backupResourceJoiners.length) {
            this.backupResourceJoiners.pop()();
        }
    }
    joinDiscardBackup() {
        return new Promise(resolve => this.discardBackupJoiners.push(resolve));
    }
    async discardBackup(identifier) {
        await super.discardBackup(identifier);
        this.discardedBackups.push(identifier);
        while (this.discardBackupJoiners.length) {
            this.discardBackupJoiners.pop()();
        }
    }
    async discardBackups(filter) {
        this.discardedAllBackups = true;
        return super.discardBackups(filter);
    }
    async getBackupContents(identifier) {
        const backupResource = this.toBackupResource(identifier);
        const fileContents = await this.fileService.readFile(backupResource);
        return fileContents.value.toString();
    }
}
suite('WorkingCopyBackupService', () => {
    let testDir;
    let backupHome;
    let workspacesJsonPath;
    let workspaceBackupPath;
    let service;
    let fileService;
    const disposables = new DisposableStore();
    const workspaceResource = URI.file(isWindows ? 'c:\\workspace' : '/workspace');
    const fooFile = URI.file(isWindows ? 'c:\\Foo' : '/Foo');
    const customFile = URI.parse('customScheme://some/path');
    const customFileWithFragment = URI.parse('customScheme2://some/path#fragment');
    const barFile = URI.file(isWindows ? 'c:\\Bar' : '/Bar');
    const fooBarFile = URI.file(isWindows ? 'c:\\Foo Bar' : '/Foo Bar');
    const untitledFile = URI.from({ scheme: Schemas.untitled, path: 'Untitled-1' });
    setup(async () => {
        testDir = URI.file(join(generateUuid(), 'vsctests', 'workingcopybackupservice')).with({ scheme: Schemas.inMemory });
        backupHome = joinPath(testDir, 'Backups');
        workspacesJsonPath = joinPath(backupHome, 'workspaces.json');
        workspaceBackupPath = joinPath(backupHome, hash(workspaceResource.fsPath).toString(16));
        service = disposables.add(new NodeTestWorkingCopyBackupService(testDir, workspaceBackupPath));
        fileService = service._fileService;
        await fileService.createFolder(backupHome);
        return fileService.writeFile(workspacesJsonPath, VSBuffer.fromString(''));
    });
    teardown(() => {
        disposables.clear();
    });
    suite('hashIdentifier', () => {
        test('should correctly hash the identifier for untitled scheme URIs', () => {
            const uri = URI.from({ scheme: Schemas.untitled, path: 'Untitled-1' });
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            // If these hashes change people will lose their backed up files
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            const untypedBackupHash = hashIdentifier(toUntypedWorkingCopyId(uri));
            assert.strictEqual(untypedBackupHash, '-7f9c1a2e');
            assert.strictEqual(untypedBackupHash, hash(uri.fsPath).toString(16));
            const typedBackupHash = hashIdentifier({ typeId: 'hashTest', resource: uri });
            if (isWindows) {
                assert.strictEqual(typedBackupHash, '-17c47cdc');
            }
            else {
                assert.strictEqual(typedBackupHash, '-8ad5f4f');
            }
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            // If these hashes collide people will lose their backed up files
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            assert.notStrictEqual(untypedBackupHash, typedBackupHash);
        });
        test('should correctly hash the identifier for file scheme URIs', () => {
            const uri = URI.file('/foo');
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            // If these hashes change people will lose their backed up files
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            const untypedBackupHash = hashIdentifier(toUntypedWorkingCopyId(uri));
            if (isWindows) {
                assert.strictEqual(untypedBackupHash, '20ffaa13');
            }
            else {
                assert.strictEqual(untypedBackupHash, '20eb3560');
            }
            assert.strictEqual(untypedBackupHash, hash(uri.fsPath).toString(16));
            const typedBackupHash = hashIdentifier({ typeId: 'hashTest', resource: uri });
            if (isWindows) {
                assert.strictEqual(typedBackupHash, '-55fc55db');
            }
            else {
                assert.strictEqual(typedBackupHash, '51e56bf');
            }
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            // If these hashes collide people will lose their backed up files
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            assert.notStrictEqual(untypedBackupHash, typedBackupHash);
        });
        test('should correctly hash the identifier for custom scheme URIs', () => {
            const uri = URI.from({
                scheme: 'vscode-custom',
                path: 'somePath'
            });
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            // If these hashes change people will lose their backed up files
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            const untypedBackupHash = hashIdentifier(toUntypedWorkingCopyId(uri));
            assert.strictEqual(untypedBackupHash, '-44972d98');
            assert.strictEqual(untypedBackupHash, hash(uri.toString()).toString(16));
            const typedBackupHash = hashIdentifier({ typeId: 'hashTest', resource: uri });
            assert.strictEqual(typedBackupHash, '502149c7');
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            // If these hashes collide people will lose their backed up files
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            assert.notStrictEqual(untypedBackupHash, typedBackupHash);
        });
        test('should not fail for URIs without path', () => {
            const uri = URI.from({
                scheme: 'vscode-fragment',
                fragment: 'frag'
            });
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            // If these hashes change people will lose their backed up files
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            const untypedBackupHash = hashIdentifier(toUntypedWorkingCopyId(uri));
            assert.strictEqual(untypedBackupHash, '-2f6b2f1b');
            assert.strictEqual(untypedBackupHash, hash(uri.toString()).toString(16));
            const typedBackupHash = hashIdentifier({ typeId: 'hashTest', resource: uri });
            assert.strictEqual(typedBackupHash, '6e82ca57');
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            // If these hashes collide people will lose their backed up files
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            assert.notStrictEqual(untypedBackupHash, typedBackupHash);
        });
    });
    suite('getBackupResource', () => {
        test('should get the correct backup path for text files', () => {
            // Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
            const backupResource = fooFile;
            const workspaceHash = hash(workspaceResource.fsPath).toString(16);
            // No Type ID
            let backupId = toUntypedWorkingCopyId(backupResource);
            let filePathHash = hashIdentifier(backupId);
            let expectedPath = joinPath(backupHome, workspaceHash, Schemas.file, filePathHash).with({ scheme: Schemas.vscodeUserData }).toString();
            assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);
            // With Type ID
            backupId = toTypedWorkingCopyId(backupResource);
            filePathHash = hashIdentifier(backupId);
            expectedPath = joinPath(backupHome, workspaceHash, Schemas.file, filePathHash).with({ scheme: Schemas.vscodeUserData }).toString();
            assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);
        });
        test('should get the correct backup path for untitled files', () => {
            // Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
            const backupResource = URI.from({ scheme: Schemas.untitled, path: 'Untitled-1' });
            const workspaceHash = hash(workspaceResource.fsPath).toString(16);
            // No Type ID
            let backupId = toUntypedWorkingCopyId(backupResource);
            let filePathHash = hashIdentifier(backupId);
            let expectedPath = joinPath(backupHome, workspaceHash, Schemas.untitled, filePathHash).with({ scheme: Schemas.vscodeUserData }).toString();
            assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);
            // With Type ID
            backupId = toTypedWorkingCopyId(backupResource);
            filePathHash = hashIdentifier(backupId);
            expectedPath = joinPath(backupHome, workspaceHash, Schemas.untitled, filePathHash).with({ scheme: Schemas.vscodeUserData }).toString();
            assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);
        });
        test('should get the correct backup path for custom files', () => {
            // Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
            const backupResource = URI.from({ scheme: 'custom', path: 'custom/file.txt' });
            const workspaceHash = hash(workspaceResource.fsPath).toString(16);
            // No Type ID
            let backupId = toUntypedWorkingCopyId(backupResource);
            let filePathHash = hashIdentifier(backupId);
            let expectedPath = joinPath(backupHome, workspaceHash, 'custom', filePathHash).with({ scheme: Schemas.vscodeUserData }).toString();
            assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);
            // With Type ID
            backupId = toTypedWorkingCopyId(backupResource);
            filePathHash = hashIdentifier(backupId);
            expectedPath = joinPath(backupHome, workspaceHash, 'custom', filePathHash).with({ scheme: Schemas.vscodeUserData }).toString();
            assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);
        });
    });
    suite('backup', () => {
        function toExpectedPreamble(identifier, content = '', meta) {
            return `${identifier.resource.toString()} ${JSON.stringify({ ...meta, typeId: identifier.typeId })}\n${content}`;
        }
        test('joining', async () => {
            let backupJoined = false;
            const joinBackupsPromise = service.joinBackups();
            joinBackupsPromise.then(() => backupJoined = true);
            await joinBackupsPromise;
            assert.strictEqual(backupJoined, true);
            backupJoined = false;
            service.joinBackups().then(() => backupJoined = true);
            const identifier = toUntypedWorkingCopyId(fooFile);
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            const backupPromise = service.backup(identifier);
            assert.strictEqual(backupJoined, false);
            await backupPromise;
            assert.strictEqual(backupJoined, true);
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
            assert.strictEqual((await fileService.exists(backupPath)), true);
            assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier));
            assert.ok(service.hasBackupSync(identifier));
        });
        test('no text', async () => {
            const identifier = toUntypedWorkingCopyId(fooFile);
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            await service.backup(identifier);
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
            assert.strictEqual((await fileService.exists(backupPath)), true);
            assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier));
            assert.ok(service.hasBackupSync(identifier));
        });
        test('text file', async () => {
            const identifier = toUntypedWorkingCopyId(fooFile);
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            await service.backup(identifier, bufferToReadable(VSBuffer.fromString('test')));
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
            assert.strictEqual((await fileService.exists(backupPath)), true);
            assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, 'test'));
            assert.ok(service.hasBackupSync(identifier));
        });
        test('text file (with version)', async () => {
            const identifier = toUntypedWorkingCopyId(fooFile);
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            await service.backup(identifier, bufferToReadable(VSBuffer.fromString('test')), 666);
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
            assert.strictEqual((await fileService.exists(backupPath)), true);
            assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, 'test'));
            assert.ok(!service.hasBackupSync(identifier, 555));
            assert.ok(service.hasBackupSync(identifier, 666));
        });
        test('text file (with meta)', async () => {
            const identifier = toUntypedWorkingCopyId(fooFile);
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            const meta = { etag: '678', orphaned: true };
            await service.backup(identifier, bufferToReadable(VSBuffer.fromString('test')), undefined, meta);
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
            assert.strictEqual((await fileService.exists(backupPath)), true);
            assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, 'test', meta));
            assert.ok(service.hasBackupSync(identifier));
        });
        test('text file with whitespace in name and type (with meta)', async () => {
            const fileWithSpace = URI.file(isWindows ? 'c:\\Foo \n Bar' : '/Foo \n Bar');
            const identifier = toTypedWorkingCopyId(fileWithSpace, ' test id \n');
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            const meta = { etag: '678 \n k', orphaned: true };
            await service.backup(identifier, bufferToReadable(VSBuffer.fromString('test')), undefined, meta);
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
            assert.strictEqual((await fileService.exists(backupPath)), true);
            assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, 'test', meta));
            assert.ok(service.hasBackupSync(identifier));
        });
        test('text file with unicode character in name and type (with meta)', async () => {
            const fileWithUnicode = URI.file(isWindows ? 'c:\\so𒀅meࠄ' : '/so𒀅meࠄ');
            const identifier = toTypedWorkingCopyId(fileWithUnicode, ' test so𒀅meࠄ id \n');
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            const meta = { etag: '678so𒀅meࠄ', orphaned: true };
            await service.backup(identifier, bufferToReadable(VSBuffer.fromString('test')), undefined, meta);
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
            assert.strictEqual((await fileService.exists(backupPath)), true);
            assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, 'test', meta));
            assert.ok(service.hasBackupSync(identifier));
        });
        test('untitled file', async () => {
            const identifier = toUntypedWorkingCopyId(untitledFile);
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            await service.backup(identifier, bufferToReadable(VSBuffer.fromString('test')));
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'untitled'))).children?.length, 1);
            assert.strictEqual((await fileService.exists(backupPath)), true);
            assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, 'test'));
            assert.ok(service.hasBackupSync(identifier));
        });
        test('text file (readable)', async () => {
            const identifier = toUntypedWorkingCopyId(fooFile);
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            const model = createTextModel('test');
            await service.backup(identifier, toBufferOrReadable(model.createSnapshot()));
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
            assert.strictEqual((await fileService.exists(backupPath)), true);
            assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, 'test'));
            assert.ok(service.hasBackupSync(identifier));
            model.dispose();
        });
        test('untitled file (readable)', async () => {
            const identifier = toUntypedWorkingCopyId(untitledFile);
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            const model = createTextModel('test');
            await service.backup(identifier, toBufferOrReadable(model.createSnapshot()));
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'untitled'))).children?.length, 1);
            assert.strictEqual((await fileService.exists(backupPath)), true);
            assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, 'test'));
            model.dispose();
        });
        test('text file (large file, stream)', () => {
            const largeString = (new Array(30 * 1024)).join('Large String\n');
            return testLargeTextFile(largeString, bufferToStream(VSBuffer.fromString(largeString)));
        });
        test('text file (large file, readable)', async () => {
            const largeString = (new Array(30 * 1024)).join('Large String\n');
            const model = createTextModel(largeString);
            await testLargeTextFile(largeString, toBufferOrReadable(model.createSnapshot()));
            model.dispose();
        });
        async function testLargeTextFile(largeString, buffer) {
            const identifier = toUntypedWorkingCopyId(fooFile);
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            await service.backup(identifier, buffer, undefined, { largeTest: true });
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
            assert.strictEqual((await fileService.exists(backupPath)), true);
            assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, largeString, { largeTest: true }));
            assert.ok(service.hasBackupSync(identifier));
        }
        test('untitled file (large file, readable)', async () => {
            const identifier = toUntypedWorkingCopyId(untitledFile);
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            const largeString = (new Array(30 * 1024)).join('Large String\n');
            const model = createTextModel(largeString);
            await service.backup(identifier, toBufferOrReadable(model.createSnapshot()));
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'untitled'))).children?.length, 1);
            assert.strictEqual((await fileService.exists(backupPath)), true);
            assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, largeString));
            assert.ok(service.hasBackupSync(identifier));
            model.dispose();
        });
        test('cancellation', async () => {
            const identifier = toUntypedWorkingCopyId(fooFile);
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            const cts = new CancellationTokenSource();
            const promise = service.backup(identifier, undefined, undefined, undefined, cts.token);
            cts.cancel();
            await promise;
            assert.strictEqual((await fileService.exists(backupPath)), false);
            assert.ok(!service.hasBackupSync(identifier));
        });
        test('multiple', async () => {
            const identifier = toUntypedWorkingCopyId(fooFile);
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            await Promise.all([
                service.backup(identifier),
                service.backup(identifier),
                service.backup(identifier),
                service.backup(identifier)
            ]);
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
            assert.strictEqual((await fileService.exists(backupPath)), true);
            assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier));
            assert.ok(service.hasBackupSync(identifier));
        });
        test('multiple same resource, different type id', async () => {
            const backupId1 = toUntypedWorkingCopyId(fooFile);
            const backupId2 = toTypedWorkingCopyId(fooFile, 'type1');
            const backupId3 = toTypedWorkingCopyId(fooFile, 'type2');
            await Promise.all([
                service.backup(backupId1),
                service.backup(backupId2),
                service.backup(backupId3)
            ]);
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 3);
            for (const backupId of [backupId1, backupId2, backupId3]) {
                const fooBackupPath = joinPath(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
                assert.strictEqual((await fileService.exists(fooBackupPath)), true);
                assert.strictEqual((await fileService.readFile(fooBackupPath)).value.toString(), toExpectedPreamble(backupId));
                assert.ok(service.hasBackupSync(backupId));
            }
        });
    });
    suite('discardBackup', () => {
        test('joining', async () => {
            const identifier = toUntypedWorkingCopyId(fooFile);
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            await service.backup(identifier, bufferToReadable(VSBuffer.fromString('test')));
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
            assert.ok(service.hasBackupSync(identifier));
            let backupJoined = false;
            service.joinBackups().then(() => backupJoined = true);
            const discardBackupPromise = service.discardBackup(identifier);
            assert.strictEqual(backupJoined, false);
            await discardBackupPromise;
            assert.strictEqual(backupJoined, true);
            assert.strictEqual((await fileService.exists(backupPath)), false);
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 0);
            assert.ok(!service.hasBackupSync(identifier));
        });
        test('text file', async () => {
            const identifier = toUntypedWorkingCopyId(fooFile);
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            await service.backup(identifier, bufferToReadable(VSBuffer.fromString('test')));
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
            assert.ok(service.hasBackupSync(identifier));
            await service.discardBackup(identifier);
            assert.strictEqual((await fileService.exists(backupPath)), false);
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 0);
            assert.ok(!service.hasBackupSync(identifier));
        });
        test('untitled file', async () => {
            const identifier = toUntypedWorkingCopyId(untitledFile);
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            await service.backup(identifier, bufferToReadable(VSBuffer.fromString('test')));
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'untitled'))).children?.length, 1);
            await service.discardBackup(identifier);
            assert.strictEqual((await fileService.exists(backupPath)), false);
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'untitled'))).children?.length, 0);
        });
        test('multiple same resource, different type id', async () => {
            const backupId1 = toUntypedWorkingCopyId(fooFile);
            const backupId2 = toTypedWorkingCopyId(fooFile, 'type1');
            const backupId3 = toTypedWorkingCopyId(fooFile, 'type2');
            await Promise.all([
                service.backup(backupId1),
                service.backup(backupId2),
                service.backup(backupId3)
            ]);
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 3);
            for (const backupId of [backupId1, backupId2, backupId3]) {
                const backupPath = joinPath(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
                await service.discardBackup(backupId);
                assert.strictEqual((await fileService.exists(backupPath)), false);
            }
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 0);
        });
    });
    suite('discardBackups (all)', () => {
        test('text file', async () => {
            const backupId1 = toUntypedWorkingCopyId(fooFile);
            const backupId2 = toUntypedWorkingCopyId(barFile);
            const backupId3 = toTypedWorkingCopyId(barFile);
            await service.backup(backupId1, bufferToReadable(VSBuffer.fromString('test')));
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
            await service.backup(backupId2, bufferToReadable(VSBuffer.fromString('test')));
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 2);
            await service.backup(backupId3, bufferToReadable(VSBuffer.fromString('test')));
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 3);
            await service.discardBackups();
            for (const backupId of [backupId1, backupId2, backupId3]) {
                const backupPath = joinPath(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
                assert.strictEqual((await fileService.exists(backupPath)), false);
            }
            assert.strictEqual((await fileService.exists(joinPath(workspaceBackupPath, 'file'))), false);
        });
        test('untitled file', async () => {
            const backupId = toUntypedWorkingCopyId(untitledFile);
            const backupPath = joinPath(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
            await service.backup(backupId, bufferToReadable(VSBuffer.fromString('test')));
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'untitled'))).children?.length, 1);
            await service.discardBackups();
            assert.strictEqual((await fileService.exists(backupPath)), false);
            assert.strictEqual((await fileService.exists(joinPath(workspaceBackupPath, 'untitled'))), false);
        });
        test('can backup after discarding all', async () => {
            await service.discardBackups();
            await service.backup(toUntypedWorkingCopyId(untitledFile), bufferToReadable(VSBuffer.fromString('test')));
            assert.strictEqual((await fileService.exists(workspaceBackupPath)), true);
        });
    });
    suite('discardBackups (except some)', () => {
        test('text file', async () => {
            const backupId1 = toUntypedWorkingCopyId(fooFile);
            const backupId2 = toUntypedWorkingCopyId(barFile);
            const backupId3 = toTypedWorkingCopyId(barFile);
            await service.backup(backupId1, bufferToReadable(VSBuffer.fromString('test')));
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
            await service.backup(backupId2, bufferToReadable(VSBuffer.fromString('test')));
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 2);
            await service.backup(backupId3, bufferToReadable(VSBuffer.fromString('test')));
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 3);
            await service.discardBackups({ except: [backupId2, backupId3] });
            let backupPath = joinPath(workspaceBackupPath, backupId1.resource.scheme, hashIdentifier(backupId1));
            assert.strictEqual((await fileService.exists(backupPath)), false);
            backupPath = joinPath(workspaceBackupPath, backupId2.resource.scheme, hashIdentifier(backupId2));
            assert.strictEqual((await fileService.exists(backupPath)), true);
            backupPath = joinPath(workspaceBackupPath, backupId3.resource.scheme, hashIdentifier(backupId3));
            assert.strictEqual((await fileService.exists(backupPath)), true);
            await service.discardBackups({ except: [backupId1] });
            for (const backupId of [backupId1, backupId2, backupId3]) {
                const backupPath = joinPath(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
                assert.strictEqual((await fileService.exists(backupPath)), false);
            }
        });
        test('untitled file', async () => {
            const backupId = toUntypedWorkingCopyId(untitledFile);
            const backupPath = joinPath(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
            await service.backup(backupId, bufferToReadable(VSBuffer.fromString('test')));
            assert.strictEqual((await fileService.exists(backupPath)), true);
            assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'untitled'))).children?.length, 1);
            await service.discardBackups({ except: [backupId] });
            assert.strictEqual((await fileService.exists(backupPath)), true);
        });
    });
    suite('getBackups', () => {
        test('text file', async () => {
            await Promise.all([
                service.backup(toUntypedWorkingCopyId(fooFile), bufferToReadable(VSBuffer.fromString('test'))),
                service.backup(toTypedWorkingCopyId(fooFile, 'type1'), bufferToReadable(VSBuffer.fromString('test'))),
                service.backup(toTypedWorkingCopyId(fooFile, 'type2'), bufferToReadable(VSBuffer.fromString('test')))
            ]);
            let backups = await service.getBackups();
            assert.strictEqual(backups.length, 3);
            for (const backup of backups) {
                if (backup.typeId === '') {
                    assert.strictEqual(backup.resource.toString(), fooFile.toString());
                }
                else if (backup.typeId === 'type1') {
                    assert.strictEqual(backup.resource.toString(), fooFile.toString());
                }
                else if (backup.typeId === 'type2') {
                    assert.strictEqual(backup.resource.toString(), fooFile.toString());
                }
                else {
                    assert.fail('Unexpected backup');
                }
            }
            await service.backup(toUntypedWorkingCopyId(barFile), bufferToReadable(VSBuffer.fromString('test')));
            backups = await service.getBackups();
            assert.strictEqual(backups.length, 4);
        });
        test('untitled file', async () => {
            await Promise.all([
                service.backup(toUntypedWorkingCopyId(untitledFile), bufferToReadable(VSBuffer.fromString('test'))),
                service.backup(toTypedWorkingCopyId(untitledFile, 'type1'), bufferToReadable(VSBuffer.fromString('test'))),
                service.backup(toTypedWorkingCopyId(untitledFile, 'type2'), bufferToReadable(VSBuffer.fromString('test')))
            ]);
            const backups = await service.getBackups();
            assert.strictEqual(backups.length, 3);
            for (const backup of backups) {
                if (backup.typeId === '') {
                    assert.strictEqual(backup.resource.toString(), untitledFile.toString());
                }
                else if (backup.typeId === 'type1') {
                    assert.strictEqual(backup.resource.toString(), untitledFile.toString());
                }
                else if (backup.typeId === 'type2') {
                    assert.strictEqual(backup.resource.toString(), untitledFile.toString());
                }
                else {
                    assert.fail('Unexpected backup');
                }
            }
        });
    });
    suite('resolve', () => {
        test('should restore the original contents (untitled file)', async () => {
            const contents = 'test\nand more stuff';
            await testResolveBackup(untitledFile, contents);
        });
        test('should restore the original contents (untitled file with metadata)', async () => {
            const contents = 'test\nand more stuff';
            const meta = {
                etag: 'the Etag',
                size: 666,
                mtime: Date.now(),
                orphaned: true
            };
            await testResolveBackup(untitledFile, contents, meta);
        });
        test('should restore the original contents (untitled file empty with metadata)', async () => {
            const contents = '';
            const meta = {
                etag: 'the Etag',
                size: 666,
                mtime: Date.now(),
                orphaned: true
            };
            await testResolveBackup(untitledFile, contents, meta);
        });
        test('should restore the original contents (untitled large file with metadata)', async () => {
            const contents = (new Array(30 * 1024)).join('Large String\n');
            const meta = {
                etag: 'the Etag',
                size: 666,
                mtime: Date.now(),
                orphaned: true
            };
            await testResolveBackup(untitledFile, contents, meta);
        });
        test('should restore the original contents (text file)', async () => {
            const contents = [
                'Lorem ipsum ',
                'dolor öäü sit amet ',
                'consectetur ',
                'adipiscing ßß elit'
            ].join('');
            await testResolveBackup(fooFile, contents);
        });
        test('should restore the original contents (text file - custom scheme)', async () => {
            const contents = [
                'Lorem ipsum ',
                'dolor öäü sit amet ',
                'consectetur ',
                'adipiscing ßß elit'
            ].join('');
            await testResolveBackup(customFile, contents);
        });
        test('should restore the original contents (text file with metadata)', async () => {
            const contents = [
                'Lorem ipsum ',
                'dolor öäü sit amet ',
                'adipiscing ßß elit',
                'consectetur '
            ].join('');
            const meta = {
                etag: 'theEtag',
                size: 888,
                mtime: Date.now(),
                orphaned: false
            };
            await testResolveBackup(fooFile, contents, meta);
        });
        test('should restore the original contents (empty text file with metadata)', async () => {
            const contents = '';
            const meta = {
                etag: 'theEtag',
                size: 888,
                mtime: Date.now(),
                orphaned: false
            };
            await testResolveBackup(fooFile, contents, meta);
        });
        test('should restore the original contents (large text file with metadata)', async () => {
            const contents = (new Array(30 * 1024)).join('Large String\n');
            const meta = {
                etag: 'theEtag',
                size: 888,
                mtime: Date.now(),
                orphaned: false
            };
            await testResolveBackup(fooFile, contents, meta);
        });
        test('should restore the original contents (text file with metadata changed once)', async () => {
            const contents = [
                'Lorem ipsum ',
                'dolor öäü sit amet ',
                'adipiscing ßß elit',
                'consectetur '
            ].join('');
            const meta = {
                etag: 'theEtag',
                size: 888,
                mtime: Date.now(),
                orphaned: false
            };
            await testResolveBackup(fooFile, contents, meta);
            // Change meta and test again
            meta.size = 999;
            await testResolveBackup(fooFile, contents, meta);
        });
        test('should restore the original contents (text file with metadata and fragment URI)', async () => {
            const contents = [
                'Lorem ipsum ',
                'dolor öäü sit amet ',
                'adipiscing ßß elit',
                'consectetur '
            ].join('');
            const meta = {
                etag: 'theEtag',
                size: 888,
                mtime: Date.now(),
                orphaned: false
            };
            await testResolveBackup(customFileWithFragment, contents, meta);
        });
        test('should restore the original contents (text file with space in name with metadata)', async () => {
            const contents = [
                'Lorem ipsum ',
                'dolor öäü sit amet ',
                'adipiscing ßß elit',
                'consectetur '
            ].join('');
            const meta = {
                etag: 'theEtag',
                size: 888,
                mtime: Date.now(),
                orphaned: false
            };
            await testResolveBackup(fooBarFile, contents, meta);
        });
        test('should restore the original contents (text file with too large metadata to persist)', async () => {
            const contents = [
                'Lorem ipsum ',
                'dolor öäü sit amet ',
                'adipiscing ßß elit',
                'consectetur '
            ].join('');
            const meta = {
                etag: (new Array(100 * 1024)).join('Large String'),
                size: 888,
                mtime: Date.now(),
                orphaned: false
            };
            await testResolveBackup(fooFile, contents, meta, true);
        });
        async function testResolveBackup(resource, contents, meta, expectNoMeta) {
            await doTestResolveBackup(toUntypedWorkingCopyId(resource), contents, meta, expectNoMeta);
            await doTestResolveBackup(toTypedWorkingCopyId(resource), contents, meta, expectNoMeta);
        }
        async function doTestResolveBackup(identifier, contents, meta, expectNoMeta) {
            await service.backup(identifier, bufferToReadable(VSBuffer.fromString(contents)), 1, meta);
            const backup = await service.resolve(identifier);
            assert.ok(backup);
            assert.strictEqual(contents, (await streamToBuffer(backup.value)).toString());
            if (expectNoMeta || !meta) {
                assert.strictEqual(backup.meta, undefined);
            }
            else {
                assert.ok(backup.meta);
                assert.strictEqual(backup.meta.etag, meta.etag);
                assert.strictEqual(backup.meta.size, meta.size);
                assert.strictEqual(backup.meta.mtime, meta.mtime);
                assert.strictEqual(backup.meta.orphaned, meta.orphaned);
                assert.strictEqual(Object.keys(meta).length, Object.keys(backup.meta).length);
            }
        }
        test('should restore the original contents (text file with broken metadata)', async () => {
            await testShouldRestoreOriginalContentsWithBrokenBackup(toUntypedWorkingCopyId(fooFile));
            await testShouldRestoreOriginalContentsWithBrokenBackup(toTypedWorkingCopyId(fooFile));
        });
        async function testShouldRestoreOriginalContentsWithBrokenBackup(identifier) {
            const contents = [
                'Lorem ipsum ',
                'dolor öäü sit amet ',
                'adipiscing ßß elit',
                'consectetur '
            ].join('');
            const meta = {
                etag: 'theEtag',
                size: 888,
                mtime: Date.now(),
                orphaned: false
            };
            await service.backup(identifier, bufferToReadable(VSBuffer.fromString(contents)), 1, meta);
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            const fileContents = (await fileService.readFile(backupPath)).value.toString();
            assert.strictEqual(fileContents.indexOf(identifier.resource.toString()), 0);
            const metaIndex = fileContents.indexOf('{');
            const newFileContents = fileContents.substring(0, metaIndex) + '{{' + fileContents.substr(metaIndex);
            await fileService.writeFile(backupPath, VSBuffer.fromString(newFileContents));
            const backup = await service.resolve(identifier);
            assert.ok(backup);
            assert.strictEqual(contents, (await streamToBuffer(backup.value)).toString());
            assert.strictEqual(backup.meta, undefined);
        }
        test('should update metadata from file into model when resolving', async () => {
            await testShouldUpdateMetaFromFileWhenResolving(toUntypedWorkingCopyId(fooFile));
            await testShouldUpdateMetaFromFileWhenResolving(toTypedWorkingCopyId(fooFile));
        });
        async function testShouldUpdateMetaFromFileWhenResolving(identifier) {
            const contents = 'Foo Bar';
            const meta = {
                etag: 'theEtagForThisMetadataTest',
                size: 888,
                mtime: Date.now(),
                orphaned: false
            };
            const updatedMeta = {
                ...meta,
                etag: meta.etag + meta.etag
            };
            await service.backup(identifier, bufferToReadable(VSBuffer.fromString(contents)), 1, meta);
            const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
            // Simulate the condition of the backups model loading initially without
            // meta data information and then getting the meta data updated on the
            // first call to resolve the backup. We simulate this by explicitly changing
            // the meta data in the file and then verifying that the updated meta data
            // is persisted back into the model (verified via `hasBackupSync`).
            // This is not really something that would happen in real life because any
            // backup that is made via backup service will update the model accordingly.
            const originalFileContents = (await fileService.readFile(backupPath)).value.toString();
            await fileService.writeFile(backupPath, VSBuffer.fromString(originalFileContents.replace(meta.etag, updatedMeta.etag)));
            await service.resolve(identifier);
            assert.strictEqual(service.hasBackupSync(identifier, undefined, meta), false);
            assert.strictEqual(service.hasBackupSync(identifier, undefined, updatedMeta), true);
            await fileService.writeFile(backupPath, VSBuffer.fromString(originalFileContents));
            await service.getBackups();
            assert.strictEqual(service.hasBackupSync(identifier, undefined, meta), true);
            assert.strictEqual(service.hasBackupSync(identifier, undefined, updatedMeta), false);
        }
        test('should ignore invalid backups (empty file)', async () => {
            const contents = 'test\nand more stuff';
            await service.backup(toUntypedWorkingCopyId(fooFile), bufferToReadable(VSBuffer.fromString(contents)), 1);
            let backup = await service.resolve(toUntypedWorkingCopyId(fooFile));
            assert.ok(backup);
            await service.testGetFileService().writeFile(service.toBackupResource(toUntypedWorkingCopyId(fooFile)), VSBuffer.fromString(''));
            backup = await service.resolve(toUntypedWorkingCopyId(fooFile));
            assert.ok(!backup);
        });
        test('should ignore invalid backups (no preamble)', async () => {
            const contents = 'testand more stuff';
            await service.backup(toUntypedWorkingCopyId(fooFile), bufferToReadable(VSBuffer.fromString(contents)), 1);
            let backup = await service.resolve(toUntypedWorkingCopyId(fooFile));
            assert.ok(backup);
            await service.testGetFileService().writeFile(service.toBackupResource(toUntypedWorkingCopyId(fooFile)), VSBuffer.fromString(contents));
            backup = await service.resolve(toUntypedWorkingCopyId(fooFile));
            assert.ok(!backup);
        });
        test('file with binary data', async () => {
            const identifier = toUntypedWorkingCopyId(fooFile);
            const buffer = Uint8Array.from([
                137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 73, 0, 0, 0, 67, 8, 2, 0, 0, 0, 95, 138, 191, 237, 0, 0, 0, 1, 115, 82, 71, 66, 0, 174, 206, 28, 233, 0, 0, 0, 4, 103, 65, 77, 65, 0, 0, 177, 143, 11, 252, 97, 5, 0, 0, 0, 9, 112, 72, 89, 115, 0, 0, 14, 195, 0, 0, 14, 195, 1, 199, 111, 168, 100, 0, 0, 0, 71, 116, 69, 88, 116, 83, 111, 117, 114, 99, 101, 0, 83, 104, 111, 116, 116, 121, 32, 118, 50, 46, 48, 46, 50, 46, 50, 49, 54, 32, 40, 67, 41, 32, 84, 104, 111, 109, 97, 115, 32, 66, 97, 117, 109, 97, 110, 110, 32, 45, 32, 104, 116, 116, 112, 58, 47, 47, 115, 104, 111, 116, 116, 121, 46, 100, 101, 118, 115, 45, 111, 110, 46, 110, 101, 116, 44, 132, 21, 213, 0, 0, 0, 84, 73, 68, 65, 84, 120, 218, 237, 207, 65, 17, 0, 0, 12, 2, 32, 211, 217, 63, 146, 37, 246, 218, 65, 3, 210, 191, 226, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 118, 100, 169, 4, 173, 8, 44, 248, 184, 40, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
            ]);
            await service.backup(identifier, bufferToReadable(VSBuffer.wrap(buffer)), undefined, { binaryTest: 'true' });
            const backup = await service.resolve(toUntypedWorkingCopyId(fooFile));
            assert.ok(backup);
            const backupBuffer = await consumeStream(backup.value, chunks => VSBuffer.concat(chunks));
            assert.strictEqual(backupBuffer.buffer.byteLength, buffer.byteLength);
        });
    });
    suite('WorkingCopyBackupsModel', () => {
        test('simple', async () => {
            const model = await WorkingCopyBackupsModel.create(workspaceBackupPath, service.testGetFileService());
            const resource1 = URI.file('test.html');
            assert.strictEqual(model.has(resource1), false);
            model.add(resource1);
            assert.strictEqual(model.has(resource1), true);
            assert.strictEqual(model.has(resource1, 0), true);
            assert.strictEqual(model.has(resource1, 1), false);
            assert.strictEqual(model.has(resource1, 1, { foo: 'bar' }), false);
            model.remove(resource1);
            assert.strictEqual(model.has(resource1), false);
            model.add(resource1);
            assert.strictEqual(model.has(resource1), true);
            assert.strictEqual(model.has(resource1, 0), true);
            assert.strictEqual(model.has(resource1, 1), false);
            model.clear();
            assert.strictEqual(model.has(resource1), false);
            model.add(resource1, 1);
            assert.strictEqual(model.has(resource1), true);
            assert.strictEqual(model.has(resource1, 0), false);
            assert.strictEqual(model.has(resource1, 1), true);
            const resource2 = URI.file('test1.html');
            const resource3 = URI.file('test2.html');
            const resource4 = URI.file('test3.html');
            model.add(resource2);
            model.add(resource3);
            model.add(resource4, undefined, { foo: 'bar' });
            assert.strictEqual(model.has(resource1), true);
            assert.strictEqual(model.has(resource2), true);
            assert.strictEqual(model.has(resource3), true);
            assert.strictEqual(model.has(resource4), true);
            assert.strictEqual(model.has(resource4, undefined, { foo: 'bar' }), true);
            assert.strictEqual(model.has(resource4, undefined, { bar: 'foo' }), false);
            model.update(resource4, { foo: 'nothing' });
            assert.strictEqual(model.has(resource4, undefined, { foo: 'nothing' }), true);
            assert.strictEqual(model.has(resource4, undefined, { foo: 'bar' }), false);
            model.update(resource4);
            assert.strictEqual(model.has(resource4), true);
            assert.strictEqual(model.has(resource4, undefined, { foo: 'nothing' }), false);
        });
        test('create', async () => {
            const fooBackupPath = joinPath(workspaceBackupPath, fooFile.scheme, hashIdentifier(toUntypedWorkingCopyId(fooFile)));
            await fileService.createFolder(dirname(fooBackupPath));
            await fileService.writeFile(fooBackupPath, VSBuffer.fromString('foo'));
            const model = await WorkingCopyBackupsModel.create(workspaceBackupPath, service.testGetFileService());
            assert.strictEqual(model.has(fooBackupPath), true);
        });
        test('get', async () => {
            const model = await WorkingCopyBackupsModel.create(workspaceBackupPath, service.testGetFileService());
            assert.deepStrictEqual(model.get(), []);
            const file1 = URI.file('/root/file/foo.html');
            const file2 = URI.file('/root/file/bar.html');
            const untitled = URI.file('/root/untitled/bar.html');
            model.add(file1);
            model.add(file2);
            model.add(untitled);
            assert.deepStrictEqual(model.get().map(f => f.fsPath), [file1.fsPath, file2.fsPath, untitled.fsPath]);
        });
    });
    suite('typeId migration', () => {
        test('works (when meta is missing)', async () => {
            const fooBackupId = toUntypedWorkingCopyId(fooFile);
            const untitledBackupId = toUntypedWorkingCopyId(untitledFile);
            const customBackupId = toUntypedWorkingCopyId(customFile);
            const fooBackupPath = joinPath(workspaceBackupPath, fooFile.scheme, hashIdentifier(fooBackupId));
            const untitledBackupPath = joinPath(workspaceBackupPath, untitledFile.scheme, hashIdentifier(untitledBackupId));
            const customFileBackupPath = joinPath(workspaceBackupPath, customFile.scheme, hashIdentifier(customBackupId));
            // Prepare backups of the old format without meta
            await fileService.createFolder(joinPath(workspaceBackupPath, fooFile.scheme));
            await fileService.createFolder(joinPath(workspaceBackupPath, untitledFile.scheme));
            await fileService.createFolder(joinPath(workspaceBackupPath, customFile.scheme));
            await fileService.writeFile(fooBackupPath, VSBuffer.fromString(`${fooFile.toString()}\ntest file`));
            await fileService.writeFile(untitledBackupPath, VSBuffer.fromString(`${untitledFile.toString()}\ntest untitled`));
            await fileService.writeFile(customFileBackupPath, VSBuffer.fromString(`${customFile.toString()}\ntest custom`));
            service.reinitialize(workspaceBackupPath);
            const backups = await service.getBackups();
            assert.strictEqual(backups.length, 3);
            assert.ok(backups.some(backup => isEqual(backup.resource, fooFile)));
            assert.ok(backups.some(backup => isEqual(backup.resource, untitledFile)));
            assert.ok(backups.some(backup => isEqual(backup.resource, customFile)));
            assert.ok(backups.every(backup => backup.typeId === ''));
        });
        test('works (when typeId in meta is missing)', async () => {
            const fooBackupId = toUntypedWorkingCopyId(fooFile);
            const untitledBackupId = toUntypedWorkingCopyId(untitledFile);
            const customBackupId = toUntypedWorkingCopyId(customFile);
            const fooBackupPath = joinPath(workspaceBackupPath, fooFile.scheme, hashIdentifier(fooBackupId));
            const untitledBackupPath = joinPath(workspaceBackupPath, untitledFile.scheme, hashIdentifier(untitledBackupId));
            const customFileBackupPath = joinPath(workspaceBackupPath, customFile.scheme, hashIdentifier(customBackupId));
            // Prepare backups of the old format without meta
            await fileService.createFolder(joinPath(workspaceBackupPath, fooFile.scheme));
            await fileService.createFolder(joinPath(workspaceBackupPath, untitledFile.scheme));
            await fileService.createFolder(joinPath(workspaceBackupPath, customFile.scheme));
            await fileService.writeFile(fooBackupPath, VSBuffer.fromString(`${fooFile.toString()} ${JSON.stringify({ foo: 'bar' })}\ntest file`));
            await fileService.writeFile(untitledBackupPath, VSBuffer.fromString(`${untitledFile.toString()} ${JSON.stringify({ foo: 'bar' })}\ntest untitled`));
            await fileService.writeFile(customFileBackupPath, VSBuffer.fromString(`${customFile.toString()} ${JSON.stringify({ foo: 'bar' })}\ntest custom`));
            service.reinitialize(workspaceBackupPath);
            const backups = await service.getBackups();
            assert.strictEqual(backups.length, 3);
            assert.ok(backups.some(backup => isEqual(backup.resource, fooFile)));
            assert.ok(backups.some(backup => isEqual(backup.resource, untitledFile)));
            assert.ok(backups.some(backup => isEqual(backup.resource, customFile)));
            assert.ok(backups.every(backup => backup.typeId === ''));
        });
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvd29ya2luZ0NvcHkvdGVzdC9lbGVjdHJvbi1icm93c2VyL3dvcmtpbmdDb3B5QmFja3VwU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDbkUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRixPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxjQUFjLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDckYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsUUFBUSxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ2hILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRTNFLE9BQU8sRUFB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RSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxHQUFHO2FBQzFwQyxDQUFDLENBQUM7WUFFSCxNQUFNLE9BQU8sQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztZQUU3RyxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sQ0FBQyxPQUFPLENBQUMsc0JBQXNCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUN0RSxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBRWxCLE1BQU0sWUFBWSxHQUFHLE1BQU0sYUFBYSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDMUYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDdkUsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7UUFFckMsSUFBSSxDQUFDLFFBQVEsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN6QixNQUFNLEtBQUssR0FBRyxNQUFNLHVCQUF1QixDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsRUFBRSxPQUFPLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO1lBRXRHLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7WUFFeEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBRWhELEtBQUssQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFckIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNuRCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBRW5FLEtBQUssQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFeEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBRWhELEtBQUssQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFckIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUVuRCxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7WUFFZCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFFaEQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFeEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEdBQUcs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