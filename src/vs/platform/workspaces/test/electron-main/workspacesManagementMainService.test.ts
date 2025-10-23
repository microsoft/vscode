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
import { IWorkspaceBackupInfo, IFolderBackupInfo } from '../../../backup/common/backup.js';
import { IBackupMainService } from '../../../backup/electron-main/backup.js';
import { IEmptyWindowBackupInfo } from '../../../backup/node/backup.js';
import { INativeOpenDialogOptions } from '../../../dialogs/common/dialogs.js';
import { IDialogMainService } from '../../../dialogs/electron-main/dialogMainService.js';
import { EnvironmentMainService } from '../../../environment/electron-main/environmentMainService.js';
import { OPTIONS, parseArgs } from '../../../environment/node/argv.js';
import { FileService } from '../../../files/common/fileService.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { SaveStrategy, StateService } from '../../../state/node/stateService.js';
import { UriIdentityService } from '../../../uriIdentity/common/uriIdentityService.js';
import { UserDataProfilesMainService } from '../../../userDataProfile/electron-main/userDataProfile.js';
import { IRawFileWorkspaceFolder, IRawUriWorkspaceFolder, WORKSPACE_EXTENSION } from '../../../workspace/common/workspace.js';
import { IStoredWorkspace, IStoredWorkspaceFolder, IWorkspaceFolderCreationData, rewriteWorkspaceFileForNewLocation } from '../../common/workspaces.js';
import { WorkspacesManagementMainService } from '../../electron-main/workspacesManagementMainService.js';

flakySuite('WorkspacesManagementMainService', () => {

	class TestDialogMainService implements IDialogMainService {

		declare readonly _serviceBrand: undefined;

		pickFileFolder(options: INativeOpenDialogOptions, window?: Electron.BrowserWindow | undefined): Promise<string[] | undefined> { throw new Error('Method not implemented.'); }
		pickFolder(options: INativeOpenDialogOptions, window?: Electron.BrowserWindow | undefined): Promise<string[] | undefined> { throw new Error('Method not implemented.'); }
		pickFile(options: INativeOpenDialogOptions, window?: Electron.BrowserWindow | undefined): Promise<string[] | undefined> { throw new Error('Method not implemented.'); }
		pickWorkspace(options: INativeOpenDialogOptions, window?: Electron.BrowserWindow | undefined): Promise<string[] | undefined> { throw new Error('Method not implemented.'); }
		showMessageBox(options: Electron.MessageBoxOptions, window?: Electron.BrowserWindow | undefined): Promise<Electron.MessageBoxReturnValue> { throw new Error('Method not implemented.'); }
		showSaveDialog(options: Electron.SaveDialogOptions, window?: Electron.BrowserWindow | undefined): Promise<Electron.SaveDialogReturnValue> { throw new Error('Method not implemented.'); }
		showOpenDialog(options: Electron.OpenDialogOptions, window?: Electron.BrowserWindow | undefined): Promise<Electron.OpenDialogReturnValue> { throw new Error('Method not implemented.'); }
	}

	class TestBackupMainService implements IBackupMainService {

		declare readonly _serviceBrand: undefined;

		isHotExitEnabled(): boolean { throw new Error('Method not implemented.'); }
		getEmptyWindowBackups(): IEmptyWindowBackupInfo[] { throw new Error('Method not implemented.'); }
		registerWorkspaceBackup(workspaceInfo: IWorkspaceBackupInfo): string;
		registerWorkspaceBackup(workspaceInfo: IWorkspaceBackupInfo, migrateFrom: string): Promise<string>;
		registerWorkspaceBackup(workspaceInfo: unknown, migrateFrom?: unknown): string | Promise<string> { throw new Error('Method not implemented.'); }
		registerFolderBackup(folder: IFolderBackupInfo): string { throw new Error('Method not implemented.'); }
		registerEmptyWindowBackup(empty: IEmptyWindowBackupInfo): string { throw new Error('Method not implemented.'); }
		async getDirtyWorkspaces(): Promise<(IWorkspaceBackupInfo | IFolderBackupInfo)[]> { return []; }
	}

	function createUntitledWorkspace(folders: string[], names?: string[]) {
		return service.createUntitledWorkspace(folders.map((folder, index) => ({ uri: URI.file(folder), name: names ? names[index] : undefined } as IWorkspaceFolderCreationData)));
	}

	function createWorkspace(workspaceConfigPath: string, folders: (string | URI)[], names?: string[]): void {
		const ws: IStoredWorkspace = {
			folders: []
		};

		for (let i = 0; i < folders.length; i++) {
			const f = folders[i];
			const s: IStoredWorkspaceFolder = f instanceof URI ? { uri: f.toString() } : { path: f };
			if (names) {
				s.name = names[i];
			}
			ws.folders.push(s);
		}

		fs.writeFileSync(workspaceConfigPath, JSON.stringify(ws));
	}

	let testDir: string;
	let untitledWorkspacesHomePath: string;
	let environmentMainService: EnvironmentMainService;
	let service: WorkspacesManagementMainService;

	const cwd = process.cwd();
	const tmpDir = os.tmpdir();

	setup(async () => {
		testDir = getRandomTestPath(tmpDir, 'vsctests', 'workspacesmanagementmainservice');
		untitledWorkspacesHomePath = path.join(testDir, 'Workspaces');

		const productService: IProductService = { _serviceBrand: undefined, ...product };

		environmentMainService = new class TestEnvironmentService extends EnvironmentMainService {

			constructor() {
				super(parseArgs(process.argv, OPTIONS), productService);
			}

			override get untitledWorkspacesHome(): URI {
				return URI.file(untitledWorkspacesHomePath);
			}
		};

		const logService = new NullLogService();
		const fileService = new FileService(logService);
		service = new WorkspacesManagementMainService(environmentMainService, logService, new UserDataProfilesMainService(new StateService(SaveStrategy.DELAYED, environmentMainService, logService, fileService), new UriIdentityService(fileService), environmentMainService, fileService, logService), new TestBackupMainService(), new TestDialogMainService());

		return fs.promises.mkdir(untitledWorkspacesHomePath, { recursive: true });
	});

	teardown(() => {
		service.dispose();

		return pfs.Promises.rm(testDir);
	});

	function assertPathEquals(pathInWorkspaceFile: string, pathOnDisk: string): void {
		if (isWindows) {
			pathInWorkspaceFile = normalizeDriveLetter(pathInWorkspaceFile);
			pathOnDisk = normalizeDriveLetter(pathOnDisk);
			if (!isUNC(pathOnDisk)) {
				pathOnDisk = toSlashes(pathOnDisk); // workspace file is using slashes for all paths except where mandatory
			}
		}

		assert.strictEqual(pathInWorkspaceFile, pathOnDisk);
	}

	function assertEqualURI(u1: URI, u2: URI): void {
		assert.strictEqual(u1.toString(), u2.toString());
	}

	test('createWorkspace (folders)', async () => {
		const workspace = await createUntitledWorkspace([cwd, tmpDir]);
		assert.ok(workspace);
		assert.ok(fs.existsSync(workspace.configPath.fsPath));
		assert.ok(service.isUntitledWorkspace(workspace));

		const ws = (JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString()) as IStoredWorkspace);
		assert.strictEqual(ws.folders.length, 2);
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[0]).path, cwd);
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[1]).path, tmpDir);
		assert.ok(!(<IRawFileWorkspaceFolder>ws.folders[0]).name);
		assert.ok(!(<IRawFileWorkspaceFolder>ws.folders[1]).name);
	});

	test('createWorkspace (folders with name)', async () => {
		const workspace = await createUntitledWorkspace([cwd, tmpDir], ['currentworkingdirectory', 'tempdir']);
		assert.ok(workspace);
		assert.ok(fs.existsSync(workspace.configPath.fsPath));
		assert.ok(service.isUntitledWorkspace(workspace));

		const ws = (JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString()) as IStoredWorkspace);
		assert.strictEqual(ws.folders.length, 2);
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[0]).path, cwd);
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[1]).path, tmpDir);
		assert.strictEqual((<IRawFileWorkspaceFolder>ws.folders[0]).name, 'currentworkingdirectory');
		assert.strictEqual((<IRawFileWorkspaceFolder>ws.folders[1]).name, 'tempdir');
	});

	test('createUntitledWorkspace (folders as other resource URIs)', async () => {
		const folder1URI = URI.parse('myscheme://server/work/p/f1');
		const folder2URI = URI.parse('myscheme://server/work/o/f3');

		const workspace = await service.createUntitledWorkspace([{ uri: folder1URI }, { uri: folder2URI }], 'server');
		assert.ok(workspace);
		assert.ok(fs.existsSync(workspace.configPath.fsPath));
		assert.ok(service.isUntitledWorkspace(workspace));

		const ws = (JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString()) as IStoredWorkspace);
		assert.strictEqual(ws.folders.length, 2);
		assert.strictEqual((<IRawUriWorkspaceFolder>ws.folders[0]).uri, folder1URI.toString(true));
		assert.strictEqual((<IRawUriWorkspaceFolder>ws.folders[1]).uri, folder2URI.toString(true));
		assert.ok(!(<IRawFileWorkspaceFolder>ws.folders[0]).name);
		assert.ok(!(<IRawFileWorkspaceFolder>ws.folders[1]).name);
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
		assert.strictEqual(2, resolved!.folders.length);
		assertEqualURI(resolved!.configPath, workspace.configPath);
		assert.ok(resolved!.id);
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
		assertEqualURI(resolved!.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), 'ticino-playground', 'lib')));
	});

	test('resolveWorkspace (support relative paths #2)', async () => {
		const workspace = await createUntitledWorkspace([cwd, tmpDir]);
		fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ folders: [{ path: './ticino-playground/lib/../other' }] }));

		const resolved = await service.resolveLocalWorkspace(workspace.configPath);
		assertEqualURI(resolved!.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), 'ticino-playground', 'other')));
	});

	test('resolveWorkspace (support relative paths #3)', async () => {
		const workspace = await createUntitledWorkspace([cwd, tmpDir]);
		fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ folders: [{ path: 'ticino-playground/lib' }] }));

		const resolved = await service.resolveLocalWorkspace(workspace.configPath);
		assertEqualURI(resolved!.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), 'ticino-playground', 'lib')));
	});

	test('resolveWorkspace (support invalid JSON via fault tolerant parsing)', async () => {
		const workspace = await createUntitledWorkspace([cwd, tmpDir]);
		fs.writeFileSync(workspace.configPath.fsPath, '{ "folders": [ { "path": "./ticino-playground/lib" } , ] }'); // trailing comma

		const resolved = await service.resolveLocalWorkspace(workspace.configPath);
		assertEqualURI(resolved!.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), 'ticino-playground', 'lib')));
	});

	test('rewriteWorkspaceFileForNewLocation', async () => {
		const folder1 = cwd;  // absolute path because outside of tmpDir
		const tmpInsideDir = path.join(tmpDir, 'inside');

		const firstConfigPath = path.join(tmpDir, 'myworkspace0.code-workspace');
		createWorkspace(firstConfigPath, [folder1, 'inside', path.join('inside', 'somefolder')]);
		const origContent = fs.readFileSync(firstConfigPath).toString();

		let origConfigPath = URI.file(firstConfigPath);
		let workspaceConfigPath = URI.file(path.join(tmpDir, 'inside', 'myworkspace1.code-workspace'));
		let newContent = rewriteWorkspaceFileForNewLocation(origContent, origConfigPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
		let ws = (JSON.parse(newContent) as IStoredWorkspace);
		assert.strictEqual(ws.folders.length, 3);
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[0]).path, folder1); // absolute path because outside of tmpdir
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[1]).path, '.');
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[2]).path, 'somefolder');

		origConfigPath = workspaceConfigPath;
		workspaceConfigPath = URI.file(path.join(tmpDir, 'myworkspace2.code-workspace'));
		newContent = rewriteWorkspaceFileForNewLocation(newContent, origConfigPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
		ws = (JSON.parse(newContent) as IStoredWorkspace);
		assert.strictEqual(ws.folders.length, 3);
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[0]).path, folder1);
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[1]).path, 'inside');
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[2]).path, 'inside/somefolder');

		origConfigPath = workspaceConfigPath;
		workspaceConfigPath = URI.file(path.join(tmpDir, 'other', 'myworkspace2.code-workspace'));
		newContent = rewriteWorkspaceFileForNewLocation(newContent, origConfigPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
		ws = (JSON.parse(newContent) as IStoredWorkspace);
		assert.strictEqual(ws.folders.length, 3);
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[0]).path, folder1);
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[1]).path, '../inside');
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[2]).path, '../inside/somefolder');

		origConfigPath = workspaceConfigPath;
		workspaceConfigPath = URI.parse('foo://foo/bar/myworkspace2.code-workspace');
		newContent = rewriteWorkspaceFileForNewLocation(newContent, origConfigPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
		ws = (JSON.parse(newContent) as IStoredWorkspace);
		assert.strictEqual(ws.folders.length, 3);
		assert.strictEqual((<IRawUriWorkspaceFolder>ws.folders[0]).uri, URI.file(folder1).toString(true));
		assert.strictEqual((<IRawUriWorkspaceFolder>ws.folders[1]).uri, URI.file(tmpInsideDir).toString(true));
		assert.strictEqual((<IRawUriWorkspaceFolder>ws.folders[2]).uri, URI.file(path.join(tmpInsideDir, 'somefolder')).toString(true));

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
		const ws = (JSON.parse(newContent) as IStoredWorkspace);
		assert.ok(ws.folders.every(f => (<IRawFileWorkspaceFolder>f).path.indexOf('\\') < 0));
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
		const ws = (JSON.parse(newContent) as IStoredWorkspace);
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[0]).path, folder1Location);
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[1]).path, folder2Location);
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[2]).path, 'inner/more');

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
