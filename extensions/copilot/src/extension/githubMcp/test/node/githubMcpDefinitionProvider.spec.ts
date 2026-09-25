/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { AuthenticationGetSessionOptions, AuthenticationSession } from 'vscode';
import { BaseAuthenticationService, IAuthenticationService, StrictAuthenticationPresentationOptions } from '../../../../platform/authentication/common/authentication';
import { CopilotToken } from '../../../../platform/authentication/common/copilotToken';
import { ICopilotTokenManager } from '../../../../platform/authentication/common/copilotTokenManager';
import { CopilotTokenStore, ICopilotTokenStore } from '../../../../platform/authentication/common/copilotTokenStore';
import { SimulationTestCopilotTokenManager } from '../../../../platform/authentication/test/node/simulationTestCopilotTokenManager';
import { AuthProviderId, ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { ILogService, LogServiceImpl } from '../../../../platform/log/common/logService';
import { TestingServiceCollection } from '../../../../platform/test/node/services';
import { DeferredPromise, raceTimeout } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { GitHubMcpDefinitionProvider } from '../../common/githubMcpDefinitionProvider';

/**
 * Test implementation of authentication service that allows setting sessions dynamically
 */
class TestAuthenticationService extends BaseAuthenticationService {
	private readonly _onDidChange = new Emitter<void>();
	pendingSession: Promise<AuthenticationSession> | undefined;
	readonly permissionRequests: AuthenticationGetSessionOptions[] = [];

	constructor(
		@ILogService logService: ILogService,
		@ICopilotTokenStore tokenStore: ICopilotTokenStore,
		@ICopilotTokenManager tokenManager: ICopilotTokenManager,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(logService, tokenStore, tokenManager, configurationService);
		this._register(this._onDidChange);
	}

	setPermissiveGitHubSession(session: AuthenticationSession | undefined): void {
		this._permissiveGitHubSession = session;
		this._anyGitHubSession = session;
		this.fireAuthenticationChange('setPermissiveGitHubSession');
	}

	setAnyGitHubSession(session: AuthenticationSession | undefined): void {
		this._anyGitHubSession = session;
		this.fireAuthenticationChange('setAnyGitHubSession');
	}

	override getGitHubSession(kind: 'permissive' | 'any', options: AuthenticationGetSessionOptions & { createIfNone: StrictAuthenticationPresentationOptions }): Promise<AuthenticationSession>;
	override getGitHubSession(kind: 'permissive' | 'any', options: AuthenticationGetSessionOptions & { forceNewSession: StrictAuthenticationPresentationOptions }): Promise<AuthenticationSession>;
	override getGitHubSession(kind: 'permissive' | 'any', options?: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
		if (kind === 'permissive') {
			if (options?.createIfNone) {
				this.permissionRequests.push(options);
			}
			if (options?.createIfNone && this.pendingSession) {
				return this.pendingSession;
			}
			if (options?.createIfNone && !this._permissiveGitHubSession) {
				throw new Error('No permissive GitHub session available');
			}
			return Promise.resolve(this._permissiveGitHubSession);
		} else {
			return Promise.resolve(this._anyGitHubSession);
		}
	}

	override getAnyAdoSession(_options?: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
		return Promise.resolve(undefined);
	}

	override getAdoAccessTokenBase64(_options?: AuthenticationGetSessionOptions): Promise<string | undefined> {
		return Promise.resolve(undefined);
	}

	override async getCopilotToken(_force?: boolean): Promise<CopilotToken> {
		return await super.getCopilotToken(_force);
	}
}

describe('GitHubMcpDefinitionProvider', () => {
	const disposables = new DisposableStore();
	let configService: InMemoryConfigurationService;
	let authService: TestAuthenticationService;
	let provider: GitHubMcpDefinitionProvider;

	/**
	 * Helper to create a provider with specific configuration values.
	 */
	async function createProvider(configOverrides?: {
		authProvider?: AuthProviderId;
		toolsets?: string[];
		readonly?: boolean;
		lockdown?: boolean;
		channel?: ConfigKey.GitHubMcpChannelValue;
		hasPermissiveToken?: boolean;
	}): Promise<GitHubMcpDefinitionProvider> {
		const serviceCollection = disposables.add(new TestingServiceCollection());
		configService = disposables.add(new InMemoryConfigurationService(disposables.add(new DefaultsOnlyConfigurationService())));

		// Set configuration values before creating the provider
		if (configOverrides?.authProvider) {
			await configService.setConfig(ConfigKey.Shared.AuthProvider, configOverrides.authProvider);
		}
		if (configOverrides?.toolsets) {
			await configService.setConfig(ConfigKey.GitHubMcpToolsets, configOverrides.toolsets);
		}
		if (configOverrides?.readonly !== undefined) {
			await configService.setConfig(ConfigKey.GitHubMcpReadonly, configOverrides.readonly);
		}
		if (configOverrides?.lockdown !== undefined) {
			await configService.setConfig(ConfigKey.GitHubMcpLockdown, configOverrides.lockdown);
		}
		if (configOverrides?.channel !== undefined) {
			await configService.setConfig(ConfigKey.GitHubMcpChannel, configOverrides.channel);
		}

		serviceCollection.define(IConfigurationService, configService);
		serviceCollection.define(ICopilotTokenStore, new SyncDescriptor(CopilotTokenStore));
		serviceCollection.define(ICopilotTokenManager, new SyncDescriptor(SimulationTestCopilotTokenManager));
		serviceCollection.define(IAuthenticationService, new SyncDescriptor(TestAuthenticationService));
		serviceCollection.define(ILogService, new LogServiceImpl([]));
		const accessor = disposables.add(serviceCollection.createTestingAccessor());

		// Get the auth service and set up permissive token if needed
		authService = accessor.get(IAuthenticationService) as TestAuthenticationService;
		if (configOverrides?.hasPermissiveToken !== false) {
			authService.setPermissiveGitHubSession({
				accessToken: 'test-token', id: 'test-id', account: { id: 'test-account', label: 'test' }, scopes: [],
				authorizationServer: URI.parse(configOverrides?.authProvider === AuthProviderId.GitHubEnterprise ? 'https://enterprise.example/login/oauth' : 'https://github.com/login/oauth'),
			});
		}

		return new GitHubMcpDefinitionProvider(
			accessor.get(IConfigurationService),
			accessor.get(IAuthenticationService),
			accessor.get(ILogService)
		);
	}

	beforeEach(async () => {
		provider = await createProvider();
	});

	afterEach(() => disposables.clear());

	function enterpriseSession(host: string): AuthenticationSession {
		return {
			id: 'session',
			accessToken: `token-${host}`,
			account: { id: 'account', label: 'same-user' },
			authorizationServer: URI.parse(`${host}/login/oauth`),
			scopes: [],
		};
	}

	describe('provideMcpServerDefinitions', () => {
		test('returns GitHub.com configuration by default', () => {
			const definitions = provider.provideMcpServerDefinitions();

			expect(definitions).toHaveLength(1);
			expect(definitions[0].label).toBe('GitHub');
			expect(definitions[0].uri.toString()).toBe('https://api.githubcopilot.com/mcp/');
		});

		test('returns GitHub Enterprise configuration when auth provider is set to GHE', async () => {
			const gheUri = 'https://github.enterprise.com';
			const gheProvider = await createProvider({
				authProvider: AuthProviderId.GitHubEnterprise,
			});
			authService.setPermissiveGitHubSession(enterpriseSession(gheUri));

			const definitions = gheProvider.provideMcpServerDefinitions();

			expect(definitions).toHaveLength(1);
			expect(definitions[0].label).toBe('GitHub Enterprise');
			// Should include the copilot-api. prefix
			expect(definitions[0].uri.toString()).toBe('https://copilot-api.github.enterprise.com/mcp/');
		});

		test('includes configured toolsets in headers', async () => {
			const toolsets = ['code_search', 'issues', 'pull_requests'];
			const providerWithToolsets = await createProvider({ toolsets });

			const definitions = providerWithToolsets.provideMcpServerDefinitions();

			expect(definitions[0].headers['X-MCP-Toolsets']).toBe('code_search,issues,pull_requests');
		});

		test('handles empty toolsets configuration', async () => {
			const providerWithEmptyToolsets = await createProvider({ toolsets: [] });

			const definitions = providerWithEmptyToolsets.provideMcpServerDefinitions();

			expect(definitions[0].headers['X-MCP-Toolsets']).toBeUndefined();
		});

		test('version is the sorted toolset string', async () => {
			const toolsets = ['pull_requests', 'code_search', 'issues'];
			const providerWithToolsets = await createProvider({ toolsets });
			const definitions = providerWithToolsets.provideMcpServerDefinitions();
			// Sorted toolsets string
			expect(definitions[0].version).toBe('code_search,issues,pull_requests');
		});

		test.each([AuthProviderId.GitHub, AuthProviderId.GitHubEnterprise])('rejects a %s session without provenance even with a configured enterprise URI', async authProvider => {
			const incompatibleProvider = await createProvider({ authProvider });
			authService.setPermissiveGitHubSession({ ...authService.permissiveGitHubSession!, authorizationServer: undefined });
			await configService.setNonExtensionConfig('github-enterprise.uri', 'https://enterprise.example');
			expect(() => incompatibleProvider.provideMcpServerDefinitions()).toThrow('session is incompatible');
		});

		test('includes X-MCP-Readonly header when readonly is true', async () => {
			const readonlyProvider = await createProvider({ readonly: true });

			const definitions = readonlyProvider.provideMcpServerDefinitions();

			expect(definitions[0].headers['X-MCP-Readonly']).toBe('true');
		});

		test('does not include X-MCP-Readonly header when readonly is false', async () => {
			const nonReadonlyProvider = await createProvider({ readonly: false });

			const definitions = nonReadonlyProvider.provideMcpServerDefinitions();

			expect(definitions[0].headers['X-MCP-Readonly']).toBeUndefined();
		});

		test('includes X-MCP-Lockdown header when lockdown is true', async () => {
			const lockdownProvider = await createProvider({ lockdown: true });

			const definitions = lockdownProvider.provideMcpServerDefinitions();

			expect(definitions[0].headers['X-MCP-Lockdown']).toBe('true');
		});

		test('does not include X-MCP-Lockdown header when lockdown is false', async () => {
			const nonLockdownProvider = await createProvider({ lockdown: false });

			const definitions = nonLockdownProvider.provideMcpServerDefinitions();

			expect(definitions[0].headers['X-MCP-Lockdown']).toBeUndefined();
		});

		test('includes both readonly and lockdown headers when both are true', async () => {
			const bothProvider = await createProvider({ readonly: true, lockdown: true });

			const definitions = bothProvider.provideMcpServerDefinitions();

			expect(definitions[0].headers['X-MCP-Readonly']).toBe('true');
			expect(definitions[0].headers['X-MCP-Lockdown']).toBe('true');
		});

		test('version includes readonly flag when readonly is true', async () => {
			const readonlyProvider = await createProvider({ readonly: true });

			const definitions = readonlyProvider.provideMcpServerDefinitions();

			expect(definitions[0].version).toBe('default|readonly');
		});

		test('version includes lockdown flag when lockdown is true', async () => {
			const lockdownProvider = await createProvider({ lockdown: true });

			const definitions = lockdownProvider.provideMcpServerDefinitions();

			expect(definitions[0].version).toBe('default|lockdown');
		});

		test('version includes both flags when both readonly and lockdown are true', async () => {
			const bothProvider = await createProvider({ readonly: true, lockdown: true });

			const definitions = bothProvider.provideMcpServerDefinitions();

			expect(definitions[0].version).toBe('default|readonly|lockdown');
		});

		test('includes X-MCP-Insiders header when channel is insiders', async () => {
			const insidersProvider = await createProvider({ channel: 'insiders' });

			const definitions = insidersProvider.provideMcpServerDefinitions();

			expect(definitions[0].headers['X-MCP-Insiders']).toBe('true');
		});

		test('does not include X-MCP-Insiders header when channel is stable', async () => {
			const stableProvider = await createProvider({ channel: 'stable' });

			const definitions = stableProvider.provideMcpServerDefinitions();

			expect(definitions[0].headers['X-MCP-Insiders']).toBeUndefined();
		});

		test('version includes insiders flag when channel is insiders', async () => {
			const insidersProvider = await createProvider({ channel: 'insiders' });

			const definitions = insidersProvider.provideMcpServerDefinitions();

			expect(definitions[0].version).toBe('default|insiders');
		});

		test('version includes all flags when readonly, lockdown, and insiders are set', async () => {
			const allFlagsProvider = await createProvider({ readonly: true, lockdown: true, channel: 'insiders' });

			const definitions = allFlagsProvider.provideMcpServerDefinitions();

			expect(definitions[0].version).toBe('default|readonly|lockdown|insiders');
		});

		test('version is just toolsets when readonly and lockdown are false', async () => {
			const toolsets = ['issues', 'pull_requests'];
			const normalProvider = await createProvider({ toolsets, readonly: false, lockdown: false });

			const definitions = normalProvider.provideMcpServerDefinitions();

			expect(definitions[0].version).toBe('issues,pull_requests');
		});

		test('version with empty toolsets and readonly', async () => {
			const readonlyEmptyProvider = await createProvider({ toolsets: [], readonly: true });

			const definitions = readonlyEmptyProvider.provideMcpServerDefinitions();

			expect(definitions[0].version).toBe('0|readonly');
		});
	});

	describe('onDidChangeMcpServerDefinitions', () => {
		test('fires when toolsets configuration changes', async () => {
			const eventPromise = Event.toPromise(provider.onDidChangeMcpServerDefinitions);

			await configService.setConfig(ConfigKey.GitHubMcpToolsets, ['new_toolset']);

			await eventPromise;
		});

		test('fires when auth provider configuration changes', async () => {
			const eventPromise = Event.toPromise(provider.onDidChangeMcpServerDefinitions);

			await configService.setConfig(ConfigKey.Shared.AuthProvider, AuthProviderId.GitHubEnterprise);

			await eventPromise;
		});

		test('fires when the selected session issuer changes without a new account ID', async () => {
			provider = await createProvider({ authProvider: AuthProviderId.GitHubEnterprise });
			authService.setPermissiveGitHubSession(enterpriseSession('https://old.enterprise.com'));
			const eventPromise = Event.toPromise(provider.onDidChangeMcpServerDefinitions);
			authService.setPermissiveGitHubSession(enterpriseSession('https://new.enterprise.com'));
			await eventPromise;
		});

		test('does not fire for unrelated configuration changes', async () => {
			let eventFired = false;
			const handler = () => {
				eventFired = true;
			};
			const disposable = provider.onDidChangeMcpServerDefinitions(handler);

			await configService.setNonExtensionConfig('some.unrelated.config', 'value');

			await raceTimeout(Promise.resolve(), 50);

			expect(eventFired).toBe(false);
			disposable.dispose();
		});

		test('fires when readonly configuration changes', async () => {
			const eventPromise = Event.toPromise(provider.onDidChangeMcpServerDefinitions);

			await configService.setConfig(ConfigKey.GitHubMcpReadonly, true);

			await eventPromise;
		});

		test('fires when lockdown configuration changes', async () => {
			const eventPromise = Event.toPromise(provider.onDidChangeMcpServerDefinitions);

			await configService.setConfig(ConfigKey.GitHubMcpLockdown, true);

			await eventPromise;
		});

		test('fires when channel configuration changes', async () => {
			const eventPromise = Event.toPromise(provider.onDidChangeMcpServerDefinitions);

			await configService.setConfig(ConfigKey.GitHubMcpChannel, 'insiders');

			await eventPromise;
		});
	});

	describe('edge cases', () => {
		test('uses default toolsets value when not configured', () => {
			const definitions = provider.provideMcpServerDefinitions();
			expect(definitions).toHaveLength(1);
			expect(definitions[0].headers['X-MCP-Toolsets']).toBe('default');
			expect(definitions[0].version).toBe('default');
		});
	});

	describe('resolveMcpServerDefinition', () => {
		test('adds authorization header when permissive token is available', async () => {
			const definitions = provider.provideMcpServerDefinitions();
			const resolved = await provider.resolveMcpServerDefinition(definitions[0], CancellationToken.None);

			expect(resolved).toBeDefined();
			expect(resolved.headers['Authorization']).toBe('Bearer test-token');
		});

		test('throws when no permissive token is available and session cannot be created', async () => {
			const providerWithoutToken = await createProvider({ hasPermissiveToken: false });
			const definitions = providerWithoutToken.provideMcpServerDefinitions();

			// Since the mock returns undefined and the implementation uses session!.accessToken,
			// this will throw when trying to access accessToken on undefined
			await expect(providerWithoutToken.resolveMcpServerDefinition(definitions[0], CancellationToken.None)).rejects.toThrow();
		});
	});

	describe('authentication change events', () => {
		test('a token refresh for the same public account does not invalidate the definition', async () => {
			const definition = provider.provideMcpServerDefinitions()[0];
			let events = 0;
			disposables.add(provider.onDidChangeMcpServerDefinitions(() => events++));
			const session = authService.permissiveGitHubSession!;
			authService.setPermissiveGitHubSession({ ...session, accessToken: 'refreshed-token' });
			const resolved = await provider.resolveMcpServerDefinition(definition, CancellationToken.None);
			expect([events, resolved.uri.toString(), resolved.headers.Authorization]).toEqual([0, 'https://api.githubcopilot.com/mcp/', 'Bearer refreshed-token']);
		});

		test('fires onDidChangeMcpServerDefinitions when token becomes available', async () => {
			const providerWithoutToken = await createProvider({ hasPermissiveToken: false });
			const eventPromise = Event.toPromise(providerWithoutToken.onDidChangeMcpServerDefinitions);

			authService.setPermissiveGitHubSession({ accessToken: 'new-token', id: 'new-id', account: { id: 'new-account', label: 'new' }, scopes: [], authorizationServer: URI.parse('https://github.com/login/oauth') });

			await eventPromise;
		});

		test('fires onDidChangeMcpServerDefinitions when token is removed', async () => {
			const eventPromise = Event.toPromise(provider.onDidChangeMcpServerDefinitions);

			authService.setPermissiveGitHubSession(undefined);

			await eventPromise;
		});

		test.each([AuthProviderId.GitHub, AuthProviderId.GitHubEnterprise])('does not rebind a %s definition when accounts change on the same issuer', async authProvider => {
			provider = await createProvider({ authProvider });
			const definition = provider.provideMcpServerDefinitions()[0];
			let events = 0;
			disposables.add(provider.onDidChangeMcpServerDefinitions(() => events++));
			const updated = {
				...authService.permissiveGitHubSession!,
				id: 'different-id',
				accessToken: 'different-token',
				account: { id: 'different-account', label: 'different' },
			};
			authService.setPermissiveGitHubSession(updated);
			authService.setAnyGitHubSession({ ...updated, account: { id: 'minimal-account', label: 'minimal' } });
			const resolved = await provider.resolveMcpServerDefinition(definition, CancellationToken.None);
			expect({
				events,
				versionChanged: definition.version !== provider.provideMcpServerDefinitions()[0].version,
				authorization: resolved.headers.Authorization,
				permissionRequests: authService.permissionRequests,
			}).toEqual({ events: 0, versionChanged: false, authorization: `Bearer ${updated.accessToken}`, permissionRequests: [] });
		});
	});

	describe('enterprise session binding', () => {
		const hosts = ['https://first.ghe.com', 'https://second.ghe.com'];

		test('uses session provenance with no configured host and ignores disagreeing provider settings', async () => {
			provider = await createProvider({ authProvider: AuthProviderId.GitHubEnterprise });
			authService.setPermissiveGitHubSession(enterpriseSession(hosts[1]));
			const before = provider.provideMcpServerDefinitions();
			let changes = 0;
			disposables.add(provider.onDidChangeMcpServerDefinitions(() => changes++));
			await configService.setNonExtensionConfig('github-enterprise.uri', hosts[0]);
			const after = provider.provideMcpServerDefinitions();
			const resolved = await provider.resolveMcpServerDefinition(after[0], CancellationToken.None);
			expect([before[0].uri.toString(), after[0].uri.toString(), resolved.headers.Authorization, changes]).toEqual([
				'https://copilot-api.second.ghe.com/mcp/',
				'https://copilot-api.second.ghe.com/mcp/',
				`Bearer token-${hosts[1]}`,
				0,
			]);
		});

		test('publishes no guessed enterprise definition before a session is selected', async () => {
			provider = await createProvider({ authProvider: AuthProviderId.GitHubEnterprise, hasPermissiveToken: false });
			expect(provider.provideMcpServerDefinitions()).toEqual([]);
		});

		test.each([
			{ hosts },
			{ hosts: ['https://first.ghe.com/Second', 'https://first.ghe.com/First'] },
		])('does not leak a token into a stale issuer definition: $hosts', async ({ hosts }) => {
			provider = await createProvider({ authProvider: AuthProviderId.GitHubEnterprise });
			authService.setPermissiveGitHubSession(enterpriseSession(hosts[1]));
			const stale = provider.provideMcpServerDefinitions()[0];
			authService.setPermissiveGitHubSession(enterpriseSession(hosts[0]));
			await expect(provider.resolveMcpServerDefinition(stale, CancellationToken.None)).rejects.toThrow('Refresh the GitHub MCP server definition');
			const current = provider.provideMcpServerDefinitions()[0];
			const resolved = await provider.resolveMcpServerDefinition(current, CancellationToken.None);
			expect([stale.headers.Authorization, resolved.uri.toString(), resolved.headers.Authorization, stale.version === current.version]).toEqual([
				undefined, 'https://copilot-api.first.ghe.com/mcp/', `Bearer token-${hosts[0]}`, false,
			]);
		});

		test('rejects a switch that occurs while requesting extra permissions', async () => {
			provider = await createProvider({ authProvider: AuthProviderId.GitHubEnterprise, hasPermissiveToken: false });
			authService.setAnyGitHubSession(enterpriseSession(hosts[1]));
			const stale = provider.provideMcpServerDefinitions()[0];
			const pending = new DeferredPromise<AuthenticationSession>();
			authService.pendingSession = pending.p;
			const resolving = provider.resolveMcpServerDefinition(stale, CancellationToken.None);
			authService.setAnyGitHubSession(enterpriseSession(hosts[0]));
			authService.setPermissiveGitHubSession(enterpriseSession(hosts[0]));
			await pending.complete(enterpriseSession(hosts[1]));
			await expect(resolving).rejects.toThrow('Refresh the GitHub MCP server definition');
			expect({
				requests: authService.permissionRequests.map(options => [options.account?.id, options.authorizationServer?.toString()]),
				authorization: stale.headers.Authorization,
			}).toEqual({
				requests: [[undefined, `${hosts[1]}/login/oauth`]],
				authorization: undefined,
			});
		});

		test('keeps the baseline MCP path when the selected issuer has a path namespace', async () => {
			provider = await createProvider({ authProvider: AuthProviderId.GitHubEnterprise });
			authService.setPermissiveGitHubSession(enterpriseSession('https://enterprise.example/Deployment'));
			await configService.setNonExtensionConfig('github-enterprise.uri', 'https://configured.example/Deployment');
			expect(provider.provideMcpServerDefinitions()[0].uri.toString()).toBe('https://copilot-api.enterprise.example/mcp/');
		});

	});
});
