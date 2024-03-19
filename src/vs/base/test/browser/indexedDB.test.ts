/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { IndexedDB } from 'vs/base/browser/indexedDB';
import { flakySuite } from 'vs/base/test/common/testUtils';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

flakySuite('IndexedDB', () => {

	let indexedDB: IndexedDB;

	setup(async () => {
		indexedDB = await IndexedDB.create('vscode-indexeddb-test', 1, ['test-store']);
		await indexedDB.runInTransaction('test-store', 'readwrite', store => store.clear());
	});

	teardown(() => {
		indexedDB?.close();
	});

	test('runInTransaction', async () => {
		await indexedDB.runInTransaction('test-store', 'readwrite', store => store.add('hello1', 'key1'));
		const value = await indexedDB.runInTransaction('test-store', 'readonly', store => store.get('key1'));
		assert.deepStrictEqual(value, 'hello1');
	});

	test('getKeyValues', async () => {
		await indexedDB.runInTransaction('test-store', 'readwrite', store => {
			const requests: IDBRequest[] = [];
			requests.push(store.add('hello1', 'key1'));
			requests.push(store.add('hello2', 'key2'));
			requests.push(store.add(true, 'key3'));

			return requests;
		});
		function isValid(value: unknown): value is string {
			return typeof value === 'string';
		}
		const keyValues = await indexedDB.getKeyValues('test-store', isValid);
		assert.strictEqual(keyValues.size, 2);
		assert.strictEqual(keyValues.get('key1'), 'hello1');
		assert.strictEqual(keyValues.get('key2'), 'hello2');
	});

	test('hasPendingTransactions', async () => {
		const promise = indexedDB.runInTransaction('test-store', 'readwrite', store => store.add('hello2', 'key2'));
		assert.deepStrictEqual(indexedDB.hasPendingTransactions(), true);
		await promise;
		assert.deepStrictEqual(indexedDB.hasPendingTransactions(), false);
	});

	test('close', async () => {
		const promise = indexedDB.runInTransaction('test-store', 'readwrite', store => store.add('hello3', 'key3'));
		indexedDB.close();
		assert.deepStrictEqual(indexedDB.hasPendingTransactions(), false);
		try {
			await promise;
			assert.fail('Transaction should be aborted');
		} catch (error) { }
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
