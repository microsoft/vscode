/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { StateByNameProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections/stateByName';
import { ReExportedTestRunState as TestRunState, testStubs } from 'vs/workbench/contrib/testing/common/testStubs';
import { TestTreeTestHarness } from 'vs/workbench/contrib/testing/test/browser/testObjectTree';

suite('Workbench - Testing Explorer State by Name Projection', () => {
	let harness: TestTreeTestHarness;
	setup(() => {
		harness = new TestTreeTestHarness(l => new StateByNameProjection(l));
	});

	teardown(() => {
		harness.dispose();
	});

	test('renders initial tree', () => {
		harness.c.addRoot(testStubs.nested(), 'a');
		assert.deepStrictEqual(harness.flush(), [
			{ e: 'Unset', children: [{ e: 'aa' }, { e: 'ab' }, { e: 'b' }] }
		]);
	});

	test('swaps when node becomes leaf', () => {
		const tests = testStubs.nested();
		harness.c.addRoot(tests, 'a');
		harness.flush();

		tests.children[0].children = [];
		harness.c.onItemChange(tests.children[0], 'a');

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'Unset', children: [{ e: 'a' }, { e: 'b' }] }
		]);
	});

	test('swaps when node is no longer leaf', () => {
		const tests = testStubs.nested();
		harness.c.addRoot(tests, 'a');
		harness.flush();

		tests.children[1].children = [testStubs.test('ba')];
		harness.c.onItemChange(tests.children[1], 'a');

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'Unset', children: [{ e: 'aa' }, { e: 'ab' }, { e: 'ba' }] }
		]);
	});

	test('swaps when node is no longer runnable', () => {
		const tests = testStubs.nested();
		harness.c.addRoot(tests, 'a');
		harness.flush();

		tests.children[1].children = [testStubs.test('ba')];
		harness.c.onItemChange(tests.children[0], 'a');
		harness.flush();

		tests.children[1].children[0].runnable = false;
		harness.c.onItemChange(tests.children[1].children[0], 'a');

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'Unset', children: [{ e: 'aa' }, { e: 'ab' }, { e: 'b' }] }
		]);
	});

	test('moves nodes when states change', () => {
		const tests = testStubs.nested();
		harness.c.addRoot(tests, 'a');
		harness.flush();

		const subchild = tests.children[0].children![0];
		subchild.state = { runState: TestRunState.Passed, messages: [] };
		harness.c.onItemChange(subchild, 'a');

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'Passed', children: [{ e: 'aa' }] },
			{ e: 'Unset', children: [{ e: 'ab' }, { e: 'b' }] },
		]);

		subchild.state = { runState: TestRunState.Failed, messages: [] };
		harness.c.onItemChange(subchild, 'a');

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'Failed', children: [{ e: 'aa' }] },
			{ e: 'Unset', children: [{ e: 'ab' }, { e: 'b' }] },
		]);

		subchild.state = { runState: TestRunState.Unset, messages: [] };
		harness.c.onItemChange(subchild, 'a');

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'Unset', children: [{ e: 'aa' }, { e: 'ab' }, { e: 'b' }] }
		]);
	});

	test('does not move when state is running', () => {
		const tests = testStubs.nested();
		harness.c.addRoot(tests, 'a');
		harness.flush();

		const subchild = tests.children[0].children![0];
		subchild.state = { runState: TestRunState.Running, messages: [] };
		harness.c.onItemChange(subchild, 'a');

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'Unset', children: [{ e: 'aa' }, { e: 'ab' }, { e: 'b' }] }
		]);

		subchild.state = { runState: TestRunState.Failed, messages: [] };
		harness.c.onItemChange(subchild, 'a');

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'Failed', children: [{ e: 'aa' }] },
			{ e: 'Unset', children: [{ e: 'ab' }, { e: 'b' }] },
		]);
	});
});
