/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import fs = require('fs');
import os = require('os');
import path = require('path');
import extfs = require('vs/base/node/extfs');
import pfs = require('vs/base/node/pfs');
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { WorkspacesMainService } from 'vs/platform/workspaces/electron-main/workspacesMainService';
import { IStoredWorkspace, WORKSPACE_EXTENSION, IWorkspaceSavedEvent, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { LogMainService } from 'vs/platform/log/common/log';
import URI from 'vs/base/common/uri';

suite('WorkspacesMainService', () => {
	const parentDir = path.join(os.tmpdir(), 'vsctests', 'service');
	const workspacesHome = path.join(parentDir, 'Workspaces');

	class TestEnvironmentService extends EnvironmentService {
		get workspacesHome(): string {
			return workspacesHome;
		}
	}

	class TestWorkspacesMainService extends WorkspacesMainService {
		public deleteWorkspaceCall: IWorkspaceIdentifier;

		public deleteUntitledWorkspaceSync(workspace: IWorkspaceIdentifier): void {
			this.deleteWorkspaceCall = workspace;

			super.deleteUntitledWorkspaceSync(workspace);
		}
	}

	const environmentService = new TestEnvironmentService(parseArgs(process.argv), process.execPath);
	const logService = new LogMainService(environmentService);

	let service: TestWorkspacesMainService;

	setup(done => {
		service = new TestWorkspacesMainService(environmentService, logService);

		// Delete any existing backups completely and then re-create it.
		extfs.del(workspacesHome, os.tmpdir(), () => {
			pfs.mkdirp(workspacesHome).then(() => {
				done();
			});
		});
	});

	teardown(done => {
		extfs.del(workspacesHome, os.tmpdir(), done);
	});

	test('createWorkspace (folders)', done => {
		return service.createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			assert.ok(workspace);
			assert.ok(fs.existsSync(workspace.configPath));
			assert.ok(service.isUntitledWorkspace(workspace));

			const ws = JSON.parse(fs.readFileSync(workspace.configPath).toString()) as IStoredWorkspace;
			assert.equal(ws.folders.length, 2); //
			assert.equal(ws.folders[0].path, process.cwd());
			assert.equal(ws.folders[1].path, os.tmpdir());

			done();
		});
	});

	test('createWorkspaceSync (folders)', () => {
		const workspace = service.createWorkspaceSync([process.cwd(), os.tmpdir()]);
		assert.ok(workspace);
		assert.ok(fs.existsSync(workspace.configPath));
		assert.ok(service.isUntitledWorkspace(workspace));

		const ws = JSON.parse(fs.readFileSync(workspace.configPath).toString()) as IStoredWorkspace;
		assert.equal(ws.folders.length, 2); //
		assert.equal(ws.folders[0].path, process.cwd());
		assert.equal(ws.folders[1].path, os.tmpdir());
	});

	test('resolveWorkspaceSync', done => {
		return service.createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			assert.ok(service.resolveWorkspaceSync(workspace.configPath));

			// make it a valid workspace path
			const newPath = path.join(path.dirname(workspace.configPath), `workspace.${WORKSPACE_EXTENSION}`);
			fs.renameSync(workspace.configPath, newPath);
			workspace.configPath = newPath;

			const resolved = service.resolveWorkspaceSync(workspace.configPath);
			assert.equal(2, resolved.folders.length);
			assert.equal(resolved.configPath, workspace.configPath);
			assert.ok(resolved.id);

			fs.writeFileSync(workspace.configPath, JSON.stringify({ something: 'something' })); // invalid workspace
			const resolvedInvalid = service.resolveWorkspaceSync(workspace.configPath);
			assert.ok(!resolvedInvalid);

			done();
		});
	});

	test('resolveWorkspace', done => {
		return service.createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			return service.resolveWorkspace(workspace.configPath).then(ws => {
				assert.ok(ws);

				// make it a valid workspace path
				const newPath = path.join(path.dirname(workspace.configPath), `workspace.${WORKSPACE_EXTENSION}`);
				fs.renameSync(workspace.configPath, newPath);
				workspace.configPath = newPath;

				return service.resolveWorkspace(workspace.configPath).then(resolved => {
					assert.equal(2, resolved.folders.length);
					assert.equal(resolved.configPath, workspace.configPath);
					assert.ok(resolved.id);

					fs.writeFileSync(workspace.configPath, JSON.stringify({ something: 'something' })); // invalid workspace
					return service.resolveWorkspace(workspace.configPath).then(resolvedInvalid => {
						assert.ok(!resolvedInvalid);

						done();
					});
				});
			});
		});
	});

	test('resolveWorkspaceSync (support relative paths)', done => {
		return service.createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			fs.writeFileSync(workspace.configPath, JSON.stringify({ folders: [{ path: './ticino-playground/lib' }] }));

			const resolved = service.resolveWorkspaceSync(workspace.configPath);
			assert.equal(URI.file(resolved.folders[0].path).fsPath, URI.file(path.join(path.dirname(workspace.configPath), 'ticino-playground', 'lib')).fsPath);

			done();
		});
	});

	test('resolveWorkspaceSync (support relative paths #2)', done => {
		return service.createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			fs.writeFileSync(workspace.configPath, JSON.stringify({ folders: [{ path: './ticino-playground/lib/../other' }] }));

			const resolved = service.resolveWorkspaceSync(workspace.configPath);
			assert.equal(URI.file(resolved.folders[0].path).fsPath, URI.file(path.join(path.dirname(workspace.configPath), 'ticino-playground', 'other')).fsPath);

			done();
		});
	});

	test('resolveWorkspaceSync (support relative paths #3)', done => {
		return service.createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			fs.writeFileSync(workspace.configPath, JSON.stringify({ folders: [{ path: 'ticino-playground/lib' }] }));

			const resolved = service.resolveWorkspaceSync(workspace.configPath);
			assert.equal(URI.file(resolved.folders[0].path).fsPath, URI.file(path.join(path.dirname(workspace.configPath), 'ticino-playground', 'lib')).fsPath);

			done();
		});
	});

	test('resolveWorkspaceSync (support invalid JSON via fault tolerant parsing)', done => {
		return service.createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			fs.writeFileSync(workspace.configPath, '{ "folders": [ { "path": "./ticino-playground/lib" } , ] }'); // trailing comma

			const resolved = service.resolveWorkspaceSync(workspace.configPath);
			assert.equal(URI.file(resolved.folders[0].path).fsPath, URI.file(path.join(path.dirname(workspace.configPath), 'ticino-playground', 'lib')).fsPath);

			done();
		});
	});

	test('saveWorkspace (untitled)', done => {
		let savedEvent: IWorkspaceSavedEvent;
		const listener = service.onWorkspaceSaved(e => {
			savedEvent = e;
		});

		let deletedEvent: IWorkspaceIdentifier;
		const listener2 = service.onUntitledWorkspaceDeleted(e => {
			deletedEvent = e;
		});

		return service.createWorkspace([process.cwd(), os.tmpdir(), path.join(os.tmpdir(), 'somefolder')]).then(workspace => {
			const workspaceConfigPath = path.join(os.tmpdir(), `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`);

			return service.saveWorkspace(workspace, workspaceConfigPath).then(savedWorkspace => {
				assert.ok(savedWorkspace.id);
				assert.notEqual(savedWorkspace.id, workspace.id);
				assert.equal(savedWorkspace.configPath, workspaceConfigPath);

				assert.equal(service.deleteWorkspaceCall, workspace);

				const ws = JSON.parse(fs.readFileSync(savedWorkspace.configPath).toString()) as IStoredWorkspace;
				assert.equal(ws.folders.length, 3);
				assert.equal(ws.folders[0].path, process.cwd()); // absolute
				assert.equal(ws.folders[1].path, '.'); // relative
				assert.equal(ws.folders[2].path, path.relative(path.dirname(workspaceConfigPath), path.join(os.tmpdir(), 'somefolder'))); // relative

				assert.equal(savedWorkspace, savedEvent.workspace);
				assert.equal(workspace.configPath, savedEvent.oldConfigPath);

				assert.deepEqual(deletedEvent, workspace);

				listener.dispose();
				listener2.dispose();

				extfs.delSync(workspaceConfigPath);

				done();
			});
		});
	});

	test('saveWorkspace (saved workspace)', done => {
		return service.createWorkspace([process.cwd(), os.tmpdir(), path.join(os.tmpdir(), 'somefolder')]).then(workspace => {
			const workspaceConfigPath = path.join(os.tmpdir(), `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`);
			const newWorkspaceConfigPath = path.join(os.tmpdir(), `mySavedWorkspace.${Date.now()}.${WORKSPACE_EXTENSION}`);

			return service.saveWorkspace(workspace, workspaceConfigPath).then(savedWorkspace => {
				return service.saveWorkspace(savedWorkspace, newWorkspaceConfigPath).then(newSavedWorkspace => {
					assert.ok(newSavedWorkspace.id);
					assert.notEqual(newSavedWorkspace.id, workspace.id);
					assert.equal(newSavedWorkspace.configPath, newWorkspaceConfigPath);

					const ws = JSON.parse(fs.readFileSync(newSavedWorkspace.configPath).toString()) as IStoredWorkspace;
					assert.equal(ws.folders.length, 3);
					assert.equal(ws.folders[0].path, process.cwd()); // absolute path because outside of tmpdir
					assert.equal(ws.folders[1].path, '.'); // relative path because inside of tmpdir
					assert.equal(ws.folders[2].path, path.relative(path.dirname(workspaceConfigPath), path.join(os.tmpdir(), 'somefolder'))); // relative

					extfs.delSync(workspaceConfigPath);
					extfs.delSync(newWorkspaceConfigPath);

					done();
				});
			});
		});
	});

	test('deleteUntitledWorkspaceSync (untitled)', done => {
		return service.createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			assert.ok(fs.existsSync(workspace.configPath));

			service.deleteUntitledWorkspaceSync(workspace);

			assert.ok(!fs.existsSync(workspace.configPath));

			done();
		});
	});

	test('deleteUntitledWorkspaceSync (saved)', done => {
		return service.createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			const workspaceConfigPath = path.join(os.tmpdir(), `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`);

			return service.saveWorkspace(workspace, workspaceConfigPath).then(savedWorkspace => {
				assert.ok(fs.existsSync(savedWorkspace.configPath));

				service.deleteUntitledWorkspaceSync(savedWorkspace);

				assert.ok(fs.existsSync(savedWorkspace.configPath));

				done();
			});
		});
	});

	test('getUntitledWorkspaceSync', done => {
		let untitled = service.getUntitledWorkspacesSync();
		assert.equal(0, untitled.length);

		return service.createWorkspace([process.cwd(), os.tmpdir()]).then(untitledOne => {
			untitled = service.getUntitledWorkspacesSync();

			assert.equal(1, untitled.length);
			assert.equal(untitledOne.id, untitled[0].id);

			return service.createWorkspace([process.cwd(), os.tmpdir()]).then(untitledTwo => {
				untitled = service.getUntitledWorkspacesSync();

				assert.equal(2, untitled.length);

				service.deleteUntitledWorkspaceSync(untitledOne);
				service.deleteUntitledWorkspaceSync(untitledTwo);

				untitled = service.getUntitledWorkspacesSync();
				assert.equal(0, untitled.length);

				done();
			});
		});
	});
});