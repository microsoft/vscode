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
import { BaseConfig, ConfigKey, IConfigurationService } from '../../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import { createPngBytes } from '../../../image/common/test/testImageData';
import { ILogService } from '../../../log/common/logService';
import { IChatEndpoint } from '../../../networking/common/networking';
import { NullRequestLogger } from '../../../requestLogger/node/nullRequestLogger';
import { IExperimentationService, NullExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../telemetry/common/telemetry';
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

describe('AutomodeService', () => {
	let automodeService: AutomodeService;
	let mockCAPIClientService: ICAPIClientService;
	let mockAuthService: IAuthenticationService;
	let mockLogService: ILogService;
	let mockInstantiationService: IInstantiationService;
	let mockExpService: IExperimentationService;
	let mockChatEndpoint: IChatEndpoint;
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
			mockTelemetryService,
			new NullRequestLogger(),
			configurationService
		);
	}

	function configure(overrides: Map<BaseConfig<unknown>, unknown> = new Map()): void {
		configurationService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService(), overrides);
	}

	/** Tiers are experiment-gated and off by default, so tier tests opt in. */
	function enableTiers(): void {
		configure(new Map<BaseConfig<unknown>, unknown>([[ConfigKey.Advanced.AutoModeTiersEnabled, true]]));
	}

	function setTierOverride(override: string): void {
		configure(new Map<BaseConfig<unknown>, unknown>([[ConfigKey.Advanced.AutoModeTierOverride, override]]));
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
		(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation(() =>
			Promise.resolve(makeAutoResponse(body, status))
		);
	}

	function autoResponse(selectedModel: string, overrides: Record<string, unknown> = {}) {
		return {
			session_token: 'auto-token',
			expires_at: Math.floor(Date.now() / 1000) + 86400,
			selected_model: { id: selectedModel },
			...overrides,
		};
	}

	function autoCalls() {
		return (mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mock.calls.filter(c => c[1]?.type === RequestType.Auto);
	}

	function autoRequestBodies() {
		return autoCalls().map(c => JSON.parse(c[0].body));
	}

	beforeEach(() => {
		mockChatEndpoint = createEndpoint('gpt-4o-mini', 'OpenAI');

		mockCAPIClientService = {
			makeRequest: vi.fn().mockResolvedValue(makeAutoResponse(autoResponse('gpt-4o-mini')))
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
		configure();
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
		it('resolves the model from /auto', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			const result = await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto',
			} as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			expect({ model: result.model, calls: autoCalls().length }).toEqual({ model: 'gpt-4o', calls: 1 });
		});

		it('throws when there are no known endpoints', async () => {
			automodeService = createService();

			await expect(automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-no-endpoints',
			} as ChatRequest, [])).rejects.toThrow(/No auto mode endpoints/);
		});

		// `/auto` routes on the user's text, so a turn that carries neither a
		// prompt nor a command has nothing to route on.
		it('throws without routing when there is no prompt or command', async () => {
			automodeService = createService();

			await expect(automodeService.resolveAutoModeEndpoint(undefined, [mockChatEndpoint])).rejects.toThrow();
			await expect(automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: '   ',
				sessionId: 'session-empty-prompt',
			} as ChatRequest, [mockChatEndpoint])).rejects.toThrow();

			expect(autoCalls()).toHaveLength(0);
		});

		// A bare slash command (`/tests` from the lightbulb, `/fix`, …) has an
		// empty prompt, and Auto is the default model, so it must still route.
		it('routes a bare slash command on the command', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			const result = await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: '',
				command: 'tests',
				sessionId: 'session-slash-command',
			} as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			expect({ model: result.model, bodies: autoRequestBodies() }).toEqual({ model: 'gpt-4o', bodies: [{ prompt: '/tests' }] });
		});

		// The conversation only keys the session cache, so a request without one
		// still routes — it just cannot be reused by a later turn.
		it('routes without caching when the conversation cannot be keyed', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			const request = { location: ChatLocation.Panel, prompt: 'test prompt' } as ChatRequest;
			const first = await automodeService.resolveAutoModeEndpoint(request, [mockChatEndpoint, gpt4oEndpoint]);
			await automodeService.resolveAutoModeEndpoint(request, [mockChatEndpoint, gpt4oEndpoint]);

			expect({ model: first.model, calls: autoCalls().length }).toEqual({ model: 'gpt-4o', calls: 2 });
		});

		it('sends has_image when the request contains an image', async () => {
			const visionEndpoint = createEndpoint('gpt-4o', 'OpenAI', { supportsVision: true });
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'describe this',
				sessionId: 'session-auto-image',
				references: [{ value: { mimeType: 'image/png', data: createPngBytes(4, 4) } }],
			} as unknown as ChatRequest, [visionEndpoint]);

			expect(autoRequestBodies()).toEqual([{ prompt: 'describe this', has_image: true }]);
		});

		it('reuses the resolved endpoint for later turns in the same conversation', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'first prompt',
				sessionId: 'session-auto-reuse'
			};

			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint]);
			const second = await automodeService.resolveAutoModeEndpoint({ ...chatRequest, prompt: 'second prompt' } as ChatRequest, [gpt4oEndpoint]);

			expect({ model: second.model, calls: autoCalls().length }).toEqual({ model: 'gpt-4o', calls: 1 });
		});

		it('re-runs /auto after the cache is invalidated', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'first prompt',
				sessionId: 'session-auto-invalidate'
			};

			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [gpt4oEndpoint]);
			automodeService.invalidateRouterCache(chatRequest as ChatRequest);
			await automodeService.resolveAutoModeEndpoint({ ...chatRequest, prompt: 'after compaction' } as ChatRequest, [gpt4oEndpoint]);

			expect(autoCalls()).toHaveLength(2);
		});

		it('is a no-op when the cache is invalidated for an unknown conversation', () => {
			automodeService = createService();

			expect(() => automodeService.invalidateRouterCache({ prompt: 'x', sessionId: 'nonexistent-session' } as ChatRequest)).not.toThrow();
		});

		// An extension issuing a batch of `vscode.lm` requests hits one cold
		// conversation from several callers at once; each would otherwise mint
		// its own session and could land on a different model.
		it('shares a single routing call across concurrent turns in one conversation', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			const route = () => automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'concurrent prompt',
				sessionId: 'session-concurrent',
			} as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			const results = await Promise.all([route(), route(), route()]);

			expect({ models: results.map(r => r.model), calls: autoCalls().length })
				.toEqual({ models: ['gpt-4o', 'gpt-4o', 'gpt-4o'], calls: 1 });
		});

		// Reuse already ignores the prompt — a later turn keeps the model chosen
		// for the first — so sharing across differing prompts keeps concurrent
		// turns consistent with sequential ones instead of routing each prompt.
		it('shares one routing call across concurrent turns with different prompts', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			const route = (prompt: string) => automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt,
				sessionId: 'session-concurrent-prompts',
			} as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			const results = await Promise.all([route('first prompt'), route('second prompt')]);

			expect({ models: results.map(r => r.model), calls: autoCalls().length })
				.toEqual({ models: ['gpt-4o', 'gpt-4o'], calls: 1 });
		});

		// The session token belongs to the account that was signed in when the
		// call started; caching it would send it with the new account's
		// credentials for the life of the token.
		it('does not cache a routing that lands after the account changed', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			let releaseAuto: (() => void) | undefined;
			const autoInFlight = new Promise<void>(resolve => { releaseAuto = resolve; });
			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation(async () => {
				await autoInFlight;
				return makeAutoResponse(autoResponse('gpt-4o'));
			});

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'first prompt',
				sessionId: 'session-auth-race'
			};
			const pending = automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			onDidAuthenticationChangeEmitter.fire();
			releaseAuto!();

			await expect(pending).rejects.toThrow(/no longer signed in/);

			// Nothing from the previous account may be left behind for the new one.
			mockAuto(autoResponse('gpt-4o'));
			const next = await automodeService.resolveAutoModeEndpoint({ ...chatRequest, prompt: 'second prompt' } as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			expect({ model: next.model, calls: autoCalls().length }).toEqual({ model: 'gpt-4o', calls: 2 });
		});

		// Sharing must not cross conversations, tiers, or vision needs — those
		// turns would not accept the same answer.
		it('does not share a routing call across conversations or tiers', async () => {
			enableTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI', { supportsVision: true });
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			const route = (sessionId: string, tier: string, references?: unknown[]) => automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'concurrent prompt',
				sessionId,
				modelConfiguration: { tier },
				references,
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			await Promise.all([
				route('session-a', 'intelligence'),
				route('session-b', 'intelligence'),
				route('session-a', 'efficiency'),
				route('session-a', 'intelligence', [{ value: { mimeType: 'image/png' } }]),
			]);

			expect(autoCalls()).toHaveLength(4);
		});

		// A failed routing call must not leave the conversation permanently
		// pinned to a rejected promise.
		it('routes again after a shared routing call fails', async () => {
			mockAuto({ error: 'server_error' }, 500);

			automodeService = createService();
			const route = () => automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'first prompt',
				sessionId: 'session-inflight-error',
			} as ChatRequest, [mockChatEndpoint]);

			await expect(route()).rejects.toThrow();
			mockAuto(autoResponse('gpt-4o-mini'));
			const retry = await route();

			expect({ model: retry.model, calls: autoCalls().length }).toEqual({ model: 'gpt-4o-mini', calls: 2 });
		});

		it('drops cached sessions when authentication changes', async () => {
			mockAuto(autoResponse('gpt-4o-mini'));

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'first prompt',
				sessionId: 'session-auto-auth'
			};

			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint]);
			// The new account may route differently, so the cached pick cannot stand.
			onDidAuthenticationChangeEmitter.fire();
			await automodeService.resolveAutoModeEndpoint({ ...chatRequest, prompt: 'after switch' } as ChatRequest, [mockChatEndpoint]);

			expect(autoCalls()).toHaveLength(2);
		});

		it('builds the endpoint from embedded metadata when the model is not in knownEndpoints', async () => {
			mockAuto({
				session_token: 'auto-token',
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
			const result = await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-drift',
			} as ChatRequest, [mockChatEndpoint]);

			expect(result.model).toBe('brand-new-model');
			expect(mockTelemetryService.sendMSFTTelemetryEvent).toHaveBeenCalledWith(
				'automode.autoV2Fallback',
				{ reason: 'embeddedMetadata' }
			);
		});
	});

	describe('routing failures', () => {
		it('throws when /auto is gated off with a 404', async () => {
			mockAuto({ error: 'not_found' }, 404);

			automodeService = createService();

			await expect(automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-404',
			} as ChatRequest, [mockChatEndpoint])).rejects.toThrow();
			expect(mockTelemetryService.sendMSFTTelemetryEvent).toHaveBeenCalledWith(
				'automode.autoV2Fallback',
				{ reason: 'not_found' }
			);
		});

		// A gate can be lifted mid-session, and there is no other way to route,
		// so a failure must not stop later turns from trying.
		it('keeps calling /auto on later turns after a failure', async () => {
			mockAuto({ error: 'not_found' }, 404);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-404-retry'
			};

			await expect(automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint])).rejects.toThrow();
			await expect(automodeService.resolveAutoModeEndpoint({ ...chatRequest, prompt: 'another' } as ChatRequest, [mockChatEndpoint])).rejects.toThrow();

			expect(autoCalls()).toHaveLength(2);
		});

		it('reuses the last known good endpoint when a later turn fails to route', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'first turn',
				sessionId: 'session-auto-error-cache'
			};
			await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			mockAuto({ error: 'server_error' }, 500);
			automodeService.invalidateRouterCache(chatRequest as ChatRequest);
			const second = await automodeService.resolveAutoModeEndpoint({ ...chatRequest, prompt: 'second turn' } as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			expect(second.model).toBe('gpt-4o');
		});

		it('throws when the selected model metadata is unusable', async () => {
			mockAuto(autoResponse('model-the-client-cannot-serve'));

			automodeService = createService();

			await expect(automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-unknown-model',
			} as ChatRequest, [mockChatEndpoint])).rejects.toThrow(/model-the-client-cannot-serve/);
			expect(mockTelemetryService.sendMSFTTelemetryEvent).toHaveBeenCalledWith(
				'automode.autoV2Fallback',
				{ reason: 'noMatchingEndpoint' }
			);
		});

		it('throws when /auto returns a non-vision model for an image request', async () => {
			const textOnly = createEndpoint('gpt-4o', 'OpenAI', { supportsVision: false });
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();

			await expect(automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'describe this',
				sessionId: 'session-auto-no-vision',
				references: [{ value: { mimeType: 'image/png', data: createPngBytes(4, 4) } }],
			} as unknown as ChatRequest, [textOnly, mockChatEndpoint])).rejects.toThrow(/does not support vision/);
			expect(mockTelemetryService.sendMSFTTelemetryEvent).toHaveBeenCalledWith(
				'automode.autoV2Fallback',
				{ reason: 'noVisionSupport' }
			);
		});

		it('re-resolves instead of reusing a non-vision cached endpoint when a later turn attaches an image', async () => {
			const textOnly = createEndpoint('gpt-4o', 'OpenAI', { supportsVision: false });
			const visionModel = createEndpoint('gpt-4o-vision', 'OpenAI', { supportsVision: true });
			let selectedId = 'gpt-4o';
			(mockCAPIClientService.makeRequest as ReturnType<typeof vi.fn>).mockImplementation(() =>
				Promise.resolve(makeAutoResponse(autoResponse(selectedId)))
			);

			automodeService = createService();
			const chatRequest: Partial<ChatRequest> = {
				location: ChatLocation.Panel,
				prompt: 'text only turn',
				sessionId: 'session-auto-image-later'
			};

			const first = await automodeService.resolveAutoModeEndpoint(chatRequest as ChatRequest, [textOnly, visionModel]);

			selectedId = 'gpt-4o-vision';
			const second = await automodeService.resolveAutoModeEndpoint({
				...chatRequest,
				prompt: 'now describe this',
				references: [{ value: { mimeType: 'image/png', data: createPngBytes(4, 4) } }],
			} as unknown as ChatRequest, [textOnly, visionModel]);

			expect({ first: first.model, second: second.model }).toEqual({ first: 'gpt-4o', second: 'gpt-4o-vision' });
		});
	});

	describe('routing tiers', () => {
		it('routes inline chat with the fast tier', async () => {
			enableTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			for (const location of [ChatLocation.Editor, ChatLocation.Terminal, ChatLocation.Notebook]) {
				await automodeService.resolveAutoModeEndpoint({
					location,
					prompt: 'test prompt',
					sessionId: `session-auto-${location}`,
				} as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);
			}

			expect(autoRequestBodies().map(b => b.tier)).toEqual(['fast', 'fast', 'fast']);
		});

		// The workbench materializes the schema default into `modelConfiguration`,
		// so this — not an absent `modelConfiguration` — is what a real inline
		// request looks like for a user who never touched the tier picker.
		it('pins inline chat to the fast tier when the picker sits on its default', async () => {
			enableTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Editor,
				prompt: 'inline turn',
				sessionId: 'session-auto-inline-default',
				modelConfiguration: { tier: defaultAutoModeTier },
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			expect(autoRequestBodies()).toEqual([{ prompt: 'inline turn', tier: 'fast' }]);
		});

		it('honors an explicit tier selection on inline surfaces', async () => {
			enableTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Editor,
				prompt: 'test prompt',
				sessionId: 'session-auto-inline-tier',
				modelConfiguration: { tier: 'intelligence' },
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			expect(autoRequestBodies()).toEqual([{ prompt: 'test prompt', tier: 'intelligence' }]);
		});

		it('sends the tier picked in the model configuration', async () => {
			enableTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-tier',
				modelConfiguration: { tier: 'intelligence' },
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			expect(autoRequestBodies()).toEqual([{ prompt: 'test prompt', tier: 'intelligence' }]);
		});

		it('falls back to the default tier when the configured tier is not user selectable', async () => {
			enableTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-bad-tier',
				modelConfiguration: { tier: 'fast' },
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			expect(autoRequestBodies()).toEqual([{ prompt: 'test prompt', tier: 'balance' }]);
		});

		it('re-routes the conversation when the tier changes', async () => {
			enableTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			const chatRequest = {
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-tier-change',
				modelConfiguration: { tier: 'efficiency' },
			} as unknown as ChatRequest;

			await automodeService.resolveAutoModeEndpoint(chatRequest, [mockChatEndpoint, gpt4oEndpoint]);
			await automodeService.resolveAutoModeEndpoint({ ...chatRequest, prompt: 'second turn' } as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);
			await automodeService.resolveAutoModeEndpoint({ ...chatRequest, prompt: 'third turn', modelConfiguration: { tier: 'intelligence' } } as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			expect(autoRequestBodies().map(b => b.tier)).toEqual(['efficiency', 'intelligence']);
		});

		it('lets the tier override win over the picker and the inline chat pin', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			setTierOverride('efficiency');
			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'panel turn',
				sessionId: 'session-override-panel',
				modelConfiguration: { tier: 'intelligence' },
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Editor,
				prompt: 'inline turn',
				sessionId: 'session-override-inline',
			} as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			expect(autoRequestBodies().map(b => b.tier)).toEqual(['efficiency', 'efficiency']);
		});

		// The override is an internal/eval knob, so unlike the picker it may target
		// the profile inline chat reserves for itself.
		it('allows the tier override to select the internal fast tier', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			setTierOverride('fast');
			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'panel turn',
				sessionId: 'session-override-fast',
			} as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			expect(autoRequestBodies()).toEqual([{ prompt: 'panel turn', tier: 'fast' }]);
		});

		it('ignores an unrecognized tier override', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			configure(new Map<BaseConfig<unknown>, unknown>([
				[ConfigKey.Advanced.AutoModeTiersEnabled, true],
				[ConfigKey.Advanced.AutoModeTierOverride, 'turbo'],
			]));
			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'panel turn',
				sessionId: 'session-override-bogus',
				modelConfiguration: { tier: 'intelligence' },
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			expect(autoRequestBodies()).toEqual([{ prompt: 'panel turn', tier: 'intelligence' }]);
		});

		it('announces tier support when the setting changes', async () => {
			automodeService = createService();
			expect(automodeService.areAutoModeTiersSupported()).toBe(false);

			let announced = 0;
			const listener = automodeService.onDidChangeAutoModeTierSupport(() => announced++);
			await configurationService.setConfig(ConfigKey.Advanced.AutoModeTiersEnabled, true);
			// An unrelated change must not re-announce.
			await configurationService.setConfig(ConfigKey.Advanced.AutoModeTierOverride, 'intelligence');
			listener.dispose();

			expect({ announced, supported: automodeService.areAutoModeTiersSupported() }).toEqual({ announced: 1, supported: true });
		});

		it('does not reuse a cached endpoint from a different tier when /auto fails', async () => {
			enableTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			const chatRequest = {
				location: ChatLocation.Panel,
				prompt: 'first turn',
				sessionId: 'session-auto-tier-error',
				modelConfiguration: { tier: 'efficiency' },
			} as unknown as ChatRequest;
			const first = await automodeService.resolveAutoModeEndpoint(chatRequest, [mockChatEndpoint, gpt4oEndpoint]);
			expect(first.model).toBe('gpt-4o');

			// The tier changes and the re-route fails: the efficiency endpoint must not be
			// handed back as though it satisfied the new tier.
			mockAuto({ error: 'server_error' }, 500);
			await expect(automodeService.resolveAutoModeEndpoint({
				...chatRequest,
				prompt: 'second turn',
				modelConfiguration: { tier: 'intelligence' },
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint])).rejects.toThrow();
		});

		// `/auto` does not promise a new session token when the tier changes, so
		// the endpoint (which bakes in the discount) cannot be reused across tiers.
		it('rebuilds the endpoint when the tier changes but the session token does not', async () => {
			enableTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o', { discounted_costs: { 'gpt-4o': 0.2 } }));

			automodeService = createService();
			const chatRequest = {
				location: ChatLocation.Panel,
				prompt: 'first turn',
				sessionId: 'session-auto-tier-discount',
				modelConfiguration: { tier: 'efficiency' },
			} as unknown as ChatRequest;
			await automodeService.resolveAutoModeEndpoint(chatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			mockAuto(autoResponse('gpt-4o', { discounted_costs: { 'gpt-4o': 0.9 } }));
			await automodeService.resolveAutoModeEndpoint({
				...chatRequest,
				prompt: 'second turn',
				modelConfiguration: { tier: 'intelligence' },
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			const discounts = (mockInstantiationService.createInstance as ReturnType<typeof vi.fn>).mock.calls.map(c => c[3]);
			expect(discounts).toEqual([0.2, 0.9]);
		});

		// Tiers are experiment-gated, so until the experiment reaches a user the
		// request must look exactly as it did before tiers existed.
		it('omits the tier and hides the picker while tiers are disabled', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			for (const location of [ChatLocation.Panel, ChatLocation.Editor]) {
				await automodeService.resolveAutoModeEndpoint({
					location,
					prompt: 'test prompt',
					sessionId: `session-tiers-off-${location}`,
					modelConfiguration: { tier: 'intelligence' },
				} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);
			}

			expect({ bodies: autoRequestBodies(), supported: automodeService.areAutoModeTiersSupported() }).toEqual({
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
			mockAuto(autoResponse('gpt-4o'));

			setTierOverride('intelligence');
			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'panel turn',
				sessionId: 'session-override-tiers-off',
			} as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			expect(autoRequestBodies()).toEqual([{ prompt: 'panel turn', tier: 'intelligence' }]);
		});

		// The override is a raw string setting, so a config left on a retired name by an
		// eval or an internal user must keep working rather than silently fall back.
		it('maps a retired tier name in the override to its current one', async () => {
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			setTierOverride('eco');
			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'panel turn',
				sessionId: 'session-override-retired',
			} as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			expect(autoRequestBodies()).toEqual([{ prompt: 'panel turn', tier: 'efficiency' }]);
		});

		// A picker value stored before the rename can be restored unfiltered while its model's
		// schema is still loading, so it must upgrade rather than silently fall back.
		it('maps a retired tier name in a persisted picker value to its current one', async () => {
			enableTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'panel turn',
				sessionId: 'session-persisted-retired',
				modelConfiguration: { tier: 'max' },
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);
			// `balanced` upgrades to the current default, which reads as "never picked", so the inline
			// pin applies instead of being treated as an explicit selection.
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Editor,
				prompt: 'inline turn',
				sessionId: 'session-persisted-retired-default',
				modelConfiguration: { tier: 'balanced' },
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			expect(autoRequestBodies().map(b => b.tier)).toEqual(['intelligence', 'fast']);
		});
	});

	describe('session cache', () => {
		it('does not evict an unrelated session when a cached conversation is rerouted', async () => {
			enableTiers();
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI');
			mockAuto(autoResponse('gpt-4o'));

			automodeService = createService();
			const route = (sessionId: string, prompt: string, tier?: string) => automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt,
				sessionId,
				modelConfiguration: tier ? { tier } : undefined,
			} as unknown as ChatRequest, [mockChatEndpoint, gpt4oEndpoint]);

			// Fill the cache to CACHE_MAX_ENTRIES, then reroute the newest
			// conversation: replacing its entry needs no room, so the oldest entry
			// must still answer from cache.
			for (let i = 0; i < 50; i++) {
				await route(`session-${i}`, `turn ${i}`);
			}
			await route('session-49', 'retiered turn', 'intelligence');

			const callsBefore = autoCalls().length;
			await route('session-0', 'follow up');

			expect(autoCalls().length).toBe(callsBefore);
		});
	});

	describe('model picker', () => {
		it('resolves the picker endpoint without any request', async () => {
			automodeService = createService();
			const result = await automodeService.resolveAutoModePickerEndpoint([mockChatEndpoint]);

			expect(result).toBeDefined();
			expect(mockCAPIClientService.makeRequest).not.toHaveBeenCalled();
		});

		// The picker has no prompt, so the discount label is read off the model
		// metadata rather than being resolved through a routing request.
		it('derives the picker discount range from the models auto_discount', () => {
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

		it('reports no discount when no model advertises one', () => {
			automodeService = createService();

			expect(automodeService.getAutoPickerMetadata([mockChatEndpoint])).toEqual({ discountRange: { low: 0, high: 0 } });
		});

		it('falls back to the model auto_discount when /auto omits the discounted costs', async () => {
			mockAuto(autoResponse('gpt-4o'));
			const gpt4oEndpoint = createEndpoint('gpt-4o', 'OpenAI', { autoDiscount: 0.15 });

			automodeService = createService();
			await automodeService.resolveAutoModeEndpoint({
				location: ChatLocation.Panel,
				prompt: 'test prompt',
				sessionId: 'session-auto-discount-fallback'
			} as ChatRequest, [gpt4oEndpoint]);

			const autoCall = (mockInstantiationService.createInstance as ReturnType<typeof vi.fn>).mock.calls.at(-1);
			expect({ discount: autoCall![3], range: autoCall![4] }).toEqual({ discount: 0.15, range: { low: 0.15, high: 0.15 } });
		});
	});
});
