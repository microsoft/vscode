/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import path = require('path');
import assert = require('assert');

import uri from 'vs/base/common/uri';
import {LineMatch} from 'vs/platform/search/common/search';

import {FileWalker, Engine as FileSearchEngine} from 'vs/workbench/services/search/node/fileSearch';
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

suite('Search', () => {

	test('Files: *.js', function(done: () => void) {
		let engine = new FileSearchEngine({
			rootPaths: [require.toUrl('./fixtures')],
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

	test('Files: *.js (Files as roots)', function(done: () => void) {
		let engine = new FileSearchEngine({
			rootPaths: [require.toUrl('./fixtures/examples/company.js'), require.toUrl('./fixtures/examples/small.js')],
			filePattern: '*.js'
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

	test('Files: NPE (CamelCase)', function(done: () => void) {
		let engine = new FileSearchEngine({
			rootPaths: [require.toUrl('./fixtures')],
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

	test('Files: *.*', function(done: () => void) {
		let engine = new FileSearchEngine({
			rootPaths: [require.toUrl('./fixtures')],
			filePattern: '*.*'
		});

		let count = 0;
		engine.search((result) => {
			if (result) {
				count++;
			}
		}, () => { }, (error) => {
			assert.ok(!error);
			assert.equal(count, 9);
			done();
		});
	});

	test('Files: *.as', function(done: () => void) {
		let engine = new FileSearchEngine({
			rootPaths: [require.toUrl('./fixtures')],
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

	test('Text: GameOfLife', function(done: () => void) {
		let c = 0;
		let config = {
			rootPaths: [require.toUrl('./fixtures')],
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

	test('Text: GameOfLife (RegExp)', function(done: () => void) {
		let c = 0;
		let config = {
			rootPaths: [require.toUrl('./fixtures')],
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

	test('Text: GameOfLife (Word Match, Case Sensitive)', function(done: () => void) {
		let c = 0;
		let config = {
			rootPaths: [require.toUrl('./fixtures')],
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

	test('Text: Helvetica (UTF 16)', function(done: () => void) {
		let c = 0;
		let config = {
			rootPaths: [require.toUrl('./fixtures')],
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

	test('Text: e', function(done: () => void) {
		let c = 0;
		let config = {
			rootPaths: [require.toUrl('./fixtures')],
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

	test('Text: e (with excludes)', function(done: () => void) {
		let c = 0;
		let config:any = {
			rootPaths: [require.toUrl('./fixtures')],
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

	test('Text: e (with includes)', function(done: () => void) {
		let c = 0;
		let config:any = {
			rootPaths: [require.toUrl('./fixtures')],
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

	test('Text: e (with includes and exclude)', function(done: () => void) {
		let c = 0;
		let config:any = {
			rootPaths: [require.toUrl('./fixtures')],
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

	test('Text: a (capped)', function(done: () => void) {
		let c = 0;
		let config = {
			rootPaths: [require.toUrl('./fixtures')],
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

	test('Text: a (no results)', function(done: () => void) {
		let c = 0;
		let config = {
			rootPaths: [require.toUrl('./fixtures')],
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