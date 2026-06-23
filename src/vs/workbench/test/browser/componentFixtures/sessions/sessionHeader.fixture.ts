/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon, themeColorFromId } from '../../../../../base/common/themables.js';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IObservable, constObservable } from '../../../../../base/common/observable.js';
// eslint-disable-next-line local/code-import-patterns
import { IGitHubInfo, ISession, ISessionCapabilities, ISessionFileChange, ISessionFolder, ISessionGitRepository, ISessionWorkspace, SessionStatus } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { IActiveSession, ISessionsManagementService } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsListModelService } from '../../../../../sessions/services/sessions/browser/sessionsListModelService.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsService } from '../../../../../sessions/services/sessions/browser/sessionsService.js';
// eslint-disable-next-line local/code-import-patterns
import { SessionHeader } from '../../../../../sessions/browser/parts/sessionHeader.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/browser/parts/media/chatCompositeBar.css';

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
		override readonly capabilities = capabilities;
		override readonly title: IObservable<string> = constObservable(options.title);
		override readonly status: IObservable<SessionStatus> = constObservable(options.status ?? SessionStatus.Completed);
		override readonly isArchived: IObservable<boolean> = constObservable(options.isArchived ?? false);
		override readonly workspace: IObservable<ISessionWorkspace | undefined> = constObservable(options.workspace);
		override readonly changes: IObservable<readonly ISessionFileChange[]> = constObservable(options.changes ?? []);
		override readonly isCreated: IObservable<boolean> = constObservable(true);
	}();
}

function createMockListModelService(): ISessionsListModelService {
	return new class extends mock<ISessionsListModelService>() {
		override readonly onDidChange = Event.None;
		override isSessionRead(_session: ISession): boolean { return true; }
		override getStatusIcon(status: SessionStatus, _isRead: boolean, isArchived: boolean, pullRequestIcon?: ThemeIcon): ThemeIcon {
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
					if (pullRequestIcon) {
						return pullRequestIcon;
					}
					return { ...Codicon.circleSmallFilled, color: themeColorFromId('agentSessionReadIndicator.foreground') };
			}
		}
	}();
}

// ============================================================================
// Render helper
// ============================================================================

function renderHeader(ctx: ComponentFixtureContext, session: IActiveSession): void {
	const { container, disposableStore } = ctx;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
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

// ============================================================================
// Fixtures
// ============================================================================

// Note: the `#<number>` pull request pill is contributed into the session header
// meta toolbar (Menus.SessionHeaderMeta) by the GitHub contribution and is
// covered by `openPullRequest.fixture.ts`. The fixtures below exercise the
// header itself; a session associated with a pull request surfaces the PR state
// through the status icon.
export default defineThemedFixtureGroup({ path: 'sessions/' }, {

	SessionHeader_Default: defineComponentFixture({
		render: (ctx) => renderHeader(ctx, createMockSession({
			title: 'Fix login bug',
			workspace: createMockWorkspace({ label: 'vscode' }),
		})),
	}),

	SessionHeader_PullRequestStatusIcon: defineComponentFixture({
		render: (ctx) => renderHeader(ctx, createMockSession({
			title: 'Add session header PR link',
			workspace: createMockWorkspace({ label: 'vscode', isWorktree: true, pullRequest: openPr }),
		})),
	}),

	SessionHeader_InProgress: defineComponentFixture({
		render: (ctx) => renderHeader(ctx, createMockSession({
			title: 'Investigate flaky test',
			status: SessionStatus.InProgress,
			workspace: createMockWorkspace({ label: 'vscode', isWorktree: true, pullRequest: openPr }),
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
		})),
	}),

	SessionHeader_NoWorkspace: defineComponentFixture({
		render: (ctx) => renderHeader(ctx, createMockSession({
			title: 'New Session',
		})),
	}),
});
