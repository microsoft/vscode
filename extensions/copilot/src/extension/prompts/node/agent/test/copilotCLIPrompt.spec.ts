/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatCompletionContentPartKind, ChatRole } from '@vscode/prompt-tsx/dist/base/output/rawTypes';
import { expect, suite, test, vi } from 'vitest';
import type { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import type { ChatRequest } from '../../../../../vscodeTypes';
import { ChatVariablesCollection } from '../../../../prompt/common/chatVariablesCollection';
import { renderPromptElement } from '../../base/promptRenderer';
import { generateUserPrompt } from '../copilotCLIPrompt';

vi.mock('../../base/promptRenderer', async importOriginal => {
	const actual = await importOriginal<typeof import('../../base/promptRenderer')>();
	return {
		...actual,
		renderPromptElement: vi.fn(),
	};
});

suite('generateUserPrompt', () => {
	const renderPromptElementMock = vi.mocked(renderPromptElement);
	const request = { prompt: 'Implement this.' } as ChatRequest;
	const chatVariables = new ChatVariablesCollection();
	const instantiationService = {
		invokeFunction<T>(fn: (accessor: { get: (service: unknown) => { getChatEndpoint: (request: ChatRequest) => { family: string } } }) => T): T {
			return fn({
				get: () => ({
					getChatEndpoint: () => ({ family: 'gpt-4.1' }),
				}),
			});
		},
	} as unknown as IInstantiationService;

	test('joins multiple text parts from a generated user prompt', async () => {
		renderPromptElementMock.mockResolvedValue({
			messages: [{
				role: ChatRole.User,
				content: [
					{ type: ChatCompletionContentPartKind.Text, text: '<current_datetime>2026-04-27T12:17:47.949-06:00</current_datetime>\n\n' },
					{ type: ChatCompletionContentPartKind.Text, text: '[CopilotCLISession] Unexpected generated prompt structure.\n\n' },
					{ type: ChatCompletionContentPartKind.Text, text: '<reminder>\n<sql_tables>Available tables: todos, todo_deps, inbox_entries</sql_tables>\n</reminder>' },
				],
			}],
		} as Awaited<ReturnType<typeof renderPromptElement>>);

		await expect(generateUserPrompt(request, undefined, chatVariables, instantiationService)).resolves.toBe(
			'<current_datetime>2026-04-27T12:17:47.949-06:00</current_datetime>\n\n' +
			'[CopilotCLISession] Unexpected generated prompt structure.\n\n' +
			'<reminder>\n<sql_tables>Available tables: todos, todo_deps, inbox_entries</sql_tables>\n</reminder>'
		);
	});

	test('joins text parts across multiple generated user messages', async () => {
		renderPromptElementMock.mockResolvedValue({
			messages: [
				{
					role: ChatRole.User,
					content: [
						{ type: ChatCompletionContentPartKind.Text, text: '<current_datetime>2026-04-27T13:29:45.461-06:00</current_datetime>\n\n' },
					],
				},
				{
					role: ChatRole.User,
					content: [
						{ type: ChatCompletionContentPartKind.Text, text: '[CopilotCLISession] Unexpected generated prompt structure.\n\n' },
						{ type: ChatCompletionContentPartKind.Text, text: '<reminder>\n<sql_tables>Available tables: todos, todo_deps, inbox_entries</sql_tables>\n</reminder>' },
					],
				},
			],
		} as Awaited<ReturnType<typeof renderPromptElement>>);

		await expect(generateUserPrompt(request, undefined, chatVariables, instantiationService)).resolves.toBe(
			'<current_datetime>2026-04-27T13:29:45.461-06:00</current_datetime>\n\n' +
			'[CopilotCLISession] Unexpected generated prompt structure.\n\n' +
			'<reminder>\n<sql_tables>Available tables: todos, todo_deps, inbox_entries</sql_tables>\n</reminder>'
		);
	});

	test('rejects non-text generated user prompt content', async () => {
		renderPromptElementMock.mockResolvedValue({
			messages: [{
				role: ChatRole.User,
				content: [
					{ type: ChatCompletionContentPartKind.Text, text: 'Implement this.' },
					{ type: 'image_url' },
				],
			}],
		} as Awaited<ReturnType<typeof renderPromptElement>>);

		await expect(generateUserPrompt(request, undefined, chatVariables, instantiationService)).rejects.toThrow('[CopilotCLISession] Unexpected generated prompt structure.');
	});
});
