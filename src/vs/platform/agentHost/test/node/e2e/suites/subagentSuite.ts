/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { URI } from '../../../../../../base/common/uri.js';
import { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ActionType, type ChatToolCallStartAction } from '../../../../common/state/sessionActions.js';
import {
	ResponsePartKind,
	ToolCallConfirmationReason,
	ToolResultContentType,
	buildDefaultChatUri,
	buildSubagentSessionUri,
	parseChatUri,
	type ChatState,
	type ISessionWithDefaultChat,
	type ToolResultContent,
	type ToolResultSubagentContent,
} from '../../../../common/state/sessionState.js';
import { createRealSession, dispatchTurn } from '../harness/agentHostE2ETestHarness.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineSubagentTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs, isWindows } = context;
	(config.supportsSubagents ? test : test.skip)('subagent tool calls are routed to the subagent session, not flat in the parent', async function () {
		this.timeout(180_000);

		const tempDir = mkdtempSync(`${tmpdir()}/ahp-subagent-test-`);
		tempDirs.push(tempDir);
		writeFileSync(`${tempDir}/file-a.txt`, 'alpha');
		writeFileSync(`${tempDir}/file-b.txt`, 'beta');

		const sessionUri = await createRealSession(context.client, config, `real-sdk-subagent-${config.provider}`, createdSessions, URI.file(tempDir));
		const sessionChatUri = buildDefaultChatUri(sessionUri);

		let approvalsActive = true;
		let approvalSeq = 1000;
		const processedSeqs = new Set<number>();
		const approvalLoop = (async () => {
			while (approvalsActive) {
				try {
					const ready = await context.client.waitForNotification(n => {
						if (!isActionNotification(n, 'chat/toolCallReady')) {
							return false;
						}
						const envelope = getActionEnvelope(n);
						const a = envelope.action as { confirmed?: string };
						return !a.confirmed && !processedSeqs.has(envelope.serverSeq);
					}, 2_000);
					const envelope = getActionEnvelope(ready);
					if (!processedSeqs.has(envelope.serverSeq)) {
						processedSeqs.add(envelope.serverSeq);
						const action = envelope.action as { turnId: string; toolCallId: string; confirmed?: string };
						if (!action.confirmed) {
							context.client.dispatch({
								channel: envelope.channel,
								clientSeq: ++approvalSeq,
								action: {
									type: ActionType.ChatToolCallConfirmed,
									turnId: action.turnId,
									toolCallId: action.toolCallId, approved: true,
									confirmed: ToolCallConfirmationReason.UserAction,
								},
							});
						}
					}
				} catch { /* timeout — re-poll */ }
			}
		})();

		dispatchTurn(context.client, sessionUri, 'turn-sa',
			`Use the \`${config.subagentToolNames[0]}\` tool to spawn a subagent to list the files in the current working directory. ` +
			'The subagent should call a single read-only tool (e.g. `view` or shell with `ls`) to enumerate the directory. ' +
			'Do not enumerate the directory yourself — delegate to the subagent.',
			1);

		const subagentContentNotif = await context.client.waitForNotification(n => {
			if (!isActionNotification(n, 'chat/toolCallContentChanged')) {
				return false;
			}
			const envelope = getActionEnvelope(n);
			const action = envelope.action as { content: readonly ToolResultContent[] };
			return envelope.channel === sessionChatUri && action.content.some(c => c.type === ToolResultContentType.Subagent);
		}, 120_000);

		const parentContent = (getActionEnvelope(subagentContentNotif).action as { content: readonly ToolResultContent[] }).content;
		const subagentRef = parentContent.find((c): c is ToolResultSubagentContent => c.type === ToolResultContentType.Subagent)!;
		const subagentChatUri = subagentRef.resource as unknown as string;
		const parsedSubagentChat = parseChatUri(subagentChatUri);
		assert.ok(
			parsedSubagentChat?.session === sessionUri && parsedSubagentChat.chatId.startsWith('subagent/'),
			`subagent resource should be a subagent chat of the parent session, got: ${JSON.stringify(subagentChatUri)}`,
		);

		// The subagent's conversation contents (its inner tool calls) are
		// emitted on the chat channel carried by the tool result.
		const subagentSnap = await context.client.call<SubscribeResult>('subscribe', { channel: subagentChatUri });
		const subagentState = subagentSnap.snapshot?.state as ChatState | undefined;
		const subagentFirstTurn = subagentState?.turns?.[0] ?? subagentState?.activeTurn;
		assert.ok(
			subagentFirstTurn?.message.text && subagentFirstTurn.message.text.includes('List the files'),
			`subagent chat's opening request should render the task prompt, got: ${JSON.stringify(subagentFirstTurn?.message.text)}`,
		);

		await context.client.waitForNotification(n => {
			if (!isActionNotification(n, 'chat/turnComplete')) {
				return false;
			}
			return getActionEnvelope(n).channel === sessionChatUri;
		}, 150_000);

		approvalsActive = false;
		await approvalLoop;

		const toolStarts = context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallStart'))
			.map(n => ({ channel: getActionEnvelope(n).channel, action: getActionEnvelope(n).action as ChatToolCallStartAction }));

		const parentStarts = toolStarts.filter(t => t.channel === sessionChatUri).map(t => t.action);
		const subagentStarts = toolStarts.filter(t => t.channel === subagentChatUri).map(t => t.action);

		const subagentToolNames = new Set<string>(config.subagentToolNames);
		const parentNonTaskStarts = parentStarts.filter(a => !subagentToolNames.has(a.toolName));
		assert.deepStrictEqual(parentNonTaskStarts.map(a => a.toolName), [],
			`parent session should not contain inner tool calls; found: ${JSON.stringify(parentNonTaskStarts.map(a => a.toolName))}`);

		assert.ok(subagentStarts.length >= 1,
			`subagent session should contain at least one inner tool call, got ${subagentStarts.length}. ` +
			`Parent tool calls: ${JSON.stringify(parentStarts.map(a => a.toolName))}`);
	});

	// Windows-skipped for providers with on-disk subagent replay (see `subagentReplayUnstableOnWindows`).
	((isWindows && config.subagentReplayUnstableOnWindows) ? test.skip : (config.supportsSubagents ? test : test.skip))('reopening a session keeps sub-agent messages out of the parent transcript (replay path)', async function () {
		this.timeout(180_000);

		const tempDir = mkdtempSync(`${tmpdir()}/ahp-subagent-replay-`);
		tempDirs.push(tempDir);
		writeFileSync(`${tempDir}/file-a.txt`, 'alpha');
		writeFileSync(`${tempDir}/file-b.txt`, 'beta');

		const sessionUri = await createRealSession(context.client, config, `real-sdk-subagent-replay-${config.provider}`, createdSessions, URI.file(tempDir));
		const sessionChatUri = buildDefaultChatUri(sessionUri);

		// A unique phrase that only the subagent is asked to emit in an
		// intermediate assistant message, so replay can detect whether
		// subagent assistant text leaks upward without depending on the
		// parent agent's final summary behavior. It is a fixed string (not a
		// per-run uuid) so the recorded subagent reply still contains the
		// phrase the freshly-issued prompt asks for on replay.
		const sentinel = 'subagent replay note sentinel-7f3a';

		let approvalsActive = true;
		let approvalSeq = 2000;
		const processedSeqs = new Set<number>();
		const approvalLoop = (async () => {
			while (approvalsActive) {
				try {
					const ready = await context.client.waitForNotification(n => {
						if (!isActionNotification(n, 'chat/toolCallReady')) {
							return false;
						}
						const envelope = getActionEnvelope(n);
						const a = envelope.action as { confirmed?: string };
						return !a.confirmed && !processedSeqs.has(envelope.serverSeq);
					}, 2_000);
					const envelope = getActionEnvelope(ready);
					if (!processedSeqs.has(envelope.serverSeq)) {
						processedSeqs.add(envelope.serverSeq);
						const action = envelope.action as { turnId: string; toolCallId: string; confirmed?: string };
						if (!action.confirmed) {
							context.client.dispatch({
								channel: envelope.channel,
								clientSeq: ++approvalSeq,
								action: {
									type: ActionType.ChatToolCallConfirmed,
									turnId: action.turnId,
									toolCallId: action.toolCallId, approved: true,
									confirmed: ToolCallConfirmationReason.UserAction,
								},
							});
						}
					}
				} catch { /* timeout — re-poll */ }
			}
		})();

		dispatchTurn(context.client, sessionUri, 'turn-sa-replay',
			`Use the \`${config.subagentToolNames[0]}\` tool to spawn a subagent to list the files in the current working directory. ` +
			`Instruct the subagent to begin its response with this sentence on its own line: ${sentinel}. ` +
			'Then the subagent should list the files. ' +
			'After the subagent completes, you, the main agent, must reply exactly "SUBAGENT_DONE" and must not repeat that sentence.',
			1);

		const subagentContentNotif = await context.client.waitForNotification(n => {
			if (!isActionNotification(n, 'chat/toolCallContentChanged')) {
				return false;
			}
			const envelope = getActionEnvelope(n);
			const action = envelope.action as { content: readonly ToolResultContent[] };
			return envelope.channel === sessionChatUri && action.content.some(c => c.type === ToolResultContentType.Subagent);
		}, 120_000);

		const parentContent = (getActionEnvelope(subagentContentNotif).action as { content: readonly ToolResultContent[] }).content;
		const subagentRef = parentContent.find((c): c is ToolResultSubagentContent => c.type === ToolResultContentType.Subagent)!;
		const subagentChatUri = subagentRef.resource as unknown as string;
		const parsedSubagentChat = parseChatUri(subagentChatUri);
		assert.ok(
			parsedSubagentChat?.session === sessionUri && parsedSubagentChat.chatId.startsWith('subagent/'),
			`subagent resource should be a subagent chat of the parent session, got: ${JSON.stringify(subagentChatUri)}`,
		);
		const subagentToolCallId = parsedSubagentChat.chatId.slice('subagent/'.length);
		const replaySubagentSessionUri = buildSubagentSessionUri(sessionUri, subagentToolCallId);

		await context.client.call<SubscribeResult>('subscribe', { channel: subagentChatUri });

		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete') && getActionEnvelope(n).channel === sessionChatUri, 150_000);

		approvalsActive = false;
		await approvalLoop;

		// Force a reopen: drop the subagent chat and parent-session
		// subscriptions so the agent host evicts the cached, live-built state,
		// then re-fetch — which rebuilds the turns from the persisted SDK event
		// log through `mapSessionEvents` (the path the regression lived in).
		// The parent-session unsubscribe is sent last so it triggers eviction.
		for (const channel of [subagentChatUri, buildDefaultChatUri(sessionUri), sessionUri]) {
			context.client.notify('unsubscribe', { channel });
		}

		const reopenedParent = await fetchSessionWithChat(context.client, sessionUri);
		// Persisted SDK replay still restores subagents through their derived
		// session resource, while the live path exposes the dedicated chat
		// resource above.
		const reopenedSubagent = await fetchSessionWithChat(context.client, replaySubagentSessionUri);

		const assistantText = (turns: ISessionWithDefaultChat['turns']): string =>
			turns.map(t => t.responseParts.map(p => p.kind === ResponsePartKind.Markdown ? p.content : '').join('')).join('\n');

		const subagentText = assistantText(reopenedSubagent.turns);
		const parentText = assistantText(reopenedParent.turns);

		// Precondition: the sub-agent emitted the phrase and it is routed to the
		// sub-agent transcript on the replay path.
		assert.ok(subagentText.includes(sentinel),
			`sub-agent transcript should contain the phrase after reopen; got: ${JSON.stringify(subagentText).slice(0, 500)}`);

		// The regression: the sub-agent's assistant.message must NOT leak into
		// the parent transcript when the session is reopened.
		assert.ok(!parentText.includes(sentinel),
			`parent transcript must NOT contain the sub-agent's phrase after reopen ` +
			`(replay path leaked sub-agent assistant.message into parent turns); ` +
			`parent text: ${JSON.stringify(parentText).slice(0, 800)}`);
	});
}
