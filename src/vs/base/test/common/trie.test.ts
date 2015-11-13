/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import trie = require('vs/base/common/trie');

suite('Trie', () => {
	test('insert & lookUp', () => {
		// manually build
		var data = trie.createTrie<number>();
		var item = data.lookUp('');
		assert(!item);

		data.insert('', 0);
		data.insert('far', 1);
		data.insert('boo', 2);
		var item = data.lookUp('');
		assert.equal(item, 0);
		var item = data.lookUp('far');
		assert.equal(item, 1);
		var item = data.lookUp('boo');
		assert.equal(item, 2);

		// automatically build
		data = trie.createTrie<number>({ '': 0, far: 1, boo: 2 });
		var item = data.lookUp('');
		assert.equal(item, 0);
		var item = data.lookUp('far');
		assert.equal(item, 1);
		var item = data.lookUp('boo');
		assert.equal(item, 2);
	});


	test('insert & lookUp - prefixes', () => {
		// manually build
		var data = trie.createTrie<number>();
		data.insert('far', 1);
		data.insert('far/boo', 2);

		var item = data.lookUp('far');
		assert.equal(item, 1);
		var item = data.lookUp('far/boo');
		assert.equal(item, 2);
		var item = data.lookUp('far/bo');
		assert(!item);
		var item = data.lookUp('far/booo');
		assert(!item);
		var item = data.lookUp('someother/what/not/path');
		assert(!item);
	});

	test('lookUpMany', () => {
		var data = trie.createTrie<number>();
		data.insert('far', 1);
		data.insert('far/boo', 2);

		var iter = data.lookUpMany('fa');
		var item = iter.next();
		while (!item.done) {
			var e = data.lookUp(item.value.key);
			assert(e === item.value.element);
			item = iter.next();
		}
	});
});