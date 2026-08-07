/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ActionType, type ChatErrorAction, type ChatTurnCompleteAction, type ChatTurnResumedAction } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, TurnState } from '../../../../common/state/sessionState.js';
import { createRealSession, dispatchTurn } from '../harness/agentHostE2ETestHarness.js';
import { assertRecordedAhpSnapshot } from '../harness/ahpSnapshot.js';
import { summarizeAnthropicRequest, summarizeResponsesRequest } from '../harness/capiWireCodec.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

const TEST_TITLE = 'resumes a failed turn without adding a message';
const TEST_PROMPT = '$error';

export function defineFailedTurnResumeTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs } = context;
	if (!config.supportsFailedTurnResumeE2E) {
		return;
	}

	test(TEST_TITLE, async function () {
		this.timeout(240_000);
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-resume-test-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `failed-turn-resume-${config.provider}`, createdSessions, URI.file(workspace));
		const chatUri = buildDefaultChatUri(sessionUri);
		const turnId = 'turn-resume';

		context.client.beginAhpSnapshotRound();
		dispatchTurn(context.client, sessionUri, turnId, TEST_PROMPT, 1);
		const errorNotification = await context.client.waitForNotification(notification =>
			isActionNotification(notification, ActionType.ChatError)
			&& (getActionEnvelope(notification).action as ChatErrorAction).turnId === turnId,
			90_000,
		);
		const errorAction = getActionEnvelope(errorNotification).action as ChatErrorAction;
		const prematureCompletionCount = turnActionCount(context, ActionType.ChatTurnComplete, turnId);

		context.client.beginAhpSnapshotRound();
		context.client.dispatch({
			channel: chatUri,
			clientSeq: 2,
			action: { type: ActionType.ChatTurnResumed, turnId },
		});
		const resumeNotification = await context.client.waitForNotification(notification =>
			isActionNotification(notification, ActionType.ChatTurnResumed)
			&& (getActionEnvelope(notification).action as ChatTurnResumedAction).turnId === turnId,
			30_000,
		);
		const terminalNotification = await context.client.waitForNotification(notification => {
			if (notification === errorNotification) {
				return false;
			}
			if (!isActionNotification(notification, ActionType.ChatTurnComplete) && !isActionNotification(notification, ActionType.ChatError)) {
				return false;
			}
			return (getActionEnvelope(notification).action as ChatTurnCompleteAction | ChatErrorAction).turnId === turnId;
		}, 90_000);
		const terminalAction = getActionEnvelope(terminalNotification).action;
		assert.strictEqual(terminalAction.type, ActionType.ChatTurnComplete,
			terminalAction.type === ActionType.ChatError ? `${terminalAction.error.errorType}: ${terminalAction.error.message}` : undefined);

		await assertRecordedAhpSnapshot(this.test!, context.client, { profile: 'behavior' });

		const finalState = await fetchSessionWithChat(context.client, sessionUri);
		const finalTurn = finalState.turns.at(-1);
		const modelRequests = context.observedModelRequestBodies;
		const resumedModelRequest = modelRequests.at(-1);
		assert.ok(resumedModelRequest, 'Expected the resumed turn to reach the model.');
		const summarizedRequest = summarizeAnthropicRequest(resumedModelRequest) ?? summarizeResponsesRequest(resumedModelRequest);
		assert.ok(summarizedRequest, 'Expected a recognized model request dialect.');
		const resumedPromptOccurrences = summarizedRequest.messages
			.filter(message => message.role === 'user')
			.reduce((count, message) => count + countOccurrences(JSON.stringify(message.content), TEST_PROMPT), 0);

		assert.deepStrictEqual({
			initialError: {
				turnId: errorAction.turnId,
				resumable: errorAction.resumable,
			},
			prematureCompletionCount,
			resumeTurnId: (getActionEnvelope(resumeNotification).action as ChatTurnResumedAction).turnId,
			startedTurnCount: turnActionCount(context, ActionType.ChatTurnStarted, turnId),
			resumedTurnCount: turnActionCount(context, ActionType.ChatTurnResumed, turnId),
			completedTurnCount: turnActionCount(context, ActionType.ChatTurnComplete, turnId),
			finalTurn: finalTurn && {
				id: finalTurn.id,
				message: finalTurn.message.text,
				state: finalTurn.state,
				hasResponse: finalTurn.responseParts.length > 0,
			},
			modelRequestCount: modelRequests.length,
			resumedPromptOccurrences,
		}, {
			initialError: {
				turnId,
				resumable: true,
			},
			prematureCompletionCount: 0,
			resumeTurnId: turnId,
			startedTurnCount: 1,
			resumedTurnCount: 1,
			completedTurnCount: 1,
			finalTurn: {
				id: turnId,
				message: TEST_PROMPT,
				state: TurnState.Complete,
				hasResponse: true,
			},
			modelRequestCount: 2,
			resumedPromptOccurrences: 1,
		});
	});
}

function turnActionCount(context: IAgentHostE2ETestContext, actionType: ActionType, turnId: string): number {
	return context.client.receivedNotifications(notification => isActionNotification(notification, actionType))
		.map(notification => getActionEnvelope(notification).action)
		.filter(action => {
			switch (action.type) {
				case ActionType.ChatTurnStarted:
				case ActionType.ChatTurnResumed:
				case ActionType.ChatTurnComplete:
					return action.turnId === turnId;
				default:
					return false;
			}
		})
		.length;
}

function countOccurrences(value: string, search: string): number {
	return value.split(search).length - 1;
}
