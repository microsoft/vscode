/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FibonacciDatabase } from '../../node/fibonacciDatabase.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('FibonacciDatabase', () => {

	let testDir: string;
	let dbPath: string;

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-fibonacci-test-'));
		dbPath = path.join(testDir, 'fibonacci.db');
	});

	teardown(async () => {
		// Clean up test database
		if (fs.existsSync(dbPath)) {
			try {
				fs.unlinkSync(dbPath);
			} catch (error) {
				// Ignore errors during cleanup
			}
		}
		if (fs.existsSync(testDir)) {
			try {
				fs.rmdirSync(testDir);
			} catch (error) {
				// Ignore errors during cleanup
			}
		}
	});

	test('should calculate and store fibonacci for n=0', async () => {
		const fibDb = new FibonacciDatabase(dbPath);
		try {
			const result = await fibDb.calculate(0);
			assert.strictEqual(result, 0n);

			// Verify it was stored
			const all = await fibDb.getAll();
			assert.strictEqual(all.get(0), 0n);
		} finally {
			await fibDb.close();
		}
	});

	test('should calculate and store fibonacci for n=10', async () => {
		const fibDb = new FibonacciDatabase(dbPath);
		try {
			const result = await fibDb.calculate(10);
			assert.strictEqual(result, 55n);

			// Verify it was stored
			const all = await fibDb.getAll();
			assert.strictEqual(all.get(10), 55n);
		} finally {
			await fibDb.close();
		}
	});

	test('should retrieve cached value from database', async () => {
		const fibDb = new FibonacciDatabase(dbPath);
		try {
			// Calculate first time
			await fibDb.calculate(20);

			// Calculate again - should retrieve from cache
			const result = await fibDb.calculate(20);
			assert.strictEqual(result, 6765n);
		} finally {
			await fibDb.close();
		}
	});

	test('should calculate and store range', async () => {
		const fibDb = new FibonacciDatabase(dbPath);
		try {
			const result = await fibDb.calculateRange(5);
			assert.deepStrictEqual(result, [0n, 1n, 1n, 2n, 3n, 5n]);

			// Verify all were stored
			const all = await fibDb.getAll();
			assert.strictEqual(all.size, 6);
			assert.strictEqual(all.get(0), 0n);
			assert.strictEqual(all.get(5), 5n);
		} finally {
			await fibDb.close();
		}
	});

	test('should persist data across database instances', async () => {
		// First instance
		const fibDb1 = new FibonacciDatabase(dbPath);
		try {
			await fibDb1.calculate(15);
		} finally {
			await fibDb1.close();
		}

		// Second instance should retrieve persisted data
		const fibDb2 = new FibonacciDatabase(dbPath);
		try {
			const all = await fibDb2.getAll();
			assert.strictEqual(all.get(15), 610n);
		} finally {
			await fibDb2.close();
		}
	});

	test('should handle large fibonacci numbers', async () => {
		const fibDb = new FibonacciDatabase(dbPath);
		try {
			const result = await fibDb.calculate(100);
			assert.strictEqual(result, 354224848179261915075n);

			// Verify it was stored
			const all = await fibDb.getAll();
			assert.strictEqual(all.get(100), 354224848179261915075n);
		} finally {
			await fibDb.close();
		}
	});

	test('should return empty map when no data stored', async () => {
		const fibDb = new FibonacciDatabase(dbPath);
		try {
			const all = await fibDb.getAll();
			assert.strictEqual(all.size, 0);
		} finally {
			await fibDb.close();
		}
	});
});
