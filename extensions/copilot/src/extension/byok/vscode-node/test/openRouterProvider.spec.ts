/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { BYOKModelCapabilities } from '../../common/byokProvider';
import { OpenRouterLMProvider } from '../openRouterProvider';
import * as vscode from 'vscode';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../platform/chat/common/blockedExtensionService';
import { IChatMLFetcher } from '../../../../platform/chat/common/chatMLFetcher';
import { IFetcherService, Response } from '../../../../platform/networking/common/fetcherService';
import type { IEndpointBody } from '../../../../platform/networking/common/networking';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatMLFetcherImpl } from '../../../prompt/node/chatMLFetcher';
import { createExtensionUnitTestingServices } from '../../../test/node/services';

it('uses discovered gateway reasoning without guessing Claude native modes or mandatory disable', async () => {
	const store = new DisposableStore();
	const services = store.add(createExtensionUnitTestingServices());
	services.define(IChatMLFetcher, new SyncDescriptor(ChatMLFetcherImpl));
	services.define(IBlockedExtensionService, new SyncDescriptor(BlockedExtensionService));
	const accessor = store.add(services.createTestingAccessor());
	const provider = accessor.get(IInstantiationService).createInstance(OpenRouterLMProvider, {
		getAPIKey: async () => undefined, storeAPIKey: async () => {}, deleteAPIKey: async () => {},
		getStoredModelConfigs: async () => ({}), saveModelConfig: async () => {}, removeModelConfig: async () => {},
	});
	const bodies: IEndpointBody[] = [];
	const fetch = vi.spyOn(accessor.get(IFetcherService), 'fetch').mockImplementation(async (url, options) => {
		if (url === 'https://openrouter.ai/api/v1/models?supported_parameters=tools') {
			const data = [
				{ id: 'anthropic/discovered', reasoning: { supported_efforts: ['none', 'low', 'high'], default_effort: 'high' } },
				{ id: 'anthropic/mandatory', reasoning: { mandatory: true, supported_efforts: ['none', 'low'] } },
				{ id: 'anthropic/no-selector', reasoning: {} },
			].map(model => ({ ...model, name: model.id, context_length: 128000, top_provider: { max_completion_tokens: 4096 }, supported_parameters: ['reasoning', 'tools'] }));
			return Response.fromText(200, 'OK', new Headers({ 'content-type': 'application/json' }), JSON.stringify({ data }), 'node-fetch');
		}
		expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
		bodies.push(options?.json as IEndpointBody);
		return Response.fromText(200, 'OK', new Headers({ 'content-type': 'text/event-stream' }), 'data: {"choices":[{"index":0,"delta":{"reasoning_content":"thought","content":"answer"},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', 'node-fetch');
	});
	const token = store.add(new vscode.CancellationTokenSource());
	try {
		const models = await provider.provideLanguageModelChatInformation({ silent: true, configuration: { apiKey: 'fake' } }, token.token);
		const request = async (id: string, modelConfiguration: Record<string, string | boolean>) => {
			const parts: vscode.LanguageModelResponsePart2[] = [];
			await provider.provideLanguageModelChatResponse(models.find(model => model.id === id)!, [new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, 'hello')], { requestInitiator: 'core', tools: [], toolMode: vscode.LanguageModelChatToolMode.Auto, modelConfiguration }, { report: part => parts.push(part) }, token.token);
			expect(parts.some(part => part instanceof vscode.LanguageModelThinkingPart && part.value.includes('thought'))).toBe(true);
			expect(parts.some(part => part instanceof vscode.LanguageModelTextPart && part.value === 'answer')).toBe(true);
		};
		await request('anthropic/discovered', {});
		await request('anthropic/discovered', { reasoningEffort: 'low' });
		await request('anthropic/discovered', { enableThinking: false });
		await request('anthropic/no-selector', {});
		await expect(request('anthropic/mandatory', { enableThinking: false })).rejects.toThrow('This BYOK model does not support disabling thinking.');
		expect(bodies.map(body => body.reasoning)).toEqual([
			{ enabled: true, exclude: false, effort: 'high' },
			{ enabled: true, exclude: false, effort: 'low' },
			{ enabled: false },
			{ enabled: true, exclude: false },
		]);
		for (const body of bodies) {
			expect(body.reasoning_effort).toBeUndefined();
			expect(body.thinking).toBeUndefined();
		}
	} finally {
		fetch.mockRestore();
		store.dispose();
	}
});

/**
 * Tests for issue #324671:
 * OpenRouter BYOK previously derived the context window from `top_provider.context_length`,
 * which is the window of the highest-ranked provider — NOT the model's real capability
 * (`context_length`). For multi-provider models this could be off by 32×. These tests
 * verify the fix: the model-level `context_length` is preferred, with `top_provider`
 * used only as a fallback.
 */

/** Exposes the protected `resolveModelCapabilities` for focused testing. */
class TestableOpenRouterLMProvider extends OpenRouterLMProvider {
	public resolveCapabilities(modelData: unknown): BYOKModelCapabilities | undefined {
		return this.resolveModelCapabilities(modelData);
	}
}

function createProvider(): TestableOpenRouterLMProvider {
	const logService = {
		trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
		show: vi.fn(), createSubLogger: vi.fn(), withExtraTarget: vi.fn(),
	};
	logService.createSubLogger.mockReturnValue(logService);
	logService.withExtraTarget.mockReturnValue(logService);

	return new TestableOpenRouterLMProvider(
		{ getAPIKey: vi.fn().mockResolvedValue(undefined), storeAPIKey: vi.fn(), deleteAPIKey: vi.fn() } as any,
		{ fetch: vi.fn() } as any,
		logService as any,
		{ createInstance: vi.fn().mockReturnValue({}) } as any,
		{ isConfigured: vi.fn().mockReturnValue(false), getConfig: vi.fn(), setConfig: vi.fn() } as any,
		{} as any,
	);
}

describe('OpenRouterLMProvider context window (issue #324671)', () => {
	it('derives maxInputTokens from the model-level context_length, not top_provider', () => {
		const provider = createProvider();

		// `xiaomi/mimo-v2.5`: the model supports 1M tokens, but the highest-ranked
		// provider only serves 32K. The Xiaomi provider (1M) is not the top provider.
		const caps = provider.resolveCapabilities({
			id: 'xiaomi/mimo-v2.5',
			name: 'MiMo v2.5',
			supported_parameters: ['tools'],
			architecture: { input_modalities: ['text'] },
			context_length: 1048576,            // actual model capability (1M)
			top_provider: { context_length: 32000 }, // highest-ranked provider (32K)
		});

		// Uses the real 1M window minus the default 16K output reserve.
		expect(caps?.maxInputTokens).toBe(1048576 - 16000);
		expect(caps?.maxOutputTokens).toBe(16000);
	});

	it('honors top_provider.max_completion_tokens as the output budget', () => {
		const provider = createProvider();

		const caps = provider.resolveCapabilities({
			id: 'some/reasoning-model',
			name: 'Reasoning Model',
			supported_parameters: ['tools'],
			context_length: 200000,
			top_provider: { context_length: 200000, max_completion_tokens: 64000 },
		});

		expect(caps?.maxOutputTokens).toBe(64000);
		expect(caps?.maxInputTokens).toBe(200000 - 64000);
	});

	it('falls back to top_provider.context_length when the model omits context_length', () => {
		const provider = createProvider();

		const caps = provider.resolveCapabilities({
			id: 'legacy/model',
			name: 'Legacy Model',
			supported_parameters: ['tools'],
			top_provider: { context_length: 128000 },
		});

		expect(caps?.maxInputTokens).toBe(128000 - 16000);
	});

	it('clamps the output reserve so a small-context model keeps a positive prompt budget', () => {
		const provider = createProvider();

		// An 8K model whose provider reports a 16K completion budget larger than the
		// window. Without clamping, maxInputTokens would go negative (8000 - 16000).
		const caps = provider.resolveCapabilities({
			id: 'tiny/model',
			name: 'Tiny Model',
			supported_parameters: ['tools'],
			context_length: 8000,
			top_provider: { context_length: 8000, max_completion_tokens: 16000 },
		});

		// Reserve is capped at half the window, so the prompt budget stays positive.
		expect(caps?.maxOutputTokens).toBe(4000);
		expect(caps?.maxInputTokens).toBe(4000);
	});
});
