/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { encodePathSegments, numberSegment, pathSegment, withQuery } from '../../common/client/routing.js';
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

	test('numeric path segments encode positive safe integers', () => {
		assert.deepStrictEqual([
			1,
			42,
			Number.MAX_SAFE_INTEGER,
		].map(numberSegment), ['1', '42', '9007199254740991']);
	});

	test('numeric path segments reject invalid numbers', () => {
		for (const value of [0, -0, -1, 0.5, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -Infinity]) {
			assert.throws(() => numberSegment(value), isValidationError);
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
		assert.strictEqual(withQuery('/tasks', {
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
			withQuery('/tasks', {}),
			withQuery('/tasks', { state: [], cursor: undefined }),
			withQuery('/tasks', { page: 1, state: [], cursor: undefined }),
			withQuery('/tasks', { page: undefined, per_page: undefined }),
			withQuery('/tasks', { page: 1, per_page: undefined }),
			withQuery('/tasks', { page: undefined, per_page: 1 }),
		], ['/tasks', '/tasks', '/tasks?page=1', '/tasks', '/tasks?page=1', '/tasks?per_page=1']);
	});

	test('query encoding accepts pagination boundary values', () => {
		assert.deepStrictEqual([
			withQuery('/tasks', { page: 1, per_page: 1 }),
			withQuery('/tasks', { page: 2, per_page: 30 }),
			withQuery('/tasks', { page: Number.MAX_SAFE_INTEGER, per_page: 100 }),
		], [
			'/tasks?page=1&per_page=1',
			'/tasks?page=2&per_page=30',
			'/tasks?page=9007199254740991&per_page=100',
		]);
	});

	for (const key of ['page', 'per_page']) {
		test(`query encoding rejects invalid ${key} values`, () => {
			for (const value of [0, -0, -1, 0.5, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -Infinity, '', '1', true, false, [], [1], ['1']]) {
				assert.throws(() => withQuery('/tasks', { [key]: value }), isValidationError);
			}
		});
	}

	test('query encoding rejects page sizes above 100', () => {
		for (const value of [101, Number.MAX_SAFE_INTEGER]) {
			assert.throws(() => withQuery('/tasks', { per_page: value }), isValidationError);
		}
	});

	test('query encoding rejects non-finite numbers in scalars and arrays', () => {
		for (const value of [NaN, Infinity, -Infinity]) {
			for (const parameters of [{ count: value }, { ids: [1, value] }]) {
				assert.throws(() => withQuery('/tasks', parameters), isValidationError);
			}
		}
	});
});
