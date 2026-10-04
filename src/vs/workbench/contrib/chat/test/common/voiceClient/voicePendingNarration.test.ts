/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IVoicePendingQuestion } from '../../../common/voiceClient/voiceClientService.js';
import { formatQuestionPrompt } from '../../../common/voiceClient/voicePendingNarration.js';

suite('formatQuestionPrompt', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// Every expectation below is byte-identical to the Python fixtures in
	// apps/voice_code/tests/test_session_pending.py::test_format_*. The client
	// speaks question 1 of a form and the backend speaks 2..N as it replies to
	// each answer, so a divergence is audible as the assistant changing register
	// partway through one form.

	const single: IVoicePendingQuestion = {
		id: 'q_single',
		type: 'singleSelect',
		title: 'Which region?',
		allow_freeform: false,
		options: [
			{ label: 'West US', value: 'westus' },
			{ label: 'East US', value: 'eastus' },
		],
	};

	const multi: IVoicePendingQuestion = {
		id: 'q_multi',
		type: 'multiSelect',
		title: 'Which features?',
		allow_freeform: true,
		options: [
			{ label: 'Auth', value: 'auth' },
			{ label: 'Search', value: 'search' },
			{ label: 'Billing', value: 'billing' },
		],
	};

	const text: IVoicePendingQuestion = {
		id: 'q_text',
		type: 'text',
		title: 'Anything else?',
		allow_freeform: true,
		options: [],
	};

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
		// Freeform-capable, but the hint is suppressed: it only means something
		// when there is a list of options to answer *instead of*.
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

	test('reads the ordinals it was given rather than renumbering', () => {
		// The ordinals come from `_buildPendingPayload`, which assigns them from
		// the widget's displayed order. Renumbering here would be a second,
		// independent source of truth for the number the user says back.
		assert.strictEqual(
			formatQuestionPrompt(
				{
					...single,
					options: [
						{ label: 'East US', value: 'eastus' },
						{ label: 'West US', value: 'westus' },
					],
				},
				false,
			),
			'Which region? Options: 1, East US. 2, West US.',
		);
	});
});
