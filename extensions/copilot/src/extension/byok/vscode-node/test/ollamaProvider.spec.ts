/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { OllamaLMProvider } from '../ollamaProvider';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../platform/chat/common/blockedExtensionService';
import { IChatMLFetcher } from '../../../../platform/chat/common/chatMLFetcher';
import { IFetcherService, Response } from '../../../../platform/networking/common/fetcherService';
import type { IEndpointBody } from '../../../../platform/networking/common/networking';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatMLFetcherImpl } from '../../../prompt/node/chatMLFetcher';
import { createExtensionUnitTestingServices } from '../../../test/node/services';

it('discovers Ollama thinking and sends compatible effort controls through the real fetcher', async () => {
	const store = new DisposableStore();
	const services = store.add(createExtensionUnitTestingServices());
	services.define(IChatMLFetcher, new SyncDescriptor(ChatMLFetcherImpl));
	services.define(IBlockedExtensionService, new SyncDescriptor(BlockedExtensionService));
	const accessor = store.add(services.createTestingAccessor());
	const provider = accessor.get(IInstantiationService).createInstance(OllamaLMProvider, {
		getAPIKey: async () => undefined, storeAPIKey: async () => {}, deleteAPIKey: async () => {},
		getStoredModelConfigs: async () => ({}), saveModelConfig: async () => {}, removeModelConfig: async () => {},
	});
	const bodies: IEndpointBody[] = [];
	const fetch = vi.spyOn(accessor.get(IFetcherService), 'fetch').mockImplementation(async (url, options) => {
		const json = url === 'http://offline.test/api/version' ? { version: '0.6.4' }
			: url === 'http://offline.test/api/tags' ? { models: [{ model: 'discovered' }] }
				: url === 'http://offline.test/api/show' ? { capabilities: ['thinking', 'tools'], model_info: { 'general.architecture': 'test', 'test.context_length': 128000 } } : undefined;
		if (json) {
			return Response.fromText(200, 'OK', new Headers({ 'content-type': 'application/json' }), JSON.stringify(json), 'node-fetch');
		}
		expect(url).toBe('http://offline.test/v1/chat/completions');
		bodies.push(options?.json as IEndpointBody);
		return Response.fromText(200, 'OK', new Headers({ 'content-type': 'text/event-stream' }), 'data: {"choices":[{"index":0,"delta":{"reasoning_content":"thought","content":"answer"},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', 'node-fetch');
	});
	const token = store.add(new vscode.CancellationTokenSource());
	try {
		const [model] = await provider.provideLanguageModelChatInformation({ silent: true, configuration: { url: 'http://offline.test' } }, token.token);
		for (const modelConfiguration of [{}, { enableThinking: false }, { reasoningEffort: 'high' }]) {
			const parts: vscode.LanguageModelResponsePart2[] = [];
			await provider.provideLanguageModelChatResponse(model, [new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, 'hello')], { requestInitiator: 'core', tools: [], toolMode: vscode.LanguageModelChatToolMode.Auto, modelConfiguration }, { report: part => parts.push(part) }, token.token);
			expect(parts.some(part => part instanceof vscode.LanguageModelThinkingPart && part.value.includes('thought'))).toBe(true);
			expect(parts.some(part => part instanceof vscode.LanguageModelTextPart && part.value === 'answer')).toBe(true);
		}
		expect(bodies.map(body => body.reasoning_effort)).toEqual(['medium', 'none', 'high']);
		for (const body of bodies) {
			expect(body).not.toHaveProperty('think');
		}
	} finally {
		fetch.mockRestore();
		store.dispose();
	}
});

describe('OllamaLMProvider', () => {
	it('returns successful models when one /api/show lookup fails', async () => {
		const ollamaBaseUrl = 'http://localhost:11434';
		const tagsModels = [{ model: 'good-model-a' }, { model: 'bad-model' }, { model: 'good-model-b' }];
		const showCalls: string[] = [];

		const fetch = vi.fn(async (url: string, options: { body?: string }) => {
			if (url === `${ollamaBaseUrl}/api/version`) {
				return { json: async () => ({ version: '0.6.4' }) };
			}
			if (url === `${ollamaBaseUrl}/api/tags`) {
				return { json: async () => ({ models: tagsModels }) };
			}
			if (url === `${ollamaBaseUrl}/api/show`) {
				const modelId = JSON.parse(options.body ?? '{}').model as string;
				showCalls.push(modelId);
				if (modelId === 'bad-model') {
					throw new Error('simulated /api/show failure');
				}
				return {
					json: async () => ({
						template: '',
						capabilities: [],
						details: { family: 'llama' },
						remote_model: modelId,
						model_info: {
							'general.basename': modelId,
							'general.architecture': 'llama',
							'llama.context_length': 8192,
						},
					})
				};
			}
			throw new Error(`Unexpected URL in test: ${url}`);
		});

		const logService = {
			_serviceBrand: undefined,
			trace: vi.fn(),
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			show: vi.fn(),
			createSubLogger: vi.fn(),
			withExtraTarget: vi.fn(),
		};
		logService.createSubLogger.mockReturnValue(logService);
		logService.withExtraTarget.mockReturnValue(logService);

		const provider = new OllamaLMProvider(
			{
				getAPIKey: vi.fn().mockResolvedValue(undefined),
				storeAPIKey: vi.fn().mockResolvedValue(undefined),
				deleteAPIKey: vi.fn().mockResolvedValue(undefined),
				getStoredModelConfigs: vi.fn().mockResolvedValue({}),
				saveModelConfig: vi.fn().mockResolvedValue(undefined),
				removeModelConfig: vi.fn().mockResolvedValue(undefined),
			} as any,
			{ fetch } as any,
			{
				isConfigured: vi.fn().mockReturnValue(false),
				getConfig: vi.fn(),
				setConfig: vi.fn(),
			} as any,
			logService as any,
			{
				createInstance: vi.fn().mockReturnValue({}),
			} as any,
			{} as any
		);

		const tokenSource = new vscode.CancellationTokenSource();
		const models = await provider.provideLanguageModelChatInformation(
			{
				silent: false,
				configuration: { url: ollamaBaseUrl },
			},
			tokenSource.token
		);

		expect(showCalls).toEqual(['good-model-a', 'bad-model', 'good-model-b']);
		expect(models.map(model => model.id)).toEqual(['good-model-a', 'good-model-b']);
	});
});
