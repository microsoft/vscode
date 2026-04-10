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

		const response = createFakeStreamResponse(`data: ${JSON.stringify(compactionEvent)}\n\ndata: ${JSON.stringify(completedEvent)}\n\n`);
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
