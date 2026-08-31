/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { cleanNextUserMessageSuggestion, createNextUserMessagePrompt, truncateSuggestionContext } from '../../common/nextUserMessageSuggestion.js';

suite('Sessions - Next User Message Suggestion', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves the head and tail when bounding context', () => {
		assert.deepStrictEqual([
			truncateSuggestionContext('abcdefghijklmnopqrstuvwxyz', 24),
			truncateSuggestionContext('abcdefghij', 5),
		], [
			'abc\n...[truncated]...\nyz',
			'abcde',
		]);
	});

	test('builds a prompt from bounded untrusted fields', () => {
		const prompt = createNextUserMessagePrompt('request', 'response');
		assert.deepStrictEqual({
			hasPredictionContract: prompt.includes('Predict what they would actually type'),
			hasUntrustedWarning: prompt.includes('untrusted conversation data'),
			hasRequest: prompt.includes('<latest_user_request>\nrequest\n</latest_user_request>'),
			hasResponse: prompt.includes('<final_assistant_response>\nresponse\n</final_assistant_response>'),
		}, {
			hasPredictionContract: true,
			hasUntrustedWarning: true,
			hasRequest: true,
			hasResponse: true,
		});
	});

	test('accepts natural continuations', () => {
		assert.deepStrictEqual([
			cleanNextUserMessageSuggestion('Run the focused tests'),
			cleanNextUserMessageSuggestion('"Can you show the diff?"'),
			cleanNextUserMessageSuggestion('继续运行测试'),
		], [
			'Run the focused tests',
			'Can you show the diff?',
			'继续运行测试',
		]);
	});

	test('rejects absent, malformed, vague, and assistant-like output', () => {
		assert.deepStrictEqual([
			cleanNextUserMessageSuggestion('NONE'),
			cleanNextUserMessageSuggestion('Done'),
			cleanNextUserMessageSuggestion('Suggestion: Run tests'),
			cleanNextUserMessageSuggestion('- Run tests'),
			cleanNextUserMessageSuggestion('/test everything'),
			cleanNextUserMessageSuggestion('Thanks for your help'),
			cleanNextUserMessageSuggestion('Sorry, I cannot help'),
			cleanNextUserMessageSuggestion('No suggestion available'),
			cleanNextUserMessageSuggestion('**Run the tests**'),
			cleanNextUserMessageSuggestion('Run tests\nthen commit'),
		], [
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
		]);
	});
});
