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
import { WorkspacesMainService } from "vs/platform/workspaces/electron-main/workspacesMainService";
import { IStoredWorkspace, WORKSPACE_EXTENSION, IWorkspaceSavedEvent, IWorkspaceIdentifier } from "vs/platform/workspaces/common/workspaces";
import { LogMainService } from "vs/platform/log/common/log";

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

	test('createWorkspace (no folders)', done => {
		return service.createWorkspace([]).then(null, error => {
			assert.ok(error);

			done();
		});
	});

	test('createWorkspace (folders)', done => {
		return service.createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			assert.ok(workspace);
			assert.ok(fs.existsSync(workspace.configPath));
			assert.ok(service.isUntitledWorkspace(workspace));

			const ws = JSON.parse(fs.readFileSync(workspace.configPath).toString()) as IStoredWorkspace;
			assert.equal(ws.id, workspace.id);
			assert.equal(ws.folders.length, 2);
			assert.equal(ws.folders[0], process.cwd());
			assert.equal(ws.folders[1], os.tmpdir());

			done();
		});
	});

	test('resolveWorkspace', done => {
		return service.createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			assert.ok(service.resolveWorkspaceSync(workspace.configPath));

			// make it a valid workspace path
			const newPath = path.join(path.dirname(workspace.configPath), `workspace.${WORKSPACE_EXTENSION}`);
			fs.renameSync(workspace.configPath, newPath);
			workspace.configPath = newPath;

			const resolved = service.resolveWorkspaceSync(workspace.configPath);
			assert.deepEqual(resolved, { id: workspace.id, folders: [process.cwd(), os.tmpdir()] });

			done();
		});
	});

	test('saveWorkspace (untitled)', done => {
		let savedEvent: IWorkspaceSavedEvent;
		const listener = service.onWorkspaceSaved(e => {
			savedEvent = e;
		});

		let deletedEvent: IWorkspaceIdentifier;
		const listener2 = service.onWorkspaceDeleted(e => {
			deletedEvent = e;
		});

		return service.createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			const workspaceConfigPath = path.join(os.tmpdir(), `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`);

			return service.saveWorkspace(workspace, workspaceConfigPath).then(savedWorkspace => {
				assert.equal(savedWorkspace.id, workspace.id);
				assert.equal(savedWorkspace.configPath, workspaceConfigPath);

				assert.equal(service.deleteWorkspaceCall, workspace);

				const ws = JSON.parse(fs.readFileSync(savedWorkspace.configPath).toString()) as IStoredWorkspace;
				assert.equal(ws.id, workspace.id);
				assert.equal(ws.folders.length, 2);
				assert.equal(ws.folders[0], process.cwd());
				assert.equal(ws.folders[1], os.tmpdir());

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
		return service.createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			const workspaceConfigPath = path.join(os.tmpdir(), `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`);
			const newWorkspaceConfigPath = path.join(os.tmpdir(), `mySavedWorkspace.${Date.now()}.${WORKSPACE_EXTENSION}`);

			return service.saveWorkspace(workspace, workspaceConfigPath).then(savedWorkspace => {
				return service.saveWorkspace(savedWorkspace, newWorkspaceConfigPath).then(newSavedWorkspace => {
					assert.equal(newSavedWorkspace.id, workspace.id);
					assert.equal(newSavedWorkspace.configPath, newWorkspaceConfigPath);

					const ws = JSON.parse(fs.readFileSync(newSavedWorkspace.configPath).toString()) as IStoredWorkspace;
					assert.equal(ws.id, workspace.id);
					assert.equal(ws.folders.length, 2);
					assert.equal(ws.folders[0], process.cwd());
					assert.equal(ws.folders[1], os.tmpdir());

					extfs.delSync(workspaceConfigPath);
					extfs.delSync(newWorkspaceConfigPath);

					done();
				});
			});
		});
	});
});