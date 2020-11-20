/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { MirroredTestCollection, OwnedTestCollection, SingleUseTestCollection } from 'vs/workbench/api/common/extHostTesting';
import * as convert from 'vs/workbench/api/common/extHostTypeConverters';
import { TestRunState, TestState } from 'vs/workbench/api/common/extHostTypes';
import { TestDiffOpType, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestItem } from 'vscode';

suite('ExtHost Testing', () => {
	let single: TestSingleUseCollection;
	let owned: TestOwnedTestCollection;
	setup(() => {
		owned = new TestOwnedTestCollection();
		single = owned.createForHierarchy(d => single.setDiff(d /* don't clear during testing */));
	});

	teardown(() => {
		single.dispose();
		assert.deepEqual(owned.idToInternal.size, 0, 'expected owned ids to be empty after dispose');
	});

	suite('OwnedTestCollection', () => {
		test('adds a root recursively', () => {
			const tests = stubNestedTests();
			single.addRoot(tests, 'pid');
			assert.deepStrictEqual(single.collectDiff(), [
				[TestDiffOpType.Add, { id: '0', providerId: 'pid', parent: null, item: convert.TestItem.from(stubTest('root')) }],
				[TestDiffOpType.Add, { id: '1', providerId: 'pid', parent: '0', item: convert.TestItem.from(stubTest('a')) }],
				[TestDiffOpType.Add, { id: '2', providerId: 'pid', parent: '1', item: convert.TestItem.from(stubTest('aa')) }],
				[TestDiffOpType.Add, { id: '3', providerId: 'pid', parent: '1', item: convert.TestItem.from(stubTest('ab')) }],
				[TestDiffOpType.Add, { id: '4', providerId: 'pid', parent: '0', item: convert.TestItem.from(stubTest('b')) }],
			]);
		});

		test('no-ops if items not changed', () => {
			const tests = stubNestedTests();
			single.addRoot(tests, 'pid');
			single.collectDiff();
			assert.deepStrictEqual(single.collectDiff(), []);
		});

		test('watches property mutations', () => {
			const tests = stubNestedTests();
			single.addRoot(tests, 'pid');
			single.collectDiff();
			tests.children![0].description = 'Hello world'; /* item a */
			single.onItemChange(tests, 'pid');
			assert.deepStrictEqual(single.collectDiff(), [
				[TestDiffOpType.Update, { id: '1', parent: '0', providerId: 'pid', item: convert.TestItem.from({ ...stubTest('a'), description: 'Hello world' }) }],
			]);

			single.onItemChange(tests, 'pid');
			assert.deepStrictEqual(single.collectDiff(), []);
		});

		test('removes children', () => {
			const tests = stubNestedTests();
			single.addRoot(tests, 'pid');
			single.collectDiff();
			tests.children!.splice(0, 1);
			single.onItemChange(tests, 'pid');

			assert.deepStrictEqual(single.collectDiff(), [
				[TestDiffOpType.Remove, '1'],
			]);
			assert.deepStrictEqual([...owned.idToInternal.keys()].sort(), ['0', '4']);
			assert.strictEqual(single.itemToInternal.size, 2);
		});

		test('adds new children', () => {
			const tests = stubNestedTests();
			single.addRoot(tests, 'pid');
			single.collectDiff();
			const child = stubTest('ac');
			tests.children![0].children!.push(child);
			single.onItemChange(tests, 'pid');

			assert.deepStrictEqual(single.collectDiff(), [
				[TestDiffOpType.Add, { id: '5', providerId: 'pid', parent: '1', item: convert.TestItem.from(child) }],
			]);
			assert.deepStrictEqual([...owned.idToInternal.keys()].sort(), ['0', '1', '2', '3', '4', '5']);
			assert.strictEqual(single.itemToInternal.size, 6);
		});
	});

	suite('MirroredTestCollection', () => {
		test('mirrors creation of the root', () => {
			const m = new TestMirroredCollection();
			const tests = stubNestedTests();
			single.addRoot(tests, 'pid');
			m.apply(single.collectDiff());
			assertTreesEqual(m.rootTestItems[0], owned.getTestById('0')!.actual);
			assert.strictEqual(m.length, single.itemToInternal.size);
		});

		test('mirrors node deletion', () => {
			const m = new TestMirroredCollection();
			const tests = stubNestedTests();
			single.addRoot(tests, 'pid');
			m.apply(single.collectDiff());
			tests.children!.splice(0, 1);
			single.onItemChange(tests, 'pid');
			m.apply(single.collectDiff());

			assertTreesEqual(m.rootTestItems[0], owned.getTestById('0')!.actual);
			assert.strictEqual(m.length, single.itemToInternal.size);
		});

		test('mirrors node addition', () => {
			const m = new TestMirroredCollection();
			const tests = stubNestedTests();
			single.addRoot(tests, 'pid');
			m.apply(single.collectDiff());
			tests.children![0].children!.push(stubTest('ac'));
			single.onItemChange(tests, 'pid');
			m.apply(single.collectDiff());

			assertTreesEqual(m.rootTestItems[0], owned.getTestById('0')!.actual);
			assert.strictEqual(m.length, single.itemToInternal.size);
		});

		test('mirrors node update', () => {
			const m = new TestMirroredCollection();
			const tests = stubNestedTests();
			single.addRoot(tests, 'pid');
			m.apply(single.collectDiff());
			tests.children![0].description = 'Hello world'; /* item a */
			single.onItemChange(tests, 'pid');
			m.apply(single.collectDiff());

			assertTreesEqual(m.rootTestItems[0], owned.getTestById('0')!.actual);
		});
	});
});

const stubTest = (label: string): TestItem => ({
	label,
	location: undefined,
	state: new TestState(TestRunState.Unset),
	debuggable: true,
	runnable: true,
	description: ''
});

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

class TestOwnedTestCollection extends OwnedTestCollection {
	public get idToInternal() {
		return this.testIdToInternal;
	}

	public createForHierarchy(publishDiff: (diff: TestsDiff) => void = () => undefined) {
		return new TestSingleUseCollection(this.testIdToInternal, publishDiff);
	}
}

class TestSingleUseCollection extends SingleUseTestCollection {
	private idCounter = 0;

	public get itemToInternal() {
		return this.testItemToInternal;
	}

	public get currentDiff() {
		return this.diff;
	}

	protected getId() {
		return String(this.idCounter++);
	}

	public setDiff(diff: TestsDiff) {
		this.diff = diff;
	}
}

class TestMirroredCollection extends MirroredTestCollection {
	public get length() {
		return this.items.size;
	}
}
