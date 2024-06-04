/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { TreeProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections/treeProjection';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { TestResultItemChange, TestResultItemChangeReason } from 'vs/workbench/contrib/testing/common/testResult';
import { TestDiffOpType, TestItemExpandState, TestResultItem, TestResultState } from 'vs/workbench/contrib/testing/common/testTypes';
import { TestTreeTestHarness } from 'vs/workbench/contrib/testing/test/browser/testObjectTree';
import { TestTestItem } from 'vs/workbench/contrib/testing/test/common/testStubs';

class TestHierarchicalByLocationProjection extends TreeProjection {
}

suite('Workbench - Testing Explorer Hierarchal by Location Projection', () => {
	let harness: TestTreeTestHarness<TestHierarchicalByLocationProjection>;
	let onTestChanged: Emitter<TestResultItemChange>;
	let resultsService: any;
	let ds: DisposableStore;

	teardown(() => {
		ds.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		ds = new DisposableStore();
		onTestChanged = ds.add(new Emitter());
		resultsService = {
			results: [],
			onResultsChanged: () => undefined,
			onTestChanged: onTestChanged.event,
			getStateById: () => ({ state: { state: 0 }, computedState: 0 }),
		};

		harness = ds.add(new TestTreeTestHarness(l => new TestHierarchicalByLocationProjection({}, l, resultsService as any)));
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
		resultsService.getStateById = () => [undefined, resultInState(TestResultState.Queued)];
		onTestChanged.fire({
			reason: TestResultItemChangeReason.OwnStateChange,
			result: null as any,
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
		resultsService.getStateById = () => [undefined, resultInState(TestResultState.Failed)];
		onTestChanged.fire({
			reason: TestResultItemChangeReason.OwnStateChange,
			result: null as any,
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

	test('applies test changes (resort)', async () => {
		harness.flush();
		harness.tree.expand(harness.projection.getElementByTestId(new TestId(['ctrlId', 'id-a']).toString())!);
		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }] }, { e: 'b' }
		]);
		// sortText causes order to change
		harness.pushDiff({
			op: TestDiffOpType.Update,
			item: { extId: new TestId(['ctrlId', 'id-a', 'id-aa']).toString(), item: { sortText: "z" } }
		}, {
			op: TestDiffOpType.Update,
			item: { extId: new TestId(['ctrlId', 'id-a', 'id-ab']).toString(), item: { sortText: "a" } }
		});
		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'ab' }, { e: 'aa' }] }, { e: 'b' }
		]);
		// label causes order to change
		harness.pushDiff({
			op: TestDiffOpType.Update,
			item: { extId: new TestId(['ctrlId', 'id-a', 'id-aa']).toString(), item: { sortText: undefined, label: "z" } }
		}, {
			op: TestDiffOpType.Update,
			item: { extId: new TestId(['ctrlId', 'id-a', 'id-ab']).toString(), item: { sortText: undefined, label: "a" } }
		});
		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'a' }, { e: 'z' }] }, { e: 'b' }
		]);
		harness.pushDiff({
			op: TestDiffOpType.Update,
			item: { extId: new TestId(['ctrlId', 'id-a', 'id-aa']).toString(), item: { label: "a2" } }
		}, {
			op: TestDiffOpType.Update,
			item: { extId: new TestId(['ctrlId', 'id-a', 'id-ab']).toString(), item: { label: "z2" } }
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
			item: { extId: new TestId(['ctrlId', 'id-a']).toString(), item: { error: "bad" } }
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
			item: { extId: new TestId(['ctrlId', 'id-a']).toString(), item: { error: "badder" } }
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
