/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	GitHubFragmentError,
	PullRequestInlineComment,
	PullRequestMergeMethod,
	PullRequestRef,
	PullRequestSnapshot,
} from './githubPullRequestService.js';

export interface PullRequestMutationResult<T> {
	readonly outcome: 'succeeded' | 'reconciled' | 'indeterminate';
	readonly value?: T;
}

export interface PullRequestOperation {
	readonly operationId: string;
}

export interface PullRequestReplyAndResolveOptions extends PullRequestOperation {
	readonly threadId: string;
	readonly body: string;
	readonly resolve: boolean;
}

/** Only succeeded/reconciled replies are confirmed published; pending and indeterminate replies must not trigger resolution. */
export type PullRequestReplyResult =
	| { readonly outcome: 'succeeded' | 'reconciled' | 'pending'; readonly value: PullRequestInlineComment }
	| { readonly outcome: 'indeterminate'; readonly value?: PullRequestInlineComment };

export interface PullRequestReplyAndResolveResult {
	readonly reply: PullRequestReplyResult;
	readonly resolved: boolean;
	readonly resolveError?: GitHubFragmentError;
}

export interface GitHubWorkflowRun {
	readonly id: string;
	readonly name?: string | null;
	readonly event?: string;
	readonly status?: string;
	readonly conclusion?: string;
	readonly headSha: string;
	readonly runAttempt: number;
	/** Whether REST supplied a positive safe-integer attempt, independently of the compatibility fallback. */
	readonly runAttemptKnown?: boolean;
	readonly url?: string;
	readonly createdAt?: string;
	readonly updatedAt?: string;
}

export interface GitHubWorkflowLog {
	/** Redacted whole log, or only a complete-line captured prefix when truncated. */
	readonly text: string;
	/** True when the download exceeded the byte limit; the text is not an EOF tail. */
	readonly truncated: boolean;
	/** Captured bytes before decoding, incomplete-line removal, and redaction. */
	readonly bytesRead?: number;
	readonly maximumBytes?: number;
}

export interface GitHubWorkflowRerunOptions extends PullRequestOperation {
	readonly runId: string;
	readonly expectedRunAttempt: number;
	readonly failedJobsOnly?: boolean;
}

export interface PullRequestMergePreparation {
	readonly token: string;
	readonly ref: PullRequestRef;
	readonly expectedHeadSha: string;
	readonly resourceGeneration: number;
	readonly headGeneration: number;
	readonly snapshot: PullRequestSnapshot;
}

export interface PullRequestMergeAuthorization {
	readonly confirmed: true;
	readonly authorizationId: string;
}

export interface PullRequestMergeOptions {
	readonly method: PullRequestMergeMethod;
	readonly title?: string;
	readonly message?: string;
	readonly authorization: PullRequestMergeAuthorization;
}

export interface PullRequestMergeResult {
	readonly outcome: 'succeeded' | 'reconciled';
	readonly sha?: string;
	readonly message?: string;
}

export interface PullRequestEnqueueResult {
	readonly outcome: 'succeeded' | 'reconciled' | 'alreadyQueued';
	readonly mergeQueueEntryId: string;
}

export interface PullRequestMutationApi {
	replyAndResolveThread(ref: PullRequestRef, options: PullRequestReplyAndResolveOptions, signal: AbortSignal): Promise<PullRequestReplyAndResolveResult>;
	downloadWorkflowJobLog(ref: PullRequestRef, jobId: string, signal: AbortSignal): Promise<GitHubWorkflowLog>;
	rerunWorkflow(ref: PullRequestRef, options: GitHubWorkflowRerunOptions, signal: AbortSignal): Promise<PullRequestMutationResult<GitHubWorkflowRun>>;
	prepareMerge(ref: PullRequestRef, expectedHeadSha: string, signal: AbortSignal): Promise<PullRequestMergePreparation>;
	merge(preparation: PullRequestMergePreparation, options: PullRequestMergeOptions, signal: AbortSignal): Promise<PullRequestMergeResult>;
	enqueue(preparation: PullRequestMergePreparation, authorization: PullRequestMergeAuthorization, signal: AbortSignal): Promise<PullRequestEnqueueResult>;
}
