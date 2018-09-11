/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TreeModel, ITreeNode } from 'vs/base/browser/ui/tree/treeModel';
import { ISpliceable } from 'vs/base/common/sequence';
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

suite('TreeModel2', function () {

	test('ctor', function () {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(toSpliceable(list));
		assert(model);
		assert.equal(list.length, 0);
	});

	test('insert', function () {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, Iterator.iterate([
			{ element: 0 },
			{ element: 1 },
			{ element: 2 }
		]));

		assert.deepEqual(list.length, 3);
		assert.deepEqual(list[0].element, 0);
		assert.deepEqual(list[0].collapsed, false);
		assert.deepEqual(list[0].depth, 1);
		assert.deepEqual(list[1].element, 1);
		assert.deepEqual(list[1].collapsed, false);
		assert.deepEqual(list[1].depth, 1);
		assert.deepEqual(list[2].element, 2);
		assert.deepEqual(list[2].collapsed, false);
		assert.deepEqual(list[2].depth, 1);
	});

	test('deep insert', function () {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, Iterator.iterate([
			{
				element: 0, children: Iterator.iterate([
					{ element: 10 },
					{ element: 11 },
					{ element: 12 },
				])
			},
			{ element: 1 },
			{ element: 2 }
		]));

		assert.deepEqual(list.length, 6);
		assert.deepEqual(list[0].element, 0);
		assert.deepEqual(list[0].collapsed, false);
		assert.deepEqual(list[0].depth, 1);
		assert.deepEqual(list[1].element, 10);
		assert.deepEqual(list[1].collapsed, false);
		assert.deepEqual(list[1].depth, 2);
		assert.deepEqual(list[2].element, 11);
		assert.deepEqual(list[2].collapsed, false);
		assert.deepEqual(list[2].depth, 2);
		assert.deepEqual(list[3].element, 12);
		assert.deepEqual(list[3].collapsed, false);
		assert.deepEqual(list[3].depth, 2);
		assert.deepEqual(list[4].element, 1);
		assert.deepEqual(list[4].collapsed, false);
		assert.deepEqual(list[4].depth, 1);
		assert.deepEqual(list[5].element, 2);
		assert.deepEqual(list[5].collapsed, false);
		assert.deepEqual(list[5].depth, 1);
	});

	test('deep insert collapsed', function () {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, Iterator.iterate([
			{
				element: 0, collapsed: true, children: Iterator.iterate([
					{ element: 10 },
					{ element: 11 },
					{ element: 12 },
				])
			},
			{ element: 1 },
			{ element: 2 }
		]));

		assert.deepEqual(list.length, 3);
		assert.deepEqual(list[0].element, 0);
		assert.deepEqual(list[0].collapsed, true);
		assert.deepEqual(list[0].depth, 1);
		assert.deepEqual(list[1].element, 1);
		assert.deepEqual(list[1].collapsed, false);
		assert.deepEqual(list[1].depth, 1);
		assert.deepEqual(list[2].element, 2);
		assert.deepEqual(list[2].collapsed, false);
		assert.deepEqual(list[2].depth, 1);
	});

	test('delete', function () {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, Iterator.iterate([
			{ element: 0 },
			{ element: 1 },
			{ element: 2 }
		]));

		assert.deepEqual(list.length, 3);

		model.splice([1], 1);
		assert.deepEqual(list.length, 2);
		assert.deepEqual(list[0].element, 0);
		assert.deepEqual(list[0].collapsed, false);
		assert.deepEqual(list[0].depth, 1);
		assert.deepEqual(list[1].element, 2);
		assert.deepEqual(list[1].collapsed, false);
		assert.deepEqual(list[1].depth, 1);

		model.splice([0], 2);
		assert.deepEqual(list.length, 0);
	});

	test('nested delete', function () {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, Iterator.iterate([
			{
				element: 0, children: Iterator.iterate([
					{ element: 10 },
					{ element: 11 },
					{ element: 12 },
				])
			},
			{ element: 1 },
			{ element: 2 }
		]));

		assert.deepEqual(list.length, 6);

		model.splice([1], 2);
		assert.deepEqual(list.length, 4);
		assert.deepEqual(list[0].element, 0);
		assert.deepEqual(list[0].collapsed, false);
		assert.deepEqual(list[0].depth, 1);
		assert.deepEqual(list[1].element, 10);
		assert.deepEqual(list[1].collapsed, false);
		assert.deepEqual(list[1].depth, 2);
		assert.deepEqual(list[2].element, 11);
		assert.deepEqual(list[2].collapsed, false);
		assert.deepEqual(list[2].depth, 2);
		assert.deepEqual(list[3].element, 12);
		assert.deepEqual(list[3].collapsed, false);
		assert.deepEqual(list[3].depth, 2);
	});

	test('deep delete', function () {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, Iterator.iterate([
			{
				element: 0, children: Iterator.iterate([
					{ element: 10 },
					{ element: 11 },
					{ element: 12 },
				])
			},
			{ element: 1 },
			{ element: 2 }
		]));

		assert.deepEqual(list.length, 6);

		model.splice([0], 1);
		assert.deepEqual(list.length, 2);
		assert.deepEqual(list[0].element, 1);
		assert.deepEqual(list[0].collapsed, false);
		assert.deepEqual(list[0].depth, 1);
		assert.deepEqual(list[1].element, 2);
		assert.deepEqual(list[1].collapsed, false);
		assert.deepEqual(list[1].depth, 1);
	});

	test('hidden delete', function () {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, Iterator.iterate([
			{
				element: 0, collapsed: true, children: Iterator.iterate([
					{ element: 10 },
					{ element: 11 },
					{ element: 12 },
				])
			},
			{ element: 1 },
			{ element: 2 }
		]));

		assert.deepEqual(list.length, 3);

		model.splice([0, 1], 1);
		assert.deepEqual(list.length, 3);

		model.splice([0, 0], 2);
		assert.deepEqual(list.length, 3);
	});

	test('collapse', function () {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, Iterator.iterate([
			{
				element: 0, children: Iterator.iterate([
					{ element: 10 },
					{ element: 11 },
					{ element: 12 },
				])
			},
			{ element: 1 },
			{ element: 2 }
		]));

		assert.deepEqual(list.length, 6);

		model.setCollapsed([0], true);
		assert.deepEqual(list.length, 3);
		assert.deepEqual(list[0].element, 0);
		assert.deepEqual(list[0].collapsed, true);
		assert.deepEqual(list[0].depth, 1);
		assert.deepEqual(list[1].element, 1);
		assert.deepEqual(list[1].collapsed, false);
		assert.deepEqual(list[1].depth, 1);
		assert.deepEqual(list[2].element, 2);
		assert.deepEqual(list[2].collapsed, false);
		assert.deepEqual(list[2].depth, 1);
	});

	// test('expand', function () {
	// 	const list = [] as ITreeNode<number>[];
	// 	const model = new TreeModel<number>(toSpliceable(list));

	// 	model.splice([0], 0, Iterator.iterate([
	// 		{
	// 			element: 0, collapsed: true, children: Iterator.iterate([
	// 				{ element: 10 },
	// 				{ element: 11 },
	// 				{ element: 12 },
	// 			])
	// 		},
	// 		{ element: 1 },
	// 		{ element: 2 }
	// 	]));

	// 	assert.deepEqual(list.length, 3);

	// 	model.setCollapsed([0], false);
	// 	assert.deepEqual(list.length, 6);
	// 	assert.deepEqual(list[0].element, 0);
	// 	assert.deepEqual(list[0].collapsed, false);
	// 	assert.deepEqual(list[0].depth, 1);
	// 	assert.deepEqual(list[1].element, 10);
	// 	assert.deepEqual(list[1].collapsed, false);
	// 	assert.deepEqual(list[1].depth, 2);
	// 	assert.deepEqual(list[2].element, 11);
	// 	assert.deepEqual(list[2].collapsed, false);
	// 	assert.deepEqual(list[2].depth, 2);
	// 	assert.deepEqual(list[3].element, 12);
	// 	assert.deepEqual(list[3].collapsed, false);
	// 	assert.deepEqual(list[3].depth, 2);
	// 	assert.deepEqual(list[4].element, 1);
	// 	assert.deepEqual(list[4].collapsed, false);
	// 	assert.deepEqual(list[4].depth, 1);
	// 	assert.deepEqual(list[5].element, 2);
	// 	assert.deepEqual(list[5].collapsed, false);
	// 	assert.deepEqual(list[5].depth, 1);
	// });

	test('collapse should recursively adjust visible count', function () {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, Iterator.iterate([
			{
				element: 1, children: [
					{
						element: 11, children: [
							{ element: 111 }
						]
					}
				]
			},
			{
				element: 2, children: [
					{ element: 21 }
				]
			}
		]));

		assert.deepEqual(list.length, 5);
		assert.deepEqual(toArray(list), [1, 11, 111, 2, 21]);

		model.setCollapsed([0, 0], true);
		assert.deepEqual(list.length, 4);
		assert.deepEqual(toArray(list), [1, 11, 2, 21]);

		model.setCollapsed([1], true);
		assert.deepEqual(list.length, 3);
		assert.deepEqual(toArray(list), [1, 11, 2]);
	});
});