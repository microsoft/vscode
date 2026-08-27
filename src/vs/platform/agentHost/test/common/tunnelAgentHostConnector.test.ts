/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	TUNNEL_STEP_TIMEOUT_MS,
	TunnelAgentHostConnector,
	deriveConnectionToken,
	type ITunnelAgentHostConnectorLogService,
	type ITunnelDescriptor,
	type ITunnelRelayClient,
	type ITunnelRelayClientFactory,
	type ITunnelRelayClientSession,
	type ITunnelSocketFactory,
} from '../../common/tunnelAgentHostConnector.js';
import type { ITunnelDuplexStream, ITunnelMessageSocket, ITunnelSocketCloseEvent } from '../../common/tunnelMessageSocket.js';

class FakeStream implements ITunnelDuplexStream {
	on(_event: 'data', _listener: (data: Uint8Array) => void): this;
	on(_event: 'error', _listener: (error: Error) => void): this;
	on(_event: 'close', _listener: (hadError?: boolean) => void): this;
	on(_event: 'end', _listener: () => void): this;
	on(_event: 'data' | 'error' | 'end' | 'close', _listener: ((data: Uint8Array) => void) | ((error: Error) => void) | ((hadError?: boolean) => void) | (() => void)): this {
		return this;
	}

	removeListener(_event: 'data', _listener: (data: Uint8Array) => void): void;
	removeListener(_event: 'error', _listener: (error: Error) => void): void;
	removeListener(_event: 'close', _listener: (hadError?: boolean) => void): void;
	removeListener(_event: 'end', _listener: () => void): void;
	removeListener(_event: 'data' | 'error' | 'end' | 'close', _listener: ((data: Uint8Array) => void) | ((error: Error) => void) | ((hadError?: boolean) => void) | (() => void)): void {
	}

	write(_data: string | Uint8Array): boolean {
		return true;
	}

	end(): void {
	}

	destroy(): void {
	}

}

class FakeRelayClient implements ITunnelRelayClient {
	disposeCalls = 0;
	readonly stream = new FakeStream();

	constructor(private readonly _connectResult: Promise<void> = Promise.resolve()) {
	}

	connect(): Promise<void> {
		return this._connectResult;
	}

	async waitForForwardedPort(_port: number): Promise<void> {
	}

	async connectToForwardedPort(_port: number): Promise<ITunnelDuplexStream> {
		return this.stream;
	}

	dispose(): void {
		this.disposeCalls++;
	}
}

class FakeSocket implements ITunnelMessageSocket {
	private readonly _onDidReceiveMessage = new Emitter<string>();
	private readonly _onDidClose = new Emitter<ITunnelSocketCloseEvent>();
	private readonly _queuedMessages: string[];

	readonly onDidReceiveMessage: Event<string> = (listener, thisArgs, disposables) => {
		const disposable = this._onDidReceiveMessage.event(listener, thisArgs, disposables);
		const message = this._queuedMessages.shift();
		if (message !== undefined) {
			if (this._replaySynchronously) {
				listener.call(thisArgs, message);
			} else {
				queueMicrotask(() => this._onDidReceiveMessage.fire(message));
			}
		}
		return disposable;
	};
	readonly onDidClose = this._onDidClose.event;
	closeCalls = 0;
	disposeCalls = 0;

	constructor(messages: string[] = [], private readonly _replaySynchronously = false) {
		this._queuedMessages = messages;
	}

	send(_data: string): void {
	}

	close(): void {
		this.closeCalls++;
	}

	dispose(): void {
		this.disposeCalls++;
		this._onDidReceiveMessage.dispose();
		this._onDidClose.dispose();
	}
}

class FakeRelayClientFactory implements ITunnelRelayClientFactory {
	getTunnelCalls = 0;
	createRelayClientCalls = 0;

	constructor(
		private readonly _tunnel: ITunnelDescriptor,
		private readonly _relayClient: FakeRelayClient,
	) {
	}

	async getTunnel(_tunnelId: string, _clusterId: string, _authProvider: 'github' | 'microsoft', _token: string): Promise<ITunnelRelayClientSession> {
		this.getTunnelCalls++;
		return {
			tunnel: this._tunnel,
			createRelayClient: async () => {
				this.createRelayClientCalls++;
				return this._relayClient;
			},
		};
	}
}

class FakeSocketFactory implements ITunnelSocketFactory {
	readonly paths: string[] = [];

	constructor(private readonly _result: FakeSocket | Error) {
	}

	async open(_stream: ITunnelDuplexStream, path: string): Promise<ITunnelMessageSocket> {
		this.paths.push(path);
		if (this._result instanceof Error) {
			throw this._result;
		}
		return this._result;
	}
}

class FakeLogService implements ITunnelAgentHostConnectorLogService {
	info(_message: string): void {
	}

	warn(_message: string): void {
	}
}

function createConnector(tunnel: ITunnelDescriptor, relayClient: FakeRelayClient, socketFactory: FakeSocketFactory): { connector: TunnelAgentHostConnector; relayClientFactory: FakeRelayClientFactory } {
	const relayClientFactory = new FakeRelayClientFactory(tunnel, relayClient);
	return {
		connector: new TunnelAgentHostConnector(relayClientFactory, socketFactory, new FakeLogService()),
		relayClientFactory,
	};
}

suite('TunnelAgentHostConnector', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('derives the same base64url tokens as Node crypto, including a leading dash', async () => {
		const inputs = ['tunnel-1', 'hello', 'leading-dash-58'];
		assert.deepStrictEqual(await Promise.all(inputs.map(deriveConnectionToken)), [
			'2mxIRS3JlBYT5m8W60ZoVokDhMuN2H6YCF0ABgYB5U8',
			'LPJNul-wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ',
			'a-Vv_dDaSd407TSoKmBuY8Jrx1w_cDjpHarRcBiCPpxc',
		]);
	});

	test('uses the legacy root route for v5 and the gateway route for v6', async () => {
		const legacyRelay = new FakeRelayClient();
		const legacySocketFactory = new FakeSocketFactory(new FakeSocket());
		const { connector: legacyConnector, relayClientFactory: legacyFactory } = createConnector(
			{ tunnelId: 'legacy', clusterId: 'cluster', labels: ['protocolv5'] },
			legacyRelay,
			legacySocketFactory,
		);
		const gatewayRelay = new FakeRelayClient();
		const gatewaySocketFactory = new FakeSocketFactory(new FakeSocket([
			JSON.stringify({ userDataPath: '/data', endpoints: [] }),
		]));
		const { connector: gatewayConnector, relayClientFactory: gatewayFactory } = createConnector(
			{ tunnelId: 'gateway', clusterId: 'cluster', labels: ['protocolv6'] },
			gatewayRelay,
			gatewaySocketFactory,
		);

		try {
			const [legacy, gateway, legacyConnection] = await Promise.all([
				legacyConnector.prepareSelection('token', 'github', 'legacy', 'cluster'),
				gatewayConnector.prepareSelection('token', 'github', 'gateway', 'cluster'),
				legacyConnector.connect('token', 'github', 'legacy', 'cluster'),
			]);
			assert.deepStrictEqual({
				legacy,
				legacyRelayCreations: legacyFactory.createRelayClientCalls,
				legacySocketPaths: legacySocketFactory.paths,
				gatewayInventory: gateway?.inventory,
				gatewayRelayCreations: gatewayFactory.createRelayClientCalls,
				gatewaySocketPaths: gatewaySocketFactory.paths,
			}, {
				legacy: undefined,
				legacyRelayCreations: 1,
				legacySocketPaths: ['/?tkn=xJ_qdCX6f4aZiXqXwVnGaQJn2QA7t4xT-vqPwVwyXYQ'],
				gatewayInventory: { userDataPath: '/data', endpoints: [] },
				gatewayRelayCreations: 1,
				gatewaySocketPaths: ['/agent-host/select'],
			});
			await legacyConnector.disconnect(legacyConnection.connectionId);
		} finally {
			legacyConnector.dispose();
			gatewayConnector.dispose();
		}
	});

	test('times out a relay step and disposes the relay client', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const hangingConnect = new DeferredPromise<void>();
			const relayClient = new FakeRelayClient(hangingConnect.p);
			const { connector } = createConnector(
				{ tunnelId: 'timed-out', clusterId: 'cluster', labels: ['protocolv5'] },
				relayClient,
				new FakeSocketFactory(new FakeSocket()),
			);
			try {
				const rejected = connector.connect('token', 'github', 'timed-out', 'cluster').catch(error => error);
				await timeout(TUNNEL_STEP_TIMEOUT_MS + 1);
				const error = await rejected;
				assert.deepStrictEqual({
					isTimeout: error instanceof Error && /tunnel relay connect timed out/.test(error.message),
					disposeCalls: relayClient.disposeCalls,
				}, {
					isTimeout: true,
					disposeCalls: 1,
				});
				hangingConnect.complete();
			} finally {
				connector.dispose();
			}
		});
	});

	test('disposes the relay client when opening the legacy socket fails', async () => {
		const relayClient = new FakeRelayClient();
		const { connector } = createConnector(
			{ tunnelId: 'socket-failure', clusterId: 'cluster', labels: ['protocolv5'] },
			relayClient,
			new FakeSocketFactory(new Error('socket open failed')),
		);
		try {
			await assert.rejects(
				() => connector.connect('token', 'github', 'socket-failure', 'cluster'),
				/socket open failed/,
			);
			assert.strictEqual(relayClient.disposeCalls, 1);
		} finally {
			connector.dispose();
		}
	});

	test('disposes active tunnel connections when the connector is disposed', async () => {
		const relayClient = new FakeRelayClient();
		const socket = new FakeSocket();
		const { connector } = createConnector(
			{ tunnelId: 'active', clusterId: 'cluster', labels: ['protocolv5'] },
			relayClient,
			new FakeSocketFactory(socket),
		);

		await connector.connect('token', 'github', 'active', 'cluster');
		connector.dispose();

		assert.deepStrictEqual({
			socketCloseCalls: socket.closeCalls,
			socketDisposeCalls: socket.disposeCalls,
			relayDisposeCalls: relayClient.disposeCalls,
		}, {
			socketCloseCalls: 1,
			socketDisposeCalls: 1,
			relayDisposeCalls: 1,
		});
	});

	test('cleans up when the gateway inventory is malformed', async () => {
		const relayClient = new FakeRelayClient();
		const socket = new FakeSocket(['{}']);
		const { connector } = createConnector(
			{ tunnelId: 'bad-inventory', clusterId: 'cluster', labels: ['protocolv6'] },
			relayClient,
			new FakeSocketFactory(socket),
		);
		try {
			await assert.rejects(
				() => connector.prepareSelection('token', 'github', 'bad-inventory', 'cluster'),
				/invalid "userDataPath"/,
			);
			assert.deepStrictEqual({
				socketCloseCalls: socket.closeCalls,
				socketDisposeCalls: socket.disposeCalls,
				relayDisposeCalls: relayClient.disposeCalls,
			}, {
				socketCloseCalls: 1,
				socketDisposeCalls: 1,
				relayDisposeCalls: 1,
			});
		} finally {
			connector.dispose();
		}
	});

	test('cleans up when the gateway selection acknowledgement is malformed', async () => {
		const relayClient = new FakeRelayClient();
		const socket = new FakeSocket([
			JSON.stringify({ userDataPath: '/data', endpoints: [] }),
			'{}',
		]);
		const { connector } = createConnector(
			{ tunnelId: 'bad-ack', clusterId: 'cluster', labels: ['protocolv6'] },
			relayClient,
			new FakeSocketFactory(socket),
		);
		try {
			const selection = await connector.prepareSelection('token', 'github', 'bad-ack', 'cluster');
			await assert.rejects(
				() => connector.completeSelection(selection!.selectionId, { newDedicated: true }),
				/not a valid response/,
			);
			assert.deepStrictEqual({
				socketCloseCalls: socket.closeCalls,
				socketDisposeCalls: socket.disposeCalls,
				relayDisposeCalls: relayClient.disposeCalls,
			}, {
				socketCloseCalls: 1,
				socketDisposeCalls: 1,
				relayDisposeCalls: 1,
			});
		} finally {
			connector.dispose();
		}
	});

	test('accepts a gateway inventory replayed synchronously by the socket', async () => {
		const relayClient = new FakeRelayClient();
		const socket = new FakeSocket([
			JSON.stringify({ userDataPath: '/data', endpoints: [] }),
		], true);
		const { connector } = createConnector(
			{ tunnelId: 'sync-inventory', clusterId: 'cluster', labels: ['protocolv6'] },
			relayClient,
			new FakeSocketFactory(socket),
		);
		try {
			const selection = await connector.prepareSelection('token', 'github', 'sync-inventory', 'cluster');
			assert.deepStrictEqual(selection?.inventory, { userDataPath: '/data', endpoints: [] });
			await connector.cancelSelection(selection!.selectionId);
		} finally {
			connector.dispose();
		}
	});
});
