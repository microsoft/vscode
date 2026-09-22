/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchMcpGatewayService } from '../../../contrib/mcp/common/mcpGatewayService.js';
import { IMcpHostDelegate, IMcpRegistry } from '../../../contrib/mcp/common/mcpRegistryTypes.js';
import { McpCollectionDefinition, McpCollectionSortOrder, McpConnectionState, McpServerDefinition, McpServerLaunch, McpServerTransportType, McpServerTrust, mcpOAuthClientSecretStorageKey } from '../../../contrib/mcp/common/mcpTypes.js';
import { mcpEnterpriseManagedAuthIdpSection } from '../../../contrib/mcp/common/mcpConfiguration.js';
import { IAuthenticationMcpAccessService } from '../../../services/authentication/browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpService } from '../../../services/authentication/browser/authenticationMcpService.js';
import { IAuthenticationMcpUsageService } from '../../../services/authentication/browser/authenticationMcpUsageService.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationGetSessionsOptions, IAuthenticationProvider, IAuthenticationService, IAuthenticationWwwAuthenticateRequest } from '../../../services/authentication/common/authentication.js';
import { IDynamicAuthenticationProviderStorageService } from '../../../services/authentication/common/dynamicAuthenticationProviderStorage.js';
import { TestExtensionService } from '../../../test/common/workbenchTestServices.js';
import { IMcpServerAuthContext, MainThreadMcp, McpServerAuthTracker } from '../../browser/mainThreadMcp.js';
import { ExtHostMcpShape, IMcpAuthenticationDetails } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadMcp - McpServerAuthTracker', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Builds a representative auth context. Defaults model a tenant-specific Entra sign-in so tests
	 * assert that the authorization server / resource survive tracking (the values that were dropped
	 * on re-validation in #324925).
	 */
	function ctx(overrides: Partial<IMcpServerAuthContext> = {}): IMcpServerAuthContext {
		return {
			authorizationServer: URI.parse('https://login.microsoftonline.com/11111111-1111-1111-1111-111111111111'),
			clientId: 'client-a',
			resource: 'api://33333333-3333-3333-3333-333333333333',
			audience: undefined,
			...overrides,
		};
	}

	test('retains the full auth context per tracked server and groups by provider', () => {
		const tracker = new McpServerAuthTracker();
		const first = ctx();
		const second = ctx({
			clientId: 'client-b',
			authorizationServer: URI.parse('https://login.microsoftonline.com/22222222-2222-2222-2222-222222222222'),
		});

		tracker.track('microsoft', 1, ['scope.a'], first);
		tracker.track('microsoft', 2, ['scope.b'], second);

		assert.deepStrictEqual(tracker.get('microsoft'), [
			{ serverId: 1, scopes: ['scope.a'], context: first },
			{ serverId: 2, scopes: ['scope.b'], context: second },
		]);
	});

	test('re-tracking the same server replaces its context without duplicating', () => {
		const tracker = new McpServerAuthTracker();
		tracker.track('microsoft', 1, ['scope.a'], ctx());
		const updated = ctx({ authorizationServer: URI.parse('https://login.microsoftonline.com/44444444-4444-4444-4444-444444444444') });
		tracker.track('microsoft', 1, ['scope.a'], updated);

		assert.deepStrictEqual(tracker.get('microsoft'), [
			{ serverId: 1, scopes: ['scope.a'], context: updated },
		]);
	});

	test('untrack removes a server across every provider and drops empty provider buckets', () => {
		const tracker = new McpServerAuthTracker();
		tracker.track('microsoft', 1, ['scope.a'], ctx());
		tracker.track('github', 1, ['repo'], ctx({ authorizationServer: undefined, resource: undefined }));
		tracker.track('microsoft', 2, ['scope.b'], ctx());

		tracker.untrack(1);

		assert.strictEqual(tracker.get('github'), undefined, 'empty provider bucket is removed');
		assert.deepStrictEqual(tracker.get('microsoft'), [
			{ serverId: 2, scopes: ['scope.b'], context: ctx() },
		]);
	});

	test('clear removes all tracking', () => {
		const tracker = new McpServerAuthTracker();
		tracker.track('microsoft', 1, ['scope.a'], ctx());
		tracker.clear();

		assert.strictEqual(tracker.get('microsoft'), undefined);
	});
});

suite('MainThreadMcp - launch', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards the definition default cwd to the extension host', () => {
		let startOptions: Parameters<ExtHostMcpShape['$startMcp']>[1] | undefined;
		const proxy: Partial<ExtHostMcpShape> = {
			$startMcp(_id, options) {
				startOptions = options;
			},
			$stopMcp() { },
			$sendMessage() { },
			$onDidChangeMcpServerDefinitions() { },
		};

		let capturedDelegate: IMcpHostDelegate | undefined;
		const mcpRegistry = new class extends mock<IMcpRegistry>() {
			override readonly collections = observableValue<readonly McpCollectionDefinition[]>('collections', []);
			override registerDelegate(delegate: IMcpHostDelegate) {
				capturedDelegate = delegate;
				return { dispose() { } };
			}
		};

		disposables.add(new MainThreadMcp(
			SingleProxyRPCProtocol(proxy),
			mcpRegistry,
			new class extends mock<IDialogService>() { },
			new class extends mock<IAuthenticationService>() {
				override readonly onDidChangeSessions = Event.None;
			},
			new class extends mock<IAuthenticationMcpService>() { },
			new class extends mock<IAuthenticationMcpAccessService>() { },
			new class extends mock<IAuthenticationMcpUsageService>() { },
			new class extends mock<IDynamicAuthenticationProviderStorageService>() { },
			new TestExtensionService(),
			new class extends mock<IContextKeyService>() { },
			new class extends mock<ITelemetryService>() { },
			new class extends mock<IWorkbenchMcpGatewayService>() { },
			new class extends mock<IConfigurationService>() { },
			new class extends mock<ISecretStorageService>() { },
		));

		const launch: McpServerLaunch = {
			type: McpServerTransportType.HTTP,
			uri: URI.parse('https://myserver.example/mcp'),
			headers: [],
		};
		const defaultCwd = URI.parse('vscode-remote://ssh-remote+linux/home/test/workspace');
		const serverDefinition: McpServerDefinition = {
			id: 'my-server',
			label: 'My Server',
			launch,
			defaultCwd,
			cacheNonce: 'nonce-1',
			variableReplacement: {
				folder: { uri: URI.file('/fallback'), name: 'fallback', index: 0 },
				target: ConfigurationTarget.WORKSPACE_FOLDER,
			},
		};
		const collection: McpCollectionDefinition = {
			remoteAuthority: 'ssh-remote+linux',
			id: 'collection-1',
			label: 'Collection',
			serverDefinitions: observableValue<readonly McpServerDefinition[]>('serverDefinitions', [serverDefinition]),
			trustBehavior: McpServerTrust.Kind.Trusted,
			scope: StorageScope.WORKSPACE,
			configTarget: ConfigurationTarget.WORKSPACE_FOLDER,
			order: McpCollectionSortOrder.WorkspaceFolder,
		};

		assert.ok(capturedDelegate);
		capturedDelegate.start(collection, serverDefinition, launch, {});
		assert.ok(startOptions?.defaultCwd);
		assert.strictEqual(URI.revive(startOptions.defaultCwd).toString(), defaultCwd.toString());
	});
});

suite('MainThreadMcp - re-validation', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function assertRevalidationContext(enterpriseManaged: boolean, clientId: string | undefined): Promise<void> {
		const authorizationServer = URI.parse('https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47');
		const configuredIssuer = URI.parse('https://sso.example/issuer');
		const resource = 'https://resource.example/mcp';
		const serverUrl = 'https://myserver.example/mcp';
		const audience = enterpriseManaged ? 'https://resource-as.example' : undefined;
		const secretStorageKey = clientId ? mcpOAuthClientSecretStorageKey(enterpriseManaged ? resource : serverUrl, clientId) : undefined;
		const secrets = new Map<string, string>();
		if (secretStorageKey) {
			secrets.set(secretStorageKey, 'original-secret');
		}
		const secretStorageReads: string[] = [];
		const session: AuthenticationSession = {
			id: 'session-1',
			accessToken: 'access-token',
			account: { id: 'account-1', label: 'user@contoso.com' },
			scopes: ['scope.read'],
		};

		const getSessionsOptions: Array<IAuthenticationGetSessionsOptions | undefined> = [];
		let revalidated = new DeferredPromise<void>();

		const onDidChangeSessions = disposables.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());

		const authenticationService = new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override async getOrActivateProviderIdForServer(): Promise<string | undefined> {
				return 'test-provider';
			}
			override async createOrGetXaaProvider(): Promise<string | undefined> {
				return 'test-provider';
			}
			override isDynamicAuthenticationProvider(): boolean {
				return false;
			}
			override getProvider(id: string): IAuthenticationProvider {
				return new class extends mock<IAuthenticationProvider>() {
					override readonly id = id;
					override readonly label = 'Test Provider';
					override readonly supportsMultipleAccounts = false;
				};
			}
			override async getSessions(_id: string, _scopes?: ReadonlyArray<string> | IAuthenticationWwwAuthenticateRequest, options?: IAuthenticationGetSessionsOptions): Promise<ReadonlyArray<AuthenticationSession>> {
				getSessionsOptions.push(options);
				if (getSessionsOptions.length > 1) {
					revalidated.complete();
				}
				return [session];
			}
		};

		const proxy: Partial<ExtHostMcpShape> = {
			$startMcp() { },
			$stopMcp() { },
			$sendMessage() { },
			$onDidChangeMcpServerDefinitions() { },
		};

		let capturedDelegate: IMcpHostDelegate | undefined;
		const mcpRegistry = new class extends mock<IMcpRegistry>() {
			override readonly collections = observableValue<readonly McpCollectionDefinition[]>('collections', []);
			override registerDelegate(delegate: IMcpHostDelegate) {
				capturedDelegate = delegate;
				return { dispose() { } };
			}
		};
		const configurationService = new TestConfigurationService({
			[mcpEnterpriseManagedAuthIdpSection]: { issuer: configuredIssuer.toString(true) }
		});
		disposables.add(configurationService.onDidChangeConfigurationEmitter);

		const mainThreadMcp = disposables.add(new MainThreadMcp(
			SingleProxyRPCProtocol(proxy),
			mcpRegistry,
			new class extends mock<IDialogService>() { },
			authenticationService,
			new class extends mock<IAuthenticationMcpService>() {
				override getAccountPreference(): string | undefined { return undefined; }
			},
			new class extends mock<IAuthenticationMcpAccessService>() {
				override isAccessAllowedForUrl(): boolean { return true; }
			},
			new class extends mock<IAuthenticationMcpUsageService>() {
				override addAccountUsage(): void { }
			},
			new class extends mock<IDynamicAuthenticationProviderStorageService>() { },
			new TestExtensionService(),
			new class extends mock<IContextKeyService>() { },
			new class extends mock<ITelemetryService>() { },
			new class extends mock<IWorkbenchMcpGatewayService>() { },
			configurationService,
			new class extends mock<ISecretStorageService>() {
				override async get(key: string): Promise<string | undefined> {
					secretStorageReads.push(key);
					return secrets.get(key);
				}
			},
		));

		// Register a running HTTP server via the host delegate (the only path into the private maps).
		const launch: McpServerLaunch = { type: McpServerTransportType.HTTP, uri: URI.parse(serverUrl), headers: [] };
		const serverDefinition: McpServerDefinition = { id: 'my-server', label: 'My Server', launch, cacheNonce: 'nonce-1' };
		const collection: McpCollectionDefinition = {
			remoteAuthority: null,
			id: 'collection-1',
			label: 'Collection',
			serverDefinitions: observableValue<readonly McpServerDefinition[]>('serverDefinitions', [serverDefinition]),
			trustBehavior: McpServerTrust.Kind.Trusted,
			scope: StorageScope.WORKSPACE,
			configTarget: ConfigurationTarget.USER,
			order: McpCollectionSortOrder.Extension,
		};
		assert.ok(capturedDelegate, 'the MCP host delegate is registered');
		capturedDelegate.start(collection, serverDefinition, launch, {});
		mainThreadMcp.$onDidChangeState(1, { state: McpConnectionState.Kind.Running });

		const authDetails: IMcpAuthenticationDetails = {
			authorizationServer,
			authorizationServerMetadata: { issuer: authorizationServer.toString(), response_types_supported: ['code'], scopes_supported: ['scope.read'] },
			resourceMetadata: { resource, scopes_supported: ['scope.read'], authorization_servers: ['https://resource-as.example'] },
			scopes: ['scope.read'],
			clientId,
			enterpriseManaged,
		};
		await mainThreadMcp.$getTokenFromServerMetadata(1, authDetails, {});

		for (const secret of ['rotated-secret', undefined]) {
			if (secretStorageKey) {
				if (secret === undefined) {
					secrets.delete(secretStorageKey);
				} else {
					secrets.set(secretStorageKey, secret);
				}
			}
			revalidated = new DeferredPromise<void>();
			onDidChangeSessions.fire({ providerId: 'test-provider', label: 'Test Provider', event: { added: undefined, removed: undefined, changed: undefined } });
			await revalidated.p;
		}

		const expectedSecrets = clientId ? ['original-secret', 'rotated-secret', undefined] : [undefined, undefined, undefined];
		assert.deepStrictEqual({ getSessionsOptions, secretStorageReads }, {
			getSessionsOptions: expectedSecrets.map((clientSecret, index) => ({
				authorizationServer: enterpriseManaged ? configuredIssuer : authorizationServer,
				clientId,
				clientSecret,
				resource,
				audience,
				silent: index > 0,
			})),
			secretStorageReads: secretStorageKey ? [secretStorageKey, secretStorageKey, secretStorageKey] : [],
		});
	}

	test('replays the tracked auth context with a rotated or removed client secret (#324925)', async () => {
		await assertRevalidationContext(false, 'client-abc');
	});

	test('replays XAA resource auth context with a rotated or removed client secret', async () => {
		await assertRevalidationContext(true, 'resource-client');
	});

	test('revalidates clients without a secret-storage key without reading secret storage', async () => {
		await assertRevalidationContext(false, undefined);
	});
});
