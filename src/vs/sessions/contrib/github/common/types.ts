/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { themeColorFromId, ThemeIcon } from '../../../../base/common/themables.js';

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

export interface IGitHubChangedFile {
	readonly filename: string;
	readonly previous_filename: string | undefined;
	readonly status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
	readonly additions: number;
	readonly deletions: number;
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
	readonly headSha: string;
	readonly baseRef: string;
	readonly isDraft: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly mergedAt: string | undefined;
	readonly mergeable: boolean | undefined;
	readonly mergeableState: string;
}

export interface IGitHubPullRequestSummary {
	readonly number: number;
	readonly title: string;
	readonly author: IGitHubUser;
	readonly headRef: string;
	readonly checkoutRef: string;
	readonly isDraft: boolean;
	readonly updatedAt: string;
	readonly additions: number;
	readonly deletions: number;
	readonly reviewRequestedFromViewer: boolean;
	readonly assignedToViewer: boolean;
}

export interface IGitHubPullRequestsPage {
	readonly pullRequests: readonly IGitHubPullRequestSummary[];
	readonly cursor: string | undefined;
	readonly hasNextPage: boolean;
}

export interface IGitHubPullRequestContextComment {
	readonly kind: 'issue' | 'review';
	readonly author: string;
	readonly body: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly path?: string;
	readonly line?: number;
}

export interface IGitHubPullRequestContext {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
	readonly url: string;
	readonly title: string;
	readonly description: string;
	readonly author: string;
	readonly isDraft: boolean;
	readonly baseRef: string;
	readonly branchName: string;
	readonly headRef: string;
	readonly updatedAt: string;
	readonly patch: string;
	readonly comments: readonly IGitHubPullRequestContextComment[];
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

export interface IGitHubPullRequestReview {
	readonly id: number;
	readonly author: IGitHubUser;
	readonly state: string;
	readonly submittedAt: string;
}

/**
 * Additional live status used to refine the icon of an open pull request.
 */
export interface IPullRequestIconStatus {
	/** Whether the pull request has merge conflicts. */
	readonly hasMergeConflicts?: boolean;
	/** Whether the pull request has at least one failing CI check. */
	readonly hasFailingChecks?: boolean;
	/** Whether the pull request has at least one unresolved review comment thread. */
	readonly hasUnresolvedComments?: boolean;
}

/**
 * Compute the PR status icon from a state value.
 * Accepts both the `GitHubPullRequestState` enum values and the
 * metadata-only `'draft'` value the extension writes to session metadata.
 *
 * For open (non-draft) pull requests the optional {@link IPullRequestIconStatus}
 * refines the icon: a failing CI check shows an error variant (orange), while an
 * unresolved review comment shows a comment variant (using the open PR green).
 */
export function computePullRequestIcon(state: GitHubPullRequestState | 'draft', status?: IPullRequestIconStatus): ThemeIcon {
	switch (state) {
		case GitHubPullRequestState.Merged:
			return { ...Codicon.gitPullRequestDone, color: themeColorFromId('charts.purple') };
		case GitHubPullRequestState.Closed:
			return { ...Codicon.gitPullRequestClosed, color: themeColorFromId('charts.red') };
		case 'draft':
			return { ...Codicon.gitPullRequestDraft, color: themeColorFromId('descriptionForeground') };
		case GitHubPullRequestState.Open:
			if (status?.hasMergeConflicts || status?.hasFailingChecks) {
				return { ...Codicon.gitPullRequestError, color: themeColorFromId('charts.orange') };
			}
			if (status?.hasUnresolvedComments) {
				return { ...Codicon.gitPullRequestComment, color: themeColorFromId('charts.green') };
			}
			return { ...Codicon.gitPullRequest, color: themeColorFromId('charts.green') };
	}
}

//#endregion

//#region Issues

export const enum GitHubIssueState {
	Open = 'open',
	Closed = 'closed',
}

/** Why an issue was closed (GitHub's `state_reason` on the REST issue payload). */
export const enum GitHubIssueStateReason {
	Completed = 'completed',
	NotPlanned = 'not_planned',
	Duplicate = 'duplicate',
	Reopened = 'reopened',
}

export interface IGitHubIssue {
	readonly number: number;
	readonly title: string;
	readonly body: string;
	readonly state: GitHubIssueState;
	readonly stateReason: GitHubIssueStateReason | undefined;
	readonly author: IGitHubUser;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly closedAt: string | undefined;
}

/**
 * Compute the issue status icon, mirroring how github.com colors issues: open is
 * green, closed-as-completed is purple, and closed as not planned or duplicate is
 * muted (the work was never done).
 */
export function computeIssueIcon(state: GitHubIssueState, stateReason: GitHubIssueStateReason | undefined): ThemeIcon {
	if (state === GitHubIssueState.Open) {
		return { ...Codicon.issueOpened, color: themeColorFromId('charts.green') };
	}
	if (stateReason === GitHubIssueStateReason.NotPlanned || stateReason === GitHubIssueStateReason.Duplicate) {
		return { ...Codicon.issueClosed, color: themeColorFromId('descriptionForeground') };
	}
	return { ...Codicon.issueClosed, color: themeColorFromId('charts.purple') };
}

/**
 * Compute a single icon summarizing a set of issues: open wins over closed, and
 * closed-as-completed wins over closed as not planned or duplicate. Issues whose
 * live state is not loaded yet count as open, so the icon starts optimistic and
 * only settles once every issue is known to be closed.
 */
export function computeAggregateIssueIcon(issues: readonly (IGitHubIssue | undefined)[]): ThemeIcon {
	if (issues.length === 0 || issues.some(issue => !issue || issue.state === GitHubIssueState.Open)) {
		return computeIssueIcon(GitHubIssueState.Open, undefined);
	}

	const allDiscarded = issues.every(issue =>
		issue!.stateReason === GitHubIssueStateReason.NotPlanned || issue!.stateReason === GitHubIssueStateReason.Duplicate);
	return computeIssueIcon(GitHubIssueState.Closed, allDiscarded ? GitHubIssueStateReason.NotPlanned : GitHubIssueStateReason.Completed);
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

export interface IGitHubPullRequestReviewThread {
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
