/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import type { OpenAI } from 'openai';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { CopilotToken } from '../../../../platform/authentication/common/copilotToken';
import { IFetchMLOptions } from '../../../../platform/chat/common/chatMLFetcher';
import { IChatQuotaService } from '../../../../platform/chat/common/chatQuotaService';
import { ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { IInteractionService } from '../../../../platform/chat/common/interactionService';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { ICAPIClientService } from '../../../../platform/endpoint/common/capiClient';
import { MockAuthenticationService } from '../../../../platform/ignore/node/test/mockAuthenticationService';
import { MockCAPIClientService } from '../../../../platform/ignore/node/test/mockCAPIClientService';
import { ILogService } from '../../../../platform/log/common/logService';
import { FinishedCallback } from '../../../../platform/networking/common/fetch';
import { FetcherId, IFetcherService, IHeaders, Response } from '../../../../platform/networking/common/fetcherService';
import { IChatEndpoint, IEndpointBody } from '../../../../platform/networking/common/networking';
import { NullChatWebSocketManager } from '../../../../platform/networking/node/chatWebSocketManager';
import { NoopOTelService } from '../../../../platform/otel/common/noopOtelService';
import { resolveOTelConfig } from '../../../../platform/otel/common/otelConfig';
import { NullRequestLogger } from '../../../../platform/requestLogger/node/nullRequestLogger';
import { NullExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { TelemetryData } from '../../../../platform/telemetry/common/telemetryData';
import { SpyingTelemetryService } from '../../../../platform/telemetry/node/spyingTelemetryService';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { InstantiationServiceBuilder } from '../../../../util/common/services';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IPowerService, NullPowerService } from '../../../power/common/powerService';
import { ChatMLFetcherImpl } from '../chatMLFetcher';

describe('ChatMLFetcherImpl Response API telemetry', () => {
	let disposables: DisposableStore;
	let fetcher: ChatMLFetcherImpl;
	let mockFetcherService: MockFetcherService;
	let spyingTelemetryService: SpyingTelemetryService;
	let cancellationTokenSource: CancellationTokenSource;

	beforeEach(() => {
		disposables = new DisposableStore();
		cancellationTokenSource = disposables.add(new CancellationTokenSource());

		mockFetcherService = new MockFetcherService();
		spyingTelemetryService = new SpyingTelemetryService();
		const configurationService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());

		const logService = new TestLogService();
		const experimentationService = new NullExperimentationService();

		fetcher = new ChatMLFetcherImpl(
			mockFetcherService as unknown as IFetcherService,
			spyingTelemetryService,
			new NullRequestLogger(),
			logService,
			new TestAuthenticationService() as unknown as IAuthenticationService,
			createMockInteractionService(),
			createMockChatQuotaService(),
			new TestCAPIClientService() as unknown as ICAPIClientService,
			createMockConversationOptions(),
			configurationService,
			experimentationService,
			createMockPowerService(),
			new InstantiationServiceBuilder([
				[IFetcherService, mockFetcherService as unknown as IFetcherService],
				[ITelemetryService, spyingTelemetryService],
				[ICAPIClientService, new TestCAPIClientService() as unknown as ICAPIClientService],
			]).seal() as unknown as IInstantiationService,
			new NullChatWebSocketManager(),
			new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })),
		);
	});

	afterEach(() => {
		disposables.dispose();
	});

	it('logs non-empty messagesJson for Response API requests (input field)', async () => {
		// Create an endpoint that returns Response API format (input instead of messages)
		const responseApiEndpoint = createResponseApiEndpoint();

		mockFetcherService.queueResponse(createSuccessResponse('Hello!'));

		const opts: IFetchMLOptions = {
			debugName: 'test-response-api',
			messages: [{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello from Response API' }] }],
			endpoint: responseApiEndpoint,
			location: ChatLocation.Panel,
			requestOptions: {},
			finishedCb: undefined,
		};

		await fetcher.fetchMany(opts, cancellationTokenSource.token);

		// Find the engine.messages telemetry event
		const events = spyingTelemetryService.getEvents();
		const engineMessagesEvents = events.telemetryServiceEvents.filter(
			e => e.eventName === 'engine.messages'
		);

		expect(engineMessagesEvents.length).toBeGreaterThan(0);

		// Find the input telemetry event (the one sent for input messages)
		// Input events are sent in the .finally() block of _fetchWithInstrumentation
		// which happens before the response processing that sends output events
		const inputTelemetry = engineMessagesEvents[0]; // First event should be the input
		expect(inputTelemetry).toBeDefined();
		const inputProperties = inputTelemetry!.properties as Record<string, string>;
		expect(inputProperties.messagesJson).toBeDefined();

		// Parse the messagesJson and verify it's not empty
		const messagesJson = JSON.parse(inputProperties.messagesJson);
		expect(messagesJson.length).toBeGreaterThan(0);

		// Verify the message content was properly converted from Response API input format
		expect(messagesJson[0].role).toBe('user');
	});

	it('logs empty messagesJson when ChatCompletion API messages array is empty', async () => {
		// Create an endpoint that returns ChatCompletion API format with empty messages
		const chatCompletionEndpoint = createChatCompletionEndpointWithEmptyMessages();

		mockFetcherService.queueResponse(createSuccessResponse('Hello!'));

		const opts: IFetchMLOptions = {
			debugName: 'test-empty-messages',
			messages: [], // Empty messages
			endpoint: chatCompletionEndpoint,
			location: ChatLocation.Panel,
			requestOptions: {},
			finishedCb: undefined,
		};

		await fetcher.fetchMany(opts, cancellationTokenSource.token);

		// Find the engine.messages telemetry event
		const events = spyingTelemetryService.getEvents();
		const engineMessagesEvents = events.telemetryServiceEvents.filter(
			e => e.eventName === 'engine.messages'
		);

		// First event should be the input messages telemetry
		const inputTelemetry = engineMessagesEvents[0];

		if (inputTelemetry) {
			// For ChatCompletion API with empty messages, messagesJson should be "[]"
			const props = inputTelemetry.properties as Record<string, string>;
			const messagesJson = JSON.parse(props.messagesJson);
			expect(messagesJson.length).toBe(0);
		}
	});
});

// --- Test Helpers ---

/**
 * Creates an endpoint that returns Response API format request body (with input instead of messages)
 */
function createResponseApiEndpoint(): IChatEndpoint {
	return {
		url: 'https://api.github.com/copilot/chat/responses',
		urlOrRequestMetadata: 'https://api.github.com/copilot/chat/responses',
		model: 'gpt-5-mini',
		modelMaxPromptTokens: 8192,
		maxOutputTokens: 4096,
		supportsToolCalls: true,
		supportsVision: false,
		supportsPrediction: false,
		showInModelPicker: true,
		isDefault: true,
		isFallback: false,
		policy: 'enabled',
		getHeaders: async () => ({}),
		// This is the key part - return Response API format with input instead of messages
		createRequestBody: (): IEndpointBody => {
			const body: IEndpointBody & OpenAI.Responses.ResponseCreateParams = {
				model: 'gpt-5-mini',
				stream: true,
				// Response API uses 'input' instead of 'messages'
				input: [
					{
						role: 'user',
						content: [{ type: 'input_text', text: 'Hello from Response API' }]
					}
				],
				// No 'messages' field - this is what distinguishes Response API
			};
			return body;
		},
		acquireTokenizer: () => ({
			countMessagesTokens: async () => 100,
			countTokens: async () => 100,
			tokenize: async () => [],
		}),
		processResponseFromChatEndpoint: async (_telemetryService: ITelemetryService, _logService: ILogService, response: Response, _expectedNumChoices: number, finishedCb: FinishedCallback, telemetryData: TelemetryData, _cancellationToken?: CancellationToken) => {
			const text = await response.text();
			if (finishedCb) {
				await finishedCb(text, 0, { text });
			}
			return {
				[Symbol.asyncIterator]: async function* () {
					yield {
						message: { role: Raw.ChatRole.Assistant, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text }] },
						choiceIndex: 0,
						requestId: {
							headerRequestId: response.headers.get('x-request-id') || 'test-request-id',
							gitHubRequestId: response.headers.get('x-github-request-id') || '',
							completionId: '',
							created: 0,
							serverExperiments: '',
							deploymentId: '',
						},
						tokens: [],
						usage: undefined,
						model: 'gpt-5-mini',
						blockFinished: true,
						finishReason: 'stop',
						telemetryData: telemetryData,
					};
				}
			};
		},
		acceptChatPolicy: async () => true,
		doRequest: async () => {
			throw new Error('Not implemented');
		},
	} as unknown as IChatEndpoint;
}

/**
 * Creates an endpoint that returns ChatCompletion API format with empty messages
 */
function createChatCompletionEndpointWithEmptyMessages(): IChatEndpoint {
	return {
		url: 'https://api.github.com/copilot/chat/completions',
		urlOrRequestMetadata: 'https://api.github.com/copilot/chat/completions',
		model: 'test-model',
		modelMaxPromptTokens: 8192,
		maxOutputTokens: 4096,
		supportsToolCalls: true,
		supportsVision: false,
		supportsPrediction: false,
		showInModelPicker: true,
		isDefault: true,
		isFallback: false,
		policy: 'enabled',
		getHeaders: async () => ({}),
		createRequestBody: (): IEndpointBody => ({
			model: 'test-model',
			messages: [], // Empty messages array - ChatCompletion API format
			stream: true
		}),
		acquireTokenizer: () => ({
			countMessagesTokens: async () => 100,
			countTokens: async () => 100,
			tokenize: async () => [],
		}),
		processResponseFromChatEndpoint: async (_telemetryService: ITelemetryService, _logService: ILogService, response: Response, _expectedNumChoices: number, finishedCb: FinishedCallback, telemetryData: TelemetryData, _cancellationToken?: CancellationToken) => {
			const text = await response.text();
			if (finishedCb) {
				await finishedCb(text, 0, { text });
			}
			return {
				[Symbol.asyncIterator]: async function* () {
					yield {
						message: { role: Raw.ChatRole.Assistant, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text }] },
						choiceIndex: 0,
						requestId: {
							headerRequestId: response.headers.get('x-request-id') || 'test-request-id',
							gitHubRequestId: response.headers.get('x-github-request-id') || '',
							completionId: '',
							created: 0,
							serverExperiments: '',
							deploymentId: '',
						},
						tokens: [],
						usage: undefined,
						model: 'test-model',
						blockFinished: true,
						finishReason: 'stop',
						telemetryData: telemetryData,
					};
				}
			};
		},
		acceptChatPolicy: async () => true,
		doRequest: async () => {
			throw new Error('Not implemented');
		},
	} as unknown as IChatEndpoint;
}

class MockFetcherService {
	private _responseQueue: (Response | Error)[] = [];
	private _fetchCallCount = 0;

	get fetchCallCount(): number {
		return this._fetchCallCount;
	}

	queueResponse(response: Response): void {
		this._responseQueue.push(response);
	}

	queueError(error: Error): void {
		this._responseQueue.push(error);
	}

	async fetch(_url: string, _options?: unknown): Promise<Response> {
		this._fetchCallCount++;
		const next = this._responseQueue.shift();
		if (!next) {
			throw new Error('No more queued responses');
		}
		if (next instanceof Error) {
			throw next;
		}
		return next;
	}

	fetchWithPagination<T>(): Promise<T[]> {
		throw new Error('Method not implemented.');
	}

	disconnectAll(): Promise<void> {
		return Promise.resolve();
	}

	makeAbortController(): AbortController {
		return new AbortController();
	}

	isAbortError(_err: unknown): boolean {
		return false;
	}

	isInternetDisconnectedError(_err: unknown): boolean {
		return false;
	}

	isFetcherError(err: unknown): boolean {
		return err instanceof Error && 'code' in err;
	}

	getUserMessageForFetcherError(_err: unknown): string {
		return 'Network error occurred';
	}

	getUserAgentLibrary(): string {
		return 'test-agent';
	}
}

class TestAuthenticationService extends MockAuthenticationService {
	override getCopilotToken(_force?: boolean): Promise<CopilotToken> {
		return Promise.resolve({
			token: 'test-token',
			username: 'test-user',
		} as CopilotToken);
	}
}

class TestCAPIClientService extends MockCAPIClientService {
	get capiPingURL(): string {
		return 'https://api.github.com/copilot_internal/ping';
	}
}

function createMockInteractionService(): IInteractionService {
	return {
		_serviceBrand: undefined,
		onInteractionStateChanged: Event.None,
		sendChatInteraction: () => { },
		getInteractionState: () => undefined,
		interactionId: 'test-interaction-id',
	} as unknown as IInteractionService;
}

function createMockChatQuotaService(): IChatQuotaService {
	return {
		_serviceBrand: undefined,
		processQuotaHeaders: () => { },
	} as unknown as IChatQuotaService;
}

function createMockConversationOptions() {
	return {
		_serviceBrand: undefined,
		maxResponseTokens: 4096,
		temperature: 0.5,
		topP: 1,
		rejectionMessage: 'rejected',
	};
}

function createMockPowerService(): IPowerService {
	return new NullPowerService();
}

class FakeHeaders implements IHeaders {
	constructor(private readonly headers = new Map<string, string>()) { }
	get(name: string): string | null {
		return this.headers.get(name.toLowerCase()) ?? null;
	}
	*[Symbol.iterator](): Iterator<[string, string]> {
		yield* this.headers.entries();
	}
}

function createSuccessResponse(content: string): Response {
	const streamContent = `data: {"choices":[{"delta":{"content":"${content}"},"index":0}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop","index":0}]}\n\ndata: [DONE]\n\n`;
	return Response.fromText(
		200,
		'OK',
		new FakeHeaders(new Map([
			['content-type', 'text/event-stream'],
			['x-request-id', 'test-request-id'],
		])),
		streamContent,
		'node-fetch' as FetcherId
	);
}
