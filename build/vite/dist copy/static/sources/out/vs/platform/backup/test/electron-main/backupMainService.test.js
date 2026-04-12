/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import { Schemas } from '../../../../base/common/network.js';
import * as path from '../../../../base/common/path.js';
import * as platform from '../../../../base/common/platform.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { Promises } from '../../../../base/node/pfs.js';
import { flakySuite, getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import { BackupMainService } from '../../electron-main/backupMainService.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { EnvironmentMainService } from '../../../environment/electron-main/environmentMainService.js';
import { OPTIONS, parseArgs } from '../../../environment/node/argv.js';
import { HotExitConfiguration } from '../../../files/common/files.js';
import { ConsoleMainLogger } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { isFolderBackupInfo } from '../../common/backup.js';
import { InMemoryTestStateMainService } from '../../../test/electron-main/workbenchTestServices.js';
import { LogService } from '../../../log/common/logService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
flakySuite('BackupMainService', () => {
    function assertEqualFolderInfos(actual, expected) {
        const withUriAsString = (f) => ({ folderUri: f.folderUri.toString(), remoteAuthority: f.remoteAuthority });
        assert.deepStrictEqual(actual.map(withUriAsString), expected.map(withUriAsString));
    }
    function toWorkspace(path) {
        return {
            id: createHash('md5').update(sanitizePath(path)).digest('hex'), // CodeQL [SM04514] Using MD5 to convert a file path to a fixed length
            configPath: URI.file(path)
        };
    }
    function toWorkspaceBackupInfo(path, remoteAuthority) {
        return {
            workspace: {
                id: createHash('md5').update(sanitizePath(path)).digest('hex'), // CodeQL [SM04514] Using MD5 to convert a file path to a fixed length
                configPath: URI.file(path)
            },
            remoteAuthority
        };
    }
    function toFolderBackupInfo(uri, remoteAuthority) {
        return { folderUri: uri, remoteAuthority };
    }
    function toSerializedWorkspace(ws) {
        return {
            id: ws.id,
            configURIPath: ws.configPath.toString()
        };
    }
    function ensureFolderExists(uri) {
        if (!fs.existsSync(uri.fsPath)) {
            fs.mkdirSync(uri.fsPath);
        }
        const backupFolder = service.toBackupPath(uri);
        return createBackupFolder(backupFolder);
    }
    async function ensureWorkspaceExists(workspace) {
        if (!fs.existsSync(workspace.configPath.fsPath)) {
            await Promises.writeFile(workspace.configPath.fsPath, 'Hello');
        }
        const backupFolder = service.toBackupPath(workspace.id);
        await createBackupFolder(backupFolder);
        return workspace;
    }
    async function createBackupFolder(backupFolder) {
        if (!fs.existsSync(backupFolder)) {
            fs.mkdirSync(backupFolder);
            fs.mkdirSync(path.join(backupFolder, Schemas.file));
            await Promises.writeFile(path.join(backupFolder, Schemas.file, 'foo.txt'), 'Hello');
        }
    }
    function readWorkspacesMetadata() {
        return stateMainService.getItem('backupWorkspaces');
    }
    function writeWorkspacesMetadata(data) {
        if (!data) {
            stateMainService.removeItem('backupWorkspaces');
        }
        else {
            stateMainService.setItem('backupWorkspaces', JSON.parse(data));
        }
    }
    function sanitizePath(p) {
        return platform.isLinux ? p : p.toLowerCase();
    }
    const fooFile = URI.file(platform.isWindows ? 'C:\\foo' : '/foo');
    const barFile = URI.file(platform.isWindows ? 'C:\\bar' : '/bar');
    let service;
    let configService;
    let stateMainService;
    let environmentService;
    let testDir;
    let backupHome;
    let existingTestFolder1;
    setup(async () => {
        testDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'backupmainservice');
        backupHome = path.join(testDir, 'Backups');
        existingTestFolder1 = URI.file(path.join(testDir, 'folder1'));
        environmentService = new EnvironmentMainService(parseArgs(process.argv, OPTIONS), { _serviceBrand: undefined, ...product });
        await fs.promises.mkdir(backupHome, { recursive: true });
        configService = new TestConfigurationService();
        stateMainService = new InMemoryTestStateMainService();
        service = new class TestBackupMainService extends BackupMainService {
            constructor() {
                super(environmentService, configService, new LogService(new ConsoleMainLogger()), stateMainService);
                this.backupHome = backupHome;
            }
            toBackupPath(arg) {
                const id = arg instanceof URI ? super.getFolderHash({ folderUri: arg }) : arg;
                return path.join(this.backupHome, id);
            }
            testGetFolderHash(folder) {
                return super.getFolderHash(folder);
            }
            testGetWorkspaceBackups() {
                return super.getWorkspaceBackups();
            }
            testGetFolderBackups() {
                return super.getFolderBackups();
            }
        };
        return service.initialize();
    });
    teardown(() => {
        return Promises.rm(testDir);
    });
    test('service validates backup workspaces on startup and cleans up (folder workspaces)', async function () {
        // 1) backup workspace path does not exist
        service.registerFolderBackup(toFolderBackupInfo(fooFile));
        service.registerFolderBackup(toFolderBackupInfo(barFile));
        await service.initialize();
        assertEqualFolderInfos(service.testGetFolderBackups(), []);
        // 2) backup workspace path exists with empty contents within
        fs.mkdirSync(service.toBackupPath(fooFile));
        fs.mkdirSync(service.toBackupPath(barFile));
        service.registerFolderBackup(toFolderBackupInfo(fooFile));
        service.registerFolderBackup(toFolderBackupInfo(barFile));
        await service.initialize();
        assertEqualFolderInfos(service.testGetFolderBackups(), []);
        assert.ok(!fs.existsSync(service.toBackupPath(fooFile)));
        assert.ok(!fs.existsSync(service.toBackupPath(barFile)));
        // 3) backup workspace path exists with empty folders within
        fs.mkdirSync(service.toBackupPath(fooFile));
        fs.mkdirSync(service.toBackupPath(barFile));
        fs.mkdirSync(path.join(service.toBackupPath(fooFile), Schemas.file));
        fs.mkdirSync(path.join(service.toBackupPath(barFile), Schemas.untitled));
        service.registerFolderBackup(toFolderBackupInfo(fooFile));
        service.registerFolderBackup(toFolderBackupInfo(barFile));
        await service.initialize();
        assertEqualFolderInfos(service.testGetFolderBackups(), []);
        assert.ok(!fs.existsSync(service.toBackupPath(fooFile)));
        assert.ok(!fs.existsSync(service.toBackupPath(barFile)));
        // 4) backup workspace path points to a workspace that no longer exists
        // so it should convert the backup worspace to an empty workspace backup
        const fileBackups = path.join(service.toBackupPath(fooFile), Schemas.file);
        fs.mkdirSync(service.toBackupPath(fooFile));
        fs.mkdirSync(service.toBackupPath(barFile));
        fs.mkdirSync(fileBackups);
        service.registerFolderBackup(toFolderBackupInfo(fooFile));
        assert.strictEqual(service.testGetFolderBackups().length, 1);
        assert.strictEqual(service.getEmptyWindowBackups().length, 0);
        fs.writeFileSync(path.join(fileBackups, 'backup.txt'), '');
        await service.initialize();
        assert.strictEqual(service.testGetFolderBackups().length, 0);
        assert.strictEqual(service.getEmptyWindowBackups().length, 1);
    });
    test('service validates backup workspaces on startup and cleans up (root workspaces)', async function () {
        // 1) backup workspace path does not exist
        service.registerWorkspaceBackup(toWorkspaceBackupInfo(fooFile.fsPath));
        service.registerWorkspaceBackup(toWorkspaceBackupInfo(barFile.fsPath));
        await service.initialize();
        assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
        // 2) backup workspace path exists with empty contents within
        fs.mkdirSync(service.toBackupPath(fooFile));
        fs.mkdirSync(service.toBackupPath(barFile));
        service.registerWorkspaceBackup(toWorkspaceBackupInfo(fooFile.fsPath));
        service.registerWorkspaceBackup(toWorkspaceBackupInfo(barFile.fsPath));
        await service.initialize();
        assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
        assert.ok(!fs.existsSync(service.toBackupPath(fooFile)));
        assert.ok(!fs.existsSync(service.toBackupPath(barFile)));
        // 3) backup workspace path exists with empty folders within
        fs.mkdirSync(service.toBackupPath(fooFile));
        fs.mkdirSync(service.toBackupPath(barFile));
        fs.mkdirSync(path.join(service.toBackupPath(fooFile), Schemas.file));
        fs.mkdirSync(path.join(service.toBackupPath(barFile), Schemas.untitled));
        service.registerWorkspaceBackup(toWorkspaceBackupInfo(fooFile.fsPath));
        service.registerWorkspaceBackup(toWorkspaceBackupInfo(barFile.fsPath));
        await service.initialize();
        assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
        assert.ok(!fs.existsSync(service.toBackupPath(fooFile)));
        assert.ok(!fs.existsSync(service.toBackupPath(barFile)));
        // 4) backup workspace path points to a workspace that no longer exists
        // so it should convert the backup worspace to an empty workspace backup
        const fileBackups = path.join(service.toBackupPath(fooFile), Schemas.file);
        fs.mkdirSync(service.toBackupPath(fooFile));
        fs.mkdirSync(service.toBackupPath(barFile));
        fs.mkdirSync(fileBackups);
        service.registerWorkspaceBackup(toWorkspaceBackupInfo(fooFile.fsPath));
        assert.strictEqual(service.testGetWorkspaceBackups().length, 1);
        assert.strictEqual(service.getEmptyWindowBackups().length, 0);
        fs.writeFileSync(path.join(fileBackups, 'backup.txt'), '');
        await service.initialize();
        assert.strictEqual(service.testGetWorkspaceBackups().length, 0);
        assert.strictEqual(service.getEmptyWindowBackups().length, 1);
    });
    test('service supports to migrate backup data from another location', async () => {
        const backupPathToMigrate = service.toBackupPath(fooFile);
        fs.mkdirSync(backupPathToMigrate);
        fs.writeFileSync(path.join(backupPathToMigrate, 'backup.txt'), 'Some Data');
        service.registerFolderBackup(toFolderBackupInfo(URI.file(backupPathToMigrate)));
        const workspaceBackupPath = await service.registerWorkspaceBackup(toWorkspaceBackupInfo(barFile.fsPath), backupPathToMigrate);
        assert.ok(fs.existsSync(workspaceBackupPath));
        assert.ok(fs.existsSync(path.join(workspaceBackupPath, 'backup.txt')));
        assert.ok(!fs.existsSync(backupPathToMigrate));
        const emptyBackups = service.getEmptyWindowBackups();
        assert.strictEqual(0, emptyBackups.length);
    });
    test('service backup migration makes sure to preserve existing backups', async () => {
        const backupPathToMigrate = service.toBackupPath(fooFile);
        fs.mkdirSync(backupPathToMigrate);
        fs.writeFileSync(path.join(backupPathToMigrate, 'backup.txt'), 'Some Data');
        service.registerFolderBackup(toFolderBackupInfo(URI.file(backupPathToMigrate)));
        const backupPathToPreserve = service.toBackupPath(barFile);
        fs.mkdirSync(backupPathToPreserve);
        fs.writeFileSync(path.join(backupPathToPreserve, 'backup.txt'), 'Some Data');
        service.registerFolderBackup(toFolderBackupInfo(URI.file(backupPathToPreserve)));
        const workspaceBackupPath = await service.registerWorkspaceBackup(toWorkspaceBackupInfo(barFile.fsPath), backupPathToMigrate);
        assert.ok(fs.existsSync(workspaceBackupPath));
        assert.ok(fs.existsSync(path.join(workspaceBackupPath, 'backup.txt')));
        assert.ok(!fs.existsSync(backupPathToMigrate));
        const emptyBackups = service.getEmptyWindowBackups();
        assert.strictEqual(1, emptyBackups.length);
        assert.strictEqual(1, fs.readdirSync(path.join(backupHome, emptyBackups[0].backupFolder)).length);
    });
    suite('loadSync', () => {
        test('getFolderBackupPaths() should return [] when workspaces.json doesn\'t exist', () => {
            assertEqualFolderInfos(service.testGetFolderBackups(), []);
        });
        test('getFolderBackupPaths() should return [] when folders in workspaces.json is absent', async () => {
            writeWorkspacesMetadata('{}');
            await service.initialize();
            assertEqualFolderInfos(service.testGetFolderBackups(), []);
        });
        test('getFolderBackupPaths() should return [] when folders in workspaces.json is not a string array', async () => {
            writeWorkspacesMetadata('{"folders":{}}');
            await service.initialize();
            assertEqualFolderInfos(service.testGetFolderBackups(), []);
            writeWorkspacesMetadata('{"folders":{"foo": ["bar"]}}');
            await service.initialize();
            assertEqualFolderInfos(service.testGetFolderBackups(), []);
            writeWorkspacesMetadata('{"folders":{"foo": []}}');
            await service.initialize();
            assertEqualFolderInfos(service.testGetFolderBackups(), []);
            writeWorkspacesMetadata('{"folders":{"foo": "bar"}}');
            await service.initialize();
            assertEqualFolderInfos(service.testGetFolderBackups(), []);
            writeWorkspacesMetadata('{"folders":"foo"}');
            await service.initialize();
            assertEqualFolderInfos(service.testGetFolderBackups(), []);
            writeWorkspacesMetadata('{"folders":1}');
            await service.initialize();
            assertEqualFolderInfos(service.testGetFolderBackups(), []);
        });
        test('getFolderBackupPaths() should return [] when files.hotExit = "onExitAndWindowClose"', async () => {
            const fi = toFolderBackupInfo(URI.file(fooFile.fsPath.toUpperCase()));
            service.registerFolderBackup(fi);
            assertEqualFolderInfos(service.testGetFolderBackups(), [fi]);
            configService.setUserConfiguration('files.hotExit', HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE);
            await service.initialize();
            assertEqualFolderInfos(service.testGetFolderBackups(), []);
        });
        test('getWorkspaceBackups() should return [] when workspaces.json doesn\'t exist', () => {
            assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
        });
        test('getWorkspaceBackups() should return [] when folderWorkspaces in workspaces.json is absent', async () => {
            writeWorkspacesMetadata('{}');
            await service.initialize();
            assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
        });
        test('getWorkspaceBackups() should return [] when rootWorkspaces in workspaces.json is not a object array', async () => {
            writeWorkspacesMetadata('{"rootWorkspaces":{}}');
            await service.initialize();
            assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
            writeWorkspacesMetadata('{"rootWorkspaces":{"foo": ["bar"]}}');
            await service.initialize();
            assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
            writeWorkspacesMetadata('{"rootWorkspaces":{"foo": []}}');
            await service.initialize();
            assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
            writeWorkspacesMetadata('{"rootWorkspaces":{"foo": "bar"}}');
            await service.initialize();
            assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
            writeWorkspacesMetadata('{"rootWorkspaces":"foo"}');
            await service.initialize();
            assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
            writeWorkspacesMetadata('{"rootWorkspaces":1}');
            await service.initialize();
            assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
        });
        test('getWorkspaceBackups() should return [] when workspaces in workspaces.json is not a object array', async () => {
            writeWorkspacesMetadata('{"workspaces":{}}');
            await service.initialize();
            assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
            writeWorkspacesMetadata('{"workspaces":{"foo": ["bar"]}}');
            await service.initialize();
            assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
            writeWorkspacesMetadata('{"workspaces":{"foo": []}}');
            await service.initialize();
            assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
            writeWorkspacesMetadata('{"workspaces":{"foo": "bar"}}');
            await service.initialize();
            assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
            writeWorkspacesMetadata('{"workspaces":"foo"}');
            await service.initialize();
            assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
            writeWorkspacesMetadata('{"workspaces":1}');
            await service.initialize();
            assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
        });
        test('getWorkspaceBackups() should return [] when files.hotExit = "onExitAndWindowClose"', async () => {
            const upperFooPath = fooFile.fsPath.toUpperCase();
            service.registerWorkspaceBackup(toWorkspaceBackupInfo(upperFooPath));
            assert.strictEqual(service.testGetWorkspaceBackups().length, 1);
            assert.deepStrictEqual(service.testGetWorkspaceBackups().map(r => r.workspace.configPath.toString()), [URI.file(upperFooPath).toString()]);
            configService.setUserConfiguration('files.hotExit', HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE);
            await service.initialize();
            assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
        });
        test('getEmptyWorkspaceBackupPaths() should return [] when workspaces.json doesn\'t exist', () => {
            assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
        });
        test('getEmptyWorkspaceBackupPaths() should return [] when folderWorkspaces in workspaces.json is absent', async () => {
            writeWorkspacesMetadata('{}');
            await service.initialize();
            assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
        });
        test('getEmptyWorkspaceBackupPaths() should return [] when folderWorkspaces in workspaces.json is not a string array', async function () {
            writeWorkspacesMetadata('{"emptyWorkspaces":{}}');
            await service.initialize();
            assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
            writeWorkspacesMetadata('{"emptyWorkspaces":{"foo": ["bar"]}}');
            await service.initialize();
            assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
            writeWorkspacesMetadata('{"emptyWorkspaces":{"foo": []}}');
            await service.initialize();
            assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
            writeWorkspacesMetadata('{"emptyWorkspaces":{"foo": "bar"}}');
            await service.initialize();
            assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
            writeWorkspacesMetadata('{"emptyWorkspaces":"foo"}');
            await service.initialize();
            assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
            writeWorkspacesMetadata('{"emptyWorkspaces":1}');
            await service.initialize();
            assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
        });
    });
    suite('dedupeFolderWorkspaces', () => {
        test('should ignore duplicates (folder workspace)', async () => {
            await ensureFolderExists(existingTestFolder1);
            const workspacesJson = {
                workspaces: [],
                folders: [{ folderUri: existingTestFolder1.toString() }, { folderUri: existingTestFolder1.toString() }],
                emptyWindows: []
            };
            writeWorkspacesMetadata(JSON.stringify(workspacesJson));
            await service.initialize();
            const json = readWorkspacesMetadata();
            assert.deepStrictEqual(json.folders, [{ folderUri: existingTestFolder1.toString() }]);
        });
        test('should ignore duplicates on Windows and Mac (folder workspace)', async () => {
            await ensureFolderExists(existingTestFolder1);
            const workspacesJson = {
                workspaces: [],
                folders: [{ folderUri: existingTestFolder1.toString() }, { folderUri: existingTestFolder1.toString().toLowerCase() }],
                emptyWindows: []
            };
            writeWorkspacesMetadata(JSON.stringify(workspacesJson));
            await service.initialize();
            const json = readWorkspacesMetadata();
            assert.deepStrictEqual(json.folders, [{ folderUri: existingTestFolder1.toString() }]);
        });
        test('should ignore duplicates on Windows and Mac (root workspace)', async () => {
            const workspacePath = path.join(testDir, 'Foo.code-workspace');
            const workspacePath1 = path.join(testDir, 'FOO.code-workspace');
            const workspacePath2 = path.join(testDir, 'foo.code-workspace');
            const workspace1 = await ensureWorkspaceExists(toWorkspace(workspacePath));
            const workspace2 = await ensureWorkspaceExists(toWorkspace(workspacePath1));
            const workspace3 = await ensureWorkspaceExists(toWorkspace(workspacePath2));
            const workspacesJson = {
                workspaces: [workspace1, workspace2, workspace3].map(toSerializedWorkspace),
                folders: [],
                emptyWindows: []
            };
            writeWorkspacesMetadata(JSON.stringify(workspacesJson));
            await service.initialize();
            const json = readWorkspacesMetadata();
            assert.strictEqual(json.workspaces.length, platform.isLinux ? 3 : 1);
            if (platform.isLinux) {
                assert.deepStrictEqual(json.workspaces.map(r => r.configURIPath), [URI.file(workspacePath).toString(), URI.file(workspacePath1).toString(), URI.file(workspacePath2).toString()]);
            }
            else {
                assert.deepStrictEqual(json.workspaces.map(r => r.configURIPath), [URI.file(workspacePath).toString()], 'should return the first duplicated entry');
            }
        });
    });
    suite('registerWindowForBackups', () => {
        test('should persist paths to workspaces.json (folder workspace)', async () => {
            service.registerFolderBackup(toFolderBackupInfo(fooFile));
            service.registerFolderBackup(toFolderBackupInfo(barFile));
            assertEqualFolderInfos(service.testGetFolderBackups(), [toFolderBackupInfo(fooFile), toFolderBackupInfo(barFile)]);
            const json = readWorkspacesMetadata();
            assert.deepStrictEqual(json.folders, [{ folderUri: fooFile.toString() }, { folderUri: barFile.toString() }]);
        });
        test('should persist paths to workspaces.json (root workspace)', async () => {
            const ws1 = toWorkspaceBackupInfo(fooFile.fsPath);
            service.registerWorkspaceBackup(ws1);
            const ws2 = toWorkspaceBackupInfo(barFile.fsPath);
            service.registerWorkspaceBackup(ws2);
            assert.deepStrictEqual(service.testGetWorkspaceBackups().map(b => b.workspace.configPath.toString()), [fooFile.toString(), barFile.toString()]);
            assert.strictEqual(ws1.workspace.id, service.testGetWorkspaceBackups()[0].workspace.id);
            assert.strictEqual(ws2.workspace.id, service.testGetWorkspaceBackups()[1].workspace.id);
            const json = readWorkspacesMetadata();
            assert.deepStrictEqual(json.workspaces.map(b => b.configURIPath), [fooFile.toString(), barFile.toString()]);
            assert.strictEqual(ws1.workspace.id, json.workspaces[0].id);
            assert.strictEqual(ws2.workspace.id, json.workspaces[1].id);
        });
    });
    test('should always store the workspace path in workspaces.json using the case given, regardless of whether the file system is case-sensitive (folder workspace)', async () => {
        service.registerFolderBackup(toFolderBackupInfo(URI.file(fooFile.fsPath.toUpperCase())));
        assertEqualFolderInfos(service.testGetFolderBackups(), [toFolderBackupInfo(URI.file(fooFile.fsPath.toUpperCase()))]);
        const json = readWorkspacesMetadata();
        assert.deepStrictEqual(json.folders, [{ folderUri: URI.file(fooFile.fsPath.toUpperCase()).toString() }]);
    });
    test('should always store the workspace path in workspaces.json using the case given, regardless of whether the file system is case-sensitive (root workspace)', async () => {
        const upperFooPath = fooFile.fsPath.toUpperCase();
        service.registerWorkspaceBackup(toWorkspaceBackupInfo(upperFooPath));
        assert.deepStrictEqual(service.testGetWorkspaceBackups().map(b => b.workspace.configPath.toString()), [URI.file(upperFooPath).toString()]);
        const json = readWorkspacesMetadata();
        assert.deepStrictEqual(json.workspaces.map(b => b.configURIPath), [URI.file(upperFooPath).toString()]);
    });
    suite('getWorkspaceHash', () => {
        (platform.isLinux ? test.skip : test)('should ignore case on Windows and Mac', () => {
            const assertFolderHash = (uri1, uri2) => {
                assert.strictEqual(service.testGetFolderHash(toFolderBackupInfo(uri1)), service.testGetFolderHash(toFolderBackupInfo(uri2)));
            };
            if (platform.isMacintosh) {
                assertFolderHash(URI.file('/foo'), URI.file('/FOO'));
            }
            if (platform.isWindows) {
                assertFolderHash(URI.file('c:\\foo'), URI.file('C:\\FOO'));
            }
        });
    });
    suite('mixed path casing', () => {
        test('should handle case insensitive paths properly (registerWindowForBackupsSync) (folder workspace)', () => {
            service.registerFolderBackup(toFolderBackupInfo(fooFile));
            service.registerFolderBackup(toFolderBackupInfo(URI.file(fooFile.fsPath.toUpperCase())));
            if (platform.isLinux) {
                assert.strictEqual(service.testGetFolderBackups().length, 2);
            }
            else {
                assert.strictEqual(service.testGetFolderBackups().length, 1);
            }
        });
        test('should handle case insensitive paths properly (registerWindowForBackupsSync) (root workspace)', () => {
            service.registerWorkspaceBackup(toWorkspaceBackupInfo(fooFile.fsPath));
            service.registerWorkspaceBackup(toWorkspaceBackupInfo(fooFile.fsPath.toUpperCase()));
            if (platform.isLinux) {
                assert.strictEqual(service.testGetWorkspaceBackups().length, 2);
            }
            else {
                assert.strictEqual(service.testGetWorkspaceBackups().length, 1);
            }
        });
    });
    suite('getDirtyWorkspaces', () => {
        test('should report if a workspace or folder has backups', async () => {
            const folderBackupPath = service.registerFolderBackup(toFolderBackupInfo(fooFile));
            const backupWorkspaceInfo = toWorkspaceBackupInfo(fooFile.fsPath);
            const workspaceBackupPath = service.registerWorkspaceBackup(backupWorkspaceInfo);
            assert.strictEqual(((await service.getDirtyWorkspaces()).length), 0);
            try {
                await fs.promises.mkdir(path.join(folderBackupPath, Schemas.file), { recursive: true });
                await fs.promises.mkdir(path.join(workspaceBackupPath, Schemas.untitled), { recursive: true });
            }
            catch {
                // ignore - folder might exist already
            }
            assert.strictEqual(((await service.getDirtyWorkspaces()).length), 0);
            fs.writeFileSync(path.join(folderBackupPath, Schemas.file, '594a4a9d82a277a899d4713a5b08f504'), '');
            fs.writeFileSync(path.join(workspaceBackupPath, Schemas.untitled, '594a4a9d82a277a899d4713a5b08f504'), '');
            const dirtyWorkspaces = await service.getDirtyWorkspaces();
            assert.strictEqual(dirtyWorkspaces.length, 2);
            let found = 0;
            for (const dirtyWorkpspace of dirtyWorkspaces) {
                if (isFolderBackupInfo(dirtyWorkpspace)) {
                    if (isEqual(fooFile, dirtyWorkpspace.folderUri)) {
                        found++;
                    }
                }
                else {
                    if (isEqual(backupWorkspaceInfo.workspace.configPath, dirtyWorkpspace.workspace.configPath)) {
                        found++;
                    }
                }
            }
            assert.strictEqual(found, 2);
        });
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja3VwTWFpblNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2JhY2t1cC90ZXN0L2VsZWN0cm9uLW1haW4vYmFja3VwTWFpblNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUNwQyxPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxLQUFLLElBQUksTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEtBQUssUUFBUSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3hELE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN4RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUU3RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUMxRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUN0RyxPQUFPLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FB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