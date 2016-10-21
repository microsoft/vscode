/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as platform from 'vs/base/common/platform';
import crypto = require('crypto');
import os = require('os');
import path = require('path');
import extfs = require('vs/base/node/extfs');
import pfs = require('vs/base/node/pfs');
import Uri from 'vs/base/common/uri';
import { nfcall } from 'vs/base/common/async';
import { TestEnvironmentService } from 'vs/test/utils/servicesTestUtils';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { BackupService } from 'vs/platform/backup/node/backupService';

suite('BackupService', () => {
	const parentDir = path.join(os.tmpdir(), 'vsctests', 'service')
	const backupHome = path.join(parentDir, 'Backups');
	const backupWorkspacesHome = path.join(backupHome, 'workspaces.json');

	const fooFile = Uri.file(platform.isWindows ? 'C:\\foo' : '/foo');
	const barFile = Uri.file(platform.isWindows ? 'C:\\bar' : '/bar');
	const bazFile = Uri.file(platform.isWindows ? 'C:\\baz' : '/baz');

	let backupService: BackupService;

	setup(done => {
		const environmentService = TestEnvironmentService;

		backupService = new BackupService(environmentService);
		backupService.setBackupPathsForTest(backupHome, backupWorkspacesHome);

		// Delete any existing backups completely and then re-create it.
		extfs.del(backupHome, os.tmpdir(), () => {
			pfs.mkdirp(backupHome).then(() => {
				pfs.writeFileAndFlush(backupWorkspacesHome, '').then(() => {
					done();
				});
			});
		});
	});

	teardown(done => {
		extfs.del(backupHome, os.tmpdir(), done);
	});

	test('pushWorkspaceBackupPathsSync should persist paths to workspaces.json', () => {
		backupService.pushWorkspaceBackupPathsSync([fooFile, barFile]);
		assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), [fooFile.fsPath, barFile.fsPath]);
	});

	test('pushWorkspaceBackupPathsSync should throw if a workspace is set', () => {
		backupService.setCurrentWorkspace(fooFile);
		assert.throws(() => backupService.pushWorkspaceBackupPathsSync([fooFile]));
	});

	test('removeWorkspaceBackupPath should remove workspaces from workspaces.json', done => {
		backupService.pushWorkspaceBackupPathsSync([fooFile, barFile]);
		assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), [fooFile.fsPath, barFile.fsPath]);
		backupService.removeWorkspaceBackupPath(fooFile).then(() => {
			assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), [barFile.fsPath]);
			backupService.removeWorkspaceBackupPath(barFile).then(() => {
				assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), []);
				done();
			});
		});
	});

	test('removeWorkspaceBackupPath should fail gracefully when removing a path that doesn\'t exist', done => {
		backupService.pushWorkspaceBackupPathsSync([fooFile]);
		assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), [fooFile.fsPath]);
		backupService.removeWorkspaceBackupPath(barFile).then(() => {
			assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), [fooFile.fsPath]);
			done();
		});
	});

	test('registerResourceForBackup should register backups to workspaces.json', done => {
		backupService.setCurrentWorkspace(fooFile);
		backupService.registerResourceForBackup(barFile).then(() => {
			assert.deepEqual(backupService.getWorkspaceTextFilesWithBackupsSync(fooFile), [barFile.fsPath]);
			done();
		});
	});

	test('deregisterResourceForBackup should deregister backups from workspaces.json', done => {
		backupService.setCurrentWorkspace(fooFile);
		backupService.registerResourceForBackup(barFile).then(() => {
			assert.deepEqual(backupService.getWorkspaceTextFilesWithBackupsSync(fooFile), [barFile.fsPath]);
			backupService.deregisterResourceForBackup(barFile).then(() => {
				assert.deepEqual(backupService.getWorkspaceTextFilesWithBackupsSync(fooFile), []);
				done();
			});
		});
	});

	test('getBackupResource should get the correct backup path for text files', () => {
		// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
		const workspaceResource = fooFile;
		backupService.setCurrentWorkspace(workspaceResource);
		const backupResource = barFile;
		const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
		const filePathHash = crypto.createHash('md5').update(backupResource.fsPath).digest('hex');
		const expectedPath = Uri.file(path.join(backupHome, workspaceHash, 'file', filePathHash)).fsPath;
		assert.equal(backupService.getBackupResource(backupResource).fsPath, expectedPath);
	});

	test('getBackupResource should get the correct backup path for untitled files', () => {
		// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
		const workspaceResource = barFile;
		backupService.setCurrentWorkspace(workspaceResource);
		const backupResource = Uri.from({ scheme: 'untitled' });
		const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
		const filePathHash = crypto.createHash('md5').update(backupResource.fsPath).digest('hex');
		const expectedPath = Uri.file(path.join(backupHome, workspaceHash, 'untitled', filePathHash)).fsPath;
		assert.equal(backupService.getBackupResource(backupResource).fsPath, expectedPath);
	});

	test('getBackupResource should get the correct backup path for text files', () => {
		// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
		const workspaceResource = fooFile;
		backupService.setCurrentWorkspace(workspaceResource);
		const backupResource = barFile;
		const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
		const filePathHash = crypto.createHash('md5').update(backupResource.fsPath).digest('hex');
		const expectedPath = Uri.file(path.join(backupHome, workspaceHash, 'file', filePathHash)).fsPath;
		assert.equal(backupService.getBackupResource(backupResource).fsPath, expectedPath);
	});

	test('getBackupResource should get the correct backup path for untitled files', () => {
		// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
		const workspaceResource = fooFile;
		backupService.setCurrentWorkspace(workspaceResource);
		const backupResource = Uri.from({ scheme: 'untitled' });
		const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
		const filePathHash = crypto.createHash('md5').update(backupResource.fsPath).digest('hex');
		const expectedPath = Uri.file(path.join(backupHome, workspaceHash, 'untitled', filePathHash)).fsPath;
		assert.equal(backupService.getBackupResource(backupResource).fsPath, expectedPath);
	});

	test('getWorkspaceTextFilesWithBackupsSync should return text file resources that have backups', done => {
		const workspaceResource = fooFile;
		backupService.setCurrentWorkspace(workspaceResource);
		backupService.registerResourceForBackup(barFile).then(() => {
			assert.deepEqual(backupService.getWorkspaceTextFilesWithBackupsSync(workspaceResource), [barFile.fsPath]);
			backupService.registerResourceForBackup(bazFile).then(() => {
				assert.deepEqual(backupService.getWorkspaceTextFilesWithBackupsSync(workspaceResource), [barFile.fsPath, bazFile.fsPath]);
				done();
			});
		});
	});

	test('getWorkspaceUntitledFileBackupsSync should return untitled file backup resources', done => {
		const workspaceResource = fooFile;
		backupService.setCurrentWorkspace(workspaceResource);
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