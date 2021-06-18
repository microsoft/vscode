/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter } from 'vs/base/common/event';
import { HierarchicalByLocationProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections/hierarchalByLocation';
import { TestResultItem } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestResultItemChange, TestResultItemChangeReason } from 'vs/workbench/contrib/testing/common/testResult';
import { TestResultState, testStubs } from 'vs/workbench/contrib/testing/common/testStubs';
import { makeTestWorkspaceFolder, TestTreeTestHarness } from 'vs/workbench/contrib/testing/test/browser/testObjectTree';

class TestHierarchicalByLocationProjection extends HierarchicalByLocationProjection {
	public get folderNodes() {
		return [...this.folders.values()];
	}
}

suite('Workbench - Testing Explorer Hierarchal by Location Projection', () => {
	let harness: TestTreeTestHarness<TestHierarchicalByLocationProjection>;
	const folder1 = makeTestWorkspaceFolder('f1');
	const folder2 = makeTestWorkspaceFolder('f2');
	let onTestChanged: Emitter<TestResultItemChange>;
	let resultsService: any;

	setup(() => {
		onTestChanged = new Emitter();
		resultsService = {
			onResultsChanged: () => undefined,
			onTestChanged: onTestChanged.event,
			getStateById: () => ({ state: { state: 0 }, computedState: 0 }),
		};

		harness = new TestTreeTestHarness([folder1, folder2], l => new TestHierarchicalByLocationProjection(l, resultsService as any));
	});

	teardown(() => {
		harness.dispose();
	});

	test('renders initial tree', async () => {
		harness.c.addRoot(testStubs.nested(), 'a');
		harness.flush(folder1);
		assert.deepStrictEqual(harness.tree.getRendered(), [
			{ e: 'a' }, { e: 'b' }
		]);
	});

	test('expands children', async () => {
		harness.c.addRoot(testStubs.nested(), 'a');
		harness.flush(folder1);
		harness.tree.expand(harness.projection.getElementByTestId('id-a')!);
		assert.deepStrictEqual(harness.flush(folder1), [
			{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }] }, { e: 'b' }
		]);
	});

	test('updates render if a second folder is added', async () => {
		harness.c.addRoot(testStubs.nested('id1-'), 'a');
		harness.flush(folder1);
		harness.c.addRoot(testStubs.nested('id2-'), 'a');
		harness.flush(folder2);
		assert.deepStrictEqual(harness.tree.getRendered(), [
			{ e: 'f1', children: [{ e: 'a' }, { e: 'b' }] },
			{ e: 'f2', children: [{ e: 'a' }, { e: 'b' }] },
		]);

		harness.tree.expand(harness.projection.getElementByTestId('id1-a')!);
		assert.deepStrictEqual(harness.flush(folder1), [
			{ e: 'f1', children: [{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }] }, { e: 'b' }] },
			{ e: 'f2', children: [{ e: 'a' }, { e: 'b' }] },
		]);
	});

	test('updates render if second folder is removed', async () => {
		harness.c.addRoot(testStubs.nested('id1-'), 'a');
		harness.flush(folder1);
		harness.c.addRoot(testStubs.nested('id2-'), 'a');
		harness.flush(folder2);
		harness.onFolderChange.fire({ added: [], changed: [], removed: [folder1] });
		assert.deepStrictEqual(harness.flush(folder1), [
			{ e: 'a' }, { e: 'b' },
		]);
	});

	test('updates render if second test provider appears', async () => {
		harness.c.addRoot(testStubs.nested(), 'a');
		harness.flush(folder1);
		harness.c.addRoot(testStubs.test('root2', undefined, [testStubs.test('c')]), 'b');
		assert.deepStrictEqual(harness.flush(folder1), [
			{ e: 'root', children: [{ e: 'a' }, { e: 'b' }] },
			{ e: 'root2', children: [{ e: 'c' }] },
		]);
	});

	test('updates nodes if they add children', async () => {
		const tests = testStubs.nested();
		harness.c.addRoot(tests, 'a');
		harness.flush(folder1);
		harness.tree.expand(harness.projection.getElementByTestId('id-a')!);

		assert.deepStrictEqual(harness.flush(folder1), [
			{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }] },
			{ e: 'b' }
		]);

		tests.children.get('id-a')!.addChild(testStubs.test('ac'));

		assert.deepStrictEqual(harness.flush(folder1), [
			{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }, { e: 'ac' }] },
			{ e: 'b' }
		]);
	});

	test('updates nodes if they remove children', async () => {
		const tests = testStubs.nested();
		harness.c.addRoot(tests, 'a');
		harness.flush(folder1);
		harness.tree.expand(harness.projection.getElementByTestId('id-a')!);

		tests.children.get('id-a')!.children.get('id-ab')!.dispose();

		assert.deepStrictEqual(harness.flush(folder1), [
			{ e: 'a', children: [{ e: 'aa' }] },
			{ e: 'b' }
		]);
	});

	test('applies state changes', async () => {
		const tests = testStubs.nested();
		harness.c.addRoot(tests, 'a');
		harness.flush(folder1);
		resultsService.getStateById = () => [undefined, resultInState(TestResultState.Failed)];

		const resultInState = (state: TestResultState): TestResultItem => ({
			item: harness.c.itemToInternal.get(tests.children.get('id-a')!)!.item,
			parent: 'id-root',
			tasks: [],
			retired: false,
			ownComputedState: state,
			computedState: state,
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

