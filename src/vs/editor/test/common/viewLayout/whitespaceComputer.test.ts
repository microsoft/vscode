/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { WhitespaceComputer } from 'vs/editor/common/viewLayout/whitespaceComputer';

suite('Editor ViewLayout - WhitespaceComputer', () => {

	test('WhitespaceComputer', () => {

		var whitespaceComputer = new WhitespaceComputer();

		// Insert a whitespace after line number 2, of height 10
		var a = whitespaceComputer.insertWhitespace(2, 0, 10);
		// whitespaces: a(2, 10)
		assert.equal(whitespaceComputer.getCount(), 1);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 2);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(0), 10);
		assert.equal(whitespaceComputer.getAccumulatedHeight(0), 10);
		assert.equal(whitespaceComputer.getTotalHeight(), 10);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(1), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(2), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(3), 10);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(4), 10);

		// Insert a whitespace again after line number 2, of height 20
		var b = whitespaceComputer.insertWhitespace(2, 0, 20);
		// whitespaces: a(2, 10), b(2, 20)
		assert.equal(whitespaceComputer.getCount(), 2);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 2);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(0), 10);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(1), 2);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(1), 20);
		assert.equal(whitespaceComputer.getAccumulatedHeight(0), 10);
		assert.equal(whitespaceComputer.getAccumulatedHeight(1), 30);
		assert.equal(whitespaceComputer.getTotalHeight(), 30);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(1), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(2), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(3), 30);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(4), 30);

		// Change last inserted whitespace height to 30
		whitespaceComputer.changeWhitespaceHeight(b, 30);
		// whitespaces: a(2, 10), b(2, 30)
		assert.equal(whitespaceComputer.getCount(), 2);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 2);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(0), 10);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(1), 2);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(1), 30);
		assert.equal(whitespaceComputer.getAccumulatedHeight(0), 10);
		assert.equal(whitespaceComputer.getAccumulatedHeight(1), 40);
		assert.equal(whitespaceComputer.getTotalHeight(), 40);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(1), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(2), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(3), 40);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(4), 40);

		// Remove last inserted whitespace
		whitespaceComputer.removeWhitespace(b);
		// whitespaces: a(2, 10)
		assert.equal(whitespaceComputer.getCount(), 1);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 2);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(0), 10);
		assert.equal(whitespaceComputer.getAccumulatedHeight(0), 10);
		assert.equal(whitespaceComputer.getTotalHeight(), 10);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(1), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(2), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(3), 10);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(4), 10);

		// Add a whitespace before the first line of height 50
		b = whitespaceComputer.insertWhitespace(0, 0, 50);
		// whitespaces: b(0, 50), a(2, 10)
		assert.equal(whitespaceComputer.getCount(), 2);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 0);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(0), 50);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(1), 2);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(1), 10);
		assert.equal(whitespaceComputer.getAccumulatedHeight(0), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeight(1), 60);
		assert.equal(whitespaceComputer.getTotalHeight(), 60);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(1), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(2), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(3), 60);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(4), 60);

		// Add a whitespace after line 4 of height 20
		whitespaceComputer.insertWhitespace(4, 0, 20);
		// whitespaces: b(0, 50), a(2, 10), c(4, 20)
		assert.equal(whitespaceComputer.getCount(), 3);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 0);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(0), 50);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(1), 2);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(1), 10);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(2), 4);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(2), 20);
		assert.equal(whitespaceComputer.getAccumulatedHeight(0), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeight(1), 60);
		assert.equal(whitespaceComputer.getAccumulatedHeight(2), 80);
		assert.equal(whitespaceComputer.getTotalHeight(), 80);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(1), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(2), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(3), 60);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(4), 60);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(5), 80);

		// Add a whitespace after line 3 of height 30
		whitespaceComputer.insertWhitespace(3, 0, 30);
		// whitespaces: b(0, 50), a(2, 10), d(3, 30), c(4, 20)
		assert.equal(whitespaceComputer.getCount(), 4);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 0);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(0), 50);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(1), 2);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(1), 10);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(2), 3);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(2), 30);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(3), 4);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(3), 20);
		assert.equal(whitespaceComputer.getAccumulatedHeight(0), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeight(1), 60);
		assert.equal(whitespaceComputer.getAccumulatedHeight(2), 90);
		assert.equal(whitespaceComputer.getAccumulatedHeight(3), 110);
		assert.equal(whitespaceComputer.getTotalHeight(), 110);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(1), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(2), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(3), 60);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(4), 90);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(5), 110);

		// Change whitespace after line 2 to height of 100
		whitespaceComputer.changeWhitespaceHeight(a, 100);
		// whitespaces: b(0, 50), a(2, 100), d(3, 30), c(4, 20)
		assert.equal(whitespaceComputer.getCount(), 4);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 0);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(0), 50);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(1), 2);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(1), 100);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(2), 3);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(2), 30);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(3), 4);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(3), 20);
		assert.equal(whitespaceComputer.getAccumulatedHeight(0), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeight(1), 150);
		assert.equal(whitespaceComputer.getAccumulatedHeight(2), 180);
		assert.equal(whitespaceComputer.getAccumulatedHeight(3), 200);
		assert.equal(whitespaceComputer.getTotalHeight(), 200);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(1), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(2), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(3), 150);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(4), 180);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(5), 200);

		// Remove whitespace after line 2
		whitespaceComputer.removeWhitespace(a);
		// whitespaces: b(0, 50), d(3, 30), c(4, 20)
		assert.equal(whitespaceComputer.getCount(), 3);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 0);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(0), 50);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(1), 3);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(1), 30);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(2), 4);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(2), 20);
		assert.equal(whitespaceComputer.getAccumulatedHeight(0), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeight(1), 80);
		assert.equal(whitespaceComputer.getAccumulatedHeight(2), 100);
		assert.equal(whitespaceComputer.getTotalHeight(), 100);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(1), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(2), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(3), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(4), 80);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(5), 100);

		// Remove whitespace before line 1
		whitespaceComputer.removeWhitespace(b);
		// whitespaces: d(3, 30), c(4, 20)
		assert.equal(whitespaceComputer.getCount(), 2);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 3);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(0), 30);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(1), 4);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(1), 20);
		assert.equal(whitespaceComputer.getAccumulatedHeight(0), 30);
		assert.equal(whitespaceComputer.getAccumulatedHeight(1), 50);
		assert.equal(whitespaceComputer.getTotalHeight(), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(1), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(2), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(3), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(4), 30);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(5), 50);

		// Delete line 1
		whitespaceComputer.onLinesDeleted(1, 1);
		// whitespaces: d(2, 30), c(3, 20)
		assert.equal(whitespaceComputer.getCount(), 2);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 2);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(0), 30);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(1), 3);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(1), 20);
		assert.equal(whitespaceComputer.getAccumulatedHeight(0), 30);
		assert.equal(whitespaceComputer.getAccumulatedHeight(1), 50);
		assert.equal(whitespaceComputer.getTotalHeight(), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(1), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(2), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(3), 30);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(4), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(5), 50);

		// Insert a line before line 1
		whitespaceComputer.onLinesInserted(1, 1);
		// whitespaces: d(3, 30), c(4, 20)
		assert.equal(whitespaceComputer.getCount(), 2);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 3);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(0), 30);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(1), 4);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(1), 20);
		assert.equal(whitespaceComputer.getAccumulatedHeight(0), 30);
		assert.equal(whitespaceComputer.getAccumulatedHeight(1), 50);
		assert.equal(whitespaceComputer.getTotalHeight(), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(1), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(2), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(3), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(4), 30);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(5), 50);

		// Delete line 4
		whitespaceComputer.onLinesDeleted(4, 4);
		// whitespaces: d(3, 30), c(3, 20)
		assert.equal(whitespaceComputer.getCount(), 2);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 3);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(0), 30);
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(1), 3);
		assert.equal(whitespaceComputer.getHeightForWhitespaceIndex(1), 20);
		assert.equal(whitespaceComputer.getAccumulatedHeight(0), 30);
		assert.equal(whitespaceComputer.getAccumulatedHeight(1), 50);
		assert.equal(whitespaceComputer.getTotalHeight(), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(1), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(2), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(3), 0);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(4), 50);
		assert.equal(whitespaceComputer.getAccumulatedHeightBeforeLineNumber(5), 50);
	});

	test('WhitespaceComputer findInsertionIndex', () => {

		var makeArray = (size: number, fillValue: number) => {
			var r: number[] = [];
			for (var i = 0; i < size; i++) {
				r[i] = fillValue;
			}
			return r;
		};

		var arr: number[];
		var ordinals: number[];

		arr = [];
		ordinals = makeArray(arr.length, 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 0, ordinals, 0), 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 1, ordinals, 0), 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 2, ordinals, 0), 0);

		arr = [1];
		ordinals = makeArray(arr.length, 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 0, ordinals, 0), 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 1, ordinals, 0), 1);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 2, ordinals, 0), 1);

		arr = [1, 3];
		ordinals = makeArray(arr.length, 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 0, ordinals, 0), 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 1, ordinals, 0), 1);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 2, ordinals, 0), 1);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 3, ordinals, 0), 2);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 4, ordinals, 0), 2);

		arr = [1, 3, 5];
		ordinals = makeArray(arr.length, 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 0, ordinals, 0), 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 1, ordinals, 0), 1);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 2, ordinals, 0), 1);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 3, ordinals, 0), 2);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 4, ordinals, 0), 2);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 5, ordinals, 0), 3);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 6, ordinals, 0), 3);

		arr = [1, 3, 5];
		ordinals = makeArray(arr.length, 3);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 0, ordinals, 0), 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 1, ordinals, 0), 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 2, ordinals, 0), 1);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 3, ordinals, 0), 1);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 4, ordinals, 0), 2);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 5, ordinals, 0), 2);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 6, ordinals, 0), 3);

		arr = [1, 3, 5, 7];
		ordinals = makeArray(arr.length, 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 0, ordinals, 0), 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 1, ordinals, 0), 1);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 2, ordinals, 0), 1);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 3, ordinals, 0), 2);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 4, ordinals, 0), 2);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 5, ordinals, 0), 3);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 6, ordinals, 0), 3);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 7, ordinals, 0), 4);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 8, ordinals, 0), 4);

		arr = [1, 3, 5, 7, 9];
		ordinals = makeArray(arr.length, 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 0, ordinals, 0), 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 1, ordinals, 0), 1);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 2, ordinals, 0), 1);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 3, ordinals, 0), 2);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 4, ordinals, 0), 2);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 5, ordinals, 0), 3);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 6, ordinals, 0), 3);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 7, ordinals, 0), 4);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 8, ordinals, 0), 4);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 9, ordinals, 0), 5);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 10, ordinals, 0), 5);

		arr = [1, 3, 5, 7, 9, 11];
		ordinals = makeArray(arr.length, 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 0, ordinals, 0), 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 1, ordinals, 0), 1);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 2, ordinals, 0), 1);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 3, ordinals, 0), 2);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 4, ordinals, 0), 2);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 5, ordinals, 0), 3);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 6, ordinals, 0), 3);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 7, ordinals, 0), 4);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 8, ordinals, 0), 4);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 9, ordinals, 0), 5);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 10, ordinals, 0), 5);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 11, ordinals, 0), 6);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 12, ordinals, 0), 6);

		arr = [1, 3, 5, 7, 9, 11, 13];
		ordinals = makeArray(arr.length, 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 0, ordinals, 0), 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 1, ordinals, 0), 1);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 2, ordinals, 0), 1);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 3, ordinals, 0), 2);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 4, ordinals, 0), 2);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 5, ordinals, 0), 3);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 6, ordinals, 0), 3);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 7, ordinals, 0), 4);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 8, ordinals, 0), 4);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 9, ordinals, 0), 5);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 10, ordinals, 0), 5);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 11, ordinals, 0), 6);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 12, ordinals, 0), 6);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 13, ordinals, 0), 7);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 14, ordinals, 0), 7);

		arr = [1, 3, 5, 7, 9, 11, 13, 15];
		ordinals = makeArray(arr.length, 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 0, ordinals, 0), 0);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 1, ordinals, 0), 1);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 2, ordinals, 0), 1);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 3, ordinals, 0), 2);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 4, ordinals, 0), 2);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 5, ordinals, 0), 3);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 6, ordinals, 0), 3);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 7, ordinals, 0), 4);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 8, ordinals, 0), 4);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 9, ordinals, 0), 5);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 10, ordinals, 0), 5);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 11, ordinals, 0), 6);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 12, ordinals, 0), 6);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 13, ordinals, 0), 7);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 14, ordinals, 0), 7);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 15, ordinals, 0), 8);
		assert.equal(WhitespaceComputer.findInsertionIndex(arr, 16, ordinals, 0), 8);
	});

	test('WhitespaceComputer changeWhitespaceAfterLineNumber & getFirstWhitespaceIndexAfterLineNumber', () => {
		var whitespaceComputer = new WhitespaceComputer();

		var a = whitespaceComputer.insertWhitespace(0, 0, 1);
		var b = whitespaceComputer.insertWhitespace(7, 0, 1);
		var c = whitespaceComputer.insertWhitespace(3, 0, 1);

		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(0), a); // 0
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 0);
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(1), c); // 3
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(1), 3);
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(2), b); // 7
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(2), 7);

		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(1), 1); // c
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(2), 1); // c
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(3), 1); // c
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(4), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(5), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(6), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(7), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(8), -1); // --

		// Do not really move a
		whitespaceComputer.changeWhitespaceAfterLineNumber(a, 1);

		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(0), a); // 1
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 1);
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(1), c); // 3
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(1), 3);
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(2), b); // 7
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(2), 7);

		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(1), 0); // a
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(2), 1); // c
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(3), 1); // c
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(4), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(5), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(6), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(7), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(8), -1); // --


		// Do not really move a
		whitespaceComputer.changeWhitespaceAfterLineNumber(a, 2);

		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(0), a); // 2
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 2);
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(1), c); // 3
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(1), 3);
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(2), b); // 7
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(2), 7);

		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(1), 0); // a
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(2), 0); // a
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(3), 1); // c
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(4), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(5), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(6), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(7), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(8), -1); // --


		// Change a to conflict with c => a gets placed after c
		whitespaceComputer.changeWhitespaceAfterLineNumber(a, 3);

		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(0), c); // 3
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 3);
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(1), a); // 3
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(1), 3);
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(2), b); // 7
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(2), 7);

		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(1), 0); // c
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(2), 0); // c
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(3), 0); // c
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(4), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(5), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(6), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(7), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(8), -1); // --


		// Make a no-op
		whitespaceComputer.changeWhitespaceAfterLineNumber(c, 3);

		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(0), c); // 3
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 3);
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(1), a); // 3
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(1), 3);
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(2), b); // 7
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(2), 7);

		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(1), 0); // c
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(2), 0); // c
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(3), 0); // c
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(4), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(5), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(6), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(7), 2); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(8), -1); // --



		// Conflict c with b => c gets placed after b
		whitespaceComputer.changeWhitespaceAfterLineNumber(c, 7);

		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(0), a); // 3
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(0), 3);
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(1), b); // 7
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(1), 7);
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(2), c); // 7
		assert.equal(whitespaceComputer.getAfterLineNumberForWhitespaceIndex(2), 7);

		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(1), 0); // a
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(2), 0); // a
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(3), 0); // a
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(4), 1); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(5), 1); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(6), 1); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(7), 1); // b
		assert.equal(whitespaceComputer.getFirstWhitespaceIndexAfterLineNumber(8), -1); // --
	});


	test('WhitespaceComputer Bug', () => {
		var whitespaceComputer = new WhitespaceComputer();

		var a = whitespaceComputer.insertWhitespace(0, 0, 1);
		var b = whitespaceComputer.insertWhitespace(7, 0, 1);

		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(0), a); // 0
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(1), b); // 7

		var c = whitespaceComputer.insertWhitespace(3, 0, 1);

		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(0), a); // 0
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(1), c); // 3
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(2), b); // 7

		var d = whitespaceComputer.insertWhitespace(2, 0, 1);
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(0), a); // 0
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(1), d); // 2
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(2), c); // 3
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(3), b); // 7

		var e = whitespaceComputer.insertWhitespace(8, 0, 1);
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(0), a); // 0
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(1), d); // 2
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(2), c); // 3
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(3), b); // 7
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(4), e); // 8

		var f = whitespaceComputer.insertWhitespace(11, 0, 1);
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(0), a); // 0
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(1), d); // 2
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(2), c); // 3
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(3), b); // 7
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(4), e); // 8
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(5), f); // 11

		var g = whitespaceComputer.insertWhitespace(10, 0, 1);
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(0), a); // 0
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(1), d); // 2
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(2), c); // 3
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(3), b); // 7
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(4), e); // 8
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(5), g); // 10
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(6), f); // 11

		var h = whitespaceComputer.insertWhitespace(0, 0, 1);
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(0), a); // 0
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(1), h); // 0
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(2), d); // 2
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(3), c); // 3
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(4), b); // 7
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(5), e); // 8
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(6), g); // 10
		assert.equal(whitespaceComputer.getIdForWhitespaceIndex(7), f); // 11
	});
});

