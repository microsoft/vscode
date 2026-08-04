/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Protocol-level contracts that are not tied to any one channel: liveness,
 * turn-history paging, and how the host answers a client action it declares
 * but does not yet implement.
 *
 * All of these are host-owned and cross no model boundary.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ReconnectResultType, type FetchTurnsResult, type InitializeResult, type ListSessionsResult, type ReconnectResult, type SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ActionType, type StateAction } from '../../../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, MessageKind, ROOT_STATE_URI, SessionStatus, type Turn } from '../../../../common/state/sessionState.js';
import { createRealSession, dispatchTurn } from '../harness/agentHostE2ETestHarness.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { AhpErrorCodes, JsonRpcErrorCodes } from '../../../../common/state/sessionProtocol.js';
import { getActionEnvelope, isActionNotification, type TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineProtocolContractTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs } = context;

	/**
	 * Client sequence numbers must strictly increase for the lifetime of a
	 * client, and the suite shares one across tests, so they cannot be
	 * hard-coded per scenario.
	 */
	let clientSeq = 4000;
	function nextClientSeq(): number {
		return clientSeq++;
	}

	/** Dispatch on the shared client and wait for the server to echo it back. */
	async function dispatchAndWaitOnShared(channel: string, action: StateAction): Promise<void> {
		const seq = nextClientSeq();
		context.client.dispatch({ channel, clientSeq: seq, action });
		await context.client.waitForNotification(n =>
			isActionNotification(n, action.type)
			&& getActionEnvelope(n).channel === channel
			&& getActionEnvelope(n).origin?.clientSeq === seq,
			30_000,
		);
	}

	async function createSession(prefix: string): Promise<{ sessionUri: string; workspace: string }> {
		const workspace = mkdtempSync(join(tmpdir(), `ahp-${prefix}-`));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `${prefix}-${config.provider}`, createdSessions, URI.file(workspace));
		return { sessionUri, workspace };
	}

	conformanceTest(context, 'ping answers while the connection is live', async function () {
		// Liveness has no payload — the response itself is the signal, so the
		// contract is that the call resolves rather than what it returns.
		await context.client.call('ping', { channel: ROOT_STATE_URI });
	});

	conformanceTest(context, 'ping answers before the client initializes', async function () {
		const client = await context.connectClient();
		try {
			const result = await client.call('ping', { channel: ROOT_STATE_URI });
			assert.strictEqual(result, null);
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'initialize rejects incompatible protocol versions', async function () {
		const client = await context.connectClient();
		try {
			await assert.rejects(client.call('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: ['999.0.0'],
				clientId: `incompatible-version-${config.provider}`,
			}), { code: AhpErrorCodes.UnsupportedProtocolVersion });
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'initialize rejects an empty protocol version list', async function () {
		const client = await context.connectClient();
		try {
			await assert.rejects(client.call('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [],
				clientId: `empty-versions-${config.provider}`,
			}), { code: AhpErrorCodes.UnsupportedProtocolVersion });
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'initialize without subscriptions returns no snapshots', async function () {
		const client = await context.connectClient();
		try {
			const initialized = await client.call<InitializeResult>('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `no-initial-subscriptions-${config.provider}`,
			});
			assert.deepStrictEqual(initialized.snapshots, []);
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'listSessions includes provider-backed session metadata', async function () {
		const { sessionUri, workspace } = await createSession('list-session-metadata');
		const chatUri = buildDefaultChatUri(sessionUri);
		dispatchTurn(context.client, sessionUri, 'turn-list-session-metadata', '/rename Listed Session', nextClientSeq());
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-list-session-metadata',
		);

		const result = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });
		const item = result.items.find(item => item.resource === sessionUri);

		assert.deepStrictEqual({
			provider: item?.provider,
			hasTitle: typeof item?.title === 'string' && item.title.length > 0,
			statusIsNumber: typeof item?.status === 'number',
			workingDirectories: item?.workingDirectories,
			hasCreatedAt: item !== undefined && Number.isFinite(Date.parse(item.createdAt)),
			hasModifiedAt: item !== undefined && Number.isFinite(Date.parse(item.modifiedAt)),
		}, {
			provider: config.provider,
			hasTitle: true,
			statusIsNumber: true,
			workingDirectories: [URI.file(workspace).toString()],
			hasCreatedAt: true,
			hasModifiedAt: true,
		});
	});

	conformanceTest(context, 'listSessions reflects live title and status changes', async function () {
		const { sessionUri } = await createSession('list-session-live-state');
		const chatUri = buildDefaultChatUri(sessionUri);
		dispatchTurn(context.client, sessionUri, 'turn-list-session-live-state', '/rename Catalog Title', nextClientSeq());
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-list-session-live-state',
		);
		await dispatchAndWaitOnShared(sessionUri, { type: ActionType.SessionIsReadChanged, isRead: true });
		await dispatchAndWaitOnShared(sessionUri, { type: ActionType.SessionIsArchivedChanged, isArchived: true });

		const result = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });
		const item = result.items.find(item => item.resource === sessionUri);

		assert.deepStrictEqual({
			title: item?.title,
			isRead: !!(item?.status && item.status & SessionStatus.IsRead),
			isArchived: !!(item?.status && item.status & SessionStatus.IsArchived),
		}, {
			title: 'Catalog Title',
			isRead: true,
			isArchived: true,
		});
	});

	conformanceTest(context, 'disposing a session removes it from listSessions', async function () {
		const { sessionUri } = await createSession('list-session-dispose');
		const chatUri = buildDefaultChatUri(sessionUri);
		dispatchTurn(context.client, sessionUri, 'turn-list-session-dispose', '/rename Disposable Session', nextClientSeq());
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-list-session-dispose',
		);
		const before = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });
		assert.strictEqual(before.items.some(item => item.resource === sessionUri), true);

		await context.client.call('disposeSession', { channel: sessionUri });
		const trackedIndex = createdSessions.indexOf(sessionUri);
		if (trackedIndex >= 0) {
			createdSessions.splice(trackedIndex, 1);
		}
		const result = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });

		assert.strictEqual(result.items.some(item => item.resource === sessionUri), false);
	});

	conformanceTest(context, 'fetchTurns currently emits an empty loaded-turns page', async function () {
		const { sessionUri } = await createSession('fetch-turns');
		const chatUri = buildDefaultChatUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: chatUri });

		// Give the chat a turn to page over. `/rename` is handled entirely by the
		// host's local-command dispatcher, so the turn is real without crossing
		// the model boundary and without depending on a shell.
		dispatchTurn(context.client, sessionUri, 'turn-fetch', '/rename Fetch Turns', nextClientSeq());
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-fetch',
			60_000,
		);

		context.client.clearReceived();
		const result = await context.client.call<FetchTurnsResult>('fetchTurns', { channel: chatUri });

		// The current host implementation accepts the request but has no backing
		// pager: it always publishes an empty page, even when the chat already has
		// loaded turns.
		const loaded = await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnsLoaded') && getActionEnvelope(n).channel === chatUri,
			30_000,
		);

		const action = getActionEnvelope(loaded).action as { readonly type: ActionType.ChatTurnsLoaded; readonly turns: readonly Turn[] };
		assert.deepStrictEqual({
			result,
			action,
		}, {
			result: {},
			action: {
				type: ActionType.ChatTurnsLoaded,
				turns: [],
			},
		});
	});

	conformanceTest(context, 'fetchTurns rejects a cursor the host did not issue', async function () {
		const { sessionUri } = await createSession('fetch-turns-cursor');
		const chatUri = buildDefaultChatUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: chatUri });

		await assert.rejects(context.client.call('fetchTurns', {
			channel: chatUri,
			cursor: 'not-a-host-cursor',
		}), { code: JsonRpcErrorCodes.InvalidParams });
	});

	conformanceTest(context, 'fetchTurns rejects an unknown chat channel', async function () {
		const { sessionUri } = await createSession('fetch-turns-missing');
		const missingChat = buildChatUri(sessionUri, 'missing');

		await assert.rejects(context.client.call('fetchTurns', {
			channel: missingChat,
		}));
	});

	conformanceTest(context, 'initialize returns snapshots for initial subscriptions', async function () {
		const { sessionUri } = await createSession('initial-subscriptions');
		const chatUri = buildDefaultChatUri(sessionUri);
		const client = await context.connectClient();
		try {
			const initialized = await client.call<InitializeResult>('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `initial-subscriptions-${config.provider}`,
				initialSubscriptions: [sessionUri, chatUri],
			});

			assert.deepStrictEqual(initialized.snapshots.map(snapshot => snapshot.resource).sort(), [sessionUri, chatUri].sort());
		} finally {
			client.close();
		}
	});

	/**
	 * Runs `body` against a second connection that has completed the handshake
	 * under its own clientId, then drops that connection and hands back a fresh
	 * un-handshaked one. `reconnect` is only answerable pre-handshake, so
	 * recovery cannot be exercised on the shared client.
	 */
	async function afterConnectionDrop<T>(
		clientId: string,
		body: (client: TestProtocolClient) => Promise<T>,
	): Promise<{ carried: T; revived: TestProtocolClient }> {
		const first = await context.connectClient();
		let carried: T;
		try {
			await first.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId });
			carried = await body(first);
		} finally {
			first.close();
		}
		return { carried, revived: await context.connectClient() };
	}

	conformanceTest(context, 'reconnect replays only the actions a dropped client missed', async function () {
		const { sessionUri } = await createSession('reconnect');
		const chatUri = buildDefaultChatUri(sessionUri);
		const droppedClientId = `reconnect-dropped-${config.provider}`;

		// The cutoff comes from the subscribe response rather than from watching
		// this client receive its own dispatch: a subscription is not guaranteed
		// to be installed before a dispatch sent immediately after it is handled,
		// so waiting for that echo races. `fromSeq` is the same boundary and the
		// response itself guarantees it.
		const { carried: seenThrough, revived } = await afterConnectionDrop(droppedClientId, async first => {
			const subscribed = await first.call<SubscribeResult>('subscribe', { channel: chatUri });
			return subscribed.snapshot!.fromSeq;
		});

		try {
			// Produced while nobody was listening on that clientId, so it can only
			// reach the client through replay.
			await dispatchAndWaitOnShared(chatUri, { type: ActionType.ChatDraftChanged, draft: { text: 'missed while disconnected', origin: { kind: MessageKind.User } } });

			const result = await revived.call<ReconnectResult>('reconnect', {
				channel: ROOT_STATE_URI,
				clientId: droppedClientId,
				lastSeenServerSeq: seenThrough,
				subscriptions: [chatUri],
			});

			// A client that reconnects inside the replay window must be able to
			// catch up by applying actions rather than discarding local state for
			// a fresh snapshot, so the cutoff has to be exclusive and exact.
			assert.deepStrictEqual({
				type: result.type,
				replayedAlreadySeen: result.type === ReconnectResultType.Replay
					&& result.actions.some(envelope => envelope.serverSeq <= seenThrough),
				replayedTheGap: result.type === ReconnectResultType.Replay
					&& result.actions.some(envelope => envelope.serverSeq > seenThrough),
			}, {
				type: ReconnectResultType.Replay,
				replayedAlreadySeen: false,
				replayedTheGap: true,
			});
		} finally {
			revived.close();
		}
	});

	conformanceTest(context, 'reconnect reports a subscription it cannot resume as missing', async function () {
		const { sessionUri } = await createSession('reconnect-missing');
		const chatUri = buildDefaultChatUri(sessionUri);
		const droppedClientId = `reconnect-missing-dropped-${config.provider}`;
		// A channel that never existed stands in for one disposed while the client
		// was away: either way the server cannot resume it, and the client has to
		// be told rather than left waiting on a dead channel.
		const goneUri = URI.from({ scheme: 'agenthost-terminal', authority: 'e2e', path: '/never-existed' }).toString();

		const { carried: seenThrough, revived } = await afterConnectionDrop(droppedClientId, async first => {
			const subscribed = await first.call<SubscribeResult>('subscribe', { channel: chatUri });
			return subscribed.snapshot!.fromSeq;
		});

		try {
			const result = await revived.call<ReconnectResult>('reconnect', {
				channel: ROOT_STATE_URI,
				clientId: droppedClientId,
				lastSeenServerSeq: seenThrough,
				subscriptions: [chatUri, goneUri],
			});

			assert.deepStrictEqual({
				type: result.type,
				missing: result.type === ReconnectResultType.Replay ? result.missing : undefined,
			}, {
				type: ReconnectResultType.Replay,
				missing: [goneUri],
			});
		} finally {
			revived.close();
		}
	});

	// The protocol declares working-directory mutation on both the session and
	// chat channels, but the host rejects all four: applying one would change
	// the synchronized directory set without reconfiguring the agent's actual
	// access. Each is answered through the normal reconciliation path so the
	// client can roll back its optimistic write-ahead action instead of leaving
	// it pending until reconnect.
	const unsupportedWorkingDirectoryActions = [
		{ notification: 'session/workingDirectorySet', channel: 'session', build: (directory: string): StateAction => ({ type: ActionType.SessionWorkingDirectorySet, directory }) },
		{ notification: 'session/workingDirectoryRemoved', channel: 'session', build: (directory: string): StateAction => ({ type: ActionType.SessionWorkingDirectoryRemoved, directory }) },
		{ notification: 'chat/workingDirectorySet', channel: 'chat', build: (directory: string): StateAction => ({ type: ActionType.ChatWorkingDirectorySet, directory }) },
		{ notification: 'chat/workingDirectoryRemoved', channel: 'chat', build: (directory: string): StateAction => ({ type: ActionType.ChatWorkingDirectoryRemoved, directory }) },
	] as const;

	for (const unsupported of unsupportedWorkingDirectoryActions) {
		conformanceTest(context, `${unsupported.notification} is rejected rather than silently dropped`, async function () {
			const { sessionUri, workspace } = await createSession('unsupported-action');
			const channel = unsupported.channel === 'session' ? sessionUri : buildDefaultChatUri(sessionUri);
			await context.client.call<SubscribeResult>('subscribe', { channel });
			context.client.clearReceived();

			const seq = nextClientSeq();
			const directory = URI.file(join(workspace, 'second-root')).toString();
			context.client.dispatch({ channel, clientSeq: seq, action: unsupported.build(directory) });

			const rejected = await context.client.waitForNotification(n =>
				isActionNotification(n, unsupported.notification) && getActionEnvelope(n).channel === channel,
				30_000,
			);
			const envelope = getActionEnvelope(rejected) as { rejectionReason?: string; origin?: { clientSeq?: number } };
			const state = (await context.client.call<SubscribeResult>('subscribe', { channel })).snapshot!.state as { workingDirectories?: readonly string[] };

			assert.deepStrictEqual({
				hasRejectionReason: typeof envelope.rejectionReason === 'string' && envelope.rejectionReason.length > 0,
				echoedClientSeq: envelope.origin?.clientSeq,
				// The reducer is deliberately not run, so state never moves.
				directoryApplied: (state.workingDirectories ?? []).includes(directory),
			}, {
				hasRejectionReason: true,
				echoedClientSeq: seq,
				directoryApplied: false,
			});
		});
	}
}
