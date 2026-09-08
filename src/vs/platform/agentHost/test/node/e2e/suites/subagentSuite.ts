/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AgentHostConfigKey, type SessionCustomizationDiscoveryMode } from '../../../../common/agentHostCustomizationConfig.js';
import { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ActionType, type ChatToolCallStartAction } from '../../../../common/state/sessionActions.js';
import {
	ResponsePartKind,
	MessageKind,
	ROOT_STATE_URI,
	ToolCallConfirmationReason,
	ToolResultContentType,
	TurnState,
	buildDefaultChatUri,
	buildSubagentSessionUri,
	parseChatUri,
	type ChatState,
	type ISessionWithDefaultChat,
	type ToolResultContent,
	type ToolResultSubagentContent,
} from '../../../../common/state/sessionState.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { createRealSession, dispatchTurn, driveTurnToCompletion, getMarkdownResponseText, resolveGitHubToken } from '../harness/agentHostE2ETestHarness.js';
import { summarizeAnthropicRequest } from '../harness/capiWireCodec.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineSubagentTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs, isWindows } = context;

	function createCustomAgentWorkspace(prefix: string, allTools = false): string {
		const workspace = mkdtempSync(join(tmpdir(), prefix));
		const agentsDirectory = join(workspace, '.github', 'agents');
		mkdirSync(agentsDirectory, { recursive: true });
		writeFileSync(join(agentsDirectory, 'display-name-child.agent.md'), [
			'---',
			'name: e2e-display-name-child',
			'description: Returns the custom child sentinel',
			...(allTools ? [] : ['tools:', '  - view']),
			'---',
			'Reply exactly "CUSTOM_AGENT_CHILD_OK". Do not call tools.',
		].join('\n'));
		tempDirs.push(workspace);
		return workspace;
	}

	async function createCustomAgentSession(prefix: string, allTools = false, discoveryMode: SessionCustomizationDiscoveryMode = 'scan'): Promise<string> {
		const workspace = createCustomAgentWorkspace(prefix, allTools);
		const sessionUri = await createRealSession(context.client, config, prefix, createdSessions, URI.file(workspace));
		context.client.dispatch({
			channel: ROOT_STATE_URI,
			clientSeq: 1,
			action: {
				type: ActionType.RootConfigChanged,
				config: { [AgentHostConfigKey.SessionCustomizationDiscoveryMode]: discoveryMode },
			},
		});
		return sessionUri;
	}

	function subagentChatFromReceived(parentChat: string): string | undefined {
		for (const notification of context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallContentChanged'))) {
			const envelope = getActionEnvelope(notification);
			if (envelope.channel !== parentChat) {
				continue;
			}
			const content = (envelope.action as { content: readonly ToolResultContent[] }).content;
			const subagent = content.find((item): item is ToolResultSubagentContent => item.type === ToolResultContentType.Subagent);
			if (subagent) {
				return subagent.resource;
			}
		}
		return undefined;
	}

	function markdownText(state: Pick<ChatState, 'turns'> | undefined): string {
		return state?.turns.flatMap(turn => turn.responseParts)
			.filter(part => part.kind === ResponsePartKind.Markdown)
			.map(part => part.content)
			.join('') ?? '';
	}

	function responsePartIds(turns: ISessionWithDefaultChat['turns']): string[] {
		return turns.flatMap(turn => turn.responseParts.flatMap(part => {
			const id = Reflect.get(part, 'id');
			return typeof id === 'string' ? [id] : [];
		}));
	}

	const copilotCustomAgentTest = config.provider === 'copilotcli' && config.supportsSubagents;

	for (const initiallySelected of [true, false]) {
		const title = initiallySelected
			? 'session with a custom agent selected on its first turn remains resumable'
			: 'session with a custom agent selected after a default turn remains resumable';
		(copilotCustomAgentTest ? test : test.skip)(title, async function () {
			this.timeout(180_000);
			const workspace = createCustomAgentWorkspace('ahp-selected-custom-agent-', true);
			const sessionUri = await createRealSession(context.client, config, 'selected-custom-agent', createdSessions, URI.file(workspace));
			context.client.dispatch({
				channel: ROOT_STATE_URI,
				clientSeq: 1,
				action: {
					type: ActionType.RootConfigChanged,
					config: { [AgentHostConfigKey.SessionCustomizationDiscoveryMode]: 'scan' },
				},
			});
			if (!initiallySelected) {
				await driveTurnToCompletion(context.client, sessionUri, 'turn-default-agent', 'Reply exactly "DEFAULT_READY".', 2);
			}
			const chatUri = buildDefaultChatUri(sessionUri);
			const agent = { uri: URI.file(join(workspace, '.github', 'agents', 'display-name-child.agent.md')).toString() };
			context.client.clearReceived();
			context.client.dispatch({
				channel: chatUri,
				clientSeq: 3,
				action: {
					type: ActionType.ChatTurnStarted,
					turnId: 'turn-selected-agent',
					startedAt: new Date().toISOString(),
					message: { text: 'Reply with the exact sentinel from your agent instructions.', origin: { kind: MessageKind.User }, agent },
				},
			});
			await context.client.waitForNotification(n => {
				if (!isActionNotification(n, 'chat/turnComplete')) {
					return false;
				}
				const envelope = getActionEnvelope(n);
				return envelope.channel === chatUri
					&& envelope.action.type === ActionType.ChatTurnComplete
					&& envelope.action.turnId === 'turn-selected-agent';
			}, 90_000);
			const before = await fetchSessionWithChat(context.client, sessionUri);
			assert.strictEqual(markdownText({ turns: before.turns.slice(-1) }).trim(), 'CUSTOM_AGENT_CHILD_OK');

			await context.restartServer();
			context.client.setWorkingDirectory(workspace);
			await context.client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: 'selected-custom-agent-restored' });
			await context.client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: config.githubToken ?? resolveGitHubToken() });
			const restored = await fetchSessionWithChat(context.client, sessionUri);
			assert.deepStrictEqual({
				messages: restored.turns.map(turn => turn.message.text),
				response: markdownText({ turns: restored.turns.slice(-1) }).trim(),
				states: restored.turns.map(turn => turn.state),
			}, {
				messages: before.turns.map(turn => turn.message.text),
				response: 'CUSTOM_AGENT_CHILD_OK',
				states: before.turns.map(() => TurnState.Complete),
			});
			const followup = await driveTurnToCompletion(context.client, sessionUri, 'turn-after-selected-agent', 'Reply exactly "RESUMED".', 4);
			const request: { stream?: boolean } = JSON.parse(context.observedModelRequestBodies.at(-1)!);
			assert.deepStrictEqual({ response: followup.responseText.trim(), streaming: request.stream }, { response: 'RESUMED', streaming: true });
		});
	}

	for (const { title, allTools, checkFileOutputGuidance } of [
		{ title: 'custom agent without a display name completes as a subagent', allTools: false, checkFileOutputGuidance: false },
		{ title: 'custom agent without a tools list completes as a subagent', allTools: true, checkFileOutputGuidance: false },
		{ title: 'custom subagent permits requested file output in its system instructions', allTools: false, checkFileOutputGuidance: true },
	]) {
		(copilotCustomAgentTest ? test : test.skip)(title, async function () {
			this.timeout(180_000);

			const sessionUri = await createCustomAgentSession('ahp-custom-agent-display-name-', allTools, checkFileOutputGuidance ? 'discover' : 'scan');
			const parentChat = buildDefaultChatUri(sessionUri);
			await driveTurnToCompletion(
				context.client,
				sessionUri,
				'turn-custom-agent-display-name',
				'Use the task tool exactly once with agent_type "e2e-display-name-child". Wait for it, then reply exactly "PARENT_DONE".',
				2,
			);

			const subagentChat = subagentChatFromReceived(parentChat);
			assert.ok(subagentChat, 'the parent tool call should expose the custom subagent chat');
			const snapshot = await context.client.call<SubscribeResult>('subscribe', { channel: subagentChat });
			const child = snapshot.snapshot?.state as ChatState | undefined;
			const parent = await fetchSessionWithChat(context.client, sessionUri);
			assert.deepStrictEqual({
				childResponse: markdownText(child).trim(),
				childTurns: child?.turns.map(turn => turn.state),
				parentResponse: markdownText(parent).trim(),
			}, {
				childResponse: 'CUSTOM_AGENT_CHILD_OK',
				childTurns: [TurnState.Complete],
				parentResponse: 'PARENT_DONE',
			});
			if (!allTools && !checkFileOutputGuidance) {
				const request: {
					tools: {
						name: string;
						input_schema: { properties: { model?: { enum?: string[] }; agent_type?: { enum?: string[] }; mode?: { description?: string } } };
					}[];
				} = JSON.parse(context.observedModelRequestBodies[0]);
				const task = request.tools.find(tool => tool.name === 'task');
				assert.deepStrictEqual({
					modelAllowed: task?.input_schema.properties.model?.enum?.includes('claude-sonnet-5'),
					customAgentAllowed: task?.input_schema.properties.agent_type?.enum?.includes('e2e-display-name-child'),
					modeDescription: task?.input_schema.properties.mode?.description,
				}, {
					modelAllowed: true,
					customAgentAllowed: true,
					modeDescription: 'sync waits; background returns immediately. Await results before use.',
				});
			}
			if (checkFileOutputGuidance) {
				const childRequest = context.observedModelRequestBodies.find(body => {
					const request = summarizeAnthropicRequest(body);
					return request?.messages.length === 1 && request.messages[0].content === child?.turns[0].message.text;
				});
				assert.ok(childRequest, 'the custom child must make its own model request');
				assert.deepStrictEqual({
					requiresReplyToCaller: childRequest.includes('**CRITICAL: Ensure a response is returned to your caller.**'),
					forbidsAllFileOutput: childRequest.includes('**CRITICAL: Do NOT write output to files.**'),
				}, {
					requiresReplyToCaller: true,
					forbidsAllFileOutput: false,
				});
			}
		});
	}

	(copilotCustomAgentTest ? test : test.skip)('restored parent accepts a new turn after a custom subagent completes', async function () {
		this.timeout(240_000);

		const sessionUri = await createCustomAgentSession('ahp-restored-custom-agent-');
		const parentChat = buildDefaultChatUri(sessionUri);
		const setup = await driveTurnToCompletion(
			context.client,
			sessionUri,
			'turn-custom-agent-setup',
			'Use the task tool exactly once with agent_type "e2e-display-name-child". Wait for it, then reply exactly "SETUP_DONE".',
			2,
		);
		assert.match(setup.responseText, /SETUP_DONE/);
		const subagentChat = subagentChatFromReceived(parentChat);
		assert.ok(subagentChat, 'the custom subagent should remain in the parent chat catalog');
		const child = await context.client.call<SubscribeResult>('subscribe', { channel: subagentChat });
		assert.strictEqual(markdownText(child.snapshot?.state as ChatState | undefined).trim(), 'CUSTOM_AGENT_CHILD_OK');
		context.client.notify('unsubscribe', { channel: subagentChat });

		const liveParent = await fetchSessionWithChat(context.client, sessionUri);
		const liveResponsePartIds = responsePartIds(liveParent.turns);
		assert.ok(liveResponsePartIds.length > 0);

		const unsubscribeParent = () => {
			context.client.notify('unsubscribe', { channel: parentChat });
			context.client.notify('unsubscribe', { channel: sessionUri });
		};
		unsubscribeParent();

		await retry(async () => {
			const restored = await fetchSessionWithChat(context.client, sessionUri);
			const restoredResponsePartIds = responsePartIds(restored.turns);
			if (restoredResponsePartIds.length === liveResponsePartIds.length
				&& restoredResponsePartIds.every((id, index) => id === liveResponsePartIds[index])) {
				unsubscribeParent();
				throw new Error('parent session has not been reconstructed from persisted provider state');
			}
		}, 50, 100);

		context.client.clearReceived();
		dispatchTurn(context.client, sessionUri, 'turn-after-custom-agent', 'Reply exactly "PARENT_RECOVERED".', 3);
		const started = await context.client.waitForNotification(n => {
			if (!isActionNotification(n, 'chat/turnStarted')) {
				return false;
			}
			const envelope = getActionEnvelope(n);
			return envelope.channel === parentChat
				&& envelope.action.type === ActionType.ChatTurnStarted
				&& envelope.action.turnId === 'turn-after-custom-agent';
		}, 30_000);
		assert.strictEqual(getActionEnvelope(started).rejectionReason, undefined);
		await context.client.waitForNotification(n => {
			if (!isActionNotification(n, 'chat/turnComplete')) {
				return false;
			}
			const envelope = getActionEnvelope(n);
			return envelope.channel === parentChat
				&& envelope.action.type === ActionType.ChatTurnComplete
				&& envelope.action.turnId === 'turn-after-custom-agent';
		}, 90_000);
		assert.match(getMarkdownResponseText(context.client), /PARENT_RECOVERED/);
	});

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
			'The subagent should call a single read-only file-listing tool (e.g. `Glob` or `view`) to enumerate the directory; do not run a shell command. ' +
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
		assert.match(
			subagentFirstTurn?.message.text ?? '',
			/\blist (?:the |its )?files\b/i,
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
		const parentResponse = 'SUBAGENT_DONE';

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
			`After the subagent completes, you, the main agent, must reply exactly "${parentResponse}" and must not repeat that sentence.`,
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

		const assistantText = (turns: ISessionWithDefaultChat['turns']): string =>
			turns.map(t => t.responseParts.map(p => p.kind === ResponsePartKind.Markdown ? p.content : '').join('')).join('\n');

		const liveParent = await fetchSessionWithChat(context.client, sessionUri);
		const liveParentResponsePartIds = responsePartIds(liveParent.turns);
		assert.ok(liveParentResponsePartIds.length > 0);

		const unsubscribeSessionTree = () => {
			// The parent-session unsubscribe is sent last so it triggers eviction.
			for (const channel of [
				subagentChatUri,
				buildDefaultChatUri(replaySubagentSessionUri),
				replaySubagentSessionUri,
				buildDefaultChatUri(sessionUri),
				sessionUri,
			]) {
				context.client.notify('unsubscribe', { channel });
			}
		};

		// Force a reopen: drop the subagent chat and parent-session
		// subscriptions so the agent host evicts the cached, live-built state,
		// then re-fetch — which rebuilds the turns from persisted SDK events.
		unsubscribeSessionTree();

		const { parentText } = await retry(async () => {
			try {
				const reopenedParent = await fetchSessionWithChat(context.client, sessionUri);
				// Persisted SDK replay restores subagents through their derived
				// session resource, while the live path exposes the chat resource.
				const reopenedSubagent = await fetchSessionWithChat(context.client, replaySubagentSessionUri);
				const reopenedParentResponsePartIds = responsePartIds(reopenedParent.turns);
				const subagentText = assistantText(reopenedSubagent.turns);
				const parentText = assistantText(reopenedParent.turns);

				if (reopenedParentResponsePartIds.length === 0
					|| (reopenedParentResponsePartIds.length === liveParentResponsePartIds.length
						&& reopenedParentResponsePartIds.every((id, index) => id === liveParentResponsePartIds[index]))) {
					throw new Error('parent session has not been reconstructed from persisted provider state');
				}
				if (!parentText.includes(parentResponse)) {
					throw new Error(`parent transcript should contain the final response after reopen; got: ${JSON.stringify(parentText).slice(0, 500)}`);
				}
				if (!subagentText.includes(sentinel)) {
					throw new Error(`sub-agent transcript should contain the phrase after reopen; got: ${JSON.stringify(subagentText).slice(0, 500)}`);
				}

				return { parentText };
			} catch (error) {
				// The retry delay must follow unsubscribe so deferred eviction can run.
				unsubscribeSessionTree();
				throw error;
			}
		}, 50, 100);

		// The regression: the sub-agent's assistant.message must NOT leak into
		// the parent transcript when the session is reopened.
		assert.ok(!parentText.includes(sentinel),
			`parent transcript must NOT contain the sub-agent's phrase after reopen ` +
			`(replay path leaked sub-agent assistant.message into parent turns); ` +
			`parent text: ${JSON.stringify(parentText).slice(0, 800)}`);
	});
}
