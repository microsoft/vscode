/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../platform/chat/common/blockedExtensionService';
import { ModelSupportedEndpoint } from '../../../../platform/endpoint/common/endpointProvider';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { azureSupportedEndpointsForUrl, resolveAzureUrl } from '../azureProvider';

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
