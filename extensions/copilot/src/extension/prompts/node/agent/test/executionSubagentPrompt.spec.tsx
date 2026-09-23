/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { MockEndpoint } from '../../../../../platform/endpoint/test/node/mockEndpoint';
import { messageToMarkdown } from '../../../../../platform/log/common/messageStringify';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatVariablesCollection } from '../../../../prompt/common/chatVariablesCollection';
import { Conversation, Turn } from '../../../../prompt/common/conversation';
import { IBuildPromptContext } from '../../../../prompt/common/intents';
import { ToolCallRound } from '../../../../prompt/common/toolCallRound';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { renderPromptElement } from '../../base/promptRenderer';
import { ExecutionSubagentPrompt } from '../executionSubagentPrompt';

suite('ExecutionSubagentPrompt', () => {
	async function renderPrompt(turnWisePrompting: boolean, currentTurn: number): Promise<string> {
		const services = createExtensionUnitTestingServices();
		const accessor = services.createTestingAccessor();
		try {
			const instantiationService = accessor.get(IInstantiationService);
			const endpoint = instantiationService.createInstance(MockEndpoint, 'gemini-3-flash');
			const promptContext: IBuildPromptContext = {
				chatVariables: new ChatVariablesCollection(),
				conversation: new Conversation('session', [new Turn('turn', { type: 'user', message: 'Run the tests' })]),
				history: [],
				query: 'Run the tests',
				toolCallRounds: Array.from({ length: currentTurn }, () => ToolCallRound.create({
					response: '',
					toolCalls: [],
					toolInputRetry: 0,
				})),
			};
			const { messages } = await renderPromptElement(instantiationService, endpoint, ExecutionSubagentPrompt, {
				promptContext,
				maxExecutionTurns: 3,
				turnWisePrompting,
			});
			return messages.map(message => messageToMarkdown(message)).join('\n\n');
		} finally {
			accessor.dispose();
			services.dispose();
		}
	}

	test('preserves the legacy prompt before the last turn by default', async () => {
		expect(await renderPrompt(false, 1)).not.toContain('allotted iterations');
	});

	test('preserves the legacy final-turn prompt by default', async () => {
		expect(await renderPrompt(false, 2)).toContain('OK, your allotted iterations are finished. Show the <final_answer>.');
	});

	test('shows the remaining iterations on every turn when turn-wise prompting is enabled', async () => {
		expect(await renderPrompt(true, 1)).toContain('You have 2 of 3 allotted iterations remaining. When one iteration remains, do not call tools; return only the <final_answer>.');
		const finalTurnPrompt = await renderPrompt(true, 2);
		expect(finalTurnPrompt).toContain('You have 1 of 3 allotted iterations remaining. When one iteration remains, do not call tools; return only the <final_answer>.');
		expect(finalTurnPrompt).not.toContain('OK, your allotted iterations are finished.');
	});
});
