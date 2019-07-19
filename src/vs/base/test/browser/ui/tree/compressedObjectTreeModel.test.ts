/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ITreeNode, ITreeElement } from 'vs/base/browser/ui/tree/tree';
import { ISpliceable } from 'vs/base/common/sequence';
import { CompressedObjectTreeModel, compress, ICompressedTreeElement } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
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


interface IResolvedTreeElement<T> extends ITreeElement<T> {
	readonly element: T;
	readonly children?: ITreeElement<T>[];
}

function resolve<T>(treeElement: ITreeElement<T>): IResolvedTreeElement<T> {
	const element = treeElement.element;
	const children = Iterator.collect(Iterator.map(Iterator.from(treeElement.children), resolve));

	if (children.length === 0) {
		return { element };
	}

	return { element, children };
}

suite('CompressedObjectTreeModel', function () {

	test('ctor', function () {
		const list: ITreeNode<string[]>[] = [];
		const model = new CompressedObjectTreeModel<string>(toSpliceable(list));

		assert(model);
		assert.deepEqual(toArray(list), []);
	});

	suite('compress', function () {

		test('small', function () {
			const actual: ICompressedTreeElement<number> = { element: 1 };
			const expected: IResolvedTreeElement<number[]> = { element: [1] };
			assert.deepEqual(resolve(compress(actual)), expected);
		});

		test('no compression', function () {
			const actual: ICompressedTreeElement<number> = {
				element: 1, children: [
					{ element: 11 },
					{ element: 12 },
					{ element: 13 },
				]
			};

			const expected: IResolvedTreeElement<number[]> = {
				element: [1], children: [
					{ element: [11] },
					{ element: [12] },
					{ element: [13] },
				]
			};

			assert.deepEqual(resolve(compress(actual)), expected);
		});

		test('single hierarchy', function () {
			const actual: ICompressedTreeElement<number> = {
				element: 1, children: [
					{
						element: 11, children: [
							{
								element: 111, children: [
									{ element: 1111 }
								]
							}
						]
					},
				]
			};

			const expected: IResolvedTreeElement<number[]> = {
				element: [1, 11, 111, 1111]
			};

			assert.deepEqual(resolve(compress(actual)), expected);
		});

		test('deep compression', function () {
			const actual: ICompressedTreeElement<number> = {
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
			};

			const expected: IResolvedTreeElement<number[]> = {
				element: [1, 11, 111], children: [
					{ element: [1111] },
					{ element: [1112] },
					{ element: [1113] },
					{ element: [1114] },
				]
			};

			assert.deepEqual(resolve(compress(actual)), expected);
		});

		test('double deep compression', function () {
			const actual: ICompressedTreeElement<number> = {
				element: 1, children: [
					{
						element: 11, children: [
							{
								element: 111, children: [
									{ element: 1112 },
									{ element: 1113 },
								]
							},
						]
					},
					{
						element: 12, children: [
							{
								element: 121, children: [
									{ element: 1212 },
									{ element: 1213 },
								]
							},
						]
					}
				]
			};

			const expected: IResolvedTreeElement<number[]> = {
				element: [1], children: [
					{
						element: [11, 111], children: [
							{ element: [1112] },
							{ element: [1113] },
						]
					},
					{
						element: [12, 121], children: [
							{ element: [1212] },
							{ element: [1213] },
						]
					}
				]
			};

			assert.deepEqual(resolve(compress(actual)), expected);
		});

		test('incompressible leaf', function () {
			const actual: ICompressedTreeElement<number> = {
				element: 1, children: [
					{
						element: 11, children: [
							{
								element: 111, children: [
									{ element: 1111, incompressible: true }
								]
							}
						]
					},
				]
			};

			const expected: IResolvedTreeElement<number[]> = {
				element: [1, 11, 111], children: [
					{ element: [1111] }
				]
			};

			assert.deepEqual(resolve(compress(actual)), expected);
		});

		test('incompressible branch', function () {
			const actual: ICompressedTreeElement<number> = {
				element: 1, children: [
					{
						element: 11, children: [
							{
								element: 111, incompressible: true, children: [
									{ element: 1111 }
								]
							}
						]
					},
				]
			};

			const expected: IResolvedTreeElement<number[]> = {
				element: [1, 11], children: [
					{ element: [111, 1111] }
				]
			};

			assert.deepEqual(resolve(compress(actual)), expected);
		});

		test('incompressible chain', function () {
			const actual: ICompressedTreeElement<number> = {
				element: 1, children: [
					{
						element: 11, children: [
							{
								element: 111, incompressible: true, children: [
									{ element: 1111, incompressible: true }
								]
							}
						]
					},
				]
			};

			const expected: IResolvedTreeElement<number[]> = {
				element: [1, 11], children: [
					{
						element: [111], children: [
							{ element: [1111] }
						]
					}
				]
			};

			assert.deepEqual(resolve(compress(actual)), expected);
		});

		test('incompressible tree', function () {
			const actual: ICompressedTreeElement<number> = {
				element: 1, children: [
					{
						element: 11, incompressible: true, children: [
							{
								element: 111, incompressible: true, children: [
									{ element: 1111, incompressible: true }
								]
							}
						]
					},
				]
			};

			const expected: IResolvedTreeElement<number[]> = {
				element: [1], children: [
					{
						element: [11], children: [
							{
								element: [111], children: [
									{ element: [1111] }
								]
							}
						]
					}
				]
			};

			assert.deepEqual(resolve(compress(actual)), expected);
		});
	});
});