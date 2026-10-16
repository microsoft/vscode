/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ChatMoveConfigKey } from '../../common/agentHostChatMove.js';
import type { ISessionStateChange, ISessionStateSnapshot } from '../../common/agentHostSessionStateStore.js';
import { getWorkingDirectoryKey } from '../../common/agentHostWorkingDirectories.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, ChatInteractivity, ChatOriginKind, SessionStatus, withSessionWorkspaceless, type URI as ProtocolURI } from '../../common/state/sessionState.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostChatMovability, type IChatMovabilitySources } from '../../node/agentHostChatMovability.js';
import { ADDITIONAL_WORKTREES_METADATA_KEY } from '../../node/shared/sessionAdditionalWorktrees.js';
import { WORKTREE_META_PATH } from '../../node/shared/worktreeIsolation.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';

suite('AgentHostChatMovability', () => {
	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	const session = URI.from({ scheme: 'copilot', path: '/movable-source' }).toString();
	const target = URI.from({ scheme: 'copilot', path: '/movable-target' }).toString();

	const folder = URI.file('/repo').toString();

	function summary(resource: string, workingDirectories: string[] | undefined = [folder]) {
		return {
			resource, defaultChat: buildDefaultChatUri(resource), provider: 'copilot', title: 'Session', status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString(), workingDirectories,
		};
	}

	/** In-memory sources the conditions read; each test changes them and fires their events, as their services do. */
	class TestSources implements IChatMovabilitySources {
		readonly pending = new Set<string>();
		readonly quarantined = new Set<string>();
		readonly parked = new Set<string>();
		readonly values = new Map<string, string>();
		authority: 1 | 2 = 2;
		readonly onDidChangePendingEmitter = disposables.add(new Emitter<ProtocolURI>());
		readonly onDidChangeLoadedStateEmitter = disposables.add(new Emitter<ISessionStateChange>());
		readonly onDidChangeParkedSessionsEmitter = disposables.add(new Emitter<string | undefined>());
		readonly conversions = {
			isPending: (chat: ProtocolURI, sessionWide?: boolean) => sessionWide ? this.quarantined.has(chat) : this.pending.has(chat),
			onDidChangePending: this.onDidChangePendingEmitter.event,
		};
		readonly worktrees = { getResolvedWorktree: () => undefined };
		readonly sessionState = {
			peek: (resource: URI): ISessionStateSnapshot => ({ session: resource.toString(), authority: this.authority, revision: 1, values: this.values, folders: new Map(), chats: new Map() }),
			onDidChangeLoadedState: this.onDidChangeLoadedStateEmitter.event,
		};
		readonly catalogs = {
			isParked: (candidate: string) => this.parked.has(candidate),
			onDidChangeParkedSessions: this.onDidChangeParkedSessionsEmitter.event,
		};
		sessionId(resource: URI): string {
			return resource.path;
		}
	}

	/** A source session with a peer, both sessions working in `/repo`, and moving chats enabled. */
	async function setupStrict(workingDirectories?: string[]) {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const configuration = disposables.add(new AgentConfigurationService(stateManager, new NullLogService()));
		const sources = new TestSources();
		disposables.add(new AgentHostChatMovability(stateManager, configuration, sources));
		stateManager.createSession(summary(session, workingDirectories));
		const peer = buildChatUri(session, 'peer');
		stateManager.addChat(session, peer, creationTimeChatStorageResource(session, peer, buildDefaultChatUri(session)));
		configuration.updateRootConfig({ [ChatMoveConfigKey.Enabled]: true });
		await timeout(0);
		// What a client of the session learns: the `movable` changes of the peer's catalog entry.
		const announced: boolean[] = [];
		disposables.add(stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.channel === session && envelope.action.type === ActionType.SessionChatUpdated && envelope.action.chat === peer && envelope.action.changes.movable !== undefined) {
				announced.push(envelope.action.changes.movable);
			}
		}));
		/** Whether the peer is movable, in its catalog entry and its own state. */
		const movable = () => ({
			summary: stateManager.getSessionState(session)?.chats.find(chat => chat.resource === peer)?.movable ?? false,
			state: stateManager.getChatState(peer)?.movable ?? false,
		});
		/**
		 * Applies `refuse`, then `allow`, and reports the peer's movability before, right after each (never stale, so
		 * without waiting), and what its session announced.
		 */
		const flip = async (refuse: () => void, allow: () => void) => {
			const before = movable();
			refuse();
			const refused = movable();
			allow();
			return { before, refused, allowed: movable(), announced: [...announced] };
		};
		return { stateManager, sources, peer, flip };
	}

	/** A flip whose peer was movable, then refused, then movable again, as every client of its session was told. */
	const flipped = {
		before: { summary: true, state: true },
		refused: { summary: false, state: false },
		allowed: { summary: true, state: true },
		announced: [false, true],
	};

	test('publishes eligibility per chat and follows the setting, a move and the default chat', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const configuration = disposables.add(new AgentConfigurationService(stateManager, new NullLogService()));
		disposables.add(new AgentHostChatMovability(stateManager, configuration, new TestSources()));
		stateManager.createSession(summary(session));
		stateManager.createSession(summary(target));
		const defaultChat = buildDefaultChatUri(session);
		const peer = buildChatUri(session, 'peer');
		const tool = buildChatUri(session, 'tool');
		const hidden = buildChatUri(session, 'hidden');
		const storage = (chat: string) => creationTimeChatStorageResource(session, chat, defaultChat);
		stateManager.addChat(session, peer, storage(peer));
		stateManager.addChat(session, tool, storage(tool), { origin: { kind: ChatOriginKind.Tool, chat: peer, toolCallId: 'call' } });
		stateManager.addChat(session, hidden, storage(hidden), { interactivity: ChatInteractivity.Hidden });
		const labels = new Map([[defaultChat, 'default'], [buildDefaultChatUri(target), 'targetDefault'], [peer, 'peer'], [tool, 'tool'], [hidden, 'hidden']]);
		const movable = () => Object.fromEntries([session, target].flatMap(owner => stateManager.getSessionState(owner)?.chats ?? [])
			.map(chat => [labels.get(chat.resource), chat.movable ?? false]));
		const chatActions: string[] = [];
		disposables.add(stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.ChatMovableChanged) {
				chatActions.push(`${envelope.channel === peer ? 'peer' : envelope.channel} ${envelope.action.movable}`);
			}
		}));
		await timeout(0);
		const disabled = movable();

		configuration.updateRootConfig({ [ChatMoveConfigKey.Enabled]: true });
		const enabled = movable();
		const peerState = stateManager.getChatState(peer)?.movable;

		stateManager.transferChats(session, target, [peer, tool], undefined);
		const afterMove = movable();

		configuration.updateRootConfig({ [ChatMoveConfigKey.Enabled]: false });
		const disabledAgain = movable();

		assert.deepStrictEqual({ disabled, enabled, peerState, afterMove, disabledAgain, chatActions }, {
			disabled: { default: false, targetDefault: false, peer: false, tool: false, hidden: false },
			enabled: { default: false, targetDefault: false, peer: true, tool: false, hidden: false },
			peerState: true,
			afterMove: { default: false, targetDefault: false, peer: true, tool: false, hidden: false },
			disabledAgain: { default: false, targetDefault: false, peer: false, tool: false, hidden: false },
			chatActions: ['peer true', 'peer false'],
		});
	});

	test('a chat about to join another session is judged by the folders it brings, not the destination\'s', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const configuration = disposables.add(new AgentConfigurationService(stateManager, new NullLogService()));
		const sources = new TestSources();
		const movability = disposables.add(new AgentHostChatMovability(stateManager, configuration, sources));
		const destinationFolder = URI.file('/destination').toString();
		stateManager.createSession(summary(session));
		stateManager.createSession(summary(target, [destinationFolder]));
		const peer = buildChatUri(session, 'peer');
		stateManager.addChat(session, peer, creationTimeChatStorageResource(session, peer, buildDefaultChatUri(session)));
		configuration.updateRootConfig({ [ChatMoveConfigKey.Enabled]: true });
		// The destination works in a worktree it records; the peer inherits its own session's folder, which isn't in it.
		sources.values.set(WORKTREE_META_PATH, destinationFolder);
		await timeout(0);

		assert.deepStrictEqual({ inSource: movability.isMovableIn(peer, session), inTarget: movability.isMovableIn(peer, target) }, { inSource: true, inTarget: true });
	});

	test('a chat of an archived session is not movable until its session is unarchived', async () => {
		const { stateManager, flip } = await setupStrict();
		assert.deepStrictEqual(await flip(
			() => stateManager.dispatchServerAction(session, { type: ActionType.SessionIsArchivedChanged, isArchived: true }),
			() => stateManager.dispatchServerAction(session, { type: ActionType.SessionIsArchivedChanged, isArchived: false }),
		), flipped);
	});

	test('a chat of a workspace-less session, or without a folder, is not movable', async () => {
		const workspaceless = await setupStrict();
		const meta = () => workspaceless.stateManager.getSessionState(session)?._meta;
		const noFolder = await setupStrict();
		assert.deepStrictEqual({
			workspaceless: await workspaceless.flip(
				() => workspaceless.stateManager.setSessionMeta(session, withSessionWorkspaceless(meta(), true)),
				() => workspaceless.stateManager.setSessionMeta(session, withSessionWorkspaceless(meta(), false)),
			),
			noFolder: await noFolder.flip(
				() => noFolder.stateManager.dispatchServerAction(session, { type: ActionType.SessionChatUpdated, chat: noFolder.peer, changes: { workingDirectories: [] } }),
				() => noFolder.stateManager.dispatchServerAction(session, { type: ActionType.SessionChatUpdated, chat: noFolder.peer, changes: { workingDirectories: [folder] } }),
			),
		}, { workspaceless: flipped, noFolder: flipped });
	});

	test('a chat changing its workspace, or of a quarantined session, is not movable until that ends', async () => {
		const converting = await setupStrict();
		const quarantined = await setupStrict();
		const defaultChat = buildDefaultChatUri(session);
		assert.deepStrictEqual({
			converting: await converting.flip(
				() => { converting.sources.pending.add(converting.peer); converting.sources.onDidChangePendingEmitter.fire(converting.peer); },
				() => { converting.sources.pending.delete(converting.peer); converting.sources.onDidChangePendingEmitter.fire(converting.peer); },
			),
			// A session-wide change is reported for the session's default chat.
			quarantined: await quarantined.flip(
				() => { quarantined.sources.quarantined.add(session); quarantined.sources.onDidChangePendingEmitter.fire(defaultChat); },
				() => { quarantined.sources.quarantined.delete(session); quarantined.sources.onDidChangePendingEmitter.fire(defaultChat); },
			),
		}, { converting: flipped, quarantined: flipped });
	});

	test('a chat working in a worktree of its session is not movable while the session records it', async () => {
		const recorded = await setupStrict();
		const additional = await setupStrict();
		const write = (sources: TestSources, key: string, value: string | undefined) => {
			if (value === undefined) {
				sources.values.delete(key);
			} else {
				sources.values.set(key, value);
			}
			sources.onDidChangeLoadedStateEmitter.fire({ session, values: [key], authority: false });
		};
		const worktree = JSON.stringify([{ handle: generateUuid(), workingDirectory: folder, repositoryRoot: URI.file('/elsewhere').toString() }]);
		assert.deepStrictEqual({
			// The peer inherits the session's folder, which is the session's worktree.
			recorded: await recorded.flip(() => write(recorded.sources, WORKTREE_META_PATH, folder), () => write(recorded.sources, WORKTREE_META_PATH, undefined)),
			additional: await additional.flip(() => write(additional.sources, ADDITIONAL_WORKTREES_METADATA_KEY, worktree), () => write(additional.sources, ADDITIONAL_WORKTREES_METADATA_KEY, undefined)),
		}, { recorded: flipped, additional: flipped });
	});

	test('a chat that runs Agent Merge for a folder of its session is not movable until it stops', async () => {
		const { stateManager, peer, flip } = await setupStrict();
		stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: {} });
		const agentMerge = (enabled: boolean) => stateManager.dispatchServerAction(session, {
			type: ActionType.SessionConfigChanged,
			config: { [SessionConfigKey.AgentMergeFolders]: { [getWorkingDirectoryKey(folder)]: { enabled, chat: peer } } },
		});
		assert.deepStrictEqual(await flip(() => agentMerge(true), () => agentMerge(false)), flipped);
	});

	test('a restored chat, which registers once its session lists it, is published at once and follows its session\'s inputs', async () => {
		const { stateManager, sources } = await setupStrict();
		const defaultChat = buildDefaultChatUri(session);
		const restored = buildChatUri(session, 'restored');
		const movable = () => stateManager.getSessionState(session)?.chats.find(chat => chat.resource === restored)?.movable ?? false;
		const quarantine = (quarantined: boolean) => {
			if (quarantined) {
				sources.quarantined.add(session);
			} else {
				sources.quarantined.delete(session);
			}
			sources.onDidChangePendingEmitter.fire(defaultChat);
		};
		// Read without waiting, as a client of the session would right after each change.
		stateManager.registerRestoredChatSummary(session, restored, { storageResource: creationTimeChatStorageResource(session, restored, defaultChat) });
		const registered = movable();
		quarantine(true);
		const refused = movable();
		quarantine(false);
		assert.deepStrictEqual({ registered, refused, allowed: movable() }, { registered: true, refused: false, allowed: true });
	});

	test('a chat of a session whose legacy catalog is parked is not movable until it is released or normalized', async () => {
		const released = await setupStrict();
		const normalized = await setupStrict();
		const park = (sources: TestSources) => {
			sources.authority = 1;
			sources.parked.add(session);
			sources.onDidChangeParkedSessionsEmitter.fire(session);
		};
		assert.deepStrictEqual({
			released: await released.flip(() => park(released.sources), () => { released.sources.parked.clear(); released.sources.onDidChangeParkedSessionsEmitter.fire(undefined); }),
			// A normalized catalog moves its chats whether or not its session is parked.
			normalized: await normalized.flip(() => park(normalized.sources), () => { normalized.sources.authority = 2; normalized.sources.onDidChangeLoadedStateEmitter.fire({ session, values: [], authority: true }); }),
		}, { released: flipped, normalized: flipped });
	});
});
