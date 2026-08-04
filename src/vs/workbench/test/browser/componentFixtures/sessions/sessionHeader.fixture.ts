/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon, themeColorFromId } from '../../../../../base/common/themables.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IObservable, constObservable } from '../../../../../base/common/observable.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IActionViewItemService, IActionViewItemFactory } from '../../../../../platform/actions/browser/actionViewItemService.js';
// eslint-disable-next-line local/code-import-patterns
import { BRANCH_CHANGES_CHANGESET_ID, IGitHubInfo, ISessionCapabilities, ISessionChangeset, ISessionFileChange, ISessionFolder, ISessionGitRepository, ISessionWorkspace, SessionStatus } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { IActiveSession, ISessionsManagementService } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsListModelService } from '../../../../../sessions/services/sessions/browser/sessionsListModelService.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsService } from '../../../../../sessions/services/sessions/browser/sessionsService.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionContext, SessionContext } from '../../../../../sessions/services/sessions/browser/sessionContext.js';
// eslint-disable-next-line local/code-import-patterns
import { Menus } from '../../../../../sessions/browser/menus.js';
// eslint-disable-next-line local/code-import-patterns
import { SessionHeader } from '../../../../../sessions/browser/parts/sessionHeader.js';
// eslint-disable-next-line local/code-import-patterns
import { GitHubPullRequestState, IGitHubPullRequest } from '../../../../../sessions/contrib/github/common/types.js';
// eslint-disable-next-line local/code-import-patterns
import { IGitHubService } from '../../../../../sessions/contrib/github/browser/githubService.js';
// eslint-disable-next-line local/code-import-patterns
import { OpenPullRequestActionViewItem } from '../../../../../sessions/contrib/github/browser/pullRequestActions.js';
// eslint-disable-next-line local/code-import-patterns
import { ViewAllChangesActionViewItem } from '../../../../../sessions/contrib/changes/browser/changesActions.js';
// eslint-disable-next-line local/code-import-patterns
import { OpenFilesViewActionViewItem } from '../../../../../sessions/contrib/files/browser/workspaceFolderActions.js';
import { FixtureMenuService } from '../chat/chatFixtureUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
import { createFixtureGitHubService } from './githubFixtureUtils.js';

// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/browser/parts/media/chatCompositeBar.css';

// The command ids the session header meta toolbar contributes (and renders as the
// pull request and diff-stats pills). Kept in sync with the production actions.
const OPEN_PULL_REQUEST_COMMAND_ID = 'workbench.agentSessions.action.openPullRequest';
const VIEW_ALL_CHANGES_COMMAND_ID = 'workbench.agentSessions.action.viewChanges';
const OPEN_FILES_COMMAND_ID = 'workbench.agentSessions.action.openFilesView';

// ============================================================================
// Mock helpers
// ============================================================================

interface IMockWorkspaceOptions {
	label: string;
	/** Whether the session runs in a worktree (folder icon vs. worktree icon). */
	isWorktree?: boolean;
	isVirtualWorkspace?: boolean;
	/** Pull request associated with the session's repository, if any. */
	pullRequest?: IGitHubInfo['pullRequest'];
}

function createMockWorkspace(options: IMockWorkspaceOptions): ISessionWorkspace {
	const root = URI.file(`/home/user/projects/${options.label}`);
	const gitHubInfo: IGitHubInfo | undefined = options.pullRequest
		? { owner: 'microsoft', repo: options.label, pullRequest: options.pullRequest }
		: undefined;

	const gitRepository: ISessionGitRepository = {
		uri: root,
		workTreeUri: options.isWorktree ? URI.file(`/home/user/.worktrees/${options.label}`) : undefined,
		branchName: 'feature/session-header',
		baseBranchName: 'main',
		hasGitHubRemote: true,
		gitHubInfo: constObservable(gitHubInfo),
	};

	const folder: ISessionFolder = {
		root,
		workingDirectory: gitRepository.workTreeUri ?? root,
		name: options.label,
		description: undefined,
		gitRepository,
	};

	return {
		uri: root,
		label: options.label,
		icon: Codicon.folder,
		folders: [folder],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: options.isVirtualWorkspace ?? false,
	};
}

interface IMockSessionOptions {
	title: string;
	status?: SessionStatus;
	isArchived?: boolean;
	supportsRename?: boolean;
	workspace?: ISessionWorkspace;
	changes?: readonly ISessionFileChange[];
}

function createMockSession(options: IMockSessionOptions): IActiveSession {
	const capabilities: ISessionCapabilities = {
		supportsMultipleChats: false,
		supportsRename: options.supportsRename ?? true,
	};

	return new class extends mock<IActiveSession>() {
		override readonly sessionId = `local:${options.title}`;
		override readonly resource = URI.parse(`vscode-session://session/${Math.random().toString(36).slice(2)}`);
		override readonly capabilities = constObservable(capabilities);
		override readonly title: IObservable<string> = constObservable(options.title);
		override readonly status: IObservable<SessionStatus> = constObservable(options.status ?? SessionStatus.Completed);
		override readonly isArchived: IObservable<boolean> = constObservable(options.isArchived ?? false);
		override readonly isRead: IObservable<boolean> = constObservable(true);
		override readonly workspace: IObservable<ISessionWorkspace | undefined> = constObservable(options.workspace);
		override readonly changes: IObservable<readonly ISessionFileChange[]> = constObservable(options.changes ?? []);
		override readonly changesets: IObservable<readonly ISessionChangeset[]> = constObservable([createMockBranchChangeset(options.changes ?? [])]);
		override readonly isCreated: IObservable<boolean> = constObservable(true);
		override readonly icon = Codicon.account;
	}();
}

function createMockListModelService(): ISessionsListModelService {
	return new class extends mock<ISessionsListModelService>() {
		override readonly onDidChange = Event.None;
		override getStatusIcon(status: SessionStatus, _isRead: boolean, isArchived: boolean, completedStateIcon?: ThemeIcon): ThemeIcon {
			switch (status) {
				case SessionStatus.InProgress:
					return { ...Codicon.sessionInProgress, color: themeColorFromId('textLink.foreground') };
				case SessionStatus.NeedsInput:
					return { ...Codicon.circleFilled, color: themeColorFromId('list.warningForeground') };
				case SessionStatus.Error:
					return { ...Codicon.error, color: themeColorFromId('errorForeground') };
				default:
					if (isArchived) {
						return { ...Codicon.passFilled, color: themeColorFromId('agentSessionReadIndicator.foreground') };
					}
					if (completedStateIcon) {
						return completedStateIcon;
					}
					return { ...Codicon.circleSmallFilled, color: themeColorFromId('agentSessionReadIndicator.foreground') };
			}
		}
	}();
}

// ============================================================================
// Meta toolbar wiring
// ============================================================================

/**
 * Minimal {@link IActionViewItemService} so the session header's meta toolbar can
 * look up and render the contributed pull-request / diff-stats action view items
 * exactly as it does in production. (The production registry class is not
 * exported, so the fixture provides this small Map-backed equivalent.)
 */
class FixtureActionViewItemService implements IActionViewItemService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChange = Event.None;
	private readonly _providers = new Map<string, IActionViewItemFactory>();

	register(menu: MenuId, commandOrSubmenu: string | MenuId, provider: IActionViewItemFactory): IDisposable {
		this._providers.set(this._key(menu, commandOrSubmenu), provider);
		return Disposable.None;
	}

	lookUp(menu: MenuId, commandOrSubmenu: string | MenuId): IActionViewItemFactory | undefined {
		return this._providers.get(this._key(menu, commandOrSubmenu));
	}

	private _key(menu: MenuId, commandOrSubmenu: string | MenuId): string {
		return `${menu.id}/${commandOrSubmenu instanceof MenuId ? commandOrSubmenu.id : commandOrSubmenu}`;
	}
}

// ============================================================================
// Render helper
// ============================================================================

function renderHeader(ctx: ComponentFixtureContext, session: IActiveSession): void {
	const { container, disposableStore } = ctx;

	const actionViewItemService = new FixtureActionViewItemService();

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			// Override the generic menu + action view item mocks so the header's
			// meta toolbar resolves the contributed pills through the production
			// code path. These must come AFTER registerWorkbenchServices because
			// additionalServices registrations are last-wins.
			reg.define(IMenuService, FixtureMenuService);
			reg.defineInstance(IActionViewItemService, actionViewItemService);
			reg.defineInstance(ISessionContext, new SessionContext(constObservable<IActiveSession | undefined>(session)));
			reg.defineInstance(IGitHubService, createFixtureGitHubService([{ owner: 'microsoft', repo: 'vscode', pullRequest: openPullRequestDetails }]));
			reg.defineInstance(ISessionsListModelService, createMockListModelService());
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override readonly onDidChangeSessions = Event.None;
				override async renameSession() { }
			}());
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override setActive() { }
			}());
		},
	});

	// Register the production action view items for the meta toolbar pills, then
	// contribute the matching menu items — mirroring how the GitHub and changes
	// contributions wire them up. This is done before the header is created so the
	// meta toolbar renders them on first layout.
	actionViewItemService.register(Menus.SessionHeaderMeta, OPEN_PULL_REQUEST_COMMAND_ID, (action, options, instaService) =>
		action instanceof MenuItemAction ? instaService.createInstance(OpenPullRequestActionViewItem, action, options) : undefined);
	actionViewItemService.register(Menus.SessionHeaderMeta, VIEW_ALL_CHANGES_COMMAND_ID, (action, options, instaService) =>
		action instanceof MenuItemAction ? instaService.createInstance(ViewAllChangesActionViewItem, action, options) : undefined);
	actionViewItemService.register(Menus.SessionHeaderMeta, OPEN_FILES_COMMAND_ID, (action, options, instaService) =>
		action instanceof MenuItemAction ? instaService.createInstance(OpenFilesViewActionViewItem, action, options) : undefined);

	const menuService = instantiationService.get(IMenuService) as FixtureMenuService;
	if (session.workspace.get()?.label) {
		menuService.addItem(Menus.SessionHeaderMeta, { command: { id: OPEN_FILES_COMMAND_ID, title: 'Files' }, group: 'navigation', order: -10 });
	}
	const hasChanges = session.changes.get().some(change => change.insertions > 0 || change.deletions > 0);
	if (hasChanges) {
		menuService.addItem(Menus.SessionHeaderMeta, { command: { id: VIEW_ALL_CHANGES_COMMAND_ID, title: 'View All Changes' }, group: 'navigation', order: 0 });
	}
	const pullRequest = session.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get()?.pullRequest;
	if (pullRequest) {
		menuService.addItem(Menus.SessionHeaderMeta, { command: { id: OPEN_PULL_REQUEST_COMMAND_ID, title: 'Open Pull Request' }, group: 'navigation', order: 1 });
	}

	// The session header reads `--session-view-background/foreground` (set by the
	// hosting SessionView in production) for its surface colors, so mirror those
	// here against the agents-window panel background.
	container.style.width = '420px';
	container.style.setProperty('--session-view-background', 'var(--vscode-agentsPanel-background, var(--vscode-sideBar-background))');
	container.style.setProperty('--session-view-foreground', 'var(--vscode-agentsPanel-foreground, var(--vscode-sideBar-foreground))');
	container.style.backgroundColor = 'var(--session-view-background)';

	const header = disposableStore.add(instantiationService.createInstance(SessionHeader));
	header.setSession(session);
	container.appendChild(header.element);
}

const openPr: IGitHubInfo['pullRequest'] = {
	number: 12345,
	uri: URI.parse('https://github.com/microsoft/vscode/pull/12345'),
	icon: { ...Codicon.gitPullRequest, color: themeColorFromId('charts.green') },
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

// ============================================================================
// Fixtures
// ============================================================================

// The session header meta row renders the contributed pills resolved through
// Menus.SessionHeaderMeta: the workspace folder pill (files contribution), the
// `+/-` diff-stats pill (changes contribution), and the `#<number>` pull request
// pill (GitHub contribution). All are real toolbar action view items.
export default defineThemedFixtureGroup({ path: 'sessions/' }, {

	SessionHeader_Default: defineComponentFixture({
		render: (ctx) => renderHeader(ctx, createMockSession({
			title: 'Fix login bug',
			workspace: createMockWorkspace({ label: 'vscode' }),
		})),
	}),

	SessionHeader_WithPullRequest: defineComponentFixture({
		render: (ctx) => renderHeader(ctx, createMockSession({
			title: 'Add session header PR link',
			workspace: createMockWorkspace({ label: 'vscode', isWorktree: true, pullRequest: openPr }),
			changes: [createMockChange(42, 7), createMockChange(5, 0)],
		})),
	}),

	SessionHeader_InProgress: defineComponentFixture({
		render: (ctx) => renderHeader(ctx, createMockSession({
			title: 'Investigate flaky test',
			status: SessionStatus.InProgress,
			workspace: createMockWorkspace({ label: 'vscode', isWorktree: true, pullRequest: openPr }),
			changes: [createMockChange(118, 64)],
		})),
	}),

	SessionHeader_NeedsInput: defineComponentFixture({
		render: (ctx) => renderHeader(ctx, createMockSession({
			title: 'Update documentation',
			status: SessionStatus.NeedsInput,
			workspace: createMockWorkspace({ label: 'vscode' }),
		})),
	}),

	SessionHeader_LongTitle: defineComponentFixture({
		render: (ctx) => renderHeader(ctx, createMockSession({
			title: 'Investigate and fix the flaky integration test in the notebook editor viewport rendering pipeline',
			workspace: createMockWorkspace({ label: 'microsoft/vscode', isWorktree: true, pullRequest: openPr }),
			changes: [createMockChange(12, 3)],
		})),
	}),

	SessionHeader_NoWorkspace: defineComponentFixture({
		render: (ctx) => renderHeader(ctx, createMockSession({
			title: 'New Session',
		})),
	}),
});
