/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IObservable, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
// eslint-disable-next-line local/code-import-patterns
import { BRANCH_CHANGES_CHANGESET_ID, ISessionChangeset, ISessionFileChange, ISessionWorkspace } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { IActiveSession } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionContext, SessionContext } from '../../../../../sessions/services/sessions/browser/sessionContext.js';
// eslint-disable-next-line local/code-import-patterns
import { ViewAllChangesActionViewItem } from '../../../../../sessions/contrib/changes/browser/changesActions.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/browser/parts/media/chatCompositeBar.css';

// ============================================================================
// Mock helpers
// ============================================================================

function createMockChange(insertions: number, deletions: number): ISessionFileChange {
	return {
		modifiedUri: URI.file(`/repo/file-${Math.random().toString(36).slice(2)}.ts`),
		insertions,
		deletions,
	};
}

function createMockBranchChangeset(changes: readonly ISessionFileChange[]): ISessionChangeset {
	return new class extends mock<ISessionChangeset>() {
		override readonly id = BRANCH_CHANGES_CHANGESET_ID;
		override readonly changes: IObservable<readonly ISessionFileChange[]> = constObservable(changes);
		override readonly isEnabled: IObservable<boolean> = constObservable(true);
		override readonly isDefault: IObservable<boolean> = constObservable(true);
	}();
}

function createMockWorkspace(): ISessionWorkspace {
	const root = URI.file('/repo');
	return {
		uri: root,
		label: 'vscode',
		icon: Codicon.folder,
		folders: [{
			root,
			workingDirectory: root,
			name: 'vscode',
			description: undefined,
			gitRepository: {
				uri: root,
				workTreeUri: undefined,
				branchName: 'feature/session-changes',
				baseBranchName: 'main',
				hasGitHubRemote: false,
				gitHubInfo: constObservable(undefined),
			},
		}],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
}

function createMockSession(changes: readonly ISessionFileChange[]): IActiveSession {
	return new class extends mock<IActiveSession>() {
		override readonly resource = URI.parse('session:1');
		override readonly workspace: IObservable<ISessionWorkspace | undefined> = constObservable(createMockWorkspace());
		override readonly changes: IObservable<readonly ISessionFileChange[]> = observableValue('changes', changes);
		override readonly changesets: IObservable<readonly ISessionChangeset[]> = constObservable([createMockBranchChangeset(changes)]);
	}();
}

// ============================================================================
// Render helper
// ============================================================================

function renderDiffStats(ctx: ComponentFixtureContext, changes: readonly ISessionFileChange[]): void {
	const { container, disposableStore } = ctx;

	const session = observableValue<IActiveSession | undefined>('session', createMockSession(changes));

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
		{ id: 'workbench.agentSessions.action.viewChanges', title: 'View All Changes' },
		undefined,
		undefined,
		undefined,
		undefined,
	);

	const item = disposableStore.add(instantiationService.createInstance(ViewAllChangesActionViewItem, action, {}));

	// Recreate the session header meta toolbar host so the inline-label styling
	// (.chat-composite-bar-meta-toolbar) applies as in production.
	const toolbar = document.createElement('div');
	toolbar.classList.add('chat-composite-bar-meta-toolbar');
	container.appendChild(toolbar);
	item.render(toolbar);

	container.style.padding = '8px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
}

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'sessions/' }, {

	ViewAllChanges_SingleFile: defineComponentFixture({
		render: (ctx) => renderDiffStats(ctx, [createMockChange(12, 3)]),
	}),

	ViewAllChanges_MultipleFiles: defineComponentFixture({
		render: (ctx) => renderDiffStats(ctx, [
			createMockChange(42, 7),
			createMockChange(118, 64),
			createMockChange(5, 0),
		]),
	}),

	ViewAllChanges_OnlyInsertions: defineComponentFixture({
		render: (ctx) => renderDiffStats(ctx, [createMockChange(256, 0)]),
	}),

	ViewAllChanges_OnlyDeletions: defineComponentFixture({
		render: (ctx) => renderDiffStats(ctx, [createMockChange(0, 89)]),
	}),

	ViewAllChanges_NoChanges: defineComponentFixture({
		render: (ctx) => renderDiffStats(ctx, []),
	}),
});
