/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { getEslintFilePatterns, shouldErrorOnUnmatchedPattern } from '../../eslint.ts';
import { eslintFilter } from '../../filters.ts';

suite('eslint', () => {

	test('uses the full filter when no positional arguments are provided', () => {
		assert.deepStrictEqual(getEslintFilePatterns([]), Array.from(eslintFilter));
	});

	test('uses positional arguments without the full filter', () => {
		const files = ['src/vs/base/common/arrays.ts', 'src/vs/base/common/async.ts'];

		assert.deepStrictEqual(getEslintFilePatterns(files), files);
	});

	test('errors on unmatched positional arguments only', () => {
		assert.deepStrictEqual([
			shouldErrorOnUnmatchedPattern([]),
			shouldErrorOnUnmatchedPattern(['src/vs/base/common/arrays.ts']),
		], [false, true]);
	});
});
