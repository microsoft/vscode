/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { RenderedLinesCollection } from '../../../browser/view/viewLayer.js';
class TestLine {
    constructor(id) {
        this.id = id;
        this._pinged = false;
    }
    onContentChanged() {
        this._pinged = true;
    }
    onTokensChanged() {
        this._pinged = true;
    }
}
function assertState(col, state) {
    const actualState = {
        startLineNumber: col.getStartLineNumber(),
        lines: [],
        pinged: []
    };
    for (let lineNumber = col.getStartLineNumber(); lineNumber <= col.getEndLineNumber(); lineNumber++) {
        actualState.lines.push(col.getLine(lineNumber).id);
        actualState.pinged.push(col.getLine(lineNumber)._pinged);
    }
    assert.deepStrictEqual(actualState, state);
}
suite('RenderedLinesCollection onLinesDeleted', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function testOnModelLinesDeleted(deleteFromLineNumber, deleteToLineNumber, expectedDeleted, expectedState) {
        const col = new RenderedLinesCollection({ createLine: () => new TestLine('new') });
        col._set(6, [
            new TestLine('old6'),
            new TestLine('old7'),
            new TestLine('old8'),
            new TestLine('old9')
        ]);
        const actualDeleted1 = col.onLinesDeleted(deleteFromLineNumber, deleteToLineNumber);
        let actualDeleted = [];
        if (actualDeleted1) {
            actualDeleted = actualDeleted1.map(line => line.id);
        }
        assert.deepStrictEqual(actualDeleted, expectedDeleted);
        assertState(col, expectedState);
    }
    test('A1', () => {
        testOnModelLinesDeleted(3, 3, [], {
            startLineNumber: 5,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('A2', () => {
        testOnModelLinesDeleted(3, 4, [], {
            startLineNumber: 4,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('A3', () => {
        testOnModelLinesDeleted(3, 5, [], {
            startLineNumber: 3,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('A4', () => {
        testOnModelLinesDeleted(3, 6, ['old6'], {
            startLineNumber: 3,
            lines: ['old7', 'old8', 'old9'],
            pinged: [false, false, false]
        });
    });
    test('A5', () => {
        testOnModelLinesDeleted(3, 7, ['old6', 'old7'], {
            startLineNumber: 3,
            lines: ['old8', 'old9'],
            pinged: [false, false]
        });
    });
    test('A6', () => {
        testOnModelLinesDeleted(3, 8, ['old6', 'old7', 'old8'], {
            startLineNumber: 3,
            lines: ['old9'],
            pinged: [false]
        });
    });
    test('A7', () => {
        testOnModelLinesDeleted(3, 9, ['old6', 'old7', 'old8', 'old9'], {
            startLineNumber: 3,
            lines: [],
            pinged: []
        });
    });
    test('A8', () => {
        testOnModelLinesDeleted(3, 10, ['old6', 'old7', 'old8', 'old9'], {
            startLineNumber: 3,
            lines: [],
            pinged: []
        });
    });
    test('B1', () => {
        testOnModelLinesDeleted(5, 5, [], {
            startLineNumber: 5,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('B2', () => {
        testOnModelLinesDeleted(5, 6, ['old6'], {
            startLineNumber: 5,
            lines: ['old7', 'old8', 'old9'],
            pinged: [false, false, false]
        });
    });
    test('B3', () => {
        testOnModelLinesDeleted(5, 7, ['old6', 'old7'], {
            startLineNumber: 5,
            lines: ['old8', 'old9'],
            pinged: [false, false]
        });
    });
    test('B4', () => {
        testOnModelLinesDeleted(5, 8, ['old6', 'old7', 'old8'], {
            startLineNumber: 5,
            lines: ['old9'],
            pinged: [false]
        });
    });
    test('B5', () => {
        testOnModelLinesDeleted(5, 9, ['old6', 'old7', 'old8', 'old9'], {
            startLineNumber: 5,
            lines: [],
            pinged: []
        });
    });
    test('B6', () => {
        testOnModelLinesDeleted(5, 10, ['old6', 'old7', 'old8', 'old9'], {
            startLineNumber: 5,
            lines: [],
            pinged: []
        });
    });
    test('C1', () => {
        testOnModelLinesDeleted(6, 6, ['old6'], {
            startLineNumber: 6,
            lines: ['old7', 'old8', 'old9'],
            pinged: [false, false, false]
        });
    });
    test('C2', () => {
        testOnModelLinesDeleted(6, 7, ['old6', 'old7'], {
            startLineNumber: 6,
            lines: ['old8', 'old9'],
            pinged: [false, false]
        });
    });
    test('C3', () => {
        testOnModelLinesDeleted(6, 8, ['old6', 'old7', 'old8'], {
            startLineNumber: 6,
            lines: ['old9'],
            pinged: [false]
        });
    });
    test('C4', () => {
        testOnModelLinesDeleted(6, 9, ['old6', 'old7', 'old8', 'old9'], {
            startLineNumber: 6,
            lines: [],
            pinged: []
        });
    });
    test('C5', () => {
        testOnModelLinesDeleted(6, 10, ['old6', 'old7', 'old8', 'old9'], {
            startLineNumber: 6,
            lines: [],
            pinged: []
        });
    });
    test('D1', () => {
        testOnModelLinesDeleted(7, 7, ['old7'], {
            startLineNumber: 6,
            lines: ['old6', 'old8', 'old9'],
            pinged: [false, false, false]
        });
    });
    test('D2', () => {
        testOnModelLinesDeleted(7, 8, ['old7', 'old8'], {
            startLineNumber: 6,
            lines: ['old6', 'old9'],
            pinged: [false, false]
        });
    });
    test('D3', () => {
        testOnModelLinesDeleted(7, 9, ['old7', 'old8', 'old9'], {
            startLineNumber: 6,
            lines: ['old6'],
            pinged: [false]
        });
    });
    test('D4', () => {
        testOnModelLinesDeleted(7, 10, ['old7', 'old8', 'old9'], {
            startLineNumber: 6,
            lines: ['old6'],
            pinged: [false]
        });
    });
    test('E1', () => {
        testOnModelLinesDeleted(8, 8, ['old8'], {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old9'],
            pinged: [false, false, false]
        });
    });
    test('E2', () => {
        testOnModelLinesDeleted(8, 9, ['old8', 'old9'], {
            startLineNumber: 6,
            lines: ['old6', 'old7'],
            pinged: [false, false]
        });
    });
    test('E3', () => {
        testOnModelLinesDeleted(8, 10, ['old8', 'old9'], {
            startLineNumber: 6,
            lines: ['old6', 'old7'],
            pinged: [false, false]
        });
    });
    test('F1', () => {
        testOnModelLinesDeleted(9, 9, ['old9'], {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8'],
            pinged: [false, false, false]
        });
    });
    test('F2', () => {
        testOnModelLinesDeleted(9, 10, ['old9'], {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8'],
            pinged: [false, false, false]
        });
    });
    test('G1', () => {
        testOnModelLinesDeleted(10, 10, [], {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('G2', () => {
        testOnModelLinesDeleted(10, 11, [], {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('H1', () => {
        testOnModelLinesDeleted(11, 13, [], {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
});
suite('RenderedLinesCollection onLineChanged', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function testOnModelLineChanged(changedLineNumber, expectedPinged, expectedState) {
        const col = new RenderedLinesCollection({ createLine: () => new TestLine('new') });
        col._set(6, [
            new TestLine('old6'),
            new TestLine('old7'),
            new TestLine('old8'),
            new TestLine('old9')
        ]);
        const actualPinged = col.onLinesChanged(changedLineNumber, 1);
        assert.deepStrictEqual(actualPinged, expectedPinged);
        assertState(col, expectedState);
    }
    test('3', () => {
        testOnModelLineChanged(3, false, {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('4', () => {
        testOnModelLineChanged(4, false, {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('5', () => {
        testOnModelLineChanged(5, false, {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('6', () => {
        testOnModelLineChanged(6, true, {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [true, false, false, false]
        });
    });
    test('7', () => {
        testOnModelLineChanged(7, true, {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, true, false, false]
        });
    });
    test('8', () => {
        testOnModelLineChanged(8, true, {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, true, false]
        });
    });
    test('9', () => {
        testOnModelLineChanged(9, true, {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, true]
        });
    });
    test('10', () => {
        testOnModelLineChanged(10, false, {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('11', () => {
        testOnModelLineChanged(11, false, {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
});
suite('RenderedLinesCollection onLinesInserted', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function testOnModelLinesInserted(insertFromLineNumber, insertToLineNumber, expectedDeleted, expectedState) {
        const col = new RenderedLinesCollection({ createLine: () => new TestLine('new') });
        col._set(6, [
            new TestLine('old6'),
            new TestLine('old7'),
            new TestLine('old8'),
            new TestLine('old9')
        ]);
        const actualDeleted1 = col.onLinesInserted(insertFromLineNumber, insertToLineNumber);
        let actualDeleted = [];
        if (actualDeleted1) {
            actualDeleted = actualDeleted1.map(line => line.id);
        }
        assert.deepStrictEqual(actualDeleted, expectedDeleted);
        assertState(col, expectedState);
    }
    test('A1', () => {
        testOnModelLinesInserted(3, 3, [], {
            startLineNumber: 7,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('A2', () => {
        testOnModelLinesInserted(3, 4, [], {
            startLineNumber: 8,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('A3', () => {
        testOnModelLinesInserted(3, 5, [], {
            startLineNumber: 9,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('A4', () => {
        testOnModelLinesInserted(3, 6, [], {
            startLineNumber: 10,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('A5', () => {
        testOnModelLinesInserted(3, 7, [], {
            startLineNumber: 11,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('A6', () => {
        testOnModelLinesInserted(3, 8, [], {
            startLineNumber: 12,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('A7', () => {
        testOnModelLinesInserted(3, 9, [], {
            startLineNumber: 13,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('A8', () => {
        testOnModelLinesInserted(3, 10, [], {
            startLineNumber: 14,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('B1', () => {
        testOnModelLinesInserted(5, 5, [], {
            startLineNumber: 7,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('B2', () => {
        testOnModelLinesInserted(5, 6, [], {
            startLineNumber: 8,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('B3', () => {
        testOnModelLinesInserted(5, 7, [], {
            startLineNumber: 9,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('B4', () => {
        testOnModelLinesInserted(5, 8, [], {
            startLineNumber: 10,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('B5', () => {
        testOnModelLinesInserted(5, 9, [], {
            startLineNumber: 11,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('B6', () => {
        testOnModelLinesInserted(5, 10, [], {
            startLineNumber: 12,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('C1', () => {
        testOnModelLinesInserted(6, 6, [], {
            startLineNumber: 7,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('C2', () => {
        testOnModelLinesInserted(6, 7, [], {
            startLineNumber: 8,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('C3', () => {
        testOnModelLinesInserted(6, 8, [], {
            startLineNumber: 9,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('C4', () => {
        testOnModelLinesInserted(6, 9, [], {
            startLineNumber: 10,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('C5', () => {
        testOnModelLinesInserted(6, 10, [], {
            startLineNumber: 11,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('D1', () => {
        testOnModelLinesInserted(7, 7, ['old9'], {
            startLineNumber: 6,
            lines: ['old6', 'new', 'old7', 'old8'],
            pinged: [false, false, false, false]
        });
    });
    test('D2', () => {
        testOnModelLinesInserted(7, 8, ['old8', 'old9'], {
            startLineNumber: 6,
            lines: ['old6', 'new', 'new', 'old7'],
            pinged: [false, false, false, false]
        });
    });
    test('D3', () => {
        testOnModelLinesInserted(7, 9, ['old7', 'old8', 'old9'], {
            startLineNumber: 6,
            lines: ['old6'],
            pinged: [false]
        });
    });
    test('D4', () => {
        testOnModelLinesInserted(7, 10, ['old7', 'old8', 'old9'], {
            startLineNumber: 6,
            lines: ['old6'],
            pinged: [false]
        });
    });
    test('E1', () => {
        testOnModelLinesInserted(8, 8, ['old9'], {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'new', 'old8'],
            pinged: [false, false, false, false]
        });
    });
    test('E2', () => {
        testOnModelLinesInserted(8, 9, ['old8', 'old9'], {
            startLineNumber: 6,
            lines: ['old6', 'old7'],
            pinged: [false, false]
        });
    });
    test('E3', () => {
        testOnModelLinesInserted(8, 10, ['old8', 'old9'], {
            startLineNumber: 6,
            lines: ['old6', 'old7'],
            pinged: [false, false]
        });
    });
    test('F1', () => {
        testOnModelLinesInserted(9, 9, ['old9'], {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8'],
            pinged: [false, false, false]
        });
    });
    test('F2', () => {
        testOnModelLinesInserted(9, 10, ['old9'], {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8'],
            pinged: [false, false, false]
        });
    });
    test('G1', () => {
        testOnModelLinesInserted(10, 10, [], {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('G2', () => {
        testOnModelLinesInserted(10, 11, [], {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('H1', () => {
        testOnModelLinesInserted(11, 13, [], {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
});
suite('RenderedLinesCollection onTokensChanged', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function testOnModelTokensChanged(changedFromLineNumber, changedToLineNumber, expectedPinged, expectedState) {
        const col = new RenderedLinesCollection({ createLine: () => new TestLine('new') });
        col._set(6, [
            new TestLine('old6'),
            new TestLine('old7'),
            new TestLine('old8'),
            new TestLine('old9')
        ]);
        const actualPinged = col.onTokensChanged([{ fromLineNumber: changedFromLineNumber, toLineNumber: changedToLineNumber }]);
        assert.deepStrictEqual(actualPinged, expectedPinged);
        assertState(col, expectedState);
    }
    test('A', () => {
        testOnModelTokensChanged(3, 3, false, {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('B', () => {
        testOnModelTokensChanged(3, 5, false, {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('C', () => {
        testOnModelTokensChanged(3, 6, true, {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [true, false, false, false]
        });
    });
    test('D', () => {
        testOnModelTokensChanged(6, 6, true, {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [true, false, false, false]
        });
    });
    test('E', () => {
        testOnModelTokensChanged(5, 10, true, {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [true, true, true, true]
        });
    });
    test('F', () => {
        testOnModelTokensChanged(8, 9, true, {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, true, true]
        });
    });
    test('G', () => {
        testOnModelTokensChanged(8, 11, true, {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, true, true]
        });
    });
    test('H', () => {
        testOnModelTokensChanged(10, 10, false, {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
    test('I', () => {
        testOnModelTokensChanged(10, 11, false, {
            startLineNumber: 6,
            lines: ['old6', 'old7', 'old8', 'old9'],
            pinged: [false, false, false, false]
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld0xheWVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9icm93c2VyL3ZpZXcvdmlld0xheWVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBUyx1QkFBdUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRXBGLE1BQU0sUUFBUTtJQUdiLFlBQW1CLEVBQVU7UUFBVixPQUFFLEdBQUYsRUFBRSxDQUFRO1FBRDdCLFlBQU8sR0FBRyxLQUFLLENBQUM7SUFFaEIsQ0FBQztJQUVELGdCQUFnQjtRQUNmLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO0lBQ3JCLENBQUM7SUFDRCxlQUFlO1FBQ2QsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7SUFDckIsQ0FBQztDQUNEO0FBUUQsU0FBUyxXQUFXLENBQUMsR0FBc0MsRUFBRSxLQUE0QjtJQUN4RixNQUFNLFdBQVcsR0FBMEI7UUFDMUMsZUFBZSxFQUFFLEdBQUcsQ0FBQyxrQkFBa0IsRUFBRTtRQUN6QyxLQUFLLEVBQUUsRUFBRTtRQUNULE1BQU0sRUFBRSxFQUFFO0tBQ1YsQ0FBQztJQUNGLEtBQUssSUFBSSxVQUFVLEdBQUcsR0FBRyxDQUFDLGtCQUFrQixFQUFFLEVBQUUsVUFBVSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsRUFBRSxFQUFFLFVBQVUsRUFBRSxFQUFFLENBQUM7UUFDcEcsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNuRCxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFDRCxNQUFNLENBQUMsZUFBZSxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQztBQUM1QyxDQUFDO0FBRUQsS0FBSyxDQUFDLHdDQUF3QyxFQUFFLEdBQUcsRUFBRTtJQUVwRCx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLFNBQVMsdUJBQXVCLENBQUMsb0JBQTRCLEVBQUUsa0JBQTBCLEVBQUUsZUFBeUIsRUFBRSxhQUFvQztRQUN6SixNQUFNLEdBQUcsR0FBRyxJQUFJLHVCQUF1QixDQUFXLEVBQUUsVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM3RixHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRTtZQUNYLElBQUksUUFBUSxDQUFDLE1BQU0sQ0FBQztZQUNwQixJQUFJLFFBQVEsQ0FBQyxNQUFNLENBQUM7WUFDcEIsSUFBSSxRQUFRLENBQUMsTUFBTSxDQUFDO1lBQ3BCLElBQUksUUFBUSxDQUFDLE1BQU0sQ0FBQztTQUNwQixDQUFDLENBQUM7UUFDSCxNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUMsY0FBYyxDQUFDLG9CQUFvQixFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFDcEYsSUFBSSxhQUFhLEdBQWEsRUFBRSxDQUFDO1FBQ2pDLElBQUksY0FBYyxFQUFFLENBQUM7WUFDcEIsYUFBYSxHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDckQsQ0FBQztRQUNELE1BQU0sQ0FBQyxlQUFlLENBQUMsYUFBYSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBQ3ZELFdBQVcsQ0FBQyxHQUFHLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDakMsQ0FBQztJQUVELElBQUksQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFO1FBQ2YsdUJBQXVCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUU7WUFDakMsZUFBZSxFQUFFLENBQUM7WUFDbEIsS0FBSyxFQUFFLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDO1lBQ3ZDLE1BQU0sRUFBRSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQztTQUNwQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFO1FBQ2YsdUJBQXVCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUU7WUFDakMsZUFBZSxFQUFFLENBQUM7WUFDbEIsS0FBSyxFQUFFLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDO1lBQ3ZDLE1BQU0sRUFBRSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQztTQUNwQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFO1FBQ2YsdUJBQXVCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUU7WUFDakMsZUFBZSxFQUFFLENBQUM7WUFDbEIsS0FBSyxFQUFFLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDO1lBQ3ZDLE1BQU0sRUFBRSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQztTQUNwQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFO1FBQ2YsdUJBQXVCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQ3ZDLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFD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TUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUNmLHdCQUF3QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFO1lBQ2xDLGVBQWUsRUFBRSxFQUFFO1lBQ25CLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUNmLHdCQUF3QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFO1lBQ2xDLGVBQWUsRUFBRSxFQUFFO1lBQ25CLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUNmLHdCQUF3QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFO1lBQ2xDLGVBQWUsRUFBRSxFQUFFO1lBQ25CLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUNmLHdCQUF3QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFO1lBQ2xDLGVBQWUsRUFBRSxFQUFFO1lBQ25CLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUNmLHdCQUF3QixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFO1lBQ25DLGVBQWUsRUFBRSxFQUFFO1lBQ25CLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFHSCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUNmLHdCQUF3QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFO1lBQ2xDLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUNmLHdCQUF3QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFO1lBQ2xDLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUNmLHdCQUF3QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFO1lBQ2xDLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUNmLHdCQUF3QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFO1lBQ2xDLGVBQWUsRUFBRSxFQUFFO1lBQ25CLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUNmLHdCQUF3QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFO1lBQ2xDLGVBQWUsRUFBRSxFQUFFO1lBQ25CLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUNmLHdCQUF3QixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFO1lBQ25DLGVBQWUsRUFBRSxFQUFFO1lBQ25CLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFHSCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUNmLHdCQUF3QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFO1lBQ2xDLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUNmLHdCQUF3QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFO1lBQ2xDLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUNmLHdCQUF3QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFO1lBQ2xDLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUNmLHdCQUF3QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFO1lBQ2xDLGVBQWUsRUFBRSxFQUFFO1lBQ25CLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUNmLHdCQUF3QixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFO1lBQ25DLGVBQWUsRUFBRSxFQUFFO1lBQ25CLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFHSCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUNmLHdCQUF3QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUN4QyxlQUFlLEVBQUUsQ0FBQztZQUNsQixLQUFLLEVBQUUsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUM7WUFDdEMsTUFBTSxFQUFFLENBQUMsS0FBSyxFQUFFLEtB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QUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSCxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRTtRQUNkLHdCQUF3QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFO1lBQ3JDLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSCxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRTtRQUNkLHdCQUF3QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFO1lBQ3BDLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDbkMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSCxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRTtRQUNkLHdCQUF3QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFO1lBQ3BDLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDbkMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSCxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRTtRQUNkLHdCQUF3QixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFO1lBQ3JDLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7U0FDaEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSCxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRTtRQUNkLHdCQUF3QixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFO1lBQ3BDLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7U0FDbEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSCxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRTtRQUNkLHdCQUF3QixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFO1lBQ3JDLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7U0FDbEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSCxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRTtRQUNkLHdCQUF3QixDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFO1lBQ3ZDLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSCxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRTtRQUNkLHdCQUF3QixDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFO1lBQ3ZDLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztZQUN2QyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9