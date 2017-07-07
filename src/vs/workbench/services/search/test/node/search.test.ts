/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import path = require('path');
import assert = require('assert');

import { join, normalize } from 'vs/base/common/paths';
import * as platform from 'vs/base/common/platform';

import { FileWalker, Engine as FileSearchEngine } from 'vs/workbench/services/search/node/fileSearch';
import { IRawFileMatch, IFolderSearch } from 'vs/workbench/services/search/node/search';

const TEST_FIXTURES = path.normalize(require.toUrl('./fixtures'));
const EXAMPLES_FIXTURES = path.join(TEST_FIXTURES, 'examples');
const MORE_FIXTURES = path.join(TEST_FIXTURES, 'more');
const TEST_ROOT_FOLDER: IFolderSearch = { folder: TEST_FIXTURES };
const ROOT_FOLDER_QUERY: IFolderSearch[] = [
	TEST_ROOT_FOLDER
];

const MULTIROOT_QUERIES: IFolderSearch[] = [
	{ folder: EXAMPLES_FIXTURES },
	{ folder: MORE_FIXTURES }
];

suite('FileSearchEngine', () => {

	test('Files: *.js', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: '*.js'
		});

		let count = 0;
		engine.search((result) => {
			if (result) {
				count++;
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 4);
			done();
		});
	});

	test('Files: examples/com*', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: normalize(join('examples', 'com*'), true)
		});

		let count = 0;
		engine.search((result) => {
			if (result) {
				count++;
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 1);
			done();
		});
	});

	test('Files: examples (fuzzy)', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: 'xl'
		});

		let count = 0;
		engine.search((result) => {
			if (result) {
				count++;
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 7);
			done();
		});
	});

	test('Files: multiroot', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: MULTIROOT_QUERIES,
			filePattern: 'file'
		});

		let count = 0;
		engine.search((result) => {
			if (result) {
				count++;
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 3);
			done();
		});
	});

	test('Files: NPE (CamelCase)', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: 'NullPE'
		});

		let count = 0;
		engine.search((result) => {
			if (result) {
				count++;
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 1);
			done();
		});
	});

	test('Files: *.*', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: '*.*'
		});

		let count = 0;
		engine.search((result) => {
			if (result) {
				count++;
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 14);
			done();
		});
	});

	test('Files: *.as', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: '*.as'
		});

		let count = 0;
		engine.search((result) => {
			if (result) {
				count++;
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 0);
			done();
		});
	});

	test('Files: *.* without derived', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: 'site.*',
			excludePattern: { '**/*.css': { 'when': '$(basename).less' } }
		});

		let count = 0;
		let res: IRawFileMatch;
		engine.search((result) => {
			if (result) {
				count++;
			}
			res = result;
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 1);
			assert.strictEqual(path.basename(res.relativePath), 'site.less');
			done();
		});
	});

	test('Files: *.* exclude folder without wildcard', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: '*.*',
			excludePattern: { 'examples': true }
		});

		let count = 0;
		engine.search((result) => {
			if (result) {
				count++;
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 8);
			done();
		});
	});

	test('Files: *.* exclude folder with leading wildcard', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: '*.*',
			excludePattern: { '**/examples': true }
		});

		let count = 0;
		engine.search((result) => {
			if (result) {
				count++;
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 8);
			done();
		});
	});

	test('Files: *.* exclude folder with trailing wildcard', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: '*.*',
			excludePattern: { 'examples/**': true }
		});

		let count = 0;
		engine.search((result) => {
			if (result) {
				count++;
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 8);
			done();
		});
	});

	test('Files: *.* exclude with unicode', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: '*.*',
			excludePattern: { '**/üm laut汉语': true }
		});

		let count = 0;
		engine.search((result) => {
			if (result) {
				count++;
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 13);
			done();
		});
	});

	test('Files: multiroot with exclude', function (done: () => void) {
		const folderQueries: IFolderSearch[] = [
			{
				folder: EXAMPLES_FIXTURES,
				excludePattern: {
					'**/anotherfile.txt': true
				}
			},
			{
				folder: MORE_FIXTURES,
				excludePattern: {
					'**/file.txt': true
				}
			}
		];

		const engine = new FileSearchEngine({
			folderQueries,
			filePattern: '*'
		});

		let count = 0;
		engine.search((result) => {
			if (result) {
				count++;
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 5);
			done();
		});
	});

	test('Files: Unicode and Spaces', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: '汉语'
		});

		let count = 0;
		let res: IRawFileMatch;
		engine.search((result) => {
			if (result) {
				count++;
			}
			res = result;
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 1);
			assert.equal(path.basename(res.relativePath), '汉语.txt');
			done();
		});
	});

	test('Files: no results', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: 'nofilematch'
		});

		let count = 0;
		engine.search((result) => {
			if (result) {
				count++;
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 0);
			done();
		});
	});

	test('Files: absolute path to file ignores excludes', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: path.normalize(path.join(require.toUrl('./fixtures'), 'site.css')),
			excludePattern: { '**/*.css': true }
		});

		let count = 0;
		let res: IRawFileMatch;
		engine.search((result) => {
			if (result) {
				count++;
			}
			res = result;
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 1);
			assert.equal(path.basename(res.relativePath), 'site.css');
			done();
		});
	});

	test('Files: relative path matched once', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: path.normalize(path.join('examples', 'company.js'))
		});

		let count = 0;
		let res: IRawFileMatch;
		engine.search((result) => {
			if (result) {
				count++;
			}
			res = result;
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 1);
			assert.equal(path.basename(res.relativePath), 'company.js');
			done();
		});
	});

	test('Files: relative path to file ignores excludes', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: path.normalize(path.join('examples', 'company.js')),
			excludePattern: { '**/*.js': true }
		});

		let count = 0;
		let res: IRawFileMatch;
		engine.search((result) => {
			if (result) {
				count++;
			}
			res = result;
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 1);
			assert.equal(path.basename(res.relativePath), 'company.js');
			done();
		});
	});

	test('Files: Include pattern, single files', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: ROOT_FOLDER_QUERY,
			includePattern: {
				'site.css': true,
				'examples/company.js': true,
				'examples/subfolder/subfile.txt': true
			}
		});

		let res: IRawFileMatch[] = [];
		engine.search((result) => {
			res.push(result);
		}, () => { }, (error) => {
			assert.ok(!error);
			const basenames = res.map(r => path.basename(r.relativePath));
			assert.ok(basenames.indexOf('site.css') !== -1, `site.css missing in ${JSON.stringify(basenames)}`);
			assert.ok(basenames.indexOf('company.js') !== -1, `company.js missing in ${JSON.stringify(basenames)}`);
			assert.ok(basenames.indexOf('subfile.txt') !== -1, `subfile.txt missing in ${JSON.stringify(basenames)}`);
			done();
		});
	});

	test('Files: extraFiles only', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: [],
			extraFiles: [
				path.normalize(path.join(require.toUrl('./fixtures'), 'site.css')),
				path.normalize(path.join(require.toUrl('./fixtures'), 'examples', 'company.js')),
				path.normalize(path.join(require.toUrl('./fixtures'), 'index.html'))
			],
			filePattern: '*.js'
		});

		let count = 0;
		let res: IRawFileMatch;
		engine.search((result) => {
			if (result) {
				count++;
			}
			res = result;
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 1);
			assert.equal(path.basename(res.relativePath), 'company.js');
			done();
		});
	});

	test('Files: extraFiles only (with include)', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: [],
			extraFiles: [
				path.normalize(path.join(require.toUrl('./fixtures'), 'site.css')),
				path.normalize(path.join(require.toUrl('./fixtures'), 'examples', 'company.js')),
				path.normalize(path.join(require.toUrl('./fixtures'), 'index.html'))
			],
			filePattern: '*.*',
			includePattern: { '**/*.css': true }
		});

		let count = 0;
		let res: IRawFileMatch;
		engine.search((result) => {
			if (result) {
				count++;
			}
			res = result;
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 1);
			assert.equal(path.basename(res.relativePath), 'site.css');
			done();
		});
	});

	test('Files: extraFiles only (with exclude)', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: [],
			extraFiles: [
				path.normalize(path.join(require.toUrl('./fixtures'), 'site.css')),
				path.normalize(path.join(require.toUrl('./fixtures'), 'examples', 'company.js')),
				path.normalize(path.join(require.toUrl('./fixtures'), 'index.html'))
			],
			filePattern: '*.*',
			excludePattern: { '**/*.css': true }
		});

		let count = 0;
		engine.search((result) => {
			if (result) {
				count++;
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 2);
			done();
		});
	});

	test('Files: no dupes in nested folders', function (done: () => void) {
		let engine = new FileSearchEngine({
			folderQueries: [
				{ folder: EXAMPLES_FIXTURES },
				{ folder: path.join(EXAMPLES_FIXTURES, 'subfolder') }
			],
			filePattern: 'subfile.txt'
		});

		let count = 0;
		engine.search((result) => {
			if (result) {
				count++;
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 1);
			done();
		});
	});
});

suite('FileWalker', () => {

	test('Find: exclude subfolder', function (done: () => void) {
		if (platform.isWindows) {
			done();
			return;
		}

		const file0 = './more/file.txt';
		const file1 = './examples/subfolder/subfile.txt';

		const walker = new FileWalker({ folderQueries: ROOT_FOLDER_QUERY, excludePattern: { '**/something': true } });
		const cmd1 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
		walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
			assert.equal(err1, null);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file1), -1, stdout1);

			const walker = new FileWalker({ folderQueries: ROOT_FOLDER_QUERY, excludePattern: { '**/subfolder': true } });
			const cmd2 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
			walker.readStdout(cmd2, 'utf8', (err2, stdout2) => {
				assert.equal(err2, null);
				assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
				assert.strictEqual(stdout2.split('\n').indexOf(file1), -1, stdout2);
				done();
			});
		});
	});

	test('Find: folder excludes', function (done: () => void) {
		if (platform.isWindows) {
			done();
			return;
		}

		const folderQueries: IFolderSearch[] = [
			{
				folder: TEST_FIXTURES,
				excludePattern: { '**/subfolder': true }
			}
		];

		const file0 = './more/file.txt';
		const file1 = './examples/subfolder/subfile.txt';

		const walker = new FileWalker({ folderQueries });
		const cmd1 = walker.spawnFindCmd(folderQueries[0]);
		walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
			assert.equal(err1, null);
			assert(outputContains(stdout1, file0), stdout1);
			assert(!outputContains(stdout1, file1), stdout1);
			done();
		});
	});

	test('Find: exclude multiple folders', function (done: () => void) {
		if (platform.isWindows) {
			done();
			return;
		}

		const file0 = './index.html';
		const file1 = './examples/small.js';
		const file2 = './more/file.txt';

		const walker = new FileWalker({ folderQueries: ROOT_FOLDER_QUERY, excludePattern: { '**/something': true } });
		const cmd1 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
		walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
			assert.equal(err1, null);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file1), -1, stdout1);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file2), -1, stdout1);

			const walker = new FileWalker({ folderQueries: ROOT_FOLDER_QUERY, excludePattern: { '{**/examples,**/more}': true } });
			const cmd2 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
			walker.readStdout(cmd2, 'utf8', (err2, stdout2) => {
				assert.equal(err2, null);
				assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
				assert.strictEqual(stdout2.split('\n').indexOf(file1), -1, stdout2);
				assert.strictEqual(stdout2.split('\n').indexOf(file2), -1, stdout2);
				done();
			});
		});
	});

	test('Find: exclude folder path suffix', function (done: () => void) {
		if (platform.isWindows) {
			done();
			return;
		}

		const file0 = './examples/company.js';
		const file1 = './examples/subfolder/subfile.txt';

		const walker = new FileWalker({ folderQueries: ROOT_FOLDER_QUERY, excludePattern: { '**/examples/something': true } });
		const cmd1 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
		walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
			assert.equal(err1, null);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file1), -1, stdout1);

			const walker = new FileWalker({ folderQueries: ROOT_FOLDER_QUERY, excludePattern: { '**/examples/subfolder': true } });
			const cmd2 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
			walker.readStdout(cmd2, 'utf8', (err2, stdout2) => {
				assert.equal(err2, null);
				assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
				assert.strictEqual(stdout2.split('\n').indexOf(file1), -1, stdout2);
				done();
			});
		});
	});

	test('Find: exclude subfolder path suffix', function (done: () => void) {
		if (platform.isWindows) {
			done();
			return;
		}

		const file0 = './examples/subfolder/subfile.txt';
		const file1 = './examples/subfolder/anotherfolder/anotherfile.txt';

		const walker = new FileWalker({ folderQueries: ROOT_FOLDER_QUERY, excludePattern: { '**/subfolder/something': true } });
		const cmd1 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
		walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
			assert.equal(err1, null);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file1), -1, stdout1);

			const walker = new FileWalker({ folderQueries: ROOT_FOLDER_QUERY, excludePattern: { '**/subfolder/anotherfolder': true } });
			const cmd2 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
			walker.readStdout(cmd2, 'utf8', (err2, stdout2) => {
				assert.equal(err2, null);
				assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
				assert.strictEqual(stdout2.split('\n').indexOf(file1), -1, stdout2);
				done();
			});
		});
	});

	test('Find: exclude folder path', function (done: () => void) {
		if (platform.isWindows) {
			done();
			return;
		}

		const file0 = './examples/company.js';
		const file1 = './examples/subfolder/subfile.txt';

		const walker = new FileWalker({ folderQueries: ROOT_FOLDER_QUERY, excludePattern: { 'examples/something': true } });
		const cmd1 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
		walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
			assert.equal(err1, null);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file1), -1, stdout1);

			const walker = new FileWalker({ folderQueries: ROOT_FOLDER_QUERY, excludePattern: { 'examples/subfolder': true } });
			const cmd2 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
			walker.readStdout(cmd2, 'utf8', (err2, stdout2) => {
				assert.equal(err2, null);
				assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
				assert.strictEqual(stdout2.split('\n').indexOf(file1), -1, stdout2);
				done();
			});
		});
	});

	test('Find: exclude combination of paths', function (done: () => void) {
		if (platform.isWindows) {
			done();
			return;
		}

		const filesIn = [
			'./examples/subfolder/subfile.txt',
			'./examples/company.js',
			'./index.html'
		];
		const filesOut = [
			'./examples/subfolder/anotherfolder/anotherfile.txt',
			'./more/file.txt'
		];

		const walker = new FileWalker({
			folderQueries: ROOT_FOLDER_QUERY,
			excludePattern: {
				'**/subfolder/anotherfolder': true,
				'**/something/else': true,
				'**/more': true,
				'**/andmore': true
			}
		});
		const cmd1 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
		walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
			assert.equal(err1, null);
			for (const fileIn of filesIn) {
				assert.notStrictEqual(stdout1.split('\n').indexOf(fileIn), -1, stdout1);
			}
			for (const fileOut of filesOut) {
				assert.strictEqual(stdout1.split('\n').indexOf(fileOut), -1, stdout1);
			}
			done();
		});
	});

	function outputContains(stdout: string, ...files: string[]): boolean {
		const lines = stdout.split('\n');
		return files.every(file => lines.indexOf(file) >= 0);
	}
});