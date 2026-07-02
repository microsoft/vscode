/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { IFetcherService } from '../../../../platform/networking/common/fetcherService';
import { NullExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { BYOKModelCapabilities } from '../../common/byokProvider';
import type { IBYOKStorageService } from '../byokStorageService';
import { OpenRouterLMProvider } from '../openRouterProvider';

function createStorageService(): IBYOKStorageService {
	return {
		getAPIKey: vi.fn().mockResolvedValue(undefined),
		storeAPIKey: vi.fn().mockResolvedValue(undefined),
		deleteAPIKey: vi.fn().mockResolvedValue(undefined),
		getStoredModelConfigs: vi.fn().mockResolvedValue({}),
		saveModelConfig: vi.fn().mockResolvedValue(undefined),
		removeModelConfig: vi.fn().mockResolvedValue(undefined),
	} as unknown as IBYOKStorageService;
}

function createProvider(): OpenRouterLMProvider {
	return new OpenRouterLMProvider(
		createStorageService(),
		{} as unknown as IFetcherService,
		new TestLogService(),
		{ createInstance: vi.fn() } as unknown as IInstantiationService,
		new DefaultsOnlyConfigurationService(),
		new NullExperimentationService(),
	);
}

function resolveModelCapabilities(modelData: unknown): BYOKModelCapabilities | undefined {
	return (createProvider() as unknown as { resolveModelCapabilities(data: unknown): BYOKModelCapabilities | undefined }).resolveModelCapabilities(modelData);
}

describe('OpenRouterLMProvider.resolveModelCapabilities', () => {
	it('prefers the model-level context_length over the routed provider value', () => {
		const capabilities = resolveModelCapabilities({
			id: 'openai/gpt-4o',
			name: 'GPT-4o',
			supported_parameters: ['tools'],
			context_length: 200000,
			top_provider: { context_length: 32000 },
		});

		expect(capabilities?.maxInputTokens).toBe(200000 - 16000);
	});

	it('falls back to the routed provider context_length when the model-level value is absent', () => {
		const capabilities = resolveModelCapabilities({
			id: 'openai/gpt-4o',
			name: 'GPT-4o',
			supported_parameters: ['tools'],
			top_provider: { context_length: 32000 },
		});

		expect(capabilities?.maxInputTokens).toBe(32000 - 16000);
	});
});
