/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticationSession } from 'vscode';
import { IAuthenticationService } from '../../../../../platform/authentication/common/authentication';
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

	function createModels(options: { hasSession?: boolean; sdk?: ICopilotCLISDK } = {}): { models: CopilotCLIModels; auth: MockAuthenticationService } {
		const auth = new MockAuthenticationService(options.hasSession ?? true);
		const sdk = options.sdk ?? createMockSDK();
		const extensionContext = createMockExtensionContext();

		const models = new CopilotCLIModels(
			sdk,
			extensionContext,
			logService,
			auth as unknown as IAuthenticationService,
		);
		disposables.add(models);
		disposables.add({ dispose: () => auth.dispose() });
		return { models, auth };
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
