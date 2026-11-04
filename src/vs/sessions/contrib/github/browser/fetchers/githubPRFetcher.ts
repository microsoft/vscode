/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isDefined } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { IGitHubAccountClient } from '../../../../../platform/github/common/account/account.js';
import { RepositoryRef } from '../../../../../platform/github/common/client/types.js';
import { Account } from '../../../../../platform/github/common/core/core.js';
import { ApiRequestOptions } from '../../../../../platform/github/common/client/request.js';
import { PullRequest } from '../../../../../platform/github/common/core/pullRequests.js';
import { Review, ReviewComment, ReviewThread, ThreadComment } from '../../../../../platform/github/common/core/reviews.js';
import { GitHubRequestError } from '../../../../../platform/github/common/githubTypes.js';
import {
	GitHubPullRequestState,
	IGitHubChangedFile,
	IGitHubPRComment,
	IGitHubPullRequest,
	IGitHubPullRequestChanges,
	IGitHubPullRequestMergeability,
	IGitHubPullRequestReview,
	IGitHubPullRequestReviewThread,
	IGitHubUser, IMergeBlocker, MergeBlockerKind,
} from '../../common/types.js';
import { GitHubApiClient } from '../githubApiClient.js';

export class GitHubPRFetcher {
	constructor(readonly client: GitHubApiClient) { }

	getPullRequest(owner: string, repo: string, prNumber: number, token?: CancellationToken, options?: ApiRequestOptions): Promise<IGitHubPullRequest> {
		return this.client.withClient(async (client, signal) =>
			mapPullRequest(await client.pullRequests.get({ owner, repo }, prNumber, signal, options)), token);
	}

	getReviews(owner: string, repo: string, prNumber: number, token?: CancellationToken, options?: ApiRequestOptions): Promise<readonly IGitHubPullRequestReview[]> {
		return this.client.withClient(async (client, signal) => {
			const reviews = await client.reviews.list({ owner, repo }, prNumber, signal, {
				...options,
				query: { page: 1, per_page: 100 },
				maxPages: 100,
			});
			return reviews.map(mapReview);
		}, token);
	}

	getChangedFiles(owner: string, repo: string, prNumber: number): Promise<readonly IGitHubChangedFile[]> {
		return this.client.withClient((client, signal) => listChangedFiles(client, { owner, repo }, prNumber, signal));
	}

	getChanges(owner: string, repo: string, prNumber: number): Promise<IGitHubPullRequestChanges> {
		return this.client.withClient(async (client, signal) => {
			const repository = { owner, repo };
			const pullRequest = await client.pullRequests.get(repository, prNumber, signal, { noCache: true });
			// Pull request files are diffed against the merge base, not the base branch tip.
			const [comparison, files] = await Promise.all([
				client.repositories.compare(repository, pullRequest.base.sha, pullRequest.head.sha, signal, { query: { per_page: 1 } }),
				listChangedFiles(client, repository, prNumber, signal, { noCache: true }),
			]);
			// The file list is mutable, even though the comparison uses immutable SHAs.
			const current = await client.pullRequests.get(repository, prNumber, signal, { noCache: true });
			if (current.head.sha !== pullRequest.head.sha || current.base.sha !== pullRequest.base.sha || current.base.ref !== pullRequest.base.ref) {
				throw new Error(localize('pullRequestChanges.changedDuringLoad', "Pull request #{0} changed while loading its files. Please try again.", prNumber));
			}
			return { title: current.title, baseRef: pullRequest.base.ref, baseSha: comparison.merge_base_commit.sha, headSha: pullRequest.head.sha, totalFileCount: pullRequest.changed_files, files };
		});
	}

	getReviewThreads(owner: string, repo: string, prNumber: number, token?: CancellationToken, options?: ApiRequestOptions): Promise<IGitHubPullRequestReviewThread[]> {
		return this.client.withClient(async (client, signal) => {
			const pullRequest = await client.pullRequests.get({ owner, repo }, prNumber, signal, options);
			const threads = await client.reviews.listThreads(pullRequest.node_id, signal, {
				...options,
				query: { first: 100, commentsFirst: 100 },
				maxPages: 100,
			});
			if (!threads) {
				throw new GitHubRequestError('GitHub resource was not returned', 'notFound');
			}
			const result: IGitHubPullRequestReviewThread[] = [];
			for (const thread of (threads.nodes ?? []).filter(isDefined)) {
				const comments = (thread.comments.nodes ?? []).filter(isDefined);
				if (thread.comments.pageInfo.hasNextPage) {
					const after = thread.comments.pageInfo.endCursor;
					if (!after) {
						throw new GitHubRequestError('Invalid GitHub pagination cursor', 'malformedResponse');
					}
					const remaining = await client.reviews.listThreadComments(thread.id, signal, {
						...options,
						query: { first: 100, after },
						maxPages: 99, // The thread already includes the first page.
					});
					if (!remaining) {
						throw new GitHubRequestError('GitHub resource was not returned', 'notFound');
					}
					comments.push(...(remaining.nodes ?? []).filter(isDefined));
				}
				result.push({
					id: thread.id,
					isResolved: thread.isResolved,
					path: thread.path,
					startLine: thread.startLine ?? undefined,
					line: thread.line ?? undefined,
					comments: comments.map(comment => mapGraphQLReviewComment(comment, thread)).filter(isDefined),
				});
			}
			return result;
		}, token);
	}

	postReviewComment(owner: string, repo: string, prNumber: number, body: string, inReplyTo: number, token?: CancellationToken): Promise<IGitHubPRComment> {
		return this.client.withClient(async (client, signal) =>
			mapReviewComment(await client.reviews.replyToComment({ owner, repo }, prNumber, inReplyTo, body, signal)), token);
	}

	postPullRequestReviewComment(
		owner: string, repo: string, prNumber: number, body: string, commitId: string, path: string,
		line: number, startLine: number | undefined, pendingReview?: Pick<IGitHubPullRequestReview, 'id' | 'nodeId'>,
		token?: CancellationToken,
	): Promise<void> {
		return this.client.withClient(async (client, signal) => {
			if (pendingReview) {
				await client.reviews.createThread({
					pullRequestReviewId: pendingReview.nodeId, body, path, line, side: 'RIGHT',
					...(startLine !== undefined ? { startLine, startSide: 'RIGHT' } : {}),
				}, signal);
			} else {
				await client.reviews.create({ owner, repo }, prNumber, {
					commit_id: commitId,
					comments: [{
						body, path, line, side: 'RIGHT',
						...(startLine !== undefined ? { start_line: startLine, start_side: 'RIGHT' } : {}),
					}],
				}, signal);
			}
		}, token);
	}

	postIssueComment(owner: string, repo: string, prNumber: number, body: string, token?: CancellationToken): Promise<IGitHubPRComment> {
		return this.client.withClient(async (client, signal) => {
			const data = await client.issues.createComment({ owner, repo }, prNumber, body, signal);
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
		}, token);
	}

	resolveThread(_owner: string, _repo: string, threadId: string, token?: CancellationToken): Promise<void> {
		return this.client.withClient(async (client, signal) => {
			const thread = await client.reviews.resolveThread(threadId, signal);
			if (!thread.isResolved) {
				throw new GitHubRequestError(`Failed to resolve review thread ${threadId}`, 'malformedResponse');
			}
		}, token);
	}
}

/** Computes merge blockers from pull request metadata and its reviews. */
export function computeMergeability(pr: IGitHubPullRequest, reviews: readonly IGitHubPullRequestReview[]): IGitHubPullRequestMergeability {
	const blockers: IMergeBlocker[] = [];
	if (pr.isDraft) {
		blockers.push({ kind: MergeBlockerKind.Draft, description: 'Pull request is a draft' });
	}
	if (pr.mergeable === false) {
		blockers.push({ kind: MergeBlockerKind.Conflicts, description: 'Pull request has merge conflicts' });
	}
	const latestReviewByUser = new Map<string, string>();
	for (const review of reviews) {
		if (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED' || review.state === 'DISMISSED') {
			latestReviewByUser.set(review.author.login, review.state);
		}
	}
	const hasChangesRequested = [...latestReviewByUser.values()].some(s => s === 'CHANGES_REQUESTED');
	if (hasChangesRequested) {
		blockers.push({ kind: MergeBlockerKind.ChangesRequested, description: 'Changes have been requested' });
	}
	if (pr.mergeableState === 'blocked') {
		const hasApproval = [...latestReviewByUser.values()].some(s => s === 'APPROVED');
		if (!hasApproval) {
			blockers.push({ kind: MergeBlockerKind.ApprovalNeeded, description: 'Approval is required' });
		}
	}
	if (pr.mergeableState === 'unstable') {
		blockers.push({ kind: MergeBlockerKind.CIFailed, description: 'CI checks have failed' });
	}
	return {
		canMerge: blockers.length === 0 && pr.mergeable !== false && pr.state === GitHubPullRequestState.Open,
		blockers,
	};
}

function mapUser(user: Account | null): IGitHubUser {
	return {
		login: user?.login ?? 'ghost',
		avatarUrl: user?.avatar_url ?? ''
	};
}

async function listChangedFiles(client: IGitHubAccountClient, repository: RepositoryRef, prNumber: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<readonly IGitHubChangedFile[]> {
	const files = await client.pullRequests.listFiles(repository, prNumber, signal, {
		...options,
		query: { page: 1, per_page: 100 },
		maxPages: 100,
	});
	return files.map(file => ({
		filename: file.filename,
		previous_filename: file.previous_filename,
		status: file.status,
		additions: file.additions,
		deletions: file.deletions,
		patch: file.patch,
	}));
}

function mapPullRequest(data: PullRequest): IGitHubPullRequest {
	return {
		number: data.number,
		title: data.title,
		body: data.body ?? '',
		state: data.merged ? GitHubPullRequestState.Merged : data.state === 'closed' ? GitHubPullRequestState.Closed : GitHubPullRequestState.Open,
		author: mapUser(data.user),
		headRef: data.head.ref,
		headSha: data.head.sha,
		baseRef: data.base.ref,
		isDraft: data.draft ?? false,
		createdAt: data.created_at,
		updatedAt: data.updated_at,
		mergedAt: data.merged_at ?? undefined,
		...(data.closed_at ? { closedAt: data.closed_at } : {}),
		mergeable: data.mergeable ?? undefined,
		mergeableState: data.mergeable_state,
	};
}

function mapReview(data: Review): IGitHubPullRequestReview {
	return {
		id: data.id,
		nodeId: data.node_id,
		author: mapUser(data.user),
		state: data.state,
		submittedAt: data.submitted_at ?? undefined,
	};
}

function mapReviewComment(data: ReviewComment): IGitHubPRComment {
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

function mapGraphQLReviewComment(comment: ThreadComment, thread: ReviewThread): IGitHubPRComment | undefined {
	if (comment.databaseId === null || comment.author === null) {
		return undefined;
	}
	return {
		id: comment.databaseId,
		body: comment.body,
		author: {
			login: comment.author.login,
			avatarUrl: comment.author.avatarUrl
		},
		createdAt: comment.createdAt,
		updatedAt: comment.updatedAt,
		path: comment.path ?? thread.path,
		line: comment.line ?? comment.originalLine ?? thread.line ?? undefined,
		threadId: thread.id,
		inReplyToId: comment.replyTo?.databaseId ?? undefined,
	};
}
