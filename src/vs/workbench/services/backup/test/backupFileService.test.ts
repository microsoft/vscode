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
import { parseArgs } from 'vs/platform/environment/node/argv';
import { TextModel } from 'vs/editor/common/model/textModel';
import { IRawTextContent } from 'vs/workbench/services/textfile/common/textfiles';

class TestEnvironmentService extends EnvironmentService {

	constructor(private _backupHome: string, private _backupWorkspacesPath: string) {
		super(parseArgs(process.argv), process.execPath);
	}

	get backupHome(): string { return this._backupHome; }

	get backupWorkspacesPath(): string { return this._backupWorkspacesPath; }
}

class TestBackupFileService extends BackupFileService {
	constructor(workspace: Uri, backupHome: string, workspacesJsonPath: string) {
		const fileService = new FileService(workspace.fsPath, { disableWatcher: true }, null);
		const testEnvironmentService = new TestEnvironmentService(backupHome, workspacesJsonPath);

		super(workspace, testEnvironmentService, fileService);
	}

	public getBackupResource(resource: Uri): Uri {
		return super.getBackupResource(resource);
	}
}

suite('BackupFileService', () => {
	const parentDir = path.join(os.tmpdir(), 'vsctests', 'service');
	const backupHome = path.join(parentDir, 'Backups');
	const workspacesJsonPath = path.join(backupHome, 'workspaces.json');

	const workspaceResource = Uri.file(platform.isWindows ? 'c:\\workspace' : '/workspace');
	const workspaceBackupPath = path.join(backupHome, crypto.createHash('md5').update(workspaceResource.fsPath).digest('hex'));
	const fooFile = Uri.file(platform.isWindows ? 'c:\\foo' : '/foo');
	const barFile = Uri.file(platform.isWindows ? 'c:\\bar' : '/bar');
	const untitledFile = Uri.from({ scheme: 'untitled', path: 'Untitled-1' });
	const fooBackupPath = path.join(workspaceBackupPath, 'file', crypto.createHash('md5').update(fooFile.fsPath).digest('hex'));
	const barBackupPath = path.join(workspaceBackupPath, 'file', crypto.createHash('md5').update(barFile.fsPath).digest('hex'));
	const untitledBackupPath = path.join(workspaceBackupPath, 'untitled', crypto.createHash('md5').update(untitledFile.fsPath).digest('hex'));

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
		const filePathHash = crypto.createHash('md5').update(backupResource.fsPath).digest('hex');
		const expectedPath = Uri.file(path.join(backupHome, workspaceHash, 'untitled', filePathHash)).fsPath;
		assert.equal(service.getBackupResource(backupResource).fsPath, expectedPath);
	});

	test('doesTextFileHaveBackup should return whether a backup resource exists', done => {
		pfs.mkdirp(path.dirname(fooBackupPath)).then(() => {
			fs.writeFileSync(fooBackupPath, 'foo');
			service = new TestBackupFileService(workspaceResource, backupHome, workspacesJsonPath);
			service.hasBackup(fooFile).then(exists2 => {
				assert.equal(exists2, true);
				done();
			});
		});
	});

	test('backupResource - text file', function (done: () => void) {
		service.backupResource(fooFile, 'test').then(() => {
			assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'file')).length, 1);
			assert.equal(fs.existsSync(fooBackupPath), true);
			assert.equal(fs.readFileSync(fooBackupPath), `${fooFile.toString()}\ntest`);
			done();
		});
	});

	test('backupResource - untitled file', function (done: () => void) {
		service.backupResource(untitledFile, 'test').then(() => {
			assert.equal(fs.readdirSync(path.join(workspaceBackupPath, 'untitled')).length, 1);
			assert.equal(fs.existsSync(untitledBackupPath), true);
			assert.equal(fs.readFileSync(untitledBackupPath), `${untitledFile.toString()}\ntest`);
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

	test('getWorkspaceFileBackups("file") - text file', done => {
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

	test('getWorkspaceFileBackups("file") - untitled file', done => {
		service.backupResource(untitledFile, `test`).then(() => {
			service.getWorkspaceFileBackups().then(textFiles => {
				assert.deepEqual(textFiles.map(f => f.fsPath), [untitledFile.fsPath]);
				done();
			});
		});
	});

	test('getWorkspaceFileBackups("untitled") - untitled file', done => {
		service.backupResource(untitledFile, `test`).then(() => {
			service.getWorkspaceFileBackups().then(textFiles => {
				assert.deepEqual(textFiles.map(f => f.fsPath), ['Untitled-1']);
				done();
			});
		});
	});

	test('parseBackupContent', () => {
		const rawTextContent: IRawTextContent = {
			resource: null,
			name: null,
			mtime: null,
			etag: null,
			encoding: null,
			value: TextModel.toRawText('metadata\ncontent', TextModel.DEFAULT_CREATION_OPTIONS),
			valueLogicalHash: null
		};
		assert.equal(service.parseBackupContent(rawTextContent), 'content');
	});

	test('BackupFilesModel - simple', () => {
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

	test('BackupFilesModel - resolve', (done) => {
		pfs.mkdirp(path.dirname(fooBackupPath)).then(() => {
			fs.writeFileSync(fooBackupPath, 'foo');

			const model = new BackupFilesModel();

			model.resolve(workspaceBackupPath).then(model => {
				assert.equal(model.has(Uri.file(fooBackupPath)), true);

				done();
			});
		});
	});

	test('BackupFilesModel - get', () => {
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