/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as platform from 'vs/base/common/platform';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as pfs from 'vs/base/node/pfs';
import Uri from 'vs/base/common/uri';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { BackupMainService } from 'vs/platform/backup/electron-main/backupMainService';
import { IBackupWorkspacesFormat } from 'vs/platform/backup/common/backup';
import { HotExitConfiguration } from 'vs/platform/files/common/files';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ConsoleLogMainService } from 'vs/platform/log/common/log';
import { IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { createHash } from 'crypto';
import { getRandomTestPath } from 'vs/workbench/test/workbenchTestServices';
import { Schemas } from 'vs/base/common/network';

suite('BackupMainService', () => {

	function assertEqualUris(actual: Uri[], expected: Uri[]) {
		assert.deepEqual(actual.map(a => a.toString()), expected.map(a => a.toString()));
	}

	const parentDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'backupservice');
	const backupHome = path.join(parentDir, 'Backups');
	const backupWorkspacesPath = path.join(backupHome, 'workspaces.json');

	const environmentService = new EnvironmentService(parseArgs(process.argv), process.execPath);

	class TestBackupMainService extends BackupMainService {

		constructor(backupHome: string, backupWorkspacesPath: string, configService: TestConfigurationService) {
			super(environmentService, configService, new ConsoleLogMainService());

			this.backupHome = backupHome;
			this.workspacesJsonPath = backupWorkspacesPath;

			// Force a reload with the new paths
			this.loadSync();
		}

		public loadSync(): void {
			super.loadSync();
		}

		public toBackupPath(folderUri: Uri): string {
			return path.join(this.backupHome, super.getFolderHash(folderUri));
		}

		public getFolderHash(folderUri: Uri): string {
			return super.getFolderHash(folderUri);
		}

		public toLegacyBackupPath(folderPath: string): string {
			return path.join(this.backupHome, super.getLegacyFolderHash(folderPath));
		}
	}

	function toWorkspace(path: string): IWorkspaceIdentifier {
		return {
			id: createHash('md5').update(sanitizePath(path)).digest('hex'),
			configPath: path
		};
	}

	function ensureFolderExists(uri: Uri): void {
		if (!fs.existsSync(uri.fsPath)) {
			fs.mkdirSync(uri.fsPath);
		}
		const backupFolder = service.toBackupPath(uri);
		if (!fs.existsSync(backupFolder)) {
			fs.mkdirSync(backupFolder);
			fs.mkdirSync(path.join(backupFolder, Schemas.file));
			fs.writeFile(path.join(backupFolder, Schemas.file, 'foo.txt'), 'Hello');
		}
	}

	function sanitizePath(p: string): string {
		return platform.isLinux ? p : p.toLowerCase();
	}

	const fooFile = Uri.file(platform.isWindows ? 'C:\\foo' : '/foo');
	const barFile = Uri.file(platform.isWindows ? 'C:\\bar' : '/bar');

	const existingTestFolder1 = Uri.file(path.join(parentDir, 'folder1'));
	const existingTestFolder2 = Uri.file(path.join(parentDir, 'folder2'));

	let service: TestBackupMainService;
	let configService: TestConfigurationService;

	setup(() => {
		configService = new TestConfigurationService();
		service = new TestBackupMainService(backupHome, backupWorkspacesPath, configService);

		// Delete any existing backups completely and then re-create it.
		return pfs.del(backupHome, os.tmpdir()).then(() => {
			return pfs.mkdirp(backupHome);
		});
	});

	teardown(() => {
		return pfs.del(backupHome, os.tmpdir());
	});

	test('service validates backup workspaces on startup and cleans up (folder workspaces)', function () {
		this.timeout(1000 * 10); // increase timeout for this test

		// 1) backup workspace path does not exist
		service.registerFolderBackupSync(fooFile);
		service.registerFolderBackupSync(barFile);
		service.loadSync();
		assertEqualUris(service.getFolderBackupPaths(), []);

		// 2) backup workspace path exists with empty contents within
		fs.mkdirSync(service.toBackupPath(fooFile));
		fs.mkdirSync(service.toBackupPath(barFile));
		service.registerFolderBackupSync(fooFile);
		service.registerFolderBackupSync(barFile);
		service.loadSync();
		assertEqualUris(service.getFolderBackupPaths(), []);
		assert.ok(!fs.existsSync(service.toBackupPath(fooFile)));
		assert.ok(!fs.existsSync(service.toBackupPath(barFile)));

		// 3) backup workspace path exists with empty folders within
		fs.mkdirSync(service.toBackupPath(fooFile));
		fs.mkdirSync(service.toBackupPath(barFile));
		fs.mkdirSync(path.join(service.toBackupPath(fooFile), Schemas.file));
		fs.mkdirSync(path.join(service.toBackupPath(barFile), Schemas.untitled));
		service.registerFolderBackupSync(fooFile);
		service.registerFolderBackupSync(barFile);
		service.loadSync();
		assertEqualUris(service.getFolderBackupPaths(), []);
		assert.ok(!fs.existsSync(service.toBackupPath(fooFile)));
		assert.ok(!fs.existsSync(service.toBackupPath(barFile)));

		// 4) backup workspace path points to a workspace that no longer exists
		// so it should convert the backup worspace to an empty workspace backup
		const fileBackups = path.join(service.toBackupPath(fooFile), Schemas.file);
		fs.mkdirSync(service.toBackupPath(fooFile));
		fs.mkdirSync(service.toBackupPath(barFile));
		fs.mkdirSync(fileBackups);
		service.registerFolderBackupSync(fooFile);
		assert.equal(service.getFolderBackupPaths().length, 1);
		assert.equal(service.getEmptyWindowBackupPaths().length, 0);
		fs.writeFileSync(path.join(fileBackups, 'backup.txt'), '');
		service.loadSync();
		assert.equal(service.getFolderBackupPaths().length, 0);
		assert.equal(service.getEmptyWindowBackupPaths().length, 1);
	});

	test('service validates backup workspaces on startup and cleans up (root workspaces)', function () {
		this.timeout(1000 * 10); // increase timeout for this test

		// 1) backup workspace path does not exist
		service.registerWorkspaceBackupSync(toWorkspace(fooFile.fsPath));
		service.registerWorkspaceBackupSync(toWorkspace(barFile.fsPath));
		service.loadSync();
		assert.deepEqual(service.getWorkspaceBackups(), []);

		// 2) backup workspace path exists with empty contents within
		fs.mkdirSync(service.toBackupPath(fooFile));
		fs.mkdirSync(service.toBackupPath(barFile));
		service.registerWorkspaceBackupSync(toWorkspace(fooFile.fsPath));
		service.registerWorkspaceBackupSync(toWorkspace(barFile.fsPath));
		service.loadSync();
		assert.deepEqual(service.getWorkspaceBackups(), []);
		assert.ok(!fs.existsSync(service.toBackupPath(fooFile)));
		assert.ok(!fs.existsSync(service.toBackupPath(barFile)));

		// 3) backup workspace path exists with empty folders within
		fs.mkdirSync(service.toBackupPath(fooFile));
		fs.mkdirSync(service.toBackupPath(barFile));
		fs.mkdirSync(path.join(service.toBackupPath(fooFile), Schemas.file));
		fs.mkdirSync(path.join(service.toBackupPath(barFile), Schemas.untitled));
		service.registerWorkspaceBackupSync(toWorkspace(fooFile.fsPath));
		service.registerWorkspaceBackupSync(toWorkspace(barFile.fsPath));
		service.loadSync();
		assert.deepEqual(service.getWorkspaceBackups(), []);
		assert.ok(!fs.existsSync(service.toBackupPath(fooFile)));
		assert.ok(!fs.existsSync(service.toBackupPath(barFile)));

		// 4) backup workspace path points to a workspace that no longer exists
		// so it should convert the backup worspace to an empty workspace backup
		const fileBackups = path.join(service.toBackupPath(fooFile), Schemas.file);
		fs.mkdirSync(service.toBackupPath(fooFile));
		fs.mkdirSync(service.toBackupPath(barFile));
		fs.mkdirSync(fileBackups);
		service.registerWorkspaceBackupSync(toWorkspace(fooFile.fsPath));
		assert.equal(service.getWorkspaceBackups().length, 1);
		assert.equal(service.getEmptyWindowBackupPaths().length, 0);
		fs.writeFileSync(path.join(fileBackups, 'backup.txt'), '');
		service.loadSync();
		assert.equal(service.getWorkspaceBackups().length, 0);
		assert.equal(service.getEmptyWindowBackupPaths().length, 1);
	});

	test('service supports to migrate backup data from another location', () => {
		const backupPathToMigrate = service.toBackupPath(fooFile);
		fs.mkdirSync(backupPathToMigrate);
		fs.writeFileSync(path.join(backupPathToMigrate, 'backup.txt'), 'Some Data');
		service.registerFolderBackupSync(Uri.file(backupPathToMigrate));

		const workspaceBackupPath = service.registerWorkspaceBackupSync(toWorkspace(barFile.fsPath), backupPathToMigrate);

		assert.ok(fs.existsSync(workspaceBackupPath));
		assert.ok(fs.existsSync(path.join(workspaceBackupPath, 'backup.txt')));
		assert.ok(!fs.existsSync(backupPathToMigrate));

		const emptyBackups = service.getEmptyWindowBackupPaths();
		assert.equal(0, emptyBackups.length);
	});

	test('service backup migration makes sure to preserve existing backups', () => {
		const backupPathToMigrate = service.toBackupPath(fooFile);
		fs.mkdirSync(backupPathToMigrate);
		fs.writeFileSync(path.join(backupPathToMigrate, 'backup.txt'), 'Some Data');
		service.registerFolderBackupSync(Uri.file(backupPathToMigrate));

		const backupPathToPreserve = service.toBackupPath(barFile);
		fs.mkdirSync(backupPathToPreserve);
		fs.writeFileSync(path.join(backupPathToPreserve, 'backup.txt'), 'Some Data');
		service.registerFolderBackupSync(Uri.file(backupPathToPreserve));

		const workspaceBackupPath = service.registerWorkspaceBackupSync(toWorkspace(barFile.fsPath), backupPathToMigrate);

		assert.ok(fs.existsSync(workspaceBackupPath));
		assert.ok(fs.existsSync(path.join(workspaceBackupPath, 'backup.txt')));
		assert.ok(!fs.existsSync(backupPathToMigrate));

		const emptyBackups = service.getEmptyWindowBackupPaths();
		assert.equal(1, emptyBackups.length);
		assert.equal(1, fs.readdirSync(path.join(backupHome, emptyBackups[0])).length);
	});

	suite('migrate folderPath to folderURI', () => {

		test('migration makes sure to preserve existing backups', () => {
			let oldPath1 = platform.isLinux ? existingTestFolder1.fsPath : existingTestFolder1.fsPath.toLowerCase();
			let oldPath2 = platform.isLinux ? existingTestFolder2.fsPath : existingTestFolder2.fsPath.toUpperCase();

			if (!fs.existsSync(oldPath1)) {
				fs.mkdirSync(oldPath1);
			}
			if (!fs.existsSync(oldPath2)) {
				fs.mkdirSync(oldPath2);
			}
			const backupFolder1 = service.toLegacyBackupPath(oldPath1);
			if (!fs.existsSync(backupFolder1)) {
				fs.mkdirSync(backupFolder1);
				fs.mkdirSync(path.join(backupFolder1, Schemas.file));
				fs.writeFile(path.join(backupFolder1, Schemas.file, 'unsaved1.txt'), 'Legacy');
			}
			const backupFolder2 = service.toLegacyBackupPath(oldPath2);
			if (!fs.existsSync(backupFolder2)) {
				fs.mkdirSync(backupFolder2);
				fs.mkdirSync(path.join(backupFolder2, Schemas.file));
				fs.writeFile(path.join(backupFolder2, Schemas.file, 'unsaved2.txt'), 'Legacy');
			}

			const workspacesJson = { rootWorkspaces: [], folderWorkspaces: [oldPath1, oldPath2], emptyWorkspaces: [] };
			return pfs.writeFile(backupWorkspacesPath, JSON.stringify(workspacesJson)).then(() => {
				service.loadSync();
				return pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
					const json = <IBackupWorkspacesFormat>JSON.parse(content);
					assert.deepEqual(json.folderURIWorkspaces, [existingTestFolder1.toString(), existingTestFolder2.toString()]);
					const newBackupFolder1 = service.toBackupPath(existingTestFolder1);
					assert.ok(fs.existsSync(path.join(newBackupFolder1, Schemas.file, 'unsaved1.txt')));
					const newBackupFolder2 = service.toBackupPath(existingTestFolder2);
					assert.ok(fs.existsSync(path.join(newBackupFolder2, Schemas.file, 'unsaved2.txt')));
				});
			});
		});
	});

	suite('loadSync', () => {
		test('getFolderBackupPaths() should return [] when workspaces.json doesn\'t exist', () => {
			assertEqualUris(service.getFolderBackupPaths(), []);
		});

		test('getFolderBackupPaths() should return [] when workspaces.json is not properly formed JSON', () => {
			fs.writeFileSync(backupWorkspacesPath, '');
			service.loadSync();
			assertEqualUris(service.getFolderBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{]');
			service.loadSync();
			assertEqualUris(service.getFolderBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, 'foo');
			service.loadSync();
			assertEqualUris(service.getFolderBackupPaths(), []);
		});

		test('getFolderBackupPaths() should return [] when folderWorkspaces in workspaces.json is absent', () => {
			fs.writeFileSync(backupWorkspacesPath, '{}');
			service.loadSync();
			assertEqualUris(service.getFolderBackupPaths(), []);
		});

		test('getFolderBackupPaths() should return [] when folderWorkspaces in workspaces.json is not a string array', () => {
			fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{}}');
			service.loadSync();
			assertEqualUris(service.getFolderBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{"foo": ["bar"]}}');
			service.loadSync();
			assertEqualUris(service.getFolderBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{"foo": []}}');
			service.loadSync();
			assertEqualUris(service.getFolderBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":{"foo": "bar"}}');
			service.loadSync();
			assertEqualUris(service.getFolderBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":"foo"}');
			service.loadSync();
			assertEqualUris(service.getFolderBackupPaths(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"folderWorkspaces":1}');
			service.loadSync();
			assertEqualUris(service.getFolderBackupPaths(), []);
		});

		test('getFolderBackupPaths() should return [] when files.hotExit = "onExitAndWindowClose"', () => {
			service.registerFolderBackupSync(Uri.file(fooFile.fsPath.toUpperCase()));
			assertEqualUris(service.getFolderBackupPaths(), [Uri.file(fooFile.fsPath.toUpperCase())]);
			configService.setUserConfiguration('files.hotExit', HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE);
			service.loadSync();
			assertEqualUris(service.getFolderBackupPaths(), []);
		});

		test('getWorkspaceBackups() should return [] when workspaces.json doesn\'t exist', () => {
			assert.deepEqual(service.getWorkspaceBackups(), []);
		});

		test('getWorkspaceBackups() should return [] when workspaces.json is not properly formed JSON', () => {
			fs.writeFileSync(backupWorkspacesPath, '');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackups(), []);
			fs.writeFileSync(backupWorkspacesPath, '{]');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackups(), []);
			fs.writeFileSync(backupWorkspacesPath, 'foo');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackups(), []);
		});

		test('getWorkspaceBackups() should return [] when folderWorkspaces in workspaces.json is absent', () => {
			fs.writeFileSync(backupWorkspacesPath, '{}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackups(), []);
		});

		test('getWorkspaceBackups() should return [] when rootWorkspaces in workspaces.json is not a object array', () => {
			fs.writeFileSync(backupWorkspacesPath, '{"rootWorkspaces":{}}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackups(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"rootWorkspaces":{"foo": ["bar"]}}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackups(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"rootWorkspaces":{"foo": []}}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackups(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"rootWorkspaces":{"foo": "bar"}}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackups(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"rootWorkspaces":"foo"}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackups(), []);
			fs.writeFileSync(backupWorkspacesPath, '{"rootWorkspaces":1}');
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackups(), []);
		});

		test('getWorkspaceBackups() should return [] when files.hotExit = "onExitAndWindowClose"', () => {
			service.registerWorkspaceBackupSync(toWorkspace(fooFile.fsPath.toUpperCase()));
			assert.equal(service.getWorkspaceBackups().length, 1);
			assert.deepEqual(service.getWorkspaceBackups().map(r => r.configPath), [fooFile.fsPath.toUpperCase()]);
			configService.setUserConfiguration('files.hotExit', HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE);
			service.loadSync();
			assert.deepEqual(service.getWorkspaceBackups(), []);
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

		test('getEmptyWorkspaceBackupPaths() should return [] when folderWorkspaces in workspaces.json is not a string array', function () {
			this.timeout(5000);
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
		test('should ignore duplicates (folder workspace)', () => {

			ensureFolderExists(existingTestFolder1);

			const workspacesJson: IBackupWorkspacesFormat = {
				rootWorkspaces: [],
				folderURIWorkspaces: [existingTestFolder1.toString(), existingTestFolder1.toString()],
				emptyWorkspaces: []
			};
			return pfs.writeFile(backupWorkspacesPath, JSON.stringify(workspacesJson)).then(() => {
				service.loadSync();
				return pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
					const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
					assert.deepEqual(json.folderURIWorkspaces, [existingTestFolder1.toString()]);
				});
			});
		});

		test('should ignore duplicates on Windows and Mac (folder workspace)', () => {

			ensureFolderExists(existingTestFolder1);

			const workspacesJson: IBackupWorkspacesFormat = {
				rootWorkspaces: [],
				folderURIWorkspaces: [existingTestFolder1.toString(), existingTestFolder1.toString().toLowerCase()],
				emptyWorkspaces: []
			};
			return pfs.writeFile(backupWorkspacesPath, JSON.stringify(workspacesJson)).then(() => {
				service.loadSync();
				return pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
					const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
					assert.deepEqual(json.folderURIWorkspaces, [existingTestFolder1.toString()]);
				});
			});
		});

		test('should ignore duplicates on Windows and Mac (root workspace)', () => {
			// Skip test on Linux
			if (platform.isLinux) {
				return null;
			}

			const workspacesJson: IBackupWorkspacesFormat = {
				rootWorkspaces: platform.isWindows ? [toWorkspace('c:\\FOO'), toWorkspace('C:\\FOO'), toWorkspace('c:\\foo')] : [toWorkspace('/FOO'), toWorkspace('/foo')],
				folderURIWorkspaces: [],
				emptyWorkspaces: []
			};
			return pfs.writeFile(backupWorkspacesPath, JSON.stringify(workspacesJson)).then(() => {
				service.loadSync();
				return pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
					const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
					assert.equal(json.rootWorkspaces.length, 1);
					if (platform.isWindows) {
						assert.deepEqual(json.rootWorkspaces.map(r => r.configPath), ['c:\\FOO'], 'should return the first duplicated entry');
					} else {
						assert.deepEqual(json.rootWorkspaces.map(r => r.configPath), ['/FOO'], 'should return the first duplicated entry');
					}
				});
			});

		});
	});

	suite('registerWindowForBackups', () => {
		test('should persist paths to workspaces.json (folder workspace)', () => {
			service.registerFolderBackupSync(fooFile);
			service.registerFolderBackupSync(barFile);
			assertEqualUris(service.getFolderBackupPaths(), [fooFile, barFile]);
			return pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
				const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
				assert.deepEqual(json.folderURIWorkspaces, [fooFile.toString(), barFile.toString()]);
			});
		});

		test('should persist paths to workspaces.json (root workspace)', () => {
			const ws1 = toWorkspace(fooFile.fsPath);
			service.registerWorkspaceBackupSync(ws1);
			const ws2 = toWorkspace(barFile.fsPath);
			service.registerWorkspaceBackupSync(ws2);

			assert.deepEqual(service.getWorkspaceBackups().map(b => b.configPath), [fooFile.fsPath, barFile.fsPath]);
			assert.equal(ws1.id, service.getWorkspaceBackups()[0].id);
			assert.equal(ws2.id, service.getWorkspaceBackups()[1].id);

			return pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
				const json = <IBackupWorkspacesFormat>JSON.parse(buffer);

				assert.deepEqual(json.rootWorkspaces.map(b => b.configPath), [fooFile.fsPath, barFile.fsPath]);
				assert.equal(ws1.id, json.rootWorkspaces[0].id);
				assert.equal(ws2.id, json.rootWorkspaces[1].id);
			});
		});

		test('should always store the workspace path in workspaces.json using the case given, regardless of whether the file system is case-sensitive (folder workspace)', () => {
			service.registerFolderBackupSync(Uri.file(fooFile.fsPath.toUpperCase()));
			assertEqualUris(service.getFolderBackupPaths(), [Uri.file(fooFile.fsPath.toUpperCase())]);
			return pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
				const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
				assert.deepEqual(json.folderURIWorkspaces, [Uri.file(fooFile.fsPath.toUpperCase()).toString()]);
			});
		});

		test('should always store the workspace path in workspaces.json using the case given, regardless of whether the file system is case-sensitive (root workspace)', () => {
			service.registerWorkspaceBackupSync(toWorkspace(fooFile.fsPath.toUpperCase()));
			assert.deepEqual(service.getWorkspaceBackups().map(b => b.configPath), [fooFile.fsPath.toUpperCase()]);
			return pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
				const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
				assert.deepEqual(json.rootWorkspaces.map(b => b.configPath), [fooFile.fsPath.toUpperCase()]);
			});
		});
	});

	suite('removeBackupPathSync', () => {
		test('should remove folder workspaces from workspaces.json (folder workspace)', () => {
			service.registerFolderBackupSync(fooFile);
			service.registerFolderBackupSync(barFile);
			service.unregisterFolderBackupSync(fooFile);
			return pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
				const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
				assert.deepEqual(json.folderURIWorkspaces, [barFile.toString()]);
				service.unregisterFolderBackupSync(barFile);
				return pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
					const json2 = <IBackupWorkspacesFormat>JSON.parse(content);
					assert.deepEqual(json2.folderURIWorkspaces, []);
				});
			});
		});

		test('should remove folder workspaces from workspaces.json (root workspace)', () => {
			const ws1 = toWorkspace(fooFile.fsPath);
			service.registerWorkspaceBackupSync(ws1);
			const ws2 = toWorkspace(barFile.fsPath);
			service.registerWorkspaceBackupSync(ws2);
			service.unregisterWorkspaceBackupSync(ws1);
			return pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
				const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
				assert.deepEqual(json.rootWorkspaces.map(r => r.configPath), [barFile.fsPath]);
				service.unregisterWorkspaceBackupSync(ws2);
				return pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
					const json2 = <IBackupWorkspacesFormat>JSON.parse(content);
					assert.deepEqual(json2.rootWorkspaces, []);
				});
			});
		});

		test('should remove empty workspaces from workspaces.json', () => {
			service.registerEmptyWindowBackupSync('foo');
			service.registerEmptyWindowBackupSync('bar');
			service.unregisterEmptyWindowBackupSync('foo');
			return pfs.readFile(backupWorkspacesPath, 'utf-8').then(buffer => {
				const json = <IBackupWorkspacesFormat>JSON.parse(buffer);
				assert.deepEqual(json.emptyWorkspaces, ['bar']);
				service.unregisterEmptyWindowBackupSync('bar');
				return pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
					const json2 = <IBackupWorkspacesFormat>JSON.parse(content);
					assert.deepEqual(json2.emptyWorkspaces, []);
				});
			});
		});

		test('should fail gracefully when removing a path that doesn\'t exist', () => {

			ensureFolderExists(existingTestFolder1); // make sure backup folder exists, so the folder is not removed on loadSync

			const workspacesJson: IBackupWorkspacesFormat = { rootWorkspaces: [], folderURIWorkspaces: [existingTestFolder1.toString()], emptyWorkspaces: [] };
			return pfs.writeFile(backupWorkspacesPath, JSON.stringify(workspacesJson)).then(() => {
				service.loadSync();
				service.unregisterFolderBackupSync(barFile);
				service.unregisterEmptyWindowBackupSync('test');
				return pfs.readFile(backupWorkspacesPath, 'utf-8').then(content => {
					const json = <IBackupWorkspacesFormat>JSON.parse(content);
					assert.deepEqual(json.folderURIWorkspaces, [existingTestFolder1.toString()]);
				});
			});
		});
	});

	suite('getWorkspaceHash', () => {
		test('should perform an md5 hash on the path', () => {
			assert.equal(service.getFolderHash(Uri.file('/foo')), '1effb2475fcfba4f9e8b8a1dbc8f3caf');
		});

		test('should ignore case on Windows and Mac', () => {
			// Skip test on Linux
			if (platform.isLinux) {
				return;
			}

			if (platform.isMacintosh) {
				assert.equal(service.getFolderHash(Uri.file('/foo')), service.getFolderHash(Uri.file('/FOO')));
			}

			if (platform.isWindows) {
				assert.equal(service.getFolderHash(Uri.file('c:\\foo')), service.getFolderHash(Uri.file('C:\\FOO')));
			}
		});
	});

	suite('mixed path casing', () => {
		test('should handle case insensitive paths properly (registerWindowForBackupsSync) (folder workspace)', () => {
			service.registerFolderBackupSync(fooFile);
			service.registerFolderBackupSync(Uri.file(fooFile.fsPath.toUpperCase()));

			if (platform.isLinux) {
				assert.equal(service.getFolderBackupPaths().length, 2);
			} else {
				assert.equal(service.getFolderBackupPaths().length, 1);
			}
		});

		test('should handle case insensitive paths properly (registerWindowForBackupsSync) (root workspace)', () => {
			service.registerWorkspaceBackupSync(toWorkspace(fooFile.fsPath));
			service.registerWorkspaceBackupSync(toWorkspace(fooFile.fsPath.toUpperCase()));

			if (platform.isLinux) {
				assert.equal(service.getWorkspaceBackups().length, 2);
			} else {
				assert.equal(service.getWorkspaceBackups().length, 1);
			}
		});

		test('should handle case insensitive paths properly (removeBackupPathSync) (folder workspace)', () => {

			// same case
			service.registerFolderBackupSync(fooFile);
			service.unregisterFolderBackupSync(fooFile);
			assert.equal(service.getFolderBackupPaths().length, 0);

			// mixed case
			service.registerFolderBackupSync(fooFile);
			service.unregisterFolderBackupSync(Uri.file(fooFile.fsPath.toUpperCase()));

			if (platform.isLinux) {
				assert.equal(service.getFolderBackupPaths().length, 1);
			} else {
				assert.equal(service.getFolderBackupPaths().length, 0);
			}
		});
	});
});