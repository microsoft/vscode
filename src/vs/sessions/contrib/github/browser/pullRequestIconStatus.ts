/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReaderWithStore } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { computePullRequestIcon, GitHubCIOverallStatus, GitHubPullRequestState, IGitHubPullRequest, IPullRequestIconStatus } from '../common/types.js';
import { IGitHubService } from './githubService.js';

/**
 * Reads the live {@link IPullRequestIconStatus} for a pull request from the shared
 * CI and review-thread models. The status only refines open, non-draft pull requests
 * (where a failing CI check or an unresolved review comment changes the icon), so for
 * draft, closed, or merged pull requests an empty status is returned.
 */
export function computePullRequestIconStatus(reader: IReaderWithStore, gitHubService: IGitHubService, owner: string, repo: string, livePR: IGitHubPullRequest): IPullRequestIconStatus {
	if (livePR.isDraft || livePR.state !== GitHubPullRequestState.Open) {
		return {};
	}

	const ciRef = reader.store.add(gitHubService.createPullRequestCIModelReference(owner, repo, livePR.number, livePR.headSha));
	const hasFailingChecks = ciRef.object.overallStatus.read(reader) === GitHubCIOverallStatus.Failure;

	const reviewThreadsRef = reader.store.add(gitHubService.createPullRequestReviewThreadsModelReference(owner, repo, livePR.number));
	const hasUnresolvedComments = reviewThreadsRef.object.reviewThreads.read(reader).some(thread => !thread.isResolved);

	return { hasFailingChecks, hasUnresolvedComments };
}

/**
 * Computes the session PR status icon from the live, shared pull-request model, refining
 * open pull requests with their {@link IPullRequestIconStatus} (failing CI, unresolved
 * comments). See {@link computePullRequestIconStatus}.
 */
export function computeLivePullRequestIcon(reader: IReaderWithStore, gitHubService: IGitHubService, owner: string, repo: string, livePR: IGitHubPullRequest): ThemeIcon {
	const status = computePullRequestIconStatus(reader, gitHubService, owner, repo, livePR);
	return computePullRequestIcon(livePR.isDraft ? 'draft' : livePR.state, status);
}
