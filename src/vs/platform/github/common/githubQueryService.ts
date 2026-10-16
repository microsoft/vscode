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
}

export interface GitHubIssueSubscription extends IDisposable {
	readonly resource: GitHubIssueResource;
	update(options: GitHubResourceSubscriptionOptions): void;
	refresh(token?: CancellationToken): Promise<void>;
}

export interface GitHubCommitSubscription extends IDisposable {
	readonly resource: GitHubCommitResource;
	refresh(token?: CancellationToken): Promise<void>;
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
	listRepositories(account: AccountHandle, signal: AbortSignal, options?: GitHubRepositoryListOptions): Promise<GitHubRepositoriesPage>;
	searchRepositories(account: AccountHandle, query: string, signal: AbortSignal, options?: GitHubRepositorySearchOptions): Promise<GitHubRepositorySearchPage>;
	getIssueOrPullRequest(ref: GitHubIssueRef, signal: AbortSignal): Promise<GitHubIssueOrPullRequest>;
	getRepositoryMergeCapabilities(ref: GitHubRepositoryRef, signal: AbortSignal): Promise<GitHubRepositoryMergeCapabilities>;
	findPullRequestByHeadBranch(ref: GitHubRepositoryRef, branch: string, headOwner: string | undefined, signal: AbortSignal, options?: GitHubPullRequestLookupOptions): Promise<GitHubPullRequestLookup | undefined>;
	findPullRequestByHeadSha(ref: GitHubRepositoryRef, sha: string, signal: AbortSignal, options?: GitHubPullRequestLookupOptions): Promise<GitHubPullRequestLookup | undefined>;
}
