/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'vs/base/common/path';
import * as extfs from 'vs/base/node/extfs';
import * as pfs from 'vs/base/node/pfs';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { WorkspacesMainService, IStoredWorkspace } from 'vs/platform/workspaces/electron-main/workspacesMainService';
import { WORKSPACE_EXTENSION, IWorkspaceIdentifier, IRawFileWorkspaceFolder, IWorkspaceFolderCreationData, IRawUriWorkspaceFolder } from 'vs/platform/workspaces/common/workspaces';
import { NullLogService } from 'vs/platform/log/common/log';
import { URI } from 'vs/base/common/uri';
import { getRandomTestPath } from 'vs/workbench/test/workbenchTestServices';
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
		return pfs.del(untitledWorkspacesHomePath, os.tmpdir()).then(() => {
			return pfs.mkdirp(untitledWorkspacesHomePath);
		});
	});

	teardown(() => {
		return pfs.del(untitledWorkspacesHomePath, os.tmpdir());
	});

	function assertPathEquals(p1: string, p2): void {
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
		return service.createUntitledWorkspace([{ uri: URI.from({ scheme: 'myScheme', path: process.cwd() }) }, { uri: URI.from({ scheme: 'myScheme', path: os.tmpdir() }) }]).then(workspace => {
			assert.ok(workspace);
			assert.ok(fs.existsSync(workspace.configPath.fsPath));
			assert.ok(service.isUntitledWorkspace(workspace));

			const ws = JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString()) as IStoredWorkspace;
			assert.equal(ws.folders.length, 2);
			assert.equal((<IRawUriWorkspaceFolder>ws.folders[0]).uri, URI.from({ scheme: 'myScheme', path: process.cwd() }).toString(true));
			assert.equal((<IRawUriWorkspaceFolder>ws.folders[1]).uri, URI.from({ scheme: 'myScheme', path: os.tmpdir() }).toString(true));

			assert.ok(!(<IRawFileWorkspaceFolder>ws.folders[0]).name);
			assert.ok(!(<IRawFileWorkspaceFolder>ws.folders[1]).name);
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
		const workspace = service.createUntitledWorkspaceSync([{ uri: URI.from({ scheme: 'myScheme', path: process.cwd() }) }, { uri: URI.from({ scheme: 'myScheme', path: os.tmpdir() }) }]);
		assert.ok(workspace);
		assert.ok(fs.existsSync(workspace.configPath.fsPath));
		assert.ok(service.isUntitledWorkspace(workspace));

		const ws = JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString()) as IStoredWorkspace;
		assert.equal(ws.folders.length, 2);
		assert.equal((<IRawUriWorkspaceFolder>ws.folders[0]).uri, URI.from({ scheme: 'myScheme', path: process.cwd() }).toString(true));
		assert.equal((<IRawUriWorkspaceFolder>ws.folders[1]).uri, URI.from({ scheme: 'myScheme', path: os.tmpdir() }).toString(true));

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

	test('saveWorkspace (untitled)', () => {
		return createWorkspace([process.cwd(), os.tmpdir(), path.join(os.tmpdir(), 'somefolder')]).then(workspace => {
			const workspaceConfigPath = path.join(os.tmpdir(), `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`);

			return service.saveWorkspaceAs(workspace, workspaceConfigPath).then(savedWorkspace => {
				assert.ok(savedWorkspace.id);
				assert.notEqual(savedWorkspace.id, workspace.id);
				assertPathEquals(savedWorkspace.configPath.fsPath, workspaceConfigPath);

				const ws = JSON.parse(fs.readFileSync(savedWorkspace.configPath.fsPath).toString()) as IStoredWorkspace;
				assert.equal(ws.folders.length, 3);
				assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[0]).path, process.cwd()); // absolute
				assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[1]).path, '.'); // relative
				assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[2]).path, path.relative(path.dirname(workspaceConfigPath), path.join(os.tmpdir(), 'somefolder'))); // relative

				extfs.delSync(workspaceConfigPath);
			});
		});
	});

	test('saveWorkspace (saved workspace)', () => {
		return createWorkspace([process.cwd(), os.tmpdir(), path.join(os.tmpdir(), 'somefolder')]).then(workspace => {
			const workspaceConfigPath = path.join(os.tmpdir(), `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`);
			const newWorkspaceConfigPath = path.join(os.tmpdir(), `mySavedWorkspace.${Date.now()}.${WORKSPACE_EXTENSION}`);

			return service.saveWorkspaceAs(workspace, workspaceConfigPath).then(savedWorkspace => {
				return service.saveWorkspaceAs(savedWorkspace, newWorkspaceConfigPath).then(newSavedWorkspace => {
					assert.ok(newSavedWorkspace.id);
					assert.notEqual(newSavedWorkspace.id, workspace.id);
					assertPathEquals(newSavedWorkspace.configPath.fsPath, newWorkspaceConfigPath);

					const ws = JSON.parse(fs.readFileSync(newSavedWorkspace.configPath.fsPath).toString()) as IStoredWorkspace;
					assert.equal(ws.folders.length, 3);
					assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[0]).path, process.cwd()); // absolute path because outside of tmpdir
					assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[1]).path, '.'); // relative path because inside of tmpdir
					assertPathEquals((<IRawFileWorkspaceFolder>ws.folders[2]).path, path.relative(path.dirname(workspaceConfigPath), path.join(os.tmpdir(), 'somefolder'))); // relative

					extfs.delSync(workspaceConfigPath);
					extfs.delSync(newWorkspaceConfigPath);
				});
			});
		});
	});

	test('saveWorkspace (saved workspace, preserves comments)', () => {
		return createWorkspace([process.cwd(), os.tmpdir(), path.join(os.tmpdir(), 'somefolder')]).then(workspace => {
			const workspaceConfigPath = path.join(os.tmpdir(), `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`);
			const newWorkspaceConfigPath = path.join(os.tmpdir(), `mySavedWorkspace.${Date.now()}.${WORKSPACE_EXTENSION}`);

			return service.saveWorkspaceAs(workspace, workspaceConfigPath).then(savedWorkspace => {
				const contents = fs.readFileSync(savedWorkspace.configPath.fsPath).toString();
				fs.writeFileSync(savedWorkspace.configPath.fsPath, `// this is a comment\n${contents}`);

				return service.saveWorkspaceAs(savedWorkspace, newWorkspaceConfigPath).then(newSavedWorkspace => {
					assert.ok(newSavedWorkspace.id);
					assert.notEqual(newSavedWorkspace.id, workspace.id);
					assertPathEquals(newSavedWorkspace.configPath.fsPath, newWorkspaceConfigPath);

					const savedContents = fs.readFileSync(newSavedWorkspace.configPath.fsPath).toString();
					assert.equal(0, savedContents.indexOf('// this is a comment'));

					extfs.delSync(workspaceConfigPath);
					extfs.delSync(newWorkspaceConfigPath);
				});
			});
		});
	});

	test('saveWorkspace (saved workspace, preserves forward slashes)', () => {
		return createWorkspace([process.cwd(), os.tmpdir(), path.join(os.tmpdir(), 'somefolder')]).then(workspace => {
			const workspaceConfigPath = path.join(os.tmpdir(), `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`);
			const newWorkspaceConfigPath = path.join(os.tmpdir(), `mySavedWorkspace.${Date.now()}.${WORKSPACE_EXTENSION}`);

			return service.saveWorkspaceAs(workspace, workspaceConfigPath).then(savedWorkspace => {
				const contents = fs.readFileSync(savedWorkspace.configPath.fsPath).toString();
				fs.writeFileSync(savedWorkspace.configPath.fsPath, contents.replace(/[\\]/g, '/')); // convert backslash to slash

				return service.saveWorkspaceAs(savedWorkspace, newWorkspaceConfigPath).then(newSavedWorkspace => {
					assert.ok(newSavedWorkspace.id);
					assert.notEqual(newSavedWorkspace.id, workspace.id);
					assertPathEquals(newSavedWorkspace.configPath.fsPath, newWorkspaceConfigPath);

					const ws = JSON.parse(fs.readFileSync(newSavedWorkspace.configPath.fsPath).toString()) as IStoredWorkspace;
					assert.ok(ws.folders.every(f => (<IRawFileWorkspaceFolder>f).path.indexOf('\\') < 0));

					extfs.delSync(workspaceConfigPath);
					extfs.delSync(newWorkspaceConfigPath);
				});
			});
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
			const workspaceConfigPath = path.join(os.tmpdir(), `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`);

			return service.saveWorkspaceAs(workspace, workspaceConfigPath).then(savedWorkspace => {
				assert.ok(fs.existsSync(savedWorkspace.configPath.fsPath));

				service.deleteUntitledWorkspaceSync(savedWorkspace);

				assert.ok(fs.existsSync(savedWorkspace.configPath.fsPath));
			});
		});
	});

	test('getUntitledWorkspaceSync', () => {
		let untitled = service.getUntitledWorkspacesSync();
		assert.equal(untitled.length, 0);

		return createWorkspace([process.cwd(), os.tmpdir()]).then(untitledOne => {
			assert.ok(fs.existsSync(untitledOne.configPath.fsPath));

			untitled = service.getUntitledWorkspacesSync();

			assert.equal(1, untitled.length);
			assert.equal(untitledOne.id, untitled[0].id);

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
