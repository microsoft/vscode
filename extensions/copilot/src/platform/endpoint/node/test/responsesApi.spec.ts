/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import type { OpenAI } from 'openai';
import { describe, expect, it } from 'vitest';
import { TokenizerType } from '../../../../util/common/tokenizer';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ILogService } from '../../../log/common/logService';
import { isOpenAIContextManagementResponse } from '../../../networking/common/fetch';
import { IChatEndpoint, ICreateEndpointBodyOptions } from '../../../networking/common/networking';
import { openAIContextManagementCompactionType, OpenAIContextManagementResponse } from '../../../networking/common/openai';
import { IChatWebSocketManager, NullChatWebSocketManager } from '../../../networking/node/chatWebSocketManager';
import { TelemetryData } from '../../../telemetry/common/telemetryData';
import { SpyingTelemetryService } from '../../../telemetry/node/spyingTelemetryService';
import { createFakeStreamResponse } from '../../../test/node/fetcher';
import { createPlatformServices } from '../../../test/node/services';
import { CustomDataPartMimeTypes } from '../../common/endpointTypes';
import { createResponsesRequestBody, getResponsesApiCompactionThresholdFromBody, processResponseFromChatEndpoint, responseApiInputToRawMessagesForLogging } from '../responsesApi';

const testEndpoint: IChatEndpoint = {
	urlOrRequestMetadata: 'https://example.test/chat',
	modelMaxPromptTokens: 128000,
	name: 'Test Endpoint',
	version: '1',
	family: 'gpt-5-mini',
	tokenizer: TokenizerType.O200K,
	maxOutputTokens: 4096,
	model: 'gpt-5-mini',
	modelProvider: 'openai',
	supportsToolCalls: true,
	supportsVision: true,
	supportsPrediction: true,
	showInModelPicker: true,
	isFallback: false,
	acquireTokenizer() {
		throw new Error('Not implemented in test');
	},
	async processResponseFromChatEndpoint() {
		throw new Error('Not implemented in test');
	},
	async makeChatRequest() {
		throw new Error('Not implemented in test');
	},
	async makeChatRequest2() {
		throw new Error('Not implemented in test');
	},
	createRequestBody() {
		throw new Error('Not implemented in test');
	},
	cloneWithTokenOverride() {
		return this;
	}
};

const createRequestOptions = (messages: Raw.ChatMessage[], useWebSocket: boolean): ICreateEndpointBodyOptions => ({
	debugName: 'test',
	messages,
	requestId: 'req-1',
	postOptions: {},
	finishedCb: undefined,
	location: undefined as any,
	useWebSocket,
});

const createStatefulMarkerMessage = (modelId: string, marker: string): Raw.ChatMessage => ({
	role: Raw.ChatRole.Assistant,
	content: [{
		type: Raw.ChatCompletionContentPartKind.Opaque,
		value: {
			type: CustomDataPartMimeTypes.StatefulMarker,
			value: {
				modelId,
				marker,
			}
		}
	}]
});

const createCompactionResponse = (id: string, encrypted_content: string): OpenAIContextManagementResponse => ({
	type: openAIContextManagementCompactionType,
	id,
	encrypted_content,
});

const createCompactionAssistantMessage = (compaction: OpenAIContextManagementResponse): Raw.ChatMessage => ({
	role: Raw.ChatRole.Assistant,
	content: [{
		type: Raw.ChatCompletionContentPartKind.Opaque,
		value: {
			type: CustomDataPartMimeTypes.ContextManagement,
			compaction,
		}
	}]
});

describe('responseApiInputToRawMessagesForLogging', () => {

	it('converts simple string input to user message', () => {
		const body: OpenAI.Responses.ResponseCreateParams = {
			model: 'gpt-5-mini',
			input: 'Hello, world!'
		};

		const result = responseApiInputToRawMessagesForLogging(body);

		expect(result).toHaveLength(1);
		expect(result[0].role).toBe(Raw.ChatRole.User);
		expect(result[0].content).toEqual([
			{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello, world!' }
		]);
	});

	it('includes system instructions when provided', () => {
		const body: OpenAI.Responses.ResponseCreateParams = {
			model: 'gpt-5-mini',
			input: 'Hello',
			instructions: 'You are a helpful assistant'
		};

		const result = responseApiInputToRawMessagesForLogging(body);

		expect(result).toHaveLength(2);
		expect(result[0].role).toBe(Raw.ChatRole.System);
		expect(result[0].content).toEqual([
			{ type: Raw.ChatCompletionContentPartKind.Text, text: 'You are a helpful assistant' }
		]);
		expect(result[1].role).toBe(Raw.ChatRole.User);
	});

	it('converts user message with input_text content', () => {
		const body: OpenAI.Responses.ResponseCreateParams = {
			model: 'gpt-5-mini',
			input: [
				{
					role: 'user',
					content: [{ type: 'input_text', text: 'What is the weather?' }]
				}
			]
		};

		const result = responseApiInputToRawMessagesForLogging(body);

		expect(result).toHaveLength(1);
		expect(result[0].role).toBe(Raw.ChatRole.User);
		expect(result[0].content).toEqual([
			{ type: Raw.ChatCompletionContentPartKind.Text, text: 'What is the weather?' }
		]);
	});

	it('converts system/developer messages to system role', () => {
		const body: OpenAI.Responses.ResponseCreateParams = {
			model: 'gpt-5-mini',
			input: [
				{
					role: 'developer',
					content: 'Be concise'
				}
			]
		};

		const result = responseApiInputToRawMessagesForLogging(body);

		expect(result).toHaveLength(1);
		expect(result[0].role).toBe(Raw.ChatRole.System);
	});

	it('converts function_call items to assistant tool calls', () => {
		const body: OpenAI.Responses.ResponseCreateParams = {
			model: 'gpt-5-mini',
			input: [
				{
					type: 'function_call',
					call_id: 'call_123',
					name: 'get_weather',
					arguments: '{"location": "Seattle"}'
				}
			]
		};

		const result = responseApiInputToRawMessagesForLogging(body);

		expect(result).toHaveLength(1);
		expect(result[0].role).toBe(Raw.ChatRole.Assistant);
		const assistantMsg = result[0] as Raw.AssistantChatMessage;
		expect(assistantMsg.toolCalls).toHaveLength(1);
		expect(assistantMsg.toolCalls![0]).toEqual({
			id: 'call_123',
			type: 'function',
			function: {
				name: 'get_weather',
				arguments: '{"location": "Seattle"}'
			}
		});
	});

	it('converts function_call_output items to tool messages', () => {
		const body: OpenAI.Responses.ResponseCreateParams = {
			model: 'gpt-5-mini',
			input: [
				{
					type: 'function_call_output',
					call_id: 'call_123',
					output: 'Sunny, 72°F'
				}
			]
		};

		const result = responseApiInputToRawMessagesForLogging(body);

		expect(result).toHaveLength(1);
		expect(result[0].role).toBe(Raw.ChatRole.Tool);
		const toolMsg = result[0] as Raw.ToolChatMessage;
		expect(toolMsg.toolCallId).toBe('call_123');
		expect(toolMsg.content).toEqual([
			{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Sunny, 72°F' }
		]);
	});

	it('handles mixed conversation with multiple message types', () => {
		const body: OpenAI.Responses.ResponseCreateParams = {
			model: 'gpt-5-mini',
			instructions: 'You are a weather assistant',
			input: [
				{
					role: 'user',
					content: 'What is the weather in Seattle?'
				},
				{
					type: 'function_call',
					call_id: 'call_456',
					name: 'get_weather',
					arguments: '{"location": "Seattle"}'
				},
				{
					type: 'function_call_output',
					call_id: 'call_456',
					output: 'Rainy, 55°F'
				},
				{
					role: 'user',
					content: 'Thanks!'
				}
			]
		};

		const result = responseApiInputToRawMessagesForLogging(body);

		expect(result).toHaveLength(5);
		expect(result[0].role).toBe(Raw.ChatRole.System); // instructions
		expect(result[1].role).toBe(Raw.ChatRole.User); // first user message
		expect(result[2].role).toBe(Raw.ChatRole.Assistant); // function call
		expect((result[2] as Raw.AssistantChatMessage).toolCalls).toHaveLength(1);
		expect(result[3].role).toBe(Raw.ChatRole.Tool); // function output
		expect(result[4].role).toBe(Raw.ChatRole.User); // thanks message
	});

	it('returns empty array for undefined input', () => {
		const body: OpenAI.Responses.ResponseCreateParams = {
			model: 'gpt-5-mini',
			input: undefined as any
		};

		const result = responseApiInputToRawMessagesForLogging(body);

		expect(result).toHaveLength(0);
	});

	it('groups consecutive function calls into single assistant message', () => {
		const body: OpenAI.Responses.ResponseCreateParams = {
			model: 'gpt-5-mini',
			input: [
				{
					type: 'function_call',
					call_id: 'call_1',
					name: 'tool_a',
					arguments: '{}'
				},
				{
					type: 'function_call',
					call_id: 'call_2',
					name: 'tool_b',
					arguments: '{}'
				}
			]
		};

		const result = responseApiInputToRawMessagesForLogging(body);

		// Two consecutive function calls should be grouped into one assistant message
		expect(result).toHaveLength(1);
		expect(result[0].role).toBe(Raw.ChatRole.Assistant);
		expect((result[0] as Raw.AssistantChatMessage).toolCalls).toHaveLength(2);
	});

	it('converts tool_search_call and tool_search_output items to raw messages', () => {
		const body: OpenAI.Responses.ResponseCreateParams = {
			model: 'gpt-5-mini',
			input: [
				{
					type: 'tool_search_call',
					execution: 'client',
					call_id: 'ts_call_1',
					status: 'completed',
					arguments: { query: 'file editing tools' },
				} as unknown as OpenAI.Responses.ResponseInputItem,
				{
					type: 'tool_search_output',
					execution: 'client',
					call_id: 'ts_call_1',
					status: 'completed',
					tools: [
						{ type: 'function', name: 'grep_search', description: 'Search files', defer_loading: true, parameters: {} },
						{ type: 'function', name: 'file_search', description: 'Find files', defer_loading: true, parameters: {} },
					],
				} as unknown as OpenAI.Responses.ResponseInputItem
			]
		};

		const result = responseApiInputToRawMessagesForLogging(body);

		expect(result).toEqual([
			{
				role: Raw.ChatRole.Assistant,
				content: [],
				toolCalls: [{
					id: 'ts_call_1',
					type: 'function',
					function: {
						name: 'tool_search',
						arguments: '{"query":"file editing tools"}',
					}
				}]
			},
			{
				role: Raw.ChatRole.Tool,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: '["grep_search","file_search"]' }],
				toolCallId: 'ts_call_1',
			}
		]);
	});
});

describe('createResponsesRequestBody', () => {
	it('extracts compaction threshold from request body context management', () => {
		expect(getResponsesApiCompactionThresholdFromBody({
			context_management: [{
				type: openAIContextManagementCompactionType,
				compact_threshold: 1234,
			}]
		})).toBe(1234);
	});

	it('still slices websocket requests by stateful marker index when compaction is disabled', () => {
		const services = createPlatformServices();
		const wsManager = new NullChatWebSocketManager();
		wsManager.getStatefulMarker = () => 'resp-prev';
		services.set(IChatWebSocketManager, wsManager);
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const endpointWithoutCompaction = { ...testEndpoint, family: 'gpt-5' as const };
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'before marker' }],
			},
			createStatefulMarkerMessage(testEndpoint.model, 'resp-prev'),
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'after marker' }],
			},
		];

		const webSocketBody = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(servicesAccessor, { ...createRequestOptions(messages, true), conversationId: 'conv-1' }, endpointWithoutCompaction.model, endpointWithoutCompaction));

		expect(webSocketBody.previous_response_id).toBe('resp-prev');
		expect(webSocketBody.input).toHaveLength(1);
		expect(webSocketBody.input?.[0]).toMatchObject({
			role: 'user',
			content: [{ type: 'input_text', text: 'after marker' }],
		});

		accessor.dispose();
		services.dispose();
	});

	it('includes the newest compaction item in websocket requests when it predates the stateful marker', () => {
		const services = createPlatformServices();
		const wsManager = new NullChatWebSocketManager();
		wsManager.getStatefulMarker = () => 'resp-prev';
		services.set(IChatWebSocketManager, wsManager);
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const latestCompaction = createCompactionResponse('cmp_ws', 'enc_ws');
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'before compaction' }],
			},
			createCompactionAssistantMessage(latestCompaction),
			createStatefulMarkerMessage(testEndpoint.model, 'resp-prev'),
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'after marker' }],
			},
		];

		const webSocketBody = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(servicesAccessor, { ...createRequestOptions(messages, true), conversationId: 'conv-1' }, testEndpoint.model, testEndpoint));

		expect(webSocketBody.previous_response_id).toBe('resp-prev');
		expect(webSocketBody.input).toContainEqual({
			type: openAIContextManagementCompactionType,
			id: 'cmp_ws',
			encrypted_content: 'enc_ws',
		});
		expect(webSocketBody.input).toContainEqual({
			role: 'user',
			content: [{ type: 'input_text', text: 'after marker' }],
		});

		accessor.dispose();
		services.dispose();
	});

	it('sends all messages when the websocket stateful marker is not in the current messages', () => {
		const services = createPlatformServices();
		const wsManager = new NullChatWebSocketManager();
		wsManager.getStatefulMarker = () => 'resp-stale';
		services.set(IChatWebSocketManager, wsManager);
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'first message' }],
			},
			createStatefulMarkerMessage(testEndpoint.model, 'resp-different'),
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'second message' }],
			},
		];

		const body = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(servicesAccessor, { ...createRequestOptions(messages, true), conversationId: 'conv-1' }, testEndpoint.model, testEndpoint));

		expect(body.previous_response_id).toBeUndefined();
		expect(body.input).toHaveLength(2);
		expect(body.input?.[0]).toMatchObject({
			role: 'user',
			content: [{ type: 'input_text', text: 'first message' }],
		});
		expect(body.input?.[1]).toMatchObject({
			role: 'user',
			content: [{ type: 'input_text', text: 'second message' }],
		});

		accessor.dispose();
		services.dispose();
	});

	it('does not reuse a websocket stateful marker when modeChanged is true', () => {
		const services = createPlatformServices();
		const wsManager = new NullChatWebSocketManager();
		wsManager.getStatefulMarker = () => 'resp-prev';
		services.set(IChatWebSocketManager, wsManager);
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'before marker' }],
			},
			createStatefulMarkerMessage(testEndpoint.model, 'resp-prev'),
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'after marker' }],
			},
		];

		const body = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(servicesAccessor, { ...createRequestOptions(messages, true), conversationId: 'conv-1', modeChanged: true }, testEndpoint.model, testEndpoint));

		expect(body.previous_response_id).toBeUndefined();
		expect(body.input).toHaveLength(2);
		expect(body.input?.[0]).toMatchObject({
			role: 'user',
			content: [{ type: 'input_text', text: 'before marker' }],
		});
		expect(body.input?.[1]).toMatchObject({
			role: 'user',
			content: [{ type: 'input_text', text: 'after marker' }],
		});

		accessor.dispose();
		services.dispose();
	});

	it('reuses the newly established websocket marker on follow-up requests after switching into plan mode', () => {
		const services = createPlatformServices();
		const wsManager = new NullChatWebSocketManager();
		wsManager.getStatefulMarker = () => 'resp-plan-1';
		services.set(IChatWebSocketManager, wsManager);
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const websocketEndpoint = { ...testEndpoint, family: 'gpt-5.5-preview', model: 'gpt-5.5-preview' as const };
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'implementation context before switching modes' }],
			},
			createStatefulMarkerMessage(websocketEndpoint.model, 'resp-agent-1'),
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'switch to plan mode' }],
			},
			createStatefulMarkerMessage(websocketEndpoint.model, 'resp-plan-1'),
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'plan follow up' }],
			},
		];

		const body = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(
			servicesAccessor,
			{ ...createRequestOptions(messages, true), conversationId: 'conv-plan-1' },
			websocketEndpoint.model,
			websocketEndpoint,
		));

		expect(body.previous_response_id).toBe('resp-plan-1');
		expect(body.input).toHaveLength(1);
		expect(body.input?.[0]).toMatchObject({
			role: 'user',
			content: [{ type: 'input_text', text: 'plan follow up' }],
		});

		accessor.dispose();
		services.dispose();
	});

	it('treats websocket requests from agent to plan and back to implementation as separate mode changes', () => {
		const services = createPlatformServices();
		const wsManager = new NullChatWebSocketManager();
		services.set(IChatWebSocketManager, wsManager);
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const websocketEndpoint = { ...testEndpoint, family: 'gpt-5.4-preview', model: 'gpt-5.4-preview' as const };

		wsManager.getStatefulMarker = () => 'resp-agent-1';
		const planMessages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'agent context before switching to plan' }],
			},
			createStatefulMarkerMessage(websocketEndpoint.model, 'resp-agent-1'),
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'plan this change' }],
			},
		];

		const planBody = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(
			servicesAccessor,
			{ ...createRequestOptions(planMessages, true), conversationId: 'conv-mode-change', modeChanged: true },
			websocketEndpoint.model,
			websocketEndpoint,
		));

		expect(planBody.previous_response_id).toBeUndefined();
		expect(planBody.input).toHaveLength(2);
		expect(planBody.input?.[0]).toMatchObject({
			role: 'user',
			content: [{ type: 'input_text', text: 'agent context before switching to plan' }],
		});
		expect(planBody.input?.[1]).toMatchObject({
			role: 'user',
			content: [{ type: 'input_text', text: 'plan this change' }],
		});

		wsManager.getStatefulMarker = () => 'resp-plan-1';
		const implementationMessages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'plan context before switching back to implementation' }],
			},
			createStatefulMarkerMessage(websocketEndpoint.model, 'resp-plan-1'),
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'start implementation' }],
			},
		];

		const implementationBody = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(
			servicesAccessor,
			{ ...createRequestOptions(implementationMessages, true), conversationId: 'conv-mode-change', modeChanged: true },
			websocketEndpoint.model,
			websocketEndpoint,
		));

		expect(implementationBody.previous_response_id).toBeUndefined();
		expect(implementationBody.input).toHaveLength(2);
		expect(implementationBody.input?.[0]).toMatchObject({
			role: 'user',
			content: [{ type: 'input_text', text: 'plan context before switching back to implementation' }],
		});
		expect(implementationBody.input?.[1]).toMatchObject({
			role: 'user',
			content: [{ type: 'input_text', text: 'start implementation' }],
		});

		accessor.dispose();
		services.dispose();
	});

	it('includes the newest compaction item in non-websocket requests when it predates the stateful marker', () => {
		const services = createPlatformServices();
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const latestCompaction = createCompactionResponse('cmp_http', 'enc_http');
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'before compaction' }],
			},
			createCompactionAssistantMessage(latestCompaction),
			createStatefulMarkerMessage(testEndpoint.model, 'resp-prev'),
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'after marker' }],
			},
		];

		const body = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(servicesAccessor, createRequestOptions(messages, false), testEndpoint.model, testEndpoint));

		expect(body.previous_response_id).toBe('resp-prev');
		expect(body.input).toContainEqual({
			type: openAIContextManagementCompactionType,
			id: 'cmp_http',
			encrypted_content: 'enc_http',
		});
		expect(body.input).toContainEqual({
			role: 'user',
			content: [{ type: 'input_text', text: 'after marker' }],
		});

		accessor.dispose();
		services.dispose();
	});

	it('does not reuse an HTTP stateful marker when modeChanged is true', () => {
		const services = createPlatformServices();
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'before marker' }],
			},
			createStatefulMarkerMessage(testEndpoint.model, 'resp-prev'),
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'after marker' }],
			},
		];

		const body = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(servicesAccessor, { ...createRequestOptions(messages, false), modeChanged: true }, testEndpoint.model, testEndpoint));

		expect(body.previous_response_id).toBeUndefined();
		expect(body.input).toHaveLength(2);
		expect(body.input?.[0]).toMatchObject({
			role: 'user',
			content: [{ type: 'input_text', text: 'before marker' }],
		});
		expect(body.input?.[1]).toMatchObject({
			role: 'user',
			content: [{ type: 'input_text', text: 'after marker' }],
		});

		accessor.dispose();
		services.dispose();
	});

	it('round-trips the newest stored compaction item', () => {
		const services = createPlatformServices();
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const latestCompaction = createCompactionResponse('cmp_new', 'enc_new');
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'earlier turn' }],
			},
			createCompactionAssistantMessage(latestCompaction),
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'follow up' }],
			},
		];

		const body = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(servicesAccessor, createRequestOptions(messages, false), testEndpoint.model, testEndpoint));

		expect(body.input).toContainEqual({
			type: openAIContextManagementCompactionType,
			id: 'cmp_new',
			encrypted_content: 'enc_new',
		});

		accessor.dispose();
		services.dispose();
	});

	it('sends assistant messages with output content and without a fake output message id', () => {
		const services = createPlatformServices();
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.Assistant,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'previous answer' }],
			},
		];

		const body = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(servicesAccessor, createRequestOptions(messages, false), testEndpoint.model, testEndpoint));

		expect(body.input?.[0]).toMatchObject({
			role: 'assistant',
			content: [{ type: 'output_text', text: 'previous answer' }],
			type: 'message',
		});
		expect(body.input?.[0]).not.toHaveProperty('id');
		expect(body.input?.[0]).not.toHaveProperty('status');

		accessor.dispose();
		services.dispose();
	});

	it('does not send whitespace-only assistant messages', () => {
		const services = createPlatformServices();
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.Assistant,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: '   \n\t' }],
			},
		];

		const body = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(servicesAccessor, createRequestOptions(messages, false), testEndpoint.model, testEndpoint));

		expect(body.input).toHaveLength(0);

		accessor.dispose();
		services.dispose();
	});

	it('adds namespace field only to function_call for tools loaded via tool_search_output', () => {
		const services = createPlatformServices();
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const tools = [
			{ type: 'function' as const, function: { name: 'tool_search', description: 'Search tools', parameters: {} } },
			{ type: 'function' as const, function: { name: 'grep_search', description: 'Grep files', parameters: {} } },
			{ type: 'function' as const, function: { name: 'read_file', description: 'Read a file', parameters: {} } },
		];
		const messages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'find something' }],
			},
			// Assistant calls tool_search
			{
				role: Raw.ChatRole.Assistant,
				content: [],
				toolCalls: [{ id: 'ts_1', type: 'function', function: { name: 'tool_search', arguments: '{"query":"search"}' } }],
			},
			// tool_search returns grep_search
			{
				role: Raw.ChatRole.Tool,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: '["grep_search"]' }],
				toolCallId: 'ts_1',
			},
			// Assistant calls grep_search (loaded via tool_search) and read_file (not loaded via tool_search)
			{
				role: Raw.ChatRole.Assistant,
				content: [],
				toolCalls: [
					{ id: 'call_grep', type: 'function', function: { name: 'grep_search', arguments: '{"q":"hello"}' } },
					{ id: 'call_read', type: 'function', function: { name: 'read_file', arguments: '{"path":"foo.ts"}' } },
				],
			},
		];

		const body = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(servicesAccessor, { ...createRequestOptions(messages, false), requestOptions: { tools } }, testEndpoint.model, testEndpoint));

		// grep_search was loaded via tool_search_output — should have namespace
		const grepCall = (body.input as unknown[]).find((item: any) => item.type === 'function_call' && item.name === 'grep_search') as any;
		expect(grepCall).toBeDefined();
		expect(grepCall.namespace).toBe('grep_search');

		// read_file was NOT loaded via tool_search — should NOT have namespace
		const readCall = (body.input as unknown[]).find((item: any) => item.type === 'function_call' && item.name === 'read_file') as any;
		expect(readCall).toBeDefined();
		expect(readCall).not.toHaveProperty('namespace');

		accessor.dispose();
		services.dispose();
	});
});

describe('processResponseFromChatEndpoint telemetry', () => {
	it('emits engine.messages for Responses API assistant output', async () => {
		const services = createPlatformServices();
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const logService = accessor.get(ILogService);
		const telemetryService = new SpyingTelemetryService();

		const completedEvent = {
			type: 'response.completed',
			response: {
				id: 'resp_123',
				model: 'gpt-5-mini',
				created_at: 123,
				usage: {
					input_tokens: 11,
					output_tokens: 7,
					total_tokens: 18,
					input_tokens_details: { cached_tokens: 0 },
					output_tokens_details: { reasoning_tokens: 0 },
				},
				output: [
					{
						type: 'message',
						content: [{ type: 'output_text', text: 'final assistant reply' }],
					}
				],
			}
		};

		const response = createFakeStreamResponse(`data: ${JSON.stringify(completedEvent)}\n\n`);
		const telemetryData = TelemetryData.createAndMarkAsIssued({ modelCallId: 'model-call-1' }, {});

		const stream = await processResponseFromChatEndpoint(
			instantiationService,
			telemetryService,
			logService,
			response,
			1,
			async () => undefined,
			telemetryData
		);

		for await (const _ of stream) {
			// consume all completions to flush telemetry side effects
		}

		const events = telemetryService.getEvents().telemetryServiceEvents.filter(e => e.eventName === 'engine.messages');
		expect(events.length).toBeGreaterThan(0);

		const outputEvent = events[events.length - 1];
		const messagesJson = JSON.parse(String((outputEvent.properties as Record<string, string>)?.messagesJson));
		expect(messagesJson).toHaveLength(1);
		expect(messagesJson[0].role).toBe('assistant');
		expect(messagesJson[0].content).toBe('final assistant reply');

		accessor.dispose();
		services.dispose();
	});

	it('reconciles the newest compaction item from response.completed for the next request', async () => {
		const services = createPlatformServices();
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const logService = accessor.get(ILogService);
		const telemetryService = new SpyingTelemetryService();
		const streamedCompactions: OpenAIContextManagementResponse[] = [];

		const olderCompaction = createCompactionResponse('cmp_old', 'enc_old');
		const newerCompaction = createCompactionResponse('cmp_new', 'enc_new');
		const compactionAddedEvent = {
			type: 'response.output_item.added',
			output_index: 0,
			item: olderCompaction,
		};
		const compactionEvent = {
			type: 'response.output_item.done',
			output_index: 0,
			item: olderCompaction,
		};
		const completedEvent = {
			type: 'response.completed',
			response: {
				id: 'resp_latest_compaction',
				model: 'gpt-5-mini',
				created_at: 123,
				usage: {
					input_tokens: 1200,
					output_tokens: 9,
					total_tokens: 1209,
					input_tokens_details: { cached_tokens: 0 },
					output_tokens_details: { reasoning_tokens: 0 },
				},
				output: [
					olderCompaction,
					{
						type: 'message',
						content: [{ type: 'output_text', text: 'reply' }],
					},
					newerCompaction,
				],
			}
		};

		const response = createFakeStreamResponse(`data: ${JSON.stringify(compactionAddedEvent)}\n\ndata: ${JSON.stringify(compactionEvent)}\n\ndata: ${JSON.stringify(completedEvent)}\n\n`);
		const telemetryData = TelemetryData.createAndMarkAsIssued({ modelCallId: 'model-call-latest-compaction' }, {});

		const stream = await processResponseFromChatEndpoint(
			instantiationService,
			telemetryService,
			logService,
			response,
			1,
			async (_text, _unused, delta) => {
				if (delta.contextManagement && isOpenAIContextManagementResponse(delta.contextManagement)) {
					streamedCompactions.push(delta.contextManagement);
				}
				return undefined;
			},
			telemetryData,
			1000
		);

		for await (const _ of stream) {
			// consume stream
		}

		expect(streamedCompactions.map(item => item.id)).toEqual(['cmp_old', 'cmp_new']);

		const body = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(servicesAccessor, createRequestOptions([
			createCompactionAssistantMessage(streamedCompactions[streamedCompactions.length - 1]),
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'continue' }],
			},
		], false), testEndpoint.model, testEndpoint));

		expect(body.input).toContainEqual({
			type: openAIContextManagementCompactionType,
			id: 'cmp_new',
			encrypted_content: 'enc_new',
		});
		expect(body.input).not.toContainEqual({
			type: openAIContextManagementCompactionType,
			id: 'cmp_old',
			encrypted_content: 'enc_old',
		});

		accessor.dispose();
		services.dispose();
	});

	it('does not emit compaction telemetry when compaction is disabled', async () => {
		const services = createPlatformServices();
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const logService = accessor.get(ILogService);
		const telemetryService = new SpyingTelemetryService();

		const compactionEvent = {
			type: 'response.output_item.done',
			output_index: 0,
			item: {
				type: openAIContextManagementCompactionType,
				id: 'cmp_disabled',
				encrypted_content: 'enc',
			}
		};
		const completedEvent = {
			type: 'response.completed',
			response: {
				id: 'resp_disabled',
				model: 'gpt-5-mini',
				created_at: 123,
				usage: {
					input_tokens: 1500,
					output_tokens: 9,
					total_tokens: 1509,
					input_tokens_details: { cached_tokens: 0 },
					output_tokens_details: { reasoning_tokens: 0 },
				},
				output: []
			}
		};

		const response = createFakeStreamResponse(`data: ${JSON.stringify(compactionEvent)}\n\ndata: ${JSON.stringify(completedEvent)}\n\n`);
		const telemetryData = TelemetryData.createAndMarkAsIssued({ modelCallId: 'model-call-4' }, {});

		const stream = await processResponseFromChatEndpoint(
			instantiationService,
			telemetryService,
			logService,
			response,
			1,
			async () => undefined,
			telemetryData,
			undefined
		);

		for await (const _ of stream) {
			// consume stream
		}

		const event = telemetryService.getEvents().telemetryServiceEvents.find(e => e.eventName === 'responsesApi.compactionOutcome');
		expect(event).toBeUndefined();

		accessor.dispose();
		services.dispose();
	});

	it('captures compaction returned before output_item.done for the next request', async () => {
		const services = createPlatformServices();
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const logService = accessor.get(ILogService);
		const telemetryService = new SpyingTelemetryService();
		const streamedCompactions: OpenAIContextManagementResponse[] = [];

		const earlyCompaction = createCompactionResponse('cmp_early', 'enc_early');
		const compactionAddedEvent = {
			type: 'response.output_item.added',
			output_index: 0,
			item: earlyCompaction,
		};
		const completedEvent = {
			type: 'response.completed',
			response: {
				id: 'resp_early_compaction',
				model: 'gpt-5-mini',
				created_at: 123,
				usage: {
					input_tokens: 1200,
					output_tokens: 9,
					total_tokens: 1209,
					input_tokens_details: { cached_tokens: 0 },
					output_tokens_details: { reasoning_tokens: 0 },
				},
				output: [
					{
						type: 'message',
						content: [{ type: 'output_text', text: 'reply' }],
					},
				],
			}
		};

		const response = createFakeStreamResponse(`data: ${JSON.stringify(compactionAddedEvent)}\n\ndata: ${JSON.stringify(completedEvent)}\n\n`);
		const telemetryData = TelemetryData.createAndMarkAsIssued({ modelCallId: 'model-call-early-compaction' }, {});

		const stream = await processResponseFromChatEndpoint(
			instantiationService,
			telemetryService,
			logService,
			response,
			1,
			async (_text, _unused, delta) => {
				if (delta.contextManagement && isOpenAIContextManagementResponse(delta.contextManagement)) {
					streamedCompactions.push(delta.contextManagement);
				}
				return undefined;
			},
			telemetryData,
			1000
		);

		for await (const _ of stream) {
			// consume stream
		}

		expect(streamedCompactions.map(item => item.id)).toEqual(['cmp_early']);

		const body = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(servicesAccessor, createRequestOptions([
			createCompactionAssistantMessage(streamedCompactions[streamedCompactions.length - 1]),
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'continue' }],
			},
		], false), testEndpoint.model, testEndpoint));

		expect(body.input).toContainEqual({
			type: openAIContextManagementCompactionType,
			id: 'cmp_early',
			encrypted_content: 'enc_early',
		});

		accessor.dispose();
		services.dispose();
	});

	it('emits telemetry when the server returns a compaction item', async () => {
		const services = createPlatformServices();
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const logService = accessor.get(ILogService);
		const telemetryService = new SpyingTelemetryService();

		const compactionEvent = {
			type: 'response.output_item.done',
			output_index: 0,
			item: {
				type: openAIContextManagementCompactionType,
				id: 'cmp_123',
				encrypted_content: 'enc',
			}
		};
		const completedEvent = {
			type: 'response.completed',
			response: {
				id: 'resp_456',
				model: 'gpt-5-mini',
				created_at: 123,
				usage: {
					input_tokens: 1200,
					output_tokens: 7,
					total_tokens: 1207,
					input_tokens_details: { cached_tokens: 0 },
					output_tokens_details: { reasoning_tokens: 0 },
				},
				output: []
			}
		};

		const response = createFakeStreamResponse(`data: ${JSON.stringify(compactionEvent)}\n\ndata: ${JSON.stringify(completedEvent)}\n\n`);
		const telemetryData = TelemetryData.createAndMarkAsIssued({ modelCallId: 'model-call-2' }, {});

		const stream = await processResponseFromChatEndpoint(
			instantiationService,
			telemetryService,
			logService,
			response,
			1,
			async () => undefined,
			telemetryData,
			1000
		);

		for await (const _ of stream) {
			// consume stream
		}

		const event = telemetryService.getEvents().telemetryServiceEvents.find(e => e.eventName === 'responsesApi.compactionOutcome');
		expect(event).toBeDefined();
		expect(event?.properties).toMatchObject({
			outcome: 'compaction_returned',
			model: 'gpt-5-mini',
		});
		expect(event?.measurements).toMatchObject({
			compactThreshold: 1000,
			promptTokens: 1200,
			totalTokens: 1207,
		});

		accessor.dispose();
		services.dispose();
	});

	it('emits telemetry when the server exceeds threshold without returning a compaction item', async () => {
		const services = createPlatformServices();
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const logService = accessor.get(ILogService);
		const telemetryService = new SpyingTelemetryService();

		const completedEvent = {
			type: 'response.completed',
			response: {
				id: 'resp_789',
				model: 'gpt-5-mini',
				created_at: 123,
				usage: {
					input_tokens: 1500,
					output_tokens: 9,
					total_tokens: 1509,
					input_tokens_details: { cached_tokens: 0 },
					output_tokens_details: { reasoning_tokens: 0 },
				},
				output: [
					{
						type: 'message',
						content: [{ type: 'output_text', text: 'reply' }],
					}
				]
			}
		};

		const response = createFakeStreamResponse(`data: ${JSON.stringify(completedEvent)}\n\n`);
		const telemetryData = TelemetryData.createAndMarkAsIssued({ modelCallId: 'model-call-3' }, {});

		const stream = await processResponseFromChatEndpoint(
			instantiationService,
			telemetryService,
			logService,
			response,
			1,
			async () => undefined,
			telemetryData,
			1000
		);

		for await (const _ of stream) {
			// consume stream
		}

		const event = telemetryService.getEvents().telemetryServiceEvents.find(e => e.eventName === 'responsesApi.compactionOutcome');
		expect(event).toBeDefined();
		expect(event?.properties).toMatchObject({
			outcome: 'threshold_met_no_compaction',
			model: 'gpt-5-mini',
		});
		expect(event?.measurements).toMatchObject({
			compactThreshold: 1000,
			promptTokens: 1500,
			totalTokens: 1509,
		});

		accessor.dispose();
		services.dispose();
	});
});

describe('summarizedAtRoundId and stateful marker interaction', () => {
	it('skips stateful marker when summarizedAtRoundId differs from connection', () => {
		const services = createPlatformServices();
		const wsManager: IChatWebSocketManager = {
			_serviceBrand: undefined,
			getOrCreateConnection: () => { throw new Error('not implemented'); },
			hasActiveConnection: () => false,
			getStatefulMarker: () => 'resp-prev',
			getSummarizedAtRoundId: () => 'round-old',
			closeConnection: () => { },
			closeAll: () => { },
		};
		services.set(IChatWebSocketManager, wsManager);
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'summarized history' }] },
			createStatefulMarkerMessage(testEndpoint.model, 'resp-prev'),
			{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'after marker' }] },
		];

		const body = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(
			servicesAccessor,
			{ ...createRequestOptions(messages, true), conversationId: 'conv-1', summarizedAtRoundId: 'round-new' },
			testEndpoint.model, testEndpoint,
		));

		expect(body.previous_response_id).toBeUndefined();
		expect(body.input).toHaveLength(2);

		accessor.dispose();
		services.dispose();
	});

	it('uses stateful marker when summarizedAtRoundId matches connection', () => {
		const services = createPlatformServices();
		const wsManager = new NullChatWebSocketManager();
		wsManager.getStatefulMarker = () => 'resp-prev';
		wsManager.getSummarizedAtRoundId = () => 'round-5';
		services.set(IChatWebSocketManager, wsManager);
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'summarized history' }] },
			createStatefulMarkerMessage(testEndpoint.model, 'resp-prev'),
			{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'after marker' }] },
		];

		const body = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(
			servicesAccessor,
			{ ...createRequestOptions(messages, true), conversationId: 'conv-1', summarizedAtRoundId: 'round-5' },
			testEndpoint.model, testEndpoint,
		));

		expect(body.previous_response_id).toBe('resp-prev');
		expect(body.input).toHaveLength(1);

		accessor.dispose();
		services.dispose();
	});

	it('uses stateful marker when both sides have no summary', () => {
		const services = createPlatformServices();
		const wsManager = new NullChatWebSocketManager();
		wsManager.getStatefulMarker = () => 'resp-prev';
		wsManager.getSummarizedAtRoundId = () => undefined;
		services.set(IChatWebSocketManager, wsManager);
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'first message' }] },
			createStatefulMarkerMessage(testEndpoint.model, 'resp-prev'),
			{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'second message' }] },
		];

		const body = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(
			servicesAccessor,
			{ ...createRequestOptions(messages, true), conversationId: 'conv-1' },
			testEndpoint.model, testEndpoint,
		));

		expect(body.previous_response_id).toBe('resp-prev');
		expect(body.input).toHaveLength(1);

		accessor.dispose();
		services.dispose();
	});

	it('skips stateful marker when conversation is rolled back past summary', () => {
		const services = createPlatformServices();
		const wsManager = new NullChatWebSocketManager();
		wsManager.getStatefulMarker = () => 'resp-prev';
		wsManager.getSummarizedAtRoundId = () => 'round-5';
		services.set(IChatWebSocketManager, wsManager);
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'first message' }] },
			createStatefulMarkerMessage(testEndpoint.model, 'resp-prev'),
			{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'second message' }] },
		];

		const body = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(
			servicesAccessor,
			{ ...createRequestOptions(messages, true), conversationId: 'conv-1', summarizedAtRoundId: undefined },
			testEndpoint.model, testEndpoint,
		));

		expect(body.previous_response_id).toBeUndefined();
		expect(body.input).toHaveLength(2);

		accessor.dispose();
		services.dispose();
	});

	it('skips stateful marker on first request after new summarization', () => {
		const services = createPlatformServices();
		const wsManager = new NullChatWebSocketManager();
		wsManager.getStatefulMarker = () => 'resp-prev';
		wsManager.getSummarizedAtRoundId = () => undefined;
		services.set(IChatWebSocketManager, wsManager);
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const messages: Raw.ChatMessage[] = [
			{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'summarized history' }] },
			createStatefulMarkerMessage(testEndpoint.model, 'resp-prev'),
			{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'after marker' }] },
		];

		const body = instantiationService.invokeFunction(servicesAccessor => createResponsesRequestBody(
			servicesAccessor,
			{ ...createRequestOptions(messages, true), conversationId: 'conv-1', summarizedAtRoundId: 'round-new' },
			testEndpoint.model, testEndpoint,
		));

		expect(body.previous_response_id).toBeUndefined();
		expect(body.input).toHaveLength(2);

		accessor.dispose();
		services.dispose();
	});
});

describe('phase commentary followed by phase final_answer', () => {
	it('inserts a separator between commentary and final_answer text in the stream', async () => {
		const services = createPlatformServices();
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const logService = accessor.get(ILogService);
		const telemetryService = new SpyingTelemetryService();
		const accumulatedTexts: string[] = [];
		const phases: string[] = [];

		const commentaryText = 'Responding directly in commentary as requested. My name is GitHub Copilot.';
		const finalText = 'My name is GitHub Copilot.';

		// Real-world Responses API stream: commentary message (output_index 0)
		// followed by final_answer message (output_index 1), with incremental
		// text deltas for each.
		const events = [
			{ type: 'response.output_item.added', output_index: 0, item: { type: 'message', role: 'assistant', content: [], phase: 'commentary', status: 'in_progress' }, sequence_number: 2 },
			{ type: 'response.content_part.added', output_index: 0, content_index: 0, item_id: 'item-0', part: { type: 'output_text', text: '', annotations: [], logprobs: [] }, sequence_number: 3 },
			{ type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'item-0', delta: 'Respond', logprobs: [], sequence_number: 4 },
			{ type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'item-0', delta: 'ing', logprobs: [], sequence_number: 5 },
			{ type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'item-0', delta: ' directly', logprobs: [], sequence_number: 6 },
			{ type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'item-0', delta: ' in', logprobs: [], sequence_number: 7 },
			{ type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'item-0', delta: ' commentary', logprobs: [], sequence_number: 8 },
			{ type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'item-0', delta: ' as', logprobs: [], sequence_number: 9 },
			{ type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'item-0', delta: ' requested', logprobs: [], sequence_number: 10 },
			{ type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'item-0', delta: '.', logprobs: [], sequence_number: 11 },
			{ type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'item-0', delta: ' My', logprobs: [], sequence_number: 12 },
			{ type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'item-0', delta: ' name', logprobs: [], sequence_number: 13 },
			{ type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'item-0', delta: ' is', logprobs: [], sequence_number: 14 },
			{ type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'item-0', delta: ' Git', logprobs: [], sequence_number: 15 },
			{ type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'item-0', delta: 'Hub', logprobs: [], sequence_number: 16 },
			{ type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'item-0', delta: ' Cop', logprobs: [], sequence_number: 17 },
			{ type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'item-0', delta: 'ilot', logprobs: [], sequence_number: 18 },
			{ type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'item-0', delta: '.', logprobs: [], sequence_number: 19 },
			{ type: 'response.output_text.done', output_index: 0, content_index: 0, item_id: 'item-0', text: commentaryText, logprobs: [], sequence_number: 20 },
			{ type: 'response.content_part.done', output_index: 0, content_index: 0, item_id: 'item-0', part: { type: 'output_text', text: commentaryText, annotations: [], logprobs: [] }, sequence_number: 21 },
			{ type: 'response.output_item.done', output_index: 0, item: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: commentaryText, annotations: [], logprobs: [] }], phase: 'commentary', status: 'completed' }, sequence_number: 22 },
			{ type: 'response.output_item.added', output_index: 1, item: { type: 'message', role: 'assistant', content: [], phase: 'final_answer', status: 'in_progress' }, sequence_number: 23 },
			{ type: 'response.content_part.added', output_index: 1, content_index: 0, item_id: 'item-1', part: { type: 'output_text', text: '', annotations: [], logprobs: [] }, sequence_number: 24 },
			{ type: 'response.output_text.delta', output_index: 1, content_index: 0, item_id: 'item-1', delta: 'My', logprobs: [], sequence_number: 25 },
			{ type: 'response.output_text.delta', output_index: 1, content_index: 0, item_id: 'item-1', delta: ' name', logprobs: [], sequence_number: 26 },
			{ type: 'response.output_text.delta', output_index: 1, content_index: 0, item_id: 'item-1', delta: ' is', logprobs: [], sequence_number: 27 },
			{ type: 'response.output_text.delta', output_index: 1, content_index: 0, item_id: 'item-1', delta: ' Git', logprobs: [], sequence_number: 28 },
			{ type: 'response.output_text.delta', output_index: 1, content_index: 0, item_id: 'item-1', delta: 'Hub', logprobs: [], sequence_number: 29 },
			{ type: 'response.output_text.delta', output_index: 1, content_index: 0, item_id: 'item-1', delta: ' Cop', logprobs: [], sequence_number: 30 },
			{ type: 'response.output_text.delta', output_index: 1, content_index: 0, item_id: 'item-1', delta: 'ilot', logprobs: [], sequence_number: 31 },
			{ type: 'response.output_text.delta', output_index: 1, content_index: 0, item_id: 'item-1', delta: '.', logprobs: [], sequence_number: 32 },
			{ type: 'response.output_text.done', output_index: 1, content_index: 0, item_id: 'item-1', text: finalText, logprobs: [], sequence_number: 33 },
			{ type: 'response.content_part.done', output_index: 1, content_index: 0, item_id: 'item-1', part: { type: 'output_text', text: finalText, annotations: [], logprobs: [] }, sequence_number: 34 },
			{ type: 'response.output_item.done', output_index: 1, item: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: finalText, annotations: [], logprobs: [] }], phase: 'final_answer', status: 'completed' }, sequence_number: 35 },
			{
				type: 'response.completed',
				response: {
					id: 'resp_phase_test',
					model: 'gpt-5.4-2026-03-05',
					created_at: 1776962259,
					usage: { input_tokens: 8432, output_tokens: 35, total_tokens: 8467, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
					output: [
						{ type: 'message', content: [{ type: 'output_text', text: commentaryText, annotations: [], logprobs: [] }], phase: 'commentary', role: 'assistant', status: 'completed' },
						{ type: 'message', content: [{ type: 'output_text', text: finalText, annotations: [], logprobs: [] }], phase: 'final_answer', role: 'assistant', status: 'completed' },
					],
				},
				sequence_number: 36,
			}
		];

		const sseBody = events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
		const response = createFakeStreamResponse(sseBody);
		const telemetryData = TelemetryData.createAndMarkAsIssued({ modelCallId: 'model-call-phase-test' }, {});

		const stream = await processResponseFromChatEndpoint(
			instantiationService,
			telemetryService,
			logService,
			response,
			1,
			async (text, _unused, delta) => {
				accumulatedTexts.push(text);
				if (delta.phase) {
					phases.push(delta.phase);
				}
				return undefined;
			},
			telemetryData,
		);

		for await (const _ of stream) {
			// consume stream
		}

		expect(phases).toEqual(['commentary', 'final_answer']);

		// The accumulated text must separate commentary and final_answer text
		const finalAccumulatedText = accumulatedTexts[accumulatedTexts.length - 1];
		expect(finalAccumulatedText).toBe(
			commentaryText + '\n\n' + finalText
		);

		accessor.dispose();
		services.dispose();
	});
});
