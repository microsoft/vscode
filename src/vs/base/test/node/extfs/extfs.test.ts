/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');
import os = require('os');

import path = require('path');
import fs = require('fs');

import uuid = require('vs/base/common/uuid');
import strings = require('vs/base/common/strings');
import extfs = require('vs/base/node/extfs');
import { Readable } from 'stream';
import { isLinux, isWindows } from 'vs/base/common/platform';

const ignore = () => { };

const mkdirp = (path: string, mode: number, callback: (error) => void) => {
	extfs.mkdirp(path, mode).done(() => callback(null), error => callback(error));
};

const chunkSize = 64 * 1024;
const readError = 'Error while reading';
function toReadable(value: string, throwError?: boolean): Readable {
	const totalChunks = Math.ceil(value.length / chunkSize);
	const stringChunks: string[] = [];

	for (let i = 0, j = 0; i < totalChunks; ++i, j += chunkSize) {
		stringChunks[i] = value.substr(j, chunkSize);
	}

	let counter = 0;
	return new Readable({
		read: function () {
			if (throwError) {
				this.emit('error', new Error(readError));
			}

			let res: string;
			let canPush = true;
			while (canPush && (res = stringChunks[counter++])) {
				canPush = this.push(res);
			}

			// EOS
			if (!res) {
				this.push(null);
			}
		},
		encoding: 'utf8'
	});
}

suite('Extfs', () => {

	test('mkdirp', function (done) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);

		mkdirp(newDir, 493, error => {
			if (error) {
				return done(error);
			}

			assert.ok(fs.existsSync(newDir));

			extfs.del(parentDir, os.tmpdir(), done, ignore);
		}); // 493 = 0755
	});

	test('stat link', function (done) {
		if (isWindows) {
			// Symlinks are not the same on win, and we can not create them programitically without admin privileges
			return done();
		}

		const id1 = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id1);
		const directory = path.join(parentDir, 'extfs', id1);

		const id2 = uuid.generateUuid();
		const symbolicLink = path.join(parentDir, 'extfs', id2);

		mkdirp(directory, 493, error => {
			if (error) {
				return done(error);
			}

			fs.symlinkSync(directory, symbolicLink);

			extfs.statLink(directory, (error, statAndIsLink) => {
				if (error) {
					return done(error);
				}

				assert.ok(!statAndIsLink.isSymbolicLink);

				extfs.statLink(symbolicLink, (error, statAndIsLink) => {
					if (error) {
						return done(error);
					}

					assert.ok(statAndIsLink.isSymbolicLink);
					extfs.delSync(directory);
					done();
				});
			});
		});
	});

	test('delSync - swallows file not found error', function () {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);

		extfs.delSync(newDir);

		assert.ok(!fs.existsSync(newDir));
	});

	test('delSync - simple', function (done) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);

		mkdirp(newDir, 493, error => {
			if (error) {
				return done(error);
			}

			fs.writeFileSync(path.join(newDir, 'somefile.txt'), 'Contents');
			fs.writeFileSync(path.join(newDir, 'someOtherFile.txt'), 'Contents');

			extfs.delSync(newDir);

			assert.ok(!fs.existsSync(newDir));
			done();
		}); // 493 = 0755
	});

	test('delSync - recursive folder structure', function (done) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);

		mkdirp(newDir, 493, error => {
			if (error) {
				return done(error);
			}

			fs.writeFileSync(path.join(newDir, 'somefile.txt'), 'Contents');
			fs.writeFileSync(path.join(newDir, 'someOtherFile.txt'), 'Contents');

			fs.mkdirSync(path.join(newDir, 'somefolder'));
			fs.writeFileSync(path.join(newDir, 'somefolder', 'somefile.txt'), 'Contents');

			extfs.delSync(newDir);

			assert.ok(!fs.existsSync(newDir));
			done();
		}); // 493 = 0755
	});

	test('copy, move and delete', function (done) {
		const id = uuid.generateUuid();
		const id2 = uuid.generateUuid();
		const sourceDir = require.toUrl('./fixtures');
		const parentDir = path.join(os.tmpdir(), 'vsctests', 'extfs');
		const targetDir = path.join(parentDir, id);
		const targetDir2 = path.join(parentDir, id2);

		extfs.copy(sourceDir, targetDir, error => {
			if (error) {
				return done(error);
			}

			assert.ok(fs.existsSync(targetDir));
			assert.ok(fs.existsSync(path.join(targetDir, 'index.html')));
			assert.ok(fs.existsSync(path.join(targetDir, 'site.css')));
			assert.ok(fs.existsSync(path.join(targetDir, 'examples')));
			assert.ok(fs.statSync(path.join(targetDir, 'examples')).isDirectory());
			assert.ok(fs.existsSync(path.join(targetDir, 'examples', 'small.jxs')));

			extfs.mv(targetDir, targetDir2, error => {
				if (error) {
					return done(error);
				}

				assert.ok(!fs.existsSync(targetDir));
				assert.ok(fs.existsSync(targetDir2));
				assert.ok(fs.existsSync(path.join(targetDir2, 'index.html')));
				assert.ok(fs.existsSync(path.join(targetDir2, 'site.css')));
				assert.ok(fs.existsSync(path.join(targetDir2, 'examples')));
				assert.ok(fs.statSync(path.join(targetDir2, 'examples')).isDirectory());
				assert.ok(fs.existsSync(path.join(targetDir2, 'examples', 'small.jxs')));

				extfs.mv(path.join(targetDir2, 'index.html'), path.join(targetDir2, 'index_moved.html'), error => {
					if (error) {
						return done(error);
					}

					assert.ok(!fs.existsSync(path.join(targetDir2, 'index.html')));
					assert.ok(fs.existsSync(path.join(targetDir2, 'index_moved.html')));

					extfs.del(parentDir, os.tmpdir(), error => {
						if (error) {
							return done(error);
						}
					}, error => {
						if (error) {
							return done(error);
						}
						assert.ok(!fs.existsSync(parentDir));
						done();
					});
				});
			});
		});
	});

	test('readdir', function (done) {
		if (strings.canNormalize && typeof process.versions['electron'] !== 'undefined' /* needs electron */) {
			const id = uuid.generateUuid();
			const parentDir = path.join(os.tmpdir(), 'vsctests', id);
			const newDir = path.join(parentDir, 'extfs', id, 'öäü');

			mkdirp(newDir, 493, error => {
				if (error) {
					return done(error);
				}

				assert.ok(fs.existsSync(newDir));

				extfs.readdir(path.join(parentDir, 'extfs', id), (error, children) => {
					assert.equal(children.some(n => n === 'öäü'), true); // Mac always converts to NFD, so

					extfs.del(parentDir, os.tmpdir(), done, ignore);
				});
			}); // 493 = 0755
		} else {
			done();
		}
	});

	test('writeFileAndFlush (string)', function (done) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);
		const testFile = path.join(newDir, 'flushed.txt');

		mkdirp(newDir, 493, error => {
			if (error) {
				return done(error);
			}

			assert.ok(fs.existsSync(newDir));

			extfs.writeFileAndFlush(testFile, 'Hello World', null, error => {
				if (error) {
					return done(error);
				}

				assert.equal(fs.readFileSync(testFile), 'Hello World');

				const largeString = (new Array(100 * 1024)).join('Large String\n');

				extfs.writeFileAndFlush(testFile, largeString, null, error => {
					if (error) {
						return done(error);
					}

					assert.equal(fs.readFileSync(testFile), largeString);

					extfs.del(parentDir, os.tmpdir(), done, ignore);
				});
			});
		});
	});

	test('writeFileAndFlush (stream)', function (done) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);
		const testFile = path.join(newDir, 'flushed.txt');

		mkdirp(newDir, 493, error => {
			if (error) {
				return done(error);
			}

			assert.ok(fs.existsSync(newDir));

			extfs.writeFileAndFlush(testFile, toReadable('Hello World'), null, error => {
				if (error) {
					return done(error);
				}

				assert.equal(fs.readFileSync(testFile), 'Hello World');

				const largeString = (new Array(100 * 1024)).join('Large String\n');

				extfs.writeFileAndFlush(testFile, toReadable(largeString), null, error => {
					if (error) {
						return done(error);
					}

					assert.equal(fs.readFileSync(testFile), largeString);

					extfs.del(parentDir, os.tmpdir(), done, ignore);
				});
			});
		});
	});

	test('writeFileAndFlush (file stream)', function (done) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const sourceFile = require.toUrl('./fixtures/index.html');
		const newDir = path.join(parentDir, 'extfs', id);
		const testFile = path.join(newDir, 'flushed.txt');

		mkdirp(newDir, 493, error => {
			if (error) {
				return done(error);
			}

			assert.ok(fs.existsSync(newDir));

			extfs.writeFileAndFlush(testFile, fs.createReadStream(sourceFile), null, error => {
				if (error) {
					return done(error);
				}

				assert.equal(fs.readFileSync(testFile).toString(), fs.readFileSync(sourceFile).toString());

				extfs.del(parentDir, os.tmpdir(), done, ignore);
			});
		});
	});

	test('writeFileAndFlush (string, error handling)', function (done) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);
		const testFile = path.join(newDir, 'flushed.txt');

		mkdirp(newDir, 493, error => {
			if (error) {
				return done(error);
			}

			assert.ok(fs.existsSync(newDir));

			fs.mkdirSync(testFile); // this will trigger an error because testFile is now a directory!

			extfs.writeFileAndFlush(testFile, 'Hello World', null, error => {
				if (!error) {
					return done(new Error('Expected error for writing to readonly file'));
				}

				extfs.del(parentDir, os.tmpdir(), done, ignore);
			});
		});
	});

	test('writeFileAndFlush (stream, error handling EISDIR)', function (done) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);
		const testFile = path.join(newDir, 'flushed.txt');

		mkdirp(newDir, 493, error => {
			if (error) {
				return done(error);
			}

			assert.ok(fs.existsSync(newDir));

			fs.mkdirSync(testFile); // this will trigger an error because testFile is now a directory!

			const readable = toReadable('Hello World');
			extfs.writeFileAndFlush(testFile, readable, null, error => {
				if (!error || (<any>error).code !== 'EISDIR') {
					return done(new Error('Expected EISDIR error for writing to folder but got: ' + (error ? (<any>error).code : 'no error')));
				}

				// verify that the stream is still consumable (for https://github.com/Microsoft/vscode/issues/42542)
				assert.equal(readable.read(), 'Hello World');

				extfs.del(parentDir, os.tmpdir(), done, ignore);
			});
		});
	});

	test('writeFileAndFlush (stream, error handling READERROR)', function (done) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);
		const testFile = path.join(newDir, 'flushed.txt');

		mkdirp(newDir, 493, error => {
			if (error) {
				return done(error);
			}

			assert.ok(fs.existsSync(newDir));

			extfs.writeFileAndFlush(testFile, toReadable('Hello World', true /* throw error */), null, error => {
				if (!error || error.message !== readError) {
					return done(new Error('Expected error for writing to folder'));
				}

				extfs.del(parentDir, os.tmpdir(), done, ignore);
			});
		});
	});

	test('writeFileAndFlush (stream, error handling EACCES)', function (done) {
		if (isLinux) {
			return done(); // somehow this test fails on Linux in our TFS builds
		}

		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);
		const testFile = path.join(newDir, 'flushed.txt');

		mkdirp(newDir, 493, error => {
			if (error) {
				return done(error);
			}

			assert.ok(fs.existsSync(newDir));

			fs.writeFileSync(testFile, '');
			fs.chmodSync(testFile, 33060); // make readonly

			extfs.writeFileAndFlush(testFile, toReadable('Hello World'), null, error => {
				if (!error || !((<any>error).code !== 'EACCES' || (<any>error).code !== 'EPERM')) {
					return done(new Error('Expected EACCES/EPERM error for writing to folder but got: ' + (error ? (<any>error).code : 'no error')));
				}

				extfs.del(parentDir, os.tmpdir(), done, ignore);
			});
		});
	});

	test('writeFileAndFlush (file stream, error handling)', function (done) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const sourceFile = require.toUrl('./fixtures/index.html');
		const newDir = path.join(parentDir, 'extfs', id);
		const testFile = path.join(newDir, 'flushed.txt');

		mkdirp(newDir, 493, error => {
			if (error) {
				return done(error);
			}

			assert.ok(fs.existsSync(newDir));

			fs.mkdirSync(testFile); // this will trigger an error because testFile is now a directory!

			extfs.writeFileAndFlush(testFile, fs.createReadStream(sourceFile), null, error => {
				if (!error) {
					return done(new Error('Expected error for writing to folder'));
				}

				extfs.del(parentDir, os.tmpdir(), done, ignore);
			});
		});
	});

	test('writeFileAndFlushSync', function (done) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);
		const testFile = path.join(newDir, 'flushed.txt');

		mkdirp(newDir, 493, error => {
			if (error) {
				return done(error);
			}

			assert.ok(fs.existsSync(newDir));

			extfs.writeFileAndFlushSync(testFile, 'Hello World', null);
			assert.equal(fs.readFileSync(testFile), 'Hello World');

			const largeString = (new Array(100 * 1024)).join('Large String\n');

			extfs.writeFileAndFlushSync(testFile, largeString, null);
			assert.equal(fs.readFileSync(testFile), largeString);

			extfs.del(parentDir, os.tmpdir(), done, ignore);
		});
	});

	test('realcase', (done) => {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);

		mkdirp(newDir, 493, error => {

			// assume case insensitive file system
			if (process.platform === 'win32' || process.platform === 'darwin') {
				const upper = newDir.toUpperCase();
				const real = extfs.realcaseSync(upper);

				if (real) { // can be null in case of permission errors
					assert.notEqual(real, upper);
					assert.equal(real.toUpperCase(), upper);
					assert.equal(real, newDir);
				}
			}

			// linux, unix, etc. -> assume case sensitive file system
			else {
				const real = extfs.realcaseSync(newDir);
				assert.equal(real, newDir);
			}

			extfs.del(parentDir, os.tmpdir(), done, ignore);
		});
	});

	test('realpath', (done) => {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);

		mkdirp(newDir, 493, error => {

			extfs.realpath(newDir, (error, realpath) => {
				assert.ok(realpath);
				assert.ok(!error);

				extfs.del(parentDir, os.tmpdir(), done, ignore);
			});
		});
	});

	test('realpathSync', (done) => {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);

		mkdirp(newDir, 493, error => {
			let realpath: string;
			try {
				realpath = extfs.realpathSync(newDir);
			} catch (error) {
				assert.ok(!error);
			}
			assert.ok(realpath);

			extfs.del(parentDir, os.tmpdir(), done, ignore);
		});
	});
});
