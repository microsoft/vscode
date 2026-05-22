/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getIndentationWindowsDelineations } from '../snippetInclusion/windowDelineations';
import * as assert from 'assert';
import dedent from 'ts-dedent';

const SOURCE = {
	source: dedent`
	f1:
		a1
	f2:
		a2
		a3
`,
	name: '',
};

suite('Test window delineation', function () {
	test('Correct line number range, standard input', function () {
		const testLineNumbers: [number, number][] = getIndentationWindowsDelineations(
			SOURCE.source.split('\n'),
			'python',
			1,
			3
		);
		const correctLineNumbers: [number, number][] = [
			[0, 2], // f1: a1
			[1, 2], // a1
			[2, 5], // f2: a2 a3
			[3, 4], // a2
			[4, 5], // a3
		];
		assert.deepStrictEqual(testLineNumbers.sort(), correctLineNumbers.sort());
	});
	test('Correct line number range, standard input, decreased maxLength', function () {
		const testLineNumbers: [number, number][] = getIndentationWindowsDelineations(
			SOURCE.source.split('\n'),
			'python',
			1,
			2
		);
		const correctLineNumbers: [number, number][] = [
			[0, 2], // f1: a1
			[1, 2], // a1
			[3, 4], // a2
			[4, 5], // a3
			// We lose [2, 5] f2: a2 a3 as too long
			// But we gain the following which were previously swallowed up by [2, 5]
			[2, 4], // f2: a2
			[3, 5], // a2 a3
		];
		assert.deepStrictEqual(testLineNumbers.sort(), correctLineNumbers.sort());
	});
	test('Correct line number range, standard input, increased minLength', function () {
		const testLineNumbers: [number, number][] = getIndentationWindowsDelineations(
			SOURCE.source.split('\n'),
			'python',
			2,
			3
		);
		const correctLineNumbers: [number, number][] = [
			[0, 2], // f1: a1
			[2, 5], // f2: a2 a3
			// We lose the following as too short
			// [1, 2] a1
			// [3, 4] a2
			// [4, 5] a3
		];
		assert.deepStrictEqual(testLineNumbers.sort(), correctLineNumbers.sort());
	});

	test('Correct line number range, flat input', function () {
		const source: string = dedent`
		a1
		a2
		a3
		`;
		const testLineNumbers: [number, number][] = getIndentationWindowsDelineations(
			source.split('\n'),
			'python',
			1,
			3
		);
		const correctLineNumbers: [number, number][] = [
			[0, 1], // a1
			[1, 2], // a2
			[2, 3], // a3
			[0, 3], // a1 a2 a3
			// Don't get [0, 2] nor [1, 3] because they not single children nor the whole tree
		];
		assert.deepStrictEqual(testLineNumbers.sort(), correctLineNumbers.sort());
	});

	test('Check degenerate case', function () {
		const testLineNumbers: [number, number][] = getIndentationWindowsDelineations(
			SOURCE.source.split('\n'),
			'python',
			0,
			0
		);
		const correctLineNumbers: [number, number][] = [];
		assert.deepStrictEqual(testLineNumbers.sort(), correctLineNumbers.sort());
	});
});
