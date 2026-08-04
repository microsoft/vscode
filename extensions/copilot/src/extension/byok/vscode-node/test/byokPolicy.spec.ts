/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { CopilotToken } from '../../../../platform/authentication/common/copilotToken';
import { ContactSupportError, EnterpriseManagedError, GitHubLoginFailedError, InvalidTokenError, NotSignedUpError, RateLimitedError, SubscriptionExpiredError } from '../../../../platform/authentication/vscode-node/copilotTokenManager';
import { AuthProviderId, ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { ILogger } from '../../../../platform/log/common/logService';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { resolveClientBYOKAllowed } from '../byokPolicy';

function mockToken(props: { isInternal?: boolean; isIndividual?: boolean; isClientBYOKEnabled?: boolean }): CopilotToken {
	return {
		isInternal: props.isInternal ?? false,
		isIndividual: props.isIndividual ?? false,
		isClientBYOKEnabled: () => props.isClientBYOKEnabled ?? false,
	} as unknown as CopilotToken;
}

function createAuthService(options: { accountId?: string; hasCopilotTokenSource?: boolean; sessionId?: string; sessionless?: boolean; token?: CopilotToken; error?: Error }): IAuthenticationService {
	return {
		hasCopilotTokenSource: options.hasCopilotTokenSource ?? true,
		anyGitHubSession: options.sessionless ? undefined : {
			account: { id: options.accountId ?? 'account-1', label: 'test-user' },
			accessToken: 'github-token',
			id: options.sessionId ?? 'session-1',
			scopes: [],
		},
		getCopilotToken: vi.fn(async () => {
			if (options.error) {
				throw options.error;
			}
			return options.token ?? mockToken({});
		}),
	} as unknown as IAuthenticationService;
}

function createExtensionContext(): IVSCodeExtensionContext {
	const state = new Map<string, unknown>();
	return {
		globalState: {
			get: vi.fn((key: string) => state.get(key)),
			update: vi.fn(async (key: string, value: unknown) => {
				if (value === undefined) {
					state.delete(key);
				} else {
					state.set(key, value);
				}
			}),
		},
	} as unknown as IVSCodeExtensionContext;
}

function createLogService(): ILogger {
	return { error: vi.fn() } as unknown as ILogger;
}

function createConfigurationService(options: { authProvider?: AuthProviderId; enterpriseUri?: string; proxyUrl?: string; capiUrl?: string; authType?: 'hmac' | 'token' } = {}): IConfigurationService {
	return {
		getConfig: vi.fn(config => {
			if (config === ConfigKey.Shared.DebugOverrideProxyUrl) {
				return options.proxyUrl;
			}
			if (config === ConfigKey.Shared.DebugOverrideCAPIUrl) {
				return options.capiUrl;
			}
			if (config === ConfigKey.Shared.DebugOverrideAuthType) {
				return options.authType ?? 'hmac';
			}
			if (config === ConfigKey.Shared.AuthProvider) {
				return options.authProvider ?? AuthProviderId.GitHub;
			}
			return undefined;
		}),
		getNonExtensionConfig: vi.fn(key => key === 'github-enterprise.uri' ? options.enterpriseUri : undefined),
	} as unknown as IConfigurationService;
}

describe('resolveClientBYOKAllowed', () => {
	it('allows users without a Copilot token source without resolving a token', async () => {
		const authService = createAuthService({ hasCopilotTokenSource: false });
		const extensionContext = createExtensionContext();

		const allowed = await resolveClientBYOKAllowed(authService, extensionContext, createLogService(), createConfigurationService());

		expect(authService.getCopilotToken).not.toHaveBeenCalled();
		expect(extensionContext.globalState.update).not.toHaveBeenCalled();
		expect(allowed).toBe(true);
	});

	it.each([
		{
			name: 'users without Copilot entitlement',
			error: new NotSignedUpError('not signed up'),
		},
		{
			name: 'users whose Copilot subscription expired',
			error: new SubscriptionExpiredError('subscription expired'),
		},
	])('allows $name', async ({ error }) => {
		const authService = createAuthService({ error });

		const allowed = await resolveClientBYOKAllowed(authService, createExtensionContext(), createLogService(), createConfigurationService());

		expect(allowed).toBe(true);
	});

	it.each([
		{
			name: 'internal users',
			token: mockToken({ isInternal: true }),
			expected: true,
		},
		{
			name: 'individual users',
			token: mockToken({ isIndividual: true }),
			expected: true,
		},
		{
			name: 'managed users with BYOK enabled',
			token: mockToken({ isClientBYOKEnabled: true }),
			expected: true,
		},
		{
			name: 'managed users without BYOK enabled',
			token: mockToken({}),
			expected: false,
		},
	])('resolves live policy for $name', async ({ token, expected }) => {
		const authService = createAuthService({ token });

		const allowed = await resolveClientBYOKAllowed(authService, createExtensionContext(), createLogService(), createConfigurationService());

		expect(allowed).toBe(expected);
	});

	it.each([
		{
			name: 'network failures',
			error: new Error('network unavailable'),
		},
		{
			name: 'GitHub login failures',
			error: new GitHubLoginFailedError('GitHubLoginFailed'),
		},
		{
			name: 'rate limits',
			error: new RateLimitedError('rate limited'),
		},
		{
			name: 'invalid GitHub tokens',
			error: new InvalidTokenError('invalid token'),
		},
		{
			name: 'server and feature failures',
			error: new ContactSupportError('contact support'),
		},
		{
			name: 'enterprise managed account token failures',
			error: new EnterpriseManagedError('enterprise managed'),
		},
	])('allows $name when no enterprise policy has been observed', async ({ error }) => {
		const authService = createAuthService({ error });

		const allowed = await resolveClientBYOKAllowed(authService, createExtensionContext(), createLogService(), createConfigurationService());

		expect(allowed).toBe(true);
	});

	it.each([
		{ name: 'allowed', token: mockToken({ isClientBYOKEnabled: true }), expected: true },
		{ name: 'denied', token: mockToken({}), expected: false },
	])('preserves the last managed $name policy during an outage', async ({ token, expected }) => {
		const extensionContext = createExtensionContext();
		const logService = createLogService();
		const configurationService = createConfigurationService();
		await resolveClientBYOKAllowed(createAuthService({ token }), extensionContext, logService, configurationService);

		const allowed = await resolveClientBYOKAllowed(createAuthService({ error: new Error('network unavailable') }), extensionContext, logService, configurationService);

		expect(allowed).toBe(expected);
	});

	it('preserves a managed deny for a sessionless token source during an outage', async () => {
		const extensionContext = createExtensionContext();
		const logService = createLogService();
		const configurationService = createConfigurationService({ proxyUrl: 'https://proxy.example.com' });
		await resolveClientBYOKAllowed(createAuthService({ sessionless: true, token: mockToken({}) }), extensionContext, logService, configurationService);

		const allowed = await resolveClientBYOKAllowed(createAuthService({ sessionless: true, error: new Error('network unavailable') }), extensionContext, logService, configurationService);

		expect(allowed).toBe(false);
	});

	it.each([
		{ name: 'no Copilot entitlement', error: new NotSignedUpError('not signed up'), token: undefined },
		{ name: 'an expired subscription', error: new SubscriptionExpiredError('subscription expired'), token: undefined },
		{ name: 'an internal token', error: undefined, token: mockToken({ isInternal: true }) },
		{ name: 'an individual token', error: undefined, token: mockToken({ isIndividual: true }) },
	])('clears a stale managed deny after observing $name', async ({ error, token }) => {
		const extensionContext = createExtensionContext();
		const logService = createLogService();
		const configurationService = createConfigurationService();
		await resolveClientBYOKAllowed(createAuthService({ token: mockToken({}) }), extensionContext, logService, configurationService);
		await resolveClientBYOKAllowed(createAuthService({ error, token }), extensionContext, logService, configurationService);

		const allowed = await resolveClientBYOKAllowed(createAuthService({ error: new Error('network unavailable') }), extensionContext, logService, configurationService);

		expect(allowed).toBe(true);
	});

	it('preserves an explicit managed deny after an enterprise managed account token failure', async () => {
		const extensionContext = createExtensionContext();
		const logService = createLogService();
		const configurationService = createConfigurationService();
		await resolveClientBYOKAllowed(createAuthService({ token: mockToken({}) }), extensionContext, logService, configurationService);
		await resolveClientBYOKAllowed(createAuthService({ error: new EnterpriseManagedError('enterprise managed') }), extensionContext, logService, configurationService);

		const allowed = await resolveClientBYOKAllowed(createAuthService({ error: new Error('network unavailable') }), extensionContext, logService, configurationService);

		expect(allowed).toBe(false);
	});

	it('shares cached enterprise policy between sessions for the same account and provider', async () => {
		const extensionContext = createExtensionContext();
		const logService = createLogService();
		await resolveClientBYOKAllowed(createAuthService({ accountId: 'shared-account-id', sessionId: 'github-session', token: mockToken({}) }), extensionContext, logService, createConfigurationService());

		const allowed = await resolveClientBYOKAllowed(createAuthService({ accountId: 'shared-account-id', sessionId: 'github-enterprise-session', error: new Error('network unavailable') }), extensionContext, logService, createConfigurationService());

		expect(allowed).toBe(false);
	});

	it('does not share cached enterprise policy between GitHub hosts', async () => {
		const extensionContext = createExtensionContext();
		const logService = createLogService();
		await resolveClientBYOKAllowed(createAuthService({ accountId: 'shared-account-id', token: mockToken({}) }), extensionContext, logService, createConfigurationService());

		const allowed = await resolveClientBYOKAllowed(
			createAuthService({ accountId: 'shared-account-id', error: new Error('network unavailable') }),
			extensionContext,
			logService,
			createConfigurationService({ authProvider: AuthProviderId.GitHubEnterprise, enterpriseUri: 'https://github.example.com' })
		);

		expect(allowed).toBe(true);
	});

	it('preserves authenticated enterprise policy across Copilot endpoint overrides', async () => {
		const extensionContext = createExtensionContext();
		const logService = createLogService();
		await resolveClientBYOKAllowed(
			createAuthService({ token: mockToken({}) }),
			extensionContext,
			logService,
			createConfigurationService({ proxyUrl: 'https://proxy-one.example.com', capiUrl: 'https://capi-one.example.com', authType: 'hmac' })
		);

		const allowed = await resolveClientBYOKAllowed(
			createAuthService({ error: new Error('network unavailable') }),
			extensionContext,
			logService,
			createConfigurationService({ proxyUrl: 'https://proxy-two.example.com', capiUrl: 'https://capi-two.example.com', authType: 'token' })
		);

		expect(allowed).toBe(false);
	});

	it('does not share cached enterprise policy between sessionless endpoint sources', async () => {
		const extensionContext = createExtensionContext();
		const logService = createLogService();
		await resolveClientBYOKAllowed(
			createAuthService({ sessionless: true, token: mockToken({}) }),
			extensionContext,
			logService,
			createConfigurationService({ proxyUrl: 'https://proxy-one.example.com', capiUrl: 'https://capi-one.example.com', authType: 'hmac' })
		);

		const allowed = await resolveClientBYOKAllowed(
			createAuthService({ sessionless: true, error: new Error('network unavailable') }),
			extensionContext,
			logService,
			createConfigurationService({ proxyUrl: 'https://proxy-two.example.com', capiUrl: 'https://capi-two.example.com', authType: 'token' })
		);

		expect(allowed).toBe(true);
	});

	it('shares cached enterprise policy between equivalent proxy URLs', async () => {
		const extensionContext = createExtensionContext();
		const logService = createLogService();
		await resolveClientBYOKAllowed(createAuthService({ sessionless: true, token: mockToken({}) }), extensionContext, logService, createConfigurationService({ proxyUrl: 'https://proxy.example.com/' }));

		const allowed = await resolveClientBYOKAllowed(createAuthService({ sessionless: true, error: new Error('network unavailable') }), extensionContext, logService, createConfigurationService({ proxyUrl: 'https://proxy.example.com' }));

		expect(allowed).toBe(false);
	});

	it('does not persist authentication session IDs in cache keys', async () => {
		const extensionContext = createExtensionContext();
		const sessionId = 'secret-static-token';

		await resolveClientBYOKAllowed(createAuthService({ sessionId, token: mockToken({}) }), extensionContext, createLogService(), createConfigurationService());

		expect(extensionContext.globalState.update).toHaveBeenCalledOnce();
		expect(vi.mocked(extensionContext.globalState.update).mock.calls[0][0]).not.toContain(sessionId);
	});

	it('keeps the latest live decision in memory when the persistent cache cannot be updated', async () => {
		const state = new Map<string, unknown>();
		let failUpdate = false;
		const extensionContext = {
			globalState: {
				get: vi.fn((key: string) => state.get(key)),
				update: vi.fn(async (key: string, value: unknown) => {
					if (failUpdate) {
						throw new Error('storage unavailable');
					}
					state.set(key, value);
				}),
			},
		} as unknown as IVSCodeExtensionContext;
		const logService = createLogService();
		const configurationService = createConfigurationService();
		await resolveClientBYOKAllowed(createAuthService({ token: mockToken({}) }), extensionContext, logService, configurationService);
		failUpdate = true;
		await resolveClientBYOKAllowed(createAuthService({ token: mockToken({ isClientBYOKEnabled: true }) }), extensionContext, logService, configurationService);

		const allowed = await resolveClientBYOKAllowed(createAuthService({ error: new Error('network unavailable') }), extensionContext, logService, configurationService);

		expect(allowed).toBe(true);
		expect(logService.error).toHaveBeenCalledOnce();
	});

	it('keeps a superseded resolution from replacing the cached policy', async () => {
		const olderToken = new DeferredPromise<CopilotToken>();
		const newerToken = new DeferredPromise<CopilotToken>();
		const authService = createAuthService({});
		vi.mocked(authService.getCopilotToken)
			.mockImplementationOnce(() => olderToken.p)
			.mockImplementationOnce(() => newerToken.p)
			.mockRejectedValueOnce(new Error('network unavailable'));
		const extensionContext = createExtensionContext();
		const logService = createLogService();
		const configurationService = createConfigurationService();
		let generation = 0;
		const olderGeneration = ++generation;
		const olderResult = resolveClientBYOKAllowed(authService, extensionContext, logService, configurationService, () => olderGeneration === generation);
		const newerGeneration = ++generation;
		const newerResult = resolveClientBYOKAllowed(authService, extensionContext, logService, configurationService, () => newerGeneration === generation);
		await newerToken.complete(mockToken({ isClientBYOKEnabled: true }));
		expect(await newerResult).toBe(true);
		await olderToken.complete(mockToken({}));
		expect(await olderResult).toBe(false);

		expect(await resolveClientBYOKAllowed(authService, extensionContext, logService, configurationService)).toBe(true);
	});
});
