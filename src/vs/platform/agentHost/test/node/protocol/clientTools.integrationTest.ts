/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration tests for client-provided tool handling through the protocol layer.
 *
 * These tests verify that:
 * - tool_start with client contributor emits only a toolCallStart (no auto-ready)
 * - tool_ready without confirmationTitle transitions to Running (auto-confirmed)
 * - tool_ready with confirmationTitle transitions to PendingConfirmation
 * - toolCallComplete dispatched by the client flows through to the agent
 *
 * Run with:
 *   ./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/protocol/clientTools.integrationTest.ts
 */

import assert from 'assert';
import { ResponsePartKind, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, buildChatUri, type ToolCallContributor } from '../../../common/state/sessionState.js';
import {
	createAndSubscribeSession,
	defaultChatChannel,
	dispatchTurnStarted,
	fetchSessionWithChat,
	getAgentHostE2ETestTimeout,
	getActionEnvelope,
	IServerHandle,
	isActionNotification,
	startServer,
	stopServer,
	TestProtocolClient,
} from '../serverIntegrationTestHelpers.js';

suite('Protocol WebSocket — Client Tools', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;

	suiteSetup(async function () {
		this.timeout(getAgentHostE2ETestTimeout(15_000, 60_000));
		server = await startServer({ env: { VSCODE_AGENT_HOST_MOCK_MULTIPLE_CHATS: '1' } });
	});

	suiteTeardown(async function () {
		this.timeout(getAgentHostE2ETestTimeout(20_000, 50_000));
		await stopServer(server);
	});

	setup(async function () {
		this.timeout(10_000);
		client = new TestProtocolClient(server.port);
		await client.connect();
	});

	teardown(function () {
		client.close();
	});

	// ---- Client tool: tool_start with client contributor --------------------

	test('client tool_start emits toolCallStart then toolCallReady (auto-confirmed)', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-client-tool');
		dispatchTurnStarted(client, sessionUri, 'turn-ct', 'client-tool', 1);

		// Wait for toolCallStart
		const [toolStartNotif, toolReadyNotif] = await Promise.all([
			client.waitForNotification(n => isActionNotification(n, 'chat/toolCallStart')),
			client.waitForNotification(n => isActionNotification(n, 'chat/toolCallReady')),
		]);
		const toolStartAction = getActionEnvelope(toolStartNotif).action as {
			toolCallId: string;
			contributor?: ToolCallContributor;
		};
		assert.strictEqual(toolStartAction.toolCallId, 'tc-client-1');
		assert.deepStrictEqual(toolStartAction.contributor, { kind: ToolCallContributorKind.Client, clientId: 'test-client-tool' });

		const toolReadyAction = getActionEnvelope(toolReadyNotif).action as {
			toolCallId: string;
			confirmed?: string;
		};
		assert.strictEqual(toolReadyAction.toolCallId, 'tc-client-1');
		assert.strictEqual(toolReadyAction.confirmed, 'not-needed');

		// Complete the client tool call
		client.notify('dispatchAction', {
			clientSeq: 2,
			channel: defaultChatChannel(sessionUri),
			action: {
				type: 'chat/toolCallComplete',
				turnId: 'turn-ct',
				toolCallId: 'tc-client-1',
				result: {
					success: true,
					pastTenseMessage: 'Ran tests',
					content: [{ type: ToolResultContentType.Text, text: 'all passed' }],
				},
			},
		});

		// Wait for turn completion
		await client.waitForNotification(
			n => isActionNotification(n, 'chat/turnComplete'),
		);
	});

	test('peer chat subscription churn preserves the active client and successful tool execution', async function () {
		this.timeout(10_000);
		const clientId = 'test-client-tool';
		const sessionUri = await createAndSubscribeSession(client, clientId);
		const peerChat = buildChatUri(sessionUri, 'peer');
		await client.call('createChat', { channel: sessionUri, chat: peerChat, title: 'Peer Chat' });
		client.notify('dispatchAction', {
			clientSeq: 1,
			channel: sessionUri,
			action: {
				type: 'session/activeClientSet',
				activeClient: { clientId, tools: [{ name: 'runTests', description: 'Runs tests' }] },
			},
		});
		dispatchTurnStarted(client, sessionUri, 'turn-churn', 'client-tool', 2);
		await client.waitForNotification(n => isActionNotification(n, 'chat/toolCallReady'));

		for (let i = 0; i < 10; i++) {
			await client.call('subscribe', { channel: peerChat });
			client.notify('unsubscribe', { channel: peerChat });
		}
		const afterChurn = await fetchSessionWithChat(client, sessionUri);
		const pendingPart = afterChurn.activeTurn?.responseParts[0];
		client.notify('dispatchAction', {
			clientSeq: 3,
			channel: defaultChatChannel(sessionUri),
			action: {
				type: 'chat/toolCallComplete',
				turnId: 'turn-churn',
				toolCallId: 'tc-client-1',
				result: {
					success: true,
					pastTenseMessage: 'Ran tests',
					content: [{ type: ToolResultContentType.Text, text: 'all passed' }],
				},
			},
		});
		await client.waitForNotification(n => isActionNotification(n, 'chat/turnComplete'));
		const completed = await fetchSessionWithChat(client, sessionUri);
		const completedPart = completed.turns.at(-1)?.responseParts.find(part => part.kind === ResponsePartKind.ToolCall);
		assert.deepStrictEqual({
			activeClients: afterChurn.activeClients.map(activeClient => activeClient.clientId),
			pendingStatus: pendingPart?.kind === ResponsePartKind.ToolCall ? pendingPart.toolCall.status : undefined,
			completedTool: completedPart?.kind === ResponsePartKind.ToolCall && completedPart.toolCall.status === ToolCallStatus.Completed ? {
				success: completedPart.toolCall.success,
				content: completedPart.toolCall.content,
			} : undefined,
		}, {
			activeClients: [clientId],
			pendingStatus: ToolCallStatus.Running,
			completedTool: {
				success: true,
				content: [{ type: ToolResultContentType.Text, text: 'all passed' }],
			},
		});
	});

	// ---- Client tool with permission request --------------------------------

	test('client tool with permission fires toolCallReady with confirmationTitle', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-client-perm');
		dispatchTurnStarted(client, sessionUri, 'turn-cp', 'client-tool-with-permission', 1);

		// Wait for toolCallStart (should have client contributor)
		const toolStartNotif = await client.waitForNotification(
			n => isActionNotification(n, 'chat/toolCallStart'),
		);
		const toolStartAction = getActionEnvelope(toolStartNotif).action as {
			toolCallId: string;
			contributor?: ToolCallContributor;
		};
		assert.strictEqual(toolStartAction.toolCallId, 'tc-client-perm-1');
		assert.deepStrictEqual(toolStartAction.contributor, { kind: ToolCallContributorKind.Client, clientId: 'test-client-tool' });

		// Wait for toolCallReady with confirmationTitle (permission flow)
		const toolReadyNotif = await client.waitForNotification(
			n => isActionNotification(n, 'chat/toolCallReady'),
		);
		const toolReadyAction = getActionEnvelope(toolReadyNotif).action as {
			toolCallId: string;
			confirmationTitle?: string;
			confirmed?: string;
		};
		assert.strictEqual(toolReadyAction.toolCallId, 'tc-client-perm-1');
		assert.strictEqual(toolReadyAction.confirmationTitle, 'Allow Run Tests?');
		// Permission flow should NOT have auto-confirmed
		assert.strictEqual(toolReadyAction.confirmed, undefined);

		// Approve the permission
		client.notify('dispatchAction', {
			clientSeq: 2,
			channel: defaultChatChannel(sessionUri),
			action: {
				type: 'chat/toolCallConfirmed',
				turnId: 'turn-cp',
				toolCallId: 'tc-client-perm-1',
				approved: true,
			},
		});

		// Wait for turn completion
		await client.waitForNotification(
			n => isActionNotification(n, 'chat/turnComplete'),
		);
	});

	// ---- tool_ready auto-confirm (non-permission client tools) ---------------

	test('tool_ready without confirmationTitle auto-confirms with NotNeeded', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-ready-auto');
		dispatchTurnStarted(client, sessionUri, 'turn-ra', 'client-tool', 1);

		// Wait for toolCallStart
		await client.waitForNotification(
			n => isActionNotification(n, 'chat/toolCallStart'),
		);

		// Dispatch a synthetic tool_ready without confirmationTitle via
		// completing the tool — the server-side reducer will process the
		// tool_ready that was generated by the event mapper.
		client.notify('dispatchAction', {
			clientSeq: 2,
			channel: defaultChatChannel(sessionUri),
			action: {
				type: 'chat/toolCallComplete',
				turnId: 'turn-ra',
				toolCallId: 'tc-client-1',
				result: {
					success: true,
					pastTenseMessage: 'Done',
					content: [{ type: ToolResultContentType.Text, text: 'ok' }],
				},
			},
		});

		await client.waitForNotification(
			n => isActionNotification(n, 'chat/turnComplete'),
		);
	});
});
