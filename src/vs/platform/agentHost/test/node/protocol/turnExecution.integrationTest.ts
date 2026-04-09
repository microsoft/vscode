/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ISubscribeResult } from '../../../common/state/protocol/commands.js';
import type { IResponsePartAction } from '../../../common/state/sessionActions.js';
import type { IFetchTurnsResult } from '../../../common/state/sessionProtocol.js';
import { ResponsePartKind, type IMarkdownResponsePart, type ISessionState } from '../../../common/state/sessionState.js';
import {
	createAndSubscribeSession,
	dispatchTurnStarted,
	getActionEnvelope,
	IServerHandle,
	isActionNotification,
	startServer,
	TestProtocolClient,
} from './testHelpers.js';

suite('Protocol WebSocket — Turn Execution', function () {

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
	});

	teardown(function () {
		client.close();
	});

	test('send message and receive responsePart + turnComplete', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-send-message');
		dispatchTurnStarted(client, sessionUri, 'turn-1', 'hello', 1);

		const responsePart = await client.waitForNotification(n => isActionNotification(n, 'session/responsePart'));
		const responsePartAction = getActionEnvelope(responsePart).action as IResponsePartAction;
		assert.strictEqual(responsePartAction.part.kind, ResponsePartKind.Markdown);
		assert.strictEqual((responsePartAction.part as IMarkdownResponsePart).content, 'Hello, world!');

		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
	});

	test('tool invocation: toolCallStart → toolCallComplete → responsePart → turnComplete', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-tool-invocation');
		dispatchTurnStarted(client, sessionUri, 'turn-tool', 'use-tool', 1);

		await client.waitForNotification(n => isActionNotification(n, 'session/toolCallStart'));
		await client.waitForNotification(n => isActionNotification(n, 'session/toolCallReady'));
		const toolComplete = await client.waitForNotification(n => isActionNotification(n, 'session/toolCallComplete'));
		const tcAction = getActionEnvelope(toolComplete).action;
		if (tcAction.type === 'session/toolCallComplete') {
			assert.strictEqual(tcAction.result.success, true);
		}
		await client.waitForNotification(n => isActionNotification(n, 'session/responsePart'));
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
	});

	test('error prompt triggers session/error', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-error');
		dispatchTurnStarted(client, sessionUri, 'turn-err', 'error', 1);

		const errorNotif = await client.waitForNotification(n => isActionNotification(n, 'session/error'));
		const errorAction = getActionEnvelope(errorNotif).action;
		if (errorAction.type === 'session/error') {
			assert.strictEqual(errorAction.error.message, 'Something went wrong');
		}
	});

	test('cancel turn stops in-progress processing', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-cancel');
		dispatchTurnStarted(client, sessionUri, 'turn-cancel', 'slow', 1);

		client.notify('dispatchAction', {
			clientSeq: 2,
			action: { type: 'session/turnCancelled', session: sessionUri, turnId: 'turn-cancel' },
		});

		await client.waitForNotification(n => isActionNotification(n, 'session/turnCancelled'));

		const snapshot = await client.call<ISubscribeResult>('subscribe', { resource: sessionUri });
		const state = snapshot.snapshot.state as ISessionState;
		assert.ok(state.turns.length >= 1);
		assert.strictEqual(state.turns[state.turns.length - 1].state, 'cancelled');
	});

	test('multiple sequential turns accumulate in history', async function () {
		this.timeout(15_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-multi-turns');

		dispatchTurnStarted(client, sessionUri, 'turn-m1', 'hello', 1);
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));

		dispatchTurnStarted(client, sessionUri, 'turn-m2', 'hello', 2);
		await new Promise(resolve => setTimeout(resolve, 200));
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));

		const snapshot = await client.call<ISubscribeResult>('subscribe', { resource: sessionUri });
		const state = snapshot.snapshot.state as ISessionState;
		assert.ok(state.turns.length >= 2, `expected >= 2 turns but got ${state.turns.length}`);
		assert.strictEqual(state.turns[0].id, 'turn-m1');
		assert.strictEqual(state.turns[1].id, 'turn-m2');
	});

	test('fetchTurns returns completed turn history', async function () {
		this.timeout(15_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-fetchTurns');

		dispatchTurnStarted(client, sessionUri, 'turn-ft-1', 'hello', 1);
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));

		dispatchTurnStarted(client, sessionUri, 'turn-ft-2', 'hello', 2);
		await new Promise(resolve => setTimeout(resolve, 200));
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));

		const result = await client.call<IFetchTurnsResult>('fetchTurns', { session: sessionUri, limit: 10 });
		assert.ok(result.turns.length >= 2);
		assert.strictEqual(typeof result.hasMore, 'boolean');
	});

	test('usage info is captured on completed turn', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-usage');
		dispatchTurnStarted(client, sessionUri, 'turn-usage', 'with-usage', 1);

		const usageNotif = await client.waitForNotification(n => isActionNotification(n, 'session/usage'));
		const usageAction = getActionEnvelope(usageNotif).action as { type: string; usage: { inputTokens: number; outputTokens: number } };
		assert.strictEqual(usageAction.usage.inputTokens, 100);
		assert.strictEqual(usageAction.usage.outputTokens, 50);

		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));

		const snapshot = await client.call<ISubscribeResult>('subscribe', { resource: sessionUri });
		const state = snapshot.snapshot.state as ISessionState;
		assert.ok(state.turns.length >= 1);
		const turn = state.turns[state.turns.length - 1];
		assert.ok(turn.usage);
		assert.strictEqual(turn.usage!.inputTokens, 100);
		assert.strictEqual(turn.usage!.outputTokens, 50);
	});

	test('modifiedAt updates on turn completion', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-modifiedAt');

		const initialSnapshot = await client.call<ISubscribeResult>('subscribe', { resource: sessionUri });
		const initialModifiedAt = (initialSnapshot.snapshot.state as ISessionState).summary.modifiedAt;

		await new Promise(resolve => setTimeout(resolve, 50));

		dispatchTurnStarted(client, sessionUri, 'turn-mod', 'hello', 1);
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));

		const updatedSnapshot = await client.call<ISubscribeResult>('subscribe', { resource: sessionUri });
		const updatedModifiedAt = (updatedSnapshot.snapshot.state as ISessionState).summary.modifiedAt;
		assert.ok(updatedModifiedAt >= initialModifiedAt);
	});
});
