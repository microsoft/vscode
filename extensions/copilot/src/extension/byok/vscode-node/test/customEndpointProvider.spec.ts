/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CancellationTokenSource } from 'vscode';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../platform/chat/common/blockedExtensionService';
import { IChatModelInformation, ModelSupportedEndpoint } from '../../../../platform/endpoint/common/endpointProvider';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { TokenizerType } from '../../../../util/common/tokenizer';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { CUSTOM_ENDPOINT_DEFAULT_MAX_INPUT_TOKENS, CUSTOM_ENDPOINT_DEFAULT_MAX_OUTPUT_TOKENS, CustomEndpointBYOKModelProvider, CustomEndpointOAIEndpoint, hasExplicitApiPath, mergeModelsById, resolveCustomEndpointModelCapabilities, resolveCustomEndpointUrl } from '../customEndpointProvider';

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

describe('resolveCustomEndpointModelCapabilities', () => {
	it('applies defaults (tools ON, vision OFF) for a minimal OpenAI entry', () => {
		expect(resolveCustomEndpointModelCapabilities({ id: 'gpt-4o' })).toEqual({
			name: 'gpt-4o',
			toolCalling: true,
			vision: false,
			maxInputTokens: CUSTOM_ENDPOINT_DEFAULT_MAX_INPUT_TOKENS,
			maxOutputTokens: CUSTOM_ENDPOINT_DEFAULT_MAX_OUTPUT_TOKENS,
			supportsReasoningEffort: undefined,
		});
	});

	it('parses OpenRouter-style rich fields (tools, vision, reasoning, context window)', () => {
		const caps = resolveCustomEndpointModelCapabilities({
			id: 'anthropic/claude-sonnet-4',
			name: 'Claude Sonnet 4',
			supported_parameters: ['tools', 'reasoning'],
			architecture: { input_modalities: ['text', 'image'] },
			top_provider: { context_length: 200000 },
		});
		expect(caps).toEqual({
			name: 'Claude Sonnet 4',
			toolCalling: true,
			vision: true,
			maxInputTokens: 184000,
			maxOutputTokens: 16000,
			supportsReasoningEffort: ['low', 'medium', 'high'],
		});
	});

	it('trusts advertised supported_parameters: absence of `tools` means tool calling OFF', () => {
		const caps = resolveCustomEndpointModelCapabilities({ id: 'm', supported_parameters: ['temperature'] });
		expect(caps?.toolCalling).toBe(false);
	});

	it('derives a token split from a vLLM max_model_len', () => {
		const caps = resolveCustomEndpointModelCapabilities({ id: 'm', max_model_len: 32768 });
		expect(caps?.maxOutputTokens).toBe(8192);
		expect(caps?.maxInputTokens).toBe(24576);
	});

	it('honors an explicit max_completion_tokens cap', () => {
		const caps = resolveCustomEndpointModelCapabilities({ id: 'm', top_provider: { context_length: 100000, max_completion_tokens: 4096 } });
		expect(caps?.maxOutputTokens).toBe(4096);
		expect(caps?.maxInputTokens).toBe(95904);
	});

	it('keeps input tokens positive for a tiny context window', () => {
		const caps = resolveCustomEndpointModelCapabilities({ id: 'm', context_length: 1000 });
		expect(caps?.maxOutputTokens).toBe(250);
		expect(caps?.maxInputTokens).toBe(750);
	});

	it('falls back to id for the name, and reads display_name when present', () => {
		expect(resolveCustomEndpointModelCapabilities({ id: 'm' })?.name).toBe('m');
		expect(resolveCustomEndpointModelCapabilities({ id: 'm', display_name: 'My Model' })?.name).toBe('My Model');
	});

	it('returns undefined for entries without a usable id', () => {
		expect(resolveCustomEndpointModelCapabilities({})).toBeUndefined();
		expect(resolveCustomEndpointModelCapabilities({ id: 123 })).toBeUndefined();
		expect(resolveCustomEndpointModelCapabilities(null)).toBeUndefined();
		expect(resolveCustomEndpointModelCapabilities(undefined)).toBeUndefined();
	});
});

describe('mergeModelsById', () => {
	it('lets manual entries override discovered ones by id and appends manual-only entries', () => {
		const discovered = [{ id: 'a', src: 'd' }, { id: 'b', src: 'd' }];
		const manual = [{ id: 'b', src: 'm' }, { id: 'c', src: 'm' }];
		expect(mergeModelsById(discovered, manual)).toEqual([
			{ id: 'a', src: 'd' },
			{ id: 'b', src: 'm' },
			{ id: 'c', src: 'm' },
		]);
	});

	it('returns the discovered list unchanged when there are no manual entries', () => {
		expect(mergeModelsById([{ id: 'a' }], [])).toEqual([{ id: 'a' }]);
	});
});

describe('CustomEndpointBYOKModelProvider model discovery', () => {
	const token = new CancellationTokenSource().token;

	class TestableCustomEndpointProvider extends CustomEndpointBYOKModelProvider {
		public readonly warnings: string[] = [];
		protected override showDiscoveryWarning(message: string): void {
			this.warnings.push(message);
		}
	}

	function createLogServiceMock() {
		const logService: any = {
			_serviceBrand: undefined,
			trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), show: vi.fn(),
			createSubLogger: vi.fn(), withExtraTarget: vi.fn(),
		};
		logService.createSubLogger.mockReturnValue(logService);
		logService.withExtraTarget.mockReturnValue(logService);
		return logService;
	}

	function createProvider(fetch: (url: string, options: unknown) => Promise<unknown>): TestableCustomEndpointProvider {
		const storage = {
			getAPIKey: vi.fn().mockResolvedValue(undefined),
			storeAPIKey: vi.fn().mockResolvedValue(undefined),
			deleteAPIKey: vi.fn().mockResolvedValue(undefined),
		};
		return new TestableCustomEndpointProvider(
			storage as any,
			createLogServiceMock(),
			{ fetch } as any,
			{ createInstance: vi.fn().mockReturnValue({}) } as any,
			{ isConfigured: vi.fn().mockReturnValue(false), getConfig: vi.fn(), setConfig: vi.fn() } as any,
			{} as any,
		);
	}

	function jsonResponse(body: unknown) {
		return { json: async () => body };
	}

	it('discovers models from the configured /models endpoint with default capabilities', async () => {
		const fetch = vi.fn(async (url: string) => {
			expect(url).toBe('https://api.example.com/models');
			return jsonResponse({ data: [{ id: 'model-a' }, { id: 'model-b' }] });
		});
		const provider = createProvider(fetch);

		const models = await provider.provideLanguageModelChatInformation(
			{ silent: true, configuration: { url: 'https://api.example.com', apiKey: 'k' } },
			token,
		);

		expect(models.map(m => m.id)).toEqual(['model-a', 'model-b']);
		expect(models[0].capabilities).toMatchObject({ toolCalling: true, imageInput: false });
		expect(models[0].maxInputTokens).toBe(CUSTOM_ENDPOINT_DEFAULT_MAX_INPUT_TOKENS);
		expect(models[0].maxOutputTokens).toBe(CUSTOM_ENDPOINT_DEFAULT_MAX_OUTPUT_TOKENS);
	});

	it('lets a manual entry override a discovered model and appends manual-only models', async () => {
		const fetch = vi.fn(async () => jsonResponse({ data: [{ id: 'model-a' }, { id: 'model-b' }] }));
		const provider = createProvider(fetch);

		const models = await provider.provideLanguageModelChatInformation(
			{
				silent: true,
				configuration: {
					url: 'https://api.example.com',
					apiKey: 'k',
					models: [
						{ id: 'model-a', name: 'Overridden A', url: 'https://api.example.com/v1', toolCalling: true, vision: true, maxInputTokens: 1000, maxOutputTokens: 100 },
						{ id: 'model-c', name: 'Manual C', url: 'https://api.example.com/v1', toolCalling: false, vision: false, maxInputTokens: 2000, maxOutputTokens: 200 },
					],
				},
			},
			token,
		);

		const byId = new Map(models.map(m => [m.id, m]));
		expect([...byId.keys()].sort()).toEqual(['model-a', 'model-b', 'model-c']);
		// manual override wins for model-a
		expect(byId.get('model-a')!.name).toBe('Overridden A');
		expect(byId.get('model-a')!.capabilities).toMatchObject({ imageInput: true });
		expect(byId.get('model-a')!.maxInputTokens).toBe(1000);
		// discovered default remains for model-b
		expect(byId.get('model-b')!.capabilities).toMatchObject({ imageInput: false });
		// manual-only model-c is appended
		expect(byId.get('model-c')!.name).toBe('Manual C');
	});

	it('falls back to manual models and warns once when discovery fails (non-silent)', async () => {
		const fetch = vi.fn(async () => { throw new Error('boom'); });
		const provider = createProvider(fetch);
		const configuration = {
			url: 'https://api.example.com',
			apiKey: 'k',
			models: [
				{ id: 'fallback', name: 'Fallback', url: 'https://api.example.com/v1', toolCalling: true, vision: false, maxInputTokens: 1000, maxOutputTokens: 100 },
			],
		};

		const first = await provider.provideLanguageModelChatInformation({ silent: false, configuration }, token);
		const second = await provider.provideLanguageModelChatInformation({ silent: false, configuration }, token);

		expect(first.map(m => m.id)).toEqual(['fallback']);
		expect(second.map(m => m.id)).toEqual(['fallback']);
		// warned once despite two refreshes (dedup by URL), and the message names the endpoint
		expect(provider.warnings).toHaveLength(1);
		expect(provider.warnings[0]).toContain('https://api.example.com');
	});

	it('does not warn on a silent refresh failure', async () => {
		const fetch = vi.fn(async () => { throw new Error('boom'); });
		const provider = createProvider(fetch);

		const models = await provider.provideLanguageModelChatInformation(
			{ silent: true, configuration: { url: 'https://api.example.com', apiKey: 'k', models: [] } },
			token,
		);

		expect(models).toEqual([]);
		expect(provider.warnings).toEqual([]);
	});

	it('returns only manual models when no discovery url is set', async () => {
		const fetch = vi.fn(async () => { throw new Error('should not be called'); });
		const provider = createProvider(fetch);

		const models = await provider.provideLanguageModelChatInformation(
			{
				silent: true,
				configuration: {
					models: [
						{ id: 'manual', name: 'Manual', url: 'https://api.example.com/v1', toolCalling: true, vision: false, maxInputTokens: 1000, maxOutputTokens: 100 },
					],
				},
			},
			token,
		);

		expect(models.map(m => m.id)).toEqual(['manual']);
		expect(fetch).not.toHaveBeenCalled();
	});
});
