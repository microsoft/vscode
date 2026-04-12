/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Position } from '../../../../common/core/position.js';
import { getSecondaryEdits } from '../../browser/model/inlineCompletionsModel.js';
import { TextEdit, TextReplacement } from '../../../../common/core/edits/textEdit.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { Range } from '../../../../common/core/range.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isDefined } from '../../../../../base/common/types.js';
suite('getSecondaryEdits', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('basic', async function () {
        const textModel = createTextModel([
            'function fib(',
            'function fib('
        ].join('\n'));
        const positions = [
            new Position(1, 14),
            new Position(2, 14)
        ];
        const primaryEdit = new TextReplacement(new Range(1, 1, 1, 14), 'function fib() {');
        const secondaryEdits = getSecondaryEdits(textModel, positions, primaryEdit);
        assert.deepStrictEqual(secondaryEdits, [new TextReplacement(new Range(2, 14, 2, 14), ') {')]);
        textModel.dispose();
    });
    test('cursor not on same line as primary edit 1', async function () {
        const textModel = createTextModel([
            'function fib(',
            '',
            'function fib(',
            ''
        ].join('\n'));
        const positions = [
            new Position(2, 1),
            new Position(4, 1)
        ];
        const primaryEdit = new TextReplacement(new Range(1, 1, 2, 1), [
            'function fib() {',
            '	return 0;',
            '}'
        ].join('\n'));
        const secondaryEdits = getSecondaryEdits(textModel, positions, primaryEdit);
        assert.deepStrictEqual(TextEdit.fromParallelReplacementsUnsorted(secondaryEdits.filter(isDefined)).toString(textModel.getValue()), '...ction fib(❰\n↦) {\n\t... 0;\n}❱');
        textModel.dispose();
    });
    test('cursor not on same line as primary edit 2', async function () {
        const textModel = createTextModel([
            'class A {',
            '',
            'class B {',
            '',
            'function f() {}'
        ].join('\n'));
        const positions = [
            new Position(2, 1),
            new Position(4, 1)
        ];
        const primaryEdit = new TextReplacement(new Range(1, 1, 2, 1), [
            'class A {',
            '	public x: number = 0;',
            '   public y: number = 0;',
            '}'
        ].join('\n'));
        const secondaryEdits = getSecondaryEdits(textModel, positions, primaryEdit);
        assert.deepStrictEqual(secondaryEdits, [new TextReplacement(new Range(4, 1, 4, 1), [
                '	public x: number = 0;',
                '   public y: number = 0;',
                '}'
            ].join('\n'))]);
        textModel.dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0U2Vjb25kYXJ5RWRpdHMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL3Rlc3QvYnJvd3Nlci9nZXRTZWNvbmRhcnlFZGl0cy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDbEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxlQUFlLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN0RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDM0UsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUVoRSxLQUFLLENBQUMsbUJBQW1CLEVBQUUsR0FBRyxFQUFFO0lBRS9CLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxLQUFLO1FBRWxCLE1BQU0sU0FBUyxHQUFHLGVBQWUsQ0FBQztZQUNqQyxlQUFlO1lBQ2YsZUFBZTtTQUNmLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDZCxNQUFNLFNBQVMsR0FBRztZQUNqQixJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ25CLElBQUksUUFBUSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDbkIsQ0FBQztRQUNGLE1BQU0sV0FBVyxHQUFHLElBQUksZUFB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