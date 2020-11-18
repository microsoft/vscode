/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter } from 'vs/base/common/event';
import { TestDiffOpType } from 'vs/workbench/contrib/testing/common/testCollection';
import { MirroredTestCollection, OwnedTestCollection } from 'vs/workbench/api/common/extHostTesting';
import { TestItem, TestProvider } from 'vscode';

suite('ExtHost Testing', () => {
	suite('OwnedTestCollection', () => {
		test('adds a root recursively', () => {
			const c = new TestOwnedCollection();
			const p = new StubProvider(stubNestedTests());
			c.addRoot(p.testRoot, 'pid');
			assert.deepStrictEqual(c.collectDiff(), [
				[TestDiffOpType.Add, { id: '0', providerId: 'pid', parent: null, item: stubTest('root') }],
				[TestDiffOpType.Add, { id: '1', providerId: 'pid', parent: '0', item: stubTest('a') }],
				[TestDiffOpType.Add, { id: '2', providerId: 'pid', parent: '1', item: stubTest('aa') }],
				[TestDiffOpType.Add, { id: '3', providerId: 'pid', parent: '1', item: stubTest('ab') }],
				[TestDiffOpType.Add, { id: '4', providerId: 'pid', parent: '0', item: stubTest('b') }],
			]);
		});

		test('no-ops if items not changed', () => {
			const c = new TestOwnedCollection();
			const p = new StubProvider(stubNestedTests());
			c.addRoot(p.testRoot, 'pid');
			c.collectDiff();
			assert.deepStrictEqual(c.collectDiff(), []);
		});

		test('removes root', () => {
			const c = new TestOwnedCollection();
			const p = new StubProvider(stubNestedTests());
			c.addRoot(p.testRoot, 'pid');
			c.collectDiff();
			c.removeRoot(p.testRoot);
			assert.deepStrictEqual(c.collectDiff(), [[TestDiffOpType.Remove, '0']]);
			assert.strictEqual(c.idToInternal.size, 0);
			assert.strictEqual(c.itemToInternal.size, 0);
		});

		test('watches property mutations', () => {
			const c = new TestOwnedCollection();
			const p = new StubProvider(stubNestedTests());
			c.addRoot(p.testRoot, 'pid');
			c.collectDiff();
			p.testRoot.children![0].description = 'Hello world'; /* item a */
			c.onItemChange(p.testRoot, 'pid');
			assert.deepStrictEqual(c.collectDiff(), [
				[TestDiffOpType.Update, { id: '1', parent: '0', providerId: 'pid', item: { ...stubTest('a'), description: 'Hello world' } }],
			]);

			c.onItemChange(p.testRoot, 'pid');
			assert.deepStrictEqual(c.collectDiff(), []);
		});

		test('removes children', () => {
			const c = new TestOwnedCollection();
			const p = new StubProvider(stubNestedTests());
			c.addRoot(p.testRoot, 'pid');
			c.collectDiff();
			p.testRoot.children!.splice(0, 1);
			c.onItemChange(p.testRoot, 'pid');

			assert.deepStrictEqual(c.collectDiff(), [
				[TestDiffOpType.Remove, '1'],
			]);
			assert.deepStrictEqual([...c.idToInternal.keys()].sort(), ['0', '4']);
			assert.strictEqual(c.itemToInternal.size, 2);
		});

		test('adds new children', () => {
			const c = new TestOwnedCollection();
			const p = new StubProvider(stubNestedTests());
			c.addRoot(p.testRoot, 'pid');
			c.collectDiff();
			const child = stubTest('ac');
			p.testRoot.children![0].children!.push(child);
			c.onItemChange(p.testRoot, 'pid');

			assert.deepStrictEqual(c.collectDiff(), [
				[TestDiffOpType.Add, { id: '5', providerId: 'pid', parent: '1', item: child }],
			]);
			assert.deepStrictEqual([...c.idToInternal.keys()].sort(), ['0', '1', '2', '3', '4', '5']);
			assert.strictEqual(c.itemToInternal.size, 6);
		});
	});

	suite('MirroredTestCollection', () => {
		test('mirrors creation of the root', () => {
			const m = new TestMirroredCollection();
			const c = new TestOwnedCollection();
			const p = new StubProvider(stubNestedTests());
			c.addRoot(p.testRoot, 'pid');
			m.apply(c.collectDiff());
			assertTreesEqual(m.rootTestItems[0], c.getTestById('0')!.actual);
			assert.strictEqual(m.length, c.itemToInternal.size);
		});

		test('mirrors node deletion', () => {
			const m = new TestMirroredCollection();
			const c = new TestOwnedCollection();
			const p = new StubProvider(stubNestedTests());
			c.addRoot(p.testRoot, 'pid');
			m.apply(c.collectDiff());
			p.testRoot.children!.splice(0, 1);
			c.onItemChange(p.testRoot, 'pid');
			m.apply(c.collectDiff());

			assertTreesEqual(m.rootTestItems[0], c.getTestById('0')!.actual);
			assert.strictEqual(m.length, c.itemToInternal.size);
		});

		test('mirrors node addition', () => {
			const m = new TestMirroredCollection();
			const c = new TestOwnedCollection();
			const p = new StubProvider(stubNestedTests());
			c.addRoot(p.testRoot, 'pid');
			m.apply(c.collectDiff());
			p.testRoot.children![0].children!.push(stubTest('ac'));
			c.onItemChange(p.testRoot, 'pid');
			m.apply(c.collectDiff());

			assertTreesEqual(m.rootTestItems[0], c.getTestById('0')!.actual);
			assert.strictEqual(m.length, c.itemToInternal.size);
		});

		test('mirrors node update', () => {
			const m = new TestMirroredCollection();
			const c = new TestOwnedCollection();
			const p = new StubProvider(stubNestedTests());
			c.addRoot(p.testRoot, 'pid');
			m.apply(c.collectDiff());
			p.testRoot.children![0].description = 'Hello world'; /* item a */
			c.onItemChange(p.testRoot, 'pid');
			m.apply(c.collectDiff());

			assertTreesEqual(m.rootTestItems[0], c.getTestById('0')!.actual);
		});

		test('mirrors root delete', () => {
			const m = new TestMirroredCollection();
			const c = new TestOwnedCollection();
			const p = new StubProvider(stubNestedTests());
			c.addRoot(p.testRoot, 'pid');
			m.apply(c.collectDiff());
			c.removeRoot(p.testRoot);
			m.apply(c.collectDiff());

			assert.strictEqual(m.rootTestItems.length, 0);
		});
	});
});

const stubTest = (label: string): TestItem => ({
	label,
	location: undefined,
	runState: undefined,
	debuggable: true,
	runnable: true,
	description: ''
} as any);

const assertTreesEqual = (a: TestItem, b: TestItem) => {
	assert.deepStrictEqual({ ...a, children: undefined }, { ...b, children: undefined });

	const aChildren = (a.children ?? []).sort();
	const bChildren = (b.children ?? []).sort();
	assert.strictEqual(aChildren.length, bChildren.length, `expected ${a.label}.children.length == ${b.label}.children.length`);
	aChildren.forEach((_, i) => assertTreesEqual(aChildren[i], bChildren[i]));
};

const stubNestedTests = () => ({
	...stubTest('root'),
	children: [
		{ ...stubTest('a'), children: [stubTest('aa'), stubTest('ab')] },
		stubTest('b'),
	]
});

class StubProvider implements TestProvider {
	public readonly changeEmitter = new Emitter<TestItem>();

	public readonly onDidChangeTest = this.changeEmitter.event;

	constructor(public readonly testRoot: TestItem) { }
}

class TestOwnedCollection extends OwnedTestCollection {
	private idCounter = 0;

	public get itemToInternal() {
		return this.testItemToInternal;
	}

	public get idToInternal() {
		return this.testIdToInternal;
	}

	public get currentDiff() {
		return this.diff;
	}

	protected getId() {
		return String(this.idCounter++);
	}
}

class TestMirroredCollection extends MirroredTestCollection {
	public get length() {
		return this.items.size;
	}
}
