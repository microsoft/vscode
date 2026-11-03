/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiPaginationOptions, ApiRequestOptions } from '../client/request.js';
import { PageOptions, RepositoryRef } from '../client/types.js';
import { Account, Actor, ChangedFile, Connection, CursorOptions, Label, Milestone, NodeIdentity, RepositoryIdentity, Team } from './core.js';
import { Commit } from './repositories.js';

/** REST merge-method spelling. GraphQL inputs use the separate uppercase spelling. */
export type MergeMethod = 'merge' | 'squash' | 'rebase';

/** Merge methods accepted by GraphQL mutations. */
export type GraphQLMergeMethod = 'MERGE' | 'SQUASH' | 'REBASE';

/** A pull request branch and its last reported commit. */
export interface PullRequestBranch {
	/** Owner-qualified branch label. */
	readonly label: string;
	/** Branch name. */
	readonly ref: string;
	/** Last reported commit SHA, including for a branch that has since been deleted. */
	readonly sha: string;
	/** Repository identity, or null when the source repository was deleted. */
	readonly repo: RepositoryIdentity | null;
}

/** Fields available from pull request list and reviewer-request responses. */
export interface PullRequestSummary {
	/** Numeric database ID. */
	readonly id: number;
	/** GraphQL node ID. */
	readonly node_id: string;
	/** Repository-local PR number. */
	readonly number: number;
	/** Browser URL. */
	readonly html_url: string;
	/** REST resource URL. */
	readonly url: string;
	/** Pull request title. */
	readonly title: string;
	/** Markdown body, or null. */
	readonly body: string | null;
	/** Open or closed state; merged PRs are also closed. */
	readonly state: 'open' | 'closed';
	/** Draft state, when supported and included by the server. */
	readonly draft?: boolean;
	/** Author, or null when unavailable. */
	readonly user: Account | null;
	/** Source branch; its repository may no longer exist. */
	readonly head: PullRequestBranch;
	/** Target branch. */
	readonly base: PullRequestBranch;
	/** Assigned labels. */
	readonly labels: readonly Label[];
	/** Assigned milestone, or null. */
	readonly milestone: Milestone | null;
	/** Assigned accounts, when reported. */
	readonly assignees?: readonly Account[];
	/** Requested individual reviewers, when reported. */
	readonly requested_reviewers?: readonly Account[];
	/** Requested team reviewers, when reported. */
	readonly requested_teams?: readonly Team[];
	/** Creation timestamp. */
	readonly created_at: string;
	/** Last update timestamp. */
	readonly updated_at: string;
	/** Closure timestamp, or null. */
	readonly closed_at: string | null;
	/** Merge timestamp, or null. */
	readonly merged_at: string | null;
	/** Merge or test-merge SHA according to the PR's state, or null. */
	readonly merge_commit_sha: string | null;
}

/** Pull request metadata returned by cursor-based listings. */
export interface PullRequestListItem extends NodeIdentity {
	/** Repository-local PR number. */
	readonly number: number;
	/** Browser URL. */
	readonly url: string;
	/** Pull request title. */
	readonly title: string;
	/** Author, or null when unavailable. */
	readonly author: Actor | null;
	/** Source branch name, including when the branch no longer exists. */
	readonly headRefName: string;
	/** Whether the source and target repositories differ. */
	readonly isCrossRepository: boolean;
	/** Whether the pull request is a draft. */
	readonly isDraft: boolean;
	/** Most recent update time in RFC 3339 format. */
	readonly updatedAt: string;
	/** Added line count. */
	readonly additions: number;
	/** Removed line count. */
	readonly deletions: number;
}

/** Pull request details, including mergeability and change statistics. */
export interface PullRequest extends PullRequestSummary {
	/** Whether the PR was merged. */
	readonly merged: boolean;
	/** Git mergeability, or null while GitHub is still calculating it. */
	readonly mergeable: boolean | null;
	/** Rebase feasibility, omitted or null while unavailable. */
	readonly rebaseable?: boolean | null;
	/** Merge status reported by GitHub, independent of the caller's permission to merge. */
	readonly mergeable_state: string;
	/** Whether maintainers can modify the source branch. */
	readonly maintainer_can_modify: boolean;
	/** Actor that merged the PR, or null. */
	readonly merged_by: Account | null;
	/** Number of commits reported by the server. */
	readonly commits: number;
	/** Number of changed files. */
	readonly changed_files: number;
	/** Added line count. */
	readonly additions: number;
	/** Removed line count. */
	readonly deletions: number;
	/** Top-level conversation comment count. */
	readonly comments: number;
	/** Inline review comment count. */
	readonly review_comments: number;
	/** Auto-merge configuration, or null when not enabled. */
	readonly auto_merge: {
		/** Actor who enabled auto-merge, or null when unavailable. */
		readonly enabled_by: Account | null;
		/** REST merge-method name. */
		readonly merge_method: MergeMethod;
		/** Requested merge commit title, or null when GitHub selects the default. */
		readonly commit_title: string | null;
		/** Requested merge commit message, or null when GitHub selects the default. */
		readonly commit_message: string | null;
	} | null;
}

/** PR-list filters, including head/base branch matching. */
export type ListPullRequestsOptions = ApiPaginationOptions<PageOptions & {
	/** State filter. */
	readonly state?: 'open' | 'closed' | 'all';
	/** Owner-qualified source branch, such as owner:feature. */
	readonly head?: string;
	/** Target branch name. */
	readonly base?: string;
	/** Ordering field. */
	readonly sort?: 'created' | 'updated' | 'popularity' | 'long-running';
	/** Ordering direction. */
	readonly direction?: 'asc' | 'desc';
}>;

/** A new PR, either with new text or converted from an existing issue. */
export type CreatePullRequestRequest = {
	/** Source branch, optionally owner-qualified for a cross-repository PR. */
	readonly head: string;
	/** Source repository name when required for same-organization cross-repository PRs. */
	readonly head_repo?: string;
	/** Target branch. */
	readonly base: string;
	/** Whether maintainers may modify the source branch. */
	readonly maintainer_can_modify?: boolean;
	/** Whether to create the PR as a draft. */
	readonly draft?: boolean;
} & ({
	/** New PR title. */
	readonly title: string;
	/** Markdown body. */
	readonly body?: string;
	/** Issue conversion is mutually exclusive with new PR text. */
	readonly issue?: never;
} | {
	/** Existing repository issue number to convert into a PR. */
	readonly issue: number;
	/** Title is inherited from the issue. */
	readonly title?: never;
	/** Optional Markdown body supplied with issue conversion. */
	readonly body?: string;
});

/** Partial update of an existing PR; draft transitions use GraphQL operations instead. */
export interface UpdatePullRequestRequest {
	/** Replacement title. */
	readonly title?: string;
	/** Replacement Markdown body. */
	readonly body?: string;
	/** Requested open or closed state. */
	readonly state?: 'open' | 'closed';
	/** New target branch. */
	readonly base?: string;
	/** Whether maintainers may modify the source branch. */
	readonly maintainer_can_modify?: boolean;
}

/** Options for merging a pull request. */
export interface MergePullRequestRequest {
	/** Expected head SHA; the server rejects a changed head when supplied. */
	readonly sha?: string;
	/** Requested merge method. */
	readonly merge_method?: MergeMethod;
	/** Merge commit title. */
	readonly commit_title?: string;
	/** Merge commit body. */
	readonly commit_message?: string;
}

/** Result of a pull request merge attempt. */
export interface MergeResult {
	/** Resulting commit SHA. */
	readonly sha: string;
	/** Whether the server reports a completed merge. */
	readonly merged: boolean;
	/** Server explanation. */
	readonly message: string;
}

/** Branch-update acceptance, not confirmation that the update has finished. */
export interface UpdateBranchResult {
	/** Server explanation. */
	readonly message: string;
	/** URL for the updated PR resource. */
	readonly url: string;
}

/** Pull request draft state after a draft-state change. */
export interface DraftState extends NodeIdentity {
	/** Draft state returned by the mutation. */
	readonly isDraft: boolean;
}

/** Options for enabling auto-merge on a pull request. */
export interface EnableAutoMergeRequest {
	/** Public GraphQL merge-method name. */
	readonly mergeMethod?: GraphQLMergeMethod;
	/** Requested merge commit title. */
	readonly commitHeadline?: string;
	/** Requested merge commit body. */
	readonly commitBody?: string;
	/** Author email accepted by the server for the merge. */
	readonly authorEmail?: string;
	/** Expected head OID, preventing enabling auto-merge on an unexpectedly changed head. */
	readonly expectedHeadOid?: string;
}

/** Auto-merge state, including whether the pull request has already merged. */
export interface AutoMergeState extends NodeIdentity {
	/** Whether the PR is already merged. */
	readonly merged: boolean;
	/** Active auto-merge request, or null when disabled or completed. */
	readonly autoMergeRequest: {
		/** GraphQL merge-method name. */
		readonly mergeMethod: GraphQLMergeMethod;
	} | null;
}

/** Options for adding a pull request to the merge queue. */
export interface EnqueuePullRequestRequest {
	/** Expected head OID checked by the server. */
	readonly expectedHeadOid?: string;
	/** Whether to request insertion at the front, subject to server permissions. */
	readonly jump?: boolean;
}

/** Request options for updating a pull request branch. */
export interface UpdateBranchOptions extends ApiRequestOptions {
	/** Expected head SHA checked by the server. */
	readonly expectedHeadSha?: string;
}


/** Operations for pull requests, diffs, merges, auto-merge, and merge queues. */
export interface IPullRequestsClient {

	/** GET /repos/{owner}/{repo}/pulls: return one page of PR summaries. */
	list(repository: RepositoryRef, signal: AbortSignal, options?: ListPullRequestsOptions): Promise<readonly PullRequestSummary[]>;

	/** GraphQL: list open PRs by descending update time, defaulting to 100 per page; null means the repository was not returned. */
	listConnection(repository: RepositoryRef, signal: AbortSignal, options?: ApiPaginationOptions<CursorOptions>): Promise<Connection<PullRequestListItem> | null>;

	/** GET /repos/{owner}/{repo}/pulls/{number}: return detail metadata, including nullable mergeability. */
	get(repository: RepositoryRef, pullNumber: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<PullRequest>;

	/** POST /repos/{owner}/{repo}/pulls: create a PR or convert an issue. */
	create(repository: RepositoryRef, request: CreatePullRequestRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<PullRequest>;

	/** PATCH /repos/{owner}/{repo}/pulls/{number}: update supplied fields. */
	update(repository: RepositoryRef, pullNumber: number, request: UpdatePullRequestRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<PullRequest>;

	/** GET /repos/{owner}/{repo}/commits/{ref}/pulls: list one page of PRs associated with a commit. */
	listForCommit(repository: RepositoryRef, commitRef: string, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly PullRequestSummary[]>;

	/** GET /repos/{owner}/{repo}/pulls/{number}/files: return one page; GitHub caps the complete listing at 3,000 files. */
	listFiles(repository: RepositoryRef, pullNumber: number, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly ChangedFile[]>;

	/** GET /repos/{owner}/{repo}/pulls/{number}/commits: return one page; this endpoint exposes at most 250 commits. */
	listCommits(repository: RepositoryRef, pullNumber: number, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly Commit[]>;

	/** GET /repos/{owner}/{repo}/pulls/{number}: read the pull request's diff or patch text. */
	getDiff(repository: RepositoryRef, pullNumber: number, format: 'diff' | 'patch', signal: AbortSignal, options?: ApiRequestOptions): Promise<string>;

	/** PUT /repos/{owner}/{repo}/pulls/{number}/merge: submit a single merge attempt. */
	merge(repository: RepositoryRef, pullNumber: number, request: MergePullRequestRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<MergeResult>;

	/** PUT /repos/{owner}/{repo}/pulls/{number}/update-branch: request a branch update; acceptance does not imply completion. */
	updateBranch(repository: RepositoryRef, pullNumber: number, signal: AbortSignal, options?: UpdateBranchOptions): Promise<UpdateBranchResult>;

	/** GraphQL markPullRequestReadyForReview: mark a pull request as ready for review using its node ID. */
	markReadyForReview(pullRequestId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<DraftState>;

	/** GraphQL convertPullRequestToDraft: convert a pull request to a draft using its node ID. */
	convertToDraft(pullRequestId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<DraftState>;

	/** GraphQL enablePullRequestAutoMerge: enable auto-merge and return the updated state. */
	enableAutoMerge(pullRequestId: string, request: EnableAutoMergeRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<AutoMergeState>;

	/** GraphQL disablePullRequestAutoMerge: disable auto-merge and return the updated state. */
	disableAutoMerge(pullRequestId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<AutoMergeState>;

	/** GraphQL enqueuePullRequest: add a pull request to the merge queue and return its queue entry ID. */
	enqueue(pullRequestId: string, request: EnqueuePullRequestRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<NodeIdentity>;

	/** GraphQL dequeuePullRequest: remove a pull request from the merge queue. */
	dequeue(pullRequestId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<NodeIdentity>;
}
