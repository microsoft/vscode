/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ITreeNode } from 'vs/base/browser/ui/tree/treeModel';
import { ISpliceable } from 'vs/base/common/sequence';
import { TreeObjectModel } from 'vs/base/browser/ui/tree/treeObjectModel';
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

suite('TreeObjectModel', function () {

	test('ctor', () => {
		const list = [] as ITreeNode<number>[];
		const model = new TreeObjectModel<number>(toSpliceable(list));
		assert(model);
		assert.equal(list.length, 0);
		assert.equal(model.size, 0);
	});

	test('flat', () => {
		const list = [] as ITreeNode<number>[];
		const model = new TreeObjectModel<number>(toSpliceable(list));

		model.splice(null, 0, 0, Iterator.fromArray([
			{ element: 0 },
			{ element: 1 },
			{ element: 2 }
		]));

		assert.deepEqual(toArray(list), [0, 1, 2]);
		assert.equal(model.size, 3);

		model.splice(null, 3, 0, Iterator.fromArray([
			{ element: 3 },
			{ element: 4 },
			{ element: 5 },
		]));

		assert.deepEqual(toArray(list), [0, 1, 2, 3, 4, 5]);
		assert.equal(model.size, 6);

		model.splice(null, 2, 2);
		assert.deepEqual(toArray(list), [0, 1, 4, 5]);
		assert.equal(model.size, 4);
	});

	test('nested', () => {
		const list = [] as ITreeNode<number>[];
		const model = new TreeObjectModel<number>(toSpliceable(list));

		model.splice(null, 0, 0, Iterator.fromArray([
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

		model.splice(12, 0, 0, Iterator.fromArray([
			{ element: 120 },
			{ element: 121 }
		]));

		assert.deepEqual(toArray(list), [0, 10, 11, 12, 120, 121, 1, 2]);
		assert.equal(model.size, 8);

		model.splice(0, 1, 1);
		assert.deepEqual(toArray(list), [0, 10, 12, 120, 121, 1, 2]);
		assert.equal(model.size, 7);

		model.splice(null, 0, 1);
		assert.deepEqual(toArray(list), [1, 2]);
		assert.equal(model.size, 2);

		model.splice(null, 0, 2);
		assert.deepEqual(toArray(list), []);
		assert.equal(model.size, 0);
	});
});