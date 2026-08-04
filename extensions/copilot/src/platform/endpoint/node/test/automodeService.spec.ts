/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from '@vscode/copilot-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatRequest } from 'vscode';
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
function makeMockTokenResponse(body: { available_models: string[]; expires_at: number; session_token: string }) {
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
			new NullRequestLogger()
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

		mockAuthService = {
			getCopilotToken: vi.fn().mockResolvedValue({ token: 'test-auth-token' }),
			onDidAuthenticationChange: vi.fn().mockReturnValue({ dispose: vi.fn() })
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
				(_ctor: any, wrappedEndpoint: IChatEndpoint) => wrappedEndpoint
			)
		} as unknown as IInstantiationService;

		mockExpService = new NullExperimentationService();

		envService = new NullEnvService();
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

	describe('multi-turn routing', () => {
		const sigma = { reasoning: 0.15, code_gen: 0.20, debugging: 0.15, tool_use: 0.25 };
		const lowVector = { reasoning: 0.30, code_gen: 0.50, debugging: 0.20, tool_use: 0.40 };
		const highVector = { reasoning: 0.90, code_gen: 0.55, debugging: 0.15, tool_use: 0.45 };

		function enableMultiTurnExp(value: boolean | undefined): IExperimentationService {
			return {
				getTreatmentVariable: vi.fn().mockImplementation((name: string) => name === 'copilotchat.autoMultiTurnRouting' ? value : undefined),
			} as unknown as IExperimentationService;
		}

		beforeEach(() => {
			// The feature is default-off (A/B enrollment gate); opt this suite into the treatment arm.
			mockExpService = enableMultiTurnExp(true);
		});

		function mockMultiTurnRouter(opts: {
			available_models: string[];
			multi_turn: unknown;
			checks: Array<{ hydra_scores: Record<string, number>; candidate_models: string[]; chosen_model?: string }>;
		}): void {
			let index = 0;
			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation((_body: any, o: any) => {
				if (o?.type === RequestType.ModelRouter) {
					const check = opts.checks[Math.min(index, opts.checks.length - 1)];
					index++;
					return Promise.resolve({
						ok: true,
						status: 200,
						headers: createMockHeaders(),
						text: vi.fn().mockResolvedValue(JSON.stringify({
							predicted_label: 'needs_reasoning',
							confidence: 0.9,
							latency_ms: 10,
							candidate_models: check.candidate_models,
							chosen_model: check.chosen_model,
							scores: { needs_reasoning: 0.9, no_reasoning: 0.1 },
							hydra_scores: check.hydra_scores,
							multi_turn: opts.multi_turn,
							sticky_override: false,
						})),
					});
				}
				return Promise.resolve(makeMockTokenResponse({
					available_models: opts.available_models,
					expires_at: Math.floor(Date.now() / 1000) + 3600,
					session_token: 'test-token',
				}));
			});
		}

		function routerCallCount(): number {
			return (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls
				.filter((call: unknown[]) => (call[1] as { type?: RequestType })?.type === RequestType.ModelRouter).length;
		}

		async function runTurns(service: AutomodeService, sessionId: string, endpoints: IChatEndpoint[], count: number): Promise<string[]> {
			const models: string[] = [];
			for (let turn = 0; turn < count; turn++) {
				const request: Partial<ChatRequest> = { location: ChatLocation.Panel, prompt: `turn ${turn}`, sessionId };
				const result = await service.resolveAutoModeEndpoint(request as ChatRequest, endpoints);
				models.push(result.model);
			}
			return models;
		}

		it('checks on turns 0, 1, 4, 9 and keeps the anchored model in between', async () => {
			const mini = createEndpoint('gpt-4o-mini', 'OpenAI');
			const gpt4o = createEndpoint('gpt-4o', 'OpenAI');
			mockMultiTurnRouter({
				available_models: ['gpt-4o-mini', 'gpt-4o'],
				multi_turn: { enabled: true, sigma, escalate_threshold: 2, initial_skip: 2, backoff_coefficient: 2, max_skip: 32, schedule_version: 'v1' },
				checks: [{ hydra_scores: lowVector, candidate_models: ['gpt-4o-mini'] }],
			});

			automodeService = createService();
			const models = await runTurns(automodeService, 'mt-backoff', [mini, gpt4o], 10);

			expect(routerCallCount()).toBe(4);
			expect(new Set(models)).toEqual(new Set(['gpt-4o-mini']));
		});

		it('escalates to the stronger candidate when drift crosses the threshold', async () => {
			const mini = createEndpoint('gpt-4o-mini', 'OpenAI');
			const gpt4o = createEndpoint('gpt-4o', 'OpenAI');
			mockMultiTurnRouter({
				available_models: ['gpt-4o-mini', 'gpt-4o'],
				multi_turn: { enabled: true, sigma, escalate_threshold: 1.5, initial_skip: 2, backoff_coefficient: 2, max_skip: 32 },
				checks: [
					{ hydra_scores: lowVector, candidate_models: ['gpt-4o-mini'] },
					{ hydra_scores: highVector, candidate_models: ['gpt-4o'] },
				],
			});

			automodeService = createService();
			const models = await runTurns(automodeService, 'mt-escalate', [mini, gpt4o], 2);

			expect(models).toEqual(['gpt-4o-mini', 'gpt-4o']);
			expect(routerCallCount()).toBe(2);
		});

		it('prefers chosen_model over candidate_models[0] in multi-turn anchor and escalation', async () => {
			const codex = createEndpoint('gpt-5.3-codex', 'OpenAI');
			const mini = createEndpoint('gpt-5.4-mini', 'OpenAI');
			const gpt4o = createEndpoint('gpt-4o', 'OpenAI');
			mockMultiTurnRouter({
				available_models: ['gpt-5.3-codex', 'gpt-5.4-mini', 'gpt-4o'],
				multi_turn: { enabled: true, sigma, escalate_threshold: 1.5, initial_skip: 2, backoff_coefficient: 2, max_skip: 32 },
				checks: [
					{ hydra_scores: lowVector, candidate_models: ['gpt-5.3-codex', 'gpt-5.4-mini'], chosen_model: 'gpt-5.4-mini' },
					{ hydra_scores: highVector, candidate_models: ['gpt-5.4-mini', 'gpt-4o'], chosen_model: 'gpt-4o' },
				],
			});

			automodeService = createService();
			const models = await runTurns(automodeService, 'mt-chosen-model', [codex, mini, gpt4o], 2);

			expect(models).toEqual(['gpt-5.4-mini', 'gpt-4o']);
		});

		it('caps the skip window at max_skip', async () => {
			const mini = createEndpoint('gpt-4o-mini', 'OpenAI');
			mockMultiTurnRouter({
				available_models: ['gpt-4o-mini'],
				multi_turn: { enabled: true, sigma, escalate_threshold: 2, initial_skip: 2, backoff_coefficient: 2, max_skip: 4 },
				checks: [{ hydra_scores: lowVector, candidate_models: ['gpt-4o-mini'] }],
			});

			automodeService = createService();
			await runTurns(automodeService, 'mt-maxskip', [mini], 15);

			// Without the cap the window would grow 2,4,8,16 (checks at 0,1,4,9,18 => 4 calls in 15 turns).
			// Capped at 4 the checks land on 0,1,4,9,14 => 5 calls.
			expect(routerCallCount()).toBe(5);
		});

		it('re-anchors after compaction invalidates the schedule', async () => {
			const mini = createEndpoint('gpt-4o-mini', 'OpenAI');
			const gpt4o = createEndpoint('gpt-4o', 'OpenAI');
			mockMultiTurnRouter({
				available_models: ['gpt-4o-mini', 'gpt-4o'],
				multi_turn: { enabled: true, sigma, escalate_threshold: 2, initial_skip: 2, backoff_coefficient: 2, max_skip: 32 },
				checks: [{ hydra_scores: lowVector, candidate_models: ['gpt-4o-mini'] }],
			});

			automodeService = createService();
			const endpoints = [mini, gpt4o];
			await runTurns(automodeService, 'mt-compact', endpoints, 2);
			expect(routerCallCount()).toBe(2);

			// Turn 2 would normally be skipped; compaction forces a fresh reroute.
			automodeService.invalidateRouterCache({ sessionId: 'mt-compact' } as ChatRequest);
			const request: Partial<ChatRequest> = { location: ChatLocation.Panel, prompt: 'after compact', sessionId: 'mt-compact' };
			await automodeService.resolveAutoModeEndpoint(request as ChatRequest, endpoints);

			expect(routerCallCount()).toBe(3);
		});

		it('keeps the compaction reroute for the next real turn when a non-turn resolve intervenes', async () => {
			const mini = createEndpoint('gpt-4o-mini', 'OpenAI');
			const gpt4o = createEndpoint('gpt-4o', 'OpenAI');
			mockMultiTurnRouter({
				available_models: ['gpt-4o-mini', 'gpt-4o'],
				multi_turn: { enabled: true, sigma, escalate_threshold: 2, initial_skip: 2, backoff_coefficient: 2, max_skip: 32 },
				checks: [{ hydra_scores: lowVector, candidate_models: ['gpt-4o-mini'] }],
			});

			automodeService = createService();
			const endpoints = [mini, gpt4o];
			// Two turns leave the schedule mid-skip (skipRemaining > 0), so the next turn would normally skip.
			await runTurns(automodeService, 'mt-compact-intervene', endpoints, 2);
			expect(routerCallCount()).toBe(2);

			// Compaction invalidates the schedule.
			automodeService.invalidateRouterCache({ sessionId: 'mt-compact-intervene' } as ChatRequest);

			// A non-user-turn resolve (e.g. an empty-prompt warmup) fires before the next user message.
			// It must NOT consume the reroute flag or route — otherwise the real turn loses the re-anchor.
			const warmup: Partial<ChatRequest> = { location: ChatLocation.Panel, prompt: '', sessionId: 'mt-compact-intervene' };
			await automodeService.resolveAutoModeEndpoint(warmup as ChatRequest, endpoints);
			expect(routerCallCount()).toBe(2);

			// The next real user turn must still re-anchor (router called again).
			const next: Partial<ChatRequest> = { location: ChatLocation.Panel, prompt: 'after compact', sessionId: 'mt-compact-intervene' };
			await automodeService.resolveAutoModeEndpoint(next as ChatRequest, endpoints);
			expect(routerCallCount()).toBe(3);
		});

		it('falls back to legacy sticky behavior when the client kill switch is off', async () => {
			const mini = createEndpoint('gpt-4o-mini', 'OpenAI');
			const gpt4o = createEndpoint('gpt-4o', 'OpenAI');
			mockExpService = enableMultiTurnExp(false);
			mockMultiTurnRouter({
				available_models: ['gpt-4o-mini', 'gpt-4o'],
				multi_turn: { enabled: true, sigma, escalate_threshold: 2, initial_skip: 2, backoff_coefficient: 2, max_skip: 32 },
				checks: [{ hydra_scores: lowVector, candidate_models: ['gpt-4o-mini'] }],
			});

			automodeService = createService();
			const models = await runTurns(automodeService, 'mt-killswitch', [mini, gpt4o], 5);

			// Legacy path: the router runs only on the first turn, the model stays sticky for the rest
			// of the conversation, and no multi-turn routing decisions are made or reported.
			expect(routerCallCount()).toBe(1);
			expect(models).toEqual(['gpt-4o-mini', 'gpt-4o-mini', 'gpt-4o-mini', 'gpt-4o-mini', 'gpt-4o-mini']);
			expect(mockTelemetryService.sendMSFTTelemetryEvent.mock.calls.some((call: unknown[]) => call[0] === 'automode.multiTurnRouting')).toBe(false);
		});

		it('still re-routes on compaction when the flag is off (legacy behavior preserved)', async () => {
			const mini = createEndpoint('gpt-4o-mini', 'OpenAI');
			const gpt4o = createEndpoint('gpt-4o', 'OpenAI');
			const endpoints = [mini, gpt4o];
			const sessionId = 'mt-off-compact';
			mockExpService = enableMultiTurnExp(false);
			mockMultiTurnRouter({
				available_models: ['gpt-4o-mini', 'gpt-4o'],
				multi_turn: { enabled: true, sigma, escalate_threshold: 2, initial_skip: 2, backoff_coefficient: 2, max_skip: 32 },
				checks: [
					{ hydra_scores: lowVector, candidate_models: ['gpt-4o-mini'] },   // turn 0: initial route
					{ hydra_scores: lowVector, candidate_models: ['gpt-4o'] },        // post-compaction reroute
				],
			});

			automodeService = createService();
			await runTurns(automodeService, sessionId, endpoints, 2); // turn 0 routes to mini, turn 1 sticky
			expect(routerCallCount()).toBe(1);

			automodeService.invalidateRouterCache({ sessionId } as ChatRequest);
			const afterCompact = (await automodeService.resolveAutoModeEndpoint({ location: ChatLocation.Panel, prompt: 'after compact', sessionId } as ChatRequest, endpoints)).model;

			// Compaction forces a fresh route even in the legacy path and can move to a new model.
			expect(routerCallCount()).toBe(2);
			expect(afterCompact).toBe('gpt-4o');
		});

		it('reverts to legacy sticky when the flag is turned off mid-conversation', async () => {
			const mini = createEndpoint('gpt-4o-mini', 'OpenAI');
			const gpt4o = createEndpoint('gpt-4o', 'OpenAI');
			const endpoints = [mini, gpt4o];
			const sessionId = 'mt-flip-off';
			// A treatment whose value can change mid-session (ExP refresh / account change).
			let treatment: boolean | undefined = true;
			mockExpService = {
				getTreatmentVariable: vi.fn().mockImplementation((name: string) => name === 'copilotchat.autoMultiTurnRouting' ? treatment : undefined),
			} as unknown as IExperimentationService;
			mockMultiTurnRouter({
				available_models: ['gpt-4o-mini', 'gpt-4o'],
				multi_turn: { enabled: true, sigma, escalate_threshold: 2, initial_skip: 2, backoff_coefficient: 2, max_skip: 32 },
				checks: [{ hydra_scores: lowVector, candidate_models: ['gpt-4o-mini'] }],
			});

			automodeService = createService();
			for (let turn = 0; turn < 6; turn++) {
				if (turn === 2) {
					treatment = false; // member opts out mid-conversation
				}
				await automodeService.resolveAutoModeEndpoint({ location: ChatLocation.Panel, prompt: `turn ${turn}`, sessionId } as ChatRequest, endpoints);
			}

			// Checks happen only while enabled (turns 0 and 1). After opting out, the stale schedule is
			// ignored and legacy stickiness applies, so the otherwise-scheduled check at turn 4 does not fire.
			expect(routerCallCount()).toBe(2);
		});

		it('does not activate multi-turn routing by default when unassigned', async () => {
			const mini = createEndpoint('gpt-4o-mini', 'OpenAI');
			const gpt4o = createEndpoint('gpt-4o', 'OpenAI');
			mockExpService = enableMultiTurnExp(undefined);
			mockMultiTurnRouter({
				available_models: ['gpt-4o-mini', 'gpt-4o'],
				multi_turn: { enabled: true, sigma, escalate_threshold: 2, initial_skip: 2, backoff_coefficient: 2, max_skip: 32 },
				checks: [{ hydra_scores: lowVector, candidate_models: ['gpt-4o-mini'] }],
			});

			automodeService = createService();
			await runTurns(automodeService, 'mt-default-off', [mini, gpt4o], 3);

			// Default off: legacy sticky even though the server sent a valid multi_turn config.
			expect(routerCallCount()).toBe(1);
		});

		it('stamps the treatment arm on routerModelSelection telemetry', async () => {
			const mini = createEndpoint('gpt-4o-mini', 'OpenAI');
			const gpt4o = createEndpoint('gpt-4o', 'OpenAI');
			mockMultiTurnRouter({
				available_models: ['gpt-4o-mini', 'gpt-4o'],
				multi_turn: { enabled: true, sigma, escalate_threshold: 2, initial_skip: 2, backoff_coefficient: 2, max_skip: 32 },
				checks: [{ hydra_scores: lowVector, candidate_models: ['gpt-4o-mini'] }],
			});

			automodeService = createService();
			await runTurns(automodeService, 'mt-arm', [mini, gpt4o], 1);

			const event = mockTelemetryService.sendMSFTTelemetryEvent.mock.calls.find((call: unknown[]) => call[0] === 'automode.routerModelSelection');
			expect(event?.[1]).toMatchObject({ multiTurnEnabled: 'true' });
		});

		it('emits automode.multiTurnSkip on skipped turns', async () => {
			const mini = createEndpoint('gpt-4o-mini', 'OpenAI');
			const gpt4o = createEndpoint('gpt-4o', 'OpenAI');
			mockMultiTurnRouter({
				available_models: ['gpt-4o-mini', 'gpt-4o'],
				multi_turn: { enabled: true, sigma, escalate_threshold: 2, initial_skip: 2, backoff_coefficient: 2, max_skip: 32, schedule_version: 'v1' },
				checks: [{ hydra_scores: lowVector, candidate_models: ['gpt-4o-mini'] }],
			});

			automodeService = createService();
			await runTurns(automodeService, 'mt-skip-telemetry', [mini, gpt4o], 4); // turns 2 and 3 are skips

			const skipEvents = mockTelemetryService.sendMSFTTelemetryEvent.mock.calls.filter((call: unknown[]) => call[0] === 'automode.multiTurnSkip');
			expect(skipEvents.length).toBe(2);
			expect(skipEvents[0][2]).toMatchObject({ skipRemaining: 1 });
		});

		it('emits automode.multiTurnAbort and falls back to legacy when the server sigma is unusable', async () => {
			const mini = createEndpoint('gpt-4o-mini', 'OpenAI');
			const gpt4o = createEndpoint('gpt-4o', 'OpenAI');
			mockMultiTurnRouter({
				available_models: ['gpt-4o-mini', 'gpt-4o'],
				multi_turn: { enabled: true, sigma: { reasoning: 0 }, escalate_threshold: 2, initial_skip: 2, backoff_coefficient: 2, max_skip: 32 },
				checks: [{ hydra_scores: lowVector, candidate_models: ['gpt-4o-mini'] }],
			});

			automodeService = createService();
			await runTurns(automodeService, 'mt-abort', [mini, gpt4o], 3);

			const abortEvents = mockTelemetryService.sendMSFTTelemetryEvent.mock.calls.filter((call: unknown[]) => call[0] === 'automode.multiTurnAbort');
			expect(abortEvents.length).toBe(1);
			expect(abortEvents[0][1]).toMatchObject({ reason: 'invalidSigma' });
			// Fell back to legacy sticky: router only on turn 0.
			expect(routerCallCount()).toBe(1);
		});

		it('clears the multi-turn schedule when the server disables it after activation', async () => {
			const mini = createEndpoint('gpt-4o-mini', 'OpenAI');
			const gpt4o = createEndpoint('gpt-4o', 'OpenAI');
			const config = { enabled: true, sigma, escalate_threshold: 2, initial_skip: 2, backoff_coefficient: 2, max_skip: 32, schedule_version: 'v1' };
			let call = 0;
			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation((_body: any, o: any) => {
				if (o?.type === RequestType.ModelRouter) {
					call++;
					const body = call === 3
						? {
							predicted_label: 'needs_reasoning',
							confidence: 0.9,
							latency_ms: 5,
							candidate_models: ['gpt-4o'],
							scores: { needs_reasoning: 0.9, no_reasoning: 0.1 },
							hydra_scores: lowVector,
							multi_turn: { enabled: false, sigma },
							sticky_override: false,
						}
						: {
							predicted_label: 'no_reasoning',
							confidence: 0.9,
							latency_ms: 5,
							candidate_models: ['gpt-4o-mini'],
							scores: { needs_reasoning: 0.1, no_reasoning: 0.9 },
							hydra_scores: lowVector,
							multi_turn: config,
							sticky_override: false,
						};
					return Promise.resolve({ ok: true, status: 200, headers: createMockHeaders(), text: vi.fn().mockResolvedValue(JSON.stringify(body)) });
				}
				return Promise.resolve(makeMockTokenResponse({ available_models: ['gpt-4o-mini', 'gpt-4o'], expires_at: Math.floor(Date.now() / 1000) + 3600, session_token: 'test-token' }));
			});

			automodeService = createService();
			const models = await runTurns(automodeService, 'mt-server-disabled', [mini, gpt4o], 6);

			expect(models).toEqual(['gpt-4o-mini', 'gpt-4o-mini', 'gpt-4o-mini', 'gpt-4o-mini', 'gpt-4o', 'gpt-4o-mini']);
			expect(routerCallCount()).toBe(3);
		});

		it('keeps multi-turn alive after a transient router fallback (B1)', async () => {
			const mini = createEndpoint('gpt-4o-mini', 'OpenAI');
			const gpt4o = createEndpoint('gpt-4o', 'OpenAI');
			const endpoints = [mini, gpt4o];
			const config = { enabled: true, sigma, escalate_threshold: 2, initial_skip: 2, backoff_coefficient: 2, max_skip: 32, schedule_version: 'v1' };
			let call = 0;
			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation((_body: any, o: any) => {
				if (o?.type === RequestType.ModelRouter) {
					call++;
					const body = call === 3 // the turn-4 check fails transiently
						? { predicted_label: 'fallback', confidence: 0, latency_ms: 5, candidate_models: [], scores: { needs_reasoning: 0, no_reasoning: 0 }, fallback: true, fallback_reason: 'blip' }
						: { predicted_label: 'no_reasoning', confidence: 0.9, latency_ms: 5, candidate_models: ['gpt-4o-mini'], scores: { needs_reasoning: 0.1, no_reasoning: 0.9 }, hydra_scores: lowVector, multi_turn: config, sticky_override: false };
					return Promise.resolve({ ok: true, status: 200, headers: createMockHeaders(), text: vi.fn().mockResolvedValue(JSON.stringify(body)) });
				}
				return Promise.resolve(makeMockTokenResponse({ available_models: ['gpt-4o-mini', 'gpt-4o'], expires_at: Math.floor(Date.now() / 1000) + 3600, session_token: 'test-token' }));
			});

			automodeService = createService();
			for (let turn = 0; turn < 6; turn++) {
				await automodeService.resolveAutoModeEndpoint({ location: ChatLocation.Panel, prompt: `turn ${turn}`, sessionId: 'mt-b1' } as ChatRequest, endpoints);
			}

			// Router is called on turns 0, 1, 4 (transient fallback), and 5. Preserving the schedule
			// across the blip keeps turn 5 a multi-turn check; without it, turn 4 would drop to legacy
			// sticky and turn 5 would make no router call (3 total).
			expect(routerCallCount()).toBe(4);
		});

		it('re-anchors on compaction even when the prompt is unchanged (B2)', async () => {
			const mini = createEndpoint('gpt-4o-mini', 'OpenAI');
			const gpt4o = createEndpoint('gpt-4o', 'OpenAI');
			const endpoints = [mini, gpt4o];
			const sessionId = 'mt-b2';
			mockMultiTurnRouter({
				available_models: ['gpt-4o-mini', 'gpt-4o'],
				multi_turn: { enabled: true, sigma, escalate_threshold: 2, initial_skip: 2, backoff_coefficient: 2, max_skip: 32, schedule_version: 'v1' },
				checks: [{ hydra_scores: lowVector, candidate_models: ['gpt-4o-mini'] }],
			});

			automodeService = createService();
			const request: Partial<ChatRequest> = { location: ChatLocation.Panel, prompt: 'same prompt', sessionId };
			await automodeService.resolveAutoModeEndpoint(request as ChatRequest, endpoints); // turn 0 anchor
			expect(routerCallCount()).toBe(1);

			// Compaction, then the SAME prompt re-resolves: must still re-route and re-anchor.
			automodeService.invalidateRouterCache({ sessionId } as ChatRequest);
			await automodeService.resolveAutoModeEndpoint(request as ChatRequest, endpoints);
			expect(routerCallCount()).toBe(2);

			const mtEvents = mockTelemetryService.sendMSFTTelemetryEvent.mock.calls.filter((call: unknown[]) => call[0] === 'automode.multiTurnRouting');
			expect(mtEvents[mtEvents.length - 1][1]).toMatchObject({ decision: 'anchor', reason: 'compaction' });
		});

		it('re-anchors instead of labeling a stay when the current model leaves knownEndpoints (B3)', async () => {
			const mini = createEndpoint('gpt-4o-mini', 'OpenAI');
			const gpt4o = createEndpoint('gpt-4o', 'OpenAI');
			const sessionId = 'mt-b3';
			mockMultiTurnRouter({
				available_models: ['gpt-4o-mini', 'gpt-4o'],
				multi_turn: { enabled: true, sigma, escalate_threshold: 2, initial_skip: 2, backoff_coefficient: 2, max_skip: 32, schedule_version: 'v1' },
				checks: [
					{ hydra_scores: lowVector, candidate_models: ['gpt-4o-mini'] }, // turn 0: anchor -> mini
					{ hydra_scores: lowVector, candidate_models: ['gpt-4o'] },      // turn 1: low-drift 'stay', but mini is gone -> re-anchor to gpt-4o
				],
			});

			automodeService = createService();
			const r0 = await automodeService.resolveAutoModeEndpoint({ location: ChatLocation.Panel, prompt: 'turn 0', sessionId } as ChatRequest, [mini, gpt4o]);
			expect(r0.model).toBe('gpt-4o-mini');

			// mini is no longer a known endpoint; the low-drift check would be a 'stay' but the pinned
			// model is gone, so we re-anchor onto the router's candidate (gpt-4o) rather than mislabeling.
			const r1 = await automodeService.resolveAutoModeEndpoint({ location: ChatLocation.Panel, prompt: 'turn 1', sessionId } as ChatRequest, [gpt4o]);
			expect(r1.model).toBe('gpt-4o');

			const mtEvents = mockTelemetryService.sendMSFTTelemetryEvent.mock.calls.filter((call: unknown[]) => call[0] === 'automode.multiTurnRouting');
			expect(mtEvents[mtEvents.length - 1][1]).toMatchObject({ decision: 'anchor', reason: 'modelUnavailable' });
		});

		it('drives the full pipeline: anchor, backoff skips, escalation + re-anchor, and compaction reset', async () => {
			const mini = createEndpoint('gpt-4o-mini', 'OpenAI');
			const gpt4o = createEndpoint('gpt-4o', 'OpenAI');
			const endpoints = [mini, gpt4o];
			const sessionId = 'mt-pipeline';
			const anchor0 = { reasoning: 0.30, code_gen: 0.50, debugging: 0.20, tool_use: 0.40 };

			// Router responses in check order. With initial_skip=2, coefficient=2 the checks land on
			// turns 0, 1, 4, 5, 8, and 9 (the last forced by compaction). Only `reasoning` moves, so
			// drift comes purely from that dimension (sigma.reasoning = 0.15).
			mockMultiTurnRouter({
				available_models: ['gpt-4o-mini', 'gpt-4o'],
				multi_turn: { enabled: true, sigma, escalate_threshold: 2, initial_skip: 2, backoff_coefficient: 2, max_skip: 32, schedule_version: 'v1' },
				checks: [
					{ hydra_scores: anchor0, candidate_models: ['gpt-4o-mini'] },                                      // turn 0: anchor
					{ hydra_scores: { ...anchor0, reasoning: 0.35 }, candidate_models: ['gpt-4o-mini'] },              // turn 1: +0.05 -> drift 0.333 -> stay
					{ hydra_scores: { ...anchor0, reasoning: 0.70 }, candidate_models: ['gpt-4o'] },                   // turn 4: +0.40 -> drift 2.667 -> escalate (re-anchor)
					{ hydra_scores: { reasoning: 0.72, code_gen: 0.50, debugging: 0.20, tool_use: 0.40 }, candidate_models: ['gpt-4o'] }, // turn 5: +0.02 vs new anchor -> stay
					{ hydra_scores: { reasoning: 0.75, code_gen: 0.50, debugging: 0.20, tool_use: 0.40 }, candidate_models: ['gpt-4o'] }, // turn 8: +0.05 vs new anchor -> stay
					{ hydra_scores: { reasoning: 0.60, code_gen: 0.50, debugging: 0.20, tool_use: 0.40 }, candidate_models: ['gpt-4o'] }, // turn 9: compaction -> anchor
				],
			});

			automodeService = createService();

			const mtEvents = () => mockTelemetryService.sendMSFTTelemetryEvent.mock.calls.filter((call: unknown[]) => call[0] === 'automode.multiTurnRouting');
			const round3 = (n: number): number => Math.round(n * 1000) / 1000;

			const trace: Array<Record<string, unknown>> = [];
			for (let turn = 0; turn < 10; turn++) {
				if (turn === 9) {
					// Compaction / summarization is a natural full-reset point.
					automodeService.invalidateRouterCache({ sessionId } as ChatRequest);
				}
				const callsBefore = routerCallCount();
				const mtBefore = mtEvents().length;
				const request: Partial<ChatRequest> = { location: ChatLocation.Panel, prompt: `turn ${turn}`, sessionId };
				const model = (await automodeService.resolveAutoModeEndpoint(request as ChatRequest, endpoints)).model;
				const routerCalled = routerCallCount() > callsBefore;
				const mt = mtEvents().slice(mtBefore)[0];
				const props = mt?.[1] as { decision: string } | undefined;
				const meas = mt?.[2] as { drift: number; skipWindow: number; turnsSinceAnchor: number } | undefined;
				trace.push({
					turn,
					routerCalled,
					model,
					decision: props?.decision ?? 'skip',
					drift: meas ? round3(meas.drift) : undefined,
					skipWindow: meas?.skipWindow,
					turnsSinceAnchor: meas?.turnsSinceAnchor,
				});
			}

			expect(trace).toEqual([
				{ turn: 0, routerCalled: true, model: 'gpt-4o-mini', decision: 'anchor', drift: -1, skipWindow: 2, turnsSinceAnchor: 0 },
				{ turn: 1, routerCalled: true, model: 'gpt-4o-mini', decision: 'stay', drift: 0.333, skipWindow: 4, turnsSinceAnchor: 1 },
				{ turn: 2, routerCalled: false, model: 'gpt-4o-mini', decision: 'skip', drift: undefined, skipWindow: undefined, turnsSinceAnchor: undefined },
				{ turn: 3, routerCalled: false, model: 'gpt-4o-mini', decision: 'skip', drift: undefined, skipWindow: undefined, turnsSinceAnchor: undefined },
				{ turn: 4, routerCalled: true, model: 'gpt-4o', decision: 'escalate', drift: 2.667, skipWindow: 2, turnsSinceAnchor: 0 },
				{ turn: 5, routerCalled: true, model: 'gpt-4o', decision: 'stay', drift: 0.133, skipWindow: 4, turnsSinceAnchor: 1 },
				{ turn: 6, routerCalled: false, model: 'gpt-4o', decision: 'skip', drift: undefined, skipWindow: undefined, turnsSinceAnchor: undefined },
				{ turn: 7, routerCalled: false, model: 'gpt-4o', decision: 'skip', drift: undefined, skipWindow: undefined, turnsSinceAnchor: undefined },
				{ turn: 8, routerCalled: true, model: 'gpt-4o', decision: 'stay', drift: 0.333, skipWindow: 8, turnsSinceAnchor: 4 },
				{ turn: 9, routerCalled: true, model: 'gpt-4o', decision: 'anchor', drift: -1, skipWindow: 2, turnsSinceAnchor: 0 },
			]);
		});
	});
});
