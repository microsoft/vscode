/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { SequencerByKey } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostCheckpointService, buildChatCheckpointRefName, buildCheckpointRefName } from '../common/agentHostCheckpointService.js';
import { AgentSession } from '../common/agent.js';
import { ISessionDatabase, ISessionDataService, SESSION_CHECKPOINT_REPOSITORIES_METADATA_KEY } from '../common/sessionDataService.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { IAgentHostSessionStateStore } from '../common/agentHostSessionStateStore.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';

interface ITurnStartCheckpoint {
	readonly chatKey: string;
	readonly trees: Map<string, string>;
	gitEligible: boolean;
}

export class AgentHostCheckpointService extends Disposable implements IAgentHostCheckpointService {
	declare readonly _serviceBrand: undefined;

	/**
	 * Serializes capture/dispose per session so back-to-back end-of-turn
	 * captures don't race on the temp-index files or the `setTurnCheckpointRef`
	 * write, and a dispose can't run concurrently with an in-flight capture.
	 * Keyed by session URI string.
	 */
	private readonly _sequencer = new SequencerByKey<string>();
	/** Chat captures queued or running, by session and chat: they write into the chat's own database. */
	private readonly _pendingChatCaptures = new Map<string, { readonly session: URI; readonly chats: Map<string, number> }>();
	private readonly _turnStartCheckpoints = new Map<string, Map<string, ITurnStartCheckpoint>>();

	constructor(
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentConfigurationService private readonly _agentConfigService: IAgentConfigurationService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostSessionStateStore private readonly _stateStore: IAgentHostSessionStateStore,
	) {
		super();
		// Cleanup hook: when a session's or chat's data directory is about
		// to be deleted, delete the checkpoint refs its database records
		// BEFORE the database file disappears. The `waitUntil` API blocks
		// `deleteSessionData` until our promise settles, so the deletion
		// can't race the ref read. A session's working directories come
		// from the event because the session has already been removed from
		// the state manager by this point.
		this._register(this._sessionDataService.onWillDeleteSessionData(e => {
			const key = e.session.toString();
			e.waitUntil((async () => {
				// Captures are queued by session, while a chat's database is deleted by its own resource: the
				// deletion also waits for the captures of other sessions that write into this database, and no others.
				const pending = (await this._sessionsCapturingInto(e.session)).map(session => this._sequencer.peek(session));
				await this._sequencer.queue(key, async () => {
					await Promise.allSettled(pending);
					this._turnStartCheckpoints.delete(key);
					await this._deleteCheckpoints(e.session, e.workingDirectories);
				});
			})());
		}));
	}

	captureBaselineCheckpoint(sessionUri: URI, workingDirectories: readonly URI[] | undefined): Promise<void> {
		return this._sequencer.queue(sessionUri.toString(), () => this._captureBaseline(sessionUri, workingDirectories));
	}

	private async _captureBaseline(sessionUri: URI, workingDirectories: readonly URI[] | undefined): Promise<void> {
		if (!workingDirectories || workingDirectories.length === 0) {
			this._logService.trace(`[AgentHostCheckpoint] Skipping baseline capture for ${sessionUri.toString()} as no working directories are found`);
			return;
		}

		const sanitized = this._sanitizedSessionId(sessionUri);
		const baselineRefName = buildCheckpointRefName(sanitized, 0);
		const completedRepositories = new ResourceSet();

		for (const workingDirectoryUri of workingDirectories) {
			try {
				// Check that the working directory has a git repository
				const repositoryRootUri = await this._gitService.getRepositoryRoot(workingDirectoryUri);
				if (!repositoryRootUri || completedRepositories.has(repositoryRootUri)) {
					continue;
				}

				// Check if the baseline ref already exists
				const baselineCheckpointRef = await this.getBaselineCheckpoint(sessionUri, repositoryRootUri);
				if (baselineCheckpointRef) {
					completedRepositories.add(repositoryRootUri);
					continue;
				}

				// Create checkpoint commit
				const commit = await this._writeCheckpointCommit(repositoryRootUri, undefined, `Agent host session ${sanitized} - baseline checkpoint`);
				if (!commit) {
					continue;
				}

				// Update the baseline ref to point to the new commit
				await this._gitService.updateRef(repositoryRootUri, baselineRefName, commit);
				completedRepositories.add(repositoryRootUri);
				this._logService.trace(`[AgentHostCheckpoint] Captured baseline for ${sessionUri.toString()} at ${baselineRefName} in working directory ${workingDirectoryUri.toString()}`);
			} catch (err) {
				this._logService.warn(`[AgentHostCheckpoint] Failed to capture baseline for ${sessionUri.toString()} in working directory ${workingDirectoryUri.toString()}`, err);
			}
		}
	}

	captureTurnStartCheckpoint(sessionUri: URI, chatUri: URI, turnId: string, workingDirectories: readonly URI[] | undefined): Promise<void> {
		return this._queueChatCapture(sessionUri, chatUri, () => this._captureTurnStartCheckpoint(sessionUri, chatUri, turnId, workingDirectories));
	}

	/** Queues a capture that writes into `chat`'s own database, tracked until it settles. */
	private async _queueChatCapture(session: URI, chat: URI, capture: () => Promise<void>): Promise<void> {
		const sessionKey = session.toString();
		const chatKey = chat.toString();
		let pending = this._pendingChatCaptures.get(sessionKey);
		if (!pending) {
			pending = { session, chats: new Map() };
			this._pendingChatCaptures.set(sessionKey, pending);
		}
		pending.chats.set(chatKey, (pending.chats.get(chatKey) ?? 0) + 1);
		try {
			return await this._sequencer.queue(sessionKey, capture);
		} finally {
			const count = (pending.chats.get(chatKey) ?? 1) - 1;
			if (count > 0) {
				pending.chats.set(chatKey, count);
			} else {
				pending.chats.delete(chatKey);
				if (pending.chats.size === 0 && this._pendingChatCaptures.get(sessionKey) === pending) {
					this._pendingChatCaptures.delete(sessionKey);
				}
			}
		}
	}

	/** Other sessions with a pending capture of a chat whose own database is `storage`. */
	private async _sessionsCapturingInto(storage: URI): Promise<string[]> {
		const key = storage.toString();
		const sessions: string[] = [];
		for (const [sessionKey, pending] of this._pendingChatCaptures) {
			if (sessionKey === key) {
				continue;
			}
			for (const chat of pending.chats.keys()) {
				let target: string | undefined;
				try {
					target = (await this._stateStore.chatRows.storageOf(pending.session, URI.parse(chat)))?.storage.toString();
				} catch {
					// Unknown: wait for it rather than risk a capture writing into the deleted database.
				}
				if (target === undefined || target === key) {
					sessions.push(sessionKey);
					break;
				}
			}
		}
		return sessions;
	}

	private async _captureTurnStartCheckpoint(sessionUri: URI, chatUri: URI, turnId: string, workingDirectories: readonly URI[] | undefined): Promise<void> {
		if (!workingDirectories || workingDirectories.length === 0) {
			return;
		}

		const sessionKey = sessionUri.toString();
		const chatKey = chatUri.toString();
		const turnKey = this._turnKey(chatKey, turnId);
		let sessionCheckpoints = this._turnStartCheckpoints.get(sessionKey);
		if (!sessionCheckpoints) {
			sessionCheckpoints = new Map();
			this._turnStartCheckpoints.set(sessionKey, sessionCheckpoints);
		}
		if (sessionCheckpoints.has(turnKey)) {
			return;
		}

		const hasConcurrentTurn = sessionCheckpoints.size > 0;
		if (hasConcurrentTurn) {
			for (const checkpoint of sessionCheckpoints.values()) {
				checkpoint.gitEligible = false;
			}
		}
		const checkpoint: ITurnStartCheckpoint = { chatKey, trees: new Map(), gitEligible: !hasConcurrentTurn };
		sessionCheckpoints.set(turnKey, checkpoint);
		let ref: ReturnType<ISessionDataService['openDatabase']> | undefined;
		try {
			const owner = await this._stateStore.chatRows.storageOf(sessionUri, chatUri);
			if (!owner) {
				// A chat central state does not know yet (its registration is racing this turn) gets no checkpoint for it,
				// as concurrent turns do not: it is never written as the default chat's.
				this._logService.trace(`[AgentHostCheckpoint] Skipping turn checkpoints of ${chatKey}/${turnId}: the chat is not recorded yet`);
				sessionCheckpoints.delete(turnKey);
				return;
			}
			ref = this._sessionDataService.openDatabase(owner.storage);
			await ref.object.createTurn(turnId);
			if (await ref.object.getTurnCheckpointRef(turnId)) {
				sessionCheckpoints.delete(turnKey);
				return;
			}

			const completedRepositories = new ResourceSet();
			for (const workingDirectoryUri of workingDirectories) {
				try {
					const repositoryRootUri = await this._gitService.getRepositoryRoot(workingDirectoryUri);
					if (!repositoryRootUri || completedRepositories.has(repositoryRootUri)) {
						continue;
					}

					// The baseline lookup is independent of the capture, so overlap it.
					const [tree, hasBaseline] = await Promise.all([
						this._gitService.captureWorkingTreeAsTree(repositoryRootUri),
						this.getBaselineCheckpoint(sessionUri, repositoryRootUri),
					]);
					if (tree) {
						const baselineReady = hasBaseline || await this._ensureBaselineCheckpoint(sessionUri, repositoryRootUri, tree);
						if (baselineReady) {
							// Failed baseline writes remain eligible for retry through another folder.
							completedRepositories.add(repositoryRootUri);
						}
						checkpoint.trees.set(repositoryRootUri.toString(), tree);
					}
				} catch (err) {
					this._logService.warn(`[AgentHostCheckpoint] Failed to capture turn start for ${sessionUri.toString()}/${turnId} in working directory ${workingDirectoryUri.toString()}`, err);
				}
			}

		} catch (err) {
			this._logService.warn(`[AgentHostCheckpoint] Failed to capture turn start for ${sessionUri.toString()}/${turnId}`, err);
		} finally {
			if (sessionCheckpoints.size === 0) {
				this._turnStartCheckpoints.delete(sessionKey);
			}
			ref?.dispose();
		}
	}

	discardTurnStartCheckpoint(sessionUri: URI, chatUri: URI, turnId: string): Promise<void> {
		return this._sequencer.queue(sessionUri.toString(), async () => {
			this._deleteTurnStartCheckpoint(sessionUri, this._turnKey(chatUri.toString(), turnId));
		});
	}

	discardChatTurnStartCheckpoints(sessionUri: URI, chatUri: URI): Promise<void> {
		return this._sequencer.queue(sessionUri.toString(), async () => {
			const sessionCheckpoints = this._turnStartCheckpoints.get(sessionUri.toString());
			if (!sessionCheckpoints) {
				return;
			}
			const chatKey = chatUri.toString();
			for (const [turnKey, checkpoint] of sessionCheckpoints) {
				if (checkpoint.chatKey === chatKey) {
					sessionCheckpoints.delete(turnKey);
				}
			}
			if (sessionCheckpoints.size === 0) {
				this._turnStartCheckpoints.delete(sessionUri.toString());
			}
		});
	}

	captureTurnCheckpoint(sessionUri: URI, chatUri: URI, turnId: string, workingDirectories: readonly URI[] | undefined): Promise<void> {
		return this._queueChatCapture(sessionUri, chatUri, () => this._captureTurnCheckpoint(sessionUri, chatUri, turnId, workingDirectories));
	}

	private async _captureTurnCheckpoint(sessionUri: URI, chatUri: URI, turnId: string, workingDirectories: readonly URI[] | undefined): Promise<void> {
		const turnKey = this._turnKey(chatUri.toString(), turnId);
		if (!workingDirectories || workingDirectories.length === 0) {
			this._logService.trace(`[AgentHostCheckpoint] Skipping turn checkpoint capture for ${sessionUri.toString()} as no working directories are found`);
			this._deleteTurnStartCheckpoint(sessionUri, turnKey);
			return;
		}

		const startCheckpoint = this._turnStartCheckpoints.get(sessionUri.toString())?.get(turnKey);
		let ref: ReturnType<ISessionDataService['openDatabase']> | undefined;

		try {
			if (!startCheckpoint || !startCheckpoint.gitEligible) {
				return;
			}
			const owner = await this._stateStore.chatRows.storageOf(sessionUri, chatUri);
			if (!owner) {
				return;
			}
			const { storage, isDefault } = owner;
			ref = this._sessionDataService.openDatabase(storage);
			const sanitized = this._sanitizedSessionId(sessionUri);

			const checkpointRef = await ref.object.getTurnCheckpointRef(turnId);

			if (checkpointRef) {
				// Already captured for this
				// turn, return the existing ref.
				return;
			}
			// Numbered within the chat's own database. The default chat's also holds older builds' rows of
			// other chats, so its numbers stay unique for older builds sharing the session's ref namespace.
			const turnNumber = await this._maxTurnNumber(ref.object) + 1;
			const refName = isDefault
				? buildCheckpointRefName(sanitized, turnNumber)
				: buildChatCheckpointRefName(createHash('sha1').update(chatUri.toString()).digest('hex').slice(0, 16), turnNumber);
			const capturedRepositories: URI[] = [];

			let capturedCheckpointRef = false;
			const completedRepositories = new ResourceSet();
			for (const workingDirectoryUri of workingDirectories) {
				try {
					// Check that the working directory has a git repository
					const repositoryRootUri = await this._gitService.getRepositoryRoot(workingDirectoryUri);
					if (!repositoryRootUri || completedRepositories.has(repositoryRootUri)) {
						continue;
					}

					// Check if the baseline ref exists for this repository. If it
					// doesn't exist, we cannot capture a turn checkpoint for this repository.
					const baselineCheckpointRef = await this.getBaselineCheckpoint(sessionUri, repositoryRootUri);
					if (!baselineCheckpointRef) {
						continue;
					}

					const parentRef = await this._getRepositoryParentRef(ref.object, turnId, repositoryRootUri, baselineCheckpointRef);
					let parentCommitOid = await this._gitService.revParse(repositoryRootUri, parentRef);
					if (!parentCommitOid) {
						this._logService.warn(`[AgentHostCheckpoint] Parent ref ${parentRef} missing for session ${sessionUri.toString()} in working directory ${workingDirectoryUri.toString()}`);
						continue;
					}

					const startTree = startCheckpoint.trees.get(repositoryRootUri.toString());
					if (!startTree) {
						continue;
					}
					const startCommitOid = await this._gitService.commitTree(repositoryRootUri, startTree, parentCommitOid, `Agent host session ${sanitized} - turn ${turnNumber} start`);
					if (!startCommitOid) {
						continue;
					}
					parentCommitOid = startCommitOid;

					const tree = await this._gitService.captureWorkingTreeAsTree(repositoryRootUri);
					if (!tree) {
						continue;
					}

					const commitOid = await this._gitService.commitTree(repositoryRootUri, tree, parentCommitOid, `Agent host session ${sanitized} - turn ${turnNumber}`);
					if (!commitOid) {
						continue;
					}

					await this._gitService.updateRef(repositoryRootUri, refName, commitOid);
					completedRepositories.add(repositoryRootUri);
					capturedRepositories.push(repositoryRootUri);
					capturedCheckpointRef = true;

					this._logService.trace(`[AgentHostCheckpoint] Captured turn ${turnNumber} for ${sessionUri.toString()} in working directory ${workingDirectoryUri.toString()} at ${refName}`);
				} catch (err) {
					this._logService.warn(`[AgentHostCheckpoint] Failed to capture turn checkpoint for ${sessionUri.toString()} in working directory ${workingDirectoryUri.toString()}`, err);
				}
			}

			if (capturedCheckpointRef) {
				// Repositories first: a crash in between leaves a repository without a row, never a row without its repository.
				await this._recordCheckpointRepositories(ref.object, capturedRepositories);
				await ref.object.setTurnCheckpointRef(turnId, refName);
			}
		} catch (err) {
			this._logService.warn(`[AgentHostCheckpoint] Failed to capture turn checkpoint for ${sessionUri.toString()}/${turnId}`, err);
		} finally {
			this._deleteTurnStartCheckpoint(sessionUri, turnKey);
			ref?.dispose();
		}
	}

	private async _getRepositoryParentRef(db: ISessionDatabase, turnId: string, repositoryRootUri: URI, baselineCheckpointRef: string): Promise<string> {
		const previousCheckpointRef = await db.getPreviousCheckpointRef(turnId);
		if (previousCheckpointRef && await this._gitService.revParse(repositoryRootUri, previousCheckpointRef)) {
			return previousCheckpointRef;
		}

		// Foreign rows belong to other chats; their refs are no parent of this chat's turns.
		const ownCheckpointRefs = (await db.getTurnsWithCheckpointRefs()).filter(turn => !turn.foreign).map(turn => turn.checkpointRef);
		for (const checkpointRef of ownCheckpointRefs.toReversed()) {
			if (checkpointRef !== previousCheckpointRef && await this._gitService.revParse(repositoryRootUri, checkpointRef)) {
				return checkpointRef;
			}
		}

		return baselineCheckpointRef;
	}

	async getTurnCheckpointPair(
		sessionUri: URI,
		chat: URI | undefined,
		turnId: string,
		workingDirectory?: URI
	): Promise<{ parent: string; current: string } | undefined> {
		if (!workingDirectory) {
			const workingDirectories = this._agentConfigService.getEffectiveWorkingDirectories(sessionUri.toString());
			if (!workingDirectories || workingDirectories.length === 0) {
				return undefined;
			}
			workingDirectory = URI.parse(workingDirectories[0]);
		}

		// The turn's row is in its chat's own database; the default chat's is the session database.
		const storage = chat ? (await this._stateStore.chatRows.storageOf(sessionUri, chat))?.storage : sessionUri;
		if (!storage) {
			return undefined;
		}
		const ref = await this._sessionDataService.tryOpenDatabase(storage);
		if (!ref) {
			return undefined;
		}
		try {
			const [currentCheckpointRef, previousCheckpointRef, baselineCheckpointRef] = await Promise.all([
				ref.object.getTurnCheckpointRef(turnId),
				ref.object.getPreviousCheckpointRef(turnId),
				this.getBaselineCheckpoint(sessionUri, workingDirectory)
			]);
			if (!currentCheckpointRef || !baselineCheckpointRef) {
				return undefined;
			}

			if (currentCheckpointRef === previousCheckpointRef) {
				return { current: currentCheckpointRef, parent: currentCheckpointRef };
			}

			const parentCheckpoint = await this._gitService.revParse(workingDirectory, `${currentCheckpointRef}^`);
			if (!parentCheckpoint) {
				return undefined;
			}

			return {
				current: currentCheckpointRef,
				parent: parentCheckpoint
			};
		} finally {
			ref.dispose();
		}
	}

	async getBaselineCheckpoint(sessionUri: URI, workingDirectory?: URI): Promise<string | undefined> {
		if (!workingDirectory) {
			const workingDirectories = this._agentConfigService.getEffectiveWorkingDirectories(sessionUri.toString());
			if (!workingDirectories || workingDirectories.length === 0) {
				return undefined;
			}

			workingDirectory = URI.parse(workingDirectories[0]);
		}

		const sanitized = this._sanitizedSessionId(sessionUri);
		const baselineRefName = buildCheckpointRefName(sanitized, 0);

		const baselineRef = await this._gitService.revParse(workingDirectory, baselineRefName);
		return baselineRef ? baselineRefName : undefined;
	}

	adoptLegacyCheckpoints(sessionUri: URI, workingDirectory: URI, rawSessionId: string, turnIds: readonly string[]): Promise<void> {
		return this._sequencer.queue(sessionUri.toString(), () => this._adoptLegacyCheckpoints(sessionUri, workingDirectory, rawSessionId, turnIds));
	}

	private async _adoptLegacyCheckpoints(sessionUri: URI, workingDirectory: URI, rawSessionId: string, turnIds: readonly string[]): Promise<void> {
		const repoRoot = await this._gitService.getRepositoryRoot(workingDirectory);
		if (!repoRoot || !this._gitService.listRefNamesWithOids) {
			return; // non-git session (no checkpoints existed) or capability unavailable
		}
		// Legacy EH checkpoint refs are `refs/sessions/<id>/checkpoints/turn/<N>`.
		// Pass the id prefix (no glob) so git's for-each-ref prefix match returns
		// every nested ref regardless of depth.
		const legacy = await this._gitService.listRefNamesWithOids(repoRoot, `refs/sessions/${rawSessionId}`);
		if (legacy.length === 0) {
			return;
		}
		// Parse the turn number from each legacy ref's trailing path segment.
		const oidByTurn = new Map<number, string>();
		for (const { ref, oid } of legacy) {
			const n = parseInt(ref.substring(ref.lastIndexOf('/') + 1), 10);
			if (Number.isFinite(n)) {
				oidByTurn.set(n, oid);
			}
		}
		const sanitized = this._sanitizedSessionId(sessionUri);
		// Re-point each legacy commit under the agent-host ref namespace (same OIDs).
		const refByTurn = new Map<number, string>();
		for (const [n, oid] of oidByTurn) {
			const refName = buildCheckpointRefName(sanitized, n);
			await this._gitService.updateRef(repoRoot, refName, oid);
			refByTurn.set(n, refName);
		}
		const ref = this._sessionDataService.openDatabase(sessionUri);
		try {
			// The baseline (turn 0) and per-turn commits are discoverable by the
			// `buildCheckpointRefName` convention (re-pointed above via updateRef), so
			// only the per-turn checkpoint index needs seeding here. The i-th resumed
			// turn (0-based) corresponds to end-of-turn checkpoint N=i+1.
			await this._recordCheckpointRepositories(ref.object, [repoRoot]);
			for (let i = 0; i < turnIds.length; i++) {
				const refName = refByTurn.get(i + 1);
				if (refName) {
					await ref.object.setTurnCheckpointRef(turnIds[i], refName);
				}
			}
		} finally {
			ref.dispose();
		}
		// Drop the legacy refs now the commits are reachable via the agent-host namespace.
		await this._gitService.deleteRefs(repoRoot, legacy.map(l => l.ref)).catch(() => { });
		this._logService.info(`[AgentHostCheckpoint] Adopted ${refByTurn.size} legacy checkpoint refs for ${sessionUri.toString()}`);
	}

	async deleteCheckpoints(sessionUri: URI, workingDirectories?: readonly string[]): Promise<void> {
		await this._sequencer.queue(sessionUri.toString(), () => this._deleteCheckpoints(sessionUri, workingDirectories));
	}

	private async _deleteCheckpoints(storage: URI, workingDirectories?: readonly string[]): Promise<void> {
		const refHandle = await this._sessionDataService.tryOpenDatabase(storage);
		if (!refHandle) {
			return;
		}

		try {
			// The database's rows are its chat's refs (a session database's also older builds' rows of other
			// chats). They are deleted where the chat recorded capturing them, never by listing a ref prefix.
			const turnRefs = await refHandle.object.getAllCheckpointRefs();
			const refsByRepository = new ResourceMap<Set<string>>();
			if (turnRefs.length > 0) {
				for (const repositoryRootUri of await this._readCheckpointRepositories(refHandle.object)) {
					refsByRepository.set(repositoryRootUri, new Set(turnRefs));
				}
			}
			// A session's current directories also locate its baseline and the refs of rows captured before
			// repositories were recorded.
			for (const workingDirectory of workingDirectories ?? []) {
				try {
					const repositoryRootUri = await this._gitService.getRepositoryRoot(URI.parse(workingDirectory));
					if (!repositoryRootUri) {
						continue;
					}

					const baselineCheckpointRef = await this.getBaselineCheckpoint(storage, repositoryRootUri);
					if (!baselineCheckpointRef) {
						continue;
					}

					// Dedup baseRef and turnRefs (a no-op turn may reuse its
					// parent's ref). Deleting the same ref twice is harmless but
					// noisy, and the batch API takes a list.
					const checkpointRefs = refsByRepository.get(repositoryRootUri) ?? new Set<string>(turnRefs);
					checkpointRefs.add(baselineCheckpointRef);
					refsByRepository.set(repositoryRootUri, checkpointRefs);
				} catch (err) {
					this._logService.warn(`[AgentHostCheckpoint] Failed to resolve checkpoint refs of ${storage.toString()} in working directory ${workingDirectory}`, err);
				}
			}
			for (const [repositoryRootUri, checkpointRefs] of refsByRepository) {
				try {
					await this._gitService.deleteRefs(repositoryRootUri, [...checkpointRefs]);
					this._logService.trace(`[AgentHostCheckpoint] Deleted ${checkpointRefs.size} checkpoint refs of ${storage.toString()} in repository ${repositoryRootUri.toString()}`);
				} catch (err) {
					this._logService.warn(`[AgentHostCheckpoint] Failed to delete checkpoint refs of ${storage.toString()} in repository ${repositoryRootUri.toString()}`, err);
				}
			}
		} catch (err) {
			this._logService.warn(`[AgentHostCheckpoint] Failed to dispose checkpoint refs for ${storage.toString()}`, err);
		} finally {
			refHandle.dispose();
		}
	}

	/** Appends `repositoryRoots` to the repositories the database's chat captured checkpoints in. */
	private async _recordCheckpointRepositories(db: ISessionDatabase, repositoryRoots: readonly URI[]): Promise<void> {
		const roots = repositoryRoots.map(root => root.toString());
		const recorded = this._parseCheckpointRepositories(await db.getMetadata(SESSION_CHECKPOINT_REPOSITORIES_METADATA_KEY));
		if (roots.every(root => recorded.includes(root))) {
			return;
		}
		await db.updateMetadata(SESSION_CHECKPOINT_REPOSITORIES_METADATA_KEY, value => {
			const current = this._parseCheckpointRepositories(value);
			return JSON.stringify([...current, ...new Set(roots.filter(root => !current.includes(root)))]);
		});
	}

	private async _readCheckpointRepositories(db: ISessionDatabase): Promise<URI[]> {
		return this._parseCheckpointRepositories(await db.getMetadata(SESSION_CHECKPOINT_REPOSITORIES_METADATA_KEY)).map(root => URI.parse(root));
	}

	private _parseCheckpointRepositories(raw: string | undefined): string[] {
		if (!raw) {
			return [];
		}
		try {
			const parsed: unknown = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed.filter((root): root is string => typeof root === 'string' && root.length > 0) : [];
		} catch {
			this._logService.warn(`[AgentHostCheckpoint] Ignoring malformed checkpoint repositories: ${raw}`);
			return [];
		}
	}

	private async _writeCheckpointCommit(
		repositoryRootUri: URI,
		parentOid: string | undefined,
		message: string,
	): Promise<string | undefined> {
		const tree = await this._gitService.captureWorkingTreeAsTree(repositoryRootUri);
		if (!tree) {
			return undefined;
		}

		const commitOid = await this._gitService.commitTree(repositoryRootUri, tree, parentOid, message);
		if (!commitOid) {
			return undefined;
		}

		return commitOid;
	}

	private async _ensureBaselineCheckpoint(sessionUri: URI, repositoryRootUri: URI, tree: string): Promise<boolean> {
		if (await this.getBaselineCheckpoint(sessionUri, repositoryRootUri)) {
			return true;
		}

		const sanitized = this._sanitizedSessionId(sessionUri);
		const baselineRefName = buildCheckpointRefName(sanitized, 0);
		const commit = await this._gitService.commitTree(repositoryRootUri, tree, undefined, `Agent host session ${sanitized} - baseline checkpoint`);
		if (commit) {
			await this._gitService.updateRef(repositoryRootUri, baselineRefName, commit);
			return true;
		}
		return false;
	}

	/**
	 * Parses the highest turn number from the existing refs of the database,
	 * including rows older builds left in it for other chats. Falls back to 0 (the baseline).
	 */
	private async _maxTurnNumber(db: ISessionDatabase): Promise<number> {
		const refs = await db.getAllCheckpointRefs();
		let max = 0;
		for (const ref of refs) {
			const idx = ref.lastIndexOf('/');
			const tail = idx >= 0 ? ref.substring(idx + 1) : ref;
			const n = parseInt(tail, 10);
			if (Number.isFinite(n) && n > max) {
				max = n;
			}
		}
		return max;
	}

	private _sanitizedSessionId(sessionUri: URI): string {
		return AgentSession.id(sessionUri).replace(/[^a-zA-Z0-9_.-]/g, '-');
	}

	private _deleteTurnStartCheckpoint(sessionUri: URI, turnKey: string): void {
		const sessionKey = sessionUri.toString();
		const sessionCheckpoints = this._turnStartCheckpoints.get(sessionKey);
		sessionCheckpoints?.delete(turnKey);
		if (sessionCheckpoints?.size === 0) {
			this._turnStartCheckpoints.delete(sessionKey);
		}
	}

	private _turnKey(chatKey: string, turnId: string): string {
		return `${chatKey}\0${turnId}`;
	}
}
