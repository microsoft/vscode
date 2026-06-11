/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { cleanGoalSummary } from '../../browser/chatGoalSummaryService.js';

suite('ChatGoalSummaryService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('cleanGoalSummary', () => {
		test('suppresses model refusals so they are never shown as a goal', () => {
			const refusals = [
				'Sorry, I can\'t assist with that.',
				'Sorry, I can\u2019t assist with that.',
				'I cannot help with that request.',
				'I\'m sorry, but I can\'t help with that.',
				'I am unable to assist with this.',
				'I am not able to summarize that.',
				'Unfortunately, I can\'t do that.',
				'As an AI, I cannot comply.',
				'My apologies, I won\'t do that.',
				'I apologize, but I cannot help.',
			];

			assert.deepStrictEqual(
				refusals.map(cleanGoalSummary),
				refusals.map(() => undefined),
			);
		});

		test('keeps and normalizes legitimate summaries', () => {
			// [rawModelText, expectedGoal]. Includes the meta case of a request that
			// mentions a refusal but is itself a valid goal, plus imperative phrases
			// that begin with words appearing inside the refusal pattern.
			const cases: [string, string | undefined][] = [
				['Fix the avatar popup bug', 'Fix the avatar popup bug'],
				['"Add tests for the parser"', 'Add tests for the parser'],
				['Goal: Refactor the loader', 'Refactor the loader'],
				['  Improve   error   handling  ', 'Improve error handling'],
				['Prevent the "Sorry, I can\'t assist" goal-banner error', 'Prevent the "Sorry, I can\'t assist" goal-banner error'],
				['Implement cannot-connect retry logic', 'Implement cannot-connect retry logic'],
				['I\'ll add tests for the service', 'I\'ll add tests for the service'],
				['', undefined],
				['   ', undefined],
			];

			assert.deepStrictEqual(
				cases.map(([raw]) => cleanGoalSummary(raw)),
				cases.map(([, expected]) => expected),
			);
		});

		test('truncates over-long summaries to a single ellipsized phrase', () => {
			const long = 'Add comprehensive integration tests covering every permission level and autopilot continuation path across the chat widget';
			const result = cleanGoalSummary(long);

			assert.ok(result, 'expected a truncated summary');
			assert.ok(result.length <= 100, `expected <= 100 chars, got ${result.length}`);
			assert.ok(result.endsWith('\u2026'), 'expected a trailing ellipsis');
		});
	});
});
