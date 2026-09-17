/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { URI } from '../../../../../../base/common/uri.js';
import { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ActionType, NotificationType } from '../../../../common/state/sessionActions.js';
import type { SessionAddedParams } from '../../../../common/state/protocol/notifications.js';
import { buildDefaultChatUri } from '../../../../common/state/sessionState.js';
import {
	createRealSession,
	dispatchTurn,
	driveTurnToCompletion,
} from '../harness/agentHostE2ETestHarness.js';
import { summarizeAnthropicRequest, summarizeResponsesRequest } from '../harness/capiWireCodec.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineTurnLifecycleTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs, runRecordOnlyTests } = context;
	const planModeTitle = config.planModeStyle === 'input-request'
		? 'planning-mode input stays on the same session and retains context after returning to interactive mode'
		: 'planning-mode session-state writes are auto-approved in default mode';

	(config.planModeStyle ? test : test.skip)(planModeTitle, async function () {
		this.timeout(180_000);

		const tempDir = mkdtempSync(`${tmpdir()}/ahp-plan-test-`);
		tempDirs.push(tempDir);
		const sessionUri = await createRealSession(context.client, config, `real-sdk-plan-mode-${config.provider}`, createdSessions, URI.file(tempDir));

		context.client.dispatch({
			channel: sessionUri,
			clientSeq: 1,
			action: { type: ActionType.SessionConfigChanged, config: { mode: 'plan' } },
		});
		await context.client.waitForNotification(n => isActionNotification(n, 'session/configChanged'));

		const planPrompt = config.planModeStyle === 'input-request'
			? 'Use your request_user_input capability to ask exactly one question: "What should the Python script print?" with options "hello world" and "goodbye". Do not call any other tool, run a shell command, or inspect the workspace. After I answer, reply exactly "plan approved".'
			: `Help me implement a Python script that prints "hello world" to stdout. Write the shortest possible plan to your session plan.md and use the \`${config.exitPlanModeToolName}\` tool to ask me to approve it before writing any code.`;
		const planTurn = await driveTurnToCompletion(context.client, sessionUri, 'turn-plan', planPrompt, 2);
		assert.strictEqual(planTurn.sawPendingConfirmation, false, 'should not have received pending-confirmation toolCallReady while writing session-state plan.md');
		assert.ok(planTurn.sawInputRequest, `should reach the ${config.exitPlanModeToolName} question so the test can continue the same session`);

		const extraSessionNotificationsAfterPlan = context.client.receivedNotifications(n =>
			n.method === NotificationType.SessionAdded &&
			(n.params as SessionAddedParams).summary.resource !== sessionUri,
		);
		assert.strictEqual(extraSessionNotificationsAfterPlan.length, 0, 'should not create a second session while answering the plan-mode question');

		context.client.dispatch({
			channel: sessionUri,
			clientSeq: 50,
			action: { type: ActionType.SessionConfigChanged, config: { mode: 'interactive' } },
		});
		await context.client.waitForNotification(n => isActionNotification(n, 'session/configChanged'));

		const followupTurn = await driveTurnToCompletion(context.client, sessionUri, 'turn-followup',
			'What did the plan I just approved say to print? Reply with exactly "hello world".', 100);
		assert.strictEqual(followupTurn.sawPendingConfirmation, false, 'follow-up turn should not surface new pending confirmations');
		assert.match(followupTurn.responseText, /hello world/i, 'follow-up turn should retain the original plan context');
		if (config.planModeStyle === 'session-state') {
			const requestBody = context.observedModelRequestBodies.at(-1);
			const request = requestBody ? (summarizeAnthropicRequest(requestBody) ?? summarizeResponsesRequest(requestBody)) : undefined;
			assert.ok(
				request?.messages.some(message => typeof message.content === 'string' && message.content.includes(planPrompt)),
				'follow-up model request should retain the original planning turn',
			);
		}

		const extraSessionNotificationsAfterFollowup = context.client.receivedNotifications(n =>
			n.method === NotificationType.SessionAdded &&
			(n.params as SessionAddedParams).summary.resource !== sessionUri,
		);
		assert.strictEqual(extraSessionNotificationsAfterFollowup.length, 0, 'sending another message should stay on the same session instead of forking');

		const resubscribeResult = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		assert.strictEqual(resubscribeResult.snapshot!.resource, sessionUri, 'follow-up turn should keep the original session resource');
	});

	// Aborting a turn is inherently a real-streaming test: on replay the
	// recorded (intentionally truncated) response is served instantly, so
	// there is no mid-stream window to abort. Run it only while recording
	// against real CAPI; it is skipped in deterministic replay.
	(runRecordOnlyTests ? test : test.skip)('can abort a running turn', async function () {
		this.timeout(120_000);

		const tempDir = mkdtempSync(`${tmpdir()}/ahp-abort-`);
		tempDirs.push(tempDir);

		const sessionUri = await createRealSession(context.client, config, `real-sdk-abort-${config.provider}`, createdSessions, URI.file(tempDir));
		dispatchTurn(context.client, sessionUri, 'turn-abort', 'Write a very long essay about the history of computing', 1);

		const chatUri = buildDefaultChatUri(sessionUri);
		await context.client.waitForNotification(
			n => (isActionNotification(n, 'chat/responsePart') || isActionNotification(n, 'chat/toolCallStart'))
				&& getActionEnvelope(n).channel === chatUri
				&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-abort',
			60_000,
		);

		context.client.dispatch({
			channel: chatUri,
			clientSeq: 2,
			action: { type: ActionType.ChatTurnCancelled, turnId: 'turn-abort', duration: 0 },
		});

		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnCancelled')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-abort',
			10_000);

		const replacement = await driveTurnToCompletion(context.client, sessionUri, 'turn-after-abort', 'Reply with exactly "after-abort".', 3);
		const state = await fetchSessionWithChat(context.client, sessionUri);
		assert.deepStrictEqual({
			response: replacement.responseText.trim(),
			activeTurn: state.activeTurn,
			inputNeeded: state.inputNeeded,
			cancelledState: state.turns.find(turn => turn.id === 'turn-abort')?.state,
			replacementState: state.turns.find(turn => turn.id === 'turn-after-abort')?.state,
		}, {
			response: 'after-abort',
			activeTurn: undefined,
			inputNeeded: undefined,
			cancelledState: 'cancelled',
			replacementState: 'complete',
		});
	});
}
