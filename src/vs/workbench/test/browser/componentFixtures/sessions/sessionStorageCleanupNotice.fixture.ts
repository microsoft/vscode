/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionWorktreeCleanupService, ISessionWorktreeCleanupSuggestion } from '../../../../../sessions/contrib/sessionInputBanners/browser/sessionWorktreeCleanupService.js';
// eslint-disable-next-line local/code-import-patterns
import { SessionStorageCleanupNotice } from '../../../../../sessions/contrib/sessions/browser/views/sessionStorageCleanupNotice.js';
// eslint-disable-next-line local/code-import-patterns
import { renderSessionsListFixture } from '../../../../../sessions/contrib/sessions/test/browser/sessionsListFixtureUtils.js';
// eslint-disable-next-line local/code-import-patterns
import { SessionStatus } from '../../../../../sessions/services/sessions/common/session.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/contrib/sessions/browser/media/sessionsViewPane.css';

const suggestion: ISessionWorktreeCleanupSuggestion = {
	description: '24 agent session worktrees have been inactive for at least 15 days and can be cleaned up, reclaiming about 6.00GB.',
	manage: async () => { },
	disable: async () => { },
	dismiss: () => { },
};

function createCleanupService(): ISessionWorktreeCleanupService {
	return new class extends mock<ISessionWorktreeCleanupService>() {
		override readonly suggestion = constObservable(suggestion);
		override async activate(): Promise<void> { }
	}();
}

function renderSessionStorageCleanupNotice({ container, disposableStore, theme }: ComponentFixtureContext): void {
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			reg.defineInstance(ISessionWorktreeCleanupService, createCleanupService());
		},
	});

	container.style.width = '400px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
	container.style.color = 'var(--vscode-sideBar-foreground)';
	container.classList.add('agent-sessions-workbench');

	const viewPane = DOM.append(container, DOM.$('.agent-sessions-viewpane'));
	const sessionsContent = DOM.append(viewPane, DOM.$('.agent-sessions-content'));
	const notice = disposableStore.add(instantiationService.createInstance(SessionStorageCleanupNotice, () => { }, () => { }));
	sessionsContent.appendChild(notice.domNode);
}

async function renderSessionStorageCleanupNoticeInSessionsView(context: ComponentFixtureContext): Promise<void> {
	const fixture = await renderSessionsListFixture(context, {
		header: {},
		view: { width: 400, height: 520, showArchived: false },
		sessions: [
			{ id: 'auth', title: 'Fix authentication redirect loop', workspace: 'vscode', minutesAgo: 4, changesSummary: { files: 4, additions: 132, deletions: 18 } },
			{ id: 'tests', title: 'Investigate flaky integration tests', workspace: 'vscode', minutesAgo: 12, status: SessionStatus.InProgress, description: 'Running the integration suite' },
			{ id: 'keyboard', title: 'Improve keyboard navigation', workspace: 'vscode', minutesAgo: 24, isRead: false },
			{ id: 'docs', title: 'Update getting started guide', workspace: 'vscode-docs', minutesAgo: 46 },
		],
	});
	fixture.instantiationService.stub(ISessionWorktreeCleanupService, createCleanupService());
	const notice = context.disposableStore.add(fixture.instantiationService.createInstance(SessionStorageCleanupNotice, () => fixture.list.focus(), () => { }));
	fixture.listHost.parentElement!.appendChild(notice.domNode);
	fixture.list.layout(fixture.listHost.clientHeight, 400);
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	SessionStorageCleanupNotice: defineComponentFixture({ render: renderSessionStorageCleanupNotice }),
	SessionStorageCleanupNoticeInSessionsView: defineComponentFixture({ render: renderSessionStorageCleanupNoticeInSessionsView }),
});
