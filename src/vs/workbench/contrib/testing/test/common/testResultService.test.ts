/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { timeout } from 'vs/base/common/async';
import { bufferToStream, newWriteableBufferStream, VSBuffer } from 'vs/base/common/buffer';
import { Lazy } from 'vs/base/common/lazy';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { NullLogService } from 'vs/platform/log/common/log';
import { InternalTestItem } from 'vs/workbench/contrib/testing/common/testCollection';
import { HydratedTestResult, LiveOutputController, LiveTestResult, makeEmptyCounts, TestResultItemChange, TestResultItemChangeReason } from 'vs/workbench/contrib/testing/common/testResult';
import { TestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { InMemoryResultStorage, ITestResultStorage } from 'vs/workbench/contrib/testing/common/testResultStorage';
import { ReExportedTestRunState as TestRunState } from 'vs/workbench/contrib/testing/common/testStubs';
import { getInitializedMainTestCollection } from 'vs/workbench/contrib/testing/test/common/ownedTestCollection';
import { TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

export const emptyOutputController = () => new LiveOutputController(
	new Lazy(() => [newWriteableBufferStream(), Promise.resolve()]),
	() => Promise.resolve(bufferToStream(VSBuffer.alloc(0))),
);

suite('Workbench - Test Results Service', () => {
	const getLabelsIn = (it: Iterable<InternalTestItem>) => [...it].map(t => t.item.label).sort();
	const getChangeSummary = () => [...changed]
		.map(c => ({ reason: c.reason, label: c.item.item.label }))
		.sort((a, b) => a.label.localeCompare(b.label));

	let r: LiveTestResult;
	let changed = new Set<TestResultItemChange>();

	setup(async () => {
		changed = new Set();
		r = LiveTestResult.from(
			'foo',
			[await getInitializedMainTestCollection()],
			emptyOutputController(),
			{ tests: [{ src: { provider: 'provider', tree: 0 }, testId: 'id-a' }], debug: false },
		);

		r.onChange(e => changed.add(e));
	});

	suite('LiveTestResult', () => {
		test('is empty if no tests are requesteed', async () => {
			const r = LiveTestResult.from('', [await getInitializedMainTestCollection()], emptyOutputController(), { tests: [], debug: false });
			assert.deepStrictEqual(getLabelsIn(r.tests), []);
		});

		test('does not change or retire initially', () => {
			assert.deepStrictEqual(0, changed.size);
		});

		test('initializes with the subtree of requested tests', () => {
			assert.deepStrictEqual(getLabelsIn(r.tests), ['a', 'aa', 'ab', 'root']);
		});

		test('initializes with valid counts', () => {
			assert.deepStrictEqual(r.counts, {
				...makeEmptyCounts(),
				[TestRunState.Unset]: 4
			});
		});

		test('setAllToState', () => {
			r.setAllToState(TestRunState.Queued, t => t.item.label !== 'root');
			assert.deepStrictEqual(r.counts, {
				...makeEmptyCounts(),
				[TestRunState.Unset]: 1,
				[TestRunState.Queued]: 3,
			});

			assert.deepStrictEqual(r.getStateById('id-a')?.state.state, TestRunState.Queued);
			assert.deepStrictEqual(getChangeSummary(), [
				{ label: 'a', reason: TestResultItemChangeReason.OwnStateChange },
				{ label: 'aa', reason: TestResultItemChangeReason.OwnStateChange },
				{ label: 'ab', reason: TestResultItemChangeReason.OwnStateChange },
				{ label: 'root', reason: TestResultItemChangeReason.ComputedStateChange },
			]);
		});

		test('updateState', () => {
			r.updateState('id-a', TestRunState.Running);
			assert.deepStrictEqual(r.counts, {
				...makeEmptyCounts(),
				[TestRunState.Running]: 1,
				[TestRunState.Unset]: 3,
			});
			assert.deepStrictEqual(r.getStateById('id-a')?.state.state, TestRunState.Running);
			// update computed state:
			assert.deepStrictEqual(r.getStateById('id-root')?.computedState, TestRunState.Running);
			assert.deepStrictEqual(getChangeSummary(), [
				{ label: 'a', reason: TestResultItemChangeReason.OwnStateChange },
				{ label: 'root', reason: TestResultItemChangeReason.ComputedStateChange },
			]);
		});

		test('retire', () => {
			r.retire('id-a');
			assert.deepStrictEqual(getChangeSummary(), [
				{ label: 'a', reason: TestResultItemChangeReason.Retired },
				{ label: 'aa', reason: TestResultItemChangeReason.ParentRetired },
				{ label: 'ab', reason: TestResultItemChangeReason.ParentRetired },
			]);

			changed.clear();
			r.retire('id-a');
			assert.strictEqual(changed.size, 0);
		});

		test('addTestToRun', () => {
			r.updateState('id-b', TestRunState.Running);
			assert.deepStrictEqual(r.counts, {
				...makeEmptyCounts(),
				[TestRunState.Running]: 1,
				[TestRunState.Unset]: 4,
			});
			assert.deepStrictEqual(r.getStateById('id-b')?.state.state, TestRunState.Running);
			// update computed state:
			assert.deepStrictEqual(r.getStateById('id-root')?.computedState, TestRunState.Running);
		});

		test('markComplete', () => {
			r.setAllToState(TestRunState.Queued, () => true);
			r.updateState('id-aa', TestRunState.Passed);
			changed.clear();

			r.markComplete();

			assert.deepStrictEqual(r.counts, {
				...makeEmptyCounts(),
				[TestRunState.Passed]: 1,
				[TestRunState.Unset]: 3,
			});

			assert.deepStrictEqual(r.getStateById('id-root')?.state.state, TestRunState.Unset);
			assert.deepStrictEqual(r.getStateById('id-aa')?.state.state, TestRunState.Passed);
		});
	});

	suite('service', () => {
		let storage: ITestResultStorage;
		let results: TestResultService;

		class TestTestResultService extends TestResultService {
			override persistScheduler = { schedule: () => this.persistImmediately() } as any;
		}

		setup(() => {
			storage = new InMemoryResultStorage(new TestStorageService(), new NullLogService());
			results = new TestTestResultService(new MockContextKeyService(), storage);
		});

		test('pushes new result', () => {
			results.push(r);
			assert.deepStrictEqual(results.results, [r]);
		});

		test('serializes and re-hydrates', async () => {
			results.push(r);
			r.updateState('id-aa', TestRunState.Passed);
			r.markComplete();
			await timeout(0); // allow persistImmediately async to happen

			results = new TestResultService(
				new MockContextKeyService(),
				storage,
			);

			assert.strictEqual(0, results.results.length);
			await timeout(0); // allow load promise to resolve
			assert.strictEqual(1, results.results.length);

			const [rehydrated, actual] = results.getStateById('id-root')!;
			const expected: any = { ...r.getStateById('id-root')! };
			delete expected.state.duration; // delete undefined props that don't survive serialization
			delete expected.item.range;
			delete expected.item.description;
			expected.item.uri = actual.item.uri;

			assert.deepStrictEqual(actual, { ...expected, retired: true });
			assert.deepStrictEqual(rehydrated.counts, r.counts);
			assert.strictEqual(typeof rehydrated.completedAt, 'number');
		});

		test('clears results but keeps ongoing tests', async () => {
			results.push(r);
			r.markComplete();

			const r2 = results.push(LiveTestResult.from(
				'',
				[await getInitializedMainTestCollection()],
				emptyOutputController(),
				{ tests: [{ src: { provider: 'provider', tree: 0 }, testId: '1' }], debug: false }
			));
			results.clear();

			assert.deepStrictEqual(results.results, [r2]);
		});

		test('keeps ongoing tests on top', async () => {
			results.push(r);
			const r2 = results.push(LiveTestResult.from(
				'',
				[await getInitializedMainTestCollection()],
				emptyOutputController(),
				{ tests: [{ src: { provider: 'provider', tree: 0 }, testId: '1' }], debug: false }
			));

			assert.deepStrictEqual(results.results, [r2, r]);
			r2.markComplete();
			assert.deepStrictEqual(results.results, [r, r2]);
			r.markComplete();
			assert.deepStrictEqual(results.results, [r, r2]);
		});

		const makeHydrated = async (completedAt = 42, state = TestRunState.Passed) => new HydratedTestResult({
			completedAt,
			id: 'some-id',
			items: [{
				...(await getInitializedMainTestCollection()).getNodeById('id-a')!,
				state: { state, duration: 0, messages: [] },
				computedState: state,
				retired: undefined,
				children: [],
			}]
		}, () => Promise.resolve(bufferToStream(VSBuffer.alloc(0))));

		test('pushes hydrated results', async () => {
			results.push(r);
			const hydrated = await makeHydrated();
			results.push(hydrated);
			assert.deepStrictEqual(results.results, [r, hydrated]);
		});

		test('deduplicates identical results', async () => {
			results.push(r);
			const hydrated1 = await makeHydrated();
			results.push(hydrated1);
			const hydrated2 = await makeHydrated();
			results.push(hydrated2);
			assert.deepStrictEqual(results.results, [r, hydrated1]);
		});

		test('does not deduplicate if different completedAt', async () => {
			results.push(r);
			const hydrated1 = await makeHydrated();
			results.push(hydrated1);
			const hydrated2 = await makeHydrated(30);
			results.push(hydrated2);
			assert.deepStrictEqual(results.results, [r, hydrated1, hydrated2]);
		});

		test('does not deduplicate if different tests', async () => {
			results.push(r);
			const hydrated1 = await makeHydrated();
			results.push(hydrated1);
			const hydrated2 = await makeHydrated(undefined, TestRunState.Failed);
			results.push(hydrated2);
			assert.deepStrictEqual(results.results, [r, hydrated2, hydrated1]);
		});
	});
});
