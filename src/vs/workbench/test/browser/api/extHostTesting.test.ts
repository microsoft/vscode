/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Iterable } from 'vs/base/common/iterator';
import { mockObject, MockObject } from 'vs/base/test/common/mock';
import { MainThreadTestingShape } from 'vs/workbench/api/common/extHost.protocol';
import { TestRunCoordinator, TestRunDto } from 'vs/workbench/api/common/extHostTesting';
import * as convert from 'vs/workbench/api/common/extHostTypeConverters';
import { TestMessage } from 'vs/workbench/api/common/extHostTypes';
import { TestDiffOpType, TestItemExpandState } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestItemImpl, TestResultState, testStubs } from 'vs/workbench/contrib/testing/common/testStubs';
import { TestSingleUseCollection } from 'vs/workbench/contrib/testing/test/common/ownedTestCollection';
import type { TestItem, TestRunRequest } from 'vscode';

const simplify = (item: TestItem) => ({
	id: item.id,
	label: item.label,
	uri: item.uri,
	range: item.range,
	runnable: item.runnable,
	debuggable: item.debuggable,
});

const assertTreesEqual = (a: TestItem | undefined, b: TestItem | undefined) => {
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
	setup(() => {
		single = testStubs.nested();
		single.onDidGenerateDiff(d => single.setDiff(d /* don't clear during testing */));
	});

	teardown(() => {
		single.dispose();
	});

	suite('OwnedTestCollection', () => {
		test('adds a root recursively', async () => {
			await single.expand(single.root.id, Infinity);
			assert.deepStrictEqual(single.collectDiff(), [
				[
					TestDiffOpType.Add,
					{ controllerId: 'ctrlId', parent: null, expand: TestItemExpandState.BusyExpanding, item: { ...convert.TestItem.from(single.root) } }
				],
				[
					TestDiffOpType.Add,
					{ controllerId: 'ctrlId', parent: single.root.id, expand: TestItemExpandState.Expandable, item: { ...convert.TestItem.from(single.tree.get('id-a')!.actual) } }
				],
				[
					TestDiffOpType.Add,
					{ controllerId: 'ctrlId', parent: single.root.id, expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(single.tree.get('id-b')!.actual) }
				],
				[
					TestDiffOpType.Update,
					{ extId: single.root.id, expand: TestItemExpandState.Expanded }
				],
				[
					TestDiffOpType.Update,
					{ extId: 'id-a', expand: TestItemExpandState.BusyExpanding }
				],
				[
					TestDiffOpType.Add,
					{ controllerId: 'ctrlId', parent: 'id-a', expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(single.tree.get('id-aa')!.actual) }
				],
				[
					TestDiffOpType.Add,
					{ controllerId: 'ctrlId', parent: 'id-a', expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(single.tree.get('id-ab')!.actual) }
				],
				[
					TestDiffOpType.Update,
					{ extId: 'id-a', expand: TestItemExpandState.Expanded }
				],
			]);
		});

		test('no-ops if items not changed', () => {
			single.collectDiff();
			assert.deepStrictEqual(single.collectDiff(), []);
		});

		test('watches property mutations', () => {
			single.expand(single.root.id, Infinity);
			single.collectDiff();
			single.root.children.get('id-a')!.description = 'Hello world'; /* item a */

			assert.deepStrictEqual(single.collectDiff(), [
				[
					TestDiffOpType.Update,
					{ extId: 'id-a', item: { description: 'Hello world' } }],
			]);
		});

		test('removes children', () => {
			single.expand(single.root.id, Infinity);
			single.collectDiff();
			single.root.children.get('id-a')!.dispose();

			assert.deepStrictEqual(single.collectDiff(), [
				[TestDiffOpType.Remove, 'id-a'],
			]);
			assert.deepStrictEqual([...single.tree].map(n => n.item.extId).sort(), [single.root.id, 'id-b']);
			assert.strictEqual(single.itemToInternal.size, 2);
		});

		test('adds new children', () => {
			single.expand(single.root.id, Infinity);
			single.collectDiff();
			const child = new TestItemImpl('id-ac', 'c', undefined, undefined, single.root.children.get('id-a'));

			assert.deepStrictEqual(single.collectDiff(), [
				[TestDiffOpType.Add, {
					controllerId: 'ctrlId',
					parent: 'id-a',
					expand: TestItemExpandState.NotExpandable,
					item: convert.TestItem.from(child),
				}],
			]);
			assert.deepStrictEqual(
				[...single.tree].map(n => n.item.extId).sort(),
				[single.root.id, 'id-a', 'id-aa', 'id-ab', 'id-ac', 'id-b'],
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
		// 		single.expand(single.root.id, Infinity);
		// 		m.apply(single.collectDiff());
		// 		assertTreesEqual(m.rootTestItems[0], owned.getTestById(single.root.id)![1].actual);
		// 		assert.strictEqual(m.length, single.itemToInternal.size);
		// 	});

		// 	test('mirrors node deletion', () => {
		// 		const tests = testStubs.nested();
		// 		single.addRoot(tests, 'pid');
		// 		m.apply(single.collectDiff());
		// 		single.expand(single.root.id, Infinity);
		// 		tests.children!.splice(0, 1);
		// 		single.onItemChange(tests, 'pid');
		// 		single.expand(single.root.id, Infinity);
		// 		m.apply(single.collectDiff());

		// 		assertTreesEqual(m.rootTestItems[0], owned.getTestById(single.root.id)![1].actual);
		// 		assert.strictEqual(m.length, single.itemToInternal.size);
		// 	});

		// 	test('mirrors node addition', () => {
		// 		const tests = testStubs.nested();
		// 		single.addRoot(tests, 'pid');
		// 		m.apply(single.collectDiff());
		// 		tests.children![0].children!.push(stubTest('ac'));
		// 		single.onItemChange(tests, 'pid');
		// 		m.apply(single.collectDiff());

		// 		assertTreesEqual(m.rootTestItems[0], owned.getTestById(single.root.id)![1].actual);
		// 		assert.strictEqual(m.length, single.itemToInternal.size);
		// 	});

		// 	test('mirrors node update', () => {
		// 		const tests = testStubs.nested();
		// 		single.addRoot(tests, 'pid');
		// 		m.apply(single.collectDiff());
		// 		tests.children![0].description = 'Hello world'; /* item a */
		// 		single.onItemChange(tests, 'pid');
		// 		m.apply(single.collectDiff());

		// 		assertTreesEqual(m.rootTestItems[0], owned.getTestById(single.root.id)![1].actual);
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
	});

	suite('TestRunTracker', () => {
		let proxy: MockObject<MainThreadTestingShape>;
		let c: TestRunCoordinator;
		let cts: CancellationTokenSource;

		let req: TestRunRequest;

		let dto: TestRunDto;

		setup(() => {
			proxy = mockObject();
			cts = new CancellationTokenSource();
			c = new TestRunCoordinator(proxy);

			req = {
				tests: [single.root],
				exclude: [single.root.children.get('id-b')!],
				debug: false,
			};

			dto = TestRunDto.fromInternal({
				controllerId: 'ctrl',
				debug: false,
				excludeExtIds: ['id-b'],
				runId: 'run-id',
				testIds: [single.root.id],
			});
		});

		test('tracks a run started from a main thread request', () => {
			const tracker = c.prepareForMainThreadTestRun(req, dto, cts.token);
			assert.strictEqual(tracker.isRunning, false);

			const task1 = c.createTestRun('ctrl', req, 'run1', true);
			const task2 = c.createTestRun('ctrl', req, 'run2', true);
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
			const task1 = c.createTestRun('ctrl', req, 'hello world', false);

			const tracker = Iterable.first(c.trackers)!;
			assert.strictEqual(tracker.isRunning, true);
			assert.deepStrictEqual(proxy.$startedExtensionTestRun.args, [
				[{
					id: tracker.id,
					tests: [single.root.id],
					exclude: ['id-b'],
					debug: false,
					persist: false,
				}]
			]);

			const task2 = c.createTestRun('ctrl', req, 'run2', true);
			const task3Detached = c.createTestRun('ctrl', { ...req }, 'task3Detached', true);

			task1.end();
			assert.strictEqual(proxy.$finishedExtensionTestRun.called, false);
			assert.strictEqual(tracker.isRunning, true);

			task2.end();
			assert.deepStrictEqual(proxy.$finishedExtensionTestRun.args, [[tracker.id]]);
			assert.strictEqual(tracker.isRunning, false);

			task3Detached.end();
		});

		test('adds tests to run smartly', () => {
			const task1 = c.createTestRun('ctrl', req, 'hello world', false);
			const tracker = Iterable.first(c.trackers)!;
			const expectedArgs: unknown[][] = [];
			assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);
			single.expand(single.root.id, Infinity);

			task1.setState(single.root.children.get('id-a')!.children.get('id-aa')!, TestResultState.Passed);
			expectedArgs.push([
				'ctrl',
				tracker.id,
				[
					convert.TestItem.from(single.root),
					convert.TestItem.from(single.root.children.get('id-a')!),
					convert.TestItem.from(single.root.children.get('id-a')!.children.get('id-aa')!),
				]
			]);
			assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);


			task1.setState(single.root.children.get('id-a')!.children.get('id-ab')!, TestResultState.Queued);
			expectedArgs.push([
				'ctrl',
				tracker.id,
				[
					convert.TestItem.from(single.root.children.get('id-a')!),
					convert.TestItem.from(single.root.children.get('id-a')!.children.get('id-ab')!),
				],
			]);
			assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);

			task1.setState(single.root.children.get('id-a')!.children.get('id-ab')!, TestResultState.Passed);
			assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);
		});

		test('guards calls after runs are ended', () => {
			const task = c.createTestRun('ctrl', req, 'hello world', false);
			task.end();

			task.setState(single.root, TestResultState.Passed);
			task.appendMessage(single.root, new TestMessage('some message'));
			task.appendOutput('output');

			assert.strictEqual(proxy.$addTestsToRun.called, false);
			assert.strictEqual(proxy.$appendOutputToRun.called, false);
			assert.strictEqual(proxy.$appendTestMessageInRun.called, false);
		});

		test('excludes tests outside tree or explicitly excluded', () => {
			single.expand(single.root.id, Infinity);

			const task = c.createTestRun('ctrl', {
				debug: false,
				tests: [single.root.children.get('id-a')!],
				exclude: [single.root.children.get('id-a')!.children.get('id-aa')!],
			}, 'hello world', false);

			task.setState(single.root.children.get('b')!, TestResultState.Passed);
			task.setState(single.root.children.get('id-a')!.children.get('id-aa')!, TestResultState.Passed);
			task.setState(single.root.children.get('id-a')!.children.get('id-ab')!, TestResultState.Passed);

			assert.deepStrictEqual(proxy.$updateTestStateInRun.args.length, 1);
			const args = proxy.$updateTestStateInRun.args[0];
			assert.deepStrictEqual(proxy.$updateTestStateInRun.args, [[
				args[0],
				args[1],
				'id-ab',
				TestResultState.Passed,
				undefined,
			]]);
		});
	});
});
