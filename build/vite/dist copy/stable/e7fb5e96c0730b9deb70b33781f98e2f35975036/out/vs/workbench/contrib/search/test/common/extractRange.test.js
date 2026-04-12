/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { extractRangeFromFilter } from '../../common/search.js';
suite('extractRangeFromFilter', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('basics', async function () {
        assert.ok(!extractRangeFromFilter(''));
        assert.ok(!extractRangeFromFilter('/some/path'));
        assert.ok(!extractRangeFromFilter('/some/path/file.txt'));
        for (const lineSep of [':', '#', '(', ':line ']) {
            for (const colSep of [':', '#', ',']) {
                const base = '/some/path/file.txt';
                let res = extractRangeFromFilter(`${base}${lineSep}20`);
                assert.strictEqual(res?.filter, base);
                assert.strictEqual(res?.range.startLineNumber, 20);
                assert.strictEqual(res?.range.startColumn, 1);
                res = extractRangeFromFilter(`${base}${lineSep}20${colSep}`);
                assert.strictEqual(res?.filter, base);
                assert.strictEqual(res?.range.startLineNumber, 20);
                assert.strictEqual(res?.range.startColumn, 1);
                res = extractRangeFromFilter(`${base}${lineSep}20${colSep}3`);
                assert.strictEqual(res?.filter, base);
                assert.strictEqual(res?.range.startLineNumber, 20);
                assert.strictEqual(res?.range.startColumn, 3);
            }
        }
    });
    test('allow space after path', async function () {
        const res = extractRangeFromFilter('/some/path/file.txt (19,20)');
        assert.strictEqual(res?.filter, '/some/path/file.txt');
        assert.strictEqual(res?.range.startLineNumber, 19);
        assert.strictEqual(res?.range.startColumn, 20);
    });
    suite('unless', function () {
        const testSpecs = [
            // alpha-only symbol after unless
            { filter: '/some/path/file.txt@alphasymbol', unless: ['@'], result: undefined },
            // unless as first char
            { filter: '@/some/path/file.txt (19,20)', unless: ['@'], result: undefined },
            // unless as last char
            { filter: '/some/path/file.txt (19,20)@', unless: ['@'], result: undefined },
            // unless before ,
            {
                filter: '/some/@path/file.txt (19,20)', unless: ['@'], result: {
                    filter: '/some/@path/file.txt',
                    range: {
                        endColumn: 20,
                        endLineNumber: 19,
                        startColumn: 20,
                        startLineNumber: 19
                    }
                }
            },
            // unless before :
            {
                filter: '/some/@path/file.txt:19:20', unless: ['@'], result: {
                    filter: '/some/@path/file.txt',
                    range: {
                        endColumn: 20,
                        endLineNumber: 19,
                        startColumn: 20,
                        startLineNumber: 19
                    }
                }
            },
            // unless before #
            {
                filter: '/some/@path/file.txt#19', unless: ['@'], result: {
                    filter: '/some/@path/file.txt',
                    range: {
                        endColumn: 1,
                        endLineNumber: 19,
                        startColumn: 1,
                        startLineNumber: 19
                    }
                }
            },
        ];
        for (const { filter, unless, result } of testSpecs) {
            test(`${filter} - ${JSON.stringify(unless)}`, () => {
                assert.deepStrictEqual(extractRangeFromFilter(filter, unless), result);
            });
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0cmFjdFJhbmdlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2gvdGVzdC9jb21tb24vZXh0cmFjdFJhbmdlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRWhFLEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7SUFFcEMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsUUFBUSxFQUFFLEtBQUs7UUFDbkIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLHNCQUFzQixDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdkMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLHNCQUFzQixDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLHNCQUFzQixDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQztRQUUxRCxLQUFLLE1BQU0sT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUNqRCxLQUFLLE1BQU0sTUFBTSxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN0QyxNQUFNLElBQUksR0FBRyxxQkFBcUIsQ0FBQztnQkFFbkMsSUFBSSxHQUFHLEdBQUcsc0JBQXNCLENBQUMsR0FBRyxJQUFJLEdBQUcsT0FBTyxJQUFJLENBQUMsQ0FBQztnQkFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFH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