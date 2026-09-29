/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createPullRequestResourceHover, getPullRequestChecksStatusLabel as getResourceChecksStatusLabel, type GitHubChecksStatus, type IGitHubPullRequestHoverModel, type IGitHubResourceHover } from '../../../../workbench/contrib/github/browser/githubResourceHover.js';
import { GitHubCIOverallStatus, type IGitHubPullRequest } from '../common/types.js';

export interface IPullRequestHoverData {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
	readonly repositoryHref: string;
	readonly referenceHref: string;
	readonly pullRequest: IGitHubPullRequest;
	readonly ciStatus?: GitHubCIOverallStatus;
	readonly density: 'default' | 'compact';
	readonly onDidClickRepository?: () => void;
	readonly onDidClickReference?: () => void;
	readonly onDidClickBaseBranch?: () => void;
	readonly onDidClickHeadBranch?: () => void;
}

export type IPullRequestHover = IGitHubResourceHover;

export function createPullRequestHover(data: IPullRequestHoverData): IPullRequestHover {
	return createPullRequestResourceHover({
		...data,
		pullRequest: toPullRequestHoverModel(data.pullRequest),
		checksStatus: toChecksStatus(data.ciStatus),
	});
}

export function createPullRequestHoverElement(data: IPullRequestHoverData): HTMLElement {
	return createPullRequestHover(data).element;
}

/** Returns the localized CI summary shown in a pull request reference hover. */
export function getPullRequestChecksStatusLabel(pullRequest: IGitHubPullRequest, ciStatus: GitHubCIOverallStatus | undefined): string | undefined {
	return getResourceChecksStatusLabel(toPullRequestHoverModel(pullRequest), toChecksStatus(ciStatus));
}

function toPullRequestHoverModel(pullRequest: IGitHubPullRequest): IGitHubPullRequestHoverModel {
	return {
		...pullRequest,
	};
}

function toChecksStatus(ciStatus: GitHubCIOverallStatus | undefined): GitHubChecksStatus | undefined {
	switch (ciStatus) {
		case GitHubCIOverallStatus.Pending: return 'pending';
		case GitHubCIOverallStatus.Success: return 'success';
		case GitHubCIOverallStatus.Failure: return 'failure';
		case GitHubCIOverallStatus.Neutral: return 'neutral';
		case undefined: return undefined;
	}
}
