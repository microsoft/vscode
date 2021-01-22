/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { StateByLocationProjection } from 'vs/workbench/contrib/testing/browser/explorerProjections/stateByLocation';
import { ReExportedTestRunState as TestRunState, testStubs } from 'vs/workbench/contrib/testing/common/testStubs';
import { TestTreeTestHarness } from 'vs/workbench/contrib/testing/test/browser/testObjectTree';

suite('Workbench - Testing Explorer State by Location Projection', () => {
	let harness: TestTreeTestHarness;
	setup(() => {
		harness = new TestTreeTestHarness(l => new StateByLocationProjection(l));
	});

	teardown(() => {
		harness.dispose();
	});

	test('renders initial tree', () => {
		harness.c.addRoot(testStubs.nested(), 'a');
		assert.deepStrictEqual(harness.flush(), [
			{ e: 'Unset', children: [{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }] }, { e: 'b' }] }
		]);
	});

	test('expands if second root is added', () => {
		harness.c.addRoot(testStubs.nested(), 'a');
		harness.flush();
		harness.c.addRoot({
			...testStubs.test('root2'),
			children: [testStubs.test('c')]
		}, 'b');
		assert.deepStrictEqual(harness.flush(), [
			{
				e: 'Unset', children: [
					{ e: 'root', children: [{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }] }, { e: 'b' }] },
					{ e: 'root2', children: [{ e: 'c' }] },
				]
			}
		]);
	});

	test('recompacts if second root children are removed', () => {
		harness.c.addRoot(testStubs.nested(), 'a');
		harness.flush();
		const root2 = {
			...testStubs.test('root2'),
			children: [testStubs.test('c')]
		};

		harness.c.addRoot(root2, 'b');
		harness.flush();

		root2.children.pop();
		harness.c.onItemChange(root2, 'b');

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'Unset', children: [{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }] }, { e: 'b' }] }
		]);
	});

	test('updates nodes if they change', () => {
		const tests = testStubs.nested();
		harness.c.addRoot(tests, 'a');
		harness.flush();

		tests.children[0].label = 'changed';
		harness.c.onItemChange(tests.children[0], 'a');

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'Unset', children: [{ e: 'changed', children: [{ e: 'aa' }, { e: 'ab' }] }, { e: 'b' }] }
		]);
	});

	test('updates nodes if they add children', () => {
		const tests = testStubs.nested();
		harness.c.addRoot(tests, 'a');
		harness.flush();

		tests.children[0].children?.push(testStubs.test('ac'));
		harness.c.onItemChange(tests.children[0], 'a');

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'Unset', children: [{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }, { e: 'ac' }] }, { e: 'b' }] }
		]);
	});

	test('updates nodes if they remove children', () => {
		const tests = testStubs.nested();
		harness.c.addRoot(tests, 'a');
		harness.flush();

		tests.children[0].children?.pop();
		harness.c.onItemChange(tests.children[0], 'a');

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'Unset', children: [{ e: 'a', children: [{ e: 'aa' }] }, { e: 'b' }] }
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
			{ e: 'Passed', children: [{ e: 'a', children: [{ e: 'aa' }] }] },
			{ e: 'Unset', children: [{ e: 'a', children: [{ e: 'ab' }] }, { e: 'b' }] },
		]);

		subchild.state = { runState: TestRunState.Failed, messages: [] };
		harness.c.onItemChange(subchild, 'a');

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'Failed', children: [{ e: 'a', children: [{ e: 'aa' }] }] },
			{ e: 'Unset', children: [{ e: 'a', children: [{ e: 'ab' }] }, { e: 'b' }] },
		]);

		subchild.state = { runState: TestRunState.Unset, messages: [] };
		harness.c.onItemChange(subchild, 'a');

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'Unset', children: [{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }] }, { e: 'b' }] },
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
			{ e: 'Unset', children: [{ e: 'a', children: [{ e: 'aa' }, { e: 'ab' }] }, { e: 'b' }] },
		]);

		subchild.state = { runState: TestRunState.Failed, messages: [] };
		harness.c.onItemChange(subchild, 'a');

		assert.deepStrictEqual(harness.flush(), [
			{ e: 'Failed', children: [{ e: 'a', children: [{ e: 'aa' }] }] },
			{ e: 'Unset', children: [{ e: 'a', children: [{ e: 'ab' }] }, { e: 'b' }] },
		]);
	});
});
