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
import { ConfigKey, IConfigurationService } from '../../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import { NullEnvService } from '../../../env/common/nullEnvService';
import { ILogService } from '../../../log/common/logService';
import { IChatEndpoint } from '../../../networking/common/networking';
import { NullRequestLogger } from '../../../requestLogger/node/nullRequestLogger';
import { IExperimentationService, NullExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../telemetry/common/telemetry';
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
	let configurationService: IConfigurationService;
	let mockChatEndpoint: IChatEndpoint;
	let envService: NullEnvService;
	let mockTelemetryService: ITelemetryService & { sendMSFTTelemetryEvent: ReturnType<typeof vi.fn> };

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
			configurationService,
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
		(configurationService as InMemoryConfigurationService).setConfig(
			ConfigKey.TeamInternal.UseAutoModeRouting,
			true
		);
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

		configurationService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
		envService = new NullEnvService();
		mockTelemetryService = {
			sendTelemetryEvent: vi.fn(),
			sendMSFTTelemetryEvent: vi.fn(),
			sendTelemetryErrorEvent: vi.fn(),
			sendMSFTTelemetryErrorEvent: vi.fn(),
			sendSharedTelemetryEvent: vi.fn(),
		} as unknown as ITelemetryService & { sendMSFTTelemetryEvent: ReturnType<typeof vi.fn> };
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

		it('should not use router when routing is not enabled', async () => {
			// Routing not enabled via UseAutoModeRouting config
			automodeService = createService();

			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt'
			};

			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]);

			// Verify that router API was NOT called (exp / config disabled)
			expect(mockCAPIClientService.makeRequest).not.toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ type: RequestType.ModelRouter })
			);
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

		it('should throw when no available models match any known endpoint', async () => {
			mockApiResponse(['unknown-model-1', 'unknown-model-2']);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test',
				sessionId: 'session-no-match'
			};

			await expect(
				automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint])
			).rejects.toThrow('no available model found');
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
			// Advance past the 1-second router timeout to trigger the abort
			await vi.advanceTimersByTimeAsync(1000);

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

			// Without invalidation, changing prompt should still return cached model
			const chatRequest2: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'second question',
				sessionId: 'session-invalidate'
			};
			const cachedResult = await automodeService.resolveAutoModeEndpoint(chatRequest2 as ChatRequest, [gpt4oEndpoint, claudeEndpoint]);
			expect(cachedResult.model).toBe('gpt-4o');

			// Invalidate the cache
			automodeService.invalidateRouterCache({ sessionId: 'session-invalidate' } as ChatRequest);

			// Now the router should re-run and pick claude
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
			// No vision model available, should keep the first available model and warn
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

		it('should emit overrideReason=clientOverride when vision fallback changes the model', async () => {
			enableRouter();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI', { supportsVision: true });
			const claudeEndpoint = createEndpoint('claude-sonnet', 'Anthropic', { supportsVision: false });

			// Router picks claude-sonnet (no vision), vision fallback should override to gpt-4o
			mockRouterResponse(
				['claude-sonnet', 'gpt-4o'],
				{ chosen_model: 'claude-sonnet', candidate_models: ['claude-sonnet', 'gpt-4o'] }
			);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'describe this image',
				sessionId: 'session-telemetry-vision',
				references: [{ id: 'img', value: { mimeType: 'image/png', data: new Uint8Array() } }] as any
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
			// candidateModel is not set when router returns unknown model, so event should not emit
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

		it('should iterate all candidate_models when first candidate has no endpoint', async () => {
			enableRouter();
			const gpt41Endpoint = createEndpoint('gpt-4.1', 'OpenAI');

			mockRouterResponse(
				['gpt-4.1'],
				{ chosen_model: 'gpt-4.1', candidate_models: ['unknown-new-model', 'gpt-4.1'] }
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

		it('should throw when all available_models are unknown to knownEndpoints', async () => {
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

			await expect(
				automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint])
			).rejects.toThrow('no available model found');
			expect(mockLogService.warn).toHaveBeenCalledWith(
				expect.stringContaining('No available_models matched knownEndpoints')
			);
		});
	});
});
