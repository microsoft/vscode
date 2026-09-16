/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { KeyCodeChord } from '../../../../../base/common/keybindings.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ACCEPT_NEXT_USER_MESSAGE_SUGGESTION_COMMAND_ID, shouldDismissNextUserMessageSuggestion } from '../../browser/nextUserMessageSuggestion.js';
import { cleanNextUserMessageSuggestion, createNextUserMessageContext, createNextUserMessagePrompt, truncateSuggestionContext } from '../../common/nextUserMessageSuggestion.js';

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

	test('dismisses through the remappable inline suggestion command', () => {
		assert.deepStrictEqual([
			shouldDismissNextUserMessageSuggestion('editor.action.inlineSuggest.hide', true),
			shouldDismissNextUserMessageSuggestion('editor.action.inlineSuggest.hide', false),
			shouldDismissNextUserMessageSuggestion('other.command', true),
		], [true, false, false]);
	});

	test('accepts with Right Arrow while Tab keeps its editor behavior', () => {
		const keybindings = KeybindingsRegistry.getDefaultKeybindings();
		const accept = keybindings.find(keybinding => keybinding.command === ACCEPT_NEXT_USER_MESSAGE_SUGGESTION_COMMAND_ID);
		const tab = keybindings.find(keybinding => keybinding.command === 'tab' && keybinding.when?.serialize().includes('sessionsNextUserMessageSuggestionVisible'));
		const acceptChord = accept?.keybinding?.chords[0];
		const tabChord = tab?.keybinding?.chords[0];

		assert.deepStrictEqual({
			acceptKey: acceptChord instanceof KeyCodeChord ? acceptChord.keyCode : undefined,
			acceptIsScoped: accept?.when?.serialize().includes('sessionsNextUserMessageSuggestionVisible'),
			tabKey: tabChord instanceof KeyCodeChord ? tabChord.keyCode : undefined,
			tabIsScoped: tab?.when?.serialize().includes('sessionsNextUserMessageSuggestionVisible'),
		}, {
			acceptKey: KeyCode.RightArrow,
			acceptIsScoped: true,
			tabKey: KeyCode.Tab,
			tabIsScoped: true,
		});
	});

	test('builds a prompt from bounded untrusted fields', () => {
		const prompt = createNextUserMessagePrompt();
		const context = createNextUserMessageContext(`request-start-${'r'.repeat(2000)}-request-end`, `response-start-${'s'.repeat(10000)}-response-end`);
		assert.deepStrictEqual({
			hasPredictionContract: prompt.includes('Predict what they would actually type'),
			prioritizesFinalResponse: prompt.includes('Prefer responding to its explicit question, offer, or concrete next step'),
			prefersRequests: prompt.includes('Prefer a concise request or action over a question'),
			requestLength: context.latestRequest.length,
			requestStart: context.latestRequest.startsWith('request-start-'),
			requestEnd: context.latestRequest.endsWith('-request-end'),
			responseLength: context.finalResponse.length,
			responseStart: context.finalResponse.startsWith('response-start-'),
			responseEnd: context.finalResponse.endsWith('-response-end'),
		}, {
			hasPredictionContract: true,
			prioritizesFinalResponse: true,
			prefersRequests: true,
			requestLength: 2000,
			requestStart: true,
			requestEnd: true,
			responseLength: 10000,
			responseStart: true,
			responseEnd: true,
		});
	});

	test('accepts natural continuations', () => {
		assert.deepStrictEqual([
			cleanNextUserMessageSuggestion('Run the focused tests'),
			cleanNextUserMessageSuggestion('"Can you show the diff?"'),
			cleanNextUserMessageSuggestion('“Can you show the diff?”'),
			cleanNextUserMessageSuggestion('继续运行测试'),
		], [
			'Run the focused tests',
			'Can you show the diff?',
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
