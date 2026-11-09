/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ComputedStateCache, IComputedStateAndDurationAccessor, refreshComputedState } from '../../common/getComputedState.js';
import { TestResultState } from '../../common/testTypes.js';

interface TestNode {
	computedStateCache?: ComputedStateCache;
	parent?: TestNode;
	children: TestNode[];
	ownState: TestResultState;
	state: TestResultState;
	ownDuration?: number;
	duration?: number;
}

suite('Testing computed state and duration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	let childVisits: number;
	const accessor: IComputedStateAndDurationAccessor<TestNode> = {
		getCache: node => node.computedStateCache ??= new ComputedStateCache(),
		getOwnState: node => node.ownState,
		getCurrentComputedState: node => node.state,
		setComputedState: (node, state) => node.state = state,
		getOwnDuration: node => node.ownDuration,
		getCurrentComputedDuration: node => node.duration,
		setComputedDuration: (node, duration) => node.duration = duration,
		*getChildren(node) {
			for (const child of node.children) {
				childVisits++;
				yield child;
			}
		},
		*getParents(node) {
			for (let parent = node.parent; parent; parent = parent.parent) {
				yield parent;
			}
		},
	};

	const createNode = (parent?: TestNode): TestNode => {
		const node: TestNode = { parent, children: [], ownState: TestResultState.Unset, state: TestResultState.Unset };
		parent?.children.push(node);
		return node;
	};

	const setDuration = (node: TestNode, duration: number | undefined) => {
		node.ownDuration = duration;
		return refreshComputedState(accessor, node);
	};

	setup(() => childVisits = 0);

	test('sequential test states do not rescan a large suite', () => {
		const suite = createNode();
		const tests = Array.from({ length: 100 }, () => createNode(suite));
		for (const test of tests) {
			test.ownState = TestResultState.Running;
			refreshComputedState(accessor, test, undefined, false);
			assert.strictEqual(suite.state, TestResultState.Running);
			test.ownState = TestResultState.Passed;
			refreshComputedState(accessor, test, undefined, false);
			assert.strictEqual(suite.state, TestResultState.Passed);
		}
		assert.ok(childVisits <= tests.length * 2, `${childVisits} child visits`);
	});

	test('duration updates and clearing results do not rescan siblings', () => {
		const suite = createNode();
		const tests = Array.from({ length: 100 }, () => createNode(suite));
		for (const test of tests) {
			setDuration(test, 1);
		}
		assert.strictEqual(suite.duration, tests.length);
		for (const test of tests) {
			setDuration(test, undefined);
		}
		assert.strictEqual(suite.duration, undefined);
		assert.ok(childVisits <= tests.length * 2, `${childVisits} child visits`);
	});

	test('distinguishes a zero duration from no duration through multiple parents', () => {
		const root = createNode();
		const suite = createNode(root);
		const first = createNode(suite);
		const second = createNode(suite);
		setDuration(first, 0);
		setDuration(second, 0);
		setDuration(first, undefined);
		assert.deepStrictEqual([suite.duration, root.duration], [0, 0]);
		setDuration(second, undefined);
		assert.deepStrictEqual([suite.duration, root.duration], [undefined, undefined]);
	});

	test('updates durations through multiple parents and stops at an own duration', () => {
		const root = createNode();
		const suite = createNode(root);
		const first = createNode(suite);
		const second = createNode(suite);
		setDuration(first, 2);
		setDuration(second, 3);
		setDuration(first, 7);
		assert.deepStrictEqual([suite.duration, root.duration], [10, 10]);
		setDuration(suite, 20);
		setDuration(first, 9);
		assert.deepStrictEqual([suite.duration, root.duration], [20, 20]);
		setDuration(suite, undefined);
		assert.deepStrictEqual([suite.duration, root.duration], [12, 12]);
		setDuration(second, undefined);
		assert.deepStrictEqual([suite.duration, root.duration], [9, 9]);
	});

	test('recomputes non-finite duration sums', () => {
		const suite = createNode();
		const first = createNode(suite);
		const second = createNode(suite);
		setDuration(first, Infinity);
		setDuration(second, 2);
		assert.strictEqual(suite.duration, Infinity);
		setDuration(first, 1);
		assert.strictEqual(suite.duration, 3);
	});

	test('refreshes duration counts when children are added or removed', () => {
		const root = createNode();
		const suite = createNode(root);
		const first = createNode(suite);
		setDuration(first, 3);
		const second = createNode(suite);
		setDuration(second, 2);
		suite.children.splice(suite.children.indexOf(first), 1);
		refreshComputedState(accessor, suite);
		assert.deepStrictEqual([suite.duration, root.duration], [2, 2]);
		setDuration(second, undefined);
		assert.deepStrictEqual([suite.duration, root.duration], [undefined, undefined]);
	});

	test('preserves the parents own state and the highest priority child state', () => {
		const root = createNode();
		const suite = createNode(root);
		const tests = Array.from({ length: 100 }, () => createNode(suite));
		suite.ownState = TestResultState.Failed;
		refreshComputedState(accessor, suite, undefined, false);
		for (const test of tests) {
			test.ownState = TestResultState.Running;
			refreshComputedState(accessor, test, undefined, false);
			test.ownState = TestResultState.Passed;
			refreshComputedState(accessor, test, undefined, false);
		}
		assert.deepStrictEqual([suite.state, root.state], [TestResultState.Failed, TestResultState.Failed]);
		suite.ownState = TestResultState.Unset;
		refreshComputedState(accessor, suite, undefined, false);
		assert.deepStrictEqual([suite.state, root.state], [TestResultState.Passed, TestResultState.Passed]);
	});

	test('drops cached state counts when a suite becomes small', () => {
		const suite = createNode();
		const tests = Array.from({ length: 100 }, () => createNode(suite));
		for (const test of tests) {
			test.ownState = TestResultState.Failed;
			refreshComputedState(accessor, test, undefined, false);
		}
		refreshComputedState(accessor, suite, undefined, false);
		assert.ok(suite.computedStateCache?.childrenStates);
		suite.children.splice(1);
		refreshComputedState(accessor, suite, undefined, false);
		tests[0].ownState = TestResultState.Running;
		refreshComputedState(accessor, tests[0], undefined, false);
		tests[0].ownState = TestResultState.Passed;
		refreshComputedState(accessor, tests[0], undefined, false);
		assert.strictEqual(suite.state, TestResultState.Passed);
	});
});
