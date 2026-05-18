/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { URI } from '../../../../../base/common/uri.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult, SubscribeResult } from '../../../common/state/protocol/commands.js';
import { ActionType, type SessionAddedNotification } from '../../../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import type { INotificationBroadcastParams } from '../../../common/state/sessionProtocol.js';
import type { SessionState } from '../../../common/state/sessionState.js';
import {
	getActionEnvelope,
	isActionNotification,
	IServerHandle,
	nextSessionUri,
	startServer,
	TestProtocolClient,
} from './testHelpers.js';

suite('Protocol WebSocket - Session Config', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;

	suiteSetup(async function () {
		this.timeout(15_000);
		server = await startServer();
	});

	suiteTeardown(function () {
		server.process.kill();
	});

	setup(async function () {
		this.timeout(10_000);
		client = new TestProtocolClient(server.port);
		await client.connect();
		await client.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: 'test-session-config' });
	});

	teardown(function () {
		client.close();
	});

	test('resolveSessionConfig returns schema and re-resolves dependent read-only state', async function () {
		this.timeout(10_000);

		const workingDirectory = URI.file('/mock/workspace').toString();
		const initial = await client.call<ResolveSessionConfigResult>('resolveSessionConfig', {
			provider: 'mock',
			workingDirectory,
		});

		assert.deepStrictEqual(initial.values, { isolation: 'worktree', branch: 'main' });
		assert.deepStrictEqual(Object.keys(initial.schema.properties), ['isolation', 'branch']);
		assert.deepStrictEqual(initial.schema.properties.branch.enum, ['main']);
		assert.strictEqual(initial.schema.properties.branch.enumDynamic, true);
		assert.strictEqual(initial.schema.properties.branch.readOnly, false);

		const folder = await client.call<ResolveSessionConfigResult>('resolveSessionConfig', {
			provider: 'mock',
			workingDirectory,
			config: { isolation: 'folder', branch: 'feature/config' },
		});

		assert.deepStrictEqual(folder.values, { isolation: 'folder', branch: 'main' });
		assert.strictEqual(folder.schema.properties.branch.enumDynamic, false);
		assert.strictEqual(folder.schema.properties.branch.readOnly, true);
	});

	test('sessionConfigCompletions returns dynamic branch matches', async function () {
		this.timeout(10_000);

		const result = await client.call<SessionConfigCompletionsResult>('sessionConfigCompletions', {
			provider: 'mock',
			workingDirectory: URI.file('/mock/workspace').toString(),
			config: { isolation: 'worktree' },
			property: 'branch',
			query: 'feat',
		});

		assert.deepStrictEqual(result, {
			items: [{ value: 'feature/config', label: 'feature/config' }],
		});
	});

	test('createSession stores config schema and values on session state', async function () {
		this.timeout(10_000);

		const config = { isolation: 'worktree', branch: 'feature/config' };
		await client.call('createSession', {
			session: nextSessionUri(),
			provider: 'mock',
			workingDirectory: URI.file('/mock/workspace').toString(),
			config,
		});

		const notif = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
		);
		const notification = (notif.params as INotificationBroadcastParams).notification as SessionAddedNotification;
		assert.strictEqual(Object.hasOwn(notification.summary, 'config'), false);

		const snapshot = await client.call<SubscribeResult>('subscribe', { resource: notification.summary.resource });
		const state = snapshot.snapshot.state as SessionState;
		assert.deepStrictEqual(state.config?.values, config);
		assert.deepStrictEqual(Object.keys(state.config?.schema.properties ?? {}), ['isolation', 'branch']);
	});

	test('session/configChanged merges config values into session state', async function () {
		this.timeout(10_000);

		await client.call('createSession', {
			session: nextSessionUri(),
			provider: 'mock',
			config: { isolation: 'folder', branch: 'main' },
		});

		const notif = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
		);
		const session = ((notif.params as INotificationBroadcastParams).notification as SessionAddedNotification).summary.resource;
		await client.call<SubscribeResult>('subscribe', { resource: session });
		client.clearReceived();

		client.notify('dispatchAction', {
			clientSeq: 1,
			action: {
				type: ActionType.SessionConfigChanged,
				session,
				config: { branch: 'release' },
			},
		});

		const configChanged = await client.waitForNotification(n => isActionNotification(n, ActionType.SessionConfigChanged));
		assert.strictEqual(getActionEnvelope(configChanged).action.type, ActionType.SessionConfigChanged);

		const snapshot = await client.call<SubscribeResult>('subscribe', { resource: session });
		const state = snapshot.snapshot.state as SessionState;
		assert.deepStrictEqual(state.config?.values, { isolation: 'folder', branch: 'release' });
	});
});

suite('Protocol WebSocket - Session Config persistence across restarts', function () {

	let userDataDir: string;

	setup(function () {
		userDataDir = mkdtempSync(`${tmpdir()}/vscode-agent-host-config-`);
	});

	teardown(function () {
		try {
			rmSync(userDataDir, { recursive: true, force: true });
		} catch {
			// Best-effort cleanup; the OS will reap the temp dir eventually.
		}
	});

	test('persisted config values are restored on subscribe after server restart', async function () {
		this.timeout(30_000);

		const initialConfig = { isolation: 'worktree', branch: 'main' };
		const updatedBranch = 'release';
		let sessionUri: string;

		// ---- Phase 1: create session, change config, wait for persistence ----
		const server1 = await startServer({ userDataDir });
		try {
			const client1 = new TestProtocolClient(server1.port);
			await client1.connect();
			await client1.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: 'test-config-restore-1' });

			await client1.call('createSession', {
				session: nextSessionUri(),
				provider: 'mock',
				workingDirectory: URI.file('/mock/workspace').toString(),
				config: initialConfig,
			});
			const addedNotif = await client1.waitForNotification(n =>
				n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
			);
			// The mock agent assigns its own URI rather than honoring the
			// requested one, so capture the real URI from the notification.
			sessionUri = ((addedNotif.params as INotificationBroadcastParams).notification as SessionAddedNotification).summary.resource;

			await client1.call<SubscribeResult>('subscribe', { resource: sessionUri });

			client1.notify('dispatchAction', {
				clientSeq: 1,
				action: {
					type: ActionType.SessionConfigChanged,
					session: sessionUri,
					config: { branch: updatedBranch },
				},
			});
			const configChanged = await client1.waitForNotification(n => isActionNotification(n, ActionType.SessionConfigChanged));
			assert.strictEqual(getActionEnvelope(configChanged).action.type, ActionType.SessionConfigChanged);

			client1.close();
		} finally {
			// Trigger graceful shutdown by closing stdin rather than sending
			// SIGTERM — on Windows, `child.kill()` (SIGTERM) unconditionally
			// terminates the process without invoking the shutdown handler,
			// so in-flight `setMetadata` writes never reach SQLite. Closing
			// stdin fires `process.stdin.on('end', shutdown)` in the server
			// on every platform.
			server1.process.stdin!.end();
			await new Promise<void>(resolve => server1.process.once('exit', () => resolve()));
		}

		// ---- Phase 2: restart server, subscribe, verify restored config ----
		// The mock agent does not persist its in-memory session list across
		// restarts, so seed it via env var so `agent.listSessions()` includes
		// our session and `restoreSession` proceeds.
		const server2 = await startServer({
			userDataDir,
			env: { VSCODE_AGENT_HOST_MOCK_SEED_SESSIONS: sessionUri },
		});
		try {
			const client2 = new TestProtocolClient(server2.port);
			await client2.connect();
			await client2.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: 'test-config-restore-2' });

			// Subscribing triggers the restore-on-subscribe path on the server,
			// which reads `configValues` from the per-session DB and overlays
			// them on the freshly-resolved schema.
			const snapshot = await client2.call<SubscribeResult>('subscribe', { resource: sessionUri });
			const state = snapshot.snapshot.state as SessionState;

			assert.ok(state.config, 'restored session should have state.config populated');
			// Schema is re-resolved by the provider (worktree-mode mock returns
			// dynamic branch enum), so just check that our persisted user
			// selections survived the round trip.
			assert.deepStrictEqual(state.config.values, { isolation: 'worktree', branch: updatedBranch });

			client2.close();
		} finally {
			server2.process.stdin!.end();
			await new Promise<void>(resolve => server2.process.once('exit', () => resolve()));
		}
	});
});
