/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import path = require('path');
import assert = require('assert');

import { LineMatch } from 'vs/platform/search/common/search';

import { FileWalker } from 'vs/workbench/services/search/node/fileSearch';
import { ISerializedFileMatch } from 'vs/workbench/services/search/node/search';
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
suite('Search-integration', () => {
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