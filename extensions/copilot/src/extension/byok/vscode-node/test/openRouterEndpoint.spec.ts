/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IChatModelInformation, ModelSupportedEndpoint } from '../../../../platform/endpoint/common/endpointProvider';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { TokenizerType } from '../../../../util/common/tokenizer';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { OpenRouterEndpoint } from '../openRouterProvider';

describe('OpenRouterEndpoint', () => {
	const disposables = new DisposableStore();
	let accessor: ITestingServicesAccessor;
	let instaService: IInstantiationService;

	beforeEach(() => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		accessor = disposables.add(testingServiceCollection.createTestingAccessor());
		instaService = accessor.get(IInstantiationService);
	});

	afterEach(() => {
		disposables.clear();
	});

	describe('Anthropic models — Messages API', () => {
		let anthropicMetadata: IChatModelInformation;

		beforeEach(() => {
			anthropicMetadata = {
				id: 'anthropic/claude-sonnet-4',
				name: 'Claude Sonnet 4',
				vendor: 'OpenRouter',
				version: '1.0',
				model_picker_enabled: true,
				is_chat_default: false,
				is_chat_fallback: false,
				supported_endpoints: [ModelSupportedEndpoint.Messages],
				capabilities: {
					type: 'chat',
					family: 'anthropic/claude-sonnet-4',
					tokenizer: TokenizerType.O200K,
					supports: {
						parallel_tool_calls: false,
						streaming: true,
						tool_calls: true,
						vision: true,
						prediction: false,
						thinking: false
					},
					limits: {
						max_prompt_tokens: 200000,
						max_output_tokens: 16000,
						max_context_window_tokens: 200000
					}
				}
			};
		});

		it('should use Messages API when supported_endpoints includes Messages', () => {
			const endpoint = instaService.createInstance(OpenRouterEndpoint,
				anthropicMetadata,
				'test-api-key',
				'https://openrouter.ai/api/v1/messages');

			expect(endpoint.apiType).toBe('messages');
		});

	});

	describe('Non-Anthropic models — Chat Completions', () => {
		let nonAnthropicMetadata: IChatModelInformation;

		beforeEach(() => {
			nonAnthropicMetadata = {
				id: 'openai/gpt-4o',
				name: 'GPT-4o',
				vendor: 'OpenRouter',
				version: '1.0',
				model_picker_enabled: true,
				is_chat_default: false,
				is_chat_fallback: false,
				supported_endpoints: [ModelSupportedEndpoint.ChatCompletions],
				capabilities: {
					type: 'chat',
					family: 'openai/gpt-4o',
					tokenizer: TokenizerType.O200K,
					supports: {
						parallel_tool_calls: false,
						streaming: true,
						tool_calls: true,
						vision: true,
						prediction: false,
						thinking: false
					},
					limits: {
						max_prompt_tokens: 128000,
						max_output_tokens: 16000,
						max_context_window_tokens: 128000
					}
				}
			};
		});

		it('should use Chat Completions API for non-Anthropic models', () => {
			const endpoint = instaService.createInstance(OpenRouterEndpoint,
				nonAnthropicMetadata,
				'test-api-key',
				'https://openrouter.ai/api/v1/chat/completions');

			expect(endpoint.apiType).toBe('chatCompletions');
		});
	});
});
