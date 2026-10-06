/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../platform/chat/common/blockedExtensionService';
import { IChatMLFetcher } from '../../../../platform/chat/common/chatMLFetcher';
import { AzureAuthMode } from '../../../../platform/configuration/common/configurationService';
import { ModelSupportedEndpoint } from '../../../../platform/endpoint/common/endpointProvider';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { ILanguageModelRequestMiddlewareRegistry, LanguageModelRequestContext } from '../../common/languageModelRequestMiddleware';
import { AzureBYOKModelProvider, azureSupportedEndpointsForUrl, resolveAzureUrl } from '../azureProvider';
import type { IBYOKStorageService } from '../byokStorageService';
import { CapturingChatMLFetcher } from './capturingChatMLFetcher';

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

describe('AzureBYOKModelProvider', () => {
	const disposables = new DisposableStore();
	let accessor: ITestingServicesAccessor;
	let instaService: IInstantiationService;
	let chatMLFetcher: CapturingChatMLFetcher;

	beforeEach(() => {
		const testingServiceCollection = createExtensionUnitTestingServices();

		// Add IBlockedExtensionService which is required by CopilotLanguageModelWrapper
		testingServiceCollection.define(IBlockedExtensionService, new SyncDescriptor(BlockedExtensionService));
		chatMLFetcher = new CapturingChatMLFetcher();
		testingServiceCollection.set(IChatMLFetcher, chatMLFetcher);
		accessor = disposables.add(testingServiceCollection.createTestingAccessor());
		instaService = accessor.get(IInstantiationService);
	});

	afterEach(() => {
		disposables.clear();
		vi.restoreAllMocks();
	});

	describe('provideLanguageModelChatResponse with Entra ID', () => {
		it('applies request middleware headers to the Entra-authenticated endpoint and keeps the Entra credential', async () => {
			const getSession = vi.spyOn(vscode.authentication, 'getSession').mockResolvedValue({ id: 'session', accessToken: 'entra-token', account: { id: 'user', label: 'User' }, scopes: [AzureAuthMode.COGNITIVE_SERVICES_SCOPE] });
			const registry = accessor.get(ILanguageModelRequestMiddlewareRegistry);
			const contexts: LanguageModelRequestContext[] = [];
			disposables.add(registry.register({
				selector: { vendors: ['azure'], providerGroups: ['Azure Prod'] },
				provideRequestHeaders: async context => {
					contexts.push(context);
					return { 'x-dynamic': 'value', 'x-shared': 'middleware', Authorization: 'Bearer middleware-token' };
				},
			}));
			const provider = instaService.createInstance(AzureBYOKModelProvider, createStorageService());
			const tokenSource = disposables.add(new vscode.CancellationTokenSource());
			// No apiKey in the configuration: the provider authenticates with Entra ID.
			const [model] = await provider.provideLanguageModelChatInformation({
				silent: true,
				group: 'Azure Prod',
				configuration: {
					models: [{
						id: 'gpt-4-deployment',
						name: 'GPT-4',
						url: 'https://my-resource.openai.azure.com',
						maxInputTokens: 128000,
						maxOutputTokens: 16000,
						toolCalling: true,
						vision: false,
						requestHeaders: { 'x-static': 'value', 'x-shared': 'config' },
					}],
				}
			}, tokenSource.token);

			await provider.provideLanguageModelChatResponse(
				model,
				[new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, 'hello')],
				{
					requestInitiator: 'core',
					sessionId: 'session-1',
					tools: [],
					toolMode: vscode.LanguageModelChatToolMode.Auto,
				},
				{ report: () => undefined },
				tokenSource.token,
			);

			expect({
				authProvider: getSession.mock.calls[0]?.[0],
				contexts: contexts.map(({ cancellationToken, ...context }) => context),
				headers: chatMLFetcher.requests[0]?.endpoint.getExtraHeaders?.(),
			}).toEqual({
				authProvider: AzureAuthMode.MICROSOFT_AUTH_PROVIDER,
				contexts: [{
					vendor: 'azure',
					modelId: 'gpt-4-deployment',
					url: 'https://my-resource.openai.azure.com/openai/deployments/gpt-4-deployment/chat/completions?api-version=2025-01-01-preview',
					providerGroup: 'Azure Prod',
					requestInitiator: 'core',
					sessionId: 'session-1',
				}],
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer entra-token',
					'x-static': 'value',
					'x-dynamic': 'value',
					'x-shared': 'middleware',
				},
			});
		});
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

	describe('azureSupportedEndpointsForUrl', () => {
		it('marks Responses (and Chat Completions) for /responses URLs and leaves Chat Completions URLs unmarked', () => {
			expect({
				responses: azureSupportedEndpointsForUrl('https://my-resource.openai.azure.com/openai/responses?api-version=2025-04-01-preview'),
				apimResponses: azureSupportedEndpointsForUrl('https://my-apim.azure-api.net/openai/responses'),
				mixedCaseResponses: azureSupportedEndpointsForUrl('https://my-apim.azure-api.net/openai/Responses'),
				chatCompletions: azureSupportedEndpointsForUrl('https://my-resource.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2025-01-01-preview'),
				deploymentNamedResponses: azureSupportedEndpointsForUrl('https://my-resource.openai.azure.com/openai/deployments/responses/chat/completions?api-version=2025-01-01-preview'),
				malformed: azureSupportedEndpointsForUrl('not a url'),
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
