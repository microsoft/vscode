/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { vBoolean, vNumber, vObjAny, vString } from '../../common/validation.js';

suite('vObjAny', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('rejects null', () => {
		const result = vObjAny().validate(null);
		assert.strictEqual(result.content, undefined);
		assert.strictEqual(result.error?.message, 'Expected object, but got null');
	});

	test('accepts plain objects and arrays', () => {
		const obj = { a: 1 };
		assert.strictEqual(vObjAny().validate(obj).content, obj);

		const arr = [1, 2];
		assert.strictEqual(vObjAny().validate(arr).content, arr);
	});

	test('rejects non-objects', () => {
		assert.strictEqual(vObjAny().validate('str').error?.message, 'Expected object, but got string');
		assert.strictEqual(vObjAny().validate(42).error?.message, 'Expected object, but got number');
		assert.strictEqual(vObjAny().validate(undefined).error?.message, 'Expected object, but got undefined');
	});
});

suite('typeof validators', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('accept their own type', () => {
		assert.strictEqual(vString().validate('a').content, 'a');
		assert.strictEqual(vNumber().validate(1).content, 1);
		assert.strictEqual(vBoolean().validate(false).content, false);
	});

	test('report null as null rather than its typeof', () => {
		assert.strictEqual(vString().validate(null).error?.message, 'Expected string, but got null');
		assert.strictEqual(vNumber().validate(null).error?.message, 'Expected number, but got null');
	});
});
