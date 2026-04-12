/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { TextReplacement } from '../../../../common/core/edits/textEdit.js';
import { TextEditInfo } from '../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/beforeEditPositionMapper.js';
import { combineTextEditInfos } from '../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/combineTextEditInfos.js';
import { lengthAdd, lengthToObj, lengthToPosition, positionToLength, toLength } from '../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/length.js';
import { Random } from '../../core/random.js';
import { createTextModel } from '../../testTextModel.js';
suite('combineTextEditInfos', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    for (let seed = 0; seed < 50; seed++) {
        test('test' + seed, () => {
            runTest(seed);
        });
    }
});
function runTest(seed) {
    const rng = Random.create(seed);
    const str = 'abcde\nfghij\nklmno\npqrst\n';
    const textModelS0 = createTextModel(str);
    const edits1 = getRandomEditInfos(textModelS0, rng.nextIntRange(1, 4), rng);
    const textModelS1 = createTextModel(textModelS0.getValue());
    textModelS1.applyEdits(edits1.map(e => toEdit(e)));
    const edits2 = getRandomEditInfos(textModelS1, rng.nextIntRange(1, 4), rng);
    const textModelS2 = createTextModel(textModelS1.getValue());
    textModelS2.applyEdits(edits2.map(e => toEdit(e)));
    const combinedEdits = combineTextEditInfos(edits1, edits2);
    for (const edit of combinedEdits) {
        const range = Range.fromPositions(lengthToPosition(edit.startOffset), lengthToPosition(lengthAdd(edit.startOffset, edit.newLength)));
        const value = textModelS2.getValueInRange(range);
        if (!value.match(/^(L|C|\n)*$/)) {
            throw new Error('Invalid edit: ' + value);
        }
        textModelS2.applyEdits([{
                range,
                text: textModelS0.getValueInRange(Range.fromPositions(lengthToPosition(edit.startOffset), lengthToPosition(edit.endOffset))),
            }]);
    }
    assert.deepStrictEqual(textModelS2.getValue(), textModelS0.getValue());
    textModelS0.dispose();
    textModelS1.dispose();
    textModelS2.dispose();
}
export function getRandomEditInfos(textModel, count, rng, disjoint = false) {
    const edits = [];
    let i = 0;
    for (let j = 0; j < count; j++) {
        edits.push(getRandomEdit(textModel, i, rng));
        i = textModel.getOffsetAt(lengthToPosition(edits[j].endOffset)) + (disjoint ? 1 : 0);
    }
    return edits;
}
function getRandomEdit(textModel, rangeOffsetStart, rng) {
    const textModelLength = textModel.getValueLength();
    const offsetStart = rng.nextIntRange(rangeOffsetStart, textModelLength);
    const offsetEnd = rng.nextIntRange(offsetStart, textModelLength);
    const lineCount = rng.nextIntRange(0, 3);
    const columnCount = rng.nextIntRange(0, 5);
    return new TextEditInfo(positionToLength(textModel.getPositionAt(offsetStart)), positionToLength(textModel.getPositionAt(offsetEnd)), toLength(lineCount, columnCount));
}
function toEdit(editInfo) {
    const l = lengthToObj(editInfo.newLength);
    let text = '';
    for (let i = 0; i < l.lineCount; i++) {
        text += 'LLL\n';
    }
    for (let i = 0; i < l.columnCount; i++) {
        text += 'C';
    }
    return new TextReplacement(Range.fromPositions(lengthToPosition(editInfo.startOffset), lengthToPosition(editInfo.endOffset)), text);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tYmluZVRleHRFZGl0SW5mb3MudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2RlbC9icmFja2V0UGFpckNvbG9yaXplci9jb21iaW5lVGV4dEVkaXRJbmZvcy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpR0FBaUcsQ0FBQztBQUMvSCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw2RkFBNkYsQ0FBQztBQUNuSSxPQUFPLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxnQkFBZ0IsRUFBRSxnQkFBZ0IsRUFBRSxRQUFRLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUVySyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDOUMsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRXpELEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7SUFDbEMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLElBQUksSUFBSSxHQUFHLENBQUMsRUFBRSxJQUFJLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxFQUFFLENBQUM7UUFDdEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLEVBQUUsR0FBRyxFQUFFO1lBQ3hCLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNmLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FB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