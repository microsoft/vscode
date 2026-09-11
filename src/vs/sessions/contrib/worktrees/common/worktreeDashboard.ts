/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ISession } from '../../../services/sessions/common/session.js';

/**
 * The lifecycle status of a git worktree discovered on disk, correlated
 * against the sessions that reference it.
 */
export const enum WorktreeEntryStatus {
	/** Owned by a session whose agent is currently active (in progress or needs input). */
	SessionActive = 'sessionActive',
	/** Owned by a session that is created but not archived and not currently active. */
	SessionIdle = 'sessionIdle',
	/** Owned by a session that has been archived (marked done). */
	SessionArchived = 'sessionArchived',
	/** Reported by Git for a known repository but no known session references it. */
	Orphaned = 'orphaned',
	/** Referenced by a session's git repository but missing from disk. */
	Missing = 'missing',
}

/**
 * A single Git-reported worktree correlated with the session that owns it, if any.
 */
export interface IWorktreeDashboardEntry {
	/** Root of the parent repository this worktree belongs to. */
	readonly repositoryRoot: URI;
	/** The worktree's working directory. For {@link WorktreeEntryStatus.Missing} this is the path that no longer exists. */
	readonly worktreePath: URI;
	/** Directory name of the worktree (last segment of {@link worktreePath}). */
	readonly name: string;
	/** Branch checked out in the worktree, when known. */
	readonly branchName: string | undefined;
	readonly status: WorktreeEntryStatus;
	/** The session that owns this worktree, when {@link status} is session-related. */
	readonly session: ISession | undefined;
	/** Whether the worktree has uncommitted changes, when known from the owning session's git repository. */
	readonly hasUncommittedChanges: boolean | undefined;
	/**
	 * On-disk size of the worktree's working tree, in bytes, or `undefined`
	 * while unknown/not yet computed (always `undefined` for
	 * {@link WorktreeEntryStatus.Missing}, since there is nothing on disk).
	 */
	readonly sizeBytes: number | undefined;
}

/**
 * Options for {@link IWorktreeDashboardService.removeWorktree}.
 */
export interface IRemoveWorktreeOptions {
	/** Force removal even if the worktree has uncommitted changes. */
	readonly force?: boolean;
}

/**
 * Aggregates git worktrees across every repository referenced by a session,
 * correlating each worktree with its owning session (if any) so the dashboard can
 * surface active, idle, archived, orphaned, and missing worktrees, and offers
 * safe management actions (open, reveal owning session, remove).
 */
export interface IWorktreeDashboardService {
	readonly _serviceBrand: undefined;

	/** Observable list of worktree entries across all repositories referenced by sessions. */
	readonly entries: IObservable<IWorktreeDashboardEntry[]>;
	/** Whether the first authoritative Git and disk scan has completed. */
	readonly hasRefreshed: IObservable<boolean>;

	/** Re-enumerates worktrees through Git and re-correlates them with sessions. */
	refresh(): Promise<void>;

	/**
	 * Removes the worktree at {@link IWorktreeDashboardEntry.worktreePath} via the git
	 * extension's `git.deleteWorktree` command, which itself prompts to force-delete
	 * when the worktree has uncommitted changes and {@link IRemoveWorktreeOptions.force}
	 * was not already set. Callers are expected to have already confirmed removal of a
	 * worktree still owned by a non-archived session.
	 */
	removeWorktree(entry: IWorktreeDashboardEntry, options?: IRemoveWorktreeOptions): Promise<void>;

	/** Opens the worktree's owning session in the Agents Window, if any. */
	revealSession(entry: IWorktreeDashboardEntry): Promise<void>;

	/** Opens the worktree folder in a new window. */
	openWorktreeFolder(entry: IWorktreeDashboardEntry): Promise<void>;
}

export const IWorktreeDashboardService = createDecorator<IWorktreeDashboardService>('worktreeDashboardService');
