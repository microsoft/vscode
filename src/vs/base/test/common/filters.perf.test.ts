/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

// import * as assert from 'assert';
import { fuzzyContiguousFilter, matchesFuzzy2, fuzzyLCS, fuzzyMatchAndScore } from 'vs/base/common/filters';

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

	function perfTest(name: string, match: (pattern: string, word: string) => any) {
		test(name, function () {

			const t1 = Date.now();
			let count = 0;
			for (const pattern of patterns) {
				for (const item of data) {
					if (item.label) {
						count += 1;
						match(pattern, item.label);
					}
				}
			}
			console.log(name, Date.now() - t1, `${(count / (Date.now() - t1)).toPrecision(6)}/ms`);
		});
	}

	perfTest('fuzzyContiguousFilter', fuzzyContiguousFilter);
	perfTest('matchesFuzzy2', matchesFuzzy2);
	perfTest('fuzzyLCS', fuzzyLCS);
	perfTest('fuzzyMatchAndScore', fuzzyMatchAndScore);

});

