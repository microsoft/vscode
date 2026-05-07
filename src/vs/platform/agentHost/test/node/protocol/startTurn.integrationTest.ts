/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import type { StartTurnInvalidConfigErrorData, StartTurnResult, SubscribeResult } from '../../../common/state/protocol/commands.js';
import { ActionType, type SessionAddedNotification } from '../../../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import { AHP_SESSION_NOT_FOUND, AHP_TURN_IN_PROGRESS, JsonRpcErrorCodes, type INotificationBroadcastParams } from '../../../common/state/sessionProtocol.js';
import {
	getActionEnvelope,
	IServerHandle,
	isActionNotification,
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
		await client.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: 'test-startTurn' });
	});

	teardown(function () {
		client.close();
	});

	async function createSubscribedSession(config?: Record<string, unknown>): Promise<{ session: string }> {
		await client.call('createSession', {
			session: nextSessionUri(),
			provider: 'mock',
			workingDirectory: URI.file('/mock/workspace').toString(),
			config: config ?? { isolation: 'worktree', branch: 'main' },
		});
		const notif = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
		);
		const session = ((notif.params as INotificationBroadcastParams).notification as SessionAddedNotification).summary.resource;
		await client.call<SubscribeResult>('subscribe', { resource: session });
		client.clearReceived();
		return { session };
	}

	test('returns {} on success and broadcasts exactly one SessionTurnStarted action', async function () {
		this.timeout(10_000);
		const { session } = await createSubscribedSession();

		const result = await client.call<StartTurnResult>('startTurn', {
			session,
			turnId: 't-success',
			userMessage: { text: 'hello' },
		});
		assert.deepStrictEqual(result, {});

		const turnNotif = await client.waitForNotification(n => isActionNotification(n, ActionType.SessionTurnStarted));
		const envelope = getActionEnvelope(turnNotif);
		assert.strictEqual(envelope.action.type, ActionType.SessionTurnStarted);
		assert.strictEqual(envelope.origin, undefined, 'startTurn must emit a server-originated action');

		// Wait for a deterministic later-in-the-stream notification (the
		// mock's 'hello' prompt completes the turn → SessionTurnComplete
		// arrives after every action emitted earlier on the same wire). If
		// a second SessionTurnStarted were emitted, it would have arrived
		// before SessionTurnComplete since both flow over the same FIFO
		// WebSocket. This avoids flaky time-based asserts.
		await client.waitForNotification(n => isActionNotification(n, ActionType.SessionTurnComplete));
		const turnStartedCount = client.receivedNotifications(n => isActionNotification(n, ActionType.SessionTurnStarted)).length;
		assert.strictEqual(turnStartedCount, 1, 'startTurn must not double-emit SessionTurnStarted');
	});

	test('rejects with InvalidParams + missingRequired when config is incomplete', async function () {
		this.timeout(15_000);

		// Spin up a separate server with the requireApiKey flag enabled so the
		// mock provider's schema-push surfaces a required `apiKey` key.
		const restrictedServer = await startServer({ env: { MOCK_AGENT_REQUIRE_API_KEY: '1' } });
		try {
			const restrictedClient = new TestProtocolClient(restrictedServer.port);
			await restrictedClient.connect();
			await restrictedClient.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: 'test-startTurn-required' });

			const sessionUri = nextSessionUri();
			await restrictedClient.call('createSession', {
				session: sessionUri,
				provider: 'mock',
				workingDirectory: URI.file('/mock/workspace').toString(),
				// Intentionally omit `apiKey`.
			});
			const addedNotif = await restrictedClient.waitForNotification(n =>
				n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
			);
			const session = ((addedNotif.params as INotificationBroadcastParams).notification as SessionAddedNotification).summary.resource;
			await restrictedClient.call<SubscribeResult>('subscribe', { resource: session });

			let thrown: unknown;
			try {
				await restrictedClient.call('startTurn', { session, turnId: 't-missing', userMessage: { text: 'hi' } });
			} catch (err) {
				thrown = err;
			}
			assert.ok(thrown instanceof JsonRpcCallError, `expected JsonRpcCallError, got ${thrown}`);
			const callErr = thrown as JsonRpcCallError;
			assert.strictEqual(callErr.code, JsonRpcErrorCodes.InvalidParams);
			assert.deepStrictEqual((callErr.data as StartTurnInvalidConfigErrorData)?.missingRequired, ['apiKey']);
			restrictedClient.close();
		} finally {
			restrictedServer.process.kill();
		}
	});

	test('rejects with TurnInProgress when a turn is already running', async function () {
		this.timeout(10_000);
		const { session } = await createSubscribedSession();

		// Start the first (long-running) turn; mock 'slow' delays for ~5s before
		// returning idle, so it stays active long enough for the second call.
		await client.call<StartTurnResult>('startTurn', { session, turnId: 't-slow', userMessage: { text: 'slow' } });
		await client.waitForNotification(n => isActionNotification(n, ActionType.SessionTurnStarted));

		let thrown: unknown;
		try {
			await client.call('startTurn', { session, turnId: 't-second', userMessage: { text: 'should reject' } });
		} catch (err) {
			thrown = err;
		}
		assert.ok(thrown instanceof JsonRpcCallError, `expected JsonRpcCallError, got ${thrown}`);
		assert.strictEqual((thrown as JsonRpcCallError).code, AHP_TURN_IN_PROGRESS);
	});

	test('rejects with SessionNotFound for an unknown session URI', async function () {
		this.timeout(5_000);

		let thrown: unknown;
		try {
			await client.call('startTurn', { session: 'mock:/no-such-session', turnId: 't-missing-session', userMessage: { text: 'hi' } });
		} catch (err) {
			thrown = err;
		}
		assert.ok(thrown instanceof JsonRpcCallError, `expected JsonRpcCallError, got ${thrown}`);
		assert.strictEqual((thrown as JsonRpcCallError).code, AHP_SESSION_NOT_FOUND);
	});

	test('client dispatchAction(SessionTurnStarted) is rejected (no bypass of startTurn)', async function () {
		this.timeout(10_000);
		const { session } = await createSubscribedSession();

		// Bypass attempt: dispatch SessionTurnStarted directly. The server
		// must drop this because the action is server-emitted-only after the
		// Final-Phase refactor; otherwise a client could side-step
		// startTurn's schema/turn validation.
		client.notify('dispatchAction', {
			clientSeq: 999,
			action: { type: ActionType.SessionTurnStarted, session, turnId: 't-bypass', userMessage: { text: 'bypass' } },
		});

		// Wait long enough for an action notification to arrive if the
		// server were going to apply it. We expect none for SessionTurnStarted.
		await new Promise(resolve => setTimeout(resolve, 200));
		const turnStarted = client.receivedNotifications(n => isActionNotification(n, ActionType.SessionTurnStarted));
		assert.strictEqual(turnStarted.length, 0, 'server must not apply client-dispatched SessionTurnStarted');
	});

	test('race: SessionConfigChanged then immediate startTurn validates against fresh schema', async function () {
		this.timeout(15_000);

		// Without the inline re-resolve, a client could dispatch a value
		// change and immediately call startTurn before the schema-push
		// side-effect publishes the refined schema — passing validation
		// against stale schema. With the inline re-resolve, startTurn runs
		// _resolveSessionConfig synchronously before validating.
		const restrictedServer = await startServer({ env: { MOCK_AGENT_REQUIRE_API_KEY: '1' } });
		try {
			const restrictedClient = new TestProtocolClient(restrictedServer.port);
			await restrictedClient.connect();
			await restrictedClient.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: 'test-startTurn-race' });

			// Create with apiKey already present so the initial schema's
			// `required` does NOT include apiKey (mock omits it when supplied).
			await restrictedClient.call('createSession', {
				session: nextSessionUri(),
				provider: 'mock',
				workingDirectory: URI.file('/mock/workspace').toString(),
				config: { apiKey: 'seed-key' },
			});
			const addedNotif = await restrictedClient.waitForNotification(n =>
				n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
			);
			const session = ((addedNotif.params as INotificationBroadcastParams).notification as SessionAddedNotification).summary.resource;
			await restrictedClient.call<SubscribeResult>('subscribe', { resource: session });

			// Dispatch SessionConfigChanged that REMOVES the apiKey value.
			// The schema-push side-effect would re-derive `required: ['apiKey']`
			// asynchronously. We immediately call startTurn — the inline
			// re-resolve must close the race and reject.
			restrictedClient.notify('dispatchAction', {
				clientSeq: 1,
				action: { type: ActionType.SessionConfigChanged, session, config: { apiKey: undefined }, replace: true },
			});

			let thrown: unknown;
			try {
				await restrictedClient.call('startTurn', { session, turnId: 't-race', userMessage: { text: 'hi' } });
			} catch (err) {
				thrown = err;
			}
			assert.ok(thrown instanceof JsonRpcCallError, `expected JsonRpcCallError, got ${thrown}`);
			assert.strictEqual((thrown as JsonRpcCallError).code, JsonRpcErrorCodes.InvalidParams);
			assert.deepStrictEqual((thrown as JsonRpcCallError).data as StartTurnInvalidConfigErrorData | undefined, { missingRequired: ['apiKey'] });
			restrictedClient.close();
		} finally {
			restrictedServer.process.kill();
		}
	});

	test('client-supplied schema on SessionConfigChanged is silently stripped', async function () {
		this.timeout(10_000);
		const { session } = await createSubscribedSession();

		// Tampered schema — `required: ['totallyMadeUp']` would, if accepted,
		// make startTurn reject with `missingRequired`. The server must strip
		// `schema` from client-dispatched SessionConfigChanged before applying.
		client.notify('dispatchAction', {
			clientSeq: 1000,
			action: {
				type: ActionType.SessionConfigChanged,
				session,
				config: {},
				schema: { type: 'object', properties: { totallyMadeUp: { type: 'string', title: 'X' } }, required: ['totallyMadeUp'] },
			},
		});

		// Give the server time to process and any schema-push side-effect to settle.
		await new Promise(resolve => setTimeout(resolve, 200));

		// startTurn should still succeed — the malicious schema must not
		// have made it into state.config.schema.
		const result = await client.call<StartTurnResult>('startTurn', {
			session,
			turnId: 't-after-tamper',
			userMessage: { text: 'hello' },
		});
		assert.deepStrictEqual(result, {});
	});
});
