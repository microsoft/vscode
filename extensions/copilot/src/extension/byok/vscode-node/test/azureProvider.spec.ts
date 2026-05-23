/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../platform/chat/common/blockedExtensionService';
import { AzureAuthMode } from '../../../../platform/configuration/common/configurationService';
import { IChatModelInformation, ModelSupportedEndpoint } from '../../../../platform/endpoint/common/endpointProvider';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { applyAzureSupportedEndpoints, resolveAzureEntraAuthProvider, resolveAzureEntraScopes, resolveAzureUrl } from '../azureProvider';

describe('AzureBYOKModelProvider', () => {
	const disposables = new DisposableStore();

	beforeEach(() => {
		const testingServiceCollection = createExtensionUnitTestingServices();

		// Add IBlockedExtensionService which is required by CopilotLanguageModelWrapper
		testingServiceCollection.define(IBlockedExtensionService, new SyncDescriptor(BlockedExtensionService));
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

});
