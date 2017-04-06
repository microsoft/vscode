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
import { BackupFileService, BackupFilesModel } from 'vs/workbench/services/backup/node/backupFileService';
import { FileService } from 'vs/workbench/services/files/node/fileService';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { IBackupService } from 'vs/platform/backup/common/backup';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { TPromise } from 'vs/base/common/winjs.base';
import { TestWindowService } from 'vs/workbench/test/workbenchTestServices';
import { RawTextSource } from 'vs/editor/common/model/textSource';

class TestEnvironmentService extends EnvironmentService {

	constructor(private _backupHome: string, private _backupWorkspacesPath: string) {
		super(parseArgs(process.argv), process.execPath);
	}

	get backupHome(): string { return this._backupHome; }

	get backupWorkspacesPath(): string { return this._backupWorkspacesPath; }
}

const parentDir = path.join(os.tmpdir(), 'vsctests', 'service');
const backupHome = path.join(parentDir, 'Backups');
const workspacesJsonPath = path.join(backupHome, 'workspaces.json');

const workspaceResource = Uri.file(platform.isWindows ? 'c:\\workspace' : '/workspace');
const workspaceBackupPath = path.join(backupHome, crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex'));
const fooFile = Uri.file(platform.isWindows ? 'c:\\Foo' : '/Foo');
const barFile = Uri.file(platform.isWindows ? 'c:\\Bar' : '/Bar');
const untitledFile = Uri.from({ scheme: 'untitled', path: 'Untitled-1' });
const fooBackupPath = path.join(workspaceBackupPath, 'file', crypto.createHash('md5').update(fooFile.fsPath).digest('hex'));
const fooBackupPathLegacy = path.join(workspaceBackupPath, 'file', crypto.createHash('md5').update(fooFile.fsPath.toLowerCase()).digest('hex'));
const barBackupPath = path.join(workspaceBackupPath, 'file', crypto.createHash('md5').update(barFile.fsPath).digest('hex'));
const untitledBackupPath = path.join(workspaceBackupPath, 'untitled', crypto.createHash('md5').update(untitledFile.fsPath).digest('hex'));

class TestBackupFileService extends BackupFileService {
	constructor(workspace: Uri, backupHome: string, workspacesJsonPath: string) {
		const fileService = new FileService(workspace.fsPath, { disableWatcher: true });
		const environmentService = new TestEnvironmentService(backupHome, workspacesJsonPath);
		const backupService: IBackupService = {
			_serviceBrand: null,
			getBackupPath: () => TPromise.as(workspaceBackupPath)
		};

		super(environmentService, fileService, new TestWindowService(), backupService);
	}

	public getBackupResource(resource: Uri, legacyMacWindowsFormat?: boolean): Uri {
		return super.getBackupResource(resource, legacyMacWindowsFormat);
	}
}

suite('BackupFileService', () => {
	let service: TestBackupFileService;

	setup(done => {
		service = new TestBackupFileService(workspaceResource, backupHome, workspacesJsonPath);

		// Delete any existing backups completely and then re-create it.
		extfs.del(backupHome, os.tmpdir(), () => {
			pfs.mkdirp(backupHome).then(() => {
				pfs.writeFile(workspacesJsonPath, '').then(() => {
					done();
				});
			});
		});
	});

	teardown(done => {
		extfs.del(backupHome, os.tmpdir(), done);
	});

	suite('getBackupResource', () => {
		test('should get the correct backup path for text files', () => {
			// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
			const backupResource = fooFile;
			const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
			const filePathHash = crypto.createHash('md5').update(backupResource.fsPath).digest('hex');
			const expectedPath = Uri.file(path.join(backupHome, workspaceHash, 'file', filePathHash)).fsPath;
			assert.equal(service.getBackupResource(backupResource).fsPath, expectedPath);
		});

		test('should get the correct backup path for untitled files', () => {
			// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePath>
			const backupResource = Uri.from({ scheme: 'untitled', path: 'Untitled-1' });
			const workspaceHash = crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex');
			const filePathHash = crypto.createHash('md5').update(backupResource.fsPath).digest('hex');
			const expectedPath = Uri.file(path.join(backupHome, workspaceHash, 'untitled', filePathHash)).fsPath;
			assert.equal(service.getBackupResource(backupResource).fsPath, expectedPath);
		});
	});

	suite('loadBackupResource', () => {
		test('should return whether a backup resource exists', done => {
			pfs.mkdirp(path.dirname(fooBackupPath)).then(() => {
				fs.writeFileSync(fooBackupPath, 'foo');
				service = new TestBackupFileService(workspaceResource, backupHome, workspacesJsonPath);
				service.loadBackupResource(fooFile).then(resource => {
					assert.ok(resource);
					assert.equal(path.basename(resource.fsPath), path.basename(fooBackupPath));
					return service.hasBackups().then(hasBackups => {
						assert.ok(hasBackups);
						done();
					});
				});
			});
		});

		test('should return whether a backup resource exists - legacy support (read old lowercase format as fallback)', done => {
			if (platform.isLinux) {
				done();
				return; // only on mac and windows
			}

			pfs.mkdirp(path.dirname(fooBackupPath)).then(() => {
				fs.writeFileSync(fooBackupPathLegacy, 'foo');
				service = new TestBackupFileService(workspaceResource, backupHome, workspacesJsonPath);
				service.loadBackupResource(fooFile).then(resource => {
					assert.ok(resource);
					assert.equal(path.basename(resource.fsPath), path.basename(fooBackupPathLegacy));
					return service.hasBackups().then(hasBackups => {
						assert.ok(hasBackups);
						done();
					});
				});
			});
		});

		test('should return whether a backup resource exists - legacy support #2 (both cases present, return case sensitive backup)', done => {
			if (platform.isLinux) {
				done();
				return; // only on mac and windows
			}

			pfs.mkdirp(path.dirname(fooBackupPath)).then(() => {
				fs.writeFileSync(fooBackupPath, 'foo');
				fs.writeFileSync(fooBackupPathLegacy, 'foo');
				service = new TestBackupFileService(workspaceResource, backupHome, workspacesJsonPath);
				service.loadBackupResource(fooFile).then(resource => {
					assert.ok(resource);
					assert.equal(path.basename(resource.fsPath), path.basename(fooBackupPath));
					return service.hasBackups().then(hasBackups => {
						assert.ok(hasBackups);
						done();
					});
				});
			});
		});
	});

	suite('backupResource', () => {
		test('text file', function (done: () => void) {
			service.backupResource(fooFile, 'test').then(() => {
				assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'file')).length, 1);
				assert.equal(fs.existsSync(fooBackupPath), true);
				assert.equal(fs.readFileSync(fooBackupPath), `${fooFile.toString()}\ntest`);
				done();
			});
		});

		test('untitled file', function (done: () => void) {
			service.backupResource(untitledFile, 'test').then(() => {
				assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'untitled')).length, 1);
				assert.equal(fs.existsSync(untitledBackupPath), true);
				assert.equal(fs.readFileSync(untitledBackupPath), `${untitledFile.toString()}\ntest`);
				done();
			});
		});
	});

	suite('discardResourceBackup', () => {
		test('text file', function (done: () => void) {
			service.backupResource(fooFile, 'test').then(() => {
				assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'file')).length, 1);
				service.discardResourceBackup(fooFile).then(() => {
					assert.equal(fs.existsSync(fooBackupPath), false);
					assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'file')).length, 0);
					done();
				});
			});
		});

		test('untitled file', function (done: () => void) {
			service.backupResource(untitledFile, 'test').then(() => {
				assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'untitled')).length, 1);
				service.discardResourceBackup(untitledFile).then(() => {
					assert.equal(fs.existsSync(untitledBackupPath), false);
					assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'untitled')).length, 0);
					done();
				});
			});
		});

		test('text file - legacy support (dicard lowercase backup file if present)', done => {
			if (platform.isLinux) {
				done();
				return; // only on mac and windows
			}

			pfs.mkdirp(path.dirname(fooBackupPath)).then(() => {
				fs.writeFileSync(fooBackupPathLegacy, 'foo');
				service = new TestBackupFileService(workspaceResource, backupHome, workspacesJsonPath);
				service.backupResource(fooFile, 'test').then(() => {
					assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'file')).length, 2);
					service.discardResourceBackup(fooFile).then(() => {
						assert.equal(fs.existsSync(fooBackupPath), false);
						assert.equal(fs.existsSync(fooBackupPathLegacy), false);
						assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'file')).length, 0);
						done();
					});
				});
			});
		});
	});

	suite('discardAllWorkspaceBackups', () => {
		test('text file', function (done: () => void) {
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

		test('untitled file', function (done: () => void) {
			service.backupResource(untitledFile, 'test').then(() => {
				assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'untitled')).length, 1);
				service.discardAllWorkspaceBackups().then(() => {
					assert.equal(fs.existsSync(untitledBackupPath), false);
					assert.equal(fs.existsSync(path.join(workspaceBackupPath, 'untitled')), false);
					done();
				});
			});
		});

		test('should disable further backups', function (done: () => void) {
			service.discardAllWorkspaceBackups().then(() => {
				service.backupResource(untitledFile, 'test').then(() => {
					assert.equal(fs.existsSync(workspaceBackupPath), false);
					done();
				});
			});
		});
	});

	suite('getWorkspaceFileBackups', () => {
		test('("file") - text file', done => {
			service.backupResource(fooFile, `test`).then(() => {
				service.getWorkspaceFileBackups().then(textFiles => {
					assert.deepEqual(textFiles.map(f => f.fsPath), [fooFile.fsPath]);
					service.backupResource(barFile, `test`).then(() => {
						service.getWorkspaceFileBackups().then(textFiles => {
							assert.deepEqual(textFiles.map(f => f.fsPath), [fooFile.fsPath, barFile.fsPath]);
							done();
						});
					});
				});
			});
		});

		test('("file") - untitled file', done => {
			service.backupResource(untitledFile, `test`).then(() => {
				service.getWorkspaceFileBackups().then(textFiles => {
					assert.deepEqual(textFiles.map(f => f.fsPath), [untitledFile.fsPath]);
					done();
				});
			});
		});

		test('("untitled") - untitled file', done => {
			service.backupResource(untitledFile, `test`).then(() => {
				service.getWorkspaceFileBackups().then(textFiles => {
					assert.deepEqual(textFiles.map(f => f.fsPath), ['Untitled-1']);
					done();
				});
			});
		});
	});

	test('parseBackupContent', () => {
		test('should separate metadata from content', () => {
			const textSource = RawTextSource.fromString('metadata\ncontent');
			assert.equal(service.parseBackupContent(textSource), 'content');
		});
	});
});

suite('BackupFilesModel', () => {
	test('simple', () => {
		const model = new BackupFilesModel();

		const resource1 = Uri.file('test.html');

		assert.equal(model.has(resource1), false);

		model.add(resource1);

		assert.equal(model.has(resource1), true);
		assert.equal(model.has(resource1, 0), true);
		assert.equal(model.has(resource1, 1), false);

		model.remove(resource1);

		assert.equal(model.has(resource1), false);

		model.add(resource1);

		assert.equal(model.has(resource1), true);
		assert.equal(model.has(resource1, 0), true);
		assert.equal(model.has(resource1, 1), false);

		model.clear();

		assert.equal(model.has(resource1), false);

		model.add(resource1, 1);

		assert.equal(model.has(resource1), true);
		assert.equal(model.has(resource1, 0), false);
		assert.equal(model.has(resource1, 1), true);

		const resource2 = Uri.file('test1.html');
		const resource3 = Uri.file('test2.html');
		const resource4 = Uri.file('test3.html');

		model.add(resource2);
		model.add(resource3);
		model.add(resource4);

		assert.equal(model.has(resource1), true);
		assert.equal(model.has(resource2), true);
		assert.equal(model.has(resource3), true);
		assert.equal(model.has(resource4), true);
	});

	test('resolve', (done) => {
		pfs.mkdirp(path.dirname(fooBackupPath)).then(() => {
			fs.writeFileSync(fooBackupPath, 'foo');

			const model = new BackupFilesModel();

			model.resolve(workspaceBackupPath).then(model => {
				assert.equal(model.has(Uri.file(fooBackupPath)), true);

				done();
			});
		});
	});

	test('get', () => {
		const model = new BackupFilesModel();

		assert.deepEqual(model.get(), []);

		const file1 = Uri.file('/root/file/foo.html');
		const file2 = Uri.file('/root/file/bar.html');
		const untitled = Uri.file('/root/untitled/bar.html');

		model.add(file1);
		model.add(file2);
		model.add(untitled);

		assert.deepEqual(model.get().map(f => f.fsPath), [file1.fsPath, file2.fsPath, untitled.fsPath]);
	});
});
