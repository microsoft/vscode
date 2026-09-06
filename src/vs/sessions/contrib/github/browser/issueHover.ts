/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/issueHover.css';

import { $, append } from '../../../../base/browser/dom.js';
import { safeIntl } from '../../../../base/common/date.js';
import { localize } from '../../../../nls.js';
import { IGitHubIssue } from '../common/types.js';

const issueDateFormatter = safeIntl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export interface IIssueHoverData {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
	readonly repositoryHref: string;
	readonly issue: IGitHubIssue | undefined;
	readonly onDidClickRepository?: () => void;
}

export function createIssueHoverElement(data: IIssueHoverData): HTMLElement {
	const hoverElement = $('.sessions-issue-hover');

	const header = append(hoverElement, $('.sessions-issue-hover-header'));
	const repositoryLink = document.createElement('a');
	repositoryLink.className = 'sessions-issue-hover-repository';
	append(header, repositoryLink);
	repositoryLink.href = data.repositoryHref;
	repositoryLink.textContent = `${data.owner}/${data.repo}#${data.number}`;
	repositoryLink.title = repositoryLink.textContent;
	if (data.onDidClickRepository) {
		repositoryLink.onclick = event => {
			event.preventDefault();
			event.stopPropagation();
			data.onDidClickRepository?.();
		};
	}

	const date = formatIssueDate(data.issue?.createdAt);
	if (date) {
		append(header, $('span.sessions-issue-hover-date', undefined, localize('agentSessions.issueHover.onDate', "on {0}", date)));
	}

	append(hoverElement, $('.sessions-issue-hover-title', undefined, data.issue?.title || localize('agentSessions.issueHover.titleFallback', "Issue #{0}", data.number)));

	const body = data.issue?.body.trim() || localize('agentSessions.issueHover.bodyFallback', "No description provided.");
	const description = append(hoverElement, $('.sessions-issue-hover-description'));
	append(description, $('.sessions-issue-hover-description-content', undefined, body));

	return hoverElement;
}

function formatIssueDate(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return undefined;
	}

	return issueDateFormatter.value.format(date);
}
