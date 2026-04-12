/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { importAMDNodeModule } from '../../../amdX.js';
import * as filters from '../../common/filters.js';
import { FileAccess } from '../../common/network.js';
const patterns = ['cci', 'ida', 'pos', 'CCI', 'enbled', 'callback', 'gGame', 'cons', 'zyx', 'aBc'];
const _enablePerf = false;
function perfSuite(name, callback) {
    if (_enablePerf) {
        suite(name, callback);
    }
}
perfSuite('Performance - fuzzyMatch', async function () {
    const uri = FileAccess.asBrowserUri('vs/base/test/common/filters.perf.data').toString(true);
    const { data } = await importAMDNodeModule(uri, '');
    // suiteSetup(() => console.profile());
    // suiteTeardown(() => console.profileEnd());
    console.log(`Matching ${data.length} items against ${patterns.length} patterns (${data.length * patterns.length} operations) `);
    function perfTest(name, match) {
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
    const { data } = await importAMDNodeModule(uri, '');
    function perfTest(name, match) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsdGVycy5wZXJmLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3Rlc3QvY29tbW9uL2ZpbHRlcnMucGVyZi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ3ZELE9BQU8sS0FBSyxPQUFPLE1BQU0seUJBQXlCLENBQUM7QUFDbkQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRXJELE1BQU0sUUFBUSxHQUFHLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFFbkcsTUFBTSxXQUFXLEdBQUcsS0FBSyxDQUFDO0FBRTFCLFNBQVMsU0FBUyxDQUFDLElBQVksRUFBRSxRQUFxQztJQUNyRSxJQUFJLFdBQVcsRUFBRSxDQUFDO1FBQ2pCLEtBQUssQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDdkIsQ0FBQztBQUNGLENBQUM7QUFFRCxTQUFTLENBQUMsMEJBQTBCLEVBQUUsS0FBSztJQUUxQyxNQUFNLEdBQUcsR0FBRyxVQUFVLENBQUMsWUFBWSxDQUFDLHVDQUF1QyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzVGLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxNQUFNLG1CQUFtQixDQUEwQyxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFFN0YsdUNBQXVDO0lBQ3ZDLDZDQUE2QztJQUU3QyxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksSUFBSSxDQUFDLE1BQU0sa0JBQWtCLFFBQVEsQ0FBQyxNQUFNLGNBQWMsSUFBSSxDQUFD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