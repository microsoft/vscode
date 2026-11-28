/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IResourceNode, ResourceTree } from '../../common/resourceTree.js';
import { URI } from '../../common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('ResourceTree', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('ctor', function () {
		const tree = new ResourceTree<string, null>(null);
		assert.strictEqual(tree.root.childrenCount, 0);
	});

	test('simple', function () {
		const tree = new ResourceTree<string, null>(null);

		tree.add(URI.file('/foo/bar.txt'), 'bar contents');
		assert.strictEqual(tree.root.childrenCount, 1);

		const foo = tree.root.get('foo')!;
		assert(foo);
		assert.strictEqual(foo.childrenCount, 1);

		const bar = foo.get('bar.txt')!;
		assert(bar);
		assert.strictEqual(bar.element, 'bar contents');

		tree.add(URI.file('/hello.txt'), 'hello contents');
		assert.strictEqual(tree.root.childrenCount, 2);

		let hello = tree.root.get('hello.txt')!;
		assert(hello);
		assert.strictEqual(hello.element, 'hello contents');

		tree.delete(URI.file('/foo/bar.txt'));
		assert.strictEqual(tree.root.childrenCount, 1);
		hello = tree.root.get('hello.txt')!;
		assert(hello);
		assert.strictEqual(hello.element, 'hello contents');
	});

	test('folders with data', function () {
		const tree = new ResourceTree<string, null>(null);

		assert.strictEqual(tree.root.childrenCount, 0);

		tree.add(URI.file('/foo'), 'foo');
		assert.strictEqual(tree.root.childrenCount, 1);
		assert.strictEqual(tree.root.get('foo')!.element, 'foo');

		tree.add(URI.file('/bar'), 'bar');
		assert.strictEqual(tree.root.childrenCount, 2);
		assert.strictEqual(tree.root.get('bar')!.element, 'bar');

		tree.add(URI.file('/foo/file.txt'), 'file');
		assert.strictEqual(tree.root.childrenCount, 2);
		assert.strictEqual(tree.root.get('foo')!.element, 'foo');
		assert.strictEqual(tree.root.get('bar')!.element, 'bar');
		assert.strictEqual(tree.root.get('foo')!.get('file.txt')!.element, 'file');

		tree.delete(URI.file('/foo'));
		assert.strictEqual(tree.root.childrenCount, 1);
		assert(!tree.root.get('foo'));
		assert.strictEqual(tree.root.get('bar')!.element, 'bar');

		tree.delete(URI.file('/bar'));
		assert.strictEqual(tree.root.childrenCount, 0);
		assert(!tree.root.get('foo'));
		assert(!tree.root.get('bar'));
	});

	test('deleting a child does not remove a folder that has its own element', function () {
		const tree = new ResourceTree<string, null>(null);

		tree.add(URI.file('/a/foo'), 'foo');
		tree.add(URI.file('/a/foo/x/file.txt'), 'file');
		tree.add(URI.file('/b/bar.txt'), 'bar');

		const deleted = [tree.delete(URI.file('/a/foo/x/file.txt')), tree.delete(URI.file('/b/bar.txt'))];

		// Empty folders without an element of their own are still pruned, up to the first folder that has one.
		assert.deepStrictEqual({ deleted, nodes: describeNodes(tree.root), collected: ResourceTree.collect(tree.root) }, {
			deleted: ['file', 'bar'],
			nodes: ['/a', '/a/foo: foo'],
			collected: ['foo'],
		});
	});
});

function describeNodes(node: IResourceNode<string, null>): string[] {
	return [...node.children].flatMap(child => [
		typeof child.element === 'undefined' ? child.relativePath : `${child.relativePath}: ${child.element}`,
		...describeNodes(child),
	]);
}
