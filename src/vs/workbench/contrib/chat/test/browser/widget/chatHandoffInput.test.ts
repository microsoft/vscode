/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { computeHandoffInputUpdate } from '../../../browser/widget/chatWidget.js';

// Regression coverage for #288114: switching from Plan mode via the
// "Start Implementation" handoff used to discard whatever the user had typed
// because executeHandoff unconditionally overwrote the input with the
// handoff's canned prompt. computeHandoffInputUpdate now decides whether to
// overwrite, preferring the user's draft when present.
suite('computeHandoffInputUpdate', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const startImplementation = { prompt: 'Implement the plan' };

	test('regular handoff preserves a non-empty user draft (bug #288114)', () => {
		const result = computeHandoffInputUpdate(startImplementation, 'Here are my answers to the plan questions');
		assert.strictEqual(result.shouldSetValue, false, 'user draft must not be overwritten');
		assert.strictEqual(result.value, undefined);
	});

	test('regular handoff populates the handoff prompt when input is empty', () => {
		const result = computeHandoffInputUpdate(startImplementation, '');
		assert.deepStrictEqual(result, { shouldSetValue: true, value: 'Implement the plan' });
	});

	test('regular handoff treats whitespace-only input as empty', () => {
		const result = computeHandoffInputUpdate(startImplementation, '   \n\t ');
		assert.deepStrictEqual(result, { shouldSetValue: true, value: 'Implement the plan' });
	});

	test('delegation handoff prefixes the user draft with @agentId', () => {
		const result = computeHandoffInputUpdate(startImplementation, 'my draft answer', 'background');
		assert.deepStrictEqual(result, { shouldSetValue: true, value: '@background my draft answer' });
	});

	test('delegation handoff falls back to the handoff prompt when input is empty', () => {
		const result = computeHandoffInputUpdate(startImplementation, '', 'background');
		assert.deepStrictEqual(result, { shouldSetValue: true, value: '@background Implement the plan' });
	});
});
