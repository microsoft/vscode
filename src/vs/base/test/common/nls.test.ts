/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { localize, localize2 } from '../../../nls.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('NLS', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('localize replaces placeholders by index', () => {
		strictEqual(localize('key0', '{0} {1} {2}', 'a', 'b', 'c'), 'a b c');
	});

	test('localize replaces multi digit placeholders', () => {
		const args = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'a11'];
		strictEqual(localize('key1', '{0} {1} {9} {10} {11}', ...args), 'a0 a1 a9 a10 a11');
	});

	test('localize keeps placeholders that are not replaceable', () => {
		strictEqual(localize('key2', '{0} {1}', 'a', {} as unknown as string), 'a {1}');
	});

	test('localize2 replaces multi digit placeholders', () => {
		const args = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10'];
		strictEqual(localize2('key3', '{10}', ...args).value, 'a10');
	});
});
