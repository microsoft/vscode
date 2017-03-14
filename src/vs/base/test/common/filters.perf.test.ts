/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { fuzzyContiguousFilter, matchesFuzzy2, matchesFuzzy3, matchesFuzzy4 } from 'vs/base/common/filters';

const fuzz = require.__$__nodeRequire('fuzzaldrin-plus');
const data = <{ label: string }[]>require.__$__nodeRequire(require.toUrl('./filters.perf.data.json'));
const patterns = ['cci', 'ida', 'pos', 'CCI', 'enbled', 'callback', 'gGame'];

const _enablePerf = true;

function perfSuite(name: string, callback: (this: Mocha.ISuiteCallbackContext) => void) {
	if (_enablePerf) {
		suite(name, callback);
	}
}

perfSuite('Performance - fuzzyMatch', function () {

	console.log(`Matching ${data.length} items against ${patterns.length} patterns...`);

	test('fuzzyContiguousFilter', function () {
		const t1 = Date.now();
		let count = 0;
		for (const pattern of patterns) {
			for (const item of data) {
				if (item.label) {
					const matches = fuzzyContiguousFilter(pattern, item.label);
					if (matches) {
						count += 1;
					}
				}
			}
		}
		console.log('fuzzyContiguousFilter', Date.now() - t1, count);
		assert.ok(count > 0);
	});

	test('matchesFuzzy2', function () {
		const t1 = Date.now();
		let count = 0;
		for (const pattern of patterns) {
			for (const item of data) {
				if (item.label) {
					const matches = matchesFuzzy2(pattern, item.label);
					if (matches) {
						count += 1;
					}
				}
			}
		}
		console.log('matchesFuzzy2', Date.now() - t1, count);
		assert.ok(count > 0);
	});

	test('matchesFuzzy3', function () {
		const t1 = Date.now();
		let count = 0;
		for (const pattern of patterns) {
			for (const item of data) {
				if (item.label) {
					const matches = matchesFuzzy3(pattern, item.label);
					if (matches) {
						count += 1;
					}
				}
			}
		}
		console.log('matchesFuzzy3', Date.now() - t1, count);
		assert.ok(count > 0);
	});

	test('matchesFuzzy4', function () {
		const t1 = Date.now();
		let count = 0;
		for (const pattern of patterns) {
			for (const item of data) {
				if (item.label) {
					const matches = matchesFuzzy4(pattern, item.label);
					if (matches) {
						count += 1;
					}
				}
			}
		}
		console.log('matchesFuzzy4', Date.now() - t1, count);
		assert.ok(count > 0);
	});

	test('fuzzaldrin', function () {
		const t1 = Date.now();
		let count = 0;
		for (const pattern of patterns) {
			for (const item of data) {
				if (item.label) {
					const matches = fuzz.match(item.label, pattern);
					// fuzz.score(item.label, pattern);
					if (matches) {
						count += 1;
					}
				}
			}
		}
		console.log('fuzzaldrin', Date.now() - t1, count);
		assert.ok(count > 0);
	});
});

