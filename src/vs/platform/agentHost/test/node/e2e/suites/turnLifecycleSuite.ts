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
import { ToolCallConfirmationReason, buildDefaultChatUri } from '../../../../common/state/sessionState.js';
import {
	createRealSession,
	dispatchTurn,
	driveTurnToCompletion,
} from '../harness/agentHostE2ETestHarness.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineTurnLifecycleTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs, shellToolReplayEnabled, runRecordOnlyTests } = context;
	(shellToolReplayEnabled ? test : test.skip)('tool call triggers permission request and can be approved', async function () {
		this.timeout(120_000);

		const tempDir = mkdtempSync(`${tmpdir()}/ahp-perm-test-`);
		tempDirs.push(tempDir);
		const sessionUri = await createRealSession(context.client, config, `real-sdk-permission-${config.provider}`, createdSessions, URI.file(tempDir));
		dispatchTurn(context.client, sessionUri, 'turn-perm', 'Run the shell command: echo "hello from test"', 1);

		// Validate the permission flow by driving toward the first signal
		// that the tool call actually ran:
		//   - Copilot routes shell calls through `canUseTool`, emitting
		//     `toolCallReady` with `confirmed=undefined`. The test
		//     dispatches `toolCallConfirmed` and expects `toolCallComplete`.
		//   - Claude's `default` permission mode auto-approves safe Bash
		//     commands at the SDK layer and never reaches the host's
		//     `canUseTool`, so the next observable signal is
		//     `toolCallComplete` directly.
		// Either way, `toolCallComplete` is the success indicator. We do
		// not wait for `turnComplete` because Claude's post-tool
		// continuation can outlive any reasonable test timeout for trivial
		// prompts like this one.
		let nextSeq = 2;
		// waitForNotification retains matched notifications, so skip ones already handled.
		const processedSeqs = new Set<number>();
		while (true) {
			const next = await context.client.waitForNotification(n => {
				const isRelevant = (isActionNotification(n, 'chat/toolCallReady')
					&& (getActionEnvelope(n).action as { confirmed?: string }).confirmed === undefined)
					|| isActionNotification(n, 'chat/toolCallComplete')
					|| isActionNotification(n, 'chat/error');
				if (!isRelevant) {
					return false;
				}
				return !processedSeqs.has(getActionEnvelope(n).serverSeq);
			}, 90_000);
			processedSeqs.add(getActionEnvelope(next).serverSeq);
			if (isActionNotification(next, 'chat/error')) {
				throw new Error('Session error during permission test');
			}
			if (isActionNotification(next, 'chat/toolCallComplete')) {
				break;
			}
			const action = getActionEnvelope(next).action as { toolCallId: string };
			context.client.dispatch({
				channel: buildDefaultChatUri(sessionUri),
				clientSeq: nextSeq++,
				action: {
					type: ActionType.ChatToolCallConfirmed,
					turnId: 'turn-perm',
					toolCallId: action.toolCallId, approved: true,
					confirmed: ToolCallConfirmationReason.UserAction,
				},
			});
		}

		const toolStarts = context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallStart'));
		assert.ok(toolStarts.length > 0, 'expected at least one shell tool call');

		// Drain the post-tool continuation to `turnComplete` so the turn ends
		// within this test's window. This is required for the shared replay
		// server (all providers now reuse one server across the suite):
		// returning mid-turn leaves the SDK query in flight, and its
		// continuation HTTP call fires *after* the fixture is swapped for the
		// next test — landing in that test's fixture window as an unrecorded
		// call and failing the strict cache-miss check. Draining keeps every
		// request/response inside the test that owns it. Replay serves the
		// continuation from the fixture instantly; while recording it also
		// lands that model call in the fixture. Bounded + best-effort: some
		// providers' continuations for a trivial prompt can run long while
		// recording.
		try {
			await context.client.waitForNotification(n =>
				isActionNotification(n, 'chat/turnComplete') || isActionNotification(n, 'chat/error'),
				30_000);
		} catch { /* bounded drain */ }
	});

	(config.supportsPlanMode ? test : test.skip)('planning-mode session-state writes are auto-approved in default mode', async function () {
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

		const planTurn = await driveTurnToCompletion(context.client, sessionUri, 'turn-plan',
			`Help me implement a Python script that prints "hello world" to stdout. Write the shortest possible plan to your session plan.md and use the \`${config.exitPlanModeToolName}\` tool to ask me to approve it before writing any code.`, 2);
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

		await context.client.waitForNotification(
			n => isActionNotification(n, 'chat/responsePart') || isActionNotification(n, 'chat/toolCallStart'),
			60_000,
		);

		// `session/abortTurn` is not part of the StateAction union, so it
		// bypasses the typed `dispatch` helper and is sent raw.
		context.client.notify('dispatchAction', {
			channel: sessionUri,
			clientSeq: 2,
			action: { type: 'session/abortTurn' },
		});

		await context.client.waitForNotification(n => isActionNotification(n, 'session/abortTurn'), 10_000);
	});
}
