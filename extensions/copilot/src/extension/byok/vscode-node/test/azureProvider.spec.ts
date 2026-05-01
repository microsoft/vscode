/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../platform/chat/common/blockedExtensionService';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IFetcherService } from '../../../../platform/networking/common/fetcherService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { ILogService } from '../../../../platform/log/common/logService';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import type { IBYOKStorageService } from '../byokStorageService';
import { CustomOAIBYOKModelProvider } from '../customOAIProvider';
import { resolveAzureUrl } from '../azureProvider';

describe('AzureBYOKModelProvider', () => {
	const disposables = new DisposableStore();
	let accessor: ITestingServicesAccessor;

	beforeEach(() => {
		const testingServiceCollection = createExtensionUnitTestingServices();

		// Add IBlockedExtensionService which is required by CopilotLanguageModelWrapper
		testingServiceCollection.define(IBlockedExtensionService, new SyncDescriptor(BlockedExtensionService));
		accessor = disposables.add(testingServiceCollection.createTestingAccessor());
	});

	afterEach(() => {
		disposables.clear();
		vi.restoreAllMocks();
	});

	function createStorageService(overrides?: Partial<IBYOKStorageService>): IBYOKStorageService {
		return {
			getAPIKey: vi.fn().mockResolvedValue(undefined),
			storeAPIKey: vi.fn().mockResolvedValue(undefined),
			deleteAPIKey: vi.fn().mockResolvedValue(undefined),
			getStoredModelConfigs: vi.fn().mockResolvedValue({}),
			saveModelConfig: vi.fn().mockResolvedValue(undefined),
			removeModelConfig: vi.fn().mockResolvedValue(undefined),
			...overrides,
		};
	}

	function createExtensionContext() {
		return {
			globalState: {
				get: vi.fn().mockReturnValue(true),
				update: vi.fn().mockResolvedValue(undefined),
			},
		} as any;
	}

	function createProvider() {
		return new CustomOAIBYOKModelProvider(
			createStorageService(),
			accessor.get(ILogService),
			accessor.get(IFetcherService),
			accessor.get(IInstantiationService),
			accessor.get(IConfigurationService),
			accessor.get(IExperimentationService),
			createExtensionContext(),
		);
	}

	function createCustomModel(url: string, toolSearch?: boolean) {
		return {
			id: 'custom-model',
			name: 'Custom Model',
			family: 'openai',
			version: '1.0',
			maxInputTokens: 4096,
			maxOutputTokens: 2048,
			capabilities: {
				toolCalling: false,
				imageInput: false,
			},
			url,
			configuration: {
				apiKey: 'test-api-key',
				models: [{
					id: 'custom-model',
					name: 'Custom Model',
					url,
					maxInputTokens: 4096,
					maxOutputTokens: 2048,
					toolCalling: false,
					vision: false,
					...(toolSearch === undefined ? {} : { toolSearch }),
				}],
			},
		} as any;
	}

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

		it('should throw error for unrecognized Azure URL', () => {
			const url = 'https://unknown.example.com';
			expect(() => resolveAzureUrl('gpt-4', url)).toThrow('Unrecognized Azure deployment URL');
		});
	});

	describe('CustomOAIBYOKModelProvider toolSearch mapping', () => {
		it('preserves toolSearch when migrating deprecated Custom OAI settings', async () => {
			const configurationService = accessor.get(IConfigurationService);
			configurationService.setConfig(ConfigKey.Deprecated.CustomOAIModels, {
				'custom-model': {
					name: 'Custom Model',
					url: 'https://example.test/v1/responses',
					maxInputTokens: 4096,
					maxOutputTokens: 2048,
					toolCalling: false,
					vision: false,
					toolSearch: true,
				},
			});

			const provider = new CustomOAIBYOKModelProvider(
				createStorageService(),
				accessor.get(ILogService),
				accessor.get(IFetcherService),
				accessor.get(IInstantiationService),
				configurationService,
				accessor.get(IExperimentationService),
				{
					globalState: {
						get: vi.fn().mockReturnValueOnce(true).mockReturnValue(false),
						update: vi.fn().mockResolvedValue(undefined),
					},
				} as any,
			);
			const configureDefaultGroupIfExists = vi.spyOn(provider as any, 'configureDefaultGroupIfExists').mockResolvedValue(undefined);

			await (provider as any).migrateConfig(ConfigKey.Deprecated.CustomOAIModels, CustomOAIBYOKModelProvider.providerName, CustomOAIBYOKModelProvider.providerName);

			expect(configureDefaultGroupIfExists).toHaveBeenCalledWith(
				CustomOAIBYOKModelProvider.providerName,
				expect.objectContaining({
					models: [expect.objectContaining({ id: 'custom-model', toolSearch: true })],
				})
			);
		});

		it('enables toolSearch for Responses custom models when explicitly configured', async () => {
			const provider = createProvider();
			const endpoint = await (provider as any).createOpenAIEndPoint(createCustomModel('https://example.test/v1/responses', true));

			expect(endpoint.supportsToolSearch).toBe(true);
		});

		it('keeps toolSearch disabled for Responses custom models when explicitly false', async () => {
			const provider = createProvider();
			const endpoint = await (provider as any).createOpenAIEndPoint(createCustomModel('https://example.test/v1/responses', false));

			expect(endpoint.supportsToolSearch).toBe(false);
		});

		it('defaults toolSearch to false for Responses custom models when it is unset', async () => {
			const provider = createProvider();
			const endpoint = await (provider as any).createOpenAIEndPoint(createCustomModel('https://example.test/v1/responses'));

			expect(endpoint.supportsToolSearch).toBe(false);
		});

		it('does not enable toolSearch for non-Responses custom models even when explicitly configured', async () => {
			const provider = createProvider();
			const endpoint = await (provider as any).createOpenAIEndPoint(createCustomModel('https://example.test/v1/chat/completions', true));

			expect(endpoint.supportsToolSearch).toBe(false);
		});
	});

});
