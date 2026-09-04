/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../platform/chat/common/blockedExtensionService';
import { AzureAuthMode } from '../../../../platform/configuration/common/configurationService';
import { IChatModelInformation, ModelSupportedEndpoint } from '../../../../platform/endpoint/common/endpointProvider';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { CopilotLanguageModelWrapper } from '../../../conversation/vscode-node/languageModelAccess';
import { AzureBYOKModelProvider, applyAzureSupportedEndpoints, resolveAzureEntraAuthProvider, resolveAzureEntraScopes, resolveAzureModelCapabilities, resolveAzureUrl } from '../azureProvider';
import { IBYOKStorageService } from '../byokStorageService';
import { responsesSupportedEndpointsForUrl } from '../customOAIProvider';

describe('AzureBYOKModelProvider', () => {
	const disposables = new DisposableStore();
	let accessor: ITestingServicesAccessor;
	let instantiationService: IInstantiationService;

	beforeEach(() => {
		const testingServiceCollection = createExtensionUnitTestingServices();

		// Add IBlockedExtensionService which is required by CopilotLanguageModelWrapper
		testingServiceCollection.define(IBlockedExtensionService, new SyncDescriptor(BlockedExtensionService));
		accessor = disposables.add(testingServiceCollection.createTestingAccessor());
		instantiationService = accessor.get(IInstantiationService);
	});

	afterEach(() => {
		disposables.clear();
		vi.restoreAllMocks();
	});

	describe('resolveAzureUrl', () => {
		it('should handle Azure AI Foundry (models.ai.azure.com) URLs', () => {
			const url = 'https://my-endpoint.models.ai.azure.com';
			const result = resolveAzureUrl('gpt-4', url);
			expect(result).toBe('https://my-endpoint.models.ai.azure.com/v1/chat/completions');
		});

		it('should handle Azure ML (inference.ml.azure.com) URLs', () => {
			const url = 'https://my-endpoint.inference.ml.azure.com';
			const result = resolveAzureUrl('gpt-4', url);
			expect(result).toBe('https://my-endpoint.inference.ml.azure.com/v1/chat/completions');
		});

		it('should handle Azure OpenAI (openai.azure.com) URLs with deployment name', () => {
			const url = 'https://my-resource.openai.azure.com';
			const result = resolveAzureUrl('gpt-4-deployment', url);
			expect(result).toBe('https://my-resource.openai.azure.com/openai/deployments/gpt-4-deployment/chat/completions?api-version=2025-01-01-preview');
		});

		it('should return URL unchanged if it already has explicit API path', () => {
			const url = 'https://my-endpoint.example.com/v1/chat/completions';
			const result = resolveAzureUrl('gpt-4', url);
			expect(result).toBe(url);
		});

		it('should remove trailing slash before processing', () => {
			const url = 'https://my-endpoint.models.ai.azure.com/';
			const result = resolveAzureUrl('gpt-4', url);
			expect(result).toBe('https://my-endpoint.models.ai.azure.com/v1/chat/completions');
		});

		it('should remove /v1 suffix before processing', () => {
			const url = 'https://my-endpoint.models.ai.azure.com/v1';
			const result = resolveAzureUrl('gpt-4', url);
			expect(result).toBe('https://my-endpoint.models.ai.azure.com/v1/chat/completions');
		});

		it('should preserve an explicit APIM /responses URL behind a vanity domain', () => {
			const url = 'https://my-apim.azure-api.net/openai/responses?api-version=2025-04-01-preview';
			const result = resolveAzureUrl('gpt-4', url);
			expect(result).toBe(url);
		});

		it('should throw error for unrecognized Azure URL', () => {
			const url = 'https://unknown.example.com';
			expect(() => resolveAzureUrl('gpt-4', url)).toThrow('Unrecognized Azure deployment URL');
		});
	});

	describe('resolveAzureEntraAuthProvider', () => {
		it('should use the commercial Microsoft auth provider by default', () => {
			expect(resolveAzureEntraAuthProvider(undefined)).toBe(AzureAuthMode.MICROSOFT_AUTH_PROVIDER);
		});

		it('should use the configured Microsoft auth provider', () => {
			expect(resolveAzureEntraAuthProvider({ entraAuthProvider: AzureAuthMode.MICROSOFT_SOVEREIGN_CLOUD_AUTH_PROVIDER })).toBe(AzureAuthMode.MICROSOFT_SOVEREIGN_CLOUD_AUTH_PROVIDER);
		});

		it('should fall back for unknown Microsoft auth providers', () => {
			expect(resolveAzureEntraAuthProvider({ entraAuthProvider: 'unknown-provider' } as unknown as Parameters<typeof resolveAzureEntraAuthProvider>[0])).toBe(AzureAuthMode.MICROSOFT_AUTH_PROVIDER);
		});
	});

	describe('resolveAzureEntraScopes', () => {
		it('should use the commercial Cognitive Services scope by default', () => {
			expect(resolveAzureEntraScopes(undefined)).toEqual([AzureAuthMode.COGNITIVE_SERVICES_SCOPE]);
		});

		it('should use configured Entra scopes', () => {
			expect(resolveAzureEntraScopes({ entraScopes: ['https://cognitiveservices.azure.us/.default'] })).toEqual(['https://cognitiveservices.azure.us/.default']);
		});

		it('should filter invalid Entra scopes', () => {
			expect(resolveAzureEntraScopes({ entraScopes: [123, '', '  https://ai.azure.com/.default  ', null] })).toEqual(['https://ai.azure.com/.default']);
		});

		it('should fall back when no configured Entra scopes are valid', () => {
			expect(resolveAzureEntraScopes({ entraScopes: [123, '', null] })).toEqual([AzureAuthMode.COGNITIVE_SERVICES_SCOPE]);
		});
	});

	it('uses configured Entra authentication and creates a Responses endpoint', async () => {
		const authenticationSession = {
			accessToken: 'test-access-token',
			account: { id: 'test-account', label: 'Test Account' },
			id: 'test-session',
			scopes: ['https://cognitiveservices.azure.us/.default'],
		} satisfies vscode.AuthenticationSession;
		const getSession = vi.spyOn(vscode.authentication, 'getSession').mockResolvedValue(authenticationSession);
		const provideResponse = vi.spyOn(CopilotLanguageModelWrapper.prototype, 'provideLanguageModelResponse').mockResolvedValue();
		const storageService: IBYOKStorageService = {
			getAPIKey: async () => undefined,
			storeAPIKey: async () => { },
			deleteAPIKey: async () => { },
			getStoredModelConfigs: async () => ({}),
			saveModelConfig: async () => { },
			removeModelConfig: async () => { },
		};
		const provider = instantiationService.createInstance(AzureBYOKModelProvider, storageService);
		const model = {
			id: 'gpt-5.1',
			name: 'GPT 5.1',
			version: '1.0.0',
			family: 'gpt-5.1',
			url: 'https://my-resource.openai.azure.com/openai/responses?api-version=2025-04-01-preview',
			maxInputTokens: 272000,
			maxOutputTokens: 128000,
			capabilities: { toolCalling: true, imageInput: true },
			configuration: {
				entraAuthProvider: AzureAuthMode.MICROSOFT_SOVEREIGN_CLOUD_AUTH_PROVIDER,
				entraScopes: ['https://cognitiveservices.azure.us/.default'],
				models: [{
					id: 'gpt-5.1',
					name: 'GPT 5.1',
					url: 'https://my-resource.openai.azure.com/openai/responses?api-version=2025-04-01-preview',
					maxInputTokens: 272000,
					maxOutputTokens: 128000,
					toolCalling: true,
					vision: true,
				}]
			},
		};

		await provider.provideLanguageModelChatResponse(
			model,
			[new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, 'Hello')],
			{ requestInitiator: 'test', tools: [], toolMode: vscode.LanguageModelChatToolMode.Auto },
			{ report: () => { } },
			CancellationToken.None
		);

		expect({
			authentication: getSession.mock.calls,
			apiType: provideResponse.mock.calls[0][0].apiType,
		}).toEqual({
			authentication: [[
				AzureAuthMode.MICROSOFT_SOVEREIGN_CLOUD_AUTH_PROVIDER,
				['https://cognitiveservices.azure.us/.default'],
				{ createIfNone: true, silent: false },
			]],
			apiType: 'responses',
		});
	});

	describe('resolveAzureModelCapabilities', () => {
		type AzureModel = Parameters<typeof resolveAzureModelCapabilities>[0];

		function createModel(overrides: Partial<AzureModel> = {}): AzureModel {
			const model = {
				id: 'gpt-5.1',
				name: 'GPT 5.1',
				version: '1.0.0',
				family: 'gpt-5.1',
				url: 'https://my-resource.openai.azure.com/openai/responses?api-version=2025-04-01-preview',
				maxInputTokens: 272000,
				maxOutputTokens: 128000,
				capabilities: {
					toolCalling: true,
					imageInput: true,
					editTools: ['find-replace'],
				},
				...overrides,
			} satisfies AzureModel;
			return model;
		}

		it('preserves configured reasoning effort, endpoint, and edit tool metadata for the Entra path', () => {
			const modelConfiguration: NonNullable<Parameters<typeof resolveAzureModelCapabilities>[2]> = {
				id: 'gpt-5.1',
				name: 'GPT 5.1',
				url: 'https://my-resource.openai.azure.com/openai/responses?api-version=2025-04-01-preview',
				maxInputTokens: 272000,
				maxOutputTokens: 128000,
				toolCalling: true,
				vision: true,
				thinking: true,
				streaming: true,
				editTools: ['apply-patch'],
				requestHeaders: { 'X-Test-Header': 'value' },
				zeroDataRetentionEnabled: true,
				supportedEndpoints: [ModelSupportedEndpoint.Responses],
				supportsReasoningEffort: ['none', 'low', 'medium', 'high'],
				reasoningEffortFormat: 'responses',
			};
			const model = createModel({
				configuration: {
					models: [modelConfiguration],
				},
			});

			const capabilities = resolveAzureModelCapabilities(model, 'https://my-resource.openai.azure.com/openai/responses?api-version=2025-04-01-preview', modelConfiguration);

			expect(capabilities).toMatchObject({
				thinking: true,
				streaming: true,
				requestHeaders: { 'X-Test-Header': 'value' },
				editTools: ['apply-patch'],
				zeroDataRetentionEnabled: true,
				supportedEndpoints: [ModelSupportedEndpoint.Responses],
				supportsReasoningEffort: ['none', 'low', 'medium', 'high'],
				reasoningEffortFormat: 'responses',
			});
		});

		it('falls back to resolved model capabilities when no matching model configuration exists', () => {
			const capabilities = resolveAzureModelCapabilities(createModel(), 'https://my-resource.openai.azure.com/openai/responses?api-version=2025-04-01-preview', undefined);

			expect(capabilities).toMatchObject({
				toolCalling: true,
				vision: true,
				thinking: false,
				editTools: ['find-replace'],
			});
			expect(capabilities.supportsReasoningEffort).toBeUndefined();
			expect(capabilities.reasoningEffortFormat).toBeUndefined();
		});

		it('honors an explicitly empty configured editTools list instead of falling back', () => {
			const modelConfiguration: NonNullable<Parameters<typeof resolveAzureModelCapabilities>[2]> = {
				id: 'gpt-5.1',
				name: 'GPT 5.1',
				url: 'https://my-resource.openai.azure.com/openai/responses?api-version=2025-04-01-preview',
				maxInputTokens: 272000,
				maxOutputTokens: 128000,
				toolCalling: true,
				vision: true,
				editTools: [],
			};

			const capabilities = resolveAzureModelCapabilities(createModel(), 'https://my-resource.openai.azure.com/openai/responses?api-version=2025-04-01-preview', modelConfiguration);

			expect(capabilities.editTools).toEqual([]);
		});
	});

	describe('applyAzureSupportedEndpoints', () => {
		it('should mark Responses URLs as supporting the Responses endpoint', () => {
			const modelInfo = {} as IChatModelInformation;

			applyAzureSupportedEndpoints(modelInfo, 'https://my-resource.openai.azure.com/openai/responses?api-version=2025-04-01-preview');

			expect(modelInfo.supported_endpoints).toEqual([ModelSupportedEndpoint.ChatCompletions, ModelSupportedEndpoint.Responses]);
		});

		it('should leave non-Responses URLs unchanged', () => {
			const modelInfo = {} as IChatModelInformation;

			applyAzureSupportedEndpoints(modelInfo, 'https://my-resource.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2025-01-01-preview');

			expect(modelInfo.supported_endpoints).toBeUndefined();
		});

		it('should preserve existing supported endpoints for Responses URLs', () => {
			const modelInfo = { supported_endpoints: [ModelSupportedEndpoint.Messages] } as IChatModelInformation;

			applyAzureSupportedEndpoints(modelInfo, 'https://my-resource.openai.azure.com/openai/responses?api-version=2025-04-01-preview');

			expect(modelInfo.supported_endpoints).toEqual([ModelSupportedEndpoint.Messages, ModelSupportedEndpoint.ChatCompletions, ModelSupportedEndpoint.Responses]);
		});
	});

	describe('responsesSupportedEndpointsForUrl', () => {
		it('marks Responses (and Chat Completions) for /responses URLs and leaves Chat Completions URLs unmarked', () => {
			expect({
				responses: responsesSupportedEndpointsForUrl('https://my-resource.openai.azure.com/openai/responses?api-version=2025-04-01-preview'),
				apimResponses: responsesSupportedEndpointsForUrl('https://my-apim.azure-api.net/openai/responses'),
				mixedCaseResponses: responsesSupportedEndpointsForUrl('https://my-apim.azure-api.net/openai/Responses'),
				chatCompletions: responsesSupportedEndpointsForUrl('https://my-resource.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2025-01-01-preview'),
				deploymentNamedResponses: responsesSupportedEndpointsForUrl('https://my-resource.openai.azure.com/openai/deployments/responses/chat/completions?api-version=2025-01-01-preview'),
				malformed: responsesSupportedEndpointsForUrl('not a url'),
			}).toEqual({
				responses: [ModelSupportedEndpoint.ChatCompletions, ModelSupportedEndpoint.Responses],
				apimResponses: [ModelSupportedEndpoint.ChatCompletions, ModelSupportedEndpoint.Responses],
				mixedCaseResponses: [ModelSupportedEndpoint.ChatCompletions, ModelSupportedEndpoint.Responses],
				chatCompletions: undefined,
				deploymentNamedResponses: undefined,
				malformed: undefined,
			});
		});
	});

});
