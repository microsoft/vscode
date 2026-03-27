/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { normalizePlanningPromptForComparison, shouldRegeneratePlanningQuestions } from '../../../common/planning/chatPlanningQuestionHeuristics.js';

suite('ChatPlanningQuestionHeuristics', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('strips appended planning context before comparison', () => {
		const normalized = normalizePlanningPromptForComparison([
			'Implement a planning scaffold in chat.',
			'',
			'Planning context from the previous planning step:',
			'- Goal: Clarify scope first'
		].join('\n'));

		assert.strictEqual(normalized, 'implement a planning scaffold in chat.');
	});

	test('regenerates on explicit replanning cues', () => {
		assert.strictEqual(
			shouldRegeneratePlanningQuestions(
				'Actually, switch to a different goal: make Plan refine the questions mid-session.',
				'Implement a planning scaffold in chat.',
				true
			),
			true
		);
	});

	test('does not regenerate on additive follow-up cues', () => {
		assert.strictEqual(
			shouldRegeneratePlanningQuestions(
				'Also include accessibility checks and tests.',
				'Implement a planning scaffold in chat.',
				true
			),
			false
		);
	});

	test('does not regenerate for the same request', () => {
		assert.strictEqual(
			shouldRegeneratePlanningQuestions(
				'Implement a planning scaffold in chat.',
				'Implement a planning scaffold in chat.',
				true
			),
			false
		);
	});

	test('regenerates for a strongly different request even without explicit cue', () => {
		assert.strictEqual(
			shouldRegeneratePlanningQuestions(
				'Investigate telemetry upload failures in the chat backend and propose a fix.',
				'Implement a planning scaffold in chat.',
				true
			),
			true
		);
	});
});
