/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
// eslint-disable-next-line local/code-import-patterns
import { GitHubIssueState, GitHubPullRequestState, type IGitHubIssue, type IGitHubPullRequest } from '../../../../../sessions/contrib/github/common/types.js';
// eslint-disable-next-line local/code-import-patterns
import { createIssueHoverElement } from '../../../../../sessions/contrib/github/browser/issueHover.js';
// eslint-disable-next-line local/code-import-patterns
import { createPullRequestHoverElement } from '../../../../../sessions/contrib/github/browser/pullRequestHover.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

import '../../../../../base/browser/ui/hover/hoverWidget.css';
import '../../../../../platform/hover/browser/hover.css';

const repositoryHref = 'https://github.com/microsoft/vscode';

const issue: IGitHubIssue = {
	number: 335448,
	title: 'Show rich GitHub issue previews with title and rendered body in hovers',
	body: 'GitHub issue references currently show only a compact URL. This proposal adds enough inline context to understand the issue without leaving VS Code.',
	state: GitHubIssueState.Open,
	stateReason: undefined,
	author: { login: 'hediet', avatarUrl: '' },
	createdAt: '2026-09-10T10:00:00Z',
	updatedAt: '2026-09-10T10:00:00Z',
	closedAt: undefined,
};

const pullRequest: IGitHubPullRequest = {
	number: 335387,
	title: 'Preserve recorded GitHub titles in pills',
	body: 'Preserves issue and pull request titles when artifacts are promoted into dedicated GitHub pills, keeping the Agents Window and regular chat presentation consistent.',
	state: GitHubPullRequestState.Merged,
	author: { login: 'chryw', avatarUrl: '' },
	headRef: 'agents/popup-title-for-issue',
	headSha: '02265cde4ce',
	baseRef: 'main',
	isDraft: false,
	createdAt: '2026-09-09T10:00:00Z',
	updatedAt: '2026-09-10T10:00:00Z',
	mergedAt: '2026-09-10T10:00:00Z',
	mergeable: true,
	mergeableState: 'clean',
};

function renderInHover(context: ComponentFixtureContext, content: HTMLElement): void {
	const { container } = context;
	container.style.padding = '24px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
	content.classList.add('action-list-submenu-hover-header');

	const hoverContainer = dom.append(container, dom.$('.workbench-hover-container'));
	const hover = dom.append(hoverContainer, dom.$('.monaco-hover.workbench-hover'));
	hover.style.position = 'static';
	hover.style.display = 'inline-block';
	const hoverContent = dom.append(hover, dom.$('.monaco-hover-content'));
	const row = dom.append(hoverContent, dom.$('.hover-row.markdown-hover'));
	dom.append(row, dom.$('.hover-contents.html-hover-contents')).appendChild(content);
}

function renderIssueHover(context: ComponentFixtureContext): void {
	const hover = createIssueHoverElement({
		owner: 'microsoft',
		repo: 'vscode',
		number: issue.number,
		repositoryHref,
		referenceHref: `${repositoryHref}/issues/${issue.number}`,
		issue,
		density: 'compact',
	});
	renderInHover(context, hover);
}

function renderPullRequestHover(context: ComponentFixtureContext): void {
	const hover = createPullRequestHoverElement({
		owner: 'microsoft',
		repo: 'vscode',
		number: pullRequest.number,
		repositoryHref,
		referenceHref: `${repositoryHref}/pull/${pullRequest.number}`,
		pullRequest,
		density: 'compact',
		onDidClickBaseBranch: () => { },
		onDidClickHeadBranch: () => { },
	});
	renderInHover(context, hover);
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	GitHubReferenceHover_Issue: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderIssueHover,
	}),
	GitHubReferenceHover_PullRequest: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderPullRequestHover,
	}),
});
