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
import { LogMainService } from "vs/platform/log/common/log";

class TestBackupMainService extends BackupMainService {

	constructor(backupHome: string, backupWorkspacesPath: string, configService: TestConfigurationService) {
		super(new EnvironmentService(parseArgs(process.argv), process.execPath), configService, new LogMainService(new EnvironmentService(parseArgs(process.argv), process.execPath)));

		this.backupHome = backupHome;
		this.workspacesJsonPath = backupWorkspacesPath;

		// Force a reload with the new paths
		this.loadSync();
	}

	public get backupsData(): IBackupWorkspacesFormat {
		return this.backups;
	}

	public removeBackupPathSync(workspaceIdenfitier: string, target: string[]): void {
		return super.removeBackupPathSync(workspaceIdenfitier, target);
	}

	public loadSync(): void {
		super.loadSync();
	}

	public dedupeBackups(backups: IBackupWorkspacesFormat): IBackupWorkspacesFormat {
		return super.dedupeBackups(backups);
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

	test('service validates backup workspaces on startup and cleans up (folder workspaces)', done => {

		// 1) backup workspace path does not exist
		service.registerFolderBackupSync(fooFile.fsPath);
		service.registerFolderBackupSync(barFile.fsPath);
		service.loadSync();
		assert.deepEqual(service.getFolderBackupPaths(), []);

		// 2) backup workspace path exists with empty contents within
		fs.mkdirSync(service.toBackupPath(fooFile.fsPath));
		fs.mkdirSync(service.toBackupPath(barFile.fsPath));
		service.registerFolderBackupSync(fooFile.fsPath);
		service.registerFolderBackupSync(barFile.fsPath);
		service.loadSync();
		assert.deepEqual(service.getFolderBackupPaths(), []);
		assert.ok(!fs.exists(service.toBackupPath(fooFile.fsPath)));
		assert.ok(!fs.exists(service.toBackupPath(barFile.fsPath)));

		// 3) backup workspace path exists with empty folders within
		fs.mkdirSync(service.toBackupPath(fooFile.fsPath));
		fs.mkdirSync(service.toBackupPath(barFile.fsPath));
		fs.mkdirSync(path.join(service.toBackupPath(fooFile.fsPath), 'file'));
		fs.mkdirSync(path.join(service.toBackupPath(barFile.fsPath), 'untitled'));
		service.registerFolderBackupSync(fooFile.fsPath);
		service.registerFolderBackupSync(barFile.fsPath);
		service.loadSync();
		assert.deepEqual(service.getFolderBackupPaths(), []);
		assert.ok(!fs.exists(service.toBackupPath(fooFile.fsPath)));
		assert.ok(!fs.exists(service.toBackupPath(barFile.fsPath)));

		// 4) backup workspace path points to a workspace that no longer exists
		// so it should convert the backup worspace to an empty workspace backup
		const fileBackups = path.join(service.toBackupPath(fooFile.fsPath), 'file');
		fs.mkdirSync(service.toBackupPath(fooFile.fsPath));
		fs.mkdirSync(service.toBackupPath(barFile.fsPath));
		fs.mkdirSync(fileBackups);
		service.registerFolderBackupSync(fooFile.fsPath);
		assert.equal(service.getFolderBackupPaths().length, 1);
		assert.equal(service.getEmptyWindowBackupPaths().length, 0);
		fs.writeFileSync(path.join(fileBackups, 'backup.txt'), '');
		service.loadSync();
		assert.equal(service.getFolderBackupPaths().length, 0);
		assert.equal(service.getEmptyWindowBackupPaths().length, 1);

		done();
	});

	test('service validates backup workspaces on startup and cleans up (root workspaces)', done => {

		// 1) backup workspace path does not exist
		service.registerWorkspaceBackupSync(fooFile.fsPath);
		service.registerWorkspaceBackupSync(barFile.fsPath);
		service.loadSync();
		assert.deepEqual(service.getWorkspaceBackupPaths(), []);

		// 2) backup workspace path exists with empty contents within
		fs.mkdirSync(service.toBackupPath(fooFile.fsPath));
		fs.mkdirSync(service.toBackupPath(barFile.fsPath));
		service.registerWorkspaceBackupSync(fooFile.fsPath);
		service.registerWorkspaceBackupSync(barFile.fsPath);
		service.loadSync();
		assert.deepEqual(service.getWorkspaceBackupPaths(), []);
		assert.ok(!fs.exists(service.toBackupPath(fooFile.fsPath)));
		assert.ok(!fs.exists(service.toBackupPath(barFile.fsPath)));

		// 3) backup workspace path exists with empty folders within
		fs.mkdirSync(service.toBackupPath(fooFile.fsPath));
		fs.mkdirSync(service.toBackupPath(barFile.fsPath));
		fs.mkdirSync(path.join(service.toBackupPath(fooFile.fsPath), 'file'));
		fs.mkdirSync(path.join(service.toBackupPath(barFile.fsPath), 'untitled'));
		service.registerWorkspaceBackupSync(fooFile.fsPath);
		service.registerWorkspaceBackupSync(barFile.fsPath);
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
		service.registerWorkspaceBackupSync(fooFile.fsPath);
		assert.equal(service.getWorkspaceBackupPaths().length, 1);
		assert.equal(service.getEmptyWindowBackupPaths().length, 0);
		fs.writeFileSync(path.join(fileBackups, 'backup.txt'), '');
		service.loadSync();
		assert.equal(service.getWorkspaceBackupPaths().length, 0);
		assert.equal(service.getEmptyWindowBackupPaths().length, 1);

		done();
	});

	suite('loadSync', () => {
		test('getFolderBackupPaths() should return [] when workspaces.json doesn\'t exist', () => {
			assert.deepEqual(service.getFolderBackupPaths(), []);
		});

		test('getFolderBackupPaths() should return [] when workspaces.json is not properly formed JSON', () => {
			fs.writeFileSync(backupWorkspacesPath, '');
			service.loadSync();
			assert.deepEqual(service.getFolderBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{]');
			service.loadSync();
			assert.deepEqual(service.getFolderBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, 'foo');
			service.loadSync();
			assert.deepEqual(service.getFolderBackupPaths(), []);
		});

		test('getFolderBackupPaths() should return [] when folderWorkspaces in workspaces.json is absent', () => {
			fs.writeFileSync(backupWorkspacesPath, '{}');
			service.loadSync();
			assert.deepEqual(service.getFolderBackupPaths(), []);
		});

		test('getFolderBackupPaths() should return [] when folderWorkspaces in workspaces.json is not a string array', () => {
			fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{}}');
			service.loadSync();
			assert.deepEqual(service.getFolderBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{"foo": ["bar"]}}');
			service.loadSync();
			assert.deepEqual(service.getFolderBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{"foo": []}}');
			service.loadSync();
			assert.deepEqual(service.getFolderBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{"foo": "bar"}}');
			service.loadSync();
			assert.deepEqual(service.getFolderBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":"foo"}');
			service.loadSync();
			assert.deepEqual(service.getFolderBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":1}');
			service.loadSync();
			assert.deepEqual(service.getFolderBackupPaths(), []);
		});

		test('getFolderBackupPaths() should return [] when files.hotExit = "onExitAndWindowClose"', () => {
			service.registerFolderBackupSync(fooFile.fsPath.toUpperCase());
			assert.deepEqual(service.getFolderBackupPaths(), [fooFile.fsPath.toUpperCase()]);
			configService.setUserConfiguration('files.hotExit', HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE);
			service.loadSync();
			assert.deepEqual(service.getFolderBackupPaths(), []);
		});

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

		test('getWorkspaceBackupPaths() should return [] when rootWorkspaces in workspaces.json is not a string array', () => {
			fs.writeFileSync(backupWorkspacesPath, '{"rootWorkspaces":{}}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"rootWorkspaces":{"foo": ["bar"]}}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"rootWorkspaces":{"foo": []}}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"rootWorkspaces":{"foo": "bar"}}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"rootWorkspaces":"foo"}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"rootWorkspaces":1}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
		});

		test('getWorkspaceBackupPaths() should return [] when files.hotExit = "onExitAndWindowClose"', () => {
			service.registerWorkspaceBackupSync(fooFile.fsPath.toUpperCase());
			assert.deepEqual(service.getWorkspaceBackupPaths(), [fooFile.fsPath.toUpperCase()]);
			configService.setUserConfiguration('files.hotExit', HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE);
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackupPaths(), []);
		});

		test('getEmptyWorkspaceBackupPaths() should return [] when workspaces.json doesn\'t exist', () => {
			assert.deepEqual(service.getEmptyWindowBackupPaths(), []);
		});

		test('getEmptyWorkspaceBackupPaths() should return [] when workspaces.json is not properly formed JSON', () => {
			fs.writeFileSync(backupWorkspacesPath, '');
			service.loadSync();
			assert.deepEqual(service.getEmptyWindowBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{]');
			service.loadSync();
			assert.deepEqual(service.getEmptyWindowBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, 'foo');
			service.loadSync();
			assert.deepEqual(service.getEmptyWindowBackupPaths(), []);
		});

		test('getEmptyWorkspaceBackupPaths() should return [] when folderWorkspaces in workspaces.json is absent', () => {
			fs.writeFileSync(backupWorkspacesPath, '{}');
			service.loadSync();
			assert.deepEqual(service.getEmptyWindowBackupPaths(), []);
		});

		test('getEmptyWorkspaceBackupPaths() should return [] when folderWorkspaces in workspaces.json is not a string array', () => {
			fs.writeFileSync(backupWorkspacesPath, '{"emptyWorkspaces":{}}');
			service.loadSync();
			assert.deepEqual(service.getEmptyWindowBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"emptyWorkspaces":{"foo": ["bar"]}}');
			service.loadSync();
			assert.deepEqual(service.getEmptyWindowBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"emptyWorkspaces":{"foo": []}}');
			service.loadSync();
			assert.deepEqual(service.getEmptyWindowBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"emptyWorkspaces":{"foo": "bar"}}');
			service.loadSync();
			assert.deepEqual(service.getEmptyWindowBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"emptyWorkspaces":"foo"}');
			service.loadSync();
			assert.deepEqual(service.getEmptyWindowBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"emptyWorkspaces":1}');
			service.loadSync();
			assert.deepEqual(service.getEmptyWindowBackupPaths(), []);
		});
	});

	suite('dedupeFolderWorkspaces', () => {
		test('should ignore duplicates on Windows and Mac (folder workspace)', () => {
			// Skip test on Linux
			if (platform.isLinux) {
				return;
			}

			const backups: IBackupWorkspacesFormat = {
				rootWorkspaces: [],
				folderWorkspaces: platform.isWindows ? ['c:\\FOO', 'C:\\FOO', 'c:\\foo'] : ['/FOO', '/foo'],
				emptyWorkspaces: []
			};

			service.dedupeBackups(backups);

			assert.equal(backups.folderWorkspaces.length, 1);
			if (platform.isWindows) {
				assert.deepEqual(backups.folderWorkspaces, ['c:\\FOO'], 'should return the first duplicated entry');
			} else {
				assert.deepEqual(backups.folderWorkspaces, ['/FOO'], 'should return the first duplicated entry');
			}
		});

		test('should ignore duplicates on Windows and Mac (root workspace)', () => {
			// Skip test on Linux
			if (platform.isLinux) {
				return;
			}

			const backups: IBackupWorkspacesFormat = {
				rootWorkspaces: platform.isWindows ? ['c:\\FOO', 'C:\\FOO', 'c:\\foo'] : ['/FOO', '/foo'],
				folderWorkspaces: [],
				emptyWorkspaces: []
			};

			service.dedupeBackups(backups);

			assert.equal(backups.rootWorkspaces.length, 1);
			if (platform.isWindows) {
				assert.deepEqual(backups.rootWorkspaces, ['c:\\FOO'], 'should return the first duplicated entry');
			} else {
				assert.deepEqual(backups.rootWorkspaces, ['/FOO'], 'should return the first duplicated entry');
			}
		});
	});

	suite('registerWindowForBackups', () => {
		test('should persist paths to workspaces.json (folder workspace)', done => {
			service.registerFolderBackupSync(fooFile.fsPath);
			service.registerFolderBackupSync(barFile.fsPath);
			assert.deepEqual(service.getFolderBackupPaths(), [fooFile.fsPath, barFile.fsPath]);
			pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
				const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
				assert.deepEqual(json.folderWorkspaces, [fooFile.fsPath, barFile.fsPath]);
				done();
			});
		});

		test('should persist paths to workspaces.json (root workspace)', done => {
			service.registerWorkspaceBackupSync(fooFile.fsPath);
			service.registerWorkspaceBackupSync(barFile.fsPath);
			assert.deepEqual(service.getWorkspaceBackupPaths(), [fooFile.fsPath, barFile.fsPath]);
			pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
				const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
				assert.deepEqual(json.rootWorkspaces, [fooFile.fsPath, barFile.fsPath]);
				done();
			});
		});

		test('should always store the workspace path in workspaces.json using the case given, regardless of whether the file system is case-sensitive (folder workspace)', done => {
			service.registerFolderBackupSync(fooFile.fsPath.toUpperCase());
			assert.deepEqual(service.getFolderBackupPaths(), [fooFile.fsPath.toUpperCase()]);
			pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
				const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
				assert.deepEqual(json.folderWorkspaces, [fooFile.fsPath.toUpperCase()]);
				done();
			});
		});

		test('should always store the workspace path in workspaces.json using the case given, regardless of whether the file system is case-sensitive (root workspace)', done => {
			service.registerWorkspaceBackupSync(fooFile.fsPath.toUpperCase());
			assert.deepEqual(service.getWorkspaceBackupPaths(), [fooFile.fsPath.toUpperCase()]);
			pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
				const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
				assert.deepEqual(json.rootWorkspaces, [fooFile.fsPath.toUpperCase()]);
				done();
			});
		});
	});

	suite('removeBackupPathSync', () => {
		test('should remove folder workspaces from workspaces.json (folder workspace)', done => {
			service.registerFolderBackupSync(fooFile.fsPath);
			service.registerFolderBackupSync(barFile.fsPath);
			service.removeBackupPathSync(fooFile.fsPath, service.backupsData.folderWorkspaces);
			pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
				const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
				assert.deepEqual(json.folderWorkspaces, [barFile.fsPath]);
				service.removeBackupPathSync(barFile.fsPath, service.backupsData.folderWorkspaces);
				pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
					const json2 = <IBackupWorkspacesFormat>JSON.parse(content);
					assert.deepEqual(json2.folderWorkspaces, []);
					done();
				});
			});
		});

		test('should remove folder workspaces from workspaces.json (root workspace)', done => {
			service.registerWorkspaceBackupSync(fooFile.fsPath);
			service.registerWorkspaceBackupSync(barFile.fsPath);
			service.removeBackupPathSync(fooFile.fsPath, service.backupsData.rootWorkspaces);
			pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
				const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
				assert.deepEqual(json.rootWorkspaces, [barFile.fsPath]);
				service.removeBackupPathSync(barFile.fsPath, service.backupsData.rootWorkspaces);
				pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
					const json2 = <IBackupWorkspacesFormat>JSON.parse(content);
					assert.deepEqual(json2.rootWorkspaces, []);
					done();
				});
			});
		});

		test('should remove empty workspaces from workspaces.json', done => {
			service.registerEmptyWindowBackupSync('foo');
			service.registerEmptyWindowBackupSync('bar');
			service.removeBackupPathSync('foo', service.backupsData.emptyWorkspaces);
			pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
				const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
				assert.deepEqual(json.emptyWorkspaces, ['bar']);
				service.removeBackupPathSync('bar', service.backupsData.emptyWorkspaces);
				pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
					const json2 = <IBackupWorkspacesFormat>JSON.parse(content);
					assert.deepEqual(json2.emptyWorkspaces, []);
					done();
				});
			});
		});

		test('should fail gracefully when removing a path that doesn\'t exist', done => {
			const workspacesJson: IBackupWorkspacesFormat = { rootWorkspaces: [], folderWorkspaces: [fooFile.fsPath], emptyWorkspaces: [] };
			pfs.writeFile(backupWorkspacesPath, JSON.stringify(workspacesJson)).then(() => {
				service.removeBackupPathSync(barFile.fsPath, service.backupsData.folderWorkspaces);
				service.removeBackupPathSync('test', service.backupsData.emptyWorkspaces);
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

	suite('mixed path casing', () => {
		test('should handle case insensitive paths properly (registerWindowForBackupsSync) (folder workspace)', done => {
			service.registerFolderBackupSync(fooFile.fsPath);
			service.registerFolderBackupSync(fooFile.fsPath.toUpperCase());

			if (platform.isLinux) {
				assert.equal(service.getFolderBackupPaths().length, 2);
			} else {
				assert.equal(service.getFolderBackupPaths().length, 1);
			}

			done();
		});

		test('should handle case insensitive paths properly (registerWindowForBackupsSync) (root workspace)', done => {
			service.registerWorkspaceBackupSync(fooFile.fsPath);
			service.registerWorkspaceBackupSync(fooFile.fsPath.toUpperCase());

			if (platform.isLinux) {
				assert.equal(service.getWorkspaceBackupPaths().length, 2);
			} else {
				assert.equal(service.getWorkspaceBackupPaths().length, 1);
			}

			done();
		});

		test('should handle case insensitive paths properly (removeBackupPathSync) (folder workspace)', done => {

			// same case
			service.registerFolderBackupSync(fooFile.fsPath);
			service.removeBackupPathSync(fooFile.fsPath, service.backupsData.folderWorkspaces);
			assert.equal(service.getFolderBackupPaths().length, 0);

			// mixed case
			service.registerFolderBackupSync(fooFile.fsPath);
			service.removeBackupPathSync(fooFile.fsPath.toUpperCase(), service.backupsData.folderWorkspaces);

			if (platform.isLinux) {
				assert.equal(service.getFolderBackupPaths().length, 1);
			} else {
				assert.equal(service.getFolderBackupPaths().length, 0);
			}

			done();
		});

		test('should handle case insensitive paths properly (removeBackupPathSync) (root workspace)', done => {

			// same case
			service.registerWorkspaceBackupSync(fooFile.fsPath);
			service.removeBackupPathSync(fooFile.fsPath, service.backupsData.rootWorkspaces);
			assert.equal(service.getWorkspaceBackupPaths().length, 0);

			// mixed case
			service.registerWorkspaceBackupSync(fooFile.fsPath);
			service.removeBackupPathSync(fooFile.fsPath.toUpperCase(), service.backupsData.rootWorkspaces);

			if (platform.isLinux) {
				assert.equal(service.getWorkspaceBackupPaths().length, 1);
			} else {
				assert.equal(service.getWorkspaceBackupPaths().length, 0);
			}

			done();
		});
	});
});