/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { isUNC, toSlashes } from '../../../../base/common/extpath.js';
import { normalizeDriveLetter } from '../../../../base/common/labels.js';
import * as path from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import * as pfs from '../../../../base/node/pfs.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { flakySuite, getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import { EnvironmentMainService } from '../../../environment/electron-main/environmentMainService.js';
import { OPTIONS, parseArgs } from '../../../environment/node/argv.js';
import { FileService } from '../../../files/common/fileService.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { StateService } from '../../../state/node/stateService.js';
import { UriIdentityService } from '../../../uriIdentity/common/uriIdentityService.js';
import { UserDataProfilesMainService } from '../../../userDataProfile/electron-main/userDataProfile.js';
import { WORKSPACE_EXTENSION } from '../../../workspace/common/workspace.js';
import { rewriteWorkspaceFileForNewLocation } from '../../common/workspaces.js';
import { WorkspacesManagementMainService } from '../../electron-main/workspacesManagementMainService.js';
flakySuite('WorkspacesManagementMainService', () => {
    class TestDialogMainService {
        pickFileFolder(options, window) { throw new Error('Method not implemented.'); }
        pickFolder(options, window) { throw new Error('Method not implemented.'); }
        pickFile(options, window) { throw new Error('Method not implemented.'); }
        pickWorkspace(options, window) { throw new Error('Method not implemented.'); }
        showMessageBox(options, window) { throw new Error('Method not implemented.'); }
        showSaveDialog(options, window) { throw new Error('Method not implemented.'); }
        showOpenDialog(options, window) { throw new Error('Method not implemented.'); }
    }
    class TestBackupMainService {
        isHotExitEnabled() { throw new Error('Method not implemented.'); }
        getEmptyWindowBackups() { throw new Error('Method not implemented.'); }
        registerWorkspaceBackup(workspaceInfo, migrateFrom) { throw new Error('Method not implemented.'); }
        registerFolderBackup(folder) { throw new Error('Method not implemented.'); }
        registerEmptyWindowBackup(empty) { throw new Error('Method not implemented.'); }
        async getDirtyWorkspaces() { return []; }
    }
    function createUntitledWorkspace(folders, names) {
        return service.createUntitledWorkspace(folders.map((folder, index) => ({ uri: URI.file(folder), name: names ? names[index] : undefined })));
    }
    function createWorkspace(workspaceConfigPath, folders, names) {
        const ws = {
            folders: []
        };
        for (let i = 0; i < folders.length; i++) {
            const f = folders[i];
            const s = f instanceof URI ? { uri: f.toString() } : { path: f };
            if (names) {
                s.name = names[i];
            }
            ws.folders.push(s);
        }
        fs.writeFileSync(workspaceConfigPath, JSON.stringify(ws));
    }
    let testDir;
    let untitledWorkspacesHomePath;
    let environmentMainService;
    let service;
    const cwd = process.cwd();
    const tmpDir = os.tmpdir();
    setup(async () => {
        testDir = getRandomTestPath(tmpDir, 'vsctests', 'workspacesmanagementmainservice');
        untitledWorkspacesHomePath = path.join(testDir, 'Workspaces');
        const productService = { _serviceBrand: undefined, ...product };
        environmentMainService = new class TestEnvironmentService extends EnvironmentMainService {
            constructor() {
                super(parseArgs(process.argv, OPTIONS), productService);
            }
            get untitledWorkspacesHome() {
                return URI.file(untitledWorkspacesHomePath);
            }
        };
        const logService = new NullLogService();
        const fileService = new FileService(logService);
        service = new WorkspacesManagementMainService(environmentMainService, logService, new UserDataProfilesMainService(new StateService(1 /* SaveStrategy.DELAYED */, environmentMainService, logService, fileService), new UriIdentityService(fileService), environmentMainService, fileService, logService), new TestBackupMainService(), new TestDialogMainService());
        return fs.promises.mkdir(untitledWorkspacesHomePath, { recursive: true });
    });
    teardown(() => {
        service.dispose();
        return pfs.Promises.rm(testDir);
    });
    function assertPathEquals(pathInWorkspaceFile, pathOnDisk) {
        if (isWindows) {
            pathInWorkspaceFile = normalizeDriveLetter(pathInWorkspaceFile);
            pathOnDisk = normalizeDriveLetter(pathOnDisk);
            if (!isUNC(pathOnDisk)) {
                pathOnDisk = toSlashes(pathOnDisk); // workspace file is using slashes for all paths except where mandatory
            }
        }
        assert.strictEqual(pathInWorkspaceFile, pathOnDisk);
    }
    function assertEqualURI(u1, u2) {
        assert.strictEqual(u1.toString(), u2.toString());
    }
    test('createWorkspace (folders)', async () => {
        const workspace = await createUntitledWorkspace([cwd, tmpDir]);
        assert.ok(workspace);
        assert.ok(fs.existsSync(workspace.configPath.fsPath));
        assert.ok(service.isUntitledWorkspace(workspace));
        const ws = JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString());
        assert.strictEqual(ws.folders.length, 2);
        assertPathEquals(ws.folders[0].path, cwd);
        assertPathEquals(ws.folders[1].path, tmpDir);
        assert.ok(!ws.folders[0].name);
        assert.ok(!ws.folders[1].name);
    });
    test('createWorkspace (folders with name)', async () => {
        const workspace = await createUntitledWorkspace([cwd, tmpDir], ['currentworkingdirectory', 'tempdir']);
        assert.ok(workspace);
        assert.ok(fs.existsSync(workspace.configPath.fsPath));
        assert.ok(service.isUntitledWorkspace(workspace));
        const ws = JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString());
        assert.strictEqual(ws.folders.length, 2);
        assertPathEquals(ws.folders[0].path, cwd);
        assertPathEquals(ws.folders[1].path, tmpDir);
        assert.strictEqual(ws.folders[0].name, 'currentworkingdirectory');
        assert.strictEqual(ws.folders[1].name, 'tempdir');
    });
    test('createUntitledWorkspace (folders as other resource URIs)', async () => {
        const folder1URI = URI.parse('myscheme://server/work/p/f1');
        const folder2URI = URI.parse('myscheme://server/work/o/f3');
        const workspace = await service.createUntitledWorkspace([{ uri: folder1URI }, { uri: folder2URI }], 'server');
        assert.ok(workspace);
        assert.ok(fs.existsSync(workspace.configPath.fsPath));
        assert.ok(service.isUntitledWorkspace(workspace));
        const ws = JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString());
        assert.strictEqual(ws.folders.length, 2);
        assert.strictEqual(ws.folders[0].uri, folder1URI.toString(true));
        assert.strictEqual(ws.folders[1].uri, folder2URI.toString(true));
        assert.ok(!ws.folders[0].name);
        assert.ok(!ws.folders[1].name);
        assert.strictEqual(ws.remoteAuthority, 'server');
    });
    test('resolveWorkspace', async () => {
        const workspace = await createUntitledWorkspace([cwd, tmpDir]);
        assert.ok(await service.resolveLocalWorkspace(workspace.configPath));
        // make it a valid workspace path
        const newPath = path.join(path.dirname(workspace.configPath.fsPath), `workspace.${WORKSPACE_EXTENSION}`);
        fs.renameSync(workspace.configPath.fsPath, newPath);
        workspace.configPath = URI.file(newPath);
        const resolved = await service.resolveLocalWorkspace(workspace.configPath);
        assert.strictEqual(2, resolved.folders.length);
        assertEqualURI(resolved.configPath, workspace.configPath);
        assert.ok(resolved.id);
        fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ something: 'something' })); // invalid workspace
        const resolvedInvalid = await service.resolveLocalWorkspace(workspace.configPath);
        assert.ok(!resolvedInvalid);
        fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ transient: true, folders: [] })); // transient worksapce
        const resolvedTransient = await service.resolveLocalWorkspace(workspace.configPath);
        assert.ok(resolvedTransient?.transient);
    });
    test('resolveWorkspace (support relative paths)', async () => {
        const workspace = await createUntitledWorkspace([cwd, tmpDir]);
        fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ folders: [{ path: './ticino-playground/lib' }] }));
        const resolved = await service.resolveLocalWorkspace(workspace.configPath);
        assertEqualURI(resolved.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), 'ticino-playground', 'lib')));
    });
    test('resolveWorkspace (support relative paths #2)', async () => {
        const workspace = await createUntitledWorkspace([cwd, tmpDir]);
        fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ folders: [{ path: './ticino-playground/lib/../other' }] }));
        const resolved = await service.resolveLocalWorkspace(workspace.configPath);
        assertEqualURI(resolved.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), 'ticino-playground', 'other')));
    });
    test('resolveWorkspace (support relative paths #3)', async () => {
        const workspace = await createUntitledWorkspace([cwd, tmpDir]);
        fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ folders: [{ path: 'ticino-playground/lib' }] }));
        const resolved = await service.resolveLocalWorkspace(workspace.configPath);
        assertEqualURI(resolved.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), 'ticino-playground', 'lib')));
    });
    test('resolveWorkspace (support invalid JSON via fault tolerant parsing)', async () => {
        const workspace = await createUntitledWorkspace([cwd, tmpDir]);
        fs.writeFileSync(workspace.configPath.fsPath, '{ "folders": [ { "path": "./ticino-playground/lib" } , ] }'); // trailing comma
        const resolved = await service.resolveLocalWorkspace(workspace.configPath);
        assertEqualURI(resolved.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), 'ticino-playground', 'lib')));
    });
    test('rewriteWorkspaceFileForNewLocation', async () => {
        const folder1 = cwd; // absolute path because outside of tmpDir
        const tmpInsideDir = path.join(tmpDir, 'inside');
        const firstConfigPath = path.join(tmpDir, 'myworkspace0.code-workspace');
        createWorkspace(firstConfigPath, [folder1, 'inside', path.join('inside', 'somefolder')]);
        const origContent = fs.readFileSync(firstConfigPath).toString();
        let origConfigPath = URI.file(firstConfigPath);
        let workspaceConfigPath = URI.file(path.join(tmpDir, 'inside', 'myworkspace1.code-workspace'));
        let newContent = rewriteWorkspaceFileForNewLocation(origContent, origConfigPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
        let ws = JSON.parse(newContent);
        assert.strictEqual(ws.folders.length, 3);
        assertPathEquals(ws.folders[0].path, folder1); // absolute path because outside of tmpdir
        assertPathEquals(ws.folders[1].path, '.');
        assertPathEquals(ws.folders[2].path, 'somefolder');
        origConfigPath = workspaceConfigPath;
        workspaceConfigPath = URI.file(path.join(tmpDir, 'myworkspace2.code-workspace'));
        newContent = rewriteWorkspaceFileForNewLocation(newContent, origConfigPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
        ws = JSON.parse(newContent);
        assert.strictEqual(ws.folders.length, 3);
        assertPathEquals(ws.folders[0].path, folder1);
        assertPathEquals(ws.folders[1].path, 'inside');
        assertPathEquals(ws.folders[2].path, 'inside/somefolder');
        origConfigPath = workspaceConfigPath;
        workspaceConfigPath = URI.file(path.join(tmpDir, 'other', 'myworkspace2.code-workspace'));
        newContent = rewriteWorkspaceFileForNewLocation(newContent, origConfigPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
        ws = JSON.parse(newContent);
        assert.strictEqual(ws.folders.length, 3);
        assertPathEquals(ws.folders[0].path, folder1);
        assertPathEquals(ws.folders[1].path, '../inside');
        assertPathEquals(ws.folders[2].path, '../inside/somefolder');
        origConfigPath = workspaceConfigPath;
        workspaceConfigPath = URI.parse('foo://foo/bar/myworkspace2.code-workspace');
        newContent = rewriteWorkspaceFileForNewLocation(newContent, origConfigPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
        ws = JSON.parse(newContent);
        assert.strictEqual(ws.folders.length, 3);
        assert.strictEqual(ws.folders[0].uri, URI.file(folder1).toString(true));
        assert.strictEqual(ws.folders[1].uri, URI.file(tmpInsideDir).toString(true));
        assert.strictEqual(ws.folders[2].uri, URI.file(path.join(tmpInsideDir, 'somefolder')).toString(true));
        fs.unlinkSync(firstConfigPath);
    });
    test('rewriteWorkspaceFileForNewLocation (preserves comments)', async () => {
        const workspace = await createUntitledWorkspace([cwd, tmpDir, path.join(tmpDir, 'somefolder')]);
        const workspaceConfigPath = URI.file(path.join(tmpDir, `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`));
        let origContent = fs.readFileSync(workspace.configPath.fsPath).toString();
        origContent = `// this is a comment\n${origContent}`;
        const newContent = rewriteWorkspaceFileForNewLocation(origContent, workspace.configPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
        assert.strictEqual(0, newContent.indexOf('// this is a comment'));
        await service.deleteUntitledWorkspace(workspace);
    });
    test('rewriteWorkspaceFileForNewLocation (preserves forward slashes)', async () => {
        const workspace = await createUntitledWorkspace([cwd, tmpDir, path.join(tmpDir, 'somefolder')]);
        const workspaceConfigPath = URI.file(path.join(tmpDir, `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`));
        let origContent = fs.readFileSync(workspace.configPath.fsPath).toString();
        origContent = origContent.replace(/[\\]/g, '/'); // convert backslash to slash
        const newContent = rewriteWorkspaceFileForNewLocation(origContent, workspace.configPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
        const ws = JSON.parse(newContent);
        assert.ok(ws.folders.every(f => f.path.indexOf('\\') < 0));
        await service.deleteUntitledWorkspace(workspace);
    });
    (!isWindows ? test.skip : test)('rewriteWorkspaceFileForNewLocation (unc paths)', async () => {
        const workspaceLocation = path.join(tmpDir, 'wsloc');
        const folder1Location = 'x:\\foo';
        const folder2Location = '\\\\server\\share2\\some\\path';
        const folder3Location = path.join(workspaceLocation, 'inner', 'more');
        const workspace = await createUntitledWorkspace([folder1Location, folder2Location, folder3Location]);
        const workspaceConfigPath = URI.file(path.join(workspaceLocation, `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`));
        const origContent = fs.readFileSync(workspace.configPath.fsPath).toString();
        const newContent = rewriteWorkspaceFileForNewLocation(origContent, workspace.configPath, true, workspaceConfigPath, extUriBiasedIgnorePathCase);
        const ws = JSON.parse(newContent);
        assertPathEquals(ws.folders[0].path, folder1Location);
        assertPathEquals(ws.folders[1].path, folder2Location);
        assertPathEquals(ws.folders[2].path, 'inner/more');
        await service.deleteUntitledWorkspace(workspace);
    });
    test('deleteUntitledWorkspace (untitled)', async () => {
        const workspace = await createUntitledWorkspace([cwd, tmpDir]);
        assert.ok(fs.existsSync(workspace.configPath.fsPath));
        await service.deleteUntitledWorkspace(workspace);
        assert.ok(!fs.existsSync(workspace.configPath.fsPath));
    });
    test('deleteUntitledWorkspace (saved)', async () => {
        const workspace = await createUntitledWorkspace([cwd, tmpDir]);
        await service.deleteUntitledWorkspace(workspace);
    });
    test('getUntitledWorkspace', async function () {
        await service.initialize();
        let untitled = service.getUntitledWorkspaces();
        assert.strictEqual(untitled.length, 0);
        const untitledOne = await createUntitledWorkspace([cwd, tmpDir]);
        assert.ok(fs.existsSync(untitledOne.configPath.fsPath));
        await service.initialize();
        untitled = service.getUntitledWorkspaces();
        assert.strictEqual(1, untitled.length);
        assert.strictEqual(untitledOne.id, untitled[0].workspace.id);
        await service.deleteUntitledWorkspace(untitledOne);
        await service.initialize();
        untitled = service.getUntitledWorkspaces();
        assert.strictEqual(0, untitled.length);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vd29ya3NwYWNlcy90ZXN0L2VsZWN0cm9uLW1haW4vd29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3pFLE9BQU8sS0FBSyxJQUFJLE1BQU0saUNBQWlDLENBQUM7QUFDeEQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEtBQUssR0FBRyxNQUFNLDhCQUE4QixDQUFDO0FBQ3BELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQU14RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUN0RyxPQUFPLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztB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