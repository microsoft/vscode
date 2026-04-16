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

type IGitHubGraphQLPullRequestState = 'OPEN' | 'CLOSED' | 'MERGED';
type IGitHubGraphQLMergeable = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
type IGitHubGraphQLMergeStateStatus = 'BEHIND' | 'BLOCKED' | 'CLEAN' | 'DIRTY' | 'DRAFT' | 'HAS_HOOKS' | 'UNKNOWN' | 'UNSTABLE';
type IGitHubGraphQLReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'DISMISSED' | 'COMMENTED' | 'PENDING';

interface IGitHubGraphQLPullRequestResponse {
	readonly repository: {
		readonly pullRequest: IGitHubGraphQLPullRequestNode | null;
	} | null;
}

interface IGitHubGraphQLPullRequestNode {
	readonly number: number;
	readonly title: string;
	readonly body: string;
	readonly state: IGitHubGraphQLPullRequestState;
	readonly isDraft: boolean;
	readonly author: { readonly login: string; readonly avatarUrl: string } | null;
	readonly headRefName: string;
	readonly headRefOid: string;
	readonly baseRefName: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly mergedAt: string | null;
	readonly mergeable: IGitHubGraphQLMergeable;
	readonly mergeStateStatus: IGitHubGraphQLMergeStateStatus;
	readonly reviews: {
		readonly nodes: readonly {
			readonly state: IGitHubGraphQLReviewState;
			readonly submittedAt: string | null;
			readonly author: { readonly login: string } | null;
		}[];
	};
	readonly reviewThreads: {
		readonly nodes: readonly IGitHubGraphQLReviewThreadNode[];
	};
}

interface IGitHubIssueCommentResponse {
	readonly id: number;
	readonly body: string | null;
	readonly user: { readonly login: string; readonly avatar_url: string };
	readonly created_at: string;
	readonly updated_at: string;
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

const GET_PULL_REQUEST_QUERY = [
	'query GetPullRequestSnapshot($owner: String!, $repo: String!, $prNumber: Int!) {',
	'  repository(owner: $owner, name: $repo) {',
	'    pullRequest(number: $prNumber) {',
	'      number',
	'      title',
	'      body',
	'      state',
	'      isDraft',
	'      author {',
	'        login',
	'        avatarUrl',
	'      }',
	'      headRefName',
	'      headRefOid',
	'      baseRefName',
	'      createdAt',
	'      updatedAt',
	'      mergedAt',
	'      mergeable',
	'      mergeStateStatus',
	'      reviews(first: 100) {',
	'        nodes {',
	'          state',
	'          submittedAt',
	'          author {',
	'            login',
	'          }',
	'        }',
	'      }',
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

	async getPullRequest(owner: string, repo: string, prNumber: number): Promise<{
		readonly pullRequest: IGitHubPullRequest;
		readonly mergeability: IGitHubPullRequestMergeability;
		readonly reviewThreads: readonly IGitHubPRReviewThread[];
	}> {
		const data = await this._apiClient.graphql<IGitHubGraphQLPullRequestResponse>(
			GET_PULL_REQUEST_QUERY,
			'githubApi.getPullRequest',
			{ owner, repo, prNumber },
		);

		const pr = data.repository?.pullRequest;
		if (!pr) {
			throw new Error(`Pull request not found: ${owner}/${repo}#${prNumber}`);
		}

		return {
			pullRequest: mapPullRequestFromGraphQL(pr),
			mergeability: mapMergeabilityFromGraphQL(pr),
			reviewThreads: pr.reviewThreads.nodes.map(mapReviewThread),
		};
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

function mapPullRequestFromGraphQL(data: IGitHubGraphQLPullRequestNode): IGitHubPullRequest {
	let state: GitHubPullRequestState;
	if (data.state === 'MERGED') {
		state = GitHubPullRequestState.Merged;
	} else if (data.state === 'CLOSED') {
		state = GitHubPullRequestState.Closed;
	} else {
		state = GitHubPullRequestState.Open;
	}

	const author = data.author ?? { login: 'ghost', avatarUrl: '' };

	return {
		number: data.number,
		title: data.title,
		body: data.body,
		state,
		author,
		headRef: data.headRefName,
		headSha: data.headRefOid,
		baseRef: data.baseRefName,
		isDraft: data.isDraft,
		createdAt: data.createdAt,
		updatedAt: data.updatedAt,
		mergedAt: data.mergedAt ?? undefined,
		mergeable: data.mergeable === 'UNKNOWN' ? undefined : data.mergeable === 'MERGEABLE',
		mergeableState: data.mergeStateStatus.toLowerCase(),
	};
}

function mapMergeabilityFromGraphQL(pr: IGitHubGraphQLPullRequestNode): IGitHubPullRequestMergeability {
	const blockers: IMergeBlocker[] = [];

	if (pr.isDraft) {
		blockers.push({ kind: MergeBlockerKind.Draft, description: 'Pull request is a draft' });
	}

	if (pr.mergeable === 'CONFLICTING') {
		blockers.push({ kind: MergeBlockerKind.Conflicts, description: 'Pull request has merge conflicts' });
	}

	const latestReviewByUser = new Map<string, { readonly state: IGitHubGraphQLReviewState; readonly submittedAt: number }>();
	for (const review of pr.reviews.nodes) {
		if (!review.author) {
			continue;
		}

		if (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED' || review.state === 'DISMISSED') {
			const submittedAt = review.submittedAt ? Date.parse(review.submittedAt) : Number.NEGATIVE_INFINITY;
			const login = review.author.login;
			const previous = latestReviewByUser.get(login);
			if (!previous || submittedAt >= previous.submittedAt) {
				latestReviewByUser.set(login, { state: review.state, submittedAt });
			}
		}
	}

	const hasChangesRequested = [...latestReviewByUser.values()].some(review => review.state === 'CHANGES_REQUESTED');
	if (hasChangesRequested) {
		blockers.push({ kind: MergeBlockerKind.ChangesRequested, description: 'Changes have been requested' });
	}

	if (pr.mergeStateStatus === 'BLOCKED') {
		const hasApproval = [...latestReviewByUser.values()].some(review => review.state === 'APPROVED');
		if (!hasApproval) {
			blockers.push({ kind: MergeBlockerKind.ApprovalNeeded, description: 'Approval is required' });
		}
	}

	if (pr.mergeStateStatus === 'UNSTABLE') {
		blockers.push({ kind: MergeBlockerKind.CIFailed, description: 'CI checks have failed' });
	}

	return {
		canMerge: blockers.length === 0 && pr.mergeable !== 'CONFLICTING' && pr.state === 'OPEN',
		blockers,
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
