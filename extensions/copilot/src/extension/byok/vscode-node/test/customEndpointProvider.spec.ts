/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../platform/chat/common/blockedExtensionService';
import { ChatLocation } from '../../../../platform/chat/common/commonTypes';
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

		it('uses user-supplied api-key header instead of default Bearer for Chat Completions endpoints behind APIM', () => {
			const metadata = makeMetadata(undefined);
			metadata.requestHeaders = { 'api-key': 'apim-secret' };
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				metadata,
				'test-api-key',
				'https://my-apim.azure-api.net/openai/v1/chat/completions');
			const headers = endpoint.getExtraHeaders();

			expect({
				authApiKey: headers['api-key'],
				authorization: headers['Authorization'],
			}).toEqual({
				authApiKey: 'apim-secret',
				authorization: undefined,
			});
		});

		it('uses user-supplied api-key header for bare base URLs without an explicit API path', () => {
			// URL contains neither /messages, /responses, nor /chat/completions, and is not an
			// openai.azure host — exercises the path where neither the api-type inference nor the
			// azure heuristic apply, and verifies the user-supplied auth header still wins.
			const metadata = makeMetadata(undefined);
			metadata.requestHeaders = { 'api-key': 'apim-secret' };
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				metadata,
				'test-api-key',
				'https://my-apim.azure-api.net/openai/v1');
			const headers = endpoint.getExtraHeaders();

			expect({
				authApiKey: headers['api-key'],
				authorization: headers['Authorization'],
			}).toEqual({
				authApiKey: 'apim-secret',
				authorization: undefined,
			});
		});

		it('suppresses default x-api-key on Messages API when user supplies Authorization header', () => {
			const metadata = makeMetadata([ModelSupportedEndpoint.Messages]);
			metadata.requestHeaders = { 'Authorization': 'Bearer override' };
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				metadata,
				'test-api-key',
				'https://anthropic.example.com/v1/messages');
			const headers = endpoint.getExtraHeaders();

			expect({
				xApiKey: headers['x-api-key'],
				authorization: headers['Authorization'],
				anthropicVersion: headers['anthropic-version'],
			}).toEqual({
				xApiKey: undefined,
				authorization: 'Bearer override',
				anthropicVersion: '2023-06-01',
			});
		});

		it('interpolates ${apiKey} token in user-supplied header values', () => {
			const metadata = makeMetadata(undefined);
			metadata.requestHeaders = { 'X-Custom-Auth': 'ApiKey ${apiKey}' };
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				metadata,
				'secret-123',
				'https://api.example.com/v1/chat/completions');
			const headers = endpoint.getExtraHeaders();

			expect(headers['X-Custom-Auth']).toBe('ApiKey secret-123');
		});

		it('suppresses default Bearer when user supplies a well-known non-reserved auth header (x-goog-api-key)', () => {
			const metadata = makeMetadata(undefined);
			metadata.requestHeaders = { 'x-goog-api-key': '${apiKey}' };
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				metadata,
				'gemini-secret',
				'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
			const headers = endpoint.getExtraHeaders();

			expect({
				googKey: headers['x-goog-api-key'],
				authorization: headers['Authorization'],
				apiKey: headers['api-key'],
			}).toEqual({
				googKey: 'gemini-secret',
				authorization: undefined,
				apiKey: undefined,
			});
		});

		it('declares ownsAuthorization=true so the chat fetcher will not fall back to the CAPI Copilot token', () => {
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				makeMetadata(undefined),
				'test-api-key',
				'https://api.example.com/v1/chat/completions');

			expect(endpoint.ownsAuthorization).toBe(true);
		});

		it('issue #321514: applies configured model options over default sampling parameters', () => {
			const metadata: IChatModelInformation = {
				...makeMetadata(undefined),
				modelOptions: {
					temperature: 1,
					top_p: 0.95,
				},
			};
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				metadata,
				'test-api-key',
				'https://api.example.com/v1/chat/completions');
			const body = endpoint.createRequestBody({
				debugName: 'test',
				messages: [{
					role: Raw.ChatRole.User,
					content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello' }]
				}],
				requestId: 'test-req-custom-model-options',
				postOptions: {
					temperature: 0.1,
					top_p: 1,
					stream: true,
				},
				finishedCb: undefined,
				location: ChatLocation.Other,
			});

			expect({
				temperature: body.temperature,
				topP: body.top_p,
			}).toEqual({
				temperature: 1,
				topP: 0.95,
			});
		});

		it('omits sampling parameters configured as null', () => {
			const metadata: IChatModelInformation = {
				...makeMetadata(undefined),
				modelOptions: {
					temperature: null,
					top_p: null,
				},
			};
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				metadata,
				'test-api-key',
				'https://api.example.com/v1/chat/completions');
			const body = endpoint.createRequestBody({
				debugName: 'test',
				messages: [{
					role: Raw.ChatRole.User,
					content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello' }]
				}],
				requestId: 'test-req-omitted-model-options',
				postOptions: {
					temperature: 0.1,
					top_p: 1,
					stream: true,
				},
				finishedCb: undefined,
				location: ChatLocation.Other,
			});

			expect({
				temperature: body.temperature,
				topP: body.top_p,
			}).toEqual({
				temperature: undefined,
				topP: undefined,
			});
		});

		it('keeps explicit per-request sampling parameters ahead of configured model options', () => {
			const metadata: IChatModelInformation = {
				...makeMetadata(undefined),
				modelOptions: {
					temperature: 1,
					top_p: null,
				},
			};
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				metadata,
				'test-api-key',
				'https://api.example.com/v1/chat/completions');
			const body = endpoint.createRequestBody({
				debugName: 'test',
				messages: [{
					role: Raw.ChatRole.User,
					content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello' }]
				}],
				requestId: 'test-req-explicit-model-options',
				requestOptions: {
					temperature: 0.7,
					top_p: 0.9,
				},
				postOptions: {
					temperature: 0.1,
					top_p: 1,
					stream: true,
				},
				finishedCb: undefined,
				location: ChatLocation.Other,
			});

			expect({
				temperature: body.temperature,
				topP: body.top_p,
			}).toEqual({
				temperature: 0.7,
				topP: 0.9,
			});
		});

		it('applies configured model options to Responses and Messages API bodies', () => {
			const results = [
				{
					supportedEndpoints: [ModelSupportedEndpoint.Responses],
					url: 'https://api.example.com/v1/responses',
				},
				{
					supportedEndpoints: [ModelSupportedEndpoint.Messages],
					url: 'https://api.example.com/v1/messages',
				},
			].map(({ supportedEndpoints, url }) => {
				const metadata: IChatModelInformation = {
					...makeMetadata(supportedEndpoints),
					modelOptions: {
						temperature: 1,
						top_p: 0.95,
					},
				};
				const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
					metadata,
					'test-api-key',
					url);
				const body = endpoint.createRequestBody({
					debugName: 'test',
					messages: [{
						role: Raw.ChatRole.User,
						content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello' }]
					}],
					requestId: `test-req-${endpoint.apiType}-model-options`,
					postOptions: {
						temperature: 0.1,
						top_p: 1,
						stream: true,
					},
					finishedCb: undefined,
					location: ChatLocation.Other,
				});

				return {
					apiType: endpoint.apiType,
					temperature: body.temperature,
					topP: body.top_p,
				};
			});

			expect(results).toEqual([
				{
					apiType: 'responses',
					temperature: 1,
					topP: 0.95,
				},
				{
					apiType: 'messages',
					temperature: 1,
					topP: 0.95,
				},
			]);
		});

		it('replaces default Bearer with user-supplied Authorization header on Chat Completions endpoints', () => {
			const metadata = makeMetadata(undefined);
			metadata.requestHeaders = { 'Authorization': 'Bearer user-token' };
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				metadata,
				'test-api-key',
				'https://api.example.com/v1/chat/completions');
			const headers = endpoint.getExtraHeaders();

			expect({
				authorization: headers['Authorization'],
				apiKey: headers['api-key'],
			}).toEqual({
				authorization: 'Bearer user-token',
				apiKey: undefined,
			});
		});

		it('detects user-supplied auth headers case-insensitively', () => {
			const metadata = makeMetadata(undefined);
			metadata.requestHeaders = { 'API-KEY': 'apim-secret' };
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				metadata,
				'test-api-key',
				'https://api.example.com/v1/chat/completions');
			const headers = endpoint.getExtraHeaders();

			expect({
				authApiKey: headers['API-KEY'],
				lowercaseApiKey: headers['api-key'],
				authorization: headers['Authorization'],
			}).toEqual({
				authApiKey: 'apim-secret',
				lowercaseApiKey: undefined,
				authorization: undefined,
			});
		});

		it('still sends default Bearer alongside complementary headers (e.g. Ocp-Apim-Subscription-Key)', () => {
			// Complementary credentials such as APIM subscription keys or Azure Functions keys
			// are intentionally excluded from the suppression set — they sit in front of the
			// backend auth header, not in place of it.
			const metadata = makeMetadata(undefined);
			metadata.requestHeaders = { 'Ocp-Apim-Subscription-Key': 'apim-sub-key' };
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				metadata,
				'test-api-key',
				'https://api.example.com/v1/chat/completions');
			const headers = endpoint.getExtraHeaders();

			expect({
				subKey: headers['Ocp-Apim-Subscription-Key'],
				authorization: headers['Authorization'],
			}).toEqual({
				subKey: 'apim-sub-key',
				authorization: 'Bearer test-api-key',
			});
		});

		it('suppresses default Bearer when user supplies an `apikey` (no dash) header', () => {
			const metadata = makeMetadata(undefined);
			metadata.requestHeaders = { 'apikey': 'supabase-style-key' };
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				metadata,
				'test-api-key',
				'https://api.example.com/v1/chat/completions');
			const headers = endpoint.getExtraHeaders();

			expect({
				apikey: headers['apikey'],
				authorization: headers['Authorization'],
				dashedApiKey: headers['api-key'],
			}).toEqual({
				apikey: 'supabase-style-key',
				authorization: undefined,
				dashedApiKey: undefined,
			});
		});

		// Regression for https://github.com/microsoft/vscode/issues/312746
		// Custom endpoints pointed at DeepSeek / Kimi / Moonshot / Minimax must emit
		// `reasoning_content` on assistant tool-call messages so the next request after
		// a tool call is not rejected with HTTP 400.
		it('issue #312746: emits reasoning_content on assistant tool-call message for custom Chat Completions endpoints (DeepSeek/Kimi/Moonshot)', () => {
			const thinkingMetadata: IChatModelInformation = {
				...makeMetadata(undefined),
				capabilities: {
					...makeMetadata(undefined).capabilities,
					supports: {
						...makeMetadata(undefined).capabilities.supports,
						thinking: true,
					},
				},
			};
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				thinkingMetadata,
				'test-api-key',
				'https://api.deepseek.com/v1/chat/completions');

			const thinkingMessage: Raw.ChatMessage = {
				role: Raw.ChatRole.Assistant,
				content: [{
					type: Raw.ChatCompletionContentPartKind.Opaque,
					value: {
						type: 'thinking',
						thinking: {
							id: 'reasoning-custom-1',
							text: 'I should read the README before answering.'
						}
					}
				}]
			};
			const body = endpoint.createRequestBody({
				debugName: 'test',
				messages: [thinkingMessage],
				requestId: 'test-req-custom-deepseek',
				postOptions: {},
				finishedCb: undefined,
				location: undefined as any,
			});
			const messages = body.messages as any[];
			expect(messages[0].reasoning_content).toBe('I should read the README before answering.');
			expect(messages[0].reasoning).toBe('I should read the README before answering.');
			expect(messages[0].cot_summary).toBe('I should read the README before answering.');
		});
	});
});
