/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import fs = require('fs');
import path = require('path');
import os = require('os');
import assert = require('assert');

import { TPromise } from 'vs/base/common/winjs.base';
import { FileService, IEncodingOverride } from 'vs/workbench/services/files/node/fileService';
import { FileOperation, FileOperationEvent, FileChangesEvent, FileOperationResult, FileOperationError } from 'vs/platform/files/common/files';
import uri from 'vs/base/common/uri';
import uuid = require('vs/base/common/uuid');
import pfs = require('vs/base/node/pfs');
import encodingLib = require('vs/base/node/encoding');
import utils = require('vs/workbench/services/files/test/node/utils');
import { TestEnvironmentService, TestContextService, TestTextResourceConfigurationService, getRandomTestPath, TestLifecycleService } from 'vs/workbench/test/workbenchTestServices';
import { Workspace, toWorkspaceFolders } from 'vs/platform/workspace/common/workspace';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TextModel } from 'vs/editor/common/model/textModel';

suite('FileService', () => {
	let service: FileService;
	const parentDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'fileservice');
	let testDir: string;

	setup(function () {
		const id = uuid.generateUuid();
		testDir = path.join(parentDir, id);
		const sourceDir = require.toUrl('./fixtures/service');

		return pfs.copy(sourceDir, testDir).then(() => {
			service = new FileService(new TestContextService(new Workspace(testDir, testDir, toWorkspaceFolders([{ path: testDir }]))), TestEnvironmentService, new TestTextResourceConfigurationService(), new TestConfigurationService(), new TestLifecycleService(), { disableWatcher: true });
		});
	});

	teardown(() => {
		service.dispose();
		return pfs.del(parentDir, os.tmpdir());
	});

	test('createFile', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const contents = 'Hello World';
		const resource = uri.file(path.join(testDir, 'test.txt'));
		return service.createFile(resource, contents).then(s => {
			assert.equal(s.name, 'test.txt');
			assert.equal(fs.existsSync(s.resource.fsPath), true);
			assert.equal(fs.readFileSync(s.resource.fsPath), contents);

			assert.ok(event);
			assert.equal(event.resource.fsPath, resource.fsPath);
			assert.equal(event.operation, FileOperation.CREATE);
			assert.equal(event.target.resource.fsPath, resource.fsPath);
			toDispose.dispose();
		});
	});

	test('createFile (does not overwrite by default)', function () {
		const contents = 'Hello World';
		const resource = uri.file(path.join(testDir, 'test.txt'));

		fs.writeFileSync(resource.fsPath, ''); // create file

		return service.createFile(resource, contents).then(null, error => {
			assert.ok(error);
		});
	});

	test('createFile (allows to overwrite existing)', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const contents = 'Hello World';
		const resource = uri.file(path.join(testDir, 'test.txt'));

		fs.writeFileSync(resource.fsPath, ''); // create file

		return service.createFile(resource, contents, { overwrite: true }).then(s => {
			assert.equal(s.name, 'test.txt');
			assert.equal(fs.existsSync(s.resource.fsPath), true);
			assert.equal(fs.readFileSync(s.resource.fsPath), contents);

			assert.ok(event);
			assert.equal(event.resource.fsPath, resource.fsPath);
			assert.equal(event.operation, FileOperation.CREATE);
			assert.equal(event.target.resource.fsPath, resource.fsPath);
			toDispose.dispose();
		});
	});

	test('createFolder', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		return service.resolveFile(uri.file(testDir)).then(parent => {
			const resource = uri.file(path.join(parent.resource.fsPath, 'newFolder'));

			return service.createFolder(resource).then(f => {
				assert.equal(f.name, 'newFolder');
				assert.equal(fs.existsSync(f.resource.fsPath), true);

				assert.ok(event);
				assert.equal(event.resource.fsPath, resource.fsPath);
				assert.equal(event.operation, FileOperation.CREATE);
				assert.equal(event.target.resource.fsPath, resource.fsPath);
				assert.equal(event.target.isDirectory, true);
				toDispose.dispose();
			});
		});
	});

	test('createFolder: creating multiple folders at once', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const multiFolderPaths = ['a', 'couple', 'of', 'folders'];
		return service.resolveFile(uri.file(testDir)).then(parent => {
			const resource = uri.file(path.join(parent.resource.fsPath, ...multiFolderPaths));

			return service.createFolder(resource).then(f => {
				const lastFolderName = multiFolderPaths[multiFolderPaths.length - 1];
				assert.equal(f.name, lastFolderName);
				assert.equal(fs.existsSync(f.resource.fsPath), true);

				assert.ok(event);
				assert.equal(event.resource.fsPath, resource.fsPath);
				assert.equal(event.operation, FileOperation.CREATE);
				assert.equal(event.target.resource.fsPath, resource.fsPath);
				assert.equal(event.target.isDirectory, true);
				toDispose.dispose();
			});
		});
	});

	test('touchFile', function () {
		return service.touchFile(uri.file(path.join(testDir, 'test.txt'))).then(s => {
			assert.equal(s.name, 'test.txt');
			assert.equal(fs.existsSync(s.resource.fsPath), true);
			assert.equal(fs.readFileSync(s.resource.fsPath).length, 0);

			const stat = fs.statSync(s.resource.fsPath);

			return TPromise.timeout(10).then(() => {
				return service.touchFile(s.resource).then(s => {
					const statNow = fs.statSync(s.resource.fsPath);
					assert.ok(statNow.mtime.getTime() >= stat.mtime.getTime()); // one some OS the resolution seems to be 1s, so we use >= here
					assert.equal(statNow.size, stat.size);
				});
			});
		});
	});

	test('touchFile - multi folder', function () {
		const multiFolderPaths = ['a', 'couple', 'of', 'folders'];

		return service.touchFile(uri.file(path.join(testDir, ...multiFolderPaths, 'test.txt'))).then(s => {
			assert.equal(s.name, 'test.txt');
			assert.equal(fs.existsSync(s.resource.fsPath), true);
			assert.equal(fs.readFileSync(s.resource.fsPath).length, 0);

			const stat = fs.statSync(s.resource.fsPath);

			return TPromise.timeout(10).then(() => {
				return service.touchFile(s.resource).then(s => {
					const statNow = fs.statSync(s.resource.fsPath);
					assert.ok(statNow.mtime.getTime() >= stat.mtime.getTime()); // one some OS the resolution seems to be 1s, so we use >= here
					assert.equal(statNow.size, stat.size);
				});
			});
		});
	});

	test('renameFile', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const resource = uri.file(path.join(testDir, 'index.html'));
		return service.resolveFile(resource).then(source => {
			return service.rename(source.resource, 'other.html').then(renamed => {
				assert.equal(fs.existsSync(renamed.resource.fsPath), true);
				assert.equal(fs.existsSync(source.resource.fsPath), false);

				assert.ok(event);
				assert.equal(event.resource.fsPath, resource.fsPath);
				assert.equal(event.operation, FileOperation.MOVE);
				assert.equal(event.target.resource.fsPath, renamed.resource.fsPath);
				toDispose.dispose();
			});
		});
	});

	test('renameFile - multi folder', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const multiFolderPaths = ['a', 'couple', 'of', 'folders'];
		const renameToPath = path.join(...multiFolderPaths, 'other.html');

		const resource = uri.file(path.join(testDir, 'index.html'));
		return service.resolveFile(resource).then(source => {
			return service.rename(source.resource, renameToPath).then(renamed => {
				assert.equal(fs.existsSync(renamed.resource.fsPath), true);
				assert.equal(fs.existsSync(source.resource.fsPath), false);

				assert.ok(event);
				assert.equal(event.resource.fsPath, resource.fsPath);
				assert.equal(event.operation, FileOperation.MOVE);
				assert.equal(event.target.resource.fsPath, renamed.resource.fsPath);
				toDispose.dispose();
			});
		});
	});

	test('renameFolder', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const resource = uri.file(path.join(testDir, 'deep'));
		return service.resolveFile(resource).then(source => {
			return service.rename(source.resource, 'deeper').then(renamed => {
				assert.equal(fs.existsSync(renamed.resource.fsPath), true);
				assert.equal(fs.existsSync(source.resource.fsPath), false);

				assert.ok(event);
				assert.equal(event.resource.fsPath, resource.fsPath);
				assert.equal(event.operation, FileOperation.MOVE);
				assert.equal(event.target.resource.fsPath, renamed.resource.fsPath);
				toDispose.dispose();
			});
		});
	});

	test('renameFolder - multi folder', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const multiFolderPaths = ['a', 'couple', 'of', 'folders'];
		const renameToPath = path.join(...multiFolderPaths);

		const resource = uri.file(path.join(testDir, 'deep'));
		return service.resolveFile(resource).then(source => {
			return service.rename(source.resource, renameToPath).then(renamed => {
				assert.equal(fs.existsSync(renamed.resource.fsPath), true);
				assert.equal(fs.existsSync(source.resource.fsPath), false);

				assert.ok(event);
				assert.equal(event.resource.fsPath, resource.fsPath);
				assert.equal(event.operation, FileOperation.MOVE);
				assert.equal(event.target.resource.fsPath, renamed.resource.fsPath);
				toDispose.dispose();
			});
		});
	});
	test('renameFile - MIX CASE', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const resource = uri.file(path.join(testDir, 'index.html'));
		return service.resolveFile(resource).then(source => {
			return service.rename(source.resource, 'INDEX.html').then(renamed => {
				assert.equal(fs.existsSync(renamed.resource.fsPath), true);
				assert.equal(path.basename(renamed.resource.fsPath), 'INDEX.html');

				assert.ok(event);
				assert.equal(event.resource.fsPath, resource.fsPath);
				assert.equal(event.operation, FileOperation.MOVE);
				assert.equal(event.target.resource.fsPath, renamed.resource.fsPath);
				toDispose.dispose();
			});
		});
	});

	test('moveFile', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const resource = uri.file(path.join(testDir, 'index.html'));
		return service.resolveFile(resource).then(source => {
			return service.moveFile(source.resource, uri.file(path.join(testDir, 'other.html'))).then(renamed => {
				assert.equal(fs.existsSync(renamed.resource.fsPath), true);
				assert.equal(fs.existsSync(source.resource.fsPath), false);

				assert.ok(event);
				assert.equal(event.resource.fsPath, resource.fsPath);
				assert.equal(event.operation, FileOperation.MOVE);
				assert.equal(event.target.resource.fsPath, renamed.resource.fsPath);
				toDispose.dispose();
			});
		});
	});

	test('move - FILE_MOVE_CONFLICT', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		return service.resolveFile(uri.file(path.join(testDir, 'index.html'))).then(source => {
			return service.moveFile(source.resource, uri.file(path.join(testDir, 'binary.txt'))).then(null, (e: FileOperationError) => {
				assert.equal(e.fileOperationResult, FileOperationResult.FILE_MOVE_CONFLICT);

				assert.ok(!event);
				toDispose.dispose();
			});
		});
	});

	test('moveFile - MIX CASE', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const resource = uri.file(path.join(testDir, 'index.html'));
		return service.resolveFile(resource).then(source => {
			return service.moveFile(source.resource, uri.file(path.join(testDir, 'INDEX.html'))).then(renamed => {
				assert.equal(fs.existsSync(renamed.resource.fsPath), true);
				assert.equal(path.basename(renamed.resource.fsPath), 'INDEX.html');

				assert.ok(event);
				assert.equal(event.resource.fsPath, resource.fsPath);
				assert.equal(event.operation, FileOperation.MOVE);
				assert.equal(event.target.resource.fsPath, renamed.resource.fsPath);
				toDispose.dispose();
			});
		});
	});

	test('moveFile - overwrite folder with file', function () {
		let createEvent: FileOperationEvent;
		let moveEvent: FileOperationEvent;
		let deleteEvent: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			if (e.operation === FileOperation.CREATE) {
				createEvent = e;
			} else if (e.operation === FileOperation.DELETE) {
				deleteEvent = e;
			} else if (e.operation === FileOperation.MOVE) {
				moveEvent = e;
			}
		});

		return service.resolveFile(uri.file(testDir)).then(parent => {
			const folderResource = uri.file(path.join(parent.resource.fsPath, 'conway.js'));
			return service.createFolder(folderResource).then(f => {
				const resource = uri.file(path.join(testDir, 'deep', 'conway.js'));
				return service.moveFile(resource, f.resource, true).then(moved => {
					assert.equal(fs.existsSync(moved.resource.fsPath), true);
					assert.ok(fs.statSync(moved.resource.fsPath).isFile);

					assert.ok(createEvent);
					assert.ok(deleteEvent);
					assert.ok(moveEvent);

					assert.equal(moveEvent.resource.fsPath, resource.fsPath);
					assert.equal(moveEvent.target.resource.fsPath, moved.resource.fsPath);

					assert.equal(deleteEvent.resource.fsPath, folderResource.fsPath);

					toDispose.dispose();
				});
			});
		});
	});

	test('copyFile', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		return service.resolveFile(uri.file(path.join(testDir, 'index.html'))).then(source => {
			const resource = uri.file(path.join(testDir, 'other.html'));
			return service.copyFile(source.resource, resource).then(copied => {
				assert.equal(fs.existsSync(copied.resource.fsPath), true);
				assert.equal(fs.existsSync(source.resource.fsPath), true);

				assert.ok(event);
				assert.equal(event.resource.fsPath, source.resource.fsPath);
				assert.equal(event.operation, FileOperation.COPY);
				assert.equal(event.target.resource.fsPath, copied.resource.fsPath);
				toDispose.dispose();
			});
		});
	});

	test('copyFile - overwrite folder with file', function () {
		let createEvent: FileOperationEvent;
		let copyEvent: FileOperationEvent;
		let deleteEvent: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			if (e.operation === FileOperation.CREATE) {
				createEvent = e;
			} else if (e.operation === FileOperation.DELETE) {
				deleteEvent = e;
			} else if (e.operation === FileOperation.COPY) {
				copyEvent = e;
			}
		});

		return service.resolveFile(uri.file(testDir)).then(parent => {
			const folderResource = uri.file(path.join(parent.resource.fsPath, 'conway.js'));
			return service.createFolder(folderResource).then(f => {
				const resource = uri.file(path.join(testDir, 'deep', 'conway.js'));
				return service.copyFile(resource, f.resource, true).then(copied => {
					assert.equal(fs.existsSync(copied.resource.fsPath), true);
					assert.ok(fs.statSync(copied.resource.fsPath).isFile);

					assert.ok(createEvent);
					assert.ok(deleteEvent);
					assert.ok(copyEvent);

					assert.equal(copyEvent.resource.fsPath, resource.fsPath);
					assert.equal(copyEvent.target.resource.fsPath, copied.resource.fsPath);

					assert.equal(deleteEvent.resource.fsPath, folderResource.fsPath);

					toDispose.dispose();
				});
			});
		});
	});

	test('importFile', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		return service.resolveFile(uri.file(path.join(testDir, 'deep'))).then(target => {
			const resource = uri.file(require.toUrl('./fixtures/service/index.html'));
			return service.importFile(resource, target.resource).then(res => {
				assert.equal(res.isNew, true);
				assert.equal(fs.existsSync(res.stat.resource.fsPath), true);

				assert.ok(event);
				assert.equal(event.resource.fsPath, resource.fsPath);
				assert.equal(event.operation, FileOperation.IMPORT);
				assert.equal(event.target.resource.fsPath, res.stat.resource.fsPath);
				toDispose.dispose();
			});
		});
	});

	test('importFile - MIX CASE', function () {
		return service.resolveFile(uri.file(path.join(testDir, 'index.html'))).then(source => {
			return service.rename(source.resource, 'CONWAY.js').then(renamed => { // index.html => CONWAY.js
				assert.equal(fs.existsSync(renamed.resource.fsPath), true);
				assert.ok(fs.readdirSync(testDir).some(f => f === 'CONWAY.js'));

				return service.resolveFile(uri.file(path.join(testDir, 'deep', 'conway.js'))).then(source => {
					return service.importFile(source.resource, uri.file(testDir)).then(res => { // CONWAY.js => conway.js
						assert.equal(fs.existsSync(res.stat.resource.fsPath), true);
						assert.ok(fs.readdirSync(testDir).some(f => f === 'conway.js'));
					});
				});
			});
		});
	});

	test('importFile - overwrite folder with file', function () {
		let createEvent: FileOperationEvent;
		let importEvent: FileOperationEvent;
		let deleteEvent: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			if (e.operation === FileOperation.CREATE) {
				createEvent = e;
			} else if (e.operation === FileOperation.DELETE) {
				deleteEvent = e;
			} else if (e.operation === FileOperation.IMPORT) {
				importEvent = e;
			}
		});

		return service.resolveFile(uri.file(testDir)).then(parent => {
			const folderResource = uri.file(path.join(parent.resource.fsPath, 'conway.js'));
			return service.createFolder(folderResource).then(f => {
				const resource = uri.file(path.join(testDir, 'deep', 'conway.js'));
				return service.importFile(resource, uri.file(testDir)).then(res => {
					assert.equal(fs.existsSync(res.stat.resource.fsPath), true);
					assert.ok(fs.readdirSync(testDir).some(f => f === 'conway.js'));
					assert.ok(fs.statSync(res.stat.resource.fsPath).isFile);

					assert.ok(createEvent);
					assert.ok(deleteEvent);
					assert.ok(importEvent);

					assert.equal(importEvent.resource.fsPath, resource.fsPath);
					assert.equal(importEvent.target.resource.fsPath, res.stat.resource.fsPath);

					assert.equal(deleteEvent.resource.fsPath, folderResource.fsPath);

					toDispose.dispose();
				});
			});
		});
	});

	test('importFile - same file', function () {
		return service.resolveFile(uri.file(path.join(testDir, 'index.html'))).then(source => {
			return service.importFile(source.resource, uri.file(path.dirname(source.resource.fsPath))).then(imported => {
				assert.equal(imported.stat.size, source.size);
			});
		});
	});

	test('deleteFile', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const resource = uri.file(path.join(testDir, 'deep', 'conway.js'));
		return service.resolveFile(resource).then(source => {
			return service.del(source.resource).then(() => {
				assert.equal(fs.existsSync(source.resource.fsPath), false);

				assert.ok(event);
				assert.equal(event.resource.fsPath, resource.fsPath);
				assert.equal(event.operation, FileOperation.DELETE);
				toDispose.dispose();
			});
		});
	});

	test('deleteFolder', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const resource = uri.file(path.join(testDir, 'deep'));
		return service.resolveFile(resource).then(source => {
			return service.del(source.resource).then(() => {
				assert.equal(fs.existsSync(source.resource.fsPath), false);

				assert.ok(event);
				assert.equal(event.resource.fsPath, resource.fsPath);
				assert.equal(event.operation, FileOperation.DELETE);
				toDispose.dispose();
			});
		});
	});

	test('resolveFile', function () {
		return service.resolveFile(uri.file(testDir), { resolveTo: [uri.file(path.join(testDir, 'deep'))] }).then(r => {
			assert.equal(r.children.length, 8);

			const deep = utils.getByName(r, 'deep');
			assert.equal(deep.children.length, 4);
		});
	});

	test('resolveFiles', function () {
		return service.resolveFiles([
			{ resource: uri.file(testDir), options: { resolveTo: [uri.file(path.join(testDir, 'deep'))] } },
			{ resource: uri.file(path.join(testDir, 'deep')) }
		]).then(res => {
			const r1 = res[0].stat;

			assert.equal(r1.children.length, 8);

			const deep = utils.getByName(r1, 'deep');
			assert.equal(deep.children.length, 4);

			const r2 = res[1].stat;
			assert.equal(r2.children.length, 4);
			assert.equal(r2.name, 'deep');
		});
	});

	test('existsFile', function () {
		return service.existsFile(uri.file(testDir)).then((exists) => {
			assert.equal(exists, true);

			return service.existsFile(uri.file(testDir + 'something')).then((exists) => {
				assert.equal(exists, false);
			});
		});
	});

	test('updateContent', function () {
		const resource = uri.file(path.join(testDir, 'small.txt'));

		return service.resolveContent(resource).then(c => {
			assert.equal(c.value, 'Small File');

			c.value = 'Updates to the small file';

			return service.updateContent(c.resource, c.value).then(c => {
				assert.equal(fs.readFileSync(resource.fsPath), 'Updates to the small file');
			});
		});
	});

	test('updateContent (ITextSnapShot)', function () {
		const resource = uri.file(path.join(testDir, 'small.txt'));

		return service.resolveContent(resource).then(c => {
			assert.equal(c.value, 'Small File');

			const model = TextModel.createFromString('Updates to the small file');

			return service.updateContent(c.resource, model.createSnapshot()).then(c => {
				assert.equal(fs.readFileSync(resource.fsPath), 'Updates to the small file');

				model.dispose();
			});
		});
	});

	test('updateContent (large file)', function () {
		const resource = uri.file(path.join(testDir, 'lorem.txt'));

		return service.resolveContent(resource).then(c => {
			const newValue = c.value + c.value;
			c.value = newValue;

			return service.updateContent(c.resource, c.value).then(c => {
				assert.equal(fs.readFileSync(resource.fsPath), newValue);
			});
		});
	});

	test('updateContent (large file, ITextSnapShot)', function () {
		const resource = uri.file(path.join(testDir, 'lorem.txt'));

		return service.resolveContent(resource).then(c => {
			const newValue = c.value + c.value;
			const model = TextModel.createFromString(newValue);

			return service.updateContent(c.resource, model.createSnapshot()).then(c => {
				assert.equal(fs.readFileSync(resource.fsPath), newValue);
			});
		});
	});

	test('updateContent - use encoding (UTF 16 BE)', function () {
		const resource = uri.file(path.join(testDir, 'small.txt'));
		const encoding = 'utf16be';

		return service.resolveContent(resource).then(c => {
			c.encoding = encoding;

			return service.updateContent(c.resource, c.value, { encoding: encoding }).then(c => {
				return encodingLib.detectEncodingByBOM(c.resource.fsPath).then((enc) => {
					assert.equal(enc, encodingLib.UTF16be);

					return service.resolveContent(resource).then(c => {
						assert.equal(c.encoding, encoding);
					});
				});
			});
		});
	});

	test('updateContent - use encoding (UTF 16 BE, ITextSnapShot)', function () {
		const resource = uri.file(path.join(testDir, 'small.txt'));
		const encoding = 'utf16be';

		return service.resolveContent(resource).then(c => {
			c.encoding = encoding;

			const model = TextModel.createFromString(c.value);

			return service.updateContent(c.resource, model.createSnapshot(), { encoding: encoding }).then(c => {
				return encodingLib.detectEncodingByBOM(c.resource.fsPath).then((enc) => {
					assert.equal(enc, encodingLib.UTF16be);

					return service.resolveContent(resource).then(c => {
						assert.equal(c.encoding, encoding);

						model.dispose();
					});
				});
			});
		});
	});

	test('updateContent - encoding preserved (UTF 16 LE)', function () {
		const encoding = 'utf16le';
		const resource = uri.file(path.join(testDir, 'some_utf16le.css'));

		return service.resolveContent(resource).then(c => {
			assert.equal(c.encoding, encoding);

			c.value = 'Some updates';

			return service.updateContent(c.resource, c.value, { encoding: encoding }).then(c => {
				return encodingLib.detectEncodingByBOM(c.resource.fsPath).then((enc) => {
					assert.equal(enc, encodingLib.UTF16le);

					return service.resolveContent(resource).then(c => {
						assert.equal(c.encoding, encoding);
					});
				});
			});
		});
	});

	test('updateContent - encoding preserved (UTF 16 LE, ITextSnapShot)', function () {
		const encoding = 'utf16le';
		const resource = uri.file(path.join(testDir, 'some_utf16le.css'));

		return service.resolveContent(resource).then(c => {
			assert.equal(c.encoding, encoding);

			const model = TextModel.createFromString('Some updates');

			return service.updateContent(c.resource, model.createSnapshot(), { encoding: encoding }).then(c => {
				return encodingLib.detectEncodingByBOM(c.resource.fsPath).then((enc) => {
					assert.equal(enc, encodingLib.UTF16le);

					return service.resolveContent(resource).then(c => {
						assert.equal(c.encoding, encoding);

						model.dispose();
					});
				});
			});
		});
	});

	test('resolveContent - large file', function () {
		const resource = uri.file(path.join(testDir, 'lorem.txt'));

		return service.resolveContent(resource).then(c => {
			assert.ok(c.value.length > 64000);
		});
	});

	test('Files are intermingled #38331', function () {
		let resource1 = uri.file(path.join(testDir, 'lorem.txt'));
		let resource2 = uri.file(path.join(testDir, 'some_utf16le.css'));
		let value1: string;
		let value2: string;
		// load in sequence and keep data
		return service.resolveContent(resource1).then(c => value1 = c.value).then(() => {
			return service.resolveContent(resource2).then(c => value2 = c.value);
		}).then(() => {
			// load in parallel in expect the same result
			return TPromise.join([
				service.resolveContent(resource1).then(c => assert.equal(c.value, value1)),
				service.resolveContent(resource2).then(c => assert.equal(c.value, value2))
			]);
		});
	});

	test('resolveContent - FILE_IS_BINARY', function () {
		const resource = uri.file(path.join(testDir, 'binary.txt'));

		return service.resolveContent(resource, { acceptTextOnly: true }).then(null, (e: FileOperationError) => {
			assert.equal(e.fileOperationResult, FileOperationResult.FILE_IS_BINARY);

			return service.resolveContent(uri.file(path.join(testDir, 'small.txt')), { acceptTextOnly: true }).then(r => {
				assert.equal(r.name, 'small.txt');
			});
		});
	});

	test('resolveContent - FILE_IS_DIRECTORY', function () {
		const resource = uri.file(path.join(testDir, 'deep'));

		return service.resolveContent(resource).then(null, (e: FileOperationError) => {
			assert.equal(e.fileOperationResult, FileOperationResult.FILE_IS_DIRECTORY);
		});
	});

	test('resolveContent - FILE_NOT_FOUND', function () {
		const resource = uri.file(path.join(testDir, '404.html'));

		return service.resolveContent(resource).then(null, (e: FileOperationError) => {
			assert.equal(e.fileOperationResult, FileOperationResult.FILE_NOT_FOUND);
		});
	});

	test('resolveContent - FILE_NOT_MODIFIED_SINCE', function () {
		const resource = uri.file(path.join(testDir, 'index.html'));

		return service.resolveContent(resource).then(c => {
			return service.resolveContent(resource, { etag: c.etag }).then(null, (e: FileOperationError) => {
				assert.equal(e.fileOperationResult, FileOperationResult.FILE_NOT_MODIFIED_SINCE);
			});
		});
	});

	test('resolveContent - FILE_MODIFIED_SINCE', function () {
		const resource = uri.file(path.join(testDir, 'index.html'));

		return service.resolveContent(resource).then(c => {
			fs.writeFileSync(resource.fsPath, 'Updates Incoming!');

			return service.updateContent(resource, c.value, { etag: c.etag, mtime: c.mtime - 1000 }).then(null, (e: FileOperationError) => {
				assert.equal(e.fileOperationResult, FileOperationResult.FILE_MODIFIED_SINCE);
			});
		});
	});

	test('resolveContent - encoding picked up', function () {
		const resource = uri.file(path.join(testDir, 'index.html'));
		const encoding = 'windows1252';

		return service.resolveContent(resource, { encoding: encoding }).then(c => {
			assert.equal(c.encoding, encoding);
		});
	});

	test('resolveContent - user overrides BOM', function () {
		const resource = uri.file(path.join(testDir, 'some_utf16le.css'));

		return service.resolveContent(resource, { encoding: 'windows1252' }).then(c => {
			assert.equal(c.encoding, 'windows1252');
		});
	});

	test('resolveContent - BOM removed', function () {
		const resource = uri.file(path.join(testDir, 'some_utf8_bom.txt'));

		return service.resolveContent(resource).then(c => {
			assert.equal(encodingLib.detectEncodingByBOMFromBuffer(Buffer.from(c.value), 512), null);
		});
	});

	test('resolveContent - invalid encoding', function () {
		const resource = uri.file(path.join(testDir, 'index.html'));

		return service.resolveContent(resource, { encoding: 'superduper' }).then(c => {
			assert.equal(c.encoding, 'utf8');
		});
	});

	test('watchFileChanges', function (done) {
		const toWatch = uri.file(path.join(testDir, 'index.html'));

		service.watchFileChanges(toWatch);

		service.onFileChanges((e: FileChangesEvent) => {
			assert.ok(e);

			service.unwatchFileChanges(toWatch);
			done();
		});

		setTimeout(() => {
			fs.writeFileSync(toWatch.fsPath, 'Changes');
		}, 100);
	});

	test('watchFileChanges - support atomic save', function (done) {
		const toWatch = uri.file(path.join(testDir, 'index.html'));

		service.watchFileChanges(toWatch);

		service.onFileChanges((e: FileChangesEvent) => {
			assert.ok(e);

			service.unwatchFileChanges(toWatch);
			done();
		});

		setTimeout(() => {
			// Simulate atomic save by deleting the file, creating it under different name
			// and then replacing the previously deleted file with those contents
			const renamed = `${toWatch.fsPath}.bak`;
			fs.unlinkSync(toWatch.fsPath);
			fs.writeFileSync(renamed, 'Changes');
			fs.renameSync(renamed, toWatch.fsPath);
		}, 100);
	});

	test('options - encoding', function () {

		// setup
		const _id = uuid.generateUuid();
		const _testDir = path.join(parentDir, _id);
		const _sourceDir = require.toUrl('./fixtures/service');

		return pfs.copy(_sourceDir, _testDir).then(() => {
			const encodingOverride: IEncodingOverride[] = [];
			encodingOverride.push({
				resource: uri.file(path.join(testDir, 'deep')),
				encoding: 'utf16le'
			});

			const configurationService = new TestConfigurationService();
			configurationService.setUserConfiguration('files', { encoding: 'windows1252' });

			const textResourceConfigurationService = new TestTextResourceConfigurationService(configurationService);

			const _service = new FileService(new TestContextService(new Workspace(_testDir, _testDir, toWorkspaceFolders([{ path: _testDir }]))), TestEnvironmentService, textResourceConfigurationService, configurationService, new TestLifecycleService(), {
				encodingOverride,
				disableWatcher: true
			});

			return _service.resolveContent(uri.file(path.join(testDir, 'index.html'))).then(c => {
				assert.equal(c.encoding, 'windows1252');

				return _service.resolveContent(uri.file(path.join(testDir, 'deep', 'conway.js'))).then(c => {
					assert.equal(c.encoding, 'utf16le');

					// teardown
					_service.dispose();
				});
			});
		});
	});

	test('UTF 8 BOMs', function () {

		// setup
		const _id = uuid.generateUuid();
		const _testDir = path.join(parentDir, _id);
		const _sourceDir = require.toUrl('./fixtures/service');
		const resource = uri.file(path.join(testDir, 'index.html'));

		const _service = new FileService(new TestContextService(new Workspace(_testDir, _testDir, toWorkspaceFolders([{ path: _testDir }]))), TestEnvironmentService, new TestTextResourceConfigurationService(), new TestConfigurationService(), new TestLifecycleService(), {
			disableWatcher: true
		});

		return pfs.copy(_sourceDir, _testDir).then(() => {
			return pfs.readFile(resource.fsPath).then(data => {
				assert.equal(encodingLib.detectEncodingByBOMFromBuffer(data, 512), null);

				const model = TextModel.createFromString('Hello Bom');

				// Update content: UTF_8 => UTF_8_BOM
				return _service.updateContent(resource, model.createSnapshot(), { encoding: encodingLib.UTF8_with_bom }).then(() => {
					return pfs.readFile(resource.fsPath).then(data => {
						assert.equal(encodingLib.detectEncodingByBOMFromBuffer(data, 512), encodingLib.UTF8);

						// Update content: PRESERVE BOM when using UTF-8
						model.setValue('Please stay Bom');
						return _service.updateContent(resource, model.createSnapshot(), { encoding: encodingLib.UTF8 }).then(() => {
							return pfs.readFile(resource.fsPath).then(data => {
								assert.equal(encodingLib.detectEncodingByBOMFromBuffer(data, 512), encodingLib.UTF8);

								// Update content: REMOVE BOM
								model.setValue('Go away Bom');
								return _service.updateContent(resource, model.createSnapshot(), { encoding: encodingLib.UTF8, overwriteEncoding: true }).then(() => {
									return pfs.readFile(resource.fsPath).then(data => {
										assert.equal(encodingLib.detectEncodingByBOMFromBuffer(data, 512), null);

										// Update content: BOM comes not back
										model.setValue('Do not come back Bom');
										return _service.updateContent(resource, model.createSnapshot(), { encoding: encodingLib.UTF8 }).then(() => {
											return pfs.readFile(resource.fsPath).then(data => {
												assert.equal(encodingLib.detectEncodingByBOMFromBuffer(data, 512), null);

												model.dispose();
												_service.dispose();
											});
										});
									});
								});
							});
						});
					});
				});
			});
		});
	});

	test('resolveContent - from position (ASCII)', function () {
		const resource = uri.file(path.join(testDir, 'small.txt'));

		return service.resolveContent(resource, { position: 6 }).then(content => {
			assert.equal(content.value, 'File');
		});
	});

	test('resolveContent - from position (with umlaut)', function () {
		const resource = uri.file(path.join(testDir, 'small_umlaut.txt'));

		return service.resolveContent(resource, { position: Buffer.from('Small File with Ü').length }).then(content => {
			assert.equal(content.value, 'mlaut');
		});
	});
});
