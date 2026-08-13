/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../instantiation/common/instantiation.js';
import {
	GitHubComparison,
	GitHubIssueRef,
	GitHubIssueSubscription,
	GitHubPullRequestContext,
	GitHubPullRequestLookup,
	GitHubPullRequestsPage,
	GitHubPullRequestSummary,
	GitHubQueryApi,
	GitHubRecentIssue,
	GitHubRecentPullRequest,
	GitHubRecentPullRequestReviewThread,
	GitHubRepositoryRef,
	GitHubRepositorySubscription,
	GitHubResourceSubscriptionOptions,
} from '../../common/githubQueryService.js';
import {
	CreatePullRequestOptions,
	CreatedPullRequest,
	EnablePullRequestAutoMergeOptions,
	GitHubCheckAnnotation,
	GitHubWorkflowJob,
	GitHubWorkflowLog,
	GitHubWorkflowRerunOptions,
	GitHubWorkflowRun,
	PullRequestBranchUpdateOptions,
	PullRequestCommentOptions,
	PullRequestEnqueueResult,
	PullRequestMergeAuthorization,
	PullRequestMergeOptions,
	PullRequestMergePreparation,
	PullRequestMergeResult,
	PullRequestMutationApi,
	PullRequestMutationResult,
	PullRequestReplyAndResolveOptions,
	PullRequestReplyAndResolveResult,
	PullRequestReplyOptions,
} from '../../common/githubPullRequestMutationService.js';
import {
	PullRequestComment,
	PullRequestInlineComment,
	PullRequestRef,
	PullRequestSubscription,
	PullRequestSubscriptionOptions,
} from '../../common/githubPullRequestService.js';
import { IGitHubQueryService } from './githubQueryService.js';
import { IPullRequestMutationService } from './pullRequestMutationService.js';
import { IPullRequestResourceService } from './pullRequestResourceService.js';

export const IAgentHostGitHubService = createDecorator<IAgentHostGitHubService>('agentHostGitHubService');

export interface IAgentHostGitHubService extends GitHubQueryApi, PullRequestMutationApi {
	readonly _serviceBrand: undefined;
	subscribePullRequest(ref: PullRequestRef, options: PullRequestSubscriptionOptions): PullRequestSubscription;
}

export class AgentHostGitHubService implements IAgentHostGitHubService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IGitHubQueryService private readonly _queries: IGitHubQueryService,
		@IPullRequestResourceService private readonly _pullRequests: IPullRequestResourceService,
		@IPullRequestMutationService private readonly _mutations: IPullRequestMutationService,
	) { }

	subscribeRepository(ref: GitHubRepositoryRef, options: GitHubResourceSubscriptionOptions): GitHubRepositorySubscription {
		return this._queries.subscribeRepository(ref, options);
	}

	subscribeIssue(ref: GitHubIssueRef, options: GitHubResourceSubscriptionOptions): GitHubIssueSubscription {
		return this._queries.subscribeIssue(ref, options);
	}

	subscribePullRequest(ref: PullRequestRef, options: PullRequestSubscriptionOptions): PullRequestSubscription {
		return this._pullRequests.subscribePullRequest(ref, options);
	}

	compare(ref: GitHubRepositoryRef, base: string, head: string, signal: AbortSignal): Promise<GitHubComparison> {
		return this._queries.compare(ref, base, head, signal);
	}

	listPullRequests(ref: GitHubRepositoryRef, cursor: string | undefined, signal: AbortSignal): Promise<GitHubPullRequestsPage> {
		return this._queries.listPullRequests(ref, cursor, signal);
	}

	listPullRequestsWaitingForReview(ref: GitHubRepositoryRef, signal: AbortSignal): Promise<readonly GitHubPullRequestSummary[]> {
		return this._queries.listPullRequestsWaitingForReview(ref, signal);
	}

	listPullRequestsAssignedToViewer(ref: GitHubRepositoryRef, signal: AbortSignal): Promise<readonly GitHubPullRequestSummary[]> {
		return this._queries.listPullRequestsAssignedToViewer(ref, signal);
	}

	getPullRequestContext(ref: PullRequestRef, signal: AbortSignal): Promise<GitHubPullRequestContext> {
		return this._queries.getPullRequestContext(ref, signal);
	}

	findPullRequestByHeadBranch(ref: GitHubRepositoryRef, branch: string, headOwner: string | undefined, signal: AbortSignal): Promise<GitHubPullRequestLookup | undefined> {
		return this._queries.findPullRequestByHeadBranch(ref, branch, headOwner, signal);
	}

	findPullRequestByHeadSha(ref: GitHubRepositoryRef, sha: string, signal: AbortSignal): Promise<GitHubPullRequestLookup | undefined> {
		return this._queries.findPullRequestByHeadSha(ref, sha, signal);
	}

	getRecentAssignedIssues(ref: GitHubRepositoryRef, signal: AbortSignal): Promise<readonly GitHubRecentIssue[]> {
		return this._queries.getRecentAssignedIssues(ref, signal);
	}

	getRecentAuthoredPullRequests(ref: GitHubRepositoryRef, signal: AbortSignal): Promise<readonly GitHubRecentPullRequest[]> {
		return this._queries.getRecentAuthoredPullRequests(ref, signal);
	}

	getPullRequestReviewThreadSummary(ref: PullRequestRef, signal: AbortSignal): Promise<readonly GitHubRecentPullRequestReviewThread[]> {
		return this._queries.getPullRequestReviewThreadSummary(ref, signal);
	}

	getIssuesWithLinkedPullRequests(ref: GitHubRepositoryRef, issueNumbers: readonly number[], signal: AbortSignal): Promise<readonly number[]> {
		return this._queries.getIssuesWithLinkedPullRequests(ref, issueNumbers, signal);
	}

	createPullRequest(ref: GitHubRepositoryRef, options: CreatePullRequestOptions, signal: AbortSignal): Promise<CreatedPullRequest> {
		return this._mutations.createPullRequest(ref, options, signal);
	}

	enableAutoMerge(ref: GitHubRepositoryRef, options: EnablePullRequestAutoMergeOptions, signal: AbortSignal): Promise<void> {
		return this._mutations.enableAutoMerge(ref, options, signal);
	}

	addComment(ref: PullRequestRef, options: PullRequestCommentOptions, signal: AbortSignal): Promise<PullRequestMutationResult<PullRequestComment>> {
		return this._mutations.addComment(ref, options, signal);
	}

	replyToThread(ref: PullRequestRef, options: PullRequestReplyOptions, signal: AbortSignal): Promise<PullRequestMutationResult<PullRequestInlineComment>> {
		return this._mutations.replyToThread(ref, options, signal);
	}

	resolveThread(ref: PullRequestRef, threadId: string, signal: AbortSignal): Promise<void> {
		return this._mutations.resolveThread(ref, threadId, signal);
	}

	replyAndResolveThread(ref: PullRequestRef, options: PullRequestReplyAndResolveOptions, signal: AbortSignal): Promise<PullRequestReplyAndResolveResult> {
		return this._mutations.replyAndResolveThread(ref, options, signal);
	}

	listWorkflowRuns(ref: PullRequestRef, headSha: string, signal: AbortSignal): Promise<readonly GitHubWorkflowRun[]> {
		return this._mutations.listWorkflowRuns(ref, headSha, signal);
	}

	listWorkflowJobs(ref: PullRequestRef, runId: string, signal: AbortSignal): Promise<readonly GitHubWorkflowJob[]> {
		return this._mutations.listWorkflowJobs(ref, runId, signal);
	}

	listCheckAnnotations(ref: PullRequestRef, checkRunId: string, signal: AbortSignal): Promise<readonly GitHubCheckAnnotation[]> {
		return this._mutations.listCheckAnnotations(ref, checkRunId, signal);
	}

	downloadWorkflowJobLog(ref: PullRequestRef, jobId: string, signal: AbortSignal): Promise<GitHubWorkflowLog> {
		return this._mutations.downloadWorkflowJobLog(ref, jobId, signal);
	}

	rerunWorkflow(ref: PullRequestRef, options: GitHubWorkflowRerunOptions, signal: AbortSignal): Promise<PullRequestMutationResult<GitHubWorkflowRun>> {
		return this._mutations.rerunWorkflow(ref, options, signal);
	}

	updateBranch(ref: PullRequestRef, options: PullRequestBranchUpdateOptions, signal: AbortSignal): Promise<void> {
		return this._mutations.updateBranch(ref, options, signal);
	}

	prepareMerge(ref: PullRequestRef, expectedHeadSha: string, signal: AbortSignal): Promise<PullRequestMergePreparation> {
		return this._mutations.prepareMerge(ref, expectedHeadSha, signal);
	}

	merge(preparation: PullRequestMergePreparation, options: PullRequestMergeOptions, signal: AbortSignal): Promise<PullRequestMergeResult> {
		return this._mutations.merge(preparation, options, signal);
	}

	enqueue(preparation: PullRequestMergePreparation, authorization: PullRequestMergeAuthorization, signal: AbortSignal): Promise<PullRequestEnqueueResult> {
		return this._mutations.enqueue(preparation, authorization, signal);
	}
}
