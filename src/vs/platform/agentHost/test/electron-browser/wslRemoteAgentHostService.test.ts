/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import type { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { URI } from '../../../../base/common/uri.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ISharedProcessService } from '../../../ipc/electron-browser/services.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../storage/common/storage.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { ILabelService } from '../../../label/common/label.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../workspace/common/workspaceTrust.js';
import { AgentHostProtocolClient } from '../../browser/agentHostProtocolClient.js';
import { EditorWindowRemoteAgentHostService } from '../../browser/remoteAgentHostServiceImpl.js';
import { IAgentHostResourceService } from '../../common/agentHostResourceService.js';
import { IRemoteAgentHostService, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostsEnabledSettingId } from '../../common/remoteAgentHostService.js';
import { type IProtocolTransport } from '../../common/state/sessionTransport.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import { AHP_UNSUPPORTED_PROTOCOL_VERSION, JsonRpcErrorCodes, isJsonRpcRequest, type JsonRpcRequest, type ProtocolMessage } from '../../common/state/sessionProtocol.js';
import { type IWSLAgentHostConfig, type IWSLConnectResult, type IWSLConnectProgress, type IWSLRemoteAgentHostMainService } from '../../common/wslRemoteAgentHost.js';
import { IWSLRelayClientFactory, WSLRelayClientFactory, WSLRemoteAgentHostService } from '../../electron-browser/wslRemoteAgentHostServiceImpl.js';

class TestProtocolTransport extends Disposable implements IProtocolTransport {
	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	readonly sentMessages: ProtocolMessage[] = [];
	private readonly _initializeRequest = new DeferredPromise<JsonRpcRequest>();

	constructor(
		private readonly _connectionId: string,
		private readonly _initializedRelays: Set<string>,
	) {
		super();
	}

	send(message: ProtocolMessage): void {
		this.sentMessages.push(message);
		if (isJsonRpcRequest(message) && message.method === 'initialize') {
			void this._initializeRequest.complete(message);
		}
	}

	async completeInitialize(): Promise<void> {
		const initialize = await this._initializeRequest.p;
		if (this._initializedRelays.has(this._connectionId)) {
			this._onMessage.fire({
				jsonrpc: '2.0',
				id: initialize.id,
				error: { code: JsonRpcErrorCodes.MethodNotFound, message: 'Method not found: initialize' },
			});
			return;
		}
		this._initializedRelays.add(this._connectionId);
		this._onMessage.fire({
			jsonrpc: '2.0',
			id: initialize.id,
			result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] },
		});
	}

	async rejectInitialize(): Promise<void> {
		const initialize = await this._initializeRequest.p;
		this._onMessage.fire({
			jsonrpc: '2.0',
			id: initialize.id,
			error: { code: AHP_UNSUPPORTED_PROTOCOL_VERSION, message: 'Unsupported protocol version' },
		});
	}

	fireClose(): void {
		this._onClose.fire();
	}
}

class MockWSLMainService extends Disposable implements IWSLRemoteAgentHostMainService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidCloseConnection = this._register(new Emitter<string>());
	readonly onDidCloseConnection = this._onDidCloseConnection.event;
	private readonly _onDidRelayMessage = this._register(new Emitter<{ connectionId: string; data: string }>());
	readonly onDidRelayMessage = this._onDidRelayMessage.event;
	private readonly _onDidRelayClose = this._register(new Emitter<string>());
	readonly onDidRelayClose = this._onDidRelayClose.event;
	private readonly _onDidReconnect = this._register(new Emitter<void>());
	readonly onDidReconnect = this._onDidReconnect.event;
	private readonly _onDidReleaseRelay = this._register(new Emitter<string>());
	readonly onDidReleaseRelay = this._onDidReleaseRelay.event;
	readonly onDidChangeConnections = Event.None;
	readonly onDidReportConnectProgress: Event<IWSLConnectProgress> = Event.None;

	private connectionCounter = 0;
	private readonly connections = new Map<string, IWSLConnectResult>();
	readonly connectCalls: IWSLAgentHostConfig[] = [];
	readonly disconnectCalls: string[] = [];
	readonly releaseRelayCalls: string[] = [];
	readonly initializedRelays = new Set<string>();
	nextConnectError: Error | undefined;
	deferredReconnect: DeferredPromise<IWSLConnectResult> | undefined;
	runningDistros: Promise<string[]> = Promise.resolve(['Ubuntu']);

	async isWSLAvailable(): Promise<boolean> {
		return true;
	}

	async listDistros() {
		return [{ name: 'Ubuntu', isDefault: true, isRunning: true, version: 2 as const }];
	}

	listRunningDistros(): Promise<string[]> {
		return this.runningDistros;
	}

	async connect(config: IWSLAgentHostConfig): Promise<IWSLConnectResult> {
		this.connectCalls.push(config);
		const error = this.nextConnectError;
		this.nextConnectError = undefined;
		if (error) {
			throw error;
		}
		const connection = this._newConnection(config.distro, config.name);
		this.connections.set(connection.connectionId, connection);
		return connection;
	}

	async reconnect(distro: string, name: string, _remoteAgentHostCommand?: string, _userInitiated?: boolean, expectedConnectionId?: string): Promise<IWSLConnectResult> {
		this._onDidReconnect.fire();
		if (this.deferredReconnect) {
			return this.deferredReconnect.p;
		}
		const connection = this._newConnection(distro, name);
		this.connections.set(connection.connectionId, connection);
		if (expectedConnectionId) {
			this._closeConnection(expectedConnectionId);
		}
		return connection;
	}

	async disconnect(distro: string): Promise<void> {
		this.disconnectCalls.push(distro);
		for (const connection of [...this.connections.values()]) {
			if (connection.distro === distro) {
				this._closeConnection(connection.connectionId);
			}
		}
	}

	closeActiveConnection(): void {
		const [connection] = this.connections.values();
		if (connection) {
			this._closeConnection(connection.connectionId);
		}
	}

	fireRelayClose(connectionId: string): void {
		this._onDidRelayClose.fire(connectionId);
	}

	async relaySend(connectionId: string, message: string): Promise<void> {
		const request = JSON.parse(message) as { readonly id?: number; readonly method?: string };
		if (request.method !== 'initialize' || typeof request.id !== 'number') {
			return;
		}
		if (this.initializedRelays.has(connectionId)) {
			this._onDidRelayMessage.fire({ connectionId, data: JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: JsonRpcErrorCodes.MethodNotFound, message: 'Method not found: initialize' } }) });
			return;
		}
		this.initializedRelays.add(connectionId);
		this._onDidRelayMessage.fire({ connectionId, data: JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] } }) });
	}
	async releaseRelay(connectionId: string): Promise<void> {
		this.releaseRelayCalls.push(connectionId);
		this._onDidReleaseRelay.fire(connectionId);
		this._closeConnection(connectionId);
	}

	private _newConnection(distro: string, name: string): IWSLConnectResult {
		const connectionId = `connection-${++this.connectionCounter}`;
		return { connectionId, address: `wsl:${distro}`, distro, name, connectionToken: undefined };
	}

	private _closeConnection(connectionId: string): void {
		const connection = this.connections.get(connectionId);
		if (connection) {
			this.connections.delete(connectionId);
			this._onDidCloseConnection.fire(connection.connectionId);
		}
	}
}

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
			const value = (target as Record<string, unknown>)[event];
			if (typeof value !== 'function') {
				throw new Error(`MockChannel: no event ${event}`);
			}
			return value as Event<T>;
		},
	};
}

suite('WSLRemoteAgentHostService (renderer)', () => {
	const disposables = new DisposableStore();
	let mainService: MockWSLMainService;
	let instantiationService: TestInstantiationService;
	let remoteAgentHostService: EditorWindowRemoteAgentHostService;
	let service: WSLRemoteAgentHostService;
	let transports: TestProtocolTransport[];

	setup(() => {
		instantiationService = disposables.add(new TestInstantiationService());
		const configurationService = new TestConfigurationService({
			[RemoteAgentHostsEnabledSettingId]: true,
			[RemoteAgentHostAutoConnectSettingId]: false,
		});
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		mainService = disposables.add(new MockWSLMainService());
		transports = [];

		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(IEnvironmentService, { logsHome: URI.file('/logs') } as Partial<IEnvironmentService>);
		instantiationService.stub(ILabelService, {
			registerFormatter: () => toDisposable(() => undefined),
		} as Partial<ILabelService>);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IAgentHostResourceService, new class extends mock<IAgentHostResourceService>() {
			override connectionClosed(): void { }
		});
		instantiationService.stub(IWorkspaceTrustEnablementService, new class extends mock<IWorkspaceTrustEnablementService>() {
			override isWorkspaceTrustEnabled() { return false; }
		});
		instantiationService.stub(IWorkspaceTrustManagementService, new class extends mock<IWorkspaceTrustManagementService>() {
			override readonly onDidChangeTrustedFolders = Event.None;
			override readonly onDidChangeTrust = Event.None;
			override getTrustedUris() { return []; }
		});
		instantiationService.stub(IWorkspaceTrustRequestService, new class extends mock<IWorkspaceTrustRequestService>() { });
		instantiationService.stub(ISharedProcessService, {
			getChannel: () => asChannel(mainService),
		} as Partial<ISharedProcessService>);

		remoteAgentHostService = disposables.add(instantiationService.createInstance(EditorWindowRemoteAgentHostService));
		instantiationService.stub(IRemoteAgentHostService, remoteAgentHostService);
		instantiationService.stub(IWSLRelayClientFactory, {
			createClient: (relayMainService, connectionId, address) => {
				const transport = disposables.add(new TestProtocolTransport(connectionId, mainService.initializedRelays));
				transports.push(transport);
				return instantiationService.createInstance(AgentHostProtocolClient,
					address,
					transport,
					{
						onDispose: () => {
							void relayMainService.releaseRelay(connectionId);
						},
					},
				);
			},
		} as Partial<IWSLRelayClientFactory>);

		service = disposables.add(instantiationService.createInstance(WSLRemoteAgentHostService));
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	async function connect(config: IWSLAgentHostConfig = { distro: 'Ubuntu', name: 'Ubuntu' }): Promise<void> {
		const promise = service.connect(config);
		while (transports.length === 0) {
			await Event.toPromise(remoteAgentHostService.onDidChangeConnections);
		}
		await transports[0].completeInitialize();
		await promise;
	}

	test('reuses a connected renderer client and handle for repeated connects', async () => {
		await connect();
		const firstHandle = service.connections[0];
		const secondHandle = await service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });

		assert.deepStrictEqual({
			sameHandle: firstHandle === secondHandle,
			transportCount: transports.length,
			connectCalls: mainService.connectCalls.length,
		}, {
			sameHandle: true,
			transportCount: 1,
			connectCalls: 1,
		});
	});

	test('coalesces concurrent connects through one factory and initialize handshake', async () => {
		const first = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		const second = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		while (transports.length === 0) {
			await Event.toPromise(remoteAgentHostService.onDidChangeConnections);
		}
		await transports[0].completeInitialize();
		const [firstHandle, secondHandle] = await Promise.all([first, second]);

		assert.deepStrictEqual({
			sameHandle: firstHandle === secondHandle,
			transportCount: transports.length,
			connectCalls: mainService.connectCalls.length,
		}, {
			sameHandle: true,
			transportCount: 1,
			connectCalls: 1,
		});
	});

	test('promotes a background connect when a user connects while its running-distro check is pending', async () => {
		const runningDistros = new DeferredPromise<string[]>();
		mainService.runningDistros = runningDistros.p;
		const background = service.connect({ distro: 'Ubuntu', name: 'Ubuntu', userInitiated: false });
		const user = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		runningDistros.complete([]);
		while (transports.length === 0) {
			await Event.toPromise(remoteAgentHostService.onDidChangeConnections);
		}
		await transports[0].completeInitialize();
		await Promise.all([background, user]);

		assert.deepStrictEqual(mainService.connectCalls, [{ distro: 'Ubuntu', name: 'Ubuntu', userInitiated: true }]);
	});

	test('replaces a retained main-process relay before the first renderer protocol client', async () => {
		const retained = await mainService.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		mainService.initializedRelays.add(retained.connectionId);
		await connect();

		assert.deepStrictEqual({
			connectCalls: mainService.connectCalls.length,
			transportCount: transports.length,
			initializedRelays: [...mainService.initializedRelays],
		}, {
			connectCalls: 2,
			transportCount: 1,
			initializedRelays: ['connection-1', 'connection-2'],
		});
	});

	test('keeps the replacement relay alive when explicitly recovering a live client', async () => {
		await connect();
		const reconnect = service.reconnect('Ubuntu', 'Ubuntu', false);
		while (transports.length < 2) {
			await Event.toPromise(remoteAgentHostService.onDidChangeConnections);
		}
		await transports[1].completeInitialize();
		await reconnect;

		assert.deepStrictEqual({
			transportCount: transports.length,
			connectCalls: mainService.connectCalls.length,
			disconnectCalls: mainService.disconnectCalls,
			connectionCount: service.connections.length,
			userInitiated: mainService.connectCalls.map(call => call.userInitiated),
		}, {
			transportCount: 2,
			connectCalls: 2,
			disconnectCalls: [],
			connectionCount: 1,
			userInitiated: [true, false],
		});

	});

	test('allows a user retry after a failed factory connection', async () => {
		mainService.nextConnectError = new Error('WSL bootstrap failed');
		await assert.rejects(service.connect({ distro: 'Ubuntu', name: 'Ubuntu' }), /WSL bootstrap failed/);
		await connect();

		assert.deepStrictEqual({
			connectCalls: mainService.connectCalls.length,
			transportCount: transports.length,
			connectionCount: service.connections.length,
		}, {
			connectCalls: 2,
			transportCount: 1,
			connectionCount: 1,
		});
	});

	test('builds a replacement when the main process closes the renderer handle during recovery', async () => {
		await connect();
		mainService.closeActiveConnection();

		const recovery = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		while (transports.length < 2) {
			await Event.toPromise(remoteAgentHostService.onDidChangeConnections);
		}
		await transports[1].completeInitialize();
		await recovery;

		assert.deepStrictEqual({
			transportCount: transports.length,
			connectCalls: mainService.connectCalls.length,
			connectionCount: service.connections.length,
		}, {
			transportCount: 2,
			connectCalls: 2,
			connectionCount: 1,
		});
	});

	test('replaces the relay when a retained incompatible client cannot be reused', async () => {
		const initial = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		while (transports.length === 0) {
			await Event.toPromise(remoteAgentHostService.onDidChangeConnections);
		}
		await transports[0].rejectInitialize();
		await assert.rejects(() => initial, /Unsupported protocol version/);

		const recovery = service.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		while (transports.length < 2) {
			await Event.toPromise(remoteAgentHostService.onDidChangeConnections);
		}
		await transports[1].completeInitialize();
		await recovery;

		assert.deepStrictEqual({
			transportCount: transports.length,
			connectCalls: mainService.connectCalls.length,
			disconnectCalls: mainService.disconnectCalls,
			connectionCount: service.connections.length,
		}, {
			transportCount: 2,
			connectCalls: 2,
			disconnectCalls: [],
			connectionCount: 1,
		});
	});

	test('releases a late replacement relay after the protocol client is disposed', async () => {
		const initial = await mainService.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		const replacement = new DeferredPromise<IWSLConnectResult>();
		mainService.deferredReconnect = replacement;
		const relayFactory = instantiationService.createInstance(WSLRelayClientFactory);
		const client = disposables.add(relayFactory.createClient(mainService, initial.connectionId, initial.address, initial, undefined));

		await client.connect();
		const reconnectStarted = Event.toPromise(mainService.onDidReconnect);
		mainService.fireRelayClose(initial.connectionId);
		await reconnectStarted;
		const lateRelease = Event.toPromise(Event.filter(mainService.onDidReleaseRelay, connectionId => connectionId === 'late-relay'));
		client.dispose();
		replacement.complete({
			connectionId: 'late-relay',
			address: initial.address,
			distro: initial.distro,
			name: initial.name,
			connectionToken: initial.connectionToken,
		});
		await lateRelease;

		assert.deepStrictEqual(mainService.releaseRelayCalls, [initial.connectionId, 'late-relay']);
	});
});
