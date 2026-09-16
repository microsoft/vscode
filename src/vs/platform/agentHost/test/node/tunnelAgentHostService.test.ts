/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type WebSocket from 'ws';
import { DeferredPromise, raceCancellationError, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { NullLogService } from '../../../log/common/log.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isTunnelGatewaySelectionRejectedError, TUNNEL_GATEWAY_SELECTION_REJECTED_ERROR_NAME, TUNNEL_LAUNCHER_LABEL } from '../../common/tunnelAgentHost.js';
import { type ITunnelDescriptor, type ITunnelRelayClient } from '../../common/tunnelAgentHostConnector.js';
import type { ITunnelDuplexStream, ITunnelMessageSocket } from '../../common/tunnelMessageSocket.js';
import {
	PendingGatewaySelection,
	deletePendingGatewaySelectionForTests,
	listAgentHostTunnels,
	NodeTunnelSocketFactory,
	setPendingGatewaySelectionForTests,
	TUNNEL_STEP_TIMEOUT_MS,
	TunnelAgentHostMainService,
	withTimeout,
} from '../../node/tunnelAgentHostService.js';

class FakeHandshakeWebSocket {
	private readonly _openListeners = new Set<() => void>();
	private readonly _errorListeners = new Set<(error: Error) => void>();
	private readonly _closeListeners = new Set<() => void>();
	terminateCalls = 0;

	once(event: 'open', listener: () => void): this;
	once(event: 'error', listener: (error: Error) => void): this;
	once(event: 'close', listener: () => void): this;
	once(event: 'open' | 'error' | 'close', listener: (() => void) | ((error: Error) => void)): this {
		if (event === 'open') {
			this._openListeners.add(listener as () => void);
		} else if (event === 'error') {
			this._errorListeners.add(listener as (error: Error) => void);
		} else {
			this._closeListeners.add(listener as () => void);
		}
		return this;
	}

	on(event: 'error', listener: (error: Error) => void): this {
		this._errorListeners.add(listener);
		return this;
	}

	off(event: 'open', listener: () => void): this;
	off(event: 'error', listener: (error: Error) => void): this;
	off(event: 'close', listener: () => void): this;
	off(event: 'open' | 'error' | 'close', listener: (() => void) | ((error: Error) => void)): this {
		if (event === 'open') {
			this._openListeners.delete(listener as () => void);
		} else if (event === 'error') {
			this._errorListeners.delete(listener as (error: Error) => void);
		} else {
			this._closeListeners.delete(listener as () => void);
		}
		return this;
	}

	terminate(): void {
		this.terminateCalls++;
	}

	emitError(error: Error): void {
		if (this._errorListeners.size === 0) {
			throw error;
		}
		for (const listener of [...this._errorListeners]) {
			listener(error);
		}
	}

	emitClose(): void {
		for (const listener of [...this._closeListeners]) {
			listener();
		}
	}

	listenerCount(event: 'error' | 'close'): number {
		return event === 'error' ? this._errorListeners.size : this._closeListeners.size;
	}
}

/**
 * Minimal message-socket double for gateway selection tests.
 */
class FakeGatewaySocket implements ITunnelMessageSocket {
	private readonly _onDidReceiveMessage = new Emitter<string>();
	readonly onDidReceiveMessage: Event<string> = this._onDidReceiveMessage.event;
	private readonly _onDidClose = new Emitter<{ code?: number; reason?: string; error?: Error }>();
	readonly onDidClose: Event<{ code?: number; reason?: string; error?: Error }> = this._onDidClose.event;

	readonly sent: string[] = [];
	closeCalls = 0;

	send(data: string): void {
		this.sent.push(data);
	}

	close(): void {
		this.closeCalls++;
	}

	emitMessage(data: string): void {
		this._onDidReceiveMessage.fire(data);
	}

	emitClose(code: number, reason: string): void {
		this._onDidClose.fire({ code, reason });
	}

	emitError(error: Error): void {
		this._onDidClose.fire({ error });
	}

	dispose(): void {
		this._onDidReceiveMessage.dispose();
		this._onDidClose.dispose();
	}
}

class FakeRelayClient implements ITunnelRelayClient {
	disposeCalls = 0;

	async connect(): Promise<void> {
	}

	async waitForForwardedPort(_port: number): Promise<void> {
	}

	async connectToForwardedPort(_port: number): Promise<never> {
		throw new Error('Not implemented in selection tests');
	}

	dispose(): void {
		this.disposeCalls++;
	}
}

suite('TunnelAgentHostService - withTimeout', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns the operation result when it settles within the timeout', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const result = await withTimeout(async () => {
				await timeout(100);
				return 42;
			}, 5_000, 'fast op');
			assert.strictEqual(result, 42);
		});
	});

	test('rethrows the operation error verbatim when it rejects before the timeout', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			await assert.rejects(
				() => withTimeout(async () => { throw new Error('boom'); }, 5_000, 'failing op'),
				/^Error: boom$/,
			);
		});
	});

	test('throws a step-named timeout error when the operation hangs past the deadline', async () => {
		// This is the exact production scenario: a dev-tunnels SDK call (relay
		// connect / waitForForwardedPort / connectToForwardedPort / WebSocket
		// open) that never settles after a silent network drop. Without the
		// timeout the renderer's _tunnelService.connect await would hang
		// forever, leaving _pendingConnects set and disabling auto-reconnect.
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const hanging = new DeferredPromise<never>();
			const promise = withTimeout(() => hanging.p, 5_000, 'tunnel relay connect');
			const rejected = promise.catch(err => err);
			await timeout(6_000);
			const err = await rejected;
			assert.ok(err instanceof Error, `Expected Error, got ${String(err)}`);
			assert.match(err.message, /tunnel relay connect timed out after 5000ms/);
			// Settle the never-resolving promise so the timer/test cleans up
			// without leaving an unhandled rejection/leaked promise.
			hanging.complete(undefined as never);
		});
	});

	test('production constant is large enough to cover SDK keepalive windows', () => {
		// Sanity guard: this constant is consumed at four call sites in
		// connect(). If someone shrinks it below ssh2/dev-tunnels' own
		// keepalive failure window, the timeout would start firing on
		// healthy-but-slow connections. Keep it in a sensible range.
		assert.ok(TUNNEL_STEP_TIMEOUT_MS >= 10_000, 'must be at least 10s');
		assert.ok(TUNNEL_STEP_TIMEOUT_MS <= 120_000, 'must be at most 2min');
	});
});

suite('TunnelAgentHostService - WebSocket handshake', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('retains an error listener until a cancelled handshake closes', async () => {
		const socket = new FakeHandshakeWebSocket();
		const socketCreated = new DeferredPromise<void>();
		const factory = new NodeTunnelSocketFactory(() => {
			socketCreated.complete();
			return socket as unknown as WebSocket;
		});
		const cancellation = new CancellationTokenSource();
		try {
			const resultPromise = factory.open({} as ITunnelDuplexStream, '/agent-host', cancellation.token)
				.then(() => undefined, error => error);
			await socketCreated.p;

			cancellation.cancel();
			const result = await resultPromise;
			const listenersAfterCancellation = {
				error: socket.listenerCount('error'),
				close: socket.listenerCount('close'),
			};
			assert.doesNotThrow(() => socket.emitError(new Error('terminated during handshake')));
			const errorListenersAfterError = socket.listenerCount('error');
			socket.emitClose();

			assert.deepStrictEqual({
				cancelled: isCancellationError(result),
				terminateCalls: socket.terminateCalls,
				listenersAfterCancellation,
				errorListenersAfterError,
				listenersAfterClose: {
					error: socket.listenerCount('error'),
					close: socket.listenerCount('close'),
				},
			}, {
				cancelled: true,
				terminateCalls: 1,
				listenersAfterCancellation: {
					error: 1,
					close: 1,
				},
				errorListenersAfterError: 1,
				listenersAfterClose: {
					error: 0,
					close: 0,
				},
			});
		} finally {
			cancellation.dispose();
		}
	});
});

suite('TunnelAgentHostService - discovery', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('requests connect-scoped launcher tunnels and filters unsupported results', async () => {
		const requests: object[] = [];
		const tunnels: readonly ITunnelDescriptor[] = [
			{ tunnelId: 'eligible', clusterId: 'west', name: 'eligible', labels: [TUNNEL_LAUNCHER_LABEL, 'protocolv6'] },
			{ tunnelId: 'wrong-label', clusterId: 'west', name: 'wrong-label', labels: ['protocolv6'] },
			{ tunnelId: 'old', clusterId: 'west', name: 'old', labels: [TUNNEL_LAUNCHER_LABEL, 'protocolv4'] },
		];
		const result = await listAgentHostTunnels({
			async listTunnels(_clusterId, _domain, options) {
				requests.push(options ?? {});
				return tunnels;
			},
		}, undefined, new NullLogService());

		assert.deepStrictEqual({
			requests,
			tunnels: result.map(tunnel => tunnel.tunnelId),
		}, {
			requests: [{
				labels: [TUNNEL_LAUNCHER_LABEL],
				requireAllLabels: true,
				includePorts: true,
				tokenScopes: ['connect'],
			}],
			tunnels: ['eligible'],
		});
	});

	test('rejects a failed authoritative enumeration', async () => {
		const failure = new Error('enumeration failed');

		await assert.rejects(
			() => listAgentHostTunnels({
				async listTunnels() {
					throw failure;
				},
			}, undefined, new NullLogService()),
			error => error === failure,
		);
	});

	test('propagates cancellation to tunnel management enumeration', async () => {
		const enumeration = new DeferredPromise<readonly ITunnelDescriptor[]>();
		const cancellation = new CancellationTokenSource();
		let receivedCancellation: CancellationToken | undefined;
		try {
			const resultPromise = listAgentHostTunnels({
				async listTunnels(_clusterId, _domain, _options, token) {
					receivedCancellation = token;
					return token ? raceCancellationError(enumeration.p, token) : enumeration.p;
				},
			}, undefined, new NullLogService(), cancellation.token).then(
				() => undefined,
				error => error,
			);
			await Promise.resolve();

			cancellation.cancel();
			const result = await resultPromise;
			enumeration.complete([]);

			assert.deepStrictEqual({
				cancelled: isCancellationError(result),
				sameToken: receivedCancellation === cancellation.token,
			}, {
				cancelled: true,
				sameToken: true,
			});
		} finally {
			cancellation.dispose();
		}
	});
});

function createPending(onUnexpectedClose: () => void = () => { }) {
	const ws = new FakeGatewaySocket();
	const relayClient = new FakeRelayClient();
	const pending = new PendingGatewaySelection('tunnel:t1', 'My Tunnel', 'tok123', ws, relayClient, onUnexpectedClose);
	return { ws, relayClient, pending };
}

suite('TunnelAgentHostService - gateway selection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('completeSelection sends the selection immediately, then resolves once the gateway acknowledges', async () => {
		const service = new TunnelAgentHostMainService(new NullLogService());
		try {
			const { ws, pending } = createPending();
			setPendingGatewaySelectionForTests(service, 'sel1', pending);

			const resultPromise = service.completeSelection('sel1', { instanceId: 'abc-123' });

			// An async function's body runs synchronously up to its first
			// `await`, so the selection message is already sent and the
			// gateway's reply listener already attached — no need to wait
			// for a microtask/timeout to assert on this.
			assert.deepStrictEqual(ws.sent, [JSON.stringify({ instanceId: 'abc-123' })]);

			ws.emitMessage(JSON.stringify({
				ok: true,
				selected: { type: 'editor', instanceId: 'abc-123', role: 'primary', lifecycle: 'external' },
			}));

			const result = await resultPromise;
			assert.strictEqual(result.address, 'tunnel:t1');
			assert.strictEqual(result.name, 'My Tunnel');
			assert.strictEqual(result.connectionToken, 'tok123');
			assert.deepStrictEqual(result.selected, { serverType: 'editor', instanceId: 'abc-123', role: 'primary', lifecycle: 'external' });

			// Steady-state: the same socket now proxies subsequent AHP frames.
			const relayed: string[] = [];
			const relayListener = service.onDidRelayMessage(m => relayed.push(m.data));
			ws.emitMessage('{"hello":"world"}');
			assert.deepStrictEqual(relayed, ['{"hello":"world"}']);
			relayListener.dispose();

			// Simulate the socket closing to dispose the resulting TunnelConnection.
			ws.emitClose(1000, '');
		} finally {
			service.dispose();
		}
	});

	test('completeSelection throws for an unknown selection id', async () => {
		const service = new TunnelAgentHostMainService(new NullLogService());
		try {
			await assert.rejects(
				() => service.completeSelection('does-not-exist', { instanceId: 'x' }),
				/No pending gateway selection with id does-not-exist/,
			);
		} finally {
			service.dispose();
		}
	});

	test('completeSelection surfaces a gateway rejection and closes pending resources without switching targets', async () => {
		const service = new TunnelAgentHostMainService(new NullLogService());
		try {
			const { ws, relayClient, pending } = createPending();
			setPendingGatewaySelectionForTests(service, 'sel1', pending);

			const resultPromise = service.completeSelection('sel1', { instanceId: 'gone' });
			ws.emitMessage(JSON.stringify({ ok: false, error: 'instance no longer live' }));

			const error = await resultPromise.then(() => undefined, (err: Error) => err);
			assert.deepStrictEqual({
				name: error?.name,
				rejection: isTunnelGatewaySelectionRejectedError(error),
				matchesMessage: /instance no longer live/.test(error?.message ?? ''),
				closeCalls: ws.closeCalls,
				disposeCalls: relayClient.disposeCalls,
			}, {
				name: TUNNEL_GATEWAY_SELECTION_REJECTED_ERROR_NAME,
				rejection: true,
				matchesMessage: true,
				closeCalls: 1,
				disposeCalls: 1,
			});
		} finally {
			service.dispose();
		}
	});

	test('completeSelection reports a transport failure as a plain error, never as a gateway rejection', async () => {
		const service = new TunnelAgentHostMainService(new NullLogService());
		try {
			const { ws, pending } = createPending();
			setPendingGatewaySelectionForTests(service, 'sel1', pending);

			const resultPromise = service.completeSelection('sel1', { instanceId: 'editor-1' });
			ws.emitError(new Error('socket hang up'));

			const error = await resultPromise.then(() => undefined, (err: Error) => err);
			assert.strictEqual(isTunnelGatewaySelectionRejectedError(error), false);
		} finally {
			service.dispose();
		}
	});

	test('cancelSelection disposes the pending socket and relay client, and is safe to call again or with an unknown id', async () => {
		const service = new TunnelAgentHostMainService(new NullLogService());
		try {
			const { ws, relayClient, pending } = createPending();
			setPendingGatewaySelectionForTests(service, 'sel1', pending);

			await service.cancelSelection('sel1');
			assert.strictEqual(ws.closeCalls, 1);
			assert.strictEqual(relayClient.disposeCalls, 1);

			// Repeated/unknown cancellation must be a safe no-op, not throw.
			await service.cancelSelection('sel1');
			await service.cancelSelection('does-not-exist');
			assert.strictEqual(ws.closeCalls, 1);
			assert.strictEqual(relayClient.disposeCalls, 1);
		} finally {
			service.dispose();
		}
	});

	test('completeSelection fails once the pending socket has already closed unexpectedly', async () => {
		const service = new TunnelAgentHostMainService(new NullLogService());
		try {
			// Wire the unexpected-close callback the same way prepareSelection
			// does in production: remove the entry from the pending map.
			const { ws, pending } = createPending(() => deletePendingGatewaySelectionForTests(service, 'sel1'));
			setPendingGatewaySelectionForTests(service, 'sel1', pending);

			// Simulate the gateway socket dropping before a selection was made:
			// the close listener above removes it from the pending map, so a
			// later completeSelection sees no pending entry.
			ws.emitClose(1000, 'network drop');

			await assert.rejects(
				() => service.completeSelection('sel1', { instanceId: 'abc' }),
				/No pending gateway selection with id sel1/,
			);
		} finally {
			service.dispose();
		}
	});
});

suite('PendingGatewaySelection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('fires the unexpected-close callback when the socket closes before a selection is made', () => {
		const ws = new FakeGatewaySocket();
		const relayClient = new FakeRelayClient();
		let closedCount = 0;
		const pending = new PendingGatewaySelection('addr', 'name', 'tok', ws, relayClient, () => { closedCount++; });

		ws.emitClose(1000, '');
		assert.strictEqual(closedCount, 1);
		pending.dispose();
	});

	test('detach() prevents the unexpected-close callback from firing after ownership transfers', () => {
		const ws = new FakeGatewaySocket();
		const relayClient = new FakeRelayClient();
		let closedCount = 0;
		const pending = new PendingGatewaySelection('addr', 'name', 'tok', ws, relayClient, () => { closedCount++; });

		pending.detach();
		ws.emitClose(1000, '');
		assert.strictEqual(closedCount, 0);
		pending.dispose();
	});

	test('dispose() closes the socket and disposes the relay client exactly once even if called twice', () => {
		const ws = new FakeGatewaySocket();
		const relayClient = new FakeRelayClient();
		const pending = new PendingGatewaySelection('addr', 'name', 'tok', ws, relayClient, () => { });

		pending.dispose();
		pending.dispose();
		assert.strictEqual(ws.closeCalls, 1);
		assert.strictEqual(relayClient.disposeCalls, 1);
	});
});
