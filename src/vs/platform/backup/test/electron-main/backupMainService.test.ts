/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as platform from 'vs/base/common/platform';
import crypto = require('crypto');
import fs = require('fs');
import os = require('os');
import path = require('path');
import extfs = require('vs/base/node/extfs');
import pfs = require('vs/base/node/pfs');
import Uri from 'vs/base/common/uri';
import { TestEnvironmentService } from 'vs/test/utils/servicesTestUtils';
import { TestLifecycleService } from 'vs/code/test/electron-main/servicesTestUtils';
import { BackupMainService } from 'vs/platform/backup/electron-main/backupMainService';
import { IBackupWorkspacesFormat } from 'vs/platform/backup/common/backup';

class TestBackupMainService extends BackupMainService {
	constructor(backupHome: string, backupWorkspacesPath: string) {
		super(TestEnvironmentService, new TestLifecycleService());

		this.backupHome = backupHome;
		this.workspacesJsonPath = backupWorkspacesPath;

		// Force a reload with the new paths
		this.loadSync();
	}
}

suite('BackupMainService', () => {
	const parentDir = path.join(os.tmpdir(), 'vsctests', 'service');
	const backupHome = path.join(parentDir, 'Backups');
	const backupWorkspacesPath = path.join(backupHome, 'workspaces.json');

	const fooFile = Uri.file(platform.isWindows ? 'C:\\foo' : '/foo');
	const barFile = Uri.file(platform.isWindows ? 'C:\\bar' : '/bar');

	const fooWorkspaceBackupDir = path.join(backupHome, crypto.createHash('md5').update(fooFile.fsPath).digest('hex'));

	let service: BackupMainService;

	setup(done => {
		service = new TestBackupMainService(backupHome, backupWorkspacesPath);

		// Delete any existing backups completely and then re-create it.
		extfs.del(backupHome, os.tmpdir(), () => {
			pfs.mkdirp(backupHome).then(() => {
				done();
			});
		});
	});

	teardown(done => {
		extfs.del(backupHome, os.tmpdir(), done);
	});

	test('getWorkspaceBackupPaths should return [] when workspaces.json doesn\'t exist', () => {
		assert.deepEqual(service.getWorkspaceBackupPaths(), []);
	});

	test('getWorkspaceBackupPaths should return [] when workspaces.json is not properly formed JSON', () => {
		fs.writeFileSync(backupWorkspacesPath, '');
		assert.deepEqual(service.getWorkspaceBackupPaths(), []);
		fs.writeFileSync(backupWorkspacesPath, '{]');
		assert.deepEqual(service.getWorkspaceBackupPaths(), []);
		fs.writeFileSync(backupWorkspacesPath, 'foo');
		assert.deepEqual(service.getWorkspaceBackupPaths(), []);
	});

	test('getWorkspaceBackupPaths should return [] when folderWorkspaces in workspaces.json is absent', () => {
		fs.writeFileSync(backupWorkspacesPath, '{}');
		assert.deepEqual(service.getWorkspaceBackupPaths(), []);
	});

	test('getWorkspaceBackupPaths should return [] when folderWorkspaces in workspaces.json is not a string array', () => {
		fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{}}');
		assert.deepEqual(service.getWorkspaceBackupPaths(), []);
		fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{"foo": ["bar"]}}');
		assert.deepEqual(service.getWorkspaceBackupPaths(), []);
		fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{"foo": []}}');
		assert.deepEqual(service.getWorkspaceBackupPaths(), []);
		fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{"foo": "bar"}}');
		assert.deepEqual(service.getWorkspaceBackupPaths(), []);
		fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":"foo"}');
		assert.deepEqual(service.getWorkspaceBackupPaths(), []);
		fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":1}');
		assert.deepEqual(service.getWorkspaceBackupPaths(), []);
	});

	test('pushWorkspaceBackupPathsSync should persist paths to workspaces.json', () => {
		service.pushWorkspaceBackupPathsSync([fooFile, barFile]);
		assert.deepEqual(service.getWorkspaceBackupPaths(), [fooFile.fsPath, barFile.fsPath]);
	});

	test('removeWorkspaceBackupPath should remove workspaces from workspaces.json', done => {
		service.pushWorkspaceBackupPathsSync([fooFile, barFile]);
		service.removeWorkspaceBackupPathSync(fooFile);
		pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
			const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
			assert.deepEqual(json.folderWorkspaces, [barFile.fsPath]);
			service.removeWorkspaceBackupPathSync(barFile);
			pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
				const json2 = <IBackupWorkspacesFormat>JSON.parse(content);
				assert.deepEqual(json2.folderWorkspaces, []);
				done();
			});
		});
	});

	test('removeWorkspaceBackupPath should fail gracefully when removing a path that doesn\'t exist', done => {
		const workspacesJson: IBackupWorkspacesFormat = { folderWorkspaces: [fooFile.fsPath] };
		pfs.writeFile(backupWorkspacesPath, JSON.stringify(workspacesJson)).then(() => {
			service.removeWorkspaceBackupPathSync(barFile);
			pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
				const json = <IBackupWorkspacesFormat>JSON.parse(content);
				assert.deepEqual(json.folderWorkspaces, [fooFile.fsPath]);
				done();
			});
		});
	});

	test('doesWorkspaceHaveBackups should return whether the workspace\'s backup exists', () => {
		assert.equal(service.hasWorkspaceBackup(fooFile), false);
		fs.mkdirSync(fooWorkspaceBackupDir);
		assert.equal(service.hasWorkspaceBackup(fooFile), true);
	});
});