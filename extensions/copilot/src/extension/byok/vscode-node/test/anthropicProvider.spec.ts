/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { IToolDeferralService } from '../../../../platform/networking/common/toolDeferralService';
import { NoopOTelService, resolveOTelConfig } from '../../../../platform/otel/common/index';
import type { CapturingToken } from '../../../../platform/requestLogger/common/capturingToken';
import type { IRequestLogger } from '../../../../platform/requestLogger/common/requestLogger';
import { NullExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { NullTelemetryService } from '../../../../platform/telemetry/common/nullTelemetryService';
import type { TelemetryDestination, TelemetryEventMeasurements, TelemetryEventProperties } from '../../../../platform/telemetry/common/telemetry';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { BYOKKnownModels } from '../../common/byokProvider';
import type { ExtendedLanguageModelChatInformation, LanguageModelChatConfiguration } from '../abstractLanguageModelChatProvider';
import type { IBYOKStorageService } from '../byokStorageService';

type AnthropicStreamChunk =
	| { type: 'message_start'; message: { usage: { input_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } } }
	| { type: 'content_block_start'; content_block: { type: string; id?: string; name?: string } }
	| { type: 'content_block_delta'; delta: { type: 'text_delta'; text: string } | { type: 'input_json_delta'; partial_json: string } | { type: 'thinking_delta'; thinking: string } }
	| { type: 'content_block_stop' }
	| { type: 'message_delta'; usage: { output_tokens: number } };

type AnthropicModelInfo = { id: string; display_name: string };

type MockAnthropicConstructor = {
	streamChunks: AnthropicStreamChunk[];
	modelListData: AnthropicModelInfo[];
	modelsListError: Error | undefined;
};

vi.mock('@anthropic-ai/sdk', () => {
	class MockAnthropic {
		public static streamChunks: AnthropicStreamChunk[] = [];
		public static modelListData: AnthropicModelInfo[] = [];
		public static modelsListError: Error | undefined = undefined;

		public readonly baseURL = 'https://api.anthropic.com';
		public readonly models = {
			list: async () => {
				if (MockAnthropic.modelsListError) {
					throw MockAnthropic.modelsListError;
				}
				return { data: MockAnthropic.modelListData };
			},
		};
		public readonly beta = {
			messages: {
				create: async () => (async function* () {
					for (const chunk of MockAnthropic.streamChunks) {
						yield chunk;
					}
				})()
			}
		};

		constructor(_opts: { apiKey?: string }) { }
	}

	return {
		default: MockAnthropic,
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

function createModel(overrides?: Partial<ExtendedLanguageModelChatInformation<LanguageModelChatConfiguration>>): ExtendedLanguageModelChatInformation<LanguageModelChatConfiguration> {
	return {
		id: 'claude-sonnet-4-5',
		name: 'Claude Sonnet 4.5',
		family: 'Claude',
		version: '1.0.0',
		maxInputTokens: 1000,
		maxOutputTokens: 1000,
		capabilities: { toolCalling: false, imageInput: false },
		configuration: { apiKey: 'k_test' },
		...overrides,
	};
}

async function getMockAnthropic(): Promise<MockAnthropicConstructor> {
	return (await import('@anthropic-ai/sdk')).default as unknown as MockAnthropicConstructor;
}

async function createProvider(telemetry: RecordingTelemetryService, knownModels?: BYOKKnownModels, storage?: IBYOKStorageService) {
	const { AnthropicLMProvider } = await import('../anthropicProvider');
	return new AnthropicLMProvider(
		knownModels,
		storage ?? createStorageService(),
		new TestLogService(),
		createRequestLogger(),
		new DefaultsOnlyConfigurationService(),
		new NullExperimentationService(),
		telemetry,
		new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '1.0.0', sessionId: 'test' })),
		{ _serviceBrand: undefined, isNonDeferredTool: () => true } satisfies IToolDeferralService,
	);
}

interface RunResult {
	progress: TestProgress;
	successMeasurements: TelemetryEventMeasurements | undefined;
	successProperties: TelemetryEventProperties | undefined;
}

async function runAnthropicRequest(options?: {
	chunks?: AnthropicStreamChunk[];
	telemetryTurn?: number;
	model?: ExtendedLanguageModelChatInformation<LanguageModelChatConfiguration>;
}): Promise<RunResult> {
	const MockAnthropic = await getMockAnthropic();
	MockAnthropic.streamChunks = options?.chunks ?? [
		{ type: 'message_start', message: { usage: { input_tokens: 11, cache_read_input_tokens: 2 } } },
		{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello from Anthropic' } },
		{ type: 'message_delta', usage: { output_tokens: 7 } }
	];

	const telemetry = new RecordingTelemetryService();
	const provider = await createProvider(telemetry);
	const messages: vscode.LanguageModelChatMessage[] = [
		new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, 'hello')
	];

	const progress = new TestProgress();
	const tokenSource = new vscode.CancellationTokenSource();
	try {
		await provider.provideLanguageModelChatResponse(
			options?.model ?? createModel(),
			messages,
			{
				requestInitiator: 'test',
				tools: [],
				toolMode: vscode.LanguageModelChatToolMode.Auto,
				...(options?.telemetryTurn !== undefined ? { modelOptions: { _telemetryTurn: options.telemetryTurn } } : {})
			},
			progress,
			tokenSource.token
		);
	} finally {
		tokenSource.dispose();
	}

	const successEvent = telemetry.events.find(event => event.eventName === 'response.success');
	return { progress, successMeasurements: successEvent?.measurements, successProperties: successEvent?.properties };
}

describe('AnthropicLMProvider', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const MockAnthropic = await getMockAnthropic();
		MockAnthropic.streamChunks = [];
		MockAnthropic.modelListData = [];
		MockAnthropic.modelsListError = undefined;
	});

	describe('provideLanguageModelChatResponse', () => {
		it('streams text deltas to progress', async () => {
			const { progress } = await runAnthropicRequest({
				chunks: [
					{ type: 'message_start', message: { usage: { input_tokens: 5 } } },
					{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
					{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } },
					{ type: 'message_delta', usage: { output_tokens: 2 } }
				]
			});

			const text = progress.items
				.filter((i): i is vscode.LanguageModelTextPart => i instanceof vscode.LanguageModelTextPart)
				.map(i => i.value)
				.join('');
			expect(text).toBe('Hello world');
		}, 30_000);

		it('emits a tool call part when a tool_use block completes', async () => {
			const { progress } = await runAnthropicRequest({
				chunks: [
					{ type: 'message_start', message: { usage: { input_tokens: 5 } } },
					{ type: 'content_block_start', content_block: { type: 'tool_use', id: 'tool_1', name: 'doThing' } },
					{ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"a":' } },
					{ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '1}' } },
					{ type: 'message_delta', usage: { output_tokens: 3 } }
				]
			});

			const toolCalls = progress.items.filter((i): i is vscode.LanguageModelToolCallPart => i instanceof vscode.LanguageModelToolCallPart);
			expect(toolCalls).toHaveLength(1);
			expect(toolCalls[0].callId).toBe('tool_1');
			expect(toolCalls[0].name).toBe('doThing');
			expect(toolCalls[0].input).toEqual({ a: 1 });
		}, 30_000);

		it('streams thinking deltas as thinking parts', async () => {
			const { progress } = await runAnthropicRequest({
				chunks: [
					{ type: 'message_start', message: { usage: { input_tokens: 5 } } },
					{ type: 'content_block_start', content_block: { type: 'thinking' } },
					{ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'let me think' } },
					{ type: 'content_block_stop' },
					{ type: 'message_delta', usage: { output_tokens: 1 } }
				]
			});

			const thinking = progress.items
				.filter((i): i is vscode.LanguageModelThinkingPart => i instanceof vscode.LanguageModelThinkingPart)
				.map(i => i.value)
				.join('');
			expect(thinking).toBe('let me think');
		}, 30_000);

		it('reports usage measurements in response.success telemetry', async () => {
			const { successMeasurements, successProperties } = await runAnthropicRequest();

			expect(successProperties?.source).toBe('byok.anthropic');
			expect(successMeasurements?.promptTokenCount).toBe(13); // input_tokens (11) + cache_read_input_tokens (2)
			expect(successMeasurements?.promptCacheTokenCount).toBe(2);
			expect(successMeasurements?.completionTokens).toBe(7);
			expect(successMeasurements?.tokenCount).toBe(20); // prompt (13) + output (7)
			expect(successMeasurements?.isBYOK).toBe(1);
		}, 30_000);

		it('emits response.success telemetry with the forwarded turn measurement', async () => {
			const { successMeasurements } = await runAnthropicRequest({ telemetryTurn: 3 });

			expect(successMeasurements?.turn).toBe(3);
		}, 30_000);

		it('omits response.success turn telemetry when no turn is forwarded', async () => {
			const { successMeasurements } = await runAnthropicRequest();

			expect(Object.prototype.hasOwnProperty.call(successMeasurements ?? {}, 'turn')).toBe(false);
		}, 30_000);

		it('throws when the model has no API key configured', async () => {
			const telemetry = new RecordingTelemetryService();
			const provider = await createProvider(telemetry);
			const tokenSource = new vscode.CancellationTokenSource();
			try {
				await expect(provider.provideLanguageModelChatResponse(
					createModel({ configuration: {} }),
					[new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, 'hi')],
					{ requestInitiator: 'test', tools: [], toolMode: vscode.LanguageModelChatToolMode.Auto },
					new TestProgress(),
					tokenSource.token
				)).rejects.toThrow('API key not found for the model');
			} finally {
				tokenSource.dispose();
			}
		}, 30_000);
	});

	describe('provideLanguageModelChatInformation', () => {
		it('returns no models when running silently without an API key', async () => {
			const telemetry = new RecordingTelemetryService();
			const provider = await createProvider(telemetry);
			const tokenSource = new vscode.CancellationTokenSource();
			try {
				const models = await provider.provideLanguageModelChatInformation({ silent: true }, tokenSource.token);
				expect(models).toEqual([]);
			} finally {
				tokenSource.dispose();
			}
		}, 30_000);

		it('uses known capabilities for known models and generic capabilities otherwise', async () => {
			const MockAnthropic = await getMockAnthropic();
			MockAnthropic.modelListData = [
				{ id: 'claude-known', display_name: 'Known Display' },
				{ id: 'claude-unknown', display_name: 'Unknown Display' },
			];
			const knownModels: BYOKKnownModels = {
				'claude-known': { name: 'Known Model', maxInputTokens: 50, maxOutputTokens: 60, toolCalling: true, vision: true, thinking: false },
			};

			const telemetry = new RecordingTelemetryService();
			const provider = await createProvider(telemetry, knownModels);
			const tokenSource = new vscode.CancellationTokenSource();
			try {
				const models = await provider.provideLanguageModelChatInformation({ silent: false, configuration: { apiKey: 'k_test' } }, tokenSource.token);

				const known = models.find(m => m.id === 'claude-known');
				const unknown = models.find(m => m.id === 'claude-unknown');

				expect(known?.name).toBe('Known Model');
				expect(known?.maxInputTokens).toBe(50);
				expect(known?.capabilities?.imageInput).toBe(true);

				expect(unknown?.name).toBe('Unknown Display');
				expect(unknown?.maxInputTokens).toBe(100000);
				expect(unknown?.capabilities?.imageInput).toBe(false);
				expect(unknown?.capabilities?.toolCalling).toBe(true);
			} finally {
				tokenSource.dispose();
			}
		}, 30_000);

		it('propagates errors from the Anthropic models list call', async () => {
			const MockAnthropic = await getMockAnthropic();
			MockAnthropic.modelsListError = new Error('boom');

			const telemetry = new RecordingTelemetryService();
			const provider = await createProvider(telemetry);
			const tokenSource = new vscode.CancellationTokenSource();
			try {
				await expect(provider.provideLanguageModelChatInformation({ silent: false, configuration: { apiKey: 'k_test' } }, tokenSource.token))
					.rejects.toThrow('boom');
			} finally {
				tokenSource.dispose();
			}
		}, 30_000);
	});

	describe('provideTokenCount', () => {
		it('estimates token count as roughly a quarter of the character length', async () => {
			const telemetry = new RecordingTelemetryService();
			const provider = await createProvider(telemetry);
			const tokenSource = new vscode.CancellationTokenSource();
			try {
				const count = await provider.provideTokenCount(createModel(), 'abcdefgh', tokenSource.token);
				expect(count).toBe(2);
			} finally {
				tokenSource.dispose();
			}
		}, 30_000);
	});
});
