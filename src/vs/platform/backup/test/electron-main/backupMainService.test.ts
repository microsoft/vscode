/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as platform from 'vs/base/common/platform';
import fs = require('fs');
import os = require('os');
import path = require('path');
import extfs = require('vs/base/node/extfs');
import pfs = require('vs/base/node/pfs');
import Uri from 'vs/base/common/uri';
import { TestEnvironmentService } from 'vs/test/utils/servicesTestUtils';
import { BackupMainService } from 'vs/platform/backup/electron-main/backupMainService';
import { IBackupWorkspacesFormat } from 'vs/platform/backup/common/backup';

class TestBackupMainService extends BackupMainService {
	constructor(backupHome: string, backupWorkspacesPath: string) {
		super(TestEnvironmentService);

		this.backupHome = backupHome;
		this.workspacesJsonPath = backupWorkspacesPath;

		// Force a reload with the new paths
		this.loadSync();
	}

	public removeWorkspaceBackupPathSync(workspace: Uri): void {
		return super.removeWorkspaceBackupPathSync(workspace);
	}

	public loadSync(): void {
		super.loadSync();
	}

	public toBackupPath(workspacePath: string): string {
		return path.join(this.backupHome, super.getWorkspaceHash(workspacePath));
	}
}

suite('BackupMainService', () => {
	const parentDir = path.join(os.tmpdir(), 'vsctests', 'service');
	const backupHome = path.join(parentDir, 'Backups');
	const backupWorkspacesPath = path.join(backupHome, 'workspaces.json');

	const fooFile = Uri.file(platform.isWindows ? 'C:\\foo' : '/foo');
	const barFile = Uri.file(platform.isWindows ? 'C:\\bar' : '/bar');

	let service: TestBackupMainService;

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

	test('workspaceBackupPaths should return [] when workspaces.json doesn\'t exist', () => {
		assert.deepEqual(service.workspaceBackupPaths, []);
	});

	test('workspaceBackupPaths should return [] when workspaces.json is not properly formed JSON', () => {
		fs.writeFileSync(backupWorkspacesPath, '');
		assert.deepEqual(service.workspaceBackupPaths, []);
		fs.writeFileSync(backupWorkspacesPath, '{]');
		assert.deepEqual(service.workspaceBackupPaths, []);
		fs.writeFileSync(backupWorkspacesPath, 'foo');
		assert.deepEqual(service.workspaceBackupPaths, []);
	});

	test('workspaceBackupPaths should return [] when folderWorkspaces in workspaces.json is absent', () => {
		fs.writeFileSync(backupWorkspacesPath, '{}');
		assert.deepEqual(service.workspaceBackupPaths, []);
	});

	test('workspaceBackupPaths should return [] when folderWorkspaces in workspaces.json is not a string array', () => {
		fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{}}');
		assert.deepEqual(service.workspaceBackupPaths, []);
		fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{"foo": ["bar"]}}');
		assert.deepEqual(service.workspaceBackupPaths, []);
		fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{"foo": []}}');
		assert.deepEqual(service.workspaceBackupPaths, []);
		fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{"foo": "bar"}}');
		assert.deepEqual(service.workspaceBackupPaths, []);
		fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":"foo"}');
		assert.deepEqual(service.workspaceBackupPaths, []);
		fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":1}');
		assert.deepEqual(service.workspaceBackupPaths, []);
	});

	test('pushWorkspaceBackupPathsSync should persist paths to workspaces.json', () => {
		service.registerWindowForBackups(1, false, null, fooFile.fsPath);
		service.registerWindowForBackups(2, false, null, barFile.fsPath);
		assert.deepEqual(service.workspaceBackupPaths, [fooFile.fsPath, barFile.fsPath]);
	});

	test('removeWorkspaceBackupPath should remove workspaces from workspaces.json', done => {
		service.registerWindowForBackups(1, false, null, fooFile.fsPath);
		service.registerWindowForBackups(2, false, null, barFile.fsPath);
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
		const workspacesJson: IBackupWorkspacesFormat = { folderWorkspaces: [fooFile.fsPath], emptyWorkspaces: [] };
		pfs.writeFile(backupWorkspacesPath, JSON.stringify(workspacesJson)).then(() => {
			service.removeWorkspaceBackupPathSync(barFile);
			pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
				const json = <IBackupWorkspacesFormat>JSON.parse(content);
				assert.deepEqual(json.folderWorkspaces, [fooFile.fsPath]);
				done();
			});
		});
	});

	test('service validates backup workspaces on startup and cleans up', done => {

		// 1) backup workspace path does not exist
		console.log('fooFile :' + fooFile.fsPath);
		console.log('barFile :' + barFile.fsPath);
		service.registerWindowForBackups(1, false, null, fooFile.fsPath);
		service.registerWindowForBackups(2, false, null, barFile.fsPath);
		service.loadSync();
		assert.deepEqual(service.workspaceBackupPaths, []);

		// 2) backup workspace path exists with empty contents within
		fs.mkdirSync(service.toBackupPath(fooFile.fsPath));
		fs.mkdirSync(service.toBackupPath(barFile.fsPath));
		service.registerWindowForBackups(1, false, null, fooFile.fsPath);
		service.registerWindowForBackups(2, false, null, barFile.fsPath);
		service.loadSync();
		assert.deepEqual(service.workspaceBackupPaths, []);
		assert.ok(!fs.exists(service.toBackupPath(fooFile.fsPath)));
		assert.ok(!fs.exists(service.toBackupPath(barFile.fsPath)));

		// 3) backup workspace path exists with empty folders within
		fs.mkdirSync(service.toBackupPath(fooFile.fsPath));
		fs.mkdirSync(service.toBackupPath(barFile.fsPath));
		fs.mkdirSync(path.join(service.toBackupPath(fooFile.fsPath), 'file'));
		fs.mkdirSync(path.join(service.toBackupPath(barFile.fsPath), 'untitled'));
		service.registerWindowForBackups(1, false, null, fooFile.fsPath);
		service.registerWindowForBackups(2, false, null, barFile.fsPath);
		service.loadSync();
		assert.deepEqual(service.workspaceBackupPaths, []);
		assert.ok(!fs.exists(service.toBackupPath(fooFile.fsPath)));
		assert.ok(!fs.exists(service.toBackupPath(barFile.fsPath)));

		done();
	});

	test('toBackupPath ignores case on Windows and Mac', () => {
		// Skip test on Linux
		if (platform.isLinux) {
			return;
		}

		if (platform.isMacintosh) {
			assert.equal(service.toBackupPath('/foo'), service.toBackupPath('/FOO'));
		}

		if (platform.isWindows) {
			assert.equal(service.toBackupPath('c:\\foo'), service.toBackupPath('C:\\FOO'));
		}
	});

	suite('getBackupPath', () => {
		test('should return the window\'s correct path', done => {
			service.registerWindowForBackups(1, false, null, fooFile.fsPath);
			service.registerWindowForBackups(2, true, 'test');
			service.getBackupPath(1).then(window1Path => {
				assert.equal(window1Path, service.toBackupPath(fooFile.fsPath));
				service.getBackupPath(2).then(window2Path => {
					assert.equal(window2Path, path.join(backupHome, 'test'));
					done();
				});
			});
		});

		test('should override stale window paths with new paths', done => {
			service.registerWindowForBackups(1, false, null, fooFile.fsPath);
			service.registerWindowForBackups(1, false, null, barFile.fsPath);
			service.getBackupPath(1).then(windowPath => {
				assert.equal(windowPath, service.toBackupPath(barFile.fsPath));
				done();
			});
		});

		test('should throw when the window is not registered', () => {
			assert.throws(() => service.getBackupPath(1));
		});
	});
});