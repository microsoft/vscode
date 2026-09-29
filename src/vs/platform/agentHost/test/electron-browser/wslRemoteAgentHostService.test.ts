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
import { IWSLRelayClientFactory, WSLRemoteAgentHostService } from '../../electron-browser/wslRemoteAgentHostServiceImpl.js';

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
	readonly onDidChangeConnections = Event.None;
	readonly onDidReportConnectProgress: Event<IWSLConnectProgress> = Event.None;
	readonly onDidRelayMessage = Event.None;
	readonly onDidRelayClose = Event.None;

	private connectionCounter = 0;
	private activeConnection: IWSLConnectResult | undefined;
	readonly connectCalls: IWSLAgentHostConfig[] = [];
	readonly reconnectCalls: Array<{ distro: string; name: string; userInitiated: boolean | undefined }> = [];
	readonly disconnectCalls: string[] = [];
	readonly initializedRelays = new Set<string>();
	nextReconnectError: Error | undefined;
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
		return this.activeConnection ??= this._newConnection(config.distro, config.name);
	}

	async reconnect(distro: string, name: string, _remoteAgentHostCommand?: string, userInitiated?: boolean): Promise<IWSLConnectResult> {
		this.reconnectCalls.push({ distro, name, userInitiated });
		this._closeActiveConnection();
		const error = this.nextReconnectError;
		this.nextReconnectError = undefined;
		if (error) {
			throw error;
		}
		return this.activeConnection = this._newConnection(distro, name);
	}

	async disconnect(distro: string): Promise<void> {
		this.disconnectCalls.push(distro);
		this._closeActiveConnection();
	}

	closeActiveConnection(): void {
		this._closeActiveConnection();
	}

	async relaySend(_connectionId: string, _message: string): Promise<void> { }

	private _newConnection(distro: string, name: string): IWSLConnectResult {
		const connectionId = `connection-${++this.connectionCounter}`;
		return { connectionId, address: `wsl:${distro}`, distro, name, connectionToken: undefined };
	}

	private _closeActiveConnection(): void {
		const connection = this.activeConnection;
		this.activeConnection = undefined;
		if (connection) {
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
	let remoteAgentHostService: EditorWindowRemoteAgentHostService;
	let service: WSLRemoteAgentHostService;
	let transports: TestProtocolTransport[];

	setup(() => {
		const instantiationService = disposables.add(new TestInstantiationService());
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
			createClient: (_mainService, connectionId, address) => {
				const transport = disposables.add(new TestProtocolTransport(connectionId, mainService.initializedRelays));
				transports.push(transport);
				return instantiationService.createInstance(AgentHostProtocolClient,
					address,
					transport,
					undefined,
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
			reconnectCalls: mainService.reconnectCalls.length,
		}, {
			sameHandle: true,
			transportCount: 1,
			reconnectCalls: 1,
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
			reconnectCalls: mainService.reconnectCalls.length,
		}, {
			sameHandle: true,
			transportCount: 1,
			reconnectCalls: 1,
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

		assert.deepStrictEqual(mainService.reconnectCalls, [{ distro: 'Ubuntu', name: 'Ubuntu', userInitiated: true }]);
	});

	test('replaces a retained main-process relay before the first renderer protocol client', async () => {
		const retained = await mainService.connect({ distro: 'Ubuntu', name: 'Ubuntu' });
		mainService.initializedRelays.add(retained.connectionId);
		await connect();

		assert.deepStrictEqual({
			connectCalls: mainService.connectCalls.length,
			reconnectCalls: mainService.reconnectCalls.length,
			transportCount: transports.length,
			initializedRelays: [...mainService.initializedRelays],
		}, {
			connectCalls: 1,
			reconnectCalls: 1,
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
			reconnectCalls: mainService.reconnectCalls.length,
			disconnectCalls: mainService.disconnectCalls,
			connectionCount: service.connections.length,
			userInitiated: mainService.reconnectCalls.map(call => call.userInitiated),
		}, {
			transportCount: 2,
			reconnectCalls: 2,
			disconnectCalls: ['Ubuntu'],
			connectionCount: 1,
			userInitiated: [true, false],
		});

	});

	test('allows a user retry after a failed factory connection', async () => {
		mainService.nextReconnectError = new Error('WSL bootstrap failed');
		await assert.rejects(service.connect({ distro: 'Ubuntu', name: 'Ubuntu' }), /WSL bootstrap failed/);
		await connect();

		assert.deepStrictEqual({
			reconnectCalls: mainService.reconnectCalls.length,
			transportCount: transports.length,
			connectionCount: service.connections.length,
		}, {
			reconnectCalls: 2,
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
			reconnectCalls: mainService.reconnectCalls.length,
			connectionCount: service.connections.length,
		}, {
			transportCount: 2,
			reconnectCalls: 2,
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
			reconnectCalls: mainService.reconnectCalls.length,
			disconnectCalls: mainService.disconnectCalls,
			connectionCount: service.connections.length,
		}, {
			transportCount: 2,
			reconnectCalls: 2,
			disconnectCalls: ['Ubuntu'],
			connectionCount: 1,
		});
	});
});
