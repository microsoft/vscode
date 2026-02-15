/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ListProjection } from '../../../browser/explorerProjections/listProjection.js';
import { TestId } from '../../../common/testId.js';
import { TestResultItemChange } from '../../../common/testResult.js';
import { TestDiffOpType, TestItemExpandState } from '../../../common/testTypes.js';
import { TestTreeTestHarness } from '../testObjectTree.js';
import { TestTestItem } from '../../common/testStubs.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ITestResultService } from '../../../common/testResultService.js';

suite('Workbench - Testing Explorer Hierarchal by Name Projection', () => {
	let harness: TestTreeTestHarness<ListProjection>;
	let onTestChanged: Emitter<TestResultItemChange>;
	let resultsService: ITestResultService;

	teardown(() => {
		harness.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		onTestChanged = new Emitter();
		resultsService = upcastPartial<ITestResultService>({
			onResultsChanged: Event.None,
			onTestChanged: onTestChanged.event,
			getStateById: () => undefined,
		});

		harness = new TestTreeTestHarness(l => new ListProjection({}, l, resultsService));
	});

	test('renders initial tree', () => {
		harness.flush();
		assert.deepStrictEqual(harness.tree.getRendered(), [
			{ e: 'aa' }, { e: 'ab' }, { e: 'b' }
		]);
	});

	test('updates render if second test provider appears', async () => {
		harness.flush();
		harness.pushDiff({
			op: TestDiffOpType.Add,
			item: { controllerId: 'ctrl2', expand: TestItemExpandState.Expanded, item: new TestTestItem(new TestId(['ctrl2']), 'root2').toTestItem() },
		}, {
			op: TestDiffOpType.Add,
			item: { controllerId: 'ctrl2', expand: TestItemExpandState.NotExpandable, item: new TestTestItem(new TestId(['ctrl2', 'id-c']), 'c', undefined).toTestItem() },
		});

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'root', children: [{ e: 'aa' }, { e: 'ab' }, { e: 'b' }] },
			{ e: 'root2', children: [{ e: 'c' }] },
		]);
	});

	test('updates nodes if they add children', async () => {
		harness.flush();

		harness.c.root.children.get('id-a')!.children.add(new TestTestItem(new TestId(['ctrlId', 'id-a', 'id-ac']), 'ac'));

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
		harness.c.root.children.get('id-b')!.children.add(new TestTestItem(new TestId(['ctrlId', 'id-b', 'id-ba']), 'ba'));

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'aa' },
			{ e: 'ab' },
			{ e: 'ba' },
		]);
	});
});
