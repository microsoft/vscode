/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IDialogService, IPrompt } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IRemoteAgentHostLocationPreferenceService, RemoteAgentHostLocationPreference } from '../../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { ITunnelGatewayInventory } from '../../../../../../platform/agentHost/common/tunnelAgentHost.js';
import {
	resolveGatewaySelection,
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

interface IPreferenceServiceFixture {
	readonly service: IRemoteAgentHostLocationPreferenceService;
	readonly setCalls: { hostKey: string; preference: RemoteAgentHostLocationPreference }[];
}

function stubLocationPreferenceService(initial?: RemoteAgentHostLocationPreference): IPreferenceServiceFixture {
	const store = new Map<string, RemoteAgentHostLocationPreference>();
	if (initial) {
		store.set('tunnel:abc', initial);
	}
	const setCalls: { hostKey: string; preference: RemoteAgentHostLocationPreference }[] = [];
	const service: IRemoteAgentHostLocationPreferenceService = {
		_serviceBrand: undefined,
		onDidChangePreference: Event.None,
		getPreference: hostKey => store.get(hostKey),
		setPreference: (hostKey, preference) => {
			store.set(hostKey, preference);
			setCalls.push({ hostKey, preference });
		},
	};
	return { service, setCalls };
}

interface IDialogServiceFixture {
	readonly dialogService: IDialogService;
	readonly promptCalls: IPrompt<RemoteAgentHostLocationPreference>[];
}

function stubDialogService(result: RemoteAgentHostLocationPreference | undefined): IDialogServiceFixture {
	const promptCalls: IPrompt<RemoteAgentHostLocationPreference>[] = [];
	const dialogService = {
		prompt: async (options: IPrompt<RemoteAgentHostLocationPreference>) => {
			promptCalls.push(options);
			return { result };
		},
	} as unknown as IDialogService;
	return { dialogService, promptCalls };
}

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

	suite('resolveGatewaySelection', () => {
		test('a delegated instance short-circuits saved preferences and prompts', async () => {
			const { service, setCalls } = stubLocationPreferenceService('dedicated');
			const { dialogService, promptCalls } = stubDialogService(undefined);

			const selection = await resolveGatewaySelection(service, dialogService, {
				hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product',
				inventory: { userDataPath: '/data', delegatedInstanceId: 'editor-1', endpoints: [editorEndpoint] },
				userInitiated: true,
			});

			assert.deepStrictEqual({ selection, promptCalls, setCalls }, {
				selection: { instanceId: 'editor-1' },
				promptCalls: [],
				setCalls: [],
			});
		});

		test('saved "editor" preference + a live editor selects that editor without prompting or re-persisting', async () => {
			const { service, setCalls } = stubLocationPreferenceService('editor');
			const { dialogService, promptCalls } = stubDialogService(undefined);

			const selection = await resolveGatewaySelection(service, dialogService, {
				hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product', inventory: inventory([editorEndpoint, standaloneEndpoint]), userInitiated: true,
			});

			assert.deepStrictEqual(selection, { instanceId: 'editor-1' });
			assert.strictEqual(promptCalls.length, 0);
			assert.strictEqual(setCalls.length, 0);
		});

		test('saved "editor" preference + a background (non-user-initiated) reconnect still selects the live editor (explicit consent)', async () => {
			const { service, setCalls } = stubLocationPreferenceService('editor');
			const { dialogService, promptCalls } = stubDialogService(undefined);

			const selection = await resolveGatewaySelection(service, dialogService, {
				hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product', inventory: inventory([editorEndpoint]), userInitiated: false,
			});

			assert.deepStrictEqual(selection, { instanceId: 'editor-1' });
			assert.strictEqual(promptCalls.length, 0);
			assert.strictEqual(setCalls.length, 0);
		});

		test('saved "editor" preference + no live editor falls back to dedicated without changing the preference', async () => {
			const { service, setCalls } = stubLocationPreferenceService('editor');
			const { dialogService, promptCalls } = stubDialogService(undefined);

			const selection = await resolveGatewaySelection(service, dialogService, {
				hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product', inventory: inventory([standaloneEndpoint]), userInitiated: true,
			});

			assert.deepStrictEqual(selection, { instanceId: 'standalone-2' });
			assert.strictEqual(promptCalls.length, 0);
			assert.strictEqual(setCalls.length, 0, 'an unavailable editor preference must not be overwritten');
		});

		test('saved "dedicated" preference never prompts, even when a live editor exists', async () => {
			const { service, setCalls } = stubLocationPreferenceService('dedicated');
			const { dialogService, promptCalls } = stubDialogService(undefined);

			const selection = await resolveGatewaySelection(service, dialogService, {
				hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product', inventory: inventory([editorEndpoint, standaloneEndpoint]), userInitiated: true,
			});

			assert.deepStrictEqual(selection, { instanceId: 'standalone-2' });
			assert.strictEqual(promptCalls.length, 0);
			assert.strictEqual(setCalls.length, 0);
		});

		test('no saved preference + no live editor falls back to dedicated with no prompt and no persistence', async () => {
			const { service, setCalls } = stubLocationPreferenceService();
			const { dialogService, promptCalls } = stubDialogService(undefined);

			const selection = await resolveGatewaySelection(service, dialogService, {
				hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product', inventory: inventory([standaloneEndpoint]), userInitiated: true,
			});

			assert.deepStrictEqual(selection, { instanceId: 'standalone-2' });
			assert.strictEqual(promptCalls.length, 0);
			assert.strictEqual(setCalls.length, 0);
		});

		test('no saved preference + a live editor + a background connection falls back to dedicated silently, never prompting', async () => {
			const { service, setCalls } = stubLocationPreferenceService();
			const { dialogService, promptCalls } = stubDialogService(undefined);

			const selection = await resolveGatewaySelection(service, dialogService, {
				hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product', inventory: inventory([editorEndpoint, standaloneEndpoint]), userInitiated: false,
			});

			assert.deepStrictEqual(selection, { instanceId: 'standalone-2' });
			assert.strictEqual(promptCalls.length, 0);
			assert.strictEqual(setCalls.length, 0);
		});

		test('no saved preference + a live editor + a user-initiated connection prompts the shared modal with the tunnel name and persists an "editor" choice', async () => {
			const { service, setCalls } = stubLocationPreferenceService();
			const { dialogService, promptCalls } = stubDialogService('editor');

			const selection = await resolveGatewaySelection(service, dialogService, {
				hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product', inventory: inventory([editorEndpoint, standaloneEndpoint]), userInitiated: true,
			});

			assert.deepStrictEqual(selection, { instanceId: 'editor-1' });
			assert.strictEqual(promptCalls.length, 1);
			assert.match(promptCalls[0].message, /My Tunnel/);
			assert.deepStrictEqual((promptCalls[0] as unknown as { custom: { buttonDetails: string[] } }).custom.buttonDetails[1], 'Agents are available only while the remote Test Product window is open.');
			assert.deepStrictEqual(setCalls, [{ hostKey: 'tunnel:abc', preference: 'editor' }]);
		});

		test('no saved preference + a live editor + a user-initiated connection persists a "dedicated" choice and translates it to a concrete selection', async () => {
			const { service, setCalls } = stubLocationPreferenceService();
			const { dialogService } = stubDialogService('dedicated');

			const selection = await resolveGatewaySelection(service, dialogService, {
				hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product', inventory: inventory([editorEndpoint, standaloneEndpoint]), userInitiated: true,
			});

			assert.deepStrictEqual(selection, { instanceId: 'standalone-2' });
			assert.deepStrictEqual(setCalls, [{ hostKey: 'tunnel:abc', preference: 'dedicated' }]);
		});

		test('cancelling the modal returns undefined and persists nothing', async () => {
			const { service, setCalls } = stubLocationPreferenceService();
			const { dialogService } = stubDialogService(undefined);

			const selection = await resolveGatewaySelection(service, dialogService, {
				hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product', inventory: inventory([editorEndpoint, standaloneEndpoint]), userInitiated: true,
			});

			assert.strictEqual(selection, undefined);
			assert.strictEqual(setCalls.length, 0);
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
