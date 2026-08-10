/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import type WebSocket from 'ws';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { NullLogService } from '../../../log/common/log.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isTunnelGatewaySelectionRejectedError, TUNNEL_GATEWAY_SELECTION_REJECTED_ERROR_NAME } from '../../common/tunnelAgentHost.js';
import {
	PendingGatewaySelection,
	deletePendingGatewaySelectionForTests,
	setPendingGatewaySelectionForTests,
	TUNNEL_STEP_TIMEOUT_MS,
	TunnelAgentHostMainService,
	withTimeout,
} from '../../node/tunnelAgentHostService.js';

/**
 * Minimal EventEmitter-based double for the `ws` package's `WebSocket`,
 * exposing just the surface {@link TunnelAgentHostMainService} relies on
 * (`send`/`close`/`readyState`/`OPEN` plus the inherited `on`/`once`/`off`/`emit`).
 * Cast to `WebSocket` at call sites, matching this repo's convention of using
 * typed test doubles instead of `any`.
 */
class FakeGatewaySocket extends EventEmitter {
	readonly sent: string[] = [];
	closeCalls = 0;
	readyState = 1;
	readonly OPEN = 1;

	send(data: string): void {
		this.sent.push(data);
	}

	close(): void {
		this.closeCalls++;
	}
}

class FakeRelayClient {
	disposeCalls = 0;
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

function createPending(onUnexpectedClose: () => void = () => { }) {
	const ws = new FakeGatewaySocket();
	const relayClient = new FakeRelayClient();
	const pending = new PendingGatewaySelection('tunnel:t1', 'My Tunnel', 'tok123', ws as unknown as WebSocket, relayClient, onUnexpectedClose);
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

			ws.emit('message', Buffer.from(JSON.stringify({
				ok: true,
				selected: { type: 'editor', instanceId: 'abc-123', role: 'primary', lifecycle: 'external' },
			})));

			const result = await resultPromise;
			assert.strictEqual(result.address, 'tunnel:t1');
			assert.strictEqual(result.name, 'My Tunnel');
			assert.strictEqual(result.connectionToken, 'tok123');
			assert.deepStrictEqual(result.selected, { serverType: 'editor', instanceId: 'abc-123', role: 'primary', lifecycle: 'external' });

			// Steady-state: the same socket now proxies subsequent AHP frames.
			const relayed: string[] = [];
			const relayListener = service.onDidRelayMessage(m => relayed.push(m.data));
			ws.emit('message', Buffer.from('{"hello":"world"}'));
			assert.deepStrictEqual(relayed, ['{"hello":"world"}']);
			relayListener.dispose();

			// Simulate the socket closing to dispose the resulting TunnelConnection.
			ws.emit('close', 1000, Buffer.from(''));
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
			ws.emit('message', Buffer.from(JSON.stringify({ ok: false, error: 'instance no longer live' })));

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
			ws.emit('error', new Error('socket hang up'));

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
			ws.emit('close', 1000, Buffer.from('network drop'));

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
		const pending = new PendingGatewaySelection('addr', 'name', 'tok', ws as unknown as WebSocket, relayClient, () => { closedCount++; });

		ws.emit('close', 1000, Buffer.from(''));
		assert.strictEqual(closedCount, 1);
		pending.dispose();
	});

	test('detach() prevents the unexpected-close callback from firing after ownership transfers', () => {
		const ws = new FakeGatewaySocket();
		const relayClient = new FakeRelayClient();
		let closedCount = 0;
		const pending = new PendingGatewaySelection('addr', 'name', 'tok', ws as unknown as WebSocket, relayClient, () => { closedCount++; });

		pending.detach();
		ws.emit('close', 1000, Buffer.from(''));
		assert.strictEqual(closedCount, 0);
	});

	test('dispose() closes the socket and disposes the relay client exactly once even if called twice', () => {
		const ws = new FakeGatewaySocket();
		const relayClient = new FakeRelayClient();
		const pending = new PendingGatewaySelection('addr', 'name', 'tok', ws as unknown as WebSocket, relayClient, () => { });

		pending.dispose();
		pending.dispose();
		assert.strictEqual(ws.closeCalls, 1);
		assert.strictEqual(relayClient.disposeCalls, 1);
	});
});
