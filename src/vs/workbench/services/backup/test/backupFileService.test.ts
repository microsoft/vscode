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
import { BackupFileService } from 'vs/workbench/services/backup/node/backupFileService';
import { FileService } from 'vs/workbench/services/files/node/fileService';

class TestBackupFileService extends BackupFileService {
	constructor(workspace: Uri, backupHome: string, workspacesJsonPath: string) {
		const fileService = new FileService(workspace.fsPath, { disableWatcher: true }, null);
		super(workspace, TestEnvironmentService, fileService);

		this.backupHome = backupHome;
		this.workspacesJsonPath = workspacesJsonPath;
	}
}

suite('BackupFileService', () => {
	const parentDir = path.join(os.tmpdir(), 'vsctests', 'service');
	const backupHome = path.join(parentDir, 'Backups');
	const workspacesJsonPath = path.join(backupHome, 'workspaces.json');

	const workspaceResource = Uri.file(platform.isWindows ? 'C:\\workspace' : '/workspace');
	const workspaceBackupPath = path.join(backupHome, crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex'));
	const fooFile = Uri.file(platform.isWindows ? 'C:\\foo' : '/foo');
	const barFile = Uri.file(platform.isWindows ? 'C:\\bar' : '/bar');
	const untitledFile = Uri.from({ scheme: 'untitled', path: 'Untitled-1' });
	const fooBackupPath = path.join(workspaceBackupPath, 'file', crypto.createHash('md5').update(fooFile.fsPath).digest('hex'));
	const barBackupPath = path.join(workspaceBackupPath, 'file', crypto.createHash('md5').update(barFile.fsPath).digest('hex'));
	const untitledBackupPath = path.join(workspaceBackupPath, 'untitled', untitledFile.fsPath);

	let service: BackupFileService;

	setup(done => {
		service = new TestBackupFileService(workspaceResource, backupHome, workspacesJsonPath);

		// Delete any existing backups completely and then re-create it.
		extfs.del(backupHome, os.tmpdir(), () => {
			pfs.mkdirp(backupHome).then(() => {
				pfs.writeFileAndFlush(workspacesJsonPath, '').then(() => {
					done();
				});
			});
		});
	});

	teardown(done => {
		extfs.del(backupHome, os.tmpdir(), done);
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
		// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePath>
		const backupResource = Uri.from({ scheme: 'untitled', path: 'Untitled-1' });
		const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
		const expectedPath = Uri.file(path.join(backupHome, workspaceHash, 'untitled', backupResource.fsPath)).fsPath;
		assert.equal(service.getBackupResource(backupResource).fsPath, expectedPath);
	});

	test('doesTextFileHaveBackup should return whether a backup resource exists', done => {
		service.hasTextFileBackup(fooFile).then(exists => {
			assert.equal(exists, false);
			pfs.mkdirp(path.dirname(fooBackupPath)).then(() => {
				fs.writeFileSync(fooBackupPath, 'foo');
				service.hasTextFileBackup(fooFile).then(exists2 => {
					assert.equal(exists2, true);
					done();
				});
			});
		});
	});

	test('backupResource - text file', function (done: () => void) {
		service.backupResource(fooFile, 'test').then(() => {
			assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'file')).length, 1);
			assert.equal(fs.existsSync(fooBackupPath), true);
			assert.equal(fs.readFileSync(fooBackupPath), 'test');
			done();
		});
	});

	test('backupResource - untitled file', function (done: () => void) {
		service.backupResource(untitledFile, 'test').then(() => {
			assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'untitled')).length, 1);
			assert.equal(fs.existsSync(untitledBackupPath), true);
			assert.equal(fs.readFileSync(untitledBackupPath), 'test');
			done();
		});
	});

	test('discardResourceBackup - text file', function (done: () => void) {
		service.backupResource(fooFile, 'test').then(() => {
			assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'file')).length, 1);
			service.discardResourceBackup(fooFile).then(() => {
				assert.equal(fs.existsSync(fooBackupPath), false);
				assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'file')).length, 0);
				done();
			});
		});
	});

	test('discardResourceBackup - untitled file', function (done: () => void) {
		service.backupResource(untitledFile, 'test').then(() => {
			assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'untitled')).length, 1);
			service.discardResourceBackup(untitledFile).then(() => {
				assert.equal(fs.existsSync(untitledBackupPath), false);
				assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'untitled')).length, 0);
				done();
			});
		});
	});

	test('discardAllWorkspaceBackups - text file', function (done: () => void) {
		service.backupResource(fooFile, 'test').then(() => {
			assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'file')).length, 1);
			service.backupResource(barFile, 'test').then(() => {
				assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'file')).length, 2);
				service.discardAllWorkspaceBackups().then(() => {
					assert.equal(fs.existsSync(fooBackupPath), false);
					assert.equal(fs.existsSync(barBackupPath), false);
					assert.equal(fs.existsSync(path.join(workspaceBackupPath, 'file')), false);
					done();
				});
			});
		});
	});

	test('discardAllWorkspaceBackups - untitled file', function (done: () => void) {
		service.backupResource(untitledFile, 'test').then(() => {
			assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'untitled')).length, 1);
			service.discardAllWorkspaceBackups().then(() => {
				assert.equal(fs.existsSync(untitledBackupPath), false);
				assert.equal(fs.existsSync(path.join(workspaceBackupPath, 'untitled')), false);
				done();
			});
		});
	});

	test('getWorkspaceBackupPaths should return [] when workspaces.json doesn\'t exist', () => {
		fs.unlinkSync(workspacesJsonPath);
		service.getWorkspaceBackupPaths().then(paths => assert.deepEqual(paths, []));
	});

	test('getWorkspaceBackupPathsSync should return [] when workspaces.json is not properly formed JSON #1', () => {
		fs.writeFileSync(workspacesJsonPath, '');
		service.getWorkspaceBackupPaths().then(paths => assert.deepEqual(paths, []));
	});

	test('getWorkspaceBackupPathsSync should return [] when workspaces.json is not properly formed JSON #1', () => {
		fs.writeFileSync(workspacesJsonPath, '{]');
		service.getWorkspaceBackupPaths().then(paths => assert.deepEqual(paths, []));
	});

	test('getWorkspaceBackupPathsSync should return [] when workspaces.json is not properly formed JSON #1', () => {
		fs.writeFileSync(workspacesJsonPath, 'foo');
		service.getWorkspaceBackupPaths().then(paths => assert.deepEqual(paths, []));
	});

	test('getWorkspaceBackupPathsSync should return [] when folderWorkspaces in workspaces.json is absent', () => {
		fs.writeFileSync(workspacesJsonPath, '{}');
		service.getWorkspaceBackupPaths().then(paths => assert.deepEqual(paths, []));
	});

	test('getWorkspaceBackupPaths should return [] when folderWorkspaces in workspaces.json is not a string array #1', () => {
		fs.writeFileSync(workspacesJsonPath, '{"folderWorkspaces":{}}');
		service.getWorkspaceBackupPaths().then(paths => assert.deepEqual(paths, []));
	});

	test('getWorkspaceBackupPaths should return [] when folderWorkspaces in workspaces.json is not a string array #2', () => {
		fs.writeFileSync(workspacesJsonPath, '{"folderWorkspaces":{"foo": ["bar"]}}');
		service.getWorkspaceBackupPaths().then(paths => assert.deepEqual(paths, []));
	});

	test('getWorkspaceBackupPaths should return [] when folderWorkspaces in workspaces.json is not a string array #3', () => {
		fs.writeFileSync(workspacesJsonPath, '{"folderWorkspaces":{"foo": []}}');
		service.getWorkspaceBackupPaths().then(paths => assert.deepEqual(paths, []));
	});

	test('getWorkspaceBackupPaths should return [] when folderWorkspaces in workspaces.json is not a string array #4', () => {
		fs.writeFileSync(workspacesJsonPath, '{"folderWorkspaces":{"foo": "bar"}}');
		service.getWorkspaceBackupPaths().then(paths => assert.deepEqual(paths, []));
	});

	test('getWorkspaceBackupPaths should return [] when folderWorkspaces in workspaces.json is not a string array #5', () => {
		fs.writeFileSync(workspacesJsonPath, '{"folderWorkspaces":"foo"}');
		service.getWorkspaceBackupPaths().then(paths => assert.deepEqual(paths, []));
	});

	test('getWorkspaceBackupPaths should return [] when folderWorkspaces in workspaces.json is not a string array #6', () => {
		fs.writeFileSync(workspacesJsonPath, '{"folderWorkspaces":1}');
		service.getWorkspaceBackupPaths().then(paths => assert.deepEqual(paths, []));
	});

	test('getWorkspaceBackupPaths should return the contents of folderWorkspaces in workspaces.json', () => {
		fs.writeFileSync(workspacesJsonPath, '{"folderWorkspaces":["foo", "bar"]}');
		service.getWorkspaceBackupPaths().then(paths => assert.deepEqual(paths, ['foo', 'bar']));
	});
});