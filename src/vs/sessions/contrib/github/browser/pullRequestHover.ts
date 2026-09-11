/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/pullRequestHover.css';

import { $, append } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { computePullRequestIcon, GitHubPullRequestState, IGitHubPullRequest } from '../common/types.js';
import { appendGitHubHoverTitle, getGitHubHoverDate, getGitHubHoverDescription } from './githubHover.js';

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
	const createdAt = getGitHubHoverDate(data.pullRequest.createdAt);
	if (createdAt) {
		append(header, $('span.sessions-pr-hover-date', undefined, localize('agentSessions.pullRequestHover.createdDate', "on {0}", createdAt)));
	}

	const title = data.pullRequest.title || localize('agentSessions.pullRequestHover.titleFallback', "Pull Request #{0}", data.number);
	const titleElement = append(hoverElement, $('.sessions-pr-hover-title'));
	const titleContent = append(titleElement, $('.sessions-pr-hover-title-content'));
	const titleLayout = appendGitHubHoverTitle(titleContent, title, 'sessions-pr-hover-title-tail');
	const referenceLink = appendHoverLink(titleLayout.referenceContainer, 'sessions-pr-hover-reference', data.referenceHref, `#${data.number}`, data.onDidClickReference, localize('agentSessions.pullRequestHover.reference', "Pull Request #{0}", data.number));
	referenceLink.onfocus = titleLayout.showFullTitle;
	referenceLink.onblur = titleLayout.showBoundedTitle;
	titleElement.title = title;

	const statusRow = append(hoverElement, $('.sessions-pr-hover-status-row'));
	const status = getPullRequestStatus(data.pullRequest);
	const statusElement = append(statusRow, $('span.sessions-pr-hover-status'));
	statusElement.dataset.state = status.kind;
	const statusIcon = computePullRequestIcon(status.kind);
	const statusIconElement = append(statusElement, renderIcon(statusIcon));
	statusIconElement.setAttribute('aria-hidden', 'true');
	if (statusIcon.color) {
		statusIconElement.style.color = asCssVariable(statusIcon.color.id);
	}
	append(statusElement, $('span.sessions-pr-hover-status-label', undefined, status.label));

	const body = getGitHubHoverDescription(data.pullRequest.body, localize('agentSessions.pullRequestHover.bodyFallback', "No description provided."));
	const description = append(hoverElement, $('.sessions-pr-hover-description'));
	append(description, $('.sessions-pr-hover-description-content', undefined, body));

	const branchRow = append(hoverElement, $('.sessions-pr-hover-branches'));
	const baseBranch = appendBranchPill(branchRow, data.pullRequest.baseRef || localize('agentSessions.pullRequestHover.baseFallback', "target"), 'base', data.onDidClickBaseBranch);
	const branchArrow = append(branchRow, $('span.sessions-pr-hover-branch-arrow', undefined, '\u2190'));
	branchArrow.setAttribute('aria-hidden', 'true');
	const headBranch = appendBranchPill(branchRow, data.pullRequest.headRef || localize('agentSessions.pullRequestHover.headFallback', "source"), 'head', data.onDidClickHeadBranch);

	append(hoverElement, $('.sessions-pr-hover-author', undefined, localize('agentSessions.pullRequestHover.author', "@{0} opened this pull request", data.pullRequest.author.login)));

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
