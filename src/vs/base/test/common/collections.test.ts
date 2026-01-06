/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as collections from '../../common/collections.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Collections', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('groupBy', () => {

		const group1 = 'a', group2 = 'b';
		const value1 = 1, value2 = 2, value3 = 3;
		const source = [
			{ key: group1, value: value1 },
			{ key: group1, value: value2 },
			{ key: group2, value: value3 },
		];

		const grouped = collections.groupBy(source, x => x.key);

		// Group 1
		assert.strictEqual(grouped[group1].length, 2);
		assert.strictEqual(grouped[group1][0].value, value1);
		assert.strictEqual(grouped[group1][1].value, value2);

		// Group 2
		assert.strictEqual(grouped[group2].length, 1);
		assert.strictEqual(grouped[group2][0].value, value3);
	});

	suite('SetWithKey', () => {
		let setWithKey: collections.SetWithKey<{ someProp: string }>;

		const initialValues = ['a', 'b', 'c'].map(s => ({ someProp: s }));
		setup(() => {
			setWithKey = new collections.SetWithKey<{ someProp: string }>(initialValues, value => value.someProp);
		});

		test('size', () => {
			assert.strictEqual(setWithKey.size, 3);
		});

		test('add', () => {
			setWithKey.add({ someProp: 'd' });
			assert.strictEqual(setWithKey.size, 4);
			assert.strictEqual(setWithKey.has({ someProp: 'd' }), true);
		});

		test('delete', () => {
			assert.strictEqual(setWithKey.has({ someProp: 'b' }), true);
			setWithKey.delete({ someProp: 'b' });
			assert.strictEqual(setWithKey.size, 2);
			assert.strictEqual(setWithKey.has({ someProp: 'b' }), false);
		});

		test('has', () => {
			assert.strictEqual(setWithKey.has({ someProp: 'a' }), true);
			assert.strictEqual(setWithKey.has({ someProp: 'b' }), true);
		});

		test('entries', () => {
			const entries = Array.from(setWithKey.entries());
			assert.deepStrictEqual(entries, initialValues.map(value => [value, value]));
		});

		test('keys and values', () => {
			const keys = Array.from(setWithKey.keys());
			const values = Array.from(setWithKey.values());
			assert.deepStrictEqual(keys, initialValues);
			assert.deepStrictEqual(values, initialValues);
		});

		test('clear', () => {
			setWithKey.clear();
			assert.strictEqual(setWithKey.size, 0);
		});

		test('forEach', () => {
			const values: any[] = [];
			setWithKey.forEach(value => values.push(value));
			assert.deepStrictEqual(values, initialValues);
		});

		test('iterator', () => {
			const values: any[] = [];
			for (const value of setWithKey) {
				values.push(value);
			}
			assert.deepStrictEqual(values, initialValues);
		});

		test('toStringTag', () => {
			assert.strictEqual(setWithKey[Symbol.toStringTag], 'SetWithKey');
		});
	});
});
