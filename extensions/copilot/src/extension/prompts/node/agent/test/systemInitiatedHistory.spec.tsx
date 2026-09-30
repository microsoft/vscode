/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { afterAll, beforeAll, expect, suite, test } from 'vitest';
import type { ChatRequest } from 'vscode';
import { ChatLocation } from '../../../../../platform/chat/common/commonTypes';
import { rawPartAsThinkingData } from '../../../../../platform/endpoint/common/thinkingDataContainer';
import { MockEndpoint } from '../../../../../platform/endpoint/test/node/mockEndpoint';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { ChatRequestTurn, ChatResponseTurn } from '../../../../../util/common/test/shims/chatTypes';
import { SyncDescriptor } from '../../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../../../vscodeTypes';
import { ConversationStore, IConversationStore } from '../../../../conversationStore/node/conversationStore';
import { IIntentService, IntentService } from '../../../../intents/node/intentService';
import { ChatVariablesCollection } from '../../../../prompt/common/chatVariablesCollection';
import { Conversation, Turn, TurnStatus } from '../../../../prompt/common/conversation';
import { ToolCallRound } from '../../../../prompt/common/toolCallRound';
import { addHistoryToConversation } from '../../../../prompt/node/chatParticipantRequestHandler';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { TestChatRequest } from '../../../../test/node/testHelpers';
import { ToolName } from '../../../../tools/common/toolNames';
import { PromptRenderer } from '../../base/promptRenderer';
import { AgentPrompt } from '../agentPrompt';
import { PromptRegistry } from '../promptRegistry';

class ChatCompletionsEndpoint extends MockEndpoint {
	readonly apiType = 'chatCompletions';
	readonly supportsThinkingContentInHistory = false;
	override supportsToolCalls = true;
}

suite('System-initiated task continuation', () => {
	let accessor: ITestingServicesAccessor;
	let endpoint: ChatCompletionsEndpoint;

	beforeAll(async () => {
		const services = createExtensionUnitTestingServices();
		services.define(IConversationStore, new SyncDescriptor(ConversationStore));
		services.define(IIntentService, new SyncDescriptor(IntentService));
		accessor = services.createTestingAccessor();
		endpoint = accessor.get(IInstantiationService).createInstance(ChatCompletionsEndpoint, 'terminal-test-model');
		await endpoint.acquireTokenizer().tokenLength('warmup');
	});

	afterAll(() => accessor.dispose());

	async function renderHistory(history: Turn[], request: ChatRequest, enableSummarization: boolean, selectedEndpoint = endpoint) {
		const instantiationService = accessor.get(IInstantiationService);
		const renderer = PromptRenderer.create(instantiationService, selectedEndpoint, AgentPrompt, {
			priority: 1,
			endpoint: selectedEndpoint,
			location: ChatLocation.Panel,
			enableSummarization,
			enableCacheBreakpoints: enableSummarization,
			customizations: await PromptRegistry.resolveAllCustomizations(instantiationService, selectedEndpoint),
			promptContext: {
				request,
				query: request.prompt,
				chatVariables: new ChatVariablesCollection([]),
				conversation: new Conversation('session', [...history, Turn.fromRequest(request.id, request)]),
				history,
				toolCallRounds: [],
				tools: { availableTools: [], toolReferences: [], toolInvocationToken: request.toolInvocationToken },
			},
		});
		const result = await renderer.render();
		return {
			parts: result.messages.flatMap(message => message.content),
			toolCallIds: result.messages.flatMap(message => message.role === Raw.ChatRole.Assistant ? message.toolCalls?.map(call => call.id) ?? [] : []),
		};
	}

	for (const enableSummarization of [false, true]) {
		test(`terminal completion preserves only the current task's reasoning (summarization: ${enableSummarization})`, async () => {
			const earlierTask = Turn.fromRequest('earlier', new TestChatRequest('An earlier user task'));
			earlierTask.setResponse(TurnStatus.Success, undefined, undefined, {
				metadata: {
					toolCallRounds: [ToolCallRound.create({
						response: 'Earlier task done', toolCalls: [], toolInputRetry: 0, modelId: endpoint.model,
						thinking: { id: 'earlier-thinking', text: 'Earlier task reasoning', encrypted: 'earlier-opaque' },
					})],
				},
			});

			const task = Turn.fromRequest('task', new TestChatRequest('Read the input and wait for the long command'));
			task.setResponse(TurnStatus.Success, undefined, undefined, {
				metadata: {
					toolCallRounds: [
						ToolCallRound.create({
							response: 'Running the command', toolInputRetry: 0, modelId: endpoint.model,
							toolCalls: [{ id: 'terminal-call', name: ToolName.CoreRunInTerminal, arguments: '{"command":"sleep 320 && echo NOTIFY-DONE"}' }],
							thinking: { id: 'command-thinking', text: 'Keep the task plan while the command runs', encrypted: 'command-opaque' },
						}),
						ToolCallRound.create({
							response: 'Waiting for completion', toolCalls: [], toolInputRetry: 0, modelId: endpoint.model,
							thinking: { id: 'waiting-thinking', text: 'Use the result to finish the task', encrypted: 'waiting-opaque' },
						}),
						ToolCallRound.create({
							response: 'A completed call whose result was not retained', toolInputRetry: 0, modelId: endpoint.model,
							toolCalls: [{ id: 'completed-without-result', name: ToolName.CoreRunInTerminal, arguments: '{"command":"echo SHOULD-NOT-RUN"}' }],
						}),
					],
					toolCallResults: {
						'terminal-call': new LanguageModelToolResult([new LanguageModelTextPart('The command was moved to background terminal terminal-1')]),
					},
				},
			});

			const notification = '[Terminal terminal-1 notification: command completed.]\nTerminal output:\nNOTIFY-DONE';
			const request = { ...new TestChatRequest(notification), isSystemInitiated: true };
			const { parts, toolCallIds } = await renderHistory([earlierTask, task], request, enableSummarization);
			const switchedEndpoint = accessor.get(IInstantiationService).createInstance(ChatCompletionsEndpoint, 'different-model');
			const switched = await renderHistory([earlierTask, task], request, enableSummarization, switchedEndpoint);
			expect({
				thinking: parts.flatMap(part => part.type === Raw.ChatCompletionContentPartKind.Opaque ? rawPartAsThinkingData(part) ?? [] : []),
				thinkingAfterModelSwitch: switched.parts.flatMap(part => part.type === Raw.ChatCompletionContentPartKind.Opaque ? rawPartAsThinkingData(part) ?? [] : []),
				toolCallIds,
				notifications: parts.filter(part => part.type === Raw.ChatCompletionContentPartKind.Text && part.text.includes('NOTIFY-DONE')),
			}).toEqual({
				thinking: [
					{ id: 'command-thinking', text: 'Keep the task plan while the command runs', encrypted: 'command-opaque' },
					{ id: 'waiting-thinking', text: 'Use the result to finish the task', encrypted: 'waiting-opaque' },
				],
				thinkingAfterModelSwitch: [],
				toolCallIds: ['terminal-call'],
				notifications: [{ type: Raw.ChatCompletionContentPartKind.Text, text: notification }],
			});
		});

		for (const restore of [false, true]) {
			test(`repeated notifications continue the task until user input (summarization: ${enableSummarization}, restored: ${restore})`, async () => {
				const notification = '[Terminal terminal-1 notification: command completed.]\nTerminal output:\nNOTIFY-FIRST';
				const requests: ChatRequest[] = [
					new TestChatRequest('Wait for both commands'),
					{ ...new TestChatRequest(notification), isSystemInitiated: true },
				];
				let history = requests.map((request, i) => {
					const turn = Turn.fromRequest(request.id, request);
					turn.setResponse(TurnStatus.Success, undefined, undefined, {
						metadata: {
							toolCallRounds: [ToolCallRound.create({
								response: 'Waiting', toolCalls: [], toolInputRetry: 0, modelId: endpoint.model,
								thinking: { id: `thinking-${i}`, text: `Task reasoning ${i}`, encrypted: `opaque-${i}` },
							})],
						},
					});
					return turn;
				});
				if (restore) {
					const vscodeHistory = history.flatMap(turn => [
						Object.assign(new ChatRequestTurn(turn.request.message, undefined, [], 'test.participant', []), { isSystemInitiated: turn.isSystemInitiated }),
						new ChatResponseTurn([], turn.responseChatResult!, 'test.participant'),
					]);
					history = accessor.get(IInstantiationService).invokeFunction(addHistoryToConversation, vscodeHistory).turns;
				}
				const nextNotification = { ...new TestChatRequest('[Terminal terminal-2 notification: command completed.]\nTerminal output:\nNOTIFY-SECOND'), isSystemInitiated: true };
				const { parts } = await renderHistory(history, nextNotification, enableSummarization);
				const { parts: userParts } = await renderHistory(history, new TestChatRequest('Start another task'), enableSummarization);
				expect({
					thinking: parts.flatMap(part => part.type === Raw.ChatCompletionContentPartKind.Opaque ? rawPartAsThinkingData(part) ?? [] : []),
					outputs: parts.flatMap(part => part.type === Raw.ChatCompletionContentPartKind.Text ? part.text.match(/NOTIFY-(?:FIRST|SECOND)/g) ?? [] : []),
					thinkingAfterUserInput: userParts.flatMap(part => part.type === Raw.ChatCompletionContentPartKind.Opaque ? rawPartAsThinkingData(part) ?? [] : []),
				}).toEqual({
					thinking: [
						{ id: 'thinking-0', text: 'Task reasoning 0', encrypted: 'opaque-0' },
						{ id: 'thinking-1', text: 'Task reasoning 1', encrypted: 'opaque-1' },
					],
					outputs: ['NOTIFY-FIRST', 'NOTIFY-SECOND'],
					thinkingAfterUserInput: [],
				});
			});
		}
	}
});
