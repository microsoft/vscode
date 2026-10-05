/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { afterAll, beforeAll, expect, suite, test } from 'vitest';
import type { ChatRequest, LanguageModelChat, LanguageModelChatMessage, LanguageModelChatMessage2, LanguageModelChatRequestOptions, LanguageModelResponsePart2 } from 'vscode';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../../platform/chat/common/blockedExtensionService';
import { IChatMLFetcher, IFetchMLOptions } from '../../../../../platform/chat/common/chatMLFetcher';
import { ChatLocation } from '../../../../../platform/chat/common/commonTypes';
import { MockChatMLFetcher } from '../../../../../platform/chat/test/common/mockChatMLFetcher';
import { rawPartAsThinkingData } from '../../../../../platform/endpoint/common/thinkingDataContainer';
import { MockEndpoint } from '../../../../../platform/endpoint/test/node/mockEndpoint';
import { ExtensionContributedChatEndpoint } from '../../../../../platform/endpoint/vscode-node/extChatEndpoint';
import { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { EncryptedThinkingDelta, ThinkingDelta } from '../../../../../platform/thinking/common/thinking';
import { ChatRequestTurn, ChatResponseTurn } from '../../../../../util/common/test/shims/chatTypes';
import { AsyncIterableObject } from '../../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../../util/vs/base/common/event';
import { SyncDescriptor } from '../../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelChatToolMode, LanguageModelTextPart, LanguageModelToolResult } from '../../../../../vscodeTypes';
import { IBYOKStorageService } from '../../../../byok/vscode-node/byokStorageService';
import { CustomEndpointBYOKModelProvider } from '../../../../byok/vscode-node/customEndpointProvider';
import { ConversationStore, IConversationStore } from '../../../../conversationStore/node/conversationStore';
import { IIntentService, IntentService } from '../../../../intents/node/intentService';
import { ChatVariablesCollection } from '../../../../prompt/common/chatVariablesCollection';
import { Conversation, Turn, TurnStatus } from '../../../../prompt/common/conversation';
import { ThinkingDataItem, ToolCallRound } from '../../../../prompt/common/toolCallRound';
import { addHistoryToConversation } from '../../../../prompt/node/chatParticipantRequestHandler';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { TestChatRequest } from '../../../../test/node/testHelpers';
import { ToolName } from '../../../../tools/common/toolNames';
import { PromptRenderer } from '../../base/promptRenderer';
import { AgentPrompt } from '../agentPrompt';
import { PromptRegistry } from '../promptRegistry';

class ChatCompletionsEndpoint extends MockEndpoint {
	apiType: string | undefined = 'chatCompletions';
	readonly supportsThinkingContentInHistory = false;
	override supportsToolCalls = true;
}

class CapturingFetcher implements IChatMLFetcher {
	declare readonly _serviceBrand: undefined;
	readonly onDidMakeChatMLRequest = Event.None;
	readonly requests: IFetchMLOptions[] = [];
	private readonly delegate = new MockChatMLFetcher();
	thinking: ThinkingDelta | EncryptedThinkingDelta = { id: 'budget-thinking', text: 'Waiting for the terminal', encrypted: 'signed-budget-state' };

	async fetchOne(options: IFetchMLOptions) {
		this.requests.push(options);
		await options.finishedCb?.('answer', 0, { text: '', thinking: this.thinking });
		await options.finishedCb?.('answer', 0, { text: 'answer' });
		return this.delegate.fetchOne();
	}

	fetchMany() {
		return this.delegate.fetchMany();
	}
}

suite('System-initiated task continuation', () => {
	let accessor: ITestingServicesAccessor;
	let endpoint: ChatCompletionsEndpoint;
	let fetcher: CapturingFetcher;

	beforeAll(async () => {
		const services = createExtensionUnitTestingServices();
		services.define(IConversationStore, new SyncDescriptor(ConversationStore));
		services.define(IIntentService, new SyncDescriptor(IntentService));
		services.define(IBlockedExtensionService, new SyncDescriptor(BlockedExtensionService));
		fetcher = new CapturingFetcher();
		services.define(IChatMLFetcher, fetcher);
		accessor = services.createTestingAccessor();
		endpoint = accessor.get(IInstantiationService).createInstance(ChatCompletionsEndpoint, 'terminal-test-model');
		await endpoint.acquireTokenizer().tokenLength('warmup');
	});

	afterAll(() => accessor.dispose());

	async function renderHistory(history: Turn[], request: ChatRequest, enableSummarization: boolean, selectedEndpoint: IChatEndpoint = endpoint) {
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
			messages: result.messages,
			parts: result.messages.flatMap(message => message.content),
			toolCallIds: result.messages.flatMap(message => message.role === Raw.ChatRole.Assistant ? message.toolCalls?.map(call => call.id) ?? [] : []),
		};
	}

	for (const enableSummarization of [false, true]) {
		test.each([
			{ apiType: 'messages', modelId: 'opaque-budget-model', preservesThinking: false },
			{ apiType: 'messages', modelId: 'kimi-k3', preservesThinking: false },
			{ apiType: 'chat-completions', modelId: 'opaque-chat-completions-model', preservesThinking: true },
		] as const)(`custom provider continuation respects the actual transport (summarization: ${enableSummarization}, API: $apiType, model: $modelId)`, async ({ apiType, modelId, preservesThinking }) => {
			const instantiationService = accessor.get(IInstantiationService);
			const storage: IBYOKStorageService = {
				getAPIKey: async () => undefined,
				storeAPIKey: async () => undefined,
				deleteAPIKey: async () => undefined,
				getStoredModelConfigs: async () => ({}),
				saveModelConfig: async () => undefined,
				removeModelConfig: async () => undefined,
			};
			const provider = instantiationService.createInstance(CustomEndpointBYOKModelProvider, storage);
			const [model] = await provider.provideLanguageModelChatInformation({ silent: true, configuration: { models: [{
				id: modelId, name: 'Model behind a custom endpoint', url: 'https://example.invalid', apiType,
				maxInputTokens: 32000, maxOutputTokens: 8192, toolCalling: true, vision: false, thinking: true, adaptiveThinking: false,
				minThinkingBudget: 1024, maxThinkingBudget: 4096,
			}] } }, CancellationToken.None);
			const languageModel: LanguageModelChat = {
				id: model.id, name: model.name, vendor: 'customendpoint', family: model.family, version: model.version,
				maxInputTokens: model.maxInputTokens,
				capabilities: { supportsToolCalling: true, supportsImageToText: false },
				countTokens: (text, token) => provider.provideTokenCount(model, text, token ?? CancellationToken.None),
				sendRequest: async (messages: readonly (LanguageModelChatMessage | LanguageModelChatMessage2)[], options?: LanguageModelChatRequestOptions, token?: CancellationToken) => {
					const parts: LanguageModelResponsePart2[] = [];
					await provider.provideLanguageModelChatResponse(model, [...messages], {
						requestInitiator: 'core', tools: options?.tools ?? [], toolMode: LanguageModelChatToolMode.Auto,
						modelOptions: options?.modelOptions, includeEncryptedThinking: true,
					}, { report: part => parts.push(part) }, token ?? CancellationToken.None);
					return { stream: AsyncIterableObject.fromArray(parts), text: AsyncIterableObject.fromArray(['answer']) };
				},
			};
			const customEndpoint = instantiationService.createInstance(ExtensionContributedChatEndpoint, languageModel);
			fetcher.thinking = apiType === 'messages'
				? { id: 'budget-thinking', text: 'Waiting for the terminal', encrypted: 'signed-budget-state' }
				: { id: 'chat-thinking', text: 'Retain this task reasoning byte-for-byte' };
			let thinking: ThinkingDataItem | undefined;
			await customEndpoint.makeChatRequest2({
				debugName: 'source task', location: ChatLocation.Agent,
				messages: [{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Wait for a command' }] }],
				finishedCb: async (_text, _index, delta) => {
					if (delta.thinking) {
						thinking = ThinkingDataItem.createOrUpdate(thinking, delta.thinking);
					}
				},
			}, CancellationToken.None);
			expect(thinking?.metadata?.vscode_thinking_origin_api).toBe(apiType === 'messages' ? 'messages' : 'chatCompletions');
			const task = Turn.fromRequest('task', new TestChatRequest('Wait for a command'));
			task.setResponse(TurnStatus.Success, undefined, undefined, { metadata: {
				toolCallRounds: [ToolCallRound.create({ response: 'Waiting', toolCalls: [], toolInputRetry: 0, modelId: customEndpoint.model, thinking })],
			} });
			const request = { ...new TestChatRequest('[Terminal notification: command completed.] NOTIFY-DONE'), isSystemInitiated: true };
			const rendered = await renderHistory([task], request, enableSummarization, customEndpoint);
			await customEndpoint.makeChatRequest2({ debugName: 'notification', location: ChatLocation.Agent, messages: rendered.messages, finishedCb: undefined }, CancellationToken.None);
			const sent = fetcher.requests.at(-1)!;
			const body = sent.endpoint.createRequestBody({ ...sent, requestId: 'notification', postOptions: sent.requestOptions });
			const responseMessages: { role: string; reasoning_content?: string; cot_id?: string }[] = body.messages ?? [];
			expect({
				actualApiType: sent.endpoint.apiType,
				hasBudgetSignature: JSON.stringify(body.messages).includes('signed-budget-state'),
				chatCompletionsReasoning: responseMessages.filter(message => message.role === 'assistant' && message.reasoning_content).map(message => ({ id: message.cot_id, text: message.reasoning_content })),
				notifications: JSON.stringify(body.messages).match(/NOTIFY-DONE/g)?.length,
			}).toEqual({
				actualApiType: apiType === 'messages' ? 'messages' : 'chatCompletions',
				hasBudgetSignature: false,
				chatCompletionsReasoning: preservesThinking ? [{ id: 'chat-thinking', text: 'Retain this task reasoning byte-for-byte' }] : [],
				notifications: 1,
			});
		});

		test.each([
			{ apiType: 'chatCompletions', originApi: undefined, preservesThinking: true },
			{ apiType: undefined, originApi: 'chatCompletions', preservesThinking: true },
			{ apiType: undefined, originApi: undefined, preservesThinking: false },
		] as const)(`terminal completion preserves only known current-task reasoning (summarization: ${enableSummarization}, API: $apiType, origin: $originApi)`, async ({ apiType, originApi, preservesThinking }) => {
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
							originApi,
							toolCalls: [{ id: 'terminal-call', name: ToolName.CoreRunInTerminal, arguments: '{"command":"sleep 320 && echo NOTIFY-DONE"}' }],
							thinking: { id: 'command-thinking', text: 'Keep the task plan while the command runs', encrypted: 'command-opaque' },
						}),
						ToolCallRound.create({
							response: 'Waiting for completion', toolCalls: [], toolInputRetry: 0, modelId: endpoint.model,
							originApi,
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
			const selectedEndpoint = accessor.get(IInstantiationService).createInstance(ChatCompletionsEndpoint, endpoint.model);
			selectedEndpoint.apiType = apiType;
			const { parts, toolCallIds } = await renderHistory([earlierTask, task], request, enableSummarization, selectedEndpoint);
			const switchedEndpoint = accessor.get(IInstantiationService).createInstance(ChatCompletionsEndpoint, 'different-model');
			switchedEndpoint.apiType = apiType;
			const switched = await renderHistory([earlierTask, task], request, enableSummarization, switchedEndpoint);
			expect({
				thinking: parts.flatMap(part => part.type === Raw.ChatCompletionContentPartKind.Opaque ? rawPartAsThinkingData(part) ?? [] : []),
				thinkingAfterModelSwitch: switched.parts.flatMap(part => part.type === Raw.ChatCompletionContentPartKind.Opaque ? rawPartAsThinkingData(part) ?? [] : []),
				toolCallIds,
				notifications: parts.filter(part => part.type === Raw.ChatCompletionContentPartKind.Text && part.text.includes('NOTIFY-DONE')),
			}).toEqual({
				thinking: preservesThinking ? [
					{ id: 'command-thinking', text: 'Keep the task plan while the command runs', encrypted: 'command-opaque' },
					{ id: 'waiting-thinking', text: 'Use the result to finish the task', encrypted: 'waiting-opaque' },
				] : [],
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
