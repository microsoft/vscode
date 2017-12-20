/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TreeModel, ITreeNode, Trie } from 'vs/base/browser/ui/list/treeModel';
import { ISpliceable } from 'vs/base/browser/ui/list/splice';

function toSpliceable<T>(arr: T[]): ISpliceable<T> {
	return {
		splice(start: number, deleteCount: number, elements: T[]): void {
			arr.splice(start, deleteCount, ...elements);
		}
	};
}

suite('TreeModel2', () => {

	test('ctor', () => {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(toSpliceable(list));
		assert(model);
		assert.equal(list.length, 0);
	});

	test('insert', () => {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, [
			{ element: 0, children: [] },
			{ element: 1, children: [] },
			{ element: 2, children: [] }
		]);

		assert.deepEqual(list.length, 3);
		assert.deepEqual(list[0].element, 0);
		assert.deepEqual(list[0].depth, 1);
		assert.deepEqual(list[1].element, 1);
		assert.deepEqual(list[1].depth, 1);
		assert.deepEqual(list[2].element, 2);
		assert.deepEqual(list[2].depth, 1);
	});

	test('deep insert', () => {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, [
			{
				element: 0, children: [
					{ element: 10, children: [] },
					{ element: 11, children: [] },
					{ element: 12, children: [] },
				]
			},
			{ element: 1, children: [] },
			{ element: 2, children: [] }
		]);

		assert.deepEqual(list.length, 6);
		assert.deepEqual(list[0].element, 0);
		assert.deepEqual(list[0].depth, 1);
		assert.deepEqual(list[1].element, 10);
		assert.deepEqual(list[1].depth, 2);
		assert.deepEqual(list[2].element, 11);
		assert.deepEqual(list[2].depth, 2);
		assert.deepEqual(list[3].element, 12);
		assert.deepEqual(list[3].depth, 2);
		assert.deepEqual(list[4].element, 1);
		assert.deepEqual(list[4].depth, 1);
		assert.deepEqual(list[5].element, 2);
		assert.deepEqual(list[5].depth, 1);
	});

	test('delete', () => {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, [
			{ element: 0, children: [] },
			{ element: 1, children: [] },
			{ element: 2, children: [] }
		]);

		model.splice([0], 3, []);

		assert.equal(list.length, 0);
	});

	test('nested delete', () => {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, [
			{
				element: 0, children: [
					{ element: 10, children: [] },
					{ element: 11, children: [] },
					{ element: 12, children: [] },
				]
			},
			{ element: 1, children: [] },
			{ element: 2, children: [] }
		]);

		model.splice([0, 1], 1, []);

		assert.deepEqual(list.length, 5, 'list has 5 elements');
		assert.deepEqual(list[0].element, 0);
		assert.deepEqual(list[0].depth, 1);
		assert.deepEqual(list[1].element, 10);
		assert.deepEqual(list[1].depth, 2);
		assert.deepEqual(list[2].element, 12);
		assert.deepEqual(list[2].depth, 2);
		assert.deepEqual(list[3].element, 1);
		assert.deepEqual(list[3].depth, 1);
		assert.deepEqual(list[4].element, 2);
		assert.deepEqual(list[4].depth, 1);
	});

	test('deep delete', () => {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, [
			{
				element: 0, children: [
					{ element: 10, children: [] },
					{ element: 11, children: [] },
					{ element: 12, children: [] },
				]
			},
			{ element: 1, children: [] },
			{ element: 2, children: [] }
		]);

		model.splice([0], 1, []);

		assert.deepEqual(list.length, 2, 'list has 2 elements only');
		assert.deepEqual(list[0].element, 1);
		assert.deepEqual(list[0].depth, 1);
		assert.deepEqual(list[1].element, 2);
		assert.deepEqual(list[1].depth, 1);
	});
});

suite('Trie', function () {

	test('simple test', () => {
		const trie = new Trie<string>();

		trie.set(['0', '0', '0'], 'hello');
		assert.equal(trie.get(['0']), undefined);
		assert.equal(trie.get(['0', '0']), undefined);
		assert.equal(trie.get(['0', '0', '0']), 'hello');
		assert.equal(trie.get(['1', '0', '0']), undefined);
		assert.equal(trie.get(['0', '1', '0']), undefined);
		assert.equal(trie.get(['0', '0', '1']), undefined);
		assert.equal(trie.get(['0', '0', '0', '0']), undefined);
	});

	test('clear', () => {
		const trie = new Trie<string>();

		trie.set(['0', '0', '0'], 'hello');
		assert.equal(trie.get(['0', '0', '0']), 'hello');

		trie.clear();
		assert.equal(trie.get(['0', '0', '0']), undefined);
	});

	test('delete', () => {
		const trie = new Trie<string>();

		trie.set(['1', '2', '3'], 'hello');
		assert.equal(trie.get(['1', '2', '3']), 'hello');

		trie.delete(['1', '2', '3']);
		assert.equal(trie.get(['1', '2', '3']), undefined);
	});

	test('nested delete', () => {
		const trie = new Trie<string>();

		trie.set(['1', '2', '3'], 'hello');
		assert.equal(trie.get(['1', '2', '3']), 'hello');

		trie.delete(['1']);
		assert.equal(trie.get(['1', '2', '3']), undefined);
	});

	test('map tests', () => {
		const trie = new Trie<string>();

		trie.set(['0', '0', '0'], 'hello');
		assert.equal(trie.get(['0', '0', '0']), 'hello');

		trie.set(['0', '0'], 'world');
		assert.equal(trie.get(['0', '0']), 'world');

		trie.set(['0', '0', '1'], 'cool');
		assert.equal(trie.get(['0', '0', '1']), 'cool');
	});
});