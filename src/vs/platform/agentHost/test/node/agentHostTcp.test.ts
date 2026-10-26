/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { once } from 'events';
import { createServer, Socket } from 'net';
import { randomBytes } from 'crypto';
import { DeferredPromise } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { hasKey } from '../../../../base/common/types.js';
import { vObj, vString } from '../../../../base/common/validation.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../workspace/common/workspaceTrust.js';
// This loopback integration test exercises the renderer client and native host together.
// eslint-disable-next-line local/code-layering, local/code-import-patterns
import { AgentHostProtocolClient } from '../../browser/agentHostProtocolClient.js';
import type { IAgentService } from '../../common/agentService.js';
import { IAgentHostResourceService } from '../../common/agentHostResourceService.js';
import { AgentHostFileSystemProvider } from '../../common/agentHostFileSystemProvider.js';
import { NullAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';
import { AgentHostTcpBudget, agentHostTcpReceiveLimits, type IAgentHostTcpConnection } from '../../common/agentHostTcpConnection.js';
import { parseProtocolMessage, type IProtocolTransport } from '../../common/state/sessionTransport.js';
import { isJsonRpcNotification, isJsonRpcResponse, ProtocolError, type ProtocolMessage, type JsonRpcRequest } from '../../common/state/sessionProtocol.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostClientConnectionService } from '../../node/agentHostClientConnectionService.js';
import { AgentHostManagedSettingsService } from '../../node/agentHostManagedSettingsService.js';
import { ProtocolServerHandler } from '../../node/protocolServerHandler.js';
import { authenticateAgentHostTransport } from '../../node/agentHostTransportAuthentication.js';
import { MockDevContainerService } from '../common/mockDevContainerService.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';
import { AgentHostClientConnectionKind } from '../../common/agentHostTelemetry.js';

class RecordingLogService extends NullLogService {
	readonly warnings: string[] = [];
	readonly errors: string[] = [];
	override warn(message: string): void { this.warnings.push(message); }
	override error(message: string | Error): void { this.errors.push(String(message)); }
}

class Wire extends Disposable implements IProtocolTransport {
	private readonly _message = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._message.event;
	private readonly _close = this._register(new Emitter<void>());
	readonly onClose = this._close.event;
	peer!: Wire;
	closed = false;
	get disposed(): boolean { return this._store.isDisposed; }
	clientConnectionKind: AgentHostClientConnectionKind | undefined;
	rewriteMessage: ((message: Parameters<IProtocolTransport['send']>[0]) => Parameters<IProtocolTransport['send']>[0]) | undefined;
	readonly sent: Parameters<IProtocolTransport['send']>[0][] = [];

	request(request: JsonRpcRequest): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const listener = this.onMessage(message => {
				if (isJsonRpcResponse(message) && message.id === request.id) {
					listener.dispose();
					if (hasKey(message, { error: true })) {
						reject(new ProtocolError(message.error.code, message.error.message));
					} else {
						resolve(message.result);
					}
				}
			});
			this._register(listener);
			this.send(request);
		});
	}

	send(message: Parameters<IProtocolTransport['send']>[0]): void {
		if (this.closed) { throw new Error('Transport closed'); }
		message = this.rewriteMessage?.(message) ?? message;
		this.sent.push(message);
		this.peer._message.fire(parseProtocolMessage(JSON.stringify(message)));
	}

	drop(): void {
		this.closed = this.peer.closed = true;
		this.peer._close.fire();
		this._close.fire();
	}
}

suite('AHP windowed TCP', function () {
	this.timeout(20_000);
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function harness(onConnection: (socket: Socket) => void, authenticated = true, advertiseTcp = true) {
		const sockets = new Set<Socket>();
		const destination = createServer({ allowHalfOpen: true }, socket => {
			sockets.add(socket);
			socket.on('error', () => { });
			socket.on('close', () => sockets.delete(socket));
			onConnection(socket);
		});
		destination.listen(0, '127.0.0.1');
		await once(destination, 'listening');
		store.add(toDisposable(() => {
			for (const socket of sockets) { socket.destroy(); }
			destination.close();
		}));
		const address = destination.address();
		assert.ok(address && typeof address !== 'string');
		const log = new RecordingLogService();
		const state = store.add(new AgentHostStateManager(log));
		const service = new class extends mock<IAgentService>() {
			override readonly onMcpNotification = Event.None;
			override addSubscriber(): void { }
			override unsubscribe(): void { }
			override dispatchAction(): void { }
			override async subscribe(resource: URI) {
				const snapshot = state.getSnapshot(resource.toString());
				assert.ok(snapshot);
				return snapshot;
			}
		}();
		const managedSettings = store.add(new AgentHostManagedSettingsService());
		const clientConnections = store.add(new AgentHostClientConnectionService());
		const devContainers = store.add(new MockDevContainerService());
		function listener(): Emitter<IProtocolTransport> {
			const connections = store.add(new Emitter<IProtocolTransport>());
			store.add(new ProtocolServerHandler(service, state, { onConnection: connections.event, address: 'test', dispose() { } }, {},
				store.add(new AgentHostFileSystemProvider()), log, NullTelemetryService,
				managedSettings, clientConnections, devContainers, NullAgentHostOTelService, createTestChatOwnershipService(state)));
			return connections;
		}
		const primaryListener = listener();
		let wire: Wire;
		function transport(connections = primaryListener): Wire {
			const local = store.add(new Wire());
			const remote = store.add(new Wire());
			local.peer = remote;
			remote.peer = local;
			if (!advertiseTcp) {
				remote.rewriteMessage = message => {
					if (hasKey(message, { result: true })) {
						const result = message.result;
						if (result && typeof result === 'object' && hasKey(result, { tcpConnections: true })) {
							return { ...message, result: { ...result, tcpConnections: undefined } };
						}
					}
					return message;
				};
			}
			if (authenticated) { authenticateAgentHostTransport(remote); }
			connections.fire(remote);
			return local;
		}
		const client = store.add(new AgentHostProtocolClient('tcp-test', () => wire = transport(), {
			clientId: 'tcp-client', loadEstimator: { hasHighLoad: () => false },
			reconnectPolicy: { autoRestore: true, initialDelayMs: 1, maxDelayMs: 1, maxAttempts: 1 },
		}, log, new class extends mock<IAgentHostResourceService>() {
			override connectionClosed(): void { }
		}(), new TestConfigurationService(), NullTelemetryService,
			new class extends mock<IWorkspaceTrustEnablementService>() {
				override isWorkspaceTrustEnabled(): boolean { return false; }
			}(), new class extends mock<IWorkspaceTrustManagementService>() {
				override readonly onDidChangeTrustedFolders = Event.None;
				override readonly onDidChangeTrust = Event.None;
				override getTrustedUris(): URI[] { return []; }
			}(), new class extends mock<IWorkspaceTrustRequestService>() { }()));
		await client.connect();
		return {
			client, log, get wire() { return wire; }, port: address.port, newTransport: transport,
			newListenerTransport: () => transport(listener()),
			open: () => client.openTcpConnection({ host: '127.0.0.1', port: address.port }),
		};
	}

	async function readAll(connection: IAgentHostTcpConnection): Promise<Buffer> {
		const chunks: Uint8Array[] = [];
		for (; ;) {
			const data = await connection.read();
			if (!data) { return Buffer.concat(chunks); }
			chunks.push(data.buffer);
		}
	}

	test('default clients use TCP capabilities on the released protocol version', async () => {
		const input = VSBuffer.fromString('capability-negotiated TCP');
		const h = await harness(socket => socket.on('data', data => socket.end(data)));
		assert.strictEqual(h.client.initializeResult.get()?.protocolVersion, '1.0.0');
		assert.deepStrictEqual(h.client.initializeResult.get()?.tcpConnections, {});
		const stream = store.add(await h.open());
		await stream.write(input);
		await stream.end();
		assert.deepStrictEqual(await readAll(stream), Buffer.from(input.buffer));
		await stream.drain();
	});

	test('clients do not open TCP destinations without an advertised capability', async () => {
		const h = await harness(() => { assert.fail('No TCP capability must not open a socket'); }, true, false);
		assert.strictEqual(h.client.initializeResult.get()?.protocolVersion, '1.0.0');
		assert.strictEqual(h.client.initializeResult.get()?.tcpConnections, undefined);
		await assert.rejects(h.open(), /does not support TCP/);
		assert.ok(!h.wire.sent.some(message => hasKey(message, { method: true }) && message.method === 'createTcpConnection'));
	});

	for (const kind of [AgentHostClientConnectionKind.WebPubSub, AgentHostClientConnectionKind.MissionControl]) {
		test(`rejects TCP before creation on unsupported ${kind} transports`, async () => {
			const h = await harness(() => { assert.fail('Unsupported transport must not open a socket'); });
			h.wire.clientConnectionKind = kind;
			assert.ok(h.client.initializeResult.get()?.tcpConnections);
			await assert.rejects(h.open(), /unavailable on Web PubSub/);
			assert.ok(!h.wire.sent.some(message => hasKey(message, { method: true }) && message.method === 'createTcpConnection'));
		});
	}

	test('snapshot failure sends exactly one reset and unsubscribe', async () => {
		const h = await harness(() => { });
		h.wire.peer.rewriteMessage = message => {
			if (hasKey(message, { method: true }) && message.method === 'channel/snapshot') {
				const { channel } = vObj({ channel: vString() }).validateOrThrow(message.params);
				return { jsonrpc: '2.0', method: 'channel/snapshot', params: { channel, snapshot: { resource: channel, state: { invalid: true }, fromSeq: 0 } } };
			}
			return message;
		};
		await assert.rejects(h.open(), /Invalid TCP snapshot/);
		const controls = h.wire.sent.filter(message => hasKey(message, { method: true }) && (message.method === 'unsubscribe' || message.method === 'tcp/reset'));
		assert.deepStrictEqual(controls.map(message => hasKey(message, { method: true }) ? message.method : undefined), ['tcp/reset', 'unsubscribe']);
		assert.deepStrictEqual({ warnings: h.log.warnings, errors: h.log.errors }, { warnings: [], errors: [] });
	});

	test('client cancellation and repeated teardown controls are quiet on the host', async () => {
		const h = await harness(() => { });
		const stream = store.add(await h.open());
		stream.dispose();
		for (const method of ['tcp/reset', 'unsubscribe']) {
			h.wire.send({ jsonrpc: '2.0', method, params: { channel: stream.resource } });
		}
		assert.deepStrictEqual({ warnings: h.log.warnings, errors: h.log.errors }, { warnings: [], errors: [] });
	});

	test('forwards binary data larger than a window and preserves half-close response', async () => {
		const input = randomBytes(512 * 1024);
		const received = new DeferredPromise<Buffer>();
		const { open } = await harness(socket => {
			const chunks: Buffer[] = [];
			socket.on('data', chunk => chunks.push(chunk));
			socket.on('end', () => {
				received.complete(Buffer.concat(chunks));
				socket.end(input);
			});
		});
		const stream = store.add(await open());
		const output = readAll(stream);
		await stream.write(VSBuffer.wrap(input));
		await stream.end();
		await stream.drain();
		assert.deepStrictEqual(await received.p, input);
		assert.deepStrictEqual(await output, input);
	});

	test('installs response routing before the empty snapshot, immediate data and EOF', async () => {
		const h = await harness(socket => socket.end('immediate response'));
		const stream = store.add(await h.open());
		assert.strictEqual((await readAll(stream)).toString(), 'immediate response');
		await stream.end();
		await stream.drain();
		const traffic = h.wire.peer.sent.filter(message => hasKey(message, { method: true })
			&& vObj({ channel: vString() }).validate(message.params).content?.channel === stream.resource);
		assert.ok(traffic[0] && hasKey(traffic[0], { method: true }));
		assert.strictEqual(traffic[0].method, 'channel/snapshot');
		assert.ok(!traffic.some(message => hasKey(message, { method: true }) && ['channel/ready', 'channel/reset', 'channel/frame'].includes(message.method)));
	});

	test('graceful disposal after remote EOF preserves buffered socket writes', async () => {
		const input = randomBytes(3 * 1024 * 1024);
		const received = new DeferredPromise<Buffer>();
		const h = await harness(socket => {
			socket.end('early response');
			socket.pause();
			const resume = setTimeout(() => socket.resume(), 50);
			socket.once('close', () => clearTimeout(resume));
			const chunks: Buffer[] = [];
			socket.on('data', chunk => chunks.push(chunk));
			socket.on('end', () => received.complete(Buffer.concat(chunks)));
		});
		const stream = store.add(await h.open());
		assert.strictEqual((await readAll(stream)).toString(), 'early response');
		await stream.write(VSBuffer.wrap(input));
		await stream.end();
		await stream.drain();
		stream.dispose();
		assert.deepStrictEqual(await received.p, input);
		assert.deepStrictEqual({ warnings: h.log.warnings, errors: h.log.errors }, { warnings: [], errors: [] });
	});

	test('transport loss fails old streams without replay; a fresh TCP stream works after reconnect', async () => {
		let accepted = 0;
		const h = await harness(socket => {
			accepted++;
			socket.on('data', chunk => socket.write(chunk));
		});
		const old = store.add(await h.open());
		const failedRead = assert.rejects(old.read(), /disconnected/);
		const reconnected = Event.toPromise(h.client.onDidReconnect);
		h.wire.drop();
		await failedRead;
		await reconnected;
		await assert.rejects(old.write(VSBuffer.fromString('must not replay')), /disconnected/);
		const current = store.add(await h.open());
		await current.write(VSBuffer.fromString('new connection'));
		assert.strictEqual((await current.read())?.toString(), 'new connection');
		assert.strictEqual(accepted, 2);
	});

	test('concurrent re-subscriptions preserve pending data, counters, snapshots, and socket identity', async () => {
		const input = randomBytes(512 * 1024);
		let accepted = 0;
		const h = await harness(socket => { accepted++; socket.end(input); });
		const stream = store.add(await h.open());
		await Promise.all([8192, 4096].map((windowBytes, index) => h.wire.request({
			jsonrpc: '2.0', id: 900 + index, method: 'subscribe', params: {
				channel: stream.resource, flowControl: { receive: { windowBytes, maximumFrameBytes: 1024 } },
			}
		})));
		assert.deepStrictEqual(await readAll(stream), input);
		await stream.end();
		await stream.drain();
		assert.strictEqual(accepted, 1);
		assert.strictEqual(h.wire.peer.sent.filter(message => hasKey(message, { method: true }) && message.method === 'channel/snapshot').length, 3);
	});

	test('a stalled reader does not block another stream or protocol ping', async () => {
		const input = randomBytes(512 * 1024);
		const h = await harness(socket => socket.end(input));
		store.add(await h.open());
		const current = store.add(await h.open());
		assert.strictEqual(await h.wire.request({ jsonrpc: '2.0', id: 901, method: 'ping', params: { channel: 'ahp-root:/' } }), null);
		assert.deepStrictEqual(await readAll(current), input);
		await current.end();
		await current.drain();
	});

	test('TCP capability and destination creation require authentication', async () => {
		const untrusted = await harness(socket => socket.end(), false);
		assert.strictEqual(untrusted.client.initializeResult.get()?.tcpConnections, undefined);
		await assert.rejects(untrusted.open(), /does not support TCP/);
		await assert.rejects(untrusted.wire.request({
			jsonrpc: '2.0', id: 902, method: 'createTcpConnection', params: {
				channel: 'ahp-tcp:/denied', host: '127.0.0.1', port: untrusted.port,
			}
		}), /authenticated/);
	});

	test('ownership is transport-local, even for the same logical client identity', async () => {
		const h = await harness(() => { });
		const stream = store.add(await h.open());
		const other = h.newTransport();
		await other.request({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientId: 'tcp-client', protocolVersions: ['1.0.0'] } });
		await assert.rejects(other.request({
			jsonrpc: '2.0', id: 2, method: 'subscribe', params: {
				channel: stream.resource, flowControl: { receive: agentHostTcpReceiveLimits },
			}
		}), /not found/);
	});

	for (const scenario of [
		{ name: 'pending open', subscriptions: 0, pendingOpen: true, method: 'unsubscribe' },
		{ name: 'unsubscribed socket', subscriptions: 0, pendingOpen: false, method: 'unsubscribe' },
		{ name: 'active stream reset', subscriptions: 1, pendingOpen: false, method: 'tcp/reset' },
		{ name: 're-subscription snapshot', subscriptions: 2, pendingOpen: false, method: 'unsubscribe' },
	]) {
		test(`channel reuse survives stale cleanup from ${scenario.name}`, async () => {
			const h = await harness(socket => socket.on('data', data => socket.write(data)));
			const wire = h.newTransport();
			const channel = 'ahp-tcp:/reused';
			let id = 1;
			await wire.request({ jsonrpc: '2.0', id: id++, method: 'initialize', params: { clientId: 'reuse-client', protocolVersions: ['1.0.0'] } });
			const create = () => wire.request({
				jsonrpc: '2.0', id: id++, method: 'createTcpConnection', params: { channel, host: '127.0.0.1', port: h.port },
			});
			const subscribe = () => wire.request({
				jsonrpc: '2.0', id: id++, method: 'subscribe', params: { channel, flowControl: { receive: agentHostTcpReceiveLimits } },
			});
			const original = create();
			const cancelledOpen = scenario.pendingOpen ? assert.rejects(original, /Unable to open TCP destination/) : undefined;
			if (!scenario.pendingOpen) {
				await original;
			}
			for (let i = 0; i < scenario.subscriptions; i++) {
				await subscribe();
			}

			wire.send({ jsonrpc: '2.0', method: scenario.method, params: { channel } });
			// Install the replacement before the old socket's asynchronous close and stream continuations run.
			const replacement = create();
			await Promise.all([replacement, cancelledOpen]);
			await subscribe();
			const echo = Event.toPromise(Event.filter(wire.onMessage, message =>
				isJsonRpcNotification(message) && (message.method === 'tcp/data' || message.method === 'tcp/reset')));
			wire.send({ jsonrpc: '2.0', method: 'tcp/data', params: { channel, data: 'cmVwbGFjZW1lbnQ=' } });
			const message = await echo;
			assert.ok(isJsonRpcNotification(message) && message.method === 'tcp/data');
			assert.deepStrictEqual(message.params, { channel, data: 'cmVwbGFjZW1lbnQ=' });
			wire.send({ jsonrpc: '2.0', method: 'unsubscribe', params: { channel } });
		});
	}

	test('invalid data resets the stream and the client unsubscribes', async () => {
		const h = await harness(() => { });
		const stream = store.add(await h.open());
		const reset = assert.rejects(stream.read(), /reset/);
		h.wire.send({ jsonrpc: '2.0', method: 'tcp/data', params: { channel: stream.resource, data: 'Zh==' } });
		await reset;
		assert.ok(h.wire.sent.some(message => hasKey(message, { method: true }) && message.method === 'unsubscribe'
			&& vObj({ channel: vString() }).validate(message.params).content?.channel === stream.resource));
	});

	for (const abort of ['tcp/reset', 'unsubscribe', 'invalid data', 'transport loss'] as const) {
		test(`${abort} resets the destination instead of delivering EOF for a partial upload`, async () => {
			const received = new DeferredPromise<void>();
			const closed = new DeferredPromise<void>();
			const errors: string[] = [];
			let ended = false;
			const h = await harness(socket => {
				socket.on('data', data => {
					assert.strictEqual(data.toString(), 'partial upload');
					received.complete();
				});
				socket.on('end', () => ended = true);
				socket.on('error', (error: NodeJS.ErrnoException) => errors.push(error.code ?? error.message));
				socket.on('close', () => closed.complete());
			});
			const stream = store.add(await h.open());
			await stream.write(VSBuffer.fromString('partial upload'));
			await received.p;
			if (abort === 'transport loss') {
				const reconnected = Event.toPromise(h.client.onDidReconnect);
				h.wire.drop();
				await reconnected;
			} else if (abort === 'invalid data') {
				h.wire.send({ jsonrpc: '2.0', method: 'tcp/data', params: { channel: stream.resource, data: 'Zh==' } });
			} else {
				h.wire.send({ jsonrpc: '2.0', method: abort, params: { channel: stream.resource } });
			}
			await closed.p;
			assert.strictEqual(ended, false);
			assert.deepStrictEqual(errors, ['ECONNRESET']);
		});
	}

	test('oversized unsubscribe is checked before TCP teardown and closes the control lane', async () => {
		const h = await harness(() => { });
		const stream = store.add(await h.open());
		h.wire.send({
			jsonrpc: '2.0', method: 'unsubscribe',
			params: { channel: stream.resource, padding: 'x'.repeat(16 * 1024) },
		});
		assert.ok(h.log.errors.some(error => error.includes('AgentHostChannels')));
		assert.strictEqual(h.wire.peer.disposed, true);
	});

	for (const replay of [true, false]) {
		test(`TCP reconnect entries are rejected on the ${replay ? 'replay' : 'snapshot'} path`, async () => {
			const h = await harness(() => assert.fail('Reconnect must not open a TCP destination'));
			const transport = h.newTransport();
			const result = await transport.request({
				jsonrpc: '2.0', id: 1, method: 'reconnect', params: {
					clientId: 'tcp-client', lastSeenServerSeq: replay ? 0 : -1,
					subscriptions: ['ahp-tcp:/subscription', 'ahp-tcp:/both', 'ahp-tcp:/both'],
					windows: {
						items: ['ahp-tcp:/both', 'ahp-tcp:/window-only'].map(channel => ({
							channel, flowControl: { receive: agentHostTcpReceiveLimits },
						}))
					},
				},
			});
			assert.deepStrictEqual(result, replay
				? { type: 'replay', actions: [], missing: ['ahp-tcp:/subscription', 'ahp-tcp:/both', 'ahp-tcp:/window-only'] }
				: { type: 'snapshot', snapshots: [] });
		});
	}

	test('TCP cannot use initialSubscriptions or fall back to ordinary delivery', async () => {
		const h = await harness(() => { });
		const other = h.newTransport();
		await assert.rejects(other.request({
			jsonrpc: '2.0', id: 1, method: 'initialize', params: {
				clientId: 'bad-initial', protocolVersions: ['1.0.0'], initialSubscriptions: ['ahp-tcp:/missing'],
			}
		}), /initialSubscriptions/);
		await h.wire.request({
			jsonrpc: '2.0', id: 1000, method: 'createTcpConnection', params: {
				channel: 'ahp-tcp:/ordinary', host: '127.0.0.1', port: h.port,
			}
		});
		await assert.rejects(h.wire.request({
			jsonrpc: '2.0', id: 1001, method: 'subscribe', params: {
				channel: 'ahp-tcp:/ordinary',
			}
		}), /windowed delivery/);
		const ordinary = await h.wire.request({
			jsonrpc: '2.0', id: 1002, method: 'subscribe', params: {
				channel: 'ahp-root:/', flowControl: { receive: agentHostTcpReceiveLimits },
			}
		});
		assert.ok(ordinary && typeof ordinary === 'object' && hasKey(ordinary, { snapshot: true }) && !hasKey(ordinary, { flowControl: true }));
	});

	test('enforces 256 transport and 512 host socket limits and reuses released capacity', async () => {
		// The destination accepts one connection per event loop iteration, but one iteration can complete
		// a whole batch of connects. Every batch waits for its accepts, so that the connections waiting to
		// be accepted never exceed the listen backlog: macOS limits it to 128 and resets connects beyond it.
		const accepted = Array.from({ length: 512 }, () => new DeferredPromise<void>());
		let acceptedCount = 0;
		const h = await harness(() => accepted[acceptedCount++]?.complete());
		const second = h.newListenerTransport();
		const third = h.newTransport();
		for (const [index, wire] of [second, third].entries()) {
			await wire.request({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientId: `quota-${index}`, protocolVersions: ['1.0.0'] } });
		}
		const create = (wire: Wire, index: number) => wire.request({
			jsonrpc: '2.0', id: 2000 + index, method: 'createTcpConnection', params: {
				channel: `ahp-tcp:/quota-${index}`, host: '127.0.0.1', port: h.port,
			}
		});
		const createBatch = async (wire: Wire, start: number) => {
			await Promise.all(Array.from({ length: 16 }, (_, offset) => create(wire, start + offset)));
			await accepted[start + 15].p;
		};
		for (let i = 0; i < 256; i += 16) {
			await createBatch(h.wire, i);
		}
		await assert.rejects(create(h.wire, 256), /capacity/);
		for (let i = 256; i < 512; i += 16) {
			await createBatch(second, i);
		}
		await assert.rejects(create(third, 512), /capacity/);
		h.wire.send({ jsonrpc: '2.0', method: 'unsubscribe', params: { channel: 'ahp-tcp:/quota-0' } });
		await create(third, 512);
	});

	test('connection and aggregate write budgets release reservations deterministically', () => {
		const host = new AgentHostTcpBudget(512);
		const client = new AgentHostTcpBudget(256, host);
		const connections = Array.from({ length: 256 }, () => client.reserveConnection());
		assert.throws(() => client.reserveConnection(), /capacity/);
		connections[0].dispose();
		client.reserveConnection().dispose();
		for (const connection of connections) { connection.dispose(); }
		const first = client.reserveWrite(16 * 1024 * 1024);
		assert.throws(() => client.reserveWrite(1), /capacity/);
		const second = host.reserveWrite(16 * 1024 * 1024);
		assert.throws(() => host.reserveWrite(1), /capacity/);
		first.dispose();
		second.dispose();
		host.reserveWrite(32 * 1024 * 1024).dispose();
	});
});
