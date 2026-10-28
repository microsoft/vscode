/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RuleTester } from 'eslint';
import { suite, test } from 'node:test';
import tseslint from 'typescript-eslint';
import rule from '../code-no-nested-test.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const nested = (name: string) => [{ messageId: 'nested', data: { name } }];

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run('code-no-nested-test', rule, {
	valid: [
		`suite('a', () => { test('b', () => {}); test('c', () => {}); });`,
		`suite('a', () => { suite('b', () => { test('c', () => {}); }); });`,
		`suite('a', () => { test('b', async () => { await Promise.resolve(); }); test.skip('c', () => {}); });`,
		// A local helper named `test` is not the test framework.
		`suite('a', () => { test('b', () => { const test = (x: number) => x; test(1); }); });`,
		`suite('a', () => { function test(a: number, b: number) { return a + b; } test('x', () => { test(1, 2); }); });`,
		`suite('a', () => { test('b', () => { function test(a: unknown, fn: () => void) { fn(); } test(1, () => {}); }); });`,
		// `node:test` runs a test declared inside another test as a subtest.
		`import { suite, test } from 'node:test'; suite('a', () => { test('b', () => { test('c', () => {}); }); });`,
		// Not a registration: no callback.
		`suite('a', () => { test('b', () => { test('c', 1); }); });`,
	],
	invalid: [
		{
			code: `suite('a', () => { test('b', () => { test('c', () => {}); }); });`,
			errors: nested('test'),
		},
		{
			code: `suite('a', () => { test('b', async () => { await x(); test('c', async () => {}); }); });`,
			errors: nested('test'),
		},
		{
			code: `suite('a', () => { test('b', function () { suite('c', () => { test('d', () => {}); }); }); });`,
			errors: [...nested('suite'), ...nested('test')],
		},
		{
			code: `suite('a', () => { test('b', () => { it('c', () => {}); }); });`,
			errors: nested('it'),
		},
		{
			code: `suite('a', () => { test('b', () => { test('c', sharedTest); }); });`,
			errors: nested('test'),
		},
		{
			code: `suite('a', () => { test('b', () => { suite('c', helpers.sharedSuite); }); });`,
			errors: nested('suite'),
		},
		{
			code: `/* global test, suite */ suite('a', () => { test('b', () => { test('c', () => {}); }); });`,
			errors: nested('test'),
		},
		{
			code: `suite('a', () => { test('b', () => { test('c', () => {}); }); });`,
			languageOptions: { globals: { test: 'readonly', suite: 'readonly' } },
			errors: nested('test'),
		},
		{
			code: `suite('a', () => { test('b', () => { test.skip('c', () => {}); }); });`,
			errors: nested('test'),
		},
		{
			code: `suite('a', () => { test('b', () => { run(() => { test('c', () => {}); }); }); });`,
			errors: nested('test'),
		},
		{
			// The shape of the real bug: a missing `});` leaves the next test inside the previous one.
			code: `suite('a', () => {
	test('b', async () => {
		await run(async () => {
		});

	test('c', async () => {
	});
	});
});`,
			errors: nested('test'),
		},
	],
});
