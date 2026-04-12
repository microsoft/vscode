/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { EditorWhitespace, LinesLayout } from '../../../common/viewLayout/linesLayout.js';
suite('Editor ViewLayout - LinesLayout', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function insertWhitespace(linesLayout, afterLineNumber, ordinal, heightInPx, minWidth) {
        let id;
        linesLayout.changeWhitespace((accessor) => {
            id = accessor.insertWhitespace(afterLineNumber, ordinal, heightInPx, minWidth);
        });
        return id;
    }
    function changeOneWhitespace(linesLayout, id, newAfterLineNumber, newHeight) {
        linesLayout.changeWhitespace((accessor) => {
            accessor.changeOneWhitespace(id, newAfterLineNumber, newHeight);
        });
    }
    function removeWhitespace(linesLayout, id) {
        linesLayout.changeWhitespace((accessor) => {
            accessor.removeWhitespace(id);
        });
    }
    test('LinesLayout 1', () => {
        // Start off with 10 lines
        const linesLayout = new LinesLayout(10, 10, 0, 0, []);
        // lines: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        // whitespace: -
        assert.strictEqual(linesLayout.getLinesTotalHeight(), 100);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(1), 0);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(2), 10);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(3), 20);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(4), 30);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(5), 40);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(6), 50);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(7), 60);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(8), 70);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(9), 80);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(10), 90);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(0), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(1), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(5), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(9), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(10), 2);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(11), 2);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(15), 2);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(19), 2);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(20), 3);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(21), 3);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(29), 3);
        // Add whitespace of height 5px after 2nd line
        insertWhitespace(linesLayout, 2, 0, 5, 0);
        // lines: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        // whitespace: a(2,5)
        assert.strictEqual(linesLayout.getLinesTotalHeight(), 105);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(1), 0);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(2), 10);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(3), 25);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(4), 35);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(5), 45);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(0), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(1), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(9), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(10), 2);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(20), 3);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(21), 3);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(24), 3);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(25), 3);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(35), 4);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(45), 5);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(104), 10);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(105), 10);
        // Add two more whitespaces of height 5px
        insertWhitespace(linesLayout, 3, 0, 5, 0);
        insertWhitespace(linesLayout, 4, 0, 5, 0);
        // lines: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        // whitespace: a(2,5), b(3, 5), c(4, 5)
        assert.strictEqual(linesLayout.getLinesTotalHeight(), 115);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(1), 0);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(2), 10);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(3), 25);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(4), 40);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(5), 55);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(6), 65);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(0), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(1), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(9), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(10), 2);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(19), 2);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(20), 3);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(34), 3);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(35), 4);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(49), 4);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(50), 5);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(64), 5);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(65), 6);
        assert.strictEqual(linesLayout.getVerticalOffsetForWhitespaceIndex(0), 20); // 20 -> 25
        assert.strictEqual(linesLayout.getVerticalOffsetForWhitespaceIndex(1), 35); // 35 -> 40
        assert.strictEqual(linesLayout.getVerticalOffsetForWhitespaceIndex(2), 50);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(0), 0);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(19), 0);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(20), 0);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(21), 0);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(22), 0);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(23), 0);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(24), 0);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(25), 1);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(26), 1);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(34), 1);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(35), 1);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(36), 1);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(39), 1);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(40), 2);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(41), 2);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(49), 2);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(50), 2);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(51), 2);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(54), 2);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(55), -1);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(1000), -1);
    });
    test('LinesLayout 2', () => {
        // Start off with 10 lines and one whitespace after line 2, of height 5
        const linesLayout = new LinesLayout(10, 1, 0, 0, []);
        const a = insertWhitespace(linesLayout, 2, 0, 5, 0);
        // 10 lines
        // whitespace: - a(2,5)
        assert.strictEqual(linesLayout.getLinesTotalHeight(), 15);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(1), 0);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(2), 1);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(3), 7);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(4), 8);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(5), 9);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(6), 10);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(7), 11);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(8), 12);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(9), 13);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(10), 14);
        // Change whitespace height
        // 10 lines
        // whitespace: - a(2,10)
        changeOneWhitespace(linesLayout, a, 2, 10);
        assert.strictEqual(linesLayout.getLinesTotalHeight(), 20);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(1), 0);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(2), 1);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(3), 12);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(4), 13);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(5), 14);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(6), 15);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(7), 16);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(8), 17);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(9), 18);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(10), 19);
        // Change whitespace position
        // 10 lines
        // whitespace: - a(5,10)
        changeOneWhitespace(linesLayout, a, 5, 10);
        assert.strictEqual(linesLayout.getLinesTotalHeight(), 20);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(1), 0);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(2), 1);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(3), 2);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(4), 3);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(5), 4);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(6), 15);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(7), 16);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(8), 17);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(9), 18);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(10), 19);
        // Pretend that lines 5 and 6 were deleted
        // 8 lines
        // whitespace: - a(4,10)
        linesLayout.onLinesDeleted(5, 6);
        assert.strictEqual(linesLayout.getLinesTotalHeight(), 18);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(1), 0);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(2), 1);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(3), 2);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(4), 3);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(5), 14);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(6), 15);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(7), 16);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(8), 17);
        // Insert two lines at the beginning
        // 10 lines
        // whitespace: - a(6,10)
        linesLayout.onLinesInserted(1, 2);
        assert.strictEqual(linesLayout.getLinesTotalHeight(), 20);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(1), 0);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(2), 1);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(3), 2);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(4), 3);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(5), 4);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(6), 5);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(7), 16);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(8), 17);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(9), 18);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(10), 19);
        // Remove whitespace
        // 10 lines
        removeWhitespace(linesLayout, a);
        assert.strictEqual(linesLayout.getLinesTotalHeight(), 10);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(1), 0);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(2), 1);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(3), 2);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(4), 3);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(5), 4);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(6), 5);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(7), 6);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(8), 7);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(9), 8);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(10), 9);
    });
    test('LinesLayout Padding', () => {
        // Start off with 10 lines
        const linesLayout = new LinesLayout(10, 10, 15, 20, []);
        // lines: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        // whitespace: -
        assert.strictEqual(linesLayout.getLinesTotalHeight(), 135);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(1), 15);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(2), 25);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(3), 35);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(4), 45);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(5), 55);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(6), 65);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(7), 75);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(8), 85);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(9), 95);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(10), 105);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(0), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(10), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(15), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(24), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(25), 2);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(34), 2);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(35), 3);
        // Add whitespace of height 5px after 2nd line
        insertWhitespace(linesLayout, 2, 0, 5, 0);
        // lines: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        // whitespace: a(2,5)
        assert.strictEqual(linesLayout.getLinesTotalHeight(), 140);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(1), 15);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(2), 25);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(3), 40);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(4), 50);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(0), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(10), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(25), 2);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(34), 2);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(35), 3);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(39), 3);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(40), 3);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(41), 3);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(49), 3);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(50), 4);
        // Add two more whitespaces of height 5px
        insertWhitespace(linesLayout, 3, 0, 5, 0);
        insertWhitespace(linesLayout, 4, 0, 5, 0);
        // lines: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        // whitespace: a(2,5), b(3, 5), c(4, 5)
        assert.strictEqual(linesLayout.getLinesTotalHeight(), 150);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(1), 15);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(2), 25);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(3), 40);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(4), 55);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(5), 70);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(6), 80);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(0), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(15), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(24), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(30), 2);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(35), 3);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(39), 3);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(40), 3);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(49), 3);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(50), 4);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(54), 4);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(55), 4);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(64), 4);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(65), 5);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(69), 5);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(70), 5);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(80), 6);
        assert.strictEqual(linesLayout.getVerticalOffsetForWhitespaceIndex(0), 35); // 35 -> 40
        assert.strictEqual(linesLayout.getVerticalOffsetForWhitespaceIndex(1), 50); // 50 -> 55
        assert.strictEqual(linesLayout.getVerticalOffsetForWhitespaceIndex(2), 65);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(0), 0);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(34), 0);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(35), 0);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(39), 0);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(40), 1);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(49), 1);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(50), 1);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(54), 1);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(55), 2);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(64), 2);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(65), 2);
        assert.strictEqual(linesLayout.getWhitespaceIndexAtOrAfterVerticallOffset(70), -1);
    });
    test('LinesLayout getLineNumberAtOrAfterVerticalOffset', () => {
        const linesLayout = new LinesLayout(10, 1, 0, 0, []);
        insertWhitespace(linesLayout, 6, 0, 10, 0);
        // 10 lines
        // whitespace: - a(6,10)
        assert.strictEqual(linesLayout.getLinesTotalHeight(), 20);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(1), 0);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(2), 1);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(3), 2);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(4), 3);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(5), 4);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(6), 5);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(7), 16);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(8), 17);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(9), 18);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(10), 19);
        // Do some hit testing
        // line      [1, 2, 3, 4, 5, 6,  7,  8,  9, 10]
        // vertical: [0, 1, 2, 3, 4, 5, 16, 17, 18, 19]
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(-100), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(-1), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(0), 1);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(1), 2);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(2), 3);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(3), 4);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(4), 5);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(5), 6);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(6), 7);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(7), 7);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(8), 7);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(9), 7);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(10), 7);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(11), 7);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(12), 7);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(13), 7);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(14), 7);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(15), 7);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(16), 7);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(17), 8);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(18), 9);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(19), 10);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(20), 10);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(21), 10);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(22), 10);
        assert.strictEqual(linesLayout.getLineNumberAtOrAfterVerticalOffset(23), 10);
    });
    test('LinesLayout getCenteredLineInViewport', () => {
        const linesLayout = new LinesLayout(10, 1, 0, 0, []);
        insertWhitespace(linesLayout, 6, 0, 10, 0);
        // 10 lines
        // whitespace: - a(6,10)
        assert.strictEqual(linesLayout.getLinesTotalHeight(), 20);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(1), 0);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(2), 1);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(3), 2);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(4), 3);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(5), 4);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(6), 5);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(7), 16);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(8), 17);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(9), 18);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(10), 19);
        // Find centered line in viewport 1
        // line      [1, 2, 3, 4, 5, 6,  7,  8,  9, 10]
        // vertical: [0, 1, 2, 3, 4, 5, 16, 17, 18, 19]
        assert.strictEqual(linesLayout.getLinesViewportData(0, 1).centeredLineNumber, 1);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 2).centeredLineNumber, 2);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 3).centeredLineNumber, 2);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 4).centeredLineNumber, 3);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 5).centeredLineNumber, 3);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 6).centeredLineNumber, 4);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 7).centeredLineNumber, 4);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 8).centeredLineNumber, 5);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 9).centeredLineNumber, 5);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 10).centeredLineNumber, 6);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 11).centeredLineNumber, 6);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 12).centeredLineNumber, 6);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 13).centeredLineNumber, 6);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 14).centeredLineNumber, 6);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 15).centeredLineNumber, 6);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 16).centeredLineNumber, 6);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 17).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 18).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 19).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 20).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 21).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 22).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 23).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 24).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 25).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 26).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 27).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 28).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 29).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 30).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 31).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 32).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(0, 33).centeredLineNumber, 7);
        // Find centered line in viewport 2
        // line      [1, 2, 3, 4, 5, 6,  7,  8,  9, 10]
        // vertical: [0, 1, 2, 3, 4, 5, 16, 17, 18, 19]
        assert.strictEqual(linesLayout.getLinesViewportData(0, 20).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(1, 20).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(2, 20).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(3, 20).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(4, 20).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(5, 20).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(6, 20).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(7, 20).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(8, 20).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(9, 20).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(10, 20).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(11, 20).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(12, 20).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(13, 20).centeredLineNumber, 7);
        assert.strictEqual(linesLayout.getLinesViewportData(14, 20).centeredLineNumber, 8);
        assert.strictEqual(linesLayout.getLinesViewportData(15, 20).centeredLineNumber, 8);
        assert.strictEqual(linesLayout.getLinesViewportData(16, 20).centeredLineNumber, 9);
        assert.strictEqual(linesLayout.getLinesViewportData(17, 20).centeredLineNumber, 9);
        assert.strictEqual(linesLayout.getLinesViewportData(18, 20).centeredLineNumber, 10);
        assert.strictEqual(linesLayout.getLinesViewportData(19, 20).centeredLineNumber, 10);
        assert.strictEqual(linesLayout.getLinesViewportData(20, 23).centeredLineNumber, 10);
        assert.strictEqual(linesLayout.getLinesViewportData(21, 23).centeredLineNumber, 10);
        assert.strictEqual(linesLayout.getLinesViewportData(22, 23).centeredLineNumber, 10);
    });
    test('LinesLayout getLinesViewportData 1', () => {
        const linesLayout = new LinesLayout(10, 10, 0, 0, []);
        insertWhitespace(linesLayout, 6, 0, 100, 0);
        // 10 lines
        // whitespace: - a(6,100)
        assert.strictEqual(linesLayout.getLinesTotalHeight(), 200);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(1), 0);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(2), 10);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(3), 20);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(4), 30);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(5), 40);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(6), 50);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(7), 160);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(8), 170);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(9), 180);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(10), 190);
        // viewport 0->50
        let viewportData = linesLayout.getLinesViewportData(0, 50);
        assert.strictEqual(viewportData.startLineNumber, 1);
        assert.strictEqual(viewportData.endLineNumber, 5);
        assert.strictEqual(viewportData.completelyVisibleStartLineNumber, 1);
        assert.strictEqual(viewportData.completelyVisibleEndLineNumber, 5);
        assert.deepStrictEqual(viewportData.relativeVerticalOffset, [0, 10, 20, 30, 40]);
        // viewport 1->51
        viewportData = linesLayout.getLinesViewportData(1, 51);
        assert.strictEqual(viewportData.startLineNumber, 1);
        assert.strictEqual(viewportData.endLineNumber, 6);
        assert.strictEqual(viewportData.completelyVisibleStartLineNumber, 2);
        assert.strictEqual(viewportData.completelyVisibleEndLineNumber, 5);
        assert.deepStrictEqual(viewportData.relativeVerticalOffset, [0, 10, 20, 30, 40, 50]);
        // viewport 5->55
        viewportData = linesLayout.getLinesViewportData(5, 55);
        assert.strictEqual(viewportData.startLineNumber, 1);
        assert.strictEqual(viewportData.endLineNumber, 6);
        assert.strictEqual(viewportData.completelyVisibleStartLineNumber, 2);
        assert.strictEqual(viewportData.completelyVisibleEndLineNumber, 5);
        assert.deepStrictEqual(viewportData.relativeVerticalOffset, [0, 10, 20, 30, 40, 50]);
        // viewport 10->60
        viewportData = linesLayout.getLinesViewportData(10, 60);
        assert.strictEqual(viewportData.startLineNumber, 2);
        assert.strictEqual(viewportData.endLineNumber, 6);
        assert.strictEqual(viewportData.completelyVisibleStartLineNumber, 2);
        assert.strictEqual(viewportData.completelyVisibleEndLineNumber, 6);
        assert.deepStrictEqual(viewportData.relativeVerticalOffset, [10, 20, 30, 40, 50]);
        // viewport 50->100
        viewportData = linesLayout.getLinesViewportData(50, 100);
        assert.strictEqual(viewportData.startLineNumber, 6);
        assert.strictEqual(viewportData.endLineNumber, 6);
        assert.strictEqual(viewportData.completelyVisibleStartLineNumber, 6);
        assert.strictEqual(viewportData.completelyVisibleEndLineNumber, 6);
        assert.deepStrictEqual(viewportData.relativeVerticalOffset, [50]);
        // viewport 60->110
        viewportData = linesLayout.getLinesViewportData(60, 110);
        assert.strictEqual(viewportData.startLineNumber, 7);
        assert.strictEqual(viewportData.endLineNumber, 7);
        assert.strictEqual(viewportData.completelyVisibleStartLineNumber, 7);
        assert.strictEqual(viewportData.completelyVisibleEndLineNumber, 7);
        assert.deepStrictEqual(viewportData.relativeVerticalOffset, [160]);
        // viewport 65->115
        viewportData = linesLayout.getLinesViewportData(65, 115);
        assert.strictEqual(viewportData.startLineNumber, 7);
        assert.strictEqual(viewportData.endLineNumber, 7);
        assert.strictEqual(viewportData.completelyVisibleStartLineNumber, 7);
        assert.strictEqual(viewportData.completelyVisibleEndLineNumber, 7);
        assert.deepStrictEqual(viewportData.relativeVerticalOffset, [160]);
        // viewport 50->159
        viewportData = linesLayout.getLinesViewportData(50, 159);
        assert.strictEqual(viewportData.startLineNumber, 6);
        assert.strictEqual(viewportData.endLineNumber, 6);
        assert.strictEqual(viewportData.completelyVisibleStartLineNumber, 6);
        assert.strictEqual(viewportData.completelyVisibleEndLineNumber, 6);
        assert.deepStrictEqual(viewportData.relativeVerticalOffset, [50]);
        // viewport 50->160
        viewportData = linesLayout.getLinesViewportData(50, 160);
        assert.strictEqual(viewportData.startLineNumber, 6);
        assert.strictEqual(viewportData.endLineNumber, 6);
        assert.strictEqual(viewportData.completelyVisibleStartLineNumber, 6);
        assert.strictEqual(viewportData.completelyVisibleEndLineNumber, 6);
        assert.deepStrictEqual(viewportData.relativeVerticalOffset, [50]);
        // viewport 51->161
        viewportData = linesLayout.getLinesViewportData(51, 161);
        assert.strictEqual(viewportData.startLineNumber, 6);
        assert.strictEqual(viewportData.endLineNumber, 7);
        assert.strictEqual(viewportData.completelyVisibleStartLineNumber, 7);
        assert.strictEqual(viewportData.completelyVisibleEndLineNumber, 7);
        assert.deepStrictEqual(viewportData.relativeVerticalOffset, [50, 160]);
        // viewport 150->169
        viewportData = linesLayout.getLinesViewportData(150, 169);
        assert.strictEqual(viewportData.startLineNumber, 7);
        assert.strictEqual(viewportData.endLineNumber, 7);
        assert.strictEqual(viewportData.completelyVisibleStartLineNumber, 7);
        assert.strictEqual(viewportData.completelyVisibleEndLineNumber, 7);
        assert.deepStrictEqual(viewportData.relativeVerticalOffset, [160]);
        // viewport 159->169
        viewportData = linesLayout.getLinesViewportData(159, 169);
        assert.strictEqual(viewportData.startLineNumber, 7);
        assert.strictEqual(viewportData.endLineNumber, 7);
        assert.strictEqual(viewportData.completelyVisibleStartLineNumber, 7);
        assert.strictEqual(viewportData.completelyVisibleEndLineNumber, 7);
        assert.deepStrictEqual(viewportData.relativeVerticalOffset, [160]);
        // viewport 160->169
        viewportData = linesLayout.getLinesViewportData(160, 169);
        assert.strictEqual(viewportData.startLineNumber, 7);
        assert.strictEqual(viewportData.endLineNumber, 7);
        assert.strictEqual(viewportData.completelyVisibleStartLineNumber, 7);
        assert.strictEqual(viewportData.completelyVisibleEndLineNumber, 7);
        assert.deepStrictEqual(viewportData.relativeVerticalOffset, [160]);
        // viewport 160->1000
        viewportData = linesLayout.getLinesViewportData(160, 1000);
        assert.strictEqual(viewportData.startLineNumber, 7);
        assert.strictEqual(viewportData.endLineNumber, 10);
        assert.strictEqual(viewportData.completelyVisibleStartLineNumber, 7);
        assert.strictEqual(viewportData.completelyVisibleEndLineNumber, 10);
        assert.deepStrictEqual(viewportData.relativeVerticalOffset, [160, 170, 180, 190]);
    });
    test('LinesLayout getLinesViewportData 2 & getWhitespaceViewportData', () => {
        const linesLayout = new LinesLayout(10, 10, 0, 0, []);
        const a = insertWhitespace(linesLayout, 6, 0, 100, 0);
        const b = insertWhitespace(linesLayout, 7, 0, 50, 0);
        // 10 lines
        // whitespace: - a(6,100), b(7, 50)
        assert.strictEqual(linesLayout.getLinesTotalHeight(), 250);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(1), 0);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(2), 10);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(3), 20);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(4), 30);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(5), 40);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(6), 50);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(7), 160);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(8), 220);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(9), 230);
        assert.strictEqual(linesLayout.getVerticalOffsetForLineNumber(10), 240);
        // viewport 50->160
        let viewportData = linesLayout.getLinesViewportData(50, 160);
        assert.strictEqual(viewportData.startLineNumber, 6);
        assert.strictEqual(viewportData.endLineNumber, 6);
        assert.strictEqual(viewportData.completelyVisibleStartLineNumber, 6);
        assert.strictEqual(viewportData.completelyVisibleEndLineNumber, 6);
        assert.deepStrictEqual(viewportData.relativeVerticalOffset, [50]);
        let whitespaceData = linesLayout.getWhitespaceViewportData(50, 160);
        assert.deepStrictEqual(whitespaceData, [{
                id: a,
                afterLineNumber: 6,
                verticalOffset: 60,
                height: 100
            }]);
        // viewport 50->219
        viewportData = linesLayout.getLinesViewportData(50, 219);
        assert.strictEqual(viewportData.startLineNumber, 6);
        assert.strictEqual(viewportData.endLineNumber, 7);
        assert.strictEqual(viewportData.completelyVisibleStartLineNumber, 6);
        assert.strictEqual(viewportData.completelyVisibleEndLineNumber, 7);
        assert.deepStrictEqual(viewportData.relativeVerticalOffset, [50, 160]);
        whitespaceData = linesLayout.getWhitespaceViewportData(50, 219);
        assert.deepStrictEqual(whitespaceData, [{
                id: a,
                afterLineNumber: 6,
                verticalOffset: 60,
                height: 100
            }, {
                id: b,
                afterLineNumber: 7,
                verticalOffset: 170,
                height: 50
            }]);
        // viewport 50->220
        viewportData = linesLayout.getLinesViewportData(50, 220);
        assert.strictEqual(viewportData.startLineNumber, 6);
        assert.strictEqual(viewportData.endLineNumber, 7);
        assert.strictEqual(viewportData.completelyVisibleStartLineNumber, 6);
        assert.strictEqual(viewportData.completelyVisibleEndLineNumber, 7);
        assert.deepStrictEqual(viewportData.relativeVerticalOffset, [50, 160]);
        // viewport 50->250
        viewportData = linesLayout.getLinesViewportData(50, 250);
        assert.strictEqual(viewportData.startLineNumber, 6);
        assert.strictEqual(viewportData.endLineNumber, 10);
        assert.strictEqual(viewportData.completelyVisibleStartLineNumber, 6);
        assert.strictEqual(viewportData.completelyVisibleEndLineNumber, 10);
        assert.deepStrictEqual(viewportData.relativeVerticalOffset, [50, 160, 220, 230, 240]);
    });
    test('LinesLayout getWhitespaceAtVerticalOffset', () => {
        const linesLayout = new LinesLayout(10, 10, 0, 0, []);
        const a = insertWhitespace(linesLayout, 6, 0, 100, 0);
        const b = insertWhitespace(linesLayout, 7, 0, 50, 0);
        let whitespace = linesLayout.getWhitespaceAtVerticalOffset(0);
        assert.strictEqual(whitespace, null);
        whitespace = linesLayout.getWhitespaceAtVerticalOffset(59);
        assert.strictEqual(whitespace, null);
        whitespace = linesLayout.getWhitespaceAtVerticalOffset(60);
        assert.strictEqual(whitespace.id, a);
        whitespace = linesLayout.getWhitespaceAtVerticalOffset(61);
        assert.strictEqual(whitespace.id, a);
        whitespace = linesLayout.getWhitespaceAtVerticalOffset(159);
        assert.strictEqual(whitespace.id, a);
        whitespace = linesLayout.getWhitespaceAtVerticalOffset(160);
        assert.strictEqual(whitespace, null);
        whitespace = linesLayout.getWhitespaceAtVerticalOffset(161);
        assert.strictEqual(whitespace, null);
        whitespace = linesLayout.getWhitespaceAtVerticalOffset(169);
        assert.strictEqual(whitespace, null);
        whitespace = linesLayout.getWhitespaceAtVerticalOffset(170);
        assert.strictEqual(whitespace.id, b);
        whitespace = linesLayout.getWhitespaceAtVerticalOffset(171);
        assert.strictEqual(whitespace.id, b);
        whitespace = linesLayout.getWhitespaceAtVerticalOffset(219);
        assert.strictEqual(whitespace.id, b);
        whitespace = linesLayout.getWhitespaceAtVerticalOffset(220);
        assert.strictEqual(whitespace, null);
    });
    test('LinesLayout', () => {
        const linesLayout = new LinesLayout(100, 20, 0, 0, []);
        // Insert a whitespace after line number 2, of height 10
        const a = insertWhitespace(linesLayout, 2, 0, 10, 0);
        // whitespaces: a(2, 10)
        assert.strictEqual(linesLayout.getWhitespacesCount(), 1);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 2);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(0), 10);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(0), 10);
        assert.strictEqual(linesLayout.getWhitespacesTotalHeight(), 10);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 10);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 10);
        // Insert a whitespace again after line number 2, of height 20
        let b = insertWhitespace(linesLayout, 2, 0, 20, 0);
        // whitespaces: a(2, 10), b(2, 20)
        assert.strictEqual(linesLayout.getWhitespacesCount(), 2);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 2);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(0), 10);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 2);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(1), 20);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(0), 10);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(1), 30);
        assert.strictEqual(linesLayout.getWhitespacesTotalHeight(), 30);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 30);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 30);
        // Change last inserted whitespace height to 30
        changeOneWhitespace(linesLayout, b, 2, 30);
        // whitespaces: a(2, 10), b(2, 30)
        assert.strictEqual(linesLayout.getWhitespacesCount(), 2);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 2);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(0), 10);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 2);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(1), 30);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(0), 10);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(1), 40);
        assert.strictEqual(linesLayout.getWhitespacesTotalHeight(), 40);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 40);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 40);
        // Remove last inserted whitespace
        removeWhitespace(linesLayout, b);
        // whitespaces: a(2, 10)
        assert.strictEqual(linesLayout.getWhitespacesCount(), 1);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 2);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(0), 10);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(0), 10);
        assert.strictEqual(linesLayout.getWhitespacesTotalHeight(), 10);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 10);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 10);
        // Add a whitespace before the first line of height 50
        b = insertWhitespace(linesLayout, 0, 0, 50, 0);
        // whitespaces: b(0, 50), a(2, 10)
        assert.strictEqual(linesLayout.getWhitespacesCount(), 2);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 0);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(0), 50);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 2);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(1), 10);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(0), 50);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(1), 60);
        assert.strictEqual(linesLayout.getWhitespacesTotalHeight(), 60);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 50);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 50);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 60);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 60);
        // Add a whitespace after line 4 of height 20
        insertWhitespace(linesLayout, 4, 0, 20, 0);
        // whitespaces: b(0, 50), a(2, 10), c(4, 20)
        assert.strictEqual(linesLayout.getWhitespacesCount(), 3);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 0);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(0), 50);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 2);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(1), 10);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 4);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(2), 20);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(0), 50);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(1), 60);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(2), 80);
        assert.strictEqual(linesLayout.getWhitespacesTotalHeight(), 80);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 50);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 50);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 60);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 60);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(5), 80);
        // Add a whitespace after line 3 of height 30
        insertWhitespace(linesLayout, 3, 0, 30, 0);
        // whitespaces: b(0, 50), a(2, 10), d(3, 30), c(4, 20)
        assert.strictEqual(linesLayout.getWhitespacesCount(), 4);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 0);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(0), 50);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 2);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(1), 10);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 3);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(2), 30);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(3), 4);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(3), 20);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(0), 50);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(1), 60);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(2), 90);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(3), 110);
        assert.strictEqual(linesLayout.getWhitespacesTotalHeight(), 110);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 50);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 50);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 60);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 90);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(5), 110);
        // Change whitespace after line 2 to height of 100
        changeOneWhitespace(linesLayout, a, 2, 100);
        // whitespaces: b(0, 50), a(2, 100), d(3, 30), c(4, 20)
        assert.strictEqual(linesLayout.getWhitespacesCount(), 4);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 0);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(0), 50);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 2);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(1), 100);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 3);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(2), 30);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(3), 4);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(3), 20);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(0), 50);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(1), 150);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(2), 180);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(3), 200);
        assert.strictEqual(linesLayout.getWhitespacesTotalHeight(), 200);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 50);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 50);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 150);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 180);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(5), 200);
        // Remove whitespace after line 2
        removeWhitespace(linesLayout, a);
        // whitespaces: b(0, 50), d(3, 30), c(4, 20)
        assert.strictEqual(linesLayout.getWhitespacesCount(), 3);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 0);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(0), 50);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 3);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(1), 30);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 4);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(2), 20);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(0), 50);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(1), 80);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(2), 100);
        assert.strictEqual(linesLayout.getWhitespacesTotalHeight(), 100);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 50);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 50);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 50);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 80);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(5), 100);
        // Remove whitespace before line 1
        removeWhitespace(linesLayout, b);
        // whitespaces: d(3, 30), c(4, 20)
        assert.strictEqual(linesLayout.getWhitespacesCount(), 2);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 3);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(0), 30);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 4);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(1), 20);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(0), 30);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(1), 50);
        assert.strictEqual(linesLayout.getWhitespacesTotalHeight(), 50);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 30);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(5), 50);
        // Delete line 1
        linesLayout.onLinesDeleted(1, 1);
        // whitespaces: d(2, 30), c(3, 20)
        assert.strictEqual(linesLayout.getWhitespacesCount(), 2);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 2);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(0), 30);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 3);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(1), 20);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(0), 30);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(1), 50);
        assert.strictEqual(linesLayout.getWhitespacesTotalHeight(), 50);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 30);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 50);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(5), 50);
        // Insert a line before line 1
        linesLayout.onLinesInserted(1, 1);
        // whitespaces: d(3, 30), c(4, 20)
        assert.strictEqual(linesLayout.getWhitespacesCount(), 2);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 3);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(0), 30);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 4);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(1), 20);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(0), 30);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(1), 50);
        assert.strictEqual(linesLayout.getWhitespacesTotalHeight(), 50);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 30);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(5), 50);
        // Delete line 4
        linesLayout.onLinesDeleted(4, 4);
        // whitespaces: d(3, 30), c(3, 20)
        assert.strictEqual(linesLayout.getWhitespacesCount(), 2);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 3);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(0), 30);
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 3);
        assert.strictEqual(linesLayout.getHeightForWhitespaceIndex(1), 20);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(0), 30);
        assert.strictEqual(linesLayout.getWhitespacesAccumulatedHeight(1), 50);
        assert.strictEqual(linesLayout.getWhitespacesTotalHeight(), 50);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 0);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 50);
        assert.strictEqual(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(5), 50);
    });
    test('LinesLayout findInsertionIndex', () => {
        const makeInternalWhitespace = (afterLineNumbers, ordinal = 0) => {
            return afterLineNumbers.map((afterLineNumber) => new EditorWhitespace('', afterLineNumber, ordinal, 0, 0));
        };
        let arr;
        arr = makeInternalWhitespace([]);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 0, 0), 0);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 1, 0), 0);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 2, 0), 0);
        arr = makeInternalWhitespace([1]);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 0, 0), 0);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 1, 0), 1);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 2, 0), 1);
        arr = makeInternalWhitespace([1, 3]);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 0, 0), 0);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 1, 0), 1);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 2, 0), 1);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 3, 0), 2);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 4, 0), 2);
        arr = makeInternalWhitespace([1, 3, 5]);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 0, 0), 0);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 1, 0), 1);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 2, 0), 1);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 3, 0), 2);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 4, 0), 2);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 5, 0), 3);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 6, 0), 3);
        arr = makeInternalWhitespace([1, 3, 5], 3);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 0, 0), 0);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 1, 0), 0);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 2, 0), 1);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 3, 0), 1);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 4, 0), 2);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 5, 0), 2);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 6, 0), 3);
        arr = makeInternalWhitespace([1, 3, 5, 7]);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 0, 0), 0);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 1, 0), 1);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 2, 0), 1);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 3, 0), 2);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 4, 0), 2);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 5, 0), 3);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 6, 0), 3);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 7, 0), 4);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 8, 0), 4);
        arr = makeInternalWhitespace([1, 3, 5, 7, 9]);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 0, 0), 0);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 1, 0), 1);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 2, 0), 1);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 3, 0), 2);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 4, 0), 2);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 5, 0), 3);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 6, 0), 3);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 7, 0), 4);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 8, 0), 4);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 9, 0), 5);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 10, 0), 5);
        arr = makeInternalWhitespace([1, 3, 5, 7, 9, 11]);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 0, 0), 0);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 1, 0), 1);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 2, 0), 1);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 3, 0), 2);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 4, 0), 2);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 5, 0), 3);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 6, 0), 3);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 7, 0), 4);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 8, 0), 4);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 9, 0), 5);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 10, 0), 5);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 11, 0), 6);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 12, 0), 6);
        arr = makeInternalWhitespace([1, 3, 5, 7, 9, 11, 13]);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 0, 0), 0);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 1, 0), 1);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 2, 0), 1);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 3, 0), 2);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 4, 0), 2);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 5, 0), 3);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 6, 0), 3);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 7, 0), 4);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 8, 0), 4);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 9, 0), 5);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 10, 0), 5);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 11, 0), 6);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 12, 0), 6);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 13, 0), 7);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 14, 0), 7);
        arr = makeInternalWhitespace([1, 3, 5, 7, 9, 11, 13, 15]);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 0, 0), 0);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 1, 0), 1);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 2, 0), 1);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 3, 0), 2);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 4, 0), 2);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 5, 0), 3);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 6, 0), 3);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 7, 0), 4);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 8, 0), 4);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 9, 0), 5);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 10, 0), 5);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 11, 0), 6);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 12, 0), 6);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 13, 0), 7);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 14, 0), 7);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 15, 0), 8);
        assert.strictEqual(LinesLayout.findInsertionIndex(arr, 16, 0), 8);
    });
    test('LinesLayout changeWhitespaceAfterLineNumber & getFirstWhitespaceIndexAfterLineNumber', () => {
        const linesLayout = new LinesLayout(100, 20, 0, 0, []);
        const a = insertWhitespace(linesLayout, 0, 0, 1, 0);
        const b = insertWhitespace(linesLayout, 7, 0, 1, 0);
        const c = insertWhitespace(linesLayout, 3, 0, 1, 0);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(0), a); // 0
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 0);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(1), c); // 3
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 3);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(2), b); // 7
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 7);
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(1), 1); // c
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(2), 1); // c
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(3), 1); // c
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(4), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(5), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(6), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(7), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(8), -1); // --
        // Do not really move a
        changeOneWhitespace(linesLayout, a, 1, 1);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(0), a); // 1
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 1);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(1), c); // 3
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 3);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(2), b); // 7
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 7);
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(1), 0); // a
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(2), 1); // c
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(3), 1); // c
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(4), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(5), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(6), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(7), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(8), -1); // --
        // Do not really move a
        changeOneWhitespace(linesLayout, a, 2, 1);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(0), a); // 2
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 2);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(1), c); // 3
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 3);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(2), b); // 7
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 7);
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(1), 0); // a
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(2), 0); // a
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(3), 1); // c
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(4), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(5), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(6), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(7), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(8), -1); // --
        // Change a to conflict with c => a gets placed after c
        changeOneWhitespace(linesLayout, a, 3, 1);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(0), c); // 3
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 3);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(1), a); // 3
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 3);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(2), b); // 7
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 7);
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(1), 0); // c
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(2), 0); // c
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(3), 0); // c
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(4), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(5), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(6), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(7), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(8), -1); // --
        // Make a no-op
        changeOneWhitespace(linesLayout, c, 3, 1);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(0), c); // 3
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 3);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(1), a); // 3
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 3);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(2), b); // 7
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 7);
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(1), 0); // c
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(2), 0); // c
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(3), 0); // c
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(4), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(5), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(6), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(7), 2); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(8), -1); // --
        // Conflict c with b => c gets placed after b
        changeOneWhitespace(linesLayout, c, 7, 1);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(0), a); // 3
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 3);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(1), b); // 7
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 7);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(2), c); // 7
        assert.strictEqual(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 7);
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(1), 0); // a
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(2), 0); // a
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(3), 0); // a
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(4), 1); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(5), 1); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(6), 1); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(7), 1); // b
        assert.strictEqual(linesLayout.getFirstWhitespaceIndexAfterLineNumber(8), -1); // --
    });
    test('LinesLayout Bug', () => {
        const linesLayout = new LinesLayout(100, 20, 0, 0, []);
        const a = insertWhitespace(linesLayout, 0, 0, 1, 0);
        const b = insertWhitespace(linesLayout, 7, 0, 1, 0);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(0), a); // 0
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(1), b); // 7
        const c = insertWhitespace(linesLayout, 3, 0, 1, 0);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(0), a); // 0
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(1), c); // 3
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(2), b); // 7
        const d = insertWhitespace(linesLayout, 2, 0, 1, 0);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(0), a); // 0
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(1), d); // 2
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(2), c); // 3
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(3), b); // 7
        const e = insertWhitespace(linesLayout, 8, 0, 1, 0);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(0), a); // 0
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(1), d); // 2
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(2), c); // 3
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(3), b); // 7
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(4), e); // 8
        const f = insertWhitespace(linesLayout, 11, 0, 1, 0);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(0), a); // 0
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(1), d); // 2
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(2), c); // 3
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(3), b); // 7
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(4), e); // 8
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(5), f); // 11
        const g = insertWhitespace(linesLayout, 10, 0, 1, 0);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(0), a); // 0
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(1), d); // 2
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(2), c); // 3
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(3), b); // 7
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(4), e); // 8
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(5), g); // 10
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(6), f); // 11
        const h = insertWhitespace(linesLayout, 0, 0, 1, 0);
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(0), a); // 0
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(1), h); // 0
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(2), d); // 2
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(3), c); // 3
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(4), b); // 7
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(5), e); // 8
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(6), g); // 10
        assert.strictEqual(linesLayout.getIdForWhitespaceIndex(7), f); // 11
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGluZXNMYXlvdXQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2NvbW1vbi92aWV3TGF5b3V0L2xpbmVzTGF5b3V0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxXQUFXLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUUxRixLQUFLLENBQUMsaUNBQWlDLEVBQUUsR0FBRyxFQUFFO0lBRTdDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsU0FBUyxnQkFBZ0IsQ0FBQyxXQUF3QixFQUFFLGVBQXVCLEVBQUUsT0FBZSxFQUFFLFVBQWtCLEVBQUUsUUFBZ0I7UUFDakksSUFBSSxFQUFVLENBQUM7UUFDZixXQUFXLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRTtZQUN6QyxFQUFFLEdBQUcsUUFBUSxDQUFDLGdCQUFnQixDQUFDLGVBQWUsRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ2hGLENBQUMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxFQUFHLENBQUM7SUFDWixDQUFDO0lBRUQsU0FBUyxtQkFBbUIsQ0FBQyxXQUF3QixFQUFFLEVBQVUsRUFBRSxrQkFBMEIsRUFBRSxTQUFpQjtRQUMvRyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRTtZQUN6QyxRQUFRLENBQUMsbUJBQW1CLENBQUMsRUFBRSxFQUFFLGtCQUFrQixFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ2pFLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELFNBQVMsZ0JBQWdCLENBQUMsV0FBd0IsRUFBRSxFQUFVO1FBQzdELFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFO1lBQ3pDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMvQixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxJQUFJLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtRQUUxQiwwQkFBMEI7UUFDMUIsTUFBTSxXQUFXLEdBQUcsSUFBSSxXQUFXLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRXRELDJDQUEyQztRQUMzQyxnQkFBZ0I7UUFDaEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUMzRCxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUV2RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU1RSw4Q0FBOEM7UUFDOUMsZ0JBQWdCLENBQUMsV0FBVyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFDLDJDQUEyQztRQUMzQyxxQkFBcUI7UUFDckIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUMzRCxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUV0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM5RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUU5RSx5Q0FBeUM7UUFDekMsZ0JBQWdCLENBQUMsV0FBVyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFDLGdCQUFnQixDQUFDLFdBQVcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQywyQ0FBMkM7UUFDM0MsdUNBQXVDO1FBQ3ZDLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG1CQUFtQixFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDM0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsbUNBQW1DLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXO1FBQ3ZGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG1DQUFtQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVztRQUN2RixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUUzRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ25GLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLDBDQUEwQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFdEYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtRQUUxQix1RUFBdUU7UUFDdkUsTUFBTSxXQUFXLEdBQUcsSUFBSSxXQUFXLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3JELE1BQU0sQ0FBQyxHQUFHLGdCQUFnQixDQUFDLFdBQVcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVwRCxXQUFXO1FBQ1gsdUJBQXVCO1FBQ3ZCLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG1CQUFtQixFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDMUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFdkUsMkJBQTJCO1FBQzNCLFdBQVc7UUFDWCx3QkFBd0I7UUFDeEIsbUJBQW1CLENBQUMsV0FBVyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMxRCxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUV2RSw2QkFBNkI7UUFDN0IsV0FBVztRQUNYLHdCQUF3QjtRQUN4QixtQkFBbUIsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzFELE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLDhCQUE4QixDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRXZFLDBDQUEwQztRQUMxQyxVQUFVO1FBQ1Ysd0JBQXdCO1FBQ3hCLFdBQVcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG1CQUFtQixFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDMUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFdEUsb0NBQW9DO1FBQ3BDLFdBQVc7UUFDWCx3QkFBd0I7UUFDeEIsV0FBVyxDQUFDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMxRCxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFB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LENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUV4RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU1RSw4Q0FBOEM7UUFDOUMsZ0JBQWdCLENBQUMsV0FBVyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFDLDJDQUEyQztRQUMzQyxxQkFBcUI7UUFDckIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUMzRCxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUV0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU1RSx5Q0FBeUM7UUFDekMsZ0JBQWdCLENBQUMsV0FBVyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFDLGdCQUFnQixDQUFDLFdBQVcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQywyQ0FBMkM7UUFDM0MsdUNBQXVDO1FBQ3ZDLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG1CQUFtQixFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDM0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsbUNBQW1DLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXO1FBQ3ZGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG1DQUFtQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVztRQUN2RixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUUzRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3BGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGtEQUFrRCxFQUFFLEdBQUcsRUFBRTtRQUM3RCxNQUFNLFdBQVcsR0FBRyxJQUFJLFdBQVcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDckQsZ0JBQWdCLENBQUMsV0FBVyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTNDLFdBQVc7UUFDWCx3QkFBd0I7UUFDeEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMxRCxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUV2RSxzQkFBc0I7UUFDdEIsK0NBQStDO1FBQy9DLCtDQUErQztRQUMvQyxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG9DQUFvQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDN0UsTUFBTSxDQUFD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QyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRWxGLG1DQUFtQztRQUNuQywrQ0FBK0M7UUFDL0MsK0NBQStDO1FBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbkYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ25GLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNuRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbkYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ25GLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxD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OEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN2RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN2RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN2RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUV4RSxtQkFBbUI7UUFDbkIsSUFBSSxZQUFZLEdBQUcsV0FBVyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUM3RCxNQUFNLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDcEQsTUFBTSxDQUFDLFdB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QUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzNELE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV0QyxVQUFVLEdBQUcsV0FBVyxDQUFDLDZCQUE2QixDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzVELE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV0QyxVQUFVLEdBQUcsV0FBVyxDQUFDLDZCQUE2QixDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzVELE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRXJDLFVBQVUsR0FBRyxXQUFXLENBQUMsNkJBQTZCLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDNUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFckMsVUFBVSxHQUFHLFdBQVcsQ0FBQyw2QkFBNkIsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM1RCxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUVyQyxVQUFVLEdBQUcsV0FBVyxDQUFDLDZCQUE2QixDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzVELE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV0QyxVQUFVLEdBQUcsV0FBVyxDQUFDLDZCQUE2QixDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzVELE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV0QyxVQUFVLEdBQUcsV0FBVyxDQUFDLDZCQUE2QixDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzVELE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV0QyxVQUFVLEdBQUcsV0FBVyxDQUFDLDZCQUE2QixDQUFDLEdBQUcsQ0FBQyxDQUFD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UUFDekQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsK0JBQStCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsK0JBQStCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsK0JBQStCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsK0JBQStCLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDeEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMseUJBQXlCLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4Q0FBOEMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4Q0FBOEMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4Q0FBOEMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4Q0FBOEMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4Q0FBOEMsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUV2RixrREFBa0Q7UUFDbEQsbUJBQW1CLENBQUMsV0FBVyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDNUMsdURBQXVEO1FBQ3ZELE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG1CQUFtQixFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDekQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDcEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsK0JBQStCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsK0JBQStCLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDeEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsK0JBQStCLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDeEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsK0JBQStCLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDeEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMseUJBQXlCLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4Q0FBOEMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyw4Q0FBOEMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFF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QUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVqRSxHQUFHLEdBQUcsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRWpFLEdBQUcsR0FBRyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVqRSxHQUFHLEdBQUcsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVqRSxHQUFHLEdBQUcsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFakUsR0FBRyxHQUFHLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVqRSxHQUFHLEdBQUcsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5QyxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFbEUsR0FBRyxHQUFHLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xELE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFbEUsR0FBRyxHQUFHLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN0RCxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVsRSxHQUFHLEdBQUcsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxRCxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcs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QUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJO1FBQ25FLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLG9DQUFvQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTNFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLHNDQUFzQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSTtRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUk7UUFDbEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsc0NBQXNDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJO1FBQ2xGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLHNDQUFzQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSTtRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUk7UUFDbEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsc0NBQXNDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJO1FBQ2xGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLHNDQUFzQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSTtRQUNsRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENB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QVcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUk7UUFDbkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJO1FBQ25FLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSTtRQUNuRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUk7UUFDbkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJO1FBRW5FLE1BQU0sQ0FBQyxHQUFHLGdCQUFnQixDQUFDLFdBQVcsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRCxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUk7UUFDbkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJO1FBQ25FLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSTtRQUNuRSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUk7UUFDbkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsdUJBQXVCLENBQUMs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