/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IChatModelInformation, ModelSupportedEndpoint } from '../../../../platform/endpoint/common/endpointProvider';
import { ICreateEndpointBodyOptions, IEndpointBody } from '../../../../platform/networking/common/networking';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { OpenAIEndpoint } from '../openAIEndpoint';

// Test fixtures for thinking content
const createThinkingMessage = (thinkingId: string, thinkingText: string): Raw.ChatMessage => ({
	role: Raw.ChatRole.Assistant,
	content: [
		{
			type: Raw.ChatCompletionContentPartKind.Opaque,
			value: {
				type: 'thinking',
				thinking: {
					id: thinkingId,
					text: thinkingText
				}
			}
		}
	]
});

const createTestOptions = (messages: Raw.ChatMessage[]): ICreateEndpointBodyOptions => ({
	debugName: 'test',
	messages,
	requestId: 'test-req-123',
	postOptions: {},
	finishedCb: undefined,
	location: undefined as any
});

describe('OpenAIEndpoint - Reasoning Properties', () => {
	let modelMetadata: IChatModelInformation;
	const disposables = new DisposableStore();
	let accessor: ITestingServicesAccessor;
	let instaService: IInstantiationService;

	beforeEach(() => {
		modelMetadata = {
			id: 'test-model',
			name: 'Test Model',
			vendor: 'Test Vendor',
			version: '1.0',
			model_picker_enabled: true,
			is_chat_default: false,
			is_chat_fallback: false,
			supported_endpoints: [ModelSupportedEndpoint.ChatCompletions, ModelSupportedEndpoint.Responses],
			capabilities: {
				type: 'chat',
				family: 'openai',
				tokenizer: 'o200k_base' as any,
				supports: {
					parallel_tool_calls: false,
					streaming: true,
					tool_calls: false,
					vision: false,
					prediction: false,
					thinking: true
				},
				limits: {
					max_prompt_tokens: 4096,
					max_output_tokens: 2048,
					max_context_window_tokens: 6144
				}
			}
		};

		const testingServiceCollection = createExtensionUnitTestingServices();
		accessor = disposables.add(testingServiceCollection.createTestingAccessor());
		instaService = accessor.get(IInstantiationService);
	});

	afterEach(() => {
		disposables.clear();
	});

	describe('CAPI mode (useResponsesApi = false)', () => {
		it('should set cot_id and cot_summary properties when processing thinking content', () => {
			const endpoint = instaService.createInstance(OpenAIEndpoint,
				{
					...modelMetadata,
					supported_endpoints: [ModelSupportedEndpoint.ChatCompletions]
				},
				'test-api-key',
				'https://api.openai.com/v1/chat/completions');

			const thinkingMessage = createThinkingMessage('test-thinking-123', 'this is my reasoning');
			const options = createTestOptions([thinkingMessage]);

			const body = endpoint.createRequestBody(options);

			expect(body.messages).toBeDefined();
			const messages = body.messages as any[];
			expect(messages).toHaveLength(1);
			expect(messages[0].cot_id).toBe('test-thinking-123');
			expect(messages[0].cot_summary).toBe('this is my reasoning');
		});

		it('should handle multiple messages with thinking content', () => {
			const endpoint = instaService.createInstance(OpenAIEndpoint,
				{
					...modelMetadata,
					supported_endpoints: [ModelSupportedEndpoint.ChatCompletions]
				},
				'test-api-key',
				'https://api.openai.com/v1/chat/completions');

			const userMessage: Raw.ChatMessage = {
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello' }]
			};
			const thinkingMessage = createThinkingMessage('reasoning-456', 'complex reasoning here');
			const options = createTestOptions([userMessage, thinkingMessage]);

			const body = endpoint.createRequestBody(options);

			expect(body.messages).toBeDefined();
			const messages = body.messages as any[];
			expect(messages).toHaveLength(2);

			// User message should not have thinking properties
			expect(messages[0].cot_id).toBeUndefined();
			expect(messages[0].cot_summary).toBeUndefined();

			// Assistant message should have thinking properties
			expect(messages[1].cot_id).toBe('reasoning-456');
			expect(messages[1].cot_summary).toBe('complex reasoning here');
		});
	});

	describe('Responses API mode (useResponsesApi = true)', () => {
		it('should preserve reasoning object when thinking is supported', () => {
			accessor.get(IConfigurationService).setConfig(ConfigKey.ResponsesApiReasoningSummary, 'detailed');
			const endpoint = instaService.createInstance(OpenAIEndpoint,
				modelMetadata,
				'test-api-key',
				'https://api.openai.com/v1/chat/completions');

			const thinkingMessage = createThinkingMessage('resp-api-789', 'responses api reasoning');
			const options = createTestOptions([thinkingMessage]);

			const body = endpoint.createRequestBody(options);

			expect(body.store).toBe(true);
			expect(body.n).toBeUndefined();
			expect(body.stream_options).toBeUndefined();
			expect(body.reasoning).toBeDefined(); // Should preserve reasoning object
		});

		it('should remove reasoning object when thinking is not supported', () => {
			const modelWithoutThinking = {
				...modelMetadata,
				capabilities: {
					...modelMetadata.capabilities,
					supports: {
						...modelMetadata.capabilities.supports,
						thinking: false
					}
				}
			};

			accessor.get(IConfigurationService).setConfig(ConfigKey.ResponsesApiReasoningSummary, 'detailed');
			const endpoint = instaService.createInstance(OpenAIEndpoint,
				modelWithoutThinking,
				'test-api-key',
				'https://api.openai.com/v1/chat/completions');

			const thinkingMessage = createThinkingMessage('no-thinking-999', 'should be removed');
			const options = createTestOptions([thinkingMessage]);

			const body = endpoint.createRequestBody(options);

			expect(body.reasoning).toBeUndefined(); // Should be removed
		});
	});

	describe('reasoning effort forwarding', () => {
		const userMessage: Raw.ChatMessage = {
			role: Raw.ChatRole.User,
			content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello' }]
		};

		const buildOptions = (reasoningEffort?: string): ICreateEndpointBodyOptions => ({
			...createTestOptions([userMessage]),
			modelCapabilities: reasoningEffort ? { reasoningEffort } : undefined,
		});

		const buildModel = (overrides: Partial<IChatModelInformation>): IChatModelInformation => ({
			...modelMetadata,
			supported_endpoints: [ModelSupportedEndpoint.ChatCompletions],
			capabilities: {
				...modelMetadata.capabilities,
				supports: {
					...modelMetadata.capabilities.supports,
					reasoning_effort: ['low', 'medium', 'high'],
				},
			},
			...overrides,
		});

		it('places top-level `reasoning_effort` on Chat Completions when the model supports the requested level', () => {
			const endpoint = instaService.createInstance(OpenAIEndpoint,
				buildModel({}),
				'test-api-key',
				'https://api.openai.com/v1/chat/completions');

			const body = endpoint.createRequestBody(buildOptions('high'));

			expect(body.reasoning_effort).toBe('high');
			expect(body.reasoning).toBeUndefined();
		});

		it('omits the field when the requested level is not in the supported list', () => {
			const endpoint = instaService.createInstance(OpenAIEndpoint,
				buildModel({}),
				'test-api-key',
				'https://api.openai.com/v1/chat/completions');

			const body = endpoint.createRequestBody(buildOptions('minimal'));

			expect(body.reasoning_effort).toBeUndefined();
			expect(body.reasoning).toBeUndefined();
		});

		it('honors the `ReasoningEffortOverride` setting over the per-request value', () => {
			accessor.get(IConfigurationService).setConfig(ConfigKey.Advanced.ReasoningEffortOverride, 'low');
			const endpoint = instaService.createInstance(OpenAIEndpoint,
				buildModel({}),
				'test-api-key',
				'https://api.openai.com/v1/chat/completions');

			const body = endpoint.createRequestBody(buildOptions('high'));

			expect(body.reasoning_effort).toBe('low');
		});

		it('emits nested `reasoning.effort` and scrubs top-level when `reasoningEffortFormat` is `responses` on Chat Completions URL', () => {
			const endpoint = instaService.createInstance(OpenAIEndpoint,
				buildModel({ reasoningEffortFormat: 'responses' }),
				'test-api-key',
				'https://api.openai.com/v1/chat/completions');

			const body = endpoint.createRequestBody(buildOptions('medium'));

			expect(body.reasoning).toEqual({ effort: 'medium' });
			expect(body.reasoning_effort).toBeUndefined();
		});

		it('emits top-level `reasoning_effort` and scrubs nested when `reasoningEffortFormat` is `chat-completions` on a Responses URL', () => {
			const endpoint = instaService.createInstance(OpenAIEndpoint,
				buildModel({
					reasoningEffortFormat: 'chat-completions',
					supported_endpoints: [ModelSupportedEndpoint.Responses],
				}),
				'test-api-key',
				'https://api.openai.com/v1/responses');

			const body = endpoint.createRequestBody(buildOptions('high'));

			expect(body.reasoning_effort).toBe('high');
			expect(body.reasoning?.effort).toBeUndefined();
		});

		it('does not emit a reasoning field when the model declares no reasoning support', () => {
			const endpoint = instaService.createInstance(OpenAIEndpoint,
				{
					...modelMetadata,
					supported_endpoints: [ModelSupportedEndpoint.ChatCompletions],
				},
				'test-api-key',
				'https://api.openai.com/v1/chat/completions');

			const body = endpoint.createRequestBody(buildOptions('high'));

			expect(body.reasoning_effort).toBeUndefined();
			expect(body.reasoning).toBeUndefined();
		});

		it('scrubs an unsupported `reasoning.effort` pre-populated by `createResponsesRequestBody` on a Responses request', () => {
			// `createResponsesRequestBody` hard-codes a `'medium'` default. If the model only supports
			// e.g. `['low', 'high']`, that default must not leak through to the wire.
			const endpoint = instaService.createInstance(OpenAIEndpoint,
				buildModel({
					supported_endpoints: [ModelSupportedEndpoint.Responses],
					capabilities: {
						...modelMetadata.capabilities,
						supports: {
							...modelMetadata.capabilities.supports,
							reasoning_effort: ['low', 'high'],
						},
					},
				}),
				'test-api-key',
				'https://api.openai.com/v1/responses');

			const body = endpoint.createRequestBody(buildOptions());

			expect(body.reasoning?.effort).toBeUndefined();
		});

		it('scrubs an unsupported pre-populated value while preserving other reasoning fields', () => {
			// Direct invocation via the Chat Completions path: synthesize a body that already carries an
			// unsupported effort plus a `summary` field, and verify only the effort is dropped.
			const endpoint = instaService.createInstance(OpenAIEndpoint,
				buildModel({
					reasoningEffortFormat: 'responses',
					capabilities: {
						...modelMetadata.capabilities,
						supports: {
							...modelMetadata.capabilities.supports,
							reasoning_effort: ['low', 'high'],
						},
					},
				}),
				'test-api-key',
				'https://api.openai.com/v1/chat/completions');
			const apply = (endpoint as unknown as { _applyReasoningEffort: (body: IEndpointBody, options: ICreateEndpointBodyOptions) => void })._applyReasoningEffort.bind(endpoint);

			const body: IEndpointBody = { reasoning: { effort: 'medium', summary: 'auto' } };
			apply(body, buildOptions());

			expect(body).toEqual({ reasoning: { summary: 'auto' }, reasoning_effort: undefined });
		});

		it('scrubs an unsupported pre-populated top-level `reasoning_effort` on Chat Completions', () => {
			const endpoint = instaService.createInstance(OpenAIEndpoint,
				buildModel({
					capabilities: {
						...modelMetadata.capabilities,
						supports: {
							...modelMetadata.capabilities.supports,
							reasoning_effort: ['low', 'high'],
						},
					},
				}),
				'test-api-key',
				'https://api.openai.com/v1/chat/completions');
			const apply = (endpoint as unknown as { _applyReasoningEffort: (body: IEndpointBody, options: ICreateEndpointBodyOptions) => void })._applyReasoningEffort.bind(endpoint);

			const body: IEndpointBody = { reasoning_effort: 'medium' };
			apply(body, buildOptions());

			expect(body.reasoning_effort).toBeUndefined();
		});
	});
});
