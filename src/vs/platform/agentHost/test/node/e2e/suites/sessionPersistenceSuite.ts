/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { retry, timeout } from '../../../../../../base/common/async.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, MessageKind, ROOT_STATE_URI, type ChatState, type SessionState } from '../../../../common/state/sessionState.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { createRealSession, driveTurnToCompletion, resolveGitHubToken } from '../harness/agentHostE2ETestHarness.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

const RECORDING = process.env['AGENT_HOST_REPLAY_RECORD'] === '1' || process.env['AGENT_HOST_UPDATE_SNAPSHOTS'] === '1';

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
			resource: 'https://api.github.com',
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
				startedAt: '2025-01-01T00:00:00.000Z',
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
