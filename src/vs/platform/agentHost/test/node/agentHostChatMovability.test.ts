/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
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
		readonly sessionState = {
			peek: (resource: URI): ISessionStateSnapshot => ({ session: resource.toString(), authority: this.authority, revision: 1, values: this.values, folders: new Map(), chats: new Map() }),
			onDidChangeLoadedState: this.onDidChangeLoadedStateEmitter.event,
		};
		readonly catalogs = {
			isParked: (candidate: string) => this.parked.has(candidate),
			onDidChangeParkedSessions: this.onDidChangeParkedSessionsEmitter.event,
		};
	}

	/** Counts the per-chat lookups a recompute makes, which a per-chat scan of the session's chats multiplies. */
	class CountingStateManager extends AgentHostStateManager {
		parentLookups = 0;
		sessionLookups = 0;
		override getChatParent(chat: ProtocolURI): string | undefined {
			this.parentLookups++;
			return super.getChatParent(chat);
		}
		override getSessionState(candidate: ProtocolURI) {
			this.sessionLookups++;
			return super.getSessionState(candidate);
		}
		/** The lookups since the last call, per registered chat of `session` (`perChat`) and beyond that (`overhead`). */
		takeLookups(session: ProtocolURI): { readonly perChat: number; readonly overhead: number } {
			const lookups = this.parentLookups + this.sessionLookups;
			this.parentLookups = 0;
			this.sessionLookups = 0;
			const chats = super.getSessionState(session)!.chats.length;
			return { perChat: Math.floor(lookups / chats), overhead: lookups % chats };
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

	test('a chat sharing its workspace-less session\'s scratch folder, or without a folder, is not movable', async () => {
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

	test('a chat of a workspace-less session with a scratch folder of its own stays movable, until another chat uses that folder too', async () => {
		const { stateManager, flip, peer } = await setupStrict();
		const own = 'file:///home/.copilot/chats/own';
		const meta = () => stateManager.getSessionState(session)?._meta;
		stateManager.setSessionMeta(session, withSessionWorkspaceless(meta(), true));
		stateManager.setScratchFolder(own, true);
		stateManager.dispatchServerAction(session, { type: ActionType.SessionChatUpdated, chat: peer, changes: { workingDirectories: [own] } });
		await timeout(0);
		const sharedWith = buildChatUri(session, 'other');
		assert.deepStrictEqual(await flip(
			() => {
				stateManager.addChat(session, sharedWith, creationTimeChatStorageResource(session, sharedWith, buildDefaultChatUri(session)));
				stateManager.dispatchServerAction(session, { type: ActionType.SessionChatUpdated, chat: sharedWith, changes: { workingDirectories: [own] } });
			},
			() => stateManager.dispatchServerAction(session, { type: ActionType.SessionChatUpdated, chat: sharedWith, changes: { workingDirectories: [] } }),
		), { ...flipped, announced: [false, true, false, true] });
	});

	test('a chat with a scratch folder of its own is not movable at once while a fork shares it, in a workspace-less or a foldered session (PR review)', async () => {
		const own = 'file:///home/.copilot/chats/own';
		const setup = async (workspaceless: boolean) => {
			const { stateManager, flip, peer } = await setupStrict(workspaceless ? undefined : [folder, own]);
			if (workspaceless) {
				stateManager.setSessionMeta(session, withSessionWorkspaceless(stateManager.getSessionState(session)?._meta, true));
			}
			stateManager.setScratchFolder(own, true);
			stateManager.dispatchServerAction(session, { type: ActionType.SessionChatUpdated, chat: peer, changes: { workingDirectories: [own] } });
			await timeout(0);
			return { stateManager, flip, peer };
		};
		const forked = async (workspaceless: boolean) => {
			const { stateManager, flip, peer } = await setup(workspaceless);
			const fork = buildChatUri(session, 'fork');
			return flip(
				() => stateManager.addChat(session, fork, creationTimeChatStorageResource(session, fork, buildDefaultChatUri(session)), { origin: { kind: ChatOriginKind.Fork, chat: peer, turnId: 'turn' }, workingDirectories: [own] }),
				() => stateManager.removeChat(session, fork),
			);
		};
		const sibling = async () => {
			const { stateManager, flip } = await setup(false);
			const other = buildChatUri(session, 'other');
			stateManager.addChat(session, other, creationTimeChatStorageResource(session, other, buildDefaultChatUri(session)), { workingDirectories: [folder] });
			return flip(
				() => stateManager.dispatchServerAction(session, { type: ActionType.SessionChatUpdated, chat: other, changes: { workingDirectories: [own] } }),
				() => stateManager.dispatchServerAction(session, { type: ActionType.SessionChatUpdated, chat: other, changes: { workingDirectories: [folder] } }),
			);
		};

		// Making the session workspace-less made the peer, without a folder yet, immovable until it got its own.
		assert.deepStrictEqual({ workspaceless: await forked(true), foldered: await forked(false), folderChange: await sibling() }, {
			workspaceless: { ...flipped, announced: [false, true, false, true] },
			foldered: flipped,
			folderChange: flipped,
		});
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

	test('a chat in a worktree of its session stays movable, unless it is its own additional worktree a staying chat also uses (Block 5)', async () => {
		const write = (sources: TestSources, key: string, value: string | undefined) => {
			if (value === undefined) {
				sources.values.delete(key);
			} else {
				sources.values.set(key, value);
			}
			sources.onDidChangeLoadedStateEmitter.fire({ session, values: [key], authority: false });
		};
		const additional = (chat: string | undefined, workingDirectory = folder) => JSON.stringify([{ handle: generateUuid(), workingDirectory, repositoryRoot: URI.file('/elsewhere').toString(), ...(chat ? { chat } : {}) }]);
		const shared = { before: { summary: true, state: true }, refused: { summary: true, state: true }, allowed: { summary: true, state: true }, announced: [] };

		// The peer inherits the session's folder, which is the session's own worktree: a move shares it.
		const primary = await setupStrict();
		// A session-level additional worktree: shared too.
		const sessionLevel = await setupStrict();
		// The peer's own additional worktree, which the default chat (staying) also uses: refused (D2).
		const ownShared = await setupStrict();
		// The peer's own additional worktree, which only the peer uses: it transfers with the peer.
		const own = await setupStrict();
		const ownFolder = URI.file('/repo.worktrees/peer').toString();
		own.stateManager.dispatchServerAction(session, { type: ActionType.SessionChatUpdated, chat: own.peer, changes: { workingDirectories: [ownFolder] } });
		await timeout(0);

		assert.deepStrictEqual({
			primary: await primary.flip(() => write(primary.sources, WORKTREE_META_PATH, folder), () => write(primary.sources, WORKTREE_META_PATH, undefined)),
			sessionLevel: await sessionLevel.flip(() => write(sessionLevel.sources, ADDITIONAL_WORKTREES_METADATA_KEY, additional(undefined)), () => write(sessionLevel.sources, ADDITIONAL_WORKTREES_METADATA_KEY, undefined)),
			ownShared: await ownShared.flip(() => write(ownShared.sources, ADDITIONAL_WORKTREES_METADATA_KEY, additional(ownShared.peer)), () => write(ownShared.sources, ADDITIONAL_WORKTREES_METADATA_KEY, undefined)),
			own: await own.flip(() => write(own.sources, ADDITIONAL_WORKTREES_METADATA_KEY, additional(own.peer, ownFolder)), () => write(own.sources, ADDITIONAL_WORKTREES_METADATA_KEY, undefined)),
		}, { primary: shared, sessionLevel: shared, ownShared: flipped, own: shared });
	});

	test('a recompute of every chat is linear in the number of chats, with or without additional worktrees recorded for a chat (perf, Block 5)', async () => {
		const pass = async (chats: number, ownWorktree: boolean) => {
			const store = new DisposableStore();
			try {
				const stateManager = store.add(new CountingStateManager(new NullLogService()));
				const configuration = store.add(new AgentConfigurationService(stateManager, new NullLogService()));
				const sources = new TestSources();
				store.add(new AgentHostChatMovability(stateManager, configuration, sources));
				stateManager.createSession(summary(session));
				const defaultChat = buildDefaultChatUri(session);
				for (let i = 0; i < chats; i++) {
					const peer = buildChatUri(session, `peer-${i}`);
					stateManager.addChat(session, peer, creationTimeChatStorageResource(session, peer, defaultChat));
					if (i % 10 === 0) {
						const subagent = buildChatUri(session, `subagent-${i}`);
						stateManager.addChat(session, subagent, subagent, { origin: { kind: ChatOriginKind.Tool, chat: peer, toolCallId: `call-${i}` } });
					}
				}
				if (ownWorktree) {
					// The first peer's own worktree, which every other chat of the session also works in.
					sources.values.set(ADDITIONAL_WORKTREES_METADATA_KEY, JSON.stringify([{ handle: generateUuid(), workingDirectory: folder, repositoryRoot: folder, chat: buildChatUri(session, 'peer-0') }]));
				}
				configuration.updateRootConfig({ [ChatMoveConfigKey.Enabled]: true });
				await timeout(0);
				stateManager.parentLookups = 0;
				stateManager.sessionLookups = 0;
				configuration.updateRootConfig({ [ChatMoveConfigKey.Enabled]: false });
				configuration.updateRootConfig({ [ChatMoveConfigKey.Enabled]: true });
				const registered = stateManager.getSessionState(session)!.chats.length;
				const lookups = stateManager.parentLookups + stateManager.sessionLookups;
				return {
					perChat: Math.floor(lookups / registered),
					overhead: lookups % registered,
					refused: !(stateManager.getSessionState(session)!.chats.find(chat => chat.resource === buildChatUri(session, 'peer-0'))?.movable ?? false),
				};
			} finally {
				store.dispose();
			}
		};

		const results = { none: [await pass(100, false), await pass(400, false)], ownWorktree: [await pass(100, true), await pass(400, true)] };
		const linear = { perChat: 1, overhead: 10 };
		assert.deepStrictEqual(results, {
			// Two passes: off looks up no chat's parent (no chat is eligible), on each chat's once; sessions a fixed number of times.
			none: [{ ...linear, refused: false }, { ...linear, refused: false }],
			// The first peer's own worktree, which staying chats use: refused (D2), at the same cost.
			ownWorktree: [{ ...linear, refused: true }, { ...linear, refused: true }],
		});
	});

	test('with an additional worktree for every chat, recomputing them costs a linear number of URI comparisons (PR review)', async () => {
		/** Counts the comparisons of folders with recorded worktrees, the work a scan of every worktree per chat multiplies. */
		const counted = ['isEqualOrParent', 'getComparisonKey', 'dirname'] as const;
		const run = async (chats: number) => {
			const store = new DisposableStore();
			const originals = counted.map(name => extUriBiasedIgnorePathCase[name]);
			let comparisons = 0;
			try {
				const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
				const configuration = store.add(new AgentConfigurationService(stateManager, new NullLogService()));
				const sources = new TestSources();
				store.add(new AgentHostChatMovability(stateManager, configuration, sources));
				stateManager.createSession(summary(session));
				const defaultChat = buildDefaultChatUri(session);
				const own = (i: number) => URI.file(`/repo.worktrees/peer-${i}`).toString();
				const worktrees = [];
				for (let i = 0; i < chats; i++) {
					const peer = buildChatUri(session, `peer-${i}`);
					// Each chat works in its own worktree; the second one also in the first one's, which keeps the first (D2).
					stateManager.addChat(session, peer, creationTimeChatStorageResource(session, peer, defaultChat), { workingDirectories: i === 1 ? [`${own(1)}/src`, own(0)] : [`${own(i)}/src`] });
					worktrees.push({ handle: generateUuid(), workingDirectory: own(i), repositoryRoot: folder, chat: peer });
				}
				sources.values.set(ADDITIONAL_WORKTREES_METADATA_KEY, JSON.stringify(worktrees));
				await timeout(0);
				for (const [index, name] of counted.entries()) {
					const original = originals[index] as (...args: unknown[]) => unknown;
					(extUriBiasedIgnorePathCase as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
						comparisons++;
						return original.apply(extUriBiasedIgnorePathCase, args);
					};
				}
				configuration.updateRootConfig({ [ChatMoveConfigKey.Enabled]: true });
				const recompute = comparisons;
				comparisons = 0;
				stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });
				const ready = comparisons;
				const registered = stateManager.getSessionState(session)!.chats.length;
				const movable = (i: number) => stateManager.getSessionState(session)!.chats.find(chat => chat.resource === buildChatUri(session, `peer-${i}`))?.movable;
				return { recompute: Math.ceil(recompute / registered), ready: Math.ceil(ready / registered), refused: movable(0) !== true, othersMovable: movable(chats - 1) === true };
			} finally {
				for (const [index, name] of counted.entries()) {
					delete (extUriBiasedIgnorePathCase as unknown as Record<string, unknown>)[name];
					if (extUriBiasedIgnorePathCase[name] !== originals[index]) {
						(extUriBiasedIgnorePathCase as unknown as Record<string, unknown>)[name] = originals[index];
					}
				}
				store.dispose();
			}
		};

		const results = [await run(100), await run(400)];
		assert.deepStrictEqual(results[1], results[0], JSON.stringify(results));
		assert.deepStrictEqual({ refused: results[0].refused, othersMovable: results[0].othersMovable }, { refused: true, othersMovable: true });
	});

	test('a session\'s chats published one by one, as a restore registers them or once the session is ready, cost a linear number of lookups, with moving chats off and on (perf, Block 5)', async () => {
		const run = async (chats: number, enabled: boolean) => {
			const store = new DisposableStore();
			try {
				const stateManager = store.add(new CountingStateManager(new NullLogService()));
				const configuration = store.add(new AgentConfigurationService(stateManager, new NullLogService()));
				const sources = new TestSources();
				store.add(new AgentHostChatMovability(stateManager, configuration, sources));
				stateManager.createSession(summary(session));
				const firstPeer = buildChatUri(session, 'peer-0');
				if (enabled) {
					// The first peer's own worktree, which every other chat of the session also works in (D2).
					sources.values.set(ADDITIONAL_WORKTREES_METADATA_KEY, JSON.stringify([{ handle: generateUuid(), workingDirectory: folder, repositoryRoot: folder, chat: firstPeer }]));
					configuration.updateRootConfig({ [ChatMoveConfigKey.Enabled]: true });
				}
				await timeout(0);
				stateManager.takeLookups(session);
				// A restore registers the chats its session lists one by one, and publishes each at once.
				for (let i = 0; i < chats; i++) {
					const peer = buildChatUri(session, `peer-${i}`);
					stateManager.registerRestoredChatSummary(session, peer, { storageResource: peer });
					if (i % 10 === 0) {
						const subagent = buildChatUri(session, `subagent-${i}`);
						stateManager.registerRestoredChatSummary(session, subagent, { storageResource: subagent, origin: { kind: ChatOriginKind.Tool, chat: peer, toolCallId: `call-${i}` } });
					}
				}
				const movable = (chat: string) => stateManager.getSessionState(session)!.chats.find(candidate => candidate.resource === chat)?.movable ?? false;
				// Read without waiting, as a client of the session would right after the restore.
				const restored = { ...stateManager.takeLookups(session), first: movable(firstPeer), last: movable(buildChatUri(session, `peer-${chats - 1}`)) };
				stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });
				return { restored, ready: stateManager.takeLookups(session) };
			} finally {
				store.dispose();
			}
		};

		const results = { off: [await run(100, false), await run(400, false)], onWithWorktree: [await run(100, true), await run(400, true)] };
		// Off: a restored chat costs the lookup of its session's listing only, and a ready session builds nothing per chat.
		const off = { restored: { perChat: 1, overhead: 0, first: false, last: false }, ready: { perChat: 0, overhead: 5 } };
		// On: the restore and the ready session each share one index of the session's chats; the first peer is refused (D2) at once.
		const onWithWorktree = { restored: { perChat: 2, overhead: 1, first: false, last: true }, ready: { perChat: 2, overhead: 9 } };
		assert.deepStrictEqual(results, { off: [off, off], onWithWorktree: [onWithWorktree, onWithWorktree] });
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
