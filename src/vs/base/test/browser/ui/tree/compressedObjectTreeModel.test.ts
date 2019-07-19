/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { compress, ICompressedTreeElement, ICompressedTreeNode, decompress } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { Iterator } from 'vs/base/common/iterator';

interface IResolvedCompressedTreeElement<T> extends ICompressedTreeElement<T> {
	readonly element: T;
	readonly children?: ICompressedTreeElement<T>[];
}

function resolve<T>(treeElement: ICompressedTreeElement<T>): IResolvedCompressedTreeElement<T> {
	const result: any = { element: treeElement.element };
	const children = Iterator.collect(Iterator.map(Iterator.from(treeElement.children), resolve));

	if (treeElement.incompressible) {
		result.incompressible = true;
	}

	if (children.length > 0) {
		result.children = children;
	}

	return result;
}

suite('CompressedObjectTreeModel', function () {

	suite('compress', function () {

		test('small', function () {
			const decompressed: ICompressedTreeElement<number> = { element: 1 };
			const compressed: IResolvedCompressedTreeElement<ICompressedTreeNode<number>> =
				{ element: { elements: [1], incompressible: false } };

			assert.deepEqual(resolve(compress(decompressed)), compressed);
			assert.deepEqual(resolve(decompress(compressed)), decompressed);
		});

		test('no compression', function () {
			const decompressed: ICompressedTreeElement<number> = {
				element: 1, children: [
					{ element: 11 },
					{ element: 12 },
					{ element: 13 }
				]
			};

			const compressed: IResolvedCompressedTreeElement<ICompressedTreeNode<number>> = {
				element: { elements: [1], incompressible: false },
				children: [
					{ element: { elements: [11], incompressible: false } },
					{ element: { elements: [12], incompressible: false } },
					{ element: { elements: [13], incompressible: false } }
				]
			};

			assert.deepEqual(resolve(compress(decompressed)), compressed);
			assert.deepEqual(resolve(decompress(compressed)), decompressed);
		});

		test('single hierarchy', function () {
			const decompressed: ICompressedTreeElement<number> = {
				element: 1, children: [
					{
						element: 11, children: [
							{
								element: 111, children: [
									{ element: 1111 }
								]
							}
						]
					}
				]
			};

			const compressed: IResolvedCompressedTreeElement<ICompressedTreeNode<number>> = {
				element: { elements: [1, 11, 111, 1111], incompressible: false }
			};

			assert.deepEqual(resolve(compress(decompressed)), compressed);
			assert.deepEqual(resolve(decompress(compressed)), decompressed);
		});

		test('deep compression', function () {
			const decompressed: ICompressedTreeElement<number> = {
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
					}
				]
			};

			const compressed: IResolvedCompressedTreeElement<ICompressedTreeNode<number>> = {
				element: { elements: [1, 11, 111], incompressible: false },
				children: [
					{ element: { elements: [1111], incompressible: false } },
					{ element: { elements: [1112], incompressible: false } },
					{ element: { elements: [1113], incompressible: false } },
					{ element: { elements: [1114], incompressible: false } },
				]
			};

			assert.deepEqual(resolve(compress(decompressed)), compressed);
			assert.deepEqual(resolve(decompress(compressed)), decompressed);
		});

		test('double deep compression', function () {
			const decompressed: ICompressedTreeElement<number> = {
				element: 1, children: [
					{
						element: 11, children: [
							{
								element: 111, children: [
									{ element: 1112 },
									{ element: 1113 },
								]
							}
						]
					},
					{
						element: 12, children: [
							{
								element: 121, children: [
									{ element: 1212 },
									{ element: 1213 },
								]
							}
						]
					}
				]
			};

			const compressed: IResolvedCompressedTreeElement<ICompressedTreeNode<number>> = {
				element: { elements: [1], incompressible: false },
				children: [
					{
						element: { elements: [11, 111], incompressible: false },
						children: [
							{ element: { elements: [1112], incompressible: false } },
							{ element: { elements: [1113], incompressible: false } },
						]
					},
					{
						element: { elements: [12, 121], incompressible: false },
						children: [
							{ element: { elements: [1212], incompressible: false } },
							{ element: { elements: [1213], incompressible: false } },
						]
					}
				]
			};

			assert.deepEqual(resolve(compress(decompressed)), compressed);
			assert.deepEqual(resolve(decompress(compressed)), decompressed);
		});

		test('incompressible leaf', function () {
			const decompressed: ICompressedTreeElement<number> = {
				element: 1, children: [
					{
						element: 11, children: [
							{
								element: 111, children: [
									{ element: 1111, incompressible: true }
								]
							}
						]
					}
				]
			};

			const compressed: IResolvedCompressedTreeElement<ICompressedTreeNode<number>> = {
				element: { elements: [1, 11, 111], incompressible: false },
				children: [
					{ element: { elements: [1111], incompressible: true } }
				]
			};

			assert.deepEqual(resolve(compress(decompressed)), compressed);
			assert.deepEqual(resolve(decompress(compressed)), decompressed);
		});

		test('incompressible branch', function () {
			const decompressed: ICompressedTreeElement<number> = {
				element: 1, children: [
					{
						element: 11, children: [
							{
								element: 111, incompressible: true, children: [
									{ element: 1111 }
								]
							}
						]
					}
				]
			};

			const compressed: IResolvedCompressedTreeElement<ICompressedTreeNode<number>> = {
				element: { elements: [1, 11], incompressible: false },
				children: [
					{ element: { elements: [111, 1111], incompressible: true } }
				]
			};

			assert.deepEqual(resolve(compress(decompressed)), compressed);
			assert.deepEqual(resolve(decompress(compressed)), decompressed);
		});

		test('incompressible chain', function () {
			const decompressed: ICompressedTreeElement<number> = {
				element: 1, children: [
					{
						element: 11, children: [
							{
								element: 111, incompressible: true, children: [
									{ element: 1111, incompressible: true }
								]
							}
						]
					}
				]
			};

			const compressed: IResolvedCompressedTreeElement<ICompressedTreeNode<number>> = {
				element: { elements: [1, 11], incompressible: false },
				children: [
					{
						element: { elements: [111], incompressible: true },
						children: [
							{ element: { elements: [1111], incompressible: true } }
						]
					}
				]
			};

			assert.deepEqual(resolve(compress(decompressed)), compressed);
			assert.deepEqual(resolve(decompress(compressed)), decompressed);
		});

		test('incompressible tree', function () {
			const decompressed: ICompressedTreeElement<number> = {
				element: 1, children: [
					{
						element: 11, incompressible: true, children: [
							{
								element: 111, incompressible: true, children: [
									{ element: 1111, incompressible: true }
								]
							}
						]
					}
				]
			};

			const compressed: IResolvedCompressedTreeElement<ICompressedTreeNode<number>> = {
				element: { elements: [1], incompressible: false },
				children: [
					{
						element: { elements: [11], incompressible: true },
						children: [
							{
								element: { elements: [111], incompressible: true },
								children: [
									{ element: { elements: [1111], incompressible: true } }
								]
							}
						]
					}
				]
			};

			assert.deepEqual(resolve(compress(decompressed)), compressed);
			assert.deepEqual(resolve(decompress(compressed)), decompressed);
		});
	});
});