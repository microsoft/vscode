/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { encodePathSegments, pathSegment, queryPath } from '../../common/client/routing.js';
import { GitHubRequestError } from '../../common/githubTypes.js';

suite('GitHub client routing', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function isValidationError(error: unknown): boolean {
		return error instanceof GitHubRequestError && error.kind === 'validation';
	}

	test('identifier encoding escapes separators and preserves significant whitespace', () => {
		assert.deepStrictEqual([
			'feature/branch',
			' a#?% ',
			'literal%2Fname',
			'caf\u00e9',
		].map(pathSegment), [
			'feature%2Fbranch',
			'%20a%23%3F%25%20',
			'literal%252Fname',
			'caf%C3%A9',
		]);
	});

	test('identifier encoding rejects empty identifiers and dot segments', () => {
		for (const value of ['', ' \t ', '.', '..']) {
			assert.throws(() => pathSegment(value), isValidationError);
		}
	});

	test('path encoding escapes each segment without changing separators', () => {
		assert.deepStrictEqual([
			'',
			'src/file.ts',
			'/src//file.ts/',
			'docs/a #?%.md',
			'literal%2Fname.txt',
			'a\\b.txt',
			'caf\u00e9/\u65e5\u672c.md',
		].map(encodePathSegments), [
			'',
			'src/file.ts',
			'/src//file.ts/',
			'docs/a%20%23%3F%25.md',
			'literal%252Fname.txt',
			'a%5Cb.txt',
			'caf%C3%A9/%E6%97%A5%E6%9C%AC.md',
		]);
	});

	test('encoding rejects malformed Unicode', () => {
		for (const encode of [pathSegment, encodePathSegments]) {
			assert.throws(() => encode('\uD800'), URIError);
		}
	});

	test('query encoding escapes keys and values, repeats arrays and preserves falsy values', () => {
		assert.strictEqual(queryPath('/tasks', {
			'search term': 'a b&c',
			count: 0,
			active: false,
			empty: '',
			state: ['queued', 'in progress'],
			ids: [1, 2],
		}), '/tasks?search+term=a+b%26c&count=0&active=false&empty=&state=queued&state=in+progress&ids=1&ids=2');
	});

	test('query encoding omits undefined values and empty arrays', () => {
		assert.deepStrictEqual([
			queryPath('/tasks', {}),
			queryPath('/tasks', { state: [], cursor: undefined }),
			queryPath('/tasks', { page: 1, state: [], cursor: undefined }),
		], ['/tasks', '/tasks', '/tasks?page=1']);
	});

	test('query encoding rejects non-finite numbers in scalars and arrays', () => {
		for (const value of [NaN, Infinity, -Infinity]) {
			for (const parameters of [{ count: value }, { ids: [1, value] }]) {
				assert.throws(() => queryPath('/tasks', parameters), isValidationError);
			}
		}
	});
});
