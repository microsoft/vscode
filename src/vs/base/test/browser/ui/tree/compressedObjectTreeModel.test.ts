/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { ISpliceable } from 'vs/base/common/sequence';
import { CompressedObjectTreeModel } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
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

suite('CompressedObjectTreeModel', function () {

	test('ctor', () => {
		const list: ITreeNode<string[]>[] = [];
		const model = new CompressedObjectTreeModel<string>(toSpliceable(list));

		assert.deepEqual(toArray(list), []);
		assert.equal(model.size, 0);
	});

	test('no compression', () => {
		const list: ITreeNode<string[]>[] = [];
		const model = new CompressedObjectTreeModel<string>(toSpliceable(list));

		model.setChildren(null, [
			{ element: 'a' },
			{ element: 'b' },
			{ element: 'c' }
		]);

		assert.deepEqual(toArray(list), [['a'], ['b'], ['c']]);
		assert.equal(model.size, 3);

		model.setChildren(null, Iterator.empty());
		assert.deepEqual(toArray(list), []);
		assert.equal(model.size, 0);
	});

	test('simple compression', () => {
		const list: ITreeNode<string[]>[] = [];
		const model = new CompressedObjectTreeModel<string>(toSpliceable(list));

		model.setChildren(null, [
			{
				element: 'foo', children: [
					{
						element: 'bar', children: [
							{ element: 'hello' }
						]
					}
				]
			},
			{ element: 'b' },
			{ element: 'c' }
		]);

		assert.deepEqual(toArray(list), [['foo', 'bar', 'hello'], ['b'], ['c']]);
		assert.equal(model.size, 3);

		model.setChildren(null, Iterator.empty());
		assert.deepEqual(toArray(list), []);
		assert.equal(model.size, 0);
	});
});