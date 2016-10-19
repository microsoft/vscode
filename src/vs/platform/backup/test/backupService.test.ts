/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
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
	let environmentService: IEnvironmentService;
	let backupService: BackupService;

	setup(done => {
		environmentService = TestEnvironmentService;
		backupService = new BackupService(environmentService);

		// Delete any existing backups completely, this in itself is a test to ensure that the
		// the backupHome directory is re-created
		nfcall(extfs.del, environmentService.backupHome, os.tmpdir()).then(() => {
			done();
		});
	});

	teardown(done => {
		nfcall(extfs.del, environmentService.backupHome, os.tmpdir()).then(() => {
			done();
		});
	});

	test('pushWorkspaceBackupPathsSync should persist paths to workspaces.json', () => {
		backupService.pushWorkspaceBackupPathsSync([Uri.file('/foo'), Uri.file('/bar')]);
		assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), [Uri.file('/foo'), Uri.file('/bar')]);
	});

	test('pushWorkspaceBackupPathsSync should throw if a workspace is set', () => {
		backupService.setCurrentWorkspace(Uri.file('/foo'));
		assert.throws(() => backupService.pushWorkspaceBackupPathsSync([Uri.file('/foo'), Uri.file('/bar')]));
	});

	test('removeWorkspaceBackupPath should remove workspaces from workspaces.json', done => {
		backupService.pushWorkspaceBackupPathsSync([Uri.file('/foo'), Uri.file('/bar')]);
		assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), ['/foo', '/bar']);
		backupService.removeWorkspaceBackupPath(Uri.file('/foo')).then(() => {
			assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), ['/bar']);
			backupService.removeWorkspaceBackupPath(Uri.file('/bar')).then(() => {
				assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), []);
				done();
			});
		});
	});

	test('removeWorkspaceBackupPath should fail gracefully when removing a path that doesn\'t exist', done => {
		backupService.pushWorkspaceBackupPathsSync([Uri.file('/foo')]);
		assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), [Uri.file('/foo')]);
		backupService.removeWorkspaceBackupPath(Uri.file('/bar')).then(() => {
			assert.deepEqual(backupService.getWorkspaceBackupPathsSync(), [Uri.file('/foo')]);
			done();
		});
	});

	test('registerResourceForBackup should register backups to workspaces.json', done => {
		backupService.setCurrentWorkspace(Uri.file('/foo'));
		backupService.registerResourceForBackup(Uri.file('/bar')).then(() => {
			assert.deepEqual(backupService.getWorkspaceTextFilesWithBackupsSync(Uri.file('/foo')), ['/bar']);
			done();
		});
	});

	test('deregisterResourceForBackup should deregister backups from workspaces.json', done => {
		backupService.setCurrentWorkspace(Uri.file('/foo'));
		backupService.registerResourceForBackup(Uri.file('/bar')).then(() => {
			assert.deepEqual(backupService.getWorkspaceTextFilesWithBackupsSync(Uri.file('/foo')), ['/bar']);
			backupService.deregisterResourceForBackup(Uri.file('/bar')).then(() => {
				assert.deepEqual(backupService.getWorkspaceTextFilesWithBackupsSync(Uri.file('/foo')), []);
				done();
			});
		});
	});

	test('getBackupResource should get the correct backup path for text files', () => {
		// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
		const workspaceResource = Uri.file('/foo');
		backupService.setCurrentWorkspace(workspaceResource);
		const backupResource = Uri.file('/bar');
		const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
		const filePathHash = crypto.createHash('md5').update(backupResource.fsPath).digest('hex');
		const expectedPath = path.join(environmentService.backupHome, workspaceHash, 'file', filePathHash);
		assert.equal(backupService.getBackupResource(backupResource).fsPath, expectedPath);
	});

	test('getBackupResource should get the correct backup path for untitled files', () => {
		// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
		const workspaceResource = Uri.file('/bar');
		backupService.setCurrentWorkspace(workspaceResource);
		const backupResource = Uri.from({ scheme: 'untitled' });
		const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
		const filePathHash = crypto.createHash('md5').update(backupResource.fsPath).digest('hex');
		const expectedPath = path.join(environmentService.backupHome, workspaceHash, 'untitled', filePathHash);
		assert.equal(backupService.getBackupResource(backupResource).fsPath, expectedPath);
	});

	test('getBackupResource should get the correct backup path for text files', () => {
		// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
		const workspaceResource = Uri.file('/foo');
		backupService.setCurrentWorkspace(workspaceResource);
		const backupResource = Uri.file('/bar');
		const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
		const filePathHash = crypto.createHash('md5').update(backupResource.fsPath).digest('hex');
		const expectedPath = path.join(environmentService.backupHome, workspaceHash, 'file', filePathHash);
		assert.equal(backupService.getBackupResource(backupResource).fsPath, expectedPath);
	});

	test('getBackupResource should get the correct backup path for untitled files', () => {
		// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
		const workspaceResource = Uri.file('/foo');
		backupService.setCurrentWorkspace(workspaceResource);
		const backupResource = Uri.from({ scheme: 'untitled' });
		const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
		const filePathHash = crypto.createHash('md5').update(backupResource.fsPath).digest('hex');
		const expectedPath = path.join(environmentService.backupHome, workspaceHash, 'untitled', filePathHash);
		assert.equal(backupService.getBackupResource(backupResource).fsPath, expectedPath);
	});

	test('getWorkspaceTextFilesWithBackupsSync should return text file resources that have backups', done => {
		const workspaceResource = Uri.file('/foo');
		backupService.setCurrentWorkspace(workspaceResource);
		backupService.registerResourceForBackup(Uri.file('/bar')).then(() => {
			assert.deepEqual(backupService.getWorkspaceTextFilesWithBackupsSync(workspaceResource), ['/bar']);
			backupService.registerResourceForBackup(Uri.file('/baz')).then(() => {
				assert.deepEqual(backupService.getWorkspaceTextFilesWithBackupsSync(workspaceResource), ['/bar', '/baz']);
				done();
			});
		});
	});

	test('getWorkspaceUntitledFileBackupsSync should return untitled file backup resources', done => {
		const workspaceResource = Uri.file('/foo');
		backupService.setCurrentWorkspace(workspaceResource);
		const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
		const untitledBackupDir = path.join(environmentService.backupHome, workspaceHash, 'untitled');
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