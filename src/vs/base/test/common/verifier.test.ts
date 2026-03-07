/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { BooleanVerifier, EnumVerifier, NumberVerifier, ObjectVerifier, SetVerifier, verifyObject } from '../../common/verifier.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Verifier', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('BooleanVerifier', () => {
		test('should return the provided boolean if valid', () => {
			const verifier = new BooleanVerifier(false);
			assert.strictEqual(verifier.verify(true), true);
			assert.strictEqual(verifier.verify(false), false);
		});

		test('should return the default value if invalid', () => {
			const verifier = new BooleanVerifier(false);
			assert.strictEqual(verifier.verify(1), false);
			assert.strictEqual(verifier.verify('true'), false);
			assert.strictEqual(verifier.verify({}), false);
			assert.strictEqual(verifier.verify(null), false);
			assert.strictEqual(verifier.verify(undefined), false);
		});
	});

	suite('NumberVerifier', () => {
		test('should return the provided number if valid', () => {
			const verifier = new NumberVerifier(0);
			assert.strictEqual(verifier.verify(1), 1);
			assert.strictEqual(verifier.verify(-1.5), -1.5);
			assert.ok(Number.isNaN(verifier.verify(NaN)));
		});

		test('should return the default value if invalid', () => {
			const verifier = new NumberVerifier(0);
			assert.strictEqual(verifier.verify('1'), 0);
			assert.strictEqual(verifier.verify(true), 0);
			assert.strictEqual(verifier.verify({}), 0);
			assert.strictEqual(verifier.verify(null), 0);
			assert.strictEqual(verifier.verify(undefined), 0);
		});
	});

	suite('SetVerifier', () => {
		test('should return the provided set if valid', () => {
			const defaultSet = new Set<number>();
			const verifier = new SetVerifier<number>(defaultSet);
			const testSet = new Set([1, 2, 3]);
			assert.strictEqual(verifier.verify(testSet), testSet);
		});

		test('should return the default value if invalid', () => {
			const defaultSet = new Set<number>();
			const verifier = new SetVerifier<number>(defaultSet);
			assert.strictEqual(verifier.verify([1, 2, 3]), defaultSet);
			assert.strictEqual(verifier.verify(new Map()), defaultSet);
			assert.strictEqual(verifier.verify({}), defaultSet);
			assert.strictEqual(verifier.verify(null), defaultSet);
			assert.strictEqual(verifier.verify(undefined), defaultSet);
		});
	});

	suite('EnumVerifier', () => {
		test('should return the provided value if in allowed values', () => {
			const verifier = new EnumVerifier('a', ['a', 'b', 'c']);
			assert.strictEqual(verifier.verify('b'), 'b');
			assert.strictEqual(verifier.verify('c'), 'c');
		});

		test('should return the default value if not in allowed values', () => {
			const verifier = new EnumVerifier('a', ['a', 'b', 'c']);
			assert.strictEqual(verifier.verify('d'), 'a');
			assert.strictEqual(verifier.verify(1), 'a');
			assert.strictEqual(verifier.verify(null), 'a');
			assert.strictEqual(verifier.verify(undefined), 'a');
		});
	});

	suite('ObjectVerifier and verifyObject', () => {
		test('should correctly verify an object with multiple fields', () => {
			const defaultObj = { a: false, b: 0, c: 'a' };
			const verifier = new ObjectVerifier(defaultObj, {
				a: new BooleanVerifier(false),
				b: new NumberVerifier(0),
				c: new EnumVerifier('a', ['a', 'b', 'c'])
			});

			const validObj = { a: true, b: 1, c: 'b' };
			const result = verifier.verify(validObj);
			assert.strictEqual(result.a, validObj.a);
			assert.strictEqual(result.b, validObj.b);
			assert.strictEqual(result.c, validObj.c);
			assert.notStrictEqual(result, validObj); // Should return a new object
		});

		test('should return default fields for invalid properties', () => {
			const defaultObj = { a: false, b: 0, c: 'a' };
			const verifier = new ObjectVerifier(defaultObj, {
				a: new BooleanVerifier(false),
				b: new NumberVerifier(0),
				c: new EnumVerifier('a', ['a', 'b', 'c'])
			});

			const invalidObj = { a: 1, b: '1', c: 'd' };
			const result = verifier.verify(invalidObj);
			assert.strictEqual(result.a, defaultObj.a);
			assert.strictEqual(result.b, defaultObj.b);
			assert.strictEqual(result.c, defaultObj.c);
		});

		test('should return default fields for missing properties', () => {
			const defaultObj = { a: false, b: 0, c: 'a' };
			const verifier = new ObjectVerifier(defaultObj, {
				a: new BooleanVerifier(false),
				b: new NumberVerifier(0),
				c: new EnumVerifier('a', ['a', 'b', 'c'])
			});

			const incompleteObj = { a: true };
			const result = verifier.verify(incompleteObj);
			assert.strictEqual(result.a, true);
			assert.strictEqual(result.b, 0);
			assert.strictEqual(result.c, 'a');
		});

		test('should return the default object if the value is not an object', () => {
			const defaultObj = { a: false, b: 0, c: 'a' };
			const verifier = new ObjectVerifier(defaultObj, {
				a: new BooleanVerifier(false),
				b: new NumberVerifier(0),
				c: new EnumVerifier('a', ['a', 'b', 'c'])
			});

			assert.strictEqual(verifier.verify(null), defaultObj);
			assert.strictEqual(verifier.verify(undefined), defaultObj);
			assert.strictEqual(verifier.verify('string'), defaultObj);
			assert.strictEqual(verifier.verify(123), defaultObj);
		});

		test('verifyObject should verify fields based on verifiers', () => {
			const verifiers = {
				a: new BooleanVerifier(false),
				b: new NumberVerifier(0),
				c: new EnumVerifier('a', ['a', 'b', 'c'])
			};

			const result = verifyObject(verifiers, { a: true, b: '1', c: 'b', d: 'ignored' });
			assert.strictEqual(result.a, true);
			assert.strictEqual(result.b, 0);
			assert.strictEqual(result.c, 'b');
			assert.strictEqual((result as any).d, undefined);
			assert.strictEqual(Object.getPrototypeOf(result), null); // Object.create(null)
		});
	});
});
