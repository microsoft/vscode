/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import type { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import type { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { IConfirmation, IDialogService } from '../../../dialogs/common/dialogs.js';
import { INotificationService, Severity, type INotification, type INotificationHandle } from '../../../notification/common/notification.js';
import { TestNotificationService } from '../../../notification/test/common/testNotificationService.js';
import { IProductService } from '../../../product/common/productService.js';

import { ISharedProcessService } from '../../../ipc/electron-browser/services.js';
import { IQuickInputService } from '../../../quickinput/common/quickInput.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../common/remoteAgentHostService.js';
import type { IAgentConnection } from '../../common/agentService.js';
import { AHP_UNSUPPORTED_PROTOCOL_VERSION, ProtocolError } from '../../common/state/sessionProtocol.js';
import { IRemoteAgentHostLocationPreferenceService, type RemoteAgentHostLocationPreference } from '../../common/remoteAgentHostLocationPreference.js';
import { ISSHHostKeyTrustService } from '../../common/sshHostKeyTrust.js';
import { SSHHostKeyTrustService } from '../../browser/sshHostKeyTrustService.js';
import { InMemoryStorageService } from '../../../storage/common/storage.js';
import type {
	ISSHAgentHostConfig,
	ISSHConnectResult,
	ISSHEndpointCandidate,
	ISSHEndpointSelection,
	ISSHEndpointSelectionRequest,
	ISSHHostKeyVerificationRequest,
	ISSHHostKeysAnnouncement,
	ISSHKeyboardInteractiveRequest,
	ISSHResolvedConfig,
	ISSHRemoteAgentHostMainService,
} from '../../common/sshRemoteAgentHost.js';
import type { IRelayMessage } from '../../common/relayTransport.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import { ISSHRelayClientFactory, SSHRemoteAgentHostService } from '../../electron-browser/sshRemoteAgentHostServiceImpl.js';
import { RemoteAgentHostProtocolClient } from '../../browser/remoteAgentHostProtocolClient.js';

/**
 * In-renderer mock of the shared-process SSH service. Exposes the same
 * surface that the renderer accesses through ProxyChannel, plus a small
 * test API to drive close events and inspect calls.
 */
class MockSSHMainService {
	private readonly _onDidChangeConnections = new Emitter<void>();
	readonly onDidChangeConnections = this._onDidChangeConnections.event;

	private readonly _onDidCloseConnection = new Emitter<string>();
	readonly onDidCloseConnection = this._onDidCloseConnection.event;

	private readonly _onDidReportConnectProgress = new Emitter<{ connectionKey: string; message: string }>();
	readonly onDidReportConnectProgress = this._onDidReportConnectProgress.event;

	private readonly _onDidRelayMessage = new Emitter<IRelayMessage>();
	readonly onDidRelayMessage = this._onDidRelayMessage.event;

	private readonly _onDidRelayClose = new Emitter<string>();
	readonly onDidRelayClose = this._onDidRelayClose.event;

	private readonly _onDidRequestKeyboardInteractive = new Emitter<ISSHKeyboardInteractiveRequest>();
	readonly onDidRequestKeyboardInteractive = this._onDidRequestKeyboardInteractive.event;

	private readonly _onDidCancelKeyboardInteractive = new Emitter<string>();
	readonly onDidCancelKeyboardInteractive = this._onDidCancelKeyboardInteractive.event;

	readonly kbiResponses: Array<{ requestId: string; responses: ReadonlyArray<string> | undefined }> = [];

	async respondKeyboardInteractive(requestId: string, responses?: ReadonlyArray<string>): Promise<void> {
		this.kbiResponses.push({ requestId, responses });
	}

	private readonly _onDidRequestEndpointSelection = new Emitter<ISSHEndpointSelectionRequest>();
	readonly onDidRequestEndpointSelection = this._onDidRequestEndpointSelection.event;

	private readonly _onDidCancelEndpointSelection = new Emitter<string>();
	readonly onDidCancelEndpointSelection = this._onDidCancelEndpointSelection.event;

	private readonly _onDidRequestHostKeyVerification = new Emitter<ISSHHostKeyVerificationRequest>();
	readonly onDidRequestHostKeyVerification = this._onDidRequestHostKeyVerification.event;

	private readonly _onDidCancelHostKeyVerification = new Emitter<string>();
	readonly onDidCancelHostKeyVerification = this._onDidCancelHostKeyVerification.event;

	private readonly _onDidAnnounceHostKeys = new Emitter<ISSHHostKeysAnnouncement>();
	readonly onDidAnnounceHostKeys = this._onDidAnnounceHostKeys.event;

	readonly hostKeyResponses: Array<{ requestId: string; trusted: boolean }> = [];
	private readonly _hostKeyResponseWaiters: DeferredPromise<void>[] = [];

	async respondHostKeyVerification(requestId: string, trusted: boolean): Promise<void> {
		this.hostKeyResponses.push({ requestId, trusted });
		this._hostKeyResponseWaiters.splice(0).forEach(waiter => waiter.complete());
	}

	/** Test helper: fire a host key verification request as the shared process would. */
	fireHostKeyVerificationRequest(request: ISSHHostKeyVerificationRequest): void {
		this._onDidRequestHostKeyVerification.fire(request);
	}

	/** Test helper: cancel a host key verification as the shared process would. */
	fireHostKeyVerificationCancel(requestId: string): void {
		this._onDidCancelHostKeyVerification.fire(requestId);
	}

	/** Test helper: fire a host key announcement as the shared process would. */
	fireHostKeysAnnouncement(announcement: ISSHHostKeysAnnouncement): void {
		this._onDidAnnounceHostKeys.fire(announcement);
	}

	/** Test helper: resolves once {@link respondHostKeyVerification} is next called. */
	waitForHostKeyResponse(): Promise<void> {
		const deferred = new DeferredPromise<void>();
		this._hostKeyResponseWaiters.push(deferred);
		return deferred.p;
	}

	readonly endpointSelectionResponses: Array<{ requestId: string; selection: ISSHEndpointSelection | undefined }> = [];
	private readonly _endpointSelectionResponseWaiters: DeferredPromise<void>[] = [];

	/** Test helper: fire an endpoint-selection request as the main process would. */
	fireEndpointSelectionRequest(request: ISSHEndpointSelectionRequest): void {
		this._onDidRequestEndpointSelection.fire(request);
	}

	/** Test helper: fire an endpoint-selection cancellation as the main process would. */
	fireEndpointSelectionCancel(requestId: string): void {
		this._onDidCancelEndpointSelection.fire(requestId);
	}

	/** Test helper: resolves once {@link respondEndpointSelection} is next called. */
	waitForEndpointSelectionResponse(): Promise<void> {
		const deferred = new DeferredPromise<void>();
		this._endpointSelectionResponseWaiters.push(deferred);
		return deferred.p;
	}

	async respondEndpointSelection(requestId: string, selection: ISSHEndpointSelection | undefined): Promise<void> {
		this.endpointSelectionResponses.push({ requestId, selection });
		this._endpointSelectionResponseWaiters.splice(0).forEach(d => d.complete());
	}

	readonly disconnectCalls: string[] = [];
	readonly connectCalls: ISSHAgentHostConfig[] = [];
	readonly reconnectCalls: Array<{ sshConfigHost: string; name: string; remoteAgentHostCommand?: string; agentForward?: boolean; userInitiated?: boolean; preferredAgentLocation?: RemoteAgentHostLocationPreference }> = [];
	private _nextConnectionId = 1;

	connectResult: Partial<ISSHConnectResult> | undefined;

	async connect(config: ISSHAgentHostConfig): Promise<ISSHConnectResult> {
		this.connectCalls.push(config);
		const connectionId = this.connectResult?.connectionId ?? `conn-${this._nextConnectionId++}`;
		return {
			connectionId,
			address: this.connectResult?.address ?? `ssh:${config.host}`,
			name: config.name,
			connectionToken: 'test-token',
			config: { host: config.host, username: config.username, authMethod: config.authMethod, name: config.name, sshConfigHost: config.sshConfigHost },
			sshConfigHost: config.sshConfigHost,
			serverType: this.connectResult?.serverType,
		};
	}

	async reconnect(sshConfigHost: string, name: string, remoteAgentHostCommand?: string, agentForward?: boolean, userInitiated?: boolean, preferredAgentLocation?: RemoteAgentHostLocationPreference): Promise<ISSHConnectResult> {
		this.reconnectCalls.push({ sshConfigHost, name, remoteAgentHostCommand, agentForward, userInitiated, preferredAgentLocation });
		return {
			connectionId: this.connectResult?.connectionId ?? `conn-${this._nextConnectionId++}`,
			address: this.connectResult?.address ?? `ssh:${sshConfigHost}`,
			name,
			connectionToken: 'test-token',
			config: { host: sshConfigHost, username: 'u', authMethod: 0 as never, name, sshConfigHost },
			sshConfigHost,
			serverType: this.connectResult?.serverType,
		};
	}

	async relaySend(_connectionId: string, _message: string): Promise<void> { /* no-op */ }

	async disconnect(connectionId: string): Promise<void> {
		this.disconnectCalls.push(connectionId);
	}

	async listSSHConfigHosts(): Promise<string[]> { return []; }
	async ensureUserSSHConfig(): Promise<URI> { return URI.file('/tmp/ssh-config'); }
	async listSSHConfigFiles(): Promise<URI[]> { return [URI.file('/tmp/ssh-config')]; }
	async resolveSSHConfig(_host: string): Promise<ISSHResolvedConfig> {
		return { hostname: '', user: undefined, port: 22, identityFile: [], identityAgent: undefined, forwardAgent: false, userKnownHostsFiles: [], globalKnownHostsFiles: [], strictHostKeyChecking: undefined };
	}

	dispose(): void {
		this._onDidChangeConnections.dispose();
		this._onDidCloseConnection.dispose();
		this._onDidReportConnectProgress.dispose();
		this._onDidRelayMessage.dispose();
		this._onDidRelayClose.dispose();
		this._onDidRequestKeyboardInteractive.dispose();
		this._onDidCancelKeyboardInteractive.dispose();
		this._onDidRequestEndpointSelection.dispose();
		this._onDidCancelEndpointSelection.dispose();
		this._onDidRequestHostKeyVerification.dispose();
		this._onDidCancelHostKeyVerification.dispose();
		this._onDidAnnounceHostKeys.dispose();
	}
}

/** Adapt a mock service object to the IChannel surface ProxyChannel expects. */
function asChannel(target: object): IChannel {
	return {
		call: async <T>(method: string, args?: unknown): Promise<T> => {
			const fn = (target as Record<string, unknown>)[method];
			if (typeof fn !== 'function') {
				throw new Error(`MockChannel: no method ${method}`);
			}
			return (fn as (...a: unknown[]) => Promise<T>).apply(target, (args as unknown[]) ?? []);
		},
		listen: <T>(event: string): Event<T> => {
			const ev = (target as Record<string, unknown>)[event];
			if (typeof ev !== 'function') {
				throw new Error(`MockChannel: no event ${event}`);
			}
			return ev as Event<T>;
		},
	};
}

/** Captures addManagedConnection calls so tests can inspect transportDisposable. */
class MockRemoteAgentHostService extends Disposable {
	readonly added: Array<{ address: string; status?: RemoteAgentHostConnectionStatus; transport?: IDisposable }> = [];
	private readonly _entries = new Map<string, { transport?: IDisposable; client: { dispose?: () => void }; status: RemoteAgentHostConnectionStatus }>();
	// Holds transport disposables from prior registrations that were
	// replaced by a later `addManagedConnection` for the same address.
	// Production deliberately does NOT run them at replacement time (doing
	// so would call _mainService.disconnect on the brand-new tunnel and
	// kill it). They are released when the service itself is disposed.
	private readonly _abandonedTransports: IDisposable[] = [];

	async addManagedConnection(entry: { name: string; connection: { address?: string; sshConfigHost?: string } }, client: IAgentConnection, transportDisposable?: IDisposable, status: RemoteAgentHostConnectionStatus = RemoteAgentHostConnectionStatus.connected): Promise<unknown> {
		const address = entry.connection.address ?? `ssh:${entry.connection.sshConfigHost}`;
		// Mirror RemoteAgentHostService: re-registering an address replaces
		// the previous entry and disposes its protocol client (but NOT its
		// transport disposable — the new entry owns the underlying tunnel).
		const previous = this._entries.get(address);
		if (previous) {
			previous.client.dispose?.();
			if (previous.transport) {
				this._abandonedTransports.push(previous.transport);
			}
		}
		this.added.push({ address, status, transport: transportDisposable });
		this._entries.set(address, { client: client as { dispose?: () => void }, transport: transportDisposable, status });
		return { address, name: entry.name, clientId: 'mock', defaultDirectory: undefined, status };
	}

	/** Mirrors IRemoteAgentHostService.getConnection: returns the client only when the entry is connected. */
	getConnection(address: string): IAgentConnection | undefined {
		const entry = this._entries.get(address);
		return entry && RemoteAgentHostConnectionStatus.isConnected(entry.status) ? entry.client as unknown as IAgentConnection : undefined;
	}

	notifyConnectionClosed(_address: string): void {
		// no-op in tests — the defense-in-depth notification is exercised separately
	}

	/** Simulate user clicking "Remove Remote": disposes the per-entry store, which runs the transport disposable. */
	removeEntry(address: string): void {
		const e = this._entries.get(address);
		if (!e) {
			return;
		}
		this._entries.delete(address);
		e.client.dispose?.();
		e.transport?.dispose();
	}

	override dispose(): void {
		// Dispose any still-registered entries (mirrors the per-entry store cleanup
		// done by the real RemoteAgentHostService when it itself is disposed).
		for (const [, e] of this._entries) {
			e.client.dispose?.();
			e.transport?.dispose();
		}
		this._entries.clear();
		// Release abandoned transports from prior registrations as well.
		for (const t of this._abandonedTransports) {
			t.dispose();
		}
		this._abandonedTransports.length = 0;
		super.dispose();
	}
}

class MockProtocolClient extends Disposable {
	readonly clientId = 'mock-protocol-client';
	readonly onDidClose = Event.None;
	readonly onDidAction = Event.None;
	readonly onDidNotification = Event.None;
	readonly connectDeferred = new DeferredPromise<void>();
	async connect(): Promise<void> { return this.connectDeferred.p; }
	registerOwned<T extends IDisposable>(d: T): T { return this._register(d); }
}

class TestConfigurationService {
	readonly onDidChangeConfiguration = Event.None;
	constructor(private _remoteAgentHostsEnabled = true) { }
	getValue(key?: string): unknown { return key === RemoteAgentHostsEnabledSettingId ? this._remoteAgentHostsEnabled : undefined; }
	setRemoteAgentHostsEnabled(enabled: boolean): void { this._remoteAgentHostsEnabled = enabled; }
}

/** Captures every message passed to `info()` so tests can assert on the SSH failover notification. */
class CapturingNotificationService extends TestNotificationService {
	readonly infoMessages: string[] = [];
	readonly notifications: INotification[] = [];

	override info(message: string): INotificationHandle {
		this.infoMessages.push(message);
		return super.info(message);
	}

	override notify(notification: INotification): INotificationHandle {
		this.notifications.push(notification);
		return super.notify(notification);
	}
}

/** In-memory stand-in for {@link IRemoteAgentHostLocationPreferenceService}, keyed the same way as the real storage-backed implementation. */
class TestRemoteAgentHostLocationPreferenceService implements IRemoteAgentHostLocationPreferenceService {
	declare readonly _serviceBrand: undefined;

	private readonly _preferences = new Map<string, RemoteAgentHostLocationPreference>();

	private readonly _onDidChangePreference = new Emitter<string>();
	readonly onDidChangePreference = this._onDidChangePreference.event;

	getPreference(hostKey: string): RemoteAgentHostLocationPreference | undefined {
		return this._preferences.get(hostKey);
	}

	setPreference(hostKey: string, preference: RemoteAgentHostLocationPreference): void {
		this._preferences.set(hostKey, preference);
		this._onDidChangePreference.fire(hostKey);
	}

	dispose(): void {
		this._onDidChangePreference.dispose();
	}
}

suite('SSHRemoteAgentHostService (renderer)', () => {

	const disposables = new DisposableStore();
	let mainService: MockSSHMainService;
	let remoteAgentHostService: MockRemoteAgentHostService;
	let configurationService: TestConfigurationService;
	let notificationService: CapturingNotificationService;
	let createdClients: MockProtocolClient[];
	let waitForClient: (index: number) => Promise<MockProtocolClient>;
	let service: SSHRemoteAgentHostService;
	let quickInputServiceStub: Partial<IQuickInputService>;
	let locationPreferenceService: TestRemoteAgentHostLocationPreferenceService;
	let hostKeyTrustService: SSHHostKeyTrustService;

	setup(() => {
		mainService = new MockSSHMainService();
		disposables.add({ dispose: () => mainService.dispose() });
		remoteAgentHostService = disposables.add(new MockRemoteAgentHostService());
		createdClients = [];

		const sharedProcessService: Partial<ISharedProcessService> = {
			getChannel: () => asChannel(mainService),
		};

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		configurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService as Partial<IConfigurationService>);
		quickInputServiceStub = {};
		instantiationService.stub(IQuickInputService, quickInputServiceStub as Partial<IQuickInputService>);
		instantiationService.stub(ISharedProcessService, sharedProcessService as ISharedProcessService);
		instantiationService.stub(IRemoteAgentHostService, remoteAgentHostService as Partial<IRemoteAgentHostService>);
		notificationService = new CapturingNotificationService();
		instantiationService.stub(INotificationService, notificationService as Partial<INotificationService>);
		locationPreferenceService = disposables.add(new TestRemoteAgentHostLocationPreferenceService());
		instantiationService.stub(IRemoteAgentHostLocationPreferenceService, locationPreferenceService as Partial<IRemoteAgentHostLocationPreferenceService>);
		instantiationService.stub(IDialogService, {
			prompt: (() => { throw new Error('unexpected dialogService.prompt call'); }) as unknown as IDialogService['prompt'],
		} as Partial<IDialogService>);
		instantiationService.stub(IProductService, { _serviceBrand: undefined, nameShort: 'Test Product' } as IProductService);
		hostKeyTrustService = disposables.add(new SSHHostKeyTrustService(disposables.add(new InMemoryStorageService())));
		instantiationService.stub(ISSHHostKeyTrustService, hostKeyTrustService as Partial<ISSHHostKeyTrustService>);

		const clientWaiters: DeferredPromise<MockProtocolClient>[] = [];
		waitForClient = (index: number): Promise<MockProtocolClient> => {
			if (createdClients[index]) {
				return Promise.resolve(createdClients[index]);
			}
			return (clientWaiters[index] ??= new DeferredPromise<MockProtocolClient>()).p;
		};

		instantiationService.stub(ISSHRelayClientFactory, {
			createClient: (_mainService: ISSHRemoteAgentHostMainService, _connectionId: string, _address: string) => {
				const c = new MockProtocolClient();
				disposables.add(c);
				const index = createdClients.length;
				createdClients.push(c);
				clientWaiters[index]?.complete(c);
				return c as unknown as RemoteAgentHostProtocolClient;
			},
		});

		service = disposables.add(instantiationService.createInstance(SSHRemoteAgentHostService));
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	const sampleConfig: ISSHAgentHostConfig = {
		host: 'remote.example',
		username: 'user',
		authMethod: 0 as never,
		name: 'My Remote',
		sshConfigHost: 'remote.example',
	};

	/** Wait until the renderer has created its protocol client, then resolve its handshake. */
	async function awaitClientThenResolve(index: number): Promise<void> {
		const client = await waitForClient(index);
		client.connectDeferred.complete();
	}

	test('connect registers a managed connection with a transport disposable', async () => {
		const connectPromise = service.connect(sampleConfig);
		await awaitClientThenResolve(0);
		const handle = await connectPromise;

		assert.strictEqual(remoteAgentHostService.added.length, 1);
		assert.strictEqual(remoteAgentHostService.added[0].address, 'ssh:remote.example');
		assert.strictEqual(remoteAgentHostService.added[0].status?.kind, 'connected');
		assert.ok(remoteAgentHostService.added[0].transport, 'a transport disposable is passed so removal can tear down the SSH tunnel');
		assert.strictEqual(service.connections.length, 1);
		assert.strictEqual(handle.localAddress, 'ssh:remote.example');
	});

	test('connect threads the stored location preference for the stable connection key into the main-process config', async () => {
		locationPreferenceService.setPreference('ssh:remote.example', 'editor');

		const connectPromise = service.connect(sampleConfig);
		await awaitClientThenResolve(0);
		await connectPromise;

		assert.strictEqual(mainService.connectCalls.length, 1);
		assert.strictEqual(mainService.connectCalls[0].preferredAgentLocation, 'editor');
	});

	test('connect omits preferredAgentLocation from the main-process config when no preference is stored', async () => {
		const connectPromise = service.connect(sampleConfig);
		await awaitClientThenResolve(0);
		await connectPromise;

		assert.strictEqual(mainService.connectCalls.length, 1);
		assert.strictEqual(mainService.connectCalls[0].preferredAgentLocation, undefined);
	});

	test('reconnect threads the stored location preference for sshConfigHost into the main-process reconnect call', async () => {
		locationPreferenceService.setPreference('ssh:remote.example', 'dedicated');

		const reconnectPromise = service.reconnect('remote.example', 'My Remote');
		await awaitClientThenResolve(0);
		await reconnectPromise;

		assert.strictEqual(mainService.reconnectCalls.length, 1);
		assert.strictEqual(mainService.reconnectCalls[0].sshConfigHost, 'remote.example');
		assert.strictEqual(mainService.reconnectCalls[0].preferredAgentLocation, 'dedicated');
	});

	test('reconnect omits preferredAgentLocation from the main-process call when no preference is stored', async () => {
		const reconnectPromise = service.reconnect('remote.example', 'My Remote');
		await awaitClientThenResolve(0);
		await reconnectPromise;

		assert.strictEqual(mainService.reconnectCalls.length, 1);
		assert.strictEqual(mainService.reconnectCalls[0].preferredAgentLocation, undefined);
	});

	test('connect uses the preference for its own stable connection key, not an unrelated host\'s', async () => {
		locationPreferenceService.setPreference('ssh:remote.example', 'editor');
		locationPreferenceService.setPreference('ssh:other.example', 'dedicated');

		const connectPromise = service.connect({ ...sampleConfig, host: 'other.example', sshConfigHost: 'other.example' });
		await awaitClientThenResolve(0);
		await connectPromise;

		assert.strictEqual(mainService.connectCalls[0].preferredAgentLocation, 'dedicated', 'must use the preference for this config\'s own key, not an unrelated host\'s');
	});

	test('incompatible handshake keeps SSH tunnel registered for server upgrade', async () => {
		const connectPromise = service.connect(sampleConfig);
		const client = await waitForClient(0);
		await client.connectDeferred.error(new ProtocolError(
			AHP_UNSUPPORTED_PROTOCOL_VERSION,
			'Unsupported protocol version',
			{ supportedVersions: ['^0.2.0'], _meta: { vscodeUpgradeMethod: '_vscodeUpgrade' } },
		));

		await assert.rejects(connectPromise, /Unsupported protocol version/);

		assert.deepStrictEqual({
			added: remoteAgentHostService.added.map(({ address, status }) => ({ address, status })),
			connections: service.connections.map(connection => connection.localAddress),
			disconnectCalls: mainService.disconnectCalls,
		}, {
			added: [{
				address: 'ssh:remote.example',
				status: RemoteAgentHostConnectionStatus.incompatible('Unsupported protocol version', [PROTOCOL_VERSION], ['^0.2.0'], '_vscodeUpgrade'),
			}],
			connections: ['ssh:remote.example'],
			disconnectCalls: [],
		});
	});

	test('reconnect after incompatible handshake replaces the stale handle and re-handshakes', async () => {
		// Pin a stable connectionId so the simulated `replaceRelay` reconnect
		// returns the same id as the initial connect — that is the real
		// behavior of SSHRemoteAgentHostMainService.connect(replaceRelay=true).
		mainService.connectResult = { connectionId: 'conn-stable', address: 'ssh:remote.example' };

		// First connect: handshake rejected as incompatible. Per the existing
		// fix, this still registers a managed connection in `incompatible`
		// state so the server-upgrade RPC can reach the host.
		const firstConnect = service.connect(sampleConfig);
		const firstClient = await waitForClient(0);
		await firstClient.connectDeferred.error(new ProtocolError(
			AHP_UNSUPPORTED_PROTOCOL_VERSION,
			'Unsupported protocol version',
			{ supportedVersions: ['^0.2.0'], _meta: { vscodeUpgradeMethod: '_vscodeUpgrade' } },
		));
		await assert.rejects(firstConnect, /Unsupported protocol version/);

		// User triggers the server upgrade and then the contribution reconnects.
		// The reconnect must NOT short-circuit to the stale handle (whose
		// protocol client is permanently stuck in incompatible state); it must
		// build a fresh client and complete a fresh handshake against the
		// upgraded server.
		const reconnectPromise = service.reconnect('remote.example', 'My Remote');
		const secondClient = await waitForClient(1);
		await secondClient.connectDeferred.complete();
		await reconnectPromise;

		assert.deepStrictEqual({
			clientCount: createdClients.length,
			added: remoteAgentHostService.added.map(({ address, status }) => ({ address, statusKind: status?.kind })),
			// The replaceRelay path keeps the SSH tunnel alive — we must not
			// have asked the main service to disconnect it.
			disconnectCalls: mainService.disconnectCalls,
			// Exactly one renderer-side handle for the address.
			connections: service.connections.map(connection => connection.localAddress),
		}, {
			clientCount: 2,
			added: [
				{ address: 'ssh:remote.example', statusKind: 'incompatible' },
				{ address: 'ssh:remote.example', statusKind: 'connected' },
			],
			disconnectCalls: [],
			connections: ['ssh:remote.example'],
		});
	});

	test('disabled setting prevents SSH tunnel connects and reconnects', async () => {
		configurationService.setRemoteAgentHostsEnabled(false);

		await assert.rejects(() => service.connect(sampleConfig), /not enabled/);
		await assert.rejects(() => service.reconnect('remote.example', 'My Remote'), /not enabled/);

		assert.deepStrictEqual({ connectCalls: mainService.connectCalls, reconnectCalls: mainService.reconnectCalls, added: remoteAgentHostService.added }, {
			connectCalls: [],
			reconnectCalls: [],
			added: [],
		});
	});

	test('removing the entry tears down the SSH tunnel and the renderer-side handle', async () => {
		const connectPromise = service.connect(sampleConfig);
		await awaitClientThenResolve(0);
		await connectPromise;

		assert.strictEqual(mainService.disconnectCalls.length, 0);
		assert.strictEqual(service.connections.length, 1);

		// Simulate the user clicking "Remove Remote": IRemoteAgentHostService
		// disposes the per-entry store, which runs our transport disposable.
		remoteAgentHostService.removeEntry('ssh:remote.example');

		assert.deepStrictEqual(mainService.disconnectCalls, ['conn-1'], 'main-process tunnel is told to disconnect');
		assert.strictEqual(service.connections.length, 0, 'renderer-side handle is dropped');
	});

	test('connect after removal does not reuse the previous handle', async () => {
		// First connect → entry registered, then removed.
		const c1 = service.connect(sampleConfig);
		await awaitClientThenResolve(0);
		await c1;
		remoteAgentHostService.removeEntry('ssh:remote.example');
		assert.strictEqual(service.connections.length, 0);

		// Second connect → main returns a new connectionId; renderer creates
		// a fresh handle and registers a new managed entry.
		mainService.connectResult = { connectionId: 'conn-2', address: 'ssh:remote.example' };
		const c2 = service.connect(sampleConfig);
		await awaitClientThenResolve(1);
		await c2;

		assert.strictEqual(service.connections.length, 1);
		assert.strictEqual(remoteAgentHostService.added.length, 2, 'each connect produces a fresh managed-connection registration');
	});

	test('main-process onDidCloseConnection cleans up renderer handle without double-disconnecting', async () => {
		const connectPromise = service.connect(sampleConfig);
		await awaitClientThenResolve(0);
		await connectPromise;
		assert.strictEqual(service.connections.length, 1);

		// Simulate main process closing the connection on its own (e.g. SSH dropped).
		// We can't directly fire on the wrapped emitter through the channel because
		// ProxyChannel is one-directional; instead we trigger via the mock service
		// emitter that the renderer subscribed to.
		(mainService as unknown as { _onDidCloseConnection: Emitter<string> })._onDidCloseConnection.fire('conn-1');

		assert.strictEqual(service.connections.length, 0, 'handle dropped on main close');
		// Removing the (already-gone) entry shouldn't trigger another disconnect call.
		remoteAgentHostService.removeEntry('ssh:remote.example');
		// One disconnect from the transport disposable is fine; we just want to make
		// sure we're not at risk of issuing a second one against a stale id.
		assert.ok(mainService.disconnectCalls.length <= 1, 'no duplicate disconnect against a stale connectionId');
	});

	// --- SSH failover notification: editor-owned → standalone on an unattended reconnect ---

	const NOTIFICATION_MESSAGE = 'The editor agent host exited. Reconnected to a dedicated agent host. In-progress work may have been interrupted.';

	/** Fires the main-process close event to simulate natural connection cleanup between connect/reconnect calls. */
	function fireMainProcessClose(connectionId: string): void {
		(mainService as unknown as { _onDidCloseConnection: Emitter<string> })._onDidCloseConnection.fire(connectionId);
	}

	test('initial connect never notifies, even when it lands on a standalone endpoint', async () => {
		mainService.connectResult = { serverType: 'standalone' };
		const c1 = service.connect(sampleConfig);
		await awaitClientThenResolve(0);
		await c1;

		assert.deepStrictEqual(notificationService.infoMessages, []);
	});

	test('an automatic/background reconnect that fails over from an editor-owned endpoint to a standalone endpoint shows exactly one notification', async () => {
		// Initial connect selects an editor-owned endpoint.
		mainService.connectResult = { serverType: 'editor' };
		const c1 = service.connect(sampleConfig);
		await awaitClientThenResolve(0);
		await c1;
		assert.deepStrictEqual(notificationService.infoMessages, [], 'no notification on initial connect');

		// The SSH tunnel drops and the renderer-side handle is cleaned up.
		// This disconnect cleanup must NOT erase the last-known server type.
		fireMainProcessClose('conn-1');
		assert.strictEqual(service.connections.length, 0);

		// A silent/background reconnect (userInitiated: false) lands on a
		// standalone endpoint instead of the editor-owned one.
		mainService.connectResult = { connectionId: 'conn-2', serverType: 'standalone' };
		const r = service.reconnect('remote.example', 'My Remote', false);
		await awaitClientThenResolve(1);
		await r;

		assert.deepStrictEqual(notificationService.infoMessages, [NOTIFICATION_MESSAGE]);
	});

	test('a user-initiated reconnect from an editor-owned endpoint to a standalone endpoint does not notify', async () => {
		mainService.connectResult = { serverType: 'editor' };
		const c1 = service.connect(sampleConfig);
		await awaitClientThenResolve(0);
		await c1;

		fireMainProcessClose('conn-1');

		mainService.connectResult = { connectionId: 'conn-2', serverType: 'standalone' };
		const r = service.reconnect('remote.example', 'My Remote', /* userInitiated */ true);
		await awaitClientThenResolve(1);
		await r;

		assert.deepStrictEqual(notificationService.infoMessages, []);
	});

	test('reconnect without an explicit userInitiated argument defaults to user-initiated and does not notify', async () => {
		mainService.connectResult = { serverType: 'editor' };
		const c1 = service.connect(sampleConfig);
		await awaitClientThenResolve(0);
		await c1;

		fireMainProcessClose('conn-1');

		mainService.connectResult = { connectionId: 'conn-2', serverType: 'standalone' };
		const r = service.reconnect('remote.example', 'My Remote');
		await awaitClientThenResolve(1);
		await r;

		assert.deepStrictEqual(notificationService.infoMessages, []);
	});

	test('an automatic reconnect that stays on an editor-owned endpoint does not notify', async () => {
		mainService.connectResult = { serverType: 'editor' };
		const c1 = service.connect(sampleConfig);
		await awaitClientThenResolve(0);
		await c1;

		fireMainProcessClose('conn-1');

		mainService.connectResult = { connectionId: 'conn-2', serverType: 'editor' };
		const r = service.reconnect('remote.example', 'My Remote', false);
		await awaitClientThenResolve(1);
		await r;

		assert.deepStrictEqual(notificationService.infoMessages, []);
	});

	test('an automatic reconnect that stays on a standalone endpoint does not notify', async () => {
		mainService.connectResult = { serverType: 'standalone' };
		const c1 = service.connect(sampleConfig);
		await awaitClientThenResolve(0);
		await c1;

		fireMainProcessClose('conn-1');

		mainService.connectResult = { connectionId: 'conn-2', serverType: 'standalone' };
		const r = service.reconnect('remote.example', 'My Remote', false);
		await awaitClientThenResolve(1);
		await r;

		assert.deepStrictEqual(notificationService.infoMessages, []);
	});

	test('a failed (incompatible) automatic reconnect does not notify even though it targets a standalone endpoint', async () => {
		mainService.connectResult = { serverType: 'editor' };
		const c1 = service.connect(sampleConfig);
		await awaitClientThenResolve(0);
		await c1;

		fireMainProcessClose('conn-1');

		mainService.connectResult = { connectionId: 'conn-2', serverType: 'standalone' };
		const r = service.reconnect('remote.example', 'My Remote', false);
		const client = await waitForClient(1);
		await client.connectDeferred.error(new ProtocolError(
			AHP_UNSUPPORTED_PROTOCOL_VERSION,
			'Unsupported protocol version',
			{ supportedVersions: ['^0.2.0'], _meta: { vscodeUpgradeMethod: '_vscodeUpgrade' } },
		));
		await assert.rejects(r, /Unsupported protocol version/);

		assert.deepStrictEqual(notificationService.infoMessages, []);
	});

	test('a duplicate setup that reuses an already-connected handle does not notify', async () => {
		mainService.connectResult = { connectionId: 'conn-1', serverType: 'editor' };
		const c1 = service.connect(sampleConfig);
		await awaitClientThenResolve(0);
		await c1;

		// Second connect resolves to the same connectionId while the entry
		// is still connected — SSHRemoteAgentHostService short-circuits to
		// the existing handle and never re-runs endpoint-selection tracking.
		const c2 = service.connect(sampleConfig);
		await c2;

		assert.strictEqual(createdClients.length, 1, 'no second protocol client is created for the duplicate setup');
		assert.deepStrictEqual(notificationService.infoMessages, []);
	});
});

suite('SSHRemoteAgentHostService endpoint selection preference (renderer)', () => {

	const disposables = new DisposableStore();
	let mainService: MockSSHMainService;
	let locationPreferenceService: TestRemoteAgentHostLocationPreferenceService;
	let dialogServiceStub: Partial<IDialogService>;

	setup(() => {
		mainService = new MockSSHMainService();
		disposables.add({ dispose: () => mainService.dispose() });

		const sharedProcessService: Partial<ISharedProcessService> = {
			getChannel: () => asChannel(mainService),
		};

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService() as Partial<IConfigurationService>);
		instantiationService.stub(IQuickInputService, {} as Partial<IQuickInputService>);
		instantiationService.stub(ISharedProcessService, sharedProcessService as ISharedProcessService);
		instantiationService.stub(IRemoteAgentHostService, disposables.add(new MockRemoteAgentHostService()) as Partial<IRemoteAgentHostService>);
		instantiationService.stub(INotificationService, new CapturingNotificationService() as Partial<INotificationService>);
		instantiationService.stub(ISSHRelayClientFactory, {
			createClient: () => disposables.add(new MockProtocolClient()) as unknown as RemoteAgentHostProtocolClient,
		});

		locationPreferenceService = disposables.add(new TestRemoteAgentHostLocationPreferenceService());
		instantiationService.stub(IRemoteAgentHostLocationPreferenceService, locationPreferenceService as Partial<IRemoteAgentHostLocationPreferenceService>);
		instantiationService.stub(ISSHHostKeyTrustService, disposables.add(new SSHHostKeyTrustService(disposables.add(new InMemoryStorageService()))) as Partial<ISSHHostKeyTrustService>);

		// Default to throwing so any test that doesn't expect the modal to
		// appear fails loudly if the implementation shows it unexpectedly.
		dialogServiceStub = {
			prompt: (() => { throw new Error('unexpected dialogService.prompt call'); }) as unknown as IDialogService['prompt'],
		};
		instantiationService.stub(IDialogService, dialogServiceStub as IDialogService);
		instantiationService.stub(IProductService, { _serviceBrand: undefined, nameShort: 'Test Product' } as IProductService);

		// Instantiating the service is enough to register the
		// onDidRequestEndpointSelection/onDidCancelEndpointSelection listeners;
		// the resulting handle isn't otherwise used by these tests.
		disposables.add(instantiationService.createInstance(SSHRemoteAgentHostService));
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	const connectionKey = 'ssh:remote.example';

	const editorCandidate: ISSHEndpointCandidate = {
		type: 'editor',
		pid: 111,
		instanceId: 'editor-instance-2',
		quality: 'stable',
		endpoint: { type: 'socket', path: '/run/agent-host/editor-111.sock' },
	};
	const otherEditorCandidate: ISSHEndpointCandidate = {
		type: 'editor',
		pid: 333,
		instanceId: 'editor-instance-1',
		endpoint: { type: 'socket', path: '/run/agent-host/editor-333.sock' },
	};
	const standaloneCandidate: ISSHEndpointCandidate = {
		type: 'standalone',
		pid: 222,
		instanceId: 'standalone-instance-2',
		endpoint: { type: 'tcp', host: '127.0.0.1', port: 43210 },
	};
	const otherStandaloneCandidate: ISSHEndpointCandidate = {
		type: 'standalone',
		pid: 444,
		instanceId: 'standalone-instance-1',
		endpoint: { type: 'tcp', host: '127.0.0.1', port: 43211 },
	};

	function makeRequest(candidates: readonly ISSHEndpointCandidate[], key = connectionKey): ISSHEndpointSelectionRequest {
		return { requestId: 'req-1', connectionKey: key, displayHost: 'remote.example', candidates };
	}

	test('no stored preference with a live editor shows the shared modal and persists a chosen "editor" preference', async () => {
		dialogServiceStub.prompt = (async () => ({ result: 'editor' })) as unknown as IDialogService['prompt'];

		mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate, standaloneCandidate]));
		await mainService.waitForEndpointSelectionResponse();

		assert.deepStrictEqual(mainService.endpointSelectionResponses, [
			{ requestId: 'req-1', selection: { kind: 'candidate', type: 'editor', pid: 111, instanceId: 'editor-instance-2' } },
		]);
		assert.strictEqual(locationPreferenceService.getPreference(connectionKey), 'editor');
	});

	test('no stored preference with a live editor shows the shared modal and persists a chosen "dedicated" preference', async () => {
		dialogServiceStub.prompt = (async () => ({ result: 'dedicated' })) as unknown as IDialogService['prompt'];

		mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate, standaloneCandidate]));
		await mainService.waitForEndpointSelectionResponse();

		assert.deepStrictEqual(mainService.endpointSelectionResponses, [
			{ requestId: 'req-1', selection: { kind: 'candidate', type: 'standalone', pid: 222, instanceId: 'standalone-instance-2' } },
		]);
		assert.strictEqual(locationPreferenceService.getPreference(connectionKey), 'dedicated');
	});

	test('no stored preference and no live editor resolves to a dedicated selection without prompting or persisting anything', async () => {
		mainService.fireEndpointSelectionRequest(makeRequest([standaloneCandidate]));
		await mainService.waitForEndpointSelectionResponse();

		assert.deepStrictEqual(mainService.endpointSelectionResponses, [
			{ requestId: 'req-1', selection: { kind: 'candidate', type: 'standalone', pid: 222, instanceId: 'standalone-instance-2' } },
		]);
		assert.strictEqual(locationPreferenceService.getPreference(connectionKey), undefined);
	});

	test('no stored preference and no live candidates at all spawns a new dedicated host without prompting', async () => {
		mainService.fireEndpointSelectionRequest(makeRequest([]));
		await mainService.waitForEndpointSelectionResponse();

		assert.deepStrictEqual(mainService.endpointSelectionResponses, [
			{ requestId: 'req-1', selection: { kind: 'spawn' } },
		]);
		assert.strictEqual(locationPreferenceService.getPreference(connectionKey), undefined);
	});

	test('a stored "editor" preference bypasses the modal and resolves to the live editor candidate', async () => {
		locationPreferenceService.setPreference(connectionKey, 'editor');

		mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate, standaloneCandidate]));
		await mainService.waitForEndpointSelectionResponse();

		assert.deepStrictEqual(mainService.endpointSelectionResponses, [
			{ requestId: 'req-1', selection: { kind: 'candidate', type: 'editor', pid: 111, instanceId: 'editor-instance-2' } },
		]);
	});

	test('a stored "dedicated" preference bypasses the modal even when an editor is live', async () => {
		locationPreferenceService.setPreference(connectionKey, 'dedicated');

		mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate, standaloneCandidate]));
		await mainService.waitForEndpointSelectionResponse();

		assert.deepStrictEqual(mainService.endpointSelectionResponses, [
			{ requestId: 'req-1', selection: { kind: 'candidate', type: 'standalone', pid: 222, instanceId: 'standalone-instance-2' } },
		]);
	});

	test('a stored "dedicated" preference with no live standalone endpoint spawns a new one', async () => {
		locationPreferenceService.setPreference(connectionKey, 'dedicated');

		mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate]));
		await mainService.waitForEndpointSelectionResponse();

		assert.deepStrictEqual(mainService.endpointSelectionResponses, [
			{ requestId: 'req-1', selection: { kind: 'spawn' } },
		]);
	});

	test('a stored "editor" preference with no live editor falls back to a dedicated selection without mutating the stored preference', async () => {
		locationPreferenceService.setPreference(connectionKey, 'editor');

		mainService.fireEndpointSelectionRequest(makeRequest([standaloneCandidate]));
		await mainService.waitForEndpointSelectionResponse();

		assert.deepStrictEqual(mainService.endpointSelectionResponses, [
			{ requestId: 'req-1', selection: { kind: 'candidate', type: 'standalone', pid: 222, instanceId: 'standalone-instance-2' } },
		]);
		assert.strictEqual(locationPreferenceService.getPreference(connectionKey), 'editor', 'a live-editor-unavailable fallback must not downgrade the stored preference, so a future connect can prefer an editor again');
	});

	test('a stored "editor" preference with neither a live editor nor a live standalone spawns a new dedicated host', async () => {
		locationPreferenceService.setPreference(connectionKey, 'editor');

		mainService.fireEndpointSelectionRequest(makeRequest([]));
		await mainService.waitForEndpointSelectionResponse();

		assert.deepStrictEqual(mainService.endpointSelectionResponses, [
			{ requestId: 'req-1', selection: { kind: 'spawn' } },
		]);
		assert.strictEqual(locationPreferenceService.getPreference(connectionKey), 'editor');
	});

	test('resolves to the live editor candidate with the lexicographically smallest instanceId, regardless of array order', async () => {
		locationPreferenceService.setPreference(connectionKey, 'editor');

		mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate, otherEditorCandidate]));
		await mainService.waitForEndpointSelectionResponse();

		assert.deepStrictEqual(mainService.endpointSelectionResponses, [
			{ requestId: 'req-1', selection: { kind: 'candidate', type: 'editor', pid: 333, instanceId: 'editor-instance-1' } },
		]);
	});

	test('resolves to the live standalone candidate with the lexicographically smallest instanceId, regardless of array order', async () => {
		locationPreferenceService.setPreference(connectionKey, 'dedicated');

		mainService.fireEndpointSelectionRequest(makeRequest([standaloneCandidate, otherStandaloneCandidate]));
		await mainService.waitForEndpointSelectionResponse();

		assert.deepStrictEqual(mainService.endpointSelectionResponses, [
			{ requestId: 'req-1', selection: { kind: 'candidate', type: 'standalone', pid: 444, instanceId: 'standalone-instance-1' } },
		]);
	});

	test('a main-process cancellation aborts the open modal cleanly, responds with undefined, and persists nothing', async () => {
		let capturedToken: CancellationToken | undefined;
		dialogServiceStub.prompt = ((prompt: { token?: CancellationToken }) => new Promise(resolve => {
			capturedToken = prompt.token;
			const listener = prompt.token?.onCancellationRequested(() => {
				listener?.dispose();
				resolve({ result: undefined });
			});
		})) as unknown as IDialogService['prompt'];

		mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate, standaloneCandidate]));
		assert.ok(capturedToken, 'the modal should have been opened synchronously with a cancellation token');

		const responsePromise = mainService.waitForEndpointSelectionResponse();
		mainService.fireEndpointSelectionCancel('req-1');
		await responsePromise;

		assert.deepStrictEqual(mainService.endpointSelectionResponses, [
			{ requestId: 'req-1', selection: undefined },
		]);
		assert.strictEqual(locationPreferenceService.getPreference(connectionKey), undefined);
	});

	test('the user dismissing the modal responds with undefined and does not persist a preference', async () => {
		dialogServiceStub.prompt = (async () => ({ result: undefined })) as unknown as IDialogService['prompt'];

		mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate, standaloneCandidate]));
		await mainService.waitForEndpointSelectionResponse();

		assert.deepStrictEqual(mainService.endpointSelectionResponses, [
			{ requestId: 'req-1', selection: undefined },
		]);
		assert.strictEqual(locationPreferenceService.getPreference(connectionKey), undefined);
	});

	test('cancelling an unrelated requestId does not abort the current modal', async () => {
		dialogServiceStub.prompt = (async () => ({ result: undefined })) as unknown as IDialogService['prompt'];

		mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate, standaloneCandidate]));
		mainService.fireEndpointSelectionCancel('some-other-request');
		await mainService.waitForEndpointSelectionResponse();

		// The modal resolved on its own (user dismissed it); the unrelated
		// cancel event must not have interfered with routing the response.
		assert.deepStrictEqual(mainService.endpointSelectionResponses, [
			{ requestId: 'req-1', selection: undefined },
		]);
	});

	test('preferences are isolated per connectionKey: a preference stored for one host does not suppress the modal for another', async () => {
		locationPreferenceService.setPreference('ssh:other.example', 'dedicated');
		dialogServiceStub.prompt = (async () => ({ result: 'editor' })) as unknown as IDialogService['prompt'];

		mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate, standaloneCandidate], connectionKey));
		await mainService.waitForEndpointSelectionResponse();

		assert.deepStrictEqual(mainService.endpointSelectionResponses, [
			{ requestId: 'req-1', selection: { kind: 'candidate', type: 'editor', pid: 111, instanceId: 'editor-instance-2' } },
		]);
		assert.strictEqual(locationPreferenceService.getPreference(connectionKey), 'editor');
		assert.strictEqual(locationPreferenceService.getPreference('ssh:other.example'), 'dedicated');
	});
});

suite('SSHRemoteAgentHostService host key verification (renderer)', () => {

	const disposables = new DisposableStore();
	let mainService: MockSSHMainService;
	let hostKeyTrustService: SSHHostKeyTrustService;
	let notificationService: CapturingNotificationService;
	let confirmResult: boolean;
	let confirmCalls: number;
	/** When set, the confirm dialog blocks on this until the test releases it. */
	let confirmGate: (() => Promise<void>) | undefined;
	let inFlightVerifications: Promise<void>[];
	/** The options the last confirm dialog was opened with. */
	let lastConfirmOptions: IConfirmation | undefined;

	setup(() => {
		mainService = disposables.add(new MockSSHMainService());
		const sharedProcessService: Partial<ISharedProcessService> = {
			getChannel: () => asChannel(mainService),
		};

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService() as Partial<IConfigurationService>);
		instantiationService.stub(IQuickInputService, {} as Partial<IQuickInputService>);
		instantiationService.stub(ISharedProcessService, sharedProcessService as ISharedProcessService);
		instantiationService.stub(IRemoteAgentHostService, disposables.add(new MockRemoteAgentHostService()) as Partial<IRemoteAgentHostService>);
		notificationService = new CapturingNotificationService();
		instantiationService.stub(INotificationService, notificationService as Partial<INotificationService>);
		instantiationService.stub(ISSHRelayClientFactory, {
			createClient: () => disposables.add(new MockProtocolClient()) as unknown as RemoteAgentHostProtocolClient,
		});
		instantiationService.stub(IRemoteAgentHostLocationPreferenceService, disposables.add(new TestRemoteAgentHostLocationPreferenceService()) as Partial<IRemoteAgentHostLocationPreferenceService>);
		instantiationService.stub(IProductService, { _serviceBrand: undefined, nameShort: 'Test Product' } as IProductService);

		confirmResult = false;
		confirmCalls = 0;
		confirmGate = undefined;
		lastConfirmOptions = undefined;
		inFlightVerifications = [];
		instantiationService.stub(IDialogService, {
			confirm: (async (confirmation: IConfirmation) => {
				confirmCalls++;
				lastConfirmOptions = confirmation;
				if (confirmGate) {
					await confirmGate();
				}
				return { confirmed: confirmResult };
			}) as unknown as IDialogService['confirm'],
		} as Partial<IDialogService>);

		hostKeyTrustService = disposables.add(new SSHHostKeyTrustService(disposables.add(new InMemoryStorageService())));
		instantiationService.stub(ISSHHostKeyTrustService, hostKeyTrustService as Partial<ISSHHostKeyTrustService>);

		// Subclassed so tests can await the real handler settling rather than
		// sleeping for a fixed interval, which is load-dependent and flaky.
		class TestableService extends SSHRemoteAgentHostService {
			protected override _trackHostKeyVerification(handled: Promise<void>): void {
				inFlightVerifications.push(handled);
			}
		}
		disposables.add(instantiationService.createInstance(TestableService));
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	/** Settles once every verification the test has triggered has finished. */
	async function settleVerifications(): Promise<void> {
		while (inFlightVerifications.length) {
			await Promise.all(inFlightVerifications.splice(0));
		}
	}

	const FINGERPRINT = 'SHA256:testfingerprintaaaaaaaaaaaaaaaaaaaaaaaaaaa';

	function makeHostKeyRequest(overrides: Partial<ISSHHostKeyVerificationRequest> = {}): ISSHHostKeyVerificationRequest {
		return {
			requestId: 'hostkey-1',
			connectionKey: 'ssh:remote.example',
			displayHost: 'remote.example',
			host: 'remote.example',
			port: 22,
			keyType: 'ssh-ed25519',
			fingerprint: FINGERPRINT,
			knownHostsMatch: 'unknown',
			userInitiated: true,
			...overrides,
		};
	}

	async function fireAndWait(request: ISSHHostKeyVerificationRequest): Promise<void> {
		const responded = mainService.waitForHostKeyResponse();
		mainService.fireHostKeyVerificationRequest(request);
		await responded;
	}

	test('prompts for an unknown host and persists on accept', async () => {
		confirmResult = true;
		await fireAndWait(makeHostKeyRequest());

		assert.deepStrictEqual(
			{
				responses: mainService.hostKeyResponses,
				confirmCalls,
				stored: hostKeyTrustService.getTrustedKeys('remote.example', 22).map(k => `${k.keyType} ${k.fingerprint}`),
			},
			{
				responses: [{ requestId: 'hostkey-1', trusted: true }],
				confirmCalls: 1,
				stored: ['ssh-ed25519 SHA256:testfingerprintaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
			});
	});

	test('declining the prompt refuses the key and stores nothing', async () => {
		confirmResult = false;
		await fireAndWait(makeHostKeyRequest());

		assert.deepStrictEqual(
			{
				responses: mainService.hostKeyResponses,
				stored: hostKeyTrustService.getTrustedKeys('remote.example', 22).length,
			},
			{ responses: [{ requestId: 'hostkey-1', trusted: false }], stored: 0 });
	});

	test('an already-trusted key connects silently', async () => {
		hostKeyTrustService.trustHostKey('remote.example', 22, { keyType: 'ssh-ed25519', fingerprint: FINGERPRINT, addedAt: 1 });
		await fireAndWait(makeHostKeyRequest());

		assert.deepStrictEqual(
			{ responses: mainService.hostKeyResponses, confirmCalls },
			{ responses: [{ requestId: 'hostkey-1', trusted: true }], confirmCalls: 0 });
	});

	test('a changed key is refused with no way to click through', async () => {
		hostKeyTrustService.trustHostKey('remote.example', 22, { keyType: 'ssh-ed25519', fingerprint: 'SHA256:theoldkey', addedAt: 1 });
		await fireAndWait(makeHostKeyRequest());

		const notified = notificationService.notifications.at(-1);
		assert.deepStrictEqual(
			{
				responses: mainService.hostKeyResponses,
				// No dialog at all: recovering requires explicitly forgetting
				// the host, so a possible impersonation can't be waved away.
				confirmCalls,
				severity: notified?.severity,
				hasForgetAction: !!notified?.actions?.primary?.length,
				// The old key must remain stored until the user forgets it.
				stillStored: hostKeyTrustService.getTrustedKeys('remote.example', 22).map(k => k.fingerprint),
			},
			{
				responses: [{ requestId: 'hostkey-1', trusted: false }],
				confirmCalls: 0,
				severity: Severity.Error,
				hasForgetAction: true,
				stillStored: ['SHA256:theoldkey'],
			});
	});

	test('a known_hosts mismatch or revocation offers no forget action', async () => {
		// "Forget Saved Host Key" only clears *our* store. When the conflict
		// lives in the user's own known_hosts file, forgetting would change
		// nothing and the very same error would reappear on the next connect,
		// so the message points at the file that actually decides instead.
		await fireAndWait(makeHostKeyRequest({ knownHostsMatch: 'mismatch' }));
		const fromKnownHosts = notificationService.notifications.at(-1);

		await fireAndWait(makeHostKeyRequest({ requestId: 'hostkey-2', knownHostsMatch: 'revoked' }));
		const fromRevoked = notificationService.notifications.at(-1);

		assert.deepStrictEqual(
			{
				knownHostsHasForget: !!fromKnownHosts?.actions?.primary?.length,
				knownHostsMentionsFile: !!fromKnownHosts?.message.toString().includes('known_hosts'),
				revokedHasForget: !!fromRevoked?.actions?.primary?.length,
				revokedMentionsFile: !!fromRevoked?.message.toString().includes('known_hosts'),
				responses: mainService.hostKeyResponses,
			},
			{
				knownHostsHasForget: false,
				knownHostsMentionsFile: true,
				revokedHasForget: false,
				revokedMentionsFile: true,
				responses: [
					{ requestId: 'hostkey-1', trusted: false },
					{ requestId: 'hostkey-2', trusted: false },
				],
			});
	});

	test('the forget action clears the stored key so the next connect can re-verify', async () => {
		hostKeyTrustService.trustHostKey('remote.example', 22, { keyType: 'ssh-ed25519', fingerprint: 'SHA256:theoldkey', addedAt: 1 });
		await fireAndWait(makeHostKeyRequest());

		await notificationService.notifications.at(-1)?.actions?.primary?.[0].run();
		assert.strictEqual(hostKeyTrustService.getTrustedKeys('remote.example', 22).length, 0);
	});

	test('a known_hosts match is trusted silently and copied into the store', async () => {
		await fireAndWait(makeHostKeyRequest({ knownHostsMatch: 'match' }));

		assert.deepStrictEqual(
			{
				responses: mainService.hostKeyResponses,
				confirmCalls,
				stored: hostKeyTrustService.getTrustedKeys('remote.example', 22).map(k => k.fingerprint),
			},
			{
				responses: [{ requestId: 'hostkey-1', trusted: true }],
				confirmCalls: 0,
				stored: [FINGERPRINT],
			});
	});

	test('a revoked key is refused', async () => {
		await fireAndWait(makeHostKeyRequest({ knownHostsMatch: 'revoked' }));
		assert.deepStrictEqual(
			{ responses: mainService.hostKeyResponses, confirmCalls },
			{ responses: [{ requestId: 'hostkey-1', trusted: false }], confirmCalls: 0 });
	});

	test('a background reconnect never opens a dialog', async () => {
		await fireAndWait(makeHostKeyRequest({ userInitiated: false }));
		assert.deepStrictEqual(
			{ responses: mainService.hostKeyResponses, confirmCalls },
			{ responses: [{ requestId: 'hostkey-1', trusted: false }], confirmCalls: 0 });
	});

	test('StrictHostKeyChecking accept-new trusts unknown hosts without prompting', async () => {
		await fireAndWait(makeHostKeyRequest({ strictHostKeyChecking: 'accept-new' }));
		assert.deepStrictEqual(
			{
				responses: mainService.hostKeyResponses,
				confirmCalls,
				stored: hostKeyTrustService.getTrustedKeys('remote.example', 22).length,
			},
			{ responses: [{ requestId: 'hostkey-1', trusted: true }], confirmCalls: 0, stored: 1 });
	});

	test('a prompt for a connection that dies is dismissed, and a late answer grants nothing', async () => {
		// The dialog is opened with a cancellation token so it tears itself
		// down when the connection drops, rather than stranding the user with
		// a question about a connection that no longer exists. Answering it
		// late must also be inert.
		let releaseDialog = () => { };
		const dialogShown = new Promise<void>(resolveShown => {
			confirmGate = () => {
				resolveShown();
				return new Promise<void>(resolve => { releaseDialog = resolve; });
			};
		});
		confirmResult = true;

		mainService.fireHostKeyVerificationRequest(makeHostKeyRequest());
		await dialogShown;
		const dialogToken = lastConfirmOptions?.token;
		const dismissedBeforeCancel = dialogToken?.isCancellationRequested;
		// The connection drops while the user is still looking at the dialog.
		mainService.fireHostKeyVerificationCancel('hostkey-1');
		const dismissedAfterCancel = dialogToken?.isCancellationRequested;
		releaseDialog();
		await settleVerifications();

		assert.deepStrictEqual(
			{
				// The dialog is handed a live token that is cancelled when the
				// connection dies, which is what dismisses it.
				dismissedBeforeCancel,
				dismissedAfterCancel,
				// And a late "Connect" still grants nothing.
				responses: mainService.hostKeyResponses,
				stored: hostKeyTrustService.getTrustedKeys('remote.example', 22).length,
			},
			{ dismissedBeforeCancel: false, dismissedAfterCancel: true, responses: [], stored: 0 });
	});

	test('learns a rotated key announced over an authenticated connection', async () => {
		hostKeyTrustService.trustHostKey('remote.example', 22, { keyType: 'ssh-ed25519', fingerprint: FINGERPRINT, addedAt: 1 });
		// Establish a session whose host key is itself trusted — that is what
		// entitles the server to tell us about its other keys.
		await fireAndWait(makeHostKeyRequest());

		mainService.fireHostKeysAnnouncement({
			connectionKey: 'ssh:remote.example',
			host: 'remote.example',
			port: 22,
			keys: [
				{ keyType: 'ssh-ed25519', fingerprint: 'SHA256:rotated' },
				{ keyType: 'ssh-rsa', fingerprint: 'SHA256:rsakey' },
			],
		});

		assert.deepStrictEqual(
			hostKeyTrustService.getTrustedKeys('remote.example', 22).map(k => `${k.keyType} ${k.fingerprint}`).sort(),
			['ssh-ed25519 SHA256:rotated', 'ssh-rsa SHA256:rsakey']);
	});

	test('a changed key is refused even when StrictHostKeyChecking is disabled', async () => {
		// The opt-out means "I accept unknown keys", not "I accept a key that
		// contradicts one I already trust". OpenSSH 9.9 keeps protecting this
		// case too: it warns and disables password auth, keyboard-interactive
		// auth and agent forwarding. We refuse outright, so no credential and
		// no agent access ever reaches a possible impostor — and the
		// announcement path is moot because the session never authenticates.
		hostKeyTrustService.trustHostKey('remote.example', 22, { keyType: 'ssh-ed25519', fingerprint: FINGERPRINT, addedAt: 1 });
		await fireAndWait(makeHostKeyRequest({ fingerprint: 'SHA256:impostorkey', strictHostKeyChecking: 'no' }));

		mainService.fireHostKeysAnnouncement({
			connectionKey: 'ssh:remote.example',
			host: 'remote.example',
			port: 22,
			keys: [{ keyType: 'ssh-ed25519', fingerprint: 'SHA256:attackerkey' }],
		});

		assert.deepStrictEqual(
			{
				// Refused outright, before authentication.
				connected: mainService.hostKeyResponses,
				// And the genuine stored key is untouched.
				stored: hostKeyTrustService.getTrustedKeys('remote.example', 22).map(k => k.fingerprint),
			},
			{
				connected: [{ requestId: 'hostkey-1', trusted: false }],
				stored: [FINGERPRINT],
			});
	});

	test('an unverified session cannot poison stored trust via announcements', async () => {
		// A session accepted under StrictHostKeyChecking=no is unverified: the
		// key was simply not checked. ssh2 still proves announced keys belong
		// to whoever we are talking to — but that could be an impostor, so the
		// announcement must not overwrite the real stored key. Mirrors
		// OpenSSH, which only accepts additional host keys when the key that
		// authenticated the host was already trusted.
		//
		// Uses an *unknown* key (a different algorithm), since a key that
		// contradicts the stored one is now refused outright by the test above.
		hostKeyTrustService.trustHostKey('remote.example', 22, { keyType: 'ssh-ed25519', fingerprint: FINGERPRINT, addedAt: 1 });
		await fireAndWait(makeHostKeyRequest({ keyType: 'ssh-rsa', fingerprint: 'SHA256:impostorkey', strictHostKeyChecking: 'no' }));

		mainService.fireHostKeysAnnouncement({
			connectionKey: 'ssh:remote.example',
			host: 'remote.example',
			port: 22,
			keys: [{ keyType: 'ssh-ed25519', fingerprint: 'SHA256:attackerkey' }],
		});

		assert.deepStrictEqual(
			{
				// The unverified session was allowed to connect...
				connected: mainService.hostKeyResponses,
				// ...but the genuine stored key is untouched.
				stored: hostKeyTrustService.getTrustedKeys('remote.example', 22).map(k => k.fingerprint),
			},
			{
				connected: [{ requestId: 'hostkey-1', trusted: true }],
				stored: [FINGERPRINT],
			});
	});

	test('ignores announcements for hosts that were never trusted', async () => {
		// Otherwise an announcement would become a way to establish trust
		// without any verification at all.
		mainService.fireHostKeysAnnouncement({
			connectionKey: 'ssh:remote.example',
			host: 'remote.example',
			port: 22,
			keys: [{ keyType: 'ssh-ed25519', fingerprint: 'SHA256:rotated' }],
		});

		assert.strictEqual(hostKeyTrustService.getTrustedKeys('remote.example', 22).length, 0);
	});
});
