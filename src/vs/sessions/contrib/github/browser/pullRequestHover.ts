/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/pullRequestHover.css';

import { $, append } from '../../../../base/browser/dom.js';
import { safeIntl } from '../../../../base/common/date.js';
import { localize } from '../../../../nls.js';
import { IGitHubPullRequest } from '../common/types.js';

const pullRequestDateFormatter = safeIntl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export interface IPullRequestHoverData {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
	readonly repositoryHref: string;
	readonly pullRequest: IGitHubPullRequest | undefined;
	readonly onDidClickRepository?: () => void;
}

export function createPullRequestHoverElement(data: IPullRequestHoverData): HTMLElement {
	const hoverElement = $('.sessions-pr-hover');

	const header = append(hoverElement, $('.sessions-pr-hover-header'));
	const repositoryLink = document.createElement('a');
	repositoryLink.className = 'sessions-pr-hover-repository';
	append(header, repositoryLink);
	repositoryLink.href = data.repositoryHref;
	repositoryLink.textContent = `${data.owner}/${data.repo}`;
	repositoryLink.title = repositoryLink.textContent;
	if (data.onDidClickRepository) {
		repositoryLink.onclick = event => {
			event.preventDefault();
			event.stopPropagation();
			data.onDidClickRepository?.();
		};
	}

	const date = formatPullRequestDate(data.pullRequest?.createdAt);
	if (date) {
		append(header, $('span.sessions-pr-hover-date', undefined, localize('agentSessions.pullRequestHover.onDate', "on {0}", date)));
	}

	append(hoverElement, $('.sessions-pr-hover-title', undefined, data.pullRequest?.title || localize('agentSessions.pullRequestHover.titleFallback', "Pull Request #{0}", data.number)));

	const body = data.pullRequest?.body.trim() || localize('agentSessions.pullRequestHover.bodyFallback', "No description provided.");
	append(hoverElement, $('.sessions-pr-hover-description', undefined, body));

	const branchRow = append(hoverElement, $('.sessions-pr-hover-branches'));
	appendBranchPill(branchRow, data.pullRequest?.baseRef || localize('agentSessions.pullRequestHover.baseFallback', "target"));
	append(branchRow, $('span.sessions-pr-hover-branch-arrow', undefined, '\u2190'));
	appendBranchPill(branchRow, data.pullRequest?.headRef || localize('agentSessions.pullRequestHover.headFallback', "source"));

	return hoverElement;
}

function appendBranchPill(container: HTMLElement, label: string): void {
	const branch = append(container, $('span.sessions-pr-hover-branch', undefined, label));
	branch.title = label;
}

function formatPullRequestDate(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return undefined;
	}

	return pullRequestDateFormatter.value.format(date);
}
