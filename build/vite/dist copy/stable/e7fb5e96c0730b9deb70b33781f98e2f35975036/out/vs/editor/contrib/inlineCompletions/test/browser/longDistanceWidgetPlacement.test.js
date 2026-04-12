/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Size2D } from '../../../../common/core/2d/size.js';
import { LineRange } from '../../../../common/core/ranges/lineRange.js';
import { WidgetPlacementContext } from '../../browser/view/inlineEdits/inlineEditsViews/longDistanceHint/longDistnaceWidgetPlacement.js';
suite('WidgetPlacementContext', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function createLineRangeInfo(startLine, sizes, top = 0) {
        return {
            lineRange: LineRange.ofLength(startLine, sizes.length),
            top,
            sizes,
        };
    }
    const defaultLayoutConstants = {
        previewEditorMargin: 5,
        widgetPadding: 2,
        widgetBorder: 1,
        lowerBarHeight: 10,
        minWidgetWidth: 50,
    };
    suite('constructor - availableSpaceSizes computation', () => {
        test('computes available space sizes correctly with no padding', () => {
            const sizes = [new Size2D(100, 20), new Size2D(150, 20), new Size2D(80, 20)];
            const lineRangeInfo = createLineRangeInfo(1, sizes);
            const editorTrueContentWidth = 500;
            const endOfLinePadding = () => 0;
            const context = new WidgetPlacementContext(lineRangeInfo, editorTrueContentWidth, endOfLinePadding);
            assert.strictEqual(context.availableSpaceSizes.length, 3);
            assert.strictEqual(context.availableSpaceSizes[0].width, 400); // 500 - 100
            assert.strictEqual(context.availableSpaceSizes[1].width, 350); // 500 - 150
            assert.strictEqual(context.availableSpaceSizes[2].width, 420); // 500 - 80
        });
        test('computes available space sizes with end of line padding', () => {
            const sizes = [new Size2D(100, 20), new Size2D(150, 20)];
            const lineRangeInfo = createLineRangeInfo(1, sizes);
            const editorTrueContentWidth = 500;
            const endOfLinePadding = (lineNumber) => lineNumber * 10;
            const context = new WidgetPlacementContext(lineRangeInfo, editorTrueContentWidth, endOfLinePadding);
            assert.strictEqual(context.availableSpaceSizes[0].width, 390); // 500 - 100 - 10
            assert.strictEqual(context.availableSpaceSizes[1].width, 330); // 500 - 150 - 20
        });
        test('available space width is never negative', () => {
            const sizes = [new Size2D(600, 20)];
            const lineRangeInfo = createLineRangeInfo(1, sizes);
            const editorTrueContentWidth = 500;
            const endOfLinePadding = () => 0;
            const context = new WidgetPlacementContext(lineRangeInfo, editorTrueContentWidth, endOfLinePadding);
            assert.strictEqual(context.availableSpaceSizes[0].width, 0);
        });
        test('preserves heights in available space sizes', () => {
            const sizes = [new Size2D(100, 25), new Size2D(100, 30), new Size2D(100, 20)];
            const lineRangeInfo = createLineRangeInfo(1, sizes);
            const editorTrueContentWidth = 500;
            const endOfLinePadding = () => 0;
            const context = new WidgetPlacementContext(lineRangeInfo, editorTrueContentWidth, endOfLinePadding);
            assert.strictEqual(context.availableSpaceSizes[0].height, 25);
            assert.strictEqual(context.availableSpaceSizes[1].height, 30);
            assert.strictEqual(context.availableSpaceSizes[2].height, 20);
        });
    });
    suite('constructor - prefix sums computation', () => {
        test('computes height prefix sums correctly', () => {
            const sizes = [new Size2D(100, 20), new Size2D(100, 30), new Size2D(100, 25)];
            const lineRangeInfo = createLineRangeInfo(1, sizes);
            const context = new WidgetPlacementContext(lineRangeInfo, 500, () => 0);
            assert.deepStrictEqual(context.availableSpaceHeightPrefixSums, [0, 20, 50, 75]);
        });
        test('prefix sums start with 0 and have length = sizes.length + 1', () => {
            const sizes = [new Size2D(100, 10), new Size2D(100, 20)];
            const lineRangeInfo = createLineRangeInfo(1, sizes);
            const context = new WidgetPlacementContext(lineRangeInfo, 500, () => 0);
            assert.strictEqual(context.availableSpaceHeightPrefixSums[0], 0);
            assert.strictEqual(context.availableSpaceHeightPrefixSums.length, 3);
        });
    });
    suite('constructor - transposed sizes', () => {
        test('transposes width and height correctly', () => {
            const sizes = [new Size2D(100, 20), new Size2D(150, 30)];
            const lineRangeInfo = createLineRangeInfo(1, sizes);
            const context = new WidgetPlacementContext(lineRangeInfo, 500, () => 0);
            // Transposed: width becomes height and vice versa
            // Available widths are 400 and 350, heights are 20 and 30
            assert.strictEqual(context.availableSpaceSizesTransposed[0].width, 20);
            assert.strictEqual(context.availableSpaceSizesTransposed[0].height, 400);
            assert.strictEqual(context.availableSpaceSizesTransposed[1].width, 30);
            assert.strictEqual(context.availableSpaceSizesTransposed[1].height, 350);
        });
    });
    suite('getWidgetVerticalOutline', () => {
        test('computes vertical outline for first line', () => {
            const sizes = [new Size2D(100, 20), new Size2D(100, 20)];
            const lineRangeInfo = createLineRangeInfo(1, sizes, 100);
            const context = new WidgetPlacementContext(lineRangeInfo, 500, () => 0);
            const outline = context.getWidgetVerticalOutline(1, 50, defaultLayoutConstants);
            // previewEditorMargin + widgetPadding + widgetBorder = 5 + 2 + 1 = 8
            // editorRange = [100, 150)
            // verticalWidgetRange = [100 - 8, 150 + 8 + 10) = [92, 168)
            assert.strictEqual(outline.start, 92);
            assert.strictEqual(outline.endExclusive, 168);
        });
        test('computes vertical outline for second line', () => {
            const sizes = [new Size2D(100, 20), new Size2D(100, 25)];
            const lineRangeInfo = createLineRangeInfo(1, sizes, 100);
            const context = new WidgetPlacementContext(lineRangeInfo, 500, () => 0);
            const outline = context.getWidgetVerticalOutline(2, 50, defaultLayoutConstants);
            // Line 2 is at index 1, prefixSum[1] = 20
            // top = 100 + 20 = 120
            // editorRange = [120, 170)
            // margin = 8, lowerBarHeight = 10
            // verticalWidgetRange = [120 - 8, 170 + 8 + 10) = [112, 188)
            assert.strictEqual(outline.start, 112);
            assert.strictEqual(outline.endExclusive, 188);
        });
        test('works with zero margins', () => {
            const sizes = [new Size2D(100, 20)];
            const lineRangeInfo = createLineRangeInfo(1, sizes, 0);
            const zeroConstants = {
                previewEditorMargin: 0,
                widgetPadding: 0,
                widgetBorder: 0,
                lowerBarHeight: 0,
                minWidgetWidth: 50,
            };
            const context = new WidgetPlacementContext(lineRangeInfo, 500, () => 0);
            const outline = context.getWidgetVerticalOutline(1, 50, zeroConstants);
            assert.strictEqual(outline.start, 0);
            assert.strictEqual(outline.endExclusive, 50);
        });
    });
    suite('tryFindWidgetOutline', () => {
        test('returns undefined when no line has enough width', () => {
            // All lines have content that leaves less than minWidgetWidth
            const sizes = [new Size2D(460, 20), new Size2D(470, 20), new Size2D(480, 20)];
            const lineRangeInfo = createLineRangeInfo(1, sizes);
            const context = new WidgetPlacementContext(lineRangeInfo, 500, () => 0);
            const result = context.tryFindWidgetOutline(2, 15, 500, defaultLayoutConstants);
            assert.strictEqual(result, undefined);
        });
        test('finds widget outline on target line when it has enough space', () => {
            const sizes = [new Size2D(100, 20), new Size2D(100, 20), new Size2D(100, 20)];
            const lineRangeInfo = createLineRangeInfo(1, sizes, 0);
            const context = new WidgetPlacementContext(lineRangeInfo, 500, () => 0);
            const result = context.tryFindWidgetOutline(2, 15, 500, defaultLayoutConstants);
            assert.ok(result !== undefined);
            assert.ok(result.horizontalWidgetRange.length >= defaultLayoutConstants.minWidgetWidth);
        });
        test('searches outward from target line', () => {
            // First and last lines are excluded from placement
            // Lines 2, 3 have no space, line 4 has space
            const sizes = [
                new Size2D(100, 20), // line 1 - excluded (first)
                new Size2D(460, 20), // line 2 - no space
                new Size2D(460, 20), // line 3 - no space (target)
                new Size2D(100, 20), // line 4 - has space
                new Size2D(100, 20), // line 5 - has space
                new Size2D(100, 20), // line 6 - has space
                new Size2D(100, 20), // line 7 - excluded (last)
            ];
            const lineRangeInfo = createLineRangeInfo(1, sizes, 0);
            const context = new WidgetPlacementContext(lineRangeInfo, 500, () => 0);
            // Target is line 3, but it should find line 4 (searching outward)
            const result = context.tryFindWidgetOutline(3, 15, 500, defaultLayoutConstants);
            assert.ok(result !== undefined);
        });
        test('prefers closer lines to target', () => {
            const sizes = [
                new Size2D(100, 20), // line 0 - excluded (first)
                new Size2D(100, 20), // line 1 - has space
                new Size2D(100, 20), // line 2 - has space
                new Size2D(100, 20), // line 3 - has space
                new Size2D(500, 9999), // line 4 - no space (target)
                new Size2D(100, 20), // line 5 - has space
                new Size2D(100, 20), // line 6 - has space
                new Size2D(100, 20), // line 7 - has space
                new Size2D(100, 20), // line 8 - excluded (last)
            ];
            const lineRangeInfo = createLineRangeInfo(1, sizes, 0);
            for (let targetLine = 0; targetLine <= 4; targetLine++) {
                const context = new WidgetPlacementContext(lineRangeInfo, 500, () => 0);
                const result = context.tryFindWidgetOutline(targetLine, 15, 500, defaultLayoutConstants);
                assert.ok(result !== undefined);
                assert.ok(result.verticalWidgetRange.endExclusive < 9999);
            }
            for (let targetLine = 5; targetLine <= 10 /* test outside line range */; targetLine++) {
                const context = new WidgetPlacementContext(lineRangeInfo, 500, () => 0);
                const result = context.tryFindWidgetOutline(targetLine, 15, 500, defaultLayoutConstants);
                assert.ok(result !== undefined);
                assert.ok(result.verticalWidgetRange.start > 9999);
            }
        });
        test('horizontal widget range ends at editor content right', () => {
            const sizes = [new Size2D(100, 20), new Size2D(100, 20), new Size2D(100, 20)];
            const lineRangeInfo = createLineRangeInfo(1, sizes, 0);
            const editorTrueContentRight = 500;
            const context = new WidgetPlacementContext(lineRangeInfo, 500, () => 0);
            const result = context.tryFindWidgetOutline(2, 15, editorTrueContentRight, defaultLayoutConstants);
            assert.ok(result !== undefined);
            assert.strictEqual(result.horizontalWidgetRange.endExclusive, editorTrueContentRight);
        });
    });
    suite('edge cases', () => {
        test('handles single line range', () => {
            const sizes = [new Size2D(100, 20)];
            const lineRangeInfo = createLineRangeInfo(5, sizes, 50);
            const context = new WidgetPlacementContext(lineRangeInfo, 500, () => 0);
            assert.strictEqual(context.availableSpaceSizes.length, 1);
            assert.deepStrictEqual(context.availableSpaceHeightPrefixSums, [0, 20]);
        });
        test('handles empty content lines (width 0)', () => {
            const sizes = [new Size2D(0, 20), new Size2D(0, 20)];
            const lineRangeInfo = createLineRangeInfo(1, sizes);
            const context = new WidgetPlacementContext(lineRangeInfo, 500, () => 0);
            assert.strictEqual(context.availableSpaceSizes[0].width, 500);
            assert.strictEqual(context.availableSpaceSizes[1].width, 500);
        });
        test('handles varying line heights', () => {
            const sizes = [new Size2D(100, 10), new Size2D(100, 30), new Size2D(100, 20)];
            const lineRangeInfo = createLineRangeInfo(1, sizes, 100);
            const context = new WidgetPlacementContext(lineRangeInfo, 500, () => 0);
            // Verify prefix sums account for varying heights
            assert.deepStrictEqual(context.availableSpaceHeightPrefixSums, [0, 10, 40, 60]);
        });
        test('handles very large line numbers', () => {
            const sizes = [new Size2D(100, 20)];
            const lineRangeInfo = createLineRangeInfo(10000, sizes, 0);
            const context = new WidgetPlacementContext(lineRangeInfo, 500, () => 0);
            const outline = context.getWidgetVerticalOutline(10000, 50, defaultLayoutConstants);
            assert.ok(outline !== undefined);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9uZ0Rpc3RhbmNlV2lkZ2V0UGxhY2VtZW50LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy90ZXN0L2Jyb3dzZXIvbG9uZ0Rpc3RhbmNlV2lkZ2V0UGxhY2VtZW50LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDeEUsT0FBTyxFQUF5QixzQkFBc0IsRUFBdUIsTUFBTSxpR0FBaUcsQ0FBQztBQUVyTCxLQUFLLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO0lBQ3BDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsU0FBUyxtQkFBbUIsQ0FBQyxTQUFpQixFQUFFLEtBQWUsRUFBRSxNQUFjLENBQUM7UUFDL0UsT0FBTztZQUNOLFNBQVMsRUFBRSxTQUFTLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDO1lBQ3RELEdBQUc7WUFDSCxLQUFLO1NBQ0wsQ0FBQztJQUNILENBQUM7SUFFRCxNQUFNLHNCQUFzQixHQUEwQjtRQUNyRCxtQkFBbUIsRUFBRSxDQUFDO1FBQ3RCLGFBQWEsRUFBRSxDQUFDO1FBQ2hCLFlBQVksRUFBRSxDQUFDO1FBQ2YsY0FBYyxFQUFFLEVBQUU7UUFDbEIsY0FBYyxFQUFFLEVBQUU7S0FDbEIsQ0FBQztJQUVGLEtBQUssQ0FBQywrQ0FBK0MsRUFBRSxHQUFHLEVBQUU7UUFDM0QsSUFBSSxDQUFDLDBEQUEwRCxFQUFFLEdBQUcs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