/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { toAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IObservable, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
// eslint-disable-next-line local/code-import-patterns
import { IGitHubInfo, IGitHubIssueRef, ISessionFolder, ISessionGitRepository, ISessionWorkspace } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { IActiveSession } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionContext, SessionContext } from '../../../../../sessions/services/sessions/browser/sessionContext.js';
// eslint-disable-next-line local/code-import-patterns
import { computeIssueIcon, GitHubIssueState, GitHubIssueStateReason, IGitHubIssue } from '../../../../../sessions/contrib/github/common/types.js';
// eslint-disable-next-line local/code-import-patterns
import { IGitHubService } from '../../../../../sessions/contrib/github/browser/githubService.js';
// eslint-disable-next-line local/code-import-patterns
import { createIssueHoverElement } from '../../../../../sessions/contrib/github/browser/issueHover.js';
// eslint-disable-next-line local/code-import-patterns
import { GitHubReferenceList } from '../../../../../sessions/contrib/github/browser/githubReferenceList.js';
// eslint-disable-next-line local/code-import-patterns
import { OpenIssueActionViewItem } from '../../../../../sessions/contrib/github/browser/issueActions.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { createFixtureGitHubService } from './githubFixtureUtils.js';

// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/browser/parts/media/chatCompositeBar.css';
import '../../../../../base/browser/ui/actionbar/actionbar.css';
import '../../../../../base/browser/ui/hover/hoverWidget.css';
import '../../../../../platform/hover/browser/hover.css';

// ============================================================================
// Mock helpers
// ============================================================================

function createMockWorkspace(issues: readonly IGitHubIssueRef[]): ISessionWorkspace {
	const root = URI.file('/home/user/projects/vscode');
	const gitHubInfo: IGitHubInfo = { owner: 'microsoft', repo: 'vscode', issues };

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

function createMockSession(issues: readonly IGitHubIssueRef[]): IActiveSession {
	return new class extends mock<IActiveSession>() {
		override readonly resource = URI.parse('session:1');
		override readonly workspace: IObservable<ISessionWorkspace | undefined> = observableValue('workspace', createMockWorkspace(issues));
	}();
}

function toIssueRef(issue: IGitHubIssue): IGitHubIssueRef {
	return {
		owner: 'microsoft',
		repo: 'vscode',
		number: issue.number,
		uri: URI.parse(`https://github.com/microsoft/vscode/issues/${issue.number}`),
	};
}

// ============================================================================
// Render helpers
// ============================================================================

function renderIssuePill(ctx: ComponentFixtureContext, issues: readonly IGitHubIssue[]): void {
	const { container, disposableStore } = ctx;

	const session = observableValue<IActiveSession | undefined>('session', createMockSession(issues.map(toIssueRef)));

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			reg.defineInstance(ISessionContext, new SessionContext(session));
			reg.defineInstance(IGitHubService, createFixtureGitHubService([], issues.map(issue => ({ owner: 'microsoft', repo: 'vscode', issue }))));
		},
	});

	// Build the real menu item action the session header contributes, then
	// render the production action view item against it.
	const action = instantiationService.createInstance(
		MenuItemAction,
		{ id: 'workbench.agentSessions.action.openIssue', title: 'Open Issue' },
		undefined,
		undefined,
		undefined,
		undefined,
	);

	const item = disposableStore.add(instantiationService.createInstance(OpenIssueActionViewItem, action, {}));

	// Host the metadata action with its inline-label styling.
	const toolbar = document.createElement('div');
	toolbar.classList.add('session-metadata-pill-toolbar');
	container.appendChild(toolbar);
	item.render(toolbar);

	container.style.padding = '8px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
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

function renderIssueHover(ctx: ComponentFixtureContext, issue: IGitHubIssue): void {
	renderInHoverWidget(ctx, createIssueHoverElement({
		owner: 'microsoft',
		repo: 'vscode',
		number: issue.number,
		repositoryHref: 'https://github.com/microsoft/vscode',
		issue,
	}), '580px');
}

function renderIssueList(ctx: ComponentFixtureContext, issues: readonly IGitHubIssue[]): void {
	const list = ctx.disposableStore.add(new GitHubReferenceList(issues.map(issue => ({
		number: issue.number,
		title: issue.title,
		icon: computeIssueIcon(issue.state, issue.stateReason),
		toolbarActions: [toAction({
			id: 'fixture.copyIssueLink',
			label: 'Copy Issue Link',
			class: ThemeIcon.asClassName(Codicon.copy),
			run: () => { },
		})],
	})), () => { }));
	renderInHoverWidget(ctx, list.element, '480px');
}

// ============================================================================
// Data
// ============================================================================

const openIssue: IGitHubIssue = {
	number: 12345,
	title: 'Terminal hangs when running a long build task in a detached worktree',
	body: 'Steps to reproduce: open a session on a worktree, start `npm run watch`, then switch to another session. The terminal stops streaming output and the task never reports completion.',
	state: GitHubIssueState.Open,
	stateReason: undefined,
	author: { login: 'hariharjeevan', avatarUrl: '' },
	createdAt: '2026-06-22T10:00:00Z',
	updatedAt: '2026-06-24T12:00:00Z',
	closedAt: undefined,
};

const shortDescriptionIssue: IGitHubIssue = {
	...openIssue,
	body: 'The terminal stops streaming output.',
};

const longDescriptionIssue: IGitHubIssue = {
	...openIssue,
	body: 'Steps to reproduce: open a session on a worktree, start a long-running build, and switch to another session while output is still streaming. Return to the original session and observe that the terminal no longer updates even though the task is still running. The task also never reports completion, so it is unclear whether the build finished, failed, or remains active in the background. This description is intentionally long enough to exceed three lines and verify that the issue hover clamps the text without revealing any part of a fourth line.',
};

const completedIssue: IGitHubIssue = {
	number: 678,
	title: 'Session header pill should show the referenced issue',
	body: 'The session header already surfaces the pull request. It should do the same for the GitHub issues the user referenced in their messages.',
	state: GitHubIssueState.Closed,
	stateReason: GitHubIssueStateReason.Completed,
	author: { login: 'alex', avatarUrl: '' },
	createdAt: '2026-06-05T10:00:00Z',
	updatedAt: '2026-06-18T09:30:00Z',
	closedAt: '2026-06-18T09:30:00Z',
};

const notPlannedIssue: IGitHubIssue = {
	number: 42,
	title: 'Add a setting to disable issue detection entirely, including for cross-repository references',
	body: 'Not planned — the pill is already scoped to explicit references.',
	state: GitHubIssueState.Closed,
	stateReason: GitHubIssueStateReason.NotPlanned,
	author: { login: 'alex', avatarUrl: '' },
	createdAt: '2026-05-30T10:00:00Z',
	updatedAt: '2026-06-02T08:00:00Z',
	closedAt: '2026-06-02T08:00:00Z',
};

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'sessions/' }, {

	OpenIssue_Single: defineComponentFixture({
		render: (ctx) => renderIssuePill(ctx, [openIssue]),
	}),

	OpenIssue_Closed: defineComponentFixture({
		render: (ctx) => renderIssuePill(ctx, [completedIssue]),
	}),

	OpenIssue_Multiple: defineComponentFixture({
		render: (ctx) => renderIssuePill(ctx, [openIssue, completedIssue, notPlannedIssue]),
	}),

	OpenIssue_Hover: defineComponentFixture({
		render: (ctx) => renderIssueHover(ctx, shortDescriptionIssue),
	}),

	OpenIssue_Hover_LongDescription: defineComponentFixture({
		render: (ctx) => renderIssueHover(ctx, longDescriptionIssue),
	}),

	OpenIssue_List: defineComponentFixture({
		render: (ctx) => renderIssueList(ctx, [openIssue, completedIssue, notPlannedIssue]),
	}),
});
