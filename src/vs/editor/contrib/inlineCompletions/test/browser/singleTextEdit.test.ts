/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { SingleTextEdit, getNewRanges } from 'vs/editor/contrib/inlineCompletions/browser/singleTextEdit';
import { Range } from 'vs/editor/common/core/range';
import * as assert from 'assert';

suite('Single Text Edit', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('getNewRanges 1', () => {
		const edits: SingleTextEdit[] = [
			new SingleTextEdit(new Range(0, 0, 2, 0), 'short text'),
			new SingleTextEdit(new Range(3, 0, 3, 0), [
				`text that spans`,
				`multiple lines`,
				`.`
			].join('\n')),
			new SingleTextEdit(new Range(4, 0, 4, 1), 'some short text'),
		];
		const ranges = getNewRanges(edits);
		assert.deepStrictEqual(ranges, [
			new Range(0, 0, 0, 1),
			new Range(0, 1, 0, 2),
			new Range(0, 2, 0, 3),
		]);
	});

	test('getNewRanges 2', () => {
		const edits: SingleTextEdit[] = [
			new SingleTextEdit(new Range(0, 0, 0, 0), 'a'),
			new SingleTextEdit(new Range(0, 0, 0, 0), 'a'),
			new SingleTextEdit(new Range(0, 0, 0, 0), 'a'),
		];
		const ranges = getNewRanges(edits);
		assert.deepStrictEqual(ranges, [
			new Range(0, 0, 0, 1),
			new Range(0, 1, 0, 2),
			new Range(0, 2, 0, 3),
		]);
	});

	test('getNewRanges 3', () => {
		const edits: SingleTextEdit[] = [
			new SingleTextEdit(new Range(0, 0, 0, 0), 'a'),
			new SingleTextEdit(new Range(0, 0, 0, 0), 'a'),
			new SingleTextEdit(new Range(0, 0, 0, 0), 'a'),
		];
		const ranges = getNewRanges(edits);
		assert.deepStrictEqual(ranges, [
			new Range(0, 0, 0, 1),
			new Range(0, 1, 0, 2),
			new Range(0, 2, 0, 3),
		]);
	});

});
