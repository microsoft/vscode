/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiPaginationOptions, ApiRequestOptions } from '../client/request.js';
import { PageOptions, RepositoryRef } from '../client/types.js';
import { Account, Actor, Connection, CursorOptions, NodeIdentity, Team } from './core.js';
import { PullRequestSummary } from './pullRequests.js';

/** Side of a pull request diff. */
export type DiffSide = 'LEFT' | 'RIGHT';

/** Review state, distinct from a comment's PENDING or SUBMITTED publication state. */
export type ReviewState = 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED';

/** A pending, submitted, or dismissed REST review. */
export interface Review {
	/** Numeric review ID used by REST operations. */
	readonly id: number;
	/** GraphQL review node ID. */
	readonly node_id: string;
	/** Review author, or null when unavailable. */
	readonly user: Account | null;
	/** Markdown review body. */
	readonly body: string;
	/** Actual review state, including PENDING. */
	readonly state: ReviewState;
	/** Reviewed commit SHA, or null if the commit is no longer available. */
	readonly commit_id: string | null;
	/** Browser URL. */
	readonly html_url: string;
	/** Submission time, omitted or null for a pending review. */
	readonly submitted_at?: string | null;
}

/** An inline comment on a pull request review. */
export interface ReviewComment {
	/** Numeric comment ID used by REST operations. */
	readonly id: number;
	/** GraphQL comment node ID. */
	readonly node_id: string;
	/** Associated review's numeric ID, or null. */
	readonly pull_request_review_id: number | null;
	/** Author, or null when unavailable. */
	readonly user: Account | null;
	/** Markdown body. */
	readonly body: string;
	/** Repository-relative path. */
	readonly path: string;
	/** Diff excerpt supplied by GitHub. */
	readonly diff_hunk: string;
	/** Commit SHA to which the comment currently applies. */
	readonly commit_id: string;
	/** Originally commented commit SHA. */
	readonly original_commit_id: string;
	/** Parent comment ID for a reply, when reported. */
	readonly in_reply_to_id?: number;
	/** Current last line, absent or null for file-level or outdated comments. */
	readonly line?: number | null;
	/** Original last line, when available. */
	readonly original_line?: number | null;
	/** First line of a multi-line comment, when available. */
	readonly start_line?: number | null;
	/** Original first line of a multi-line comment, when available. */
	readonly original_start_line?: number | null;
	/** Side of the last line, when reported. */
	readonly side?: DiffSide;
	/** Side of the first line, when reported. */
	readonly start_side?: DiffSide | null;
	/** File-level or line-level subject, when reported. */
	readonly subject_type?: 'line' | 'file';
	/** Browser URL. */
	readonly html_url: string;
	/** Creation timestamp. */
	readonly created_at: string;
	/** Last edit timestamp. */
	readonly updated_at: string;
}

/** A review submission, requiring a body for comments and change requests. */
export type SubmitReviewRequest = {
	/** Approve the reviewed changes. */
	readonly event: 'APPROVE';
	/** Optional Markdown review body. */
	readonly body?: string;
} | {
	/** Publish a comment-only review or request changes. */
	readonly event: 'COMMENT' | 'REQUEST_CHANGES';
	/** Required Markdown review body. */
	readonly body: string;
};

/** File line and diff-side coordinates for an inline comment. */
export interface ReviewLinePosition {
	/** Last line in the blob, not an offset within a diff hunk. */
	readonly line: number;
	/** Side of the last line. */
	readonly side: DiffSide;
	/** First line for a multi-line comment. */
	readonly start_line?: number;
	/** Side of the first line for a multi-line comment. */
	readonly start_side?: DiffSide;
}

/** A comment included when creating a review. */
export interface DraftReviewComment extends ReviewLinePosition {
	/** Repository-relative path. */
	readonly path: string;
	/** Markdown body. */
	readonly body: string;
}

/** Create a pending review by omitting event, or submit immediately using a supported review event. */
export type CreateReviewRequest = (SubmitReviewRequest | {
	/** Omit the event to leave the review pending. */
	readonly event?: never;
	/** Draft review body. */
	readonly body?: string;
}) & {
	/** Commit SHA to review; omission lets GitHub select the current head. */
	readonly commit_id?: string;
	/** Initial inline comments, positioned by file line and diff side. */
	readonly comments?: readonly DraftReviewComment[];
};

/** A new review comment attached to a file or a range of lines. */
export type CreateReviewCommentRequest = {
	/** Markdown body. */
	readonly body: string;
	/** Commit SHA being commented on. */
	readonly commit_id: string;
	/** Repository-relative path. */
	readonly path: string;
} & (ReviewLinePosition & {
	/** Line-level subject; this is the server default. */
	readonly subject_type?: 'line';
} | {
	/** File-level subject, requiring no line positioning. */
	readonly subject_type: 'file';
});

/** Individual and team reviewer requests. */
export interface RequestReviewersRequest {
	/** Individual reviewer logins. */
	readonly reviewers?: readonly string[];
	/** Organization team slugs, not team display names or numeric IDs. */
	readonly team_reviewers?: readonly string[];
}

/** Reviewer removal requires the individual-reviewer array even for a team-only request. */
export interface RemoveReviewersRequest extends RequestReviewersRequest {
	/** Individual reviewer logins; pass an empty array for team-only removal. */
	readonly reviewers: readonly string[];
}

/** Current requested reviewers, not already submitted reviews. */
export interface RequestedReviewers {
	/** Individual reviewers. */
	readonly users: readonly Account[];
	/** Team reviewers. */
	readonly teams: readonly Team[];
}

/** A review-thread comment with its publication state and the viewer's permissions. */
export interface ThreadComment extends NodeIdentity {
	/** Numeric ID for REST operations, or null when unavailable. */
	readonly databaseId: number | null;
	/** Markdown body. */
	readonly body: string;
	/** Browser URL. */
	readonly url: string;
	/** Comment creation time in RFC 3339 format. */
	readonly createdAt: string;
	/** Most recent update time in RFC 3339 format. */
	readonly updatedAt: string;
	/** Repository-relative path, or null when unavailable. */
	readonly path: string | null;
	/** Current line, or null for file-level or outdated comments. */
	readonly line: number | null;
	/** Original line, or null when unavailable. */
	readonly originalLine: number | null;
	/** Publication state; PENDING does not mean other participants can see the comment. */
	readonly state: 'PENDING' | 'SUBMITTED';
	/** Author actor, or null when unavailable. */
	readonly author: Actor | null;
	/** Whether the viewer can edit this comment. */
	readonly viewerCanUpdate: boolean;
	/** Whether the viewer can delete this comment. */
	readonly viewerCanDelete: boolean;
	/** Parent comment, or null for a top-level comment. */
	readonly replyTo: {
		/** Numeric parent-comment ID for REST operations, or null when unavailable. */
		readonly databaseId: number | null;
	} | null;
	/** Owning review and its current state, or null when unavailable. */
	readonly pullRequestReview: {
		/** GraphQL review node ID. */
		readonly id: string;
		/** Review state, including PENDING. */
		readonly state: ReviewState;
	} | null;
}

/** GraphQL review thread with an independently paginated comment connection. */
export interface ReviewThread extends NodeIdentity {
	/** Repository-relative path. */
	readonly path: string;
	/** Current last line, or null for file-level or outdated threads. */
	readonly line: number | null;
	/** Original last line, or null. */
	readonly originalLine: number | null;
	/** Current first line for a multi-line thread, or null. */
	readonly startLine: number | null;
	/** Original first line for a multi-line thread, or null. */
	readonly originalStartLine: number | null;
	/** Side of the last line. */
	readonly diffSide: DiffSide;
	/** Side of the first line, or null. */
	readonly startDiffSide: DiffSide | null;
	/** Whether newer changes made the thread outdated. */
	readonly isOutdated: boolean;
	/** Whether the thread is resolved. */
	readonly isResolved: boolean;
	/** Whether the viewer can reply. */
	readonly viewerCanReply: boolean;
	/** Whether the viewer can resolve the thread. */
	readonly viewerCanResolve: boolean;
	/** Whether the viewer can unresolve the thread. */
	readonly viewerCanUnresolve: boolean;
	/** One page of comments; use listThreadComments for subsequent pages. */
	readonly comments: Connection<ThreadComment>;
}

/** Resolution state and the newest comment's creation time for a review thread. */
export interface ReviewThreadSummary extends NodeIdentity {
	/** Whether the thread is resolved. */
	readonly isResolved: boolean;
	/** The last comment, preserving nullable connection nodes. */
	readonly comments: {
		readonly nodes: readonly ({
			/** Comment creation time in RFC 3339 format. */
			readonly createdAt: string;
		} | null)[] | null;
	};
}

/** Thread-list pagination with a separate limit for each nested comments connection. */
export type ListReviewThreadsOptions = ApiPaginationOptions<CursorOptions & {
	/** Number of initial comments per thread, from 1 through 100; defaults to 100. */
	readonly commentsFirst?: number;
}>;

/** GraphQL inputs for a new line-level or file-level review thread. */
export type CreateReviewThreadRequest = {
	/** Repository-relative path. */
	readonly path: string;
	/** Markdown body of the first comment. */
	readonly body: string;
} & ({
	/** GraphQL PR node ID. */
	readonly pullRequestId: string;
	/** Optional pending-review node ID. */
	readonly pullRequestReviewId?: string;
} | {
	/** PR is resolved from the specified review. */
	readonly pullRequestId?: never;
	/** GraphQL pending-review node ID. */
	readonly pullRequestReviewId: string;
}) & ({
	/** Line-level subject, the server default. */
	readonly subjectType?: 'LINE';
	/** Last line in the blob. */
	readonly line: number;
	/** Side of the last line; omission uses the server default. */
	readonly side?: DiffSide;
	/** First line for a multi-line thread. */
	readonly startLine?: number;
	/** Side of the first line. */
	readonly startSide?: DiffSide;
} | {
	/** File-level subject requiring no line. */
	readonly subjectType: 'FILE';
});

/** Result of resolving or unresolving a thread. */
export interface ThreadResolution extends NodeIdentity {
	/** Resolved state returned by the server. */
	readonly isResolved: boolean;
}

/** GraphQL file-viewed state for the current viewer. */
export interface FileViewedState {
	/** Repository-relative file path. */
	readonly path: string;
	/** Server state, including a dismissed view after relevant file changes. */
	readonly viewerViewedState: 'VIEWED' | 'UNVIEWED' | 'DISMISSED';
}

/** Request options for replying to a review thread. */
export interface ReplyToThreadOptions extends ApiRequestOptions {
	/** Pending-review node ID to attach the reply to. */
	readonly pullRequestReviewId?: string;
}


/** Operations for pull request reviews, inline comments, review threads, and file-viewed state. */
export interface IReviewsClient {

	/** GET /repos/{owner}/{repo}/pulls/{number}/reviews: list one page of reviews, including pending reviews visible to the viewer. */
	list(repository: RepositoryRef, pullNumber: number, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly Review[]>;

	/** GET /repos/{owner}/{repo}/pulls/{number}/reviews/{id}: read one review. */
	get(repository: RepositoryRef, pullNumber: number, reviewId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<Review>;

	/** POST /repos/{owner}/{repo}/pulls/{number}/reviews: create a pending or submitted review; success is HTTP 200. */
	create(repository: RepositoryRef, pullNumber: number, request: CreateReviewRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Review>;

	/** PUT /repos/{owner}/{repo}/pulls/{number}/reviews/{id}: edit the review body. */
	update(repository: RepositoryRef, pullNumber: number, reviewId: number, body: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<Review>;

	/** POST /repos/{owner}/{repo}/pulls/{number}/reviews/{id}/events: submit a pending review. */
	submit(repository: RepositoryRef, pullNumber: number, reviewId: number, request: SubmitReviewRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Review>;

	/** DELETE /repos/{owner}/{repo}/pulls/{number}/reviews/{id}: delete a pending review and return the deleted review. */
	deletePending(repository: RepositoryRef, pullNumber: number, reviewId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<Review>;

	/** PUT /repos/{owner}/{repo}/pulls/{number}/reviews/{id}/dismissals: dismiss a review with a reason. */
	dismiss(repository: RepositoryRef, pullNumber: number, reviewId: number, message: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<Review>;

	/** GET /repos/{owner}/{repo}/pulls/{number}/comments: list one page of inline comments across reviews. */
	listComments(repository: RepositoryRef, pullNumber: number, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly ReviewComment[]>;

	/** GET /repos/{owner}/{repo}/pulls/{number}/reviews/{id}/comments: list one page of comments belonging to a review. */
	listCommentsForReview(repository: RepositoryRef, pullNumber: number, reviewId: number, signal: AbortSignal, options?: ApiPaginationOptions<PageOptions>): Promise<readonly ReviewComment[]>;

	/** POST /repos/{owner}/{repo}/pulls/{number}/comments: create an inline review comment. */
	createComment(repository: RepositoryRef, pullNumber: number, request: CreateReviewCommentRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<ReviewComment>;

	/** POST /repos/{owner}/{repo}/pulls/{number}/comments/{id}/replies: reply to a root inline comment by its numeric ID. */
	replyToComment(repository: RepositoryRef, pullNumber: number, commentId: number, body: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<ReviewComment>;

	/** PATCH /repos/{owner}/{repo}/pulls/comments/{id}: edit an inline comment. */
	updateComment(repository: RepositoryRef, commentId: number, body: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<ReviewComment>;

	/** DELETE /repos/{owner}/{repo}/pulls/comments/{id}: delete an inline comment. */
	deleteComment(repository: RepositoryRef, commentId: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<void>;

	/** GET /repos/{owner}/{repo}/pulls/{number}/requested_reviewers: read requested users and teams. */
	getRequestedReviewers(repository: RepositoryRef, pullNumber: number, signal: AbortSignal, options?: ApiRequestOptions): Promise<RequestedReviewers>;

	/** POST /repos/{owner}/{repo}/pulls/{number}/requested_reviewers: add reviewer requests. */
	requestReviewers(repository: RepositoryRef, pullNumber: number, request: RequestReviewersRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<PullRequestSummary>;

	/** DELETE /repos/{owner}/{repo}/pulls/{number}/requested_reviewers: remove reviewer requests. */
	removeReviewers(repository: RepositoryRef, pullNumber: number, request: RemoveReviewersRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<PullRequestSummary>;

	/** GraphQL PR reviewThreads connection; null means the PR node was not returned, not an empty connection. */
	listThreads(pullRequestId: string, signal: AbortSignal, options?: ListReviewThreadsOptions): Promise<Connection<ReviewThread> | null>;

	/** GraphQL thread summaries with the newest comment timestamp, defaulting to 100 per page; null means the PR node was not returned. */
	listThreadSummaries(pullRequestId: string, signal: AbortSignal, options?: ApiPaginationOptions<CursorOptions>): Promise<Connection<ReviewThreadSummary> | null>;

	/** GraphQL thread comments connection; null means the thread node was not returned. */
	listThreadComments(threadId: string, signal: AbortSignal, options?: ApiPaginationOptions<CursorOptions>): Promise<Connection<ThreadComment> | null>;

	/** GraphQL addPullRequestReviewThread: create a review thread; comments attached to a pending review remain unpublished. */
	createThread(request: CreateReviewThreadRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<ReviewThread>;

	/** GraphQL addPullRequestReviewThreadReply; a reply can attach to a pending review and remain unpublished. */
	replyToThread(threadId: string, body: string, signal: AbortSignal, options?: ReplyToThreadOptions): Promise<ThreadComment>;

	/** GraphQL resolveReviewThread; independent of comment publication and review submission. */
	resolveThread(threadId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<ThreadResolution>;

	/** GraphQL unresolveReviewThread: mark a review thread as unresolved. */
	unresolveThread(threadId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<ThreadResolution>;

	/** GraphQL PR files connection: read one page of viewed-file states; null indicates an unavailable PR or file comparison. */
	listFileViewedStates(pullRequestId: string, signal: AbortSignal, options?: ApiPaginationOptions<CursorOptions>): Promise<Connection<FileViewedState> | null>;

	/** GraphQL markFileAsViewed; marks only the named file for the current viewer. */
	markFileViewed(pullRequestId: string, path: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<NodeIdentity>;

	/** GraphQL unmarkFileAsViewed: clear the viewed mark for the named file and current viewer. */
	unmarkFileViewed(pullRequestId: string, path: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<NodeIdentity>;
}
