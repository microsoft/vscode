/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Trie } from 'vs/base/browser/ui/list/trie';

suite('Trie', function () {

	test('simple test', () => {
		const trie = new Trie<number, string>();

		trie.set([0, 0, 0], 'hello');
		assert.equal(trie.get([0]), undefined);
		assert.equal(trie.get([0, 0]), undefined);
		assert.equal(trie.get([0, 0, 0]), 'hello');
		assert.equal(trie.get([1, 0, 0]), undefined);
		assert.equal(trie.get([0, 1, 0]), undefined);
		assert.equal(trie.get([0, 0, 1]), undefined);
		assert.equal(trie.get([0, 0, 0, 0]), undefined);
	});

	test('clear', () => {
		const trie = new Trie<number, string>();

		trie.set([0, 0, 0], 'hello');
		assert.equal(trie.get([0, 0, 0]), 'hello');

		trie.clear();
		assert.equal(trie.get([0, 0, 0]), undefined);
	});

	test('delete', () => {
		const trie = new Trie<number, string>();

		trie.set([1, 2, 3], 'hello');
		assert.equal(trie.get([1, 2, 3]), 'hello');

		trie.delete([1, 2, 3]);
		assert.equal(trie.get([1, 2, 3]), undefined);
	});

	test('recursive delete', () => {
		const trie = new Trie<number, string>();

		trie.set([1], 'hello');
		trie.set([1, 2, 3], 'world');
		assert.equal(trie.get([1]), 'hello');
		assert.equal(trie.get([1, 2, 3]), 'world');

		trie.delete([1], true);
		assert.equal(trie.get([1]), undefined);
		assert.equal(trie.get([1, 2, 3]), undefined);
	});

	test('non-recursive delete', () => {
		const trie = new Trie<number, string>();

		trie.set([1], 'hello');
		trie.set([1, 2, 3], 'world');
		assert.equal(trie.get([1]), 'hello');
		assert.equal(trie.get([1, 2, 3]), 'world');

		trie.delete([1], false);
		assert.equal(trie.get([1]), undefined);
		assert.equal(trie.get([1, 2, 3]), 'world');
	});

	test('map tests', () => {
		const trie = new Trie<number, string>();

		trie.set([0, 0, 0], 'hello');
		assert.equal(trie.get([0, 0, 0]), 'hello');

		trie.set([0, 0], 'world');
		assert.equal(trie.get([0, 0]), 'world');

		trie.set([0, 0, 1], 'cool');
		assert.equal(trie.get([0, 0, 1]), 'cool');
	});
});