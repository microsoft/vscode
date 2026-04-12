/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { testApplyEditsWithSyncedModels } from './editableTextModelTestUtils.js';
const GENERATE_TESTS = false;
suite('EditorModel Auto Tests', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function editOp(startLineNumber, startColumn, endLineNumber, endColumn, text) {
        return {
            range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
            text: text.join('\n'),
            forceMoveMarkers: false
        };
    }
    test('auto1', () => {
        testApplyEditsWithSyncedModels([
            'ioe',
            '',
            'yjct',
            '',
            '',
        ], [
            editOp(1, 2, 1, 2, ['b', 'r', 'fq']),
            editOp(1, 4, 2, 1, ['', '']),
        ], [
            'ib',
            'r',
            'fqoe',
            '',
            'yjct',
            '',
            '',
        ]);
    });
    test('auto2', () => {
        testApplyEditsWithSyncedModels([
            'f',
            'littnhskrq',
            'utxvsizqnk',
            'lslqz',
            'jxn',
            'gmm',
        ], [
            editOp(1, 2, 1, 2, ['', 'o']),
            editOp(2, 4, 2, 4, ['zaq', 'avb']),
            editOp(2, 5, 6, 2, ['jlr', 'zl', 'j']),
        ], [
            'f',
            'o',
            'litzaq',
            'avbtjlr',
            'zl',
            'jmm',
        ]);
    });
    test('auto3', () => {
        testApplyEditsWithSyncedModels([
            'ofw',
            'qsxmziuvzw',
            'rp',
            'qsnymek',
            'elth',
            'wmgzbwudxz',
            'iwsdkndh',
            'bujlbwb',
            'asuouxfv',
            'xuccnb',
        ], [
            editOp(4, 3, 4, 3, ['']),
        ], [
            'ofw',
            'qsxmziuvzw',
            'rp',
            'qsnymek',
            'elth',
            'wmgzbwudxz',
            'iwsdkndh',
            'bujlbwb',
            'asuouxfv',
            'xuccnb',
        ]);
    });
    test('auto4', () => {
        testApplyEditsWithSyncedModels([
            'fefymj',
            'qum',
            'vmiwxxaiqq',
            'dz',
            'lnqdgorosf',
        ], [
            editOp(1, 3, 1, 5, ['hp']),
            editOp(1, 7, 2, 1, ['kcg', '', 'mpx']),
            editOp(2, 2, 2, 2, ['', 'aw', '']),
            editOp(2, 2, 2, 2, ['vqr', 'mo']),
            editOp(4, 2, 5, 3, ['xyc']),
        ], [
            'fehpmjkcg',
            '',
            'mpxq',
            'aw',
            'vqr',
            'moum',
            'vmiwxxaiqq',
            'dxycqdgorosf',
        ]);
    });
});
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getRandomString(minLength, maxLength) {
    const length = getRandomInt(minLength, maxLength);
    let r = '';
    for (let i = 0; i < length; i++) {
        r += String.fromCharCode(getRandomInt(97 /* CharCode.a */, 122 /* CharCode.z */));
    }
    return r;
}
function generateFile(small) {
    const lineCount = getRandomInt(1, small ? 3 : 10);
    const lines = [];
    for (let i = 0; i < lineCount; i++) {
        lines.push(getRandomString(0, small ? 3 : 10));
    }
    return lines.join('\n');
}
function generateEdits(content) {
    const result = [];
    let cnt = getRandomInt(1, 5);
    let maxOffset = content.length;
    while (cnt > 0 && maxOffset > 0) {
        const offset = getRandomInt(0, maxOffset);
        const length = getRandomInt(0, maxOffset - offset);
        const text = generateFile(true);
        result.push({
            offset: offset,
            length: length,
            text: text
        });
        maxOffset = offset;
        cnt--;
    }
    result.reverse();
    return result;
}
class TestModel {
    static _generateOffsetToPosition(content) {
        const result = [];
        let lineNumber = 1;
        let column = 1;
        for (let offset = 0, len = content.length; offset <= len; offset++) {
            const ch = content.charAt(offset);
            result[offset] = new Position(lineNumber, column);
            if (ch === '\n') {
                lineNumber++;
                column = 1;
            }
            else {
                column++;
            }
        }
        return result;
    }
    constructor() {
        this.initialContent = generateFile(false);
        const edits = generateEdits(this.initialContent);
        const offsetToPosition = TestModel._generateOffsetToPosition(this.initialContent);
        this.edits = [];
        for (const edit of edits) {
            const startPosition = offsetToPosition[edit.offset];
            const endPosition = offsetToPosition[edit.offset + edit.length];
            this.edits.push({
                range: new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column),
                text: edit.text
            });
        }
        this.resultingContent = this.initialContent;
        for (let i = edits.length - 1; i >= 0; i--) {
            this.resultingContent = (this.resultingContent.substring(0, edits[i].offset) +
                edits[i].text +
                this.resultingContent.substring(edits[i].offset + edits[i].length));
        }
    }
    print() {
        let r = [];
        r.push('testApplyEditsWithSyncedModels(');
        r.push('\t[');
        const initialLines = this.initialContent.split('\n');
        r = r.concat(initialLines.map((i) => `\t\t'${i}',`));
        r.push('\t],');
        r.push('\t[');
        r = r.concat(this.edits.map((i) => {
            const text = `['` + i.text.split('\n').join(`', '`) + `']`;
            return `\t\teditOp(${i.range.startLineNumber}, ${i.range.startColumn}, ${i.range.endLineNumber}, ${i.range.endColumn}, ${text}),`;
        }));
        r.push('\t],');
        r.push('\t[');
        const resultLines = this.resultingContent.split('\n');
        r = r.concat(resultLines.map((i) => `\t\t'${i}',`));
        r.push('\t]');
        r.push(');');
        return r.join('\n');
    }
}
if (GENERATE_TESTS) {
    let number = 1;
    while (true) {
        console.log('------BEGIN NEW TEST: ' + number);
        const testModel = new TestModel();
        // console.log(testModel.print());
        console.log('------END NEW TEST: ' + (number++));
        try {
            testApplyEditsWithSyncedModels(testModel.initialContent.split('\n'), testModel.edits, testModel.resultingContent.split('\n'));
            // throw new Error('a');
        }
        catch (err) {
            console.log(err);
            console.log(testModel.print());
            break;
        }
        // break;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdGFibGVUZXh0TW9kZWxBdXRvLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9jb21tb24vbW9kZWwvZWRpdGFibGVUZXh0TW9kZWxBdXRvLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUVqRixNQUFNLGNBQWMsR0FBRyxLQUFLLENBQUM7QUFFN0IsS0FBSyxDQUFDLHdCQUF3QixFQUFFLEdBQUcsRUFBRTtJQUVwQyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLFNBQVMsTUFBTSxDQUFDLGVBQXVCLEVBQUUsV0FBbUIsRUFBRSxhQUFxQixFQUFFLFNBQWlCLEVBQUUsSUFBYztRQUNySCxPQUFPO1lBQ04sS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLGVBQWUsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLFNBQVMsQ0FBQztZQUN4RSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7WUFDckIsZ0JBQWdCLEVBQUUsS0FBSztTQUN2QixDQUFDO0lBQ0gsQ0FBQztJQUVELElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFO1FBQ2xCLDhCQUE4QixDQUM3QjtZQUNDLEtBQUs7WUFDTCxFQUFFO1lBQ0YsTUFBTTtZQUNOLEVBQUU7WUFDRixFQUFFO1NBQ0YsRUFDRDtZQUNDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxH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