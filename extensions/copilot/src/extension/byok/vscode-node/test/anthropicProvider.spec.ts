/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { IToolDeferralService } from '../../../../platform/networking/common/toolDeferralService';
import { CopilotChatAttr, GenAiAttr, NoopOTelService, resolveOTelConfig } from '../../../../platform/otel/common/index';
import type { IOTelService } from '../../../../platform/otel/common/otelService';
import { CapturingOTelService } from '../../../../platform/otel/common/test/capturingOTelService';
import { CapturingToken } from '../../../../platform/requestLogger/common/capturingToken';
import type { IRequestLogger } from '../../../../platform/requestLogger/common/requestLogger';
import { runWithCapturingToken, storeCapturingTokenForCorrelation } from '../../../../platform/requestLogger/node/requestLogger';
import { NullExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { NullTelemetryService } from '../../../../platform/telemetry/common/nullTelemetryService';
import type { TelemetryDestination, TelemetryEventMeasurements, TelemetryEventProperties } from '../../../../platform/telemetry/common/telemetry';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import type { ExtendedLanguageModelChatInformation, LanguageModelChatConfiguration } from '../abstractLanguageModelChatProvider';
import type { IBYOKStorageService } from '../byokStorageService';

type AnthropicStreamChunk =
	| { type: 'message_start'; message: { usage: { input_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } } }
	| { type: 'content_block_delta'; delta: { type: 'text_delta'; text: string } }
	| { type: 'message_delta'; usage: { output_tokens: number } };

type MockAnthropicConstructor = {
	streamChunks: AnthropicStreamChunk[];
};

vi.mock('@anthropic-ai/sdk', () => {
	class MockAnthropic {
		public static streamChunks: AnthropicStreamChunk[] = [];

		public readonly baseURL = 'https://api.anthropic.com';
		public readonly models = {
			list: async () => ({ data: [] }),
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

function createModel(): ExtendedLanguageModelChatInformation<LanguageModelChatConfiguration> {
	return {
		id: 'claude-sonnet-4-5',
		name: 'Claude Sonnet 4.5',
		family: 'Claude',
		version: '1.0.0',
		maxInputTokens: 1000,
		maxOutputTokens: 1000,
		capabilities: { toolCalling: false, imageInput: false },
		configuration: { apiKey: 'k_test' }
	};
}

async function runAnthropicRequest(options: { telemetryTurn?: number; otel?: IOTelService; capturingCorrelationId?: string } = {}): Promise<TelemetryEventMeasurements | undefined> {
	const { telemetryTurn, otel, capturingCorrelationId } = options;
	const { AnthropicLMProvider } = await import('../anthropicProvider');
	const MockAnthropic = (await import('@anthropic-ai/sdk')).default as unknown as MockAnthropicConstructor;
	MockAnthropic.streamChunks = [
		{
			type: 'message_start',
			message: {
				usage: {
					input_tokens: 11,
					cache_read_input_tokens: 2,
				}
			}
		},
		{
			type: 'content_block_delta',
			delta: { type: 'text_delta', text: 'Hello from Anthropic' }
		},
		{
			type: 'message_delta',
			usage: { output_tokens: 7 }
		}
	];

	const telemetry = new RecordingTelemetryService();
	const provider = new AnthropicLMProvider(
		undefined,
		createStorageService(),
		new TestLogService(),
		createRequestLogger(),
		new DefaultsOnlyConfigurationService(),
		new NullExperimentationService(),
		telemetry,
		otel ?? new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '1.0.0', sessionId: 'test' })),
		{ _serviceBrand: undefined, isNonDeferredTool: () => true } satisfies IToolDeferralService,
	);
	const messages: vscode.LanguageModelChatMessage[] = [
		new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, 'hello')
	];

	const modelOptions: Record<string, unknown> = {};
	if (telemetryTurn !== undefined) {
		modelOptions._telemetryTurn = telemetryTurn;
	}
	if (capturingCorrelationId !== undefined) {
		modelOptions._capturingTokenCorrelationId = capturingCorrelationId;
	}

	const tokenSource = new vscode.CancellationTokenSource();
	try {
		await provider.provideLanguageModelChatResponse(
			createModel(),
			messages,
			{
				requestInitiator: 'test',
				tools: [],
				toolMode: vscode.LanguageModelChatToolMode.Auto,
				...(Object.keys(modelOptions).length ? { modelOptions } : {})
			},
			new TestProgress(),
			tokenSource.token
		);
	} finally {
		tokenSource.dispose();
	}

	return telemetry.events.find(event => event.eventName === 'response.success')?.measurements;
}

/**
 * Registers a CapturingToken carrying `chatSessionId` under a correlation id so
 * the provider retrieves it via `_capturingTokenCorrelationId`, mirroring how
 * the real request path threads the token across the IPC boundary.
 */
function registerCapturingToken(correlationId: string, chatSessionId: string | undefined): void {
	const token = new CapturingToken('test', undefined, undefined, undefined, chatSessionId);
	runWithCapturingToken(token, () => storeCapturingTokenForCorrelation(correlationId));
}

describe('AnthropicLMProvider', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('emits response.success telemetry with the forwarded turn measurement', async () => {
		const measurements = await runAnthropicRequest({ telemetryTurn: 3 });

		expect(measurements?.turn).toBe(3);
	}, 30_000);

	it('omits response.success turn telemetry when no turn is forwarded', async () => {
		const measurements = await runAnthropicRequest();

		expect(Object.prototype.hasOwnProperty.call(measurements ?? {}, 'turn')).toBe(false);
	}, 30_000);

	it('stamps session ids on the chat span from the CapturingToken', async () => {
		const otel = new CapturingOTelService();
		registerCapturingToken('corr-anthropic', 'session-xyz');

		await runAnthropicRequest({ otel, capturingCorrelationId: 'corr-anthropic' });

		const chatSpan = otel.spans.find(s => s.name.startsWith('chat '));
		expect(chatSpan?.attributes[GenAiAttr.CONVERSATION_ID]).toBe('session-xyz');
		expect(chatSpan?.attributes[CopilotChatAttr.SESSION_ID]).toBe('session-xyz');
		expect(chatSpan?.attributes[CopilotChatAttr.CHAT_SESSION_ID]).toBe('session-xyz');
	}, 30_000);

	it('omits session ids on the chat span when no CapturingToken is available', async () => {
		const otel = new CapturingOTelService();

		await runAnthropicRequest({ otel });

		const chatSpan = otel.spans.find(s => s.name.startsWith('chat '));
		expect(chatSpan).toBeDefined();
		expect(chatSpan?.attributes[GenAiAttr.CONVERSATION_ID]).toBeUndefined();
		expect(chatSpan?.attributes[CopilotChatAttr.SESSION_ID]).toBeUndefined();
		expect(chatSpan?.attributes[CopilotChatAttr.CHAT_SESSION_ID]).toBeUndefined();
	}, 30_000);
});
