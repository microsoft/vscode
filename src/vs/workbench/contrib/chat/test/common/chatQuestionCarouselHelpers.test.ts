/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatQuestion } from '../../common/chatService/chatService.js';
import {
	formatQuestionPrompt,
	getOptionsWithDefaultsFirst,
	resolveQuestionAnswers,
} from '../../common/chatService/chatQuestionCarouselHelpers.js';

suite('ChatQuestionCarouselHelpers', () => {
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

	suite('getOptionsWithDefaultsFirst', () => {
		test('preserves declared order when there is no default', () => {
			assert.deepStrictEqual(
				getOptionsWithDefaultsFirst(single).map(o => o.option.value),
				['westus', 'eastus'],
			);
		});

		test('hoists a single default to the front', () => {
			assert.deepStrictEqual(
				getOptionsWithDefaultsFirst({ ...single, defaultValue: 'o2' }).map(o => o.option.value),
				['eastus', 'westus'],
			);
		});

		test('hoists several defaults, keeping their relative order', () => {
			assert.deepStrictEqual(
				getOptionsWithDefaultsFirst({ ...multi, defaultValue: ['o3', 'o1'] }).map(o => o.option.value),
				['auth', 'billing', 'search'],
			);
		});

		test('matches defaults by option id, not by option value', () => {
			assert.deepStrictEqual(
				getOptionsWithDefaultsFirst({ ...single, defaultValue: 'eastus' }).map(o => o.option.value),
				['westus', 'eastus'],
			);
		});

		test('returns an empty list for a question with no options', () => {
			assert.deepStrictEqual(getOptionsWithDefaultsFirst(text), []);
		});

		test('keeps originalIndex pointing at the declared position', () => {
			assert.deepStrictEqual(
				getOptionsWithDefaultsFirst({ ...single, defaultValue: 'o2' }).map(o => o.originalIndex),
				[1, 0],
			);
		});
	});

	suite('formatQuestionPrompt', () => {
		// These expectations are byte-identical to the Python fixtures in
		// apps/voice_code/tests/test_session_pending.py::test_format_*. The client
		// speaks question 1 and the backend speaks 2..N, so a divergence here is
		// audible as the assistant changing register partway through one form.
		test('single select', () => {
			assert.strictEqual(
				formatQuestionPrompt(single, false),
				'Which region? Options: 1, West US. 2, East US.',
			);
		});

		test('appends the skip hint when the form allows skipping', () => {
			assert.strictEqual(
				formatQuestionPrompt(single, true),
				'Which region? Options: 1, West US. 2, East US. Or say skip.',
			);
		});

		test('mentions freeform when the question allows it', () => {
			assert.strictEqual(
				formatQuestionPrompt(multi, false),
				'Which features? Options: 1, Auth. 2, Search. 3, Billing. You can also give your own answer.',
			);
		});

		test('a text question is just its title', () => {
			assert.strictEqual(formatQuestionPrompt(text, false), 'Anything else?');
		});

		test('a text question with skip', () => {
			assert.strictEqual(formatQuestionPrompt(text, true), 'Anything else? Or say skip.');
		});

		test('tolerates an empty title', () => {
			assert.strictEqual(
				formatQuestionPrompt({ ...single, title: '' }, false),
				'Options: 1, West US. 2, East US.',
			);
		});

		test('numbers options in displayed order, not declared order', () => {
			assert.strictEqual(
				formatQuestionPrompt({ ...single, defaultValue: 'o2' }, false),
				'Which region? Options: 1, East US. 2, West US.',
			);
		});
	});

	suite('resolveQuestionAnswers', () => {
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

		// A value that is not in the schema means the backend resolved against a
		// stale mirror. Answering the form with a guess is strictly worse than
		// reporting the failure, so one bad entry rejects the whole set.
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
				resolveQuestionAnswers([single], [{ question_id: 'q_single', freeform: 'Central US' }]),
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
