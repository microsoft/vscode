/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { shuffle } from 'vs/base/common/arrays';
import { randomPath } from 'vs/base/common/extpath';
import { StopWatch } from 'vs/base/common/stopwatch';
import { ConfigKeysIterator, PathIterator, StringIterator, TernarySearchTree, UriIterator } from 'vs/base/common/ternarySearchTree';
import { URI } from 'vs/base/common/uri';

suite('Ternary Search Tree', () => {

	test('PathIterator', () => {
		const iter = new PathIterator();
		iter.reset('file:///usr/bin/file.txt');

		assert.strictEqual(iter.value(), 'file:');
		assert.strictEqual(iter.hasNext(), true);
		assert.strictEqual(iter.cmp('file:'), 0);
		assert.ok(iter.cmp('a') < 0);
		assert.ok(iter.cmp('aile:') < 0);
		assert.ok(iter.cmp('z') > 0);
		assert.ok(iter.cmp('zile:') > 0);

		iter.next();
		assert.strictEqual(iter.value(), 'usr');
		assert.strictEqual(iter.hasNext(), true);

		iter.next();
		assert.strictEqual(iter.value(), 'bin');
		assert.strictEqual(iter.hasNext(), true);

		iter.next();
		assert.strictEqual(iter.value(), 'file.txt');
		assert.strictEqual(iter.hasNext(), false);

		iter.next();
		assert.strictEqual(iter.value(), '');
		assert.strictEqual(iter.hasNext(), false);
		iter.next();
		assert.strictEqual(iter.value(), '');
		assert.strictEqual(iter.hasNext(), false);

		//
		iter.reset('/foo/bar/');
		assert.strictEqual(iter.value(), 'foo');
		assert.strictEqual(iter.hasNext(), true);

		iter.next();
		assert.strictEqual(iter.value(), 'bar');
		assert.strictEqual(iter.hasNext(), false);
	});

	test('URIIterator', function () {
		const iter = new UriIterator(() => false, () => false);
		iter.reset(URI.parse('file:///usr/bin/file.txt'));

		assert.strictEqual(iter.value(), 'file');
		// assert.strictEqual(iter.cmp('FILE'), 0);
		assert.strictEqual(iter.cmp('file'), 0);
		assert.strictEqual(iter.hasNext(), true);
		iter.next();

		assert.strictEqual(iter.value(), 'usr');
		assert.strictEqual(iter.hasNext(), true);
		iter.next();

		assert.strictEqual(iter.value(), 'bin');
		assert.strictEqual(iter.hasNext(), true);
		iter.next();

		assert.strictEqual(iter.value(), 'file.txt');
		assert.strictEqual(iter.hasNext(), false);


		iter.reset(URI.parse('file://share/usr/bin/file.txt?foo'));

		// scheme
		assert.strictEqual(iter.value(), 'file');
		// assert.strictEqual(iter.cmp('FILE'), 0);
		assert.strictEqual(iter.cmp('file'), 0);
		assert.strictEqual(iter.hasNext(), true);
		iter.next();

		// authority
		assert.strictEqual(iter.value(), 'share');
		assert.strictEqual(iter.cmp('SHARe'), 0);
		assert.strictEqual(iter.hasNext(), true);
		iter.next();

		// path
		assert.strictEqual(iter.value(), 'usr');
		assert.strictEqual(iter.hasNext(), true);
		iter.next();

		// path
		assert.strictEqual(iter.value(), 'bin');
		assert.strictEqual(iter.hasNext(), true);
		iter.next();

		// path
		assert.strictEqual(iter.value(), 'file.txt');
		assert.strictEqual(iter.hasNext(), true);
		iter.next();

		// query
		assert.strictEqual(iter.value(), 'foo');
		assert.strictEqual(iter.cmp('z') > 0, true);
		assert.strictEqual(iter.cmp('a') < 0, true);
		assert.strictEqual(iter.hasNext(), false);
	});

	test('URIIterator - ignore query/fragment', function () {
		const iter = new UriIterator(() => false, () => true);
		iter.reset(URI.parse('file:///usr/bin/file.txt'));

		assert.strictEqual(iter.value(), 'file');
		// assert.strictEqual(iter.cmp('FILE'), 0);
		assert.strictEqual(iter.cmp('file'), 0);
		assert.strictEqual(iter.hasNext(), true);
		iter.next();

		assert.strictEqual(iter.value(), 'usr');
		assert.strictEqual(iter.hasNext(), true);
		iter.next();

		assert.strictEqual(iter.value(), 'bin');
		assert.strictEqual(iter.hasNext(), true);
		iter.next();

		assert.strictEqual(iter.value(), 'file.txt');
		assert.strictEqual(iter.hasNext(), false);


		iter.reset(URI.parse('file://share/usr/bin/file.txt?foo'));

		// scheme
		assert.strictEqual(iter.value(), 'file');
		// assert.strictEqual(iter.cmp('FILE'), 0);
		assert.strictEqual(iter.cmp('file'), 0);
		assert.strictEqual(iter.hasNext(), true);
		iter.next();

		// authority
		assert.strictEqual(iter.value(), 'share');
		assert.strictEqual(iter.cmp('SHARe'), 0);
		assert.strictEqual(iter.hasNext(), true);
		iter.next();

		// path
		assert.strictEqual(iter.value(), 'usr');
		assert.strictEqual(iter.hasNext(), true);
		iter.next();

		// path
		assert.strictEqual(iter.value(), 'bin');
		assert.strictEqual(iter.hasNext(), true);
		iter.next();

		// path
		assert.strictEqual(iter.value(), 'file.txt');
		assert.strictEqual(iter.hasNext(), false);
	});

	function assertTstDfs<E>(trie: TernarySearchTree<string, E>, ...elements: [string, E][]) {

		assert.ok(trie._isBalanced(), 'TST is not balanced');

		let i = 0;
		for (const [key, value] of trie) {
			const expected = elements[i++];
			assert.ok(expected);
			assert.strictEqual(key, expected[0]);
			assert.strictEqual(value, expected[1]);
		}

		assert.strictEqual(i, elements.length);

		const map = new Map<string, E>();
		for (const [key, value] of elements) {
			map.set(key, value);
		}
		map.forEach((value, key) => {
			assert.strictEqual(trie.get(key), value);
		});

		// forEach
		let forEachCount = 0;
		trie.forEach((element, key) => {
			assert.strictEqual(element, map.get(key));
			forEachCount++;
		});
		assert.strictEqual(map.size, forEachCount);

		// iterator
		let iterCount = 0;
		for (const [key, value] of trie) {
			assert.strictEqual(value, map.get(key));
			iterCount++;
		}
		assert.strictEqual(map.size, iterCount);

	}

	test('TernarySearchTree - set', function () {

		let trie = TernarySearchTree.forStrings<number>();
		trie.set('foobar', 1);
		trie.set('foobaz', 2);

		assertTstDfs(trie, ['foobar', 1], ['foobaz', 2]); // longer

		trie = TernarySearchTree.forStrings<number>();
		trie.set('foobar', 1);
		trie.set('fooba', 2);
		assertTstDfs(trie, ['fooba', 2], ['foobar', 1]); // shorter

		trie = TernarySearchTree.forStrings<number>();
		trie.set('foo', 1);
		trie.set('foo', 2);
		assertTstDfs(trie, ['foo', 2]);

		trie = TernarySearchTree.forStrings<number>();
		trie.set('foo', 1);
		trie.set('foobar', 2);
		trie.set('bar', 3);
		trie.set('foob', 4);
		trie.set('bazz', 5);

		assertTstDfs(trie,
			['bar', 3],
			['bazz', 5],
			['foo', 1],
			['foob', 4],
			['foobar', 2],
		);
	});

	test('TernarySearchTree - findLongestMatch', function () {

		const trie = TernarySearchTree.forStrings<number>();
		trie.set('foo', 1);
		trie.set('foobar', 2);
		trie.set('foobaz', 3);
		assertTstDfs(trie, ['foo', 1], ['foobar', 2], ['foobaz', 3]);

		assert.strictEqual(trie.findSubstr('f'), undefined);
		assert.strictEqual(trie.findSubstr('z'), undefined);
		assert.strictEqual(trie.findSubstr('foo'), 1);
		assert.strictEqual(trie.findSubstr('fooö'), 1);
		assert.strictEqual(trie.findSubstr('fooba'), 1);
		assert.strictEqual(trie.findSubstr('foobarr'), 2);
		assert.strictEqual(trie.findSubstr('foobazrr'), 3);
	});

	test('TernarySearchTree - basics', function () {
		const trie = new TernarySearchTree<string, number>(new StringIterator());

		trie.set('foo', 1);
		trie.set('bar', 2);
		trie.set('foobar', 3);
		assertTstDfs(trie, ['bar', 2], ['foo', 1], ['foobar', 3]);

		assert.strictEqual(trie.get('foo'), 1);
		assert.strictEqual(trie.get('bar'), 2);
		assert.strictEqual(trie.get('foobar'), 3);
		assert.strictEqual(trie.get('foobaz'), undefined);
		assert.strictEqual(trie.get('foobarr'), undefined);

		assert.strictEqual(trie.findSubstr('fo'), undefined);
		assert.strictEqual(trie.findSubstr('foo'), 1);
		assert.strictEqual(trie.findSubstr('foooo'), 1);


		trie.delete('foobar');
		trie.delete('bar');
		assert.strictEqual(trie.get('foobar'), undefined);
		assert.strictEqual(trie.get('bar'), undefined);

		trie.set('foobar', 17);
		trie.set('barr', 18);
		assert.strictEqual(trie.get('foobar'), 17);
		assert.strictEqual(trie.get('barr'), 18);
		assert.strictEqual(trie.get('bar'), undefined);
	});

	test('TernarySearchTree - delete & cleanup', function () {
		// normal delete
		let trie = new TernarySearchTree<string, number>(new StringIterator());
		trie.set('foo', 1);
		trie.set('foobar', 2);
		trie.set('bar', 3);
		assertTstDfs(trie, ['bar', 3], ['foo', 1], ['foobar', 2]);
		trie.delete('foo');
		assertTstDfs(trie, ['bar', 3], ['foobar', 2]);
		trie.delete('foobar');
		assertTstDfs(trie, ['bar', 3]);

		// superstr-delete
		trie = new TernarySearchTree<string, number>(new StringIterator());
		trie.set('foo', 1);
		trie.set('foobar', 2);
		trie.set('bar', 3);
		trie.set('foobarbaz', 4);
		trie.deleteSuperstr('foo');
		assertTstDfs(trie, ['bar', 3], ['foo', 1]);

		trie = new TernarySearchTree<string, number>(new StringIterator());
		trie.set('foo', 1);
		trie.set('foobar', 2);
		trie.set('bar', 3);
		trie.set('foobarbaz', 4);
		trie.deleteSuperstr('fo');
		assertTstDfs(trie, ['bar', 3]);

		// trie = new TernarySearchTree<string, number>(new StringIterator());
		// trie.set('foo', 1);
		// trie.set('foobar', 2);
		// trie.set('bar', 3);
		// trie.deleteSuperStr('f');
		// assertTernarySearchTree(trie, ['bar', 3]);
	});

	test('TernarySearchTree (PathSegments) - basics', function () {
		const trie = new TernarySearchTree<string, number>(new PathIterator());

		trie.set('/user/foo/bar', 1);
		trie.set('/user/foo', 2);
		trie.set('/user/foo/flip/flop', 3);

		assert.strictEqual(trie.get('/user/foo/bar'), 1);
		assert.strictEqual(trie.get('/user/foo'), 2);
		assert.strictEqual(trie.get('/user//foo'), 2);
		assert.strictEqual(trie.get('/user\\foo'), 2);
		assert.strictEqual(trie.get('/user/foo/flip/flop'), 3);

		assert.strictEqual(trie.findSubstr('/user/bar'), undefined);
		assert.strictEqual(trie.findSubstr('/user/foo'), 2);
		assert.strictEqual(trie.findSubstr('\\user\\foo'), 2);
		assert.strictEqual(trie.findSubstr('/user//foo'), 2);
		assert.strictEqual(trie.findSubstr('/user/foo/ba'), 2);
		assert.strictEqual(trie.findSubstr('/user/foo/far/boo'), 2);
		assert.strictEqual(trie.findSubstr('/user/foo/bar'), 1);
		assert.strictEqual(trie.findSubstr('/user/foo/bar/far/boo'), 1);
	});

	test('TernarySearchTree - (AVL) set', function () {
		{
			// rotate left
			const trie = new TernarySearchTree<string, number>(new PathIterator());
			trie.set('/fileA', 1);
			trie.set('/fileB', 2);
			trie.set('/fileC', 3);
			assertTstDfs(trie, ['/fileA', 1], ['/fileB', 2], ['/fileC', 3]);
		}

		{
			// rotate left (inside middle)
			const trie = new TernarySearchTree<string, number>(new PathIterator());
			trie.set('/foo/fileA', 1);
			trie.set('/foo/fileB', 2);
			trie.set('/foo/fileC', 3);
			assertTstDfs(trie, ['/foo/fileA', 1], ['/foo/fileB', 2], ['/foo/fileC', 3]);
		}

		{
			// rotate right
			const trie = new TernarySearchTree<string, number>(new PathIterator());
			trie.set('/fileC', 3);
			trie.set('/fileB', 2);
			trie.set('/fileA', 1);
			assertTstDfs(trie, ['/fileA', 1], ['/fileB', 2], ['/fileC', 3]);
		}

		{
			// rotate right (inside middle)
			const trie = new TernarySearchTree<string, number>(new PathIterator());
			trie.set('/mid/fileC', 3);
			trie.set('/mid/fileB', 2);
			trie.set('/mid/fileA', 1);
			assertTstDfs(trie, ['/mid/fileA', 1], ['/mid/fileB', 2], ['/mid/fileC', 3]);
		}

		{
			// rotate right, left
			const trie = new TernarySearchTree<string, number>(new PathIterator());
			trie.set('/fileD', 7);
			trie.set('/fileB', 2);
			trie.set('/fileG', 42);
			trie.set('/fileF', 24);
			trie.set('/fileZ', 73);
			trie.set('/fileE', 15);
			assertTstDfs(trie, ['/fileB', 2], ['/fileD', 7], ['/fileE', 15], ['/fileF', 24], ['/fileG', 42], ['/fileZ', 73]);
		}

		{
			// rotate left, right
			const trie = new TernarySearchTree<string, number>(new PathIterator());
			trie.set('/fileJ', 42);
			trie.set('/fileZ', 73);
			trie.set('/fileE', 15);
			trie.set('/fileB', 2);
			trie.set('/fileF', 7);
			trie.set('/fileG', 1);
			assertTstDfs(trie, ['/fileB', 2], ['/fileE', 15], ['/fileF', 7], ['/fileG', 1], ['/fileJ', 42], ['/fileZ', 73]);
		}
	});

	test('TernarySearchTree - (BST) delete', function () {

		const trie = new TernarySearchTree<string, number>(new StringIterator());

		// delete root
		trie.set('d', 1);
		assertTstDfs(trie, ['d', 1]);
		trie.delete('d');
		assertTstDfs(trie);

		// delete node with two element
		trie.clear();
		trie.set('d', 1);
		trie.set('b', 1);
		trie.set('f', 1);
		assertTstDfs(trie, ['b', 1], ['d', 1], ['f', 1]);
		trie.delete('d');
		assertTstDfs(trie, ['b', 1], ['f', 1]);

		// single child node
		trie.clear();
		trie.set('d', 1);
		trie.set('b', 1);
		trie.set('f', 1);
		trie.set('e', 1);
		assertTstDfs(trie, ['b', 1], ['d', 1], ['e', 1], ['f', 1]);
		trie.delete('f');
		assertTstDfs(trie, ['b', 1], ['d', 1], ['e', 1]);
	});

	test('TernarySearchTree - (AVL) delete', function () {

		const trie = new TernarySearchTree<string, number>(new StringIterator());

		trie.clear();
		trie.set('d', 1);
		trie.set('b', 1);
		trie.set('f', 1);
		trie.set('e', 1);
		trie.set('z', 1);
		assertTstDfs(trie, ['b', 1], ['d', 1], ['e', 1], ['f', 1], ['z', 1]);

		// right, right
		trie.delete('b');
		assertTstDfs(trie, ['d', 1], ['e', 1], ['f', 1], ['z', 1]);

		trie.clear();
		trie.set('d', 1);
		trie.set('c', 1);
		trie.set('f', 1);
		trie.set('a', 1);
		trie.set('b', 1);
		assertTstDfs(trie, ['a', 1], ['b', 1], ['c', 1], ['d', 1], ['f', 1]);

		// left, left
		trie.delete('f');
		assertTstDfs(trie, ['a', 1], ['b', 1], ['c', 1], ['d', 1]);

		// mid
		trie.clear();
		trie.set('a', 1);
		trie.set('ad', 1);
		trie.set('ab', 1);
		trie.set('af', 1);
		trie.set('ae', 1);
		trie.set('az', 1);
		assertTstDfs(trie, ['a', 1], ['ab', 1], ['ad', 1], ['ae', 1], ['af', 1], ['az', 1]);

		trie.delete('ab');
		assertTstDfs(trie, ['a', 1], ['ad', 1], ['ae', 1], ['af', 1], ['az', 1]);

		trie.delete('a');
		assertTstDfs(trie, ['ad', 1], ['ae', 1], ['af', 1], ['az', 1]);
	});

	test('TernarySearchTree: Cannot read property \'1\' of undefined #138284', function () {

		const keys = [
			URI.parse('fake-fs:/C'),
			URI.parse('fake-fs:/A'),
			URI.parse('fake-fs:/D'),
			URI.parse('fake-fs:/B'),
		];

		const tst = TernarySearchTree.forUris<boolean>();

		for (const item of keys) {
			tst.set(item, true);
		}

		assert.ok(tst._isBalanced());
		tst.delete(keys[0]);
		assert.ok(tst._isBalanced());
	});

	test('TernarySearchTree: Cannot read property \'1\' of undefined #138284 (simple)', function () {

		const keys = ['C', 'A', 'D', 'B',];
		const tst = TernarySearchTree.forStrings<boolean>();
		for (const item of keys) {
			tst.set(item, true);
		}
		assertTstDfs(tst, ['A', true], ['B', true], ['C', true], ['D', true]);

		tst.delete(keys[0]);
		assertTstDfs(tst, ['A', true], ['B', true], ['D', true]);

		{
			const tst = TernarySearchTree.forStrings<boolean>();
			tst.set('C', true);
			tst.set('A', true);
			tst.set('B', true);
			assertTstDfs(tst, ['A', true], ['B', true], ['C', true]);
		}

	});

	test('TernarySearchTree: Cannot read property \'1\' of undefined #138284 (random)', function () {
		for (let round = 10; round >= 0; round--) {
			const keys: URI[] = [];
			for (let i = 0; i < 100; i++) {
				keys.push(URI.from({ scheme: 'fake-fs', path: randomPath(undefined, undefined, 10) }));
			}
			const tst = TernarySearchTree.forUris<boolean>();

			for (const item of keys) {
				tst.set(item, true);
				assert.ok(tst._isBalanced(), `SET${item}|${keys.map(String).join()}`);
			}

			for (const item of keys) {
				tst.delete(item);
				assert.ok(tst._isBalanced(), `DEL${item}|${keys.map(String).join()}`);
			}
		}
	});

	test('TernarySearchTree: Cannot read properties of undefined (reading \'length\'): #161618 (simple)', function () {
		const raw = 'config.debug.toolBarLocation,floating,config.editor.renderControlCharacters,true,config.editor.renderWhitespace,selection,config.files.autoSave,off,config.git.enabled,true,config.notebook.globalToolbar,true,config.terminal.integrated.tabs.enabled,true,config.terminal.integrated.tabs.showActions,singleTerminalOrNarrow,config.terminal.integrated.tabs.showActiveTerminal,singleTerminalOrNarrow,config.workbench.activityBar.visible,true,config.workbench.experimental.settingsProfiles.enabled,true,config.workbench.layoutControl.type,both,config.workbench.sideBar.location,left,config.workbench.statusBar.visible,true';
		const array = raw.split(',');
		const tuples: [string, string][] = [];
		for (let i = 0; i < array.length; i += 2) {
			tuples.push([array[i], array[i + 1]]);
		}

		const map = TernarySearchTree.forConfigKeys<string>();
		map.fill(tuples);

		assert.strictEqual([...map].join(), raw);
		assert.ok(map.has('config.editor.renderWhitespace'));

		const len = [...map].length;
		map.delete('config.editor.renderWhitespace');
		assert.ok(map._isBalanced());
		assert.strictEqual([...map].length, len - 1);
	});

	test('TernarySearchTree: Cannot read properties of undefined (reading \'length\'): #161618 (random)', function () {
		const raw = 'config.debug.toolBarLocation,floating,config.editor.renderControlCharacters,true,config.editor.renderWhitespace,selection,config.files.autoSave,off,config.git.enabled,true,config.notebook.globalToolbar,true,config.terminal.integrated.tabs.enabled,true,config.terminal.integrated.tabs.showActions,singleTerminalOrNarrow,config.terminal.integrated.tabs.showActiveTerminal,singleTerminalOrNarrow,config.workbench.activityBar.visible,true,config.workbench.experimental.settingsProfiles.enabled,true,config.workbench.layoutControl.type,both,config.workbench.sideBar.location,left,config.workbench.statusBar.visible,true';
		const array = raw.split(',');
		const tuples: [string, string][] = [];
		for (let i = 0; i < array.length; i += 2) {
			tuples.push([array[i], array[i + 1]]);
		}

		for (let round = 100; round >= 0; round--) {
			shuffle(tuples);
			const map = TernarySearchTree.forConfigKeys<string>();
			map.fill(tuples);

			assert.strictEqual([...map].join(), raw);
			assert.ok(map.has('config.editor.renderWhitespace'));

			const len = [...map].length;
			map.delete('config.editor.renderWhitespace');
			assert.ok(map._isBalanced());
			assert.strictEqual([...map].length, len - 1);
		}
	});

	test('TernarySearchTree (PathSegments) - lookup', function () {

		const map = new TernarySearchTree<string, number>(new PathIterator());
		map.set('/user/foo/bar', 1);
		map.set('/user/foo', 2);
		map.set('/user/foo/flip/flop', 3);

		assert.strictEqual(map.get('/foo'), undefined);
		assert.strictEqual(map.get('/user'), undefined);
		assert.strictEqual(map.get('/user/foo'), 2);
		assert.strictEqual(map.get('/user/foo/bar'), 1);
		assert.strictEqual(map.get('/user/foo/bar/boo'), undefined);
	});

	test('TernarySearchTree (PathSegments) - superstr', function () {

		const map = new TernarySearchTree<string, number>(new PathIterator());
		map.set('/user/foo/bar', 1);
		map.set('/user/foo', 2);
		map.set('/user/foo/flip/flop', 3);
		map.set('/usr/foo', 4);

		let item: IteratorResult<[string, number]>;
		let iter = map.findSuperstr('/user');

		item = iter!.next();
		assert.strictEqual(item.value[1], 2);
		assert.strictEqual(item.done, false);
		item = iter!.next();
		assert.strictEqual(item.value[1], 1);
		assert.strictEqual(item.done, false);
		item = iter!.next();
		assert.strictEqual(item.value[1], 3);
		assert.strictEqual(item.done, false);
		item = iter!.next();
		assert.strictEqual(item.value, undefined);
		assert.strictEqual(item.done, true);

		iter = map.findSuperstr('/usr');
		item = iter!.next();
		assert.strictEqual(item.value[1], 4);
		assert.strictEqual(item.done, false);

		item = iter!.next();
		assert.strictEqual(item.value, undefined);
		assert.strictEqual(item.done, true);

		assert.strictEqual(map.findSuperstr('/not'), undefined);
		assert.strictEqual(map.findSuperstr('/us'), undefined);
		assert.strictEqual(map.findSuperstr('/usrr'), undefined);
		assert.strictEqual(map.findSuperstr('/userr'), undefined);
	});


	test('TernarySearchTree (PathSegments) - delete_superstr', function () {

		const map = new TernarySearchTree<string, number>(new PathIterator());
		map.set('/user/foo/bar', 1);
		map.set('/user/foo', 2);
		map.set('/user/foo/flip/flop', 3);
		map.set('/usr/foo', 4);

		assertTstDfs(map,
			['/user/foo', 2],
			['/user/foo/bar', 1],
			['/user/foo/flip/flop', 3],
			['/usr/foo', 4],
		);

		// not a segment
		map.deleteSuperstr('/user/fo');
		assertTstDfs(map,
			['/user/foo', 2],
			['/user/foo/bar', 1],
			['/user/foo/flip/flop', 3],
			['/usr/foo', 4],
		);

		// delete a segment
		map.set('/user/foo/bar', 1);
		map.set('/user/foo', 2);
		map.set('/user/foo/flip/flop', 3);
		map.set('/usr/foo', 4);
		map.deleteSuperstr('/user/foo');
		assertTstDfs(map,
			['/user/foo', 2],
			['/usr/foo', 4],
		);
	});

	test('TernarySearchTree (URI) - basics', function () {
		const trie = new TernarySearchTree<URI, number>(new UriIterator(() => false, () => false));

		trie.set(URI.file('/user/foo/bar'), 1);
		trie.set(URI.file('/user/foo'), 2);
		trie.set(URI.file('/user/foo/flip/flop'), 3);

		assert.strictEqual(trie.get(URI.file('/user/foo/bar')), 1);
		assert.strictEqual(trie.get(URI.file('/user/foo')), 2);
		assert.strictEqual(trie.get(URI.file('/user/foo/flip/flop')), 3);

		assert.strictEqual(trie.findSubstr(URI.file('/user/bar')), undefined);
		assert.strictEqual(trie.findSubstr(URI.file('/user/foo')), 2);
		assert.strictEqual(trie.findSubstr(URI.file('/user/foo/ba')), 2);
		assert.strictEqual(trie.findSubstr(URI.file('/user/foo/far/boo')), 2);
		assert.strictEqual(trie.findSubstr(URI.file('/user/foo/bar')), 1);
		assert.strictEqual(trie.findSubstr(URI.file('/user/foo/bar/far/boo')), 1);
	});

	test('TernarySearchTree (URI) - query parameters', function () {
		const trie = new TernarySearchTree<URI, number>(new UriIterator(() => false, () => true));
		const root = URI.parse('memfs:/?param=1');
		trie.set(root, 1);

		assert.strictEqual(trie.get(URI.parse('memfs:/?param=1')), 1);

		assert.strictEqual(trie.findSubstr(URI.parse('memfs:/?param=1')), 1);
		assert.strictEqual(trie.findSubstr(URI.parse('memfs:/aaa?param=1')), 1);
	});

	test('TernarySearchTree (URI) - lookup', function () {

		const map = new TernarySearchTree<URI, number>(new UriIterator(() => false, () => false));
		map.set(URI.parse('http://foo.bar/user/foo/bar'), 1);
		map.set(URI.parse('http://foo.bar/user/foo?query'), 2);
		map.set(URI.parse('http://foo.bar/user/foo?QUERY'), 3);
		map.set(URI.parse('http://foo.bar/user/foo/flip/flop'), 3);

		assert.strictEqual(map.get(URI.parse('http://foo.bar/foo')), undefined);
		assert.strictEqual(map.get(URI.parse('http://foo.bar/user')), undefined);
		assert.strictEqual(map.get(URI.parse('http://foo.bar/user/foo/bar')), 1);
		assert.strictEqual(map.get(URI.parse('http://foo.bar/user/foo?query')), 2);
		assert.strictEqual(map.get(URI.parse('http://foo.bar/user/foo?Query')), undefined);
		assert.strictEqual(map.get(URI.parse('http://foo.bar/user/foo?QUERY')), 3);
		assert.strictEqual(map.get(URI.parse('http://foo.bar/user/foo/bar/boo')), undefined);
	});

	test('TernarySearchTree (URI) - lookup, casing', function () {

		const map = new TernarySearchTree<URI, number>(new UriIterator(uri => /^https?$/.test(uri.scheme), () => false));
		map.set(URI.parse('http://foo.bar/user/foo/bar'), 1);
		assert.strictEqual(map.get(URI.parse('http://foo.bar/USER/foo/bar')), 1);

		map.set(URI.parse('foo://foo.bar/user/foo/bar'), 1);
		assert.strictEqual(map.get(URI.parse('foo://foo.bar/USER/foo/bar')), undefined);
	});

	test('TernarySearchTree (URI) - superstr', function () {

		const map = new TernarySearchTree<URI, number>(new UriIterator(() => false, () => false));
		map.set(URI.file('/user/foo/bar'), 1);
		map.set(URI.file('/user/foo'), 2);
		map.set(URI.file('/user/foo/flip/flop'), 3);
		map.set(URI.file('/usr/foo'), 4);

		let item: IteratorResult<[URI, number]>;
		let iter = map.findSuperstr(URI.file('/user'))!;

		item = iter.next();
		assert.strictEqual(item.value[1], 2);
		assert.strictEqual(item.done, false);
		item = iter.next();
		assert.strictEqual(item.value[1], 1);
		assert.strictEqual(item.done, false);
		item = iter.next();
		assert.strictEqual(item.value[1], 3);
		assert.strictEqual(item.done, false);
		item = iter.next();
		assert.strictEqual(item.value, undefined);
		assert.strictEqual(item.done, true);

		iter = map.findSuperstr(URI.file('/usr'))!;
		item = iter.next();
		assert.strictEqual(item.value[1], 4);
		assert.strictEqual(item.done, false);

		item = iter.next();
		assert.strictEqual(item.value, undefined);
		assert.strictEqual(item.done, true);

		iter = map.findSuperstr(URI.file('/'))!;
		item = iter.next();
		assert.strictEqual(item.value[1], 2);
		assert.strictEqual(item.done, false);
		item = iter.next();
		assert.strictEqual(item.value[1], 1);
		assert.strictEqual(item.done, false);
		item = iter.next();
		assert.strictEqual(item.value[1], 3);
		assert.strictEqual(item.done, false);
		item = iter.next();
		assert.strictEqual(item.value[1], 4);
		assert.strictEqual(item.done, false);
		item = iter.next();
		assert.strictEqual(item.value, undefined);
		assert.strictEqual(item.done, true);

		assert.strictEqual(map.findSuperstr(URI.file('/not')), undefined);
		assert.strictEqual(map.findSuperstr(URI.file('/us')), undefined);
		assert.strictEqual(map.findSuperstr(URI.file('/usrr')), undefined);
		assert.strictEqual(map.findSuperstr(URI.file('/userr')), undefined);
	});

	test('TernarySearchTree (ConfigKeySegments) - basics', function () {
		const trie = new TernarySearchTree<string, number>(new ConfigKeysIterator());

		trie.set('config.foo.bar', 1);
		trie.set('config.foo', 2);
		trie.set('config.foo.flip.flop', 3);

		assert.strictEqual(trie.get('config.foo.bar'), 1);
		assert.strictEqual(trie.get('config.foo'), 2);
		assert.strictEqual(trie.get('config.foo.flip.flop'), 3);

		assert.strictEqual(trie.findSubstr('config.bar'), undefined);
		assert.strictEqual(trie.findSubstr('config.foo'), 2);
		assert.strictEqual(trie.findSubstr('config.foo.ba'), 2);
		assert.strictEqual(trie.findSubstr('config.foo.far.boo'), 2);
		assert.strictEqual(trie.findSubstr('config.foo.bar'), 1);
		assert.strictEqual(trie.findSubstr('config.foo.bar.far.boo'), 1);
	});

	test('TernarySearchTree (ConfigKeySegments) - lookup', function () {

		const map = new TernarySearchTree<string, number>(new ConfigKeysIterator());
		map.set('config.foo.bar', 1);
		map.set('config.foo', 2);
		map.set('config.foo.flip.flop', 3);

		assert.strictEqual(map.get('foo'), undefined);
		assert.strictEqual(map.get('config'), undefined);
		assert.strictEqual(map.get('config.foo'), 2);
		assert.strictEqual(map.get('config.foo.bar'), 1);
		assert.strictEqual(map.get('config.foo.bar.boo'), undefined);
	});

	test('TernarySearchTree (ConfigKeySegments) - superstr', function () {

		const map = new TernarySearchTree<string, number>(new ConfigKeysIterator());
		map.set('config.foo.bar', 1);
		map.set('config.foo', 2);
		map.set('config.foo.flip.flop', 3);
		map.set('boo', 4);

		let item: IteratorResult<[string, number]>;
		const iter = map.findSuperstr('config');

		item = iter!.next();
		assert.strictEqual(item.value[1], 2);
		assert.strictEqual(item.done, false);
		item = iter!.next();
		assert.strictEqual(item.value[1], 1);
		assert.strictEqual(item.done, false);
		item = iter!.next();
		assert.strictEqual(item.value[1], 3);
		assert.strictEqual(item.done, false);
		item = iter!.next();
		assert.strictEqual(item.value, undefined);
		assert.strictEqual(item.done, true);

		assert.strictEqual(map.findSuperstr('foo'), undefined);
		assert.strictEqual(map.findSuperstr('config.foo.no'), undefined);
		assert.strictEqual(map.findSuperstr('config.foop'), undefined);
	});


	test('TernarySearchTree (ConfigKeySegments) - delete_superstr', function () {

		const map = new TernarySearchTree<string, number>(new ConfigKeysIterator());
		map.set('config.foo.bar', 1);
		map.set('config.foo', 2);
		map.set('config.foo.flip.flop', 3);
		map.set('boo', 4);

		assertTstDfs(map,
			['boo', 4],
			['config.foo', 2],
			['config.foo.bar', 1],
			['config.foo.flip.flop', 3],
		);

		// not a segment
		map.deleteSuperstr('config.fo');
		assertTstDfs(map,
			['boo', 4],
			['config.foo', 2],
			['config.foo.bar', 1],
			['config.foo.flip.flop', 3],
		);

		// delete a segment
		map.set('config.foo.bar', 1);
		map.set('config.foo', 2);
		map.set('config.foo.flip.flop', 3);
		map.set('config.boo', 4);
		map.deleteSuperstr('config.foo');
		assertTstDfs(map,
			['boo', 4],
			['config.foo', 2],
		);
	});

	test('TST, fill', function () {
		const tst = TernarySearchTree.forStrings();

		const keys = ['foo', 'bar', 'bang', 'bazz'];
		Object.freeze(keys);
		tst.fill(true, keys);

		for (const key of keys) {
			assert.ok(tst.get(key), key);
		}
	});
});


suite.skip('TST, perf', function () {

	function createRandomUris(n: number): URI[] {
		const uris: URI[] = [];
		function randomWord(): string {
			let result = '';
			const length = 4 + Math.floor(Math.random() * 4);
			for (let i = 0; i < length; i++) {
				result += (Math.random() * 26 + 65).toString(36);
			}
			return result;
		}

		// generate 10000 random words
		const words: string[] = [];
		for (let i = 0; i < 10000; i++) {
			words.push(randomWord());
		}

		for (let i = 0; i < n; i++) {

			let len = 4 + Math.floor(Math.random() * 4);

			const segments: string[] = [];
			for (; len >= 0; len--) {
				segments.push(words[Math.floor(Math.random() * words.length)]);
			}

			uris.push(URI.from({ scheme: 'file', path: segments.join('/') }));
		}

		return uris;
	}

	let tree: TernarySearchTree<URI, boolean>;
	let sampleUris: URI[] = [];
	let candidates: URI[] = [];

	suiteSetup(() => {
		const len = 50_000;
		sampleUris = createRandomUris(len);
		candidates = [...sampleUris.slice(0, len / 2), ...createRandomUris(len / 2)];
		shuffle(candidates);
	});

	setup(() => {
		tree = TernarySearchTree.forUris();
		for (const uri of sampleUris) {
			tree.set(uri, true);
		}
	});

	const _profile = false;

	function perfTest(name: string, callback: Function) {
		test(name, function () {
			if (_profile) { console.profile(name); }
			const sw = new StopWatch(true);
			callback();
			console.log(name, sw.elapsed());
			if (_profile) { console.profileEnd(); }
		});
	}

	perfTest('TST, clear', function () {
		tree.clear();
	});

	perfTest('TST, insert', function () {
		const insertTree = TernarySearchTree.forUris();
		for (const uri of sampleUris) {
			insertTree.set(uri, true);
		}
	});

	perfTest('TST, lookup', function () {
		let match = 0;
		for (const candidate of candidates) {
			if (tree.has(candidate)) {
				match += 1;
			}
		}
		assert.strictEqual(match, sampleUris.length / 2);
	});

	perfTest('TST, substr', function () {
		let match = 0;
		for (const candidate of candidates) {
			if (tree.findSubstr(candidate)) {
				match += 1;
			}
		}
		assert.strictEqual(match, sampleUris.length / 2);
	});

	perfTest('TST, superstr', function () {
		for (const candidate of candidates) {
			tree.findSuperstr(candidate);
		}
	});
});
