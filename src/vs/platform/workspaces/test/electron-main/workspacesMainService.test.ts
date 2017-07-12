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
import { IStoredWorkspace } from "vs/platform/workspaces/common/workspaces";

class TestWorkspacesMainService extends WorkspacesMainService {
	constructor(workspacesHome: string) {
		super(new EnvironmentService(parseArgs(process.argv), process.execPath));

		this.workspacesHome = workspacesHome;
	}
}

suite('WorkspacesMainService', () => {
	const parentDir = path.join(os.tmpdir(), 'vsctests', 'service');
	const workspacesHome = path.join(parentDir, 'Workspaces');

	let service: TestWorkspacesMainService;

	setup(done => {
		service = new TestWorkspacesMainService(workspacesHome);

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
		return service.createWorkspace().then(workspace => {
			assert.ok(workspace);
			assert.ok(fs.existsSync(workspace.workspaceConfigPath));
			assert.equal(workspace.folders.length, 0);

			const ws = JSON.parse(fs.readFileSync(workspace.workspaceConfigPath).toString()) as IStoredWorkspace;
			assert.equal(ws.id, workspace.id);
			assert.deepEqual(ws.folders, workspace.folders);

			done();
		});
	});

	test('createWorkspace (folders)', done => {
		return service.createWorkspace([process.cwd(), os.tmpdir()]).then(workspace => {
			assert.ok(workspace);
			assert.ok(fs.existsSync(workspace.workspaceConfigPath));
			assert.equal(workspace.folders.length, 2);
			assert.equal(workspace.folders[0], process.cwd());
			assert.equal(workspace.folders[1], os.tmpdir());

			const ws = JSON.parse(fs.readFileSync(workspace.workspaceConfigPath).toString()) as IStoredWorkspace;
			assert.equal(ws.id, workspace.id);
			assert.deepEqual(ws.folders, workspace.folders);

			done();
		});
	});
});