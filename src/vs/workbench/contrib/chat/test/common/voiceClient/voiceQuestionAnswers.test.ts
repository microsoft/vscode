/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IChatQuestion } from '../../../common/chatService/chatService.js';
import { resolveQuestionAnswers } from '../../../common/voiceClient/voiceQuestionAnswers.js';

suite('VoiceQuestionAnswers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const single: IChatQuestion = {
		id: 'q_single',
		type: 'singleSelect',
		title: 'Which region?',
		required: true,
		options: [
			{ id: 'o1', label: 'West US', value: 'westus' },
			{ id: 'o2', label: 'East US', value: 'eastus' },
		],
	};

	const multi: IChatQuestion = {
		id: 'q_multi',
		type: 'multiSelect',
		title: 'Which features?',
		allowFreeformInput: true,
		options: [
			{ id: 'o1', label: 'Auth', value: 'auth' },
			{ id: 'o2', label: 'Search', value: 'search' },
			{ id: 'o3', label: 'Billing', value: 'billing' },
		],
	};

	const text: IChatQuestion = { id: 'q_text', type: 'text', title: 'Anything else?' };

	suite('resolveQuestionAnswers', () => {
		test('accepts freeform when the question omits allowFreeformInput', () => {
			// The widget and the pending payload both read an omitted flag as
			// enabled, so rejecting here would refuse an answer the user was
			// invited to give.
			const { allowFreeformInput, ...omitted } = multi;
			assert.deepStrictEqual(
				resolveQuestionAnswers([omitted], [{ question_id: 'q_multi', values: ['auth'], freeform: 'telemetry' }]),
				{ q_multi: { selectedValues: ['auth'], freeformValue: 'telemetry' } },
			);
		});

		test('refuses a freeform value the form would reject on submit', () => {
			const validated = { ...text, validation: { minLength: 5 } };
			assert.strictEqual(
				resolveQuestionAnswers([validated], [{ question_id: 'q_text', freeform: 'no' }]),
				undefined,
			);
			assert.deepStrictEqual(
				resolveQuestionAnswers([validated], [{ question_id: 'q_text', freeform: 'long enough' }]),
				{ q_text: 'long enough' },
			);
		});

		test('maps an exact single-select value', () => {
			assert.deepStrictEqual(
				resolveQuestionAnswers([single], [{ question_id: 'q_single', value: 'eastus' }]),
				{ q_single: { selectedValue: 'eastus' } },
			);
		});

		test('maps exact multi-select values with freeform', () => {
			assert.deepStrictEqual(
				resolveQuestionAnswers(
					[multi],
					[{ question_id: 'q_multi', values: ['billing', 'auth'], freeform: 'telemetry' }],
				),
				{ q_multi: { selectedValues: ['billing', 'auth'], freeformValue: 'telemetry' } },
			);
		});

		test('maps a text answer', () => {
			assert.deepStrictEqual(
				resolveQuestionAnswers([text], [{ question_id: 'q_text', freeform: 'ship it' }]),
				{ q_text: 'ship it' },
			);
		});

		test('maps a freeform fallback on a select', () => {
			assert.deepStrictEqual(
				resolveQuestionAnswers(
					[{ ...single, allowFreeformInput: true }],
					[{ question_id: 'q_single', freeform: 'Central US' }],
				),
				{ q_single: { freeformValue: 'Central US' } },
			);
		});

		test('maps several questions at once', () => {
			assert.deepStrictEqual(
				resolveQuestionAnswers(
					[single, text],
					[
						{ question_id: 'q_single', value: 'westus' },
						{ question_id: 'q_text', freeform: 'no' },
					],
				),
				{ q_single: { selectedValue: 'westus' }, q_text: 'no' },
			);
		});

		// A value outside the schema means the backend resolved against a stale
		// mirror, so one bad entry rejects the whole set rather than guessing.
		test('rejects a value that is a label rather than an option value', () => {
			assert.strictEqual(
				resolveQuestionAnswers([single], [{ question_id: 'q_single', value: 'West US' }]),
				undefined,
			);
		});

		test('rejects a value that is an option id rather than an option value', () => {
			assert.strictEqual(
				resolveQuestionAnswers([single], [{ question_id: 'q_single', value: 'o1' }]),
				undefined,
			);
		});

		test('rejects an unknown question id', () => {
			assert.strictEqual(
				resolveQuestionAnswers([single], [{ question_id: 'nope', value: 'westus' }]),
				undefined,
			);
		});

		test('rejects the whole set when one multi-select value is unknown', () => {
			assert.strictEqual(
				resolveQuestionAnswers([multi], [{ question_id: 'q_multi', values: ['auth', 'nope'] }]),
				undefined,
			);
		});

		test('rejects freeform on a question that forbids it', () => {
			assert.strictEqual(
				resolveQuestionAnswers(
					[{ ...single, allowFreeformInput: false }],
					[{ question_id: 'q_single', freeform: 'Central US' }]),
				undefined,
			);
		});

		test('rejects an empty answer list', () => {
			assert.strictEqual(resolveQuestionAnswers([single], []), undefined);
		});

		test('rejects an answer that carries nothing', () => {
			assert.strictEqual(
				resolveQuestionAnswers([single], [{ question_id: 'q_single' }]),
				undefined,
			);
		});

		test('rejects whitespace-only freeform on a text question', () => {
			assert.strictEqual(
				resolveQuestionAnswers([text], [{ question_id: 'q_text', freeform: '   ' }]),
				undefined,
			);
		});

		test('rejects a selection on a text question', () => {
			assert.strictEqual(
				resolveQuestionAnswers([text], [{ question_id: 'q_text', value: 'anything' }]),
				undefined,
			);
		});

		test('rejects a multi-select shape on a single-select question', () => {
			assert.strictEqual(
				resolveQuestionAnswers([single], [{ question_id: 'q_single', values: ['westus'] }]),
				undefined,
			);
		});

		test('rejects a single-select shape on a multi-select question', () => {
			assert.strictEqual(
				resolveQuestionAnswers([multi], [{ question_id: 'q_multi', value: 'auth' }]),
				undefined,
			);
		});

		test('rejects two answers to the same question', () => {
			assert.strictEqual(
				resolveQuestionAnswers(
					[single],
					[
						{ question_id: 'q_single', value: 'westus' },
						{ question_id: 'q_single', value: 'eastus' },
					],
				),
				undefined,
			);
		});
	});
});
