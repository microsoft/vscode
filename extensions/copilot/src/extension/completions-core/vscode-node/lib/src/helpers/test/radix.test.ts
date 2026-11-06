/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { LRURadixTrie } from '../radix';
import * as assert from 'assert';

suite('LRURadixTrie', function () {
	let trie: LRURadixTrie<string>;

	setup(function () {
		trie = new LRURadixTrie<string>(20);
	});

	suite('set', function () {
		test('stores a single value', function () {
			trie.set('test', 'value');
			assert.deepStrictEqual(trie.findAll('test'), [{ remainingKey: '', value: 'value' }]);
		});

		test('splits edges when inserting', function () {
			trie.set('test', 'first');
			trie.set('testing', 'second');
			assert.deepStrictEqual(trie.findAll('testing'), [
				{ remainingKey: '', value: 'second' },
				{ remainingKey: 'ing', value: 'first' },
			]);
		});

		test('evicts least recently used when exceeding max size', function () {
			trie = new LRURadixTrie<string>(3);
			trie.set('a', 'first');
			trie.set('b', 'second');
			trie.set('c', 'third');
			trie.set('d', 'fourth');

			assert.deepStrictEqual(trie.findAll('a'), []);
			assert.deepStrictEqual(trie.findAll('b'), [{ remainingKey: '', value: 'second' }]);
			assert.deepStrictEqual(trie.findAll('c'), [{ remainingKey: '', value: 'third' }]);
			assert.deepStrictEqual(trie.findAll('d'), [{ remainingKey: '', value: 'fourth' }]);
		});

		test('shorter key as prefix of longer key', function () {
			const trie = new LRURadixTrie<string>(20);
			trie.set('test', '1');
			trie.set('t', '2');
			assert.deepStrictEqual(trie.findAll('test'), [
				{ remainingKey: '', value: '1' },
				{ remainingKey: 'est', value: '2' },
			]);
		});

		test('insertion order does not matter', function () {
			const trie1 = new LRURadixTrie<string>(20);
			const trie2 = new LRURadixTrie<string>(20);
			trie1.set('t', '2');
			trie1.set('test', '1');
			trie2.set('test', '1');
			trie2.set('t', '2');
			assert.deepStrictEqual(trie1.findAll('test'), [
				{ remainingKey: '', value: '1' },
				{ remainingKey: 'est', value: '2' },
			]);
			assert.deepStrictEqual(trie2.findAll('test'), [
				{ remainingKey: '', value: '1' },
				{ remainingKey: 'est', value: '2' },
			]);
			assert.deepStrictEqual(trie1.findAll('test'), trie2.findAll('test'));
		});
	});

	suite('findAll', function () {
		test('returns all matching prefixes', function () {
			trie.set('t', 'first');
			trie.set('te', 'second');
			trie.set('test', 'third');
			trie.set('test2', 'not expected');
			trie.set('team', 'not expected');
			trie.set('the', 'not expected');

			assert.deepStrictEqual(trie.findAll('test'), [
				{ remainingKey: '', value: 'third' },
				{ remainingKey: 'st', value: 'second' },
				{ remainingKey: 'est', value: 'first' },
			]);
		});

		test('returns empty array when no matches found', function () {
			trie.set('abc', 'value');
			trie.set('xyz1', 'value');
			trie.set('xyz2', 'value');
			assert.deepStrictEqual(trie.findAll('xyz'), []);
		});

		test('updates the least recently used when accessed', function () {
			trie = new LRURadixTrie<string>(3);
			trie.set('a', 'first');
			trie.set('b', 'second');
			trie.set('c', 'third');
			trie.findAll('a');
			trie.set('d', 'fourth');
			assert.deepStrictEqual(trie.findAll('b'), []);
			assert.deepStrictEqual(trie.findAll('c'), [{ remainingKey: '', value: 'third' }]);
			assert.deepStrictEqual(trie.findAll('d'), [{ remainingKey: '', value: 'fourth' }]);
			assert.deepStrictEqual(trie.findAll('a'), [{ remainingKey: '', value: 'first' }]);
		});
	});

	suite('delete', function () {
		test('removes a value', function () {
			trie.set('test', 'value');
			trie.delete('test');
			assert.deepStrictEqual(trie.findAll('test'), []);
		});

		test('handles merging child node after delete', function () {
			trie.set('test', 'first');
			trie.set('testing', 'second');

			trie.delete('test');

			assert.deepStrictEqual(trie.findAll('test'), []);
			assert.deepStrictEqual(trie.findAll('testing'), [{ remainingKey: '', value: 'second' }]);
		});

		test('handles merging sibling node after delete', function () {
			trie.set('test', 'first');
			trie.set('testing', 'second');
			trie.set('testy', 'third');

			trie.delete('test');
			trie.delete('testing');

			assert.deepStrictEqual(trie.findAll('test'), []);
			assert.deepStrictEqual(trie.findAll('testing'), []);
			assert.deepStrictEqual(trie.findAll('testy'), [{ remainingKey: '', value: 'third' }]);
		});

		test('does nothing when key not found', function () {
			trie.set('test', 'value');
			trie.delete('other');
			assert.deepStrictEqual(trie.findAll('test'), [{ remainingKey: '', value: 'value' }]);
		});
	});

	test('handles unicode characters with multiple code points', function () {
		/* Note: this behavior is arguably incorrect. Ideally, unicode characters
		 * comprising multiple code points would be treated as single characters.
		 * However, to do so would require converting all strings to arrays with
		 * Array.from and no longer using native string methods such as
		 * startsWith.  This performance hit from that is likely not worth fixing
		 * this behavior. */
		trie.set('ðŸ¤¦', 'no modifiers');
		trie.set('ðŸ¤¦ðŸ½', 'type 3');
		trie.set('ðŸ¤¦ðŸ½â€â™‚', 'man type 3');
		assert.deepStrictEqual(trie.findAll('ðŸ¤¦ðŸ½â€â™‚ï¸'), [
			{ remainingKey: 'ï¸', value: 'man type 3' },
			{ remainingKey: 'â€â™‚ï¸', value: 'type 3' },
			{ remainingKey: 'ðŸ½â€â™‚ï¸', value: 'no modifiers' },
		]);
	});
});
