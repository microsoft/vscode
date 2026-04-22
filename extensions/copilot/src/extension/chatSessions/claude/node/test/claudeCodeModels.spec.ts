/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { IEndpointProvider } from '../../../../../platform/endpoint/common/endpointProvider';
import { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { Emitter } from '../../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ClaudeCodeModels } from '../claudeCodeModels';
import { tryParseClaudeModelId } from '../claudeModelId';

/**
 * Creates a minimal mock IChatEndpoint with required properties for testing
 */
function createMockEndpoint(overrides: {
	model: string;
	name: string;
	family: string;
	showInModelPicker?: boolean;
	multiplier?: number;
	apiType?: string;
	modelProvider?: string;
	supportsReasoningEffort?: string[];
}): IChatEndpoint {
	const isAnthropic = overrides.modelProvider === undefined || overrides.modelProvider === 'Anthropic';
	return {
		model: overrides.model,
		name: overrides.name,
		family: overrides.family,
		version: '1.0',
		showInModelPicker: overrides.showInModelPicker ?? true,
		multiplier: overrides.multiplier,
		modelProvider: overrides.modelProvider ?? 'Anthropic',
		apiType: overrides.apiType ?? (isAnthropic ? 'messages' : 'chatCompletions'),
		// Required properties with sensible defaults
		maxOutputTokens: 4096,
		supportsToolCalls: true,
		supportsVision: false,
		supportsPrediction: false,
		supportsReasoningEffort: overrides.supportsReasoningEffort,
		isDefault: false,
		isFallback: false,
		policy: 'enabled',
		urlOrRequestMetadata: 'mock://endpoint',
		modelMaxPromptTokens: 128000,
		tokenizer: 'cl100k_base',
		acquireTokenizer: () => ({ encode: () => [], free: () => { } }) as any,
		processResponseFromChatEndpoint: () => Promise.resolve({} as any),
		acceptChatPolicy: () => Promise.resolve(true),
		fetchChatResponse: () => Promise.resolve({} as any),
	} as unknown as IChatEndpoint;
}

/**
 * Mock endpoint provider that supports firing onDidModelsRefresh and updating endpoints.
 */
class RefreshableMockEndpointProvider implements IEndpointProvider {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidModelsRefresh = new Emitter<void>();
	readonly onDidModelsRefresh = this._onDidModelsRefresh.event;
	private _endpoints: IChatEndpoint[];

	constructor(endpoints: IChatEndpoint[]) {
		this._endpoints = endpoints;
	}

	setEndpoints(endpoints: IChatEndpoint[]): void {
		this._endpoints = endpoints;
	}

	fireRefresh(): void {
		this._onDidModelsRefresh.fire();
	}

	async getAllChatEndpoints(): Promise<IChatEndpoint[]> {
		return this._endpoints;
	}

	getChatEndpoint(): Promise<IChatEndpoint> {
		throw new Error('Not implemented');
	}
	getEmbeddingsEndpoint(): Promise<any> {
		throw new Error('Not implemented');
	}
	getAllCompletionModels(): Promise<any[]> {
		throw new Error('Not implemented');
	}
}

describe('ClaudeCodeModels', () => {
	const store = new DisposableStore();

	afterEach(() => {
		store.clear();
	});

	function createServiceWithRefreshableEndpoints(
		endpoints: IChatEndpoint[],
	): { service: ClaudeCodeModels; provider: RefreshableMockEndpointProvider } {
		const endpointProvider = new RefreshableMockEndpointProvider(endpoints);
		const serviceCollection = store.add(createExtensionUnitTestingServices());
		serviceCollection.set(IEndpointProvider, endpointProvider);
		const instantiationService = serviceCollection.createTestingAccessor().get(IInstantiationService);
		const service = store.add(instantiationService.createInstance(ClaudeCodeModels));
		return { service, provider: endpointProvider };
	}

	describe('resolveEndpoint', () => {
		it('resolves by exact model match', async () => {
			const { service } = createServiceWithRefreshableEndpoints([
				createMockEndpoint({ model: 'claude-sonnet-4', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
				createMockEndpoint({ model: 'claude-opus-4.5', name: 'Claude Opus 4.5', family: 'claude-opus-4.5' }),
			]);

			const endpoint = await service.resolveEndpoint('claude-opus-4.5', undefined);
			expect(endpoint?.model).toBe('claude-opus-4.5');
		});

		it('resolves by family match', async () => {
			const { service } = createServiceWithRefreshableEndpoints([
				createMockEndpoint({ model: 'claude-sonnet-4-model', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
			]);

			const endpoint = await service.resolveEndpoint('claude-sonnet-4', undefined);
			expect(endpoint?.model).toBe('claude-sonnet-4-model');
		});

		it('maps SDK model ID format to endpoint format', async () => {
			const { service } = createServiceWithRefreshableEndpoints([
				createMockEndpoint({ model: 'claude-opus-4.5', name: 'Claude Opus 4.5', family: 'claude-opus-4.5' }),
			]);

			// SDK format uses hyphens; endpoint format uses dots
			const endpoint = await service.resolveEndpoint('claude-opus-4-5', undefined);
			expect(endpoint?.model).toBe('claude-opus-4.5');
		});

		it('falls back to fallbackModelId when requested model does not match', async () => {
			const { service } = createServiceWithRefreshableEndpoints([
				createMockEndpoint({ model: 'claude-sonnet-4', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
			]);

			const fallback = tryParseClaudeModelId('claude-sonnet-4');
			const endpoint = await service.resolveEndpoint('unknown-model', fallback);
			expect(endpoint?.model).toBe('claude-sonnet-4');
		});

		it('falls back to newest Sonnet when no exact or fallback match', async () => {
			const { service } = createServiceWithRefreshableEndpoints([
				createMockEndpoint({ model: 'claude-opus-4.5', name: 'Claude Opus 4.5', family: 'claude-opus-4.5' }),
				createMockEndpoint({ model: 'claude-sonnet-4', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
				createMockEndpoint({ model: 'claude-haiku-3.5', name: 'Claude Haiku 3.5', family: 'claude-haiku-3.5' }),
			]);

			const endpoint = await service.resolveEndpoint('claude-nonexistent-99', undefined);
			expect(endpoint?.model).toBe('claude-sonnet-4');
		});

		it('falls back to newest Haiku when no Sonnet available', async () => {
			const { service } = createServiceWithRefreshableEndpoints([
				createMockEndpoint({ model: 'claude-opus-4.5', name: 'Claude Opus 4.5', family: 'claude-opus-4.5' }),
				createMockEndpoint({ model: 'claude-haiku-3.5', name: 'Claude Haiku 3.5', family: 'claude-haiku-3.5' }),
			]);

			const endpoint = await service.resolveEndpoint('claude-nonexistent-99', undefined);
			expect(endpoint?.model).toBe('claude-haiku-3.5');
		});

		it('falls back to any Claude model when no Sonnet or Haiku available', async () => {
			const { service } = createServiceWithRefreshableEndpoints([
				createMockEndpoint({ model: 'claude-opus-4.5', name: 'Claude Opus 4.5', family: 'claude-opus-4.5' }),
			]);

			const endpoint = await service.resolveEndpoint('claude-nonexistent-99', undefined);
			expect(endpoint?.model).toBe('claude-opus-4.5');
		});

		it('falls back to Sonnet when no model is requested', async () => {
			const { service } = createServiceWithRefreshableEndpoints([
				createMockEndpoint({ model: 'claude-opus-4.5', name: 'Claude Opus 4.5', family: 'claude-opus-4.5' }),
				createMockEndpoint({ model: 'claude-sonnet-4', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
			]);

			const endpoint = await service.resolveEndpoint(undefined, undefined);
			expect(endpoint?.model).toBe('claude-sonnet-4');
		});

		it('does not fall back to non-Anthropic models', async () => {
			const { service } = createServiceWithRefreshableEndpoints([
				createMockEndpoint({ model: 'gpt-4o', name: 'GPT-4o', family: 'gpt-4', modelProvider: 'Azure OpenAI' }),
			]);

			const endpoint = await service.resolveEndpoint('unknown-model', undefined);
			expect(endpoint).toBeUndefined();
		});

		it('returns undefined when no endpoints are available', async () => {
			const { service } = createServiceWithRefreshableEndpoints([]);

			const endpoint = await service.resolveEndpoint('claude-sonnet-4', undefined);
			expect(endpoint).toBeUndefined();
		});
	});

	describe('registerLanguageModelChatProvider', () => {
		function createMockLm(): { lm: typeof vscode['lm']; getCapturedProvider: () => vscode.LanguageModelChatProvider | undefined } {
			let capturedProvider: vscode.LanguageModelChatProvider | undefined;
			const lm = {
				registerLanguageModelChatProvider(_id: string, provider: vscode.LanguageModelChatProvider) {
					capturedProvider = provider;
					return { dispose: () => { } };
				},
			} as unknown as typeof vscode['lm'];
			return { lm, getCapturedProvider: () => capturedProvider };
		}

		async function getProviderInfo(service: ClaudeCodeModels, lm: typeof vscode['lm'], getCapturedProvider: () => vscode.LanguageModelChatProvider | undefined): Promise<vscode.LanguageModelChatInformation[]> {
			service.registerLanguageModelChatProvider(lm);
			const provider = getCapturedProvider()!;
			const info = await provider.provideLanguageModelChatInformation!({} as any, {} as any);
			return info ?? [];
		}

		it('registers provider and surfaces endpoints as LanguageModelChatInformation', async () => {
			const { service } = createServiceWithRefreshableEndpoints([
				createMockEndpoint({ model: 'claude-sonnet-4-model', name: 'Claude Sonnet 4', family: 'claude-sonnet-4', multiplier: 1 }),
				createMockEndpoint({ model: 'claude-opus-4.5-model', name: 'Claude Opus 4.5', family: 'claude-opus-4.5', multiplier: 5 }),
			]);
			const { lm, getCapturedProvider } = createMockLm();

			const info = await getProviderInfo(service, lm, getCapturedProvider);
			expect(info).toHaveLength(2);

			const sonnet = info.find(i => i.id === 'claude-sonnet-4-model')!;
			expect(sonnet.name).toBe('Claude Sonnet 4');
			expect(sonnet.family).toBe('claude-sonnet-4');
			expect(sonnet.multiplier).toBe('1x');
			expect(sonnet.targetChatSessionType).toBe('claude-code');
			expect(sonnet.isUserSelectable).toBe(true);

			const opus = info.find(i => i.id === 'claude-opus-4.5-model')!;
			expect(opus.multiplier).toBe('5x');
		});

		it('returns undefined multiplier string when endpoint has no multiplier', async () => {
			const { service } = createServiceWithRefreshableEndpoints([
				createMockEndpoint({ model: 'claude-sonnet-4-model', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
			]);
			const { lm, getCapturedProvider } = createMockLm();

			const info = await getProviderInfo(service, lm, getCapturedProvider);
			expect(info[0].multiplier).toBeUndefined();
		});

		it('returns empty array when no endpoints are available', async () => {
			const { service } = createServiceWithRefreshableEndpoints([]);
			const { lm, getCapturedProvider } = createMockLm();

			const info = await getProviderInfo(service, lm, getCapturedProvider);
			expect(info).toHaveLength(0);
		});

		it('maps endpoint properties to LanguageModelChatInformation fields', async () => {
			const endpoint = createMockEndpoint({ model: 'claude-sonnet-4-model', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' });
			const { service } = createServiceWithRefreshableEndpoints([endpoint]);
			const { lm, getCapturedProvider } = createMockLm();

			const info = await getProviderInfo(service, lm, getCapturedProvider);
			expect(info[0].maxInputTokens).toBe(endpoint.modelMaxPromptTokens);
			expect(info[0].maxOutputTokens).toBe(endpoint.maxOutputTokens);
			expect(info[0].version).toBe(endpoint.version);
		});
		it('includes configurationSchema when endpoint supports multiple reasoning effort levels', async () => {
			const { service } = createServiceWithRefreshableEndpoints([
				createMockEndpoint({
					model: 'claude-sonnet-4-model',
					name: 'Claude Sonnet 4',
					family: 'claude-sonnet-4',
					supportsReasoningEffort: ['low', 'medium', 'high'],
				}),
			]);
			const { lm, getCapturedProvider } = createMockLm();

			const info = await getProviderInfo(service, lm, getCapturedProvider);
			expect(info[0].configurationSchema).toBeDefined();
			const schema = info[0].configurationSchema!;
			expect(schema.properties?.['reasoningEffort']).toBeDefined();
			expect(schema.properties!['reasoningEffort'].enum).toEqual(['low', 'medium', 'high']);
			expect(schema.properties!['reasoningEffort'].default).toBe('high');
		});

		it('omits configurationSchema when endpoint has no reasoning effort support', async () => {
			const { service } = createServiceWithRefreshableEndpoints([
				createMockEndpoint({
					model: 'claude-sonnet-4-model',
					name: 'Claude Sonnet 4',
					family: 'claude-sonnet-4',
				}),
			]);
			const { lm, getCapturedProvider } = createMockLm();

			const info = await getProviderInfo(service, lm, getCapturedProvider);
			expect(info[0].configurationSchema).toBeUndefined();
		});

		it('omits configurationSchema when endpoint has only one reasoning effort level', async () => {
			const { service } = createServiceWithRefreshableEndpoints([
				createMockEndpoint({
					model: 'claude-sonnet-4-model',
					name: 'Claude Sonnet 4',
					family: 'claude-sonnet-4',
					supportsReasoningEffort: ['high'],
				}),
			]);
			const { lm, getCapturedProvider } = createMockLm();

			const info = await getProviderInfo(service, lm, getCapturedProvider);
			expect(info[0].configurationSchema).toBeUndefined();
		});
	});

	describe('cache invalidation on onDidModelsRefresh', () => {
		it('returns updated endpoints after refresh', async () => {
			const { service, provider } = createServiceWithRefreshableEndpoints([
				createMockEndpoint({ model: 'claude-sonnet-4', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
			]);

			// Initial fetch
			const before = await service.resolveEndpoint('claude-sonnet-4', undefined);
			expect(before?.model).toBe('claude-sonnet-4');

			// Update endpoints and fire refresh
			provider.setEndpoints([
				createMockEndpoint({ model: 'claude-sonnet-4', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
				createMockEndpoint({ model: 'claude-opus-4.5', name: 'Claude Opus 4.5', family: 'claude-opus-4.5' }),
			]);
			provider.fireRefresh();

			// After refresh, new endpoint should be resolvable
			const after = await service.resolveEndpoint('claude-opus-4.5', undefined);
			expect(after?.model).toBe('claude-opus-4.5');
		});

		it('returns cached endpoints when no refresh has occurred', async () => {
			let fetchCount = 0;
			const endpointProvider = new RefreshableMockEndpointProvider([
				createMockEndpoint({ model: 'claude-sonnet-4', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
			]);
			const originalGetAll = endpointProvider.getAllChatEndpoints.bind(endpointProvider);
			endpointProvider.getAllChatEndpoints = async () => {
				fetchCount++;
				return originalGetAll();
			};

			const serviceCollection = store.add(createExtensionUnitTestingServices());
			serviceCollection.set(IEndpointProvider, endpointProvider);
			const instantiationService = serviceCollection.createTestingAccessor().get(IInstantiationService);
			const service = store.add(instantiationService.createInstance(ClaudeCodeModels));

			await service.resolveEndpoint(undefined, undefined);
			await service.resolveEndpoint(undefined, undefined);

			// Should only have fetched once due to caching
			expect(fetchCount).toBe(1);
		});
	});
});
