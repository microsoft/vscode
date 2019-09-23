/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ResourceTree, IBranchNode, ILeafNode } from 'vs/base/common/resourceTree';
import { URI } from 'vs/base/common/uri';

suite('ResourceTree', function () {
	test('ctor', function () {
		const tree = new ResourceTree<string, null>(null);
		assert(ResourceTree.isBranchNode(tree.root));
		assert.equal(tree.root.size, 0);
	});

	test('simple', function () {
		const tree = new ResourceTree<string, null>(null);

		tree.add(URI.file('/foo/bar.txt'), 'bar contents');
		assert(ResourceTree.isBranchNode(tree.root));
		assert.equal(tree.root.size, 1);

		let foo = tree.root.get('foo') as IBranchNode<string, null>;
		assert(foo);
		assert(ResourceTree.isBranchNode(foo));
		assert.equal(foo.size, 1);

		let bar = foo.get('bar.txt') as ILeafNode<string, null>;
		assert(bar);
		assert(!ResourceTree.isBranchNode(bar));
		assert.equal(bar.element, 'bar contents');

		tree.add(URI.file('/hello.txt'), 'hello contents');
		assert.equal(tree.root.size, 2);

		let hello = tree.root.get('hello.txt') as ILeafNode<string, null>;
		assert(hello);
		assert(!ResourceTree.isBranchNode(hello));
		assert.equal(hello.element, 'hello contents');

		tree.delete(URI.file('/foo/bar.txt'));
		assert.equal(tree.root.size, 1);
		hello = tree.root.get('hello.txt') as ILeafNode<string, null>;
		assert(hello);
		assert(!ResourceTree.isBranchNode(hello));
		assert.equal(hello.element, 'hello contents');
	});
});
