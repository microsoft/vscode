/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { AgentChatMoveRefusal, ChatMoveConfigKey } from '../../../../common/agentHostChatMove.js';
import { MoveAgentHostSessionExtensionMethod, supportsAgentHostSessionMove } from '../../../../common/agentHostExtensionProtocol.js';
import { ActionType, type StateAction } from '../../../../common/state/sessionActions.js';
import { ChatMoveDestinationKind, type InitializeResult, type ListSessionsResult, type SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { MessageKind, ResponsePartKind, ROOT_STATE_URI, ToolCallConfirmationReason, type ChatState, type ChatSummary, type SessionState } from '../../../../common/state/sessionState.js';
import { ProtocolError } from '../../../../common/state/sessionProtocol.js';
import { newTestChatUri } from '../../hostDefaultChats.js';
import { defaultChatChannel, getActionEnvelope, isActionNotification, type TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import { createRealSession } from '../harness/agentHostE2ETestHarness.js';
import { createTestDirectory, ownCodexProtectedDirectories } from '../harness/testDirectories.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

const RECORDING = process.env['AGENT_HOST_REPLAY_RECORD'] === '1' || process.env['AGENT_HOST_UPDATE_SNAPSHOTS'] === '1';

/**
 * Moving chats (AHP `moveChat`: reorder, move to another session, promote to a new session) and moving a single-chat
 * session under another (`vscode/moveSession`). Moves are host-owned, so their catalog contracts are conformance; that a
 * moved chat's conversation goes on through its provider in its new session is parity.
 */
export function defineChatMoveTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs } = context;
	let nextClientSeq = 20_000;

	function workspace(prefix: string): URI {
		const directory = createTestDirectory(join(tmpdir(), `ahp-chat-move-${prefix}-`));
		tempDirs.push(directory);
		// Every scenario starts several Codex chats here: sessions sharing it, or a session and its peers.
		ownCodexProtectedDirectories(directory, config.provider, context.isLinux);
		return URI.file(directory);
	}

	/** The connection the first session of the running test initialized; each test gets its own. */
	let initializedClient: TestProtocolClient | undefined;

	/** Sessions that share `folder`, so a chat moving between them brings no folder its target lacks. */
	async function createSession(prefix: string, folder: URI): Promise<string> {
		if (initializedClient !== context.client) {
			initializedClient = context.client;
			return createRealSession(context.client, config, `${prefix}-${config.provider}`, createdSessions, folder);
		}
		// The connection is initialized and authenticated already.
		const session = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
		await context.client.call('createSession', {
			channel: session,
			provider: config.provider,
			workingDirectories: [folder.toString()],
			config: { isolation: 'folder', ...config.sessionConfig },
		}, 30_000);
		createdSessions.push(session);
		await sessionState(session);
		await context.client.call<SubscribeResult>('subscribe', { channel: defaultChatChannel(session) });
		return session;
	}

	async function createPeer(session: string): Promise<string> {
		const chat = newTestChatUri();
		await context.client.call('createChat', { channel: session, chat }, 30_000);
		return chat;
	}

	async function sessionState(session: string): Promise<SessionState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: session });
		return result.snapshot!.state as SessionState;
	}

	async function chatState(chat: string): Promise<ChatState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: chat });
		return result.snapshot!.state as ChatState;
	}

	/** The chats `session` lists, with whether each is movable. */
	async function catalog(session: string): Promise<{ readonly defaultChat: string | undefined; readonly chats: readonly (readonly [string, boolean])[] }> {
		const state = await sessionState(session);
		return { defaultChat: state.defaultChat, chats: state.chats.map((chat: ChatSummary) => [chat.resource, chat.movable === true] as const) };
	}

	async function dispatchAndWait(channel: string, action: StateAction): Promise<void> {
		const clientSeq = nextClientSeq++;
		context.client.dispatch({ channel, clientSeq, action });
		await context.client.waitForNotification(n =>
			isActionNotification(n, action.type)
			&& getActionEnvelope(n).channel === channel
			&& getActionEnvelope(n).origin?.clientSeq === clientSeq,
			30_000,
		);
	}

	/** Runs `run` while moving chats is enabled; the shared host is left with moves disabled again. */
	async function withChatMoves(run: () => Promise<void>): Promise<void> {
		await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		await dispatchAndWait(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { [ChatMoveConfigKey.Enabled]: true } });
		try {
			await run();
		} finally {
			await dispatchAndWait(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { [ChatMoveConfigKey.Enabled]: false } });
		}
	}

	/** Runs a turn on `chat` to completion, approving tool calls, and returns its markdown response. */
	async function driveTurn(chat: string, text: string): Promise<string> {
		await chatState(chat);
		const clientSeq = nextClientSeq;
		nextClientSeq += 100;
		const turnId = `turn-${clientSeq}`;
		context.client.clearReceived();
		context.client.dispatch({
			channel: chat,
			clientSeq,
			action: { type: ActionType.ChatTurnStarted, turnId, startedAt: new Date().toISOString(), message: { text, origin: { kind: MessageKind.User } } },
		});
		const seen = new Set<object>();
		let confirmSeq = clientSeq + 1;
		while (true) {
			const notification = await context.client.waitForNotification(n => !seen.has(n as object)
				&& (isActionNotification(n, 'chat/toolCallReady') || isActionNotification(n, 'chat/turnComplete') || isActionNotification(n, 'chat/error'))
				&& getActionEnvelope(n).channel === chat
				&& (getActionEnvelope(n).action as { turnId: string }).turnId === turnId, 90_000);
			seen.add(notification as object);
			const action = getActionEnvelope(notification).action;
			if (action.type === ActionType.ChatError) {
				throw new Error(`Chat error during ${turnId}: ${JSON.stringify(action.part.error)}`);
			}
			if (action.type === ActionType.ChatTurnComplete) {
				break;
			}
			if (action.type === ActionType.ChatToolCallReady && !action.confirmed) {
				context.client.dispatch({
					channel: chat,
					clientSeq: confirmSeq++,
					action: { type: ActionType.ChatToolCallConfirmed, turnId, toolCallId: action.toolCallId, approved: true, confirmed: ToolCallConfirmationReason.UserAction },
				});
			}
		}
		const markdownParts = new Set<string>();
		const pieces: string[] = [];
		for (const notification of context.client.receivedNotifications(n => (isActionNotification(n, 'chat/responsePart') || isActionNotification(n, 'chat/delta')) && getActionEnvelope(n).channel === chat)) {
			const action = getActionEnvelope(notification).action;
			if (action.type === ActionType.ChatResponsePart && action.part.kind === ResponsePartKind.Markdown && action.turnId === turnId) {
				markdownParts.add(action.part.id);
				pieces.push(action.part.content);
			} else if (action.type === ActionType.ChatDelta && action.turnId === turnId && markdownParts.has(action.partId)) {
				pieces.push(action.content);
			}
		}
		return pieces.join('');
	}

	async function moveChat(chat: string, destination: { readonly kind: ChatMoveDestinationKind.Session; readonly session: string; readonly after?: string } | { readonly kind: ChatMoveDestinationKind.NewSession }): Promise<string> {
		return (await context.client.call<{ session: string }>('moveChat', { channel: chat, destination }, 30_000)).session;
	}

	async function moveSession(session: string, destination: string, after: string | null): Promise<string> {
		return (await context.client.call<{ session: string }>(MoveAgentHostSessionExtensionMethod, { session, destination, after }, 30_000)).session;
	}

	async function refusalOf(move: Promise<unknown>): Promise<string> {
		try {
			await move;
			return 'moved';
		} catch (error) {
			return error instanceof ProtocolError ? (error.data as { reason?: string } | undefined)?.reason ?? error.message : String(error);
		}
	}

	// #region Conformance: refusals decided before a move touches either session

	conformanceTest(context, 'vscode/moveSession is offered while moving chats is disabled, refused for it, and runs once it is enabled without reconnecting', async function () {
		// Connected while moving chats is off, as a client is when the setting is mirrored after it initialized.
		const folder = workspace('disabled');
		const source = await createSession('disabled-source', folder);
		const target = await createSession('disabled-target', folder);
		const peer = await createPeer(source);
		const observer = await context.connectClient();
		let offered: boolean;
		try {
			offered = supportsAgentHostSessionMove(await observer.call<InitializeResult>('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `chat-move-observer-${generateUuid()}` }, 30_000));
		} finally {
			observer.close();
		}
		const whileDisabled = {
			moveChat: await refusalOf(moveChat(peer, { kind: ChatMoveDestinationKind.Session, session: target })),
			moveSession: await refusalOf(moveSession(target, source, null)),
			source: await catalog(source),
		};
		// Enabled on the same connection: the move gets past the setting to the session's own checks.
		let onceEnabled: string | undefined;
		await withChatMoves(async () => {
			onceEnabled = await refusalOf(moveSession(source, target, null));
		});

		assert.deepStrictEqual({ offered, whileDisabled, onceEnabled }, {
			offered: true,
			whileDisabled: {
				moveChat: AgentChatMoveRefusal.Disabled,
				moveSession: AgentChatMoveRefusal.Disabled,
				source: { defaultChat: defaultChatChannel(source), chats: [[defaultChatChannel(source), false], [peer, false]] },
			},
			onceEnabled: AgentChatMoveRefusal.NotSingleChat,
		});
	}, config.supportsMultipleChats);

	conformanceTest(context, 'moveChat refuses a session\'s default chat and vscode/moveSession a session with other chats', async function () {
		const folder = workspace('refusals');
		const source = await createSession('refusals-source', folder);
		const target = await createSession('refusals-target', folder);
		const peer = await createPeer(source);
		await withChatMoves(async () => {
			assert.deepStrictEqual({
				defaultChat: await refusalOf(moveChat(defaultChatChannel(source), { kind: ChatMoveDestinationKind.Session, session: target })),
				notSingleChat: await refusalOf(moveSession(source, target, null)),
				source: await catalog(source),
				target: await catalog(target),
			}, {
				defaultChat: AgentChatMoveRefusal.NotMovable,
				notSingleChat: AgentChatMoveRefusal.NotSingleChat,
				source: { defaultChat: defaultChatChannel(source), chats: [[defaultChatChannel(source), false], [peer, true]] },
				target: { defaultChat: defaultChatChannel(target), chats: [[defaultChatChannel(target), false]] },
			});
		});
	}, config.supportsMultipleChats);

	conformanceTest(context, 'a chat of an archived session is announced not movable until its session is unarchived', async function () {
		const source = await createSession('archived', workspace('archived'));
		const peer = await createPeer(source);
		await withChatMoves(async () => {
			const before = await catalog(source);
			/** Archives or unarchives the session and returns the `movable` its catalog then announces for the peer. */
			const archive = async (isArchived: boolean) => {
				context.client.clearReceived();
				await dispatchAndWait(source, { type: ActionType.SessionIsArchivedChanged, isArchived });
				const update = await context.client.waitForNotification(n => isActionNotification(n, ActionType.SessionChatUpdated)
					&& getActionEnvelope(n).channel === source
					&& (getActionEnvelope(n).action as { readonly chat: string; readonly changes: Partial<ChatSummary> }).chat === peer
					&& (getActionEnvelope(n).action as { readonly changes: Partial<ChatSummary> }).changes.movable !== undefined, 30_000);
				return (getActionEnvelope(update).action as { readonly changes: Partial<ChatSummary> }).changes.movable;
			};
			const archived = await archive(true);
			const unarchived = await archive(false);

			assert.deepStrictEqual({ before: before.chats, archived, unarchived, after: (await catalog(source)).chats }, {
				before: [[defaultChatChannel(source), false], [peer, true]],
				archived: false,
				unarchived: true,
				after: [[defaultChatChannel(source), false], [peer, true]],
			});
		});
	}, config.supportsMultipleChats);

	// #endregion

	// #region Parity: moves of chats whose conversation goes on through their provider
	//
	// A session becomes durable once its default chat ran a provider turn; until then the host can't prepare it for a move.
	// So these scenarios cross the model boundary: each session is materialized by a model turn on its default chat, and
	// the moved chat's next turn recalls what it was told before the move.

	function providerMoveTest(title: string, run: Mocha.AsyncFunc): void {
		if (context.tier !== 'parity') {
			return;
		}
		const enabled = config.supportsMultipleChats && (config.supportsMultipleChatsE2E !== false || RECORDING);
		(enabled ? test : test.skip)(title, function () {
			this.timeout(240_000);
			return run.call(this);
		});
	}

	const REMEMBER = 'Remember the code word PELICAN. Do not use any tools. Reply with only the word OK.';
	const RECALL = 'What was the code word I asked you to remember? Do not use any tools. Reply with only the word.';
	const MATERIALIZE = 'Do not use any tools. Reply with only the word OK.';

	providerMoveTest('a peer chat moved to and reordered in another session keeps its provider conversation', async function () {
		const folder = workspace('provider-peer-move');
		const source = await createSession('provider-peer-move-source', folder);
		const target = await createSession('provider-peer-move-target', folder);
		await driveTurn(defaultChatChannel(target), MATERIALIZE);
		const peer = await createPeer(source);
		await driveTurn(peer, REMEMBER);
		await withChatMoves(async () => {
			const moved = await moveChat(peer, { kind: ChatMoveDestinationKind.Session, session: target, after: defaultChatChannel(target) });
			const afterMove = { source: await catalog(source), target: await catalog(target) };
			// Placed first in its new session.
			const reordered = await moveChat(peer, { kind: ChatMoveDestinationKind.Session, session: target });
			const afterReorder = await catalog(target);
			const recalled = await driveTurn(peer, RECALL);

			assert.deepStrictEqual({ moved, afterMove, reordered, afterReorder, recalled: /pelican/i.test(recalled) }, {
				moved: target,
				afterMove: {
					source: { defaultChat: defaultChatChannel(source), chats: [[defaultChatChannel(source), false]] },
					target: { defaultChat: defaultChatChannel(target), chats: [[defaultChatChannel(target), false], [peer, true]] },
				},
				reordered: target,
				afterReorder: { defaultChat: defaultChatChannel(target), chats: [[peer, true], [defaultChatChannel(target), false]] },
				recalled: true,
			});
		});
	});

	providerMoveTest('a peer chat promoted to a new session keeps its provider conversation as its default chat', async function () {
		const source = await createSession('provider-promote', workspace('provider-promote'));
		const peer = await createPeer(source);
		await driveTurn(peer, REMEMBER);
		await withChatMoves(async () => {
			const promoted = await moveChat(peer, { kind: ChatMoveDestinationKind.NewSession });
			createdSessions.push(promoted);
			const listed = await context.client.call<ListSessionsResult>('listSessions', {}, 30_000);
			const afterPromotion = { source: await catalog(source), promoted: await catalog(promoted) };
			const recalled = await driveTurn(peer, RECALL);

			assert.deepStrictEqual({ newSession: promoted !== source, listed: listed.items.some(item => item.resource === promoted), afterPromotion, recalled: /pelican/i.test(recalled) }, {
				newSession: true,
				listed: true,
				afterPromotion: {
					source: { defaultChat: defaultChatChannel(source), chats: [[defaultChatChannel(source), false]] },
					// A session's default chat is never movable.
					promoted: { defaultChat: peer, chats: [[peer, false]] },
				},
				recalled: true,
			});
		});
	});

	providerMoveTest('a session moved under another keeps its chat\'s provider conversation, as a movable peer', async function () {
		const folder = workspace('provider-session-move');
		const source = await createSession('provider-session-move-source', folder);
		const destination = await createSession('provider-session-move-destination', folder);
		const chat = defaultChatChannel(source);
		await driveTurn(defaultChatChannel(destination), MATERIALIZE);
		await driveTurn(chat, REMEMBER);
		// This connection initialized while moving chats was off: the move runs without reconnecting.
		await withChatMoves(async () => {
			context.client.clearReceived();
			const moved = await moveSession(source, destination, defaultChatChannel(destination));
			// The session ended with the move: there is nothing left to dispose.
			createdSessions.splice(createdSessions.indexOf(source), 1);
			const announced = context.client.receivedNotifications(n => isActionNotification(n, ActionType.SessionChatAdded) && getActionEnvelope(n).channel === destination)
				.map(n => (getActionEnvelope(n).action as { readonly summary: ChatSummary }).summary)
				.map(summary => [summary.resource, summary.movable === true]);
			const listed = await context.client.call<ListSessionsResult>('listSessions', {}, 30_000);
			const afterMove = await catalog(destination);
			const recalled = await driveTurn(chat, RECALL);

			assert.deepStrictEqual({ moved, announced, sourceListed: listed.items.some(item => item.resource === source), afterMove, recalled: /pelican/i.test(recalled) }, {
				moved: destination,
				// Announced as the movable peer it is now in the `session/chatAdded` itself, not corrected afterwards.
				announced: [[chat, true]],
				sourceListed: false,
				afterMove: { defaultChat: defaultChatChannel(destination), chats: [[defaultChatChannel(destination), false], [chat, true]] },
				recalled: true,
			});
		});
	});

	// #endregion
}
