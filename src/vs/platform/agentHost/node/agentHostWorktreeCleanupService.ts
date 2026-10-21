/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { isEqual } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession } from '../common/agent.js';
import { IAgentHostDatabase } from './agentHostDatabase.js';
import { coOwnedWorktreeRemovalOwner, type IPendingWorktreeRemoval, type IWorktreeCoOwner, type IWorktreeCoOwnerState, type IWorktreeRemovalRequest, type WorktreeRemovalMode } from './agentHostWorktreeRemovalDatabase.js';
import { ADDITIONAL_WORKTREES_METADATA_KEY, parseSessionAdditionalWorktrees } from './shared/sessionAdditionalWorktrees.js';
import { DetachedWorktreeRemovalGuard, IAgentHostWorktreeIsolation, IRecordedWorktree } from './shared/worktreeIsolation.js';

export const IAgentHostWorktreeCleanupService = createDecorator<IAgentHostWorktreeCleanupService>('agentHostWorktreeCleanupService');

/**
 * Removes the worktree folders of archived and deleted sessions, and of
 * archived and deleted detached (Dev Container) worktrees, in the background.
 *
 * Archive and delete only record the intent in agent-host.db, without Git.
 * A pass, debounced after each request, run once startup settled and repeated
 * while removals remain, takes each due removal under its worktree's lock:
 * it drops a removal whose owner was unarchived since, keeps one whose folder
 * another non-archived session or chat still uses, and otherwise runs the
 * removal's Git work. Failures are retried with backoff.
 *
 * A worktree shared since a chat moved (Block 5) is removed by reference: each
 * co-owner's archive or deletion records its own `coOwned` removal, every live
 * co-owner keeps the folder in use, and a deletion of a folder that was ever
 * shared commits its changes first (`commit`, never `delete`).
 */
export interface IAgentHostWorktreeCleanupService {
	readonly _serviceBrand: undefined;
	/** Archive: records that the session's worktree is to be removed. */
	requestSessionWorktreeRemoval(session: URI, mode: Extract<WorktreeRemovalMode, 'commit' | 'synced'>): Promise<void>;
	/** Unarchive: drops the session's pending removal and recreates its folder when missing. */
	restoreSessionWorktree(session: URI): Promise<void>;
	/**
	 * Archives or unarchives a detached worktree. `strictCleanup` removes an
	 * archived folder only while its branch is synced. `ownerSession` is the
	 * session that uses it, if known.
	 */
	setDetachedWorktreeArchived(handle: string, archived: boolean, strictCleanup?: boolean, ownerSession?: URI): Promise<void>;
	/** Claims a detached worktree; a handle pending deletion is unknown. */
	claimDetachedWorktree(handle: string): Promise<void>;
	/** Reconciles a client's detached worktrees; it never removes one that is in use or pending clean-up. */
	reconcileDetachedWorktrees(scope: string, activeHandles: readonly string[]): Promise<void>;
	/** Deletes a detached worktree: its folder and its record. */
	deleteDetachedWorktree(handle: string): Promise<void>;
	/**
	 * The removal requests for a deleted session's worktree and its detached
	 * worktrees, for the caller to record in the same transaction as the
	 * session's tombstone. Reads no Git.
	 */
	prepareSessionDeletion(session: URI, detachedWorktreeHandles: readonly string[], mode: Extract<WorktreeRemovalMode, 'delete' | 'synced'>): Promise<readonly IWorktreeRemovalRequest[]>;
	/** Schedules a debounced pass, after removal requests were recorded or a session that may keep a worktree in use was archived or deleted. */
	schedule(): void;
	/** Starts clean-up once startup settled: reconciles unclaimed detached worktrees, then runs a pass. */
	start(): void;
	/** Runs a pass now and resolves when it completes. */
	runPass(): Promise<void>;
}

export interface IAgentHostWorktreeCleanupOptions {
	/** Delay of the pass after a removal request. */
	readonly debounceMs?: number;
	/** Delay of the next pass while removals remain, so worktrees kept in use are re-checked. */
	readonly periodicMs?: number;
	/** Delay of the first retry after a failure; doubles per attempt up to {@link maxBackoffMs}. */
	readonly backoffMs?: number;
	readonly maxBackoffMs?: number;
	readonly now?: () => number;
}

const DEFAULT_DEBOUNCE_MS = 3_000;
const DEFAULT_PERIODIC_MS = 5 * 60 * 1000;
const DEFAULT_BACKOFF_MS = 30 * 1000;
const DEFAULT_MAX_BACKOFF_MS = 60 * 60 * 1000;
/** Attempts after which a failing removal is logged as a warning. */
const WARN_AFTER_ATTEMPTS = 5;

export class AgentHostWorktreeCleanupService extends Disposable implements IAgentHostWorktreeCleanupService {
	declare readonly _serviceBrand: undefined;

	private readonly _debounceMs: number;
	private readonly _periodicMs: number;
	private readonly _backoffMs: number;
	private readonly _maxBackoffMs: number;
	private readonly _now: () => number;
	private readonly _scheduler: RunOnceScheduler;
	private _started = false;
	private _lastRequestedAt = 0;
	private _pass: Promise<void> | undefined;
	private _passAgain = false;

	constructor(
		options: IAgentHostWorktreeCleanupOptions | undefined,
		@IAgentHostDatabase private readonly _database: IAgentHostDatabase,
		@IAgentHostWorktreeIsolation private readonly _worktree: IAgentHostWorktreeIsolation,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
		this._periodicMs = options?.periodicMs ?? DEFAULT_PERIODIC_MS;
		this._backoffMs = options?.backoffMs ?? DEFAULT_BACKOFF_MS;
		this._maxBackoffMs = options?.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
		this._now = options?.now ?? Date.now;
		this._scheduler = this._register(new RunOnceScheduler(() => void this.runPass(), this._debounceMs));
	}

	async requestSessionWorktreeRemoval(session: URI, mode: Extract<WorktreeRemovalMode, 'commit' | 'synced'>): Promise<void> {
		const own = await this._worktree.runExclusive(AgentSession.id(session), async () => {
			const worktree = await this._worktree.readSessionWorktreeForRemoval(session);
			if (worktree) {
				await this._database.upsertPendingWorktreeRemoval(this._request('session', session.toString(), session, worktree, mode, false));
			}
			return worktree;
		});
		const coOwned = await this._database.listWorktreeCoOwnersOfSession(session.toString());
		const recorded = coOwned.length > 0 ? await this._recordedWorktreeFolders(session, own) : [];
		for (const coOwner of coOwned) {
			// One removal per folder: the removal of a worktree the session records itself (its own, or an additional one,
			// which its archive removes by handle) already covers its share of it.
			if (!recorded.some(folder => isEqual(folder, URI.parse(coOwner.worktreePath)))) {
				await this._worktree.runExclusive(coOwner.worktreePath, () => this._database.upsertPendingWorktreeRemoval(this._coOwnedRequest(session, coOwner, mode, false)));
			}
		}
		// Even without a worktree of its own, the session may have kept another session's worktree in use.
		this.schedule();
	}

	async restoreSessionWorktree(session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._worktree.runExclusive(sessionId, () => this._database.deletePendingWorktreeRemoval('session', session.toString()));
		await this._worktree.recreateWorktreeOnUnarchive(session, sessionId);
		// Its shares of worktrees come back too, recreated from the branch the share recorded when the folder is gone; not
		// a share it no longer works in (stale, or kept only as the folder's forced-commit marker): nothing would remove it.
		// Nor a worktree it records itself, which its own unarchive recreates.
		const coOwned = await this._database.listWorktreeCoOwnersOfSession(session.toString());
		const recorded = coOwned.length > 0 ? await this._recordedWorktreeFolders(session, await this._worktree.readSessionWorktreeForRemoval(session)) : [];
		for (const coOwner of coOwned) {
			const live = await this._worktree.runExclusive(coOwner.worktreePath, async () => {
				await this._database.deletePendingWorktreeRemoval('coOwned', coOwnedWorktreeRemovalOwner(session.toString(), coOwner.worktreePath));
				return (await this._database.pruneWorktreeCoOwners(coOwner.worktreePath)).some(row => row.session === session.toString() && row.live);
			});
			if (live && !recorded.some(folder => isEqual(folder, URI.parse(coOwner.worktreePath)))) {
				await this._worktree.recreateSharedWorktree(this._recordedCoOwned(coOwner));
			}
		}
	}

	/**
	 * The worktree folders `session` records itself: `own`, and the additional worktrees its central list names (archive
	 * and unarchive handle those by handle). A session that co-owns a folder has central state.
	 */
	private async _recordedWorktreeFolders(session: URI, own: IRecordedWorktree | undefined): Promise<readonly URI[]> {
		const values = (await this._database.readSessionStateValues([session.toString()], [ADDITIONAL_WORKTREES_METADATA_KEY])).get(session.toString())?.values;
		return [
			...(own ? [own.worktree] : []),
			...parseSessionAdditionalWorktrees(values?.get(ADDITIONAL_WORKTREES_METADATA_KEY)).map(worktree => URI.parse(worktree.workingDirectory)),
		];
	}

	async setDetachedWorktreeArchived(handle: string, archived: boolean, strictCleanup?: boolean, ownerSession?: URI): Promise<void> {
		if (archived) {
			const recorded = await this._worktree.runExclusive(handle, async () => {
				if ((await this._database.readPendingWorktreeRemoval('detached', handle))?.ownerDeleted
					|| !await this._worktree.markDetachedWorktreeArchived(handle, true)) {
					return false;
				}
				const worktree = await this._worktree.readDetachedWorktreeForRemoval(handle);
				if (worktree) {
					await this._database.upsertPendingWorktreeRemoval(this._request('detached', handle, ownerSession, worktree, strictCleanup ? 'synced' : 'commit', false));
				}
				return !!worktree;
			});
			if (recorded) {
				this.schedule();
			}
			return;
		}
		const restored = await this._worktree.runExclusive(handle, async () => {
			if ((await this._database.readPendingWorktreeRemoval('detached', handle))?.ownerDeleted) {
				return false;
			}
			await this._database.deletePendingWorktreeRemoval('detached', handle);
			return this._worktree.markDetachedWorktreeArchived(handle, false);
		});
		if (restored) {
			await this._worktree.recreateDetachedWorktreeOnUnarchive(handle);
		}
	}

	async claimDetachedWorktree(handle: string): Promise<void> {
		if ((await this._database.readPendingWorktreeRemoval('detached', handle))?.ownerDeleted) {
			throw new Error(`Unknown detached worktree handle: ${handle}`);
		}
		await this._worktree.claimDetachedWorktree(handle);
	}

	reconcileDetachedWorktrees(scope: string, activeHandles: readonly string[]): Promise<void> {
		return this._worktree.reconcileDetachedWorktrees(scope, activeHandles, this._detachedRemovalGuard);
	}

	/** Reconciliation leaves a folder to a pending removal, and keeps one another session or chat uses. */
	private readonly _detachedRemovalGuard: DetachedWorktreeRemovalGuard = async (handle, worktree, owner) =>
		!await this._database.readPendingWorktreeRemoval('detached', handle)
		&& !await this._database.isWorktreeInUse(worktree.toString(), owner);

	async deleteDetachedWorktree(handle: string): Promise<void> {
		const recorded = await this._worktree.runExclusive(handle, async () => {
			const worktree = await this._worktree.readDetachedWorktreeForRemoval(handle);
			if (!worktree) {
				// Without a recorded folder there is nothing to remove but the record, if any.
				await this._worktree.deleteDetachedWorktreeRecord(handle);
				return false;
			}
			await this._database.upsertPendingWorktreeRemoval(this._request('detached', handle, undefined, worktree, 'delete', true));
			return true;
		});
		if (recorded) {
			this.schedule();
		}
	}

	async prepareSessionDeletion(session: URI, detachedWorktreeHandles: readonly string[], mode: Extract<WorktreeRemovalMode, 'delete' | 'synced'>): Promise<readonly IWorktreeRemovalRequest[]> {
		const requests: IWorktreeRemovalRequest[] = [];
		// Under the lock, a worktree still being created is complete before it is read.
		const worktree = await this._worktree.runExclusive(AgentSession.id(session), () => this._worktree.readSessionWorktreeForRemoval(session, { includeUnpersisted: true }));
		if (worktree) {
			requests.push(this._request('session', session.toString(), session, worktree, mode, true));
		}
		for (const handle of detachedWorktreeHandles) {
			const detached = await this._worktree.runExclusive(handle, () => this._worktree.readDetachedWorktreeForRemoval(handle, { includeUnpersisted: true }));
			if (detached) {
				requests.push(this._request('detached', handle, session, detached, mode, true));
			}
		}
		for (const coOwner of await this._database.listWorktreeCoOwnersOfSession(session.toString())) {
			// One removal per folder: a worktree the session records itself is already covered.
			if (!requests.some(request => isEqual(URI.parse(request.worktreePath), URI.parse(coOwner.worktreePath)))) {
				requests.push(this._coOwnedRequest(session, coOwner, mode, true));
			}
		}
		// A folder that was ever shared is committed rather than force-removed: another co-owner's work may be in it.
		const result: IWorktreeRemovalRequest[] = [];
		for (const request of requests) {
			result.push(request.mode === 'delete' && (await this._database.readWorktreeCoOwners(request.worktreePath)).length > 0 ? { ...request, mode: 'commit' } : request);
		}
		return result;
	}

	schedule(): void {
		// Before start, the startup pass picks the request up.
		if (this._started && !this._store.isDisposed) {
			this._scheduler.schedule(this._debounceMs);
		}
	}

	start(): void {
		if (this._started) {
			return;
		}
		this._started = true;
		void this._worktree.cleanupUnclaimedDetachedWorktrees(this._detachedRemovalGuard)
			.catch(error => this._logService.warn(`[AgentHostWorktreeCleanup] Failed to clean up unclaimed detached worktrees: ${errorMessage(error)}`))
			.then(() => this.runPass());
	}

	runPass(): Promise<void> {
		if (this._pass) {
			this._passAgain = true;
			return this._pass;
		}
		this._scheduler.cancel();
		this._pass = (async () => {
			try {
				do {
					this._passAgain = false;
					await this._runPass();
				} while (this._passAgain && !this._store.isDisposed);
			} catch (error) {
				this._logService.warn(`[AgentHostWorktreeCleanup] Clean-up pass failed: ${errorMessage(error)}`);
			} finally {
				this._pass = undefined;
			}
			await this._scheduleNext();
		})();
		return this._pass;
	}

	private async _runPass(): Promise<void> {
		const now = this._now();
		// Rows of sessions deleted since (also by an older build) keep nothing in use; only a folder's marker stays.
		await this._database.pruneDeletedWorktreeCoOwners();
		for (const removal of await this._database.listPendingWorktreeRemovals()) {
			if (this._store.isDisposed) {
				return;
			}
			if (removal.nextAttemptAt <= now) {
				await this._process(removal, now);
			}
		}
	}

	private async _process(removal: IPendingWorktreeRemoval, now: number): Promise<void> {
		const key = removal.kind === 'session' ? AgentSession.id(URI.parse(removal.owner)) : removal.kind === 'coOwned' ? removal.worktreePath : removal.owner;
		// Co-owners that no longer work in the folder (deleted, also by an older build, or moved away) stop keeping it.
		const coOwners = await this._worktree.runExclusive(removal.worktreePath, () => this._database.pruneWorktreeCoOwners(removal.worktreePath));
		await this._worktree.runExclusive(key, () => removal.kind !== 'coOwned' && coOwners.length > 0
			// A folder that was ever shared is also locked by its path, as its co-owners recreate it under that lock.
			? this._worktree.runExclusive(removal.worktreePath, () => this._processLocked(removal, key, coOwners, now))
			: this._processLocked(removal, key, coOwners, now));
	}

	/** Processes `removal` under its owner's lock, and its folder's lock when it was ever shared. */
	private async _processLocked(removal: IPendingWorktreeRemoval, key: string, coOwners: readonly IWorktreeCoOwnerState[], now: number): Promise<void> {
		const current = await this._database.readPendingWorktreeRemoval(removal.kind, removal.owner);
		if (!current || current.mode !== removal.mode || current.requestedAt !== removal.requestedAt) {
			// The owner was unarchived, or asked again, since this pass listed it.
			return;
		}
		// An unarchive persists before it drops the request, so a crash in between leaves a request it cancelled.
		const archiveOwner = removal.kind === 'session' ? removal.owner : removal.kind === 'coOwned' ? removal.ownerSession : undefined;
		if (archiveOwner !== undefined && !removal.ownerDeleted && await this._database.readSessionArchived(archiveOwner) === false) {
			this._logService.info(`[AgentHostWorktreeCleanup:${key}] Dropping the removal of '${removal.worktreePath}': its session is no longer archived`);
			await this._database.deletePendingWorktreeRemoval(removal.kind, removal.owner, removal);
			return;
		}
		const isUnused = async () => !await this._database.isWorktreeInUse(removal.worktreePath, removal.ownerSession);
		if (!await isUnused()) {
			this._logService.trace(`[AgentHostWorktreeCleanup:${key}] Keeping worktree '${removal.worktreePath}': another session or chat uses it`);
			return;
		}
		const worktree: IRecordedWorktree = {
			worktree: URI.parse(removal.worktreePath),
			repositoryRoot: URI.parse(removal.repositoryRoot),
			branchName: removal.branch ?? '',
		};
		const retryAt = now + Math.min(this._maxBackoffMs, this._backoffMs * 2 ** removal.attempts);
		// A folder that was ever shared is committed rather than force-removed, also for a request recorded before it was.
		const mode = removal.mode === 'delete' && coOwners.length > 0 ? 'commit' : removal.mode;
		try {
			// Asked again after the Git work that precedes the removal, which a folder coming into use meanwhile must stop.
			const outcome = await this._worktree.removeRecordedWorktree(key, worktree, mode, isUnused);
			if (outcome === 'inUse') {
				return;
			}
			if (outcome === 'skipped') {
				// Kept for now, such as an unsynced branch: try again later rather than strand the folder.
				await this._database.recordPendingWorktreeRemovalFailure(removal, retryAt);
				return;
			}
			if (removal.kind === 'detached' && removal.ownerDeleted) {
				await this._worktree.deleteDetachedWorktreeRecord(removal.owner);
			}
			if (coOwners.length > 0) {
				// The folder is gone, removed in commit mode as it was ever shared: rows that can't recreate it go, the marker too.
				await this._database.clearStaleWorktreeCoOwners(removal.worktreePath);
			}
			await this._database.deletePendingWorktreeRemoval(removal.kind, removal.owner, removal);
		} catch (error) {
			const attempts = await this._database.recordPendingWorktreeRemovalFailure(removal, retryAt);
			const message = `[AgentHostWorktreeCleanup:${key}] Failed to remove worktree '${worktree.worktree.fsPath}' (attempt ${attempts ?? removal.attempts + 1}): ${errorMessage(error)}`;
			if ((attempts ?? 0) >= WARN_AFTER_ATTEMPTS) {
				this._logService.warn(message);
			} else {
				this._logService.info(message);
			}
		}
	}

	private async _scheduleNext(): Promise<void> {
		if (!this._started || this._store.isDisposed) {
			return;
		}
		const remaining = await this._database.listPendingWorktreeRemovals().catch(() => []);
		if (remaining.length === 0 || this._scheduler.isScheduled()) {
			return;
		}
		// A due removal that remains is kept in use and is re-checked periodically; a failed one at its next attempt.
		const now = this._now();
		const delay = Math.min(this._periodicMs, ...remaining.map(removal => removal.nextAttemptAt > now ? removal.nextAttemptAt - now : this._periodicMs));
		this._scheduler.schedule(Math.max(this._debounceMs, delay));
	}

	/** A co-owner's removal of a shared worktree folder; the folder's lock serializes it with the other co-owners'. */
	private _coOwnedRequest(session: URI, coOwner: IWorktreeCoOwner, mode: WorktreeRemovalMode, ownerDeleted: boolean): IWorktreeRemovalRequest {
		return this._request('coOwned', coOwnedWorktreeRemovalOwner(session.toString(), coOwner.worktreePath), session, this._recordedCoOwned(coOwner), mode, ownerDeleted);
	}

	private _recordedCoOwned(coOwner: IWorktreeCoOwner): IRecordedWorktree {
		return { worktree: URI.parse(coOwner.worktreePath), repositoryRoot: URI.parse(coOwner.repositoryRoot), branchName: coOwner.branch };
	}

	private _request(kind: IWorktreeRemovalRequest['kind'], owner: string, ownerSession: URI | undefined, worktree: IRecordedWorktree, mode: WorktreeRemovalMode, ownerDeleted: boolean): IWorktreeRemovalRequest {
		// Strictly increasing, so a request never reuses the timestamp of the one it replaces.
		this._lastRequestedAt = Math.max(this._now(), this._lastRequestedAt + 1);
		return {
			kind,
			owner,
			ownerSession: ownerSession?.toString(),
			worktreePath: worktree.worktree.toString(),
			repositoryRoot: worktree.repositoryRoot.toString(),
			branch: worktree.branchName,
			mode,
			ownerDeleted,
			requestedAt: this._lastRequestedAt,
		};
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
