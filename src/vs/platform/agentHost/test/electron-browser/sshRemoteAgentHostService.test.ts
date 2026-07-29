/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import type { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';

import { ISharedProcessService } from '../../../ipc/electron-browser/services.js';
import { IQuickInputService } from '../../../quickinput/common/quickInput.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../common/remoteAgentHostService.js';
import type { IAgentConnection } from '../../common/agentService.js';
import { AHP_UNSUPPORTED_PROTOCOL_VERSION, ProtocolError } from '../../common/state/sessionProtocol.js';
import type {
	ISSHAgentHostConfig,
	ISSHConnectResult,
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

	readonly disconnectCalls: string[] = [];
	readonly connectCalls: ISSHAgentHostConfig[] = [];
	readonly reconnectCalls: Array<{ sshConfigHost: string; name: string }> = [];
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
		};
	}

	async reconnect(sshConfigHost: string, name: string): Promise<ISSHConnectResult> {
		this.reconnectCalls.push({ sshConfigHost, name });
		return {
			connectionId: this.connectResult?.connectionId ?? `conn-${this._nextConnectionId++}`,
			address: this.connectResult?.address ?? `ssh:${sshConfigHost}`,
			name,
			connectionToken: 'test-token',
			config: { host: sshConfigHost, username: 'u', authMethod: 0 as never, name, sshConfigHost },
			sshConfigHost,
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
		return { hostname: '', user: undefined, port: 22, identityFile: [], identityAgent: undefined, forwardAgent: false };
	}

	dispose(): void {
		this._onDidChangeConnections.dispose();
		this._onDidCloseConnection.dispose();
		this._onDidReportConnectProgress.dispose();
		this._onDidRelayMessage.dispose();
		this._onDidRelayClose.dispose();
		this._onDidRequestKeyboardInteractive.dispose();
		this._onDidCancelKeyboardInteractive.dispose();
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

suite('SSHRemoteAgentHostService (renderer)', () => {

	const disposables = new DisposableStore();
	let mainService: MockSSHMainService;
	let remoteAgentHostService: MockRemoteAgentHostService;
	let configurationService: TestConfigurationService;
	let createdClients: MockProtocolClient[];
	let waitForClient: (index: number) => Promise<MockProtocolClient>;
	let service: SSHRemoteAgentHostService;

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
		instantiationService.stub(IQuickInputService, {} as Partial<IQuickInputService>);
		instantiationService.stub(ISharedProcessService, sharedProcessService as ISharedProcessService);
		instantiationService.stub(IRemoteAgentHostService, remoteAgentHostService as Partial<IRemoteAgentHostService>);

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
});
