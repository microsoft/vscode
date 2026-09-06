/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITunnelGatewayInventory } from '../../../../../../platform/agentHost/common/tunnelAgentHost.js';
import {
	selectDedicatedGatewayFallback,
	selectEditorGatewayEndpoint,
	selectGatewayFallbackAfterRejection,
	shouldNotifyTunnelFailover,
	shouldTrackTunnelConnection,
	TunnelFailoverTracker,
} from '../../electron-browser/tunnelAgentHostServiceImpl.js';

function inventory(endpoints: ITunnelGatewayInventory['endpoints']): ITunnelGatewayInventory {
	return { userDataPath: '/data', endpoints };
}

const editorEndpoint = { type: 'editor', pid: 111, instanceId: 'editor-1', quality: 'insiders', endpointKind: 'socket', endpointLabel: '/tmp/editor-1.sock' } as const;
const secondEditorEndpoint = { type: 'editor', pid: 112, instanceId: 'editor-0', endpointKind: 'socket', endpointLabel: '/tmp/editor-0.sock' } as const;
const standaloneEndpoint = { type: 'standalone', pid: 222, instanceId: 'standalone-2', tunnelName: 'my-tunnel', endpointKind: 'tcp', endpointLabel: '127.0.0.1:9001' } as const;
const secondStandaloneEndpoint = { type: 'standalone', pid: 333, instanceId: 'standalone-1', endpointKind: 'tcp', endpointLabel: '127.0.0.1:9002' } as const;

suite('tunnelAgentHostServiceImpl - gateway selection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('selectEditorGatewayEndpoint / selectDedicatedGatewayFallback (deterministic candidates)', () => {
		test('selectEditorGatewayEndpoint picks the lexicographically smallest instanceId when multiple editors exist', () => {
			assert.deepStrictEqual(
				selectEditorGatewayEndpoint(inventory([editorEndpoint, secondEditorEndpoint])),
				secondEditorEndpoint,
			);
		});

		test('selectEditorGatewayEndpoint returns undefined when no editor endpoint exists', () => {
			assert.strictEqual(selectEditorGatewayEndpoint(inventory([standaloneEndpoint])), undefined);
		});

		test('selectDedicatedGatewayFallback picks the lexicographically smallest standalone instanceId when several exist', () => {
			assert.deepStrictEqual(
				selectDedicatedGatewayFallback(inventory([standaloneEndpoint, secondStandaloneEndpoint])),
				{ instanceId: 'standalone-1' },
			);
		});

		test('selectDedicatedGatewayFallback requests a new dedicated instance when no standalone endpoint exists', () => {
			assert.deepStrictEqual(selectDedicatedGatewayFallback(inventory([editorEndpoint])), { newDedicated: true });
		});
	});

	suite('selectGatewayFallbackAfterRejection', () => {
		test('retries the delegated instance instead of selecting or spawning a dedicated host', () => {
			assert.deepStrictEqual(
				selectGatewayFallbackAfterRejection({ instanceId: 'editor-1' }, { userDataPath: '/data', delegatedInstanceId: 'editor-1', endpoints: [] }),
				{ instanceId: 'editor-1' },
			);
		});

		test('a rejected editor endpoint falls back to the deterministic live standalone', () => {
			assert.deepStrictEqual(
				selectGatewayFallbackAfterRejection({ instanceId: 'editor-1' }, inventory([editorEndpoint, standaloneEndpoint, secondStandaloneEndpoint])),
				{ instanceId: 'standalone-1' },
			);
		});

		test('a rejected editor endpoint asks for a new dedicated instance when no standalone is live', () => {
			assert.deepStrictEqual(
				selectGatewayFallbackAfterRejection({ instanceId: 'editor-1' }, inventory([editorEndpoint, secondEditorEndpoint])),
				{ newDedicated: true },
			);
		});

		test('never retries the instance that was just rejected, even if it is the only standalone left', () => {
			assert.deepStrictEqual(
				selectGatewayFallbackAfterRejection({ instanceId: 'standalone-2' }, inventory([standaloneEndpoint])),
				{ newDedicated: true },
			);
		});

		test('a rejected new-dedicated request has no fallback (the gateway failed to spawn, not to reach)', () => {
			assert.strictEqual(
				selectGatewayFallbackAfterRejection({ newDedicated: true }, inventory([standaloneEndpoint])),
				undefined,
			);
		});
	});

	suite('shouldNotifyTunnelFailover', () => {
		test('notifies on a background reconnect that moved from an editor endpoint to a standalone one', () => {
			assert.strictEqual(shouldNotifyTunnelFailover('editor', 'standalone', false), true);
		});
		test('does not notify on the initial connect (no previously retained endpoint)', () => {
			assert.strictEqual(shouldNotifyTunnelFailover(undefined, 'standalone', false), false);
		});

		test('does not notify on a user-initiated reconnect, even editor -> standalone', () => {
			assert.strictEqual(shouldNotifyTunnelFailover('editor', 'standalone', true), false);
		});

		test('does not notify editor -> editor', () => {
			assert.strictEqual(shouldNotifyTunnelFailover('editor', 'editor', false), false);
		});

		test('does not notify standalone -> standalone', () => {
			assert.strictEqual(shouldNotifyTunnelFailover('standalone', 'standalone', false), false);
		});

		test('does not notify standalone -> editor', () => {
			assert.strictEqual(shouldNotifyTunnelFailover('standalone', 'editor', false), false);
		});

		test('does not notify when the previous or new server type is "unknown" (legacy protocol-v5 tunnels)', () => {
			assert.strictEqual(shouldNotifyTunnelFailover('unknown', 'standalone', false), false);
			assert.strictEqual(shouldNotifyTunnelFailover('editor', 'unknown', false), false);
		});

		test('notifies for an in-attempt editor -> standalone fallback even with no retained endpoint and a user-initiated connect', () => {
			assert.deepStrictEqual([
				shouldNotifyTunnelFailover(undefined, 'standalone', true, /*editorFallback*/ true),
				shouldNotifyTunnelFailover(undefined, 'standalone', false, /*editorFallback*/ true),
				shouldNotifyTunnelFailover('editor', 'standalone', true, /*editorFallback*/ true),
			], [true, true, true]);
		});

		test('does not repeat the in-attempt fallback notification once the address is already on a standalone host', () => {
			// A stale editor entry lingers for as long as its PID does, so
			// every reconnect repeats the same fallback — only the first may
			// notify.
			assert.strictEqual(shouldNotifyTunnelFailover('standalone', 'standalone', false, /*editorFallback*/ true), false);
		});
	});

	suite('TunnelFailoverTracker', () => {
		test('does not notify on the first (initial) registration for an address', () => {
			const tracker = new TunnelFailoverTracker();
			assert.strictEqual(tracker.recordAndShouldNotify('tunnel:abc', 'editor', true), false);
		});

		test('notifies exactly once when a background reconnect moves editor -> standalone for the same address', () => {
			const tracker = new TunnelFailoverTracker();
			tracker.recordAndShouldNotify('tunnel:abc', 'editor', true); // initial user-initiated connect
			assert.strictEqual(tracker.recordAndShouldNotify('tunnel:abc', 'standalone', false), true, 'first auto-reconnect after editor exit must notify');
		});

		test('does not notify again on a subsequent standalone -> standalone reconnect (no duplicates)', () => {
			const tracker = new TunnelFailoverTracker();
			tracker.recordAndShouldNotify('tunnel:abc', 'editor', true);
			tracker.recordAndShouldNotify('tunnel:abc', 'standalone', false); // notifies once
			assert.strictEqual(tracker.recordAndShouldNotify('tunnel:abc', 'standalone', false), false, 'must not notify again for the same steady state');
		});

		test('retains metadata across relay closure: a later reconnect still compares against the last successful registration', () => {
			const tracker = new TunnelFailoverTracker();
			tracker.recordAndShouldNotify('tunnel:abc', 'editor', true);
			// Simulate the relay closing and several failed reconnect attempts
			// never reaching a successful registration — the tracker is not
			// touched by those, so the retained "editor" state must survive.
			assert.strictEqual(tracker.recordAndShouldNotify('tunnel:abc', 'standalone', false), true);
		});

		test('tracks addresses independently', () => {
			const tracker = new TunnelFailoverTracker();
			tracker.recordAndShouldNotify('tunnel:one', 'editor', true);
			tracker.recordAndShouldNotify('tunnel:two', 'standalone', true);
			assert.strictEqual(tracker.recordAndShouldNotify('tunnel:one', 'standalone', false), true, 'tunnel:one had an editor endpoint, so this is a failover');
			assert.strictEqual(tracker.recordAndShouldNotify('tunnel:two', 'standalone', false), false, 'tunnel:two never had an editor endpoint');
		});

		test('a user-initiated reconnect updates the retained state without notifying, affecting later comparisons', () => {
			const tracker = new TunnelFailoverTracker();
			tracker.recordAndShouldNotify('tunnel:abc', 'editor', true);
			// User explicitly reconnects and picks standalone themselves.
			assert.strictEqual(tracker.recordAndShouldNotify('tunnel:abc', 'standalone', true), false, 'user-initiated changes never notify');
			// A later background reconnect keeps landing on standalone: no
			// notification, since there is no editor -> standalone transition.
			assert.strictEqual(tracker.recordAndShouldNotify('tunnel:abc', 'standalone', false), false);
		});

		test('an in-attempt editor fallback notifies once and leaves the address recorded as standalone', () => {
			const tracker = new TunnelFailoverTracker();
			assert.deepStrictEqual([
				// First connect of the window: the gateway rejected a stale
				// editor endpoint and we fell back inside the same attempt.
				tracker.recordAndShouldNotify('tunnel:abc', 'standalone', false, /*editorFallback*/ true),
				// The stale editor entry lingers, so the next reconnect repeats
				// the very same fallback — it must stay quiet.
				tracker.recordAndShouldNotify('tunnel:abc', 'standalone', false, /*editorFallback*/ true),
				// As must a plain reconnect that lands on the same standalone.
				tracker.recordAndShouldNotify('tunnel:abc', 'standalone', false),
			], [true, false, false]);
		});
	});

	suite('shouldTrackTunnelConnection', () => {
		test('tracks (and may notify) when the connect attempt has no error', () => {
			assert.strictEqual(shouldTrackTunnelConnection(undefined), true);
		});

		test('does not track when the attempt ended in a connectError (e.g. incompatible handshake)', () => {
			assert.strictEqual(shouldTrackTunnelConnection(new Error('Unsupported protocol version')), false);
		});
	});

	suite('ordering: connectError must gate the tracker/notification step', () => {
		test('an editor -> standalone automatic reconnect that ends in connectError must not update the tracker or notify', () => {
			// Models `connect()`'s post-addManagedConnection guard exactly:
			// `shouldTrackTunnelConnection(connectError)` must be checked (and
			// found false) BEFORE `TunnelFailoverTracker.recordAndShouldNotify`
			// is ever called, even though addManagedConnection already
			// succeeded and registered the endpoint for a possible upgrade.
			const tracker = new TunnelFailoverTracker();
			tracker.recordAndShouldNotify('tunnel:abc', 'editor', true); // initial user-initiated connect

			const connectError: unknown = new Error('Unsupported protocol version');
			let notified: boolean | undefined;
			if (shouldTrackTunnelConnection(connectError)) {
				notified = tracker.recordAndShouldNotify('tunnel:abc', 'standalone', false);
			}
			assert.strictEqual(notified, undefined, 'the tracker must never be invoked for a failed (incompatible) reconnect');

			// A later, fully successful editor -> standalone reconnect must
			// still notify: the failed attempt above must not have poisoned
			// (or prematurely advanced) the retained state.
			assert.strictEqual(shouldTrackTunnelConnection(undefined), true);
			assert.strictEqual(tracker.recordAndShouldNotify('tunnel:abc', 'standalone', false), true, 'the retained state must still be "editor" since the failed attempt was never tracked');
		});
	});
});
