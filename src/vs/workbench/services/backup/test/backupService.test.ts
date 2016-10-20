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
import { TestEnvironmentService } from 'vs/test/utils/servicesTestUtils';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IBackupFormat } from 'vs/platform/backup/common/backup';
import { BackupService } from 'vs/workbench/services/backup/node/backupService';

class TestBackupService extends BackupService {
	constructor(workspace: Uri, backupHome: string, backupWorkspacesPath: string) {
		super(workspace, TestEnvironmentService);

		this.backupHome = backupHome;
		this.backupWorkspacesPath = backupWorkspacesPath;
	}
}

suite('BackupService', () => {
	const parentDir = path.join(os.tmpdir(), 'vsctests', 'service')
	const backupHome = path.join(parentDir, 'Backups');
	const backupWorkspacesPath = path.join(backupHome, 'workspaces.json');

	const workspaceResource = Uri.file(platform.isWindows ? 'C:\\workspace' : '/workspace');
	const fooFile = Uri.file(platform.isWindows ? 'C:\\foo' : '/foo');
	const barFile = Uri.file(platform.isWindows ? 'C:\\bar' : '/bar');
	const bazFile = Uri.file(platform.isWindows ? 'C:\\baz' : '/baz');

	let backupService: BackupService;

	setup(done => {
		backupService = new TestBackupService(workspaceResource, backupHome, backupWorkspacesPath);

		// Delete any existing backups completely and then re-create it.
		extfs.del(backupHome, os.tmpdir(), () => {
			pfs.mkdirp(backupHome).then(() => {
				pfs.writeFileAndFlush(backupWorkspacesPath, '').then(() => {
					done();
				});
			});
		});
	});

	teardown(done => {
		extfs.del(backupHome, os.tmpdir(), done);
	});

	test('removeWorkspaceBackupPath should remove workspaces from workspaces.json', done => {
		const workspacesJson: IBackupFormat = { folderWorkspaces: {} };
		workspacesJson.folderWorkspaces[fooFile.fsPath] = [];
		workspacesJson.folderWorkspaces[barFile.fsPath] = [];
		pfs.writeFileAndFlush(backupWorkspacesPath, JSON.stringify(workspacesJson)).then(() => {
			backupService.removeWorkspaceBackupPath(fooFile).then(() => {
				pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
					const json = <IBackupFormat>JSON.parse(buffer);
					assert.deepEqual(Object.keys(json.folderWorkspaces), [barFile.fsPath]);
					backupService.removeWorkspaceBackupPath(barFile).then(() => {
						pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
							const json2 = <IBackupFormat>JSON.parse(content);
							assert.deepEqual(Object.keys(json2.folderWorkspaces), []);
							done();
						});
					});
				});
			});
		});
	});

	test('removeWorkspaceBackupPath should fail gracefully when removing a path that doesn\'t exist', done => {
		const workspacesJson: IBackupFormat = { folderWorkspaces: {} };
		workspacesJson.folderWorkspaces[fooFile.fsPath] = [];
		pfs.writeFileAndFlush(backupWorkspacesPath, JSON.stringify(workspacesJson)).then(() => {
			backupService.removeWorkspaceBackupPath(barFile).then(() => {
				pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
					const json = <IBackupFormat>JSON.parse(content);
					assert.deepEqual(Object.keys(json.folderWorkspaces), [fooFile.fsPath]);
					done();
				});
			});
		});
	});

	test('registerResourceForBackup should register backups to workspaces.json', done => {
		backupService.registerResourceForBackup(fooFile).then(() => {
			pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
				const json = <IBackupFormat>JSON.parse(content);
				assert.deepEqual(json.folderWorkspaces[workspaceResource.fsPath], [fooFile.fsPath]);
				done();
			});
		});
	});

	test('deregisterResourceForBackup should deregister backups from workspaces.json', done => {
		backupService.registerResourceForBackup(fooFile).then(() => {
			pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
				const json = <IBackupFormat>JSON.parse(content);
				assert.deepEqual(json.folderWorkspaces[workspaceResource.fsPath], [fooFile.fsPath]);
				backupService.deregisterResourceForBackup(fooFile).then(() => {
					pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
						const json2 = <IBackupFormat>JSON.parse(content);
						assert.deepEqual(json2.folderWorkspaces[workspaceResource.fsPath], []);
						done();
					});
				});
			});
		});
	});

	test('getBackupResource should get the correct backup path for text files', () => {
		// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
		const backupResource = fooFile;
		const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
		const filePathHash = crypto.createHash('md5').update(backupResource.fsPath).digest('hex');
		const expectedPath = Uri.file(path.join(backupHome, workspaceHash, 'file', filePathHash)).fsPath;
		assert.equal(backupService.getBackupResource(backupResource).fsPath, expectedPath);
	});

	test('getBackupResource should get the correct backup path for untitled files', () => {
		// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
		const backupResource = Uri.from({ scheme: 'untitled' });
		const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
		const filePathHash = crypto.createHash('md5').update(backupResource.fsPath).digest('hex');
		const expectedPath = Uri.file(path.join(backupHome, workspaceHash, 'untitled', filePathHash)).fsPath;
		assert.equal(backupService.getBackupResource(backupResource).fsPath, expectedPath);
	});

	test('getBackupResource should get the correct backup path for text files', () => {
		// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
		const backupResource = fooFile;
		const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
		const filePathHash = crypto.createHash('md5').update(backupResource.fsPath).digest('hex');
		const expectedPath = Uri.file(path.join(backupHome, workspaceHash, 'file', filePathHash)).fsPath;
		assert.equal(backupService.getBackupResource(backupResource).fsPath, expectedPath);
	});

	test('getBackupResource should get the correct backup path for untitled files', () => {
		// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
		const backupResource = Uri.from({ scheme: 'untitled' });
		const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
		const filePathHash = crypto.createHash('md5').update(backupResource.fsPath).digest('hex');
		const expectedPath = Uri.file(path.join(backupHome, workspaceHash, 'untitled', filePathHash)).fsPath;
		assert.equal(backupService.getBackupResource(backupResource).fsPath, expectedPath);
	});

	test('doesTextFileHaveBackup should return whether a backup resource exists', done => {
		backupService.doesTextFileHaveBackup(fooFile).then(exists => {
			assert.equal(exists, false);
			backupService.registerResourceForBackup(fooFile).then(() => {
				backupService.doesTextFileHaveBackup(fooFile).then(exists2 => {
					assert.equal(exists2, true);
					backupService.deregisterResourceForBackup(fooFile).then(() => {
						backupService.doesTextFileHaveBackup(fooFile).then(exists3 => {
							assert.equal(exists3, false);
							done();
						});
					});
				});
			});
		});
	});
});