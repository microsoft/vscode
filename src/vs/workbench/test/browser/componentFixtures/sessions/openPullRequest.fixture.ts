/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { toAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon, themeColorFromId } from '../../../../../base/common/themables.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IObservable, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
// eslint-disable-next-line local/code-import-patterns
import { IGitHubInfo, IGitHubPullRequestRef, ISessionFolder, ISessionGitRepository, ISessionWorkspace } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { IActiveSession } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionContext, SessionContext } from '../../../../../sessions/services/sessions/browser/sessionContext.js';
// eslint-disable-next-line local/code-import-patterns
import { computePullRequestIcon, IGitHubPullRequest, GitHubPullRequestState } from '../../../../../sessions/contrib/github/common/types.js';
// eslint-disable-next-line local/code-import-patterns
import { IGitHubService } from '../../../../../sessions/contrib/github/browser/githubService.js';
// eslint-disable-next-line local/code-import-patterns
import { createPullRequestHoverElement } from '../../../../../sessions/contrib/github/browser/pullRequestHover.js';
// eslint-disable-next-line local/code-import-patterns
import { OpenPullRequestActionViewItem } from '../../../../../sessions/contrib/github/browser/pullRequestActions.js';
// eslint-disable-next-line local/code-import-patterns
import { IPullRequestIconCache } from '../../../../../sessions/contrib/github/browser/pullRequestIconCache.js';
// eslint-disable-next-line local/code-import-patterns
import { GitHubReferenceList } from '../../../../../sessions/contrib/github/browser/githubReferenceList.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { createFixtureGitHubService, createFixturePullRequestIconCache } from './githubFixtureUtils.js';

// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/browser/parts/media/chatCompositeBar.css';
import '../../../../../base/browser/ui/actionbar/actionbar.css';
import '../../../../../base/browser/ui/hover/hoverWidget.css';
import '../../../../../platform/hover/browser/hover.css';

// ============================================================================
// Mock helpers
// ============================================================================

function createMockWorkspace(pullRequest: IGitHubInfo['pullRequest'], pullRequests: readonly IGitHubPullRequestRef[]): ISessionWorkspace {
	const root = URI.file('/home/user/projects/vscode');
	const gitHubInfo: IGitHubInfo = { owner: 'microsoft', repo: 'vscode', pullRequest, pullRequests };

	const gitRepository: ISessionGitRepository = {
		uri: root,
		workTreeUri: undefined,
		baseBranchName: 'main',
		gitHubInfo: constObservable(gitHubInfo),
	};

	const folder: ISessionFolder = {
		root,
		workingDirectory: root,
		name: 'vscode',
		description: undefined,
		gitRepository,
	};

	return {
		uri: root,
		label: 'vscode',
		icon: Codicon.folder,
		folders: [folder],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
}

function createMockSession(pullRequest: IGitHubInfo['pullRequest'], pullRequests: readonly IGitHubPullRequestRef[]): IActiveSession {
	return new class extends mock<IActiveSession>() {
		override readonly resource = URI.parse('session:1');
		override readonly workspace: IObservable<ISessionWorkspace | undefined> = observableValue('workspace', createMockWorkspace(pullRequest, pullRequests));
	}();
}

// ============================================================================
// Render helper
// ============================================================================

function renderPullRequestPill(ctx: ComponentFixtureContext, pullRequest: IGitHubInfo['pullRequest'], pullRequestDetails: readonly IGitHubPullRequest[]): void {
	const { container, disposableStore } = ctx;

	const pullRequests = pullRequestDetails.map(details => ({
		owner: 'microsoft',
		repo: 'vscode',
		number: details.number,
		uri: URI.parse(`https://github.com/microsoft/vscode/pull/${details.number}`),
	}));
	const session = observableValue<IActiveSession | undefined>('session', createMockSession(pullRequest, pullRequests));

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			reg.defineInstance(ISessionContext, new SessionContext(session));
			reg.defineInstance(IGitHubService, createFixtureGitHubService(pullRequestDetails.map(details => ({ owner: 'microsoft', repo: 'vscode', pullRequest: details }))));
			reg.defineInstance(IPullRequestIconCache, createFixturePullRequestIconCache());
		},
	});

	// Build the real menu item action the session header contributes, then
	// render the production action view item against it.
	const action = instantiationService.createInstance(
		MenuItemAction,
		{ id: 'workbench.agentSessions.action.openPullRequest', title: 'Open Pull Request' },
		undefined,
		undefined,
		undefined,
		undefined,
	);

	const item = disposableStore.add(instantiationService.createInstance(OpenPullRequestActionViewItem, action, {}));

	// Host the metadata action with its inline-label styling.
	const toolbar = document.createElement('div');
	toolbar.classList.add('session-metadata-pill-toolbar');
	container.appendChild(toolbar);
	item.render(toolbar);

	container.style.padding = '8px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
}

function renderPullRequestList(ctx: ComponentFixtureContext, pullRequests: readonly IGitHubPullRequest[]): void {
	const list = ctx.disposableStore.add(new GitHubReferenceList(pullRequests.map(pullRequest => ({
		number: pullRequest.number,
		title: pullRequest.title,
		icon: computePullRequestIcon(pullRequest.isDraft ? 'draft' : pullRequest.state),
		toolbarActions: [toAction({
			id: 'fixture.copyPullRequestLink',
			label: 'Copy Pull Request Link',
			class: ThemeIcon.asClassName(Codicon.copy),
			run: () => { },
		})],
	})), () => { }));
	renderInHoverWidget(ctx, list.element, '480px');
}

function renderPullRequestHover(ctx: ComponentFixtureContext, pullRequest: IGitHubPullRequest): void {
	renderInHoverWidget(ctx, createPullRequestHoverElement({
		owner: 'microsoft',
		repo: 'vscode',
		number: pullRequest.number,
		repositoryHref: 'https://github.com/microsoft/vscode',
		pullRequest,
	}), '580px');
}

function renderInHoverWidget(ctx: ComponentFixtureContext, content: HTMLElement, width: string): void {
	const { container } = ctx;

	container.style.padding = '24px';
	container.style.width = width;
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
	const hover = document.createElement('div');
	hover.classList.add('monaco-hover', 'workbench-hover');
	hover.style.position = 'static';
	hover.style.display = 'inline-block';

	const row = document.createElement('div');
	row.classList.add('hover-row', 'markdown-hover');
	hover.appendChild(row);

	const contents = document.createElement('div');
	contents.classList.add('hover-contents', 'html-hover-contents');
	contents.appendChild(content);
	row.appendChild(contents);

	container.appendChild(hover);
}

const openPr: IGitHubInfo['pullRequest'] = {
	number: 12345,
	uri: URI.parse('https://github.com/microsoft/vscode/pull/12345'),
	icon: { ...Codicon.gitPullRequest, color: themeColorFromId('charts.green') },
};

const draftPr: IGitHubInfo['pullRequest'] = {
	number: 678,
	uri: URI.parse('https://github.com/microsoft/vscode/pull/678'),
	icon: { ...Codicon.gitPullRequestDraft, color: themeColorFromId('descriptionForeground') },
};

const openPullRequestDetails: IGitHubPullRequest = {
	number: openPr.number,
	title: 'fix: suppress expected EPIPE error on graceful client disconnect',
	body: 'Problem On every graceful client disconnect, the server logs an [error] Error: Unexpected EPIPE. This makes the expected disconnect path look like a real server failure and makes log scanning noisy for people investigating connection issues.',
	state: GitHubPullRequestState.Open,
	author: { login: 'hariharjeevan', avatarUrl: '' },
	headRef: 'fix-suppress-expected-epipe-error',
	headSha: 'abc123',
	baseRef: 'main',
	isDraft: false,
	createdAt: '2026-06-22T10:00:00Z',
	updatedAt: '2026-06-22T12:00:00Z',
	mergedAt: undefined,
	mergeable: true,
	mergeableState: 'clean',
};

const shortDescriptionPullRequest: IGitHubPullRequest = {
	...openPullRequestDetails,
	body: 'Suppresses the expected EPIPE error on graceful disconnect.',
};

const longDescriptionPullRequest: IGitHubPullRequest = {
	...openPullRequestDetails,
	body: 'Every graceful client disconnect currently logs an unexpected EPIPE error. This makes a routine shutdown look like a server failure and adds noise for anyone scanning logs while investigating connection issues. The change recognizes the expected disconnect path and avoids reporting it as an error while preserving diagnostics for unexpected failures. This description is intentionally long enough to exceed three lines and verify that the pull request hover clamps the text without revealing any part of a fourth line.',
};

const draftPullRequestDetails: IGitHubPullRequest = {
	...openPullRequestDetails,
	number: draftPr.number,
	title: 'draft: add session PR hover content',
	body: 'Adds the first pass of the session header pull request hover with intentionally long branch names so truncation can be reviewed in component fixtures.',
	state: GitHubPullRequestState.Open,
	headRef: 'users/alex/very-long-session-pr-hover-fixture-branch-name',
	isDraft: true,
	createdAt: '2026-06-05T10:00:00Z',
};

const mergedPullRequestDetails: IGitHubPullRequest = {
	...openPullRequestDetails,
	number: 42,
	title: 'refactor: share the GitHub reference picker row',
	state: GitHubPullRequestState.Merged,
	headRef: 'refactor/github-reference-list',
	createdAt: '2026-05-15T10:00:00Z',
	mergedAt: '2026-05-18T09:30:00Z',
};

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'sessions/' }, {

	OpenPullRequest_Open: defineComponentFixture({
		render: (ctx) => renderPullRequestPill(ctx, openPr, [openPullRequestDetails]),
	}),

	OpenPullRequest_Draft: defineComponentFixture({
		render: (ctx) => renderPullRequestPill(ctx, draftPr, [draftPullRequestDetails]),
	}),

	OpenPullRequest_Multiple: defineComponentFixture({
		render: (ctx) => renderPullRequestPill(ctx, openPr, [openPullRequestDetails, draftPullRequestDetails, mergedPullRequestDetails]),
	}),

	OpenPullRequest_Hover: defineComponentFixture({
		render: (ctx) => renderPullRequestHover(ctx, shortDescriptionPullRequest),
	}),

	OpenPullRequest_Hover_LongDescription: defineComponentFixture({
		render: (ctx) => renderPullRequestHover(ctx, longDescriptionPullRequest),
	}),

	OpenPullRequest_List: defineComponentFixture({
		render: (ctx) => renderPullRequestList(ctx, [openPullRequestDetails, draftPullRequestDetails, mergedPullRequestDetails]),
	}),
});
