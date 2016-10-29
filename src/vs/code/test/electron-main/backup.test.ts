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
import { nfcall } from 'vs/base/common/async';
import { TestEnvironmentService } from 'vs/test/utils/servicesTestUtils';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { BackupService } from 'vs/code/electron-main/backup';

class TestBackupService extends BackupService {
	constructor(backupHome: string, backupWorkspacesPath: string) {
		super(TestEnvironmentService);

		this.backupHome = backupHome;
		this.workspacesJsonPath = backupWorkspacesPath;
	}
}

suite('BackupService', () => {
	const parentDir = path.join(os.tmpdir(), 'vsctests', 'service')
	const backupHome = path.join(parentDir, 'Backups');
	const backupWorkspacesPath = path.join(backupHome, 'workspaces.json');

	const fooFile = Uri.file(platform.isWindows ? 'C:\\foo' : '/foo');
	const barFile = Uri.file(platform.isWindows ? 'C:\\bar' : '/bar');
	const bazFile = Uri.file(platform.isWindows ? 'C:\\baz' : '/baz');

	let backupService: BackupService;

	setup(done => {
		backupService = new TestBackupService(backupHome, backupWorkspacesPath);

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

	test('getWorkspaceBackupPathsSync should return [] when workspaces.json doesn\'t exist', () => {
		assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), []);
	});

	test('getWorkspaceBackupPathsSync should return [] when workspaces.json is not properly formed JSON', () => {
		fs.writeFileSync(backupWorkspacesPath, '');
		assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), []);
		fs.writeFileSync(backupWorkspacesPath, '{]');
		assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), []);
		fs.writeFileSync(backupWorkspacesPath, 'foo');
		assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), []);
	});

	test('getWorkspaceBackupPathsSync should return [] when folderWorkspaces in workspaces.json is absent', () => {
		fs.writeFileSync(backupWorkspacesPath, '{}');
		assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), []);
	});

	test('getWorkspaceBackupPathsSync should return [] when folderWorkspaces in workspaces.json is not a string array', () => {
		fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{}}');
		assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), []);
		fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{"foo": ["bar"]}}');
		assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), []);
		fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{"foo": []}}');
		assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), []);
		fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{"foo": "bar"}}');
		assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), []);
		fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":"foo"}');
		assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), []);
		fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":1}');
		assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), []);
	});

	test('pushWorkspaceBackupPathsSync should persist paths to workspaces.json', () => {
		backupService.pushWorkspaceBackupPathsSync([fooFile, barFile]);
		assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), [fooFile.fsPath, barFile.fsPath]);
	});

	test('getWorkspaceUntitledFileBackupsSync should return untitled file backup resources', done => {
		const workspaceResource = fooFile;
		const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
		const untitledBackupDir = path.join(backupHome, workspaceHash, 'untitled');
		const untitledBackup1 = path.join(untitledBackupDir, 'bar');
		const untitledBackup2 = path.join(untitledBackupDir, 'foo');
		pfs.mkdirp(untitledBackupDir).then(() => {
			pfs.writeFile(untitledBackup1, 'test').then(() => {
				assert.deepEqual(backupService.getWorkspaceUntitledFileBackupsSync(workspaceResource), [untitledBackup1]);
				pfs.writeFile(untitledBackup2, 'test').then(() => {
					assert.deepEqual(backupService.getWorkspaceUntitledFileBackupsSync(workspaceResource), [untitledBackup1, untitledBackup2]);
					done();
				});
			});
		});
	});
});