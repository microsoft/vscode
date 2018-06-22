/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TreeModel, ITreeListElement, CollapsibleTreeModel, ICollapsibleTreeListElement } from 'vs/base/browser/ui/list/treeModel';
import { ISpliceable } from 'vs/base/browser/ui/list/splice';
import { iter } from 'vs/base/common/iterator';

function toSpliceable<T>(arr: T[]): ISpliceable<T> {
	return {
		splice(start: number, deleteCount: number, elements: T[]): void {
			arr.splice(start, deleteCount, ...elements);
		}
	};
}

suite('TreeModel2', () => {

	test('ctor', () => {
		const list = [] as ITreeListElement<number>[];
		const model = new TreeModel<number>(toSpliceable(list));
		assert(model);
		assert.equal(list.length, 0);
	});

	test('insert', () => {
		const list = [] as ITreeListElement<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, iter([
			{ element: 0, children: iter([]) },
			{ element: 1, children: iter([]) },
			{ element: 2, children: iter([]) }
		]));

		assert.deepEqual(list.length, 3);
		assert.deepEqual(list[0].element, 0);
		assert.deepEqual(list[0].depth, 1);
		assert.deepEqual(list[1].element, 1);
		assert.deepEqual(list[1].depth, 1);
		assert.deepEqual(list[2].element, 2);
		assert.deepEqual(list[2].depth, 1);
	});

	test('deep insert', () => {
		const list = [] as ITreeListElement<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, iter([
			{
				element: 0, children: iter([
					{ element: 10, children: iter([]) },
					{ element: 11, children: iter([]) },
					{ element: 12, children: iter([]) },
				])
			},
			{ element: 1, children: iter([]) },
			{ element: 2, children: iter([]) }
		]));

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
		const list = [] as ITreeListElement<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, iter([
			{ element: 0, children: iter([]) },
			{ element: 1, children: iter([]) },
			{ element: 2, children: iter([]) }
		]));

		model.splice([0], 3, iter([]));

		assert.equal(list.length, 0);
	});

	test('nested delete', () => {
		const list = [] as ITreeListElement<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, iter([
			{
				element: 0, children: iter([
					{ element: 10, children: iter([]) },
					{ element: 11, children: iter([]) },
					{ element: 12, children: iter([]) },
				])
			},
			{ element: 1, children: iter([]) },
			{ element: 2, children: iter([]) }
		]));

		model.splice([0, 1], 1, iter([]));

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
		const list = [] as ITreeListElement<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, iter([
			{
				element: 0, children: iter([
					{ element: 10, children: iter([]) },
					{ element: 11, children: iter([]) },
					{ element: 12, children: iter([]) },
				])
			},
			{ element: 1, children: iter([]) },
			{ element: 2, children: iter([]) }
		]));

		model.splice([0], 1, iter([]));

		assert.deepEqual(list.length, 2, 'list has 2 elements only');
		assert.deepEqual(list[0].element, 1);
		assert.deepEqual(list[0].depth, 1);
		assert.deepEqual(list[1].element, 2);
		assert.deepEqual(list[1].depth, 1);
	});
});

suite('CollapsibleTreeModel', () => {

	test('ctor', () => {
		const list = [] as ICollapsibleTreeListElement<number>[];
		const model = new CollapsibleTreeModel<number>(toSpliceable(list));
		assert(model);
		assert.equal(list.length, 0);
	});

	test('insert', () => {
		const list = [] as ICollapsibleTreeListElement<number>[];
		const model = new CollapsibleTreeModel<number>(toSpliceable(list));

		model.splice([0], 0, iter([
			{ element: { element: 0, collapsed: false }, children: iter([]) },
			{ element: { element: 1, collapsed: false }, children: iter([]) },
			{ element: { element: 2, collapsed: false }, children: iter([]) }
		]));

		assert.deepEqual(list.length, 3);
		assert.deepEqual(list[0].element.element, 0);
		assert.deepEqual(list[0].depth, 1);
		assert.deepEqual(list[1].element.element, 1);
		assert.deepEqual(list[1].depth, 1);
		assert.deepEqual(list[2].element.element, 2);
		assert.deepEqual(list[2].depth, 1);
	});

	test('deep insert', () => {
		const list = [] as ICollapsibleTreeListElement<number>[];
		const model = new CollapsibleTreeModel<number>(toSpliceable(list));

		model.splice([0], 0, iter([
			{
				element: { element: 0, collapsed: false }, children: iter([
					{ element: { element: 10, collapsed: false }, children: iter([]) },
					{ element: { element: 11, collapsed: false }, children: iter([]) },
					{ element: { element: 12, collapsed: false }, children: iter([]) },
				])
			},
			{ element: { element: 1, collapsed: false }, children: iter([]) },
			{ element: { element: 2, collapsed: false }, children: iter([]) }
		]));

		assert.deepEqual(list.length, 6);
		assert.deepEqual(list[0].element.element, 0);
		assert.deepEqual(list[0].depth, 1);
		assert.deepEqual(list[1].element.element, 10);
		assert.deepEqual(list[1].depth, 2);
		assert.deepEqual(list[2].element.element, 11);
		assert.deepEqual(list[2].depth, 2);
		assert.deepEqual(list[3].element.element, 12);
		assert.deepEqual(list[3].depth, 2);
		assert.deepEqual(list[4].element.element, 1);
		assert.deepEqual(list[4].depth, 1);
		assert.deepEqual(list[5].element.element, 2);
		assert.deepEqual(list[5].depth, 1);
	});
});