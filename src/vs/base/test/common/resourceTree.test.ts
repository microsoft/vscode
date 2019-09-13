/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ResourceTree, IBranchNode, ILeafNode, isBranchNode } from 'vs/base/common/resourceTree';

suite('ResourceTree', function () {
	test('ctor', function () {
		const tree = new ResourceTree<string>();
		assert(isBranchNode(tree.root));
		assert.equal(tree.root.size, 0);
	});

	test('simple', function () {
		const tree = new ResourceTree<string>();

		tree.add('/foo/bar.txt', 'bar contents');
		assert(isBranchNode(tree.root));
		assert.equal(tree.root.size, 1);

		let foo = tree.root.get('foo') as IBranchNode<string>;
		assert(foo);
		assert(isBranchNode(foo));
		assert.equal(foo.size, 1);

		let bar = foo.get('bar.txt') as ILeafNode<string>;
		assert(bar);
		assert(!isBranchNode(bar));
		assert.equal(bar.element, 'bar contents');

		tree.add('/hello.txt', 'hello contents');
		assert.equal(tree.root.size, 2);

		let hello = tree.root.get('hello.txt') as ILeafNode<string>;
		assert(hello);
		assert(!isBranchNode(hello));
		assert.equal(hello.element, 'hello contents');

		tree.delete('/foo/bar.txt');
		assert.equal(tree.root.size, 1);
		hello = tree.root.get('hello.txt') as ILeafNode<string>;
		assert(hello);
		assert(!isBranchNode(hello));
		assert.equal(hello.element, 'hello contents');
	});
});
