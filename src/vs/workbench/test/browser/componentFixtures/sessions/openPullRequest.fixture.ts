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
import { OpenPullRequestActionViewItem } from '../../../../../sessions/contrib/github/browser/pullRequestActions.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/browser/parts/media/chatCompositeBar.css';

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

function renderPullRequestPill(ctx: ComponentFixtureContext, pullRequest: IGitHubInfo['pullRequest']): void {
	const { container, disposableStore } = ctx;

	const session = observableValue<IActiveSession | undefined>('session', createMockSession(pullRequest));

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			reg.defineInstance(ISessionContext, new SessionContext(session));
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

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'sessions/' }, {

	OpenPullRequest_Open: defineComponentFixture({
		render: (ctx) => renderPullRequestPill(ctx, openPr),
	}),

	OpenPullRequest_Draft: defineComponentFixture({
		render: (ctx) => renderPullRequestPill(ctx, draftPr),
	}),
});
