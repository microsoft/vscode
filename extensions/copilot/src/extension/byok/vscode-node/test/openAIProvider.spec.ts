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
import { BYOKKnownModels } from '../../common/byokProvider';
import type { IBYOKStorageService } from '../byokStorageService';
import { OAIBYOKLMProvider, OpenAIModelProviderConfig, resolveOpenAIUrl } from '../openAIProvider';

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

function createProvider(): OAIBYOKLMProvider {
	return new OAIBYOKLMProvider(
		{} as BYOKKnownModels,
		createStorageService(),
		{} as unknown as IFetcherService,
		new TestLogService(),
		{ createInstance: vi.fn() } as unknown as IInstantiationService,
		new DefaultsOnlyConfigurationService(),
		new NullExperimentationService(),
	);
}

function createProviderWithSpy(): { provider: OAIBYOKLMProvider; createInstance: ReturnType<typeof vi.fn> } {
	const createInstance = vi.fn();
	const provider = new OAIBYOKLMProvider(
		{} as BYOKKnownModels,
		createStorageService(),
		{} as unknown as IFetcherService,
		new TestLogService(),
		{ createInstance } as unknown as IInstantiationService,
		new DefaultsOnlyConfigurationService(),
		new NullExperimentationService(),
	);
	return { provider, createInstance };
}

function createModel(configuration: OpenAIModelProviderConfig): unknown {
	return {
		id: 'gpt-4o',
		name: 'GPT-4o',
		family: 'gpt-4o',
		version: '1.0.0',
		maxInputTokens: 128000,
		maxOutputTokens: 16000,
		capabilities: { toolCalling: true, imageInput: false },
		configuration,
		url: 'https://api.openai.com/v1',
	};
}

async function resolveEndpointModelInfo(configuration: OpenAIModelProviderConfig): Promise<{ zeroDataRetentionEnabled?: boolean }> {
	const { provider, createInstance } = createProviderWithSpy();
	await (provider as unknown as { createOpenAIEndPoint(model: unknown): Promise<unknown> }).createOpenAIEndPoint(createModel(configuration));
	const lastCall = createInstance.mock.lastCall as unknown[];
	return lastCall[1] as { zeroDataRetentionEnabled?: boolean };
}

describe('resolveOpenAIUrl', () => {
	it.each<[string, 'chat-completions' | 'responses', string]>([
		['https://api.openai.com/v1/chat/completions', 'chat-completions', 'https://api.openai.com/v1/chat/completions'],
		['https://api.openai.com/v1/responses', 'responses', 'https://api.openai.com/v1/responses'],
		['https://api.openai.com/v1', 'chat-completions', 'https://api.openai.com/v1/chat/completions'],
		['https://api.openai.com/v1', 'responses', 'https://api.openai.com/v1/responses'],
		['https://api.openai.com/v1/', 'chat-completions', 'https://api.openai.com/v1/chat/completions'],
		['https://example.com/openai', 'chat-completions', 'https://example.com/openai/v1/chat/completions'],
		['https://example.com/openai', 'responses', 'https://example.com/openai/v1/responses'],
	])('resolves request URL for %s with API type %s', (url, apiType, expected) => {
		expect(resolveOpenAIUrl(url, apiType)).toEqual(expected);
	});
});

describe('OAIBYOKLMProvider.getAllModels', () => {
	it('honors configured per-model limits instead of running discovery', async () => {
		const configuration: OpenAIModelProviderConfig = {
			apiKey: 'k_test',
			models: [
				{ id: 'gpt-4o', name: 'GPT-4o', maxInputTokens: 100000, maxOutputTokens: 16000, toolCalling: true, vision: true },
				{ id: 'o3', name: 'o3', url: 'https://custom.example.com/v1', maxInputTokens: 200000, maxOutputTokens: 65536, toolCalling: true, vision: false },
			],
		};

		const models = await (createProvider() as unknown as {
			getAllModels(silent: boolean, apiKey: string | undefined, configuration: OpenAIModelProviderConfig | undefined): Promise<{ id: string; maxInputTokens: number; maxOutputTokens: number; url: string; capabilities?: { toolCalling?: boolean; imageInput?: boolean } }[]>;
		}).getAllModels(true, 'k_test', configuration);

		expect(models.map(model => ({
			id: model.id,
			maxInputTokens: model.maxInputTokens,
			maxOutputTokens: model.maxOutputTokens,
			url: model.url,
			toolCalling: model.capabilities?.toolCalling,
			vision: model.capabilities?.imageInput,
		}))).toEqual([
			{ id: 'gpt-4o', maxInputTokens: 100000, maxOutputTokens: 16000, url: 'https://api.openai.com/v1', toolCalling: true, vision: true },
			{ id: 'o3', maxInputTokens: 200000, maxOutputTokens: 65536, url: 'https://custom.example.com/v1', toolCalling: true, vision: false },
		]);
	});
});

describe('OAIBYOKLMProvider zero data retention', () => {
	it('applies the group-level flag to discovered models', async () => {
		const modelInfo = await resolveEndpointModelInfo({ apiKey: 'k_test', zeroDataRetentionEnabled: true });

		expect(modelInfo.zeroDataRetentionEnabled).toBe(true);
	});

	it('leaves discovered models without zero data retention when the group flag is unset', async () => {
		const modelInfo = await resolveEndpointModelInfo({ apiKey: 'k_test' });

		expect(modelInfo.zeroDataRetentionEnabled).toBe(false);
	});

	it('applies the group-level flag to explicitly configured models', async () => {
		const modelInfo = await resolveEndpointModelInfo({
			apiKey: 'k_test',
			zeroDataRetentionEnabled: true,
			models: [{ id: 'gpt-4o', name: 'GPT-4o', maxInputTokens: 128000, maxOutputTokens: 16000, toolCalling: true, vision: false }],
		});

		expect(modelInfo.zeroDataRetentionEnabled).toBe(true);
	});
});
