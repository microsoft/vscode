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
import { NullTelemetryService } from '../../../telemetry/common/nullTelemetryService';
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
			new NullTelemetryService(),
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

	describe('concurrent resolution coalescing', () => {
		it('should return consistent model selection for concurrent calls with the same conversationId', async () => {
			mockApiResponse(['gpt-4o', 'gpt-4o-mini']);
			automodeService = createService();

			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'hello',
				sessionId: 'session-concurrent'
			};

			const [result1, result2, result3] = await Promise.all([
				automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]),
				automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]),
				automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]),
			]);

			expect(result1.model).toBe(result2.model);
			expect(result2.model).toBe(result3.model);
			expect(result1.modelProvider).toBe(result2.modelProvider);
		});

		it('should make only one CAPI token request for concurrent calls', async () => {
			mockApiResponse(['gpt-4o', 'gpt-4o-mini']);
			automodeService = createService();

			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'hello',
				sessionId: 'session-concurrent-token'
			};

			await Promise.all([
				automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]),
				automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]),
			]);

			// Only one CAPI token request for auto models should be made (not two)
			const capiCalls = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls;
			const autoModelsCalls = capiCalls.filter(call => call[1]?.type === RequestType.AutoModels);
			expect(autoModelsCalls.length).toBe(1);
		});

		it('should allow a new resolution after the first one completes', async () => {
			mockApiResponse(['gpt-4o', 'gpt-4o-mini']);
			automodeService = createService();

			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'hello',
				sessionId: 'session-sequential'
			};

			const result1 = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]);

			// Second call after first completes should succeed (hits cache, not pending map)
			const result2 = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]);
			expect(result1.model).toBe(result2.model);
		});

		it('should propagate errors to all concurrent callers', async () => {
			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('token fetch failed'));
			automodeService = createService();

			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'hello',
				sessionId: 'session-error'
			};

			const results = await Promise.allSettled([
				automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]),
				automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]),
			]);

			expect(results[0].status).toBe('rejected');
			expect(results[1].status).toBe('rejected');
		});

		it('should allow retry after a failed concurrent resolution', async () => {
			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('transient failure'));
			automodeService = createService();

			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'hello',
				sessionId: 'session-retry'
			};

			// First call fails
			await expect(automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint])).rejects.toThrow();

			// Pending promise should be cleared; retry should work
			mockApiResponse(['gpt-4o', 'gpt-4o-mini']);
			const result = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]);
			expect(result.model).toBeDefined();
		});
	});

	/**
	 * These tests demonstrate the duplicate telemetry bug fixed by this PR.
	 *
	 * Background:
	 * In a single tool-calling round, `runOne()` in toolCallingLoop.ts calls
	 * `getChatEndpoint(request)` up to 5 times concurrently (for getAvailableTools,
	 * buildPrompt, buildPrompt2, tokenizer, and fetch). On the first turn of a
	 * conversation, the cache is empty, so all 5 calls enter
	 * `resolveAutoModeEndpoint` simultaneously and each independently performs
	 * routing — emitting telemetry events for each redundant resolution.
	 *
	 * To reproduce: simulate 5 concurrent `resolveAutoModeEndpoint` calls to the
	 * same conversation and count telemetry emissions via a spy on the telemetry
	 * service. Without the _singleFlight fix, each concurrent call emits its own
	 * events (5× instead of 1×). With the fix, the first caller does the work
	 * and subsequent callers share its promise.
	 *
	 * Run these tests on the `main` branch to see the bug (5× emissions), then
	 * on this branch to see the fix (1× emission).
	 */
	describe('telemetry duplication from concurrent resolution', () => {
		// Helper: create an AutomodeService with a spy on sendMSFTTelemetryEvent
		// so we can count exactly how many telemetry events are emitted.
		function createServiceWithTelemetrySpy() {
			const telemetryService = new NullTelemetryService();
			const telemetrySpy = vi.spyOn(telemetryService, 'sendMSFTTelemetryEvent');
			const service = new AutomodeService(
				mockCAPIClientService,
				mockAuthService,
				mockLogService,
				mockInstantiationService,
				mockExpService,
				configurationService,
				envService,
				telemetryService,
				new NullRequestLogger()
			);
			return { service, telemetrySpy };
		}

		it('should emit automode.routerFallback exactly once for 5 concurrent calls (router fails)', async () => {
			// When the router API is not mocked, getRouterDecision throws,
			// causing _tryRouterSelection to return a fallbackReason.
			// The caller in resolveAutoModeEndpoint then emits routerFallback.
			// Without coalescing: 5 concurrent calls → 5 routerFallback events.
			// With coalescing: only the first caller runs → 1 routerFallback event.
			enableRouter();

			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			const claudeEndpoint = createEndpoint('claude-sonnet', 'Anthropic');
			mockApiResponse(['gpt-4o', 'claude-sonnet']);

			const { service, telemetrySpy } = createServiceWithTelemetrySpy();

			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-fallback-dup',
			};

			// Fire 5 concurrent calls, simulating what runOne() does
			const results = await Promise.all(Array.from({ length: 5 }, () =>
				service.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint, claudeEndpoint])
			));

			// All calls should resolve to the same model
			expect(new Set(results.map(r => r.model)).size).toBe(1);

			// Exactly 1 routerFallback event (not 5)
			const fallbackCalls = telemetrySpy.mock.calls.filter(c => c[0] === 'automode.routerFallback');
			expect(fallbackCalls).toHaveLength(1);
		});

		it('should emit automode.routerDecision exactly once for 5 concurrent calls (router succeeds)', async () => {
			// When the router API succeeds, RouterDecisionFetcher.getRouterDecision
			// emits routerDecision with the predicted label and confidence.
			// Without coalescing: 5 concurrent calls → 5 router API calls → 5 events.
			// With coalescing: 1 resolution → 1 router API call → 1 event.
			enableRouter();

			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			const claudeEndpoint = createEndpoint('claude-sonnet', 'Anthropic');

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
							chosen_model: 'gpt-4o',
							candidate_models: ['gpt-4o', 'claude-sonnet'],
							scores: { needs_reasoning: 0.9, no_reasoning: 0.1 },
							sticky_override: false
						}))
					});
				}
				return Promise.resolve(makeMockTokenResponse({
					available_models: ['gpt-4o', 'claude-sonnet'],
					expires_at: Math.floor(Date.now() / 1000) + 3600,
					session_token: 'test-token',
				}));
			});

			const { service, telemetrySpy } = createServiceWithTelemetrySpy();

			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-decision-dup',
			};

			const results = await Promise.all(Array.from({ length: 5 }, () =>
				service.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint, claudeEndpoint])
			));

			// Router should have picked gpt-4o for all concurrent callers
			expect(results.every(r => r.model === 'gpt-4o')).toBe(true);

			// Exactly 1 routerDecision event (not 5)
			const decisionCalls = telemetrySpy.mock.calls.filter(c => c[0] === 'automode.routerDecision');
			expect(decisionCalls).toHaveLength(1);

			// No fallback events since the router succeeded
			const fallbackCalls = telemetrySpy.mock.calls.filter(c => c[0] === 'automode.routerFallback');
			expect(fallbackCalls).toHaveLength(0);
		});

		it('should emit automode.routerFallback(hasImage) exactly once for 5 concurrent image calls', async () => {
			// When the request contains an image, _tryRouterSelection returns
			// early with fallbackReason='hasImage'. The race condition causes
			// each concurrent caller to independently hit this early return and
			// emit its own routerFallback event.
			// Without coalescing: 5 concurrent calls → 5 hasImage fallback events.
			// With coalescing: 1 resolution → 1 hasImage fallback event.
			enableRouter();

			const visionEndpoint = createEndpoint('gpt-4o', 'OpenAI', { supportsVision: true });
			mockApiResponse(['gpt-4o']);

			const { service, telemetrySpy } = createServiceWithTelemetrySpy();

			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'fix this',
				sessionId: 'session-image-dup',
				references: [{ id: 'img', value: { mimeType: 'image/png', data: new Uint8Array() } }] as any,
			};

			const results = await Promise.all(Array.from({ length: 5 }, () =>
				service.resolveAutoModeEndpoint(chatRequest as ChatRequest, [visionEndpoint])
			));

			expect(new Set(results.map(r => r.model)).size).toBe(1);

			// Exactly 1 hasImage fallback event (not 5)
			const hasImageCalls = telemetrySpy.mock.calls.filter(
				c => c[0] === 'automode.routerFallback' && (c[1] as Record<string, string>)?.reason === 'hasImage'
			);
			expect(hasImageCalls).toHaveLength(1);
		});

		it('should make only one CAPI token fetch for 5 concurrent calls', async () => {
			// Each concurrent resolveAutoModeEndpoint call reaches _acquireTokenBank.
			// When there's no cache entry (first turn), _acquireTokenBank creates a
			// NEW AutoModeTokenBank each time (taking the reserve bank, then creating
			// a fresh reserve). Each bank has its own FetchedValue, so FetchedValue's
			// built-in request coalescing doesn't help — each bank fetches its own
			// CAPI token independently.
			//
			// Without coalescing: 5 concurrent calls → 5 separate token banks →
			//   5 CAPI makeRequest(AutoModels) calls.
			// With coalescing: only the first caller enters resolveAutoModeEndpoint,
			//   creates 1 token bank, makes 1 CAPI call. Others await the same promise.
			mockApiResponse(['gpt-4o', 'gpt-4o-mini']);
			automodeService = createService();

			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'hello',
				sessionId: 'session-capi-dup'
			};

			await Promise.all(Array.from({ length: 5 }, () =>
				automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint])
			));

			// Count CAPI token requests (AutoModels type)
			const capiCalls = (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls;
			const autoModelsCalls = capiCalls.filter((call: any[]) => call[1]?.type === RequestType.AutoModels);

			// Exactly 1 CAPI token fetch (not 5)
			expect(autoModelsCalls).toHaveLength(1);
		});
	});
});
