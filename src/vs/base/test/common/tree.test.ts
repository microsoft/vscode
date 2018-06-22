/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Tree } from 'vs/base/common/tree';
import { iter } from 'vs/base/common/iterator';

suite('Base Tree', () => {

	test('ctor', () => {
		const tree = new Tree<number>();
		assert(tree);

		const nodes = tree.getNodes();
		assert.equal(nodes.length, 0);
	});

	test('insert', () => {
		const tree = new Tree<number>();

		tree.splice([0], 0, iter([
			{ element: 0, children: iter([]) },
			{ element: 1, children: iter([]) },
			{ element: 2, children: iter([]) }
		]));

		const nodes = tree.getNodes();
		assert.deepEqual(nodes.length, 3);
		assert.deepEqual(nodes[0].element, 0);
		assert.deepEqual(nodes[1].element, 1);
		assert.deepEqual(nodes[2].element, 2);
	});

	test('deep insert', () => {
		const tree = new Tree<number>();

		tree.splice([0], 0, iter([
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

		const nodes = tree.getNodes();
		assert.deepEqual(nodes.length, 3);
		assert.deepEqual(nodes[0].element, 0);
		assert.deepEqual(nodes[0].children.length, 3);
		assert.deepEqual(nodes[0].children[0].element, 10);
		assert.deepEqual(nodes[0].children[1].element, 11);
		assert.deepEqual(nodes[0].children[2].element, 12);
		assert.deepEqual(nodes[1].element, 1);
		assert.deepEqual(nodes[2].element, 2);
	});

	test('delete', () => {
		const tree = new Tree<number>();

		tree.splice([0], 0, iter([
			{ element: 0, children: iter([]) },
			{ element: 1, children: iter([]) },
			{ element: 2, children: iter([]) }
		]));

		tree.splice([0], 3, iter([]));

		const nodes = tree.getNodes();
		assert.equal(nodes.length, 0);
	});

	test('nested delete', () => {
		const tree = new Tree<number>();

		tree.splice([0], 0, iter([
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

		tree.splice([0, 1], 1, iter([]));

		const nodes = tree.getNodes();
		assert.deepEqual(nodes.length, 3);
		assert.deepEqual(nodes[0].element, 0);
		assert.deepEqual(nodes[0].children.length, 2);
		assert.deepEqual(nodes[0].children[0].element, 10);
		assert.deepEqual(nodes[0].children[1].element, 12);
		assert.deepEqual(nodes[1].element, 1);
		assert.deepEqual(nodes[2].element, 2);
	});

	test('deep delete', () => {
		const tree = new Tree<number>();

		tree.splice([0], 0, iter([
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

		tree.splice([0], 1, iter([]));

		const nodes = tree.getNodes();
		assert.deepEqual(nodes.length, 2);
		assert.deepEqual(nodes[0].element, 1);
		assert.deepEqual(nodes[1].element, 2);
	});
});
