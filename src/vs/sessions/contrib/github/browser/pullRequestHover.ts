/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/pullRequestHover.css';

import { $, append } from '../../../../base/browser/dom.js';
import { safeIntl } from '../../../../base/common/date.js';
import { localize } from '../../../../nls.js';
import { GitHubPullRequestState, IGitHubPullRequest } from '../common/types.js';
import { getGitHubHoverDescription } from './githubHover.js';

const pullRequestDateFormatter = safeIntl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export interface IPullRequestHoverData {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
	readonly repositoryHref: string;
	readonly referenceHref: string;
	readonly pullRequest: IGitHubPullRequest;
	readonly density: 'default' | 'compact';
	readonly onDidClickRepository?: () => void;
	readonly onDidClickReference?: () => void;
	readonly onDidClickBaseBranch?: () => void;
	readonly onDidClickHeadBranch?: () => void;
}

export interface IPullRequestHover {
	readonly element: HTMLElement;
	readonly tabbableElements: readonly HTMLElement[];
}

export function createPullRequestHover(data: IPullRequestHoverData): IPullRequestHover {
	const hoverElement = $('.sessions-pr-hover');
	hoverElement.classList.toggle('compact', data.density === 'compact');

	const header = append(hoverElement, $('.sessions-pr-hover-header'));
	const repositoryLink = appendHoverLink(header, 'sessions-pr-hover-repository', data.repositoryHref, `${data.owner}/${data.repo}`, data.onDidClickRepository);
	append(header, $('span.sessions-pr-hover-separator', { 'aria-hidden': 'true' }, '\u00b7'));
	const referenceLink = appendHoverLink(header, 'sessions-pr-hover-reference', data.referenceHref, `#${data.number}`, data.onDidClickReference, localize('agentSessions.pullRequestHover.reference', "Pull Request #{0}", data.number));
	append(header, $('span.sessions-pr-hover-separator', { 'aria-hidden': 'true' }, '\u00b7'));
	const status = getPullRequestStatus(data.pullRequest);
	const statusElement = append(header, $('span.sessions-pr-hover-status', undefined, status.label));
	statusElement.dataset.state = status.kind;

	const date = getPullRequestDate(data.pullRequest);
	if (date) {
		append(header, $('span.sessions-pr-hover-date', undefined, date));
	}

	append(hoverElement, $('.sessions-pr-hover-title', undefined, data.pullRequest.title || localize('agentSessions.pullRequestHover.titleFallback', "Pull Request #{0}", data.number)));

	const body = getGitHubHoverDescription(data.pullRequest.body, localize('agentSessions.pullRequestHover.bodyFallback', "No description provided."));
	const description = append(hoverElement, $('.sessions-pr-hover-description'));
	append(description, $('.sessions-pr-hover-description-content', undefined, body));

	const branchRow = append(hoverElement, $('.sessions-pr-hover-branches'));
	const baseBranch = appendBranchPill(branchRow, data.pullRequest.baseRef || localize('agentSessions.pullRequestHover.baseFallback', "target"), 'base', data.onDidClickBaseBranch);
	append(branchRow, $('span.sessions-pr-hover-branch-arrow', undefined, '\u2190'));
	const headBranch = appendBranchPill(branchRow, data.pullRequest.headRef || localize('agentSessions.pullRequestHover.headFallback', "source"), 'head', data.onDidClickHeadBranch);

	return {
		element: hoverElement,
		tabbableElements: [repositoryLink, referenceLink, ...(baseBranch ? [baseBranch] : []), ...(headBranch ? [headBranch] : [])],
	};
}

export function createPullRequestHoverElement(data: IPullRequestHoverData): HTMLElement {
	return createPullRequestHover(data).element;
}

function appendHoverLink(container: HTMLElement, className: string, href: string, label: string, onDidClick: (() => void) | undefined, ariaLabel?: string): HTMLAnchorElement {
	const link = document.createElement('a');
	link.className = className;
	link.href = href;
	link.textContent = label;
	link.title = label;
	if (ariaLabel) {
		link.setAttribute('aria-label', ariaLabel);
	}
	if (onDidClick) {
		link.onclick = event => {
			event.preventDefault();
			event.stopPropagation();
			onDidClick();
		};
	}
	append(container, link);
	return link;
}

function getPullRequestStatus(pullRequest: IGitHubPullRequest): { readonly kind: 'open' | 'closed' | 'merged' | 'draft'; readonly label: string } {
	if (pullRequest.state === GitHubPullRequestState.Merged) {
		return { kind: 'merged', label: localize('agentSessions.pullRequestHover.merged', "Merged") };
	}
	if (pullRequest.state === GitHubPullRequestState.Closed) {
		return { kind: 'closed', label: localize('agentSessions.pullRequestHover.closed', "Closed") };
	}
	if (pullRequest.isDraft) {
		return { kind: 'draft', label: localize('agentSessions.pullRequestHover.draft', "Draft") };
	}
	return { kind: 'open', label: localize('agentSessions.pullRequestHover.open', "Open") };
}

function getPullRequestDate(pullRequest: IGitHubPullRequest): string | undefined {
	const transitionedAt = pullRequest.state === GitHubPullRequestState.Merged
		? pullRequest.mergedAt
		: pullRequest.state === GitHubPullRequestState.Closed
			? pullRequest.closedAt
			: undefined;
	if (transitionedAt) {
		const transitioned = formatPullRequestDate(transitionedAt);
		if (transitioned) {
			return transitioned;
		}
	}
	const updated = formatPullRequestDate(pullRequest.updatedAt);
	if (updated) {
		return localize('agentSessions.pullRequestHover.updatedDate', "updated {0}", updated);
	}
	const opened = formatPullRequestDate(pullRequest.createdAt);
	return opened ? localize('agentSessions.pullRequestHover.openedDate', "opened {0}", opened) : undefined;
}

function appendBranchPill(container: HTMLElement, label: string, kind: 'base' | 'head', onDidClick: (() => void) | undefined): HTMLButtonElement | undefined {
	if (!onDidClick) {
		const branch = append(container, $('span.sessions-pr-hover-branch', undefined, label));
		branch.title = label;
		return undefined;
	}

	const branch = document.createElement('button');
	branch.type = 'button';
	branch.className = 'sessions-pr-hover-branch';
	branch.textContent = label;
	const actionLabel = kind === 'base'
		? localize('agentSessions.pullRequestHover.copyBaseBranch', "Copy base branch {0}", label)
		: localize('agentSessions.pullRequestHover.copyHeadBranch', "Copy head branch {0}", label);
	branch.title = actionLabel;
	branch.setAttribute('aria-label', actionLabel);
	branch.onclick = onDidClick;
	append(container, branch);
	return branch;
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
