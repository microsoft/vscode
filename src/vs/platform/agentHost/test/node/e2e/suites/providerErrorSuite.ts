/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, TurnState } from '../../../../common/state/sessionState.js';
import { createRealSession, dispatchTurn, driveTurnToCompletion, getMarkdownResponseText } from '../harness/agentHostE2ETestHarness.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

const RECORD = process.env['AGENT_HOST_REPLAY_RECORD'] === '1' || process.env['AGENT_HOST_UPDATE_SNAPSHOTS'] === '1';

export function defineProviderErrorTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity') {
		return;
	}
	for (const { name, status, code, fetchType } of [
		{ name: 'bad request', status: 400, code: 'invalid_request_error', fetchType: 'badRequest' },
		{ name: 'quota exhaustion', status: 402, code: 'quota_exceeded', fetchType: 'quotaExceeded' },
		{ name: 'missing model endpoint', status: 404, code: 'not_found_error', fetchType: 'notFound' },
		{ name: 'rate limiting', status: 429, code: 'rate_limit_error', fetchType: 'rateLimited' },
	]) {
		const retries = context.config.provider === 'claude' ? status !== 402 : context.config.provider === 'codex' && (status === 402 || status === 404);
		const genericRateLimit = context.config.provider === 'codex' && status === 429;
		const title = retries ? `${name} retries without losing the request`
			: `${name} ${genericRateLimit ? 'is surfaced' : 'remains classified'} and allows a subsequent turn`;
		// Claude can complete an endpoint-not-found turn without a response or an error.
		(context.config.provider !== 'claude' || status !== 404 || context.runKnownIssueTests ? test : test.skip)(`provider errors: ${title}`, async function () {
			this.timeout(180_000);
			const workspace = mkdtempSync(join(tmpdir(), 'ahp-provider-error-'));
			context.tempDirs.push(workspace);
			const session = await createRealSession(context.client, context.config, `provider-error-${status}-${context.config.provider}`, context.createdSessions, URI.file(workspace));
			await driveTurnToCompletion(context.client, session, 'before-error', 'Reply exactly "READY".', 1);
			const message = `Injected E2E ${name} failure.`;
			if (RECORD) {
				context.setRecordingModelResponse({
					status,
					headers: { 'content-type': 'application/json', 'x-should-retry': 'false', 'retry-after': '0', 'x-request-id': 'e2e-classified-error' },
					body: JSON.stringify({ type: 'error', error: { type: code, code, message }, request_id: 'e2e-classified-error' }),
				}, context.config.provider === 'codex' ? '/responses' : '/v1/messages');
			}
			const chat = buildDefaultChatUri(session);
			context.client.clearReceived();
			const requestsBeforeError = context.observedModelRequestBodies.length;
			dispatchTurn(context.client, session, 'failed-turn', 'Reply exactly "UNEXPECTED_SUCCESS".', 100);
			const ended = await context.client.waitForNotification(notification =>
				(isActionNotification(notification, ActionType.ChatError) || isActionNotification(notification, ActionType.ChatTurnComplete))
				&& getActionEnvelope(notification).channel === chat
				&& (getActionEnvelope(notification).action as { turnId: string }).turnId === 'failed-turn',
				90_000,
			);
			const action = getActionEnvelope(ended).action;
			const failed = await fetchSessionWithChat(context.client, session);
			if (retries) {
				assert.deepStrictEqual({
					ending: action.type,
					state: failed.turns.find(turn => turn.id === 'failed-turn')?.state,
					reply: getMarkdownResponseText(context.client).trim(),
					hiddenErrors: context.client.receivedNotifications(notification => isActionNotification(notification, ActionType.ChatError)).length,
				}, { ending: ActionType.ChatTurnComplete, state: TurnState.Complete, reply: 'UNEXPECTED_SUCCESS', hiddenErrors: 0 });
				assert.ok(context.observedModelRequestBodies.length - requestsBeforeError >= 2, 'the provider must have retried the rejected model request');
			} else {
				assert.ok(action.type === ActionType.ChatError, JSON.stringify(failed.turns.find(turn => turn.id === 'failed-turn')));
				const metadata = action.part.error._meta?.chatError as { readonly fetchError?: { readonly type?: string } } | undefined;
				assert.deepStrictEqual({
					state: failed.turns.find(turn => turn.id === 'failed-turn')?.state,
					active: failed.activeTurn,
					classification: genericRateLimit ? action.part.error.errorType : metadata?.fetchError?.type,
				}, { state: TurnState.Error, active: undefined, classification: genericRateLimit ? 'CodexError' : fetchType });
				if (genericRateLimit) {
					assert.match(action.part.error.message, /usage|limit|429/i);
				}
			}
			const recovered = await driveTurnToCompletion(context.client, session, 'after-error', 'Reply exactly "RECOVERED".', 200);
			assert.strictEqual(recovered.responseText.trim(), 'RECOVERED');
		});
	}
}
