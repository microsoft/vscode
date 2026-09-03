/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OpenAI, Raw } from '@vscode/prompt-tsx';
import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../platform/chat/common/blockedExtensionService';
import { IChatMLFetcher, type IFetchMLOptions } from '../../../../platform/chat/common/chatMLFetcher';
import { ChatLocation, type ChatResponse, type ChatResponses } from '../../../../platform/chat/common/commonTypes';
import { MockChatMLFetcher } from '../../../../platform/chat/test/common/mockChatMLFetcher';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IChatModelInformation, ModelSupportedEndpoint } from '../../../../platform/endpoint/common/endpointProvider';
import { CustomDataPartMimeTypes } from '../../../../platform/endpoint/common/endpointTypes';
import { ExtensionContributedChatEndpoint } from '../../../../platform/endpoint/vscode-node/extChatEndpoint';
import type { IChatEndpoint, IEndpointBody } from '../../../../platform/networking/common/networking';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { TokenizerType } from '../../../../util/common/tokenizer';
import { Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import type { OpenAICompatibleLanguageModelChatInformation } from '../abstractLanguageModelChatProvider';
import type { IBYOKStorageService } from '../byokStorageService';
import { CustomEndpointBYOKModelProvider, type CustomEndpointModelConfig, type CustomEndpointModelProviderConfig, CustomEndpointOAIEndpoint, hasExplicitApiPath, resolveCustomEndpointUrl } from '../customEndpointProvider';

const customResponsesModelId = 'custom-responses-model';
const customResponsesMarker = 'resp_custom_previous';

class TestCustomEndpointBYOKModelProvider extends CustomEndpointBYOKModelProvider {
	public createEndpoint(model: OpenAICompatibleLanguageModelChatInformation<CustomEndpointModelProviderConfig>): Promise<IChatEndpoint> {
		return this.createOpenAIEndPoint(model);
	}
}

class CapturingChatMLFetcher implements IChatMLFetcher {
	declare readonly _serviceBrand: undefined;
	readonly onDidMakeChatMLRequest = Event.None;
	readonly requests: IFetchMLOptions[] = [];

	private readonly delegate = new MockChatMLFetcher();

	fetchOne(options: IFetchMLOptions): Promise<ChatResponse> {
		this.requests.push(options);
		return this.delegate.fetchOne();
	}

	fetchMany(): Promise<ChatResponses> {
		return this.delegate.fetchMany();
	}
}

function createStorageService(): IBYOKStorageService {
	return {
		getAPIKey: async () => undefined,
		storeAPIKey: async () => undefined,
		deleteAPIKey: async () => undefined,
		getStoredModelConfigs: async () => ({}),
		saveModelConfig: async () => undefined,
		removeModelConfig: async () => undefined,
	};
}

function createResponsesBody(endpoint: IChatEndpoint): IEndpointBody {
	return endpoint.createRequestBody({
		debugName: 'test',
		messages: [
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'before marker' }]
			},
			{
				role: Raw.ChatRole.Assistant,
				content: [{
					type: Raw.ChatCompletionContentPartKind.Opaque,
					value: {
						type: CustomDataPartMimeTypes.StatefulMarker,
						value: {
							modelId: customResponsesModelId,
							marker: customResponsesMarker,
						}
					}
				}]
			},
			{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'after marker' }]
			}
		],
		requestId: 'test-custom-responses-store',
		postOptions: {},
		ignoreStatefulMarker: false,
		finishedCb: undefined,
		location: ChatLocation.Other,
	});
}

describe('CustomEndpointBYOKModelProvider', () => {
	const disposables = new DisposableStore();
	let accessor: ITestingServicesAccessor;
	let instaService: IInstantiationService;
	let chatMLFetcher: CapturingChatMLFetcher;

	beforeEach(() => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		testingServiceCollection.define(IBlockedExtensionService, new SyncDescriptor(BlockedExtensionService));
		chatMLFetcher = new CapturingChatMLFetcher();
		testingServiceCollection.set(IChatMLFetcher, chatMLFetcher);
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
		async function createConfiguredResponsesEndpoint(zeroDataRetentionEnabled?: boolean): Promise<IChatEndpoint> {
			const provider = instaService.createInstance(TestCustomEndpointBYOKModelProvider, createStorageService());
			const tokenSource = disposables.add(new vscode.CancellationTokenSource());
			const modelConfiguration: CustomEndpointModelConfig = {
				id: customResponsesModelId,
				name: 'Custom Responses Model',
				url: 'https://api.example.com',
				apiType: 'responses',
				maxInputTokens: 128000,
				maxOutputTokens: 16000,
				toolCalling: true,
				vision: false,
			};
			if (zeroDataRetentionEnabled !== undefined) {
				modelConfiguration.zeroDataRetentionEnabled = zeroDataRetentionEnabled;
			}
			const [model] = await provider.provideLanguageModelChatInformation({
				silent: true,
				configuration: {
					apiKey: 'test-api-key',
					models: [modelConfiguration],
				}
			}, tokenSource.token);
			return provider.createEndpoint(model);
		}

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

		it('omits store after cloning a Custom Endpoint Responses endpoint when zeroDataRetentionEnabled is omitted', async () => {
			const endpoint = (await createConfiguredResponsesEndpoint()).cloneWithTokenOverride(64000);
			const body = createResponsesBody(endpoint);

			expect({
				storePresent: 'store' in body,
				store: body.store,
				previousResponseId: body.previous_response_id,
			}).toEqual({
				storePresent: false,
				store: undefined,
				previousResponseId: customResponsesMarker,
			});
		});

		it('enables store and previous_response_id for Custom Endpoint Responses requests when zeroDataRetentionEnabled is false', async () => {
			const endpoint = await createConfiguredResponsesEndpoint(false);
			const body = createResponsesBody(endpoint);

			expect({
				storePresent: 'store' in body,
				store: body.store,
				previousResponseId: body.previous_response_id,
			}).toEqual({
				storePresent: true,
				store: true,
				previousResponseId: customResponsesMarker,
			});
		});

		it('disables store and previous_response_id for Custom Endpoint ZDR Responses requests', async () => {
			const endpoint = await createConfiguredResponsesEndpoint(true);
			const body = createResponsesBody(endpoint);

			expect({
				storePresent: 'store' in body,
				store: body.store,
				previousResponseId: body.previous_response_id,
			}).toEqual({
				storePresent: true,
				store: false,
				previousResponseId: undefined,
			});
		});

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

		it('issue #330712: forwards configured Messages API thinking mode to the request body', async () => {
			const provider = instaService.createInstance(TestCustomEndpointBYOKModelProvider, createStorageService());
			const tokenSource = disposables.add(new vscode.CancellationTokenSource());
			const baseModel = {
				name: 'Custom Claude',
				url: 'https://api.example.com',
				apiType: 'messages' as const,
				maxInputTokens: 128000,
				maxOutputTokens: 64000,
				toolCalling: true,
				vision: false,
				thinking: true,
			};
			const variants = [
				{
					id: 'adaptive',
					adaptiveThinking: true,
				},
				{
					id: 'budget',
					minThinkingBudget: 1024,
					maxThinkingBudget: 32000,
				},
				{
					id: 'unspecified-mode',
				},
			].map(model => ({ ...baseModel, ...model }));

			const results = await Promise.all(variants.map(async configuredModel => {
				const [model] = await provider.provideLanguageModelChatInformation({
					silent: true,
					configuration: {
						apiKey: 'test-api-key',
						models: [configuredModel],
					}
				}, tokenSource.token);
				const endpoint = await provider.createEndpoint(model);
				const body = endpoint.createRequestBody({
					debugName: 'test',
					messages: [],
					requestId: `test-${configuredModel.id}`,
					postOptions: { max_tokens: 64000 },
					modelCapabilities: { enableThinking: true },
					finishedCb: undefined,
					location: ChatLocation.Other,
				});
				return {
					id: configuredModel.id,
					apiType: endpoint.apiType,
					supportsAdaptiveThinking: endpoint.supportsAdaptiveThinking,
					minThinkingBudget: endpoint.minThinkingBudget,
					maxThinkingBudget: endpoint.maxThinkingBudget,
					thinking: body.thinking,
				};
			}));

			expect(results).toEqual([
				{
					id: 'adaptive',
					apiType: 'messages',
					supportsAdaptiveThinking: true,
					minThinkingBudget: undefined,
					maxThinkingBudget: undefined,
					thinking: { type: 'adaptive', display: 'summarized' },
				},
				{
					id: 'budget',
					apiType: 'messages',
					supportsAdaptiveThinking: false,
					minThinkingBudget: 1024,
					maxThinkingBudget: 32000,
					thinking: { type: 'enabled', budget_tokens: 16000 },
				},
				{
					id: 'unspecified-mode',
					apiType: 'messages',
					supportsAdaptiveThinking: false,
					minThinkingBudget: undefined,
					maxThinkingBudget: undefined,
					thinking: undefined,
				},
			]);
		});

		it('issue #330712: exposes thinking mode metadata for every custom endpoint API type', async () => {
			const provider = instaService.createInstance(TestCustomEndpointBYOKModelProvider, createStorageService());
			const tokenSource = disposables.add(new vscode.CancellationTokenSource());
			const results = [];

			for (const apiType of ['chat-completions', 'responses'] as const) {
				const [model] = await provider.provideLanguageModelChatInformation({
					silent: true,
					configuration: {
						apiKey: 'test-api-key',
						models: [{
							id: apiType,
							name: 'Custom Model',
							url: 'https://api.example.com',
							apiType,
							maxInputTokens: 128000,
							maxOutputTokens: 64000,
							toolCalling: true,
							vision: false,
							adaptiveThinking: true,
							minThinkingBudget: 1024,
							maxThinkingBudget: 32000,
						}],
					}
				}, tokenSource.token);

				const endpoint = await provider.createEndpoint(model);
				results.push({
					apiType: endpoint.apiType,
					supportsAdaptiveThinking: endpoint.supportsAdaptiveThinking,
					minThinkingBudget: endpoint.minThinkingBudget,
					maxThinkingBudget: endpoint.maxThinkingBudget,
				});
			}

			expect(results).toEqual([
				{
					apiType: 'chatCompletions',
					supportsAdaptiveThinking: true,
					minThinkingBudget: 1024,
					maxThinkingBudget: 32000,
				},
				{
					apiType: 'responses',
					supportsAdaptiveThinking: true,
					minThinkingBudget: 1024,
					maxThinkingBudget: 32000,
				},
			]);
		});

		it('issue #330712: reconstructs the request thinking capability after language model IPC', async () => {
			const provider = instaService.createInstance(TestCustomEndpointBYOKModelProvider, createStorageService());
			const tokenSource = disposables.add(new vscode.CancellationTokenSource());
			const [model] = await provider.provideLanguageModelChatInformation({
				silent: true,
				configuration: {
					apiKey: 'test-api-key',
					models: [{
						id: 'adaptive',
						name: 'Custom Claude',
						url: 'https://api.example.com',
						apiType: 'messages',
						maxInputTokens: 128000,
						maxOutputTokens: 64000,
						toolCalling: true,
						vision: false,
						thinking: true,
						adaptiveThinking: true,
					}],
				}
			}, tokenSource.token);

			for (const enableThinking of [true, false]) {
				await provider.provideLanguageModelChatResponse(
					model,
					[new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, 'hello')],
					{
						requestInitiator: 'core',
						tools: [],
						toolMode: vscode.LanguageModelChatToolMode.Auto,
						modelOptions: { _enableThinking: enableThinking },
					},
					{ report: () => undefined },
					tokenSource.token,
				);
			}

			expect(chatMLFetcher.requests.map(request => request.modelCapabilities?.enableThinking)).toEqual([true, false]);
		});

		it('issue #332031: preserves the conversation ID through a BYOK Responses request', async () => {
			const provider = instaService.createInstance(TestCustomEndpointBYOKModelProvider, createStorageService());
			const tokenSource = disposables.add(new vscode.CancellationTokenSource());
			const [model] = await provider.provideLanguageModelChatInformation({
				silent: true,
				configuration: {
					apiKey: 'test-api-key',
					models: [{
						id: customResponsesModelId,
						name: 'Custom Responses Model',
						url: 'https://api.example.com',
						apiType: 'responses',
						maxInputTokens: 128000,
						maxOutputTokens: 16000,
						toolCalling: true,
						vision: false,
					}],
				}
			}, tokenSource.token);
			const languageModel = {
				...model,
				sendRequest: async (
					messages: readonly (vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2)[],
					options: vscode.LanguageModelChatRequestOptions,
					token: vscode.CancellationToken,
				) => {
					const responseParts: vscode.LanguageModelResponsePart2[] = [];
					await provider.provideLanguageModelChatResponse(model, [...messages], {
						requestInitiator: 'core',
						tools: options.tools ?? [],
						toolMode: options.toolMode ?? vscode.LanguageModelChatToolMode.Auto,
						modelOptions: options.modelOptions,
					}, { report: part => responseParts.push(part) }, token);
					return {
						stream: (async function* () {
							yield* responseParts;
						})()
					};
				}
			} as unknown as vscode.LanguageModelChat;
			const extensionEndpoint = instaService.createInstance(ExtensionContributedChatEndpoint, languageModel);
			const configurationService = accessor.get(IConfigurationService);
			const conversationId = 'conversation-332031';
			const messages: Raw.ChatMessage[] = [{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'hello' }]
			}];

			await configurationService.setConfig(ConfigKey.ResponsesApiPromptCacheKeyEnabled, true);
			const directEndpoint = await provider.createEndpoint(model);
			const directPromptCacheKey = directEndpoint.createRequestBody({
				debugName: 'test-direct',
				messages,
				conversationId,
				requestId: 'test-request-direct',
				postOptions: {},
				finishedCb: undefined,
				location: ChatLocation.Agent,
			}).prompt_cache_key;

			const capturePromptCacheKey = async (enabled: boolean, requestConversationId: string | undefined) => {
				await configurationService.setConfig(ConfigKey.ResponsesApiPromptCacheKeyEnabled, enabled);
				const requestIndex = chatMLFetcher.requests.length;
				await extensionEndpoint.makeChatRequest2({
					debugName: 'test',
					messages,
					conversationId: requestConversationId,
					finishedCb: undefined,
					location: ChatLocation.Agent,
					requestOptions: {},
				}, tokenSource.token);
				const request = chatMLFetcher.requests[requestIndex];
				if (!request) {
					throw new Error('Expected the BYOK endpoint to receive a request');
				}
				return request.endpoint.createRequestBody({
					...request,
					requestId: `test-request-${requestIndex}`,
					postOptions: request.requestOptions,
				}).prompt_cache_key;
			};

			expect({
				direct: directPromptCacheKey,
				bridgedEnabled: await capturePromptCacheKey(true, conversationId),
				disabled: await capturePromptCacheKey(false, conversationId),
				missingConversationId: await capturePromptCacheKey(true, undefined),
			}).toEqual({
				direct: `${conversationId}:${model.family}`,
				bridgedEnabled: `${conversationId}:${model.family}`,
				disabled: undefined,
				missingConversationId: undefined,
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

		it.each([
			'https://my-resource.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2025-01-01-preview',
			'https://my-resource.openai.azure.us/openai/responses?api-version=2025-04-01-preview',
			'https://my-resource.openai.azure.us/openai/deployments/gpt-4/chat/completions?api-version=2025-01-01-preview',
			'https://my-resource.openai.azure.cn/openai/responses?api-version=2025-04-01-preview',
			'https://my-resource.openai.azure.secret/openai/responses?api-version=2025-04-01-preview',
			'https://my-resource.cognitiveservices.azure.us/openai/responses?api-version=2025-04-01-preview',
			'https://my-resource.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview',
			'https://my-resource.services.ai.azure.com/openai/v1/responses',
		])('sends api-key (not Bearer) for Azure endpoint URL %s', url => {
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				makeMetadata(undefined),
				'test-api-key',
				url);
			const headers = endpoint.getExtraHeaders();

			expect({
				authApiKey: headers['api-key'],
				authorization: headers['Authorization'],
			}).toEqual({
				authApiKey: 'test-api-key',
				authorization: undefined,
			});
		});

		it('does not send api-key for hostnames that only contain an Azure suffix prefix', () => {
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				makeMetadata(undefined),
				'test-api-key',
				'https://my-resource.openai.azure.com.evil.com/openai/responses?api-version=2025-04-01-preview');
			const headers = endpoint.getExtraHeaders();

			expect({
				authApiKey: headers['api-key'],
				authorization: headers['Authorization'],
			}).toEqual({
				authApiKey: undefined,
				authorization: 'Bearer test-api-key',
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

		it('issue #327794: normalizes switched-model tool call IDs for Kimi custom Chat Completions endpoints', () => {
			const metadata = makeMetadata(undefined);
			metadata.id = 'kimi-k2.7-code';
			metadata.capabilities.family = 'kimi-k2.7-code';
			const endpoint = instaService.createInstance(CustomEndpointOAIEndpoint,
				metadata,
				'test-api-key',
				'https://api.example.com/v1/chat/completions');
			const originalToolCallId = 'chatcmpl-tool-948068bb6570be33';

			const body = endpoint.createRequestBody({
				debugName: 'test',
				messages: [
					{
						role: Raw.ChatRole.Assistant,
						content: [],
						toolCalls: [{
							id: originalToolCallId,
							type: 'function',
							function: { name: 'read_file', arguments: '{}' }
						}]
					},
					{
						role: Raw.ChatRole.Tool,
						content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'result' }],
						toolCallId: originalToolCallId
					}
				],
				requestId: 'test-req-kimi-model-switch',
				postOptions: { temperature: 0, top_p: 1 },
				finishedCb: undefined,
				location: ChatLocation.Other,
			});

			expect(body).toMatchObject({
				messages: [
					{
						role: OpenAI.ChatRole.Assistant,
						tool_calls: [{ id: 'functions.read_file:0' }]
					},
					{
						role: OpenAI.ChatRole.Tool,
						tool_call_id: 'functions.read_file:0'
					}
				],
				temperature: 0,
				top_p: 1
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
