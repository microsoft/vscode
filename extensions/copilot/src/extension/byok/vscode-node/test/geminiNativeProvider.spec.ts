/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { CopilotChatAttr, GenAiAttr, NoopOTelService, resolveOTelConfig } from '../../../../platform/otel/common/index';
import type { IOTelService } from '../../../../platform/otel/common/otelService';
import { CapturingOTelService } from '../../../../platform/otel/common/test/capturingOTelService';
import { CapturingToken } from '../../../../platform/requestLogger/common/capturingToken';
import type { IRequestLogger } from '../../../../platform/requestLogger/common/requestLogger';
import { runWithCapturingToken, storeCapturingTokenForCorrelation } from '../../../../platform/requestLogger/node/requestLogger';
import { NullTelemetryService } from '../../../../platform/telemetry/common/nullTelemetryService';
import type { TelemetryDestination, TelemetryEventMeasurements, TelemetryEventProperties } from '../../../../platform/telemetry/common/telemetry';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import type { IBYOKStorageService } from '../byokStorageService';

const mockHandleAPIKeyUpdate = vi.fn();

vi.mock('@google/genai', () => {
	class MockGoogleGenAI {
		public static createdWithApiKeys: string[] = [];
		public static streamChunks: any[] = [];
		public static listModelsResult: AsyncIterable<any> = (async function* () { })();

		public readonly apiKey: string;
		public readonly models: {
			list: () => Promise<AsyncIterable<any>>;
			generateContentStream: (params: unknown) => Promise<AsyncIterable<any>>;
		};

		constructor(opts: { apiKey: string }) {
			this.apiKey = opts.apiKey;
			MockGoogleGenAI.createdWithApiKeys.push(opts.apiKey);
			this.models = {
				list: async () => MockGoogleGenAI.listModelsResult,
				generateContentStream: async () => (async function* () {
					for (const c of MockGoogleGenAI.streamChunks) {
						yield c;
					}
				})()
			};
		}
	}

	return {
		GoogleGenAI: MockGoogleGenAI,
		Type: { OBJECT: 'object' },
	};
});

vi.mock('../../common/byokProvider', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../common/byokProvider')>();
	return {
		...actual,
		handleAPIKeyUpdate: mockHandleAPIKeyUpdate,
	};
});

type ProgressItem = vscode.LanguageModelResponsePart2;

class TestProgress implements vscode.Progress<ProgressItem> {
	public readonly items: ProgressItem[] = [];
	report(value: ProgressItem): void {
		this.items.push(value);
	}
}

class RecordingTelemetryService extends NullTelemetryService {
	public readonly events: { eventName: string; destination: TelemetryDestination; properties?: TelemetryEventProperties; measurements?: TelemetryEventMeasurements }[] = [];

	override sendTelemetryEvent(eventName: string, destination: TelemetryDestination, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void {
		this.events.push({ eventName, destination, properties, measurements });
	}
}

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

function createRequestLogger(): IRequestLogger {
	const didChangeEmitter = new vscode.EventEmitter<void>();
	return {
		_serviceBrand: undefined,
		promptRendererTracing: false,
		captureInvocation: async <T>(_request: CapturingToken, fn: () => Promise<T>) => fn(),
		logToolCall: () => undefined,
		logModelListCall: () => undefined,
		logChatRequest: () => ({
			markTimeToFirstToken: () => undefined,
			resolveWithCancelation: () => undefined,
			resolve: () => undefined,
		}),
		addPromptTrace: () => undefined,
		addEntry: () => undefined,
		onDidChangeRequests: didChangeEmitter.event,
		getRequests: () => [],
		enableWorkspaceEditTracing: () => undefined,
		disableWorkspaceEditTracing: () => undefined,
	} as unknown as IRequestLogger;
}

describe('GeminiNativeBYOKLMProvider', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	async function runGeminiRequest(options: { otel?: IOTelService; capturingCorrelationId?: string } = {}): Promise<void> {
		const { otel, capturingCorrelationId } = options;
		const { GeminiNativeBYOKLMProvider } = await import('../geminiNativeProvider');
		const genai = await import('@google/genai');
		const MockGoogleGenAI = genai.GoogleGenAI as unknown as { streamChunks: any[] };
		MockGoogleGenAI.streamChunks.length = 0;
		MockGoogleGenAI.streamChunks.push({
			candidates: [{ content: { parts: [{ text: 'Hello from Gemini' }] } }],
			usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18, cachedContentTokenCount: 2 }
		});

		const provider = new GeminiNativeBYOKLMProvider(
			undefined,
			createStorageService(),
			new TestLogService(),
			createRequestLogger(),
			new NullTelemetryService(),
			otel ?? new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '1.0.0', sessionId: 'test' })),
		);
		const model = {
			id: 'gemini-2.0-flash',
			name: 'Gemini 2.0 Flash',
			family: 'Gemini',
			version: '1.0.0',
			maxInputTokens: 1000,
			maxOutputTokens: 1000,
			capabilities: { toolCalling: false, imageInput: false },
			configuration: { apiKey: 'k_test' }
		} as any;
		const messages: vscode.LanguageModelChatMessage[] = [
			new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, 'hello')
		];
		const modelOptions: Record<string, unknown> = {};
		if (capturingCorrelationId !== undefined) {
			modelOptions._capturingTokenCorrelationId = capturingCorrelationId;
		}

		const tokenSource = new vscode.CancellationTokenSource();
		try {
			await provider.provideLanguageModelChatResponse(
				model,
				messages,
				{ requestInitiator: 'test', tools: [], toolMode: vscode.LanguageModelChatToolMode.Auto, ...(Object.keys(modelOptions).length ? { modelOptions } : {}) } as any,
				new TestProgress(),
				tokenSource.token
			);
		} finally {
			tokenSource.dispose();
		}
	}

	function registerCapturingToken(correlationId: string, chatSessionId: string | undefined): void {
		const token = new CapturingToken('test', undefined, undefined, undefined, chatSessionId);
		runWithCapturingToken(token, () => storeCapturingTokenForCorrelation(correlationId));
	}

	it('stamps session ids on the chat span from the CapturingToken', async () => {
		const otel = new CapturingOTelService();
		registerCapturingToken('corr-gemini', 'session-xyz');

		await runGeminiRequest({ otel, capturingCorrelationId: 'corr-gemini' });

		const chatSpan = otel.spans.find(s => s.name.startsWith('chat '));
		expect(chatSpan?.attributes[GenAiAttr.CONVERSATION_ID]).toBe('session-xyz');
		expect(chatSpan?.attributes[CopilotChatAttr.SESSION_ID]).toBe('session-xyz');
		expect(chatSpan?.attributes[CopilotChatAttr.CHAT_SESSION_ID]).toBe('session-xyz');
	}, 30_000);

	it('omits session ids on the chat span when no CapturingToken is available', async () => {
		const otel = new CapturingOTelService();

		await runGeminiRequest({ otel });

		const chatSpan = otel.spans.find(s => s.name.startsWith('chat '));
		expect(chatSpan).toBeDefined();
		expect(chatSpan?.attributes[GenAiAttr.CONVERSATION_ID]).toBeUndefined();
		expect(chatSpan?.attributes[CopilotChatAttr.SESSION_ID]).toBeUndefined();
		expect(chatSpan?.attributes[CopilotChatAttr.CHAT_SESSION_ID]).toBeUndefined();
	}, 30_000);

	it('emits response.success telemetry with the forwarded turn measurement', async () => {
		const { GeminiNativeBYOKLMProvider } = await import('../geminiNativeProvider');
		const genai = await import('@google/genai');
		const MockGoogleGenAI = genai.GoogleGenAI as unknown as { streamChunks: any[] };
		MockGoogleGenAI.streamChunks.length = 0;
		MockGoogleGenAI.streamChunks.push({
			candidates: [{
				content: { parts: [{ text: 'Hello from Gemini' }] }
			}],
			usageMetadata: {
				promptTokenCount: 11,
				candidatesTokenCount: 7,
				totalTokenCount: 18,
				cachedContentTokenCount: 2
			}
		});

		const telemetry = new RecordingTelemetryService();
		const provider = new GeminiNativeBYOKLMProvider(undefined, createStorageService(), new TestLogService(), createRequestLogger(), telemetry, new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '1.0.0', sessionId: 'test' })));
		const model = {
			id: 'gemini-2.0-flash',
			name: 'Gemini 2.0 Flash',
			family: 'Gemini',
			version: '1.0.0',
			maxInputTokens: 1000,
			maxOutputTokens: 1000,
			capabilities: { toolCalling: false, imageInput: false },
			configuration: { apiKey: 'k_test' }
		} as any;
		const messages: vscode.LanguageModelChatMessage[] = [
			new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, 'hello')
		];

		const tokenSource = new vscode.CancellationTokenSource();
		try {
			await provider.provideLanguageModelChatResponse(
				model,
				messages,
				{ requestInitiator: 'test', tools: [], toolMode: vscode.LanguageModelChatToolMode.Auto, modelOptions: { _telemetryTurn: 3 } } as any,
				new TestProgress(),
				tokenSource.token
			);
		} finally {
			tokenSource.dispose();
		}

		const responseSuccessEvent = telemetry.events.find(event => event.eventName === 'response.success');
		expect(responseSuccessEvent).toBeDefined();
		expect(responseSuccessEvent?.measurements?.turn).toBe(3);
	}, 30_000);

	it.skip('throws a clear error when no API key is configured (no silent return)', async () => {
		const { GeminiNativeBYOKLMProvider } = await import('../geminiNativeProvider');
		const storage = createStorageService({ getAPIKey: vi.fn().mockResolvedValue(undefined) });
		const provider = new GeminiNativeBYOKLMProvider(undefined, storage, new TestLogService(), createRequestLogger(), new NullTelemetryService(), new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '1.0.0', sessionId: 'test' })));

		const model: vscode.LanguageModelChatInformation = {
			id: 'gemini-2.0-flash',
			name: 'Gemini 2.0 Flash',
			family: 'Gemini',
			version: '1.0.0',
			maxInputTokens: 1000,
			maxOutputTokens: 1000,
			capabilities: { toolCalling: false, imageInput: false }
		};
		const messages: vscode.LanguageModelChatMessage[] = [
			new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, 'hello')
		];

		const tokenSource = new vscode.CancellationTokenSource();
		const progress = new TestProgress();
		await expect(provider.provideLanguageModelChatResponse(
			model,
			messages,
			{ requestInitiator: 'test', tools: [], toolMode: vscode.LanguageModelChatToolMode.Auto },
			progress,
			tokenSource.token
		)).rejects.toThrow(/No API key configured/i);
	});

	// it.skip('initializes the Gemini client on API key update and can stream a response', async () => {
	// 	const { GeminiNativeBYOKLMProvider } = await import('../geminiNativeProvider');
	// 	const genai = await import('@google/genai');
	// 	const MockGoogleGenAI = genai.GoogleGenAI as unknown as { createdWithApiKeys: string[]; streamChunks: any[] };
	// 	MockGoogleGenAI.createdWithApiKeys.length = 0;
	// 	MockGoogleGenAI.streamChunks.length = 0;
	// 	MockGoogleGenAI.streamChunks.push({
	// 		candidates: [{
	// 			content: { parts: [{ text: 'Hello from Gemini' }] }
	// 		}]
	// 	});

	// 	mockHandleAPIKeyUpdate.mockResolvedValue({ apiKey: 'k_test', deleted: false, cancelled: false });

	// 	const storage = createStorageService({ getAPIKey: vi.fn().mockResolvedValue('k_test') });
	// 	const provider = new GeminiNativeBYOKLMProvider(undefined, storage, new TestLogService(), createRequestLogger());

	// 	await provider.updateAPIKey();
	// 	expect(MockGoogleGenAI.createdWithApiKeys).toEqual(['k_test']);

	// 	const model: vscode.LanguageModelChatInformation = {
	// 		id: 'gemini-2.0-flash',
	// 		name: 'Gemini 2.0 Flash',
	// 		family: 'Gemini',
	// 		version: '1.0.0',
	// 		maxInputTokens: 1000,
	// 		maxOutputTokens: 1000,
	// 		capabilities: { toolCalling: false, imageInput: false }
	// 	};
	// 	const messages: vscode.LanguageModelChatMessage[] = [
	// 		new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, 'hello')
	// 	];

	// 	const tokenSource = new vscode.CancellationTokenSource();
	// 	const progress = new TestProgress();
	// 	await provider.provideLanguageModelChatResponse(
	// 		model,
	// 		messages,
	// 		{ requestInitiator: 'test', tools: [], toolMode: vscode.LanguageModelChatToolMode.Auto },
	// 		progress,
	// 		tokenSource.token
	// 	);

	// 	expect(progress.items.some(p => p instanceof vscode.LanguageModelTextPart && p.value.includes('Hello from Gemini'))).toBe(true);
	// });

	// it.skip('clears the client when API key is deleted via update flow', async () => {
	// 	const { GeminiNativeBYOKLMProvider } = await import('../geminiNativeProvider');
	// 	const genai = await import('@google/genai');
	// 	const MockGoogleGenAI = genai.GoogleGenAI as unknown as { createdWithApiKeys: string[]; streamChunks: any[] };
	// 	MockGoogleGenAI.createdWithApiKeys.length = 0;
	// 	MockGoogleGenAI.streamChunks.length = 0;

	// 	const storage = createStorageService({ getAPIKey: vi.fn().mockResolvedValue(undefined) });
	// 	const provider = new GeminiNativeBYOKLMProvider(undefined, storage, new TestLogService(), createRequestLogger());

	// 	// First set a key
	// 	mockHandleAPIKeyUpdate.mockResolvedValueOnce({ apiKey: 'k_initial', deleted: false, cancelled: false });
	// 	await provider.updateAPIKey();
	// 	expect(MockGoogleGenAI.createdWithApiKeys).toEqual(['k_initial']);

	// 	// Then delete it
	// 	mockHandleAPIKeyUpdate.mockResolvedValueOnce({ apiKey: undefined, deleted: true, cancelled: false });
	// 	await provider.updateAPIKey();

	// 	const model: vscode.LanguageModelChatInformation = {
	// 		id: 'gemini-2.0-flash',
	// 		name: 'Gemini 2.0 Flash',
	// 		family: 'Gemini',
	// 		version: '1.0.0',
	// 		maxInputTokens: 1000,
	// 		maxOutputTokens: 1000,
	// 		capabilities: { toolCalling: false, imageInput: false }
	// 	};
	// 	const messages: vscode.LanguageModelChatMessage[] = [
	// 		new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, 'hello')
	// 	];

	// 	const tokenSource = new vscode.CancellationTokenSource();
	// 	const progress = new TestProgress();
	// 	await expect(provider.provideLanguageModelChatResponse(
	// 		model,
	// 		messages,
	// 		{ requestInitiator: 'test', tools: [], toolMode: vscode.LanguageModelChatToolMode.Auto },
	// 		progress,
	// 		tokenSource.token
	// 	)).rejects.toThrow(/No API key configured/i);
	// });

	it.skip('prompts for a new API key when listing models fails with an invalid key', async () => {
		const { GeminiNativeBYOKLMProvider } = await import('../geminiNativeProvider');
		const genai = await import('@google/genai');
		const MockGoogleGenAI = genai.GoogleGenAI as unknown as { listModelsResult: AsyncIterable<any> };
		// Simulate the models.list() call throwing an invalid API key error when iterated
		MockGoogleGenAI.listModelsResult = (async function* () {
			throw new Error('ApiError: {"error":{"message":"API key not valid. Please pass a valid API key.","details":[{"reason":"API_KEY_INVALID"}]}}');
		})();

		const storage = createStorageService({
			getAPIKey: vi.fn().mockResolvedValue('bad_key'),
		});

		mockHandleAPIKeyUpdate.mockResolvedValue({ apiKey: undefined, deleted: false, cancelled: true });

		const provider = new GeminiNativeBYOKLMProvider(undefined, storage, new TestLogService(), createRequestLogger(), new NullTelemetryService(), new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '1.0.0', sessionId: 'test' })));
		const tokenSource = new vscode.CancellationTokenSource();
		const models = await provider.provideLanguageModelChatInformation({ silent: false }, tokenSource.token);

		// When the key is invalid, we should re-prompt for a new one
		// and handle the failure gracefully by returning an empty list.
		expect(models).toEqual([]);
		expect(mockHandleAPIKeyUpdate).toHaveBeenCalled();
	});

	it.skip('retries listing models after re-prompting with a valid API key', async () => {
		const { GeminiNativeBYOKLMProvider } = await import('../geminiNativeProvider');
		const genai = await import('@google/genai');
		const MockGoogleGenAI = genai.GoogleGenAI as unknown as { listModelsResult: AsyncIterable<any> };

		let iterationCount = 0;
		let hasThrown = false;
		const modelId = 'test-model';

		MockGoogleGenAI.listModelsResult = {
			async *[Symbol.asyncIterator]() {
				iterationCount++;
				if (!hasThrown) {
					hasThrown = true;
					throw new Error('ApiError: {"error":{"message":"API key not valid. Please pass a valid API key.","details":[{"reason":"API_KEY_INVALID"}]}}');
				}
				yield { name: modelId };
			}
		};

		const storage = createStorageService({
			getAPIKey: vi.fn().mockResolvedValue('bad_key'),
		});

		mockHandleAPIKeyUpdate.mockResolvedValue({ apiKey: 'k_new', deleted: false, cancelled: false });

		const knownModels = {
			[modelId]: {
				name: 'Test Model',
				maxInputTokens: 1000,
				maxOutputTokens: 1000,
				toolCalling: false,
				vision: false
			}
		};

		const provider = new GeminiNativeBYOKLMProvider(knownModels, storage, new TestLogService(), createRequestLogger(), new NullTelemetryService(), new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '1.0.0', sessionId: 'test' })));
		const tokenSource = new vscode.CancellationTokenSource();
		const models = await provider.provideLanguageModelChatInformation({ silent: false }, tokenSource.token);

		// First attempt should fail with invalid key, then after re-prompting
		// we should retry listing models and succeed with the new key.
		expect(models.map(m => m.id)).toEqual([modelId]);
		expect(iterationCount).toBe(2);
		expect(mockHandleAPIKeyUpdate).toHaveBeenCalled();
	});
});
