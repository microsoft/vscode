/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Range } from '../../../common/core/range.js';
import { DecorationSegment, LineDecoration, LineDecorationsNormalizer } from '../../../common/viewLayout/lineDecorations.js';
import { InlineDecoration } from '../../../common/viewModel/inlineDecorations.js';
suite('Editor ViewLayout - ViewLineParts', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Bug 9827:Overlapping inline decorations can cause wrong inline class to be applied', () => {
        const result = LineDecorationsNormalizer.normalize('abcabcabcabcabcabcabcabcabcabc', [
            new LineDecoration(1, 11, 'c1', 0 /* InlineDecorationType.Regular */),
            new LineDecoration(3, 4, 'c2', 0 /* InlineDecorationType.Regular */)
        ]);
        assert.deepStrictEqual(result, [
            new DecorationSegment(0, 1, 'c1', 0),
            new DecorationSegment(2, 2, 'c2 c1', 0),
            new DecorationSegment(3, 9, 'c1', 0),
        ]);
    });
    test('issue #3462: no whitespace shown at the end of a decorated line', () => {
        const result = LineDecorationsNormalizer.normalize('abcabcabcabcabcabcabcabcabcabc', [
            new LineDecoration(15, 21, 'mtkw', 0 /* InlineDecorationType.Regular */),
            new LineDecoration(20, 21, 'inline-folded', 0 /* InlineDecorationType.Regular */),
        ]);
        assert.deepStrictEqual(result, [
            new DecorationSegment(14, 18, 'mtkw', 0),
            new DecorationSegment(19, 19, 'mtkw inline-folded', 0)
        ]);
    });
    test('issue #3661: Link decoration bleeds to next line when wrapping', () => {
        const result = LineDecoration.filter([
            new InlineDecoration(new Range(2, 12, 3, 30), 'detected-link', 0 /* InlineDecorationType.Regular */)
        ], 3, 12, 500);
        assert.deepStrictEqual(result, [
            new LineDecoration(12, 30, 'detected-link', 0 /* InlineDecorationType.Regular */),
        ]);
    });
    test('issue #37401: Allow both before and after decorations on empty line', () => {
        const result = LineDecoration.filter([
            new InlineDecoration(new Range(4, 1, 4, 2), 'before', 1 /* InlineDecorationType.Before */),
            new InlineDecoration(new Range(4, 0, 4, 1), 'after', 2 /* InlineDecorationType.After */),
        ], 4, 1, 500);
        assert.deepStrictEqual(result, [
            new LineDecoration(1, 2, 'before', 1 /* InlineDecorationType.Before */),
            new LineDecoration(0, 1, 'after', 2 /* InlineDecorationType.After */),
        ]);
    });
    test('ViewLineParts', () => {
        assert.deepStrictEqual(LineDecorationsNormalizer.normalize('abcabcabcabcabcabcabcabcabcabc', [
            new LineDecoration(1, 2, 'c1', 0 /* InlineDecorationType.Regular */),
            new LineDecoration(3, 4, 'c2', 0 /* InlineDecorationType.Regular */)
        ]), [
            new DecorationSegment(0, 0, 'c1', 0),
            new DecorationSegment(2, 2, 'c2', 0)
        ]);
        assert.deepStrictEqual(LineDecorationsNormalizer.normalize('abcabcabcabcabcabcabcabcabcabc', [
            new LineDecoration(1, 3, 'c1', 0 /* InlineDecorationType.Regular */),
            new LineDecoration(3, 4, 'c2', 0 /* InlineDecorationType.Regular */)
        ]), [
            new DecorationSegment(0, 1, 'c1', 0),
            new DecorationSegment(2, 2, 'c2', 0)
        ]);
        assert.deepStrictEqual(LineDecorationsNormalizer.normalize('abcabcabcabcabcabcabcabcabcabc', [
            new LineDecoration(1, 4, 'c1', 0 /* InlineDecorationType.Regular */),
            new LineDecoration(3, 4, 'c2', 0 /* InlineDecorationType.Regular */)
        ]), [
            new DecorationSegment(0, 1, 'c1', 0),
            new DecorationSegment(2, 2, 'c1 c2', 0)
        ]);
        assert.deepStrictEqual(LineDecorationsNormalizer.normalize('abcabcabcabcabcabcabcabcabcabc', [
            new LineDecoration(1, 4, 'c1', 0 /* InlineDecorationType.Regular */),
            new LineDecoration(1, 4, 'c1*', 0 /* InlineDecorationType.Regular */),
            new LineDecoration(3, 4, 'c2', 0 /* InlineDecorationType.Regular */)
        ]), [
            new DecorationSegment(0, 1, 'c1 c1*', 0),
            new DecorationSegment(2, 2, 'c1 c1* c2', 0)
        ]);
        assert.deepStrictEqual(LineDecorationsNormalizer.normalize('abcabcabcabcabcabcabcabcabcabc', [
            new LineDecoration(1, 4, 'c1', 0 /* InlineDecorationType.Regular */),
            new LineDecoration(1, 4, 'c1*', 0 /* InlineDecorationType.Regular */),
            new LineDecoration(1, 4, 'c1**', 0 /* InlineDecorationType.Regular */),
            new LineDecoration(3, 4, 'c2', 0 /* InlineDecorationType.Regular */)
        ]), [
            new DecorationSegment(0, 1, 'c1 c1* c1**', 0),
            new DecorationSegment(2, 2, 'c1 c1* c1** c2', 0)
        ]);
        assert.deepStrictEqual(LineDecorationsNormalizer.normalize('abcabcabcabcabcabcabcabcabcabc', [
            new LineDecoration(1, 4, 'c1', 0 /* InlineDecorationType.Regular */),
            new LineDecoration(1, 4, 'c1*', 0 /* InlineDecorationType.Regular */),
            new LineDecoration(1, 4, 'c1**', 0 /* InlineDecorationType.Regular */),
            new LineDecoration(3, 4, 'c2', 0 /* InlineDecorationType.Regular */),
            new LineDecoration(3, 4, 'c2*', 0 /* InlineDecorationType.Regular */)
        ]), [
            new DecorationSegment(0, 1, 'c1 c1* c1**', 0),
            new DecorationSegment(2, 2, 'c1 c1* c1** c2 c2*', 0)
        ]);
        assert.deepStrictEqual(LineDecorationsNormalizer.normalize('abcabcabcabcabcabcabcabcabcabc', [
            new LineDecoration(1, 4, 'c1', 0 /* InlineDecorationType.Regular */),
            new LineDecoration(1, 4, 'c1*', 0 /* InlineDecorationType.Regular */),
            new LineDecoration(1, 4, 'c1**', 0 /* InlineDecorationType.Regular */),
            new LineDecoration(3, 4, 'c2', 0 /* InlineDecorationType.Regular */),
            new LineDecoration(3, 5, 'c2*', 0 /* InlineDecorationType.Regular */)
        ]), [
            new DecorationSegment(0, 1, 'c1 c1* c1**', 0),
            new DecorationSegment(2, 2, 'c1 c1* c1** c2 c2*', 0),
            new DecorationSegment(3, 3, 'c2*', 0)
        ]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGluZURlY29yYXRpb25zLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9jb21tb24vdmlld0xheW91dC9saW5lRGVjb3JhdGlvbnMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxjQUFjLEVBQUUseUJBQXlCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM3SCxPQUFPLEVBQUUsZ0JBQWdCLEVBQXdCLE1BQU0sZ0RBQWdELENBQUM7QUFFeEcsS0FBSyxDQUFDLG1DQUFtQyxFQUFFLEdBQUcsRUFBRTtJQUUvQyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyxvRkFBb0YsRUFBRSxHQUFHLEVBQUU7UUFFL0YsTUFBTSxNQUFNLEdBQUcseUJBQXlCLENBQUMsU0FBUyxDQUFDLGdDQUFnQyxFQUFFO1lBQ3BGLElBQUksY0FBYyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsSUFBSSx1Q0FBK0I7WUFDN0QsSUFBSSxjQUFjLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLHVDQUErQjtTQUM1RCxDQUFDLENBQUM7UUFFSCxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRTtZQUM5QixJQUFJLGlCQUFpQixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUNwQyxJQUFJLGlCQUFpQixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUN2QyxJQUFJLGlCQUFpQixDQUFD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