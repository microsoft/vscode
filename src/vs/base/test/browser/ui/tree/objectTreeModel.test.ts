/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { ISpliceable } from 'vs/base/common/sequence';
import { ObjectTreeModel } from 'vs/base/browser/ui/tree/objectTreeModel';
import { Iterator } from 'vs/base/common/iterator';

function toSpliceable<T>(arr: T[]): ISpliceable<T> {
	return {
		splice(start: number, deleteCount: number, elements: T[]): void {
			arr.splice(start, deleteCount, ...elements);
		}
	};
}

function toArray<T>(list: ITreeNode<T>[]): T[] {
	return list.map(i => i.element);
}

suite('ObjectTreeModel', function () {

	test('ctor', () => {
		const list: ITreeNode<number>[] = [];
		const model = new ObjectTreeModel<number>(toSpliceable(list));
		assert(model);
		assert.equal(list.length, 0);
		assert.equal(model.size, 0);
	});

	test('flat', () => {
		const list: ITreeNode<number>[] = [];
		const model = new ObjectTreeModel<number>(toSpliceable(list));

		model.setChildren(null, Iterator.fromArray([
			{ element: 0 },
			{ element: 1 },
			{ element: 2 }
		]));

		assert.deepEqual(toArray(list), [0, 1, 2]);
		assert.equal(model.size, 3);

		model.setChildren(null, Iterator.fromArray([
			{ element: 3 },
			{ element: 4 },
			{ element: 5 },
		]));

		assert.deepEqual(toArray(list), [3, 4, 5]);
		assert.equal(model.size, 3);

		model.setChildren(null, Iterator.empty());
		assert.deepEqual(toArray(list), []);
		assert.equal(model.size, 0);
	});

	test('nested', () => {
		const list: ITreeNode<number>[] = [];
		const model = new ObjectTreeModel<number>(toSpliceable(list));

		model.setChildren(null, Iterator.fromArray([
			{
				element: 0, children: Iterator.fromArray([
					{ element: 10 },
					{ element: 11 },
					{ element: 12 },
				])
			},
			{ element: 1 },
			{ element: 2 }
		]));

		assert.deepEqual(toArray(list), [0, 10, 11, 12, 1, 2]);
		assert.equal(model.size, 6);

		model.setChildren(12, Iterator.fromArray([
			{ element: 120 },
			{ element: 121 }
		]));

		assert.deepEqual(toArray(list), [0, 10, 11, 12, 120, 121, 1, 2]);
		assert.equal(model.size, 8);

		model.setChildren(0, Iterator.empty());
		assert.deepEqual(toArray(list), [0, 1, 2]);
		assert.equal(model.size, 3);

		model.setChildren(null, Iterator.empty());
		assert.deepEqual(toArray(list), []);
		assert.equal(model.size, 0);
	});

	test('setChildren on collapsed node', () => {
		const list: ITreeNode<number>[] = [];
		const model = new ObjectTreeModel<number>(toSpliceable(list));

		model.setChildren(null, Iterator.fromArray([
			{ element: 0, collapsed: true }
		]));

		assert.deepEqual(toArray(list), [0]);

		model.setChildren(0, Iterator.fromArray([
			{ element: 1 },
			{ element: 2 }
		]));

		assert.deepEqual(toArray(list), [0]);

		model.setCollapsed(0, false);
		assert.deepEqual(toArray(list), [0, 1, 2]);
	});

	test('setChildren on expanded, unrevealed node', () => {
		const list: ITreeNode<number>[] = [];
		const model = new ObjectTreeModel<number>(toSpliceable(list));

		model.setChildren(null, [
			{
				element: 1, collapsed: true, children: [
					{ element: 11, collapsed: false }
				]
			},
			{ element: 2 }
		]);

		assert.deepEqual(toArray(list), [1, 2]);

		model.setChildren(11, [
			{ element: 111 },
			{ element: 112 }
		]);

		assert.deepEqual(toArray(list), [1, 2]);

		model.setCollapsed(1, false);
		assert.deepEqual(toArray(list), [1, 11, 111, 112, 2]);
	});

	test('collapse state is preserved with strict identity', () => {
		const list: ITreeNode<string>[] = [];
		const model = new ObjectTreeModel<string>(toSpliceable(list), { collapseByDefault: true });
		const data = [{ element: 'father', children: [{ element: 'child' }] }];

		model.setChildren(null, data);
		assert.deepEqual(toArray(list), ['father']);

		model.setCollapsed('father', false);
		assert.deepEqual(toArray(list), ['father', 'child']);

		model.setChildren(null, data);
		assert.deepEqual(toArray(list), ['father', 'child']);

		const data2 = [{ element: 'father', children: [{ element: 'child' }] }, { element: 'uncle' }];
		model.setChildren(null, data2);
		assert.deepEqual(toArray(list), ['father', 'child', 'uncle']);

		model.setChildren(null, [{ element: 'uncle' }]);
		assert.deepEqual(toArray(list), ['uncle']);

		model.setChildren(null, data2);
		assert.deepEqual(toArray(list), ['father', 'uncle']);

		model.setChildren(null, data);
		assert.deepEqual(toArray(list), ['father']);
	});
});