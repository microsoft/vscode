/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import path = require('path');
import assert = require('assert');

import {join, normalize} from 'vs/base/common/paths';
import {LineMatch} from 'vs/platform/search/common/search';

import {FileWalker, Engine as FileSearchEngine} from 'vs/workbench/services/search/node/fileSearch';
import {IRawFileMatch} from 'vs/workbench/services/search/node/search';
import {Engine as TextSearchEngine} from 'vs/workbench/services/search/node/textSearch';

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
			assert.equal(count, 6);
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
			assert.equal(count, 12);
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
			assert.equal(count, 7);
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
			assert.equal(count, 7);
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
			assert.equal(count, 7);
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
			assert.equal(count, 11);
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

	test('Text: GameOfLife', function (done: () => void) {
		let c = 0;
		let config = {
			rootFolders: rootfolders(),
			filePattern: '*.js',
			contentPattern: { pattern: 'GameOfLife', modifiers: 'i' }
		};

		let engine = new TextSearchEngine(config, new FileWalker(config));

		engine.search((result) => {
			if (result && result.lineMatches) {
				c += count(result.lineMatches);
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

		let engine = new TextSearchEngine(config, new FileWalker(config));

		engine.search((result) => {
			if (result && result.lineMatches) {
				c += count(result.lineMatches);
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

		let engine = new TextSearchEngine(config, new FileWalker(config));

		engine.search((result) => {
			if (result && result.lineMatches) {
				c += count(result.lineMatches);
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

		let engine = new TextSearchEngine(config, new FileWalker(config));

		engine.search((result) => {
			if (result && result.lineMatches) {
				c += count(result.lineMatches);
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(c, 2);
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

		let engine = new TextSearchEngine(config, new FileWalker(config));

		engine.search((result) => {
			if (result && result.lineMatches) {
				c += count(result.lineMatches);
			}
		}, (result) => { }, (error) => {
			assert.ok(!error);
			assert.equal(c, 748);
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

		let engine = new TextSearchEngine(config, new FileWalker(config));

		engine.search((result) => {
			if (result && result.lineMatches) {
				c += count(result.lineMatches);
			}
		}, (result) => { }, (error) => {
			assert.ok(!error);
			assert.equal(c, 366);
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

		let engine = new TextSearchEngine(config, new FileWalker(config));

		engine.search((result) => {
			if (result && result.lineMatches) {
				c += count(result.lineMatches);
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

		let engine = new TextSearchEngine(config, new FileWalker(config));

		engine.search((result) => {
			if (result && result.lineMatches) {
				c += count(result.lineMatches);
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

		let engine = new TextSearchEngine(config, new FileWalker(config));

		engine.search((result) => {
			if (result && result.lineMatches) {
				c += count(result.lineMatches);
			}
		}, (result) => { }, (error) => {
			assert.ok(!error);
			assert.equal(c, 520);
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

		let engine = new TextSearchEngine(config, new FileWalker(config));

		engine.search((result) => {
			if (result && result.lineMatches) {
				c += count(result.lineMatches);
			}
		}, (result) => { }, (error) => {
			assert.ok(!error);
			assert.equal(c, 0);
			done();
		});
	});
});