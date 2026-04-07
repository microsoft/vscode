/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, test } from 'vitest';
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
import { raceTimeout } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { GitHubMcpDefinitionProvider } from '../../common/githubMcpDefinitionProvider';

/**
 * Test implementation of authentication service that allows setting sessions dynamically
 */
class TestAuthenticationService extends BaseAuthenticationService {
	private readonly _onDidChange = new Emitter<void>();

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
		this.fireAuthenticationChange('setPermissiveGitHubSession');
	}

	override getGitHubSession(kind: 'permissive' | 'any', options: AuthenticationGetSessionOptions & { createIfNone: StrictAuthenticationPresentationOptions }): Promise<AuthenticationSession>;
	override getGitHubSession(kind: 'permissive' | 'any', options: AuthenticationGetSessionOptions & { forceNewSession: StrictAuthenticationPresentationOptions }): Promise<AuthenticationSession>;
	override getGitHubSession(kind: 'permissive' | 'any', options?: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
		if (kind === 'permissive') {
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
	let configService: InMemoryConfigurationService;
	let authService: TestAuthenticationService;
	let provider: GitHubMcpDefinitionProvider;

	/**
	 * Helper to create a provider with specific configuration values.
	 */
	async function createProvider(configOverrides?: {
		authProvider?: AuthProviderId;
		gheUri?: string;
		toolsets?: string[];
		readonly?: boolean;
		lockdown?: boolean;
		channel?: ConfigKey.GitHubMcpChannelValue;
		hasPermissiveToken?: boolean;
	}): Promise<GitHubMcpDefinitionProvider> {
		const serviceCollection = new TestingServiceCollection();
		configService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());

		// Set configuration values before creating the provider
		if (configOverrides?.authProvider) {
			await configService.setConfig(ConfigKey.Shared.AuthProvider, configOverrides.authProvider);
		}
		if (configOverrides?.gheUri) {
			await configService.setNonExtensionConfig('github-enterprise.uri', configOverrides.gheUri);
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
		const accessor = serviceCollection.createTestingAccessor();

		// Get the auth service and set up permissive token if needed
		authService = accessor.get(IAuthenticationService) as TestAuthenticationService;
		if (configOverrides?.hasPermissiveToken !== false) {
			authService.setPermissiveGitHubSession({ accessToken: 'test-token', id: 'test-id', account: { id: 'test-account', label: 'test' }, scopes: [] });
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
				gheUri
			});

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

		test('throws when GHE is configured but URI is missing', async () => {
			const gheProviderWithoutUri = await createProvider({
				authProvider: AuthProviderId.GitHubEnterprise
				// Don't set the GHE URI
			});

			expect(() => gheProviderWithoutUri.provideMcpServerDefinitions()).toThrow('GitHub Enterprise URI is not configured.');
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

		test('fires when GHE URI configuration changes', async () => {
			await configService.setConfig(ConfigKey.Shared.AuthProvider, AuthProviderId.GitHubEnterprise);
			await configService.setNonExtensionConfig('github-enterprise.uri', 'https://old.enterprise.com');

			const eventPromise = Event.toPromise(provider.onDidChangeMcpServerDefinitions);

			await configService.setNonExtensionConfig('github-enterprise.uri', 'https://new.enterprise.com');

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
		test('fires onDidChangeMcpServerDefinitions when token becomes available', async () => {
			const providerWithoutToken = await createProvider({ hasPermissiveToken: false });
			const eventPromise = Event.toPromise(providerWithoutToken.onDidChangeMcpServerDefinitions);

			authService.setPermissiveGitHubSession({ accessToken: 'new-token', id: 'new-id', account: { id: 'new-account', label: 'new' }, scopes: [] });

			await eventPromise;
		});

		test('fires onDidChangeMcpServerDefinitions when token is removed', async () => {
			const eventPromise = Event.toPromise(provider.onDidChangeMcpServerDefinitions);

			authService.setPermissiveGitHubSession(undefined);

			await eventPromise;
		});

		test('does not fire when token changes but availability remains the same', async () => {
			let eventFired = false;
			const handler = () => {
				eventFired = true;
			};
			const disposable = provider.onDidChangeMcpServerDefinitions(handler);

			// Change the token value but keep it defined
			authService.setPermissiveGitHubSession({ accessToken: 'different-token', id: 'different-id', account: { id: 'different-account', label: 'different' }, scopes: [] });

			await raceTimeout(Promise.resolve(), 50);

			expect(eventFired).toBe(false);
			disposable.dispose();
		});
	});
});
