/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { expect, suite, test } from 'vitest';
import { ChatFetchResponseType } from '../../../../platform/chat/common/commonTypes';
import { ChatResponseStreamImpl } from '../../../../util/common/chatResponseStreamImpl';
import { ChatSubagentToolInvocationData, ChatToolInvocationPart, LanguageModelTextPart } from '../../../../vscodeTypes';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { toolCategories, ToolCategory, ToolName } from '../../common/toolNames';
import { CopilotToolMode, ToolRegistry } from '../../common/toolsRegistry';

// Ensure side-effect registration
import '../executionSubagentTool';

function createTool() {
	const toolCtor = ToolRegistry.getTools().find(t => t.toolName === ToolName.ExecutionSubagent)!;
	let loopOptions: { subAgentInvocationId?: string } | undefined;
	const loop = {
		backgroundCommands: [],
		getModelName: async () => 'Execution Model',
		run: async () => ({
			response: { type: ChatFetchResponseType.Success },
			toolCallRounds: [],
			round: { response: '<final_answer>Tests passed</final_answer>' },
		}),
	};
	const instantiationService = {
		createInstance(_ctor: unknown, options: { subAgentInvocationId?: string }) {
			loopOptions = options;
			return loop;
		},
	};
	const requestLogger = {
		captureInvocation: async (_token: unknown, callback: () => Promise<unknown>) => callback(),
	};
	const configurationService = { getExperimentBasedConfig: () => 10 };
	const tool = new (toolCtor as any)(instantiationService, requestLogger, configurationService, {});
	return { tool, getLoopOptions: () => loopOptions };
}

suite('ExecutionSubagentTool', () => {
	test('is registered and categorized as Core', () => {
		const isRegistered = ToolRegistry.getTools().some(t => t.toolName === ToolName.ExecutionSubagent);
		expect(isRegistered).toBe(true);
		expect(toolCategories[ToolName.ExecutionSubagent]).toBe(ToolCategory.Core);
	});

	test('groups nested tools and metadata updates under the parent tool call', async () => {
		const { tool, getLoopOptions } = createTool();
		const input = { query: 'npm test', description: 'Run tests' };
		const pushedParts: ChatToolInvocationPart[] = [];
		const stream = new ChatResponseStreamImpl(part => {
			if (part instanceof ChatToolInvocationPart) {
				pushedParts.push(part);
			}
		}, () => { });
		await tool.resolveInput(input, {
			request: { id: 'request-id', sessionId: 'session-id', location: 1 },
			conversation: { sessionId: 'conversation-id' },
			stream,
			requestId: 'top-level-turn-id',
		} as unknown as IBuildPromptContext, CopilotToolMode.FullContext);

		const result = await tool.invoke({
			input,
			chatStreamToolCallId: 'parent-tool-call-id',
		} as vscode.LanguageModelToolInvocationOptions<typeof input>, undefined!);
		const responseText = result.content.find((part: unknown): part is LanguageModelTextPart => part instanceof LanguageModelTextPart)?.value;
		const updates = pushedParts.map(part => part.toolSpecificData as ChatSubagentToolInvocationData);

		expect(getLoopOptions()?.subAgentInvocationId).toBe('parent-tool-call-id');
		expect(pushedParts.map(part => part.toolCallId)).toEqual(['parent-tool-call-id', 'parent-tool-call-id']);
		expect(pushedParts.every(part => part.enablePartialUpdate && part.isComplete === false)).toBe(true);
		expect(updates.map(data => data.modelName)).toEqual(['Execution Model', 'Execution Model']);
		expect(updates.map(data => data.result)).toEqual([undefined, 'Tests passed']);
		expect((result.toolMetadata as { modelName?: string }).modelName).toBe('Execution Model');
		expect(responseText).toBe('Tests passed');
	});
});
