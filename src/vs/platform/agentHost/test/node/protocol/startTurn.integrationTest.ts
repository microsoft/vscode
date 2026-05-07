/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import type { StartTurnInvalidConfigErrorData, StartTurnResult, SubscribeResult } from '../../../common/state/protocol/commands.js';
import { ActionType, type SessionAddedNotification } from '../../../common/state/sessionActions.js';
import { AHP_SESSION_NOT_FOUND, AHP_TURN_IN_PROGRESS, type INotificationBroadcastParams } from '../../../common/state/sessionProtocol.js';
import { JsonRpcErrorCodes } from '../../../common/state/protocol/errors.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import type { SessionState } from '../../../common/state/sessionState.js';
import {
	getActionEnvelope,
	isActionNotification,
	IServerHandle,
	JsonRpcCallError,
	nextSessionUri,
	startServer,
	TestProtocolClient,
} from './testHelpers.js';

suite('Protocol WebSocket - startTurn', function () {

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
		await client.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: 'test-start-turn' });
	});

	teardown(function () {
		client.close();
	});

	async function createMockSession(config?: Record<string, unknown>): Promise<string> {
		await client.call('createSession', {
			session: nextSessionUri(),
			provider: 'mock',
			workingDirectory: URI.file('/mock/workspace').toString(),
			...(config ? { config } : {}),
		});
		const notif = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
		);
		const session = ((notif.params as INotificationBroadcastParams).notification as SessionAddedNotification).summary.resource;
		await client.call<SubscribeResult>('subscribe', { resource: session });
		client.clearReceived();
		return session;
	}

	test('startTurn succeeds and emits exactly one SessionTurnStartedAction', async function () {
		this.timeout(10_000);

		const session = await createMockSession({ isolation: 'worktree' });

		const result = await client.call<StartTurnResult>('startTurn', {
			session,
			turnId: 'turn-1',
			userMessage: { text: 'hello' },
		});
		assert.strictEqual(result, null);

		const notif = await client.waitForNotification(n => isActionNotification(n, ActionType.SessionTurnStarted));
		const envelope = getActionEnvelope(notif);
		assert.strictEqual(envelope.action.type, ActionType.SessionTurnStarted);
		assert.strictEqual((envelope.action as { session: string }).session, session);
		assert.strictEqual((envelope.action as { turnId: string }).turnId, 'turn-1');

		// Drain a short tail and confirm there is only one turnStarted notification.
		await new Promise(r => setTimeout(r, 100));
		const turnStartedCount = client.receivedNotifications(n => isActionNotification(n, ActionType.SessionTurnStarted)).length;
		assert.strictEqual(turnStartedCount, 1, 'expected exactly one session/turnStarted action');
	});

	test('startTurn rejects with InvalidParams when required config is missing', async function () {
		this.timeout(10_000);

		// `requireApiKey: true` makes the mock provider's resolver mark
		// `apiKey` as required; we deliberately do not seed `apiKey`, so
		// startTurn validation should fail.
		const session = await createMockSession({ isolation: 'worktree', requireApiKey: true });

		try {
			await client.call('startTurn', {
				session,
				turnId: 'turn-1',
				userMessage: { text: 'hello' },
			});
			assert.fail('expected startTurn to reject');
		} catch (err) {
			assert.ok(err instanceof JsonRpcCallError, `expected JsonRpcCallError, got ${err}`);
			assert.strictEqual(err.code, JsonRpcErrorCodes.InvalidParams);
			const data = err.data as StartTurnInvalidConfigErrorData;
			assert.deepStrictEqual(data?.missingRequired, ['apiKey']);
		}
	});

	test('startTurn rejects with TurnInProgress when one is already active', async function () {
		this.timeout(10_000);

		const session = await createMockSession({ isolation: 'worktree' });

		// Send a `slow` message (mock prompt that fires its idle 5s later, so
		// the turn stays active for the duration of this test).
		await client.call<StartTurnResult>('startTurn', {
			session,
			turnId: 'turn-active',
			userMessage: { text: 'slow' },
		});
		await client.waitForNotification(n => isActionNotification(n, ActionType.SessionTurnStarted));

		try {
			await client.call('startTurn', {
				session,
				turnId: 'turn-blocked',
				userMessage: { text: 'hello' },
			});
			assert.fail('expected startTurn to reject because a turn is in progress');
		} catch (err) {
			assert.ok(err instanceof JsonRpcCallError, `expected JsonRpcCallError, got ${err}`);
			assert.strictEqual(err.code, AHP_TURN_IN_PROGRESS);
		}
	});

	test('startTurn rejects with SessionNotFound for an unknown session URI', async function () {
		this.timeout(10_000);

		try {
			await client.call('startTurn', {
				session: 'mock:/no-such-session',
				turnId: 'turn-1',
				userMessage: { text: 'hello' },
			});
			assert.fail('expected startTurn to reject for unknown session');
		} catch (err) {
			assert.ok(err instanceof JsonRpcCallError, `expected JsonRpcCallError, got ${err}`);
			assert.strictEqual(err.code, AHP_SESSION_NOT_FOUND);
		}
	});

	test('race: client mutates config; required-key follow-up rejects subsequent startTurn', async function () {
		this.timeout(10_000);

		// Start with a complete config so the initial state has no required-key gap.
		const session = await createMockSession({ isolation: 'worktree' });

		// Mutate config to flip on the require-api-key flag. The server's
		// re-resolve side-effect emits a follow-up SessionConfigChanged
		// carrying the new schema (which now declares `apiKey` required) but
		// no apiKey value. The next startTurn must fail validation against
		// the freshly-pushed schema.
		client.notify('dispatchAction', {
			clientSeq: 1,
			action: {
				type: ActionType.SessionConfigChanged,
				session,
				config: { requireApiKey: true },
			},
		});

		// Wait for the server-pushed schema follow-up to land in state.
		// We expect at least two SessionConfigChanged notifications: the
		// initial client-originated values update, and the server-originated
		// schema push that follows it.
		let sawSchemaPush = false;
		const deadline = Date.now() + 5_000;
		while (Date.now() < deadline && !sawSchemaPush) {
			await client.waitForNotification(n => isActionNotification(n, ActionType.SessionConfigChanged), 1_000)
				.then(n => {
					const env = getActionEnvelope(n);
					if ((env.action as { schema?: unknown }).schema) {
						sawSchemaPush = true;
					}
				})
				.catch(() => { /* timed out, retry */ });
		}
		assert.ok(sawSchemaPush, 'server should push a follow-up SessionConfigChanged carrying schema');

		// Sanity-check: state.config.schema now lists apiKey as required.
		const snapshot = await client.call<SubscribeResult>('subscribe', { resource: session });
		const state = snapshot.snapshot.state as SessionState;
		assert.deepStrictEqual(state.config?.schema.required, ['apiKey']);

		try {
			await client.call('startTurn', {
				session,
				turnId: 'turn-after-mutation',
				userMessage: { text: 'hello' },
			});
			assert.fail('expected startTurn to reject after the schema push');
		} catch (err) {
			assert.ok(err instanceof JsonRpcCallError);
			assert.strictEqual(err.code, JsonRpcErrorCodes.InvalidParams);
			const data = err.data as StartTurnInvalidConfigErrorData;
			assert.deepStrictEqual(data?.missingRequired, ['apiKey']);
		}
	});
});
