/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../platform/chat/common/blockedExtensionService';
import { IChatModelInformation, ModelSupportedEndpoint } from '../../../../platform/endpoint/common/endpointProvider';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { TokenizerType } from '../../../../util/common/tokenizer';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { CustomEndpointOAIEndpoint, hasExplicitApiPath, resolveCustomEndpointUrl } from '../customEndpointProvider';

describe('CustomEndpointBYOKModelProvider', () => {
	const disposables = new DisposableStore();
	let accessor: ITestingServicesAccessor;
	let instaService: IInstantiationService;

	beforeEach(() => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		testingServiceCollection.define(IBlockedExtensionService, new SyncDescriptor(BlockedExtensionService));
		accessor = disposables.add(testingServiceCollection.createTestingAccessor());
		instaService = accessor.get(IInstantiationService);
	});

	afterEach(() => {
		disposables.clear();
	});

	describe('resolveCustomEndpointUrl', () => {
		it('appends /v1/chat/completions to bare base URL by default', () => {
			expect(resolveCustomEndpointUrl('m', 'https://api.example.com')).toBe('https://api.example.com/v1/chat/completions');
		});

		it('appends /chat/completions when URL already ends with /v1', () => {
			expect(resolveCustomEndpointUrl('m', 'https://api.example.com/v1')).toBe('https://api.example.com/v1/chat/completions');
		});

		it('strips trailing slash before appending default path', () => {
			expect(resolveCustomEndpointUrl('m', 'https://api.example.com/')).toBe('https://api.example.com/v1/chat/completions');
		});

		it('preserves explicit /chat/completions path', () => {
			const url = 'https://api.example.com/v1/chat/completions';
			expect(resolveCustomEndpointUrl('m', url)).toBe(url);
		});

		it('preserves explicit /responses path', () => {
			const url = 'https://api.example.com/v1/responses';
			expect(resolveCustomEndpointUrl('m', url)).toBe(url);
		});

		it('preserves explicit /v1/messages path', () => {
			const url = 'https://api.example.com/v1/messages';
			expect(resolveCustomEndpointUrl('m', url)).toBe(url);
		});

		it('honors apiType=responses for bare URL', () => {
			expect(resolveCustomEndpointUrl('m', 'https://api.example.com', 'responses')).toBe('https://api.example.com/v1/responses');
		});

		it('honors apiType=messages for bare URL', () => {
			expect(resolveCustomEndpointUrl('m', 'https://api.example.com', 'messages')).toBe('https://api.example.com/v1/messages');
		});

		it('honors apiType=responses for URL ending in /v1', () => {
			expect(resolveCustomEndpointUrl('m', 'https://api.example.com/v1', 'responses')).toBe('https://api.example.com/v1/responses');
		});
	});

	describe('hasExplicitApiPath', () => {
		it('detects /chat/completions, /responses, /messages, and rejects bare URLs', () => {
			expect({
				chat: hasExplicitApiPath('https://api.example.com/v1/chat/completions'),
				responses: hasExplicitApiPath('https://api.example.com/v1/responses'),
				messages: hasExplicitApiPath('https://api.example.com/v1/messages'),
				bare: hasExplicitApiPath('https://api.example.com'),
				baseV1: hasExplicitApiPath('https://api.example.com/v1'),
			}).toEqual({
				chat: true,
				responses: true,
				messages: true,
				bare: false,
				baseV1: false,
			});
		});
	});

	describe('CustomEndpointOAIEndpoint', () => {
		function makeMetadata(supportedEndpoints: ModelSupportedEndpoint[] | undefined): IChatModelInformation {
			return {
				id: 'custom-model',
				name: 'Custom Model',
				vendor: 'CustomEndpoint',
				version: '1.0',
				model_picker_enabled: true,
				is_chat_default: false,
				is_chat_fallback: false,
				supported_endpoints: supportedEndpoints,
				capabilities: {
					type: 'chat',
					family: 'custom-family',
					tokenizer: TokenizerType.O200K,
					supports: {
						parallel_tool_calls: false,
						streaming: true,
						tool_calls: true,
						vision: false,
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
		}

		it('uses Messages API and sends x-api-key + anthropic-version when supported_endpoints includes Messages', () => {
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				makeMetadata([ModelSupportedEndpoint.Messages]),
				'test-api-key',
				'https://anthropic.example.com/v1/messages');
			const headers = endpoint.getExtraHeaders();

			expect({
				apiType: endpoint.apiType,
				contentType: headers['Content-Type'],
				xApiKey: headers['x-api-key'],
				anthropicVersion: headers['anthropic-version'],
				authorization: headers['Authorization'],
			}).toEqual({
				apiType: 'messages',
				contentType: 'application/json',
				xApiKey: 'test-api-key',
				anthropicVersion: '2023-06-01',
				authorization: undefined,
			});
		});

		it('sends Authorization: Bearer for Chat Completions endpoints', () => {
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				makeMetadata(undefined),
				'test-api-key',
				'https://api.example.com/v1/chat/completions');
			const headers = endpoint.getExtraHeaders();

			expect({
				apiType: endpoint.apiType,
				authorization: headers['Authorization'],
				xApiKey: headers['x-api-key'],
			}).toEqual({
				apiType: 'chatCompletions',
				authorization: 'Bearer test-api-key',
				xApiKey: undefined,
			});
		});

		it('sends api-key (not Bearer) for openai.azure.com Chat Completions URLs', () => {
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				makeMetadata(undefined),
				'test-api-key',
				'https://my-resource.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2025-01-01-preview');
			const headers = endpoint.getExtraHeaders();

			expect({
				authApiKey: headers['api-key'],
				authorization: headers['Authorization'],
			}).toEqual({
				authApiKey: 'test-api-key',
				authorization: undefined,
			});
		});
	});
});
