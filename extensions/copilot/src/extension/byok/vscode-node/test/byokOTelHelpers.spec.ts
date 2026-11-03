/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import type { LanguageModelChatMessage } from 'vscode';
import { LanguageModelChatMessageRole, LanguageModelTextPart, LanguageModelToolCallPart, LanguageModelToolResultPart } from '../../../../vscodeTypes';
import { buildOTelInputFromChatMessages } from '../byokOTelHelpers';

describe('buildOTelInputFromChatMessages', () => {
	it('extracts a single system message and removes it from input messages', () => {
		const messages: LanguageModelChatMessage[] = [
			{ role: LanguageModelChatMessageRole.System, content: [new LanguageModelTextPart('You are helpful')], name: undefined },
			{ role: LanguageModelChatMessageRole.User, content: [new LanguageModelTextPart('hi')], name: undefined },
		];

		const { systemTexts, inputMsgs } = buildOTelInputFromChatMessages(messages);

		expect(systemTexts).toEqual(['You are helpful']);
		expect(inputMsgs).toEqual([
			{ role: 'user', parts: [{ type: 'text', content: 'hi' }] },
		]);
	});

	it('preserves order of multiple system messages', () => {
		const messages: LanguageModelChatMessage[] = [
			{ role: LanguageModelChatMessageRole.System, content: [new LanguageModelTextPart('personality')], name: undefined },
			{ role: LanguageModelChatMessageRole.System, content: [new LanguageModelTextPart('instructions')], name: undefined },
			{ role: LanguageModelChatMessageRole.User, content: [new LanguageModelTextPart('hi')], name: undefined },
		];

		const { systemTexts, inputMsgs } = buildOTelInputFromChatMessages(messages);

		expect(systemTexts).toEqual(['personality', 'instructions']);
		expect(inputMsgs).toHaveLength(1);
	});

	it('drops non-text parts inside a system message', () => {
		const messages: LanguageModelChatMessage[] = [
			{
				role: LanguageModelChatMessageRole.System,
				content: [
					new LanguageModelTextPart('keep me'),
					new LanguageModelToolCallPart('id1', 'tool', { a: 1 }),
				],
				name: undefined,
			},
		];

		const { systemTexts } = buildOTelInputFromChatMessages(messages);

		expect(systemTexts).toEqual(['keep me']);
	});

	it('maps tool_call and tool_call_response parts', () => {
		const messages: LanguageModelChatMessage[] = [
			{
				role: LanguageModelChatMessageRole.Assistant,
				content: [new LanguageModelToolCallPart('call_1', 'search', { q: 'vscode' })],
				name: undefined,
			},
			{
				role: LanguageModelChatMessageRole.User,
				content: [new LanguageModelToolResultPart('call_1', [new LanguageModelTextPart('result')])],
				name: undefined,
			},
		];

		const { inputMsgs } = buildOTelInputFromChatMessages(messages);

		expect(inputMsgs).toEqual([
			{ role: 'assistant', parts: [{ type: 'tool_call', id: 'call_1', name: 'search', arguments: { q: 'vscode' } }] },
			{ role: 'user', parts: [{ type: 'tool_call_response', id: 'call_1', response: 'result' }] },
		]);
	});

	it('falls back to a placeholder when no parts are recognized', () => {
		const messages: LanguageModelChatMessage[] = [
			{ role: LanguageModelChatMessageRole.User, content: [], name: undefined },
		];

		const { inputMsgs } = buildOTelInputFromChatMessages(messages);

		expect(inputMsgs).toEqual([
			{ role: 'user', parts: [{ type: 'text', content: '[non-text content]' }] },
		]);
	});

	it('falls back to a placeholder when tool_result has no text content', () => {
		const messages: LanguageModelChatMessage[] = [
			{
				role: LanguageModelChatMessageRole.User,
				content: [new LanguageModelToolResultPart('call_1', [])],
				name: undefined,
			},
		];

		const { inputMsgs } = buildOTelInputFromChatMessages(messages);

		expect(inputMsgs).toEqual([
			{ role: 'user', parts: [{ type: 'tool_call_response', id: 'call_1', response: '[non-text content]' }] },
		]);
	});

	it('returns empty results for an empty messages array', () => {
		expect(buildOTelInputFromChatMessages([])).toEqual({ systemTexts: [], inputMsgs: [] });
	});
});
