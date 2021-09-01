/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter } from 'vs/base/common/event';
import { HierarchicalByNameProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalByName';
import { TestDiffOpType, TestItemExpandState } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { TestResultItemChange } from 'vs/workbench/contrib/testing/common/testResult';
import { Convert, TestItemImpl } from 'vs/workbench/contrib/testing/common/testStubs';
import { TestTreeTestHarness } from 'vs/workbench/contrib/testing/test/browser/testObjectTree';

suite('Workbench - Testing Explorer Hierarchal by Name Projection', () => {
	let harness: TestTreeTestHarness<HierarchicalByNameProjection>;
	let onTestChanged: Emitter<TestResultItemChange>;
	let resultsService: any;

	setup(() => {
		onTestChanged = new Emitter();
		resultsService = {
			onResultsChanged: () => undefined,
			onTestChanged: onTestChanged.event,
			getStateById: () => ({ state: { state: 0 }, computedState: 0 }),
		};

		harness = new TestTreeTestHarness(l => new HierarchicalByNameProjection(l, resultsService as any));
	});

	teardown(() => {
		harness.dispose();
	});

	test('renders initial tree', () => {
		harness.flush();
		assert.deepStrictEqual(harness.tree.getRendered(), [
			{ e: 'aa' }, { e: 'ab' }, { e: 'b' }
		]);
	});

	test('updates render if second test provider appears', async () => {
		harness.flush();
		harness.pushDiff([
			TestDiffOpType.Add,
			{ controllerId: 'ctrl2', parent: null, expand: TestItemExpandState.Expanded, item: Convert.TestItem.from(new TestItemImpl('ctrl2', 'c', 'root2', undefined)) },
		], [
			TestDiffOpType.Add,
			{ controllerId: 'ctrl2', parent: new TestId(['ctrl2', 'c']).toString(), expand: TestItemExpandState.NotExpandable, item: Convert.TestItem.from(new TestItemImpl('ctrl2', 'c-a', 'c', undefined)) },
		]);

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'root', children: [{ e: 'aa' }, { e: 'ab' }, { e: 'b' }] },
			{ e: 'root2', children: [{ e: 'c' }] },
		]);
	});

	test('updates nodes if they add children', async () => {
		harness.flush();

		harness.c.root.children.get('id-a')!.children.add(new TestItemImpl('ctrl2', 'ac', 'ac', undefined));

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'aa' },
			{ e: 'ab' },
			{ e: 'ac' },
			{ e: 'b' }
		]);
	});

	test('updates nodes if they remove children', async () => {
		harness.flush();
		harness.c.root.children.get('id-a')!.children.delete('id-ab');

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'aa' },
			{ e: 'b' }
		]);
	});

	test('swaps when node is no longer leaf', async () => {
		harness.flush();
		harness.c.root.children.get('id-b')!.children.add(new TestItemImpl('ctrl2', 'ba', 'ba', undefined));

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'aa' },
			{ e: 'ab' },
			{ e: 'ba' },
		]);
	});
});

