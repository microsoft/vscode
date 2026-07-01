/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { themeColorFromId } from '../../../../../base/common/themables.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IObservable, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
// eslint-disable-next-line local/code-import-patterns
import { IGitHubInfo, ISessionFolder, ISessionGitRepository, ISessionWorkspace } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { IActiveSession } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionContext, SessionContext } from '../../../../../sessions/services/sessions/browser/sessionContext.js';
// eslint-disable-next-line local/code-import-patterns
import { IGitHubPullRequest, GitHubPullRequestState } from '../../../../../sessions/contrib/github/common/types.js';
// eslint-disable-next-line local/code-import-patterns
import { IGitHubService } from '../../../../../sessions/contrib/github/browser/githubService.js';
// eslint-disable-next-line local/code-import-patterns
import { createPullRequestHoverElement } from '../../../../../sessions/contrib/github/browser/pullRequestHover.js';
// eslint-disable-next-line local/code-import-patterns
import { OpenPullRequestActionViewItem } from '../../../../../sessions/contrib/github/browser/pullRequestActions.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { createFixtureGitHubService } from './githubFixtureUtils.js';

// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/browser/parts/media/chatCompositeBar.css';
import '../../../../../base/browser/ui/hover/hoverWidget.css';
import '../../../../../platform/hover/browser/hover.css';

// ============================================================================
// Mock helpers
// ============================================================================

function createMockWorkspace(pullRequest: IGitHubInfo['pullRequest']): ISessionWorkspace {
	const root = URI.file('/home/user/projects/vscode');
	const gitHubInfo: IGitHubInfo = { owner: 'microsoft', repo: 'vscode', pullRequest };

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

function createMockSession(pullRequest: IGitHubInfo['pullRequest']): IActiveSession {
	return new class extends mock<IActiveSession>() {
		override readonly resource = URI.parse('session:1');
		override readonly workspace: IObservable<ISessionWorkspace | undefined> = observableValue('workspace', createMockWorkspace(pullRequest));
	}();
}

// ============================================================================
// Render helper
// ============================================================================

function renderPullRequestPill(ctx: ComponentFixtureContext, pullRequest: IGitHubInfo['pullRequest'], pullRequestDetails: IGitHubPullRequest): void {
	const { container, disposableStore } = ctx;

	const session = observableValue<IActiveSession | undefined>('session', createMockSession(pullRequest));

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			reg.defineInstance(ISessionContext, new SessionContext(session));
			reg.defineInstance(IGitHubService, createFixtureGitHubService([{ owner: 'microsoft', repo: 'vscode', pullRequest: pullRequestDetails }]));
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

	// Recreate the session header meta toolbar host so the inline-label styling
	// (.chat-composite-bar-meta-toolbar) applies as in production.
	const toolbar = document.createElement('div');
	toolbar.classList.add('chat-composite-bar-meta-toolbar');
	container.appendChild(toolbar);
	item.render(toolbar);

	container.style.padding = '8px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
}

function renderPullRequestHover(ctx: ComponentFixtureContext, pullRequest: IGitHubPullRequest): void {
	const { container } = ctx;

	container.style.padding = '24px';
	container.style.width = '580px';
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
	contents.appendChild(createPullRequestHoverElement({
		owner: 'microsoft',
		repo: 'vscode',
		number: pullRequest.number,
		repositoryHref: 'https://github.com/microsoft/vscode',
		pullRequest,
	}));
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

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'sessions/' }, {

	OpenPullRequest_Open: defineComponentFixture({
		render: (ctx) => renderPullRequestPill(ctx, openPr, openPullRequestDetails),
	}),

	OpenPullRequest_Draft: defineComponentFixture({
		render: (ctx) => renderPullRequestPill(ctx, draftPr, draftPullRequestDetails),
	}),

	OpenPullRequest_Hover: defineComponentFixture({
		render: (ctx) => renderPullRequestHover(ctx, openPullRequestDetails),
	}),
});
