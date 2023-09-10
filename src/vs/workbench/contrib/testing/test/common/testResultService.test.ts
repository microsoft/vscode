/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { timeout } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { NullLogService } from 'vs/platform/log/common/log';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { TestProfileService } from 'vs/workbench/contrib/testing/common/testProfileService';
import { HydratedTestResult, LiveTestResult, TaskRawOutput, TestResultItemChange, TestResultItemChangeReason, resultItemParents } from 'vs/workbench/contrib/testing/common/testResult';
import { TestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestResultStorage, InMemoryResultStorage } from 'vs/workbench/contrib/testing/common/testResultStorage';
import { ITestTaskState, ResolvedTestRunRequest, TestResultItem, TestResultState, TestRunProfileBitset } from 'vs/workbench/contrib/testing/common/testTypes';
import { makeEmptyCounts } from 'vs/workbench/contrib/testing/common/testingStates';
import { TestTestCollection, getInitializedMainTestCollection, testStubs } from 'vs/workbench/contrib/testing/test/common/testStubs';
import { TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

suite('Workbench - Test Results Service', () => {
	const getLabelsIn = (it: Iterable<TestResultItem>) => [...it].map(t => t.item.label).sort();
	const getChangeSummary = () => [...changed]
		.map(c => ({ reason: c.reason, label: c.item.item.label }));

	let r: TestLiveTestResult;
	let changed = new Set<TestResultItemChange>();
	let tests: TestTestCollection;

	const defaultOpts = (testIds: string[]): ResolvedTestRunRequest => ({
		targets: [{
			profileGroup: TestRunProfileBitset.Run,
			profileId: 0,
			controllerId: 'ctrlId',
			testIds,
		}]
	});

	class TestLiveTestResult extends LiveTestResult {
		constructor(
			id: string,
			persist: boolean,
			request: ResolvedTestRunRequest,
		) {
			super(id, persist, request);
			ds.add(this);
		}

		public setAllToStatePublic(state: TestResultState, taskId: string, when: (task: ITestTaskState, item: TestResultItem) => boolean) {
			this.setAllToState(state, taskId, when);
		}
	}

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		changed = new Set();
		r = ds.add(new TestLiveTestResult(
			'foo',
			true,
			defaultOpts(['id-a']),
		));

		ds.add(r.onChange(e => changed.add(e)));
		r.addTask({ id: 't', name: undefined, running: true });

		tests = ds.add(testStubs.nested());
		const cts = ds.add(new CancellationTokenSource());
		const ok = await Promise.race([
			Promise.resolve(tests.expand(tests.root.id, Infinity)).then(() => true),
			timeout(1000, cts.token).then(() => false),
		]);
		cts.cancel();

		// todo@connor4312: debug for tests #137853:
		if (!ok) {
			throw new Error('timed out while expanding, diff: ' + JSON.stringify(tests.collectDiff()));
		}

		r.addTestChainToRun('ctrlId', [
			tests.root.toTestItem(),
			tests.root.children.get('id-a')!.toTestItem(),
			tests.root.children.get('id-a')!.children.get('id-aa')!.toTestItem(),
		]);

		r.addTestChainToRun('ctrlId', [
			tests.root.children.get('id-a')!.toTestItem(),
			tests.root.children.get('id-a')!.children.get('id-ab')!.toTestItem(),
		]);
	});

	// ensureNoDisposablesAreLeakedInTestSuite(); todo@connor4312

	suite('LiveTestResult', () => {
		test('is empty if no tests are yet present', async () => {
			assert.deepStrictEqual(getLabelsIn(new TestLiveTestResult(
				'foo',
				false,
				defaultOpts(['id-a']),
			).tests), []);
		});

		test('initially queues nothing', () => {
			assert.deepStrictEqual(getChangeSummary(), []);
		});

		test('initializes with the subtree of requested tests', () => {
			assert.deepStrictEqual(getLabelsIn(r.tests), ['a', 'aa', 'ab', 'root']);
		});

		test('initializes with valid counts', () => {
			const c = makeEmptyCounts();
			c[TestResultState.Unset] = 4;
			assert.deepStrictEqual(r.counts, c);
		});

		test('setAllToState', () => {
			changed.clear();
			r.setAllToStatePublic(TestResultState.Queued, 't', (_, t) => t.item.label !== 'root');
			const c = makeEmptyCounts();
			c[TestResultState.Unset] = 1;
			c[TestResultState.Queued] = 3;
			assert.deepStrictEqual(r.counts, c);

			r.setAllToStatePublic(TestResultState.Failed, 't', (_, t) => t.item.label !== 'root');
			const c2 = makeEmptyCounts();
			c2[TestResultState.Unset] = 1;
			c2[TestResultState.Failed] = 3;
			assert.deepStrictEqual(r.counts, c2);

			assert.deepStrictEqual(r.getStateById(new TestId(['ctrlId', 'id-a']).toString())?.ownComputedState, TestResultState.Failed);
			assert.deepStrictEqual(r.getStateById(new TestId(['ctrlId', 'id-a']).toString())?.tasks[0].state, TestResultState.Failed);
			assert.deepStrictEqual(getChangeSummary(), [
				{ label: 'a', reason: TestResultItemChangeReason.OwnStateChange },
				{ label: 'root', reason: TestResultItemChangeReason.ComputedStateChange },
				{ label: 'aa', reason: TestResultItemChangeReason.OwnStateChange },
				{ label: 'ab', reason: TestResultItemChangeReason.OwnStateChange },

				{ label: 'a', reason: TestResultItemChangeReason.OwnStateChange },
				{ label: 'root', reason: TestResultItemChangeReason.ComputedStateChange },
				{ label: 'aa', reason: TestResultItemChangeReason.OwnStateChange },
				{ label: 'ab', reason: TestResultItemChangeReason.OwnStateChange },
			]);
		});

		test('updateState', () => {
			changed.clear();
			const testId = new TestId(['ctrlId', 'id-a', 'id-aa']).toString();
			r.updateState(testId, 't', TestResultState.Running);
			const c = makeEmptyCounts();
			c[TestResultState.Running] = 1;
			c[TestResultState.Unset] = 3;
			assert.deepStrictEqual(r.counts, c);
			assert.deepStrictEqual(r.getStateById(testId)?.ownComputedState, TestResultState.Running);
			// update computed state:
			assert.deepStrictEqual(r.getStateById(tests.root.id)?.computedState, TestResultState.Running);
			assert.deepStrictEqual(getChangeSummary(), [
				{ label: 'aa', reason: TestResultItemChangeReason.OwnStateChange },
				{ label: 'a', reason: TestResultItemChangeReason.ComputedStateChange },
				{ label: 'root', reason: TestResultItemChangeReason.ComputedStateChange },
			]);

			r.updateState(testId, 't', TestResultState.Passed);
			assert.deepStrictEqual(r.getStateById(testId)?.ownComputedState, TestResultState.Passed);

			r.updateState(testId, 't', TestResultState.Errored);
			assert.deepStrictEqual(r.getStateById(testId)?.ownComputedState, TestResultState.Errored);

			r.updateState(testId, 't', TestResultState.Passed);
			assert.deepStrictEqual(r.getStateById(testId)?.ownComputedState, TestResultState.Errored);
		});

		test('ignores outside run', () => {
			changed.clear();
			r.updateState(new TestId(['ctrlId', 'id-b']).toString(), 't', TestResultState.Running);
			const c = makeEmptyCounts();
			c[TestResultState.Unset] = 4;
			assert.deepStrictEqual(r.counts, c);
			assert.deepStrictEqual(r.getStateById(new TestId(['ctrlId', 'id-b']).toString()), undefined);
		});

		test('markComplete', () => {
			r.setAllToStatePublic(TestResultState.Queued, 't', () => true);
			r.updateState(new TestId(['ctrlId', 'id-a', 'id-aa']).toString(), 't', TestResultState.Passed);
			changed.clear();

			r.markComplete();

			const c = makeEmptyCounts();
			c[TestResultState.Unset] = 3;
			c[TestResultState.Passed] = 1;
			assert.deepStrictEqual(r.counts, c);

			assert.deepStrictEqual(r.getStateById(tests.root.id)?.ownComputedState, TestResultState.Unset);
			assert.deepStrictEqual(r.getStateById(new TestId(['ctrlId', 'id-a', 'id-aa']).toString())?.ownComputedState, TestResultState.Passed);
		});
	});

	suite('service', () => {
		let storage: ITestResultStorage;
		let results: TestResultService;

		class TestTestResultService extends TestResultService {
			protected override persistScheduler = { schedule: () => this.persistImmediately() } as any;
		}

		setup(() => {
			storage = ds.add(new InMemoryResultStorage(ds.add(new TestStorageService()), new NullLogService()));
			results = ds.add(new TestTestResultService(new MockContextKeyService(), storage, ds.add(new TestProfileService(new MockContextKeyService(), ds.add(new TestStorageService())))));
		});

		test('pushes new result', () => {
			results.push(r);
			assert.deepStrictEqual(results.results, [r]);
		});

		test('serializes and re-hydrates', async () => {
			results.push(r);
			r.updateState(new TestId(['ctrlId', 'id-a', 'id-aa']).toString(), 't', TestResultState.Passed, 42);
			r.markComplete();
			await timeout(10); // allow persistImmediately async to happen

			results = ds.add(new TestResultService(
				new MockContextKeyService(),
				storage,
				ds.add(new TestProfileService(new MockContextKeyService(), ds.add(new TestStorageService()))),
			));

			assert.strictEqual(0, results.results.length);
			await timeout(10); // allow load promise to resolve
			assert.strictEqual(1, results.results.length);

			const [rehydrated, actual] = results.getStateById(tests.root.id)!;
			const expected: any = { ...r.getStateById(tests.root.id)! };
			expected.item.uri = actual.item.uri;
			expected.item.children = undefined;
			expected.retired = true;
			delete expected.children;
			assert.deepStrictEqual(actual, { ...expected });
			assert.deepStrictEqual(rehydrated.counts, r.counts);
			assert.strictEqual(typeof rehydrated.completedAt, 'number');
		});

		test('clears results but keeps ongoing tests', async () => {
			results.push(r);
			r.markComplete();

			const r2 = results.push(new LiveTestResult(
				'',
				false,
				defaultOpts([]),
			));
			results.clear();

			assert.deepStrictEqual(results.results, [r2]);
		});

		test('keeps ongoing tests on top', async () => {
			results.push(r);
			const r2 = results.push(new LiveTestResult(
				'',
				false,
				defaultOpts([]),
			));

			assert.deepStrictEqual(results.results, [r2, r]);
			r2.markComplete();
			assert.deepStrictEqual(results.results, [r, r2]);
			r.markComplete();
			assert.deepStrictEqual(results.results, [r, r2]);
		});

		const makeHydrated = async (completedAt = 42, state = TestResultState.Passed) => new HydratedTestResult({
			completedAt,
			id: 'some-id',
			tasks: [{ id: 't', name: undefined }],
			name: 'hello world',
			request: defaultOpts([]),
			items: [{
				...(await getInitializedMainTestCollection()).getNodeById(new TestId(['ctrlId', 'id-a']).toString())!,
				tasks: [{ state, duration: 0, messages: [] }],
				computedState: state,
				ownComputedState: state,
			}]
		});

		test('pushes hydrated results', async () => {
			results.push(r);
			const hydrated = await makeHydrated();
			results.push(hydrated);
			assert.deepStrictEqual(results.results, [r, hydrated]);
		});

		test('inserts in correct order', async () => {
			results.push(r);
			const hydrated1 = await makeHydrated();
			results.push(hydrated1);
			assert.deepStrictEqual(results.results, [r, hydrated1]);
		});

		test('inserts in correct order 2', async () => {
			results.push(r);
			const hydrated1 = await makeHydrated();
			results.push(hydrated1);
			const hydrated2 = await makeHydrated(30);
			results.push(hydrated2);
			assert.deepStrictEqual(results.results, [r, hydrated1, hydrated2]);
		});
	});

	test('resultItemParents', function () {
		assert.deepStrictEqual([...resultItemParents(r, r.getStateById(new TestId(['ctrlId', 'id-a', 'id-aa']).toString())!)], [
			r.getStateById(new TestId(['ctrlId', 'id-a', 'id-aa']).toString()),
			r.getStateById(new TestId(['ctrlId', 'id-a']).toString()),
			r.getStateById(new TestId(['ctrlId']).toString()),
		]);

		assert.deepStrictEqual([...resultItemParents(r, r.getStateById(tests.root.id)!)], [
			r.getStateById(tests.root.id),
		]);
	});

	suite('output controller', () => {
		test('reads live output ranges', async () => {
			const ctrl = new TaskRawOutput();

			ctrl.append(VSBuffer.fromString('12345'));
			ctrl.append(VSBuffer.fromString('67890'));
			ctrl.append(VSBuffer.fromString('12345'));
			ctrl.append(VSBuffer.fromString('67890'));

			assert.deepStrictEqual(ctrl.getRange(0, 5), VSBuffer.fromString('12345'));
			assert.deepStrictEqual(ctrl.getRange(5, 5), VSBuffer.fromString('67890'));
			assert.deepStrictEqual(ctrl.getRange(7, 6), VSBuffer.fromString('890123'));
			assert.deepStrictEqual(ctrl.getRange(15, 5), VSBuffer.fromString('67890'));
			assert.deepStrictEqual(ctrl.getRange(15, 10), VSBuffer.fromString('67890'));
		});

		test('corrects offsets for marked ranges', async () => {
			const ctrl = new TaskRawOutput();

			const a1 = ctrl.append(VSBuffer.fromString('12345'), 1);
			const a2 = ctrl.append(VSBuffer.fromString('67890'), 1234);
			const a3 = ctrl.append(VSBuffer.fromString('with new line\r\n'), 4);

			assert.deepStrictEqual(ctrl.getRange(a1.offset, a1.length), VSBuffer.fromString('\x1b]633;SetMark;Id=s1;Hidden\x0712345\x1b]633;SetMark;Id=e1;Hidden\x07'));
			assert.deepStrictEqual(ctrl.getRange(a2.offset, a2.length), VSBuffer.fromString('\x1b]633;SetMark;Id=s1234;Hidden\x0767890\x1b]633;SetMark;Id=e1234;Hidden\x07'));
			assert.deepStrictEqual(ctrl.getRange(a3.offset, a3.length), VSBuffer.fromString('\x1b]633;SetMark;Id=s4;Hidden\x07with new line\x1b]633;SetMark;Id=e4;Hidden\x07\r\n'));
		});
	});
});
