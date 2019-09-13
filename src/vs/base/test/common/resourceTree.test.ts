/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ResourceTree, NodeType, BranchNode, LeafNode } from 'vs/base/common/resourceTree';
import { URI } from 'vs/base/common/uri';

suite('ResourceTree', function () {
	test('ctor', function () {
		const tree = new ResourceTree<string>();
		assert.equal(tree.root.type, NodeType.Branch);
		assert.equal(tree.root.children.size, 0);
	});

	test('simple', function () {
		const tree = new ResourceTree<string>();

		tree.add(URI.file('/foo/bar.txt'), 'bar contents');
		assert.equal(tree.root.type, NodeType.Branch);
		assert.equal(tree.root.children.size, 1);

		let foo = tree.root.children.get('foo') as BranchNode<string>;
		assert(foo);
		assert.equal(foo.type, NodeType.Branch);
		assert.equal(foo.children.size, 1);

		let bar = foo.children.get('bar.txt') as LeafNode<string>;
		assert(bar);
		assert.equal(bar.type, NodeType.Leaf);
		assert.equal(bar.element, 'bar contents');

		tree.add(URI.file('/hello.txt'), 'hello contents');
		assert.equal(tree.root.children.size, 2);

		let hello = tree.root.children.get('hello.txt') as LeafNode<string>;
		assert(hello);
		assert.equal(hello.type, NodeType.Leaf);
		assert.equal(hello.element, 'hello contents');

		tree.delete(URI.file('/foo/bar.txt'));
		assert.equal(tree.root.children.size, 1);
		hello = tree.root.children.get('hello.txt') as LeafNode<string>;
		assert(hello);
		assert.equal(hello.type, NodeType.Leaf);
		assert.equal(hello.element, 'hello contents');
	});
});
