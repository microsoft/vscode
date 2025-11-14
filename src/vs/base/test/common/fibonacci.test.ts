/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Fibonacci } from '../../common/fibonacci.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Fibonacci', () => {

	const fibonacci = new Fibonacci();

	ensureNoDisposablesAreLeakedInTestSuite();

	test('should calculate fibonacci for n=0', () => {
		const result = fibonacci.calculate(0);
		assert.strictEqual(result, 0n);
	});

	test('should calculate fibonacci for n=1', () => {
		const result = fibonacci.calculate(1);
		assert.strictEqual(result, 1n);
	});

	test('should calculate fibonacci for n=2', () => {
		const result = fibonacci.calculate(2);
		assert.strictEqual(result, 1n);
	});

	test('should calculate fibonacci for n=10', () => {
		const result = fibonacci.calculate(10);
		assert.strictEqual(result, 55n);
	});

	test('should calculate fibonacci for n=20', () => {
		const result = fibonacci.calculate(20);
		assert.strictEqual(result, 6765n);
	});

	test('should calculate fibonacci for large n=50', () => {
		const result = fibonacci.calculate(50);
		assert.strictEqual(result, 12586269025n);
	});

	test('should throw error for negative numbers', () => {
		assert.throws(() => {
			fibonacci.calculate(-1);
		}, /Fibonacci is not defined for negative numbers/);
	});

	test('should calculate range from 0 to 5', () => {
		const result = fibonacci.calculateRange(5);
		assert.deepStrictEqual(result, [0n, 1n, 1n, 2n, 3n, 5n]);
	});

	test('should calculate range from 0 to 10', () => {
		const result = fibonacci.calculateRange(10);
		assert.deepStrictEqual(result, [0n, 1n, 1n, 2n, 3n, 5n, 8n, 13n, 21n, 34n, 55n]);
	});

	test('should throw error for negative range', () => {
		assert.throws(() => {
			fibonacci.calculateRange(-1);
		}, /Fibonacci is not defined for negative numbers/);
	});
});
