/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AuthenticationGetSessionOptions, AuthenticationSession, AuthenticationSessionsChangeEvent } from 'vscode';
import { mock } from '../../../../util/common/test/simpleMock';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { AuthProviderId, ConfigKey } from '../../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import { BaseCAPIClientService } from '../../../endpoint/common/capiClient';
import { DomainService } from '../../../endpoint/node/domainServiceImpl';
import { NullEnvService } from '../../../env/common/nullEnvService';
import { LogServiceImpl } from '../../../log/common/logService';
import { FetchOptions, IFetcherService, Response } from '../../../networking/common/fetcherService';
import { NullTelemetryService } from '../../../telemetry/common/nullTelemetryService';
import { createFakeResponse } from '../../../test/node/fetcher';
import { GITHUB_SCOPE_ALIGNED, GITHUB_SCOPE_READ_USER, GITHUB_SCOPE_USER_EMAIL } from '../../common/authentication';
import { CopilotToken, createTestExtendedTokenInfo } from '../../common/copilotToken';
import { ICopilotTokenManager } from '../../common/copilotTokenManager';
import { CopilotTokenStore } from '../../common/copilotTokenStore';
import { AuthenticationService } from '../../vscode-node/authenticationService';
import { VSCodeCopilotTokenManager } from '../../vscode-node/copilotTokenManager';
import { getAlignedSession, getAnyAuthSession } from '../../vscode-node/session';

const vscodeAuthentication = vi.hoisted(() => ({
	getAccounts: vi.fn(),
	getSession: vi.fn(),
	onDidChangeSessions: vi.fn(),
}));

vi.mock('vscode', async importOriginal => ({
	...await importOriginal<typeof import('vscode')>(),
	authentication: vscodeAuthentication,
	window: { showWarningMessage: vi.fn() },
}));

class TestAuthenticationApi {
	readonly sessions = ['https://first.ghe.com', 'https://second.ghe.com'].map((host, index): AuthenticationSession => ({
		id: `session-${index}`,
		accessToken: `github-${host}`,
		account: { id: `account-${index}`, label: 'same-login' },
		authorizationServer: URI.parse(`${host}/login/oauth`),
		scopes: GITHUB_SCOPE_USER_EMAIL,
	}));
	selected: AuthenticationSession | undefined = this.sessions[1];
	permissive = false;
	readonly calls: { providerId: string; scopes: readonly string[]; options: AuthenticationGetSessionOptions }[] = [];

	async getSession(providerId: string, scopes: readonly string[], options: AuthenticationGetSessionOptions = {}): Promise<AuthenticationSession | undefined> {
		this.calls.push({ providerId, scopes, options });
		if (providerId === AuthProviderId.Microsoft) {
			return undefined;
		}
		const accounts = this.sessions.filter(session =>
			(!options.account || options.account.id === session.account.id)
			&& (!options.authorizationServer || options.authorizationServer.toString() === session.authorizationServer?.toString()));
		if (options.createIfNone || options.forceNewSession) {
			this.selected = accounts.find(session => session.account.id === this.selected?.account.id) ?? (options.account ? accounts[0] : this.sessions[1]);
			this.permissive ||= scopes === GITHUB_SCOPE_ALIGNED;
			return this.selected && { ...this.selected, scopes };
		}
		if (scopes === GITHUB_SCOPE_ALIGNED && !this.permissive) {
			return undefined;
		}
		const selected = accounts.find(session => session.account.id === this.selected?.account.id) ?? (accounts.length === 1 ? accounts[0] : undefined);
		return selected && { ...selected, scopes };
	}
}

class TestCopilotTokenManager implements ICopilotTokenManager {
	declare readonly _serviceBrand: undefined;
	readonly onDidCopilotTokenRefresh = Event.None;
	resetCount = 0;
	async getCopilotToken(): Promise<CopilotToken> {
		return new CopilotToken(createTestExtendedTokenInfo({ token: 'copilot-test' }));
	}
	resetCopilotToken(): void { this.resetCount++; }
}

class TestAuthenticationService extends AuthenticationService {
	refreshAuthentication(): Promise<void> {
		return this._handleAuthChangeEvent();
	}
}

class TestFetcherService extends mock<IFetcherService>() {
	readonly requests: { url: string; authorization: string | undefined }[] = [];
	pendingToken: DeferredPromise<Response> | undefined;
	override async fetch(url: string, options: FetchOptions): Promise<Response> {
		this.requests.push({ url, authorization: options.headers?.Authorization });
		if (url.endsWith('/copilot_internal/v2/token')) {
			if (this.pendingToken && url.includes('second.ghe.com')) {
				return this.pendingToken.p;
			}
			return createFakeResponse(200, createTestExtendedTokenInfo({ token: `copilot-${new URL(url).hostname}`, refresh_in: 1800 }));
		}
		return createFakeResponse(200, { copilot_plan: 'business' });
	}
}

class TestCAPIClientService extends BaseCAPIClientService {
	constructor(fetcher: IFetcherService) {
		super(undefined, undefined, fetcher, new NullEnvService());
	}
}

describe('Copilot session provenance', () => {
	const disposables = new DisposableStore();
	let api: TestAuthenticationApi;
	let configuration: InMemoryConfigurationService;
	let tokenStore: CopilotTokenStore;
	let changes: Emitter<AuthenticationSessionsChangeEvent>;
	let log: LogServiceImpl;

	beforeEach(async () => {
		vi.clearAllMocks();
		api = new TestAuthenticationApi();
		configuration = disposables.add(new InMemoryConfigurationService(disposables.add(new DefaultsOnlyConfigurationService())));
		await configuration.setConfig(ConfigKey.Shared.AuthProvider, AuthProviderId.GitHubEnterprise);
		tokenStore = disposables.add(new CopilotTokenStore());
		changes = disposables.add(new Emitter<AuthenticationSessionsChangeEvent>());
		log = disposables.add(new LogServiceImpl([]));
		vscodeAuthentication.getAccounts.mockImplementation(async () => api.sessions.map(session => session.account));
		vscodeAuthentication.getSession.mockImplementation((providerId, scopes, options) => api.getSession(providerId, scopes, options));
		vscodeAuthentication.onDidChangeSessions.mockImplementation(listener => changes.event(listener));
	});

	afterEach(() => disposables.clear());

	function createService(tokenManager: ICopilotTokenManager = new TestCopilotTokenManager(), capi = new TestCAPIClientService(new TestFetcherService())): TestAuthenticationService {
		disposables.add(new DomainService(configuration, tokenStore, capi));
		return disposables.add(new TestAuthenticationService(configuration, log, tokenStore, tokenManager));
	}

	function createTokenManager(fetcher: TestFetcherService): VSCodeCopilotTokenManager {
		const capi = new TestCAPIClientService(fetcher);
		const domains = disposables.add(new DomainService(configuration, tokenStore, capi));
		return disposables.add(new VSCodeCopilotTokenManager(log, new NullTelemetryService(), domains, capi, fetcher, new NullEnvService(), configuration, tokenStore));
	}

	test('ordinary sign-in carries the returned issuer without guessing a host', async () => {
		api.selected = undefined;
		const selected = await getAnyAuthSession(configuration, { createIfNone: { detail: 'test sign in' } });
		expect({
			selected: selected?.authorizationServer?.toString(),
			pinnedRequests: api.calls.filter(call => call.options.authorizationServer || call.options.account),
		}).toEqual({ selected: 'https://second.ghe.com/login/oauth', pinnedRequests: [] });
	});

	test.each([AuthProviderId.GitHub, AuthProviderId.GitHubEnterprise])('session acquisition handles missing %s sessions without resolving an issuer', async providerId => {
		await configuration.setConfig(ConfigKey.Shared.AuthProvider, providerId);
		api.selected = undefined;
		api.sessions.length = 0;
		expect([
			await getAnyAuthSession(configuration, { silent: true }),
			await getAlignedSession(configuration, { silent: true }),
		]).toEqual([undefined, undefined]);
	});

	test.each([
		{ kind: 'any', options: { silent: true }, hasAccounts: true },
		{ kind: 'any', options: { createIfNone: true }, hasAccounts: false },
		{ kind: 'any', options: { forceNewSession: true }, hasAccounts: true },
		{ kind: 'permissive', options: { silent: true }, hasAccounts: true },
		{ kind: 'permissive', options: { createIfNone: true }, hasAccounts: false },
		{ kind: 'permissive', options: { forceNewSession: true }, hasAccounts: true },
	])('validates $kind session provenance inside the shared acquisition path ($options)', async ({ kind, options, hasAccounts }) => {
		api.sessions[1] = { ...api.sessions[1], authorizationServer: undefined };
		api.selected = api.sessions[1];
		api.permissive = true;
		if (!hasAccounts) {
			vscodeAuthentication.getAccounts.mockResolvedValue([]);
		}
		const request = kind === 'any'
			? getAnyAuthSession(configuration, options)
			: getAlignedSession(configuration, options);
		await expect(request).rejects.toThrow('session is incompatible');
	});

	test('preserves aligned, minimal, then legacy scope acquisition order', async () => {
		const legacy = { ...api.sessions[1], scopes: GITHUB_SCOPE_READ_USER };
		vscodeAuthentication.getSession.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockResolvedValueOnce(legacy);
		const selected = await getAnyAuthSession(configuration, { silent: true });
		expect({
			scopes: vscodeAuthentication.getSession.mock.calls.map(([, scopes]) => scopes),
			issuer: selected?.authorizationServer?.toString(),
		}).toEqual({
			scopes: [GITHUB_SCOPE_ALIGNED, GITHUB_SCOPE_USER_EMAIL, GITHUB_SCOPE_READ_USER],
			issuer: legacy.authorizationServer?.toString(),
		});
	});

	test('preserves explicit account and issuer hints on scope probes', async () => {
		const selected = api.sessions[1];
		await getAnyAuthSession(configuration, { account: selected.account, authorizationServer: selected.authorizationServer, silent: true });
		expect(api.calls.map(call => [call.options.account?.id, call.options.authorizationServer?.toString()])).toEqual([
			[selected.account.id, selected.authorizationServer?.toString()],
			[selected.account.id, selected.authorizationServer?.toString()],
		]);
	});

	test.each(['any', 'permissive'] as const)('%s reauthentication can clear the preference without being pinned to the cached account', async kind => {
		const service = createService();
		await service.refreshAuthentication();
		const chosen = api.sessions[0];
		api.selected = chosen;
		api.calls.length = 0;
		const selected = await service.getGitHubSession(kind, {
			forceNewSession: { detail: 'choose an account' },
			clearSessionPreference: true,
		});
		const request = api.calls.find(call => call.options.forceNewSession);
		expect({
			account: selected.account.id,
			issuer: selected.authorizationServer?.toString(),
			requestAccount: request?.options.account?.id,
			server: request?.options.authorizationServer?.toString(),
			clearPreference: request?.options.clearSessionPreference,
		}).toEqual({
			account: chosen.account.id,
			issuer: chosen.authorizationServer?.toString(),
			requestAccount: undefined,
			server: undefined,
			clearPreference: true,
		});
	});

	test('a singular provider can change issuer without changing account or session IDs', async () => {
		const initial = api.selected!;
		api.sessions.splice(0, api.sessions.length, initial);
		const fetcher = new TestFetcherService();
		const capi = new TestCAPIClientService(fetcher);
		const service = createService(new TestCopilotTokenManager(), capi);
		await service.refreshAuthentication();
		const next = { ...initial, accessToken: 'github-replacement', authorizationServer: URI.parse('https://first.ghe.com/login/oauth') };
		api.sessions[0] = next;
		api.selected = next;
		changes.fire({ provider: { id: AuthProviderId.GitHubEnterprise, label: 'GitHub Enterprise' } });
		await service.refreshAuthentication();
		expect({
			account: service.anyGitHubSession?.account.id,
			session: service.anyGitHubSession?.id,
			issuer: service.anyGitHubSession?.authorizationServer?.toString(),
			api: capi.dotcomAPIURL,
		}).toEqual({
			account: initial.account.id,
			session: initial.id,
			issuer: next.authorizationServer.toString(),
			api: 'https://api.first.ghe.com',
		});
	});

	test('an issuer-only identity change emits an authentication event even when the token is unchanged', async () => {
		const initial = api.selected!;
		api.sessions.splice(0, api.sessions.length, initial);
		const service = createService();
		await service.refreshAuthentication();
		const issuers: Array<string | undefined> = [];
		disposables.add(service.onDidAuthenticationChange(() => issuers.push(service.anyGitHubSession?.authorizationServer?.toString())));
		const next = { ...initial, authorizationServer: URI.parse('https://first.ghe.com/login/oauth') };
		api.sessions[0] = next;
		api.selected = next;
		await service.refreshAuthentication();
		await service.refreshAuthentication();
		expect({
			issuers,
			accessToken: service.anyGitHubSession?.accessToken,
			enterpriseUri: tokenStore.githubEnterpriseUri?.toString()
		}).toEqual({
			issuers: ['https://first.ghe.com/login/oauth'],
			accessToken: initial.accessToken,
			enterpriseUri: 'https://first.ghe.com/'
		});
	});

	test('permissive lookups do not clear or retarget the selected any-session URI', async () => {
		const manager = new TestCopilotTokenManager();
		const service = createService(manager);
		await service.refreshAuthentication();
		const selected = service.anyGitHubSession;
		const resetCount = manager.resetCount;
		const missing = await service.getGitHubSession('permissive', { silent: true });
		const uriWithoutPermissions = tokenStore.githubEnterpriseUri?.toString();

		api.permissive = true;
		const other = api.sessions[0];
		const scoped = await service.getGitHubSession('permissive', {
			silent: true, account: other.account, authorizationServer: other.authorizationServer,
		});
		expect({
			missing,
			scopedIssuer: scoped?.authorizationServer?.toString(),
			uriWithoutPermissions,
			uriAfterScopedLookup: tokenStore.githubEnterpriseUri?.toString(),
			sameSelectedSession: service.anyGitHubSession === selected,
			resets: manager.resetCount - resetCount,
		}).toEqual({
			missing: undefined,
			scopedIssuer: 'https://first.ghe.com/login/oauth',
			uriWithoutPermissions: 'https://second.ghe.com/',
			uriAfterScopedLookup: 'https://second.ghe.com/',
			sameSelectedSession: true,
			resets: 0,
		});
	});

	test('authentication publishes the selected URI before minting a token', async () => {
		const fetcher = new TestFetcherService();
		const capi = new TestCAPIClientService(fetcher);
		const domains = disposables.add(new DomainService(configuration, tokenStore, capi));
		const manager = disposables.add(new VSCodeCopilotTokenManager(log, new NullTelemetryService(), domains, capi, fetcher, new NullEnvService(), configuration, tokenStore));
		const service = disposables.add(new TestAuthenticationService(configuration, log, tokenStore, manager));
		await manager.getCopilotToken();
		await service.refreshAuthentication();
		await new Promise<void>(resolve => setImmediate(resolve));
		expect(capi.dotcomAPIURL).toBe('https://api.second.ghe.com');

		fetcher.requests.length = 0;
		api.selected = api.sessions[0];
		const changed = Event.toPromise(Event.filter(service.onDidAuthenticationChange, () => service.anyGitHubSession?.account.id === api.selected?.account.id));
		changes.fire({ provider: { id: AuthProviderId.GitHubEnterprise, label: 'GitHub Enterprise' } });
		await changed;
		expect({
			issuer: service.anyGitHubSession?.authorizationServer?.toString(),
			storedUri: tokenStore.githubEnterpriseUri?.toString(),
			endpoint: capi.dotcomAPIURL,
			requests: fetcher.requests.map(request => [new URL(request.url).hostname, request.authorization]),
		}).toEqual({
			issuer: 'https://first.ghe.com/login/oauth',
			storedUri: 'https://first.ghe.com/',
			endpoint: 'https://api.first.ghe.com',
			requests: [
				['api.first.ghe.com', `token ${api.sessions[0].accessToken}`],
				['api.first.ghe.com', `token ${api.sessions[0].accessToken}`],
			],
		});
	});

	test.each([
		{ providerId: AuthProviderId.GitHub, allowAnonymous: false, storedUri: undefined },
		{ providerId: AuthProviderId.GitHubEnterprise, allowAnonymous: true, storedUri: undefined },
		{ providerId: AuthProviderId.GitHubEnterprise, allowAnonymous: true, storedUri: 'https://second.ghe.com' },
	])('missing $providerId sessions use the existing login failure without network requests ($storedUri)', async ({ providerId, allowAnonymous, storedUri }) => {
		await configuration.setConfig(ConfigKey.Shared.AuthProvider, providerId);
		api.selected = undefined;
		tokenStore.githubEnterpriseUri = storedUri ? URI.parse(storedUri) : undefined;
		await configuration.setNonExtensionConfig('chat.allowAnonymousAccess', allowAnonymous);
		const fetcher = new TestFetcherService();
		await expect(createTokenManager(fetcher).getCopilotToken()).rejects.toThrow('GitHubLoginFailed');
		expect(fetcher.requests).toEqual([]);
	});

	test('debug authentication failures bypass session lookup', async () => {
		api.selected = undefined;
		await configuration.setConfig(ConfigKey.Advanced.DebugGitHubAuthFailWith, 'HTTP401');
		const fetcher = new TestFetcherService();
		await expect(createTokenManager(fetcher).getCopilotToken()).rejects.toThrow('Your GitHub token is invalid');
		expect({
			accountLookups: vscodeAuthentication.getAccounts.mock.calls.length,
			sessionLookups: api.calls,
			requests: fetcher.requests,
		}).toEqual({ accountLookups: 0, sessionLookups: [], requests: [] });
	});

	test('token minting pairs both bootstrap requests with the returned issuer', async () => {
		const fetcher = new TestFetcherService();
		tokenStore.githubEnterpriseUri = URI.parse('https://second.ghe.com');
		await createTokenManager(fetcher).getCopilotToken();
		expect(fetcher.requests).toEqual([
			{ url: 'https://api.second.ghe.com/copilot_internal/v2/token', authorization: `token ${api.sessions[1].accessToken}` },
			{ url: 'https://api.second.ghe.com/copilot_internal/user', authorization: `token ${api.sessions[1].accessToken}` },
		]);
	});

	test('a cached token keeps the baseline no-lookup path and force still refreshes it', async () => {
		const fetcher = new TestFetcherService();
		tokenStore.githubEnterpriseUri = URI.parse('https://second.ghe.com');
		const manager = createTokenManager(fetcher);
		const first = await manager.getCopilotToken();
		api.calls.length = 0;
		const cached = await manager.getCopilotToken();
		const cachedLookups = api.calls.length;
		await manager.getCopilotToken(true);
		expect({ token: cached.token, cachedLookups, requests: fetcher.requests.length }).toEqual({
			token: first.token, cachedLookups: 0, requests: 4,
		});
	});

	test('different issuers do not share an in-flight result and stale tokens are not published', async () => {
		const fetcher = new TestFetcherService();
		fetcher.pendingToken = new DeferredPromise<Response>();
		tokenStore.githubEnterpriseUri = URI.parse('https://second.ghe.com');
		const manager = createTokenManager(fetcher);
		const rejected = expect(manager.getCopilotToken()).rejects.toThrow('account changed');
		await vi.waitFor(() => expect(fetcher.requests).toHaveLength(2));
		const next = { ...api.selected!, authorizationServer: URI.parse('https://first.ghe.com/login/oauth') };
		api.sessions.splice(0, api.sessions.length, next);
		api.selected = next;
		tokenStore.githubEnterpriseUri = URI.parse('https://first.ghe.com');
		const current = await manager.getCopilotToken();
		await fetcher.pendingToken.complete(createFakeResponse(200, createTestExtendedTokenInfo({ token: 'stale-second' })));
		await rejected;
		expect([current.token, api.selected?.authorizationServer?.toString()]).toEqual([
			'copilot-api.first.ghe.com', next.authorizationServer.toString(),
		]);
	});

	test.each([undefined, 'https://first.ghe.com'])('does not send credentials before authentication publishes the matching URI (%s)', async storedUri => {
		tokenStore.githubEnterpriseUri = storedUri ? URI.parse(storedUri) : undefined;
		const fetcher = new TestFetcherService();
		await expect(createTokenManager(fetcher).getCopilotToken()).rejects.toThrow('account changed');
		expect(fetcher.requests).toEqual([]);
	});

	test.each(['sign out', 'public GitHub'])('authentication clears the stored enterprise URI on %s', async action => {
		const capi = new TestCAPIClientService(new TestFetcherService());
		const service = createService(new TestCopilotTokenManager(), capi);
		await service.refreshAuthentication();
		if (action === 'public GitHub') {
			const session = { ...api.sessions[0], authorizationServer: URI.parse('https://github.com/login/oauth') };
			api.sessions.splice(0, api.sessions.length, session);
			api.selected = session;
			await configuration.setConfig(ConfigKey.Shared.AuthProvider, AuthProviderId.GitHub);
		} else {
			api.sessions.length = 0;
			api.selected = undefined;
		}
		await service.getGitHubSession('any', { silent: true });
		expect({
			storedUri: tokenStore.githubEnterpriseUri?.toString(),
			endpoint: capi.dotcomAPIURL,
		}).toEqual({ storedUri: undefined, endpoint: 'https://api.github.com' });
	});

	test.each([AuthProviderId.GitHub, AuthProviderId.GitHubEnterprise])('a %s session without provenance is incompatible even with a configured enterprise URI', async providerId => {
		await configuration.setConfig(ConfigKey.Shared.AuthProvider, providerId);
		await configuration.setNonExtensionConfig('github-enterprise.uri', 'https://second.ghe.com');
		api.sessions[1] = { ...api.sessions[1], authorizationServer: undefined };
		api.selected = api.sessions[1];
		const fetcher = new TestFetcherService();
		await expect(getAnyAuthSession(configuration, { silent: true })).rejects.toThrow('session is incompatible');
		await expect(createTokenManager(fetcher).getCopilotToken()).rejects.toThrow('session is incompatible');
		expect(fetcher.requests).toEqual([]);
	});

	test('provider settings do not refresh or replace the selected session', async () => {
		const service = createService();
		await service.refreshAuthentication();
		api.calls.length = 0;
		await configuration.setNonExtensionConfig('github-enterprise.uri', 'https://unrelated.ghe.com');
		expect({ calls: api.calls, selected: service.anyGitHubSession?.authorizationServer?.toString() }).toEqual({
			calls: [], selected: api.selected?.authorizationServer?.toString(),
		});
	});

	test('an unchanged authentication-provider value does not reset or refresh authentication', async () => {
		const manager = new TestCopilotTokenManager();
		const service = createService(manager);
		await service.refreshAuthentication();
		const session = service.anyGitHubSession;
		const token = tokenStore.copilotToken;
		const resetCount = manager.resetCount;
		api.calls.length = 0;
		await configuration.setConfig(ConfigKey.Shared.AuthProvider, AuthProviderId.GitHubEnterprise);
		expect({
			calls: api.calls,
			resets: manager.resetCount - resetCount,
			sameSession: service.anyGitHubSession === session,
			sameToken: tokenStore.copilotToken === token,
			uri: tokenStore.githubEnterpriseUri?.toString(),
		}).toEqual({
			calls: [],
			resets: 0,
			sameSession: true,
			sameToken: true,
			uri: 'https://second.ghe.com/',
		});
	});
});
