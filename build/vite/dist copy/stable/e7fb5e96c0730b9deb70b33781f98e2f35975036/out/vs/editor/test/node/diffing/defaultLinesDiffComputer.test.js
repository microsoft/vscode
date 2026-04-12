/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Range } from '../../../common/core/range.js';
import { getLineRangeMapping, RangeMapping } from '../../../common/diff/rangeMapping.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { LinesSliceCharSequence } from '../../../common/diff/defaultLinesDiffComputer/linesSliceCharSequence.js';
import { MyersDiffAlgorithm } from '../../../common/diff/defaultLinesDiffComputer/algorithms/myersDiffAlgorithm.js';
import { DynamicProgrammingDiffing } from '../../../common/diff/defaultLinesDiffComputer/algorithms/dynamicProgrammingDiffing.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ArrayText } from '../../../common/core/text/abstractText.js';
suite('myers', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('1', () => {
        const s1 = new LinesSliceCharSequence(['hello world'], new Range(1, 1, 1, Number.MAX_SAFE_INTEGER), true);
        const s2 = new LinesSliceCharSequence(['hallo welt'], new Range(1, 1, 1, Number.MAX_SAFE_INTEGER), true);
        const a = true ? new MyersDiffAlgorithm() : new DynamicProgrammingDiffing();
        a.compute(s1, s2);
    });
});
suite('lineRangeMapping', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Simple', () => {
        assert.deepStrictEqual(getLineRangeMapping(new RangeMapping(new Range(2, 1, 3, 1), new Range(2, 1, 2, 1)), new ArrayText([
            'const abc = "helloworld".split("");',
            '',
            ''
        ]), new ArrayText([
            'const asciiLower = "helloworld".split("");',
            ''
        ])).toString(), '{[2,3)->[2,2)}');
    });
    test('Empty Lines', () => {
        assert.deepStrictEqual(getLineRangeMapping(new RangeMapping(new Range(2, 1, 2, 1), new Range(2, 1, 4, 1)), new ArrayText([
            '',
            '',
        ]), new ArrayText([
            '',
            '',
            '',
            '',
        ])).toString(), '{[2,2)->[2,4)}');
    });
});
suite('LinesSliceCharSequence', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const sequence = new LinesSliceCharSequence([
        'line1: foo',
        'line2: fizzbuzz',
        'line3: barr',
        'line4: hello world',
        'line5: bazz',
    ], new Range(2, 1, 5, 1), true);
    test('translateOffset', () => {
        assert.deepStrictEqual({ result: OffsetRange.ofLength(sequence.length).map(offset => sequence.translateOffset(offset).toString()) }, ({
            result: [
                '(2,1)', '(2,2)', '(2,3)', '(2,4)', '(2,5)', '(2,6)', '(2,7)', '(2,8)', '(2,9)', '(2,10)', '(2,11)',
                '(2,12)', '(2,13)', '(2,14)', '(2,15)', '(2,16)',
                '(3,1)', '(3,2)', '(3,3)', '(3,4)', '(3,5)', '(3,6)', '(3,7)', '(3,8)', '(3,9)', '(3,10)', '(3,11)', '(3,12)',
                '(4,1)', '(4,2)', '(4,3)', '(4,4)', '(4,5)', '(4,6)', '(4,7)', '(4,8)', '(4,9)',
                '(4,10)', '(4,11)', '(4,12)', '(4,13)', '(4,14)', '(4,15)', '(4,16)', '(4,17)',
                '(4,18)', '(4,19)'
            ]
        }));
    });
    test('extendToFullLines', () => {
        assert.deepStrictEqual({ result: sequence.getText(sequence.extendToFullLines(new OffsetRange(20, 25))) }, ({ result: 'line3: barr\n' }));
        assert.deepStrictEqual({ result: sequence.getText(sequence.extendToFullLines(new OffsetRange(20, 45))) }, ({ result: 'line3: barr\nline4: hello world\n' }));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdExpbmVzRGlmZkNvbXB1dGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9ub2RlL2RpZmZpbmcvZGVmYXVsdExpbmVzRGlmZkNvbXB1dGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHlFQUF5RSxDQUFDO0FBQ2pILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGdGQUFnRixDQUFDO0FBQ3BILE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHVGQUF1RixDQUFDO0FBQ2xJLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUV0RSxLQUFLLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtJQUNuQix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFO1FBQ2QsTUFBTSxFQUFFLEdBQUcsSUFBSSxzQkFBc0IsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzFHLE1BQU0sRUFBRSxHQUFHLElBQUksc0JBQXNCLENBQUMsQ0FBQyxZ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