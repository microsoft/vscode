/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { URI } from '../../../../../base/common/uri.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult, SubscribeResult } from '../../../common/state/protocol/commands.js';
import { ActionType, type SessionAddedParams } from '../../../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import { ROOT_STATE_URI, type SessionState } from '../../../common/state/sessionState.js';
import {
	getActionEnvelope,
	getAgentHostE2ETestTimeout,
	isActionNotification,
	IServerHandle,
	nextSessionUri,
	startServer,
	stopServer,
	TestProtocolClient,
} from '../serverIntegrationTestHelpers.js';
import { PRE_EXISTING_SESSION_URI } from '../mockAgent.js';

suite('Protocol WebSocket - Session Config', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;

	suiteSetup(async function () {
		this.timeout(getAgentHostE2ETestTimeout(15_000, 60_000));
		server = await startServer();
	});

	suiteTeardown(async function () {
		this.timeout(getAgentHostE2ETestTimeout(20_000, 50_000));
		await stopServer(server);
	});

	setup(async function () {
		this.timeout(10_000);
		client = new TestProtocolClient(server.port);
		await client.connect();
		await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: 'test-session-config' });
	});

	teardown(function () {
		client.close();
	});

	test('resolveSessionConfig returns schema and re-resolves dependent read-only state', async function () {
		this.timeout(10_000);

		const workingDirectory = URI.file(process.cwd()).toString();
		const initial = await client.call<ResolveSessionConfigResult>('resolveSessionConfig', {
			channel: ROOT_STATE_URI,
			provider: 'mock',
			workingDirectory,
		});

		assert.deepStrictEqual({
			mockMode: initial.values.mockMode,
			mockBranch: initial.values.mockBranch,
		}, { mockMode: 'managed', mockBranch: 'main' });
		assert.deepStrictEqual(initial.schema.properties.mockBranch.enum, ['main']);
		assert.strictEqual(initial.schema.properties.mockBranch.enumDynamic, true);
		assert.strictEqual(initial.schema.properties.mockBranch.readOnly, false);

		const direct = await client.call<ResolveSessionConfigResult>('resolveSessionConfig', {
			channel: ROOT_STATE_URI,
			provider: 'mock',
			workingDirectory,
			config: { mockMode: 'direct', mockBranch: 'feature/config' },
		});

		assert.deepStrictEqual({
			mockMode: direct.values.mockMode,
			mockBranch: direct.values.mockBranch,
		}, { mockMode: 'direct', mockBranch: 'main' });
		assert.strictEqual(direct.schema.properties.mockBranch.enumDynamic, false);
		assert.strictEqual(direct.schema.properties.mockBranch.readOnly, true);
	});

	test('sessionConfigCompletions returns dynamic branch matches', async function () {
		this.timeout(10_000);

		const result = await client.call<SessionConfigCompletionsResult>('sessionConfigCompletions', {
			channel: ROOT_STATE_URI,
			provider: 'mock',
			workingDirectory: URI.file(process.cwd()).toString(),
			config: { mockMode: 'managed' },
			property: 'mockBranch',
			query: 'feat',
		});

		assert.deepStrictEqual(result, {
			items: [{ value: 'feature/config', label: 'feature/config' }],
		});
	});

	test('createSession stores config schema and values on session state', async function () {
		this.timeout(10_000);

		const config = { mockMode: 'managed', mockBranch: 'feature/config' };
		await client.call('createSession', {
			channel: nextSessionUri(),
			provider: 'mock',
			workingDirectories: [URI.file(process.cwd()).toString()],
			config,
		});

		const notif = await client.waitForNotification(n =>
			n.method === 'root/sessionAdded'
			&& (n.params as SessionAddedParams).summary.resource !== PRE_EXISTING_SESSION_URI.toString()
		);
		const notification = notif.params as SessionAddedParams;
		assert.strictEqual(Object.hasOwn(notification.summary, 'config'), false);

		const snapshot = await client.call<SubscribeResult>('subscribe', { channel: notification.summary.resource });
		const state = snapshot.snapshot!.state as SessionState;
		assert.deepStrictEqual({
			mockMode: state.config?.values.mockMode,
			mockBranch: state.config?.values.mockBranch,
		}, config);
		assert.deepStrictEqual(Object.keys(state.config?.schema.properties ?? {}).filter(key => key.startsWith('mock')), ['mockMode', 'mockBranch']);
	});

	test('session/configChanged merges config values into session state', async function () {
		this.timeout(10_000);

		await client.call('createSession', {
			channel: nextSessionUri(),
			provider: 'mock',
			config: { mockMode: 'direct', mockBranch: 'main' },
		});

		const notif = await client.waitForNotification(n =>
			n.method === 'root/sessionAdded'
			&& (n.params as SessionAddedParams).summary.resource !== PRE_EXISTING_SESSION_URI.toString()
		);
		const session = (notif.params as SessionAddedParams).summary.resource;
		await client.call<SubscribeResult>('subscribe', { channel: session });
		client.clearReceived();

		client.notify('dispatchAction', {
			channel: session,
			clientSeq: 1,
			action: {
				type: ActionType.SessionConfigChanged,
				config: { mockBranch: 'release' },
			},
		});

		const configChanged = await client.waitForNotification(n => isActionNotification(n, ActionType.SessionConfigChanged));
		assert.strictEqual(getActionEnvelope(configChanged).action.type, ActionType.SessionConfigChanged);

		const snapshot = await client.call<SubscribeResult>('subscribe', { channel: session });
		const state = snapshot.snapshot!.state as SessionState;
		assert.deepStrictEqual({
			mockMode: state.config?.values.mockMode,
			mockBranch: state.config?.values.mockBranch,
		}, { mockMode: 'direct', mockBranch: 'release' });
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
		this.timeout(getAgentHostE2ETestTimeout(30_000, 180_000));

		const initialConfig = { mockMode: 'managed', mockBranch: 'main' };
		const updatedBranch = 'release';
		let sessionUri: string;

		// ---- Phase 1: create session, change config, wait for persistence ----
		const server1 = await startServer({ userDataDir });
		try {
			const client1 = new TestProtocolClient(server1.port);
			await client1.connect();
			await client1.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: 'test-config-restore-1' });

			await client1.call('createSession', {
				channel: nextSessionUri(),
				provider: 'mock',
				workingDirectories: [URI.file(process.cwd()).toString()],
				config: initialConfig,
			});
			const addedNotif = await client1.waitForNotification(n =>
				n.method === 'root/sessionAdded'
				&& (n.params as SessionAddedParams).summary.resource !== PRE_EXISTING_SESSION_URI.toString()
			);
			// The mock agent assigns its own URI rather than honoring the
			// requested one, so capture the real URI from the notification.
			sessionUri = (addedNotif.params as SessionAddedParams).summary.resource;

			await client1.call<SubscribeResult>('subscribe', { channel: sessionUri });

			client1.notify('dispatchAction', {
				channel: sessionUri,
				clientSeq: 1,
				action: {
					type: ActionType.SessionConfigChanged,
					config: { mockBranch: updatedBranch },
				},
			});
			const configChanged = await client1.waitForNotification(n => isActionNotification(n, ActionType.SessionConfigChanged));
			assert.strictEqual(getActionEnvelope(configChanged).action.type, ActionType.SessionConfigChanged);

			client1.close();
		} finally {
			await stopServer(server1);
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
			await client2.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: 'test-config-restore-2' });

			// Subscribing triggers the restore-on-subscribe path on the server,
			// which reads `configValues` from the per-session DB and overlays
			// them on the freshly-resolved schema.
			const snapshot = await client2.call<SubscribeResult>('subscribe', { channel: sessionUri });
			const state = snapshot.snapshot!.state as SessionState;

			assert.ok(state.config, 'restored session should have state.config populated');
			// Schema is re-resolved by the provider, so just check that our persisted user
			// selections survived the round trip.
			assert.deepStrictEqual({
				mockMode: state.config.values.mockMode,
				mockBranch: state.config.values.mockBranch,
			}, { mockMode: 'managed', mockBranch: updatedBranch });

			client2.close();
		} finally {
			await stopServer(server2);
		}
	});
});
