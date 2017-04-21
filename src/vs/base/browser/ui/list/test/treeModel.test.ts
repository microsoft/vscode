/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TreeModel, ITreeNode } from '../treeModel';

suite('TreeModel2', () => {

	test('ctor', () => {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(list);
		assert(model);
		assert.equal(list.length, 0);
	});

	test('insert', () => {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(list);

		model.splice([0], 0, [
			{ element: 0, children: [] },
			{ element: 1, children: [] },
			{ element: 2, children: [] }
		]);

		assert.deepEqual(list.length, 3);
		assert.deepEqual(list[0].element, 0);
		assert.deepEqual(list[0].children, []);
		assert.deepEqual(list[0].depth, 1);
		assert.deepEqual(list[1].element, 1);
		assert.deepEqual(list[1].children, []);
		assert.deepEqual(list[1].depth, 1);
		assert.deepEqual(list[2].element, 2);
		assert.deepEqual(list[2].children, []);
		assert.deepEqual(list[2].depth, 1);
	});

	test('delete', () => {
		const list = [] as ITreeNode<number>[];
		const model = new TreeModel<number>(list);

		model.splice([0], 0, [
			{ element: 0, children: [] },
			{ element: 1, children: [] },
			{ element: 2, children: [] }
		]);

		model.splice([0], 3, []);

		assert.equal(list.length, 0);
	});
});