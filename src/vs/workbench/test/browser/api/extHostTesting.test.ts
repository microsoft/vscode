/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Iterable } from 'vs/base/common/iterator';
import { URI } from 'vs/base/common/uri';
import { mockObject, MockObject } from 'vs/base/test/common/mock';
import { MainThreadTestingShape } from 'vs/workbench/api/common/extHost.protocol';
import { createDefaultDocumentTestRoot, TestItemFilteredWrapper, TestRunCoordinator, TestRunDto } from 'vs/workbench/api/common/extHostTesting';
import * as convert from 'vs/workbench/api/common/extHostTypeConverters';
import { TestMessage } from 'vs/workbench/api/common/extHostTypes';
import { TestDiffOpType, TestItemExpandState } from 'vs/workbench/contrib/testing/common/testCollection';
import { stubTest, TestItemImpl, TestResultState, testStubs, testStubsChain } from 'vs/workbench/contrib/testing/common/testStubs';
import { TestOwnedTestCollection, TestSingleUseCollection } from 'vs/workbench/contrib/testing/test/common/ownedTestCollection';
import type { TestItem, TestRunRequest, TextDocument } from 'vscode';

const simplify = (item: TestItem<unknown>) => ({
	id: item.id,
	label: item.label,
	uri: item.uri,
	range: item.range,
	runnable: item.runnable,
	debuggable: item.debuggable,
});

const assertTreesEqual = (a: TestItem<unknown> | undefined, b: TestItem<unknown> | undefined) => {
	if (!a) {
		throw new assert.AssertionError({ message: 'Expected a to be defined', actual: a });
	}

	if (!b) {
		throw new assert.AssertionError({ message: 'Expected b to be defined', actual: b });
	}

	assert.deepStrictEqual(simplify(a), simplify(b));

	const aChildren = [...a.children.keys()].slice().sort();
	const bChildren = [...b.children.keys()].slice().sort();
	assert.strictEqual(aChildren.length, bChildren.length, `expected ${a.label}.children.length == ${b.label}.children.length`);
	aChildren.forEach(key => assertTreesEqual(a.children.get(key), b.children.get(key)));
};

// const assertTreeListEqual = (a: ReadonlyArray<TestItem>, b: ReadonlyArray<TestItem>) => {
// 	assert.strictEqual(a.length, b.length, `expected a.length == n.length`);
// 	a.forEach((_, i) => assertTreesEqual(a[i], b[i]));
// };

// class TestMirroredCollection extends MirroredTestCollection {
// 	public changeEvent!: TestChangeEvent;

// 	constructor() {
// 		super();
// 		this.onDidChangeTests(evt => this.changeEvent = evt);
// 	}

// 	public get length() {
// 		return this.items.size;
// 	}
// }

suite('ExtHost Testing', () => {
	let single: TestSingleUseCollection;
	let owned: TestOwnedTestCollection;
	setup(() => {
		owned = new TestOwnedTestCollection();
		single = owned.createForHierarchy(d => single.setDiff(d /* don't clear during testing */));
	});

	teardown(() => {
		single.dispose();
		assert.strictEqual(!owned.idToInternal?.size, true, 'expected owned ids to be empty after dispose');
	});

	suite('OwnedTestCollection', () => {
		test('adds a root recursively', () => {
			const tests = testStubs.nested();
			single.addRoot(tests, 'pid');
			single.expand('id-root', Infinity);
			assert.deepStrictEqual(single.collectDiff(), [
				[
					TestDiffOpType.Add,
					{ src: { tree: 0, controller: 'pid' }, parent: null, expand: TestItemExpandState.BusyExpanding, item: { ...convert.TestItem.from(stubTest('root')) } }
				],
				[
					TestDiffOpType.Add,
					{ src: { tree: 0, controller: 'pid' }, parent: 'id-root', expand: TestItemExpandState.Expandable, item: { ...convert.TestItem.from(stubTest('a')) } }
				],
				[
					TestDiffOpType.Add,
					{ src: { tree: 0, controller: 'pid' }, parent: 'id-root', expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(stubTest('b')) }
				],
				[
					TestDiffOpType.Update,
					{ extId: 'id-root', expand: TestItemExpandState.Expanded }
				],
				[
					TestDiffOpType.Update,
					{ extId: 'id-a', expand: TestItemExpandState.BusyExpanding }
				],
				[
					TestDiffOpType.Add,
					{ src: { tree: 0, controller: 'pid' }, parent: 'id-a', expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(stubTest('aa')) }
				],
				[
					TestDiffOpType.Add,
					{ src: { tree: 0, controller: 'pid' }, parent: 'id-a', expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(stubTest('ab')) }
				],
				[
					TestDiffOpType.Update,
					{ extId: 'id-a', expand: TestItemExpandState.Expanded }
				],
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
			single.expand('id-root', Infinity);
			single.collectDiff();
			tests.children.get('id-a')!.description = 'Hello world'; /* item a */

			assert.deepStrictEqual(single.collectDiff(), [
				[
					TestDiffOpType.Update,
					{ extId: 'id-a', item: { description: 'Hello world' } }],
			]);
		});

		test('removes children', () => {
			const tests = testStubs.nested();
			single.addRoot(tests, 'pid');
			single.expand('id-root', Infinity);
			single.collectDiff();
			tests.children.get('id-a')!.dispose();

			assert.deepStrictEqual(single.collectDiff(), [
				[TestDiffOpType.Remove, 'id-a'],
			]);
			assert.deepStrictEqual([...owned.idToInternal].map(n => n.item.extId).sort(), ['id-b', 'id-root']);
			assert.strictEqual(single.itemToInternal.size, 2);
		});

		test('adds new children', () => {
			const tests = testStubs.nested();
			single.addRoot(tests, 'pid');
			single.expand('id-root', Infinity);
			single.collectDiff();
			const child = stubTest('ac');
			tests.children.get('id-a')!.addChild(child);

			assert.deepStrictEqual(single.collectDiff(), [
				[TestDiffOpType.Add, {
					src: { tree: 0, controller: 'pid' },
					parent: 'id-a',
					expand: TestItemExpandState.NotExpandable,
					item: convert.TestItem.from(child),
				}],
			]);
			assert.deepStrictEqual(
				[...owned.idToInternal].map(n => n.item.extId).sort(),
				['id-a', 'id-aa', 'id-ab', 'id-ac', 'id-b', 'id-root'],
			);
			assert.strictEqual(single.itemToInternal.size, 6);
		});
	});


	suite('MirroredTestCollection', () => {
		// todo@connor4312: re-renable when we figure out what observing looks like we async children
		// 	let m: TestMirroredCollection;
		// 	setup(() => m = new TestMirroredCollection());

		// 	test('mirrors creation of the root', () => {
		// 		const tests = testStubs.nested();
		// 		single.addRoot(tests, 'pid');
		// 		single.expand('id-root', Infinity);
		// 		m.apply(single.collectDiff());
		// 		assertTreesEqual(m.rootTestItems[0], owned.getTestById('id-root')![1].actual);
		// 		assert.strictEqual(m.length, single.itemToInternal.size);
		// 	});

		// 	test('mirrors node deletion', () => {
		// 		const tests = testStubs.nested();
		// 		single.addRoot(tests, 'pid');
		// 		m.apply(single.collectDiff());
		// 		single.expand('id-root', Infinity);
		// 		tests.children!.splice(0, 1);
		// 		single.onItemChange(tests, 'pid');
		// 		single.expand('id-root', Infinity);
		// 		m.apply(single.collectDiff());

		// 		assertTreesEqual(m.rootTestItems[0], owned.getTestById('id-root')![1].actual);
		// 		assert.strictEqual(m.length, single.itemToInternal.size);
		// 	});

		// 	test('mirrors node addition', () => {
		// 		const tests = testStubs.nested();
		// 		single.addRoot(tests, 'pid');
		// 		m.apply(single.collectDiff());
		// 		tests.children![0].children!.push(stubTest('ac'));
		// 		single.onItemChange(tests, 'pid');
		// 		m.apply(single.collectDiff());

		// 		assertTreesEqual(m.rootTestItems[0], owned.getTestById('id-root')![1].actual);
		// 		assert.strictEqual(m.length, single.itemToInternal.size);
		// 	});

		// 	test('mirrors node update', () => {
		// 		const tests = testStubs.nested();
		// 		single.addRoot(tests, 'pid');
		// 		m.apply(single.collectDiff());
		// 		tests.children![0].description = 'Hello world'; /* item a */
		// 		single.onItemChange(tests, 'pid');
		// 		m.apply(single.collectDiff());

		// 		assertTreesEqual(m.rootTestItems[0], owned.getTestById('id-root')![1].actual);
		// 	});

		// 	suite('MirroredChangeCollector', () => {
		// 		let tests = testStubs.nested();
		// 		setup(() => {
		// 			tests = testStubs.nested();
		// 			single.addRoot(tests, 'pid');
		// 			m.apply(single.collectDiff());
		// 		});

		// 		test('creates change for root', () => {
		// 			assertTreeListEqual(m.changeEvent.added, [
		// 				tests,
		// 				tests.children[0],
		// 				tests.children![0].children![0],
		// 				tests.children![0].children![1],
		// 				tests.children[1],
		// 			]);
		// 			assertTreeListEqual(m.changeEvent.removed, []);
		// 			assertTreeListEqual(m.changeEvent.updated, []);
		// 		});

		// 		test('creates change for delete', () => {
		// 			const rm = tests.children.shift()!;
		// 			single.onItemChange(tests, 'pid');
		// 			m.apply(single.collectDiff());

		// 			assertTreeListEqual(m.changeEvent.added, []);
		// 			assertTreeListEqual(m.changeEvent.removed, [
		// 				{ ...rm },
		// 				{ ...rm.children![0] },
		// 				{ ...rm.children![1] },
		// 			]);
		// 			assertTreeListEqual(m.changeEvent.updated, []);
		// 		});

		// 		test('creates change for update', () => {
		// 			tests.children[0].label = 'updated!';
		// 			single.onItemChange(tests, 'pid');
		// 			m.apply(single.collectDiff());

		// 			assertTreeListEqual(m.changeEvent.added, []);
		// 			assertTreeListEqual(m.changeEvent.removed, []);
		// 			assertTreeListEqual(m.changeEvent.updated, [tests.children[0]]);
		// 		});

		// 		test('is a no-op if a node is added and removed', () => {
		// 			const nested = testStubs.nested('id2-');
		// 			tests.children.push(nested);
		// 			single.onItemChange(tests, 'pid');
		// 			tests.children.pop();
		// 			single.onItemChange(tests, 'pid');
		// 			const previousEvent = m.changeEvent;
		// 			m.apply(single.collectDiff());
		// 			assert.strictEqual(m.changeEvent, previousEvent);
		// 		});

		// 		test('is a single-op if a node is added and changed', () => {
		// 			const child = stubTest('c');
		// 			tests.children.push(child);
		// 			single.onItemChange(tests, 'pid');
		// 			child.label = 'd';
		// 			single.onItemChange(tests, 'pid');
		// 			m.apply(single.collectDiff());

		// 			assertTreeListEqual(m.changeEvent.added, [child]);
		// 			assertTreeListEqual(m.changeEvent.removed, []);
		// 			assertTreeListEqual(m.changeEvent.updated, []);
		// 		});

		// 		test('gets the common ancestor (1)', () => {
		// 			tests.children![0].children![0].label = 'za';
		// 			tests.children![0].children![1].label = 'zb';
		// 			single.onItemChange(tests, 'pid');
		// 			m.apply(single.collectDiff());

		// 		});

		// 		test('gets the common ancestor (2)', () => {
		// 			tests.children![0].children![0].label = 'za';
		// 			tests.children![1].label = 'ab';
		// 			single.onItemChange(tests, 'pid');
		// 			m.apply(single.collectDiff());
		// 		});
		// 	});

		suite('TestItemFilteredWrapper', () => {
			const textDocumentFilter = {
				uri: URI.parse('file:///foo.ts'),
			} as TextDocument;

			let testsWithLocation: TestItemImpl;
			setup(async () => {
				testsWithLocation =
					stubTest('root', undefined, [
						stubTest('a', undefined, [
							stubTest('aa', undefined, undefined, URI.parse('file:///foo.ts')),
							stubTest('ab', undefined, undefined, URI.parse('file:///foo.ts'))
						], URI.parse('file:///foo.ts')),
						stubTest('b', undefined, [
							stubTest('ba', undefined, undefined, URI.parse('file:///bar.ts')),
							stubTest('bb', undefined, undefined, URI.parse('file:///bar.ts'))
						], URI.parse('file:///bar.ts')),
						stubTest('c', undefined, undefined, URI.parse('file:///baz.ts')),
					]);

				// todo: this is not used, don't think it's needed anymore
				await createDefaultDocumentTestRoot<void>(
					{
						createWorkspaceTestRoot: () => testsWithLocation as TestItem<void>,
						runTests() {
							throw new Error('no implemented');
						}
					},
					textDocumentFilter,
					undefined,
					CancellationToken.None
				);
			});

			teardown(() => {
				TestItemFilteredWrapper.removeFilter(textDocumentFilter);
			});

			test('gets all actual properties', () => {
				const testItem = stubTest('test1');
				const wrapper = TestItemFilteredWrapper.getWrapperForTestItem(testItem, textDocumentFilter);

				assert.strictEqual(testItem.debuggable, wrapper.debuggable);
				assert.strictEqual(testItem.description, wrapper.description);
				assert.strictEqual(testItem.label, wrapper.label);
				assert.strictEqual(testItem.uri, wrapper.uri);
				assert.strictEqual(testItem.runnable, wrapper.runnable);
			});

			test('gets no children if nothing matches Uri filter', () => {
				const tests = testStubs.nested();
				const wrapper = TestItemFilteredWrapper.getWrapperForTestItem(tests, textDocumentFilter);
				wrapper.resolveHandler?.(CancellationToken.None);
				assert.strictEqual(wrapper.children.size, 0);
			});

			test('filter is applied to children', () => {
				const wrapper = TestItemFilteredWrapper.getWrapperForTestItem(testsWithLocation, textDocumentFilter);
				assert.strictEqual(wrapper.label, 'root');
				wrapper.resolveHandler?.(CancellationToken.None);

				const children = [...wrapper.children.values()];
				assert.strictEqual(children.length, 1);
				assert.strictEqual(children[0] instanceof TestItemFilteredWrapper, true);
				assert.strictEqual(children[0].label, 'a');
			});

			test('can get if node has matching filter', () => {
				const rootWrapper = TestItemFilteredWrapper.getWrapperForTestItem(testsWithLocation, textDocumentFilter);
				rootWrapper.resolveHandler?.(CancellationToken.None);

				const invisible = testsWithLocation.children.get('id-b')!;
				const invisibleWrapper = TestItemFilteredWrapper.getWrapperForTestItem(invisible, textDocumentFilter);
				const visible = testsWithLocation.children.get('id-a')!;
				const visibleWrapper = TestItemFilteredWrapper.getWrapperForTestItem(visible, textDocumentFilter);

				// The root is always visible
				assert.strictEqual(rootWrapper.hasNodeMatchingFilter, true);
				assert.strictEqual(invisibleWrapper.hasNodeMatchingFilter, false);
				assert.strictEqual(visibleWrapper.hasNodeMatchingFilter, true);
			});

			test('can reset cached value of hasNodeMatchingFilter', () => {
				const wrapper = TestItemFilteredWrapper.getWrapperForTestItem(testsWithLocation, textDocumentFilter);
				wrapper.resolveHandler?.(CancellationToken.None);

				const invisible = testsWithLocation.children.get('id-b')!;
				const invisibleWrapper = TestItemFilteredWrapper.getWrapperForTestItem(invisible, textDocumentFilter);

				assert.strictEqual(wrapper.children.get('id-b'), undefined);
				assert.strictEqual(invisibleWrapper.hasNodeMatchingFilter, false);

				invisible.addChild(stubTest('bc', undefined, undefined, URI.parse('file:///foo.ts')));
				assert.strictEqual(invisibleWrapper.hasNodeMatchingFilter, true);
				assert.strictEqual(invisibleWrapper.children.size, 1);
				assert.strictEqual(wrapper.children.get('id-b'), invisibleWrapper);
			});
		});
	});

	suite('TestRunTracker', () => {
		let proxy: MockObject<MainThreadTestingShape>;
		let c: TestRunCoordinator;
		let cts: CancellationTokenSource;

		const req: TestRunRequest<unknown> = { tests: [], debug: false };
		const dto = TestRunDto.fromInternal({
			debug: false,
			excludeExtIds: [],
			runId: 'run-id',
			tests: [],
		});

		setup(() => {
			proxy = mockObject();
			cts = new CancellationTokenSource();
			c = new TestRunCoordinator(proxy);
		});

		test('tracks a run started from a main thread request', () => {
			const tracker = c.prepareForMainThreadTestRun(req, dto, cts.token);
			assert.strictEqual(tracker.isRunning, false);

			const task1 = c.createTestRun(req, 'run1', true);
			const task2 = c.createTestRun(req, 'run2', true);
			assert.strictEqual(proxy.$startedExtensionTestRun.called, false);
			assert.strictEqual(tracker.isRunning, true);

			task1.appendOutput('hello');
			assert.deepStrictEqual([['run-id', (task1 as any).taskId, VSBuffer.fromString('hello')]], proxy.$appendOutputToRun.args);
			task1.end();

			assert.strictEqual(proxy.$finishedExtensionTestRun.called, false);
			assert.strictEqual(tracker.isRunning, true);

			task2.end();

			assert.strictEqual(proxy.$finishedExtensionTestRun.called, false);
			assert.strictEqual(tracker.isRunning, false);
		});

		test('tracks a run started from an extension request', () => {
			const task1 = c.createTestRun(req, 'hello world', false);

			const tracker = Iterable.first(c.trackers)!;
			assert.strictEqual(tracker.isRunning, true);
			assert.deepStrictEqual(proxy.$startedExtensionTestRun.args, [
				[{
					id: tracker.id,
					tests: [],
					exclude: [],
					debug: false,
					persist: false,
				}]
			]);

			const task2 = c.createTestRun(req, 'run2', true);
			const task3Detached = c.createTestRun({ ...req }, 'task3Detached', true);

			task1.end();
			assert.strictEqual(proxy.$finishedExtensionTestRun.called, false);
			assert.strictEqual(tracker.isRunning, true);

			task2.end();
			assert.deepStrictEqual(proxy.$finishedExtensionTestRun.args, [[tracker.id]]);
			assert.strictEqual(tracker.isRunning, false);

			task3Detached.end();
		});

		test('adds tests to run smartly', () => {
			const task1 = c.createTestRun(req, 'hello world', false);
			const tracker = Iterable.first(c.trackers)!;
			const tests = testStubs.nested();
			const expectedArgs: unknown[][] = [];
			assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);

			task1.setState(testStubsChain(tests, ['id-a', 'id-aa']).pop()!, TestResultState.Passed);
			expectedArgs.push([
				tracker.id,
				testStubsChain(tests, ['id-a', 'id-aa']).map(convert.TestItem.from)
			]);
			assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);


			task1.setState(testStubsChain(tests, ['id-a', 'id-ab']).pop()!, TestResultState.Queued);
			expectedArgs.push([
				tracker.id,
				testStubsChain(tests, ['id-a', 'id-ab']).slice(1).map(convert.TestItem.from)
			]);
			assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);

			task1.setState(testStubsChain(tests, ['id-a', 'id-ab']).pop()!, TestResultState.Passed);
			assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);
		});

		test('guards calls after runs are ended', () => {
			const task = c.createTestRun(req, 'hello world', false);
			task.end();

			task.setState(testStubs.nested(), TestResultState.Passed);
			task.appendMessage(testStubs.nested(), new TestMessage('some message'));
			task.appendOutput('output');

			assert.strictEqual(proxy.$addTestsToRun.called, false);
			assert.strictEqual(proxy.$appendOutputToRun.called, false);
			assert.strictEqual(proxy.$appendTestMessageInRun.called, false);
		});
	});
});
