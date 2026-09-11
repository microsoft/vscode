/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
// eslint-disable-next-line local/code-import-patterns
import { GitHubCIOverallStatus, GitHubIssueState, GitHubIssueStateReason, GitHubPullRequestState, type IGitHubIssue, type IGitHubPullRequest } from '../../../../../sessions/contrib/github/common/types.js';
// eslint-disable-next-line local/code-import-patterns
import { createIssueHoverElement } from '../../../../../sessions/contrib/github/browser/issueHover.js';
// eslint-disable-next-line local/code-import-patterns
import { createPullRequestHoverElement } from '../../../../../sessions/contrib/github/browser/pullRequestHover.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

import '../../../../../base/browser/ui/hover/hoverWidget.css';
import '../../../../../platform/hover/browser/hover.css';

const repositoryHref = 'https://github.com/microsoft/vscode';

function hoursAgo(hours: number): string {
	return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function createIssue(): IGitHubIssue {
	return {
		number: 335448,
		title: 'Show rich GitHub issue previews with title and rendered body in hovers',
		body: 'GitHub issue references currently show only a compact URL. This proposal adds enough inline context to understand the issue without leaving VS Code.',
		state: GitHubIssueState.Open,
		stateReason: undefined,
		author: { login: 'hediet', avatarUrl: '' },
		createdAt: hoursAgo(48),
		updatedAt: hoursAgo(5),
		closedAt: undefined,
	};
}

function createPullRequest(): IGitHubPullRequest {
	return {
		number: 335387,
		title: 'Preserve recorded GitHub titles in pills',
		body: 'Preserves issue and pull request titles when artifacts are promoted into dedicated GitHub pills, keeping the Agents Window and regular chat presentation consistent.',
		state: GitHubPullRequestState.Open,
		author: { login: 'chryw', avatarUrl: '' },
		headRef: 'agents/popup-title-for-issue',
		headSha: '02265cde4ce',
		baseRef: 'main',
		isDraft: false,
		createdAt: hoursAgo(72),
		updatedAt: hoursAgo(48),
		mergedAt: undefined,
		mergeable: true,
		mergeableState: 'clean',
	};
}

function createLongTitleIssue(): IGitHubIssue {
	return {
		...createIssue(),
		number: 335563,
		title: 'Copyright [yyyy] [name of copyright owner] Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0 unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.',
		state: GitHubIssueState.Closed,
		stateReason: GitHubIssueStateReason.NotPlanned,
		updatedAt: hoursAgo(24),
		closedAt: hoursAgo(24),
	};
}

function renderInHover(context: ComponentFixtureContext, content: HTMLElement, density: 'default' | 'compact'): void {
	const { container } = context;
	container.style.padding = '24px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
	if (density === 'compact') {
		content.classList.add('action-list-submenu-hover-header', 'content-owns-padding');
	}

	const hoverContainer = dom.append(container, dom.$('.workbench-hover-container'));
	const hover = dom.append(hoverContainer, dom.$('.monaco-hover.workbench-hover'));
	if (density === 'default') {
		hover.classList.add('compact', 'managed-hover-content-owns-padding');
	}
	hover.style.position = 'static';
	hover.style.display = 'inline-block';
	const hoverContent = dom.append(hover, dom.$('.monaco-hover-content'));
	const row = dom.append(hoverContent, dom.$('.hover-row.markdown-hover'));
	dom.append(row, dom.$('.hover-contents.html-hover-contents')).appendChild(content);
}

function renderIssueHover(context: ComponentFixtureContext, density: 'default' | 'compact', issue = createIssue()): void {
	const hover = createIssueHoverElement({
		owner: 'microsoft',
		repo: 'vscode',
		number: issue.number,
		repositoryHref,
		referenceHref: `${repositoryHref}/issues/${issue.number}`,
		issue,
		density,
	});
	renderInHover(context, hover, density);
}

function renderPullRequestHover(context: ComponentFixtureContext, density: 'default' | 'compact'): void {
	const pullRequest = createPullRequest();
	const hover = createPullRequestHoverElement({
		owner: 'microsoft',
		repo: 'vscode',
		number: pullRequest.number,
		repositoryHref,
		referenceHref: `${repositoryHref}/pull/${pullRequest.number}`,
		pullRequest,
		ciStatus: GitHubCIOverallStatus.Success,
		density,
		onDidClickBaseBranch: () => { },
		onDidClickHeadBranch: () => { },
	});
	renderInHover(context, hover, density);
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	GitHubReferenceHover_Issue: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderIssueHover(context, 'compact'),
	}),
	GitHubReferenceHover_PullRequest: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderPullRequestHover(context, 'compact'),
	}),
	GitHubReferenceHover_SingleIssue: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderIssueHover(context, 'default'),
	}),
	GitHubReferenceHover_SinglePullRequest: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderPullRequestHover(context, 'default'),
	}),
	GitHubReferenceHover_LongTitleCollectionIssue: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderIssueHover(context, 'compact', createLongTitleIssue()),
	}),
	GitHubReferenceHover_LongTitleSingleIssue: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderIssueHover(context, 'default', createLongTitleIssue()),
	}),
});
