/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { suite, test } from 'vitest';
import { trimCommonLeadingWhitespace } from '../naiveChunker';

suite('trimCommonLeadingWhitespace', () => {
	test('should trim common leading spaces', () => {
		const { trimmedLines, shortestLeadingCommonWhitespace } = trimCommonLeadingWhitespace([
			'    const foo = 1;',
			'      const bar = 2;',
			'        const baz = 3;',
		]);

		assert.deepStrictEqual(trimmedLines, [
			'const foo = 1;',
			'  const bar = 2;',
			'    const baz = 3;',
		]);
		assert.strictEqual(shortestLeadingCommonWhitespace, '    ');
	});

	test('should trim common leading tabs', () => {
		const { trimmedLines, shortestLeadingCommonWhitespace } = trimCommonLeadingWhitespace([
			'\t\tconst foo = 1;',
			'\t\t\tconst bar = 2;',
			'\t\t\t\tconst baz = 3;',
		]);

		assert.deepStrictEqual(trimmedLines, [
			'const foo = 1;',
			'\tconst bar = 2;',
			'\t\tconst baz = 3;',
		]);
		assert.strictEqual(shortestLeadingCommonWhitespace, '\t\t');
	});

	test('should handle mixed spaces and tabs', () => {
		const { trimmedLines, shortestLeadingCommonWhitespace } = trimCommonLeadingWhitespace([
			'    const foo = 1;',
			'     \t const bar = 2;',
			'  \t      const baz = 3;',
		]);

		assert.deepStrictEqual(trimmedLines, [
			'  const foo = 1;',
			'   \t const bar = 2;',
			'\t      const baz = 3;',
		]);
		assert.strictEqual(shortestLeadingCommonWhitespace, '  ');
	});
});
