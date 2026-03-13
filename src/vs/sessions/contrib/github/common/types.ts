/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//#region Session Context

/**
 * GitHub context derived from an active session, providing
 * the owner/repo and optionally the PR number.
 */
export interface IGitHubSessionContext {
	readonly owner: string;
	readonly repo: string;
	readonly prNumber: number | undefined;
}

//#endregion

//#region Repository

export interface IGitHubRepository {
	readonly owner: string;
	readonly name: string;
	readonly fullName: string;
	readonly defaultBranch: string;
	readonly isPrivate: boolean;
	readonly description: string;
}

//#endregion

//#region Pull Request

export const enum GitHubPullRequestState {
	Open = 'open',
	Closed = 'closed',
	Merged = 'merged',
}

export interface IGitHubUser {
	readonly login: string;
	readonly avatarUrl: string;
}

export interface IGitHubPullRequest {
	readonly number: number;
	readonly title: string;
	readonly body: string;
	readonly state: GitHubPullRequestState;
	readonly author: IGitHubUser;
	readonly headRef: string;
	readonly baseRef: string;
	readonly isDraft: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly mergedAt: string | undefined;
	readonly mergeable: boolean | undefined;
	readonly mergeableState: string;
}

export const enum MergeBlockerKind {
	ChangesRequested = 'changesRequested',
	CIFailed = 'ciFailed',
	ApprovalNeeded = 'approvalNeeded',
	Conflicts = 'conflicts',
	Draft = 'draft',
	Unknown = 'unknown',
}

export interface IMergeBlocker {
	readonly kind: MergeBlockerKind;
	readonly description: string;
}

export interface IGitHubPullRequestMergeability {
	readonly canMerge: boolean;
	readonly blockers: readonly IMergeBlocker[];
}

//#endregion

//#region Review Comments & Threads

export interface IGitHubPRComment {
	readonly id: number;
	readonly body: string;
	readonly author: IGitHubUser;
	readonly createdAt: string;
	readonly updatedAt: string;
	/** File path the comment is attached to (undefined for issue-level comments). */
	readonly path: string | undefined;
	/** Line number in the diff the comment is attached to. */
	readonly line: number | undefined;
	/** The id of the thread this comment belongs to. */
	readonly threadId: string;
	/** Whether this is a reply to another comment in the thread. */
	readonly inReplyToId: number | undefined;
}

export interface IGitHubPRReviewThread {
	readonly id: string;
	readonly isResolved: boolean;
	readonly path: string;
	readonly line: number | undefined;
	readonly comments: readonly IGitHubPRComment[];
}

//#endregion

//#region CI Checks

export const enum GitHubCheckStatus {
	Queued = 'queued',
	InProgress = 'in_progress',
	Completed = 'completed',
}

export const enum GitHubCheckConclusion {
	Success = 'success',
	Failure = 'failure',
	Neutral = 'neutral',
	Cancelled = 'cancelled',
	Skipped = 'skipped',
	TimedOut = 'timed_out',
	ActionRequired = 'action_required',
	Stale = 'stale',
}

export interface IGitHubCICheck {
	readonly id: number;
	readonly name: string;
	readonly status: GitHubCheckStatus;
	readonly conclusion: GitHubCheckConclusion | undefined;
	readonly startedAt: string | undefined;
	readonly completedAt: string | undefined;
	readonly detailsUrl: string | undefined;
}

export const enum GitHubCIOverallStatus {
	Pending = 'pending',
	Success = 'success',
	Failure = 'failure',
	Neutral = 'neutral',
}

//#endregion
