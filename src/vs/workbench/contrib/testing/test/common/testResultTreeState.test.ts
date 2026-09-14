/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { shouldSkipTestOutputDecoration, TestResultTreeState } from '../../common/testResultTreeState.js';
import { TestItemExpandState, TestMessageType, TestResultItem, TestResultState } from '../../common/testTypes.js';
import { URI } from '../../../../../base/common/uri.js';

const testItem = (id: string): TestResultItem => ({
	controllerId: 'controller',
	expand: TestItemExpandState.NotExpandable,
	item: {
		extId: id,
		label: id,
		tags: [],
		busy: false,
		uri: URI.file(`/test/${id}`),
		range: null,
		description: null,
		error: null,
		sortText: null,
	},
	tasks: [{
		state: TestResultState.Unset,
		duration: undefined,
		messages: [],
	}],
	ownComputedState: TestResultState.Unset,
	computedState: TestResultState.Unset,
});

suite('TestResultTreeState', () => {
	test('retains output-only tests discovered in separate refresh batches', () => {
		const first = testItem('first');
		const second = testItem('second');
		const state = new TestResultTreeState<void>();

		state.update([], false, [first]);
		state.update([], false, [second]);

		assert.deepStrictEqual(state.getItems(), [first, second]);
	});

	test('retains existing message children during output-only refreshes', () => {
		const failed = testItem('failed');
		const outputOnly = testItem('output-only');
		const error = {};
		const state = new TestResultTreeState<object>();

		state.update([failed], true);
		state.setChildren(failed, [error]);
		state.update([], false, [outputOnly]);

		assert.deepStrictEqual(state.getItems(), [failed, outputOnly]);
		assert.deepStrictEqual(state.getChildren(failed), [error]);
	});

	test('does not skip task-level located output refreshes', () => {
		const locatedOutput = { type: TestMessageType.Output, message: 'setup', offset: 0, length: 5, location: { uri: URI.file('/test/file.ts'), range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } } };
		const unlocatedTestOutput = { type: TestMessageType.Output, message: 'stdout', offset: 0, length: 6, location: undefined };
		const item = testItem('known');

		assert.deepStrictEqual([
			shouldSkipTestOutputDecoration(locatedOutput, undefined),
			shouldSkipTestOutputDecoration(unlocatedTestOutput, item),
		], [false, true]);
	});
});
