/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import path = require('path');
import assert = require('assert');

import * as glob from 'vs/base/common/glob';
import { TPromise } from 'vs/base/common/winjs.base';
import { FileWalker } from 'vs/workbench/services/search/node/fileSearch';
import { ISerializedFileMatch, IRawSearch, IFolderSearch } from 'vs/workbench/services/search/node/search';
import { Engine as TextSearchEngine } from 'vs/workbench/services/search/node/textSearch';
import { RipgrepEngine } from 'vs/workbench/services/search/node/ripgrepTextSearch';
import { TextSearchWorkerProvider } from 'vs/workbench/services/search/node/textSearchWorkerProvider';

function countAll(matches: ISerializedFileMatch[]): number {
	return matches.reduce((acc, m) => acc + m.numMatches, 0);
}

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

const textSearchWorkerProvider = new TextSearchWorkerProvider();

function doLegacySearchTest(config: IRawSearch, expectedResultCount: number | Function): TPromise<void> {
	return new TPromise<void>((resolve, reject) => {
		let engine = new TextSearchEngine(config, new FileWalker(config), textSearchWorkerProvider);

		let c = 0;
		engine.search((result) => {
			if (result) {
				c += countAll(result);
			}
		}, () => { }, (error) => {
			try {
				assert.ok(!error);
				if (typeof expectedResultCount === 'function') {
					assert(expectedResultCount(c));
				} else {
					assert.equal(c, expectedResultCount, 'legacy');
				}
			} catch (e) {
				reject(e);
			}

			resolve(undefined);
		});
	});
}

function doRipgrepSearchTest(config: IRawSearch, expectedResultCount: number): TPromise<void> {
	return new TPromise<void>((resolve, reject) => {
		let engine = new RipgrepEngine(config);

		let c = 0;
		engine.search((result) => {
			if (result) {
				c += result.numMatches;
			}
		}, () => { }, (error) => {
			try {
				assert.ok(!error);
				if (typeof expectedResultCount === 'function') {
					assert(expectedResultCount(c));
				} else {
					assert.equal(c, expectedResultCount, 'rg');
				}
			} catch (e) {
				reject(e);
			}

			resolve(undefined);
		});
	});
}

function doSearchTest(config: IRawSearch, expectedResultCount: number, done) {
	return doLegacySearchTest(config, expectedResultCount)
		.then(() => doRipgrepSearchTest(config, expectedResultCount))
		.then(done, done);
}

suite('Search-integration', function () {
	this.timeout(1000 * 60); // increase timeout for this suite

	test('Text: GameOfLife', function (done: () => void) {
		const config = {
			folderQueries: ROOT_FOLDER_QUERY,
			contentPattern: { pattern: 'GameOfLife' },
		};

		doSearchTest(config, 4, done);
	});

	test('Text: GameOfLife (RegExp)', function (done: () => void) {
		const config = {
			folderQueries: ROOT_FOLDER_QUERY,
			contentPattern: { pattern: 'Game.?fL\\w?fe', isRegExp: true }
		};

		doSearchTest(config, 4, done);
	});

	test('Text: GameOfLife (RegExp to EOL)', function (done: () => void) {
		const config = {
			folderQueries: ROOT_FOLDER_QUERY,
			contentPattern: { pattern: 'GameOfLife.*', isRegExp: true }
		};

		doSearchTest(config, 4, done);
	});

	test('Text: GameOfLife (Word Match, Case Sensitive)', function (done: () => void) {
		const config = {
			folderQueries: ROOT_FOLDER_QUERY,
			contentPattern: { pattern: 'GameOfLife', isWordMatch: true, isCaseSensitive: true }
		};

		doSearchTest(config, 4, done);
	});

	test('Text: GameOfLife (Word Match, Spaces)', function (done: () => void) {
		const config = {
			folderQueries: ROOT_FOLDER_QUERY,
			contentPattern: { pattern: ' GameOfLife ', isWordMatch: true }
		};

		doSearchTest(config, 1, done);
	});

	test('Text: GameOfLife (Word Match, Punctuation and Spaces)', function (done: () => void) {
		const config = {
			folderQueries: ROOT_FOLDER_QUERY,
			contentPattern: { pattern: ', as =', isWordMatch: true }
		};

		doSearchTest(config, 1, done);
	});

	test('Text: Helvetica (UTF 16)', function (done: () => void) {
		const config = {
			folderQueries: ROOT_FOLDER_QUERY,
			contentPattern: { pattern: 'Helvetica' }
		};

		doSearchTest(config, 3, done);
	});

	test('Text: e', function (done: () => void) {
		const config = {
			folderQueries: ROOT_FOLDER_QUERY,
			contentPattern: { pattern: 'e' }
		};

		doSearchTest(config, 776, done);
	});

	test('Text: e (with excludes)', function (done: () => void) {
		const config: any = {
			folderQueries: ROOT_FOLDER_QUERY,
			contentPattern: { pattern: 'e' },
			excludePattern: { '**/examples': true }
		};

		doSearchTest(config, 394, done);
	});

	test('Text: e (with includes)', function (done: () => void) {
		const config: any = {
			folderQueries: ROOT_FOLDER_QUERY,
			contentPattern: { pattern: 'e' },
			includePattern: { '**/examples/**': true }
		};

		doSearchTest(config, 382, done);
	});

	test('Text: e (with absolute path excludes)', function (done: () => void) {
		const config: any = {
			folderQueries: ROOT_FOLDER_QUERY,
			contentPattern: { pattern: 'e' },
			excludePattern: makeExpression(path.join(TEST_FIXTURES, '**/examples'))
		};

		doSearchTest(config, 394, done);
	});

	test('Text: e (with mixed absolute/relative path excludes)', function (done: () => void) {
		const config: any = {
			folderQueries: ROOT_FOLDER_QUERY,
			contentPattern: { pattern: 'e' },
			excludePattern: makeExpression(path.join(TEST_FIXTURES, '**/examples'), '*.css')
		};

		doSearchTest(config, 310, done);
	});

	test('Text: sibling exclude', function (done: () => void) {
		const config: any = {
			folderQueries: ROOT_FOLDER_QUERY,
			contentPattern: { pattern: 'm' },
			includePattern: makeExpression('**/site*'),
			excludePattern: { '*.css': { when: '$(basename).less' } }
		};

		doSearchTest(config, 1, done);
	});

	test('Text: e (with includes and exclude)', function (done: () => void) {
		const config: any = {
			folderQueries: ROOT_FOLDER_QUERY,
			contentPattern: { pattern: 'e' },
			includePattern: { '**/examples/**': true },
			excludePattern: { '**/examples/small.js': true }
		};

		doSearchTest(config, 361, done);
	});

	test('Text: a (capped)', function (done: () => void) {
		const maxResults = 520;
		const config = {
			folderQueries: ROOT_FOLDER_QUERY,
			contentPattern: { pattern: 'a' },
			maxResults
		};

		// (Legacy) search can go over the maxResults because it doesn't trim the results from its worker processes to the exact max size.
		// But the worst-case scenario should be 2*max-1
		return doLegacySearchTest(config, count => count < maxResults * 2)
			.then(() => doRipgrepSearchTest(config, maxResults))
			.then(done, done);
	});

	test('Text: a (no results)', function (done: () => void) {
		const config = {
			folderQueries: ROOT_FOLDER_QUERY,
			contentPattern: { pattern: 'ahsogehtdas' }
		};

		doSearchTest(config, 0, done);
	});

	test('Text: -size', function (done: () => void) {
		const config = {
			folderQueries: ROOT_FOLDER_QUERY,
			contentPattern: { pattern: '-size' }
		};

		doSearchTest(config, 9, done);
	});

	test('Multiroot: Conway', function (done: () => void) {
		const config: IRawSearch = {
			folderQueries: MULTIROOT_QUERIES,
			contentPattern: { pattern: 'conway' }
		};

		doSearchTest(config, 8, done);
	});

	test('Multiroot: e with partial global exclude', function (done: () => void) {
		const config: IRawSearch = {
			folderQueries: MULTIROOT_QUERIES,
			contentPattern: { pattern: 'e' },
			excludePattern: makeExpression('**/*.txt')
		};

		doSearchTest(config, 382, done);
	});

	test('Multiroot: e with global excludes', function (done: () => void) {
		const config: IRawSearch = {
			folderQueries: MULTIROOT_QUERIES,
			contentPattern: { pattern: 'e' },
			excludePattern: makeExpression('**/*.txt', '**/*.js')
		};

		doSearchTest(config, 0, done);
	});

	test('Multiroot: e with folder exclude', function (done: () => void) {
		const config: IRawSearch = {
			folderQueries: [
				{ folder: EXAMPLES_FIXTURES, excludePattern: makeExpression('**/e*.js') },
				{ folder: MORE_FIXTURES }
			],
			contentPattern: { pattern: 'e' }
		};

		doSearchTest(config, 286, done);
	});
});

function makeExpression(...patterns: string[]): glob.IExpression {
	return patterns.reduce((glob, cur) => { glob[cur] = true; return glob; }, Object.create(null));
}