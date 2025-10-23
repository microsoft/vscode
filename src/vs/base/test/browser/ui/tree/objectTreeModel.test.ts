/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ObjectTreeModel } from '../../../../browser/ui/tree/objectTreeModel.js';
import { ITreeFilter, ITreeModel, ITreeNode, ObjectTreeElementCollapseState, TreeVisibility } from '../../../../browser/ui/tree/tree.js';
import { timeout } from '../../../../common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';
import { IDisposable } from '../../../../common/lifecycle.js';

function bindListToModel<T>(list: ITreeNode<T>[], model: ITreeModel<T, any, any>): IDisposable {
	return model.onDidSpliceRenderedNodes(({ start, deleteCount, elements }) => {
		list.splice(start, deleteCount, ...elements);
	});
}

function toArray<T>(list: ITreeNode<T>[]): T[] {
	return list.map(i => i.element);
}

suite('ObjectTreeModel', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('ctor', () => {
		const list: ITreeNode<number>[] = [];
		const model = new ObjectTreeModel<number>('test');
		const disposable = bindListToModel(list, model);

		assert(model);
		assert.strictEqual(list.length, 0);
		assert.strictEqual(model.size, 0);

		disposable.dispose();
	});

	test('flat', () => {
		const list: ITreeNode<number>[] = [];
		const model = new ObjectTreeModel<number>('test');
		const disposable = bindListToModel(list, model);

		model.setChildren(null, [
			{ element: 0 },
			{ element: 1 },
			{ element: 2 }
		]);

		assert.deepStrictEqual(toArray(list), [0, 1, 2]);
		assert.strictEqual(model.size, 3);

		model.setChildren(null, [
			{ element: 3 },
			{ element: 4 },
			{ element: 5 },
		]);

		assert.deepStrictEqual(toArray(list), [3, 4, 5]);
		assert.strictEqual(model.size, 3);

		model.setChildren(null);
		assert.deepStrictEqual(toArray(list), []);
		assert.strictEqual(model.size, 0);

		disposable.dispose();
	});

	test('nested', () => {
		const list: ITreeNode<number>[] = [];
		const model = new ObjectTreeModel<number>('test');
		const disposable = bindListToModel(list, model);

		model.setChildren(null, [
			{
				element: 0, children: [
					{ element: 10 },
					{ element: 11 },
					{ element: 12 },
				]
			},
			{ element: 1 },
			{ element: 2 }
		]);

		assert.deepStrictEqual(toArray(list), [0, 10, 11, 12, 1, 2]);
		assert.strictEqual(model.size, 6);

		model.setChildren(12, [
			{ element: 120 },
			{ element: 121 }
		]);

		assert.deepStrictEqual(toArray(list), [0, 10, 11, 12, 120, 121, 1, 2]);
		assert.strictEqual(model.size, 8);

		model.setChildren(0);
		assert.deepStrictEqual(toArray(list), [0, 1, 2]);
		assert.strictEqual(model.size, 3);

		model.setChildren(null);
		assert.deepStrictEqual(toArray(list), []);
		assert.strictEqual(model.size, 0);

		disposable.dispose();
	});

	test('setChildren on collapsed node', () => {
		const list: ITreeNode<number>[] = [];
		const model = new ObjectTreeModel<number>('test');
		const disposable = bindListToModel(list, model);

		model.setChildren(null, [
			{ element: 0, collapsed: true }
		]);

		assert.deepStrictEqual(toArray(list), [0]);

		model.setChildren(0, [
			{ element: 1 },
			{ element: 2 }
		]);

		assert.deepStrictEqual(toArray(list), [0]);

		model.setCollapsed(0, false);
		assert.deepStrictEqual(toArray(list), [0, 1, 2]);

		disposable.dispose();
	});

	test('setChildren on expanded, unrevealed node', () => {
		const list: ITreeNode<number>[] = [];
		const model = new ObjectTreeModel<number>('test');
		const disposable = bindListToModel(list, model);

		model.setChildren(null, [
			{
				element: 1, collapsed: true, children: [
					{ element: 11, collapsed: false }
				]
			},
			{ element: 2 }
		]);

		assert.deepStrictEqual(toArray(list), [1, 2]);

		model.setChildren(11, [
			{ element: 111 },
			{ element: 112 }
		]);

		assert.deepStrictEqual(toArray(list), [1, 2]);

		model.setCollapsed(1, false);
		assert.deepStrictEqual(toArray(list), [1, 11, 111, 112, 2]);

		disposable.dispose();
	});

	test('collapse state is preserved with strict identity', () => {
		const list: ITreeNode<string>[] = [];
		const model = new ObjectTreeModel<string>('test', { collapseByDefault: true });
		const data = [{ element: 'father', children: [{ element: 'child' }] }];
		const disposable = bindListToModel(list, model);

		model.setChildren(null, data);
		assert.deepStrictEqual(toArray(list), ['father']);

		model.setCollapsed('father', false);
		assert.deepStrictEqual(toArray(list), ['father', 'child']);

		model.setChildren(null, data);
		assert.deepStrictEqual(toArray(list), ['father', 'child']);

		const data2 = [{ element: 'father', children: [{ element: 'child' }] }, { element: 'uncle' }];
		model.setChildren(null, data2);
		assert.deepStrictEqual(toArray(list), ['father', 'child', 'uncle']);

		model.setChildren(null, [{ element: 'uncle' }]);
		assert.deepStrictEqual(toArray(list), ['uncle']);

		model.setChildren(null, data2);
		assert.deepStrictEqual(toArray(list), ['father', 'uncle']);

		model.setChildren(null, data);
		assert.deepStrictEqual(toArray(list), ['father']);

		disposable.dispose();
	});

	test('collapse state can be optionally preserved with strict identity', () => {
		const list: ITreeNode<string>[] = [];
		const model = new ObjectTreeModel<string>('test', { collapseByDefault: true });
		const data = [{ element: 'father', collapsed: ObjectTreeElementCollapseState.PreserveOrExpanded, children: [{ element: 'child' }] }];
		const disposable = bindListToModel(list, model);

		model.setChildren(null, data);
		assert.deepStrictEqual(toArray(list), ['father', 'child']);

		model.setCollapsed('father', true);
		assert.deepStrictEqual(toArray(list), ['father']);

		model.setChildren(null, data);
		assert.deepStrictEqual(toArray(list), ['father']);

		model.setCollapsed('father', false);
		assert.deepStrictEqual(toArray(list), ['father', 'child']);

		model.setChildren(null, data);
		assert.deepStrictEqual(toArray(list), ['father', 'child']);

		disposable.dispose();
	});

	test('sorter', () => {
		const compare: (a: string, b: string) => number = (a, b) => a < b ? -1 : 1;

		const list: ITreeNode<string>[] = [];
		const model = new ObjectTreeModel<string>('test', { sorter: { compare(a, b) { return compare(a, b); } } });
		const data = [
			{ element: 'cars', children: [{ element: 'sedan' }, { element: 'convertible' }, { element: 'compact' }] },
			{ element: 'airplanes', children: [{ element: 'passenger' }, { element: 'jet' }] },
			{ element: 'bicycles', children: [{ element: 'dutch' }, { element: 'mountain' }, { element: 'electric' }] },
		];
		const disposable = bindListToModel(list, model);

		model.setChildren(null, data);
		assert.deepStrictEqual(toArray(list), ['airplanes', 'jet', 'passenger', 'bicycles', 'dutch', 'electric', 'mountain', 'cars', 'compact', 'convertible', 'sedan']);

		disposable.dispose();
	});

	test('resort', () => {
		let compare: (a: string, b: string) => number = () => 0;

		const list: ITreeNode<string>[] = [];
		const model = new ObjectTreeModel<string>('test', { sorter: { compare(a, b) { return compare(a, b); } } });
		const data = [
			{ element: 'cars', children: [{ element: 'sedan' }, { element: 'convertible' }, { element: 'compact' }] },
			{ element: 'airplanes', children: [{ element: 'passenger' }, { element: 'jet' }] },
			{ element: 'bicycles', children: [{ element: 'dutch' }, { element: 'mountain' }, { element: 'electric' }] },
		];
		const disposable = bindListToModel(list, model);

		model.setChildren(null, data);
		assert.deepStrictEqual(toArray(list), ['cars', 'sedan', 'convertible', 'compact', 'airplanes', 'passenger', 'jet', 'bicycles', 'dutch', 'mountain', 'electric']);

		// lexicographical
		compare = (a, b) => a < b ? -1 : 1;

		// non-recursive
		model.resort(null, false);
		assert.deepStrictEqual(toArray(list), ['airplanes', 'passenger', 'jet', 'bicycles', 'dutch', 'mountain', 'electric', 'cars', 'sedan', 'convertible', 'compact']);

		// recursive
		model.resort();
		assert.deepStrictEqual(toArray(list), ['airplanes', 'jet', 'passenger', 'bicycles', 'dutch', 'electric', 'mountain', 'cars', 'compact', 'convertible', 'sedan']);

		// reverse
		compare = (a, b) => a < b ? 1 : -1;

		// scoped
		model.resort('cars');
		assert.deepStrictEqual(toArray(list), ['airplanes', 'jet', 'passenger', 'bicycles', 'dutch', 'electric', 'mountain', 'cars', 'sedan', 'convertible', 'compact']);

		// recursive
		model.resort();
		assert.deepStrictEqual(toArray(list), ['cars', 'sedan', 'convertible', 'compact', 'bicycles', 'mountain', 'electric', 'dutch', 'airplanes', 'passenger', 'jet']);

		disposable.dispose();
	});

	test('expandTo', () => {
		const list: ITreeNode<number>[] = [];
		const model = new ObjectTreeModel<number>('test', { collapseByDefault: true });
		const disposable = bindListToModel(list, model);

		model.setChildren(null, [
			{
				element: 0, children: [
					{ element: 10, children: [{ element: 100, children: [{ element: 1000 }] }] },
					{ element: 11 },
					{ element: 12 },
				]
			},
			{ element: 1 },
			{ element: 2 }
		]);

		assert.deepStrictEqual(toArray(list), [0, 1, 2]);
		model.expandTo(1000);
		assert.deepStrictEqual(toArray(list), [0, 10, 100, 1000, 11, 12, 1, 2]);

		disposable.dispose();
	});

	test('issue #95641', async () => {
		const list: ITreeNode<string>[] = [];
		let fn = (_: string) => true;
		const filter = new class implements ITreeFilter<string> {
			filter(element: string, parentVisibility: TreeVisibility): TreeVisibility {
				if (element === 'file') {
					return TreeVisibility.Recurse;
				}

				return fn(element) ? TreeVisibility.Visible : parentVisibility;
			}
		};
		const model = new ObjectTreeModel<string>('test', { filter });
		const disposable = bindListToModel(list, model);

		model.setChildren(null, [{ element: 'file', children: [{ element: 'hello' }] }]);
		assert.deepStrictEqual(toArray(list), ['file', 'hello']);

		fn = (el: string) => el === 'world';
		model.refilter();
		assert.deepStrictEqual(toArray(list), []);

		model.setChildren('file', [{ element: 'world' }]);
		await timeout(0); // wait for refilter microtask
		assert.deepStrictEqual(toArray(list), ['file', 'world']);

		model.setChildren('file', [{ element: 'hello' }]);
		await timeout(0); // wait for refilter microtask
		assert.deepStrictEqual(toArray(list), []);

		model.setChildren('file', [{ element: 'world' }]);
		await timeout(0); // wait for refilter microtask
		assert.deepStrictEqual(toArray(list), ['file', 'world']);

		disposable.dispose();
	});
});
