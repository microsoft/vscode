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
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { BackupMainService } from 'vs/platform/backup/electron-main/backupMainService';
import { IBackupWorkspacesFormat } from 'vs/platform/backup/common/backup';
import { HotExitConfiguration } from 'vs/platform/files/common/files';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';

class TestBackupMainService extends BackupMainService {
	constructor(backupHome: string, backupWorkspacesPath: string, configService: TestConfigurationService) {
		super(new EnvironmentService(parseArgs(process.argv), process.execPath), configService);

		this.backupHome = backupHome;
		this.workspacesJsonPath = backupWorkspacesPath;

		// Force a reload with the new paths
		this.loadSync();
	}

	public removeBackupPathSync(workspaceIdenfitier: string, isEmptyWorkspace: boolean): void {
		return super.removeBackupPathSync(workspaceIdenfitier, isEmptyWorkspace);
	}

	public loadSync(): void {
		super.loadSync();
	}

	public dedupeFolderWorkspaces(backups: IBackupWorkspacesFormat): IBackupWorkspacesFormat {
		return super.dedupeFolderWorkspaces(backups);
	}

	public toBackupPath(workspacePath: string): string {
		return path.join(this.backupHome, super.getWorkspaceHash(workspacePath));
	}

	public getWorkspaceHash(workspacePath: string): string {
		return super.getWorkspaceHash(workspacePath);
	}
}

suite('BackupMainService', () => {
	const parentDir = path.join(os.tmpdir(), 'vsctests', 'service');
	const backupHome = path.join(parentDir, 'Backups');
	const backupWorkspacesPath = path.join(backupHome, 'workspaces.json');

	const fooFile = Uri.file(platform.isWindows ? 'C:\\foo' : '/foo');
	const barFile = Uri.file(platform.isWindows ? 'C:\\bar' : '/bar');

	let service: TestBackupMainService;
	let configService: TestConfigurationService;

	setup(done => {
		configService = new TestConfigurationService();
		service = new TestBackupMainService(backupHome, backupWorkspacesPath, configService);

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

	test('service validates backup workspaces on startup and cleans up', done => {

		// 1) backup workspace path does not exist
		service.registerWindowForBackupsSync(1, false, null, fooFile.fsPath);
		service.registerWindowForBackupsSync(2, false, null, barFile.fsPath);
		service.loadSync();
		assert.deepEqual(service.getWorkspaceBackupPaths(), []);

		// 2) backup workspace path exists with empty contents within
		fs.mkdirSync(service.toBackupPath(fooFile.fsPath));
		fs.mkdirSync(service.toBackupPath(barFile.fsPath));
		service.registerWindowForBackupsSync(1, false, null, fooFile.fsPath);
		service.registerWindowForBackupsSync(2, false, null, barFile.fsPath);
		service.loadSync();
		assert.deepEqual(service.getWorkspaceBackupPaths(), []);
		assert.ok(!fs.exists(service.toBackupPath(fooFile.fsPath)));
		assert.ok(!fs.exists(service.toBackupPath(barFile.fsPath)));

		// 3) backup workspace path exists with empty folders within
		fs.mkdirSync(service.toBackupPath(fooFile.fsPath));
		fs.mkdirSync(service.toBackupPath(barFile.fsPath));
		fs.mkdirSync(path.join(service.toBackupPath(fooFile.fsPath), 'file'));
		fs.mkdirSync(path.join(service.toBackupPath(barFile.fsPath), 'untitled'));
		service.registerWindowForBackupsSync(1, false, null, fooFile.fsPath);
		service.registerWindowForBackupsSync(2, false, null, barFile.fsPath);
		service.loadSync();
		assert.deepEqual(service.getWorkspaceBackupPaths(), []);
		assert.ok(!fs.exists(service.toBackupPath(fooFile.fsPath)));
		assert.ok(!fs.exists(service.toBackupPath(barFile.fsPath)));

		// 4) backup workspace path points to a workspace that no longer exists
		// so it should convert the backup worspace to an empty workspace backup
		const fileBackups = path.join(service.toBackupPath(fooFile.fsPath), 'file');
		fs.mkdirSync(service.toBackupPath(fooFile.fsPath));
		fs.mkdirSync(service.toBackupPath(barFile.fsPath));
		fs.mkdirSync(fileBackups);
		service.registerWindowForBackupsSync(1, false, null, fooFile.fsPath);
		assert.equal(service.getWorkspaceBackupPaths().length, 1);
		assert.equal(service.getEmptyWorkspaceBackupPaths().length, 0);
		fs.writeFileSync(path.join(fileBackups, 'backup.txt'), '');
		service.loadSync();
		assert.equal(service.getWorkspaceBackupPaths().length, 0);
		assert.equal(service.getEmptyWorkspaceBackupPaths().length, 1);

		done();
	});

	suite('loadSync', () => {
		test('getWorkspaceBackupPaths() should return [] when workspaces.json doesn\'t exist', () => {
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
		});

		test('getWorkspaceBackupPaths() should return [] when workspaces.json is not properly formed JSON', () => {
			fs.writeFileSync(backupWorkspacesPath, '');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{]');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, 'foo');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
		});

		test('getWorkspaceBackupPaths() should return [] when folderWorkspaces in workspaces.json is absent', () => {
			fs.writeFileSync(backupWorkspacesPath, '{}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
		});

		test('getWorkspaceBackupPaths() should return [] when folderWorkspaces in workspaces.json is not a string array', () => {
			fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{}}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{"foo": ["bar"]}}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{"foo": []}}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{"foo": "bar"}}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":"foo"}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":1}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
		});

		test('getWorkspaceBackupPaths() should return [] when files.hotExit = "onExitAndWindowClose"', () => {
			service.registerWindowForBackupsSync(1, false, null, fooFile.fsPath.toUpperCase());
			assert.deepEqual(service.getWorkspaceBackupPaths(), [fooFile.fsPath.toUpperCase()]);
			configService.setUserConfiguration('files.hotExit', HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE);
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
		});

		test('getEmptyWorkspaceBackupPaths() should return [] when workspaces.json doesn\'t exist', () => {
			assert.deepEqual(service.getEmptyWorkspaceBackupPaths(), []);
		});

		test('getEmptyWorkspaceBackupPaths() should return [] when workspaces.json is not properly formed JSON', () => {
			fs.writeFileSync(backupWorkspacesPath, '');
			service.loadSync();
			assert.deepEqual(service.getEmptyWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{]');
			service.loadSync();
			assert.deepEqual(service.getEmptyWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, 'foo');
			service.loadSync();
			assert.deepEqual(service.getEmptyWorkspaceBackupPaths(), []);
		});

		test('getEmptyWorkspaceBackupPaths() should return [] when folderWorkspaces in workspaces.json is absent', () => {
			fs.writeFileSync(backupWorkspacesPath, '{}');
			service.loadSync();
			assert.deepEqual(service.getEmptyWorkspaceBackupPaths(), []);
		});

		test('getEmptyWorkspaceBackupPaths() should return [] when folderWorkspaces in workspaces.json is not a string array', () => {
			fs.writeFileSync(backupWorkspacesPath, '{"emptyWorkspaces":{}}');
			service.loadSync();
			assert.deepEqual(service.getEmptyWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"emptyWorkspaces":{"foo": ["bar"]}}');
			service.loadSync();
			assert.deepEqual(service.getEmptyWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"emptyWorkspaces":{"foo": []}}');
			service.loadSync();
			assert.deepEqual(service.getEmptyWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"emptyWorkspaces":{"foo": "bar"}}');
			service.loadSync();
			assert.deepEqual(service.getEmptyWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"emptyWorkspaces":"foo"}');
			service.loadSync();
			assert.deepEqual(service.getEmptyWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"emptyWorkspaces":1}');
			service.loadSync();
			assert.deepEqual(service.getEmptyWorkspaceBackupPaths(), []);
		});
	});

	suite('dedupeFolderWorkspaces', () => {
		test('should ignore duplicates on Windows and Mac', () => {
			// Skip test on Linux
			if (platform.isLinux) {
				return;
			}

			const backups: IBackupWorkspacesFormat = {
				folderWorkspaces: platform.isWindows ? ['c:\\FOO', 'C:\\FOO', 'c:\\foo'] : ['/FOO', '/foo'],
				emptyWorkspaces: []
			};

			service.dedupeFolderWorkspaces(backups);

			assert.equal(backups.folderWorkspaces.length, 1);
			if (platform.isWindows) {
				assert.deepEqual(backups.folderWorkspaces, ['c:\\FOO'], 'should return the first duplicated entry');
			} else {
				assert.deepEqual(backups.folderWorkspaces, ['/FOO'], 'should return the first duplicated entry');
			}
		});
	});

	suite('registerWindowForBackups', () => {
		test('should persist paths to workspaces.json', done => {
			service.registerWindowForBackupsSync(1, false, null, fooFile.fsPath);
			service.registerWindowForBackupsSync(2, false, null, barFile.fsPath);
			assert.deepEqual(service.getWorkspaceBackupPaths(), [fooFile.fsPath, barFile.fsPath]);
			pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
				const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
				assert.deepEqual(json.folderWorkspaces, [fooFile.fsPath, barFile.fsPath]);
				done();
			});
		});

		test('should always store the workspace path in workspaces.json using the case given, regardless of whether the file system is case-sensitive', done => {
			service.registerWindowForBackupsSync(1, false, null, fooFile.fsPath.toUpperCase());
			assert.deepEqual(service.getWorkspaceBackupPaths(), [fooFile.fsPath.toUpperCase()]);
			pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
				const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
				assert.deepEqual(json.folderWorkspaces, [fooFile.fsPath.toUpperCase()]);
				done();
			});
		});
	});

	suite('removeBackupPathSync', () => {
		test('should remove folder workspaces from workspaces.json', done => {
			service.registerWindowForBackupsSync(1, false, null, fooFile.fsPath);
			service.registerWindowForBackupsSync(2, false, null, barFile.fsPath);
			service.removeBackupPathSync(fooFile.fsPath, false);
			pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
				const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
				assert.deepEqual(json.folderWorkspaces, [barFile.fsPath]);
				service.removeBackupPathSync(barFile.fsPath, false);
				pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
					const json2 = <IBackupWorkspacesFormat>JSON.parse(content);
					assert.deepEqual(json2.folderWorkspaces, []);
					done();
				});
			});
		});

		test('should remove empty workspaces from workspaces.json', done => {
			service.registerWindowForBackupsSync(1, true, 'foo');
			service.registerWindowForBackupsSync(2, true, 'bar');
			service.removeBackupPathSync('foo', true);
			pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
				const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
				assert.deepEqual(json.emptyWorkspaces, ['bar']);
				service.removeBackupPathSync('bar', true);
				pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
					const json2 = <IBackupWorkspacesFormat>JSON.parse(content);
					assert.deepEqual(json2.emptyWorkspaces, []);
					done();
				});
			});
		});

		test('should fail gracefully when removing a path that doesn\'t exist', done => {
			const workspacesJson: IBackupWorkspacesFormat = { folderWorkspaces: [fooFile.fsPath], emptyWorkspaces: [] };
			pfs.writeFile(backupWorkspacesPath, JSON.stringify(workspacesJson)).then(() => {
				service.removeBackupPathSync(barFile.fsPath, false);
				service.removeBackupPathSync('test', true);
				pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
					const json = <IBackupWorkspacesFormat>JSON.parse(content);
					assert.deepEqual(json.folderWorkspaces, [fooFile.fsPath]);
					done();
				});
			});
		});
	});

	suite('getWorkspaceHash', () => {
		test('should perform an md5 hash on the path', () => {
			assert.equal(service.getWorkspaceHash('/foo'), '1effb2475fcfba4f9e8b8a1dbc8f3caf');
		});

		test('should ignore case on Windows and Mac', () => {
			// Skip test on Linux
			if (platform.isLinux) {
				return;
			}

			if (platform.isMacintosh) {
				assert.equal(service.getWorkspaceHash('/foo'), service.getWorkspaceHash('/FOO'));
			}

			if (platform.isWindows) {
				assert.equal(service.getWorkspaceHash('c:\\foo'), service.getWorkspaceHash('C:\\FOO'));
			}
		});
	});

	suite('getBackupPath', () => {
		test('should return the window\'s correct path', done => {
			service.registerWindowForBackupsSync(1, false, null, fooFile.fsPath);
			service.registerWindowForBackupsSync(2, true, 'test');
			service.getBackupPath(1).then(window1Path => {
				assert.equal(window1Path, service.toBackupPath(fooFile.fsPath));
				service.getBackupPath(2).then(window2Path => {
					assert.equal(window2Path, path.join(backupHome, 'test'));
					done();
				});
			});
		});

		test('should override stale window paths with new paths', done => {
			service.registerWindowForBackupsSync(1, false, null, fooFile.fsPath);
			service.registerWindowForBackupsSync(1, false, null, barFile.fsPath);
			service.getBackupPath(1).then(windowPath => {
				assert.equal(windowPath, service.toBackupPath(barFile.fsPath));
				done();
			});
		});

		test('should throw when the window is not registered', () => {
			assert.throws(() => service.getBackupPath(1));
		});
	});

	suite('mixed path casing', () => {
		test('should handle case insensitive paths properly (registerWindowForBackupsSync)', done => {
			service.registerWindowForBackupsSync(1, false, null, fooFile.fsPath);
			service.registerWindowForBackupsSync(1, false, null, fooFile.fsPath.toUpperCase());

			if (platform.isLinux) {
				assert.equal(service.getWorkspaceBackupPaths().length, 2);
			} else {
				assert.equal(service.getWorkspaceBackupPaths().length, 1);
			}

			done();
		});

		test('should handle case insensitive paths properly (removeBackupPathSync)', done => {

			// same case
			service.registerWindowForBackupsSync(1, false, null, fooFile.fsPath);
			service.removeBackupPathSync(fooFile.fsPath, false);
			assert.equal(service.getWorkspaceBackupPaths().length, 0);

			// mixed case
			service.registerWindowForBackupsSync(1, false, null, fooFile.fsPath);
			service.removeBackupPathSync(fooFile.fsPath.toUpperCase(), false);

			if (platform.isLinux) {
				assert.equal(service.getWorkspaceBackupPaths().length, 1);
			} else {
				assert.equal(service.getWorkspaceBackupPaths().length, 0);
			}

			done();
		});
	});
});