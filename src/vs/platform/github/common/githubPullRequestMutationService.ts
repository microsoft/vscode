/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	GitHubFragmentError,
	PullRequestComment,
	PullRequestInlineComment,
	PullRequestRef,
	PullRequestSnapshot,
} from './githubPullRequestService.js';
import { GitHubRepositoryRef } from './githubQueryService.js';

export type GitHubMutationOutcome = 'succeeded' | 'reconciled' | 'indeterminate';

export interface PullRequestMutationResult<T> {
	readonly outcome: GitHubMutationOutcome;
	readonly value?: T;
}

export interface PullRequestOperation {
	readonly operationId: string;
}

export interface CreatePullRequestOptions {
	readonly title: string;
	readonly body: string;
	readonly head: string;
	readonly base: string;
	readonly draft: boolean;
}

export interface CreatedPullRequest {
	readonly ref: PullRequestRef;
	readonly id?: string;
	readonly url: string;
	readonly createdAt?: string;
}

export interface EnablePullRequestAutoMergeOptions {
	readonly pullRequestId: string;
	readonly method: 'MERGE' | 'SQUASH' | 'REBASE';
}

export interface PullRequestCommentOptions extends PullRequestOperation {
	readonly body: string;
}

export interface PullRequestReplyOptions extends PullRequestOperation {
	readonly threadId: string;
	readonly body: string;
}

export interface PullRequestReplyAndResolveOptions extends PullRequestReplyOptions {
	readonly resolve: boolean;
}

export interface PullRequestReplyAndResolveResult {
	readonly reply: PullRequestMutationResult<PullRequestInlineComment>;
	readonly resolved: boolean;
	readonly resolveError?: GitHubFragmentError;
}

export interface GitHubWorkflowRun {
	readonly id: string;
	readonly name: string;
	readonly event?: string;
	readonly status?: string;
	readonly conclusion?: string;
	readonly headSha: string;
	readonly runAttempt: number;
	readonly url?: string;
	readonly createdAt?: string;
	readonly updatedAt?: string;
}

export interface GitHubWorkflowJob {
	readonly id: string;
	readonly runId: string;
	readonly name: string;
	readonly status?: string;
	readonly conclusion?: string;
	readonly checkRunId?: string;
	readonly url?: string;
	readonly startedAt?: string;
	readonly completedAt?: string;
}

export interface GitHubCheckAnnotation {
	readonly path: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly level: string;
	readonly message: string;
	readonly title?: string;
	readonly rawDetails?: string;
}

export interface GitHubWorkflowLog {
	readonly text: string;
	readonly truncated: boolean;
}

export interface GitHubWorkflowRerunOptions extends PullRequestOperation {
	readonly runId: string;
	readonly expectedRunAttempt: number;
	readonly failedJobsOnly?: boolean;
}

export interface PullRequestBranchUpdateOptions {
	readonly expectedHeadSha: string;
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
	readonly method: 'MERGE' | 'SQUASH' | 'REBASE';
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
	createPullRequest(ref: GitHubRepositoryRef, options: CreatePullRequestOptions, signal: AbortSignal): Promise<CreatedPullRequest>;
	enableAutoMerge(ref: GitHubRepositoryRef, options: EnablePullRequestAutoMergeOptions, signal: AbortSignal): Promise<void>;
	addComment(ref: PullRequestRef, options: PullRequestCommentOptions, signal: AbortSignal): Promise<PullRequestMutationResult<PullRequestComment>>;
	replyToThread(ref: PullRequestRef, options: PullRequestReplyOptions, signal: AbortSignal): Promise<PullRequestMutationResult<PullRequestInlineComment>>;
	resolveThread(ref: PullRequestRef, threadId: string, signal: AbortSignal): Promise<void>;
	replyAndResolveThread(ref: PullRequestRef, options: PullRequestReplyAndResolveOptions, signal: AbortSignal): Promise<PullRequestReplyAndResolveResult>;
	listWorkflowRuns(ref: PullRequestRef, headSha: string, signal: AbortSignal): Promise<readonly GitHubWorkflowRun[]>;
	listWorkflowJobs(ref: PullRequestRef, runId: string, signal: AbortSignal): Promise<readonly GitHubWorkflowJob[]>;
	listCheckAnnotations(ref: PullRequestRef, checkRunId: string, signal: AbortSignal): Promise<readonly GitHubCheckAnnotation[]>;
	downloadWorkflowJobLog(ref: PullRequestRef, jobId: string, signal: AbortSignal): Promise<GitHubWorkflowLog>;
	rerunWorkflow(ref: PullRequestRef, options: GitHubWorkflowRerunOptions, signal: AbortSignal): Promise<PullRequestMutationResult<GitHubWorkflowRun>>;
	updateBranch(ref: PullRequestRef, options: PullRequestBranchUpdateOptions, signal: AbortSignal): Promise<void>;
	prepareMerge(ref: PullRequestRef, expectedHeadSha: string, signal: AbortSignal): Promise<PullRequestMergePreparation>;
	merge(preparation: PullRequestMergePreparation, options: PullRequestMergeOptions, signal: AbortSignal): Promise<PullRequestMergeResult>;
	enqueue(preparation: PullRequestMergePreparation, authorization: PullRequestMergeAuthorization, signal: AbortSignal): Promise<PullRequestEnqueueResult>;
}
