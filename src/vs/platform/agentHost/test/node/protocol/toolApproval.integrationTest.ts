/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { IResponsePartAction } from '../../../common/state/sessionActions.js';
import { ResponsePartKind, type MarkdownResponsePart } from '../../../common/state/sessionState.js';
import {
	createAndSubscribeSession,
	dispatchTurnStarted,
	getActionEnvelope,
	IServerHandle,
	isActionNotification,
	startServer,
	TestProtocolClient,
} from './testHelpers.js';

suite('Protocol WebSocket — Permissions & Auto-Approve', function () {

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

	// ---- Manual permission flow ------------------------------------------------

	test('permission request → resolve → response', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-permission');
		dispatchTurnStarted(client, sessionUri, 'turn-perm', 'permission', 1);

		// The mock agent fires tool_start + tool_ready instead of permission_request
		await client.waitForNotification(n => isActionNotification(n, 'session/toolCallStart'));
		await client.waitForNotification(n => isActionNotification(n, 'session/toolCallReady'));

		// Confirm the tool call
		client.notify('dispatchAction', {
			clientSeq: 2,
			action: {
				type: 'session/toolCallConfirmed',
				session: sessionUri,
				turnId: 'turn-perm',
				toolCallId: 'tc-perm-1',
				approved: true,
			},
		});

		const responsePart = await client.waitForNotification(n => isActionNotification(n, 'session/responsePart'));
		const responsePartAction = getActionEnvelope(responsePart).action as IResponsePartAction;
		assert.strictEqual(responsePartAction.part.kind, ResponsePartKind.Markdown);
		assert.strictEqual((responsePartAction.part as MarkdownResponsePart).content, 'Allowed.');

		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
	});

	// ---- Edit auto-approve patterns -------------------------------------------

	test('auto-approves write to regular file (no pending confirmation)', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-autoapprove', 'file:///workspace');
		client.clearReceived();

		// Start a turn that triggers a write permission request for a regular .ts file
		dispatchTurnStarted(client, sessionUri, 'turn-autoapprove', 'write-file', 1);

		// The write should be auto-approved — we should see tool_start, tool_complete, and turn_complete
		// but NOT a pending-confirmation toolCallReady (one without `confirmed`).
		await client.waitForNotification(n => isActionNotification(n, 'session/toolCallStart'));
		await client.waitForNotification(n => isActionNotification(n, 'session/toolCallComplete'));
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));

		// Verify no pending-confirmation toolCallReady was received
		const pendingConfirmNotifs = client.receivedNotifications(n => {
			if (!isActionNotification(n, 'session/toolCallReady')) {
				return false;
			}
			const action = getActionEnvelope(n).action as { confirmed?: string };
			return !action.confirmed;
		});
		assert.strictEqual(pendingConfirmNotifs.length, 0, 'should not have received pending-confirmation toolCallReady for auto-approved write');
	});

	test('blocks write to .env file (requires manual confirmation)', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-autoapprove-deny', 'file:///workspace');
		client.clearReceived();

		// Start a turn that tries to write .env (blocked by default patterns)
		dispatchTurnStarted(client, sessionUri, 'turn-deny', 'write-env', 1);

		// The .env write should NOT be auto-approved — we should see toolCallReady (pending confirmation)
		await client.waitForNotification(n => isActionNotification(n, 'session/toolCallStart'));
		await client.waitForNotification(n => isActionNotification(n, 'session/toolCallReady'));

		// Confirm it manually to let the turn complete
		client.notify('dispatchAction', {
			clientSeq: 2,
			action: {
				type: 'session/toolCallConfirmed',
				session: sessionUri,
				turnId: 'turn-deny',
				toolCallId: 'tc-write-env-1',
				approved: true,
				confirmed: 'user-action',
			},
		});

		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
	});

	// ---- Shell auto-approve ---------------------------------------------------

	test('auto-approves allowed shell command (no pending confirmation)', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-shell-approve');
		client.clearReceived();

		// Start a turn that triggers a shell permission request for "ls -la" (allowed command)
		dispatchTurnStarted(client, sessionUri, 'turn-shell-approve', 'run-safe-command', 1);

		// The shell command should be auto-approved — we should see tool_start, tool_complete, and turn_complete
		// but NOT a pending-confirmation toolCallReady.
		await client.waitForNotification(n => isActionNotification(n, 'session/toolCallStart'));
		await client.waitForNotification(n => isActionNotification(n, 'session/toolCallComplete'));
		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));

		// Verify no pending-confirmation toolCallReady was received
		const pendingConfirmNotifs = client.receivedNotifications(n => {
			if (!isActionNotification(n, 'session/toolCallReady')) {
				return false;
			}
			const action = getActionEnvelope(n).action as { confirmed?: string };
			return !action.confirmed;
		});
		assert.strictEqual(pendingConfirmNotifs.length, 0, 'should not have received pending-confirmation toolCallReady for allowed shell command');
	});

	test('blocks denied shell command (requires manual confirmation)', async function () {
		this.timeout(10_000);

		const sessionUri = await createAndSubscribeSession(client, 'test-shell-deny');
		client.clearReceived();

		// Start a turn that triggers a shell permission request for "rm -rf /" (denied command)
		dispatchTurnStarted(client, sessionUri, 'turn-shell-deny', 'run-dangerous-command', 1);

		// The denied command should NOT be auto-approved — we should see toolCallReady (pending confirmation)
		await client.waitForNotification(n => isActionNotification(n, 'session/toolCallStart'));
		await client.waitForNotification(n => isActionNotification(n, 'session/toolCallReady'));

		// Confirm it manually to let the turn complete
		client.notify('dispatchAction', {
			clientSeq: 2,
			action: {
				type: 'session/toolCallConfirmed',
				session: sessionUri,
				turnId: 'turn-shell-deny',
				toolCallId: 'tc-shell-deny-1',
				approved: true,
				confirmed: 'user-action',
			},
		});

		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'));
	});
});
