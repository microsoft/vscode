/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OpenAI, Raw } from '@vscode/prompt-tsx';
import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../platform/chat/common/blockedExtensionService';
import { IChatMLFetcher, type IFetchMLOptions } from '../../../../platform/chat/common/chatMLFetcher';
import { ChatLocation, type ChatResponse, type ChatResponses } from '../../../../platform/chat/common/commonTypes';
import { MockChatMLFetcher } from '../../../../platform/chat/test/common/mockChatMLFetcher';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IChatModelInformation, ModelSupportedEndpoint } from '../../../../platform/endpoint/common/endpointProvider';
import { CustomDataPartMimeTypes } from '../../../../platform/endpoint/common/endpointTypes';
import { ExtensionContributedChatEndpoint } from '../../../../platform/endpoint/vscode-node/extChatEndpoint';
import type { FetchOptions } from '../../../../platform/networking/common/fetcherService';
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
import { CUSTOM_ENDPOINT_DEFAULT_MAX_INPUT_TOKENS, CUSTOM_ENDPOINT_DEFAULT_MAX_OUTPUT_TOKENS, CustomEndpointBYOKModelProvider, type CustomEndpointModelConfig, type CustomEndpointModelProviderConfig, CustomEndpointOAIEndpoint, hasExplicitApiPath, mergeModelsById, resolveCustomEndpointModelCapabilities, resolveCustomEndpointModelsUrl, resolveCustomEndpointUrl } from '../customEndpointProvider';

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
		async function createConfiguredResponsesEndpoint(zeroDataRetentionEnabled?: boolean, statefulResponses?: boolean): Promise<IChatEndpoint> {
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
			if (statefulResponses !== undefined) {
				modelConfiguration.statefulResponses = statefulResponses;
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

		it('omits store but keeps previous_response_id after cloning a Custom Endpoint Responses endpoint when both flags are omitted', async () => {
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

		it('issue #331636: sends the full tool-call history when statefulResponses is false', async () => {
			const endpoint = await createConfiguredResponsesEndpoint(undefined, false);
			const body = endpoint.createRequestBody({
				debugName: 'test',
				messages: [
					{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'list the workspace' }] },
					{
						role: Raw.ChatRole.Assistant,
						content: [{ type: Raw.ChatCompletionContentPartKind.Opaque, value: { type: CustomDataPartMimeTypes.StatefulMarker, value: { modelId: customResponsesModelId, marker: customResponsesMarker } } }],
						toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'list_dir', arguments: '{}' } }],
					},
					{ role: Raw.ChatRole.Tool, toolCallId: 'call_1', content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'a.txt' }] },
				],
				requestId: 'test-custom-responses-tool-follow-up',
				postOptions: {},
				ignoreStatefulMarker: false,
				finishedCb: undefined,
				location: ChatLocation.Other,
			});

			expect({
				previousResponseId: body.previous_response_id,
				input: body.input?.map(item => ('type' in item ? item.type : undefined)),
			}).toEqual({
				previousResponseId: undefined,
				input: ['message', 'function_call', 'function_call_output'],
			});
		});

		it('enables store but not previous_response_id when zeroDataRetentionEnabled and statefulResponses are false', async () => {
			const endpoint = await createConfiguredResponsesEndpoint(false, false);
			const body = createResponsesBody(endpoint);

			expect({
				storePresent: 'store' in body,
				store: body.store,
				previousResponseId: body.previous_response_id,
			}).toEqual({
				storePresent: true,
				store: true,
				previousResponseId: undefined,
			});
		});

		it('enables store and previous_response_id when zeroDataRetentionEnabled is false and statefulResponses is omitted', async () => {
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
			const endpoint = await createConfiguredResponsesEndpoint(true, true);
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
		expect(caps?.maxOutputTokens).toBe(16000);
		expect(caps?.maxInputTokens).toBe(16768);
	});

	it('honors an explicit max_completion_tokens cap', () => {
		const caps = resolveCustomEndpointModelCapabilities({ id: 'm', top_provider: { context_length: 100000, max_completion_tokens: 4096 } });
		expect(caps?.maxOutputTokens).toBe(4096);
		expect(caps?.maxInputTokens).toBe(95904);
	});

	it('prefers the model-level context_length over top_provider.context_length', () => {
		const caps = resolveCustomEndpointModelCapabilities({ id: 'm', context_length: 200000, top_provider: { context_length: 32000 } });
		expect(caps?.maxOutputTokens).toBe(16000);
		expect(caps?.maxInputTokens).toBe(184000);
	});

	it('keeps input tokens positive for a tiny context window', () => {
		const caps = resolveCustomEndpointModelCapabilities({ id: 'm', context_length: 1000 });
		expect(caps?.maxOutputTokens).toBe(500);
		expect(caps?.maxInputTokens).toBe(500);
	});

	it('falls back to id for the name, and reads display_name when present', () => {
		expect(resolveCustomEndpointModelCapabilities({ id: 'm' })?.name).toBe('m');
		expect(resolveCustomEndpointModelCapabilities({ id: 'm', display_name: 'My Model' })?.name).toBe('My Model');
		expect(resolveCustomEndpointModelCapabilities({ id: 'm', name: ' ', display_name: '' })?.name).toBe('m');
	});

	it('returns undefined for entries without a usable id', () => {
		expect(resolveCustomEndpointModelCapabilities({})).toBeUndefined();
		expect(resolveCustomEndpointModelCapabilities({ id: 123 })).toBeUndefined();
		expect(resolveCustomEndpointModelCapabilities(null)).toBeUndefined();
		expect(resolveCustomEndpointModelCapabilities(undefined)).toBeUndefined();
	});
});

describe('resolveCustomEndpointModelsUrl', () => {
	it('appends /v1 to an origin, matching how request URLs are resolved', () => {
		expect(resolveCustomEndpointModelsUrl('https://api.openai.com')).toBe('https://api.openai.com/v1/models');
		expect(resolveCustomEndpointUrl('m', 'https://api.openai.com')).toBe('https://api.openai.com/v1/chat/completions');
	});

	it('keeps an existing version segment and drops a trailing slash', () => {
		expect(resolveCustomEndpointModelsUrl('https://openrouter.ai/api/v1')).toBe('https://openrouter.ai/api/v1/models');
		expect(resolveCustomEndpointModelsUrl('https://api.example.com/v1/')).toBe('https://api.example.com/v1/models');
	});

	it('lists models next to an explicit API path without inserting a version segment', () => {
		expect(resolveCustomEndpointModelsUrl('https://api.example.com/v1/chat/completions')).toBe('https://api.example.com/v1/models');
		expect(resolveCustomEndpointModelsUrl('https://api.example.com/v1/responses')).toBe('https://api.example.com/v1/models');
		expect(resolveCustomEndpointModelsUrl('https://api.example.com/v1/messages')).toBe('https://api.example.com/v1/models');
		expect(resolveCustomEndpointModelsUrl('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')).toBe('https://generativelanguage.googleapis.com/v1beta/openai/models');
		expect(resolveCustomEndpointModelsUrl('https://api.deepseek.com/chat/completions')).toBe('https://api.deepseek.com/models');
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
	const token = new vscode.CancellationTokenSource().token;

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

	function createProvider(fetch: (url: string, options: FetchOptions) => Promise<unknown>, createInstance = vi.fn().mockReturnValue({})): TestableCustomEndpointProvider {
		const storage = {
			getAPIKey: vi.fn().mockResolvedValue(undefined),
			storeAPIKey: vi.fn().mockResolvedValue(undefined),
			deleteAPIKey: vi.fn().mockResolvedValue(undefined),
		};
		return new TestableCustomEndpointProvider(
			storage as any,
			createLogServiceMock(),
			{ fetch } as any,
			{ createInstance } as any,
			{ isConfigured: vi.fn().mockReturnValue(false), getConfig: vi.fn(), setConfig: vi.fn() } as any,
			{} as any,
		);
	}

	function jsonResponse(body: unknown) {
		return { json: async () => body };
	}

	it('discovers models from the configured /models endpoint with default capabilities', async () => {
		const fetch = vi.fn(async (_url: string, _options: unknown) => jsonResponse({ data: [{ id: 'model-a' }, { id: 'model-b' }] }));
		const provider = createProvider(fetch);

		const models = await provider.provideLanguageModelChatInformation(
			{ silent: true, configuration: { url: 'https://api.example.com', apiKey: 'k' } },
			token,
		);

		expect(fetch).toHaveBeenCalledWith('https://api.example.com/v1/models', expect.objectContaining({ headers: { 'Content-Type': 'application/json', Authorization: 'Bearer k' } }));
		expect(models.map(m => m.id)).toEqual(['model-a', 'model-b']);
		expect(models[0].capabilities).toMatchObject({ toolCalling: true, imageInput: false });
		expect(models[0].maxInputTokens).toBe(CUSTOM_ENDPOINT_DEFAULT_MAX_INPUT_TOKENS);
		expect(models[0].maxOutputTokens).toBe(CUSTOM_ENDPOINT_DEFAULT_MAX_OUTPUT_TOKENS);
	});

	it('discovers on a silent refresh without an API key and omits the Authorization header', async () => {
		const fetch = vi.fn(async (_url: string, _options: unknown) => jsonResponse({ data: [{ id: 'local-model' }] }));
		const provider = createProvider(fetch);

		const models = await provider.provideLanguageModelChatInformation(
			{ silent: true, configuration: { url: 'http://localhost:8000/v1' } },
			token,
		);

		expect(models.map(m => m.id)).toEqual(['local-model']);
		expect(fetch).toHaveBeenCalledWith('http://localhost:8000/v1/models', expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }));
	});

	it('resolves capabilities per endpoint and per refresh instead of reusing them by model id', async () => {
		let lenA = 32768;
		const fetch = vi.fn(async (url: string) => jsonResponse({
			data: [{ id: 'shared', max_model_len: url.startsWith('https://a.example.com') ? lenA : 8192 }]
		}));
		const provider = createProvider(fetch);
		const discover = async (url: string) => (await provider.provideLanguageModelChatInformation({ silent: true, configuration: { url, apiKey: 'k' } }, token))[0];

		expect((await discover('https://a.example.com')).maxInputTokens).toBe(16768);
		expect((await discover('https://b.example.com')).maxInputTokens).toBe(4096);

		lenA = 65536;
		expect((await discover('https://a.example.com')).maxInputTokens).toBe(49536);
	});

	it('carries discovered reasoning effort levels into the endpoint metadata', async () => {
		const fetch = vi.fn(async () => jsonResponse({ data: [{ id: 'thinker', supported_parameters: ['tools', 'reasoning_effort'] }] }));
		const createInstance = vi.fn().mockReturnValue({});
		const provider = createProvider(fetch, createInstance);

		const [model] = await provider.provideLanguageModelChatInformation(
			{ silent: true, configuration: { url: 'https://api.example.com/v1', apiKey: 'k' } },
			token,
		);

		expect(model.configurationSchema?.properties?.reasoningEffort).toBeDefined();
		const modelInfo: IChatModelInformation = createInstance.mock.calls.find(([ctor]) => ctor === CustomEndpointOAIEndpoint)![1];
		expect(modelInfo.capabilities.supports.reasoning_effort).toEqual(['low', 'medium', 'high']);
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

	it('falls back to manual models and warns once when discovery fails, even on silent refreshes', async () => {
		const fetch = vi.fn(async () => { throw new Error('boom'); });
		const provider = createProvider(fetch);
		const configuration = {
			url: 'https://api.example.com',
			apiKey: 'k',
			models: [
				{ id: 'fallback', name: 'Fallback', url: 'https://api.example.com/v1', toolCalling: true, vision: false, maxInputTokens: 1000, maxOutputTokens: 100 },
			],
		};

		const first = await provider.provideLanguageModelChatInformation({ silent: true, configuration }, token);
		const second = await provider.provideLanguageModelChatInformation({ silent: true, configuration }, token);

		expect(first.map(m => m.id)).toEqual(['fallback']);
		expect(second.map(m => m.id)).toEqual(['fallback']);
		// warned once despite two refreshes (dedup by URL), and the message names the endpoint
		expect(provider.warnings).toHaveLength(1);
		expect(provider.warnings[0]).toContain('https://api.example.com');
	});

	it('warns again when discovery fails after having recovered', async () => {
		let fail = true;
		const fetch = vi.fn(async () => {
			if (fail) {
				throw new Error('boom');
			}
			return jsonResponse({ data: [{ id: 'model-a' }] });
		});
		const provider = createProvider(fetch);
		const configuration = {
			url: 'https://api.example.com',
			apiKey: 'k',
			models: [
				{ id: 'fallback', name: 'Fallback', url: 'https://api.example.com/v1', toolCalling: true, vision: false, maxInputTokens: 1000, maxOutputTokens: 100 },
			],
		};
		const refresh = () => provider.provideLanguageModelChatInformation({ silent: true, configuration }, token);

		await refresh();
		fail = false;
		await refresh();
		fail = true;
		await refresh();

		expect(provider.warnings).toHaveLength(2);
	});

	it('throws instead of warning when discovery fails without manual models, so the group shows the error', async () => {
		const fetch = vi.fn(async () => { throw new Error('boom'); });
		const provider = createProvider(fetch);

		await expect(provider.provideLanguageModelChatInformation(
			{ silent: true, configuration: { url: 'https://api.example.com', apiKey: 'k', models: [] } },
			token,
		)).rejects.toThrow('Custom endpoint model discovery from https://api.example.com failed: boom');
		expect(provider.warnings).toEqual([]);
	});

	it('gives up on a /models endpoint that never responds', async () => {
		vi.useFakeTimers();
		try {
			const fetch = vi.fn((_url: string, options: FetchOptions) => new Promise((_resolve, reject) => {
				options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
			}));
			const provider = createProvider(fetch);

			const result = expect(provider.provideLanguageModelChatInformation(
				{ silent: true, configuration: { url: 'https://api.example.com', apiKey: 'k' } },
				token,
			)).rejects.toThrow('Timed out after 10 seconds');
			await vi.advanceTimersByTimeAsync(10_000);
			await result;
		} finally {
			vi.useRealTimers();
		}
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
