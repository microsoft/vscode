/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Tree } from 'vs/base/common/tree';

suite('Base Tree', () => {

	test('ctor', () => {
		const tree = new Tree<number>();
		assert(tree);

		const nodes = tree.getNodes();
		assert.equal(nodes.length, 0);
	});

	test('insert', () => {
		const tree = new Tree<number>();

		tree.splice([0], 0, [
			{ element: 0, children: [] },
			{ element: 1, children: [] },
			{ element: 2, children: [] }
		]);

		const nodes = tree.getNodes();
		assert.deepEqual(nodes.length, 3);
		assert.deepEqual(nodes[0].element, 0);
		assert.deepEqual(nodes[1].element, 1);
		assert.deepEqual(nodes[2].element, 2);
	});

	test('deep insert', () => {
		const tree = new Tree<number>();

		tree.splice([0], 0, [
			{
				element: 0, children: [
					{ element: 10, children: [] },
					{ element: 11, children: [] },
					{ element: 12, children: [] },
				]
			},
			{ element: 1, children: [] },
			{ element: 2, children: [] }
		]);

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

		tree.splice([0], 0, [
			{ element: 0, children: [] },
			{ element: 1, children: [] },
			{ element: 2, children: [] }
		]);

		tree.splice([0], 3, []);

		const nodes = tree.getNodes();
		assert.equal(nodes.length, 0);
	});

	test('nested delete', () => {
		const tree = new Tree<number>();

		tree.splice([0], 0, [
			{
				element: 0, children: [
					{ element: 10, children: [] },
					{ element: 11, children: [] },
					{ element: 12, children: [] },
				]
			},
			{ element: 1, children: [] },
			{ element: 2, children: [] }
		]);

		tree.splice([0, 1], 1, []);

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

		tree.splice([0], 0, [
			{
				element: 0, children: [
					{ element: 10, children: [] },
					{ element: 11, children: [] },
					{ element: 12, children: [] },
				]
			},
			{ element: 1, children: [] },
			{ element: 2, children: [] }
		]);

		tree.splice([0], 1, []);

		const nodes = tree.getNodes();
		assert.deepEqual(nodes.length, 2);
		assert.deepEqual(nodes[0].element, 1);
		assert.deepEqual(nodes[1].element, 2);
	});
});
