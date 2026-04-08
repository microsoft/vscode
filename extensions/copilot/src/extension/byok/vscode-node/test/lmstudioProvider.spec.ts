/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { LMStudioLMProvider } from '../lmstudioProvider';

describe('LMStudioLMProvider', () => {
	const lmStudioBaseUrl = 'http://localhost:1234/v1';

	function createProvider(fetch: ReturnType<typeof vi.fn>) {
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

		return new LMStudioLMProvider(
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
	}

	it('returns models from /models endpoint', async () => {
		const fetch = vi.fn(async (url: string) => {
			if (url === `${lmStudioBaseUrl}/models`) {
				return {
					json: async () => ({
						data: [
							{ id: 'qwen2.5-coder-7b-instruct' },
							{ id: 'llama-3.1-8b-instruct' },
						],
					})
				};
			}
			throw new Error(`Unexpected URL in test: ${url}`);
		});

		const provider = createProvider(fetch);
		const tokenSource = new vscode.CancellationTokenSource();
		const models = await provider.provideLanguageModelChatInformation(
			{
				silent: false,
				configuration: { url: lmStudioBaseUrl },
			},
			tokenSource.token
		);

		expect(models.map(model => model.id)).toEqual([
			'qwen2.5-coder-7b-instruct',
			'llama-3.1-8b-instruct',
		]);
	});

	it('skips invalid model entries without id', async () => {
		const fetch = vi.fn(async (url: string) => {
			if (url === `${lmStudioBaseUrl}/models`) {
				return {
					json: async () => ({
						data: [
							{ id: 'good-model-a' },
							{} as { id?: string },
							{ id: 'good-model-b' },
						],
					})
				};
			}
			throw new Error(`Unexpected URL in test: ${url}`);
		});

		const provider = createProvider(fetch);
		const tokenSource = new vscode.CancellationTokenSource();
		const models = await provider.provideLanguageModelChatInformation(
			{
				silent: false,
				configuration: { url: lmStudioBaseUrl },
			},
			tokenSource.token
		);

		expect(models.map(model => model.id)).toEqual(['good-model-a', 'good-model-b']);
	});

	it('throws friendly error when endpoint is unavailable', async () => {
		const fetch = vi.fn(async () => {
			throw new Error('connect ECONNREFUSED');
		});

		const provider = createProvider(fetch);
		const tokenSource = new vscode.CancellationTokenSource();

		await expect(
			provider.provideLanguageModelChatInformation(
				{
					silent: false,
					configuration: { url: lmStudioBaseUrl },
				},
				tokenSource.token
			)
		).rejects.toThrow('Failed to fetch models from LM Studio. Please ensure LM Studio is running and the server is enabled.');
	});
});
