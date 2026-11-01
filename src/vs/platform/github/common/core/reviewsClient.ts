/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mergeArrayPages } from '../client/pagination.js';
import { ApiPaginationOptions, ApiRequestOptions } from '../client/request.js';
import { numberSegment, repositoryPath, withQuery } from '../client/routing.js';
import { parse } from '../client/schema.js';
import { PageOptions, RepositoryRef } from '../client/types.js';
import { Connection, CursorOptions, NodeIdentity } from './core.js';
import { CoreClient, cursorVariables, parseAccount, parseActor, parseConnection, parseNodeIdentity, parseTeam } from './coreClient.js';
import { PullRequestSummary } from './pullRequests.js';
import { parsePullRequestSummary, pullRequestPath } from './pullRequestsClient.js';
import { ReplyToThreadOptions, CreateReviewCommentRequest, CreateReviewRequest, CreateReviewThreadRequest, FileViewedState, IReviewsClient, ListReviewThreadsOptions, RemoveReviewersRequest, RequestedReviewers, RequestReviewersRequest, Review, ReviewComment, ReviewThread, ReviewThreadSummary, SubmitReviewRequest, ThreadComment, ThreadResolution } from './reviews.js';

export class ReviewsClient implements IReviewsClient {
	constructor(private readonly _client: CoreClient) { }

	async list(repository: RepositoryRef, pullNumber: number, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly Review[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'reviews',
			method: 'GET',
			path: withQuery(`${pullRequestPath(repository, pullNumber)}/reviews`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseReviews, mergeArrayPages);
	}

	async get(repository: RepositoryRef, pullNumber: number, reviewId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<Review> {
		return this._client.request({
			domain: 'reviews',
			method: 'GET',
			path: reviewPath(repository, pullNumber, reviewId),
			authentication: 'optional',
			expectedStatus: 200,
			options
		}, signal, parseReview);
	}

	async create(repository: RepositoryRef, pullNumber: number, request: CreateReviewRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Review> {
		return this._client.request({
			domain: 'reviews',
			method: 'POST',
			path: `${pullRequestPath(repository, pullNumber)}/reviews`,
			body: request,
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parseReview);
	}

	async update(repository: RepositoryRef, pullNumber: number, reviewId: number, body: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<Review> {
		return this._client.request({
			domain: 'reviews',
			method: 'PUT',
			path: reviewPath(repository, pullNumber, reviewId),
			body: { body },
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parseReview);
	}

	async submit(repository: RepositoryRef, pullNumber: number, reviewId: number, request: SubmitReviewRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Review> {
		return this._client.request({
			domain: 'reviews',
			method: 'POST',
			path: `${reviewPath(repository, pullNumber, reviewId)}/events`,
			body: request,
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parseReview);
	}

	async deletePending(repository: RepositoryRef, pullNumber: number, reviewId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<Review> {
		return this._client.request({
			domain: 'reviews',
			method: 'DELETE',
			path: reviewPath(repository, pullNumber, reviewId),
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parseReview);
	}

	async dismiss(repository: RepositoryRef, pullNumber: number, reviewId: number, message: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<Review> {
		return this._client.request({
			domain: 'reviews',
			method: 'PUT',
			path: `${reviewPath(repository, pullNumber, reviewId)}/dismissals`,
			body: { message },
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parseReview);
	}

	async listComments(repository: RepositoryRef, pullNumber: number, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly ReviewComment[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'reviews',
			method: 'GET',
			path: withQuery(`${pullRequestPath(repository, pullNumber)}/comments`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseComments, mergeArrayPages);
	}

	async listCommentsForReview(repository: RepositoryRef, pullNumber: number, reviewId: number, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly ReviewComment[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'reviews',
			method: 'GET',
			path: withQuery(`${reviewPath(repository, pullNumber, reviewId)}/comments`, { ...query }),
			authentication: 'optional',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseComments, mergeArrayPages);
	}

	async createComment(repository: RepositoryRef, pullNumber: number, request: CreateReviewCommentRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<ReviewComment> {
		return this._client.request({
			domain: 'reviews',
			method: 'POST',
			path: `${pullRequestPath(repository, pullNumber)}/comments`,
			body: request,
			authentication: 'required',
			expectedStatus: 201,
			options
		}, signal, parseComment);
	}

	async replyToComment(repository: RepositoryRef, pullNumber: number, commentId: number, body: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<ReviewComment> {
		return this._client.request({
			domain: 'reviews',
			method: 'POST',
			path: `${pullRequestPath(repository, pullNumber)}/comments/${numberSegment(commentId)}/replies`,
			body: { body },
			authentication: 'required',
			expectedStatus: 201,
			options
		}, signal, parseComment);
	}

	async updateComment(repository: RepositoryRef, commentId: number, body: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<ReviewComment> {
		return this._client.request({
			domain: 'reviews',
			method: 'PATCH',
			path: commentPath(repository, commentId),
			body: { body },
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parseComment);
	}

	async deleteComment(repository: RepositoryRef, commentId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<void> {
		return this._client.request({
			domain: 'reviews',
			method: 'DELETE',
			path: commentPath(repository, commentId),
			authentication: 'required',
			expectedStatus: 204,
			responseBody: 'none',
			options
		}, signal);
	}

	async getRequestedReviewers(repository: RepositoryRef, pullNumber: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<RequestedReviewers> {
		return this._client.request({
			domain: 'reviews',
			method: 'GET',
			path: `${pullRequestPath(repository, pullNumber)}/requested_reviewers`,
			authentication: 'optional',
			expectedStatus: 200,
			options
		}, signal, parseRequestedReviewers);
	}

	async requestReviewers(repository: RepositoryRef, pullNumber: number, request: RequestReviewersRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<PullRequestSummary> {
		return this._client.request({
			domain: 'reviews',
			method: 'POST',
			path: `${pullRequestPath(repository, pullNumber)}/requested_reviewers`,
			body: request,
			authentication: 'required',
			expectedStatus: 201,
			options
		}, signal, parsePullRequestSummary);
	}

	async removeReviewers(repository: RepositoryRef, pullNumber: number, request: RemoveReviewersRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<PullRequestSummary> {
		return this._client.request({
			domain: 'reviews',
			method: 'DELETE',
			path: `${pullRequestPath(repository, pullNumber)}/requested_reviewers`,
			body: request,
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parsePullRequestSummary);
	}

	async listThreads(pullRequestId: string, signal: AbortSignal, options?: ListReviewThreadsOptions): Promise<Connection<ReviewThread> | null> {
		const { query = {}, ...requestOptions } = options ?? {};
		return this._client.graphqlPages(
			'reviews',
			listThreadsQuery,
			{
				pullRequestId,
				...cursorVariables(query),
				commentsFirst: cursorVariables({ first: query.commentsFirst }).first,
			},
			signal,
			data => parseThreadsQuery(data)?.node?.reviewThreads ?? null,
			requestOptions
		);
	}

	async listThreadSummaries(pullRequestId: string, signal: AbortSignal, options?: ApiPaginationOptions<CursorOptions>): Promise<Connection<ReviewThreadSummary> | null> {
		const { query = {}, ...requestOptions } = options ?? {};
		return this._client.graphqlPages(
			'reviews',
			listThreadSummariesQuery,
			{ pullRequestId, ...cursorVariables(query) },
			signal,
			data => parseThreadSummariesQuery(data)?.node?.reviewThreads ?? null,
			requestOptions
		);
	}

	async listThreadComments(threadId: string, signal: AbortSignal, options?: ApiPaginationOptions<CursorOptions>): Promise<Connection<ThreadComment> | null> {
		const { query = {}, ...requestOptions } = options ?? {};
		return this._client.graphqlPages(
			'reviews',
			listThreadCommentsQuery,
			{ threadId, ...cursorVariables(query) },
			signal,
			data => parseCommentsQuery(data)?.node?.comments ?? null,
			requestOptions
		);
	}

	async createThread(request: CreateReviewThreadRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<ReviewThread> {
		return this._client.graphql(
			'reviews',
			createThreadMutation,
			{ input: request },
			signal,
			data => parseThreadMutation(data).result.thread,
			options
		);
	}

	async replyToThread(threadId: string, body: string, signal: AbortSignal, options?: ReplyToThreadOptions): Promise<ThreadComment> {
		const { pullRequestReviewId, ...requestOptions } = options ?? {};
		return this._client.graphql(
			'reviews',
			replyToThreadMutation,
			{ input: { pullRequestReviewThreadId: threadId, body, pullRequestReviewId } },
			signal,
			data => parseReplyMutation(data).result.comment,
			requestOptions
		);
	}

	async resolveThread(threadId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<ThreadResolution> {
		return this._client.graphql(
			'reviews',
			resolveThreadMutation,
			{ input: { threadId } },
			signal,
			data => parseResolutionMutation(data).result.thread,
			options
		);
	}

	async unresolveThread(threadId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<ThreadResolution> {
		return this._client.graphql(
			'reviews',
			unresolveThreadMutation,
			{ input: { threadId } },
			signal,
			data => parseResolutionMutation(data).result.thread,
			options
		);
	}

	async listFileViewedStates(pullRequestId: string, signal: AbortSignal, options?: ApiPaginationOptions<CursorOptions>): Promise<Connection<FileViewedState> | null> {
		const { query: queryOptions = {}, ...requestOptions } = options ?? {};
		return this._client.graphqlPages(
			'reviews',
			listViewedFilesQuery,
			{ pullRequestId, ...cursorVariables(queryOptions) },
			signal,
			data => parseViewedFilesQuery(data)?.node?.files ?? null,
			requestOptions
		);
	}

	async markFileViewed(pullRequestId: string, path: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<NodeIdentity> {
		return this._client.graphql(
			'reviews',
			markFileViewedMutation,
			{ input: { pullRequestId, path } },
			signal,
			data => parseViewedFileMutation(data).result.pullRequest,
			options
		);
	}

	async unmarkFileViewed(pullRequestId: string, path: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<NodeIdentity> {
		return this._client.graphql(
			'reviews',
			unmarkFileViewedMutation,
			{ input: { pullRequestId, path } },
			signal,
			data => parseViewedFileMutation(data).result.pullRequest,
			options
		);
	}
}

function reviewPath(ref: RepositoryRef, pullNumber: number, reviewId: number): string {
	return `${pullRequestPath(ref, pullNumber)}/reviews/${numberSegment(reviewId)}`;
}

function commentPath(ref: RepositoryRef, commentId: number): string {
	return `${repositoryPath(ref)}/pulls/comments/${numberSegment(commentId)}`;
}

const parseReviewState = parse.oneOf('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED');

const parseReview = parse.object<Review>({
	id: parse.positiveInteger,
	node_id: parse.nonEmptyString,
	user: parse.nullable(parseAccount),
	body: parse.string,
	state: parseReviewState,
	commit_id: parse.nullable(parse.string),
	html_url: parse.nonEmptyString,
	submitted_at: parse.optional(parse.nullable(parse.dateTime)),
});

const parseReviews = parse.arrayOf(parseReview);

const parseComment = parse.object<ReviewComment>({
	id: parse.positiveInteger,
	node_id: parse.nonEmptyString,
	pull_request_review_id: parse.nullable(parse.integer),
	user: parse.nullable(parseAccount),
	body: parse.string,
	path: parse.nonEmptyString,
	diff_hunk: parse.string,
	commit_id: parse.nonEmptyString,
	original_commit_id: parse.nonEmptyString,
	in_reply_to_id: parse.optional(parse.integer),
	line: parse.optional(parse.nullable(parse.integer)),
	original_line: parse.optional(parse.nullable(parse.integer)),
	start_line: parse.optional(parse.nullable(parse.integer)),
	original_start_line: parse.optional(parse.nullable(parse.integer)),
	side: parse.optional(parse.nullable(parse.oneOf('LEFT', 'RIGHT'))),
	start_side: parse.optional(parse.nullable(parse.oneOf('LEFT', 'RIGHT'))),
	subject_type: parse.optional(parse.oneOf('line', 'file')),
	html_url: parse.nonEmptyString,
	created_at: parse.dateTime,
	updated_at: parse.dateTime,
});

const parseComments = parse.arrayOf(parseComment);

const parseRequestedReviewers = parse.object<RequestedReviewers>({
	users: parse.arrayOf(parseAccount),
	teams: parse.arrayOf(parseTeam)
});

const parseThreadComment = parse.object<ThreadComment>({
	id: parse.nonEmptyString,
	databaseId: parse.nullable(parse.integer),
	body: parse.string,
	url: parse.nonEmptyString,
	createdAt: parse.dateTime,
	updatedAt: parse.dateTime,
	path: parse.nullable(parse.string),
	line: parse.nullable(parse.integer),
	originalLine: parse.nullable(parse.integer),
	state: parse.oneOf('PENDING', 'SUBMITTED'),
	author: parse.nullable(parseActor),
	viewerCanUpdate: parse.boolean,
	viewerCanDelete: parse.boolean,
	replyTo: parse.nullable(parse.object({
		databaseId: parse.nullable(parse.integer),
	})),
	pullRequestReview: parse.nullable(parse.object({
		id: parse.nonEmptyString,
		state: parseReviewState
	})),
});

const parseThreadComments = parseConnection(parseThreadComment);

const parseThread = parse.object<ReviewThread>({
	id: parse.nonEmptyString,
	path: parse.nonEmptyString,
	line: parse.nullable(parse.integer),
	originalLine: parse.nullable(parse.integer),
	startLine: parse.nullable(parse.integer),
	originalStartLine: parse.nullable(parse.integer),
	diffSide: parse.oneOf('LEFT', 'RIGHT'),
	startDiffSide: parse.nullable(parse.oneOf('LEFT', 'RIGHT')),
	isOutdated: parse.boolean,
	isResolved: parse.boolean,
	viewerCanReply: parse.boolean,
	viewerCanResolve: parse.boolean,
	viewerCanUnresolve: parse.boolean,
	comments: parseThreadComments,
});

const parseThreadsQuery = parse.object({
	node: parse.nullable(parse.object({
		reviewThreads: parseConnection(parseThread)
	}))
});

const parseThreadSummariesQuery = parse.object({
	node: parse.nullable(parse.object({
		reviewThreads: parseConnection(parse.object<ReviewThreadSummary>({
			id: parse.nonEmptyString,
			isResolved: parse.boolean,
			comments: parse.object({
				nodes: parse.nullable(parse.arrayOf(parse.nullable(parse.object({
					createdAt: parse.dateTime,
				})))),
			}),
		})),
	})),
});

const parseCommentsQuery = parse.object({
	node: parse.nullable(parse.object({
		comments: parseThreadComments
	}))
});

const parseThreadMutation = parse.object({
	result: parse.object({
		thread: parseThread
	})
});

const parseReplyMutation = parse.object({
	result: parse.object({
		comment: parseThreadComment
	})
});

const parseResolutionMutation = parse.object({
	result: parse.object({
		thread: parse.object<ThreadResolution>({
			id: parse.nonEmptyString,
			isResolved: parse.boolean
		})
	}),
});

const parseViewedFilesQuery = parse.object({
	node: parse.nullable(parse.object({
		files: parse.nullable(parseConnection(parse.object<FileViewedState>({
			path: parse.nonEmptyString,
			viewerViewedState: parse.oneOf('VIEWED', 'UNVIEWED', 'DISMISSED'),
		}))),
	})),
});

const parseViewedFileMutation = parse.object({
	result: parse.object({
		pullRequest: parseNodeIdentity
	})
});

const commentFields = `id databaseId body url createdAt updatedAt path line originalLine state viewerCanUpdate viewerCanDelete
	author { __typename login avatarUrl url }
	replyTo { databaseId }
	pullRequestReview { id state }`;

const threadFields = `id path line originalLine startLine originalStartLine diffSide startDiffSide
	isOutdated isResolved viewerCanReply viewerCanResolve viewerCanUnresolve`;

const listThreadsQuery = `query ListReviewThreads($pullRequestId: ID!, $first: Int! = 100, $after: String, $commentsFirst: Int! = 100) {
	node(id: $pullRequestId) { ... on PullRequest {
		reviewThreads(first: $first, after: $after) {
			nodes { ${threadFields}
				comments(first: $commentsFirst) { nodes { ${commentFields} } pageInfo { endCursor hasNextPage } }
			}
			pageInfo { endCursor hasNextPage }
		}
	} }
}`;

const listThreadSummariesQuery = `query ListReviewThreadSummaries($pullRequestId: ID!, $first: Int! = 100, $after: String) {
	node(id: $pullRequestId) { ... on PullRequest {
		reviewThreads(first: $first, after: $after) {
			nodes {
				id isResolved
				comments(last: 1) { nodes { createdAt } }
			}
			pageInfo { endCursor hasNextPage }
		}
	} }
}`;

const listThreadCommentsQuery = `query ListThreadComments($threadId: ID!, $first: Int! = 100, $after: String) {
	node(id: $threadId) { ... on PullRequestReviewThread {
		comments(first: $first, after: $after) { nodes { ${commentFields} } pageInfo { endCursor hasNextPage } }
	} }
}`;

const createThreadMutation = `mutation CreateReviewThread($input: AddPullRequestReviewThreadInput!) {
	result: addPullRequestReviewThread(input: $input) {
		thread { ${threadFields}
			comments(first: 100) { nodes { ${commentFields} } pageInfo { endCursor hasNextPage } }
		}
	}
}`;

const replyToThreadMutation = `mutation ReplyToReviewThread($input: AddPullRequestReviewThreadReplyInput!) {
	result: addPullRequestReviewThreadReply(input: $input) { comment { ${commentFields} } }
}`;

const resolveThreadMutation = `mutation ResolveReviewThread($input: ResolveReviewThreadInput!) {
	result: resolveReviewThread(input: $input) { thread { id isResolved } }
}`;

const unresolveThreadMutation = `mutation UnresolveReviewThread($input: UnresolveReviewThreadInput!) {
	result: unresolveReviewThread(input: $input) { thread { id isResolved } }
}`;

const listViewedFilesQuery = `query ListFileViewedStates($pullRequestId: ID!, $first: Int! = 100, $after: String) {
	node(id: $pullRequestId) { ... on PullRequest {
		files(first: $first, after: $after) { nodes { path viewerViewedState } pageInfo { endCursor hasNextPage } }
	} }
}`;

const markFileViewedMutation = `mutation MarkFileViewed($input: MarkFileAsViewedInput!) {
	result: markFileAsViewed(input: $input) { pullRequest { id } }
}`;

const unmarkFileViewedMutation = `mutation UnmarkFileViewed($input: UnmarkFileAsViewedInput!) {
	result: unmarkFileAsViewed(input: $input) { pullRequest { id } }
}`;
