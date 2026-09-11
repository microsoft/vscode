/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/issueHover.css';

import { $, append } from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { GitHubIssueState, GitHubIssueStateReason, IGitHubIssue } from '../common/types.js';
import { getGitHubHoverDescription, getGitHubHoverRelativeTime } from './githubHover.js';

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
	append(header, $('span.sessions-issue-hover-separator', { 'aria-hidden': 'true' }, '\u00b7'));
	const referenceLink = appendHoverLink(header, 'sessions-issue-hover-reference', data.referenceHref, `#${data.number}`, data.onDidClickReference, localize('agentSessions.issueHover.reference', "Issue #{0}", data.number));
	append(header, $('span.sessions-issue-hover-separator', { 'aria-hidden': 'true' }, '\u00b7'));
	const status = getIssueStatus(data.issue);
	const statusElement = append(header, $('span.sessions-issue-hover-status', undefined, status.label));
	statusElement.dataset.state = status.kind;

	const date = getIssueDate(data.issue);
	if (date) {
		if (date.separate) {
			append(header, $('span.sessions-issue-hover-separator', { 'aria-hidden': 'true' }, '\u00b7'));
		}
		append(header, $('span.sessions-issue-hover-date', undefined, date.label));
	}

	const title = data.issue.title || localize('agentSessions.issueHover.titleFallback', "Issue #{0}", data.number);
	const titleElement = append(hoverElement, $('.sessions-issue-hover-title'));
	append(titleElement, $('.sessions-issue-hover-title-content', undefined, title));
	titleElement.title = title;

	const body = getGitHubHoverDescription(data.issue.body, localize('agentSessions.issueHover.bodyFallback', "No description provided."));
	const description = append(hoverElement, $('.sessions-issue-hover-description'));
	append(description, $('.sessions-issue-hover-description-content', undefined, body));

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

function getIssueStatus(issue: IGitHubIssue): { readonly kind: 'open' | 'closed' | 'notPlanned'; readonly label: string } {
	if (issue.state === GitHubIssueState.Open) {
		return { kind: 'open', label: localize('agentSessions.issueHover.open', "Open") };
	}
	if (issue.stateReason === GitHubIssueStateReason.NotPlanned || issue.stateReason === GitHubIssueStateReason.Duplicate) {
		return { kind: 'notPlanned', label: localize('agentSessions.issueHover.notPlanned', "Not planned") };
	}
	return { kind: 'closed', label: localize('agentSessions.issueHover.closed', "Closed") };
}

function getIssueDate(issue: IGitHubIssue): { readonly label: string; readonly separate: boolean } | undefined {
	if (issue.state === GitHubIssueState.Closed && issue.closedAt) {
		const closed = getGitHubHoverRelativeTime(issue.closedAt);
		if (closed) {
			return { label: closed, separate: false };
		}
	}
	const updated = getGitHubHoverRelativeTime(issue.updatedAt);
	if (updated) {
		return { label: localize('agentSessions.issueHover.updatedDate', "updated {0}", updated), separate: true };
	}
	const opened = getGitHubHoverRelativeTime(issue.createdAt);
	return opened ? { label: localize('agentSessions.issueHover.openedDate', "opened {0}", opened), separate: true } : undefined;
}
