/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { IObservable } from '../../../base/common/observable.js';
import { FragmentState, GitHubActor, PullRequestMergeMethod, PullRequestRef } from './githubPullRequestService.js';
import { AccountHandle } from './types.js';

export interface GitHubRepositoryRef extends AccountHandle {
	readonly owner: string;
	readonly repo: string;
}

export interface GitHubIssueRef extends GitHubRepositoryRef {
	readonly number: number;
}

export interface GitHubCommitRef extends GitHubRepositoryRef {
	readonly sha: string;
}

export type GitHubHydratableResourceRef =
	| { readonly kind: 'repository'; readonly ref: GitHubRepositoryRef }
	| { readonly kind: 'issue'; readonly ref: GitHubIssueRef };

export interface GitHubRepository {
	readonly id?: string;
	readonly owner: GitHubActor;
	readonly name: string;
	readonly nameWithOwner: string;
	readonly language?: string;
	readonly stars?: number;
	readonly defaultBranch: string;
	readonly private: boolean;
	readonly description: string;
	readonly url: string;
	readonly cloneUrl?: string;
	readonly sshUrl?: string;
	readonly archived: boolean;
	readonly fork: boolean;
}

export interface GitHubRepositoryPageOptions {
	readonly page?: number;
	readonly perPage?: number;
}

export interface GitHubRepositoryListOptions extends GitHubRepositoryPageOptions {
	readonly affiliation?: readonly ('owner' | 'collaborator' | 'organization_member')[];
	readonly sort?: 'created' | 'updated' | 'pushed' | 'full_name';
	readonly direction?: 'asc' | 'desc';
}

export interface GitHubRepositorySearchOptions extends GitHubRepositoryPageOptions {
	readonly sort?: 'stars' | 'forks' | 'help-wanted-issues' | 'updated';
	readonly direction?: 'asc' | 'desc';
}

export interface GitHubRepositoriesPage {
	readonly repositories: readonly GitHubRepository[];
	readonly nextPage?: number;
}

export interface GitHubRepositorySearchPage extends GitHubRepositoriesPage {
	readonly totalCount: number;
	readonly incompleteResults: boolean;
	/** Whether GitHub's 1,000-result ceiling prevents retrieving all matches. */
	readonly limitReached: boolean;
}

export interface GitHubRepositoryMergeCapabilities {
	readonly autoMergeAllowed: boolean;
	readonly mergeMethods: readonly PullRequestMergeMethod[];
}

export interface GitHubIssueOrPullRequest {
	readonly title: string;
	readonly body: string;
}

export type GitHubIssueState = 'open' | 'closed';
export type GitHubIssueStateReason = 'completed' | 'not_planned' | 'duplicate' | 'reopened';

export interface GitHubIssue {
	readonly id?: string;
	readonly number: number;
	readonly title: string;
	readonly body: string;
	readonly url: string;
	readonly state: GitHubIssueState;
	readonly stateReason?: GitHubIssueStateReason;
	readonly author: GitHubActor;
	readonly assignees: readonly GitHubActor[];
	readonly labels: readonly string[];
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly closedAt?: string;
}

export interface GitHubCommit {
	readonly sha: string;
	readonly message: string;
	readonly url: string;
	readonly author: GitHubActor;
	readonly committedAt: string;
}

export type GitHubResourcePriority = 'background' | 'visible' | 'interactive';

export interface GitHubResourceSubscriptionOptions {
	readonly priority: GitHubResourcePriority;
}

export interface GitHubRepositoryResource {
	readonly ref: GitHubRepositoryRef;
	readonly state: IObservable<FragmentState<GitHubRepository>>;
}

export interface GitHubIssueResource {
	readonly ref: GitHubIssueRef;
	readonly state: IObservable<FragmentState<GitHubIssue>>;
}

export interface GitHubCommitResource {
	readonly ref: GitHubCommitRef;
	readonly state: IObservable<FragmentState<GitHubCommit>>;
}

export interface GitHubRepositorySubscription extends IDisposable {
	readonly resource: GitHubRepositoryResource;
	update(options: GitHubResourceSubscriptionOptions): void;
	refresh(token?: CancellationToken): Promise<void>;
}

export interface GitHubIssueSubscription extends IDisposable {
	readonly resource: GitHubIssueResource;
	update(options: GitHubResourceSubscriptionOptions): void;
	refresh(token?: CancellationToken): Promise<void>;
}

export interface GitHubCommitSubscription extends IDisposable {
	readonly resource: GitHubCommitResource;
	update(options: GitHubResourceSubscriptionOptions): void;
	refresh(token?: CancellationToken): Promise<void>;
}

export type GitHubChangedFileStatus = 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';

export interface GitHubChangedFile {
	readonly filename: string;
	readonly previousFilename?: string;
	readonly status: GitHubChangedFileStatus;
	readonly additions: number;
	readonly deletions: number;
	readonly changes: number;
	readonly patch?: string;
	readonly blobUrl?: string;
}

export interface GitHubComparisonCommit {
	readonly sha: string;
	readonly message: string;
	readonly author?: GitHubActor;
	readonly committedAt?: string;
	readonly url?: string;
}

export interface GitHubComparison {
	readonly baseSha: string;
	readonly mergeBaseSha: string;
	readonly headSha?: string;
	readonly status: 'ahead' | 'behind' | 'diverged' | 'identical';
	readonly aheadBy: number;
	readonly behindBy: number;
	readonly totalCommits: number;
	readonly commits: readonly GitHubComparisonCommit[];
	readonly commitsComplete: boolean;
	readonly files: readonly GitHubChangedFile[];
	readonly filesComplete: boolean;
}

export interface GitHubPullRequestSummary {
	readonly number: number;
	readonly title: string;
	readonly author: GitHubActor;
	readonly headRef: string;
	readonly checkoutRef: string;
	readonly draft: boolean;
	readonly updatedAt: string;
	readonly additions: number;
	readonly deletions: number;
	readonly reviewRequestedFromViewer: boolean;
	readonly assignedToViewer: boolean;
}

export interface GitHubPullRequestsPage {
	readonly pullRequests: readonly GitHubPullRequestSummary[];
	readonly cursor?: string;
	readonly hasNextPage: boolean;
}

export interface GitHubPullRequestContextComment {
	readonly kind: 'issue' | 'review';
	readonly author: string;
	readonly body: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly path?: string;
	readonly line?: number;
}

export interface GitHubPullRequestContext {
	readonly ref: PullRequestRef;
	readonly url: string;
	readonly title: string;
	readonly description: string;
	readonly author: string;
	readonly draft: boolean;
	readonly baseRef: string;
	readonly branchName: string;
	readonly headRef: string;
	readonly updatedAt: string;
	readonly patch: string;
	readonly filesComplete: boolean;
	readonly comments: readonly GitHubPullRequestContextComment[];
	readonly commentsComplete: boolean;
}

export interface GitHubRecentIssue {
	readonly number: number;
	readonly title: string;
	readonly url: string;
	readonly updatedAt: string;
}

export interface GitHubRecentPullRequestReviewThread {
	readonly isResolved: boolean;
	readonly latestCommentAt?: string;
}

export interface GitHubRecentPullRequest {
	readonly number: number;
	readonly title: string;
	readonly url: string;
	readonly updatedAt: string;
	readonly statusCheckRollupState?: string;
	readonly latestCommitAt?: string;
	readonly reviewThreads?: readonly GitHubRecentPullRequestReviewThread[];
}

export interface GitHubPullRequestLookup {
	readonly ref: PullRequestRef;
	readonly id?: string;
	readonly url: string;
	readonly title?: string;
	readonly createdAt?: string;
	readonly state?: GitHubIssueState;
}

export interface GitHubPullRequestLookupOptions {
	/** Restricts selection to these URLs, preferring open candidates and then the supplied order. */
	readonly allowedPullRequestUrls?: readonly string[];
	readonly priority?: GitHubResourcePriority;
}

export interface GitHubQueryApi {
	subscribeRepository(ref: GitHubRepositoryRef, options: GitHubResourceSubscriptionOptions): GitHubRepositorySubscription;
	subscribeIssue(ref: GitHubIssueRef, options: GitHubResourceSubscriptionOptions): GitHubIssueSubscription;
	subscribeCommit(ref: GitHubCommitRef, options: GitHubResourceSubscriptionOptions): GitHubCommitSubscription;
	hydrateResources(refs: readonly GitHubHydratableResourceRef[], signal: AbortSignal): Promise<void>;
	getRepository(ref: GitHubRepositoryRef, signal: AbortSignal): Promise<GitHubRepository>;
	listRepositories(account: AccountHandle, signal: AbortSignal, options?: GitHubRepositoryListOptions): Promise<GitHubRepositoriesPage>;
	searchRepositories(account: AccountHandle, query: string, signal: AbortSignal, options?: GitHubRepositorySearchOptions): Promise<GitHubRepositorySearchPage>;
	compare(ref: GitHubRepositoryRef, base: string, head: string, signal: AbortSignal): Promise<GitHubComparison>;
	listPullRequests(ref: GitHubRepositoryRef, cursor: string | undefined, signal: AbortSignal): Promise<GitHubPullRequestsPage>;
	listPullRequestsWaitingForReview(ref: GitHubRepositoryRef, signal: AbortSignal): Promise<readonly GitHubPullRequestSummary[]>;
	listPullRequestsAssignedToViewer(ref: GitHubRepositoryRef, signal: AbortSignal): Promise<readonly GitHubPullRequestSummary[]>;
	getPullRequestContext(ref: PullRequestRef, signal: AbortSignal): Promise<GitHubPullRequestContext>;
	getIssueOrPullRequest(ref: GitHubIssueRef, signal: AbortSignal): Promise<GitHubIssueOrPullRequest>;
	getRepositoryMergeCapabilities(ref: GitHubRepositoryRef, signal: AbortSignal): Promise<GitHubRepositoryMergeCapabilities>;
	findPullRequestByHeadBranch(ref: GitHubRepositoryRef, branch: string, headOwner: string | undefined, signal: AbortSignal, options?: GitHubPullRequestLookupOptions): Promise<GitHubPullRequestLookup | undefined>;
	findPullRequestByHeadSha(ref: GitHubRepositoryRef, sha: string, signal: AbortSignal, options?: GitHubPullRequestLookupOptions): Promise<GitHubPullRequestLookup | undefined>;
	getRecentAssignedIssues(ref: GitHubRepositoryRef, signal: AbortSignal): Promise<readonly GitHubRecentIssue[]>;
	getRecentAuthoredPullRequests(ref: GitHubRepositoryRef, signal: AbortSignal): Promise<readonly GitHubRecentPullRequest[]>;
	getPullRequestReviewThreadSummary(ref: PullRequestRef, signal: AbortSignal): Promise<readonly GitHubRecentPullRequestReviewThread[]>;
	getIssuesWithLinkedPullRequests(ref: GitHubRepositoryRef, issueNumbers: readonly number[], signal: AbortSignal): Promise<readonly number[]>;
}
