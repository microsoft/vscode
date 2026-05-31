/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { merge, removeFromValueTree } from '../../common/configuration.js';
import { mergeChanges } from '../../common/configurationModels.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('Configuration', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('simple merge', () => {
		let base = { 'a': 1, 'b': 2 };
		merge(base, { 'a': 3, 'c': 4 }, true);
		assert.deepStrictEqual(base, { 'a': 3, 'b': 2, 'c': 4 });
		base = { 'a': 1, 'b': 2 };
		merge(base, { 'a': 3, 'c': 4 }, false);
		assert.deepStrictEqual(base, { 'a': 1, 'b': 2, 'c': 4 });
	});

	test('object merge', () => {
		const base = { 'a': { 'b': 1, 'c': true, 'd': 2 } };
		merge(base, { 'a': { 'b': undefined, 'c': false, 'e': 'a' } }, true);
		assert.deepStrictEqual(base, { 'a': { 'b': undefined, 'c': false, 'd': 2, 'e': 'a' } });
	});

	test('array merge', () => {
		const base = { 'a': ['b', 'c'] };
		merge(base, { 'a': ['b', 'd'] }, true);
		assert.deepStrictEqual(base, { 'a': ['b', 'd'] });
	});

	test('removeFromValueTree: remove a non existing key', () => {
		const target = { 'a': { 'b': 2 } };

		removeFromValueTree(target, 'c');

		assert.deepStrictEqual(target, { 'a': { 'b': 2 } });
	});

	test('removeFromValueTree: remove a multi segmented key from an object that has only sub sections of the key', () => {
		const target = { 'a': { 'b': 2 } };

		removeFromValueTree(target, 'a.b.c');

		assert.deepStrictEqual(target, { 'a': { 'b': 2 } });
	});

	test('removeFromValueTree: remove a single segmented key', () => {
		const target = { 'a': 1 };

		removeFromValueTree(target, 'a');

		assert.deepStrictEqual(target, {});
	});

	test('removeFromValueTree: remove a single segmented key when its value is undefined', () => {
		const target = { 'a': undefined };

		removeFromValueTree(target, 'a');

		assert.deepStrictEqual(target, {});
	});

	test('removeFromValueTree: remove a multi segmented key when its value is undefined', () => {
		const target = { 'a': { 'b': 1 } };

		removeFromValueTree(target, 'a.b');

		assert.deepStrictEqual(target, {});
	});

	test('removeFromValueTree: remove a multi segmented key when its value is array', () => {
		const target = { 'a': { 'b': [1] } };

		removeFromValueTree(target, 'a.b');

		assert.deepStrictEqual(target, {});
	});

	test('removeFromValueTree: remove a multi segmented key first segment value is array', () => {
		const target = { 'a': [1] };

		removeFromValueTree(target, 'a.0');

		assert.deepStrictEqual(target, { 'a': [1] });
	});

	test('removeFromValueTree: remove when key is the first segmenet', () => {
		const target = { 'a': { 'b': 1 } };

		removeFromValueTree(target, 'a');

		assert.deepStrictEqual(target, {});
	});

	test('removeFromValueTree: remove a multi segmented key when the first node has more values', () => {
		const target = { 'a': { 'b': { 'c': 1 }, 'd': 1 } };

		removeFromValueTree(target, 'a.b.c');

		assert.deepStrictEqual(target, { 'a': { 'd': 1 } });
	});

	test('removeFromValueTree: remove a multi segmented key when in between node has more values', () => {
		const target = { 'a': { 'b': { 'c': { 'd': 1 }, 'd': 1 } } };

		removeFromValueTree(target, 'a.b.c.d');

		assert.deepStrictEqual(target, { 'a': { 'b': { 'd': 1 } } });
	});

	test('removeFromValueTree: remove a multi segmented key when the last but one node has more values', () => {
		const target = { 'a': { 'b': { 'c': 1, 'd': 1 } } };

		removeFromValueTree(target, 'a.b.c');

		assert.deepStrictEqual(target, { 'a': { 'b': { 'd': 1 } } });
	});

});

suite('Configuration Changes: Merge', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('merge only keys', () => {
		const actual = mergeChanges({ keys: ['a', 'b'], overrides: [] }, { keys: ['c', 'd'], overrides: [] });
		assert.deepStrictEqual(actual, { keys: ['a', 'b', 'c', 'd'], overrides: [] });
	});

	test('merge only keys with duplicates', () => {
		const actual = mergeChanges({ keys: ['a', 'b'], overrides: [] }, { keys: ['c', 'd'], overrides: [] }, { keys: ['a', 'd', 'e'], overrides: [] });
		assert.deepStrictEqual(actual, { keys: ['a', 'b', 'c', 'd', 'e'], overrides: [] });
	});

	test('merge only overrides', () => {
		const actual = mergeChanges({ keys: [], overrides: [['a', ['1', '2']]] }, { keys: [], overrides: [['b', ['3', '4']]] });
		assert.deepStrictEqual(actual, { keys: [], overrides: [['a', ['1', '2']], ['b', ['3', '4']]] });
	});

	test('merge only overrides with duplicates', () => {
		const actual = mergeChanges({ keys: [], overrides: [['a', ['1', '2']], ['b', ['5', '4']]] }, { keys: [], overrides: [['b', ['3', '4']]] }, { keys: [], overrides: [['c', ['1', '4']], ['a', ['2', '3']]] });
		assert.deepStrictEqual(actual, { keys: [], overrides: [['a', ['1', '2', '3']], ['b', ['5', '4', '3']], ['c', ['1', '4']]] });
	});

	test('merge', () => {
		const actual = mergeChanges({ keys: ['b', 'b'], overrides: [['a', ['1', '2']], ['b', ['5', '4']]] }, { keys: ['b'], overrides: [['b', ['3', '4']]] }, { keys: ['c', 'a'], overrides: [['c', ['1', '4']], ['a', ['2', '3']]] });
		assert.deepStrictEqual(actual, { keys: ['b', 'c', 'a'], overrides: [['a', ['1', '2', '3']], ['b', ['5', '4', '3']], ['c', ['1', '4']]] });
	});

	test('merge single change', () => {
		const actual = mergeChanges({ keys: ['b', 'b'], overrides: [['a', ['1', '2']], ['b', ['5', '4']]] });
		assert.deepStrictEqual(actual, { keys: ['b', 'b'], overrides: [['a', ['1', '2']], ['b', ['5', '4']]] });
	});

	test('merge no changes', () => {
		const actual = mergeChanges();
		assert.deepStrictEqual(actual, { keys: [], overrides: [] });
	});

});
