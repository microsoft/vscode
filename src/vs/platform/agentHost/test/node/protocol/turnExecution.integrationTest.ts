/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SubscribeResult } from '../../../common/state/protocol/commands.js';
import type { IResponsePartAction } from '../../../common/state/sessionActions.js';
import type { FetchTurnsResult, ListSessionsResult } from '../../../common/state/sessionProtocol.js';
import { ResponsePartKind, ROOT_STATE_URI, buildSubagentChatUri, isSubagentSession, type MarkdownResponsePart, type ISessionWithDefaultChat } from '../../../common/state/sessionState.js';
import {
	createAndSubscribeSession,
	defaultChatChannel,
	dispatchTurnStarted,
	fetchSessionWithChat,
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

		const responsePart = await client.waitForNotification(n => isActionNotification(n, 'chat/responsePart'));
		const responsePartAction = getActionEnvelope(responsePart).action as IResponsePartAction;
		assert.strictEqual(responsePartAction.part.kind, ResponsePartKind.Markdown);
		assert.strictEqual((responsePartAction.part as MarkdownResponsePart).content, 'Hello, world!');

		await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'));
	});

	test('tool invocation: toolCallStart → toolCallComplete → responsePart → turnComplete', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-tool-invocation');
		dispatchTurnStarted(client, sessionUri, 'turn-tool', 'use-tool', 1);

		await client.waitForNotification(n => isActionNotification(n, 'chat/toolCallStart'));
		await client.waitForNotification(n => isActionNotification(n, 'chat/toolCallReady'));
		const toolComplete = await client.waitForNotification(n => isActionNotification(n, 'chat/toolCallComplete'));
		const tcAction = getActionEnvelope(toolComplete).action;
		if (tcAction.type === 'chat/toolCallComplete') {
			assert.strictEqual(tcAction.result.success, true);
		}
		await client.waitForNotification(n => isActionNotification(n, 'chat/responsePart'));
		await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'));
	});

	test('error prompt triggers chat/error', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-error');
		dispatchTurnStarted(client, sessionUri, 'turn-err', 'error', 1);

		const errorNotif = await client.waitForNotification(n => isActionNotification(n, 'chat/error'));
		const errorAction = getActionEnvelope(errorNotif).action;
		if (errorAction.type === 'chat/error') {
			assert.strictEqual(errorAction.error.message, 'Something went wrong');
		}
	});

	test('cancel turn stops in-progress processing', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-cancel');
		dispatchTurnStarted(client, sessionUri, 'turn-cancel', 'slow', 1);

		client.notify('dispatchAction', {
			channel: defaultChatChannel(sessionUri),
			clientSeq: 2,
			action: { type: 'chat/turnCancelled', turnId: 'turn-cancel' },
		});

		await client.waitForNotification(n => isActionNotification(n, 'chat/turnCancelled'));

		const state = await fetchSessionWithChat(client, sessionUri);
		assert.ok(state.turns.length >= 1);
		assert.strictEqual(state.turns[state.turns.length - 1].state, 'cancelled');
	});

	test('multiple sequential turns accumulate in history', async function () {
		this.timeout(15_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-multi-turns');

		dispatchTurnStarted(client, sessionUri, 'turn-m1', 'hello', 1);
		await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'));

		dispatchTurnStarted(client, sessionUri, 'turn-m2', 'hello', 2);
		await new Promise(resolve => setTimeout(resolve, 200));
		await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'));

		const state = await fetchSessionWithChat(client, sessionUri);
		assert.ok(state.turns.length >= 2, `expected >= 2 turns but got ${state.turns.length}`);
		assert.strictEqual(state.turns[0].id, 'turn-m1');
		assert.strictEqual(state.turns[1].id, 'turn-m2');
	});

	test('fetchTurns acknowledges completed turn history loading', async function () {
		this.timeout(15_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-fetchTurns');

		dispatchTurnStarted(client, sessionUri, 'turn-ft-1', 'hello', 1);
		await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'));

		dispatchTurnStarted(client, sessionUri, 'turn-ft-2', 'hello', 2);
		await new Promise(resolve => setTimeout(resolve, 200));
		await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'));

		const loadedPromise = client.waitForNotification(n => isActionNotification(n, 'chat/turnsLoaded'));
		const result = await client.call<FetchTurnsResult>('fetchTurns', { channel: defaultChatChannel(sessionUri) });
		assert.deepStrictEqual(result, {});
		const loaded = await loadedPromise;
		const action = getActionEnvelope(loaded).action as { type: string; turns: unknown[]; turnsNextCursor?: string };
		assert.deepStrictEqual(action.turns, []);
		assert.strictEqual(action.turnsNextCursor, undefined);
	});

	test('usage info is captured on completed turn', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-usage');
		dispatchTurnStarted(client, sessionUri, 'turn-usage', 'with-usage', 1);

		const usageNotif = await client.waitForNotification(n => isActionNotification(n, 'chat/usage'));
		const usageAction = getActionEnvelope(usageNotif).action as { type: string; usage: { inputTokens: number; outputTokens: number; _meta?: Record<string, unknown> } };
		assert.strictEqual(usageAction.usage.inputTokens, 100);
		assert.strictEqual(usageAction.usage.outputTokens, 50);
		assert.deepStrictEqual(usageAction.usage._meta, { cost: 0.5 });

		await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'));

		const state = await fetchSessionWithChat(client, sessionUri);
		assert.ok(state.turns.length >= 1);
		const turn = state.turns[state.turns.length - 1];
		assert.ok(turn.usage);
		assert.strictEqual(turn.usage!.inputTokens, 100);
		assert.strictEqual(turn.usage!.outputTokens, 50);
		assert.deepStrictEqual(turn.usage!._meta, { cost: 0.5 });
	});

	test('modifiedAt updates on turn completion', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-modifiedAt');

		const initialSnapshot = await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		const initialModifiedAt = Date.parse((initialSnapshot.snapshot!.state as ISessionWithDefaultChat).chats[0].modifiedAt);

		await new Promise(resolve => setTimeout(resolve, 50));

		dispatchTurnStarted(client, sessionUri, 'turn-mod', 'hello', 1);
		await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'));

		const updatedSnapshot = await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		const updatedModifiedAt = Date.parse((updatedSnapshot.snapshot!.state as ISessionWithDefaultChat).chats[0].modifiedAt);
		assert.ok(updatedModifiedAt >= initialModifiedAt);
	});

	test('subagent: inner tool calls land in child session, not parent', async function () {
		this.timeout(15_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-subagent');
		dispatchTurnStarted(client, sessionUri, 'turn-sa', 'subagent', 1);

		// Wait for the parent turn to complete.
		await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'));

		// Subscribe to the child subagent session — its URI is derived from
		// the parent session URI + parent toolCallId.
		const childUri = buildSubagentChatUri(sessionUri, 'tc-task-1');

		const parentState = await fetchSessionWithChat(client, sessionUri);
		const childState = await fetchSessionWithChat(client, childUri);

		// Parent turn should contain the `task` tool call but NOT the inner one.
		const parentTurn = parentState.turns[parentState.turns.length - 1];
		const parentToolCalls = parentTurn.responseParts.filter(p => p.kind === ResponsePartKind.ToolCall);
		const parentToolNames = parentToolCalls.map(p => p.toolCall.toolName);
		assert.deepStrictEqual(parentToolNames, ['task'], 'parent turn should only contain the `task` tool call (inner tool must route to subagent)');

		// Child session should have one turn with the inner `echo_tool` call.
		assert.ok(childState.turns.length >= 1, 'child subagent session should have at least one turn');
		const childTurn = childState.turns[childState.turns.length - 1];
		const childToolCalls = childTurn.responseParts.filter(p => p.kind === ResponsePartKind.ToolCall);
		const childToolNames = childToolCalls.map(p => p.toolCall.toolName);
		assert.deepStrictEqual(childToolNames, ['echo_tool'], 'child subagent session should contain the inner `echo_tool` call');
	});

	test('subagent: child sessions never appear in listSessions', async function () {
		this.timeout(15_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-subagent-list');
		dispatchTurnStarted(client, sessionUri, 'turn-sa-list', 'subagent', 1);

		// Wait for the parent turn to complete so the subagent child session
		// has been created in the state manager.
		await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'));

		// Sanity: the subagent child session is live (subscribing succeeds).
		const childUri = buildSubagentChatUri(sessionUri, 'tc-task-1');
		const childSnapshot = await client.call<SubscribeResult>('subscribe', { channel: childUri });
		assert.ok(childSnapshot.snapshot, 'subagent child session should be live');

		const result = await client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });
		assert.deepStrictEqual(
			{
				subagentSessions: result.items.filter(s => isSubagentSession(s.resource)).map(s => s.resource),
				includesParent: result.items.some(s => s.resource === sessionUri),
			},
			{
				subagentSessions: [],
				includesParent: true,
			},
		);
	});
});
