/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from '@vscode/copilot-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatRequest } from 'vscode';
import { Emitter } from '../../../../util/vs/base/common/event';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatLocation } from '../../../../vscodeTypes';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { NullEnvService } from '../../../env/common/nullEnvService';
import { ILogService } from '../../../log/common/logService';
import { IChatEndpoint } from '../../../networking/common/networking';
import { NullRequestLogger } from '../../../requestLogger/node/nullRequestLogger';
import { IExperimentationService, NullExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../telemetry/common/telemetry';
import { createPngBytes } from '../../../image/common/test/testImageData';
import { BaseConfig, ConfigKey, IConfigurationService } from '../../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import { defaultAutoModeTier } from '../../common/autoModeTiers';
import { ICAPIClientService } from '../../common/capiClient';
import { AutomodeService } from '../automodeService';

function createMockHeaders(entries: Record<string, string> = {}): { get(name: string): string | null } {
	const lower: Record<string, string> = {};
	for (const [k, v] of Object.entries(entries)) {
		lower[k.toLowerCase()] = v;
	}
	return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

/**
 * Creates a mock response with a real stream-backed body so that middleware
 * cloning (tee) works correctly. Token responses go through the middleware
 * pipeline where {@link cloneResponse} reads the body stream.
 */
function makeMockTokenResponse(body: { available_models: string[]; expires_at: number; session_token: string; discounted_costs?: Record<string, number> }) {
	const serialized = JSON.stringify(body);
	return {
		status: 200,
		headers: createMockHeaders(),
		body: new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode(serialized));
				controller.close();
			},
		}),
		async text() { return serialized; },
		async json() { return JSON.parse(serialized); },
	};
}

describe('AutomodeService', () => {
	let automodeService: AutomodeService;
	let mockCAPIClientService: ICAPIClientService;
	let mockAuthService: IAuthenticationService;
	let mockLogService: ILogService;
	let mockInstantiationService: IInstantiationService;
	let mockExpService: IExperimentationService;
	let mockChatEndpoint: IChatEndpoint;
	let envService: NullEnvService;
	let configurationService: IConfigurationService;
	let onDidAuthenticationChangeEmitter: Emitter<void>;
	let mockTelemetryService: ITelemetryService & { sendEnhancedGHTelemetryEvent: ReturnType<typeof vi.fn>; sendMSFTTelemetryEvent: ReturnType<typeof vi.fn> };

	function createEndpoint(model: string, provider: string, overrides?: Partial<IChatEndpoint>): IChatEndpoint {
		return {
			model,
			modelProvider: provider,
			displayName: model,
			maxOutputTokens: 4096,
			supportsToolCalls: true,
			supportsVision: false,
			supportsPrediction: false,
			showInModelPicker: true,
			isDefault: false,
			isFallback: false,
			policy: 'enabled',
			...overrides,
		} as unknown as IChatEndpoint;
	}

	function createService(): AutomodeService {
		return new AutomodeService(
			mockCAPIClientService,
			mockAuthService,
			mockLogService,
			mockInstantiationService,
			mockExpService,
			envService,
			mockTelemetryService,
			new NullRequestLogger(),
			configurationService
		);
	}

	function mockApiResponse(available_models: string[], session_token = 'test-token', expiresInSeconds = 3600): void {
		(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockResolvedValue(
			makeMockTokenResponse({
				available_models,
				expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
				session_token,
			})
		);
	}

	function enableRouter(): void {
		// Router is now always enabled for panel chat — no config key needed.
	}

	beforeEach(() => {
		mockChatEndpoint = createEndpoint('gpt-4o-mini', 'OpenAI');

		mockCAPIClientService = {
			makeRequest: vi.fn().mockResolvedValue(
				makeMockTokenResponse({
					available_models: ['gpt-4o', 'gpt-4o-mini'],
					expires_at: Math.floor(Date.now() / 1000) + 3600,
					session_token: 'test-token'
				})
			)
		} as unknown as ICAPIClientService;

		onDidAuthenticationChangeEmitter = new Emitter<void>();
		mockAuthService = {
			getCopilotToken: vi.fn().mockResolvedValue({ token: 'test-auth-token' }),
			onDidAuthenticationChange: onDidAuthenticationChangeEmitter.event
		} as unknown as IAuthenticationService;

		mockLogService = {
			trace: vi.fn(),
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn()
		} as unknown as ILogService;

		mockInstantiationService = {
			createInstance: vi.fn().mockImplementation(
				(_ctor: any, endpointOrModelInfo: any) => {
					// AutoChatEndpoint wraps an existing endpoint, whereas
					// CopilotChatEndpoint is built from raw model metadata.
					if (endpointOrModelInfo && 'capabilities' in endpointOrModelInfo && !('modelProvider' in endpointOrModelInfo)) {
						return createEndpoint(endpointOrModelInfo.id, endpointOrModelInfo.vendor, {
							name: endpointOrModelInfo.name,
							supportsVision: !!endpointOrModelInfo.capabilities?.supports?.vision,
						});
					}
					return endpointOrModelInfo;
				}
			)
		} as unknown as IInstantiationService;

		mockExpService = new NullExperimentationService();

		envService = new NullEnvService();
		// These tests cover the legacy session + intent flow; the single-call
		// Auto endpoint is exercised separately below.
		configurationService = new InMemoryConfigurationService(
			new DefaultsOnlyConfigurationService(),
			new Map([[ConfigKey.Advanced.AutoModeV2Enabled, false]]),
		);
		mockTelemetryService = {
			sendTelemetryEvent: vi.fn(),
			sendMSFTTelemetryEvent: vi.fn(),
			sendTelemetryErrorEvent: vi.fn(),
			sendMSFTTelemetryErrorEvent: vi.fn(),
			sendSharedTelemetryEvent: vi.fn(),
			sendEnhancedGHTelemetryEvent: vi.fn(),
		} as unknown as ITelemetryService & { sendEnhancedGHTelemetryEvent: ReturnType<typeof vi.fn>; sendMSFTTelemetryEvent: ReturnType<typeof vi.fn> };
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('resolveAutoModeEndpoint', () => {
		it('should not use router for inline chat', async () => {
			enableRouter();

			automodeService = createService();

			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Editor,
				prompt: 'test prompt',
			};

			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]);

			// Verify that router API was NOT called for inline chat
			expect(mockCAPIClientService.makeRequest).not.toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ type: RequestType.ModelRouter })
			);
		});

		it('should use router for panel chat when enabled', async () => {
			enableRouter();

			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');

			// Mock makeRequest to handle both auto mode token and router API calls
			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation((_body: any, opts: any) => {
				if (opts?.type === RequestType.ModelRouter) {
					return Promise.resolve({
						ok: true,
						status: 200,
						headers: createMockHeaders(),
						text: vi.fn().mockResolvedValue(JSON.stringify({
							predicted_label: 'needs_reasoning',
							confidence: 0.85,
							latency_ms: 50,
							chosen_model: 'gpt-4o',
							candidate_models: ['gpt-4o', 'gpt-4o-mini'],
							scores: { needs_reasoning: 0.85, no_reasoning: 0.15 },
							sticky_override: false
						}))
					});
				}
				return Promise.resolve(
					makeMockTokenResponse({
						available_models: ['gpt-4o', 'gpt-4o-mini'],
						expires_at: Math.floor(Date.now() / 1000) + 3600,
						session_token: 'test-token'
					})
				);
			});

			automodeService = createService();

			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-router-panel'
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			// Verify that router API was called for panel chat
			expect(mockCAPIClientService.makeRequest).toHaveBeenCalledWith(
				expect.objectContaining({ method: 'POST' }),
				expect.objectContaining({ type: RequestType.ModelRouter })
			);
			// Router should have selected gpt-4o
			expect(result.model).toBe('gpt-4o');
		});

		it('should include context signals in router request body', async () => {
			enableRouter();

			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');

			let capturedBody: string | undefined;
			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation((req: any, opts: any) => {
				if (opts?.type === RequestType.ModelRouter) {
					capturedBody = req.body;
					return Promise.resolve({
						ok: true,
						status: 200,
						headers: createMockHeaders(),
						text: vi.fn().mockResolvedValue(JSON.stringify({
							predicted_label: 'needs_reasoning',
							confidence: 0.85,
							latency_ms: 50,
							chosen_model: 'gpt-4o',
							candidate_models: ['gpt-4o', 'gpt-4o-mini'],
							scores: { needs_reasoning: 0.85, no_reasoning: 0.15 },
							sticky_override: false
						}))
					});
				}
				return Promise.resolve(
					makeMockTokenResponse({
						available_models: ['gpt-4o', 'gpt-4o-mini'],
						expires_at: Math.floor(Date.now() / 1000) + 3600,
						session_token: 'test-token'
					})
				);
			});

			automodeService = createService();

			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				references: [{ id: 'ref1', value: 'some ref' } as any],
				sessionId: 'test-session-123',
			};

			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			expect(capturedBody).toBeDefined();
			const parsed = JSON.parse(capturedBody!);
			expect(parsed.prompt).toBe('test prompt');
			expect(parsed.prompt_char_count).toBe('test prompt'.length);
			expect(parsed.reference_count).toBe(1);
			expect(parsed.turn_number).toBe(1);
			expect(parsed.session_id).toBe('test-session-123');
			expect(parsed.previous_model).toBeUndefined();
		});

		it('should not use router for terminal chat', async () => {
			enableRouter();

			automodeService = createService();

			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Terminal,
				prompt: 'test prompt'
			};

			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]);

			// Verify that router API was NOT called for terminal chat
			expect(mockCAPIClientService.makeRequest).not.toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ type: RequestType.ModelRouter })
			);
		});
	});

	describe('model selection', () => {
		it('should pick the first available model with a known endpoint on first mint', async () => {
			const openaiEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			const claudeEndpoint = createEndpoint('claude-sonnet', 'Anthropic');
			mockApiResponse(['claude-sonnet', 'gpt-4o']);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test',
				sessionId: 'session-first-mint'
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [openaiEndpoint, claudeEndpoint]);
			// claude-sonnet is first in available_models and has a known endpoint
			expect(result.model).toBe('claude-sonnet');
		});

		it('should skip models without known endpoints and pick the first match', async () => {
			const openaiEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			// available_models has 'unknown-model' first, but no known endpoint for it
			mockApiResponse(['unknown-model', 'gpt-4o']);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test',
				sessionId: 'session-skip-unknown'
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [openaiEndpoint]);
			expect(result.model).toBe('gpt-4o');
		});

		it('should prefer same provider model on token refresh', async () => {
			vi.useFakeTimers();
			const openaiEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			const openaiMiniEndpoint = createEndpoint('gpt-4o-mini', 'OpenAI');
			const claudeEndpoint = createEndpoint('claude-sonnet', 'Anthropic');

			// First mint: gpt-4o is first available, token expires in 1s to trigger immediate refresh
			mockApiResponse(['gpt-4o', 'claude-sonnet'], 'token-1', 1);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test',
				sessionId: 'session-affinity'
			};

			const firstResult = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [openaiEndpoint, openaiMiniEndpoint, claudeEndpoint]);
			expect(firstResult.model).toBe('gpt-4o');

			// Set up new token response, then advance timers to trigger refresh
			mockApiResponse(['claude-sonnet', 'gpt-4o-mini'], 'token-2');
			await vi.advanceTimersByTimeAsync(1);

			const secondResult = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [openaiEndpoint, openaiMiniEndpoint, claudeEndpoint]);
			// Should pick gpt-4o-mini because it's the first model from the same provider (OpenAI)
			expect(secondResult.model).toBe('gpt-4o-mini');
			vi.useRealTimers();
		});

		it('should fall back to first available model when no same-provider model exists on refresh', async () => {
			vi.useFakeTimers();
			const openaiEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			const claudeEndpoint = createEndpoint('claude-sonnet', 'Anthropic');

			// First mint: gpt-4o is first available, token expires in 1s to trigger immediate refresh
			mockApiResponse(['gpt-4o', 'claude-sonnet'], 'token-1', 1);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test',
				sessionId: 'session-fallback'
			};

			const firstResult = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [openaiEndpoint, claudeEndpoint]);
			expect(firstResult.model).toBe('gpt-4o');

			// Set up new token response with only Anthropic models, then advance timers
			mockApiResponse(['claude-sonnet'], 'token-2');
			await vi.advanceTimersByTimeAsync(1);

			const secondResult = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [openaiEndpoint, claudeEndpoint]);
			// No OpenAI models available, should fall back to first available (claude-sonnet)
			expect(secondResult.model).toBe('claude-sonnet');
		});

		it('should return cached endpoint when session token has not changed', async () => {
			const openaiEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			const claudeEndpoint = createEndpoint('claude-sonnet', 'Anthropic');

			mockApiResponse(['gpt-4o', 'claude-sonnet'], 'token-same');

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test',
				sessionId: 'session-cached'
			};

			const firstResult = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [openaiEndpoint, claudeEndpoint]);
			const secondResult = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [openaiEndpoint, claudeEndpoint]);
			// Same object reference since token didn't change
			expect(secondResult).toBe(firstResult);
		});

		it('should fall back to first available model when the current provider is empty', async () => {
			const openaiEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			const chamomileEndpoint = createEndpoint('chamomile', '');

			mockApiResponse(['chamomile'], 'token-empty-provider');

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test',
				sessionId: 'session-empty-provider'
			};

			const firstResult = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [openaiEndpoint, chamomileEndpoint]);
			const secondResult = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [openaiEndpoint, chamomileEndpoint]);
			expect([firstResult.model, secondResult.model]).toEqual(['chamomile', 'chamomile']);
		});

		it('should fall back to first known endpoint when no available models match', async () => {
			mockApiResponse(['unknown-model-1', 'unknown-model-2']);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test',
				sessionId: 'session-no-match'
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]);
			expect(result.model).toBe(mockChatEndpoint.model);
			expect(mockLogService.warn).toHaveBeenCalledWith(
				expect.stringContaining('No available_models matched knownEndpoints; using fallback endpoint')
			);
		});
	});

	describe('router fallback', () => {
		function mockRouterResponse(available_models: string[], routerResult: { chosen_model: string; candidate_models: string[] }, session_token = 'test-token'): void {
			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation((_body: any, opts: any) => {
				if (opts?.type === RequestType.ModelRouter) {
					return Promise.resolve({
						ok: true,
						status: 200,
						headers: createMockHeaders(),
						text: vi.fn().mockResolvedValue(JSON.stringify({
							predicted_label: 'needs_reasoning',
							confidence: 0.9,
							latency_ms: 30,
							chosen_model: routerResult.chosen_model,
							candidate_models: routerResult.candidate_models,
							scores: { needs_reasoning: 0.9, no_reasoning: 0.1 },
							sticky_override: false
						}))
					});
				}
				return Promise.resolve(
					makeMockTokenResponse({
						available_models,
						expires_at: Math.floor(Date.now() / 1000) + 3600,
						session_token,
					})
				);
			});
		}

		it('should fall back to default selection when router fetch throws', async () => {
			enableRouter();
			const claudeEndpoint = createEndpoint('claude-sonnet', 'Anthropic');
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');

			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation((_body: any, opts: any) => {
				if (opts?.type === RequestType.ModelRouter) {
					return Promise.reject(new Error('Network error'));
				}
				return Promise.resolve(
					makeMockTokenResponse({
						available_models: ['claude-sonnet', 'gpt-4o'],
						expires_at: Math.floor(Date.now() / 1000) + 3600,
						session_token: 'test-token',
					})
				);
			});

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-router-error'
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [claudeEndpoint, gpt4oEndpoint]);
			// Should fall back to first available model (claude-sonnet)
			expect(result.model).toBe('claude-sonnet');
			expect(mockLogService.error).toHaveBeenCalledWith(
				expect.stringContaining('Failed to get routed model'),
				expect.any(String)
			);
		});

		it('should fall back to default selection with routerTimeout reason when router times out', async () => {
			vi.useFakeTimers();
			enableRouter();
			const claudeEndpoint = createEndpoint('claude-sonnet', 'Anthropic');
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');

			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation((req: any, opts: any) => {
				if (opts?.type === RequestType.ModelRouter) {
					// Return a pending promise that rejects when the signal is aborted,
					// simulating a real in-flight request cancelled by the 1s timeout.
					return new Promise((_resolve, reject) => {
						const signal: AbortSignal = req.signal;
						if (signal?.aborted) {
							const err = new Error('The operation was aborted');
							err.name = 'AbortError';
							reject(err);
							return;
						}
						signal?.addEventListener('abort', () => {
							const err = new Error('The operation was aborted');
							err.name = 'AbortError';
							reject(err);
						});
					});
				}
				return Promise.resolve(
					makeMockTokenResponse({
						available_models: ['claude-sonnet', 'gpt-4o'],
						expires_at: Math.floor(Date.now() / 1000) + 3600,
						session_token: 'test-token',
					})
				);
			});

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-router-timeout'
			};

			const resultPromise = automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [claudeEndpoint, gpt4oEndpoint]);
			// Advance past the 2.5-second router timeout to trigger the abort
			await vi.advanceTimersByTimeAsync(2500);

			const result = await resultPromise;
			// Should fall back to first available model (claude-sonnet)
			expect(result.model).toBe('claude-sonnet');
			expect(mockLogService.error).toHaveBeenCalledWith(
				expect.stringContaining('routerTimeout'),
				expect.any(String)
			);
		});

		it('should fall back to default selection when router returns unknown model', async () => {
			enableRouter();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');

			mockRouterResponse(
				['gpt-4o'],
				{ chosen_model: 'unknown-model', candidate_models: ['unknown-model'] }
			);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-unknown-router-model'
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint]);
			// Router returned unknown model, should fall back to first available
			expect(result.model).toBe('gpt-4o');
		});

		it('should skip router on subsequent turns and return cached model', async () => {
			enableRouter();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			const gpt4oMiniEndpoint = createEndpoint('gpt-4o-mini', 'OpenAI');
			const claudeEndpoint = createEndpoint('claude-sonnet', 'Anthropic');

			// First turn: router picks gpt-4o
			mockRouterResponse(
				['gpt-4o', 'gpt-4o-mini', 'claude-sonnet'],
				{ chosen_model: 'gpt-4o', candidate_models: ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet'] }
			);

			automodeService = createService();
			const chatRequest1: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'first question',
				sessionId: 'session-same-provider'
			};

			const firstResult = await automodeService.resolveAutoModeEndpoint(chatRequest1 as ChatRequest, [gpt4oEndpoint, gpt4oMiniEndpoint, claudeEndpoint]);
			expect(firstResult.model).toBe('gpt-4o');

			// Second turn: router would return claude, but should be skipped (cached gpt-4o returned)
			mockRouterResponse(
				['gpt-4o', 'gpt-4o-mini', 'claude-sonnet'],
				{ chosen_model: 'claude-sonnet', candidate_models: ['claude-sonnet', 'gpt-4o-mini'] }
			);

			const chatRequest2: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'second question',
				sessionId: 'session-same-provider'
			};

			const secondResult = await automodeService.resolveAutoModeEndpoint(chatRequest2 as ChatRequest, [gpt4oEndpoint, gpt4oMiniEndpoint, claudeEndpoint]);
			// Router is skipped after first turn — cached model returned
			expect(secondResult.model).toBe('gpt-4o');
		});

		it('should re-route on subsequent turns after invalidateRouterCache', async () => {
			enableRouter();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			const claudeEndpoint = createEndpoint('claude-sonnet', 'Anthropic');

			// First turn: router picks gpt-4o
			mockRouterResponse(
				['gpt-4o', 'claude-sonnet'],
				{ chosen_model: 'gpt-4o', candidate_models: ['gpt-4o', 'claude-sonnet'] }
			);

			automodeService = createService();
			const chatRequest1: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'first question',
				sessionId: 'session-no-same-provider'
			};

			const firstResult = await automodeService.resolveAutoModeEndpoint(chatRequest1 as ChatRequest, [gpt4oEndpoint, claudeEndpoint]);
			expect(firstResult.model).toBe('gpt-4o');

			// Invalidate the cache (simulates compaction)
			automodeService.invalidateRouterCache({ sessionId: 'session-no-same-provider' } as ChatRequest);

			// Second turn: router is re-run after invalidation, picks claude-sonnet
			mockRouterResponse(
				['gpt-4o', 'claude-sonnet'],
				{ chosen_model: 'claude-sonnet', candidate_models: ['claude-sonnet'] }
			);

			const chatRequest2: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'second question',
				sessionId: 'session-no-same-provider'
			};

			const secondResult = await automodeService.resolveAutoModeEndpoint(chatRequest2 as ChatRequest, [gpt4oEndpoint, claudeEndpoint]);
			expect(secondResult.model).toBe('claude-sonnet');
		});

		it('should not re-route when prompt has not changed (tool-calling iteration)', async () => {
			enableRouter();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			const claudeEndpoint = createEndpoint('claude-sonnet', 'Anthropic');

			mockRouterResponse(
				['gpt-4o', 'claude-sonnet'],
				{ chosen_model: 'gpt-4o', candidate_models: ['gpt-4o', 'claude-sonnet'] }
			);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'same prompt',
				sessionId: 'session-same-prompt'
			};

			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint, claudeEndpoint]);

			// Reset to track further calls
			const routerCallCount = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls
				.filter((call: any[]) => call[1]?.type === RequestType.ModelRouter).length;
			expect(routerCallCount).toBe(1);

			// Second call with same prompt — should NOT call router again
			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint, claudeEndpoint]);

			const routerCallCount2 = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls
				.filter((call: any[]) => call[1]?.type === RequestType.ModelRouter).length;
			expect(routerCallCount2).toBe(1);
		});

		it('should skip router on subsequent turns after image request routed on first turn', async () => {
			enableRouter();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI', { supportsVision: true });
			const claudeEndpoint = createEndpoint('claude-sonnet', 'Anthropic');

			mockRouterResponse(
				['gpt-4o', 'claude-sonnet'],
				{ chosen_model: 'gpt-4o', candidate_models: ['gpt-4o'] }
			);

			automodeService = createService();

			// Turn 1: image request — router IS called now
			const imageRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'describe this image',
				sessionId: 'session-transient-fallback',
				references: [{ id: 'img', value: { mimeType: 'image/png', data: new Uint8Array() } }] as any
			};

			await automodeService.resolveAutoModeEndpoint(imageRequest as ChatRequest, [gpt4oEndpoint, claudeEndpoint]);

			expect(mockCAPIClientService.makeRequest).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ type: RequestType.ModelRouter })
			);
			// Reset mock call tracking
			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockClear();
			mockRouterResponse(
				['gpt-4o', 'claude-sonnet'],
				{ chosen_model: 'gpt-4o', candidate_models: ['gpt-4o'] }
			);

			// Turn 2: new prompt — router should NOT be called (skipRouter after first turn)
			const textRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'write a function',
				sessionId: 'session-transient-fallback',
			};

			await automodeService.resolveAutoModeEndpoint(textRequest as ChatRequest, [gpt4oEndpoint, claudeEndpoint]);

			// Router should not have been called on turn 2
			expect(mockCAPIClientService.makeRequest).not.toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ type: RequestType.ModelRouter })
			);
		});

		it('should send has_image to router for image requests', async () => {
			enableRouter();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI', { supportsVision: true });
			const claudeEndpoint = createEndpoint('claude-sonnet', 'Anthropic');

			mockRouterResponse(
				['gpt-4o', 'claude-sonnet'],
				{ chosen_model: 'gpt-4o', candidate_models: ['gpt-4o'] }
			);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'describe this image',
				sessionId: 'session-vision-router',
				references: [{ id: 'img', value: { mimeType: 'image/png', data: new Uint8Array() } }] as any
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint, claudeEndpoint]);
			expect(result.model).toBe('gpt-4o');
			// Verify router WAS called (not skipped)
			const routerCall = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.find(([, opts]) => opts?.type === RequestType.ModelRouter);
			expect(routerCall).toBeDefined();
			const [routerRequestBody] = routerCall!;
			expect(JSON.parse(routerRequestBody.body).has_image).toBe(true);
		});

		it('should fall back to vision model when router returns no_vision_models error', async () => {
			enableRouter();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI', { supportsVision: true });
			const claudeEndpoint = createEndpoint('claude-sonnet', 'Anthropic');

			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation((_body: any, opts: any) => {
				if (opts?.type === RequestType.ModelRouter) {
					return Promise.resolve({
						ok: false,
						status: 400,
						statusText: 'Bad Request',
						headers: createMockHeaders(),
						text: vi.fn().mockResolvedValue(JSON.stringify({ error: 'no_vision_models' }))
					});
				}
				return Promise.resolve(
					makeMockTokenResponse({
						available_models: ['gpt-4o', 'claude-sonnet'],
						expires_at: Math.floor(Date.now() / 1000) + 3600,
						session_token: 'test-token',
					})
				);
			});

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'describe this image',
				sessionId: 'session-no-vision',
				references: [{ id: 'img', value: { mimeType: 'image/png', data: new Uint8Array() } }] as any
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint, claudeEndpoint]);
			// Should fall back to default selection, then vision fallback picks gpt-4o
			expect(result.model).toBe('gpt-4o');
			// Verify the router was called and the error code was passed through from the server
			expect(mockCAPIClientService.makeRequest).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ type: RequestType.ModelRouter })
			);
			expect(mockLogService.error).toHaveBeenCalledWith(
				expect.stringContaining('(no_vision_models)'),
				expect.anything()
			);
		});

		it('should fall back to routerError when router returns non-JSON error body', async () => {
			// When the router returns an HTML error page or other non-JSON body,
			// errorCode should be undefined and fallbackReason should be 'routerError'
			// — NOT the raw response body leaked into telemetry.
			enableRouter();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');

			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation((_body: any, opts: any) => {
				if (opts?.type === RequestType.ModelRouter) {
					return Promise.resolve({
						ok: false,
						status: 502,
						statusText: 'Bad Gateway',
						headers: createMockHeaders(),
						text: vi.fn().mockResolvedValue('<html><body>Bad Gateway</body></html>')
					});
				}
				return Promise.resolve(
					makeMockTokenResponse({
						available_models: ['gpt-4o'],
						expires_at: Math.floor(Date.now() / 1000) + 3600,
						session_token: 'test-token',
					})
				);
			});

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-html-error',
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint]);
			expect(result.model).toBe('gpt-4o');
			// Should log generic 'routerError', NOT the HTML body
			expect(mockLogService.error).toHaveBeenCalledWith(
				expect.stringContaining('(routerError)'),
				expect.anything()
			);
		});

		it('should fall back to routerError when router returns JSON without error field', async () => {
			// When the server returns valid JSON but without an 'error' field,
			// errorCode should be undefined and fallbackReason should be 'routerError'.
			enableRouter();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');

			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation((_body: any, opts: any) => {
				if (opts?.type === RequestType.ModelRouter) {
					return Promise.resolve({
						ok: false,
						status: 400,
						statusText: 'Bad Request',
						headers: createMockHeaders(),
						text: vi.fn().mockResolvedValue(JSON.stringify({ message: 'something went wrong' }))
					});
				}
				return Promise.resolve(
					makeMockTokenResponse({
						available_models: ['gpt-4o'],
						expires_at: Math.floor(Date.now() / 1000) + 3600,
						session_token: 'test-token',
					})
				);
			});

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-json-no-error',
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint]);
			expect(result.model).toBe('gpt-4o');
			expect(mockLogService.error).toHaveBeenCalledWith(
				expect.stringContaining('(routerError)'),
				expect.anything()
			);
		});

		it('should be a no-op when invalidateRouterCache is called with unknown conversationId', async () => {
			automodeService = createService();
			// Should not throw
			automodeService.invalidateRouterCache({ sessionId: 'nonexistent-session' } as ChatRequest);
		});

		it('should re-run router after invalidateRouterCache is called', async () => {
			enableRouter();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			const claudeEndpoint = createEndpoint('claude-sonnet', 'Anthropic');

			mockRouterResponse(
				['gpt-4o', 'claude-sonnet'],
				{ chosen_model: 'gpt-4o', candidate_models: ['gpt-4o'] }
			);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'first question',
				sessionId: 'session-invalidate'
			};

			const firstResult = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint, claudeEndpoint]);
			expect(firstResult.model).toBe('gpt-4o');

			const chatRequest2: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'second question',
				sessionId: 'session-invalidate'
			};
			const cachedResult = await automodeService.resolveAutoModeEndpoint(chatRequest2 as ChatRequest, [gpt4oEndpoint, claudeEndpoint]);
			expect(cachedResult.model).toBe('gpt-4o');

			automodeService.invalidateRouterCache({ sessionId: 'session-invalidate' } as ChatRequest);

			mockRouterResponse(
				['gpt-4o', 'claude-sonnet'],
				{ chosen_model: 'claude-sonnet', candidate_models: ['claude-sonnet'] }
			);

			const chatRequest3: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'third question',
				sessionId: 'session-invalidate'
			};
			const reEvalResult = await automodeService.resolveAutoModeEndpoint(chatRequest3 as ChatRequest, [gpt4oEndpoint, claudeEndpoint]);
			expect(reEvalResult.model).toBe('claude-sonnet');
		});
	});

	describe('vision fallback', () => {
		it('should fall back to vision-capable model when selected model does not support vision', async () => {
			const nonVisionEndpoint = createEndpoint('gpt-4o-mini', 'OpenAI', { supportsVision: false });
			const visionEndpoint = createEndpoint('gpt-4o', 'OpenAI', { supportsVision: true });
			mockApiResponse(['gpt-4o-mini', 'gpt-4o']);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'describe this image',
				sessionId: 'session-vision-fallback',
				references: [{ id: 'img', value: { mimeType: 'image/png', data: new Uint8Array() } }] as any
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [nonVisionEndpoint, visionEndpoint]);
			expect(result.model).toBe('gpt-4o');
		});

		it('should keep vision-capable model when it is already selected', async () => {
			const visionEndpoint = createEndpoint('gpt-4o', 'OpenAI', { supportsVision: true });
			const nonVisionEndpoint = createEndpoint('claude-sonnet', 'Anthropic', { supportsVision: false });
			mockApiResponse(['gpt-4o', 'claude-sonnet']);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'describe this image',
				sessionId: 'session-vision-already-ok',
				references: [{ id: 'img', value: { mimeType: 'image/png', data: new Uint8Array() } }] as any
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [visionEndpoint, nonVisionEndpoint]);
			expect(result.model).toBe('gpt-4o');
		});

		it('should keep non-vision model when request has no image', async () => {
			const nonVisionEndpoint = createEndpoint('claude-sonnet', 'Anthropic', { supportsVision: false });
			const visionEndpoint = createEndpoint('gpt-4o', 'OpenAI', { supportsVision: true });
			mockApiResponse(['claude-sonnet', 'gpt-4o']);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'write a function',
				sessionId: 'session-no-image'
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [nonVisionEndpoint, visionEndpoint]);
			expect(result.model).toBe('claude-sonnet');
		});

		it('should warn and keep selected model when no vision-capable model is available', async () => {
			const nonVisionEndpoint1 = createEndpoint('gpt-4o-mini', 'OpenAI', { supportsVision: false });
			const nonVisionEndpoint2 = createEndpoint('claude-sonnet', 'Anthropic', { supportsVision: false });
			mockApiResponse(['gpt-4o-mini', 'claude-sonnet']);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'describe this image',
				sessionId: 'session-no-vision-available',
				references: [{ id: 'img', value: { mimeType: 'image/png', data: new Uint8Array() } }] as any
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [nonVisionEndpoint1, nonVisionEndpoint2]);
			expect(result.model).toBe('gpt-4o-mini');
			expect(mockLogService.warn).toHaveBeenCalledWith(
				expect.stringContaining('no vision-capable model')
			);
		});
	});

	describe('routerModelSelection telemetry', () => {
		function mockRouterResponse(available_models: string[], routerResult: { chosen_model: string; candidate_models: string[] }, session_token = 'test-token'): void {
			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation((_body: any, opts: any) => {
				if (opts?.type === RequestType.ModelRouter) {
					return Promise.resolve({
						ok: true,
						status: 200,
						headers: createMockHeaders(),
						text: vi.fn().mockResolvedValue(JSON.stringify({
							predicted_label: 'needs_reasoning',
							confidence: 0.9,
							latency_ms: 30,
							chosen_model: routerResult.chosen_model,
							candidate_models: routerResult.candidate_models,
							scores: { needs_reasoning: 0.9, no_reasoning: 0.1 },
							sticky_override: false
						}))
					});
				}
				return Promise.resolve(
					makeMockTokenResponse({
						available_models,
						expires_at: Math.floor(Date.now() / 1000) + 3600,
						session_token,
					})
				);
			});
		}

		it('should emit routerModelSelection with candidateModel and actualModel when router is used', async () => {
			enableRouter();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			const claudeEndpoint = createEndpoint('claude-sonnet', 'Anthropic');

			mockRouterResponse(
				['gpt-4o', 'claude-sonnet'],
				{ chosen_model: 'gpt-4o', candidate_models: ['gpt-4o', 'claude-sonnet'] }
			);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-telemetry-test'
			};

			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint, claudeEndpoint]);

			const telemetryCalls = mockTelemetryService.sendMSFTTelemetryEvent.mock.calls;
			const selectionEvent = telemetryCalls.find((call: unknown[]) => call[0] === 'automode.routerModelSelection');
			expect(selectionEvent).toBeDefined();
			expect(selectionEvent![1]).toMatchObject({
				candidateModel: 'gpt-4o',
				actualModel: 'gpt-4o',
				overrideReason: 'none',
			});
		});

		it('should emit candidateModel from chosen_model, not candidate_models[0]', async () => {
			enableRouter();
			const codexEndpoint = createEndpoint('gpt-5.3-codex', 'OpenAI');
			const miniEndpoint = createEndpoint('gpt-5.4-mini', 'OpenAI');

			// Server re-ranked the pick: candidate_models[0] is gpt-5.3-codex but the
			// authoritative chosen_model is gpt-5.4-mini. The telemetry candidateModel
			// must reflect chosen_model so router-pick vs actual comparisons are valid.
			mockRouterResponse(
				['gpt-5.3-codex', 'gpt-5.4-mini'],
				{ chosen_model: 'gpt-5.4-mini', candidate_models: ['gpt-5.3-codex', 'gpt-5.4-mini'] }
			);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'refactor this function',
				sessionId: 'session-telemetry-chosen-model'
			};

			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [codexEndpoint, miniEndpoint]);

			const telemetryCalls = mockTelemetryService.sendMSFTTelemetryEvent.mock.calls;
			const selectionEvent = telemetryCalls.find((call: unknown[]) => call[0] === 'automode.routerModelSelection');
			expect(selectionEvent).toBeDefined();
			expect(selectionEvent![1]).toMatchObject({
				candidateModel: 'gpt-5.4-mini',
				actualModel: 'gpt-5.4-mini',
				overrideReason: 'none',
			});
		});

		it('should emit overrideReason=clientOverride when vision fallback changes the model', async () => {
			enableRouter();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI', { supportsVision: true });
			const claudeEndpoint = createEndpoint('claude-sonnet', 'Anthropic', { supportsVision: false });

			mockRouterResponse(
				['claude-sonnet', 'gpt-4o'],
				{ chosen_model: 'claude-sonnet', candidate_models: ['claude-sonnet', 'gpt-4o'] }
			);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'describe this image',
				sessionId: 'session-telemetry-vision',
				references: [{ id: 'img', value: { mimeType: 'image/png', data: createPngBytes(7, 11), isPasted: true } }] as any
			};

			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint, claudeEndpoint]);

			const telemetryCalls = mockTelemetryService.sendMSFTTelemetryEvent.mock.calls;
			const selectionEvent = telemetryCalls.find((call: unknown[]) => call[0] === 'automode.routerModelSelection');
			expect(selectionEvent).toBeDefined();
			expect(selectionEvent![1]).toMatchObject({
				candidateModel: 'claude-sonnet',
				actualModel: 'gpt-4o',
				overrideReason: 'clientOverride',
			});
			expect(selectionEvent![2]).toMatchObject({
				imageCount: 1,
				totalImageBytes: 24,
				maxImageBytes: 24,
				maxImageWidth: 7,
				maxImageHeight: 11,
				maxImagePixels: 77,
				totalImagePixels: 77,
				imagePngCount: 1,
				imageClipboardCount: 1,
			});

			const restrictedEvent = mockTelemetryService.sendEnhancedGHTelemetryEvent.mock.calls.find((call: unknown[]) => call[0] === 'automode.routerDecisionRestricted');
			expect(restrictedEvent).toBeDefined();
			expect(restrictedEvent![2]).toMatchObject({
				imageCount: 1,
				totalImageBytes: 24,
				maxImageBytes: 24,
				maxImageWidth: 7,
				maxImageHeight: 11,
				maxImagePixels: 77,
				totalImagePixels: 77,
				imagePngCount: 1,
				imageClipboardCount: 1,
			});
		});

		it('should not emit routerModelSelection when router fails', async () => {
			enableRouter();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');

			mockRouterResponse(
				['gpt-4o'],
				{ chosen_model: 'unknown-model', candidate_models: ['unknown-model'] }
			);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-telemetry-no-emit'
			};

			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint]);

			const telemetryCalls = mockTelemetryService.sendMSFTTelemetryEvent.mock.calls;
			const selectionEvent = telemetryCalls.find((call: unknown[]) => call[0] === 'automode.routerModelSelection');
			expect(selectionEvent).toBeUndefined();
		});
	});

	describe('available_models / knownEndpoints sync', () => {
		function mockRouterResponse(available_models: string[], routerResult: { chosen_model: string; candidate_models: string[] }, session_token = 'test-token'): void {
			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation((_body: any, opts: any) => {
				if (opts?.type === RequestType.ModelRouter) {
					return Promise.resolve({
						ok: true,
						status: 200,
						headers: createMockHeaders(),
						text: vi.fn().mockResolvedValue(JSON.stringify({
							predicted_label: 'no_reasoning',
							confidence: 0.96,
							latency_ms: 23,
							chosen_model: routerResult.chosen_model,
							candidate_models: routerResult.candidate_models,
							scores: { needs_reasoning: 0.04, no_reasoning: 0.96 },
							sticky_override: false
						}))
					});
				}
				return Promise.resolve(
					makeMockTokenResponse({
						available_models,
						expires_at: Math.floor(Date.now() / 1000) + 3600,
						session_token,
					})
				);
			});
		}

		it('should filter out available_models that have no matching knownEndpoint before sending to router', async () => {
			enableRouter();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			let capturedBody: string | undefined;
			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation((req: any, opts: any) => {
				if (opts?.type === RequestType.ModelRouter) {
					capturedBody = req.body;
					return Promise.resolve({
						ok: true,
						status: 200,
						headers: createMockHeaders(),
						text: vi.fn().mockResolvedValue(JSON.stringify({
							predicted_label: 'no_reasoning',
							confidence: 0.96,
							latency_ms: 23,
							chosen_model: 'gpt-4o',
							candidate_models: ['gpt-4o'],
							scores: { needs_reasoning: 0.04, no_reasoning: 0.96 },
							sticky_override: false
						}))
					});
				}
				return Promise.resolve(
					makeMockTokenResponse({
						available_models: ['claude-haiku-4.5', 'gpt-4o', 'claude-sonnet-4.6'],
						expires_at: Math.floor(Date.now() / 1000) + 3600,
						session_token: 'test-token',
					})
				);
			});

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'what day is today',
				sessionId: 'session-filter-models'
			};

			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint]);

			expect(capturedBody).toBeDefined();
			const parsed = JSON.parse(capturedBody!);
			expect(parsed.available_models).toEqual(['gpt-4o']);
			expect(parsed.available_models).not.toContain('claude-haiku-4.5');
			expect(parsed.available_models).not.toContain('claude-sonnet-4.6');
			expect(mockLogService.info).toHaveBeenCalledWith(
				expect.stringContaining('Filtered 2 unresolvable model(s)')
			);
		});

		it('should fall back to candidate_models when chosen_model has no endpoint', async () => {
			enableRouter();
			const gpt41Endpoint = createEndpoint('gpt-4.1', 'OpenAI');

			// chosen_model is not in knownEndpoints, so selection falls back to
			// the ordered candidate_models list and picks the first resolvable one.
			mockRouterResponse(
				['gpt-4.1'],
				{ chosen_model: 'unknown-new-model', candidate_models: ['unknown-new-model', 'gpt-4.1'] }
			);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'what day is today',
				sessionId: 'session-iterate-candidates'
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt41Endpoint]);
			expect(result.model).toBe('gpt-4.1');
		});

		it('should prefer chosen_model over candidate_models[0]', async () => {
			enableRouter();
			const codexEndpoint = createEndpoint('gpt-5.3-codex', 'OpenAI');
			const miniEndpoint = createEndpoint('gpt-5.4-mini', 'OpenAI');

			// Server re-ranked the pick (e.g. Cost Sorting experiment): chosen_model
			// is gpt-5.4-mini even though candidate_models[0] is gpt-5.3-codex. The
			// client must send the chosen_model, per the auto-intent-service contract.
			mockRouterResponse(
				['gpt-5.3-codex', 'gpt-5.4-mini'],
				{ chosen_model: 'gpt-5.4-mini', candidate_models: ['gpt-5.3-codex', 'gpt-5.4-mini'] }
			);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'refactor this function',
				sessionId: 'session-chosen-model'
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [codexEndpoint, miniEndpoint]);
			expect(result.model).toBe('gpt-5.4-mini');
		});

		it('should surface chosen_model in the routing decision the UI displays', async () => {
			enableRouter();
			const codexEndpoint = createEndpoint('gpt-5.3-codex', 'OpenAI');
			const miniEndpoint = createEndpoint('gpt-5.4-mini', 'OpenAI');

			// The "Routed to <model>" explainability label reads the routing
			// decision surfaced via consumeLastRoutingDecision(). It must match the
			// served endpoint (chosen_model), otherwise the label diverges from the
			// model shown in the response footer (candidate_models[0]).
			mockRouterResponse(
				['gpt-5.3-codex', 'gpt-5.4-mini'],
				{ chosen_model: 'gpt-5.4-mini', candidate_models: ['gpt-5.3-codex', 'gpt-5.4-mini'] }
			);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'refactor this function',
				sessionId: 'session-routing-decision'
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [codexEndpoint, miniEndpoint]);
			const decision = automodeService.consumeLastRoutingDecision();
			expect(decision?.resolvedModel).toBe('gpt-5.4-mini');
			expect(decision?.resolvedModel).toBe(result.model);
		});

		it('should fall back to first known endpoint when all available_models are unknown', async () => {
			enableRouter();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');

			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation((_body: any, opts: any) => {
				if (opts?.type === RequestType.ModelRouter) {
					throw new Error('Router should not be called when no models are routable');
				}
				return Promise.resolve(
					makeMockTokenResponse({
						available_models: ['unknown-model-a', 'unknown-model-b'],
						expires_at: Math.floor(Date.now() / 1000) + 3600,
						session_token: 'test-token',
					})
				);
			});

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-all-unknown'
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint]);
			expect(result.model).toBe('gpt-4o');
			expect(mockLogService.warn).toHaveBeenCalledWith(
				expect.stringContaining('No available_models matched knownEndpoints')
			);
		});
	});
	describe('single-call Auto endpoint (POST /auto)', () => {
		function enableAutoV2(overrides: Map<BaseConfig<unknown>, unknown> = new Map()): void {
			configurationService = new InMemoryConfigurationService(
				new DefaultsOnlyConfigurationService(),
				new Map<BaseConfig<unknown>, unknown>([
					[ConfigKey.Advanced.AutoModeV2Enabled, true],
					...overrides,
				]),
			);
		}

		/** Tiers are experiment-gated and off by default, so tier tests opt in. */
		function enableAutoV2WithTiers(): void {
			enableAutoV2(new Map<BaseConfig<unknown>, unknown>([[ConfigKey.Advanced.AutoModeTiersEnabled, true]]));
		}

		function enableAutoV2WithTierOverride(override: string): void {
			enableAutoV2(new Map<BaseConfig<unknown>, unknown>([[ConfigKey.Advanced.AutoModeTierOverride, override]]));
		}

		function makeAutoResponse(body: unknown, status = 200) {
			const serialized = JSON.stringify(body);
			return {
				ok: status >= 200 && status < 300,
				status,
				statusText: String(status),
				headers: createMockHeaders(),
				text: vi.fn().mockResolvedValue(serialized),
				json: vi.fn().mockImplementation(async () => JSON.parse(serialized)),
			};
		}

		function mockAuto(body: unknown, status = 200): void {
			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation((_body: any, opts: any) => {
				if (opts?.type === RequestType.Auto) {
					return Promise.resolve(makeAutoResponse(body, status));
				}
				return Promise.resolve(
					makeMockTokenResponse({
						available_models: ['gpt-4o-mini'],
						expires_at: Math.floor(Date.now() / 1000) + 3600,
						session_token: 'legacy-token',
					})
				);
			});
		}

		it('resolves the model from /auto without calling the legacy endpoints', async () => {
			enableAutoV2();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-v2'
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			expect(result.model).toBe('gpt-4o');
			const requestTypes = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.map(c => c[1]?.type);
			expect(requestTypes).toEqual([RequestType.Auto]);
		});

		it('sends has_image when the request contains an image', async () => {
			enableAutoV2();
			const visionEndpoint = createEndpoint('gpt-4o', 'OpenAI', { supportsVision: true });
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'describe this',
				sessionId: 'session-auto-v2-image',
				references: [{ value: { mimeType: 'image/png', data: createPngBytes(4, 4) } }] as unknown as ChatRequest['references'],
			};

			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [visionEndpoint]);

			const autoCall = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.find(c => c[1]?.type === RequestType.Auto);
			expect(JSON.parse(autoCall![0].body)).toEqual({ prompt: 'describe this', has_image: true });
		});

		it('reuses the resolved endpoint for later turns in the same conversation', async () => {
			enableAutoV2();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'first prompt',
				sessionId: 'session-auto-v2-reuse'
			};

			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint]);
			const second = await automodeService.resolveAutoModeEndpoint({ ...chatRequest, prompt: 'second prompt' } as ChatRequest, [gpt4oEndpoint]);

			expect(second.model).toBe('gpt-4o');
			const autoCalls = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.filter(c => c[1]?.type === RequestType.Auto);
			expect(autoCalls).toHaveLength(1);
		});

		it('re-runs /auto after the cache is invalidated', async () => {
			enableAutoV2();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'first prompt',
				sessionId: 'session-auto-v2-invalidate'
			};

			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint]);
			automodeService.invalidateRouterCache(chatRequest as ChatRequest);
			await automodeService.resolveAutoModeEndpoint({ ...chatRequest, prompt: 'after compaction' } as ChatRequest, [gpt4oEndpoint]);

			const autoCalls = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.filter(c => c[1]?.type === RequestType.Auto);
			expect(autoCalls).toHaveLength(2);
		});

		it('falls back to the legacy flow when /auto is gated off with a 404', async () => {
			enableAutoV2();
			mockAuto({ error: 'not_found' }, 404);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-v2-404'
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]);

			expect(result.model).toBe('gpt-4o-mini');
			expect(mockTelemetryService.sendMSFTTelemetryEvent).toHaveBeenCalledWith(
				'automode.autoV2Fallback',
				{ reason: 'not_found' }
			);
		});

		it('stops calling /auto for the rest of the session after a 404', async () => {
			enableAutoV2();
			mockAuto({ error: 'not_found' }, 404);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-v2-404-sticky'
			};

			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]);
			await automodeService.resolveAutoModeEndpoint({ ...chatRequest, prompt: 'another' } as ChatRequest, [mockChatEndpoint]);

			const autoCalls = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.filter(c => c[1]?.type === RequestType.Auto);
			expect(autoCalls).toHaveLength(1);
		});

		it('builds the endpoint from embedded metadata when the model is not in knownEndpoints', async () => {
			enableAutoV2();
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: {
					id: 'brand-new-model',
					name: 'Brand New Model',
					version: 'brand-new-model-2026-01-01',
					vendor: 'openai',
					capabilities: {
						family: 'brand-new',
						tokenizer: 'o200k_base',
						limits: { max_prompt_tokens: 128000, max_output_tokens: 64000 },
						supports: { vision: true, tool_calls: true, streaming: true },
					},
				},
			});

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-v2-drift'
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]);

			expect(result.model).toBe('brand-new-model');
			expect(mockTelemetryService.sendMSFTTelemetryEvent).toHaveBeenCalledWith(
				'automode.autoV2Fallback',
				{ reason: 'embeddedMetadata' }
			);
		});

		it('falls back to the legacy flow when the selected model metadata is unusable', async () => {
			enableAutoV2();
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'model-the-client-cannot-serve' },
			});

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-v2-unknown-model'
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]);

			expect(result.model).toBe('gpt-4o-mini');
			expect(mockTelemetryService.sendMSFTTelemetryEvent).toHaveBeenCalledWith(
				'automode.autoV2Fallback',
				{ reason: 'noMatchingEndpoint' }
			);
		});

		it('falls back to the legacy flow when /auto returns a non-vision model for an image request', async () => {
			enableAutoV2();
			const textOnly = createEndpoint('gpt-4o', 'OpenAI', { supportsVision: false });
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'describe this',
				sessionId: 'session-auto-v2-no-vision',
				references: [{ value: { mimeType: 'image/png', data: createPngBytes(4, 4) } }] as unknown as ChatRequest['references'],
			};

			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [textOnly, mockChatEndpoint]);

			expect(result.model).toBe('gpt-4o-mini');
			expect(mockTelemetryService.sendMSFTTelemetryEvent).toHaveBeenCalledWith(
				'automode.autoV2Fallback',
				{ reason: 'noVisionSupport' }
			);
		});

		it('re-resolves instead of reusing a non-vision cached endpoint when a later turn attaches an image', async () => {
			enableAutoV2();
			const textOnly = createEndpoint('gpt-4o', 'OpenAI', { supportsVision: false });
			const visionModel = createEndpoint('gpt-4o-vision', 'OpenAI', { supportsVision: true });
			let selectedId = 'gpt-4o';
			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation((_body: any, opts: any) => {
				if (opts?.type === RequestType.Auto) {
					return Promise.resolve(makeAutoResponse({
						session_token: 'auto-v2-token',
						expires_at: Math.floor(Date.now() / 1000) + 86400,
						selected_model: { id: selectedId },
					}));
				}
				return Promise.resolve(
					makeMockTokenResponse({
						available_models: ['gpt-4o-mini'],
						expires_at: Math.floor(Date.now() / 1000) + 3600,
						session_token: 'legacy-token',
					})
				);
			});

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'text only turn',
				sessionId: 'session-auto-v2-image-later'
			};

			const first = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [textOnly, visionModel]);
			expect(first.model).toBe('gpt-4o');

			selectedId = 'gpt-4o-vision';
			const second = await automodeService.resolveAutoModeEndpoint({
				...chatRequest,
				prompt: 'now describe this',
				references: [{ value: { mimeType: 'image/png', data: createPngBytes(4, 4) } }],
			} as unknown as ChatRequest, [textOnly, visionModel]);

			expect(second.model).toBe('gpt-4o-vision');
		});

		it('routes inline chat through /auto with the fast tier', async () => {
			enableAutoV2WithTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			automodeService = createService();
			for (const location of [ChatLocation.Editor, ChatLocation.Terminal, ChatLocation.Notebook]) {
				const result = await automodeService.resolveAutoModeEndpoint({
					location,
					prompt: 'test prompt',
					sessionId: `session-auto-v2-${location}`,
				} as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);
				expect(result.model).toBe('gpt-4o');
			}

			const tiers = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls
				.filter(c => c[1]?.type === RequestType.Auto)
				.map(c => JSON.parse(c[0].body).tier);
			expect(tiers).toEqual(['fast', 'fast', 'fast']);
		});

		// The workbench materializes the schema default into `modelConfiguration`,
		// so this — not an absent `modelConfiguration` — is what a real inline
		// request looks like for a user who never touched the tier picker.
		it('pins inline chat to the fast tier when the picker sits on its default', async () => {
			enableAutoV2WithTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Editor,
				prompt: 'inline turn',
				sessionId: 'session-auto-v2-inline-default',
				modelConfiguration: { tier: defaultAutoModeTier },
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			const autoCall = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.find(c => c[1]?.type === RequestType.Auto);
			expect(JSON.parse(autoCall![0].body)).toEqual({ prompt: 'inline turn', tier: 'fast' });
		});

		it('honors an explicit tier selection on inline surfaces', async () => {
			enableAutoV2WithTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Editor,
				prompt: 'test prompt',
				sessionId: 'session-auto-v2-inline-tier',
				modelConfiguration: { tier: 'max' },
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			const autoCall = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.find(c => c[1]?.type === RequestType.Auto);
			expect(JSON.parse(autoCall![0].body)).toEqual({ prompt: 'test prompt', tier: 'max' });
		});

		it('sends the tier picked in the model configuration', async () => {
			enableAutoV2WithTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-v2-tier',
				modelConfiguration: { tier: 'max' },
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			const autoCall = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.find(c => c[1]?.type === RequestType.Auto);
			expect(JSON.parse(autoCall![0].body)).toEqual({ prompt: 'test prompt', tier: 'max' });
		});

		it('falls back to the default tier when the configured tier is not user selectable', async () => {
			enableAutoV2WithTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-v2-bad-tier',
				modelConfiguration: { tier: 'fast' },
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			const autoCall = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.find(c => c[1]?.type === RequestType.Auto);
			expect(JSON.parse(autoCall![0].body)).toEqual({ prompt: 'test prompt', tier: 'balanced' });
		});

		it('re-routes the conversation when the tier changes', async () => {
			enableAutoV2WithTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			automodeService = createService();
			const chatRequest = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-v2-tier-change',
				modelConfiguration: { tier: 'eco' },
			} as unknown as ChatRequest;

			await automodeService.resolveAutoModeEndpoint(chatRequest, [mockChatEndpoint, gpt4oEndpoint]);
			await automodeService.resolveAutoModeEndpoint({ ...chatRequest, prompt: 'second turn' } as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);
			await automodeService.resolveAutoModeEndpoint({ ...chatRequest, prompt: 'third turn', modelConfiguration: { tier: 'max' } } as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			const tiers = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls
				.filter(c => c[1]?.type === RequestType.Auto)
				.map(c => JSON.parse(c[0].body).tier);
			expect(tiers).toEqual(['eco', 'max']);
		});

		it('lets the tier override win over the picker and the inline chat pin', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			enableAutoV2WithTierOverride('eco');
			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'panel turn',
				sessionId: 'session-override-panel',
				modelConfiguration: { tier: 'max' },
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Editor,
				prompt: 'inline turn',
				sessionId: 'session-override-inline',
			} as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			const tiers = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls
				.filter(c => c[1]?.type === RequestType.Auto)
				.map(c => JSON.parse(c[0].body).tier);
			expect(tiers).toEqual(['eco', 'eco']);
		});

		// The override is an internal/eval knob, so unlike the picker it may target
		// the profile inline chat reserves for itself.
		it('allows the tier override to select the internal fast tier', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			enableAutoV2WithTierOverride('fast');
			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'panel turn',
				sessionId: 'session-override-fast',
			} as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			const autoCall = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.find(c => c[1]?.type === RequestType.Auto);
			expect(JSON.parse(autoCall![0].body)).toEqual({ prompt: 'panel turn', tier: 'fast' });
		});

		it('ignores an unrecognized tier override', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			enableAutoV2(new Map<BaseConfig<unknown>, unknown>([
				[ConfigKey.Advanced.AutoModeTiersEnabled, true],
				[ConfigKey.Advanced.AutoModeTierOverride, 'turbo'],
			]));
			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'panel turn',
				sessionId: 'session-override-bogus',
				modelConfiguration: { tier: 'max' },
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			const autoCall = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.find(c => c[1]?.type === RequestType.Auto);
			expect(JSON.parse(autoCall![0].body)).toEqual({ prompt: 'panel turn', tier: 'max' });
		});

		it('withdraws tier support and announces it when /auto is gated off', async () => {
			enableAutoV2WithTiers();
			mockAuto({ error: 'not_found' }, 404);

			automodeService = createService();
			expect(automodeService.areAutoModeTiersSupported()).toBe(true);

			let announced = 0;
			const listener = automodeService.onDidChangeAutoModeTierSupport(() => announced++);
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-v2-404',
			} as ChatRequest, [mockChatEndpoint]);
			listener.dispose();

			expect({ announced, supported: automodeService.areAutoModeTiersSupported() }).toEqual({ announced: 1, supported: false });
		});

		it('announces tier support when the setting changes', async () => {
			enableAutoV2();

			automodeService = createService();
			expect(automodeService.areAutoModeTiersSupported()).toBe(false);

			let announced = 0;
			const listener = automodeService.onDidChangeAutoModeTierSupport(() => announced++);
			await configurationService.setConfig(ConfigKey.Advanced.AutoModeTiersEnabled, true);
			// An unrelated change must not re-announce.
			await configurationService.setConfig(ConfigKey.Advanced.AutoModeTierOverride, 'max');
			listener.dispose();

			expect({ announced, supported: automodeService.areAutoModeTiersSupported() }).toEqual({ announced: 1, supported: true });
		});

		it('does not reuse a cached endpoint from a different tier when /auto fails', async () => {
			enableAutoV2WithTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			automodeService = createService();
			const chatRequest = {
				location: ChatLocation.Panel,
				prompt: 'first turn',
				sessionId: 'session-auto-v2-tier-error',
				modelConfiguration: { tier: 'eco' },
			} as unknown as ChatRequest;
			const first = await automodeService.resolveAutoModeEndpoint(chatRequest, [mockChatEndpoint, gpt4oEndpoint]);
			expect(first.model).toBe('gpt-4o');

			// The tier changes and the re-route fails: the eco endpoint must not be
			// handed back as though it satisfied the new tier.
			mockAuto({ error: 'server_error' }, 500);
			const second = await automodeService.resolveAutoModeEndpoint({
				...chatRequest,
				prompt: 'second turn',
				modelConfiguration: { tier: 'max' },
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			expect(second.model).toBe(mockChatEndpoint.model);
		});

		// `/auto` does not promise a new session token when the tier changes, so
		// the endpoint (which bakes in the discount) cannot be reused across tiers.
		it('rebuilds the endpoint when the tier changes but the session token does not', async () => {
			enableAutoV2WithTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			const autoResponse = (discount: number) => ({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
				discounted_costs: { 'gpt-4o': discount },
			});
			mockAuto(autoResponse(0.2));

			automodeService = createService();
			const chatRequest = {
				location: ChatLocation.Panel,
				prompt: 'first turn',
				sessionId: 'session-auto-v2-tier-discount',
				modelConfiguration: { tier: 'eco' },
			} as unknown as ChatRequest;
			await automodeService.resolveAutoModeEndpoint(chatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			mockAuto(autoResponse(0.9));
			await automodeService.resolveAutoModeEndpoint({
				...chatRequest,
				prompt: 'second turn',
				modelConfiguration: { tier: 'max' },
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			const discounts = (mockInstantiationService.createInstance as ReturnType<typeof vi.fn>).mock.calls.map(c => c[3]);
			expect(discounts).toEqual([0.2, 0.9]);
		});

		it('does not evict an unrelated session when a cached conversation is rerouted', async () => {
			enableAutoV2WithTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});
			const autoCallCount = () => (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.filter(c => c[1]?.type === RequestType.Auto).length;

			automodeService = createService();
			const route = (sessionId: string, prompt: string, tier?: string) => automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt,
				sessionId,
				modelConfiguration: tier ? { tier } : undefined,
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			// Fill the cache to AUTO_V2_CACHE_MAX_ENTRIES, then reroute the newest
			// conversation: replacing its entry needs no room, so the oldest entry
			// must still answer from cache.
			for (let i = 0; i < 50; i++) {
				await route(`session-${i}`, `turn ${i}`);
			}
			await route('session-49', 'retiered turn', 'max');

			const callsBefore = autoCallCount();
			await route('session-0', 'follow up');

			expect(autoCallCount()).toBe(callsBefore);
		});

		// Tiers are experiment-gated, so until the experiment reaches a user the
		// request must look exactly as it did before tiers existed.
		it('omits the tier and hides the picker while tiers are disabled', async () => {
			enableAutoV2();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			automodeService = createService();
			for (const location of [ChatLocation.Panel, ChatLocation.Editor]) {
				await automodeService.resolveAutoModeEndpoint({
					location,
					prompt: 'test prompt',
					sessionId: `session-tiers-off-${location}`,
					modelConfiguration: { tier: 'max' },
				} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);
			}

			const bodies = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls
				.filter(c => c[1]?.type === RequestType.Auto)
				.map(c => JSON.parse(c[0].body));
			expect({ bodies, supported: automodeService.areAutoModeTiersSupported() }).toEqual({
				bodies: [
					{ prompt: 'test prompt' },
					{ prompt: 'test prompt' },
				],
				supported: false,
			});
		});

		// Evals need to exercise tiers before the experiment reaches them.
		it('honors the tier override while tiers are disabled', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			enableAutoV2WithTierOverride('max');
			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'panel turn',
				sessionId: 'session-override-tiers-off',
			} as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			const autoCall = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.find(c => c[1]?.type === RequestType.Auto);
			expect(JSON.parse(autoCall![0].body)).toEqual({ prompt: 'panel turn', tier: 'max' });
		});

		it('resolves the picker endpoint without any request under V2', async () => {
			enableAutoV2();
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			automodeService = createService();
			const result = await automodeService.resolveAutoModePickerEndpoint([mockChatEndpoint]);

			expect(result).toBeDefined();
			expect(mockCAPIClientService.makeRequest).not.toHaveBeenCalled();
		});

		// The picker has no prompt, so the discount label is read off the model
		// metadata rather than being resolved through a routing request.
		it('derives the picker discount range from the models auto_discount', async () => {
			enableAutoV2();

			automodeService = createService();
			const metadata = automodeService.getAutoPickerMetadata([
				createEndpoint('gpt-4o', 'OpenAI', { autoDiscount: 0.1 }),
				createEndpoint('gpt-4o-mini', 'OpenAI', { autoDiscount: 0.25 }),
				// Outside the Auto pool: must not drag the range down to zero.
				createEndpoint('byok-model', 'Anthropic'),
			]);

			expect({ metadata, requests: (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.length })
				.toEqual({ metadata: { discountRange: { low: 0.1, high: 0.25 } }, requests: 0 });
		});

		it('reports no discount when no model advertises one', async () => {
			enableAutoV2();

			automodeService = createService();

			expect(automodeService.getAutoPickerMetadata([mockChatEndpoint])).toEqual({ discountRange: { low: 0, high: 0 } });
		});

		it('falls back to the model auto_discount when /auto omits the discounted costs', async () => {
			enableAutoV2();
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI', { autoDiscount: 0.15 });

			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-v2-discount-fallback'
			} as ChatRequest, [gpt4oEndpoint]);

			const autoCall = (mockInstantiationService.createInstance as ReturnType<typeof vi.fn>).mock.calls.at(-1);
			expect({ discount: autoCall![3], range: autoCall![4] }).toEqual({ discount: 0.15, range: { low: 0.15, high: 0.15 } });
		});

		it('resets the 404 latch when authentication changes', async () => {
			enableAutoV2();
			mockAuto({ error: 'not_found' }, 404);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-v2-auth-latch'
			};
			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]);
			expect((mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.filter(c => c[1]?.type === RequestType.Auto)).toHaveLength(1);

			// The new account may well have access even though the old one did not.
			onDidAuthenticationChangeEmitter.fire();
			await automodeService.resolveAutoModeEndpoint({ ...chatRequest, prompt: 'after switch' } as ChatRequest, [mockChatEndpoint]);

			expect((mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.filter(c => c[1]?.type === RequestType.Auto)).toHaveLength(2);
		});

		it('resolves picker metadata from the model metadata when the setting is disabled', async () => {
			automodeService = createService();
			const metadata = automodeService.getAutoPickerMetadata([createEndpoint('gpt-4o-mini', 'OpenAI', { autoDiscount: 0.2 })]);

			expect(metadata).toEqual({ discountRange: { low: 0.2, high: 0.2 } });
			expect(mockCAPIClientService.makeRequest).not.toHaveBeenCalled();
		});

		it('can be remotely disabled via the experiment treatment variable', async () => {
			// No user setting: the treatment variable alone must be able to turn
			// V2 off, so it can be killed remotely without shipping a build.
			configurationService = new DefaultsOnlyConfigurationService();
			mockExpService = new class extends NullExperimentationService {
				override getTreatmentVariable<T extends boolean | number | string>(name: string): T | undefined {
					return name === 'copilotchat.autoModeV2Enabled' ? false as T : undefined;
				}
			}();
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-v2-exp-kill'
			} as ChatRequest, [mockChatEndpoint]);

			const requestTypes = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.map(c => c[1]?.type);
			expect(requestTypes).not.toContain(RequestType.Auto);
			expect(requestTypes).toContain(RequestType.AutoModels);
		});

		it('uses /auto when the experiment enables it and no user setting exists', async () => {
			configurationService = new DefaultsOnlyConfigurationService();
			mockExpService = new class extends NullExperimentationService {
				override getTreatmentVariable<T extends boolean | number | string>(name: string): T | undefined {
					return name === 'copilotchat.autoModeV2Enabled' ? true as T : undefined;
				}
			}();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			automodeService = createService();
			const result = await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-v2-exp-on'
			} as ChatRequest, [gpt4oEndpoint]);

			expect(result.model).toBe('gpt-4o');
		});

		it('does not call /auto when the setting is disabled', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto({
				session_token: 'auto-v2-token',
				expires_at: Math.floor(Date.now() / 1000) + 86400,
				selected_model: { id: 'gpt-4o' },
			});

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-v2-disabled'
			};

			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			const autoCalls = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.filter(c => c[1]?.type === RequestType.Auto);
			expect(autoCalls).toHaveLength(0);
		});
	});
});
