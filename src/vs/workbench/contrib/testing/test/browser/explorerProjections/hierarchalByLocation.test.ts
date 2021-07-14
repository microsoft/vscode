/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter } from 'vs/base/common/event';
import { HierarchicalByLocationProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalByLocation';
import { TestDiffOpType, TestItemExpandState, TestResultItem } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestResultItemChange, TestResultItemChangeReason } from 'vs/workbench/contrib/testing/common/testResult';
import { Convert, TestItemImpl, TestResultState } from 'vs/workbench/contrib/testing/common/testStubs';
import { TestTreeTestHarness } from 'vs/workbench/contrib/testing/test/browser/testObjectTree';

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

		harness = new TestTreeTestHarness(l => new TestHierarchicalByLocationProjection(l, resultsService as any));
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
		harness.tree.expand(harness.projection.getElementByTestId('id-a')!);
		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }] }, { e: 'b' }
		]);
	});

	test('updates render if second test provider appears', async () => {
		harness.flush();
		harness.pushDiff([
			TestDiffOpType.Add,
			{ controllerId: 'ctrl2', parent: null, expand: TestItemExpandState.Expanded, item: Convert.TestItem.from(new TestItemImpl('c', 'c', undefined, undefined, undefined)) },
		], [
			TestDiffOpType.Add,
			{ controllerId: 'ctrl2', parent: 'c', expand: TestItemExpandState.NotExpandable, item: Convert.TestItem.from(new TestItemImpl('c-a', 'ca', undefined, undefined, undefined)) },
		]);

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'c', children: [{ e: 'ca' }] },
			{ e: 'root', children: [{ e: 'a' }, { e: 'b' }] }
		]);
	});

	test('updates nodes if they add children', async () => {
		harness.flush();
		harness.tree.expand(harness.projection.getElementByTestId('id-a')!);

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }] },
			{ e: 'b' }
		]);

		new TestItemImpl('ac', 'ac', undefined, undefined, harness.c.root.children.get('id-a')!);

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }, { e: 'ac' }] },
			{ e: 'b' }
		]);
	});

	test('updates nodes if they remove children', async () => {
		harness.flush();
		harness.tree.expand(harness.projection.getElementByTestId('id-a')!);

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }] },
			{ e: 'b' }
		]);

		harness.c.root.children.get('id-a')!.children.get('id-ab')!.dispose();

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'a', children: [{ e: 'aa' }] },
			{ e: 'b' }
		]);
	});

	test('applies state changes', async () => {
		harness.flush();
		resultsService.getStateById = () => [undefined, resultInState(TestResultState.Failed)];

		const resultInState = (state: TestResultState): TestResultItem => ({
			item: harness.c.itemToInternal.get(harness.c.root.children.get('id-a')!)!.item,
			parent: 'id-root',
			tasks: [],
			retired: false,
			ownComputedState: state,
			computedState: state,
			controllerId: 'ctrl',
		});

		// Applies the change:
		onTestChanged.fire({
			reason: TestResultItemChangeReason.OwnStateChange,
			result: null as any,
			previous: TestResultState.Unset,
			item: resultInState(TestResultState.Queued),
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
			previous: TestResultState.Queued,
			item: resultInState(TestResultState.Unset),
		});
		harness.projection.applyTo(harness.tree);

		assert.deepStrictEqual(harness.tree.getRendered('state'), [
			{ e: 'a', data: String(TestResultState.Failed) },
			{ e: 'b', data: String(TestResultState.Unset) }
		]);
	});
});

