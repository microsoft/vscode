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
import { AzureOpenAIEndpoint } from '../azureOpenAIEndpoint';

describe('AzureOpenAIEndpoint', () => {
	let modelMetadata: IChatModelInformation;
	const disposables = new DisposableStore();
	let accessor: ITestingServicesAccessor;
	let instaService: IInstantiationService;

	beforeEach(() => {
		modelMetadata = {
			id: 'test-azure-model',
			vendor: 'Microsoft Azure',
			name: 'Test Azure Model',
			version: '1.0',
			model_picker_enabled: true,
			is_chat_default: false,
			is_chat_fallback: false,
			supported_endpoints: [ModelSupportedEndpoint.ChatCompletions],
			capabilities: {
				type: 'chat',
				family: 'openai',
				tokenizer: TokenizerType.O200K,
				supports: {
					parallel_tool_calls: false,
					streaming: true,
					tool_calls: false,
					vision: false,
					prediction: false,
					thinking: false
				},
				limits: {
					max_prompt_tokens: 128000,
					max_output_tokens: 4096,
					max_context_window_tokens: 132096
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

	describe('getExtraHeaders', () => {
		it('should use Authorization header with Bearer token for Entra ID authentication', () => {
			const entraToken = 'test-entra-token-abc123';
			const endpoint = instaService.createInstance(
				AzureOpenAIEndpoint,
				modelMetadata,
				entraToken,
				'https://example-endpoint.example.com/v1/chat/completions'
			);
			const headers = endpoint.getExtraHeaders();

			// Should have Authorization header with Bearer token
			expect(headers['Authorization']).toBe(`Bearer ${entraToken}`);

			// Should NOT have api-key header (Azure API key auth)
			expect(headers['api-key']).toBeUndefined();

			// Should have standard headers
			expect(headers['Content-Type']).toBe('application/json');
		});

		it('should override parent class headers to replace api-key with Authorization', () => {
			const entraToken = 'test-entra-token-xyz789';
			const endpoint = instaService.createInstance(
				AzureOpenAIEndpoint,
				modelMetadata,
				entraToken,
				'https://example-endpoint.example.com/v1/chat/completions'
			);
			const headers = endpoint.getExtraHeaders();

			// Verify the override worked correctly
			expect(headers['Authorization']).toBe(`Bearer ${entraToken}`);
			expect(headers['api-key']).toBeUndefined();
			expect(Object.keys(headers)).not.toContain('api-key');
		});

		it('should work with different Azure OpenAI endpoint URLs', () => {
			const entraToken = 'test-token-456';

			// Test with different endpoint formats
			const urls = [
				'https://example-endpoint-1.example.com/v1/chat/completions',
				'https://example-endpoint-2.example.com/v1/chat/completions',
				'https://example-endpoint-3.example.com/v1/chat/completions'
			];

			for (const url of urls) {
				const endpoint = instaService.createInstance(
					AzureOpenAIEndpoint,
					modelMetadata,
					entraToken,
					url
				);

				const headers = endpoint.getExtraHeaders();

				expect(headers['Authorization']).toBe(`Bearer ${entraToken}`);
				expect(headers['api-key']).toBeUndefined();
			}
		});

		it('should preserve other headers from parent class', () => {
			const entraToken = 'test-token-789';
			const endpoint = instaService.createInstance(
				AzureOpenAIEndpoint,
				modelMetadata,
				entraToken,
				'https://example-endpoint.example.com/v1/chat/completions'
			);

			const headers = endpoint.getExtraHeaders();

			// Should preserve Content-Type from parent
			expect(headers['Content-Type']).toBe('application/json');

			// Should have Authorization header
			expect(headers['Authorization']).toBeDefined();
			expect(headers['Authorization']).toContain('Bearer');
		});
	});

	describe('inheritance', () => {
		it('should inherit from OpenAIEndpoint and maintain same constructor signature', () => {
			const entraToken = 'test-token-inheritance';

			// Should be able to instantiate with same parameters as OpenAIEndpoint
			const endpoint = instaService.createInstance(
				AzureOpenAIEndpoint,
				modelMetadata,
				entraToken,
				'https://example-endpoint.example.com/v1/chat/completions'
			);

			// Should be an instance of AzureOpenAIEndpoint
			expect(endpoint).toBeInstanceOf(AzureOpenAIEndpoint);

			// Should have getExtraHeaders method
			expect(typeof endpoint.getExtraHeaders).toBe('function');
		});
	});
});
