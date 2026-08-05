/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/issueHover.css';

import { $, append } from '../../../../base/browser/dom.js';
import { safeIntl } from '../../../../base/common/date.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
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
	append(hoverElement, $('.sessions-issue-hover-description', undefined, body));

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

/** One row of the multi-issue list shown when a session references several issues. */
export interface IIssueListEntry {
	readonly number: number;
	readonly title: string | undefined;
	readonly icon: ThemeIcon;
}

/**
 * Renders the session's issues as a list of `<icon> #<number> <title>` rows. Each row
 * is a button so it is reachable by keyboard when the containing popup traps focus.
 */
export function createIssueListElement<T extends IIssueListEntry>(entries: readonly T[], onDidSelect: (entry: T) => void): HTMLElement {
	const listElement = $('.sessions-issue-list', { role: 'list' });

	for (const entry of entries) {
		const row = append(listElement, $('button.sessions-issue-list-entry', { role: 'listitem', type: 'button' }));
		row.onclick = event => {
			event.preventDefault();
			event.stopPropagation();
			onDidSelect(entry);
		};

		const icon = append(row, $(`span.sessions-issue-list-entry-icon${ThemeIcon.asCSSSelector(entry.icon)}`));
		if (entry.icon.color) {
			icon.style.color = asCssVariable(entry.icon.color.id);
		}

		append(row, $('span.sessions-issue-list-entry-number', undefined, `#${entry.number}`));

		const title = entry.title;
		if (title) {
			const titleElement = append(row, $('span.sessions-issue-list-entry-title', undefined, title));
			titleElement.title = title;
		}
	}

	return listElement;
}
