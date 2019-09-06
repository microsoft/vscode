/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { merge, removeFromValueTree } from 'vs/platform/configuration/common/configuration';

suite('Configuration', () => {

	test('simple merge', () => {
		let base = { 'a': 1, 'b': 2 };
		merge(base, { 'a': 3, 'c': 4 }, true);
		assert.deepEqual(base, { 'a': 3, 'b': 2, 'c': 4 });
		base = { 'a': 1, 'b': 2 };
		merge(base, { 'a': 3, 'c': 4 }, false);
		assert.deepEqual(base, { 'a': 1, 'b': 2, 'c': 4 });
	});

	test('removeFromValueTree: remove a non existing key', () => {
		let target = { 'a': { 'b': 2 } };

		removeFromValueTree(target, 'c');

		assert.deepEqual(target, { 'a': { 'b': 2 } });
	});

	test('removeFromValueTree: remove a multi segmented key from an object that has only sub sections of the key', () => {
		let target = { 'a': { 'b': 2 } };

		removeFromValueTree(target, 'a.b.c');

		assert.deepEqual(target, { 'a': { 'b': 2 } });
	});

	test('removeFromValueTree: remove a single segmented key', () => {
		let target = { 'a': 1 };

		removeFromValueTree(target, 'a');

		assert.deepEqual(target, {});
	});

	test('removeFromValueTree: remove a single segmented key when its value is undefined', () => {
		let target = { 'a': undefined };

		removeFromValueTree(target, 'a');

		assert.deepEqual(target, {});
	});

	test('removeFromValueTree: remove a multi segmented key when its value is undefined', () => {
		let target = { 'a': { 'b': 1 } };

		removeFromValueTree(target, 'a.b');

		assert.deepEqual(target, {});
	});

	test('removeFromValueTree: remove a multi segmented key when its value is array', () => {
		let target = { 'a': { 'b': [1] } };

		removeFromValueTree(target, 'a.b');

		assert.deepEqual(target, {});
	});

	test('removeFromValueTree: remove a multi segmented key first segment value is array', () => {
		let target = { 'a': [1] };

		removeFromValueTree(target, 'a.0');

		assert.deepEqual(target, { 'a': [1] });
	});

	test('removeFromValueTree: remove when key is the first segmenet', () => {
		let target = { 'a': { 'b': 1 } };

		removeFromValueTree(target, 'a');

		assert.deepEqual(target, {});
	});

	test('removeFromValueTree: remove a multi segmented key when the first node has more values', () => {
		let target = { 'a': { 'b': { 'c': 1 }, 'd': 1 } };

		removeFromValueTree(target, 'a.b.c');

		assert.deepEqual(target, { 'a': { 'd': 1 } });
	});

	test('removeFromValueTree: remove a multi segmented key when in between node has more values', () => {
		let target = { 'a': { 'b': { 'c': { 'd': 1 }, 'd': 1 } } };

		removeFromValueTree(target, 'a.b.c.d');

		assert.deepEqual(target, { 'a': { 'b': { 'd': 1 } } });
	});

	test('removeFromValueTree: remove a multi segmented key when the last but one node has more values', () => {
		let target = { 'a': { 'b': { 'c': 1, 'd': 1 } } };

		removeFromValueTree(target, 'a.b.c');

		assert.deepEqual(target, { 'a': { 'b': { 'd': 1 } } });
	});

});