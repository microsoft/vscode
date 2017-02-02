/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { VerticalObjects } from 'vs/editor/common/viewLayout/verticalObjects';

suite('Editor ViewLayout - VerticalObjects', () => {

	test('VerticalObjects 1', () => {

		var verticalObjects = new VerticalObjects();

		// Start off with 10 lines
		verticalObjects.replaceLines(10);

		// lines: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
		// whitespace: -
		assert.equal(verticalObjects.getTotalHeight(10), 100);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(1, 10), 0);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(2, 10), 10);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(3, 10), 20);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(4, 10), 30);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(5, 10), 40);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(6, 10), 50);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(7, 10), 60);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(8, 10), 70);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(9, 10), 80);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(10, 10), 90);

		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(0, 10), 1);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(1, 10), 1);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(5, 10), 1);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(9, 10), 1);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(10, 10), 2);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(11, 10), 2);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(15, 10), 2);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(19, 10), 2);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(20, 10), 3);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(21, 10), 3);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(29, 10), 3);

		// Add whitespace of height 5px after 2nd line
		verticalObjects.insertWhitespace(2, 0, 5);
		// lines: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
		// whitespace: a(2,5)
		assert.equal(verticalObjects.getTotalHeight(10), 105);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(1, 10), 0);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(2, 10), 10);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(3, 10), 25);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(4, 10), 35);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(5, 10), 45);

		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(0, 10), 1);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(1, 10), 1);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(9, 10), 1);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(10, 10), 2);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(20, 10), 3);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(21, 10), 3);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(24, 10), 3);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(25, 10), 3);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(35, 10), 4);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(45, 10), 5);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(104, 10), 10);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(105, 10), 10);

		// Add two more whitespaces of height 5px
		verticalObjects.insertWhitespace(3, 0, 5);
		verticalObjects.insertWhitespace(4, 0, 5);
		// lines: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
		// whitespace: a(2,5), b(3, 5), c(4, 5)
		assert.equal(verticalObjects.getTotalHeight(10), 115);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(1, 10), 0);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(2, 10), 10);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(3, 10), 25);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(4, 10), 40);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(5, 10), 55);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(6, 10), 65);

		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(0, 10), 1);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(1, 10), 1);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(9, 10), 1);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(10, 10), 2);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(19, 10), 2);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(20, 10), 3);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(34, 10), 3);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(35, 10), 4);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(49, 10), 4);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(50, 10), 5);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(64, 10), 5);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(65, 10), 6);

		assert.equal(verticalObjects.getVerticalOffsetForWhitespaceIndex(0, 10), 20); // 20 -> 25
		assert.equal(verticalObjects.getVerticalOffsetForWhitespaceIndex(1, 10), 35); // 35 -> 40
		assert.equal(verticalObjects.getVerticalOffsetForWhitespaceIndex(2, 10), 50);

		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(0, 10), 0);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(19, 10), 0);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(20, 10), 0);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(21, 10), 0);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(22, 10), 0);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(23, 10), 0);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(24, 10), 0);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(25, 10), 1);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(26, 10), 1);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(34, 10), 1);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(35, 10), 1);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(36, 10), 1);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(39, 10), 1);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(40, 10), 2);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(41, 10), 2);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(49, 10), 2);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(50, 10), 2);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(51, 10), 2);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(54, 10), 2);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(55, 10), -1);
		assert.equal(verticalObjects.getWhitespaceIndexAtOrAfterVerticallOffset(1000, 10), -1);

	});

	test('VerticalObjects 2', () => {

		var verticalObjects = new VerticalObjects();

		// Start off with 10 lines and one whitespace after line 2, of height 5
		verticalObjects.replaceLines(10);
		var a = verticalObjects.insertWhitespace(2, 0, 5);

		// 10 lines
		// whitespace: - a(2,5)
		assert.equal(verticalObjects.getTotalHeight(1), 15);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(1, 1), 0);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(2, 1), 1);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(3, 1), 7);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(4, 1), 8);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(5, 1), 9);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(6, 1), 10);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(7, 1), 11);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(8, 1), 12);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(9, 1), 13);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(10, 1), 14);

		// Change whitespace height
		// 10 lines
		// whitespace: - a(2,10)
		verticalObjects.changeWhitespace(a, 2, 10);
		assert.equal(verticalObjects.getTotalHeight(1), 20);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(1, 1), 0);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(2, 1), 1);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(3, 1), 12);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(4, 1), 13);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(5, 1), 14);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(6, 1), 15);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(7, 1), 16);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(8, 1), 17);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(9, 1), 18);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(10, 1), 19);

		// Change whitespace position
		// 10 lines
		// whitespace: - a(5,10)
		verticalObjects.changeWhitespace(a, 5, 10);
		assert.equal(verticalObjects.getTotalHeight(1), 20);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(1, 1), 0);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(2, 1), 1);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(3, 1), 2);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(4, 1), 3);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(5, 1), 4);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(6, 1), 15);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(7, 1), 16);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(8, 1), 17);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(9, 1), 18);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(10, 1), 19);

		// Pretend that lines 5 and 6 were deleted
		// 8 lines
		// whitespace: - a(4,10)
		verticalObjects.onModelLinesDeleted(5, 6);
		assert.equal(verticalObjects.getTotalHeight(1), 18);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(1, 1), 0);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(2, 1), 1);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(3, 1), 2);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(4, 1), 3);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(5, 1), 14);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(6, 1), 15);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(7, 1), 16);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(8, 1), 17);

		// Insert two lines at the beginning
		// 10 lines
		// whitespace: - a(6,10)
		verticalObjects.onModelLinesInserted(1, 2);
		assert.equal(verticalObjects.getTotalHeight(1), 20);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(1, 1), 0);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(2, 1), 1);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(3, 1), 2);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(4, 1), 3);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(5, 1), 4);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(6, 1), 5);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(7, 1), 16);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(8, 1), 17);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(9, 1), 18);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(10, 1), 19);

		// Remove whitespace
		// 10 lines
		verticalObjects.removeWhitespace(a);
		assert.equal(verticalObjects.getTotalHeight(1), 10);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(1, 1), 0);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(2, 1), 1);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(3, 1), 2);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(4, 1), 3);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(5, 1), 4);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(6, 1), 5);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(7, 1), 6);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(8, 1), 7);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(9, 1), 8);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(10, 1), 9);
	});

	test('VerticalObjects getLineNumberAtOrAfterVerticalOffset', () => {
		var verticalObjects = new VerticalObjects();
		verticalObjects.replaceLines(10);
		verticalObjects.insertWhitespace(6, 0, 10);

		// 10 lines
		// whitespace: - a(6,10)
		assert.equal(verticalObjects.getTotalHeight(1), 20);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(1, 1), 0);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(2, 1), 1);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(3, 1), 2);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(4, 1), 3);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(5, 1), 4);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(6, 1), 5);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(7, 1), 16);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(8, 1), 17);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(9, 1), 18);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(10, 1), 19);

		// Do some hit testing
		// line      [1, 2, 3, 4, 5, 6,  7,  8,  9, 10]
		// vertical: [0, 1, 2, 3, 4, 5, 16, 17, 18, 19]
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(-100, 1), 1);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(-1, 1), 1);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(0, 1), 1);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(1, 1), 2);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(2, 1), 3);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(3, 1), 4);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(4, 1), 5);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(5, 1), 6);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(6, 1), 7);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(7, 1), 7);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(8, 1), 7);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(9, 1), 7);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(10, 1), 7);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(11, 1), 7);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(12, 1), 7);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(13, 1), 7);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(14, 1), 7);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(15, 1), 7);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(16, 1), 7);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(17, 1), 8);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(18, 1), 9);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(19, 1), 10);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(20, 1), 10);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(21, 1), 10);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(22, 1), 10);
		assert.equal(verticalObjects.getLineNumberAtOrAfterVerticalOffset(23, 1), 10);
	});

	test('VerticalObjects getCenteredLineInViewport', () => {
		var verticalObjects = new VerticalObjects();
		verticalObjects.replaceLines(10);
		verticalObjects.insertWhitespace(6, 0, 10);

		// 10 lines
		// whitespace: - a(6,10)
		assert.equal(verticalObjects.getTotalHeight(1), 20);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(1, 1), 0);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(2, 1), 1);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(3, 1), 2);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(4, 1), 3);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(5, 1), 4);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(6, 1), 5);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(7, 1), 16);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(8, 1), 17);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(9, 1), 18);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(10, 1), 19);

		// Find centered line in viewport 1
		// line      [1, 2, 3, 4, 5, 6,  7,  8,  9, 10]
		// vertical: [0, 1, 2, 3, 4, 5, 16, 17, 18, 19]
		assert.equal(verticalObjects.getLinesViewportData(0, 1, 1).centeredLineNumber, 1);
		assert.equal(verticalObjects.getLinesViewportData(0, 2, 1).centeredLineNumber, 2);
		assert.equal(verticalObjects.getLinesViewportData(0, 3, 1).centeredLineNumber, 2);
		assert.equal(verticalObjects.getLinesViewportData(0, 4, 1).centeredLineNumber, 3);
		assert.equal(verticalObjects.getLinesViewportData(0, 5, 1).centeredLineNumber, 3);
		assert.equal(verticalObjects.getLinesViewportData(0, 6, 1).centeredLineNumber, 4);
		assert.equal(verticalObjects.getLinesViewportData(0, 7, 1).centeredLineNumber, 4);
		assert.equal(verticalObjects.getLinesViewportData(0, 8, 1).centeredLineNumber, 5);
		assert.equal(verticalObjects.getLinesViewportData(0, 9, 1).centeredLineNumber, 5);
		assert.equal(verticalObjects.getLinesViewportData(0, 10, 1).centeredLineNumber, 6);
		assert.equal(verticalObjects.getLinesViewportData(0, 11, 1).centeredLineNumber, 6);
		assert.equal(verticalObjects.getLinesViewportData(0, 12, 1).centeredLineNumber, 6);
		assert.equal(verticalObjects.getLinesViewportData(0, 13, 1).centeredLineNumber, 6);
		assert.equal(verticalObjects.getLinesViewportData(0, 14, 1).centeredLineNumber, 6);
		assert.equal(verticalObjects.getLinesViewportData(0, 15, 1).centeredLineNumber, 6);
		assert.equal(verticalObjects.getLinesViewportData(0, 16, 1).centeredLineNumber, 6);
		assert.equal(verticalObjects.getLinesViewportData(0, 17, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(0, 18, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(0, 19, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(0, 20, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(0, 21, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(0, 22, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(0, 23, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(0, 24, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(0, 25, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(0, 26, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(0, 27, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(0, 28, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(0, 29, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(0, 30, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(0, 31, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(0, 32, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(0, 33, 1).centeredLineNumber, 7);

		// Find centered line in viewport 2
		// line      [1, 2, 3, 4, 5, 6,  7,  8,  9, 10]
		// vertical: [0, 1, 2, 3, 4, 5, 16, 17, 18, 19]
		assert.equal(verticalObjects.getLinesViewportData(0, 20, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(1, 20, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(2, 20, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(3, 20, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(4, 20, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(5, 20, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(6, 20, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(7, 20, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(8, 20, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(9, 20, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(10, 20, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(11, 20, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(12, 20, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(13, 20, 1).centeredLineNumber, 7);
		assert.equal(verticalObjects.getLinesViewportData(14, 20, 1).centeredLineNumber, 8);
		assert.equal(verticalObjects.getLinesViewportData(15, 20, 1).centeredLineNumber, 8);
		assert.equal(verticalObjects.getLinesViewportData(16, 20, 1).centeredLineNumber, 9);
		assert.equal(verticalObjects.getLinesViewportData(17, 20, 1).centeredLineNumber, 9);
		assert.equal(verticalObjects.getLinesViewportData(18, 20, 1).centeredLineNumber, 10);
		assert.equal(verticalObjects.getLinesViewportData(19, 20, 1).centeredLineNumber, 10);
		assert.equal(verticalObjects.getLinesViewportData(20, 23, 1).centeredLineNumber, 10);
		assert.equal(verticalObjects.getLinesViewportData(21, 23, 1).centeredLineNumber, 10);
		assert.equal(verticalObjects.getLinesViewportData(22, 23, 1).centeredLineNumber, 10);
	});

	test('VerticalObjects getLinesViewportData 1', () => {
		var verticalObjects = new VerticalObjects();
		verticalObjects.replaceLines(10);
		verticalObjects.insertWhitespace(6, 0, 100);

		// 10 lines
		// whitespace: - a(6,100)
		assert.equal(verticalObjects.getTotalHeight(10), 200);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(1, 10), 0);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(2, 10), 10);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(3, 10), 20);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(4, 10), 30);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(5, 10), 40);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(6, 10), 50);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(7, 10), 160);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(8, 10), 170);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(9, 10), 180);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(10, 10), 190);

		// viewport 0->50
		var viewportData = verticalObjects.getLinesViewportData(0, 50, 10);
		assert.equal(viewportData.startLineNumber, 1);
		assert.equal(viewportData.endLineNumber, 5);
		assert.deepEqual(viewportData.relativeVerticalOffset, [0, 10, 20, 30, 40]);
		assert.equal(viewportData.visibleRangesDeltaTop, 0);

		// viewport 1->51
		viewportData = verticalObjects.getLinesViewportData(1, 51, 10);
		assert.equal(viewportData.startLineNumber, 1);
		assert.equal(viewportData.endLineNumber, 6);
		assert.deepEqual(viewportData.relativeVerticalOffset, [0, 10, 20, 30, 40, 50]);
		assert.equal(viewportData.visibleRangesDeltaTop, -1);

		// viewport 5->55
		viewportData = verticalObjects.getLinesViewportData(5, 55, 10);
		assert.equal(viewportData.startLineNumber, 1);
		assert.equal(viewportData.endLineNumber, 6);
		assert.deepEqual(viewportData.relativeVerticalOffset, [0, 10, 20, 30, 40, 50]);
		assert.equal(viewportData.visibleRangesDeltaTop, -5);

		// viewport 10->60
		viewportData = verticalObjects.getLinesViewportData(10, 60, 10);
		assert.equal(viewportData.startLineNumber, 2);
		assert.equal(viewportData.endLineNumber, 6);
		assert.deepEqual(viewportData.relativeVerticalOffset, [10, 20, 30, 40, 50]);
		assert.equal(viewportData.visibleRangesDeltaTop, -10);

		// viewport 50->100
		viewportData = verticalObjects.getLinesViewportData(50, 100, 10);
		assert.equal(viewportData.startLineNumber, 6);
		assert.equal(viewportData.endLineNumber, 6);
		assert.deepEqual(viewportData.relativeVerticalOffset, [50]);
		assert.equal(viewportData.visibleRangesDeltaTop, -50);

		// viewport 60->110
		viewportData = verticalObjects.getLinesViewportData(60, 110, 10);
		assert.equal(viewportData.startLineNumber, 7);
		assert.equal(viewportData.endLineNumber, 7);
		assert.deepEqual(viewportData.relativeVerticalOffset, [160]);
		assert.equal(viewportData.visibleRangesDeltaTop, -60);

		// viewport 65->115
		viewportData = verticalObjects.getLinesViewportData(65, 115, 10);
		assert.equal(viewportData.startLineNumber, 7);
		assert.equal(viewportData.endLineNumber, 7);
		assert.deepEqual(viewportData.relativeVerticalOffset, [160]);
		assert.equal(viewportData.visibleRangesDeltaTop, -65);

		// viewport 50->159
		viewportData = verticalObjects.getLinesViewportData(50, 159, 10);
		assert.equal(viewportData.startLineNumber, 6);
		assert.equal(viewportData.endLineNumber, 6);
		assert.deepEqual(viewportData.relativeVerticalOffset, [50]);
		assert.equal(viewportData.visibleRangesDeltaTop, -50);

		// viewport 50->160
		viewportData = verticalObjects.getLinesViewportData(50, 160, 10);
		assert.equal(viewportData.startLineNumber, 6);
		assert.equal(viewportData.endLineNumber, 6);
		assert.deepEqual(viewportData.relativeVerticalOffset, [50]);
		assert.equal(viewportData.visibleRangesDeltaTop, -50);

		// viewport 51->161
		viewportData = verticalObjects.getLinesViewportData(51, 161, 10);
		assert.equal(viewportData.startLineNumber, 6);
		assert.equal(viewportData.endLineNumber, 7);
		assert.deepEqual(viewportData.relativeVerticalOffset, [50, 160]);
		assert.equal(viewportData.visibleRangesDeltaTop, -51);


		// viewport 150->169
		viewportData = verticalObjects.getLinesViewportData(150, 169, 10);
		assert.equal(viewportData.startLineNumber, 7);
		assert.equal(viewportData.endLineNumber, 7);
		assert.deepEqual(viewportData.relativeVerticalOffset, [160]);
		assert.equal(viewportData.visibleRangesDeltaTop, -150);

		// viewport 159->169
		viewportData = verticalObjects.getLinesViewportData(159, 169, 10);
		assert.equal(viewportData.startLineNumber, 7);
		assert.equal(viewportData.endLineNumber, 7);
		assert.deepEqual(viewportData.relativeVerticalOffset, [160]);
		assert.equal(viewportData.visibleRangesDeltaTop, -159);

		// viewport 160->169
		viewportData = verticalObjects.getLinesViewportData(160, 169, 10);
		assert.equal(viewportData.startLineNumber, 7);
		assert.equal(viewportData.endLineNumber, 7);
		assert.deepEqual(viewportData.relativeVerticalOffset, [160]);
		assert.equal(viewportData.visibleRangesDeltaTop, -160);


		// viewport 160->1000
		viewportData = verticalObjects.getLinesViewportData(160, 1000, 10);
		assert.equal(viewportData.startLineNumber, 7);
		assert.equal(viewportData.endLineNumber, 10);
		assert.deepEqual(viewportData.relativeVerticalOffset, [160, 170, 180, 190]);
		assert.equal(viewportData.visibleRangesDeltaTop, -160);
	});


	test('VerticalObjects getLinesViewportData 2 & getWhitespaceViewportData', () => {
		var verticalObjects = new VerticalObjects();
		verticalObjects.replaceLines(10);
		var a = verticalObjects.insertWhitespace(6, 0, 100);
		var b = verticalObjects.insertWhitespace(7, 0, 50);

		// 10 lines
		// whitespace: - a(6,100), b(7, 50)
		assert.equal(verticalObjects.getTotalHeight(10), 250);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(1, 10), 0);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(2, 10), 10);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(3, 10), 20);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(4, 10), 30);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(5, 10), 40);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(6, 10), 50);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(7, 10), 160);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(8, 10), 220);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(9, 10), 230);
		assert.equal(verticalObjects.getVerticalOffsetForLineNumber(10, 10), 240);

		// viewport 50->160
		var viewportData = verticalObjects.getLinesViewportData(50, 160, 10);
		assert.equal(viewportData.startLineNumber, 6);
		assert.equal(viewportData.endLineNumber, 6);
		assert.deepEqual(viewportData.relativeVerticalOffset, [50]);
		assert.equal(viewportData.visibleRangesDeltaTop, -50);
		var whitespaceData = verticalObjects.getWhitespaceViewportData(50, 160, 10);
		assert.deepEqual(whitespaceData, [{
			id: a,
			afterLineNumber: 6,
			verticalOffset: 60,
			height: 100
		}]);

		// viewport 50->219
		viewportData = verticalObjects.getLinesViewportData(50, 219, 10);
		assert.equal(viewportData.startLineNumber, 6);
		assert.equal(viewportData.endLineNumber, 7);
		assert.deepEqual(viewportData.relativeVerticalOffset, [50, 160]);
		assert.equal(viewportData.visibleRangesDeltaTop, -50);
		whitespaceData = verticalObjects.getWhitespaceViewportData(50, 219, 10);
		assert.deepEqual(whitespaceData, [{
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
		viewportData = verticalObjects.getLinesViewportData(50, 220, 10);
		assert.equal(viewportData.startLineNumber, 6);
		assert.equal(viewportData.endLineNumber, 7);
		assert.deepEqual(viewportData.relativeVerticalOffset, [50, 160]);
		assert.equal(viewportData.visibleRangesDeltaTop, -50);

		// viewport 50->250
		viewportData = verticalObjects.getLinesViewportData(50, 250, 10);
		assert.equal(viewportData.startLineNumber, 6);
		assert.equal(viewportData.endLineNumber, 10);
		assert.deepEqual(viewportData.relativeVerticalOffset, [50, 160, 220, 230, 240]);
		assert.equal(viewportData.visibleRangesDeltaTop, -50);
	});

	test('VerticalObjects getWhitespaceAtVerticalOffset', () => {
		var verticalObjects = new VerticalObjects();
		verticalObjects.replaceLines(10);
		var a = verticalObjects.insertWhitespace(6, 0, 100);
		var b = verticalObjects.insertWhitespace(7, 0, 50);

		var whitespace = verticalObjects.getWhitespaceAtVerticalOffset(0, 10);
		assert.equal(whitespace, null);

		whitespace = verticalObjects.getWhitespaceAtVerticalOffset(59, 10);
		assert.equal(whitespace, null);

		whitespace = verticalObjects.getWhitespaceAtVerticalOffset(60, 10);
		assert.equal(whitespace.id, a);

		whitespace = verticalObjects.getWhitespaceAtVerticalOffset(61, 10);
		assert.equal(whitespace.id, a);

		whitespace = verticalObjects.getWhitespaceAtVerticalOffset(159, 10);
		assert.equal(whitespace.id, a);

		whitespace = verticalObjects.getWhitespaceAtVerticalOffset(160, 10);
		assert.equal(whitespace, null);

		whitespace = verticalObjects.getWhitespaceAtVerticalOffset(161, 10);
		assert.equal(whitespace, null);

		whitespace = verticalObjects.getWhitespaceAtVerticalOffset(169, 10);
		assert.equal(whitespace, null);

		whitespace = verticalObjects.getWhitespaceAtVerticalOffset(170, 10);
		assert.equal(whitespace.id, b);

		whitespace = verticalObjects.getWhitespaceAtVerticalOffset(171, 10);
		assert.equal(whitespace.id, b);

		whitespace = verticalObjects.getWhitespaceAtVerticalOffset(219, 10);
		assert.equal(whitespace.id, b);

		whitespace = verticalObjects.getWhitespaceAtVerticalOffset(220, 10);
		assert.equal(whitespace, null);
	});
});
