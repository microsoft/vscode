/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { IObservable } from '../../../base/common/observable.js';
import { AccountHandle, RequestErrorKind } from './types.js';

export interface PullRequestRef extends AccountHandle {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
}

export type PullRequestPriority = 'background' | 'visible' | 'interactive';

export type PullRequestMergeMethod = 'MERGE' | 'SQUASH' | 'REBASE';

export type PullRequestFragment =
	| 'core'
	| 'topLevelComments'
	| 'submittedReviews'
	| 'reviewThreads'
	| 'checks'
	| 'mergeability';

export interface PullRequestConversationInterests {
	readonly topLevelComments?: boolean;
	readonly submittedReviews?: boolean;
	readonly reviewThreads?: boolean;
	readonly includeBodies?: boolean;
}

export interface PullRequestChecksInterests {
	readonly required?: boolean;
	readonly includeOptional?: boolean;
}

export interface PullRequestInterests {
	readonly core?: true;
	readonly conversation?: PullRequestConversationInterests;
	readonly checks?: PullRequestChecksInterests;
	readonly mergeability?: true;
}

export interface PullRequestSubscriptionOptions extends PullRequestInterests {
	readonly priority: PullRequestPriority;
}

export interface GitHubFragmentError {
	readonly message: string;
	readonly kind: RequestErrorKind;
	readonly statusCode?: number;
	/**
	 * The GitHub page where the user authorizes the credential for an
	 * organization that enforces SAML single sign-on, when it refused the
	 * request for that. GitHub expires it after an hour.
	 */
	readonly ssoAuthorizationUrl?: string;
}

export interface FragmentState<T> {
	readonly value?: T;
	readonly status: 'missing' | 'loading' | 'ready' | 'stale' | 'error';
	readonly complete: boolean;
	readonly observedAt?: string;
	readonly attemptedAt?: string;
	readonly headSha?: string;
	readonly error?: GitHubFragmentError;
}

export interface GitHubActor {
	readonly id?: string;
	readonly login: string;
	readonly association?: string;
}

export interface PullRequestCore {
	readonly id?: string;
	readonly repositoryId?: string;
	readonly repositoryNameWithOwner: string;
	readonly number: number;
	readonly title: string;
	readonly body?: string;
	readonly url: string;
	readonly state: 'open' | 'closed' | 'merged';
	readonly draft: boolean;
	readonly headSha: string;
	readonly headRef: string;
	readonly headRepositoryNameWithOwner?: string;
	readonly maintainerCanModify?: boolean;
	readonly baseSha: string;
	readonly baseRef: string;
	readonly author?: GitHubActor;
	readonly createdAt?: string;
	readonly updatedAt?: string;
	readonly closedAt?: string;
	readonly mergedAt?: string;
}

export interface PullRequestComment {
	readonly id: string;
	readonly nodeId?: string;
	readonly author?: GitHubActor;
	readonly body?: string;
	readonly url?: string;
	readonly createdAt?: string;
	readonly updatedAt?: string;
}

export interface PullRequestReview {
	readonly id: string;
	readonly nodeId?: string;
	readonly author?: GitHubActor;
	readonly state: string;
	readonly body?: string;
	readonly commitId?: string;
	readonly submittedAt?: string;
}

export interface PullRequestInlineComment extends PullRequestComment {
	/** GitHub's review-comment state (PENDING or SUBMITTED), when available. */
	readonly state?: string;
	readonly reviewId?: string;
	readonly replyToId?: string;
	readonly path?: string;
	readonly line?: number;
	readonly originalLine?: number;
	readonly side?: string;
	readonly commitId?: string;
	readonly originalCommitId?: string;
}

export interface PullRequestReviewThread {
	readonly id: string;
	readonly isResolved: boolean;
	readonly isOutdated?: boolean;
	readonly path?: string;
	readonly diffSide?: string;
	readonly line?: number;
	readonly originalLine?: number;
	readonly comments: readonly PullRequestInlineComment[];
}

export type PullRequestCheckType = 'checkRun' | 'statusContext';

export interface PullRequestCheck {
	readonly id: string;
	readonly type: PullRequestCheckType;
	readonly name: string;
	readonly status?: string;
	readonly conclusion?: string;
	/** Whether GitHub reports the check itself as required by the base branch. */
	readonly required?: boolean;
	readonly detailsUrl?: string;
	readonly workflowName?: string;
	/** The GitHub Actions workflow run that reported the check. */
	readonly workflowRunId?: string;
	/** The path of that run's workflow file. */
	readonly workflowPath?: string;
	/**
	 * The unfinished required checks that wait for this check through their
	 * workflow's `needs:`, directly or through other jobs; see
	 * `classifyRequiredPullRequestChecks`.
	 */
	readonly requiredBy?: readonly string[];
}

export interface PullRequestCheckSuite {
	readonly id: string;
	readonly name: string;
	readonly status?: string;
	readonly conclusion?: string;
	readonly checkRunsReported: boolean;
}

export interface PullRequestChecks {
	readonly headSha: string;
	readonly checks: readonly PullRequestCheck[];
	readonly requirednessComplete: boolean;
	/**
	 * The names of the checks the base branch's protection and rulesets
	 * require, including those that have not reported yet. `undefined` when
	 * they were not requested or could not be read.
	 */
	readonly requiredContexts?: readonly string[];
	readonly expectedSuites: readonly PullRequestCheckSuite[];
	readonly expectedSuitesComplete: boolean;
}

export interface PullRequestMergeability {
	readonly headSha: string;
	readonly baseSha: string;
	readonly mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
	readonly mergeStateStatus?: string;
	readonly reviewDecision?: string;
	readonly viewerCanUpdate: boolean;
	readonly viewerCanMerge: boolean;
	readonly viewerCanEnableAutoMerge: boolean;
	readonly allowedMergeMethods: readonly PullRequestMergeMethod[];
	readonly autoMergeEnabled: boolean;
	readonly mergeQueueEntryId?: string;
	readonly mergeQueueRequired: boolean;
	readonly queueRequirementKnown: boolean;
}

export interface PullRequestSnapshot {
	readonly ref: PullRequestRef;
	readonly generation: number;
	readonly headGeneration: number;
	readonly core: FragmentState<PullRequestCore>;
	readonly topLevelComments: FragmentState<readonly PullRequestComment[]>;
	readonly submittedReviews: FragmentState<readonly PullRequestReview[]>;
	readonly reviewThreads: FragmentState<readonly PullRequestReviewThread[]>;
	readonly checks: FragmentState<PullRequestChecks>;
	readonly mergeability: FragmentState<PullRequestMergeability>;
}

export interface PullRequestResource {
	readonly ref: PullRequestRef;
	readonly snapshot: IObservable<PullRequestSnapshot>;
}

export interface PullRequestRefreshOptions {
	readonly authoritative?: boolean;
}

export interface PullRequestSubscription extends IDisposable {
	readonly resource: PullRequestResource;
	update(options: PullRequestSubscriptionOptions): void;
	refresh(fragment?: PullRequestFragment, token?: CancellationToken, options?: PullRequestRefreshOptions): Promise<void>;
}

export function firstCredentialFailure(snapshot: PullRequestSnapshot, fragments: readonly PullRequestFragment[]): { readonly id: string; readonly kind: 'authentication' | 'authorization'; readonly message: string; readonly ssoAuthorizationUrl?: string } | undefined {
	for (const fragment of fragments) {
		const error = snapshot[fragment].error;
		if (error?.kind === 'authentication' || error?.kind === 'authorization') {
			return {
				id: `${fragment}:${error.kind}`, kind: error.kind, message: error.message,
				...(error.ssoAuthorizationUrl ? { ssoAuthorizationUrl: error.ssoAuthorizationUrl } : {}),
			};
		}
	}
	return undefined;
}
