/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import type { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ISharedProcessService } from '../../../ipc/electron-browser/services.js';
import { IRemoteAgentHostService } from '../../common/remoteAgentHostService.js';
import type { IAgentConnection } from '../../common/agentService.js';
import type {
	ISSHAgentHostConfig,
	ISSHConnectResult,
	ISSHRelayMessage,
	ISSHResolvedConfig,
} from '../../common/sshRemoteAgentHost.js';
import { SSHRemoteAgentHostService } from '../../electron-browser/sshRemoteAgentHostServiceImpl.js';

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

	private readonly _onDidRelayMessage = new Emitter<ISSHRelayMessage>();
	readonly onDidRelayMessage = this._onDidRelayMessage.event;

	private readonly _onDidRelayClose = new Emitter<string>();
	readonly onDidRelayClose = this._onDidRelayClose.event;

	readonly disconnectCalls: string[] = [];
	private _nextConnectionId = 1;

	connectResult: Partial<ISSHConnectResult> | undefined;

	async connect(config: ISSHAgentHostConfig): Promise<ISSHConnectResult> {
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
		return {
			connectionId: `conn-${this._nextConnectionId++}`,
			address: `ssh:${sshConfigHost}`,
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
	async resolveSSHConfig(_host: string): Promise<ISSHResolvedConfig> {
		return { hostname: '', user: undefined, port: 22, identityFile: [], forwardAgent: false };
	}

	dispose(): void {
		this._onDidChangeConnections.dispose();
		this._onDidCloseConnection.dispose();
		this._onDidReportConnectProgress.dispose();
		this._onDidRelayMessage.dispose();
		this._onDidRelayClose.dispose();
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
	readonly added: Array<{ address: string; transport?: IDisposable }> = [];
	private readonly _entries = new Map<string, { transport?: IDisposable; client: { dispose?: () => void } }>();

	async addManagedConnection(entry: { name: string; connection: { address?: string; sshConfigHost?: string } }, client: IAgentConnection, transportDisposable?: IDisposable): Promise<unknown> {
		const address = entry.connection.address ?? `ssh:${entry.connection.sshConfigHost}`;
		this.added.push({ address, transport: transportDisposable });
		this._entries.set(address, { client: client as { dispose?: () => void }, transport: transportDisposable });
		return { address, name: entry.name, clientId: 'mock', defaultDirectory: undefined, status: 0 };
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
	getValue(): unknown { return undefined; }
}

suite('SSHRemoteAgentHostService (renderer)', () => {

	const disposables = new DisposableStore();
	let mainService: MockSSHMainService;
	let remoteAgentHostService: MockRemoteAgentHostService;
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
		instantiationService.stub(IConfigurationService, new TestConfigurationService() as Partial<IConfigurationService>);
		instantiationService.stub(ISharedProcessService, sharedProcessService as ISharedProcessService);
		instantiationService.stub(IRemoteAgentHostService, remoteAgentHostService as Partial<IRemoteAgentHostService>);

		const clientWaiters: DeferredPromise<MockProtocolClient>[] = [];
		waitForClient = (index: number): Promise<MockProtocolClient> => {
			if (createdClients[index]) {
				return Promise.resolve(createdClients[index]);
			}
			return (clientWaiters[index] ??= new DeferredPromise<MockProtocolClient>()).p;
		};

		const inner: Partial<IInstantiationService> = {
			createInstance: (_ctor: unknown, ...args: unknown[]) => {
				const c = new MockProtocolClient();
				// The real RemoteAgentHostProtocolClient owns the transport disposable
				// it's constructed with; mirror that here so SSHRelayTransport doesn't leak.
				const transport = args[1] as IDisposable | undefined;
				if (transport) {
					c.registerOwned(transport);
				}
				disposables.add(c);
				const index = createdClients.length;
				createdClients.push(c);
				clientWaiters[index]?.complete(c);
				return c;
			},
		};
		instantiationService.stub(IInstantiationService, inner as Partial<IInstantiationService>);

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
		assert.ok(remoteAgentHostService.added[0].transport, 'a transport disposable is passed so removal can tear down the SSH tunnel');
		assert.strictEqual(service.connections.length, 1);
		assert.strictEqual(handle.localAddress, 'ssh:remote.example');
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
