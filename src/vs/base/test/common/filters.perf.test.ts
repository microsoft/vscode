/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { importAMDNodeModule } from 'vs/amdX';
import * as filters from 'vs/base/common/filters';
import { FileAccess } from 'vs/base/common/network';

const patterns = ['cci', 'ida', 'pos', 'CCI', 'enbled', 'callback', 'gGame', 'cons', 'zyx', 'aBc'];

const _enablePerf = false;

function perfSuite(name: string, callback: (this: Mocha.Suite) => void) {
	if (_enablePerf) {
		suite(name, callback);
	}
}

perfSuite('Performance - fuzzyMatch', async function () {

	const uri = FileAccess.asBrowserUri('vs/base/test/common/filters.perf.data').toString(true);
	const { data } = await importAMDNodeModule<typeof import('vs/base/test/common/filters.perf.data')>(uri, '');

	// suiteSetup(() => console.profile());
	// suiteTeardown(() => console.profileEnd());

	console.log(`Matching ${data.length} items against ${patterns.length} patterns (${data.length * patterns.length} operations) `);

	function perfTest(name: string, match: filters.FuzzyScorer) {
		test(name, () => {

			const t1 = Date.now();
			let count = 0;
			for (let i = 0; i < 2; i++) {
				for (const pattern of patterns) {
					const patternLow = pattern.toLowerCase();
					for (const item of data) {
						count += 1;
						match(pattern, patternLow, 0, item, item.toLowerCase(), 0);
					}
				}
			}
			const d = Date.now() - t1;
			console.log(name, `${d}ms, ${Math.round(count / d) * 15}/15ms, ${Math.round(count / d)}/1ms`);
		});
	}

	perfTest('fuzzyScore', filters.fuzzyScore);
	perfTest('fuzzyScoreGraceful', filters.fuzzyScoreGraceful);
	perfTest('fuzzyScoreGracefulAggressive', filters.fuzzyScoreGracefulAggressive);
});


perfSuite('Performance - IFilter', async function () {

	const uri = FileAccess.asBrowserUri('vs/base/test/common/filters.perf.data').toString(true);
	const { data } = await importAMDNodeModule<typeof import('vs/base/test/common/filters.perf.data')>(uri, '');

	function perfTest(name: string, match: filters.IFilter) {
		test(name, () => {

			const t1 = Date.now();
			let count = 0;
			for (let i = 0; i < 2; i++) {
				for (const pattern of patterns) {
					for (const item of data) {
						count += 1;
						match(pattern, item);
					}
				}
			}
			const d = Date.now() - t1;
			console.log(name, `${d}ms, ${Math.round(count / d) * 15}/15ms, ${Math.round(count / d)}/1ms`);
		});
	}

	perfTest('matchesFuzzy', filters.matchesFuzzy);
	perfTest('matchesFuzzy2', filters.matchesFuzzy2);
	perfTest('matchesPrefix', filters.matchesPrefix);
	perfTest('matchesContiguousSubString', filters.matchesContiguousSubString);
	perfTest('matchesCamelCase', filters.matchesCamelCase);
});
