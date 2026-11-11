/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IGitHubPullRequestReview } from '../common/github/types.js';
import { IGitHubPullRequestRef } from '../../../services/sessions/common/session.js';

// --- Types -------------------------------------------------------------------

export interface ICodeReviewSuggestion {
	readonly edits: readonly ICodeReviewSuggestionChange[];
}

export interface ICodeReviewSuggestionChange {
	readonly range: IRange;
	readonly newText: string;
	readonly oldText: string;
}

// --- PR Review Types ---------------------------------------------------------

export const enum PRReviewStateKind {
	None = 'none',
	Loading = 'loading',
	Loaded = 'loaded',
	Error = 'error',
}

export type IPRReviewState =
	| { readonly kind: PRReviewStateKind.None }
	| { readonly kind: PRReviewStateKind.Loading }
	| { readonly kind: PRReviewStateKind.Loaded; readonly comments: readonly IPRReviewComment[]; readonly incompletePullRequests: readonly Pick<IGitHubPullRequestRef, 'owner' | 'repo' | 'number'>[] }
	| { readonly kind: PRReviewStateKind.Error; readonly reason: string };

export interface IPRReviewComment {
	readonly id: string;
	readonly pullRequest: IGitHubPullRequestRef;
	readonly uri: URI;
	readonly range: IRange;
	readonly body: string;
	readonly author: string;
}

export interface IPRReviewCommentTarget {
	readonly pullRequest: IGitHubPullRequestRef;
	readonly commitId: string;
	readonly path: string;
	readonly startLine: number | undefined;
	readonly line: number;
	readonly pendingReview: Pick<IGitHubPullRequestReview, 'id' | 'nodeId'> | undefined;
}

// --- Service Interface -------------------------------------------------------

export const ICodeReviewService = createDecorator<ICodeReviewService>('codeReviewService');

export interface ICodeReviewService {
	readonly _serviceBrand: undefined;

	/**
	 * Get the observable PR review state for a session.
	 * Returns unresolved review comments from every PR associated with the session.
	 */
	getPRReviewState(sessionResource: URI): IObservable<IPRReviewState>;
	getPRReviewCommentPullRequests(sessionResource: URI, resource: URI): readonly IGitHubPullRequestRef[];
	getPRReviewCommentTargets(sessionResource: URI, resource: URI, range: IRange, currentContent: string, pullRequest?: Pick<IGitHubPullRequestRef, 'owner' | 'repo' | 'number'>): Promise<readonly IPRReviewCommentTarget[]>;
	createPRReviewComment(target: IPRReviewCommentTarget, body: string): Promise<void>;

	/**
	 * Resolve a PR review thread on GitHub and remove it from local state.
	 */
	resolvePRReviewThread(sessionResource: URI, threadId: string, pullRequest?: Pick<IGitHubPullRequestRef, 'owner' | 'repo' | 'number'>): Promise<void>;

	/**
	 * Mark a PR review comment as locally converted to agent feedback.
	 * The comment is hidden from the PR review state until the session is
	 * cleaned up.
	 */
	markPRReviewCommentConverted(sessionResource: URI, commentId: string): void;

	/**
	 * Dismiss a PR review comment so it no longer appears in the review state.
	 * Used when the user deletes the comment's pending agent-feedback mirror
	 * from the `viewUnreviewedComments` confirmation: without suppressing the
	 * source comment the mirror would be seeded again. Like
	 * {@link markPRReviewCommentConverted} this is a local, in-memory filter that
	 * does not touch GitHub and is reset when the session is cleaned up.
	 */
	dismissPRReviewComment(sessionResource: URI, commentId: string): void;
}
