/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { fuzzyContiguousFilter, matchesFuzzy2 } from 'vs/base/common/filters';

const data = <{ label: string }[]>require.__$__nodeRequire(require.toUrl('./filters.perf.data.json'));
const patterns = ['cci', 'CCI', 'ida', 'pos', 'enbled', 'callback', 'gGame'];

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
		console.log(Date.now() - t1, count);
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
		console.log(Date.now() - t1, count);
		assert.ok(count > 0);
	});
});

