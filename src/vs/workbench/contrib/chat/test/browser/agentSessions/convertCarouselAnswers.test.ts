/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { SessionInputAnswerState, SessionInputAnswerValueKind } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { convertCarouselAnswers } from '../../../browser/agentSessions/agentHost/agentHostSessionHandler.js';

suite('convertCarouselAnswers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('converts string answer to text', () => {
		const result = convertCarouselAnswers({ 'q1': 'hello' });
		assert.deepStrictEqual(result, {
			'q1': {
				state: SessionInputAnswerState.Submitted,
				value: { kind: SessionInputAnswerValueKind.Text, value: 'hello' }
			}
		});
	});

	test('converts single-select answer', () => {
		const result = convertCarouselAnswers({ 'q1': { selectedValue: 'opt-1' } });
		assert.deepStrictEqual(result, {
			'q1': {
				state: SessionInputAnswerState.Submitted,
				value: { kind: SessionInputAnswerValueKind.Selected, value: 'opt-1', freeformValues: undefined }
			}
		});
	});

	test('converts single-select answer with freeform', () => {
		const result = convertCarouselAnswers({ 'q1': { selectedValue: 'opt-1', freeformValue: 'custom' } });
		assert.deepStrictEqual(result, {
			'q1': {
				state: SessionInputAnswerState.Submitted,
				value: { kind: SessionInputAnswerValueKind.Selected, value: 'opt-1', freeformValues: ['custom'] }
			}
		});
	});

	test('converts multi-select answer', () => {
		const result = convertCarouselAnswers({ 'q1': { selectedValues: ['a', 'b'] } });
		assert.deepStrictEqual(result, {
			'q1': {
				state: SessionInputAnswerState.Submitted,
				value: { kind: SessionInputAnswerValueKind.SelectedMany, value: ['a', 'b'], freeformValues: undefined }
			}
		});
	});

	test('converts multi-select answer with freeform', () => {
		const result = convertCarouselAnswers({ 'q1': { selectedValues: ['a'], freeformValue: 'extra' } });
		assert.deepStrictEqual(result, {
			'q1': {
				state: SessionInputAnswerState.Submitted,
				value: { kind: SessionInputAnswerValueKind.SelectedMany, value: ['a'], freeformValues: ['extra'] }
			}
		});
	});

	test('converts freeform-only answer', () => {
		const result = convertCarouselAnswers({ 'q1': { freeformValue: 'something' } });
		assert.deepStrictEqual(result, {
			'q1': {
				state: SessionInputAnswerState.Submitted,
				value: { kind: SessionInputAnswerValueKind.Text, value: 'something' }
			}
		});
	});

	test('handles multiple questions', () => {
		const result = convertCarouselAnswers({
			'q1': 'text',
			'q2': { selectedValue: 'opt' },
			'q3': { selectedValues: ['a'] },
		});
		assert.strictEqual(Object.keys(result).length, 3);
		assert.strictEqual(result['q1'].state, SessionInputAnswerState.Submitted);
		assert.strictEqual(result['q2'].state, SessionInputAnswerState.Submitted);
		assert.strictEqual(result['q3'].state, SessionInputAnswerState.Submitted);
	});

	test('skips empty object answers', () => {
		const result = convertCarouselAnswers({ 'q1': {} as Record<string, never> });
		assert.strictEqual(Object.keys(result).length, 0);
	});
});
