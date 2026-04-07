/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { IEndpointProvider } from '../../../../../platform/endpoint/common/endpointProvider';
import { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { Emitter, Event } from '../../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ClaudeCodeModels, NoClaudeModelsAvailableError } from '../claudeCodeModels';

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
}): IChatEndpoint {
	// Default to Messages API for Claude models
	const isClaude = overrides.family?.toLowerCase().includes('claude') || overrides.model?.toLowerCase().includes('claude');
	return {
		model: overrides.model,
		name: overrides.name,
		family: overrides.family,
		version: '1.0',
		showInModelPicker: overrides.showInModelPicker ?? true,
		multiplier: overrides.multiplier,
		apiType: overrides.apiType ?? (isClaude ? 'messages' : 'chatCompletions'),
		// Required properties with sensible defaults
		maxOutputTokens: 4096,
		supportsToolCalls: true,
		supportsVision: false,
		supportsPrediction: false,
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
 * Mock endpoint provider for testing ClaudeCodeModels
 */
class MockEndpointProvider implements IEndpointProvider {
	declare readonly _serviceBrand: undefined;
	readonly onDidModelsRefresh = Event.None;

	constructor(private readonly endpoints: IChatEndpoint[]) { }

	async getAllChatEndpoints(): Promise<IChatEndpoint[]> {
		return this.endpoints;
	}

	// Not used in ClaudeCodeModels tests
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

	function createServiceWithEndpoints(endpoints: IChatEndpoint[]): ClaudeCodeModels {
		const serviceCollection = store.add(createExtensionUnitTestingServices());
		serviceCollection.set(IEndpointProvider, new MockEndpointProvider(endpoints));
		const instantiationService = serviceCollection.createTestingAccessor().get(IInstantiationService);
		return instantiationService.createInstance(ClaudeCodeModels);
	}

	describe('_parseFamilyString', () => {
		it('parses family with decimal version', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-opus-4.5-model', name: 'Claude Opus 4.5', family: 'claude-opus-4.5' }),
			]);

			const models = await service.getModels();

			expect(models).toHaveLength(1);
			expect(models[0].id).toBe('claude-opus-4.5-model');
		});

		it('parses family with two-digit version (41 -> 4.1)', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-opus-41-model', name: 'Claude Opus 4.1', family: 'claude-opus-41' }),
			]);

			const models = await service.getModels();

			expect(models).toHaveLength(1);
			expect(models[0].id).toBe('claude-opus-41-model');
		});

		it('parses family with single-digit version', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-haiku-4-model', name: 'Claude Haiku 4', family: 'claude-haiku-4' }),
			]);

			const models = await service.getModels();

			expect(models).toHaveLength(1);
			expect(models[0].id).toBe('claude-haiku-4-model');
		});
	});

	describe('filtering', () => {
		it('returns all Claude models with Messages API support', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-opus-4.1-model', name: 'Claude Opus 4.1', family: 'claude-opus-41' }),
				createMockEndpoint({ model: 'claude-opus-4.5-model', name: 'Claude Opus 4.5', family: 'claude-opus-4.5' }),
				createMockEndpoint({ model: 'claude-sonnet-35-model', name: 'Claude Sonnet 3.5', family: 'claude-sonnet-35' }),
				createMockEndpoint({ model: 'claude-sonnet-4-model', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
			]);

			const models = await service.getModels();

			expect(models).toHaveLength(4);

			const modelIds = models.map(m => m.id).sort();
			expect(modelIds).toEqual(['claude-opus-4.1-model', 'claude-opus-4.5-model', 'claude-sonnet-35-model', 'claude-sonnet-4-model']);
		});

		it('handles multiple families correctly', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-opus-4.5-model', name: 'Claude Opus 4.5', family: 'claude-opus-4.5' }),
				createMockEndpoint({ model: 'claude-sonnet-4-model', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
				createMockEndpoint({ model: 'claude-haiku-4.5-model', name: 'Claude Haiku 4.5', family: 'claude-haiku-4.5' }),
			]);

			const models = await service.getModels();

			expect(models).toHaveLength(3);

			const modelIds = models.map(m => m.id).sort();
			expect(modelIds).toEqual([
				'claude-haiku-4.5-model',
				'claude-opus-4.5-model',
				'claude-sonnet-4-model',
			]);
		});

		it('filters out non-Claude models', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-sonnet-4-model', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
				createMockEndpoint({ model: 'gpt-4o', name: 'GPT-4o', family: 'gpt-4' }),
			]);

			const models = await service.getModels();

			expect(models).toHaveLength(1);
			expect(models[0].id).toBe('claude-sonnet-4-model');
		});

		it('includes unparseable family as-is', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-custom', name: 'Claude Custom', family: 'claude-custom' }),
				createMockEndpoint({ model: 'claude-sonnet-4-model', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
			]);

			const models = await service.getModels();

			expect(models).toHaveLength(2);

			const modelIds = models.map(m => m.id).sort();
			expect(modelIds).toEqual(['claude-custom', 'claude-sonnet-4-model']);
		});
	});

	describe('getDefaultModel', () => {
		it('returns the Sonnet model as default', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-opus-4.5-model', name: 'Claude Opus 4.5', family: 'claude-opus-4.5' }),
				createMockEndpoint({ model: 'claude-sonnet-4-model', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
				createMockEndpoint({ model: 'claude-haiku-4.5-model', name: 'Claude Haiku 4.5', family: 'claude-haiku-4.5' }),
			]);

			const defaultModel = await service.getDefaultModel();

			expect(defaultModel).toBe('claude-sonnet-4-model');
		});

		it('returns first model if no Sonnet available', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-opus-4.5-model', name: 'Claude Opus 4.5', family: 'claude-opus-4.5' }),
				createMockEndpoint({ model: 'claude-haiku-4.5-model', name: 'Claude Haiku 4.5', family: 'claude-haiku-4.5' }),
			]);

			const defaultModel = await service.getDefaultModel();

			// Should return the first available model
			expect(defaultModel).toBeDefined();
		});

		it('throws NoClaudeModelsAvailableError if no models available', async () => {
			const service = createServiceWithEndpoints([]);

			await expect(service.getDefaultModel()).rejects.toThrow(NoClaudeModelsAvailableError);
		});
	});

	describe('no models available', () => {
		it('returns empty array when no Claude models with Messages API found', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'gpt-4o', name: 'GPT-4o', family: 'gpt-4' }),
				createMockEndpoint({ model: 'gpt-4o-mini', name: 'GPT-4o Mini', family: 'gpt-4-mini' }),
			]);

			const models = await service.getModels();

			expect(models).toHaveLength(0);
		});

		it('does filter by showInModelPicker', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-sonnet-4-model', name: 'Claude Sonnet 4', family: 'claude-sonnet-4', showInModelPicker: true }),
				createMockEndpoint({ model: 'claude-hidden', name: 'Claude Hidden', family: 'claude-hidden-1', showInModelPicker: false }),
			]);

			const models = await service.getModels();

			expect(models).toHaveLength(1);
			const modelIds = models.map(m => m.id).sort();
			expect(modelIds).toEqual(['claude-sonnet-4-model']);
		});
	});

	describe('multiplier', () => {
		it('returns multiplier from endpoint', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-opus-4.5-model', name: 'Claude Opus 4.5', family: 'claude-opus-4.5', multiplier: 5 }),
				createMockEndpoint({ model: 'claude-sonnet-4-model', name: 'Claude Sonnet 4', family: 'claude-sonnet-4', multiplier: 1 }),
			]);

			const models = await service.getModels();

			const opusModel = models.find(m => m.id === 'claude-opus-4.5-model');
			const sonnetModel = models.find(m => m.id === 'claude-sonnet-4-model');

			expect(opusModel?.multiplier).toBe(5);
			expect(sonnetModel?.multiplier).toBe(1);
		});

		it('returns undefined multiplier when not set', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-sonnet-4-model', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
			]);

			const models = await service.getModels();

			expect(models[0].multiplier).toBeUndefined();
		});
	});

	describe('mapSdkModelToEndpointModel', () => {
		it('returns exact match when SDK model ID matches endpoint model ID', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', family: 'claude-opus' }),
			]);

			const result = await service.mapSdkModelToEndpointModel('claude-opus-4-5-20251101');
			expect(result).toBe('claude-opus-4-5-20251101');
		});

		it('returns case-insensitive match', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-opus-4.5', name: 'Claude Opus 4.5', family: 'claude-opus' }),
			]);

			const result = await service.mapSdkModelToEndpointModel('CLAUDE-OPUS-4.5');
			expect(result).toBe('claude-opus-4.5');
		});

		it('maps SDK model with dashes to endpoint model with dots', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', family: 'claude-haiku' }),
			]);

			const result = await service.mapSdkModelToEndpointModel('claude-haiku-4-5-20251001');
			expect(result).toBe('claude-haiku-4.5');
		});

		it('maps SDK model with date suffix to endpoint model', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-sonnet-3.5', name: 'Claude Sonnet 3.5', family: 'claude-sonnet' }),
			]);

			const result = await service.mapSdkModelToEndpointModel('claude-3-5-sonnet-20241022');
			expect(result).toBe('claude-sonnet-3.5');
		});

		it('returns exact version match when available', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-haiku-3.5', name: 'Claude Haiku 3.5', family: 'claude-haiku' }),
				createMockEndpoint({ model: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', family: 'claude-haiku' }),
			]);

			const result = await service.mapSdkModelToEndpointModel('claude-haiku-4-5-20251001');
			expect(result).toBe('claude-haiku-4.5');
		});

		it('falls back to first (latest) model in family when exact version not found', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-opus-4.5', name: 'Claude Opus 4.5', family: 'claude-opus' }),
				createMockEndpoint({ model: 'claude-opus-3.5', name: 'Claude Opus 3.5', family: 'claude-opus' }),
			]);

			const result = await service.mapSdkModelToEndpointModel('claude-opus-5-0-20251101');
			expect(result).toBe('claude-opus-4.5');
		});

		it('returns undefined when family not found', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-opus-4.5', name: 'Claude Opus 4.5', family: 'claude-opus' }),
			]);

			const result = await service.mapSdkModelToEndpointModel('claude-haiku-4-5-20251001');
			expect(result).toBeUndefined();
		});

		it('returns undefined when SDK model ID cannot be normalized', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-opus-4.5', name: 'Claude Opus 4.5', family: 'claude-opus' }),
			]);

			const result = await service.mapSdkModelToEndpointModel('invalid-model-id');
			expect(result).toBeUndefined();
		});

		it('handles claude-{family}-{major} format', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-sonnet-4', name: 'Claude Sonnet 4', family: 'claude-sonnet' }),
			]);

			const result = await service.mapSdkModelToEndpointModel('claude-sonnet-4-20250514');
			expect(result).toBe('claude-sonnet-4');
		});

		it('handles claude-{major}-{family} format', async () => {
			const service = createServiceWithEndpoints([
				createMockEndpoint({ model: 'claude-opus-3', name: 'Claude Opus 3', family: 'claude-opus' }),
			]);

			const result = await service.mapSdkModelToEndpointModel('claude-3-opus-20240229');
			expect(result).toBe('claude-opus-3');
		});
	});

	describe('registerLanguageModelChatProvider', () => {
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

		it.skip('sets isDefault to true for the default model', async () => {
			const { service } = createServiceWithRefreshableEndpoints([
				createMockEndpoint({ model: 'claude-opus-4.5-model', name: 'Claude Opus 4.5', family: 'claude-opus-4.5' }),
				createMockEndpoint({ model: 'claude-sonnet-4-model', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
			]);
			const { lm, getCapturedProvider } = createMockLm();

			const info = await getProviderInfo(service, lm, getCapturedProvider);

			// Sonnet should be the default
			const sonnet = info.find(i => i.id === 'claude-sonnet-4-model')!;
			const opus = info.find(i => i.id === 'claude-opus-4.5-model')!;
			expect(sonnet.isDefault).toBe(true);
			expect(opus.isDefault).toBe(false);
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
	});

	describe('cache invalidation on onDidModelsRefresh', () => {
		it('returns updated models after refresh', async () => {
			const initialEndpoints = [
				createMockEndpoint({ model: 'claude-sonnet-4-model', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
			];
			const endpointProvider = new RefreshableMockEndpointProvider(initialEndpoints);
			const serviceCollection = store.add(createExtensionUnitTestingServices());
			serviceCollection.set(IEndpointProvider, endpointProvider);
			const instantiationService = serviceCollection.createTestingAccessor().get(IInstantiationService);
			const service = store.add(instantiationService.createInstance(ClaudeCodeModels));

			// Initial fetch
			const modelsBefore = await service.getModels();
			expect(modelsBefore).toHaveLength(1);

			// Update endpoints and fire refresh
			endpointProvider.setEndpoints([
				createMockEndpoint({ model: 'claude-sonnet-4-model', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
				createMockEndpoint({ model: 'claude-opus-4.5-model', name: 'Claude Opus 4.5', family: 'claude-opus-4.5' }),
			]);
			endpointProvider.fireRefresh();

			// After refresh, stale cache should be cleared
			const modelsAfter = await service.getModels();
			expect(modelsAfter).toHaveLength(2);
		});

		it('returns cached models when no refresh has occurred', async () => {
			let fetchCount = 0;
			const endpointProvider = new RefreshableMockEndpointProvider([
				createMockEndpoint({ model: 'claude-sonnet-4-model', name: 'Claude Sonnet 4', family: 'claude-sonnet-4' }),
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

			await service.getModels();
			await service.getModels();

			// Should only have fetched once due to caching
			expect(fetchCount).toBe(1);
		});
	});
});
