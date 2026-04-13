/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import type { IResolveSessionConfigResult, ISessionConfigCompletionsResult, ISubscribeResult } from '../../../common/state/protocol/commands.js';
import { ActionType, type ISessionAddedNotification } from '../../../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../../../common/state/sessionCapabilities.js';
import type { INotificationBroadcastParams } from '../../../common/state/sessionProtocol.js';
import type { ISessionState } from '../../../common/state/sessionState.js';
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
		await client.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'test-session-config' });
	});

	teardown(function () {
		client.close();
	});

	test('resolveSessionConfig returns schema and re-resolves dependent read-only state', async function () {
		this.timeout(10_000);

		const workingDirectory = URI.file('/mock/workspace').toString();
		const initial = await client.call<IResolveSessionConfigResult>('resolveSessionConfig', {
			provider: 'mock',
			workingDirectory,
		});

		assert.deepStrictEqual({ ready: initial.ready, values: initial.values }, {
			ready: true,
			values: { isolation: 'worktree', branch: 'main' },
		});
		assert.deepStrictEqual(Object.keys(initial.schema.properties), ['isolation', 'branch']);
		assert.deepStrictEqual(initial.schema.properties.branch.enum, ['main']);
		assert.strictEqual(initial.schema.properties.branch.enumDynamic, true);
		assert.strictEqual(initial.schema.properties.branch.readOnly, false);

		const folder = await client.call<IResolveSessionConfigResult>('resolveSessionConfig', {
			provider: 'mock',
			workingDirectory,
			config: { isolation: 'folder', branch: 'feature/config' },
		});

		assert.deepStrictEqual({ ready: folder.ready, values: folder.values }, {
			ready: true,
			values: { isolation: 'folder', branch: 'main' },
		});
		assert.strictEqual(folder.schema.properties.branch.enumDynamic, false);
		assert.strictEqual(folder.schema.properties.branch.readOnly, true);
	});

	test('sessionConfigCompletions returns dynamic branch matches', async function () {
		this.timeout(10_000);

		const result = await client.call<ISessionConfigCompletionsResult>('sessionConfigCompletions', {
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
		const notification = (notif.params as INotificationBroadcastParams).notification as ISessionAddedNotification;
		assert.strictEqual(Object.hasOwn(notification.summary, 'config'), false);

		const snapshot = await client.call<ISubscribeResult>('subscribe', { resource: notification.summary.resource });
		const state = snapshot.snapshot.state as ISessionState;
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
		const session = ((notif.params as INotificationBroadcastParams).notification as ISessionAddedNotification).summary.resource;
		await client.call<ISubscribeResult>('subscribe', { resource: session });
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

		const snapshot = await client.call<ISubscribeResult>('subscribe', { resource: session });
		const state = snapshot.snapshot.state as ISessionState;
		assert.deepStrictEqual(state.config?.values, { isolation: 'folder', branch: 'release' });
	});
});
