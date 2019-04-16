/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'vs/base/common/path';
import * as pfs from 'vs/base/node/pfs';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { WorkspacesMainService, IStoredWorkspace } from 'vs/platform/workspaces/electron-main/workspacesMainService';
import { WORKSPACE_EXTENSION, IWorkspaceIdentifier, IRawFileWorkspaceFolder, IWorkspaceFolderCreationData, IRawUriWorkspaceFolder, rewriteWorkspaceFileForNewLocation } from 'vs/platform/workspaces/common/workspaces';
import { NullLogService } from 'vs/platform/log/common/log';
import { URI } from 'vs/base/common/uri';
import { getRandomTestPath } from 'vs/base/test/node/testUtils';
import { isWindows } from 'vs/base/common/platform';
import { normalizeDriveLetter } from 'vs/base/common/labels';

suite('WorkspacesMainService', () => {
	const parentDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'workspacesservice');
	const untitledWorkspacesHomePath = path.join(parentDir, 'Workspaces');

	class TestEnvironmentService extends EnvironmentService {
		get untitledWorkspacesHome(): URI {
			return URI.file(untitledWorkspacesHomePath);
		}
	}

	class TestWorkspacesMainService extends WorkspacesMainService {
		public deleteWorkspaceCall: IWorkspaceIdentifier;

		public deleteUntitledWorkspaceSync(workspace: IWorkspaceIdentifier): void {
			this.deleteWorkspaceCall = workspace;

			super.deleteUntitledWorkspaceSync(workspace);
		}
	}

	function createWorkspace(folders: string[], names?: string[]) {
		return service.createUntitledWorkspace(folders.map((folder, index) => ({ uri: URI.file(folder), name: names ? names[index] : undefined } as IWorkspaceFolderCreationData)));
	}

	function createWorkspaceSync(folders: string[], names?: string[]) {
		return service.createUntitledWorkspaceSync(folders.map((folder, index) => ({ uri: URI.file(folder), name: names ? names[index] : undefined } as IWorkspaceFolderCreationData)));
	}

	const environmentService = new TestEnvironmentService(parseArgs(process.argv), process.execPath);
	const logService = new NullLogService();

	let service: TestWorkspacesMainService;

	setup(() => {
		service = new TestWorkspacesMainService(environmentService, logService);

		// Delete any existing backups completely and then re-create it.
		return pfs.rimraf(untitledWorkspacesHomePath, pfs.RimRafMode.MOVE).then(() => {
			return pfs.mkdirp(untitledWorkspacesHomePath);
		});
	});

	teardown(() => {
		return pfs.rimraf(untitledWorkspacesHomePath, pfs.RimRafMode.MOVE);
	});

	function assertPathEquals(p1: string, p2: string): void {
		if (isWindows) {
			p1 = normalizeDriveLetter(p1);
			p2 = normalizeDriveLetter(p2);
		}

		assert.equal(p1, p2);
	}

	function assertEqualURI(u1: URI, u2: URI): void {
		assert.equal(u1.toString(), u2.toString());
	}

	test('createWorkspace (folders)', () => {
		return createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			assert.ok(workspace);
			assert.ok(fs.existsSync(workspace.configPath.fsPath));
			assert.ok(service.isUntitledWorkspace(workspace));

			const ws = JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString()) as IStoredWorkspace;
			assert.equal(ws.folders.length, 2); //
			assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[0]).path, process.cwd());
			assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[1]).path, os.tmpdir());

			assert.ok(!(<IRawFileWorkspaceFolder>ws.folders[0]).name);
			assert.ok(!(<IRawFileWorkspaceFolder>ws.folders[1]).name);
		});
	});

	test('createWorkspace (folders with name)', () => {
		return createWorkspace([process.cwd(), os.tmpdir()], ['currentworkingdirectory', 'tempdir']).then(workspace => {
			assert.ok(workspace);
			assert.ok(fs.existsSync(workspace.configPath.fsPath));
			assert.ok(service.isUntitledWorkspace(workspace));

			const ws = JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString()) as IStoredWorkspace;
			assert.equal(ws.folders.length, 2); //
			assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[0]).path, process.cwd());
			assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[1]).path, os.tmpdir());

			assert.equal((<IRawFileWorkspaceFolder>ws.folders[0]).name, 'currentworkingdirectory');
			assert.equal((<IRawFileWorkspaceFolder>ws.folders[1]).name, 'tempdir');
		});
	});

	test('createUntitledWorkspace (folders as other resource URIs)', () => {
		const folder1URI = URI.parse('myscheme://server/work/p/f1');
		const folder2URI = URI.parse('myscheme://server/work/o/f3');

		return service.createUntitledWorkspace([{ uri: folder1URI }, { uri: folder2URI }], 'server').then(workspace => {
			assert.ok(workspace);
			assert.ok(fs.existsSync(workspace.configPath.fsPath));
			assert.ok(service.isUntitledWorkspace(workspace));

			const ws = JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString()) as IStoredWorkspace;
			assert.equal(ws.folders.length, 2);
			assert.equal((<IRawUriWorkspaceFolder>ws.folders[0]).uri, folder1URI.toString(true));
			assert.equal((<IRawUriWorkspaceFolder>ws.folders[1]).uri, folder2URI.toString(true));

			assert.ok(!(<IRawFileWorkspaceFolder>ws.folders[0]).name);
			assert.ok(!(<IRawFileWorkspaceFolder>ws.folders[1]).name);

			assert.equal(ws.remoteAuthority, 'server');
		});
	});

	test('createWorkspaceSync (folders)', () => {
		const workspace = createWorkspaceSync([process.cwd(), os.tmpdir()]);
		assert.ok(workspace);
		assert.ok(fs.existsSync(workspace.configPath.fsPath));
		assert.ok(service.isUntitledWorkspace(workspace));

		const ws = JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString()) as IStoredWorkspace;
		assert.equal(ws.folders.length, 2);
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[0]).path, process.cwd());
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[1]).path, os.tmpdir());

		assert.ok(!(<IRawFileWorkspaceFolder>ws.folders[0]).name);
		assert.ok(!(<IRawFileWorkspaceFolder>ws.folders[1]).name);
	});

	test('createWorkspaceSync (folders with names)', () => {
		const workspace = createWorkspaceSync([process.cwd(), os.tmpdir()], ['currentworkingdirectory', 'tempdir']);
		assert.ok(workspace);
		assert.ok(fs.existsSync(workspace.configPath.fsPath));
		assert.ok(service.isUntitledWorkspace(workspace));

		const ws = JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString()) as IStoredWorkspace;
		assert.equal(ws.folders.length, 2);
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[0]).path, process.cwd());
		assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[1]).path, os.tmpdir());

		assert.equal((<IRawFileWorkspaceFolder>ws.folders[0]).name, 'currentworkingdirectory');
		assert.equal((<IRawFileWorkspaceFolder>ws.folders[1]).name, 'tempdir');
	});

	test('createUntitledWorkspaceSync (folders as other resource URIs)', () => {
		const folder1URI = URI.parse('myscheme://server/work/p/f1');
		const folder2URI = URI.parse('myscheme://server/work/o/f3');

		const workspace = service.createUntitledWorkspaceSync([{ uri: folder1URI }, { uri: folder2URI }]);
		assert.ok(workspace);
		assert.ok(fs.existsSync(workspace.configPath.fsPath));
		assert.ok(service.isUntitledWorkspace(workspace));

		const ws = JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString()) as IStoredWorkspace;
		assert.equal(ws.folders.length, 2);
		assert.equal((<IRawUriWorkspaceFolder>ws.folders[0]).uri, folder1URI.toString(true));
		assert.equal((<IRawUriWorkspaceFolder>ws.folders[1]).uri, folder2URI.toString(true));

		assert.ok(!(<IRawFileWorkspaceFolder>ws.folders[0]).name);
		assert.ok(!(<IRawFileWorkspaceFolder>ws.folders[1]).name);
	});

	test('resolveWorkspaceSync', () => {
		return createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			assert.ok(service.resolveLocalWorkspaceSync(workspace.configPath));

			// make it a valid workspace path
			const newPath = path.join(path.dirname(workspace.configPath.fsPath), `workspace.${WORKSPACE_EXTENSION}`);
			fs.renameSync(workspace.configPath.fsPath, newPath);
			workspace.configPath = URI.file(newPath);

			const resolved = service.resolveLocalWorkspaceSync(workspace.configPath);
			assert.equal(2, resolved!.folders.length);
			assertEqualURI(resolved!.configPath, workspace.configPath);
			assert.ok(resolved!.id);

			fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ something: 'something' })); // invalid workspace
			const resolvedInvalid = service.resolveLocalWorkspaceSync(workspace.configPath);
			assert.ok(!resolvedInvalid);
		});
	});

	test('resolveWorkspaceSync (support relative paths)', () => {
		return createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ folders: [{ path: './ticino-playground/lib' }] }));

			const resolved = service.resolveLocalWorkspaceSync(workspace.configPath);
			assertEqualURI(resolved!.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), 'ticino-playground', 'lib')));
		});
	});

	test('resolveWorkspaceSync (support relative paths #2)', () => {
		return createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ folders: [{ path: './ticino-playground/lib/../other' }] }));

			const resolved = service.resolveLocalWorkspaceSync(workspace.configPath);
			assertEqualURI(resolved!.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), 'ticino-playground', 'other')));
		});
	});

	test('resolveWorkspaceSync (support relative paths #3)', () => {
		return createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ folders: [{ path: 'ticino-playground/lib' }] }));

			const resolved = service.resolveLocalWorkspaceSync(workspace.configPath);
			assertEqualURI(resolved!.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), 'ticino-playground', 'lib')));
		});
	});

	test('resolveWorkspaceSync (support invalid JSON via fault tolerant parsing)', () => {
		return createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			fs.writeFileSync(workspace.configPath.fsPath, '{ "folders": [ { "path": "./ticino-playground/lib" } , ] }'); // trailing comma

			const resolved = service.resolveLocalWorkspaceSync(workspace.configPath);
			assertEqualURI(resolved!.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), 'ticino-playground', 'lib')));
		});
	});

	test('rewriteWorkspaceFileForNewLocation', () => {
		const folder1 = process.cwd();  // absolute path because outside of tmpDir
		const tmpDir = os.tmpdir();
		const tmpInsideDir = path.join(os.tmpdir(), 'inside');

		return createWorkspace([folder1, tmpInsideDir, path.join(tmpInsideDir, 'somefolder')]).then(workspace => {
			const origContent = fs.readFileSync(workspace.configPath.fsPath).toString();

			let origConfigPath = workspace.configPath;
			let workspaceConfigPath = URI.file(path.join(tmpDir, 'inside', 'myworkspace1.code-workspace'));
			let newContent = rewriteWorkspaceFileForNewLocation(origContent, origConfigPath, workspaceConfigPath);

			let ws = JSON.parse(newContent) as IStoredWorkspace;
			assert.equal(ws.folders.length, 3);
			assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[0]).path, folder1); // absolute path because outside of tmpdir
			assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[1]).path, '.');
			assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[2]).path, 'somefolder');

			origConfigPath = workspaceConfigPath;
			workspaceConfigPath = URI.file(path.join(tmpDir, 'myworkspace2.code-workspace'));
			newContent = rewriteWorkspaceFileForNewLocation(newContent, origConfigPath, workspaceConfigPath);

			ws = JSON.parse(newContent) as IStoredWorkspace;
			assert.equal(ws.folders.length, 3);
			assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[0]).path, folder1);
			assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[1]).path, 'inside');
			assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[2]).path, isWindows ? 'inside\\somefolder' : 'inside/somefolder');

			origConfigPath = workspaceConfigPath;
			workspaceConfigPath = URI.file(path.join(tmpDir, 'other', 'myworkspace2.code-workspace'));
			newContent = rewriteWorkspaceFileForNewLocation(newContent, origConfigPath, workspaceConfigPath);

			ws = JSON.parse(newContent) as IStoredWorkspace;
			assert.equal(ws.folders.length, 3);
			assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[0]).path, folder1);
			assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[1]).path, tmpInsideDir);
			assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[2]).path, path.join(tmpInsideDir, 'somefolder'));

			origConfigPath = workspaceConfigPath;
			workspaceConfigPath = URI.parse('foo://foo/bar/myworkspace2.code-workspace');
			newContent = rewriteWorkspaceFileForNewLocation(newContent, origConfigPath, workspaceConfigPath);

			ws = JSON.parse(newContent) as IStoredWorkspace;
			assert.equal(ws.folders.length, 3);
			assert.equal((<IRawUriWorkspaceFolder>ws.folders[0]).uri, URI.file(folder1).toString(true));
			assert.equal((<IRawUriWorkspaceFolder>ws.folders[1]).uri, URI.file(tmpInsideDir).toString(true));
			assert.equal((<IRawUriWorkspaceFolder>ws.folders[2]).uri, URI.file(path.join(tmpInsideDir, 'somefolder')).toString(true));

			service.deleteUntitledWorkspaceSync(workspace);
		});
	});

	test('rewriteWorkspaceFileForNewLocation (preserves comments)', () => {
		return createWorkspace([process.cwd(), os.tmpdir(), path.join(os.tmpdir(), 'somefolder')]).then(workspace => {
			const workspaceConfigPath = URI.file(path.join(os.tmpdir(), `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`));

			let origContent = fs.readFileSync(workspace.configPath.fsPath).toString();
			origContent = `// this is a comment\n${origContent}`;

			let newContent = rewriteWorkspaceFileForNewLocation(origContent, workspace.configPath, workspaceConfigPath);

			assert.equal(0, newContent.indexOf('// this is a comment'));

			service.deleteUntitledWorkspaceSync(workspace);
		});
	});

	test('rewriteWorkspaceFileForNewLocation (preserves forward slashes)', () => {
		return createWorkspace([process.cwd(), os.tmpdir(), path.join(os.tmpdir(), 'somefolder')]).then(workspace => {
			const workspaceConfigPath = URI.file(path.join(os.tmpdir(), `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`));
			let origContent = fs.readFileSync(workspace.configPath.fsPath).toString();
			origContent = origContent.replace(/[\\]/g, '/'); // convert backslash to slash

			const newContent = rewriteWorkspaceFileForNewLocation(origContent, workspace.configPath, workspaceConfigPath);

			const ws = JSON.parse(newContent) as IStoredWorkspace;
			assert.ok(ws.folders.every(f => (<IRawFileWorkspaceFolder>f).path.indexOf('\\') < 0));

			service.deleteUntitledWorkspaceSync(workspace);
		});
	});

	test('rewriteWorkspaceFileForNewLocation (unc paths)', () => {
		if (!isWindows) {
			return Promise.resolve();
		}

		const workspaceLocation = path.join(os.tmpdir(), 'wsloc');
		const folder1Location = 'x:\\foo';
		const folder2Location = '\\\\server\\share2\\some\\path';
		const folder3Location = path.join(os.tmpdir(), 'wsloc', 'inner', 'more');

		return createWorkspace([folder1Location, folder2Location, folder3Location]).then(workspace => {
			const workspaceConfigPath = URI.file(path.join(workspaceLocation, `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`));
			let origContent = fs.readFileSync(workspace.configPath.fsPath).toString();

			const newContent = rewriteWorkspaceFileForNewLocation(origContent, workspace.configPath, workspaceConfigPath);

			const ws = JSON.parse(newContent) as IStoredWorkspace;
			assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[0]).path, folder1Location);
			assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[1]).path, folder2Location);
			assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[2]).path, 'inner\\more');

			service.deleteUntitledWorkspaceSync(workspace);
		});
	});

	test('deleteUntitledWorkspaceSync (untitled)', () => {
		return createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			assert.ok(fs.existsSync(workspace.configPath.fsPath));

			service.deleteUntitledWorkspaceSync(workspace);

			assert.ok(!fs.existsSync(workspace.configPath.fsPath));
		});
	});

	test('deleteUntitledWorkspaceSync (saved)', () => {
		return createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			service.deleteUntitledWorkspaceSync(workspace);
		});
	});

	test('getUntitledWorkspaceSync', () => {
		let untitled = service.getUntitledWorkspacesSync();
		assert.equal(untitled.length, 0);

		return createWorkspace([process.cwd(), os.tmpdir()]).then(untitledOne => {
			assert.ok(fs.existsSync(untitledOne.configPath.fsPath));

			untitled = service.getUntitledWorkspacesSync();

			assert.equal(1, untitled.length);
			assert.equal(untitledOne.id, untitled[0].workspace.id);

			return createWorkspace([os.tmpdir(), process.cwd()]).then(untitledTwo => {
				assert.ok(fs.existsSync(untitledTwo.configPath.fsPath));

				untitled = service.getUntitledWorkspacesSync();

				if (untitled.length === 1) {
					assert.fail('Unexpected workspaces count, contents:\n' + fs.readFileSync(untitledTwo.configPath.fsPath, 'utf8'));
				}

				assert.equal(2, untitled.length);

				service.deleteUntitledWorkspaceSync(untitledOne);
				untitled = service.getUntitledWorkspacesSync();
				assert.equal(1, untitled.length);

				service.deleteUntitledWorkspaceSync(untitledTwo);
				untitled = service.getUntitledWorkspacesSync();
				assert.equal(0, untitled.length);
			});
		});
	});
});
