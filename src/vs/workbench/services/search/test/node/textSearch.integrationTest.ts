/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import path = require('path');
import assert = require('assert');

import { TPromise } from 'vs/base/common/winjs.base';
import { FileWalker } from 'vs/workbench/services/search/node/fileSearch';
import { ISerializedFileMatch, IRawSearch } from 'vs/workbench/services/search/node/search';
import { Engine as TextSearchEngine } from 'vs/workbench/services/search/node/textSearch';
import { RipgrepEngine } from 'vs/workbench/services/search/node/ripgrepTextSearch';
import { TextSearchWorkerProvider } from 'vs/workbench/services/search/node/textSearchWorkerProvider';

function countAll(matches: ISerializedFileMatch[]): number {
	return matches.reduce((acc, m) => acc + m.numMatches, 0);
}

function rootfolders() {
	return [path.normalize(require.toUrl('./fixtures'))];
}

const textSearchWorkerProvider = new TextSearchWorkerProvider();

function doLegacySearchTest(config: IRawSearch, expectedResultCount: number | Function): TPromise<void> {
	return new TPromise<void>(resolve => {
		let engine = new TextSearchEngine(config, new FileWalker(config), textSearchWorkerProvider);

		let c = 0;
		engine.search((result) => {
			if (result) {
				c += countAll(result);
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			if (typeof expectedResultCount === 'function') {
				assert(expectedResultCount(c));
			} else {
				assert.equal(c, expectedResultCount);
			}
			resolve(undefined);
		});
	});
}

function doRipgrepSearchTest(config: IRawSearch, expectedResultCount: number): TPromise<void> {
	return new TPromise<void>(resolve => {
		let engine = new RipgrepEngine(config);

		let c = 0;
		engine.search((result) => {
			if (result) {
				c += result.numMatches;
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(c, expectedResultCount);
			resolve(undefined);
		});
	});
}

function doSearchTest(config: IRawSearch, expectedResultCount: number, done) {
	return doLegacySearchTest(config, expectedResultCount)
		.then(() => doRipgrepSearchTest(config, expectedResultCount))
		.then(done, done);
}

suite('Search-integration', () => {
	test('Text: GameOfLife', function (done: () => void) {
		let config = {
			rootFolders: rootfolders(),
			filePattern: '*.js',
			contentPattern: { pattern: 'GameOfLife', modifiers: 'i' },
		};

		doSearchTest(config, 4, done);
	});

	test('Text: GameOfLife (RegExp)', function (done: () => void) {
		let config = {
			rootFolders: rootfolders(),
			filePattern: '*.js',
			contentPattern: { pattern: 'Game.?fL\\w?fe', isRegExp: true }
		};

		doSearchTest(config, 4, done);
	});

	test('Text: GameOfLife (Word Match, Case Sensitive)', function (done: () => void) {
		let config = {
			rootFolders: rootfolders(),
			filePattern: '*.js',
			contentPattern: { pattern: 'GameOfLife', isWordMatch: true, isCaseSensitive: true }
		};

		doSearchTest(config, 4, done);
	});

	test('Text: Helvetica (UTF 16)', function (done: () => void) {
		let config = {
			rootFolders: rootfolders(),
			filePattern: '*.css',
			contentPattern: { pattern: 'Helvetica', modifiers: 'i' }
		};

		doSearchTest(config, 3, done);
	});

	test('Text: e', function (done: () => void) {
		let config = {
			rootFolders: rootfolders(),
			filePattern: '*.*',
			contentPattern: { pattern: 'e', modifiers: 'i' }
		};

		doSearchTest(config, 776, done);
	});

	test('Text: e (with excludes)', function (done: () => void) {
		let config: any = {
			rootFolders: rootfolders(),
			filePattern: '*.*',
			contentPattern: { pattern: 'e', modifiers: 'i' },
			excludePattern: { '**/examples': true }
		};

		doSearchTest(config, 394, done);
	});

	test('Text: e (with includes)', function (done: () => void) {
		let config: any = {
			rootFolders: rootfolders(),
			filePattern: '*.*',
			contentPattern: { pattern: 'e', modifiers: 'i' },
			includePattern: { '**/examples/**': true }
		};

		doSearchTest(config, 382, done);
	});

	test('Text: e (with includes and exclude)', function (done: () => void) {
		let config: any = {
			rootFolders: rootfolders(),
			filePattern: '*.*',
			contentPattern: { pattern: 'e', modifiers: 'i' },
			includePattern: { '**/examples/**': true },
			excludePattern: { '**/examples/small.js': true }
		};

		doSearchTest(config, 361, done);
	});

	test('Text: a (capped)', function (done: () => void) {
		const maxResults = 520;
		let config = {
			rootFolders: rootfolders(),
			filePattern: '*.*',
			contentPattern: { pattern: 'a', modifiers: 'i' },
			maxResults
		};

		// (Legacy) search can go over the maxResults because it doesn't trim the results from its worker processes to the exact max size.
		// But the worst-case scenario should be 2*max-1
		return doLegacySearchTest(config, count => count < maxResults * 2)
			.then(() => doRipgrepSearchTest(config, maxResults))
			.then(done, done);
	});

	test('Text: a (no results)', function (done: () => void) {
		let config = {
			rootFolders: rootfolders(),
			filePattern: '*.*',
			contentPattern: { pattern: 'ahsogehtdas', modifiers: 'i' }
		};

		doSearchTest(config, 0, done);
	});

	test('Text: -size', function (done: () => void) {
		let config = {
			rootFolders: rootfolders(),
			filePattern: '*.css',
			contentPattern: { pattern: '-size', modifiers: 'i' }
		};

		doSearchTest(config, 9, done);
	});
});