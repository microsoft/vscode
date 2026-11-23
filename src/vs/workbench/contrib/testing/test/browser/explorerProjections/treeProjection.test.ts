/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { TreeProjection } from '../../../browser/explorerProjections/treeProjection.js';
import { TestId } from '../../../common/testId.js';
import { TestResultItemChange, TestResultItemChangeReason } from '../../../common/testResult.js';
import { TestDiffOpType, TestItemExpandState, TestResultItem, TestResultState, TestRunProfileBitset } from '../../../common/testTypes.js';
import { TestTreeTestHarness } from '../testObjectTree.js';
import { TestTestItem } from '../../common/testStubs.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ITestResultService, TestResultService } from '../../../common/testResultService.js';
import { ITestResultStorage } from '../../../common/testResultStorage.js';
import { ITestProfileService } from '../../../common/testProfileService.js';

class TestHierarchicalByLocationProjection extends TreeProjection {
}

suite('Workbench - Testing Explorer Hierarchal by Location Projection', () => {
	let harness: TestTreeTestHarness<TestHierarchicalByLocationProjection>;
	let onTestChanged: Emitter<TestResultItemChange>;
	let resultsService: ITestResultService;
	teardown(() => sinon.restore());
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		onTestChanged = ds.add(new Emitter());
		resultsService = upcastPartial<ITestResultService>({
			results: [],
			onResultsChanged: Event.None,
			onTestChanged: onTestChanged.event,
			getStateById: () => undefined,
		});

		harness = ds.add(new TestTreeTestHarness(l => new TestHierarchicalByLocationProjection({}, l, resultsService)));
	});

	test('renders initial tree', async () => {
		harness.flush();
		assert.deepStrictEqual(harness.tree.getRendered(), [
			{ e: 'a' }, { e: 'b' }
		]);
	});

	test('expands children', async () => {
		harness.flush();
		harness.tree.expand(harness.projection.getElementByTestId(new TestId(['ctrlId', 'id-a']).toString())!);
		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }] }, { e: 'b' }
		]);
	});

	test('updates render if second test provider appears', async () => {
		harness.flush();
		harness.pushDiff({
			op: TestDiffOpType.Add,
			item: { controllerId: 'ctrl2', expand: TestItemExpandState.Expanded, item: new TestTestItem(new TestId(['ctrlId2']), 'c').toTestItem() },
		}, {
			op: TestDiffOpType.Add,
			item: { controllerId: 'ctrl2', expand: TestItemExpandState.NotExpandable, item: new TestTestItem(new TestId(['ctrlId2', 'id-c']), 'ca').toTestItem() },
		});

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'c', children: [{ e: 'ca' }] },
			{ e: 'root', children: [{ e: 'a' }, { e: 'b' }] }
		]);
	});

	test('updates nodes if they add children', async () => {
		harness.flush();
		harness.tree.expand(harness.projection.getElementByTestId(new TestId(['ctrlId', 'id-a']).toString())!);

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }] },
			{ e: 'b' }
		]);

		harness.c.root.children.get('id-a')!.children.add(new TestTestItem(new TestId(['ctrlId', 'id-a', 'id-ac']), 'ac'));

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }, { e: 'ac' }] },
			{ e: 'b' }
		]);
	});

	test('updates nodes if they remove children', async () => {
		harness.flush();
		harness.tree.expand(harness.projection.getElementByTestId(new TestId(['ctrlId', 'id-a']).toString())!);

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }] },
			{ e: 'b' }
		]);

		harness.c.root.children.get('id-a')!.children.delete('id-ab');

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'aa' }] },
			{ e: 'b' }
		]);
	});

	test('applies state changes', async () => {
		harness.flush();

		const resultInState = (state: TestResultState): TestResultItem => ({
			item: {
				extId: new TestId(['ctrlId', 'id-a']).toString(),
				busy: false,
				description: null,
				error: null,
				label: 'a',
				range: null,
				sortText: null,
				tags: [],
				uri: undefined,
			},
			tasks: [],
			ownComputedState: state,
			computedState: state,
			expand: 0,
			controllerId: 'ctrl',
		});

		// Applies the change:
		resultsService.getStateById = () => [undefined!, resultInState(TestResultState.Queued)];
		onTestChanged.fire({
			reason: TestResultItemChangeReason.OwnStateChange,
			result: undefined!,
			previousState: TestResultState.Unset,
			item: resultInState(TestResultState.Queued),
			previousOwnDuration: undefined,
		});
		harness.projection.applyTo(harness.tree);

		assert.deepStrictEqual(harness.tree.getRendered('state'), [
			{ e: 'a', data: String(TestResultState.Queued) },
			{ e: 'b', data: String(TestResultState.Unset) }
		]);

		// Falls back if moved into unset state:
		resultsService.getStateById = () => [undefined!, resultInState(TestResultState.Failed)];
		onTestChanged.fire({
			reason: TestResultItemChangeReason.OwnStateChange,
			result: undefined!,
			previousState: TestResultState.Queued,
			item: resultInState(TestResultState.Unset),
			previousOwnDuration: undefined,
		});
		harness.projection.applyTo(harness.tree);

		assert.deepStrictEqual(harness.tree.getRendered('state'), [
			{ e: 'a', data: String(TestResultState.Failed) },
			{ e: 'b', data: String(TestResultState.Unset) }
		]);
	});

	test('does not recompute children for a computed state notification', () => {
		harness.flush();
		const parent = harness.projection.getElementByTestId('ctrlId\0id-a')!;
		harness.tree.expand(parent);
		harness.flush();
		const child = harness.projection.getElementByTestId('ctrlId\0id-a\0id-aa')!;
		onTestChanged.fire({
			reason: TestResultItemChangeReason.OwnStateChange,
			result: undefined!,
			previousState: TestResultState.Unset,
			previousOwnDuration: undefined,
			item: { ...child.test, tasks: [], ownComputedState: TestResultState.Running, computedState: TestResultState.Running },
		});

		const children = sinon.spy(parent.children, 'values');
		try {
			onTestChanged.fire({
				reason: TestResultItemChangeReason.ComputedStateChange,
				result: undefined!,
				item: { ...parent.test, tasks: [], ownComputedState: TestResultState.Unset, computedState: TestResultState.Running, retired: true },
			});
			assert.deepStrictEqual({ state: parent.state, retired: parent.retired, scans: children.callCount }, { state: TestResultState.Running, retired: true, scans: 0 });
		} finally {
			children.restore();
		}
	});

	test('updates durations after removing a child with a zero duration', () => {
		harness.flush();
		const parent = harness.projection.getElementByTestId('ctrlId\0id-a')!;
		harness.tree.expand(parent);
		harness.flush();
		const first = harness.projection.getElementByTestId('ctrlId\0id-a\0id-aa')!;
		const second = harness.projection.getElementByTestId('ctrlId\0id-a\0id-ab')!;
		const updateDuration = (item: typeof first, ownDuration: number | undefined, previousOwnDuration?: number) => onTestChanged.fire({
			reason: TestResultItemChangeReason.OwnStateChange,
			result: undefined!,
			previousState: TestResultState.Passed,
			previousOwnDuration,
			item: { ...item.test, tasks: [], ownComputedState: TestResultState.Passed, computedState: TestResultState.Passed, ownDuration },
		});
		updateDuration(first, 0);
		harness.c.root.children.get('id-a')!.children.delete('id-aa');
		harness.flush();
		assert.strictEqual(parent.duration, undefined);
		updateDuration(second, 2);
		updateDuration(second, undefined, 2);
		assert.strictEqual(parent.duration, undefined);
	});

	test('applies test changes (resort)', async () => {
		harness.flush();
		harness.tree.expand(harness.projection.getElementByTestId(new TestId(['ctrlId', 'id-a']).toString())!);
		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }] }, { e: 'b' }
		]);
		// sortText causes order to change
		harness.pushDiff({
			op: TestDiffOpType.Update,
			item: { extId: new TestId(['ctrlId', 'id-a', 'id-aa']).toString(), item: { sortText: 'z' } }
		}, {
			op: TestDiffOpType.Update,
			item: { extId: new TestId(['ctrlId', 'id-a', 'id-ab']).toString(), item: { sortText: 'a' } }
		});
		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'ab' }, { e: 'aa' }] }, { e: 'b' }
		]);
		// label causes order to change
		harness.pushDiff({
			op: TestDiffOpType.Update,
			item: { extId: new TestId(['ctrlId', 'id-a', 'id-aa']).toString(), item: { sortText: undefined, label: 'z' } }
		}, {
			op: TestDiffOpType.Update,
			item: { extId: new TestId(['ctrlId', 'id-a', 'id-ab']).toString(), item: { sortText: undefined, label: 'a' } }
		});
		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'a' }, { e: 'z' }] }, { e: 'b' }
		]);
		harness.pushDiff({
			op: TestDiffOpType.Update,
			item: { extId: new TestId(['ctrlId', 'id-a', 'id-aa']).toString(), item: { label: 'a2' } }
		}, {
			op: TestDiffOpType.Update,
			item: { extId: new TestId(['ctrlId', 'id-a', 'id-ab']).toString(), item: { label: 'z2' } }
		});
		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'a2' }, { e: 'z2' }] }, { e: 'b' }
		]);
	});

	test('applies test changes (error)', async () => {
		harness.flush();
		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a' }, { e: 'b' }
		]);
		// sortText causes order to change
		harness.pushDiff({
			op: TestDiffOpType.Update,
			item: { extId: new TestId(['ctrlId', 'id-a']).toString(), item: { error: 'bad' } }
		});
		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a' }, { e: 'b' }
		]);
		harness.tree.expand(harness.projection.getElementByTestId(new TestId(['ctrlId', 'id-a']).toString())!);
		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'bad' }, { e: 'aa' }, { e: 'ab' }] }, { e: 'b' }
		]);
		harness.pushDiff({
			op: TestDiffOpType.Update,
			item: { extId: new TestId(['ctrlId', 'id-a']).toString(), item: { error: 'badder' } }
		});
		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'badder' }, { e: 'aa' }, { e: 'ab' }] }, { e: 'b' }
		]);

	});

	test('fixes #204805', async () => {
		harness.flush();
		harness.pushDiff({
			op: TestDiffOpType.Remove,
			itemId: 'ctrlId',
		}, {
			op: TestDiffOpType.Add,
			item: { controllerId: 'ctrlId', expand: TestItemExpandState.NotExpandable, item: new TestTestItem(new TestId(['ctrlId']), 'ctrl').toTestItem() },
		}, {
			op: TestDiffOpType.Add,
			item: { controllerId: 'ctrlId', expand: TestItemExpandState.NotExpandable, item: new TestTestItem(new TestId(['ctrlId', 'a']), 'a').toTestItem() },
		});

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a' }
		]);

		harness.pushDiff({
			op: TestDiffOpType.Add,
			item: { controllerId: 'ctrlId', expand: TestItemExpandState.NotExpandable, item: new TestTestItem(new TestId(['ctrlId', 'a', 'b']), 'b').toTestItem() },
		});
		harness.flush();
		harness.tree.expandAll();
		assert.deepStrictEqual(harness.tree.getRendered(), [
			{ e: 'a', children: [{ e: 'b' }] }
		]);

		harness.pushDiff({
			op: TestDiffOpType.Add,
			item: { controllerId: 'ctrlId', expand: TestItemExpandState.NotExpandable, item: new TestTestItem(new TestId(['ctrlId', 'a', 'b', 'c']), 'c').toTestItem() },
		});
		harness.flush();
		harness.tree.expandAll();
		assert.deepStrictEqual(harness.tree.getRendered(), [
			{ e: 'a', children: [{ e: 'b', children: [{ e: 'c' }] }] }
		]);
	});

	test('fixes #213316 (single root)', async () => {
		harness.flush();
		assert.deepStrictEqual(harness.tree.getRendered(), [
			{ e: 'a' }, { e: 'b' }
		]);
		harness.pushDiff({
			op: TestDiffOpType.Remove,
			itemId: new TestId(['ctrlId', 'id-a']).toString(),
		});
		harness.flush();
		assert.deepStrictEqual(harness.tree.getRendered(), [
			{ e: 'b' }
		]);
	});

	test('fixes #213316 (multi root)', async () => {
		harness.pushDiff({
			op: TestDiffOpType.Add,
			item: { controllerId: 'ctrl2', expand: TestItemExpandState.Expanded, item: new TestTestItem(new TestId(['ctrlId2']), 'c').toTestItem() },
		}, {
			op: TestDiffOpType.Add,
			item: { controllerId: 'ctrl2', expand: TestItemExpandState.NotExpandable, item: new TestTestItem(new TestId(['ctrlId2', 'id-c']), 'ca').toTestItem() },
		});
		harness.flush();
		assert.deepStrictEqual(harness.flush(), [
			{ e: 'c', children: [{ e: 'ca' }] },
			{ e: 'root', children: [{ e: 'a' }, { e: 'b' }] }
		]);

		harness.pushDiff({
			op: TestDiffOpType.Remove,
			itemId: new TestId(['ctrlId', 'id-a']).toString(),
		});
		harness.flush();
		assert.deepStrictEqual(harness.tree.getRendered(), [
			{ e: 'c', children: [{ e: 'ca' }] },
			{ e: 'root', children: [{ e: 'b' }] }
		]);

		harness.pushDiff({
			op: TestDiffOpType.Remove,
			itemId: new TestId(['ctrlId', 'id-b']).toString(),
		});
		harness.flush();
		assert.deepStrictEqual(harness.tree.getRendered(), [
			{ e: 'ca' }
		]);
	});
});

suite('Workbench - Testing Explorer result clearing', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	for (const completed of [false, true]) {
		test(`recomputes suite state when clearing ${completed ? 'completed' : 'active'} results and retiring tests`, () => {
			const results = ds.add(new TestResultService(
				new MockContextKeyService(),
				upcastPartial<ITestResultStorage>({ read: async () => [], persist: async () => { } }),
				upcastPartial<ITestProfileService>({}),
				NullTelemetryService,
			));
			const harness = ds.add(new TestTreeTestHarness(l => new TreeProjection({}, l, results)));
			harness.flush();
			const suite = harness.projection.getElementByTestId('ctrlId\0id-a')!;
			harness.tree.expand(suite);
			harness.flush();
			const child = harness.projection.getElementByTestId('ctrlId\0id-a\0id-aa')!;
			const root = harness.projection.getElementByTestId('ctrlId')!;
			const result = ds.add(results.createLiveResult({ group: TestRunProfileBitset.Run, targets: [] }));
			result.addTask({ id: 'task', name: 'task', running: true, ctrlId: 'ctrlId' });
			result.addTestChainToRun('ctrlId', [root.test.item, suite.test.item, child.test.item]);
			result.updateState(child.test.item.extId, 'task', TestResultState.Passed, 7);
			if (completed) {
				result.updateState(suite.test.item.extId, 'task', TestResultState.Passed, 11);
				result.markComplete();
			}

			results.clear();
			const afterClear = [suite.state, child.state, suite.duration, child.duration];
			result.markRetired(undefined);
			assert.deepStrictEqual({ afterClear, afterRetirement: [suite.state, child.state, suite.duration, child.duration] }, completed ? {
				afterClear: [TestResultState.Unset, TestResultState.Unset, undefined, undefined],
				afterRetirement: [TestResultState.Unset, TestResultState.Unset, undefined, undefined],
			} : {
				afterClear: [TestResultState.Passed, TestResultState.Passed, 7, 7],
				afterRetirement: [TestResultState.Passed, TestResultState.Passed, 7, 7],
			});
		});
	}
});

suite('Workbench - Testing Explorer result durations', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	for (const ownDuration of [0, 20]) {
		test(`recomputes suite duration across results after an own duration of ${ownDuration}`, () => {
			const results = ds.add(new TestResultService(
				new MockContextKeyService(),
				upcastPartial<ITestResultStorage>({ read: async () => [], persist: async () => { } }),
				upcastPartial<ITestProfileService>({}),
				NullTelemetryService,
			));
			const harness = ds.add(new TestTreeTestHarness(l => new TreeProjection({}, l, results)));
			harness.flush();
			const suite = harness.projection.getElementByTestId('ctrlId\0id-a')!;
			harness.tree.expand(suite);
			harness.flush();
			const child = harness.projection.getElementByTestId('ctrlId\0id-a\0id-aa')!;
			const root = harness.projection.getElementByTestId('ctrlId')!;
			const createResult = () => {
				const result = ds.add(results.createLiveResult({ group: TestRunProfileBitset.Run, targets: [] }));
				result.addTask({ id: 'task', name: 'task', running: true, ctrlId: 'ctrlId' });
				result.addTestChainToRun('ctrlId', [root.test.item, suite.test.item, child.test.item]);
				result.updateState(suite.test.item.extId, 'task', TestResultState.Running);
				return result;
			};

			const first = createResult();
			first.updateState(child.test.item.extId, 'task', TestResultState.Passed, 5);
			first.updateState(suite.test.item.extId, 'task', TestResultState.Passed, ownDuration);
			first.markComplete();
			const durations = [[suite.duration, child.duration]];

			const second = createResult();
			second.updateState(child.test.item.extId, 'task', TestResultState.Passed, 3);
			durations.push([suite.duration, child.duration]);
			second.markComplete();

			const third = createResult();
			third.updateState(child.test.item.extId, 'task', TestResultState.Passed, 4);
			durations.push([suite.duration, child.duration]);
			third.markComplete();

			assert.deepStrictEqual(durations, [[ownDuration, 5], [3, 3], [4, 4]]);
		});
	}
});
