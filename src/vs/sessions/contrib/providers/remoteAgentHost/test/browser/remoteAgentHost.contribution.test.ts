/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { AgentHostAuthenticationRecovery, AgentHostAuthTokenCache } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostAuth.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { type IRemoteAgentHostEntry, getEntryAddress, RemoteAgentHostEntryType } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { AuthRequiredReason, NotificationType, type INotification } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { type ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IAuthenticationService } from '../../../../../../workbench/services/authentication/common/authentication.js';
import { RemoteAgentHostContribution } from '../../browser/remoteAgentHost.contribution.js';
import { SSHAgentHostContribution } from '../../browser/sshAgentHost.contribution.js';
import { WebSocketAgentHostContribution } from '../../browser/webSocketAgentHost.contribution.js';

interface IRemoteAuthNotificationHarness {
	_connections: Map<string, { readonly authTokenCache: AgentHostAuthTokenCache; readonly authRecovery: AgentHostAuthenticationRecovery }>;
	_sessionsProvidersService: { getProvider(): undefined };
	_instantiationService: TestInstantiationService;
	_connectionCustomizations: { get(address: string): { readonly authenticate?: (request: { readonly resource: string; readonly scopes?: readonly string[]; readonly token: string }) => Promise<{ readonly resource: string; readonly scopes?: readonly string[]; readonly token: string }> } | undefined };
	_logService: NullLogService;
	_handleAuthenticationRequiredNotification(address: string, connection: Pick<IAgentConnection, 'authenticate'>, notification: INotification): void;
}

suite('RemoteAgentHost auth notifications', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('resends the current token for an expired notification resource that is not advertised by root agents', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, {
			getOrActivateProviderIdForServer: async () => 'test-provider',
			getSessions: async () => [{
				id: 'session-id',
				account: { id: 'account-id', label: 'Test Account' },
				scopes: ['session:read'],
				accessToken: 'session-token',
			}],
		});
		const logService = new NullLogService();
		instantiationService.stub(ILogService, logService);
		const authenticateCalls: Array<{ readonly resource: string; readonly scopes?: readonly string[]; readonly token: string }> = [];
		const connection = {
			authenticate: async (params: { readonly resource: string; readonly scopes?: readonly string[]; readonly token: string }) => {
				authenticateCalls.push(params);
				return { authenticated: true };
			},
		};
		const address = 'test-host';
		const contribution = Object.create(RemoteAgentHostContribution.prototype) as IRemoteAuthNotificationHarness;
		contribution._connections = new Map([[address, { authTokenCache: new AgentHostAuthTokenCache(), authRecovery: new AgentHostAuthenticationRecovery() }]]);
		contribution._sessionsProvidersService = { getProvider: () => undefined };
		contribution._instantiationService = instantiationService;
		contribution._connectionCustomizations = { get: () => undefined };
		contribution._logService = logService;
		const resource: ProtectedResourceMetadata = {
			resource: 'https://api.example.com/session',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['session:read'],
		};
		const notification: INotification = {
			type: NotificationType.AuthRequired,
			channel: 'ahp-root://',
			resource,
			reason: AuthRequiredReason.Expired,
		};

		contribution._handleAuthenticationRequiredNotification(address, connection, notification);
		await timeout(0);

		assert.deepStrictEqual(authenticateCalls, [{
			resource: 'https://api.example.com/session',
			scopes: ['session:read'],
			token: 'session-token',
		}]);
	});

	test('reauthenticates each host independently with the same current token', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, {
			getOrActivateProviderIdForServer: async () => 'test-provider',
			getSessions: async () => [{ id: 'session-id', account: { id: 'account-id', label: 'Test Account' }, scopes: ['session:read'], accessToken: 'session-token' }],
		});
		instantiationService.stub(ILogService, new NullLogService());
		const calls: string[] = [];
		const contribution = Object.create(RemoteAgentHostContribution.prototype) as IRemoteAuthNotificationHarness;
		contribution._connections = new Map([
			['host-one', { authTokenCache: new AgentHostAuthTokenCache(), authRecovery: new AgentHostAuthenticationRecovery() }],
			['host-two', { authTokenCache: new AgentHostAuthTokenCache(), authRecovery: new AgentHostAuthenticationRecovery() }],
		]);
		contribution._sessionsProvidersService = { getProvider: () => undefined };
		contribution._instantiationService = instantiationService;
		contribution._connectionCustomizations = { get: () => undefined };
		contribution._logService = new NullLogService();
		const resource: ProtectedResourceMetadata = {
			resource: 'https://api.example.com/session',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['session:read'],
		};
		const notification: INotification = { type: NotificationType.AuthRequired, channel: 'ahp-root://', resource, reason: AuthRequiredReason.Required };

		contribution._handleAuthenticationRequiredNotification('host-one', { authenticate: async request => { calls.push(`one:${request.token}`); return { authenticated: true }; } }, notification);
		contribution._handleAuthenticationRequiredNotification('host-two', { authenticate: async request => { calls.push(`two:${request.token}`); return { authenticated: true }; } }, notification);
		await timeout(0);

		assert.deepStrictEqual(calls, ['one:session-token', 'two:session-token']);
	});

	test('prompts on a second completed same-token challenge and creates a fresh transformed envelope', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, {
			getOrActivateProviderIdForServer: async () => 'test-provider',
			getSessions: async () => [{ id: 'session-id', account: { id: 'account-id', label: 'Test Account' }, scopes: ['session:read'], accessToken: 'session-token' }],
		});
		instantiationService.stub(ILogService, new NullLogService());
		let promptCount = 0;
		instantiationService.stub(ICommandService, {
			executeCommand: async <R>() => {
				promptCount++;
				return { success: true } as R;
			},
		});
		const envelopes: string[] = [];
		let envelopeNumber = 0;
		const address = 'sealed-host';
		const contribution = Object.create(RemoteAgentHostContribution.prototype) as IRemoteAuthNotificationHarness;
		contribution._connections = new Map([[address, { authTokenCache: new AgentHostAuthTokenCache(), authRecovery: new AgentHostAuthenticationRecovery() }]]);
		contribution._sessionsProvidersService = { getProvider: () => undefined };
		contribution._instantiationService = instantiationService;
		contribution._connectionCustomizations = {
			get: () => ({
				authenticate: async request => ({ ...request, token: `${request.token}:sealed-${++envelopeNumber}` }),
			}),
		};
		contribution._logService = new NullLogService();
		const resource: ProtectedResourceMetadata = {
			resource: 'https://api.example.com/session',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['session:read'],
		};
		const notification: INotification = { type: NotificationType.AuthRequired, channel: 'ahp-root://', resource, reason: AuthRequiredReason.Expired };
		const connection: Pick<IAgentConnection, 'authenticate'> = { authenticate: async request => { envelopes.push(request.token); return { authenticated: true }; } };

		contribution._handleAuthenticationRequiredNotification(address, connection, notification);
		await timeout(0);
		contribution._handleAuthenticationRequiredNotification(address, connection, notification);
		await timeout(0);

		assert.deepStrictEqual({ envelopes, promptCount }, {
			envelopes: ['session-token:sealed-1', 'session-token:sealed-2'],
			promptCount: 1,
		});
	});
});

interface IProviderOwnerHarness {
	_configurationService: { getValue(key: string): boolean };
	_remoteAgentHostService: { readonly configuredEntries: readonly IRemoteAgentHostEntry[] };
	_entryType: RemoteAgentHostEntryType;
	_providerStores: Map<string, undefined> & { deleteAndDispose(address: string): void };
	_providerInstances: Map<string, { readonly label: string }>;
	_createProvider(address: string): void;
	_getProviderOptions(entry: IRemoteAgentHostEntry): object;
	_reconcileProviders(): void;
}

suite('Remote agent host provider ownership', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('gives WebSocket and SSH entries distinct owners while the shared contribution registers none', () => {
		const entries: IRemoteAgentHostEntry[] = [
			{ name: 'Tunnel', connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: 'my-tunnel', clusterId: 'usw2' } },
			{ name: 'WSL', connection: { type: RemoteAgentHostEntryType.WSL, address: 'wsl:Ubuntu-24.04', distro: 'Ubuntu-24.04' } },
			{ name: 'Sandbox', connection: { type: RemoteAgentHostEntryType.CloudSandbox, address: 'cloudsandbox:abc', environmentId: 'abc' } },
			{ name: 'Dev Container', connection: { type: RemoteAgentHostEntryType.DevContainer, address: 'devcontainer:abc', hostPath: '/repo' } },
			{ name: 'Socket', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'ws://host:8080' } },
			{ name: 'Remote', connection: { type: RemoteAgentHostEntryType.SSH, address: 'localhost:4321', sshConfigHost: 'myserver', hostName: 'myserver' } },
		];
		const createHarness = (prototype: object, entryType: RemoteAgentHostEntryType): IProviderOwnerHarness => {
			const contribution = Object.create(prototype) as IProviderOwnerHarness;
			contribution._configurationService = { getValue: () => true };
			contribution._remoteAgentHostService = { configuredEntries: entries };
			contribution._entryType = entryType;
			const providerStores = new Map<string, undefined>();
			contribution._providerStores = Object.assign(providerStores, {
				deleteAndDispose: (address: string) => { providerStores.delete(address); },
			});
			contribution._providerInstances = new Map();
			return contribution;
		};
		const sshCreated: string[] = [];
		const sshContribution = createHarness(SSHAgentHostContribution.prototype, RemoteAgentHostEntryType.SSH);
		sshContribution._getProviderOptions = entry => { sshCreated.push(getEntryAddress(entry)); return {}; };
		sshContribution._createProvider = () => { };
		sshContribution._reconcileProviders();
		const webSocketCreated: string[] = [];
		const webSocketContribution = createHarness(WebSocketAgentHostContribution.prototype, RemoteAgentHostEntryType.WebSocket);
		webSocketContribution._getProviderOptions = entry => { webSocketCreated.push(getEntryAddress(entry)); return {}; };
		webSocketContribution._createProvider = () => { };
		webSocketContribution._reconcileProviders();

		assert.deepStrictEqual({
			sharedProviderMethods: Object.getOwnPropertyNames(RemoteAgentHostContribution.prototype)
				.filter(member => member === '_createProvider' || member === '_reconcileProviders'),
			sshCreated,
			webSocketCreated,
		}, {
			sharedProviderMethods: [],
			sshCreated: ['localhost:4321'],
			webSocketCreated: ['ws://host:8080'],
		});
	});
});
