/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { splitLines } from '../../../../../base/common/strings.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { BeforeEditPositionMapper, TextEditInfo } from '../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/beforeEditPositionMapper.js';
import { lengthOfString, lengthToObj, lengthToPosition, toLength } from '../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/length.js';
suite('Bracket Pair Colorizer - BeforeEditPositionMapper', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Single-Line 1', () => {
        assert.deepStrictEqual(compute([
            '0123456789',
        ], [
            new TextEdit(toLength(0, 4), toLength(0, 7), 'xy')
        ]), [
            '0  1  2  3  x  y  7  8  9  ', // The line
            '0  0  0  0  0  0  0  0  0  0  ', // the old line numbers
            '0  1  2  3  4  5  7  8  9  10 ', // the old columns
            '0  0  0  0  0  0  ∞  ∞  ∞  ∞  ', // line count until next change
            '4  3  2  1  0  0  ∞  ∞  ∞  ∞  ', // column count until next change
        ]);
    });
    test('Single-Line 2', () => {
        assert.deepStrictEqual(compute([
            '0123456789',
        ], [
            new TextEdit(toLength(0, 2), toLength(0, 4), 'xxxx'),
            new TextEdit(toLength(0, 6), toLength(0, 6), 'yy')
        ]), [
            '0  1  x  x  x  x  4  5  y  y  6  7  8  9  ',
            '0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  ',
            '0  1  2  3  4  5  4  5  6  7  6  7  8  9  10 ',
            '0  0  0  0  0  0  0  0  0  0  ∞  ∞  ∞  ∞  ∞  ',
            '2  1  0  0  0  0  2  1  0  0  ∞  ∞  ∞  ∞  ∞  ',
        ]);
    });
    test('Multi-Line Replace 1', () => {
        assert.deepStrictEqual(compute([
            '₀₁₂₃₄₅₆₇₈₉',
            '0123456789',
            '⁰¹²³⁴⁵⁶⁷⁸⁹',
        ], [
            new TextEdit(toLength(0, 3), toLength(1, 3), 'xy'),
        ]), [
            '₀  ₁  ₂  x  y  3  4  5  6  7  8  9  ',
            '0  0  0  0  0  1  1  1  1  1  1  1  1  ',
            '0  1  2  3  4  3  4  5  6  7  8  9  10 ',
            '0  0  0  0  0  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ',
            '3  2  1  0  0  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ',
            // ------------------
            '⁰  ¹  ²  ³  ⁴  ⁵  ⁶  ⁷  ⁸  ⁹  ',
            '2  2  2  2  2  2  2  2  2  2  2  ',
            '0  1  2  3  4  5  6  7  8  9  10 ',
            '∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ',
            '∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ',
        ]);
    });
    test('Multi-Line Replace 2', () => {
        assert.deepStrictEqual(compute([
            '₀₁₂₃₄₅₆₇₈₉',
            '012345678',
            '⁰¹²³⁴⁵⁶⁷⁸⁹',
        ], [
            new TextEdit(toLength(0, 3), toLength(1, 0), 'ab'),
            new TextEdit(toLength(1, 5), toLength(1, 7), 'c'),
        ]), [
            '₀  ₁  ₂  a  b  0  1  2  3  4  c  7  8  ',
            '0  0  0  0  0  1  1  1  1  1  1  1  1  1  ',
            '0  1  2  3  4  0  1  2  3  4  5  7  8  9  ',
            '0  0  0  0  0  0  0  0  0  0  0  ∞  ∞  ∞  ',
            '3  2  1  0  0  5  4  3  2  1  0  ∞  ∞  ∞  ',
            // ------------------
            '⁰  ¹  ²  ³  ⁴  ⁵  ⁶  ⁷  ⁸  ⁹  ',
            '2  2  2  2  2  2  2  2  2  2  2  ',
            '0  1  2  3  4  5  6  7  8  9  10 ',
            '∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ',
            '∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ',
        ]);
    });
    test('Multi-Line Replace 3', () => {
        assert.deepStrictEqual(compute([
            '₀₁₂₃₄₅₆₇₈₉',
            '012345678',
            '⁰¹²³⁴⁵⁶⁷⁸⁹',
        ], [
            new TextEdit(toLength(0, 3), toLength(1, 0), 'ab'),
            new TextEdit(toLength(1, 5), toLength(1, 7), 'c'),
            new TextEdit(toLength(1, 8), toLength(2, 4), 'd'),
        ]), [
            '₀  ₁  ₂  a  b  0  1  2  3  4  c  7  d  ⁴  ⁵  ⁶  ⁷  ⁸  ⁹  ',
            '0  0  0  0  0  1  1  1  1  1  1  1  1  2  2  2  2  2  2  2  ',
            '0  1  2  3  4  0  1  2  3  4  5  7  8  4  5  6  7  8  9  10 ',
            '0  0  0  0  0  0  0  0  0  0  0  0  0  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ',
            '3  2  1  0  0  5  4  3  2  1  0  1  0  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ',
        ]);
    });
    test('Multi-Line Insert 1', () => {
        assert.deepStrictEqual(compute([
            '012345678',
        ], [
            new TextEdit(toLength(0, 3), toLength(0, 5), 'a\nb'),
        ]), [
            '0  1  2  a  ',
            '0  0  0  0  0  ',
            '0  1  2  3  4  ',
            '0  0  0  0  0  ',
            '3  2  1  0  0  ',
            // ------------------
            'b  5  6  7  8  ',
            '1  0  0  0  0  0  ',
            '0  5  6  7  8  9  ',
            '0  ∞  ∞  ∞  ∞  ∞  ',
            '0  ∞  ∞  ∞  ∞  ∞  ',
        ]);
    });
    test('Multi-Line Insert 2', () => {
        assert.deepStrictEqual(compute([
            '012345678',
        ], [
            new TextEdit(toLength(0, 3), toLength(0, 5), 'a\nb'),
            new TextEdit(toLength(0, 7), toLength(0, 8), 'x\ny'),
        ]), [
            '0  1  2  a  ',
            '0  0  0  0  0  ',
            '0  1  2  3  4  ',
            '0  0  0  0  0  ',
            '3  2  1  0  0  ',
            // ------------------
            'b  5  6  x  ',
            '1  0  0  0  0  ',
            '0  5  6  7  8  ',
            '0  0  0  0  0  ',
            '0  2  1  0  0  ',
            // ------------------
            'y  8  ',
            '1  0  0  ',
            '0  8  9  ',
            '0  ∞  ∞  ',
            '0  ∞  ∞  ',
        ]);
    });
    test('Multi-Line Replace/Insert 1', () => {
        assert.deepStrictEqual(compute([
            '₀₁₂₃₄₅₆₇₈₉',
            '012345678',
            '⁰¹²³⁴⁵⁶⁷⁸⁹',
        ], [
            new TextEdit(toLength(0, 3), toLength(1, 1), 'aaa\nbbb'),
        ]), [
            '₀  ₁  ₂  a  a  a  ',
            '0  0  0  0  0  0  0  ',
            '0  1  2  3  4  5  6  ',
            '0  0  0  0  0  0  0  ',
            '3  2  1  0  0  0  0  ',
            // ------------------
            'b  b  b  1  2  3  4  5  6  7  8  ',
            '1  1  1  1  1  1  1  1  1  1  1  1  ',
            '0  1  2  1  2  3  4  5  6  7  8  9  ',
            '0  0  0  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ',
            '0  0  0  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ',
            // ------------------
            '⁰  ¹  ²  ³  ⁴  ⁵  ⁶  ⁷  ⁸  ⁹  ',
            '2  2  2  2  2  2  2  2  2  2  2  ',
            '0  1  2  3  4  5  6  7  8  9  10 ',
            '∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ',
            '∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ',
        ]);
    });
    test('Multi-Line Replace/Insert 2', () => {
        assert.deepStrictEqual(compute([
            '₀₁₂₃₄₅₆₇₈₉',
            '012345678',
            '⁰¹²³⁴⁵⁶⁷⁸⁹',
        ], [
            new TextEdit(toLength(0, 3), toLength(1, 1), 'aaa\nbbb'),
            new TextEdit(toLength(1, 5), toLength(1, 5), 'x\ny'),
            new TextEdit(toLength(1, 7), toLength(2, 4), 'k\nl'),
        ]), [
            '₀  ₁  ₂  a  a  a  ',
            '0  0  0  0  0  0  0  ',
            '0  1  2  3  4  5  6  ',
            '0  0  0  0  0  0  0  ',
            '3  2  1  0  0  0  0  ',
            // ------------------
            'b  b  b  1  2  3  4  x  ',
            '1  1  1  1  1  1  1  1  1  ',
            '0  1  2  1  2  3  4  5  6  ',
            '0  0  0  0  0  0  0  0  0  ',
            '0  0  0  4  3  2  1  0  0  ',
            // ------------------
            'y  5  6  k  ',
            '2  1  1  1  1  ',
            '0  5  6  7  8  ',
            '0  0  0  0  0  ',
            '0  2  1  0  0  ',
            // ------------------
            'l  ⁴  ⁵  ⁶  ⁷  ⁸  ⁹  ',
            '2  2  2  2  2  2  2  2  ',
            '0  4  5  6  7  8  9  10 ',
            '0  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ',
            '0  ∞  ∞  ∞  ∞  ∞  ∞  ∞  ',
        ]);
    });
});
/** @pure */
function compute(inputArr, edits) {
    const newLines = splitLines(applyLineColumnEdits(inputArr.join('\n'), edits.map(e => ({
        text: e.newText,
        range: Range.fromPositions(lengthToPosition(e.startOffset), lengthToPosition(e.endOffset))
    }))));
    const mapper = new BeforeEditPositionMapper(edits);
    const result = new Array();
    let lineIdx = 0;
    for (const line of newLines) {
        let lineLine = '';
        let colLine = '';
        let lineStr = '';
        let colDist = '';
        let lineDist = '';
        for (let colIdx = 0; colIdx <= line.length; colIdx++) {
            const before = mapper.getOffsetBeforeChange(toLength(lineIdx, colIdx));
            const beforeObj = lengthToObj(before);
            if (colIdx < line.length) {
                lineStr += rightPad(line[colIdx], 3);
            }
            lineLine += rightPad('' + beforeObj.lineCount, 3);
            colLine += rightPad('' + beforeObj.columnCount, 3);
            const distLen = mapper.getDistanceToNextChange(toLength(lineIdx, colIdx));
            if (distLen === null) {
                lineDist += '∞  ';
                colDist += '∞  ';
            }
            else {
                const dist = lengthToObj(distLen);
                lineDist += rightPad('' + dist.lineCount, 3);
                colDist += rightPad('' + dist.columnCount, 3);
            }
        }
        result.push(lineStr);
        result.push(lineLine);
        result.push(colLine);
        result.push(lineDist);
        result.push(colDist);
        lineIdx++;
    }
    return result;
}
export class TextEdit extends TextEditInfo {
    constructor(startOffset, endOffset, newText) {
        super(startOffset, endOffset, lengthOfString(newText));
        this.newText = newText;
    }
}
class PositionOffsetTransformer {
    constructor(text) {
        this.lineStartOffsetByLineIdx = [];
        this.lineStartOffsetByLineIdx.push(0);
        for (let i = 0; i < text.length; i++) {
            if (text.charAt(i) === '\n') {
                this.lineStartOffsetByLineIdx.push(i + 1);
            }
        }
    }
    getOffset(position) {
        return this.lineStartOffsetByLineIdx[position.lineNumber - 1] + position.column - 1;
    }
}
function applyLineColumnEdits(text, edits) {
    const transformer = new PositionOffsetTransformer(text);
    const offsetEdits = edits.map(e => {
        const range = Range.lift(e.range);
        return ({
            startOffset: transformer.getOffset(range.getStartPosition()),
            endOffset: transformer.getOffset(range.getEndPosition()),
            text: e.text
        });
    });
    offsetEdits.sort((a, b) => b.startOffset - a.startOffset);
    for (const edit of offsetEdits) {
        text = text.substring(0, edit.startOffset) + edit.text + text.substring(edit.endOffset);
    }
    return text;
}
function rightPad(str, len) {
    while (str.length < len) {
        str += ' ';
    }
    return str;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmVmb3JlRWRpdFBvc2l0aW9uTWFwcGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9jb21tb24vbW9kZWwvYnJhY2tldFBhaXJDb2xvcml6ZXIvYmVmb3JlRWRpdFBvc2l0aW9uTWFwcGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDakUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLFlBQVksRUFBRSxNQUFNLGlHQUFpRyxDQUFDO0FBQ3pKLE9BQU8sRUFBVSxjQUFjLEVBQUUsV0FBVyxFQUFFLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBRWhLLEtBQUssQ0FBQyxtREFBbUQsRUFBRSxHQUFHLEVBQUU7SUFFL0QsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtRQUMxQixNQUFNLENBQUMsZUFBZSxDQUNyQixPQUFPLENBQ047WUFDQyxZQUFZO1NBQ1osRUFDRDtZQUNDLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUM7U0FDbEQsQ0FDRCxFQUNEO1lBQ0MsNkJBQTZCLEVBQUUsV0FBVztZQUUxQyxnQ0FBZ0MsRUFBRSx1QkFBdUI7WUFDekQsZ0NBQWdDLEVBQUUsa0JBQWtCO1lBRXBELGdDQUFnQyxFQUFFLCtCQUErQjtZQUNqRSxnQ0FBZ0MsRUFBRSxpQ0FBaUM7U0FDbkUsQ0FDRCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtRQUMxQixNQUFNLENBQUMsZUFBZSxDQUNyQixPQUFPLENBQ047WUFDQyxZQUFZO1NBQ1osRUFDRDtZQUNDLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUM7WUFDcEQsSUFBSSxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQztTQUNsRCxDQUNELEVBQ0Q7WUFDQyw0Q0FBNEM7WUFFNUMsK0NBQStDO1lBQy9DLCtDQUErQztZQUUvQywrQ0FBK0M7WUFDL0MsK0NBQStDO1NBQy9DLENBQ0QsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtRQUNqQyxNQUFNLENBQUMsZUFBZSxDQUNyQixPQUFPLENBQ047WUFDQyxZQUFZO1lBQ1osWUFBWTtZQUNaLFlBQVk7U0FFWixFQUNEO1lBQ0MsSUFBSSxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQztTQUNsRCxDQUNELEVBQ0Q7WUFDQyxzQ0FBc0M7WUFFdEMseUNBQXlDO1lBQ3pDLHlDQUF5QztZQUV6Qyx5Q0FBeUM7WUFDekMseUNBQXlDO1lBQ3pDLHFCQUFxQjtZQUNyQixnQ0FBZ0M7WUFFaEMsbUNBQW1DO1lBQ25DLG1DQUFtQztZQUVuQyxtQ0FBbUM7WUFDbkMsbUNBQW1DO1NBQ25DLENBQ0QsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtRQUNqQyxNQUFNLENBQUMsZUFBZSxDQUNyQixPQUFPLENBQ047WUFDQyxZQUFZO1lBQ1osV0FBVztZQUNYLFlBQVk7U0FFWixFQUNEO1lBQ0MsSUFBSSxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQztZQUNsRCxJQUFJLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDO1NBQ2pELENBQ0QsRUFDRDtZQUNDLHlDQUF5QztZQUV6Qyw0Q0FBNEM7WUFDNUMsNENBQTRDO1lBRTVDLDRDQUE0QztZQUM1Qyw0Q0FBNEM7WUFDNUMscUJBQXFCO1lBQ3JCLGdDQUFnQztZQUVoQyxtQ0FBbUM7WUFDbkMsbUNBQW1DO1lBRW5DLG1DQUFtQztZQUNuQyxtQ0FBbUM7U0FDbkMsQ0FDRCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO1FBQ2pDLE1BQU0sQ0FBQyxlQUFlLENBQ3JCLE9BQU8sQ0FDTjtZQUNDLFlBQVk7WUFDWixXQUFXO1lBQ1gsWUFBWTtTQUVaLEVBQ0Q7WUFDQyxJQUFJLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDO1lBQ2xELElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUM7WUFDakQsSUFBSSxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQztTQUNqRCxDQUNELEVBQ0Q7WUFDQywyREFBMkQ7WUFFM0QsOERBQThEO1lBQzlELDhEQUE4RDtZQUU5RCw4REFBOEQ7WUFDOUQsOERBQThEO1NBQzlELENBQ0QsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHFCQUFxQixFQUFFLEdBQUcsRUFBRTtRQUNoQyxNQUFNLENBQUMsZUFBZSxDQUNyQixPQUFPLENBQ047WUFDQyxXQUFXO1NBRVgsRUFDRDtZQUNDLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUM7U0FDcEQsQ0FDRCxFQUNEO1lBQ0MsY0FBYztZQUVkLGlCQUFpQjtZQUNqQixpQkFBaUI7WUFFakIsaUJBQWlCO1lBQ2pCLGlCQUFpQjtZQUNqQixxQkFBcUI7WUFDckIsaUJBQWlCO1lBRWpCLG9CQUFvQjtZQUNwQixvQkFBb0I7WUFFcEIsb0JBQW9CO1lBQ3BCLG9CQUFvQjtTQUNwQixDQUNELENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7UUFDaEMsTUFBTSxDQUFDLGVBQWUsQ0FDckIsT0FBTyxDQUNOO1lBQ0MsV0FBVztTQUVYLEVBQ0Q7WUFDQyxJQUFJLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDO1lBQ3BELElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUM7U0FDcEQsQ0FDRCxFQUNEO1lBQ0MsY0FBYztZQUVkLGlCQUFpQjtZQUNqQixpQkFBaUI7WUFFakIsaUJBQWlCO1lBQ2pCLGlCQUFpQjtZQUNqQixxQkFBcUI7WUFDckIsY0FBYztZQUVkLGlCQUFpQjtZQUNqQixpQkFBaUI7WUFFakIsaUJBQWlCO1lBQ2pCLGlCQUFpQjtZQUNqQixxQkFBcUI7WUFDckIsUUFBUTtZQUVSLFdBQVc7WUFDWCxXQUFXO1lBRVgsV0FBVztZQUNYLFdBQVc7U0FDWCxDQUNELENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLEVBQUU7UUFDeEMsTUFBTSxDQUFDLGVBQWUsQ0FDckIsT0FBTyxDQUNOO1lBQ0MsWUFBWTtZQUNaLFdBQVc7WUFDWCxZQUFZO1NBRVosRUFDRDtZQUNDLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxVQUFVLENBQUM7U0FDeEQsQ0FDRCxFQUNEO1lBQ0Msb0JBQW9CO1lBQ3BCLHVCQUF1QjtZQUN2Qix1QkFBdUI7WUFFdkIsdUJBQXVCO1lBQ3ZCLHVCQUF1QjtZQUN2QixxQkFBcUI7WUFDckIsbUNBQW1DO1lBRW5DLHNDQUFzQztZQUN0QyxzQ0FBc0M7WUFFdEMsc0NBQXNDO1lBQ3RDLHNDQUFzQztZQUN0QyxxQkFBcUI7WUFDckIsZ0NBQWdDO1lBRWhDLG1DQUFtQztZQUNuQyxtQ0FBbUM7WUFFbkMsbUNBQW1DO1lBQ25DLG1DQUFtQztTQUNuQyxDQUNELENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLEVBQUU7UUFDeEMsTUFBTSxDQUFDLGVBQWUsQ0FDckIsT0FBTyxDQUNOO1lBQ0MsWUFBWTtZQUNaLFdBQVc7WUFDWCxZQUFZO1NBRVosRUFDRDtZQUNDLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxVQUFVLENBQUM7WUFDeEQsSUFBSSxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQztZQUNwRCxJQUFJLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDO1NBQ3BELENBQ0QsRUFDRDtZQUNDLG9CQUFvQjtZQUVwQix1QkFBdUI7WUFDdkIsdUJBQXVCO1lBRXZCLHVCQUF1QjtZQUN2Qix1QkFBdUI7WUFDdkIscUJBQXFCO1lBQ3JCLDBCQUEwQjtZQUUxQiw2QkFBNkI7WUFDN0IsNkJBQTZCO1lBRTdCLDZCQUE2QjtZQUM3Qiw2QkFBNkI7WUFDN0IscUJBQXFCO1lBQ3JCLGNBQWM7WUFFZCxpQkFBaUI7WUFDakIsaUJBQWlCO1lBRWpCLGlCQUFpQjtZQUNqQixpQkFBaUI7WUFDakIscUJBQXFCO1lBQ3JCLHVCQUF1QjtZQUV2QiwwQkFBMEI7WUFDMUIsMEJBQTBCO1lBRTFCLDBCQUEwQjtZQUMxQiwwQkFBMEI7U0FDMUIsQ0FDRCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUVILFlBQVk7QUFDWixTQUFTLE9BQU8sQ0FBQyxRQUFrQixFQUFFLEtBQWlCO0lBQ3JELE1BQU0sUUFBUSxHQUFHLFVBQVUsQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3JGLElBQUksRUFBRSxDQUFDLENBQUMsT0FBTztRQUNmLEtBQUssRUFBRSxLQUFLLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7S0FDMUYsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRU4sTUFBTSxNQUFNLEdBQUcsSUFBSSx3QkFBd0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUVuRCxNQUFNLE1BQU0sR0FBRyxJQUFJLEtBQUssRUFBVSxDQUFDO0lBRW5DLElBQUksT0FBTyxHQUFHLENBQUMsQ0FBQztJQUNoQixLQUFLLE1BQU0sSUFBSSxJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQzdCLElBQUksUUFBUSxHQUFHLEVBQUUsQ0FBQztRQUNsQixJQUFJLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDakIsSUFBSSxPQUFPLEdBQUcsRUFBRSxDQUFDO1FBRWpCLElBQUksT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUNqQixJQUFJLFFBQVEsR0FBRyxFQUFFLENBQUM7UUFFbEIsS0FBSyxJQUFJLE1BQU0sR0FBRyxDQUFDLEVBQUUsTUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUUsQ0FBQztZQUN0RCxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ3ZFLE1BQU0sU0FBUyxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN0QyxJQUFJLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQzFCLE9BQU8sSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3RDLENBQUM7WUFDRCxRQUFRLElBQUksUUFBUSxDQUFDLEVBQUUsR0FBRyxTQUFTLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2xELE9BQU8sSUFBSSxRQUFRLENBQUMsRUFBRSxHQUFHLFNBQVMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFbkQsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLHVCQUF1QixDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUMxRSxJQUFJLE9BQU8sS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDdEIsUUFBUSxJQUFJLEtBQUssQ0FBQztnQkFDbEIsT0FBTyxJQUFJLEtBQUssQ0FBQztZQUNsQixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUNsQyxRQUFRLElBQUksUUFBUSxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUM3QyxPQUFPLElBQUksUUFBUSxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQy9DLENBQUM7UUFDRixDQUFDO1FBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUVyQixNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3RCLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFckIsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN0QixNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRXJCLE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztJQUVELE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQztBQUVELE1BQU0sT0FBTyxRQUFTLFNBQVEsWUFBWTtJQUN6QyxZQUNDLFdBQW1CLEVBQ25CLFNBQWlCLEVBQ0QsT0FBZTtRQUUvQixLQUFLLENBQ0osV0FBVyxFQUNYLFNBQVMsRUFDVCxjQUFjLENBQUMsT0FBTyxDQUFDLENBQ3ZCLENBQUM7UUFOYyxZQUFPLEdBQVAsT0FBTyxDQUFRO0lBT2hDLENBQUM7Q0FDRDtBQUVELE1BQU0seUJBQXlCO0lBRzlCLFlBQVksSUFBWTtRQUN2QixJQUFJLENBQUMsd0JBQXdCLEdBQUcsRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdEMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN0QyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7Z0JBQzdCLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzNDLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELFNBQVMsQ0FBQyxRQUFrQjtRQUMzQixPQUFPLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxRQUFRLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBQ3JGLENBQUM7Q0FDRDtBQUVELFNBQVMsb0JBQW9CLENBQUMsSUFBWSxFQUFFLEtBQXdDO0lBQ25GLE1BQU0sV0FBVyxHQUFHLElBQUkseUJBQXlCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDeEQsTUFBTSxXQUFXLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtRQUNqQyxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNsQyxPQUFPLENBQUM7WUFDUCxXQUFXLEVBQUUsV0FBVyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUM1RCxTQUFTLEVBQUUsV0FBVyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDeEQsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJO1NBQ1osQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUM7SUFFMUQsS0FBSyxNQUFNLElBQUksSUFBSSxXQUFXLEVBQUUsQ0FBQztRQUNoQyxJQUFJLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDekYsQ0FBQztJQUVELE9BQU8sSUFBSSxDQUFDO0FBQ2IsQ0FBQztBQUVELFNBQVMsUUFBUSxDQUFDLEdBQVcsRUFBRSxHQUFXO0lBQ3pDLE9BQU8sR0FBRyxDQUFDLE1BQU0sR0FBRyxHQUFHLEVBQUUsQ0FBQztRQUN6QixHQUFHLElBQUksR0FBRyxDQUFDO0lBQ1osQ0FBQztJQUNELE9BQU8sR0FBRyxDQUFDO0FBQ1osQ0FBQyJ9