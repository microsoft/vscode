/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CellKind } from '../../common/notebookCommon.js';
/**
 * Return a set of ranges for the cells matching the given predicate
 */
function getRanges(cells, included) {
    const ranges = [];
    let currentRange;
    cells.forEach((cell, idx) => {
        if (included(cell)) {
            if (!currentRange) {
                currentRange = { start: idx, end: idx + 1 };
                ranges.push(currentRange);
            }
            else {
                currentRange.end = idx + 1;
            }
        }
        else {
            currentRange = undefined;
        }
    });
    return ranges;
}
suite('notebookBrowser', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('getRanges', function () {
        const predicate = (cell) => cell.cellKind === CellKind.Code;
        test('all code', function () {
            const cells = [
                { cellKind: CellKind.Code },
                { cellKind: CellKind.Code },
            ];
            assert.deepStrictEqual(getRanges(cells, predicate), [{ start: 0, end: 2 }]);
        });
        test('none code', function () {
            const cells = [
                { cellKind: CellKind.Markup },
                { cellKind: CellKind.Markup },
            ];
            assert.deepStrictEqual(getRanges(cells, predicate), []);
        });
        test('start code', function () {
            const cells = [
                { cellKind: CellKind.Code },
                { cellKind: CellKind.Markup },
            ];
            assert.deepStrictEqual(getRanges(cells, predicate), [{ start: 0, end: 1 }]);
        });
        test('random', function () {
            const cells = [
                { cellKind: CellKind.Code },
                { cellKind: CellKind.Code },
                { cellKind: CellKind.Markup },
                { cellKind: CellKind.Code },
                { cellKind: CellKind.Markup },
                { cellKind: CellKind.Markup },
                { cellKind: CellKind.Code },
            ];
            assert.deepStrictEqual(getRanges(cells, predicate), [{ start: 0, end: 2 }, { start: 3, end: 4 }, { start: 6, end: 7 }]);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tCcm93c2VyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay90ZXN0L2Jyb3dzZXIvbm90ZWJvb2tCcm93c2VyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5HLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUcxRDs7R0FFRztBQUNILFNBQVMsU0FBUyxDQUFDLEtBQXVCLEVBQUUsUUFBMkM7SUFDdEYsTUFBTSxNQUFNLEdBQWlCLEVBQUUsQ0FBQztJQUNoQyxJQUFJLFlBQW9DLENBQUM7SUFFekMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsRUFBRTtRQUMzQixJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ3BCLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDbkIsWUFBWSxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUM1QyxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQzNCLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxZQUFZLENBQUMsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7WUFDNUIsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsWUFBWSxHQUFHLFNBQVMsQ0FBQztRQUMxQixDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUM7QUFHRCxLQUFLLENBQUMsaUJBQWlCLEVBQUUs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