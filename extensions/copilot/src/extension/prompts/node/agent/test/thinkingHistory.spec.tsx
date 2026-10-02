/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, expect, suite, test } from 'vitest';
import type * as vscode from 'vscode';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../../platform/chat/common/blockedExtensionService';
import { IChatMLFetcher, IFetchMLOptions } from '../../../../../platform/chat/common/chatMLFetcher';
import { ChatFetchResponseType, ChatLocation, ChatResponse, ChatResponses } from '../../../../../platform/chat/common/commonTypes';
import { MockChatMLFetcher } from '../../../../../platform/chat/test/common/mockChatMLFetcher';
import { ConfigKey, IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { ModelSupportedEndpoint } from '../../../../../platform/endpoint/common/endpointProvider';
import { CopilotChatEndpoint } from '../../../../../platform/endpoint/node/copilotChatEndpoint';
import { ExtensionContributedChatEndpoint } from '../../../../../platform/endpoint/vscode-node/extChatEndpoint';
import { FinishedCallback, IResponseDelta } from '../../../../../platform/networking/common/fetch';
import { IChatEndpoint, IEndpointBody } from '../../../../../platform/networking/common/networking';
import { CAPIChatMessage } from '../../../../../platform/networking/common/openai';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { ThinkingOriginApi } from '../../../../../platform/thinking/common/thinking';
import { AsyncIterableObject } from '../../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelChatToolMode, LanguageModelTextPart, LanguageModelToolResult } from '../../../../../vscodeTypes';
import { resolveModelInfo } from '../../../../byok/common/byokProvider';
import { CustomEndpointBYOKModelProvider, CustomEndpointModelConfig } from '../../../../byok/vscode-node/customEndpointProvider';
import { ChatVariablesCollection } from '../../../../prompt/common/chatVariablesCollection';
import { Conversation, Turn, TurnStatus } from '../../../../prompt/common/conversation';
import { IBuildPromptContext } from '../../../../prompt/common/intents';
import { ThinkingDataItem, ToolCallRound } from '../../../../prompt/common/toolCallRound';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { PromptRenderer } from '../../base/promptRenderer';
import { AgentPrompt } from '../agentPrompt';
import { PromptRegistry } from '../promptRegistry';

class RequestCapturingChatMLFetcher implements IChatMLFetcher {
	declare readonly _serviceBrand: undefined;
	readonly onDidMakeChatMLRequest = Event.None;
	readonly requests: CAPIChatMessage[][] = [];
	readonly bodies: IEndpointBody[] = [];
	responseDeltas: IResponseDelta[] = [];
	private readonly delegate = new MockChatMLFetcher();

	async fetchOne(options: IFetchMLOptions): Promise<ChatResponse> {
		const body = options.endpoint.createRequestBody({
			...options,
			requestId: 'thinking-history-request',
			postOptions: options.requestOptions ?? {},
		});
		this.bodies.push(body);
		this.requests.push(body.messages ?? []);
		for (const delta of this.responseDeltas) {
			await options.finishedCb?.(delta.text, 0, delta);
		}
		await options.finishedCb?.('done', 0, { text: 'done' });
		return this.delegate.fetchOne();
	}

	fetchMany(): Promise<ChatResponses> {
		throw new Error('Unexpected multi-response request');
	}
}

suite('Agent history preserves thinking across user turns', () => {
	const store = new DisposableStore();
	let accessor: ITestingServicesAccessor;
	let fetcher: RequestCapturingChatMLFetcher;

	beforeEach(() => {
		const services = store.add(createExtensionUnitTestingServices(store));
		services.define(IBlockedExtensionService, new SyncDescriptor(BlockedExtensionService));
		fetcher = new RequestCapturingChatMLFetcher();
		services.define(IChatMLFetcher, fetcher);
		accessor = store.add(services.createTestingAccessor());
	});

	afterEach(() => store.clear());

	async function renderRequest(endpoint: IChatEndpoint, promptContext: IBuildPromptContext, enableSummarization: boolean, finishedCb?: FinishedCallback): Promise<CAPIChatMessage[]> {
		const instantiationService = accessor.get(IInstantiationService);
		const { messages } = await PromptRenderer.create(instantiationService, endpoint, AgentPrompt, {
			priority: 1,
			endpoint,
			location: ChatLocation.Panel,
			promptContext,
			customizations: await PromptRegistry.resolveAllCustomizations(instantiationService, endpoint),
			enableSummarization,
		}).render();
		const response = await endpoint.makeChatRequest2({
			debugName: 'thinking-history',
			messages,
			requestOptions: {},
			modelCapabilities: { enableThinking: true },
			finishedCb,
			location: ChatLocation.Panel,
		}, CancellationToken.None);
		expect(response.type).toBe(ChatFetchResponseType.Success);
		return fetcher.requests.at(-1)!;
	}

	async function createEndpoint(provider: 'Copilot' | 'custom', modelId: string, customConfiguration?: Partial<CustomEndpointModelConfig>, includeProtocolMetadata = true): Promise<IChatEndpoint> {
		const instantiationService = accessor.get(IInstantiationService);
		const capabilities = {
			name: modelId,
			maxInputTokens: 100000,
			maxOutputTokens: 8192,
			toolCalling: true,
			vision: false,
			thinking: true,
		};
		if (provider === 'Copilot') {
			const modelInfo = resolveModelInfo(modelId, 'Copilot', undefined, {
				...capabilities,
				supportedEndpoints: [ModelSupportedEndpoint.ChatCompletions],
			});
			return instantiationService.createInstance(CopilotChatEndpoint, modelInfo);
		}

		const customProvider = instantiationService.createInstance(CustomEndpointBYOKModelProvider, {
			getAPIKey: async () => undefined,
			storeAPIKey: async () => undefined,
			deleteAPIKey: async () => undefined,
			getStoredModelConfigs: async () => ({}),
			saveModelConfig: async () => undefined,
			removeModelConfig: async () => undefined,
		});
		const [model] = await customProvider.provideLanguageModelChatInformation({
			silent: true,
			configuration: {
				models: [{ ...capabilities, id: modelId, url: 'https://model.example', ...customConfiguration }],
			},
		}, CancellationToken.None);
		const languageModel: vscode.LanguageModelChat = {
			id: model.id,
			name: model.name,
			vendor: CustomEndpointBYOKModelProvider.providerId,
			family: model.family,
			version: model.version,
			maxInputTokens: model.maxInputTokens,
			capabilities: {
				supportsToolCalling: true,
				supportsImageToText: false,
				apiType: includeProtocolMetadata ? model.capabilities.apiType : undefined,
				supportsAdaptiveThinking: includeProtocolMetadata ? model.capabilities.adaptiveThinking : undefined,
			},
			countTokens: (text, token) => customProvider.provideTokenCount(model, text, token ?? CancellationToken.None),
			sendRequest: async (messages, options, token) => {
				const parts: vscode.LanguageModelResponsePart2[] = [];
				await customProvider.provideLanguageModelChatResponse(model, messages, {
					...options,
					requestInitiator: 'core',
					tools: options?.tools ?? [],
					toolMode: options?.toolMode ?? LanguageModelChatToolMode.Auto,
					modelOptions: options?.modelOptions,
				}, { report: part => parts.push(part) }, token ?? CancellationToken.None);
				return {
					stream: AsyncIterableObject.fromArray(parts),
					text: AsyncIterableObject.fromArray(parts.flatMap(part => part instanceof LanguageModelTextPart ? [part.value] : [])),
				};
			},
		};
		return instantiationService.createInstance(ExtensionContributedChatEndpoint, languageModel);
	}

	async function renderConversation(endpoint: IChatEndpoint, enableSummarization: boolean, roundModelId: string | undefined, originApi: ThinkingOriginApi = 'chatCompletions') {
		const firstTurn = new Turn('turn-1', { type: 'user', message: 'Read the file.' });
		const round = ToolCallRound.create({
			id: 'round-1',
			modelId: roundModelId,
			originApi,
			response: 'I will read the file.',
			toolCalls: [{ id: 'call-1', name: 'read_file', arguments: '{"filePath":"/workspace/example.txt"}' }],
			toolInputRetry: 0,
			thinking: { id: 'reasoning-1', text: ['Read the file first.\n', 'Then answer exactly.'], metadata: originApi === 'messages' ? { encrypted_content: 'signature-1' } : undefined },
		});
		const toolCallResults = { 'call-1': new LanguageModelToolResult([new LanguageModelTextPart('File contents.')]) };
		const promptContext: IBuildPromptContext = {
			query: firstTurn.request.message,
			history: [],
			conversation: new Conversation('thinking-history', [firstTurn]),
			chatVariables: new ChatVariablesCollection(),
			tools: { availableTools: [], toolInvocationToken: null as never, toolReferences: [] },
			toolCallRounds: [round],
			toolCallResults,
		};
		const firstRequest = await renderRequest(endpoint, promptContext, enableSummarization);
		const finalRound = ToolCallRound.create({
			id: 'round-2',
			modelId: roundModelId,
			originApi,
			response: 'Done.',
			toolCalls: [],
			toolInputRetry: 0,
			thinking: { id: 'reasoning-2', text: 'The file has been read.\nReady to answer.', metadata: originApi === 'messages' ? { encrypted_content: 'signature-2' } : undefined },
		});

		firstTurn.setResponse(TurnStatus.Success, { type: 'model', message: 'Done.' }, 'response-1', {
			metadata: { toolCallRounds: [round, finalRound], toolCallResults },
		});
		const secondTurn = new Turn('turn-2', { type: 'user', message: 'Now explain it.' });
		const secondRequest = await renderRequest(endpoint, {
			...promptContext,
			query: secondTurn.request.message,
			history: [firstTurn],
			conversation: new Conversation('thinking-history', [firstTurn, secondTurn]),
			toolCallRounds: [],
			toolCallResults: {},
		}, enableSummarization);
		return {
			duringTurn: firstRequest.filter(message => message.role === 'assistant' || message.role === 'tool'),
			nextTurn: secondRequest.filter(message => message.role === 'assistant' || message.role === 'tool'),
		};
	}

	const messagesWithoutThinking = [
		{
			role: 'assistant',
			content: 'I will read the file.',
			tool_calls: [{ type: 'function', id: expect.any(String), function: { name: 'read_file', arguments: '{"filePath":"/workspace/example.txt"}' } }],
		},
		{ role: 'tool', tool_call_id: expect.any(String), content: 'File contents.' },
		{ role: 'assistant', content: 'Done.' },
	];

	function expectCurrentThinking(messages: CAPIChatMessage[], provider: 'Copilot' | 'custom') {
		expect(messages[0]).toMatchObject(provider === 'Copilot' ? {
			reasoning_opaque: 'reasoning-1',
			reasoning_text: 'Read the file first.\nThen answer exactly.',
		} : {
			reasoning_content: 'Read the file first.\nThen answer exactly.',
		});
	}

	async function renderStreamedConversation(apiType: 'responses' | 'messages', adaptiveThinking: boolean, enableSummarization: boolean) {
		const endpoint = await createEndpoint('custom', 'deployment', {
			apiType, adaptiveThinking, zeroDataRetentionEnabled: true, minThinkingBudget: 1024, maxThinkingBudget: 4096,
		});
		const firstTurn = new Turn('streamed-turn-1', { type: 'user', message: 'Read the file and report the findings.' });
		const context: IBuildPromptContext = {
			query: firstTurn.request.message,
			history: [],
			conversation: new Conversation('streamed-thinking', [firstTurn]),
			chatVariables: new ChatVariablesCollection(),
			tools: { availableTools: [], toolInvocationToken: null as never, toolReferences: [] },
		};
		const toolCalls = [{ id: 'read-call', name: 'read_file', arguments: '{"filePath":"/workspace/example.txt"}' }];
		async function receiveRound(promptContext: IBuildPromptContext, final: boolean) {
			fetcher.responseDeltas = [
				{ text: '', thinking: { id: final ? 'rs_final' : 'rs_tool', text: final ? 'The file has been read.' : 'Read the file first.' } },
				{ text: '', thinking: { id: final ? 'rs_final' : 'rs_tool', encrypted: final ? 'opaque-final' : 'opaque-tool' } },
				...(final ? [] : [{ text: '', copilotToolCalls: toolCalls }]),
			];
			let thinking: ThinkingDataItem | undefined;
			await renderRequest(endpoint, promptContext, enableSummarization, async (_text, _index, delta) => {
				if (delta.thinking) {
					thinking = ThinkingDataItem.createOrUpdate(thinking, delta.thinking);
				}
			});
			return ToolCallRound.create({
				modelId: endpoint.model, originApi: apiType, response: final ? 'Done.' : 'Reading the file.',
				toolCalls: final ? [] : toolCalls, toolInputRetry: 0, thinking,
			});
		}
		const toolRound = await receiveRound(context, false);
		const toolCallResults = { 'read-call': new LanguageModelToolResult([new LanguageModelTextPart('File contents.')]) };
		const finalRound = await receiveRound({ ...context, toolCallRounds: [toolRound], toolCallResults }, true);
		const duringTurn = fetcher.bodies.at(-1)!;
		firstTurn.setResponse(TurnStatus.Success, { type: 'model', message: 'Done.' }, 'streamed-response', {
			metadata: { toolCallRounds: [toolRound, finalRound], toolCallResults },
		});
		const secondTurn = new Turn('streamed-turn-2', { type: 'user', message: 'Continue from those findings.' });
		fetcher.responseDeltas = [];
		await renderRequest(endpoint, {
			...context,
			query: secondTurn.request.message,
			history: [firstTurn],
			conversation: new Conversation('streamed-thinking', [firstTurn, secondTurn]),
		}, enableSummarization);
		return { duringTurn, nextTurn: fetcher.bodies.at(-1)! };
	}

	test.each([false, true])('custom stateless Responses replays streamed tool and final reasoning (summarization=%s)', async enableSummarization => {
		const { duringTurn, nextTurn } = await renderStreamedConversation('responses', false, enableSummarization);
		expect({
			store: nextTurn.store,
			previousResponseId: nextTurn.previous_response_id,
			duringTurn: duringTurn.input?.filter(item => item.type === 'reasoning'),
			nextTurn: nextTurn.input?.filter(item => item.type === 'reasoning'),
		}).toEqual({
			store: false,
			previousResponseId: undefined,
			duringTurn: [{ type: 'reasoning', id: 'rs_tool', summary: [], encrypted_content: 'opaque-tool' }],
			nextTurn: [
				{ type: 'reasoning', id: 'rs_tool', summary: [], encrypted_content: 'opaque-tool' },
				{ type: 'reasoning', id: 'rs_final', summary: [], encrypted_content: 'opaque-final' },
			],
		});
	});

	test.each([false, true].flatMap(enableSummarization => [false, true].map(adaptiveThinking => ({ enableSummarization, adaptiveThinking }))))('custom Messages preserves streamed signatures and respects its history policy (summarization=$enableSummarization, adaptive=$adaptiveThinking)', async ({ enableSummarization, adaptiveThinking }) => {
		const { duringTurn, nextTurn } = await renderStreamedConversation('messages', adaptiveThinking, enableSummarization);
		expect(duringTurn.messages).toContainEqual(expect.objectContaining({
			role: 'assistant', content: expect.arrayContaining([{ type: 'thinking', thinking: 'Read the file first.', signature: 'opaque-tool' }]),
		}));
		const assistants = nextTurn.messages?.filter(message => message.role === 'assistant');
		if (adaptiveThinking) {
			expect(assistants).toMatchObject([
				{ content: expect.arrayContaining([{ type: 'thinking', thinking: 'Read the file first.', signature: 'opaque-tool' }]) },
				{ content: expect.arrayContaining([{ type: 'thinking', thinking: 'The file has been read.', signature: 'opaque-final' }]) },
			]);
		} else {
			expect(assistants).toHaveLength(2);
			expect(assistants).not.toContainEqual(expect.objectContaining({ content: expect.arrayContaining([expect.objectContaining({ type: 'thinking' })]) }));
		}
	});

	test.each([false, true])('CCR2: custom family aliases select the preserved-thinking default (summarization=%s)', async enableSummarization => {
		await accessor.get(IConfigurationService).setConfig(ConfigKey.Advanced.ModelCapabilityOverrides, {
			deployment: { family: 'kimi-k3' },
		});
		const endpoint = await createEndpoint('custom', 'deployment');
		const { duringTurn, nextTurn } = await renderConversation(endpoint, enableSummarization, endpoint.model);
		expectCurrentThinking(duringTurn, 'custom');
		expect(nextTurn).toEqual([...duringTurn, expect.objectContaining({
			role: 'assistant',
			content: 'Done.',
			reasoning_content: 'The file has been read.\nReady to answer.',
		})]);
	});

	test.each([false, true])('CCR1: custom budget-mode Messages cannot opt into historical thinking (summarization=%s)', async enableSummarization => {
		await accessor.get(IConfigurationService).setConfig(ConfigKey.Advanced.ModelCapabilityOverrides, {
			'budget-deployment': { thinkingInHistory: true },
		});
		const endpoint = await createEndpoint('custom', 'budget-deployment', {
			apiType: 'messages',
			adaptiveThinking: false,
			minThinkingBudget: 1024,
			maxThinkingBudget: 32000,
		});
		const { duringTurn, nextTurn } = await renderConversation(endpoint, enableSummarization, endpoint.model, 'messages');
		const thinkingMessage = expect.objectContaining({
			role: 'assistant',
			content: expect.arrayContaining([expect.objectContaining({ type: 'thinking' })]),
		});
		expect(duringTurn).toContainEqual(thinkingMessage);
		expect(nextTurn).toHaveLength(2);
		expect(nextTurn).not.toContainEqual(thinkingMessage);
	});

	test.each([false, true])('custom adaptive Messages preserves signed thinking independently of the Chat Completions override (summarization=%s)', async enableSummarization => {
		await accessor.get(IConfigurationService).setConfig(ConfigKey.Advanced.ModelCapabilityOverrides, {
			'adaptive-deployment': { thinkingInHistory: false },
		});
		const endpoint = await createEndpoint('custom', 'adaptive-deployment', { apiType: 'messages', adaptiveThinking: true });
		const { nextTurn } = await renderConversation(endpoint, enableSummarization, endpoint.model, 'messages');
		expect(nextTurn).toMatchObject([
			{ role: 'assistant', content: expect.arrayContaining([{ type: 'thinking', thinking: 'Read the file first.\nThen answer exactly.', signature: 'signature-1' }]) },
			{ role: 'assistant', content: expect.arrayContaining([{ type: 'thinking', thinking: 'The file has been read.\nReady to answer.', signature: 'signature-2' }]) },
		]);
	});

	test.each([false, true])('custom models with no declared protocol cannot opt into historical thinking (summarization=%s)', async enableSummarization => {
		await accessor.get(IConfigurationService).setConfig(ConfigKey.Advanced.ModelCapabilityOverrides, {
			deployment: { thinkingInHistory: true },
		});
		const endpoint = await createEndpoint('custom', 'deployment', undefined, false);
		const { duringTurn, nextTurn } = await renderConversation(endpoint, enableSummarization, endpoint.model);
		expectCurrentThinking(duringTurn, 'custom');
		expect(nextTurn).toEqual(messagesWithoutThinking);
	});

	test.each([false, true])('custom family aliases respect an explicit thinking opt-out (summarization=%s)', async enableSummarization => {
		await accessor.get(IConfigurationService).setConfig(ConfigKey.Advanced.ModelCapabilityOverrides, {
			deployment: { family: 'kimi-k3', thinkingInHistory: false },
		});
		const endpoint = await createEndpoint('custom', 'deployment');
		const { duringTurn, nextTurn } = await renderConversation(endpoint, enableSummarization, endpoint.model);
		expectCurrentThinking(duringTurn, 'custom');
		expect(nextTurn).toEqual(messagesWithoutThinking);
	});

	test.each((['Copilot', 'custom'] as const).flatMap(provider => [false, true].flatMap(enableSummarization => [
		{ provider, enableSummarization, modelId: 'kimi-k3', thinkingInHistory: undefined },
		{ provider, enableSummarization, modelId: 'k3', thinkingInHistory: undefined },
		{ provider, enableSummarization, modelId: 'k3-256k', thinkingInHistory: undefined },
		{ provider, enableSummarization, modelId: 'custom-preserved-thinking', thinkingInHistory: true },
	])))('replays $provider $modelId reasoning unchanged (summarization=$enableSummarization)', async ({ provider, modelId, thinkingInHistory, enableSummarization }) => {
		await accessor.get(IConfigurationService).setConfig(ConfigKey.Advanced.ModelCapabilityOverrides, {
			[modelId]: { thinkingInHistory },
		});
		const endpoint = await createEndpoint(provider, modelId);
		const { duringTurn, nextTurn } = await renderConversation(endpoint, enableSummarization, endpoint.model);
		expectCurrentThinking(duringTurn, provider);
		expect(nextTurn).toEqual([...duringTurn, {
			role: 'assistant',
			content: 'Done.',
			...(provider === 'Copilot' ? {
				reasoning_opaque: 'reasoning-2',
				reasoning_text: 'The file has been read.\nReady to answer.',
			} : {
				cot_id: 'reasoning-2',
				cot_summary: 'The file has been read.\nReady to answer.',
				reasoning: 'The file has been read.\nReady to answer.',
				reasoning_content: 'The file has been read.\nReady to answer.',
			}),
		}]);
	});

	test.each((['Copilot', 'custom'] as const).flatMap(provider => [false, true].flatMap(enableSummarization => [
		{ provider, enableSummarization, modelId: 'kimi-k3', thinkingInHistory: false },
		{ provider, enableSummarization, modelId: 'other-thinking-model', thinkingInHistory: undefined },
	])))('only replays current-turn reasoning for opted-out $provider $modelId (summarization=$enableSummarization)', async ({ provider, modelId, thinkingInHistory, enableSummarization }) => {
		await accessor.get(IConfigurationService).setConfig(ConfigKey.Advanced.ModelCapabilityOverrides, {
			[modelId]: { thinkingInHistory },
		});
		const endpoint = await createEndpoint(provider, modelId);
		const { duringTurn, nextTurn } = await renderConversation(endpoint, enableSummarization, endpoint.model);
		expectCurrentThinking(duringTurn, provider);
		expect(nextTurn).toEqual(messagesWithoutThinking);
	});

	test.each((['Copilot', 'custom'] as const).flatMap(provider => [false, true].flatMap(enableSummarization => [
		{ provider, enableSummarization, roundModelId: 'different-model' },
		{ provider, enableSummarization, roundModelId: undefined },
	])))('does not replay $provider reasoning attributed to $roundModelId (summarization=$enableSummarization)', async ({ provider, roundModelId, enableSummarization }) => {
		const endpoint = await createEndpoint(provider, 'kimi-k3');
		const { nextTurn } = await renderConversation(endpoint, enableSummarization, roundModelId);
		expect(nextTurn).toEqual(messagesWithoutThinking);
	});
});
