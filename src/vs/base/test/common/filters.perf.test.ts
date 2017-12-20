/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as filters from 'vs/base/common/filters';
import { data } from './filters.perf.data';

const patterns = ['cci', 'ida', 'pos', 'CCI', 'enbled', 'callback', 'gGame', 'cons'];

const _enablePerf = false;

function perfSuite(name: string, callback: (this: Mocha.ISuiteCallbackContext) => void) {
	if (_enablePerf) {
		suite(name, callback);
	}
}

perfSuite('Performance - fuzzyMatch', function () {

	console.log(`Matching ${data.length} items against ${patterns.length} patterns (${data.length * patterns.length} operations) `);

	function perfTest(name: string, match: (pattern: string, word: string) => any) {
		test(name, function () {

			const t1 = Date.now();
			let count = 0;
			for (const pattern of patterns) {
				for (const item of data) {
					count += 1;
					match(pattern, item);
				}
			}
			const d = Date.now() - t1;
			console.log(name, `${d}ms, ${Math.round(count / d) * 15}ops/15ms`);
		});
	}

	perfTest('matchesFuzzy', filters.matchesFuzzy);
	perfTest('fuzzyContiguousFilter', filters.fuzzyContiguousFilter);
	perfTest('fuzzyScore', filters.fuzzyScore);
	perfTest('fuzzyScoreGraceful', filters.fuzzyScoreGraceful);
	perfTest('fuzzyScoreGracefulAggressive', filters.fuzzyScoreGracefulAggressive);
});

