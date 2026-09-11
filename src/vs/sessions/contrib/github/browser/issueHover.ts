/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/issueHover.css';

import { $, append } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { computeIssueIcon, GitHubIssueState, GitHubIssueStateReason, IGitHubIssue } from '../common/types.js';
import { appendGitHubHoverTitle, getGitHubHoverDate, getGitHubHoverDescription } from './githubHover.js';

export interface IIssueHoverData {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
	readonly repositoryHref: string;
	readonly referenceHref: string;
	readonly issue: IGitHubIssue;
	readonly density: 'default' | 'compact';
	readonly onDidClickRepository?: () => void;
	readonly onDidClickReference?: () => void;
}

export interface IIssueHover {
	readonly element: HTMLElement;
	readonly tabbableElements: readonly HTMLElement[];
}

export function createIssueHover(data: IIssueHoverData): IIssueHover {
	const hoverElement = $('.sessions-issue-hover');
	hoverElement.classList.toggle('compact', data.density === 'compact');

	const header = append(hoverElement, $('.sessions-issue-hover-header'));
	const repositoryLink = appendHoverLink(header, 'sessions-issue-hover-repository', data.repositoryHref, `${data.owner}/${data.repo}`, data.onDidClickRepository);
	const createdAt = getGitHubHoverDate(data.issue.createdAt);
	if (createdAt) {
		append(header, $('span.sessions-issue-hover-date', undefined, localize('agentSessions.issueHover.createdDate', "on {0}", createdAt)));
	}

	const title = data.issue.title || localize('agentSessions.issueHover.titleFallback', "Issue #{0}", data.number);
	const titleElement = append(hoverElement, $('.sessions-issue-hover-title'));
	const titleContent = append(titleElement, $('.sessions-issue-hover-title-content'));
	const titleLayout = appendGitHubHoverTitle(titleContent, title, 'sessions-issue-hover-title-tail');
	const referenceLink = appendHoverLink(titleLayout.referenceContainer, 'sessions-issue-hover-reference', data.referenceHref, `#${data.number}`, data.onDidClickReference, localize('agentSessions.issueHover.reference', "Issue #{0}", data.number));
	referenceLink.onfocus = titleLayout.showFullTitle;
	referenceLink.onblur = titleLayout.showBoundedTitle;
	titleElement.title = title;

	const statusRow = append(hoverElement, $('.sessions-issue-hover-status-row'));
	const status = getIssueStatus(data.issue);
	const statusElement = append(statusRow, $('span.sessions-issue-hover-status'));
	statusElement.dataset.state = status.kind;
	const statusIcon = computeIssueIcon(data.issue.state, data.issue.stateReason);
	const statusIconElement = append(statusElement, renderIcon(statusIcon));
	statusIconElement.setAttribute('aria-hidden', 'true');
	if (statusIcon.color) {
		statusIconElement.style.color = asCssVariable(statusIcon.color.id);
	}
	append(statusElement, $('span.sessions-issue-hover-status-label', undefined, status.label));

	const body = getGitHubHoverDescription(data.issue.body, localize('agentSessions.issueHover.bodyFallback', "No description provided."));
	const description = append(hoverElement, $('.sessions-issue-hover-description'));
	append(description, $('.sessions-issue-hover-description-content', undefined, body));

	append(hoverElement, $('.sessions-issue-hover-author', undefined, localize('agentSessions.issueHover.author', "@{0} opened this issue", data.issue.author.login)));

	return { element: hoverElement, tabbableElements: [repositoryLink, referenceLink] };
}

export function createIssueHoverElement(data: IIssueHoverData): HTMLElement {
	return createIssueHover(data).element;
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

function getIssueStatus(issue: IGitHubIssue): { readonly kind: 'open' | 'closed' | 'notPlanned' | 'duplicate'; readonly label: string } {
	if (issue.state === GitHubIssueState.Open) {
		return { kind: 'open', label: localize('agentSessions.issueHover.open', "Open") };
	}
	if (issue.stateReason === GitHubIssueStateReason.Duplicate) {
		return { kind: 'duplicate', label: localize('agentSessions.issueHover.duplicate', "Duplicate") };
	}
	if (issue.stateReason === GitHubIssueStateReason.NotPlanned) {
		return { kind: 'notPlanned', label: localize('agentSessions.issueHover.notPlanned', "Not planned") };
	}
	return { kind: 'closed', label: localize('agentSessions.issueHover.closed', "Closed") };
}
