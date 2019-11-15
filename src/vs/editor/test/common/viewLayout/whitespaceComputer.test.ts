/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { WhitespaceComputer } from 'vs/editor/common/viewLayout/whitespaceComputer';
import { LinesLayout } from 'vs/editor/common/viewLayout/linesLayout';

suite('Editor ViewLayout - WhitespaceComputer', () => {

	test('WhitespaceComputer', () => {

		const linesLayout = new LinesLayout(100, 20);

		// Insert a whitespace after line number 2, of height 10
		const a = linesLayout.insertWhitespace(2, 0, 10, 0);
		// whitespaces: a(2, 10)
		assert.equal(linesLayout.getWhitespacesCount(), 1);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 2);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(0), 10);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(0), 10);
		assert.equal(linesLayout.getWhitespacesTotalHeight(), 10);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 10);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 10);

		// Insert a whitespace again after line number 2, of height 20
		let b = linesLayout.insertWhitespace(2, 0, 20, 0);
		// whitespaces: a(2, 10), b(2, 20)
		assert.equal(linesLayout.getWhitespacesCount(), 2);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 2);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(0), 10);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 2);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(1), 20);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(0), 10);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(1), 30);
		assert.equal(linesLayout.getWhitespacesTotalHeight(), 30);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 30);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 30);

		// Change last inserted whitespace height to 30
		linesLayout.changeWhitespace(b, 2, 30);
		// whitespaces: a(2, 10), b(2, 30)
		assert.equal(linesLayout.getWhitespacesCount(), 2);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 2);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(0), 10);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 2);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(1), 30);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(0), 10);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(1), 40);
		assert.equal(linesLayout.getWhitespacesTotalHeight(), 40);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 40);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 40);

		// Remove last inserted whitespace
		linesLayout.removeWhitespace(b);
		// whitespaces: a(2, 10)
		assert.equal(linesLayout.getWhitespacesCount(), 1);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 2);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(0), 10);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(0), 10);
		assert.equal(linesLayout.getWhitespacesTotalHeight(), 10);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 10);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 10);

		// Add a whitespace before the first line of height 50
		b = linesLayout.insertWhitespace(0, 0, 50, 0);
		// whitespaces: b(0, 50), a(2, 10)
		assert.equal(linesLayout.getWhitespacesCount(), 2);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 0);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(0), 50);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 2);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(1), 10);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(0), 50);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(1), 60);
		assert.equal(linesLayout.getWhitespacesTotalHeight(), 60);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 50);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 50);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 60);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 60);

		// Add a whitespace after line 4 of height 20
		linesLayout.insertWhitespace(4, 0, 20, 0);
		// whitespaces: b(0, 50), a(2, 10), c(4, 20)
		assert.equal(linesLayout.getWhitespacesCount(), 3);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 0);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(0), 50);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 2);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(1), 10);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 4);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(2), 20);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(0), 50);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(1), 60);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(2), 80);
		assert.equal(linesLayout.getWhitespacesTotalHeight(), 80);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 50);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 50);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 60);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 60);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(5), 80);

		// Add a whitespace after line 3 of height 30
		linesLayout.insertWhitespace(3, 0, 30, 0);
		// whitespaces: b(0, 50), a(2, 10), d(3, 30), c(4, 20)
		assert.equal(linesLayout.getWhitespacesCount(), 4);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 0);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(0), 50);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 2);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(1), 10);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 3);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(2), 30);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(3), 4);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(3), 20);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(0), 50);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(1), 60);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(2), 90);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(3), 110);
		assert.equal(linesLayout.getWhitespacesTotalHeight(), 110);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 50);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 50);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 60);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 90);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(5), 110);

		// Change whitespace after line 2 to height of 100
		linesLayout.changeWhitespace(a, 2, 100);
		// whitespaces: b(0, 50), a(2, 100), d(3, 30), c(4, 20)
		assert.equal(linesLayout.getWhitespacesCount(), 4);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 0);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(0), 50);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 2);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(1), 100);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 3);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(2), 30);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(3), 4);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(3), 20);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(0), 50);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(1), 150);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(2), 180);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(3), 200);
		assert.equal(linesLayout.getWhitespacesTotalHeight(), 200);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 50);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 50);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 150);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 180);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(5), 200);

		// Remove whitespace after line 2
		linesLayout.removeWhitespace(a);
		// whitespaces: b(0, 50), d(3, 30), c(4, 20)
		assert.equal(linesLayout.getWhitespacesCount(), 3);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 0);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(0), 50);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 3);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(1), 30);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 4);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(2), 20);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(0), 50);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(1), 80);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(2), 100);
		assert.equal(linesLayout.getWhitespacesTotalHeight(), 100);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 50);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 50);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 50);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 80);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(5), 100);

		// Remove whitespace before line 1
		linesLayout.removeWhitespace(b);
		// whitespaces: d(3, 30), c(4, 20)
		assert.equal(linesLayout.getWhitespacesCount(), 2);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 3);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(0), 30);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 4);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(1), 20);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(0), 30);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(1), 50);
		assert.equal(linesLayout.getWhitespacesTotalHeight(), 50);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 30);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(5), 50);

		// Delete line 1
		linesLayout.onLinesDeleted(1, 1);
		// whitespaces: d(2, 30), c(3, 20)
		assert.equal(linesLayout.getWhitespacesCount(), 2);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 2);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(0), 30);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 3);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(1), 20);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(0), 30);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(1), 50);
		assert.equal(linesLayout.getWhitespacesTotalHeight(), 50);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 30);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 50);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(5), 50);

		// Insert a line before line 1
		linesLayout.onLinesInserted(1, 1);
		// whitespaces: d(3, 30), c(4, 20)
		assert.equal(linesLayout.getWhitespacesCount(), 2);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 3);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(0), 30);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 4);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(1), 20);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(0), 30);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(1), 50);
		assert.equal(linesLayout.getWhitespacesTotalHeight(), 50);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 30);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(5), 50);

		// Delete line 4
		linesLayout.onLinesDeleted(4, 4);
		// whitespaces: d(3, 30), c(3, 20)
		assert.equal(linesLayout.getWhitespacesCount(), 2);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 3);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(0), 30);
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 3);
		assert.equal(linesLayout.getHeightForWhitespaceIndex(1), 20);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(0), 30);
		assert.equal(linesLayout.getWhitespacesAccumulatedHeight(1), 50);
		assert.equal(linesLayout.getWhitespacesTotalHeight(), 50);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(1), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(2), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(3), 0);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(4), 50);
		assert.equal(linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(5), 50);
	});

	test('WhitespaceComputer findInsertionIndex', () => {

		const makeArray = (size: number, fillValue: number) => {
			let r: number[] = [];
			for (let i = 0; i < size; i++) {
				r[i] = fillValue;
			}
			return r;
		};

		let arr: number[];
		let ordinals: number[];

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
		const linesLayout = new LinesLayout(100, 20);

		const a = linesLayout.insertWhitespace(0, 0, 1, 0);
		const b = linesLayout.insertWhitespace(7, 0, 1, 0);
		const c = linesLayout.insertWhitespace(3, 0, 1, 0);

		assert.equal(linesLayout.getIdForWhitespaceIndex(0), a); // 0
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 0);
		assert.equal(linesLayout.getIdForWhitespaceIndex(1), c); // 3
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 3);
		assert.equal(linesLayout.getIdForWhitespaceIndex(2), b); // 7
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 7);

		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(1), 1); // c
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(2), 1); // c
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(3), 1); // c
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(4), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(5), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(6), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(7), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(8), -1); // --

		// Do not really move a
		linesLayout.changeWhitespace(a, 1, 1);

		assert.equal(linesLayout.getIdForWhitespaceIndex(0), a); // 1
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 1);
		assert.equal(linesLayout.getIdForWhitespaceIndex(1), c); // 3
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 3);
		assert.equal(linesLayout.getIdForWhitespaceIndex(2), b); // 7
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 7);

		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(1), 0); // a
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(2), 1); // c
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(3), 1); // c
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(4), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(5), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(6), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(7), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(8), -1); // --


		// Do not really move a
		linesLayout.changeWhitespace(a, 2, 1);

		assert.equal(linesLayout.getIdForWhitespaceIndex(0), a); // 2
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 2);
		assert.equal(linesLayout.getIdForWhitespaceIndex(1), c); // 3
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 3);
		assert.equal(linesLayout.getIdForWhitespaceIndex(2), b); // 7
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 7);

		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(1), 0); // a
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(2), 0); // a
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(3), 1); // c
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(4), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(5), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(6), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(7), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(8), -1); // --


		// Change a to conflict with c => a gets placed after c
		linesLayout.changeWhitespace(a, 3, 1);

		assert.equal(linesLayout.getIdForWhitespaceIndex(0), c); // 3
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 3);
		assert.equal(linesLayout.getIdForWhitespaceIndex(1), a); // 3
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 3);
		assert.equal(linesLayout.getIdForWhitespaceIndex(2), b); // 7
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 7);

		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(1), 0); // c
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(2), 0); // c
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(3), 0); // c
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(4), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(5), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(6), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(7), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(8), -1); // --


		// Make a no-op
		linesLayout.changeWhitespace(c, 3, 1);

		assert.equal(linesLayout.getIdForWhitespaceIndex(0), c); // 3
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 3);
		assert.equal(linesLayout.getIdForWhitespaceIndex(1), a); // 3
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 3);
		assert.equal(linesLayout.getIdForWhitespaceIndex(2), b); // 7
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 7);

		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(1), 0); // c
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(2), 0); // c
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(3), 0); // c
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(4), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(5), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(6), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(7), 2); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(8), -1); // --



		// Conflict c with b => c gets placed after b
		linesLayout.changeWhitespace(c, 7, 1);

		assert.equal(linesLayout.getIdForWhitespaceIndex(0), a); // 3
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(0), 3);
		assert.equal(linesLayout.getIdForWhitespaceIndex(1), b); // 7
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(1), 7);
		assert.equal(linesLayout.getIdForWhitespaceIndex(2), c); // 7
		assert.equal(linesLayout.getAfterLineNumberForWhitespaceIndex(2), 7);

		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(1), 0); // a
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(2), 0); // a
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(3), 0); // a
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(4), 1); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(5), 1); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(6), 1); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(7), 1); // b
		assert.equal(linesLayout.getFirstWhitespaceIndexAfterLineNumber(8), -1); // --
	});


	test('WhitespaceComputer Bug', () => {
		const linesLayout = new LinesLayout(100, 20);

		const a = linesLayout.insertWhitespace(0, 0, 1, 0);
		const b = linesLayout.insertWhitespace(7, 0, 1, 0);

		assert.equal(linesLayout.getIdForWhitespaceIndex(0), a); // 0
		assert.equal(linesLayout.getIdForWhitespaceIndex(1), b); // 7

		const c = linesLayout.insertWhitespace(3, 0, 1, 0);

		assert.equal(linesLayout.getIdForWhitespaceIndex(0), a); // 0
		assert.equal(linesLayout.getIdForWhitespaceIndex(1), c); // 3
		assert.equal(linesLayout.getIdForWhitespaceIndex(2), b); // 7

		const d = linesLayout.insertWhitespace(2, 0, 1, 0);
		assert.equal(linesLayout.getIdForWhitespaceIndex(0), a); // 0
		assert.equal(linesLayout.getIdForWhitespaceIndex(1), d); // 2
		assert.equal(linesLayout.getIdForWhitespaceIndex(2), c); // 3
		assert.equal(linesLayout.getIdForWhitespaceIndex(3), b); // 7

		const e = linesLayout.insertWhitespace(8, 0, 1, 0);
		assert.equal(linesLayout.getIdForWhitespaceIndex(0), a); // 0
		assert.equal(linesLayout.getIdForWhitespaceIndex(1), d); // 2
		assert.equal(linesLayout.getIdForWhitespaceIndex(2), c); // 3
		assert.equal(linesLayout.getIdForWhitespaceIndex(3), b); // 7
		assert.equal(linesLayout.getIdForWhitespaceIndex(4), e); // 8

		const f = linesLayout.insertWhitespace(11, 0, 1, 0);
		assert.equal(linesLayout.getIdForWhitespaceIndex(0), a); // 0
		assert.equal(linesLayout.getIdForWhitespaceIndex(1), d); // 2
		assert.equal(linesLayout.getIdForWhitespaceIndex(2), c); // 3
		assert.equal(linesLayout.getIdForWhitespaceIndex(3), b); // 7
		assert.equal(linesLayout.getIdForWhitespaceIndex(4), e); // 8
		assert.equal(linesLayout.getIdForWhitespaceIndex(5), f); // 11

		const g = linesLayout.insertWhitespace(10, 0, 1, 0);
		assert.equal(linesLayout.getIdForWhitespaceIndex(0), a); // 0
		assert.equal(linesLayout.getIdForWhitespaceIndex(1), d); // 2
		assert.equal(linesLayout.getIdForWhitespaceIndex(2), c); // 3
		assert.equal(linesLayout.getIdForWhitespaceIndex(3), b); // 7
		assert.equal(linesLayout.getIdForWhitespaceIndex(4), e); // 8
		assert.equal(linesLayout.getIdForWhitespaceIndex(5), g); // 10
		assert.equal(linesLayout.getIdForWhitespaceIndex(6), f); // 11

		const h = linesLayout.insertWhitespace(0, 0, 1, 0);
		assert.equal(linesLayout.getIdForWhitespaceIndex(0), a); // 0
		assert.equal(linesLayout.getIdForWhitespaceIndex(1), h); // 0
		assert.equal(linesLayout.getIdForWhitespaceIndex(2), d); // 2
		assert.equal(linesLayout.getIdForWhitespaceIndex(3), c); // 3
		assert.equal(linesLayout.getIdForWhitespaceIndex(4), b); // 7
		assert.equal(linesLayout.getIdForWhitespaceIndex(5), e); // 8
		assert.equal(linesLayout.getIdForWhitespaceIndex(6), g); // 10
		assert.equal(linesLayout.getIdForWhitespaceIndex(7), f); // 11
	});
});

