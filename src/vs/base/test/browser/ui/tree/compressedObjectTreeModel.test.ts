/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ITreeNode, ITreeElement } from 'vs/base/browser/ui/tree/tree';
import { ISpliceable } from 'vs/base/common/sequence';
import { CompressedObjectTreeModel, compress } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
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

interface Node<T> {
	element: T;
	children?: Node<T>[];
}

type Node2<T> = [T, Node2<T>[]];

// function asTreeElement(node: Node): ITreeElement<Node> {
// 	if (Array.isArray(node)) {
// 		return { element: node, children: Iterator.map(Iterator.from(node), asTreeElement) };
// 	} else {
// 		return { element: node };
// 	}
// }

suite('CompressedObjectTreeModel', function () {

	test('ctor', () => {
		const list: ITreeNode<string[]>[] = [];
		const model = new CompressedObjectTreeModel<string>(toSpliceable(list));

		assert(model);
		assert.deepEqual(toArray(list), []);
	});

	test('compress', () => {
		const actual: Node<number>[] = [
			{
				element: 1, children: [
					{
						element: 11, children: [
							{
								element: 111, children: [
									{ element: 1111 },
									{ element: 1112 },
									{ element: 1113 },
									{ element: 1114 },
								]
							}
						]
					},
				]
			}
		];

		const expected: Node<number[]>[] = [
			{
				element: [1, 11, 111], children: [
					{ element: [1111] },
					{ element: [1112] },
					{ element: [1113] },
					{ element: [1114] },
				]
			}
		];

		const element = asTreeElement(root);
		const iterator = Iterator.from([element]);

		const result = Iterator.collect(compress(iterator));
	});
});