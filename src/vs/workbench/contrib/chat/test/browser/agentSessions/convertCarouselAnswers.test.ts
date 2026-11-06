/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { convertCarouselAnswers } from '../../../browser/agentSessions/agentHost/agentHostSessionHandler.js';

suite('convertCarouselAnswers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('converts string answer to text', () => {
		const result = convertCarouselAnswers({ 'q1': 'hello' });
		assert.deepStrictEqual(result, {
			'q1': {
				state: ChatInputAnswerState.Submitted,
				value: { kind: ChatInputAnswerValueKind.Text, value: 'hello' }
			}
		});
	});

	test('converts single-select answer', () => {
		const result = convertCarouselAnswers({ 'q1': { selectedValue: 'opt-1' } });
		assert.deepStrictEqual(result, {
			'q1': {
				state: ChatInputAnswerState.Submitted,
				value: { kind: ChatInputAnswerValueKind.Selected, value: 'opt-1', freeformValues: undefined }
			}
		});
	});

	test('converts single-select answer with freeform', () => {
		const result = convertCarouselAnswers({ 'q1': { selectedValue: 'opt-1', freeformValue: 'custom' } });
		assert.deepStrictEqual(result, {
			'q1': {
				state: ChatInputAnswerState.Submitted,
				value: { kind: ChatInputAnswerValueKind.Selected, value: 'opt-1', freeformValues: ['custom'] }
			}
		});
	});

	test('converts boolean single-select answer', () => {
		const result = convertCarouselAnswers({ 'q1': { selectedValue: 'false' } }, [{
			kind: ChatInputQuestionKind.Boolean,
			id: 'q1',
			message: 'Enable the feature?',
		}]);
		assert.deepStrictEqual(result, {
			'q1': {
				state: ChatInputAnswerState.Submitted,
				value: { kind: ChatInputAnswerValueKind.Boolean, value: false }
			}
		});
	});

	test('converts multi-select answer', () => {
		const result = convertCarouselAnswers({ 'q1': { selectedValues: ['a', 'b'] } });
		assert.deepStrictEqual(result, {
			'q1': {
				state: ChatInputAnswerState.Submitted,
				value: { kind: ChatInputAnswerValueKind.SelectedMany, value: ['a', 'b'], freeformValues: undefined }
			}
		});
	});

	test('converts multi-select answer with freeform', () => {
		const result = convertCarouselAnswers({ 'q1': { selectedValues: ['a'], freeformValue: 'extra' } });
		assert.deepStrictEqual(result, {
			'q1': {
				state: ChatInputAnswerState.Submitted,
				value: { kind: ChatInputAnswerValueKind.SelectedMany, value: ['a'], freeformValues: ['extra'] }
			}
		});
	});

	test('converts freeform-only answer', () => {
		const result = convertCarouselAnswers({ 'q1': { freeformValue: 'something' } });
		assert.deepStrictEqual(result, {
			'q1': {
				state: ChatInputAnswerState.Submitted,
				value: { kind: ChatInputAnswerValueKind.Text, value: 'something' }
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
		assert.strictEqual(result['q1'].state, ChatInputAnswerState.Submitted);
		assert.strictEqual(result['q2'].state, ChatInputAnswerState.Submitted);
		assert.strictEqual(result['q3'].state, ChatInputAnswerState.Submitted);
	});

	test('skips empty object answers', () => {
		const result = convertCarouselAnswers({ 'q1': {} as Record<string, never> });
		assert.strictEqual(Object.keys(result).length, 0);
	});
});
