/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { MirroredTestCollection, TestItemFilteredWrapper } from 'vs/workbench/api/common/extHostTesting';
import * as convert from 'vs/workbench/api/common/extHostTypeConverters';
import { TestDiffOpType } from 'vs/workbench/contrib/testing/common/testCollection';
import { stubTest, testStubs } from 'vs/workbench/contrib/testing/common/testStubs';
import { TestOwnedTestCollection, TestSingleUseCollection } from 'vs/workbench/contrib/testing/test/common/ownedTestCollection';
import { TestChangeEvent, TestItem, TextDocument } from 'vscode';
import { URI } from 'vs/base/common/uri';
import { Location } from 'vs/editor/common/modes';
import { Range } from 'vs/editor/common/core/range';

const simplify = (item: TestItem) => {
	if ('toJSON' in item) {
		item = (item as any).toJSON();
		delete (item as any).id;
		delete (item as any).providerId;
		delete (item as any).testId;
	}

	return { ...item, children: undefined };
};

const assertTreesEqual = (a: Readonly<TestItem>, b: Readonly<TestItem>) => {
	assert.deepStrictEqual(simplify(a), simplify(b));

	const aChildren = (a.children ?? []).sort();
	const bChildren = (b.children ?? []).sort();
	assert.strictEqual(aChildren.length, bChildren.length, `expected ${a.label}.children.length == ${b.label}.children.length`);
	aChildren.forEach((_, i) => assertTreesEqual(aChildren[i], bChildren[i]));
};

const assertTreeListEqual = (a: ReadonlyArray<Readonly<TestItem>>, b: ReadonlyArray<Readonly<TestItem>>) => {
	assert.strictEqual(a.length, b.length, `expected a.length == n.length`);
	a.forEach((_, i) => assertTreesEqual(a[i], b[i]));
};

class TestMirroredCollection extends MirroredTestCollection {
	public changeEvent!: TestChangeEvent;

	constructor() {
		super();
		this.onDidChangeTests(evt => this.changeEvent = evt);
	}

	public get length() {
		return this.items.size;
	}
}

suite('ExtHost Testing', () => {
	let single: TestSingleUseCollection;
	let owned: TestOwnedTestCollection;
	setup(() => {
		owned = new TestOwnedTestCollection();
		single = owned.createForHierarchy(d => single.setDiff(d /* don't clear during testing */));
	});

	teardown(() => {
		single.dispose();
		assert.strictEqual(owned.idToInternal.size, 0, 'expected owned ids to be empty after dispose');
	});

	suite('OwnedTestCollection', () => {
		test('adds a root recursively', () => {
			const tests = testStubs.nested();
			single.addRoot(tests, 'pid');
			assert.deepStrictEqual(single.collectDiff(), [
				[TestDiffOpType.Add, { id: '0', providerId: 'pid', parent: null, item: convert.TestItem.from(stubTest('root')) }],
				[TestDiffOpType.Add, { id: '1', providerId: 'pid', parent: '0', item: convert.TestItem.from(stubTest('a'), 'root') }],
				[TestDiffOpType.Add, { id: '2', providerId: 'pid', parent: '1', item: convert.TestItem.from(stubTest('aa'), 'root\0a') }],
				[TestDiffOpType.Add, { id: '3', providerId: 'pid', parent: '1', item: convert.TestItem.from(stubTest('ab'), 'root\0a') }],
				[TestDiffOpType.Add, { id: '4', providerId: 'pid', parent: '0', item: convert.TestItem.from(stubTest('b'), 'root') }],
			]);
		});

		test('no-ops if items not changed', () => {
			const tests = testStubs.nested();
			single.addRoot(tests, 'pid');
			single.collectDiff();
			assert.deepStrictEqual(single.collectDiff(), []);
		});

		test('watches property mutations', () => {
			const tests = testStubs.nested();
			single.addRoot(tests, 'pid');
			single.collectDiff();
			tests.children![0].description = 'Hello world'; /* item a */
			single.onItemChange(tests, 'pid');
			assert.deepStrictEqual(single.collectDiff(), [
				[TestDiffOpType.Update, { id: '1', parent: '0', providerId: 'pid', item: convert.TestItem.from({ ...stubTest('a'), description: 'Hello world' }, 'root') }],
			]);

			single.onItemChange(tests, 'pid');
			assert.deepStrictEqual(single.collectDiff(), []);
		});

		test('removes children', () => {
			const tests = testStubs.nested();
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
			const tests = testStubs.nested();
			single.addRoot(tests, 'pid');
			single.collectDiff();
			const child = stubTest('ac');
			tests.children![0].children!.push(child);
			single.onItemChange(tests, 'pid');

			assert.deepStrictEqual(single.collectDiff(), [
				[TestDiffOpType.Add, { id: '5', providerId: 'pid', parent: '1', item: convert.TestItem.from(child, 'root\0a') }],
			]);
			assert.deepStrictEqual([...owned.idToInternal.keys()].sort(), ['0', '1', '2', '3', '4', '5']);
			assert.strictEqual(single.itemToInternal.size, 6);
		});
	});

	suite('MirroredTestCollection', () => {
		let m: TestMirroredCollection;
		setup(() => m = new TestMirroredCollection());

		test('mirrors creation of the root', () => {
			const tests = testStubs.nested();
			single.addRoot(tests, 'pid');
			m.apply(single.collectDiff());
			assertTreesEqual(m.rootTestItems[0], owned.getTestById('0')!.actual);
			assert.strictEqual(m.length, single.itemToInternal.size);
		});

		test('mirrors node deletion', () => {
			const tests = testStubs.nested();
			single.addRoot(tests, 'pid');
			m.apply(single.collectDiff());
			tests.children!.splice(0, 1);
			single.onItemChange(tests, 'pid');
			m.apply(single.collectDiff());

			assertTreesEqual(m.rootTestItems[0], owned.getTestById('0')!.actual);
			assert.strictEqual(m.length, single.itemToInternal.size);
		});

		test('mirrors node addition', () => {
			const tests = testStubs.nested();
			single.addRoot(tests, 'pid');
			m.apply(single.collectDiff());
			tests.children![0].children!.push(stubTest('ac'));
			single.onItemChange(tests, 'pid');
			m.apply(single.collectDiff());

			assertTreesEqual(m.rootTestItems[0], owned.getTestById('0')!.actual);
			assert.strictEqual(m.length, single.itemToInternal.size);
		});

		test('mirrors node update', () => {
			const tests = testStubs.nested();
			single.addRoot(tests, 'pid');
			m.apply(single.collectDiff());
			tests.children![0].description = 'Hello world'; /* item a */
			single.onItemChange(tests, 'pid');
			m.apply(single.collectDiff());

			assertTreesEqual(m.rootTestItems[0], owned.getTestById('0')!.actual);
		});

		suite('MirroredChangeCollector', () => {
			let tests = testStubs.nested();
			setup(() => {
				tests = testStubs.nested();
				single.addRoot(tests, 'pid');
				m.apply(single.collectDiff());
			});

			test('creates change for root', () => {
				assert.deepStrictEqual(m.changeEvent.commonChangeAncestor, null);
				assertTreeListEqual(m.changeEvent.added, [
					tests,
					tests.children[0],
					tests.children![0].children![0],
					tests.children![0].children![1],
					tests.children[1],
				]);
				assertTreeListEqual(m.changeEvent.removed, []);
				assertTreeListEqual(m.changeEvent.updated, []);
			});

			test('creates change for delete', () => {
				const rm = tests.children.shift()!;
				single.onItemChange(tests, 'pid');
				m.apply(single.collectDiff());

				assertTreesEqual(m.changeEvent.commonChangeAncestor!, tests);
				assertTreeListEqual(m.changeEvent.added, []);
				assertTreeListEqual(m.changeEvent.removed, [
					{ ...rm, children: [] },
					{ ...rm.children![0], children: [] },
					{ ...rm.children![1], children: [] },
				]);
				assertTreeListEqual(m.changeEvent.updated, []);
			});

			test('creates change for update', () => {
				tests.children[0].label = 'updated!';
				single.onItemChange(tests, 'pid');
				m.apply(single.collectDiff());

				assert.deepStrictEqual(m.changeEvent.commonChangeAncestor?.label, 'updated!');
				assertTreeListEqual(m.changeEvent.added, []);
				assertTreeListEqual(m.changeEvent.removed, []);
				assertTreeListEqual(m.changeEvent.updated, [tests.children[0]]);
			});

			test('is a no-op if a node is added and removed', () => {
				const nested = testStubs.nested();
				tests.children.push(nested);
				single.onItemChange(tests, 'pid');
				tests.children.pop();
				single.onItemChange(tests, 'pid');
				const previousEvent = m.changeEvent;
				m.apply(single.collectDiff());
				assert.strictEqual(m.changeEvent, previousEvent);
			});

			test('is a single-op if a node is added and changed', () => {
				const child = stubTest('c');
				tests.children.push(child);
				single.onItemChange(tests, 'pid');
				child.label = 'd';
				single.onItemChange(tests, 'pid');
				m.apply(single.collectDiff());

				assert.strictEqual(m.changeEvent.commonChangeAncestor?.label, 'root');
				assertTreeListEqual(m.changeEvent.added, [child]);
				assertTreeListEqual(m.changeEvent.removed, []);
				assertTreeListEqual(m.changeEvent.updated, []);
			});

			test('gets the common ancestor (1)', () => {
				tests.children![0].children![0].label = 'za';
				tests.children![0].children![1].label = 'zb';
				single.onItemChange(tests, 'pid');
				m.apply(single.collectDiff());

				assert.strictEqual(m.changeEvent.commonChangeAncestor?.label, 'a');
			});

			test('gets the common ancestor (2)', () => {
				tests.children![0].children![0].label = 'za';
				tests.children![1].label = 'ab';
				single.onItemChange(tests, 'pid');
				m.apply(single.collectDiff());

				assert.strictEqual(m.changeEvent.commonChangeAncestor?.label, 'root');
			});
		});

		suite('TestItemFilteredWrapper', () => {
			const stubTestWithLocation = (label: string, location: Location): TestItem => {
				const t = stubTest(label);
				t.location = location as any;
				return t;
			};

			const location1: Location = {
				range: new Range(0, 0, 0, 0),
				uri: URI.parse('file:///foo.ts')
			};

			const location2: Location = {
				range: new Range(0, 0, 0, 0),
				uri: URI.parse('file:///bar.ts')
			};

			const location3: Location = {
				range: new Range(0, 0, 0, 0),
				uri: URI.parse('file:///baz.ts')
			};

			const textDocumentFilter = {
				uri: location1.uri
			} as TextDocument;

			let testsWithLocation: TestItem;
			setup(() => {
				testsWithLocation = {
					...stubTest('root'),
					children: [
						{
							...stubTestWithLocation('a', location1),
							children: [stubTestWithLocation('aa', location1), stubTestWithLocation('ab', location1)]
						},
						{
							...stubTestWithLocation('b', location2),
							children: [stubTestWithLocation('ba', location2), stubTestWithLocation('bb', location2)]
						},
						{
							...stubTestWithLocation('b', location3),
						}
					],
				};
			});

			teardown(() => {
				TestItemFilteredWrapper.removeFilter(textDocumentFilter);
			});

			test('gets all actual properties', () => {
				const testItem: TestItem = stubTest('test1');
				const wrapper: TestItemFilteredWrapper = TestItemFilteredWrapper.getWrapperForTestItem(testItem, textDocumentFilter);

				assert.strictEqual(testItem.debuggable, wrapper.debuggable);
				assert.strictEqual(testItem.description, wrapper.description);
				assert.strictEqual(testItem.label, wrapper.label);
				assert.strictEqual(testItem.location, wrapper.location);
				assert.strictEqual(testItem.runnable, wrapper.runnable);
			});

			test('gets no children if nothing matches Uri filter', () => {
				let tests: TestItem = testStubs.nested();
				const wrapper = TestItemFilteredWrapper.getWrapperForTestItem(tests, textDocumentFilter);
				assert.strictEqual(wrapper.children.length, 0);
			});

			test('filter is applied to children', () => {
				const wrapper = TestItemFilteredWrapper.getWrapperForTestItem(testsWithLocation, textDocumentFilter);
				assert.strictEqual(wrapper.label, 'root');
				assert.strictEqual(wrapper.children.length, 1);
				assert.strictEqual(wrapper.children[0] instanceof TestItemFilteredWrapper, true);
				assert.strictEqual(wrapper.children[0].label, 'a');
			});

			test('can get if node has matching filter', () => {
				const rootWrapper = TestItemFilteredWrapper.getWrapperForTestItem(testsWithLocation, textDocumentFilter);

				const invisible = testsWithLocation.children![1];
				const invisibleWrapper = TestItemFilteredWrapper.getWrapperForTestItem(invisible, textDocumentFilter);
				const visible = testsWithLocation.children![0];
				const visibleWrapper = TestItemFilteredWrapper.getWrapperForTestItem(visible, textDocumentFilter);

				// The root is always visible
				assert.strictEqual(rootWrapper.hasNodeMatchingFilter, true);
				assert.strictEqual(invisibleWrapper.hasNodeMatchingFilter, false);
				assert.strictEqual(visibleWrapper.hasNodeMatchingFilter, true);
			});

			test('can get visible parent', () => {
				const rootWrapper = TestItemFilteredWrapper.getWrapperForTestItem(testsWithLocation, textDocumentFilter);

				const invisible = testsWithLocation.children![1];
				const invisibleWrapper = TestItemFilteredWrapper.getWrapperForTestItem(invisible, textDocumentFilter);
				const visible = testsWithLocation.children![0];
				const visibleWrapper = TestItemFilteredWrapper.getWrapperForTestItem(visible, textDocumentFilter);

				// The root is always visible
				assert.strictEqual(rootWrapper.visibleParent, rootWrapper);
				assert.strictEqual(invisibleWrapper.visibleParent, rootWrapper);
				assert.strictEqual(visibleWrapper.visibleParent, visibleWrapper);
			});

			test('can reset cached value of hasNodeMatchingFilter', () => {
				TestItemFilteredWrapper.getWrapperForTestItem(testsWithLocation, textDocumentFilter);

				const invisible = testsWithLocation.children![1];
				const invisibleWrapper = TestItemFilteredWrapper.getWrapperForTestItem(invisible, textDocumentFilter);

				assert.strictEqual(invisibleWrapper.hasNodeMatchingFilter, false);
				invisible.location = location1 as any;
				assert.strictEqual(invisibleWrapper.hasNodeMatchingFilter, false);
				invisibleWrapper.reset();
				assert.strictEqual(invisibleWrapper.hasNodeMatchingFilter, true);
			});

			test('can reset cached value of hasNodeMatchingFilter of parents up to visible parent', () => {
				const rootWrapper = TestItemFilteredWrapper.getWrapperForTestItem(testsWithLocation, textDocumentFilter);

				const invisibleParent = testsWithLocation.children![1];
				const invisibleParentWrapper = TestItemFilteredWrapper.getWrapperForTestItem(invisibleParent, textDocumentFilter);
				const invisible = invisibleParent.children![1];
				const invisibleWrapper = TestItemFilteredWrapper.getWrapperForTestItem(invisible, textDocumentFilter);

				assert.strictEqual(invisibleParentWrapper.hasNodeMatchingFilter, false);
				invisible.location = location1 as any;
				assert.strictEqual(invisibleParentWrapper.hasNodeMatchingFilter, false);
				invisibleWrapper.reset();
				assert.strictEqual(invisibleParentWrapper.hasNodeMatchingFilter, true);

				// the root should be undefined due to the reset.
				assert.strictEqual((rootWrapper as any).matchesFilter, undefined);
			});
		});
	});
});
