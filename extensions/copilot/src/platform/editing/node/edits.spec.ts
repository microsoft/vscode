/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { beforeAll, suite, test } from 'vitest';
import { Range, TextEdit } from '../../../vscodeTypes';
import { computeUpdatedRange } from '../common/edits';

suite('findApproximateRangePostEdits', function () {

	let range: Range;
	let editText: string;
	beforeAll(async function () {
		range = new Range(5, 1, 10, 1);
		editText = 'some text';
	});

	test('Edit range before range of interest', async function () {
		const edits: TextEdit[] = [
			new TextEdit(new Range(4, 1, 4, 1), editText),
		];
		const rangePostEdits = await computeUpdatedRange(range, edits);
		assert.deepStrictEqual(rangePostEdits, new Range(5, 0, 10, 0));
	});

	test('Edit range overlaps start of range of interest', async function () {
		const edits: TextEdit[] = [
			new TextEdit(new Range(4, 1, 6, 1), editText),
		];
		const rangePostEdits = await computeUpdatedRange(range, edits);
		assert.deepStrictEqual(rangePostEdits, new Range(4, 0, 8, 0));
	});

	test('Edit range is contained in range of interest', async function () {
		const edits: TextEdit[] = [
			new TextEdit(new Range(6, 1, 7, 1), editText),
		];
		const rangePostEdits = await computeUpdatedRange(range, edits);
		assert.deepStrictEqual(rangePostEdits, new Range(5, 0, 9, 0));
	});

	test('Edit range overlaps end of range of interest', async function () {
		const edits: TextEdit[] = [
			new TextEdit(new Range(9, 1, 11, 1), editText),
		];
		const rangePostEdits = await computeUpdatedRange(range, edits);
		assert.deepStrictEqual(rangePostEdits, new Range(5, 0, 9, 0));
	});

	test('Edit range is after end of range of interest', async function () {
		const edits: TextEdit[] = [
			new TextEdit(new Range(11, 1, 13, 1), editText),
		];
		const rangePostEdits = await computeUpdatedRange(range, edits);
		assert.deepStrictEqual(rangePostEdits, new Range(5, 0, 10, 0));
	});

	test('Edit range contains range of interest', async function () {
		const edits: TextEdit[] = [
			new TextEdit(new Range(3, 1, 13, 1), editText),
		];
		const rangePostEdits = await computeUpdatedRange(range, edits);
		assert.deepStrictEqual(rangePostEdits, new Range(3, 0, 3, 0));
	});
});
