/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import path = require('path');
import assert = require('assert');

import * as glob from 'vs/base/common/glob';
import { join, normalize } from 'vs/base/common/paths';
import * as platform from 'vs/base/common/platform';
import { LineMatch } from 'vs/platform/search/common/search';

import { FileWalker, Engine as FileSearchEngine } from 'vs/workbench/services/search/node/fileSearch';
import { IRawFileMatch, ISerializedFileMatch } from 'vs/workbench/services/search/node/search';
import { Engine as TextSearchEngine } from 'vs/workbench/services/search/node/textSearch';
import { TextSearchWorkerProvider } from 'vs/workbench/services/search/node/textSearchWorkerProvider';

function countAll(matches: ISerializedFileMatch[]): number {
	return matches.reduce((acc, m) => acc + count(m.lineMatches), 0);
}

function count(lineMatches: LineMatch[]): number {
	let count = 0;
	if (lineMatches) {
		for (let i = 0; i < lineMatches.length; i++) {
			let line = lineMatches[i];
			let wordMatches = line.offsetAndLengths;
			count += wordMatches.length;
		}
	}

	return count;
}

function rootfolders() {
	return [path.normalize(require.toUrl('./fixtures'))];
}

const textSearchWorkerProvider = new TextSearchWorkerProvider();

suite('Search', () => {

	test('Files: *.js', function (done: () => void) {
		let engine = new FileSearchEngine({
			rootFolders: rootfolders(),
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
			rootFolders: rootfolders(),
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
			rootFolders: rootfolders(),
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

	test('Files: NPE (CamelCase)', function (done: () => void) {
		let engine = new FileSearchEngine({
			rootFolders: rootfolders(),
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
			rootFolders: rootfolders(),
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
			rootFolders: rootfolders(),
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
			rootFolders: rootfolders(),
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
			rootFolders: rootfolders(),
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
			rootFolders: rootfolders(),
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
			rootFolders: rootfolders(),
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
			rootFolders: rootfolders(),
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

	test('Files: Unicode and Spaces', function (done: () => void) {
		let engine = new FileSearchEngine({
			rootFolders: rootfolders(),
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
			rootFolders: rootfolders(),
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
			rootFolders: rootfolders(),
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
			rootFolders: rootfolders(),
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
			rootFolders: rootfolders(),
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
			rootFolders: rootfolders(),
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
			rootFolders: [],
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
			rootFolders: [],
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
			rootFolders: [],
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

	test('Find: exclude subfolder', function (done: () => void) {
		if (platform.isWindows) {
			done();
			return;
		}

		const walker = new FileWalker({ rootFolders: rootfolders() });
		const file0 = './more/file.txt';
		const file1 = './examples/subfolder/subfile.txt';

		const cmd1 = walker.spawnFindCmd(rootfolders()[0], glob.parse({ '**/something': true }));
		walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
			assert.equal(err1, null);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file1), -1, stdout1);

			const cmd2 = walker.spawnFindCmd(rootfolders()[0], glob.parse({ '**/subfolder': true }));
			walker.readStdout(cmd2, 'utf8', (err2, stdout2) => {
				assert.equal(err2, null);
				assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
				assert.strictEqual(stdout2.split('\n').indexOf(file1), -1, stdout2);
				done();
			});
		});
	});

	test('Find: exclude multiple folders', function (done: () => void) {
		if (platform.isWindows) {
			done();
			return;
		}

		const walker = new FileWalker({ rootFolders: rootfolders() });
		const file0 = './index.html';
		const file1 = './examples/small.js';
		const file2 = './more/file.txt';

		const cmd1 = walker.spawnFindCmd(rootfolders()[0], glob.parse({ '**/something': true }));
		walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
			assert.equal(err1, null);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file1), -1, stdout1);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file2), -1, stdout1);

			const cmd2 = walker.spawnFindCmd(rootfolders()[0], glob.parse({ '{**/examples,**/more}': true }));
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

		const walker = new FileWalker({ rootFolders: rootfolders() });
		const file0 = './examples/company.js';
		const file1 = './examples/subfolder/subfile.txt';

		const cmd1 = walker.spawnFindCmd(rootfolders()[0], glob.parse({ '**/examples/something': true }));
		walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
			assert.equal(err1, null);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file1), -1, stdout1);

			const cmd2 = walker.spawnFindCmd(rootfolders()[0], glob.parse({ '**/examples/subfolder': true }));
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

		const walker = new FileWalker({ rootFolders: rootfolders() });
		const file0 = './examples/subfolder/subfile.txt';
		const file1 = './examples/subfolder/anotherfolder/anotherfile.txt';

		const cmd1 = walker.spawnFindCmd(rootfolders()[0], glob.parse({ '**/subfolder/something': true }));
		walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
			assert.equal(err1, null);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file1), -1, stdout1);

			const cmd2 = walker.spawnFindCmd(rootfolders()[0], glob.parse({ '**/subfolder/anotherfolder': true }));
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

		const walker = new FileWalker({ rootFolders: rootfolders() });
		const file0 = './examples/company.js';
		const file1 = './examples/subfolder/subfile.txt';

		const cmd1 = walker.spawnFindCmd(rootfolders()[0], glob.parse({ 'examples/something': true }));
		walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
			assert.equal(err1, null);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
			assert.notStrictEqual(stdout1.split('\n').indexOf(file1), -1, stdout1);

			const cmd2 = walker.spawnFindCmd(rootfolders()[0], glob.parse({ 'examples/subfolder': true }));
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

		const walker = new FileWalker({ rootFolders: rootfolders() });
		const filesIn = [
			'./examples/subfolder/subfile.txt',
			'./examples/company.js',
			'./index.html'
		];
		const filesOut = [
			'./examples/subfolder/anotherfolder/anotherfile.txt',
			'./more/file.txt'
		];

		const cmd1 = walker.spawnFindCmd(rootfolders()[0], glob.parse({
			'**/subfolder/anotherfolder': true,
			'**/something/else': true,
			'**/more': true,
			'**/andmore': true
		}));
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

	test('Text: GameOfLife', function (done: () => void) {
		let c = 0;
		let config = {
			rootFolders: rootfolders(),
			filePattern: '*.js',
			contentPattern: { pattern: 'GameOfLife', modifiers: 'i' }
		};

		let engine = new TextSearchEngine(config, new FileWalker(config), textSearchWorkerProvider);

		engine.search((result) => {
			if (result) {
				c += countAll(result);
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(c, 4);
			done();
		});
	});

	test('Text: GameOfLife (RegExp)', function (done: () => void) {
		let c = 0;
		let config = {
			rootFolders: rootfolders(),
			filePattern: '*.js',
			contentPattern: { pattern: 'Game.?fL\\w?fe', isRegExp: true }
		};

		let engine = new TextSearchEngine(config, new FileWalker(config), textSearchWorkerProvider);

		engine.search((result) => {
			if (result) {
				c += countAll(result);
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(c, 4);
			done();
		});
	});

	test('Text: GameOfLife (Word Match, Case Sensitive)', function (done: () => void) {
		let c = 0;
		let config = {
			rootFolders: rootfolders(),
			filePattern: '*.js',
			contentPattern: { pattern: 'GameOfLife', isWordMatch: true, isCaseSensitive: true }
		};

		let engine = new TextSearchEngine(config, new FileWalker(config), textSearchWorkerProvider);

		engine.search((result) => {
			if (result) {
				c += countAll(result);
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(c, 4);
			done();
		});
	});

	test('Text: Helvetica (UTF 16)', function (done: () => void) {
		let c = 0;
		let config = {
			rootFolders: rootfolders(),
			filePattern: '*.css',
			contentPattern: { pattern: 'Helvetica', modifiers: 'i' }
		};

		let engine = new TextSearchEngine(config, new FileWalker(config), textSearchWorkerProvider);

		engine.search((result) => {
			if (result) {
				c += countAll(result);
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(c, 3);
			done();
		});
	});

	test('Text: e', function (done: () => void) {
		let c = 0;
		let config = {
			rootFolders: rootfolders(),
			filePattern: '*.*',
			contentPattern: { pattern: 'e', modifiers: 'i' }
		};

		let engine = new TextSearchEngine(config, new FileWalker(config), textSearchWorkerProvider);

		engine.search((result) => {
			if (result) {
				c += countAll(result);
			}
		}, (result) => { }, (error) => {
			assert.ok(!error);
			assert.equal(c, 776);
			done();
		});
	});

	test('Text: e (with excludes)', function (done: () => void) {
		let c = 0;
		let config: any = {
			rootFolders: rootfolders(),
			filePattern: '*.*',
			contentPattern: { pattern: 'e', modifiers: 'i' },
			excludePattern: { '**/examples': true }
		};

		let engine = new TextSearchEngine(config, new FileWalker(config), textSearchWorkerProvider);

		engine.search((result) => {
			if (result) {
				c += countAll(result);
			}
		}, (result) => { }, (error) => {
			assert.ok(!error);
			assert.equal(c, 394);
			done();
		});
	});

	test('Text: e (with includes)', function (done: () => void) {
		let c = 0;
		let config: any = {
			rootFolders: rootfolders(),
			filePattern: '*.*',
			contentPattern: { pattern: 'e', modifiers: 'i' },
			includePattern: { '**/examples/**': true }
		};

		let engine = new TextSearchEngine(config, new FileWalker(config), textSearchWorkerProvider);

		engine.search((result) => {
			if (result) {
				c += countAll(result);
			}
		}, (result) => { }, (error) => {
			assert.ok(!error);
			assert.equal(c, 382);
			done();
		});
	});

	test('Text: e (with includes and exclude)', function (done: () => void) {
		let c = 0;
		let config: any = {
			rootFolders: rootfolders(),
			filePattern: '*.*',
			contentPattern: { pattern: 'e', modifiers: 'i' },
			includePattern: { '**/examples/**': true },
			excludePattern: { '**/examples/small.js': true }
		};

		let engine = new TextSearchEngine(config, new FileWalker(config), textSearchWorkerProvider);

		engine.search((result) => {
			if (result) {
				c += countAll(result);
			}
		}, (result) => { }, (error) => {
			assert.ok(!error);
			assert.equal(c, 361);
			done();
		});
	});

	test('Text: a (capped)', function (done: () => void) {
		let c = 0;
		let config = {
			rootFolders: rootfolders(),
			filePattern: '*.*',
			contentPattern: { pattern: 'a', modifiers: 'i' },
			maxResults: 520
		};

		let engine = new TextSearchEngine(config, new FileWalker(config), textSearchWorkerProvider);

		engine.search((result) => {
			if (result) {
				c += countAll(result);
			}
		}, (result) => { }, (error) => {
			assert.ok(!error);

			// Search can go over the maxResults because it doesn't trim the results from its worker processes to the exact max size.
			// But the worst-case scenario should be 2*max-1
			assert.ok(c < 520 * 2);
			done();
		});
	});

	test('Text: a (no results)', function (done: () => void) {
		let c = 0;
		let config = {
			rootFolders: rootfolders(),
			filePattern: '*.*',
			contentPattern: { pattern: 'ahsogehtdas', modifiers: 'i' }
		};

		let engine = new TextSearchEngine(config, new FileWalker(config), textSearchWorkerProvider);

		engine.search((result) => {
			if (result) {
				c += countAll(result);
			}
		}, (result) => { }, (error) => {
			assert.ok(!error);
			assert.equal(c, 0);
			done();
		});
	});
});