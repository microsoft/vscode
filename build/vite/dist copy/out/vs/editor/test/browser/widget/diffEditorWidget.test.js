/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { UnchangedRegion } from '../../../browser/widget/diffEditor/diffEditorViewModel.js';
import { LineRange } from '../../../common/core/ranges/lineRange.js';
import { DetailedLineRangeMapping } from '../../../common/diff/rangeMapping.js';
suite('DiffEditorWidget2', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('UnchangedRegion', () => {
        function serialize(regions) {
            return regions.map(r => `${r.originalUnchangedRange} - ${r.modifiedUnchangedRange}`);
        }
        test('Everything changed', () => {
            assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs([new DetailedLineRangeMapping(new LineRange(1, 10), new LineRange(1, 10), [])], 10, 10, 3, 3)), []);
        });
        test('Nothing changed', () => {
            assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs([], 10, 10, 3, 3)), [
                '[1,11) - [1,11)'
            ]);
        });
        test('Change in the middle', () => {
            assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs([new DetailedLineRangeMapping(new LineRange(50, 60), new LineRange(50, 60), [])], 100, 100, 3, 3)), ([
                '[1,47) - [1,47)',
                '[63,101) - [63,101)'
            ]));
        });
        test('Change at the end', () => {
            assert.deepStrictEqual(serialize(UnchangedRegion.fromDiffs([new DetailedLineRangeMapping(new LineRange(99, 100), new LineRange(100, 100), [])], 100, 100, 3, 3)), (['[1,96) - [1,96)']));
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkVkaXRvcldpZGdldC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3Rlc3QvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvcldpZGdldC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDNUYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWhGLEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxHQUFHLEVBQUU7SUFFL0IsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxFQUFFO1FBQzdCLFNBQVMsU0FBUyxDQUFDLE9BQTBCO1lBQzVDLE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLHNCQUFzQixNQUFNLENBQUMsQ0FBQyxzQkFBc0IsRUFBRSxDQUFDLENBQUM7UUFDdEYsQ0FBQztRQUVELElBQUksQ0FBQyxvQkFBb0IsRUFBRSxHQUFHLEVBQUU7WUFDL0IsTUFBTSxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FDekQsQ0FBQyxJQUFJLHdCQUF3QixDQUFDLElBQUksU0FBUyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxJQUFJLFNBQVMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFDOUUsRUFBRSxFQUNGLEVBQUUsRUFDRixDQUFDLEVBQ0QsQ0FBQyxDQUNELENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNULENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtZQUM1QixNQUFNLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUN6RCxFQUFFLEVBQ0YsRUFBRSxFQUNGLEVBQUUsRUFDRixDQUFDLEVBQ0QsQ0FBQyxDQUNELENBQUMsRUFBRTtnQkFDSCxpQkFBaUI7YUFDakIsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO1lBQ2pDLE1BQU0sQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQ3pELENBQUMsSUFBSSx3QkFBd0IsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsSUFBSSxTQUFTLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQ2hGLEdBQUcsRUFDSCxHQUFHLEVBQ0gsQ0FBQyxFQUNELENBQUMsQ0FDRCxDQUFDLEVBQUUsQ0FBQztnQkFDSixpQkFBaUI7Z0JBQ2pCLHFCQUFxQjthQUNyQixDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLG1CQUFtQixFQUFFLEdBQUcsRUFBRTtZQUM5QixNQUFNLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUN6RCxDQUFDLElBQUksd0JBQXdCLENBQUMsSUFBSSxTQUFTLENBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQyxFQUFFLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUNuRixHQUFHLEVBQ0gsR0FBRyxFQUNILENBQUMsRUFDRCxDQUFDLENBQ0QsQ0FBQyxFQUFFLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM1QixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==