/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { AgentHostAuthenticationRecovery, AgentHostAuthTokenCache } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostAuth.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { type IRemoteAgentHostConnectionInfo, type IRemoteAgentHostEntry, getEntryAddress, RemoteAgentHostEntryType } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { AuthRequiredReason, NotificationType, type INotification } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { type ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { type AgentInfo, type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { type IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { getSingletonServiceDescriptors } from '../../../../../../platform/instantiation/common/extensions.js';
import { ICloudSandboxAgentHostService, ICloudSandboxApiService } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { type IChatSessionsExtensionPoint } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IAuthenticationService } from '../../../../../../workbench/services/authentication/common/authentication.js';
import { RemoteAgentHostContribution } from '../../../../../../workbench/contrib/chat/browser/remoteAgentHost/remoteAgentHostChatContribution.js';
import { IRemoteAgentHostAuthenticationService, RemoteAgentHostAuthenticationService } from '../../../../../../workbench/contrib/chat/browser/remoteAgentHost/remoteAgentHostAuthentication.js';
import { RemoteAgentHostLogForwarder } from '../../../../../../workbench/contrib/chat/browser/remoteAgentHost/remoteAgentHostLogForwarder.js';
import { CloudSandboxApiService } from '../../../../../../workbench/contrib/chat/browser/remoteAgentHost/cloudSandboxApiService.js';
import { CloudSandboxAgentHostService } from '../../../../../../workbench/contrib/chat/browser/remoteAgentHost/cloudSandboxAgentHostService.js';
import { SSHAgentHostContribution } from '../../browser/sshAgentHost.contribution.js';
import { WebSocketAgentHostContribution } from '../../browser/webSocketAgentHost.contribution.js';
import '../../browser/remoteAgentHost.contribution.js';

interface IRemoteAuthenticationState {
	readonly authTokenCache: AgentHostAuthTokenCache;
	readonly authRecovery: AgentHostAuthenticationRecovery;
	readonly authenticationPending: ISettableObservable<boolean>;
}

interface IRemoteAuthNotificationHarness {
	_connections: Map<string, IRemoteAuthenticationState>;
	_instantiationService: TestInstantiationService;
	_connectionCustomizations: { get(address: string): { readonly authenticate?: (request: { readonly resource: string; readonly scopes?: readonly string[]; readonly token: string }) => Promise<{ readonly resource: string; readonly scopes?: readonly string[]; readonly token: string }> } | undefined };
	_logService: NullLogService;
	_handleAuthenticationRequiredNotification(address: string, connection: Pick<IAgentConnection, 'authenticate'>, notification: INotification): void;
}

interface IRemoteAuthenticationHarness extends IRemoteAuthNotificationHarness {
	_connections: Map<string, IRemoteAuthenticationState & IDisposable>;
	_remoteAgentHostService: { getConnection(address: string): IAgentConnection | undefined };
	_agentHostFileSystemService: { registerAuthority(authority: string, connection: IAgentConnection): IDisposable };
	_getScenarioAutomationToken(): string | undefined;
	_setupConnection(connection: IRemoteAgentHostConnectionInfo): void;
	_authenticateWithConnection(address: string, connection: IAgentConnection, agents: readonly AgentInfo[]): Promise<void>;
}

function createAuthenticationHarness(store: Pick<DisposableStore, 'add'>) {
	const address = 'cloudsandbox:authentication-test';
	const authenticationService = new RemoteAgentHostAuthenticationService();
	const pending = store.add(authenticationService.acquire(address)).object;
	const instantiationService = store.add(new TestInstantiationService());
	instantiationService.stub(IRemoteAgentHostAuthenticationService, authenticationService);
	instantiationService.stub(ITelemetryService, NullTelemetryService);
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IAuthenticationService, {
		getOrActivateProviderIdForServer: async () => 'test-provider',
		getSessions: async () => [{ id: 'session-id', account: { id: 'account-id', label: 'Test Account' }, scopes: ['session:read'], accessToken: 'session-token' }],
	});
	instantiationService.stubInstance(RemoteAgentHostLogForwarder, Disposable.None);
	const contribution = Object.create(RemoteAgentHostContribution.prototype) as IRemoteAuthenticationHarness;
	contribution._connections = new Map();
	contribution._instantiationService = instantiationService;
	contribution._connectionCustomizations = { get: () => undefined };
	contribution._agentHostFileSystemService = { registerAuthority: () => Disposable.None };
	contribution._logService = new NullLogService();
	contribution._getScenarioAutomationToken = () => undefined;
	const resource: ProtectedResourceMetadata = {
		resource: 'https://api.example.com/session',
		authorization_servers: ['https://auth.example.com'],
		scopes_supported: ['session:read'],
	};
	const agents: AgentInfo[] = [{ provider: 'copilot', displayName: 'Copilot', description: '', models: [], protectedResources: [resource] }];

	return {
		address, contribution, pending, resource, agents,
		connect: (authenticate: IAgentConnection['authenticate'] = async () => ({ authenticated: true })) => {
			contribution._connections.get(address)?.dispose();
			const connection = new class extends mock<IAgentConnection>() {
				override readonly rootState = upcastPartial<IAgentSubscription<RootState>>({ value: undefined, onDidChange: Event.None });
				override readonly onDidNotification = Event.None;
				override authenticate = authenticate;
			}();
			contribution._remoteAgentHostService = { getConnection: () => connection };
			contribution._setupConnection(upcastPartial<IRemoteAgentHostConnectionInfo>({ address }));
			store.add(contribution._connections.get(address)!);
			return connection;
		},
	};
}

suite('RemoteAgentHost connection authentication readiness', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('resets a retained session list readiness before authenticating a replacement connection', async () => {
		const h = createAuthenticationHarness(store);
		const first = h.connect();
		await h.contribution._authenticateWithConnection(h.address, first, []);
		const firstSettled = h.pending.get();
		const replacement = h.connect();
		const replacementPending = h.pending.get();
		await h.contribution._authenticateWithConnection(h.address, replacement, []);

		assert.deepStrictEqual({ firstSettled, replacementPending, replacementSettled: h.pending.get() }, {
			firstSettled: false, replacementPending: true, replacementSettled: false,
		});
	});

	test('an old initial authentication pass cannot settle a replacement connection', async () => {
		const h = createAuthenticationHarness(store);
		const started = new DeferredPromise<void>();
		const authentication = new DeferredPromise<void>();
		const first = h.connect(async () => {
			await started.complete();
			await authentication.p;
			return { authenticated: true };
		});
		const previousPass = h.contribution._authenticateWithConnection(h.address, first, h.agents);
		await started.p;
		const replacement = h.connect();
		await authentication.complete();
		await previousPass;
		const pendingAfterPreviousPass = h.pending.get();
		await h.contribution._authenticateWithConnection(h.address, replacement, []);

		assert.deepStrictEqual({ pendingAfterPreviousPass, pendingAfterCurrentPass: h.pending.get() }, {
			pendingAfterPreviousPass: true, pendingAfterCurrentPass: false,
		});
	});

	test('an old authentication notification cannot settle a replacement connection', async () => {
		const h = createAuthenticationHarness(store);
		const started = new DeferredPromise<void>();
		const authentication = new DeferredPromise<void>();
		const first = h.connect(async () => {
			await started.complete();
			await authentication.p;
			return { authenticated: true };
		});
		h.contribution._handleAuthenticationRequiredNotification(h.address, first, {
			type: NotificationType.AuthRequired, channel: 'ahp-root://', resource: h.resource, reason: AuthRequiredReason.Required,
		});
		await started.p;
		const replacement = h.connect();
		await authentication.complete();
		await timeout(0);
		const pendingAfterPreviousPass = h.pending.get();
		await h.contribution._authenticateWithConnection(h.address, replacement, []);

		assert.deepStrictEqual({ pendingAfterPreviousPass, pendingAfterCurrentPass: h.pending.get() }, {
			pendingAfterPreviousPass: true, pendingAfterCurrentPass: false,
		});
	});
});

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
		contribution._connections = new Map([[address, { authTokenCache: new AgentHostAuthTokenCache(), authRecovery: new AgentHostAuthenticationRecovery(NullTelemetryService), authenticationPending: observableValue('authenticationPending', false) }]]);
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
			['host-one', { authTokenCache: new AgentHostAuthTokenCache(), authRecovery: new AgentHostAuthenticationRecovery(NullTelemetryService), authenticationPending: observableValue('authenticationPending', false) }],
			['host-two', { authTokenCache: new AgentHostAuthTokenCache(), authRecovery: new AgentHostAuthenticationRecovery(NullTelemetryService), authenticationPending: observableValue('authenticationPending', false) }],
		]);
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
		contribution._connections = new Map([[address, { authTokenCache: new AgentHostAuthTokenCache(), authRecovery: new AgentHostAuthenticationRecovery(NullTelemetryService), authenticationPending: observableValue('authenticationPending', false) }]]);
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

interface IRemoteAgentRegistrationHarness {
	_connections: Map<string, {
		readonly agents: DisposableMap<string, DisposableStore>;
		readonly store: DisposableStore;
	}>;
	_chatSessionsService: {
		registerChatSessionContribution(contribution: IChatSessionsExtensionPoint): never;
	};
	_registerAgent(address: string, connection: IAgentConnection, agent: AgentInfo, configuredName: string | undefined): void;
}

suite('Remote agent host provider ownership', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('the Agents Window entry point loads the shared sandbox services', () => {
		const services = new Map(getSingletonServiceDescriptors());
		assert.deepStrictEqual([
			services.get(ICloudSandboxApiService)?.ctor,
			services.get(ICloudSandboxAgentHostService)?.ctor,
		], [CloudSandboxApiService, CloudSandboxAgentHostService]);
	});

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

suite('Remote Agent Host chat session contribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('advertises target-only delegation', () => {
		const address = 'test-host';
		const agent: AgentInfo = {
			provider: 'copilot',
			displayName: 'Copilot',
			description: 'test',
			models: [],
		};
		const connection = new class extends mock<IAgentConnection>() { }();
		const connectionStore = store.add(new DisposableStore());
		const agents = store.add(new DisposableMap<string, DisposableStore>());
		const harness = Object.create(RemoteAgentHostContribution.prototype) as IRemoteAgentRegistrationHarness;
		harness._connections = new Map([[address, { agents, store: connectionStore }]]);

		let registeredContribution: IChatSessionsExtensionPoint | undefined;
		harness._chatSessionsService = {
			registerChatSessionContribution: contribution => {
				registeredContribution = contribution;
				throw new Error('Stop after registering the chat session contribution');
			},
		};

		assert.throws(
			() => harness._registerAgent(address, connection, agent, 'Test Host'),
			/Stop after registering the chat session contribution/
		);
		assert.deepStrictEqual(registeredContribution && {
			type: registeredContribution.type,
			displayName: registeredContribution.displayName,
			canDelegate: registeredContribution.canDelegate,
			supportsDelegation: registeredContribution.supportsDelegation,
		}, {
			type: 'remote-test-host-copilot',
			displayName: 'Copilot [Test Host]',
			canDelegate: true,
			supportsDelegation: false,
		});
	});
});
