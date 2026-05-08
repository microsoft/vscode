/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IChatModelInformation, ModelSupportedEndpoint } from '../../../../platform/endpoint/common/endpointProvider';
import { ICreateEndpointBodyOptions } from '../../../../platform/networking/common/networking';
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
});