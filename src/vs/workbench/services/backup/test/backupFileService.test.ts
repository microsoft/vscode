/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as platform from 'vs/base/common/platform';
import crypto = require('crypto');
import os = require('os');
import fs = require('fs');
import path = require('path');
import extfs = require('vs/base/node/extfs');
import pfs = require('vs/base/node/pfs');
import Uri from 'vs/base/common/uri';
import { TestEnvironmentService } from 'vs/test/utils/servicesTestUtils';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IBackupFormat } from 'vs/platform/backup/common/backup';
import { BackupFileService } from 'vs/workbench/services/backup/node/backupFileService';
import { FileService } from 'vs/workbench/services/files/node/fileService';

class TestBackupFileService extends BackupFileService {
	constructor(workspace: Uri, backupHome: string, backupWorkspacesPath: string) {
		const fileService = new FileService(workspace.fsPath, { disableWatcher: true }, null, null, null);
		super(workspace, TestEnvironmentService, fileService);

		this.backupHome = backupHome;
		this.backupWorkspacesPath = backupWorkspacesPath;
	}
}

suite('BackupFileService', () => {
	const parentDir = path.join(os.tmpdir(), 'vsctests', 'service')
	const backupHome = path.join(parentDir, 'Backups');
	const backupWorkspacesJsonPath = path.join(backupHome, 'workspaces.json');

	const workspaceResource = Uri.file(platform.isWindows ? 'C:\\workspace' : '/workspace');
	const workspaceBackupPath = path.join(backupHome, crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex'));
	const fooFile = Uri.file(platform.isWindows ? 'C:\\foo' : '/foo');
	const barFile = Uri.file(platform.isWindows ? 'C:\\bar' : '/bar');
	const bazFile = Uri.file(platform.isWindows ? 'C:\\baz' : '/baz');
	const untitledFile = Uri.from({ scheme: 'untitled' });
	const fooBackupPath = path.join(workspaceBackupPath, 'file', crypto.createHash('md5').update(fooFile.fsPath).digest('hex'));
	const barBackupPath = path.join(workspaceBackupPath, 'file', crypto.createHash('md5').update(barFile.fsPath).digest('hex'));
	const bazBackupPath = path.join(workspaceBackupPath, 'file', crypto.createHash('md5').update(bazFile.fsPath).digest('hex'));
	const untitledBackupPath = path.join(workspaceBackupPath, 'untitled', crypto.createHash('md5').update(untitledFile.fsPath).digest('hex'));

	let service: BackupFileService;

	setup(done => {
		service = new TestBackupFileService(workspaceResource, backupHome, backupWorkspacesJsonPath);

		// Delete any existing backups completely and then re-create it.
		extfs.del(backupHome, os.tmpdir(), () => {
			pfs.mkdirp(backupHome).then(() => {
				pfs.writeFileAndFlush(backupWorkspacesJsonPath, '').then(() => {
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
		pfs.writeFileAndFlush(backupWorkspacesJsonPath, JSON.stringify(workspacesJson)).then(() => {
			service.removeWorkspaceBackupPath(fooFile).then(() => {
				pfs.readFile(backupWorkspacesJsonPath, 'utf-8').then(buffer => {
					const json = <IBackupFormat>JSON.parse(buffer);
					assert.deepEqual(Object.keys(json.folderWorkspaces), [barFile.fsPath]);
					service.removeWorkspaceBackupPath(barFile).then(() => {
						pfs.readFile(backupWorkspacesJsonPath, 'utf-8').then(content => {
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
		pfs.writeFileAndFlush(backupWorkspacesJsonPath, JSON.stringify(workspacesJson)).then(() => {
			service.removeWorkspaceBackupPath(barFile).then(() => {
				pfs.readFile(backupWorkspacesJsonPath, 'utf-8').then(content => {
					const json = <IBackupFormat>JSON.parse(content);
					assert.deepEqual(Object.keys(json.folderWorkspaces), [fooFile.fsPath]);
					done();
				});
			});
		});
	});

	test('registerResourceForBackup should register backups to workspaces.json', done => {
		service.registerResourceForBackup(fooFile).then(() => {
			pfs.readFile(backupWorkspacesJsonPath, 'utf-8').then(content => {
				const json = <IBackupFormat>JSON.parse(content);
				assert.deepEqual(json.folderWorkspaces[workspaceResource.fsPath], [fooFile.fsPath]);
				done();
			});
		});
	});

	test('deregisterResourceForBackup should deregister backups from workspaces.json', done => {
		service.registerResourceForBackup(fooFile).then(() => {
			pfs.readFile(backupWorkspacesJsonPath, 'utf-8').then(content => {
				const json = <IBackupFormat>JSON.parse(content);
				assert.deepEqual(json.folderWorkspaces[workspaceResource.fsPath], [fooFile.fsPath]);
				service.deregisterResourceForBackup(fooFile).then(() => {
					pfs.readFile(backupWorkspacesJsonPath, 'utf-8').then(content => {
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
		assert.equal(service.getBackupResource(backupResource).fsPath, expectedPath);
	});

	test('getBackupResource should get the correct backup path for untitled files', () => {
		// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
		const backupResource = Uri.from({ scheme: 'untitled' });
		const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
		const filePathHash = crypto.createHash('md5').update(backupResource.fsPath).digest('hex');
		const expectedPath = Uri.file(path.join(backupHome, workspaceHash, 'untitled', filePathHash)).fsPath;
		assert.equal(service.getBackupResource(backupResource).fsPath, expectedPath);
	});

	test('getBackupResource should get the correct backup path for text files', () => {
		// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
		const backupResource = fooFile;
		const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
		const filePathHash = crypto.createHash('md5').update(backupResource.fsPath).digest('hex');
		const expectedPath = Uri.file(path.join(backupHome, workspaceHash, 'file', filePathHash)).fsPath;
		assert.equal(service.getBackupResource(backupResource).fsPath, expectedPath);
	});

	test('getBackupResource should get the correct backup path for untitled files', () => {
		// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
		const backupResource = Uri.from({ scheme: 'untitled' });
		const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
		const filePathHash = crypto.createHash('md5').update(backupResource.fsPath).digest('hex');
		const expectedPath = Uri.file(path.join(backupHome, workspaceHash, 'untitled', filePathHash)).fsPath;
		assert.equal(service.getBackupResource(backupResource).fsPath, expectedPath);
	});

	test('doesTextFileHaveBackup should return whether a backup resource exists', done => {
		service.doesTextFileHaveBackup(fooFile).then(exists => {
			assert.equal(exists, false);
			service.registerResourceForBackup(fooFile).then(() => {
				service.doesTextFileHaveBackup(fooFile).then(exists2 => {
					assert.equal(exists2, true);
					service.deregisterResourceForBackup(fooFile).then(() => {
						service.doesTextFileHaveBackup(fooFile).then(exists3 => {
							assert.equal(exists3, false);
							done();
						});
					});
				});
			});
		});
	});

	test('backupFile - text file', function (done: () => void) {
		service.backupAndRegisterResource(fooFile, 'test').then(() => {
			assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'file')).length, 1);
			assert.equal(fs.existsSync(fooBackupPath), true);
			assert.equal(fs.readFileSync(fooBackupPath), 'test');
			done();
		});
	});

	test('backupFile - untitled file', function (done: () => void) {
		service.backupAndRegisterResource(untitledFile, 'test').then(() => {
			assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'untitled')).length, 1);
			assert.equal(fs.existsSync(untitledBackupPath), true);
			assert.equal(fs.readFileSync(untitledBackupPath), 'test');
			done();
		});
	});

	test('discardBackup - text file', function (done: () => void) {
		service.backupAndRegisterResource(fooFile, 'test').then(() => {
			assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'file')).length, 1);
			service.discardAndDeregisterResource(fooFile).then(() => {
				assert.equal(fs.existsSync(fooBackupPath), false);
				assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'file')).length, 0);
				done();
			});
		});
	});

	test('discardBackup - untitled file', function (done: () => void) {
		service.backupAndRegisterResource(untitledFile, 'test').then(() => {
			assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'untitled')).length, 1);
			service.discardAndDeregisterResource(untitledFile).then(() => {
				assert.equal(fs.existsSync(untitledBackupPath), false);
				assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'untitled')).length, 0);
				done();
			});
		});
	});

	test('discardBackups - text file', function (done: () => void) {
		service.backupAndRegisterResource(fooFile, 'test').then(() => {
			assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'file')).length, 1);
			service.backupAndRegisterResource(barFile, 'test').then(() => {
				assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'file')).length, 2);
				service.discardBackups().then(() => {
					assert.equal(fs.existsSync(fooBackupPath), false);
					assert.equal(fs.existsSync(barBackupPath), false);
					assert.equal(fs.existsSync(path.join(workspaceBackupPath, 'file')), false);
					done();
				});
			});
		});
	});

	test('discardBackups - untitled file', function (done: () => void) {
		service.backupAndRegisterResource(untitledFile, 'test').then(() => {
			assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'untitled')).length, 1);
			service.discardBackups().then(() => {
				assert.equal(fs.existsSync(untitledBackupPath), false);
				assert.equal(fs.existsSync(path.join(workspaceBackupPath, 'untitled')), false);
				done();
			});
		});
	});
});