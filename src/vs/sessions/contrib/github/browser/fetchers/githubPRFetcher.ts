/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	GitHubPullRequestState,
	IGitHubPRComment,
	IGitHubPRReviewThread,
	IGitHubPullRequest,
	IGitHubPullRequestMergeability,
	IGitHubUser,
	IMergeBlocker,
	MergeBlockerKind,
} from '../../common/types.js';
import { GitHubApiClient } from '../githubApiClient.js';

//#region GitHub API response types

interface IGitHubPRResponse {
	readonly number: number;
	readonly title: string;
	readonly body: string | null;
	readonly state: 'open' | 'closed';
	readonly draft: boolean;
	readonly user: { readonly login: string; readonly avatar_url: string };
	readonly head: { readonly ref: string };
	readonly base: { readonly ref: string };
	readonly created_at: string;
	readonly updated_at: string;
	readonly merged_at: string | null;
	readonly mergeable: boolean | null;
	readonly mergeable_state: string;
	readonly merged: boolean;
}

interface IGitHubReviewResponse {
	readonly id: number;
	readonly user: { readonly login: string; readonly avatar_url: string };
	readonly state: string;
	readonly submitted_at: string;
}

interface IGitHubReviewCommentResponse {
	readonly id: number;
	readonly body: string;
	readonly user: { readonly login: string; readonly avatar_url: string };
	readonly created_at: string;
	readonly updated_at: string;
	readonly path: string;
	readonly line: number | null;
	readonly original_line: number | null;
	readonly in_reply_to_id?: number;
}

interface IGitHubIssueCommentResponse {
	readonly id: number;
	readonly body: string | null;
	readonly user: { readonly login: string; readonly avatar_url: string };
	readonly created_at: string;
	readonly updated_at: string;
}

interface IGitHubGraphQLPullRequestReviewThreadsResponse {
	readonly repository: {
		readonly pullRequest: {
			readonly reviewThreads: {
				readonly nodes: readonly IGitHubGraphQLReviewThreadNode[];
			};
		} | null;
	} | null;
}

interface IGitHubGraphQLReviewThreadNode {
	readonly id: string;
	readonly isResolved: boolean;
	readonly path: string;
	readonly line: number | null;
	readonly comments: {
		readonly nodes: readonly IGitHubGraphQLReviewCommentNode[];
	};
}

interface IGitHubGraphQLReviewCommentNode {
	readonly databaseId: number | null;
	readonly body: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly path: string | null;
	readonly line: number | null;
	readonly originalLine: number | null;
	readonly replyTo: { readonly databaseId: number | null } | null;
	readonly author: { readonly login: string; readonly avatarUrl: string } | null;
}

interface IGitHubGraphQLResolveReviewThreadResponse {
	readonly resolveReviewThread: {
		readonly thread: {
			readonly isResolved: boolean;
		} | null;
	} | null;
}

//#endregion

const GET_REVIEW_THREADS_QUERY = [
	'query GetReviewThreads($owner: String!, $repo: String!, $prNumber: Int!) {',
	'  repository(owner: $owner, name: $repo) {',
	'    pullRequest(number: $prNumber) {',
	'      reviewThreads(first: 100) {',
	'        nodes {',
	'          id',
	'          isResolved',
	'          path',
	'          line',
	'          comments(first: 100) {',
	'            nodes {',
	'              databaseId',
	'              body',
	'              createdAt',
	'              updatedAt',
	'              path',
	'              line',
	'              originalLine',
	'              replyTo {',
	'                databaseId',
	'              }',
	'              author {',
	'                login',
	'                avatarUrl',
	'              }',
	'            }',
	'          }',
	'        }',
	'      }',
	'    }',
	'  }',
	'}',
].join('\n');

const RESOLVE_REVIEW_THREAD_MUTATION = [
	'mutation ResolveReviewThread($threadId: ID!) {',
	'  resolveReviewThread(input: { threadId: $threadId }) {',
	'    thread {',
	'      isResolved',
	'    }',
	'  }',
	'}',
].join('\n');

/**
 * Stateless fetcher for GitHub pull request data.
 * Handles all PR-related REST API calls including reviews, comments, and mergeability.
 */
export class GitHubPRFetcher {

	constructor(
		private readonly _apiClient: GitHubApiClient,
	) { }

	async getPullRequest(owner: string, repo: string, prNumber: number): Promise<IGitHubPullRequest> {
		const data = await this._apiClient.request<IGitHubPRResponse>(
			'GET',
			`/repos/${e(owner)}/${e(repo)}/pulls/${prNumber}`,
			'githubApi.getPullRequest'
		);
		return mapPullRequest(data);
	}

	async getMergeability(owner: string, repo: string, prNumber: number): Promise<IGitHubPullRequestMergeability> {
		const [pr, reviews] = await Promise.all([
			this._apiClient.request<IGitHubPRResponse>('GET', `/repos/${e(owner)}/${e(repo)}/pulls/${prNumber}`, 'githubApi.getMergeability.pr'),
			this._apiClient.request<readonly IGitHubReviewResponse[]>('GET', `/repos/${e(owner)}/${e(repo)}/pulls/${prNumber}/reviews`, 'githubApi.getMergeability.reviews'),
		]);

		const blockers: IMergeBlocker[] = [];

		// Draft
		if (pr.draft) {
			blockers.push({ kind: MergeBlockerKind.Draft, description: 'Pull request is a draft' });
		}

		// Merge conflicts
		if (pr.mergeable === false) {
			blockers.push({ kind: MergeBlockerKind.Conflicts, description: 'Pull request has merge conflicts' });
		}

		// Changes requested — check most recent review per reviewer
		const latestReviewByUser = new Map<string, string>();
		for (const review of reviews) {
			if (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED' || review.state === 'DISMISSED') {
				latestReviewByUser.set(review.user.login, review.state);
			}
		}
		const hasChangesRequested = [...latestReviewByUser.values()].some(s => s === 'CHANGES_REQUESTED');
		if (hasChangesRequested) {
			blockers.push({ kind: MergeBlockerKind.ChangesRequested, description: 'Changes have been requested' });
		}

		// Approval needed — check mergeable_state
		if (pr.mergeable_state === 'blocked') {
			const hasApproval = [...latestReviewByUser.values()].some(s => s === 'APPROVED');
			if (!hasApproval) {
				blockers.push({ kind: MergeBlockerKind.ApprovalNeeded, description: 'Approval is required' });
			}
		}

		// CI failures — mergeable_state 'unstable' indicates check failures
		if (pr.mergeable_state === 'unstable') {
			blockers.push({ kind: MergeBlockerKind.CIFailed, description: 'CI checks have failed' });
		}

		return {
			canMerge: blockers.length === 0 && pr.mergeable !== false && pr.state === 'open',
			blockers,
		};
	}

	async getReviewThreads(owner: string, repo: string, prNumber: number): Promise<IGitHubPRReviewThread[]> {
		const data = await this._apiClient.graphql<IGitHubGraphQLPullRequestReviewThreadsResponse>(
			GET_REVIEW_THREADS_QUERY,
			'githubApi.getReviewThreads',
			{ owner, repo, prNumber },
		);

		const reviewThreads = data.repository?.pullRequest?.reviewThreads.nodes;
		if (!reviewThreads) {
			throw new Error(`Pull request not found: ${owner}/${repo}#${prNumber}`);
		}

		return reviewThreads.map(mapReviewThread);
	}

	async postReviewComment(
		owner: string,
		repo: string,
		prNumber: number,
		body: string,
		inReplyTo: number,
	): Promise<IGitHubPRComment> {
		const data = await this._apiClient.request<IGitHubReviewCommentResponse>(
			'POST',
			`/repos/${e(owner)}/${e(repo)}/pulls/${prNumber}/comments`,
			'githubApi.postReviewComment',
			{ body, in_reply_to: inReplyTo },
		);
		return mapReviewComment(data);
	}

	async postIssueComment(
		owner: string,
		repo: string,
		prNumber: number,
		body: string,
	): Promise<IGitHubPRComment> {
		const data = await this._apiClient.request<IGitHubIssueCommentResponse>(
			'POST',
			`/repos/${e(owner)}/${e(repo)}/issues/${prNumber}/comments`,
			'githubApi.postIssueComment',
			{ body },
		);
		return {
			id: data.id,
			body: data.body ?? '',
			author: mapUser(data.user),
			createdAt: data.created_at,
			updatedAt: data.updated_at,
			path: undefined,
			line: undefined,
			threadId: String(data.id),
			inReplyToId: undefined,
		};
	}

	async resolveThread(_owner: string, _repo: string, threadId: string): Promise<void> {
		const data = await this._apiClient.graphql<IGitHubGraphQLResolveReviewThreadResponse>(
			RESOLVE_REVIEW_THREAD_MUTATION,
			'githubApi.resolveThread',
			{ threadId },
		);

		if (!data.resolveReviewThread?.thread?.isResolved) {
			throw new Error(`Failed to resolve review thread ${threadId}`);
		}
	}
}

//#region Helpers

function e(value: string): string {
	return encodeURIComponent(value);
}

function mapUser(user: { readonly login: string; readonly avatar_url: string }): IGitHubUser {
	return { login: user.login, avatarUrl: user.avatar_url };
}

function mapPullRequest(data: IGitHubPRResponse): IGitHubPullRequest {
	let state: GitHubPullRequestState;
	if (data.merged) {
		state = GitHubPullRequestState.Merged;
	} else if (data.state === 'closed') {
		state = GitHubPullRequestState.Closed;
	} else {
		state = GitHubPullRequestState.Open;
	}

	return {
		number: data.number,
		title: data.title,
		body: data.body ?? '',
		state,
		author: mapUser(data.user),
		headRef: data.head.ref,
		baseRef: data.base.ref,
		isDraft: data.draft,
		createdAt: data.created_at,
		updatedAt: data.updated_at,
		mergedAt: data.merged_at ?? undefined,
		mergeable: data.mergeable ?? undefined,
		mergeableState: data.mergeable_state,
	};
}

function mapReviewComment(data: IGitHubReviewCommentResponse): IGitHubPRComment {
	return {
		id: data.id,
		body: data.body,
		author: mapUser(data.user),
		createdAt: data.created_at,
		updatedAt: data.updated_at,
		path: data.path,
		line: data.line ?? data.original_line ?? undefined,
		threadId: String(data.in_reply_to_id ?? data.id),
		inReplyToId: data.in_reply_to_id,
	};
}

function mapReviewThread(thread: IGitHubGraphQLReviewThreadNode): IGitHubPRReviewThread {
	return {
		id: thread.id,
		isResolved: thread.isResolved,
		path: thread.path,
		line: thread.line ?? undefined,
		comments: thread.comments.nodes.flatMap(comment => mapGraphQLReviewComment(comment, thread)),
	};
}

function mapGraphQLReviewComment(comment: IGitHubGraphQLReviewCommentNode, thread: IGitHubGraphQLReviewThreadNode): readonly IGitHubPRComment[] {
	if (comment.databaseId === null || comment.author === null) {
		return [];
	}

	return [{
		id: comment.databaseId,
		body: comment.body,
		author: { login: comment.author.login, avatarUrl: comment.author.avatarUrl },
		createdAt: comment.createdAt,
		updatedAt: comment.updatedAt,
		path: comment.path ?? thread.path,
		line: comment.line ?? comment.originalLine ?? thread.line ?? undefined,
		threadId: thread.id,
		inReplyToId: comment.replyTo?.databaseId ?? undefined,
	}];
}

//#endregion
