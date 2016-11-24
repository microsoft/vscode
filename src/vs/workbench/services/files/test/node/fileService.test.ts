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
import { EventType, FileChangesEvent, FileOperationResult, IFileOperationResult } from 'vs/platform/files/common/files';
import { nfcall } from 'vs/base/common/async';
import uri from 'vs/base/common/uri';
import uuid = require('vs/base/common/uuid');
import extfs = require('vs/base/node/extfs');
import encodingLib = require('vs/base/node/encoding');
import utils = require('vs/workbench/services/files/test/node/utils');
import { onError } from 'vs/test/utils/servicesTestUtils';

suite('FileService', () => {
	let events: utils.TestEventService;
	let service: FileService;
	let parentDir = path.join(os.tmpdir(), 'vsctests', 'service');
	let testDir: string;

	setup(function (done) {
		let id = uuid.generateUuid();
		testDir = path.join(parentDir, id);
		let sourceDir = require.toUrl('./fixtures/service');

		extfs.copy(sourceDir, testDir, (error) => {
			if (error) {
				return onError(error, done);
			}

			events = new utils.TestEventService();
			service = new FileService(testDir, { disableWatcher: true }, events);
			done();
		});
	});

	teardown((done) => {
		service.dispose();
		events.dispose();
		extfs.del(parentDir, os.tmpdir(), () => { }, done);
	});

	test('resolveContents', function (done: () => void) {
		service.resolveContents([
			uri.file(path.join(testDir, 'index.html')),
			uri.file(path.join(testDir, '404.html')),
			uri.file(path.join(testDir, 'deep', 'company.js')),
		]).done(r => {
			assert.equal(r.length, 2);
			assert.equal(r.some(c => c.name === 'index.html'), true);
			assert.equal(r.some(c => c.name === 'company.js'), true);

			done();
		});
	});

	test('createFile', function (done: () => void) {
		let contents = 'Hello World';
		service.createFile(uri.file(path.join(testDir, 'test.txt')), contents).done(s => {
			assert.equal(s.name, 'test.txt');
			assert.equal(fs.existsSync(s.resource.fsPath), true);
			assert.equal(fs.readFileSync(s.resource.fsPath), contents);

			done();
		}, error => onError(error, done));
	});

	test('createFolder', function (done: () => void) {
		service.resolveFile(uri.file(testDir)).done(parent => {
			return service.createFolder(uri.file(path.join(parent.resource.fsPath, 'newFolder'))).then(f => {
				assert.equal(f.name, 'newFolder');
				assert.equal(fs.existsSync(f.resource.fsPath), true);

				done();
			});
		}, error => onError(error, done));
	});

	test('touchFile', function (done: () => void) {
		service.touchFile(uri.file(path.join(testDir, 'test.txt'))).done(s => {
			assert.equal(s.name, 'test.txt');
			assert.equal(fs.existsSync(s.resource.fsPath), true);
			assert.equal(fs.readFileSync(s.resource.fsPath).length, 0);

			const stat = fs.statSync(s.resource.fsPath);

			return TPromise.timeout(10).then(() => {
				return service.touchFile(s.resource).done(s => {
					const statNow = fs.statSync(s.resource.fsPath);
					assert.ok(statNow.mtime.getTime() >= stat.mtime.getTime()); // one some OS the resolution seems to be 1s, so we use >= here
					assert.equal(statNow.size, stat.size);

					done();
				});
			});
		}, error => onError(error, done));
	});

	test('renameFile', function (done: () => void) {
		service.resolveFile(uri.file(path.join(testDir, 'index.html'))).done(source => {
			return service.rename(source.resource, 'other.html').then(renamed => {
				assert.equal(fs.existsSync(renamed.resource.fsPath), true);
				assert.equal(fs.existsSync(source.resource.fsPath), false);

				done();
			});
		}, error => onError(error, done));
	});

	test('renameFolder', function (done: () => void) {
		service.resolveFile(uri.file(path.join(testDir, 'deep'))).done(source => {
			return service.rename(source.resource, 'deeper').then(renamed => {
				assert.equal(fs.existsSync(renamed.resource.fsPath), true);
				assert.equal(fs.existsSync(source.resource.fsPath), false);

				done();
			});
		});
	});

	test('renameFile - MIX CASE', function (done: () => void) {
		service.resolveFile(uri.file(path.join(testDir, 'index.html'))).done(source => {
			return service.rename(source.resource, 'INDEX.html').then(renamed => {
				assert.equal(fs.existsSync(renamed.resource.fsPath), true);
				assert.equal(path.basename(renamed.resource.fsPath), 'INDEX.html');

				done();
			});
		}, error => onError(error, done));
	});

	test('moveFile', function (done: () => void) {
		service.resolveFile(uri.file(path.join(testDir, 'index.html'))).done(source => {
			return service.moveFile(source.resource, uri.file(path.join(testDir, 'other.html'))).then(renamed => {
				assert.equal(fs.existsSync(renamed.resource.fsPath), true);
				assert.equal(fs.existsSync(source.resource.fsPath), false);

				done();
			});
		}, error => onError(error, done));
	});

	test('move - FILE_MOVE_CONFLICT', function (done: () => void) {
		service.resolveFile(uri.file(path.join(testDir, 'index.html'))).done(source => {
			return service.moveFile(source.resource, uri.file(path.join(testDir, 'binary.txt'))).then(null, (e: IFileOperationResult) => {
				assert.equal(e.fileOperationResult, FileOperationResult.FILE_MOVE_CONFLICT);

				done();
			});
		}, error => onError(error, done));
	});

	test('moveFile - MIX CASE', function (done: () => void) {
		service.resolveFile(uri.file(path.join(testDir, 'index.html'))).done(source => {
			return service.moveFile(source.resource, uri.file(path.join(testDir, 'INDEX.html'))).then(renamed => {
				assert.equal(fs.existsSync(renamed.resource.fsPath), true);
				assert.equal(path.basename(renamed.resource.fsPath), 'INDEX.html');

				done();
			});
		}, error => onError(error, done));
	});

	test('moveFile - overwrite folder with file', function (done: () => void) {
		service.resolveFile(uri.file(testDir)).done(parent => {
			return service.createFolder(uri.file(path.join(parent.resource.fsPath, 'conway.js'))).then(f => {
				return service.moveFile(uri.file(path.join(testDir, 'deep', 'conway.js')), f.resource, true).then(moved => {
					assert.equal(fs.existsSync(moved.resource.fsPath), true);
					assert.ok(fs.statSync(moved.resource.fsPath).isFile);

					done();
				});
			});
		}, error => onError(error, done));
	});

	test('copyFile', function (done: () => void) {
		service.resolveFile(uri.file(path.join(testDir, 'index.html'))).done(source => {
			return service.copyFile(source.resource, uri.file(path.join(testDir, 'other.html'))).then(renamed => {
				assert.equal(fs.existsSync(renamed.resource.fsPath), true);
				assert.equal(fs.existsSync(source.resource.fsPath), true);

				done();
			});
		}, error => onError(error, done));
	});

	test('copyFile - overwrite folder with file', function (done: () => void) {
		service.resolveFile(uri.file(testDir)).done(parent => {
			return service.createFolder(uri.file(path.join(parent.resource.fsPath, 'conway.js'))).then(f => {
				return service.copyFile(uri.file(path.join(testDir, 'deep', 'conway.js')), f.resource, true).then(copied => {
					assert.equal(fs.existsSync(copied.resource.fsPath), true);
					assert.ok(fs.statSync(copied.resource.fsPath).isFile);

					done();
				});
			});
		}, error => onError(error, done));
	});

	test('importFile', function (done: () => void) {
		service.resolveFile(uri.file(path.join(testDir, 'deep'))).done(target => {
			return service.importFile(uri.file(require.toUrl('./fixtures/service/index.html')), target.resource).then(res => {
				assert.equal(res.isNew, true);
				assert.equal(fs.existsSync(res.stat.resource.fsPath), true);

				done();
			});
		}, error => onError(error, done));
	});

	test('importFile - MIX CASE', function (done: () => void) {
		service.resolveFile(uri.file(path.join(testDir, 'index.html'))).done(source => {
			return service.rename(source.resource, 'CONWAY.js').then(renamed => { // index.html => CONWAY.js
				assert.equal(fs.existsSync(renamed.resource.fsPath), true);
				assert.ok(fs.readdirSync(testDir).some(f => f === 'CONWAY.js'));

				return service.resolveFile(uri.file(path.join(testDir, 'deep', 'conway.js'))).done(source => {
					return service.importFile(source.resource, uri.file(testDir)).then(res => { // CONWAY.js => conway.js
						assert.equal(fs.existsSync(res.stat.resource.fsPath), true);
						assert.ok(fs.readdirSync(testDir).some(f => f === 'conway.js'));

						done();
					});
				});
			});
		}, error => onError(error, done));
	});

	test('importFile - overwrite folder with file', function (done: () => void) {
		service.resolveFile(uri.file(testDir)).done(parent => {
			return service.createFolder(uri.file(path.join(parent.resource.fsPath, 'conway.js'))).then(f => {
				return service.importFile(uri.file(path.join(testDir, 'deep', 'conway.js')), uri.file(testDir)).then(res => {
					assert.equal(fs.existsSync(res.stat.resource.fsPath), true);
					assert.ok(fs.readdirSync(testDir).some(f => f === 'conway.js'));
					assert.ok(fs.statSync(res.stat.resource.fsPath).isFile);

					done();
				});
			});
		}, error => onError(error, done));
	});

	test('importFile - same file', function (done: () => void) {
		service.resolveFile(uri.file(path.join(testDir, 'index.html'))).done(source => {
			return service.importFile(source.resource, uri.file(path.dirname(source.resource.fsPath))).then(imported => {
				assert.equal(imported.stat.size, source.size);

				done();
			});
		}, error => onError(error, done));
	});

	test('deleteFile', function (done: () => void) {
		service.resolveFile(uri.file(path.join(testDir, 'deep', 'conway.js'))).done(source => {
			return service.del(source.resource).then(() => {
				assert.equal(fs.existsSync(source.resource.fsPath), false);

				done();
			});
		}, error => onError(error, done));
	});

	test('deleteFolder', function (done: () => void) {
		service.resolveFile(uri.file(path.join(testDir, 'deep'))).done(source => {
			return service.del(source.resource).then(() => {
				assert.equal(fs.existsSync(source.resource.fsPath), false);

				done();
			});
		}, error => onError(error, done));
	});

	test('resolveFile', function (done: () => void) {
		service.resolveFile(uri.file(testDir), { resolveTo: [uri.file(path.join(testDir, 'deep'))] }).done(r => {
			assert.equal(r.children.length, 6);

			let deep = utils.getByName(r, 'deep');
			assert.equal(deep.children.length, 4);

			done();
		}, error => onError(error, done));
	});

	test('existsFile', function (done: () => void) {
		service.existsFile(uri.file(testDir)).then((exists) => {
			assert.equal(exists, true);

			service.existsFile(uri.file(testDir + 'something')).then((exists) => {
				assert.equal(exists, false);

				done();
			});
		}, error => onError(error, done));
	});

	test('updateContent', function (done: () => void) {
		let resource = uri.file(path.join(testDir, 'small.txt'));

		service.resolveContent(resource).done(c => {
			assert.equal(c.value, 'Small File');

			c.value = 'Updates to the small file';

			return service.updateContent(c.resource, c.value).then(c => {
				assert.equal(fs.readFileSync(resource.fsPath), 'Updates to the small file');

				done();
			});
		}, error => onError(error, done));
	});

	test('updateContent - use encoding (UTF 16 BE)', function (done: () => void) {
		let resource = uri.file(path.join(testDir, 'small.txt'));
		let encoding = 'utf16be';

		service.resolveContent(resource).done(c => {
			c.encoding = encoding;

			return service.updateContent(c.resource, c.value, { encoding: encoding }).then(c => {
				return nfcall(encodingLib.detectEncodingByBOM, c.resource.fsPath).then((enc) => {
					assert.equal(enc, encodingLib.UTF16be);

					return service.resolveContent(resource).then(c => {
						assert.equal(c.encoding, encoding);

						done();
					});
				});
			});
		}, error => onError(error, done));
	});

	test('updateContent - encoding preserved (UTF 16 LE)', function (done: () => void) {
		let encoding = 'utf16le';
		let resource = uri.file(path.join(testDir, 'some_utf16le.css'));

		service.resolveContent(resource).done(c => {
			assert.equal(c.encoding, encoding);

			c.value = 'Some updates';

			return service.updateContent(c.resource, c.value, { encoding: encoding }).then(c => {
				return nfcall(encodingLib.detectEncodingByBOM, c.resource.fsPath).then((enc) => {
					assert.equal(enc, encodingLib.UTF16le);

					return service.resolveContent(resource).then(c => {
						assert.equal(c.encoding, encoding);

						done();
					});
				});
			});
		}, error => onError(error, done));
	});

	test('resolveContent - FILE_IS_BINARY', function (done: () => void) {
		let resource = uri.file(path.join(testDir, 'binary.txt'));

		service.resolveContent(resource, { acceptTextOnly: true }).done(null, (e: IFileOperationResult) => {
			assert.equal(e.fileOperationResult, FileOperationResult.FILE_IS_BINARY);

			return service.resolveContent(uri.file(path.join(testDir, 'small.txt')), { acceptTextOnly: true }).then(r => {
				assert.equal(r.name, 'small.txt');

				done();
			});
		}, error => onError(error, done));
	});

	test('resolveContent - FILE_IS_DIRECTORY', function (done: () => void) {
		let resource = uri.file(path.join(testDir, 'deep'));

		service.resolveContent(resource).done(null, (e: IFileOperationResult) => {
			assert.equal(e.fileOperationResult, FileOperationResult.FILE_IS_DIRECTORY);

			done();
		}, error => onError(error, done));
	});

	test('resolveContent - FILE_NOT_FOUND', function (done: () => void) {
		let resource = uri.file(path.join(testDir, '404.html'));

		service.resolveContent(resource).done(null, (e: IFileOperationResult) => {
			assert.equal(e.fileOperationResult, FileOperationResult.FILE_NOT_FOUND);

			done();
		}, error => onError(error, done));
	});

	test('resolveContent - FILE_NOT_MODIFIED_SINCE', function (done: () => void) {
		let resource = uri.file(path.join(testDir, 'index.html'));

		service.resolveContent(resource).done(c => {
			return service.resolveContent(resource, { etag: c.etag }).then(null, (e: IFileOperationResult) => {
				assert.equal(e.fileOperationResult, FileOperationResult.FILE_NOT_MODIFIED_SINCE);

				done();
			});
		}, error => onError(error, done));
	});

	test('resolveContent - FILE_MODIFIED_SINCE', function (done: () => void) {
		let resource = uri.file(path.join(testDir, 'index.html'));

		service.resolveContent(resource).done(c => {
			fs.writeFileSync(resource.fsPath, 'Updates Incoming!');

			return service.updateContent(resource, c.value, { etag: c.etag, mtime: c.mtime - 1000 }).then(null, (e: IFileOperationResult) => {
				assert.equal(e.fileOperationResult, FileOperationResult.FILE_MODIFIED_SINCE);

				done();
			});
		}, error => onError(error, done));
	});

	test('resolveContent - encoding picked up', function (done: () => void) {
		let resource = uri.file(path.join(testDir, 'index.html'));
		let encoding = 'windows1252';

		service.resolveContent(resource, { encoding: encoding }).done(c => {
			assert.equal(c.encoding, encoding);

			done();
		}, error => onError(error, done));
	});

	test('resolveContent - user overrides BOM', function (done: () => void) {
		let resource = uri.file(path.join(testDir, 'some_utf16le.css'));

		service.resolveContent(resource, { encoding: 'windows1252' }).done(c => {
			assert.equal(c.encoding, 'windows1252');

			done();
		}, error => onError(error, done));
	});

	test('resolveContent - BOM removed', function (done: () => void) {
		let resource = uri.file(path.join(testDir, 'some_utf8_bom.txt'));

		service.resolveContent(resource).done(c => {
			assert.equal(encodingLib.detectEncodingByBOMFromBuffer(new Buffer(c.value), 512), null);

			done();
		}, error => onError(error, done));
	});

	test('resolveContent - invalid encoding', function (done: () => void) {
		let resource = uri.file(path.join(testDir, 'index.html'));

		service.resolveContent(resource, { encoding: 'superduper' }).done(c => {
			assert.equal(c.encoding, 'utf8');

			done();
		}, error => onError(error, done));
	});

	test('watchFileChanges', function (done: () => void) {
		let toWatch = uri.file(path.join(testDir, 'index.html'));

		service.watchFileChanges(toWatch);

		events.addListener2(EventType.FILE_CHANGES, (e: FileChangesEvent) => {
			assert.ok(e);

			service.unwatchFileChanges(toWatch);
			done();
		});

		setTimeout(() => {
			fs.writeFileSync(toWatch.fsPath, 'Changes');
		}, 100);
	});

	test('watchFileChanges - support atomic save', function (done: () => void) {
		let toWatch = uri.file(path.join(testDir, 'index.html'));

		service.watchFileChanges(toWatch);

		events.addListener2(EventType.FILE_CHANGES, (e: FileChangesEvent) => {
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

	test('options - encoding', function (done: () => void) {

		// setup
		let _id = uuid.generateUuid();
		let _testDir = path.join(parentDir, _id);
		let _sourceDir = require.toUrl('./fixtures/service');

		extfs.copy(_sourceDir, _testDir, () => {
			let encodingOverride: IEncodingOverride[] = [];
			encodingOverride.push({
				resource: uri.file(path.join(testDir, 'deep')),
				encoding: 'utf16le'
			});

			let _service = new FileService(_testDir, {
				encoding: 'windows1252',
				encodingOverride: encodingOverride,
				disableWatcher: true
			}, null);

			_service.resolveContent(uri.file(path.join(testDir, 'index.html'))).done(c => {
				assert.equal(c.encoding, 'windows1252');

				return _service.resolveContent(uri.file(path.join(testDir, 'deep', 'conway.js'))).done(c => {
					assert.equal(c.encoding, 'utf16le');

					// teardown
					_service.dispose();
					done();
				});
			});
		});
	});

	test('UTF 8 BOMs', function (done: () => void) {

		// setup
		let _id = uuid.generateUuid();
		let _testDir = path.join(parentDir, _id);
		let _sourceDir = require.toUrl('./fixtures/service');
		let resource = uri.file(path.join(testDir, 'index.html'));

		let _service = new FileService(_testDir, {
			disableWatcher: true
		}, null);

		extfs.copy(_sourceDir, _testDir, () => {
			fs.readFile(resource.fsPath, (error, data) => {
				assert.equal(encodingLib.detectEncodingByBOMFromBuffer(data, 512), null);

				// Update content: UTF_8 => UTF_8_BOM
				_service.updateContent(resource, 'Hello Bom', { encoding: encodingLib.UTF8_with_bom }).done(() => {
					fs.readFile(resource.fsPath, (error, data) => {
						assert.equal(encodingLib.detectEncodingByBOMFromBuffer(data, 512), encodingLib.UTF8);

						// Update content: PRESERVE BOM when using UTF-8
						_service.updateContent(resource, 'Please stay Bom', { encoding: encodingLib.UTF8 }).done(() => {
							fs.readFile(resource.fsPath, (error, data) => {
								assert.equal(encodingLib.detectEncodingByBOMFromBuffer(data, 512), encodingLib.UTF8);

								// Update content: REMOVE BOM
								_service.updateContent(resource, 'Go away Bom', { encoding: encodingLib.UTF8, overwriteEncoding: true }).done(() => {
									fs.readFile(resource.fsPath, (error, data) => {
										assert.equal(encodingLib.detectEncodingByBOMFromBuffer(data, 512), null);

										// Update content: BOM comes not back
										_service.updateContent(resource, 'Do not come back Bom', { encoding: encodingLib.UTF8 }).done(() => {
											fs.readFile(resource.fsPath, (error, data) => {
												assert.equal(encodingLib.detectEncodingByBOMFromBuffer(data, 512), null);

												_service.dispose();
												done();
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
});
