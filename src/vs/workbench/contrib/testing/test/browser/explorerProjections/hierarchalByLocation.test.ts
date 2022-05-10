/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AbstractTreeViewState } from 'vs/base/browser/ui/tree/abstractTree';
import { Emitter } from 'vs/base/common/event';
import { HierarchicalByLocationProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalByLocation';
import { TestDiffOpType, TestItemExpandState, TestResultItem, TestResultState } from 'vs/workbench/contrib/testing/common/testTypes';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { TestResultItemChange, TestResultItemChangeReason } from 'vs/workbench/contrib/testing/common/testResult';
import { TestTreeTestHarness } from 'vs/workbench/contrib/testing/test/browser/testObjectTree';
import { TestTestItem } from 'vs/workbench/contrib/testing/test/common/testStubs';

class TestHierarchicalByLocationProjection extends HierarchicalByLocationProjection {
}

suite('Workbench - Testing Explorer Hierarchal by Location Projection', () => {
	let harness: TestTreeTestHarness<TestHierarchicalByLocationProjection>;
	let onTestChanged: Emitter<TestResultItemChange>;
	let resultsService: any;

	setup(() => {
		onTestChanged = new Emitter();
		resultsService = {
			onResultsChanged: () => undefined,
			onTestChanged: onTestChanged.event,
			getStateById: () => ({ state: { state: 0 }, computedState: 0 }),
		};

		harness = new TestTreeTestHarness(l => new TestHierarchicalByLocationProjection(AbstractTreeViewState.empty(), l, resultsService as any));
	});

	teardown(() => {
		harness.dispose();
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
			item: { controllerId: 'ctrl2', parent: null, expand: TestItemExpandState.Expanded, item: new TestTestItem('ctrl2', 'c', 'c').toTestItem() },
		}, {
			op: TestDiffOpType.Add,
			item: { controllerId: 'ctrl2', parent: new TestId(['ctrl2', 'c']).toString(), expand: TestItemExpandState.NotExpandable, item: new TestTestItem('ctrl2', 'c-a', 'ca').toTestItem() },
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

		harness.c.root.children.get('id-a')!.children.add(new TestTestItem('ctrlId', 'ac', 'ac'));

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
		resultsService.getStateById = () => [undefined, resultInState(TestResultState.Failed)];

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
				relatedCode: null,
			},
			parent: 'id-root',
			tasks: [],
			ownComputedState: state,
			computedState: state,
			expand: 0,
			controllerId: 'ctrl',
		});

		// Applies the change:
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
});

