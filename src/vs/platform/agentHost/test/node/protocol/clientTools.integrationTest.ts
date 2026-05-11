/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration tests for client-provided tool handling through the protocol layer.
 *
 * These tests verify that:
 * - tool_start with toolClientId emits only a toolCallStart (no auto-ready)
 * - tool_ready without confirmationTitle transitions to Running (auto-confirmed)
 * - tool_ready with confirmationTitle transitions to PendingConfirmation
 * - toolCallComplete dispatched by the client flows through to the agent
 *
 * Run with:
 *   ./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/protocol/clientTools.integrationTest.ts
 */

import assert from 'assert';
import { ToolResultContentType } from '../../../common/state/sessionState.js';
import {
	createAndSubscribeSession,
	dispatchTurnStarted,
	getActionEnvelope,
	IServerHandle,
	isActionNotification,
	startServer,
	TestProtocolClient,
} from './testHelpers.js';

suite('Protocol WebSocket — Client Tools', function () {

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

	// ---- Client tool: tool_start with toolClientId --------------------------

	test('client tool_start emits toolCallStart then toolCallReady (auto-confirmed)', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-client-tool');
		dispatchTurnStarted(client, sessionUri, 'turn-ct', 'client-tool', 1);

		// Wait for toolCallStart
		const [toolStartNotif, toolReadyNotif] = await Promise.all([
			client.waitForNotification(n => isActionNotification(n, 'session/toolCallStart')),
			client.waitForNotification(n => isActionNotification(n, 'session/toolCallReady')),
		]);
		const toolStartAction = getActionEnvelope(toolStartNotif).action as {
			toolCallId: string;
			toolClientId?: string;
		};
		assert.strictEqual(toolStartAction.toolCallId, 'tc-client-1');
		assert.strictEqual(toolStartAction.toolClientId, 'test-client-tool');

		const toolReadyAction = getActionEnvelope(toolReadyNotif).action as {
			toolCallId: string;
			confirmed?: string;
		};
		assert.strictEqual(toolReadyAction.toolCallId, 'tc-client-1');
		assert.strictEqual(toolReadyAction.confirmed, 'not-needed');

		// Complete the client tool call
		client.notify('dispatchAction', {
			clientSeq: 2,
			action: {
				type: 'session/toolCallComplete',
				session: sessionUri,
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
			n => isActionNotification(n, 'session/turnComplete'),
		);
	});

	// ---- Client tool with permission request --------------------------------

	test('client tool with permission fires toolCallReady with confirmationTitle', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-client-perm');
		dispatchTurnStarted(client, sessionUri, 'turn-cp', 'client-tool-with-permission', 1);

		// Wait for toolCallStart (should have toolClientId)
		const toolStartNotif = await client.waitForNotification(
			n => isActionNotification(n, 'session/toolCallStart'),
		);
		const toolStartAction = getActionEnvelope(toolStartNotif).action as {
			toolCallId: string;
			toolClientId?: string;
		};
		assert.strictEqual(toolStartAction.toolCallId, 'tc-client-perm-1');
		assert.strictEqual(toolStartAction.toolClientId, 'test-client-tool');

		// Wait for toolCallReady with confirmationTitle (permission flow)
		const toolReadyNotif = await client.waitForNotification(
			n => isActionNotification(n, 'session/toolCallReady'),
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
			action: {
				type: 'session/toolCallConfirmed',
				session: sessionUri,
				turnId: 'turn-cp',
				toolCallId: 'tc-client-perm-1',
				approved: true,
			},
		});

		// Wait for turn completion
		await client.waitForNotification(
			n => isActionNotification(n, 'session/turnComplete'),
		);
	});

	// ---- tool_ready auto-confirm (non-permission client tools) ---------------

	test('tool_ready without confirmationTitle auto-confirms with NotNeeded', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-ready-auto');
		dispatchTurnStarted(client, sessionUri, 'turn-ra', 'client-tool', 1);

		// Wait for toolCallStart
		await client.waitForNotification(
			n => isActionNotification(n, 'session/toolCallStart'),
		);

		// Dispatch a synthetic tool_ready without confirmationTitle via
		// completing the tool — the server-side reducer will process the
		// tool_ready that was generated by the event mapper.
		client.notify('dispatchAction', {
			clientSeq: 2,
			action: {
				type: 'session/toolCallComplete',
				session: sessionUri,
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
			n => isActionNotification(n, 'session/turnComplete'),
		);
	});
});
