/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { InternalTestItem } from 'vs/workbench/contrib/testing/common/testCollection';
import { LiveTestResult, makeEmptyCounts, TestResultItemChange, TestResultItemChangeReason, TestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { ReExportedTestRunState as TestRunState } from 'vs/workbench/contrib/testing/common/testStubs';
import { getInitializedMainTestCollection } from 'vs/workbench/contrib/testing/test/common/ownedTestCollection';
import { TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

suite('Workbench - Test Results Service', () => {
	const getLabelsIn = (it: Iterable<InternalTestItem>) => [...it].map(t => t.item.label).sort();
	const getChangeSummary = () => [...changed]
		.map(c => ({ reason: c.reason, label: c.item.item.label }))
		.sort((a, b) => a.label.localeCompare(b.label));

	let r: LiveTestResult;
	let changed = new Set<TestResultItemChange>();

	setup(() => {
		changed = new Set();
		r = LiveTestResult.from(
			[getInitializedMainTestCollection()],
			{ tests: [{ providerId: 'provider', testId: '1' }], debug: false }
		);

		r.onChange(e => changed.add(e));
	});

	suite('LiveTestResult', () => {
		test('is empty if no tests are requesteed', () => {
			const r = LiveTestResult.from([getInitializedMainTestCollection()], { tests: [], debug: false });
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
			r.setAllToState({ state: TestRunState.Queued, duration: 0, messages: [] }, t => t.item.label !== 'root');
			assert.deepStrictEqual(r.counts, {
				...makeEmptyCounts(),
				[TestRunState.Unset]: 1,
				[TestRunState.Queued]: 3,
			});

			assert.deepStrictEqual(r.getStateByExtId('root\0a')?.state.state, TestRunState.Queued);
			assert.deepStrictEqual(getChangeSummary(), [
				{ label: 'a', reason: TestResultItemChangeReason.OwnStateChange },
				{ label: 'aa', reason: TestResultItemChangeReason.OwnStateChange },
				{ label: 'ab', reason: TestResultItemChangeReason.OwnStateChange },
				{ label: 'root', reason: TestResultItemChangeReason.ComputedStateChange },
			]);
		});

		test('updateState', () => {
			r.updateState('1', { state: TestRunState.Running, duration: 0, messages: [] });
			assert.deepStrictEqual(r.counts, {
				...makeEmptyCounts(),
				[TestRunState.Running]: 1,
				[TestRunState.Unset]: 3,
			});
			assert.deepStrictEqual(r.getStateByExtId('root\0a')?.state.state, TestRunState.Running);
			// update computed state:
			assert.deepStrictEqual(r.getStateByExtId('root')?.computedState, TestRunState.Running);
			assert.deepStrictEqual(getChangeSummary(), [
				{ label: 'a', reason: TestResultItemChangeReason.OwnStateChange },
				{ label: 'root', reason: TestResultItemChangeReason.ComputedStateChange },
			]);
		});

		test('retire', () => {
			r.retire('root\0a');
			assert.deepStrictEqual(getChangeSummary(), [
				{ label: 'a', reason: TestResultItemChangeReason.Retired },
				{ label: 'aa', reason: TestResultItemChangeReason.ParentRetired },
				{ label: 'ab', reason: TestResultItemChangeReason.ParentRetired },
			]);

			changed.clear();
			r.retire('root\0a');
			assert.strictEqual(changed.size, 0);
		});

		test('addTestToRun', () => {
			r.updateState('4', { state: TestRunState.Running, duration: 0, messages: [] });
			assert.deepStrictEqual(r.counts, {
				...makeEmptyCounts(),
				[TestRunState.Running]: 1,
				[TestRunState.Unset]: 4,
			});
			assert.deepStrictEqual(r.getStateByExtId('root\0b')?.state.state, TestRunState.Running);
			// update computed state:
			assert.deepStrictEqual(r.getStateByExtId('root')?.computedState, TestRunState.Running);
		});

		test('markComplete', () => {
			r.setAllToState({ state: TestRunState.Queued, duration: 0, messages: [] }, t => true);
			r.updateState('2', { state: TestRunState.Passed, duration: 0, messages: [] });
			changed.clear();

			r.markComplete();

			assert.deepStrictEqual(r.counts, {
				...makeEmptyCounts(),
				[TestRunState.Passed]: 1,
				[TestRunState.Unset]: 3,
			});

			assert.deepStrictEqual(r.getStateByExtId('root')?.state.state, TestRunState.Unset);
			assert.deepStrictEqual(r.getStateByExtId('root\0a\0aa')?.state.state, TestRunState.Passed);
		});
	});

	suite('service', () => {
		let storage: TestStorageService;
		let results: TestResultService;

		setup(() => {
			storage = new TestStorageService();
			results = new TestResultService(
				new MockContextKeyService(),
				storage,
			);
		});

		test('pushes new result', () => {
			results.push(r);
			assert.deepStrictEqual(results.results, [r]);
		});

		test('serializes and re-hydrates', () => {
			results.push(r);
			r.updateState('2', { state: TestRunState.Passed, duration: 0, messages: [] });
			r.markComplete();

			results = new TestResultService(
				new MockContextKeyService(),
				storage,
			);

			const [rehydrated, actual] = results.getStateByExtId('root')!;
			const expected = r.getStateByExtId('root')!;
			delete expected.state.duration; // delete undefined props that don't survive serialization
			delete expected.item.location;

			assert.deepStrictEqual(actual, { ...expected, retired: true });
			assert.deepStrictEqual(rehydrated.counts, r.counts);
			assert.strictEqual(rehydrated.isComplete, true);
		});

		test('clears results but keeps ongoing tests', () => {
			results.push(r);
			r.markComplete();

			const r2 = results.push(LiveTestResult.from(
				[getInitializedMainTestCollection()],
				{ tests: [{ providerId: 'provider', testId: '1' }], debug: false }
			));
			results.clear();

			assert.deepStrictEqual(results.results, [r2]);
		});

		test('keeps ongoing tests on top', () => {
			results.push(r);
			const r2 = results.push(LiveTestResult.from(
				[getInitializedMainTestCollection()],
				{ tests: [{ providerId: 'provider', testId: '1' }], debug: false }
			));

			assert.deepStrictEqual(results.results, [r2, r]);
			r2.markComplete();
			assert.deepStrictEqual(results.results, [r, r2]);
			r.markComplete();
			assert.deepStrictEqual(results.results, [r, r2]);
		});
	});
});
