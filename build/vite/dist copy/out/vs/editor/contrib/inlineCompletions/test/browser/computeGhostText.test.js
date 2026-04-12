/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { TextReplacement } from '../../../../common/core/edits/textEdit.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { computeGhostText } from '../../browser/model/computeGhostText.js';
suite('computeGhostText', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function getOutput(text, suggestion) {
        const rangeStartOffset = text.indexOf('[');
        const rangeEndOffset = text.indexOf(']') - 1;
        const cleanedText = text.replace('[', '').replace(']', '');
        const tempModel = createTextModel(cleanedText);
        const range = Range.fromPositions(tempModel.getPositionAt(rangeStartOffset), tempModel.getPositionAt(rangeEndOffset));
        const options = ['prefix', 'subword'];
        // eslint-disable-next-line local/code-no-any-casts
        const result = {};
        for (const option of options) {
            result[option] = computeGhostText(new TextReplacement(range, suggestion), tempModel, option)?.render(cleanedText, true);
        }
        tempModel.dispose();
        if (new Set(Object.values(result)).size === 1) {
            return Object.values(result)[0];
        }
        return result;
    }
    test('Basic', () => {
        assert.deepStrictEqual(getOutput('[foo]baz', 'foobar'), 'foo[bar]baz');
        assert.deepStrictEqual(getOutput('[aaa]aaa', 'aaaaaa'), 'aaa[aaa]aaa');
        assert.deepStrictEqual(getOutput('[foo]baz', 'boobar'), undefined);
        assert.deepStrictEqual(getOutput('[foo]foo', 'foofoo'), 'foo[foo]foo');
        assert.deepStrictEqual(getOutput('foo[]', 'bar\nhello'), 'foo[bar\nhello]');
    });
    test('Empty ghost text', () => {
        assert.deepStrictEqual(getOutput('[foo]', 'foo'), 'foo');
    });
    test('Whitespace (indentation)', () => {
        assert.deepStrictEqual(getOutput('[ foo]', 'foobar'), ' foo[bar]');
        assert.deepStrictEqual(getOutput('[\tfoo]', 'foobar'), '\tfoo[bar]');
        assert.deepStrictEqual(getOutput('[\t foo]', '\tfoobar'), '	 foo[bar]');
        assert.deepStrictEqual(getOutput('[\tfoo]', '\t\tfoobar'), { prefix: undefined, subword: '\t[\t]foo[bar]' });
        assert.deepStrictEqual(getOutput('[\t]', '\t\tfoobar'), '\t[\tfoobar]');
        assert.deepStrictEqual(getOutput('\t[]', '\t'), '\t[\t]');
        assert.deepStrictEqual(getOutput('\t[\t]', ''), '\t\t');
        assert.deepStrictEqual(getOutput('[ ]', 'return 1'), ' [return 1]');
    });
    test('Whitespace (outside of indentation)', () => {
        assert.deepStrictEqual(getOutput('bar[ foo]', 'foobar'), undefined);
        assert.deepStrictEqual(getOutput('bar[\tfoo]', 'foobar'), undefined);
    });
    test('Unsupported Case', () => {
        assert.deepStrictEqual(getOutput('fo[o\n]', 'x\nbar'), undefined);
    });
    test('New Line', () => {
        assert.deepStrictEqual(getOutput('fo[o\n]', 'o\nbar'), 'foo\n[bar]');
    });
    test('Multi Part Diffing', () => {
        assert.deepStrictEqual(getOutput('foo[()]', '(x);'), { prefix: undefined, subword: 'foo([x])[;]' });
        assert.deepStrictEqual(getOutput('[\tfoo]', '\t\tfoobar'), { prefix: undefined, subword: '\t[\t]foo[bar]' });
        assert.deepStrictEqual(getOutput('[(y ===)]', '(y === 1) { f(); }'), { prefix: undefined, subword: '(y ===[ 1])[ { f(); }]' });
        assert.deepStrictEqual(getOutput('[(y ==)]', '(y === 1) { f(); }'), { prefix: undefined, subword: '(y ==[= 1])[ { f(); }]' });
        assert.deepStrictEqual(getOutput('[(y ==)]', '(y === 1) { f(); }'), { prefix: undefined, subword: '(y ==[= 1])[ { f(); }]' });
    });
    test('Multi Part Diffing 1', () => {
        assert.deepStrictEqual(getOutput('[if () ()]', 'if (1 == f()) ()'), { prefix: undefined, subword: 'if ([1 == f()]) ()' });
    });
    test('Multi Part Diffing 2', () => {
        assert.deepStrictEqual(getOutput('[)]', '())'), ({ prefix: undefined, subword: '[(])[)]' }));
        assert.deepStrictEqual(getOutput('[))]', '(())'), ({ prefix: undefined, subword: '[((]))' }));
    });
    test('Parenthesis Matching', () => {
        assert.deepStrictEqual(getOutput('[console.log()]', 'console.log({ label: "(" })'), {
            prefix: undefined,
            subword: 'console.log([{ label: "(" }])'
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcHV0ZUdob3N0VGV4dC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvdGVzdC9icm93c2VyL2NvbXB1dGVHaG9zdFRleHQudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDM0UsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFM0UsS0FBSyxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRTtJQUM5Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLFNBQVMsU0FBUyxDQUFDLElBQVksRUFBRSxVQUFrQjtRQUNsRCxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDM0MsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDN0MsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMzRCxNQUFNLFNBQVMsR0FBRyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDL0MsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsYUFB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