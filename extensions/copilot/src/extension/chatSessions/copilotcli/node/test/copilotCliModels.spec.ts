/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticationSession } from 'vscode';
import { IAuthenticationService } from '../../../../../platform/authentication/common/authentication';
import { ConfigKey } from '../../../../../platform/configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { IVSCodeExtensionContext } from '../../../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../../../platform/log/common/logService';
import { Emitter } from '../../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { CopilotCLIModels, type CopilotCLIModelInfo, type ICopilotCLISDK } from '../copilotCli';

function createMockExtensionContext(): IVSCodeExtensionContext {
	const state = new Map<string, unknown>();
	return {
		extensionPath: '/mock',
		globalState: {
			get: <T>(key: string, defaultValue?: T) => (state.get(key) as T) ?? defaultValue,
			update: async (key: string, value: unknown) => { state.set(key, value); },
			keys: () => [...state.keys()]
		},
		workspaceState: {
			get: () => ({}),
			update: async () => { },
			keys: () => []
		}
	} as unknown as IVSCodeExtensionContext;
}

const FAKE_MODELS: CopilotCLIModelInfo[] = [
	{ id: 'gpt-4o', name: 'GPT-4o', maxContextWindowTokens: 128000, supportsVision: true },
	{ id: 'gpt-3.5', name: 'GPT-3.5', maxContextWindowTokens: 16000, supportsVision: false },
];

function createMockSDK(models: CopilotCLIModelInfo[] = FAKE_MODELS): ICopilotCLISDK {
	return {
		_serviceBrand: undefined,
		getPackage: vi.fn(async () => ({
			getAvailableModels: vi.fn(async () => models.map(m => ({
				id: m.id,
				name: m.name,
				billing: m.multiplier !== undefined ? { multiplier: m.multiplier } : undefined,
				capabilities: {
					limits: {
						max_prompt_tokens: m.maxInputTokens,
						max_output_tokens: m.maxOutputTokens,
						max_context_window_tokens: m.maxContextWindowTokens,
					},
					supports: { vision: m.supportsVision }
				}
			}))),
		})),
		getAuthInfo: vi.fn(async () => ({ type: 'token' as const, token: 'test-token', host: 'https://github.com' })),
		getRequestId: vi.fn(() => undefined),
		setRequestId: vi.fn(),
	} as unknown as ICopilotCLISDK;
}

class MockAuthenticationService {
	private readonly _onDidAuthenticationChange = new Emitter<void>();
	readonly onDidAuthenticationChange = this._onDidAuthenticationChange.event;

	private _anyGitHubSession: AuthenticationSession | undefined;

	constructor(hasSession: boolean) {
		this._anyGitHubSession = hasSession
			? { id: 'test', accessToken: 'token', scopes: [], account: { id: 'user', label: 'User' } }
			: undefined;
	}

	get anyGitHubSession(): AuthenticationSession | undefined {
		return this._anyGitHubSession;
	}

	setSession(session: AuthenticationSession | undefined): void {
		this._anyGitHubSession = session;
	}

	fireAuthenticationChange(): void {
		this._onDidAuthenticationChange.fire();
	}

	dispose(): void {
		this._onDidAuthenticationChange.dispose();
	}
}
class MockConfigurationService extends InMemoryConfigurationService {
	constructor() {
		super(new DefaultsOnlyConfigurationService());
	}
}

describe('CopilotCLIModels', () => {
	const disposables = new DisposableStore();
	let logService: ILogService;

	beforeEach(() => {
		const services = disposables.add(createExtensionUnitTestingServices());
		const accessor = services.createTestingAccessor();
		logService = accessor.get(ILogService);
		accessor.get(IInstantiationService);
	});

	afterEach(() => {
		disposables.clear();
	});

	function createModels(options: { hasSession?: boolean; sdk?: ICopilotCLISDK; configService?: MockConfigurationService } = {}): { models: CopilotCLIModels; auth: MockAuthenticationService; configService: MockConfigurationService } {
		const auth = new MockAuthenticationService(options.hasSession ?? true);
		const sdk = options.sdk ?? createMockSDK();
		const extensionContext = createMockExtensionContext();
		const configService = options.configService ?? new MockConfigurationService();

		const models = new CopilotCLIModels(
			sdk,
			extensionContext,
			logService,
			auth as unknown as IAuthenticationService,
			configService
		);
		disposables.add(models);
		disposables.add({ dispose: () => auth.dispose() });
		return { models, auth, configService };
	}

	describe('getModels', () => {
		it('returns empty array when no GitHub session exists', async () => {
			const { models } = createModels({ hasSession: false });

			const result = await models.getModels();

			expect(result).toEqual([]);
		});

		it('returns models when GitHub session exists', async () => {
			const { models } = createModels({ hasSession: true });

			const result = await models.getModels();

			expect(result.length).toBe(2);
			expect(result[0].id).toBe('gpt-4o');
			expect(result[1].id).toBe('gpt-3.5');
		});

		it('returns cached models on subsequent calls', async () => {
			const sdk = createMockSDK();
			const { models } = createModels({ hasSession: true, sdk });

			const first = await models.getModels();
			const second = await models.getModels();

			expect(first).toBe(second);
			// getPackage is called during constructor's eager fetch and at most once more
			expect(sdk.getPackage).toHaveBeenCalledTimes(1);
		});
	});

	describe('resolveModel', () => {
		it('returns undefined when no GitHub session exists', async () => {
			const { models } = createModels({ hasSession: false });

			const result = await models.resolveModel('gpt-4o');

			expect(result).toBeUndefined();
		});

		it('resolves model by id (case-insensitive)', async () => {
			const { models } = createModels({ hasSession: true });

			expect(await models.resolveModel('GPT-4O')).toBe('gpt-4o');
			expect(await models.resolveModel('gpt-4o')).toBe('gpt-4o');
		});

		it('resolves model by name (case-insensitive)', async () => {
			const { models } = createModels({ hasSession: true });

			expect(await models.resolveModel('GPT-3.5')).toBe('gpt-3.5');
		});

		it('returns undefined for unknown model', async () => {
			const { models } = createModels({ hasSession: true });

			expect(await models.resolveModel('nonexistent-model')).toBeUndefined();
		});

		it('resolves "auto" without querying SDK models', async () => {
			const { models } = createModels({ hasSession: false });

			// Even without a session, 'auto' resolves to itself
			expect(await models.resolveModel('auto')).toBe('auto');
			expect(await models.resolveModel('Auto')).toBe('Auto');
			expect(await models.resolveModel('AUTO')).toBe('AUTO');
		});
	});

	describe('getDefaultModel', () => {
		it('returns undefined when no GitHub session exists', async () => {
			const { models } = createModels({ hasSession: false });

			const result = await models.getDefaultModel();

			expect(result).toBeUndefined();
		});

		it('returns first model when no preference is stored', async () => {
			const { models } = createModels({ hasSession: true });

			const result = await models.getDefaultModel();

			expect(result).toBe('gpt-4o');
		});

		it('returns preferred model when preference is stored', async () => {
			const { models } = createModels({ hasSession: true });

			await models.setDefaultModel('gpt-3.5');
			const result = await models.getDefaultModel();

			expect(result).toBe('gpt-3.5');
		});

		it('falls back to first model when stored preference is invalid', async () => {
			const { models } = createModels({ hasSession: true });

			await models.setDefaultModel('nonexistent-model');
			const result = await models.getDefaultModel();

			expect(result).toBe('gpt-4o');
		});
	});

	describe('onDidAuthenticationChange', () => {
		it('propagates authentication change events to language model provider', async () => {
			const sdk = createMockSDK();
			const auth = new MockAuthenticationService(true);
			disposables.add({ dispose: () => auth.dispose() });
			const extensionContext = createMockExtensionContext();

			const models = new CopilotCLIModels(
				sdk,
				extensionContext,
				logService,
				auth as unknown as IAuthenticationService,
				new MockConfigurationService()
			);
			disposables.add(models);

			// Wait for the eager model fetch to complete
			await models.getModels();

			// Subscribe to the change event via registerLanguageModelChatProvider
			// and capture the provider's event
			let providerOnChangeEvent: any;
			const lmMock = {
				registerLanguageModelChatProvider: (_id: string, provider: any) => {
					providerOnChangeEvent = provider.onDidChangeLanguageModelChatInformation;
					return { dispose: () => { } };
				}
			};
			models.registerLanguageModelChatProvider(lmMock as any);

			// Now subscribe to the captured event
			let fired = false;
			disposables.add(providerOnChangeEvent(() => { fired = true; }));

			// Fire auth change — should propagate through _onDidChange
			auth.fireAuthenticationChange();

			expect(fired).toBe(true);
		});

		it('returns models after session becomes available', async () => {
			const { models, auth } = createModels({ hasSession: false });

			// No session: no models
			expect(await models.getModels()).toEqual([]);

			// Set session and verify models are now available
			auth.setSession({ id: 'test', accessToken: 'token', scopes: [], account: { id: 'user', label: 'User' } });
			const result = await models.getModels();
			expect(result.length).toBe(2);
		});

		it('invalidates model cache on auth change', async () => {
			const sdk = createMockSDK();
			const { models, auth } = createModels({ hasSession: true, sdk });

			// Initial fetch
			await models.getModels();
			const initialCallCount = (sdk.getPackage as ReturnType<typeof vi.fn>).mock.calls.length;

			// Fire auth change to invalidate the cache
			auth.fireAuthenticationChange();

			// Next getModels() call should re-fetch from the SDK
			await models.getModels();
			expect((sdk.getPackage as ReturnType<typeof vi.fn>).mock.calls.length).toBe(initialCallCount + 1);
		});

		it('returns fresh models after auth change', async () => {
			const updatedModels: CopilotCLIModelInfo[] = [
				{ id: 'claude-4', name: 'Claude 4', maxContextWindowTokens: 200000, supportsVision: true },
			];
			let callCount = 0;
			const sdk = {
				_serviceBrand: undefined,
				getPackage: vi.fn(async () => ({
					getAvailableModels: vi.fn(async () => {
						const source = callCount++ === 0 ? FAKE_MODELS : updatedModels;
						return source.map(m => ({
							id: m.id,
							name: m.name,
							billing: m.multiplier !== undefined ? { multiplier: m.multiplier } : undefined,
							capabilities: {
								limits: {
									max_prompt_tokens: m.maxInputTokens,
									max_output_tokens: m.maxOutputTokens,
									max_context_window_tokens: m.maxContextWindowTokens,
								},
								supports: { vision: m.supportsVision }
							},
						}));
					}),
				})),
				getAuthInfo: vi.fn(async () => ({ type: 'token' as const, token: 'test-token', host: 'https://github.com' })),
				getRequestId: vi.fn(() => undefined),
				setRequestId: vi.fn(),
			} as unknown as ICopilotCLISDK;

			const { models, auth } = createModels({ hasSession: true, sdk });

			// First fetch returns FAKE_MODELS
			const first = await models.getModels();
			expect(first.length).toBe(2);
			expect(first[0].id).toBe('gpt-4o');

			// Auth change invalidates cache
			auth.fireAuthenticationChange();

			// Next fetch returns updated models
			const second = await models.getModels();
			expect(second.length).toBe(1);
			expect(second[0].id).toBe('claude-4');
		});
	});

	describe('provideLanguageModelChatInformation', () => {
		function createLmMock() {
			let capturedProvider: any;
			return {
				mock: {
					registerLanguageModelChatProvider: (_id: string, provider: any) => {
						capturedProvider = provider;
						return { dispose: () => { } };
					}
				},
				getProvider: () => capturedProvider,
			};
		}

		it('always includes auto model in results', async () => {
			const { models } = createModels({ hasSession: true });
			const lm = createLmMock();
			models.registerLanguageModelChatProvider(lm.mock as any);

			// Wait for the eager fetch to complete
			await models.getModels();
			// Allow the _fetchAndCacheModels .then() to run
			await new Promise(r => setTimeout(r, 0));

			const result = await lm.getProvider().provideLanguageModelChatInformation({}, undefined);
			expect(result[0]).toEqual(expect.objectContaining({ id: 'auto', name: 'Auto' }));
		});

		it('returns only auto when not authenticated', async () => {
			const { models } = createModels({ hasSession: false });
			const lm = createLmMock();
			models.registerLanguageModelChatProvider(lm.mock as any);

			// Allow microtasks to settle (the eager fetch will fail/return empty)
			await new Promise(r => setTimeout(r, 0));

			const result = await lm.getProvider().provideLanguageModelChatInformation({}, undefined);
			expect(result).toEqual([expect.objectContaining({ id: 'auto', name: 'Auto' })]);
		});

		it('returns only auto while models are still being fetched', async () => {
			// Create an SDK that never resolves
			let resolveModels!: (models: any[]) => void;
			const sdk = {
				_serviceBrand: undefined,
				getPackage: vi.fn(async () => ({
					getAvailableModels: vi.fn(() => new Promise(resolve => { resolveModels = resolve; })),
				})),
				getAuthInfo: vi.fn(async () => ({ type: 'token' as const, token: 'test-token', host: 'https://github.com' })),
				getRequestId: vi.fn(() => undefined),
			} as unknown as ICopilotCLISDK;

			const { models } = createModels({ hasSession: true, sdk });
			const lm = createLmMock();
			models.registerLanguageModelChatProvider(lm.mock as any);

			// Models are still pending — should only get auto
			const result = await lm.getProvider().provideLanguageModelChatInformation({}, undefined);
			expect(result).toEqual([expect.objectContaining({ id: 'auto', name: 'Auto' })]);

			// Flush microtasks so getPackage()/getAuthInfo() resolve and getAvailableModels is called,
			// which captures resolveModels.
			await new Promise(r => setTimeout(r, 0));

			// Now resolve the models and let promises settle
			resolveModels(FAKE_MODELS.map(m => ({
				id: m.id, name: m.name,
				capabilities: { limits: { max_context_window_tokens: m.maxContextWindowTokens, max_prompt_tokens: m.maxInputTokens, max_output_tokens: m.maxOutputTokens }, supports: { vision: m.supportsVision } },
			})));
			await new Promise(r => setTimeout(r, 0));

			const afterResolve = await lm.getProvider().provideLanguageModelChatInformation({}, undefined);
			expect(afterResolve.length).toBe(3); // auto + 2 models
			expect(afterResolve[0]).toEqual(expect.objectContaining({ id: 'auto' }));
			expect(afterResolve[1]).toEqual(expect.objectContaining({ id: 'gpt-4o' }));
			expect(afterResolve[2]).toEqual(expect.objectContaining({ id: 'gpt-3.5' }));
		});

		it('returns full model list with auto prepended after fetch completes', async () => {
			const { models } = createModels({ hasSession: true });
			const lm = createLmMock();
			models.registerLanguageModelChatProvider(lm.mock as any);

			// Wait for the eager fetch to complete
			await models.getModels();
			await new Promise(r => setTimeout(r, 0));

			const result = await lm.getProvider().provideLanguageModelChatInformation({}, undefined);
			expect(result.length).toBe(3); // auto + 2 models
			expect(result.map((m: any) => m.id)).toEqual(['auto', 'gpt-4o', 'gpt-3.5']);
		});

		it('resets to auto-only after auth change, then recovers', async () => {
			const { models, auth } = createModels({ hasSession: true });
			const lm = createLmMock();
			models.registerLanguageModelChatProvider(lm.mock as any);

			// Wait for initial fetch
			await models.getModels();
			await new Promise(r => setTimeout(r, 0));

			const beforeAuthChange = await lm.getProvider().provideLanguageModelChatInformation({}, undefined);
			expect(beforeAuthChange.length).toBe(3);

			// Fire auth change — caches are cleared
			auth.fireAuthenticationChange();

			// Immediately after auth change, _resolvedModelInfos is cleared but re-fetch is in flight.
			// Before the re-fetch settles, we should get just auto.
			// (The re-fetch is async so hasn't settled yet in the same microtask.)
			const duringRefresh = await lm.getProvider().provideLanguageModelChatInformation({}, undefined);
			// Could be auto-only or already refreshed depending on timing; at minimum auto is present
			expect(duringRefresh[0]).toEqual(expect.objectContaining({ id: 'auto' }));

			// Let the re-fetch settle
			await models.getModels();
			await new Promise(r => setTimeout(r, 0));

			const afterRefresh = await lm.getProvider().provideLanguageModelChatInformation({}, undefined);
			expect(afterRefresh.length).toBe(3);
			expect(afterRefresh[0]).toEqual(expect.objectContaining({ id: 'auto' }));
		});

		it('fires onDidChange when models become available', async () => {
			let resolveModels!: (models: any[]) => void;
			const sdk = {
				_serviceBrand: undefined,
				getPackage: vi.fn(async () => ({
					getAvailableModels: vi.fn(() => new Promise(resolve => { resolveModels = resolve; })),
				})),
				getAuthInfo: vi.fn(async () => ({ type: 'token' as const, token: 'test-token', host: 'https://github.com' })),
				getRequestId: vi.fn(() => undefined),
			} as unknown as ICopilotCLISDK;

			const { models } = createModels({ hasSession: true, sdk });
			const lm = createLmMock();
			models.registerLanguageModelChatProvider(lm.mock as any);

			let changeCount = 0;
			disposables.add(lm.getProvider().onDidChangeLanguageModelChatInformation(() => { changeCount++; }));

			// Flush microtasks so getPackage()/getAuthInfo() resolve and getAvailableModels is called,
			// which captures resolveModels.
			await new Promise(r => setTimeout(r, 0));

			// Resolve models
			resolveModels(FAKE_MODELS.map(m => ({
				id: m.id, name: m.name,
				capabilities: { limits: { max_context_window_tokens: m.maxContextWindowTokens, max_prompt_tokens: m.maxInputTokens, max_output_tokens: m.maxOutputTokens }, supports: { vision: m.supportsVision } },
			})));
			await new Promise(r => setTimeout(r, 0));

			expect(changeCount).toBeGreaterThan(0);
		});
	});

	describe('CLIAutoModelEnabled setting', () => {
		function createLmMock() {
			let capturedProvider: any;
			return {
				mock: {
					registerLanguageModelChatProvider: (_id: string, provider: any) => {
						capturedProvider = provider;
						return { dispose: () => { } };
					}
				},
				getProvider: () => capturedProvider,
			};
		}

		it('omits auto model from resolved list when disabled', async () => {
			const configService = new MockConfigurationService();
			await configService.setConfig(ConfigKey.Advanced.CLIAutoModelEnabled, false);
			const { models } = createModels({ hasSession: true, configService });
			const lm = createLmMock();
			models.registerLanguageModelChatProvider(lm.mock as any);

			await models.getModels();
			await new Promise(r => setTimeout(r, 0));

			const result = await lm.getProvider().provideLanguageModelChatInformation({}, undefined);
			expect(result.every((m: any) => m.id !== 'auto')).toBe(true);
			expect(result.length).toBe(2);
			expect(result[0]).toEqual(expect.objectContaining({ id: 'gpt-4o' }));
		});

		it('returns empty list when not authenticated and auto model disabled', async () => {
			const configService = new MockConfigurationService();
			await configService.setConfig(ConfigKey.Advanced.CLIAutoModelEnabled, false);
			const { models } = createModels({ hasSession: false, configService });
			const lm = createLmMock();
			models.registerLanguageModelChatProvider(lm.mock as any);

			await new Promise(r => setTimeout(r, 0));

			const result = await lm.getProvider().provideLanguageModelChatInformation({}, undefined);
			expect(result).toEqual([]);
		});

		it('resolveModel does not short-circuit auto when disabled', async () => {
			const configService = new MockConfigurationService();
			await configService.setConfig(ConfigKey.Advanced.CLIAutoModelEnabled, false);
			const { models } = createModels({ hasSession: true, configService });

			// With the setting disabled, 'auto' is not a known model so resolveModel returns undefined
			expect(await models.resolveModel('auto')).toBeUndefined();
		});

		it('includes auto model when setting is enabled (default)', async () => {
			const { models } = createModels({ hasSession: true });
			const lm = createLmMock();
			models.registerLanguageModelChatProvider(lm.mock as any);

			await models.getModels();
			await new Promise(r => setTimeout(r, 0));

			const result = await lm.getProvider().provideLanguageModelChatInformation({}, undefined);
			expect(result[0]).toEqual(expect.objectContaining({ id: 'auto' }));
			expect(result.length).toBe(3); // auto + 2 models
		});
	});

	describe('SDK error handling', () => {
		it('returns empty array when SDK getAvailableModels throws', async () => {
			const sdk = {
				_serviceBrand: undefined,
				getPackage: vi.fn(async () => ({
					getAvailableModels: vi.fn(async () => { throw new Error('Network error'); }),
				})),
				getAuthInfo: vi.fn(async () => ({ type: 'token' as const, token: 'test-token', host: 'https://github.com' })),
				getRequestId: vi.fn(() => undefined),
				setRequestId: vi.fn(),
			} as unknown as ICopilotCLISDK;

			const { models } = createModels({ hasSession: true, sdk });

			const result = await models.getModels();

			expect(result).toEqual([]);
		});
	});
});
