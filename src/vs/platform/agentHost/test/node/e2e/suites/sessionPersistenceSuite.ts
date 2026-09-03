/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { retry, timeout } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { SessionConfigKey } from '../../../../common/sessionConfigKeys.js';
import type { ListSessionsResult, ResourceReadResult, SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ContentEncoding } from '../../../../common/state/protocol/common/commands.js';
import type { SessionSummaryChangedParams } from '../../../../common/state/protocol/channels-root/notifications.js';
import { ActionType, type ChatToolCallCompleteAction } from '../../../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, MessageKind, ROOT_STATE_URI, SessionStatus, ToolResultContentType, type ChatState, type SessionState, type ToolResultFileEditContent } from '../../../../common/state/sessionState.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { createRealSession, driveTurnToCompletion, resolveGitHubToken } from '../harness/agentHostE2ETestHarness.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
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

	async function releaseAndRestoreSession(sessionUri: string, additionalChats: readonly string[] = []): Promise<void> {
		const before = await fetchSessionWithChat(context.client, sessionUri);
		const beforeResponsePartIds = responsePartIds(before.turns);
		const beforeTurns = durableTurnContent(before.turns);
		assert.ok(beforeResponsePartIds.length > 0);
		const chatUri = buildDefaultChatUri(sessionUri);
		for (const chat of additionalChats) {
			context.client.notify('unsubscribe', { channel: chat });
		}
		context.client.notify('unsubscribe', { channel: chatUri });
		context.client.notify('unsubscribe', { channel: sessionUri });
		await timeout(50);

		await retry(async () => {
			const restored = await fetchSessionWithChat(context.client, sessionUri);
			const restoredResponsePartIds = responsePartIds(restored.turns);
			const restoredTurns = durableTurnContent(restored.turns);
			assert.deepStrictEqual(restoredTurns, beforeTurns);
			assert.strictEqual(restoredResponsePartIds.length, beforeResponsePartIds.length);
			if (restoredResponsePartIds.every((id, index) => id === beforeResponsePartIds[index])) {
				context.client.notify('unsubscribe', { channel: chatUri });
				context.client.notify('unsubscribe', { channel: sessionUri });
				throw new Error('Session has not been reconstructed with complete durable provider state');
			}
		}, 50, 20);
	}

	test('session metadata history and provider context survive a host restart', async function () {
		this.timeout(240_000);
		const workspace = fs.mkdtempSync(`${tmpdir()}/ahp-persistence-`);
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `persistence-${config.provider}`, createdSessions, URI.file(workspace));
		await driveTurnToCompletion(context.client, sessionUri, 'turn-persistence-rename', '/rename Persisted Session', 1);
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
				.find((content): content is ToolResultFileEditContent => content.type === ToolResultContentType.FileEdit);
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
		assert.strictEqual(before.items.some(item => item.resource === sessionUri), true);
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

		await restartAndInitialize(`archive-unrestored-verify-${config.provider}`, workspace);
		const after = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI, includeArchived: true });
		const restored = after.items.find(item => item.resource === sessionUri);

		assert.deepStrictEqual({
			restored: restored !== undefined,
			isArchived: restored !== undefined && (restored.status & SessionStatus.IsArchived) !== 0,
		}, {
			restored: true,
			isArchived: true,
		});
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
}
