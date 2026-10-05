/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { SessionConfigKey } from '../../../../common/sessionConfigKeys.js';
import { parseSessionDbUri } from '../../../../common/sessionDbUri.js';
import { ChatSourceKind, type ListSessionsResult, type ResourceReadResult, type SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ContentEncoding } from '../../../../common/state/protocol/common/commands.js';
import type { SessionSummaryChangedParams } from '../../../../common/state/protocol/channels-root/notifications.js';
import { ActionType, type ChatToolCallCompleteAction, type ChatToolCallStartAction } from '../../../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, MessageAttachmentKind, MessageKind, ResponsePartKind, ROOT_STATE_URI, SessionStatus, ToolCallStatus, ToolResultContentType, TurnState, type ChatState, type SessionState, type ToolResultFileEditContent } from '../../../../common/state/sessionState.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { createRealSession, driveChatTurnToCompletion, driveTurnToCompletion, driveTurnWithAttachmentsToCompletion, resolveGitHubToken } from '../harness/agentHostE2ETestHarness.js';
import { summarizeAnthropicRequest, summarizeResponsesRequest } from '../harness/capiWireCodec.js';
import { fetchSessionWithChat, getActionEnvelope, getAgentHostE2ETestTimeout, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE } from '../../../../common/agent.js';

const RECORDING = process.env['AGENT_HOST_REPLAY_RECORD'] === '1' || process.env['AGENT_HOST_UPDATE_SNAPSHOTS'] === '1';
const RUN_KNOWN_ISSUES = process.env['AGENT_HOST_RUN_KNOWN_ISSUES'] === '1';

export function defineSessionPersistenceTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity') {
		return;
	}
	const { config, createdSessions, tempDirs } = context;

	async function restartAndInitialize(clientId: string, workspace: string): Promise<void> {
		await context.restartServer();
		context.client.setWorkingDirectory(workspace);
		await context.client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId }, 30_000);
		await context.client.call('authenticate', {
			channel: ROOT_STATE_URI,
			resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource,
			token: config.githubToken ?? resolveGitHubToken(),
		}, 30_000);
	}

	function isSameFileSystemEntry(first: string, second: string): boolean {
		const firstStat = fs.statSync(first);
		const secondStat = fs.statSync(second);
		return firstStat.dev === secondStat.dev && firstStat.ino === secondStat.ino;
	}

	function responsePartIds(turns: readonly { readonly responseParts: readonly object[] }[]): string[] {
		return turns.flatMap(turn => turn.responseParts.flatMap(part => {
			const id: unknown = Reflect.get(part, 'id');
			return typeof id === 'string' ? [id] : [];
		}));
	}

	function durableTurnContent<T extends {
		readonly message: { readonly text: string; readonly origin: { readonly kind: string } };
		readonly state: string;
		readonly responseParts: readonly object[];
	}>(turns: readonly T[]): object[] {
		return turns.map(turn => ({
			message: { text: turn.message.text, origin: turn.message.origin.kind },
			state: turn.state,
			responseParts: turn.responseParts.map(part => {
				const normalized = { ...part };
				Reflect.deleteProperty(normalized, 'id');
				return normalized;
			}),
		}));
	}

	function unsubscribeSessionAndChats(sessionUri: string, additionalChats: readonly string[]): void {
		for (const chat of additionalChats) {
			context.client.notify('unsubscribe', { channel: chat });
		}
		context.client.notify('unsubscribe', { channel: buildDefaultChatUri(sessionUri) });
		context.client.notify('unsubscribe', { channel: sessionUri });
	}

	async function releaseAndRestoreSession(sessionUri: string, additionalChats: readonly string[] = []): Promise<void> {
		const before = await fetchSessionWithChat(context.client, sessionUri);
		const beforeResponsePartIds = responsePartIds(before.turns);
		const beforeTurns = durableTurnContent(before.turns);
		assert.ok(beforeResponsePartIds.length > 0);
		unsubscribeSessionAndChats(sessionUri, additionalChats);

		await retry(async () => {
			try {
				const restored = await fetchSessionWithChat(context.client, sessionUri);
				const restoredResponsePartIds = responsePartIds(restored.turns);
				const restoredTurns = durableTurnContent(restored.turns);
				assert.deepStrictEqual(restoredTurns, beforeTurns);
				assert.strictEqual(restoredResponsePartIds.length, beforeResponsePartIds.length);
				if (restoredResponsePartIds.every((id, index) => id === beforeResponsePartIds[index])) {
					throw new Error('Session has not been reconstructed with complete durable provider state');
				}
				for (const chat of additionalChats) {
					await context.client.call<SubscribeResult>('subscribe', { channel: chat });
				}
			} catch (error) {
				unsubscribeSessionAndChats(sessionUri, additionalChats);
				throw error;
			}
		}, 50, 20);
	}

	test('session metadata history and provider context survive a host restart', async function () {
		this.timeout(240_000);
		const workspace = fs.mkdtempSync(`${tmpdir()}/ahp-persistence-`);
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `persistence-${config.provider}`, createdSessions, URI.file(workspace));
		await driveTurnToCompletion(context.client, sessionUri, 'turn-persistence-rename', '/rename Persisted Session', 1, { expectUnread: false });
		await driveTurnToCompletion(context.client, sessionUri, 'turn-persistence-memory', 'Remember the exact code word VIOLET_REHYDRATE. Reply exactly "READY".', 10);

		await releaseAndRestoreSession(sessionUri);
		await restartAndInitialize(`persistence-reconnect-${config.provider}`, workspace);

		await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		const reopened = await fetchSessionWithChat(context.client, sessionUri);
		const followup = await driveTurnToCompletion(
			context.client,
			sessionUri,
			'turn-persistence-followup',
			'Reply with only the exact code word I asked you to remember.',
			20,
		);
		const reopenedWorkingDirectory = reopened.workingDirectories?.[0] ? URI.parse(reopened.workingDirectories[0]).fsPath : undefined;

		assert.deepStrictEqual({
			title: reopened.title,
			workingDirectoryMatches: reopenedWorkingDirectory ? isSameFileSystemEntry(reopenedWorkingDirectory, workspace) : false,
			messages: reopened.turns.map(turn => turn.message.text),
			followupRemembersCodeWord: /VIOLET_REHYDRATE/i.test(followup.responseText),
		}, {
			title: 'Persisted Session',
			workingDirectoryMatches: true,
			messages: [
				'/rename Persisted Session',
				'Remember the exact code word VIOLET_REHYDRATE. Reply exactly "READY".',
			],
			followupRemembersCodeWord: true,
		});
	});

	if (config.provider === 'codex') {
		test('Codex image attachments remain readable after a host restart', async function () {
			this.timeout(240_000);
			const workspace = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'ahp-codex-image-restore-')));
			tempDirs.push(workspace);
			const imageData = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAF0lEQVR4nGP4z8BAEiJN9aiGUQ1DSgMAkPn/Afnh+ngAAAAASUVORK5CYII=';
			const sessionUri = await createRealSession(context.client, config, 'codex-image-restore', createdSessions, URI.file(workspace));
			const prompt = 'An image is attached. Reply exactly "IMAGE_READY".';
			await driveTurnWithAttachmentsToCompletion(context.client, sessionUri, 'turn-image-restore', prompt, [{
				type: MessageAttachmentKind.EmbeddedResource,
				data: imageData,
				contentType: 'image/png',
				label: 'test-image.png',
			}], 1);

			await restartAndInitialize('codex-image-restored', workspace);
			const restored = await fetchSessionWithChat(context.client, sessionUri);
			const attachments = restored.turns[0]?.message.attachments ?? [];
			assert.strictEqual(attachments.length, 1, 'The restored turn must retain its image attachment');
			const attachment = attachments[0];
			assert.ok(attachment.type === MessageAttachmentKind.Resource, 'The restored image must be a readable resource');
			const image = await context.client.call<ResourceReadResult>('resourceRead', {
				channel: ROOT_STATE_URI,
				uri: attachment.uri,
				encoding: ContentEncoding.Base64,
			});
			const followup = await driveTurnToCompletion(context.client, sessionUri, 'turn-image-followup', 'Reply exactly "FOLLOWUP_DONE".', 2);
			assert.deepStrictEqual({
				text: restored.turns[0].message.text,
				displayKind: attachment.displayKind,
				data: image.data,
				followup: followup.responseText.trim(),
			}, {
				text: prompt,
				displayKind: 'image',
				data: imageData,
				followup: 'FOLLOWUP_DONE',
			});
		});
	}

	if (config.provider === 'copilotcli') {
		(RUN_KNOWN_ISSUES ? test : test.skip)('file edit metadata survives a host restart', async function () {
			this.timeout(240_000);
			const workspace = fs.mkdtempSync(`${tmpdir()}/ahp-persistence-file-edit-`);
			tempDirs.push(workspace);
			const filePath = join(workspace, 'stored-edit.txt');
			fs.writeFileSync(filePath, 'BEFORE_RESTART');
			const sessionUri = await createRealSession(context.client, config, 'persistence-file-edit', createdSessions, URI.file(workspace));
			await driveTurnToCompletion(context.client, sessionUri, 'turn-persistence-file-edit-seed', 'Reply exactly "READY".', 1);

			await restartAndInitialize('persistence-file-edit', workspace);
			await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			await context.client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(sessionUri) });
			context.client.dispatch({
				channel: sessionUri,
				clientSeq: 1,
				action: {
					type: ActionType.SessionConfigChanged,
					config: { [SessionConfigKey.AutoApprove]: 'autoApprove' },
				},
			});
			await context.client.waitForNotification(n =>
				isActionNotification(n, 'session/configChanged')
				&& getActionEnvelope(n).channel === sessionUri,
			);
			context.client.clearReceived();
			const turnId = 'turn-persistence-file-edit';
			await driveTurnToCompletion(
				context.client,
				sessionUri,
				turnId,
				`Use edit exactly once to replace BEFORE_RESTART with AFTER_RESTART in ${filePath}. Do not inspect or search for the file and do not run a shell command. Then reply exactly "done".`,
				2,
			);

			const edit = context.client.receivedNotifications(n =>
				isActionNotification(n, 'chat/toolCallComplete')
				&& getActionEnvelope(n).channel === buildDefaultChatUri(sessionUri)
				&& (getActionEnvelope(n).action as ChatToolCallCompleteAction).turnId === turnId,
			).flatMap(n => (getActionEnvelope(n).action as ChatToolCallCompleteAction).result.content ?? [])
				.find((content): content is ToolResultFileEditContent =>
					content.type === ToolResultContentType.FileEdit
					&& !!content.before?.content.uri
					&& !!content.after?.content.uri
					&& !!parseSessionDbUri(content.before.content.uri)
					&& !!parseSessionDbUri(content.after.content.uri)
				);
			assert.ok(edit?.before?.content.uri);
			assert.ok(edit.after?.content.uri);

			const [before, after] = await Promise.all([
				context.client.call<ResourceReadResult>('resourceRead', {
					channel: ROOT_STATE_URI,
					uri: edit.before.content.uri,
					encoding: ContentEncoding.Utf8,
				}),
				context.client.call<ResourceReadResult>('resourceRead', {
					channel: ROOT_STATE_URI,
					uri: edit.after.content.uri,
					encoding: ContentEncoding.Utf8,
				}),
			]);
			assert.deepStrictEqual({ before: before.data, after: after.data }, {
				before: 'BEFORE_RESTART',
				after: 'AFTER_RESTART',
			});
		});
	}

	test('archiving a never-restored session survives a host restart', async function () {
		this.timeout(240_000);
		const workspace = fs.mkdtempSync(`${tmpdir()}/ahp-archive-unrestored-`);
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `archive-unrestored-${config.provider}`, createdSessions, URI.file(workspace));
		await driveTurnToCompletion(context.client, sessionUri, 'turn-archive-unrestored-seed', 'Reply exactly "READY".', 1);
		await restartAndInitialize(`archive-unrestored-reconnect-${config.provider}`, workspace);
		await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		const before = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });
		const beforeSession = before.items.find(item => item.resource === sessionUri);
		assert.ok(beforeSession);
		const isRead = (beforeSession.status & SessionStatus.IsRead) === 0;
		context.client.clearReceived();
		context.client.dispatch({
			channel: sessionUri,
			clientSeq: 1,
			action: { type: ActionType.SessionIsArchivedChanged, isArchived: true },
		});
		await context.client.waitForNotification(notification =>
			notification.method === 'root/sessionSummaryChanged'
			&& (notification.params as SessionSummaryChangedParams).session === sessionUri
			&& (((notification.params as SessionSummaryChangedParams).changes.status ?? 0) & SessionStatus.IsArchived) !== 0,
		);
		context.client.clearReceived();
		context.client.dispatch({
			channel: sessionUri,
			clientSeq: 2,
			action: { type: ActionType.SessionIsReadChanged, isRead },
		});
		await context.client.waitForNotification(notification =>
			notification.method === 'root/sessionSummaryChanged'
			&& (notification.params as SessionSummaryChangedParams).session === sessionUri
			&& (notification.params as SessionSummaryChangedParams).changes.status !== undefined
			&& ((((notification.params as SessionSummaryChangedParams).changes.status ?? 0) & SessionStatus.IsRead) !== 0) === isRead,
		);

		await restartAndInitialize(`archive-unrestored-verify-${config.provider}`, workspace);
		const after = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI, includeArchived: true });
		const restored = after.items.find(item => item.resource === sessionUri);

		assert.deepStrictEqual({
			restored: restored !== undefined,
			isArchived: restored !== undefined && (restored.status & SessionStatus.IsArchived) !== 0,
			isRead: restored !== undefined && (restored.status & SessionStatus.IsRead) !== 0,
		}, {
			restored: true,
			isArchived: true,
			isRead,
		});

		await context.client.call('disposeSession', { channel: sessionUri }, getAgentHostE2ETestTimeout(30_000, 90_000));
		const trackedIndex = createdSessions.indexOf(sessionUri);
		if (trackedIndex >= 0) {
			createdSessions.splice(trackedIndex, 1);
		}
	});

	const peerChatPersistenceEnabled = config.supportsMultipleChats
		&& (config.supportsMultipleChatsE2E !== false || RECORDING)
		&& (!(context.isWindows && config.provider === 'copilotcli') || context.runKnownIssueTests);
	(peerChatPersistenceEnabled ? test : test.skip)('peer chat catalog and transcript survive a host restart', async function () {
		this.timeout(240_000);
		const workspace = fs.mkdtempSync(`${tmpdir()}/ahp-peer-persistence-`);
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `peer-persistence-${config.provider}`, createdSessions, URI.file(workspace));
		await driveTurnToCompletion(context.client, sessionUri, 'turn-peer-persistence-seed', 'Reply exactly "READY".', 1);
		const peerUri = buildChatUri(sessionUri, generateUuid());
		await context.client.call('createChat', { channel: sessionUri, chat: peerUri, title: 'Persisted Peer' }, 30_000);
		await context.client.call<SubscribeResult>('subscribe', { channel: peerUri });
		context.client.clearReceived();
		context.client.dispatch({
			channel: peerUri,
			clientSeq: 10,
			action: {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-peer-local',
				startedAt: new Date().toISOString(),
				message: { text: '/rename Rehydrated Peer', origin: { kind: MessageKind.User } },
			},
		});
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& getActionEnvelope(n).channel === peerUri
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-peer-local',
			60_000,
		);

		await releaseAndRestoreSession(sessionUri, [peerUri]);
		await restartAndInitialize(`peer-persistence-reconnect-${config.provider}`, workspace);

		const reopenedSession = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		const reopenedPeer = await context.client.call<SubscribeResult>('subscribe', { channel: peerUri });
		const sessionState = reopenedSession.snapshot!.state as SessionState;
		const peerState = reopenedPeer.snapshot!.state as ChatState;

		assert.deepStrictEqual({
			catalogEntry: sessionState.chats.find(chat => chat.resource === peerUri)
				? {
					resource: sessionState.chats.find(chat => chat.resource === peerUri)!.resource,
					title: sessionState.chats.find(chat => chat.resource === peerUri)!.title,
					status: sessionState.chats.find(chat => chat.resource === peerUri)!.status,
					modifiedAt: sessionState.chats.find(chat => chat.resource === peerUri)!.modifiedAt,
				}
				: undefined,
			peerTitle: peerState.title,
			peerMessages: peerState.turns.map(turn => turn.message.text),
		}, {
			catalogEntry: {
				resource: peerUri,
				title: 'Rehydrated Peer',
				status: peerState.status,
				modifiedAt: peerState.modifiedAt,
			},
			peerTitle: 'Rehydrated Peer',
			peerMessages: ['/rename Rehydrated Peer'],
		});
	});

	async function createPersistenceSession(prefix: string): Promise<{ sessionUri: string; chatUri: string; workspace: string }> {
		const workspace = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), `ahp-history-${prefix}-`)));
		tempDirs.push(workspace);
		// Keep Codex's protected mount directories stable across sibling-chat startup (KNOWN_ISSUES.md).
		if (config.provider === 'codex' && context.isLinux) {
			for (const directory of ['.git', '.agents', '.codex']) {
				fs.mkdirSync(join(workspace, directory));
			}
		}
		const sessionUri = await createRealSession(context.client, config, `${prefix}-${config.provider}`, createdSessions, URI.file(workspace));
		return { sessionUri, chatUri: buildDefaultChatUri(sessionUri), workspace };
	}

	async function readChat(chat: string): Promise<ChatState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: chat });
		assert.ok(result.snapshot, 'A restored chat must have a snapshot');
		const state = result.snapshot.state as ChatState;
		assert.strictEqual(state.activeTurn, undefined);
		assert.ok(state.turns.every(turn => turn.state === TurnState.Complete));
		return state;
	}

	async function createHistoryPeer(session: string, source?: { chat: string; turnId: string }): Promise<string> {
		const chat = buildChatUri(session, generateUuid());
		await context.client.call('createChat', {
			channel: session,
			chat,
			...(source ? { source: { kind: ChatSourceKind.Fork, ...source } } : {}),
		}, 30_000);
		await readChat(chat);
		return chat;
	}

	function completedToolHistory(state: ChatState): object[] {
		return state.turns.map(turn => ({
			message: turn.message.text,
			state: turn.state,
			tools: turn.responseParts.flatMap(part => {
				if (part.kind !== ResponsePartKind.ToolCall) {
					return [];
				}
				assert.ok(part.toolCall.status === ToolCallStatus.Completed);
				return [{
					name: part.toolCall.toolName,
					status: part.toolCall.status,
					success: part.toolCall.success,
				}];
			}),
		}));
	}

	async function editInChat(chat: string, turnId: string, workspace: string, file: string, before: string, after: string, clientSeq: number, prompt = config.provider === 'claude'
		? `Read ${file} with Read, then use Edit exactly once to replace ${before} with ${after}. Do not search for files or run a shell command. Then reply exactly "EDIT_DONE".`
		: `Use your file editing tool exactly once to replace ${before} with ${after} in ${file}. Do not inspect or search for files and do not run a shell command. Then reply exactly "EDIT_DONE".`): Promise<string> {
		await driveChatTurnToCompletion(context.client, chat, turnId, prompt, clientSeq);
		const editNames = new Set(['edit', 'Edit', 'MultiEdit', 'Write', 'apply_patch', 'file_edit']);
		const starts = context.client.receivedNotifications(n =>
			isActionNotification(n, 'chat/toolCallStart') && getActionEnvelope(n).channel === chat,
		).map(n => getActionEnvelope(n).action as ChatToolCallStartAction)
			.filter(action => action.turnId === turnId && editNames.has(action.toolName));
		const completions = context.client.receivedNotifications(n =>
			isActionNotification(n, 'chat/toolCallComplete') && getActionEnvelope(n).channel === chat,
		).map(n => getActionEnvelope(n).action as ChatToolCallCompleteAction)
			.filter(action => action.turnId === turnId && starts.some(start => start.toolCallId === action.toolCallId));
		assert.ok(completions.length > 0, 'The provider must execute a real file editing tool on the requested chat');
		assert.ok(completions.every(action => action.result.success), `Every file edit must complete successfully: ${JSON.stringify(completions.map(action => action.result))}`);
		assert.strictEqual(fs.readFileSync(join(workspace, file), 'utf8'), `${after}\n`);
		const state = await readChat(chat);
		const turn = state.turns.at(-1);
		assert.strictEqual(turn?.message.text, prompt);
		assert.ok(turn?.responseParts.some(part =>
			part.kind === ResponsePartKind.ToolCall
			&& part.toolCall.status === ToolCallStatus.Completed
			&& part.toolCall.success
			&& completions.some(action => action.toolCallId === part.toolCall.toolCallId),
		));
		return prompt;
	}

	function lastRequestMessages(): readonly { role: string; content: string }[] {
		const body = context.observedModelRequestBodies.at(-1);
		assert.ok(body, 'The continuation must reach the real provider model boundary');
		const request = summarizeAnthropicRequest(body) ?? summarizeResponsesRequest(body);
		assert.ok(request, 'Expected a supported provider model request');
		return request.messages.map(message => ({
			role: message.role,
			content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
		}));
	}

	function assertRequestContext(expected: readonly { role: string; text: string }[], excluded: readonly string[] = []): void {
		const messages = lastRequestMessages();
		let nextIndex = 0;
		for (const entry of expected) {
			const index = messages.findIndex((message, index) => index >= nextIndex && message.role === entry.role && message.content.includes(entry.text));
			assert.ok(index >= nextIndex, `Missing ordered ${entry.role} context: ${entry.text}`);
			nextIndex = index + 1;
		}
		for (const text of excluded) {
			assert.ok(messages.every(message => !message.content.includes(text)), `Unrelated context leaked into the provider request: ${text}`);
		}
	}

	function isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	function assertRequestToolPair(inputText: string): void {
		const body = context.observedModelRequestBodies.at(-1);
		assert.ok(body);
		const request: unknown = JSON.parse(body);
		assert.ok(isRecord(request));
		const blocks: Record<string, unknown>[] = [];
		if (Array.isArray(request.messages)) {
			for (const message of request.messages) {
				if (isRecord(message) && Array.isArray(message.content)) {
					blocks.push(...message.content.filter(isRecord));
				}
			}
		} else {
			assert.ok(Array.isArray(request.input));
			blocks.push(...request.input.filter(isRecord));
		}
		const calls = blocks.filter(block => {
			const input = JSON.stringify(block.input ?? block.arguments);
			return (block.type === 'tool_use' || block.type === 'function_call' || block.type === 'custom_tool_call')
				&& typeof input === 'string' && input.includes(inputText);
		});
		assert.ok(calls.length > 0, `Expected a persisted tool invocation containing ${inputText}`);
		for (const call of calls) {
			const id = call.type === 'tool_use' ? call.id : call.call_id;
			assert.strictEqual(typeof id, 'string');
			const result = blocks.find(block =>
				(block.type === 'tool_result' && block.tool_use_id === id && block.is_error !== true && block.content !== undefined)
				|| ((block.type === 'function_call_output' || block.type === 'custom_tool_call_output') && block.call_id === id && block.output !== undefined),
			);
			assert.ok(result, 'A completed persisted tool invocation must retain its matching result');
			assert.doesNotMatch(JSON.stringify(result.content ?? result.output), /Tool execution (?:was )?(?:aborted|interrupted)/i);
		}
	}

	// Reuse the documented Copilot/Windows tool-history restart limitation.
	const restoredToolHistoryEnabled = !(context.isWindows && config.provider === 'copilotcli') || context.runKnownIssueTests;
	// Claude's documented turn-anchor defect also prevents recording a provider-backed fork.
	const forkHistoryEnabled = config.supportsChatFork && (config.supportsChatForkE2E || (RECORDING && context.runKnownIssueTests));
	const restoredForkHistoryEnabled = forkHistoryEnabled && peerChatPersistenceEnabled;

	test('regression coverage: cold resume retains ordered user and assistant context', async function () {
		this.timeout(240_000);
		const { sessionUri, chatUri, workspace } = await createPersistenceSession('ordered-context');
		const firstPrompt = 'Remember the first entry ORDERED_ALPHA. Reply exactly "ALPHA_READY".';
		const secondPrompt = 'Remember the second entry ORDERED_BETA without replacing the first. Reply exactly "BETA_READY".';
		const first = await driveChatTurnToCompletion(context.client, chatUri, 'ordered-first', firstPrompt, 1);
		const second = await driveChatTurnToCompletion(context.client, chatUri, 'ordered-second', secondPrompt, 10);
		assert.ok(first.responseText.trim() && second.responseText.trim());
		await restartAndInitialize('ordered-context-restored', workspace);
		assert.deepStrictEqual((await readChat(chatUri)).turns.map(turn => turn.message.text), [firstPrompt, secondPrompt]);
		const followup = 'Reply with both entries in the order I gave them. Do not use tools.';
		await driveChatTurnToCompletion(context.client, chatUri, 'ordered-followup', followup, 1);
		assertRequestContext([
			{ role: 'user', text: firstPrompt },
			{ role: 'assistant', text: first.responseText.trim() },
			{ role: 'user', text: secondPrompt },
			{ role: 'assistant', text: second.responseText.trim() },
			{ role: 'user', text: followup },
		]);
		assert.deepStrictEqual((await fetchSessionWithChat(context.client, sessionUri)).turns.map(turn => turn.message.text), [firstPrompt, secondPrompt, followup]);
	});

	test('regression coverage: identical prompts remain separate completed turns after resume', async function () {
		this.timeout(240_000);
		const { chatUri, workspace } = await createPersistenceSession('identical-prompts');
		const prompt = 'Reply exactly "REPEATED_READY". Do not use tools.';
		await driveChatTurnToCompletion(context.client, chatUri, 'identical-first', prompt, 1);
		await driveChatTurnToCompletion(context.client, chatUri, 'identical-second', prompt, 10);
		await restartAndInitialize('identical-prompts-restored', workspace);
		const restored = await readChat(chatUri);
		assert.deepStrictEqual({
			messages: restored.turns.map(turn => turn.message.text),
			distinctTurns: new Set(restored.turns.map(turn => turn.id)).size,
		}, { messages: [prompt, prompt], distinctTurns: 2 });
		await driveChatTurnToCompletion(context.client, chatUri, 'identical-followup', 'Reply exactly "CONTINUED". Do not use tools.', 1);
		assertRequestContext([{ role: 'user', text: prompt }, { role: 'assistant', text: 'REPEATED_READY' }, { role: 'user', text: prompt }, { role: 'assistant', text: 'REPEATED_READY' }]);
		assert.strictEqual(lastRequestMessages().filter(message => message.role === 'user' && message.content.includes(prompt)).length, 2);
	});

	(restoredToolHistoryEnabled ? test : test.skip)('regression coverage: completed file edit remains paired with its result after resume', async function () {
		this.timeout(240_000);
		const { chatUri, workspace } = await createPersistenceSession('completed-edit');
		fs.writeFileSync(join(workspace, 'paired.txt'), 'PAIR_BEFORE\n');
		const prompt = await editInChat(chatUri, 'paired-edit', workspace, 'paired.txt', 'PAIR_BEFORE', 'PAIR_AFTER', 1);
		const before = completedToolHistory(await readChat(chatUri));
		await restartAndInitialize('completed-edit-restored', workspace);
		assert.deepStrictEqual(completedToolHistory(await readChat(chatUri)), before);
		await driveChatTurnToCompletion(context.client, chatUri, 'paired-followup', 'Reply exactly "HISTORY_READY". Do not use tools.', 1);
		assertRequestContext([{ role: 'user', text: prompt }, { role: 'assistant', text: 'EDIT_DONE' }]);
		assertRequestToolPair('PAIR_AFTER');
		assert.strictEqual(fs.readFileSync(join(workspace, 'paired.txt'), 'utf8'), 'PAIR_AFTER\n');
	});

	(restoredToolHistoryEnabled ? test : test.skip)('regression coverage: successive file edits retain their turn ownership after restart', async function () {
		this.timeout(240_000);
		const { chatUri, workspace } = await createPersistenceSession('successive-edits');
		fs.writeFileSync(join(workspace, 'successive.txt'), 'EDIT_ZERO\n');
		const first = await editInChat(chatUri, 'successive-first', workspace, 'successive.txt', 'EDIT_ZERO', 'EDIT_ONE', 1);
		const second = await editInChat(chatUri, 'successive-second', workspace, 'successive.txt', 'EDIT_ONE', 'EDIT_TWO', 10);
		const before = completedToolHistory(await readChat(chatUri));
		await restartAndInitialize('successive-edits-restored', workspace);
		const restored = await readChat(chatUri);
		assert.deepStrictEqual(completedToolHistory(restored), before);
		assert.deepStrictEqual(restored.turns.map(turn => turn.message.text), [first, second]);
		const ids = restored.turns.flatMap(turn => turn.responseParts.flatMap(part => part.kind === ResponsePartKind.ToolCall ? [part.toolCall.toolCallId] : []));
		assert.strictEqual(new Set(ids).size, ids.length, 'A completed call must belong to exactly one restored turn');
		await driveChatTurnToCompletion(context.client, chatUri, 'successive-followup', 'Reply exactly "TWO_EDITS_READY". Do not use tools.', 1);
		assertRequestToolPair('EDIT_ZERO');
		assertRequestToolPair('EDIT_TWO');
	});

	(peerChatPersistenceEnabled ? test : test.skip)('regression coverage: peer tool history and subsequent edits stay on the restored peer', async function () {
		this.timeout(240_000);
		const { sessionUri, chatUri, workspace } = await createPersistenceSession('peer-tool-history');
		const defaultPrompt = 'Remember DEFAULT_HISTORY_ONLY. Reply exactly "DEFAULT_READY".';
		await driveChatTurnToCompletion(context.client, chatUri, 'peer-tools-default', defaultPrompt, 1);
		const peer = await createHistoryPeer(sessionUri);
		fs.writeFileSync(join(workspace, 'peer-edit.txt'), 'PEER_BEFORE\n');
		const first = await editInChat(peer, 'peer-tools-first', workspace, 'peer-edit.txt', 'PEER_BEFORE', 'PEER_MIDDLE', 10);
		const before = completedToolHistory(await readChat(peer));
		await restartAndInitialize('peer-tools-restored', workspace);
		await fetchSessionWithChat(context.client, sessionUri);
		assert.deepStrictEqual(completedToolHistory(await readChat(peer)), before);
		const second = await editInChat(peer, 'peer-tools-second', workspace, 'peer-edit.txt', 'PEER_MIDDLE', 'PEER_AFTER', 1);
		assertRequestContext([{ role: 'user', text: first }], ['DEFAULT_HISTORY_ONLY']);
		assertRequestToolPair('PEER_MIDDLE');
		assert.deepStrictEqual({
			defaultMessages: (await readChat(chatUri)).turns.map(turn => turn.message.text),
			peerMessages: (await readChat(peer)).turns.map(turn => turn.message.text),
		}, { defaultMessages: [defaultPrompt], peerMessages: [first, second] });
	});

	(peerChatPersistenceEnabled ? test : test.skip)('regression coverage: cold restored peers retain independent provider contexts', async function () {
		this.timeout(240_000);
		const { sessionUri, workspace } = await createPersistenceSession('peer-context-isolation');
		await driveTurnToCompletion(context.client, sessionUri, 'isolation-default', 'Reply exactly "DEFAULT_READY".', 1);
		const first = await createHistoryPeer(sessionUri);
		const second = await createHistoryPeer(sessionUri);
		const firstPrompt = 'Remember PEER_RED_ONLY. Reply exactly "RED_READY".';
		const secondPrompt = 'Remember PEER_BLUE_ONLY. Reply exactly "BLUE_READY".';
		await driveChatTurnToCompletion(context.client, first, 'isolation-red', firstPrompt, 10);
		await driveChatTurnToCompletion(context.client, second, 'isolation-blue', secondPrompt, 20);
		await restartAndInitialize('peer-isolation-restored', workspace);
		await fetchSessionWithChat(context.client, sessionUri);
		assert.deepStrictEqual([
			(await readChat(first)).turns.map(turn => turn.message.text),
			(await readChat(second)).turns.map(turn => turn.message.text),
		], [[firstPrompt], [secondPrompt]]);
		await driveChatTurnToCompletion(context.client, second, 'isolation-blue-followup', 'Reply with the code word I gave this chat. Do not use tools.', 1);
		assertRequestContext([{ role: 'user', text: secondPrompt }, { role: 'assistant', text: 'BLUE_READY' }], ['PEER_RED_ONLY']);
		await driveChatTurnToCompletion(context.client, first, 'isolation-red-followup', 'Reply with the code word I gave this chat. Do not use tools.', 10);
		assertRequestContext([{ role: 'user', text: firstPrompt }, { role: 'assistant', text: 'RED_READY' }], ['PEER_BLUE_ONLY']);
	});

	(peerChatPersistenceEnabled ? test : test.skip)('regression coverage: catalog refresh does not promote restored peer backings to sessions', async function () {
		this.timeout(240_000);
		const { sessionUri, workspace } = await createPersistenceSession('peer-backing-catalog');
		await driveTurnToCompletion(context.client, sessionUri, 'catalog-default', 'Reply exactly "CATALOG_READY".', 1);
		const before = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });
		assert.ok(before.items.some(item => item.resource === sessionUri));
		const peer = await createHistoryPeer(sessionUri);
		const prompt = 'Remember CATALOG_PEER_ONLY. Reply exactly "PEER_READY".';
		await driveChatTurnToCompletion(context.client, peer, 'catalog-peer', prompt, 10);
		await restartAndInitialize('peer-catalog-restored', workspace);
		await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });
		await fetchSessionWithChat(context.client, sessionUri);
		assert.deepStrictEqual((await readChat(peer)).turns.map(turn => turn.message.text), [prompt]);
		for (let refresh = 0; refresh < 2; refresh++) {
			const listed = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });
			assert.deepStrictEqual(listed.items.map(item => item.resource).sort(), before.items.map(item => item.resource).sort());
			const session = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			assert.strictEqual((session.snapshot!.state as SessionState).chats.filter(chat => chat.resource === peer).length, 1);
		}
		await driveChatTurnToCompletion(context.client, peer, 'catalog-peer-followup', 'Reply exactly "PEER_CONTINUED". Do not use tools.', 1);
		assertRequestContext([{ role: 'user', text: prompt }, { role: 'assistant', text: 'PEER_READY' }]);
	});

	(peerChatPersistenceEnabled ? test : test.skip)('regression coverage: an unstarted peer can execute its first tool turn after restart', async function () {
		this.timeout(240_000);
		const { sessionUri, workspace } = await createPersistenceSession('unstarted-peer');
		await driveTurnToCompletion(context.client, sessionUri, 'unstarted-default', 'Remember DEFAULT_NOT_IN_PEER. Reply exactly "READY".', 1);
		const completedPeer = await createHistoryPeer(sessionUri);
		await driveChatTurnToCompletion(context.client, completedPeer, 'unstarted-sibling', 'Remember SIBLING_NOT_IN_PEER. Reply exactly "READY".', 10);
		const unstartedPeer = await createHistoryPeer(sessionUri);
		assert.deepStrictEqual((await readChat(unstartedPeer)).turns, []);
		fs.writeFileSync(join(workspace, 'first-peer.txt'), 'FIRST_BEFORE\n');
		await restartAndInitialize('unstarted-peer-restored', workspace);
		const session = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		assert.ok((session.snapshot!.state as SessionState).chats.some(chat => chat.resource === unstartedPeer));
		assert.deepStrictEqual((await readChat(unstartedPeer)).turns, []);
		const prompt = await editInChat(unstartedPeer, 'unstarted-first-edit', workspace, 'first-peer.txt', 'FIRST_BEFORE', 'FIRST_AFTER', 1);
		assertRequestContext([{ role: 'user', text: prompt }], ['DEFAULT_NOT_IN_PEER', 'SIBLING_NOT_IN_PEER']);
		assert.strictEqual((await readChat(completedPeer)).turns.length, 1);
	});

	(forkHistoryEnabled ? test : test.skip)('regression coverage: a first-turn fork excludes later source context', async function () {
		this.timeout(240_000);
		const { sessionUri, chatUri } = await createPersistenceSession('first-turn-fork');
		const firstPrompt = 'Remember FIRST_FORK_INCLUDED. Reply exactly "FIRST_READY".';
		const laterPrompt = 'Remember LATER_FORK_EXCLUDED. Reply exactly "LATER_READY".';
		await driveChatTurnToCompletion(context.client, chatUri, 'fork-first-source', firstPrompt, 1);
		await driveChatTurnToCompletion(context.client, chatUri, 'fork-later-source', laterPrompt, 10);
		const fork = await createHistoryPeer(sessionUri, { chat: chatUri, turnId: 'fork-first-source' });
		assert.deepStrictEqual((await readChat(fork)).turns.map(turn => turn.message.text), [firstPrompt]);
		await driveChatTurnToCompletion(context.client, fork, 'fork-first-followup', 'Reply with the code word from the source conversation. Do not use tools.', 20);
		assertRequestContext([{ role: 'user', text: firstPrompt }, { role: 'assistant', text: 'FIRST_READY' }], ['LATER_FORK_EXCLUDED', 'LATER_READY']);
		assert.deepStrictEqual((await readChat(chatUri)).turns.map(turn => turn.message.text), [firstPrompt, laterPrompt]);
	});

	(forkHistoryEnabled ? test : test.skip)('regression coverage: a middle-turn fork includes completed tools but excludes the next turn', async function () {
		this.timeout(240_000);
		const { sessionUri, chatUri, workspace } = await createPersistenceSession('middle-tool-fork');
		const seed = 'Remember MIDDLE_FORK_SEED. Reply exactly "SEED_READY".';
		await driveChatTurnToCompletion(context.client, chatUri, 'middle-seed', seed, 1);
		fs.writeFileSync(join(workspace, 'middle.txt'), 'MIDDLE_BEFORE\n');
		const editPrompt = await editInChat(chatUri, 'middle-selected', workspace, 'middle.txt', 'MIDDLE_BEFORE', 'MIDDLE_AFTER', 10);
		const selected = completedToolHistory(await readChat(chatUri));
		const excluded = 'Remember AFTER_BOUNDARY_EXCLUDED. Reply exactly "EXCLUDED_READY".';
		await driveChatTurnToCompletion(context.client, chatUri, 'middle-excluded', excluded, 20);
		const fork = await createHistoryPeer(sessionUri, { chat: chatUri, turnId: 'middle-selected' });
		assert.deepStrictEqual(completedToolHistory(await readChat(fork)), selected);
		await driveChatTurnToCompletion(context.client, fork, 'middle-followup', 'Reply exactly "FORK_HISTORY_READY". Do not use tools.', 30);
		assertRequestContext([{ role: 'user', text: seed }, { role: 'assistant', text: 'SEED_READY' }, { role: 'user', text: editPrompt }, { role: 'assistant', text: 'EDIT_DONE' }], ['AFTER_BOUNDARY_EXCLUDED', 'EXCLUDED_READY']);
		assertRequestToolPair('MIDDLE_AFTER');
		assert.strictEqual(fs.readFileSync(join(workspace, 'middle.txt'), 'utf8'), 'MIDDLE_AFTER\n');
	});

	(restoredForkHistoryEnabled ? test : test.skip)('regression coverage: a restored peer can be forked without changing its source history', async function () {
		this.timeout(240_000);
		const { sessionUri, chatUri, workspace } = await createPersistenceSession('restored-peer-fork');
		const defaultPrompt = 'Remember DEFAULT_FORK_EXCLUDED. Reply exactly "DEFAULT_READY".';
		await driveChatTurnToCompletion(context.client, chatUri, 'restored-fork-default', defaultPrompt, 1);
		const source = await createHistoryPeer(sessionUri);
		const selectedPrompt = 'Remember PEER_FORK_INCLUDED. Reply exactly "PEER_READY".';
		const laterPrompt = 'Remember PEER_LATER_EXCLUDED. Reply exactly "PEER_LATER_READY".';
		await driveChatTurnToCompletion(context.client, source, 'restored-fork-selected', selectedPrompt, 10);
		await driveChatTurnToCompletion(context.client, source, 'restored-fork-later', laterPrompt, 20);
		await restartAndInitialize('restored-peer-fork-client', workspace);
		await fetchSessionWithChat(context.client, sessionUri);
		const sourceBefore = await readChat(source);
		const selectedTurn = sourceBefore.turns.find(turn => turn.message.text === selectedPrompt);
		assert.ok(selectedTurn);
		const fork = await createHistoryPeer(sessionUri, { chat: source, turnId: selectedTurn.id });
		assert.deepStrictEqual((await readChat(fork)).turns.map(turn => turn.message.text), [selectedPrompt]);
		assert.deepStrictEqual(completedToolHistory(await readChat(source)), completedToolHistory(sourceBefore));
		await driveChatTurnToCompletion(context.client, fork, 'restored-fork-followup', 'Reply exactly "FORK_CONTINUED". Do not use tools.', 1);
		assertRequestContext([{ role: 'user', text: selectedPrompt }, { role: 'assistant', text: 'PEER_READY' }], ['DEFAULT_FORK_EXCLUDED', 'PEER_LATER_EXCLUDED']);
		fs.writeFileSync(join(workspace, 'source-continues.txt'), 'SOURCE_BEFORE\n');
		// Codex 0.157.0 intercepts this heredoc for Unix, PowerShell, and cmd before shell execution.
		const continuationPrompt = config.provider === 'codex'
			? 'Call exec_command exactly once with this exact command, without modifying or wrapping it:\n'
			+ '```sh\napply_patch <<\'PATCH\'\n*** Begin Patch\n*** Update File: source-continues.txt\n@@\n-SOURCE_BEFORE\n+SOURCE_AFTER\n*** End Patch\nPATCH\n```\n'
			+ 'Do not inspect or search for files, and do not run any other command. After the patch succeeds, reply exactly "EDIT_DONE".'
			: undefined;
		const continuation = await editInChat(source, 'restored-source-continues', workspace, 'source-continues.txt', 'SOURCE_BEFORE', 'SOURCE_AFTER', 10, continuationPrompt);
		assertRequestContext([{ role: 'user', text: selectedPrompt }, { role: 'user', text: laterPrompt }], ['FORK_CONTINUED', 'DEFAULT_FORK_EXCLUDED']);
		assert.deepStrictEqual((await readChat(source)).turns.map(turn => turn.message.text), [selectedPrompt, laterPrompt, continuation]);
	});

	(restoredForkHistoryEnabled ? test : test.skip)('regression coverage: a fork resumes its own branch after the source advances', async function () {
		this.timeout(240_000);
		const { sessionUri, chatUri, workspace } = await createPersistenceSession('fork-branch-resume');
		const sourcePrompt = 'Remember SHARED_FORK_PREFIX. Reply exactly "PREFIX_READY".';
		await driveChatTurnToCompletion(context.client, chatUri, 'branch-source', sourcePrompt, 1);
		const fork = await createHistoryPeer(sessionUri, { chat: chatUri, turnId: 'branch-source' });
		const branchPrompt = 'Remember FORK_BRANCH_ONLY. Reply exactly "BRANCH_READY".';
		await driveChatTurnToCompletion(context.client, fork, 'branch-fork', branchPrompt, 10);
		const sourceAdvance = 'Remember SOURCE_ADVANCE_ONLY. Reply exactly "SOURCE_ADVANCED".';
		await driveChatTurnToCompletion(context.client, chatUri, 'branch-source-advance', sourceAdvance, 20);
		await restartAndInitialize('fork-branch-restored', workspace);
		await fetchSessionWithChat(context.client, sessionUri);
		assert.deepStrictEqual([
			(await readChat(fork)).turns.map(turn => turn.message.text),
			(await readChat(chatUri)).turns.map(turn => turn.message.text),
		], [[sourcePrompt, branchPrompt], [sourcePrompt, sourceAdvance]]);
		await driveChatTurnToCompletion(context.client, fork, 'branch-resumed-fork', 'Reply exactly "BRANCH_RESUMED". Do not use tools.', 1);
		assertRequestContext([{ role: 'user', text: sourcePrompt }, { role: 'assistant', text: 'PREFIX_READY' }, { role: 'user', text: branchPrompt }, { role: 'assistant', text: 'BRANCH_READY' }], ['SOURCE_ADVANCE_ONLY', 'SOURCE_ADVANCED']);
		await driveChatTurnToCompletion(context.client, chatUri, 'branch-resumed-source', 'Reply exactly "SOURCE_RESUMED". Do not use tools.', 10);
		assertRequestContext([{ role: 'user', text: sourcePrompt }, { role: 'user', text: sourceAdvance }], ['FORK_BRANCH_ONLY', 'BRANCH_READY', 'BRANCH_RESUMED']);
	});
}
