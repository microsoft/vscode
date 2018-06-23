/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ITreeListElement, TreeModel } from 'vs/base/browser/ui/tree/treeModel';
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
			{ element: 0, collapsed: false, children: iter([]) },
			{ element: 1, collapsed: false, children: iter([]) },
			{ element: 2, collapsed: false, children: iter([]) }
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

	test('deep insert', () => {
		const list = [] as ITreeListElement<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, iter([
			{
				element: 0, collapsed: false, children: iter([
					{ element: 10, collapsed: false, children: iter([]) },
					{ element: 11, collapsed: false, children: iter([]) },
					{ element: 12, collapsed: false, children: iter([]) },
				])
			},
			{ element: 1, collapsed: false, children: iter([]) },
			{ element: 2, collapsed: false, children: iter([]) }
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

	test('deep insert collapsed', () => {
		const list = [] as ITreeListElement<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, iter([
			{
				element: 0, collapsed: true, children: iter([
					{ element: 10, collapsed: false, children: iter([]) },
					{ element: 11, collapsed: false, children: iter([]) },
					{ element: 12, collapsed: false, children: iter([]) },
				])
			},
			{ element: 1, collapsed: false, children: iter([]) },
			{ element: 2, collapsed: false, children: iter([]) }
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

	test('delete', () => {
		const list = [] as ITreeListElement<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, iter([
			{ element: 0, collapsed: false, children: iter([]) },
			{ element: 1, collapsed: false, children: iter([]) },
			{ element: 2, collapsed: false, children: iter([]) }
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

	test('nested delete', () => {
		const list = [] as ITreeListElement<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, iter([
			{
				element: 0, collapsed: false, children: iter([
					{ element: 10, collapsed: false, children: iter([]) },
					{ element: 11, collapsed: false, children: iter([]) },
					{ element: 12, collapsed: false, children: iter([]) },
				])
			},
			{ element: 1, collapsed: false, children: iter([]) },
			{ element: 2, collapsed: false, children: iter([]) }
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

	test('deep delete', () => {
		const list = [] as ITreeListElement<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, iter([
			{
				element: 0, collapsed: false, children: iter([
					{ element: 10, collapsed: false, children: iter([]) },
					{ element: 11, collapsed: false, children: iter([]) },
					{ element: 12, collapsed: false, children: iter([]) },
				])
			},
			{ element: 1, collapsed: false, children: iter([]) },
			{ element: 2, collapsed: false, children: iter([]) }
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

	test('hidden delete', () => {
		const list = [] as ITreeListElement<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, iter([
			{
				element: 0, collapsed: true, children: iter([
					{ element: 10, collapsed: false, children: iter([]) },
					{ element: 11, collapsed: false, children: iter([]) },
					{ element: 12, collapsed: false, children: iter([]) },
				])
			},
			{ element: 1, collapsed: false, children: iter([]) },
			{ element: 2, collapsed: false, children: iter([]) }
		]));

		assert.deepEqual(list.length, 3);

		model.splice([0, 1], 1);
		assert.deepEqual(list.length, 3);

		model.splice([0, 0], 2);
		assert.deepEqual(list.length, 3);
	});

	test('collapse', () => {
		const list = [] as ITreeListElement<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, iter([
			{
				element: 0, collapsed: false, children: iter([
					{ element: 10, collapsed: false, children: iter([]) },
					{ element: 11, collapsed: false, children: iter([]) },
					{ element: 12, collapsed: false, children: iter([]) },
				])
			},
			{ element: 1, collapsed: false, children: iter([]) },
			{ element: 2, collapsed: false, children: iter([]) }
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

	test('expand', () => {
		const list = [] as ITreeListElement<number>[];
		const model = new TreeModel<number>(toSpliceable(list));

		model.splice([0], 0, iter([
			{
				element: 0, collapsed: true, children: iter([
					{ element: 10, collapsed: false, children: iter([]) },
					{ element: 11, collapsed: false, children: iter([]) },
					{ element: 12, collapsed: false, children: iter([]) },
				])
			},
			{ element: 1, collapsed: false, children: iter([]) },
			{ element: 2, collapsed: false, children: iter([]) }
		]));

		assert.deepEqual(list.length, 3);

		model.setCollapsed([0], false);
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
});