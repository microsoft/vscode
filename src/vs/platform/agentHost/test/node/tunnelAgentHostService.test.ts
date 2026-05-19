/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TUNNEL_STEP_TIMEOUT_MS, withTimeout } from '../../node/tunnelAgentHostService.js';

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
