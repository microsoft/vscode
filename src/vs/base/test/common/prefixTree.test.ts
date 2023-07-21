/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WellDefinedPrefixTree } from 'vs/base/common/prefixTree';
import * as assert from 'assert';

suite('WellDefinedPrefixTree', () => {
	let tree: WellDefinedPrefixTree<number>;

	setup(() => {
		tree = new WellDefinedPrefixTree<number>();
	});

	test('find', () => {
		const key1 = ['foo', 'bar'];
		const key2 = ['foo', 'baz'];
		tree.insert(key1, 42);
		tree.insert(key2, 43);
		assert.strictEqual(tree.find(key1), 42);
		assert.strictEqual(tree.find(key2), 43);
		assert.strictEqual(tree.find(['foo', 'baz', 'bop']), undefined);
		assert.strictEqual(tree.find(['foo']), undefined);
	});

	test('hasParentOfKey', () => {
		const key = ['foo', 'bar'];
		tree.insert(key, 42);

		assert.strictEqual(tree.hasKeyOrParent(['foo', 'bar', 'baz']), true);
		assert.strictEqual(tree.hasKeyOrParent(['foo', 'bar']), true);
		assert.strictEqual(tree.hasKeyOrParent(['foo']), false);
		assert.strictEqual(tree.hasKeyOrParent(['baz']), false);
	});


	test('hasKeyOrChildren', () => {
		const key = ['foo', 'bar'];
		tree.insert(key, 42);

		assert.strictEqual(tree.hasKeyOrChildren([]), true);
		assert.strictEqual(tree.hasKeyOrChildren(['foo']), true);
		assert.strictEqual(tree.hasKeyOrChildren(['foo', 'bar']), true);
		assert.strictEqual(tree.hasKeyOrChildren(['foo', 'bar', 'baz']), false);
	});
});
