/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession } from '../common/agent.js';
import { IAgentHostDatabase } from './agentHostDatabase.js';
import type { IPendingWorktreeRemoval, IWorktreeRemovalRequest, WorktreeRemovalMode } from './agentHostWorktreeRemovalDatabase.js';
import { IAgentHostWorktreeIsolation, IRecordedWorktree } from './shared/worktreeIsolation.js';

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
	/** Deletes a detached worktree: its folder and its record. */
	deleteDetachedWorktree(handle: string): Promise<void>;
	/**
	 * The removal requests for a deleted session's worktree and its detached
	 * worktrees, for the caller to record in the same transaction as the
	 * session's tombstone. Reads no Git.
	 */
	prepareSessionDeletion(session: URI, detachedWorktreeHandles: readonly string[], mode: Extract<WorktreeRemovalMode, 'delete' | 'synced'>): Promise<readonly IWorktreeRemovalRequest[]>;
	/** Schedules a debounced pass after removal requests were recorded. */
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
		const recorded = await this._worktree.runExclusive(AgentSession.id(session), async () => {
			const worktree = await this._worktree.readSessionWorktreeForRemoval(session);
			if (worktree) {
				await this._database.upsertPendingWorktreeRemoval(this._request('session', session.toString(), session, worktree, mode));
			}
			return !!worktree;
		});
		if (recorded) {
			this.schedule();
		}
	}

	async restoreSessionWorktree(session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._worktree.runExclusive(sessionId, () => this._database.deletePendingWorktreeRemoval('session', session.toString()));
		await this._worktree.recreateWorktreeOnUnarchive(session, sessionId);
	}

	async setDetachedWorktreeArchived(handle: string, archived: boolean, strictCleanup?: boolean, ownerSession?: URI): Promise<void> {
		if (archived) {
			const recorded = await this._worktree.runExclusive(handle, async () => {
				if ((await this._database.readPendingWorktreeRemoval('detached', handle))?.mode === 'delete'
					|| !await this._worktree.markDetachedWorktreeArchived(handle, true)) {
					return false;
				}
				const worktree = await this._worktree.readDetachedWorktreeForRemoval(handle);
				if (worktree) {
					await this._database.upsertPendingWorktreeRemoval(this._request('detached', handle, ownerSession, worktree, strictCleanup ? 'synced' : 'commit'));
				}
				return !!worktree;
			});
			if (recorded) {
				this.schedule();
			}
			return;
		}
		const restored = await this._worktree.runExclusive(handle, async () => {
			if ((await this._database.readPendingWorktreeRemoval('detached', handle))?.mode === 'delete') {
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
		if ((await this._database.readPendingWorktreeRemoval('detached', handle))?.mode === 'delete') {
			throw new Error(`Unknown detached worktree handle: ${handle}`);
		}
		await this._worktree.claimDetachedWorktree(handle);
	}

	async deleteDetachedWorktree(handle: string): Promise<void> {
		const recorded = await this._worktree.runExclusive(handle, async () => {
			const worktree = await this._worktree.readDetachedWorktreeForRemoval(handle);
			if (!worktree) {
				// Without a recorded folder there is nothing to remove but the record, if any.
				await this._worktree.deleteDetachedWorktreeRecord(handle);
				return false;
			}
			await this._database.upsertPendingWorktreeRemoval(this._request('detached', handle, undefined, worktree, 'delete'));
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
			requests.push(this._request('session', session.toString(), session, worktree, mode));
		}
		for (const handle of detachedWorktreeHandles) {
			const detached = await this._worktree.runExclusive(handle, () => this._worktree.readDetachedWorktreeForRemoval(handle, { includeUnpersisted: true }));
			if (detached) {
				requests.push(this._request('detached', handle, session, detached, mode));
			}
		}
		return requests;
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
		void this._worktree.cleanupUnclaimedDetachedWorktrees()
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
		const key = removal.kind === 'session' ? AgentSession.id(URI.parse(removal.owner)) : removal.owner;
		await this._worktree.runExclusive(key, async () => {
			const current = await this._database.readPendingWorktreeRemoval(removal.kind, removal.owner);
			if (!current || current.mode !== removal.mode || current.requestedAt !== removal.requestedAt) {
				// The owner was unarchived, or asked again, since this pass listed it.
				return;
			}
			if (await this._database.isWorktreeInUse(removal.worktreePath, removal.ownerSession)) {
				this._logService.trace(`[AgentHostWorktreeCleanup:${key}] Keeping worktree '${removal.worktreePath}': another session or chat uses it`);
				return;
			}
			const worktree: IRecordedWorktree = {
				worktree: URI.parse(removal.worktreePath),
				repositoryRoot: URI.parse(removal.repositoryRoot),
				branchName: removal.branch ?? '',
			};
			try {
				await this._worktree.removeRecordedWorktree(key, worktree, removal.mode);
				if (removal.kind === 'detached' && removal.mode === 'delete') {
					await this._worktree.deleteDetachedWorktreeRecord(removal.owner);
				}
				await this._database.deletePendingWorktreeRemoval(removal.kind, removal.owner, removal);
			} catch (error) {
				const nextAttemptAt = now + Math.min(this._maxBackoffMs, this._backoffMs * 2 ** removal.attempts);
				const attempts = await this._database.recordPendingWorktreeRemovalFailure(removal, nextAttemptAt);
				const message = `[AgentHostWorktreeCleanup:${key}] Failed to remove worktree '${worktree.worktree.fsPath}' (attempt ${attempts ?? removal.attempts + 1}): ${errorMessage(error)}`;
				if ((attempts ?? 0) >= WARN_AFTER_ATTEMPTS) {
					this._logService.warn(message);
				} else {
					this._logService.info(message);
				}
			}
		});
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

	private _request(kind: IWorktreeRemovalRequest['kind'], owner: string, ownerSession: URI | undefined, worktree: IRecordedWorktree, mode: WorktreeRemovalMode): IWorktreeRemovalRequest {
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
			requestedAt: this._lastRequestedAt,
		};
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
