/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { arrayProperty, asArray, asObject, booleanProperty, idProperty, nextLink, normalizedEnumProperty, nullableStringProperty, numberProperty, objectAt, objectProperty, optionalObjectProperty, requiredId, requiredNumber, requiredSha, requiredString, stringProperty } from '../../common/githubResponse.js';
import { GitHubRequestError } from '../../common/githubTransport.js';

suite('GitHub response helpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function assertMalformedResponse(read: () => void, message: string): void {
		// The browser assertion shim requires predicates with a prototype.
		function isExpectedError(error: unknown): boolean {
			return error instanceof GitHubRequestError
				&& error.name === 'GitHubRequestError'
				&& error.message === message
				&& error.kind === 'malformedResponse';
		}
		assert.throws(read, isExpectedError);
	}

	test('nextLink returns the first next relation without changing its URL', () => {
		assert.deepStrictEqual({
			single: nextLink('<https://api.github.com/repos/o/r/issues?page=2&per_page=100>; rel="next"'),
			laterLink: nextLink('</previous>; rel="prev", </next>; rel="next"'),
			multipleRelations: nextLink('<../next?page=2>; rel="prev next"'),
			extraParameters: nextLink('</next>; rel="next"; type="application/json"'),
			firstMatch: nextLink('</first>; rel="next", </second>; rel="next"'),
		}, {
			single: 'https://api.github.com/repos/o/r/issues?page=2&per_page=100',
			laterLink: '/next',
			multipleRelations: '../next?page=2',
			extraParameters: '/next',
			firstMatch: '/first',
		});
	});

	test('nextLink ignores missing, malformed and non-next relations', () => {
		const headers = [
			undefined,
			'',
			'not a link',
			'<>; rel="next"',
			'</last>; rel="last"',
			'</next>; rel="next-page"',
			'</next>; rel="Next"',
			'</next>; rel=next',
			'</next>; title="next"; rel="next"',
		];
		assert.deepStrictEqual(headers.map(nextLink), headers.map(() => undefined));
	});

	test('object readers return the original objects', () => {
		const child = { id: 7 };
		const value = { repository: { pullRequest: child } };
		assert.deepStrictEqual({
			root: asObject(value, 'Expected an object') === value,
			emptyPath: objectAt(value) === value,
			nestedPath: objectAt(value, 'repository', 'pullRequest') === child,
			property: objectProperty(value.repository, 'pullRequest') === child,
			optionalProperty: optionalObjectProperty(value.repository, 'pullRequest') === child,
		}, {
			root: true,
			emptyPath: true,
			nestedPath: true,
			property: true,
			optionalProperty: true,
		});
	});

	test('optional objects distinguish absence from malformed values', () => {
		assert.deepStrictEqual({
			missing: optionalObjectProperty({}, 'repository'),
			undefined: optionalObjectProperty({ repository: undefined }, 'repository'),
			null: optionalObjectProperty({ repository: null }, 'repository'),
			empty: optionalObjectProperty({ repository: {} }, 'repository'),
		}, {
			missing: undefined,
			undefined: undefined,
			null: undefined,
			empty: {},
		});
	});

	test('array readers return the original arrays, including empty arrays', () => {
		const items = [{ id: 7 }, null];
		const empty: readonly object[] = [];
		assert.deepStrictEqual({
			array: asArray(items, 'Expected an array') === items,
			property: arrayProperty({ items }, 'items') === items,
			empty: arrayProperty({ items: empty }, 'items') === empty,
		}, {
			array: true,
			property: true,
			empty: true,
		});
	});

	for (const [name, value] of [
		['undefined', undefined],
		['null', null],
		['false', false],
		['true', true],
		['zero', 0],
		['number', 7],
		['string', 'value'],
	] as const) {
		test(`object and array readers reject ${name} with the caller's error message`, () => {
			assertMalformedResponse(() => asObject(value, 'Expected an object'), 'Expected an object');
			assertMalformedResponse(() => asArray(value, 'Expected an array'), 'Expected an array');
		});
	}

	for (const { name, read, message } of [
		{ name: 'an array as an object', read: () => asObject([], 'Expected an object'), message: 'Expected an object' },
		{ name: 'an object as an array', read: () => asArray({}, 'Expected an array'), message: 'Expected an array' },
		{ name: 'a missing root', read: () => objectAt(undefined), message: 'GitHub response was malformed' },
		{ name: 'a missing object property', read: () => objectProperty({}, 'repository'), message: 'GitHub response property repository was malformed' },
		{ name: 'a null object property', read: () => objectProperty({ repository: null }, 'repository'), message: 'GitHub response property repository was malformed' },
		{ name: 'a malformed optional object', read: () => optionalObjectProperty({ repository: [] }, 'repository'), message: 'GitHub response property repository was malformed' },
		{ name: 'a malformed intermediate object', read: () => objectAt({ repository: false }, 'repository', 'pullRequest'), message: 'GitHub response property repository was malformed' },
		{ name: 'a missing nested object', read: () => objectAt({ repository: {} }, 'repository', 'pullRequest'), message: 'GitHub response property pullRequest was malformed' },
		{ name: 'a missing array property', read: () => arrayProperty({}, 'nodes'), message: 'GitHub response property nodes was not an array' },
		{ name: 'a null array property', read: () => arrayProperty({ nodes: null }, 'nodes'), message: 'GitHub response property nodes was not an array' },
		{ name: 'a non-array property', read: () => arrayProperty({ nodes: {} }, 'nodes'), message: 'GitHub response property nodes was not an array' },
		{ name: 'a missing required string', read: () => requiredString({}, 'title'), message: 'GitHub response property title was not a string' },
		{ name: 'a null required string', read: () => requiredString({ title: null }, 'title'), message: 'GitHub response property title was not a string' },
		{ name: 'a non-string property', read: () => requiredString({ title: 7 }, 'title'), message: 'GitHub response property title was not a string' },
		{ name: 'a missing required SHA', read: () => requiredSha({}, 'sha'), message: 'GitHub response property sha was not a string' },
		{ name: 'a non-string SHA', read: () => requiredSha({ sha: 7 }, 'sha'), message: 'GitHub response property sha was not a string' },
		{ name: 'a missing required number', read: () => requiredNumber({}, 'number'), message: 'GitHub response property number was not a number' },
		{ name: 'a non-number property', read: () => requiredNumber({ number: '7' }, 'number'), message: 'GitHub response property number was not a number' },
		{ name: 'a non-finite number', read: () => requiredNumber({ number: Infinity }, 'number'), message: 'GitHub response property number was not a number' },
		{ name: 'missing or empty IDs', read: () => requiredId({ databaseId: '', id: null }, 'databaseId', 'id'), message: 'GitHub response did not contain databaseId or id' },
	]) {
		test(`reports malformedResponse for ${name}`, () => {
			assertMalformedResponse(read, message);
		});
	}

	test('string readers preserve empty strings and enum normalization', () => {
		const value = { title: '', state: 'in_progress', absent: null, number: 7 };
		assert.deepStrictEqual({
			required: requiredString(value, 'title'),
			optional: stringProperty(value, 'title'),
			nullable: nullableStringProperty(value, 'title'),
			null: nullableStringProperty(value, 'absent'),
			missing: stringProperty(value, 'missing'),
			wrongType: stringProperty(value, 'number'),
			nullableWrongType: nullableStringProperty(value, 'number'),
			enum: normalizedEnumProperty(value, 'state'),
			emptyEnum: normalizedEnumProperty(value, 'title'),
			missingEnum: normalizedEnumProperty(value, 'missing'),
		}, {
			required: '',
			optional: '',
			nullable: '',
			null: undefined,
			missing: undefined,
			wrongType: undefined,
			nullableWrongType: undefined,
			enum: 'IN_PROGRESS',
			emptyEnum: '',
			missingEnum: undefined,
		});
	});

	test('requiredSha preserves lowercase hexadecimal SHAs', () => {
		const values = ['0'.repeat(40), 'f'.repeat(40), '0123456789abcdef0123456789abcdef01234567'];
		assert.deepStrictEqual(values.map(sha => requiredSha({ sha }, 'sha')), values);
	});

	for (const [name, sha] of [
		['empty', ''],
		['short', 'a'.repeat(39)],
		['long', 'a'.repeat(41)],
		['non-hexadecimal', 'g'.repeat(40)],
		['uppercase', 'A'.repeat(40)],
		['newline-suffixed', `${'a'.repeat(40)}\n`],
	] as const) {
		test(`requiredSha rejects ${name} values`, () => {
			assertMalformedResponse(() => requiredSha({ sha }, 'sha'), 'GitHub response property sha was not a valid SHA');
		});
	}

	test('number readers accept finite values without coercion', () => {
		const values = [0, -7, 1.5, undefined, null, '7', true, NaN, Infinity, -Infinity];
		assert.deepStrictEqual({
			optional: values.map(value => numberProperty({ value }, 'value')),
			requiredZero: requiredNumber({ value: 0 }, 'value'),
			requiredFraction: requiredNumber({ value: 1.5 }, 'value'),
		}, {
			optional: [0, -7, 1.5, undefined, undefined, undefined, undefined, undefined, undefined, undefined],
			requiredZero: 0,
			requiredFraction: 1.5,
		});
	});

	test('boolean readers preserve false without coercion', () => {
		const values = [true, false, undefined, null, 'true', 0, 1];
		assert.deepStrictEqual(values.map(value => booleanProperty({ value }, 'value')), [true, false, undefined, undefined, undefined, undefined, undefined]);
	});

	test('ID readers preserve string and numeric IDs and honor fallback order', () => {
		const values = ['PR_7', '', 7, 0, -1, NaN, Infinity, undefined, null, false, {}];
		assert.deepStrictEqual({
			optional: values.map(value => idProperty({ value }, 'value')),
			first: requiredId({ databaseId: 7, id: 'PR_7' }, 'databaseId', 'id'),
			fallback: requiredId({ databaseId: '', id: 'PR_7' }, 'databaseId', 'id'),
			zero: requiredId({ databaseId: 0, id: 'PR_7' }, 'databaseId', 'id'),
		}, {
			optional: ['PR_7', '', '7', '0', '-1', 'NaN', 'Infinity', undefined, undefined, undefined, undefined],
			first: '7',
			fallback: 'PR_7',
			zero: '0',
		});
	});
});
