/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { tildify } from '../../../../../base/common/labels.js';
import { Schemas } from '../../../../../base/common/network.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
// eslint-disable-next-line local/code-import-patterns
import { computePullRequestIcon, GitHubPullRequestState } from '../../../../../sessions/contrib/github/common/types.js';
// eslint-disable-next-line local/code-import-patterns
import { getSessionSummaryHoverData } from '../../../../../sessions/contrib/sessions/browser/sessionHoverContent.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsProvidersService } from '../../../../../sessions/services/sessions/browser/sessionsProvidersService.js';
// eslint-disable-next-line local/code-import-patterns
import { IGitHubInfo, IGitHubPullRequestRef, ISession, ISessionFileChange, ISessionFolder, ISessionType, ISessionWorkspace, SessionTypeAuthRequirement } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsProvider } from '../../../../../sessions/services/sessions/common/sessionsProvider.js';
import { ISessionSummaryHoverData, SessionSummaryHoverWidget } from '../../../../contrib/chat/browser/agentSessions/sessionSummaryHover.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

import '../../../../../base/browser/ui/hover/hoverWidget.css';
import '../../../../../platform/hover/browser/hover.css';

// ============================================================================
// Mock helpers — the Agents window's data source (ISession)
// ============================================================================

interface IWorkspaceSpec {
	/** Path of the repository the session belongs to. */
	readonly root: string;
	/** Path of the isolated worktree, when the session runs in one. */
	readonly worktree?: string;
	readonly branch?: string;
	readonly pullRequests?: readonly IGitHubPullRequestRef[];
	/** Renders as a cloud workspace, labelled `owner/repo` rather than by path. */
	readonly virtual?: boolean;
}

interface ISessionSpec {
	readonly title: string;
	readonly workspace?: IWorkspaceSpec;
	readonly worktreePending?: boolean;
	readonly changes?: readonly { readonly insertions: number; readonly deletions: number }[];
	readonly sessionType?: string;
	readonly isQuickChat?: boolean;
	/** Renders the trailing "External Session" row. */
	readonly isExternal?: boolean;
}

function createWorkspace(spec: IWorkspaceSpec): ISessionWorkspace {
	const root = spec.virtual ? URI.from({ scheme: 'vscode-vfs', authority: 'github', path: `/${spec.root}` }) : URI.file(spec.root);
	const gitHubInfo: IGitHubInfo | undefined = spec.pullRequests
		? { owner: 'microsoft', repo: 'vscode', pullRequests: spec.pullRequests }
		: undefined;

	const folder: ISessionFolder = {
		root,
		workingDirectory: spec.worktree ? URI.file(spec.worktree) : root,
		name: 'vscode',
		description: undefined,
		gitRepository: {
			uri: root,
			workTreeUri: spec.worktree ? URI.file(spec.worktree) : undefined,
			branchName: spec.branch,
			baseBranchName: 'main',
			gitHubInfo: constObservable(gitHubInfo),
		},
	};

	return {
		uri: root,
		label: spec.virtual ? spec.root : 'vscode',
		icon: spec.virtual ? Codicon.repo : Codicon.folder,
		folders: [folder],
		requiresWorkspaceTrust: !spec.virtual,
		isVirtualWorkspace: !!spec.virtual,
	};
}

function createSession(spec: ISessionSpec): ISession {
	const changes: readonly ISessionFileChange[] = (spec.changes ?? []).map((change, index) => ({
		uri: URI.file(`/home/user/projects/vscode/src/file${index}.ts`),
		insertions: change.insertions,
		deletions: change.deletions,
	}));

	return new class extends mock<ISession>() {
		override readonly providerId = 'local-agent-host';
		override readonly sessionType = spec.sessionType ?? 'claude';
		override readonly title: IObservable<string> = constObservable(spec.title);
		override readonly workspace: IObservable<ISessionWorkspace | undefined> = constObservable(spec.workspace ? createWorkspace(spec.workspace) : undefined);
		override readonly worktreePending: IObservable<boolean> = constObservable(!!spec.worktreePending);
		override readonly isQuickChat: IObservable<boolean> = constObservable(!!spec.isQuickChat);
		override readonly isExternal: IObservable<boolean> = constObservable(!!spec.isExternal);
		override readonly changes: IObservable<readonly ISessionFileChange[]> = constObservable(changes);
	}();
}

const SESSION_TYPES: readonly ISessionType[] = [
	{ id: 'claude', label: 'Claude', icon: Codicon.robot, authRequirement: SessionTypeAuthRequirement.None },
	{ id: 'codex', label: 'Codex', icon: Codicon.robot, authRequirement: SessionTypeAuthRequirement.None },
];

const SESSIONS_PROVIDERS_SERVICE = new class extends mock<ISessionsProvidersService>() {
	override readonly onDidChangeProviders = Event.None;
	override getProvider<T extends ISessionsProvider>(): T | undefined {
		return new class extends mock<ISessionsProvider>() {
			override readonly id = 'local-agent-host';
			override readonly label = 'Local Agent Host';
			override readonly icon: ThemeIcon = Codicon.vm;
			override readonly sessionTypes = SESSION_TYPES;
		}() as T;
	}
}();

const OPENER_SERVICE = new class extends mock<IOpenerService>() {
	override async open(): Promise<boolean> {
		return true;
	}
}();

const PREFERENCES_SERVICE = new class extends mock<IPreferencesService>() {
	override async openSettings(): Promise<undefined> {
		return undefined;
	}
}();

/** Stands in for the workbench label service: a POSIX home, tildified. */
const LABEL_SERVICE = new class extends mock<ILabelService>() {
	override getUriLabel(resource: URI): string {
		return resource.scheme === Schemas.file
			? tildify(resource.path, '/home/user', OperatingSystem.Linux)
			: resource.toString(true);
	}
}();

function pullRequest(number: number, title: string | undefined, state: GitHubPullRequestState | 'draft', createdByThisSession = true): IGitHubPullRequestRef {
	return {
		owner: 'microsoft',
		repo: 'vscode',
		number,
		uri: URI.parse(`https://github.com/microsoft/vscode/pull/${number}`),
		icon: computePullRequestIcon(state),
		title,
		createdByThisSession,
	};
}

// ============================================================================
// Rendering
// ============================================================================

/**
 * Mirrors the DOM the hover service builds around HTML content, so the fixture
 * picks up the real hover chrome (border, radius, shadow) around the widget.
 */
function renderInHover(ctx: ComponentFixtureContext, content: HTMLElement): void {
	const { container } = ctx;
	container.style.padding = '24px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';

	const hoverContainer = dom.$('div.workbench-hover-container');
	const hover = dom.$('div.monaco-hover.workbench-hover');
	hover.style.position = 'static';
	hover.style.display = 'inline-block';
	const contents = dom.$('div.monaco-hover-content');
	const row = dom.$('div.hover-row.markdown-hover');
	const hoverContents = dom.$('div.hover-contents.html-hover-contents');

	hoverContents.appendChild(content);
	row.appendChild(hoverContents);
	contents.appendChild(row);
	hover.appendChild(contents);
	hoverContainer.appendChild(hover);
	container.appendChild(hoverContainer);
}

/** The Agents window path: ISession → hover data → shared widget. */
function renderSessionHover(ctx: ComponentFixtureContext, spec: ISessionSpec): void {
	const data = getSessionSummaryHoverData(createSession(spec), SESSIONS_PROVIDERS_SERVICE, OPENER_SERVICE, LABEL_SERVICE, PREFERENCES_SERVICE);
	renderInHover(ctx, new SessionSummaryHoverWidget(data).domNode);
}

/** Any other data source feeding the same widget, e.g. the editor window. */
function renderHoverData(ctx: ComponentFixtureContext, data: ISessionSummaryHoverData): void {
	renderInHover(ctx, new SessionSummaryHoverWidget(data).domNode);
}

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	SessionHover_Folder: defineComponentFixture({
		render: ctx => renderSessionHover(ctx, {
			title: 'Fix authentication redirect loop',
			workspace: { root: '/home/user/projects/vscode', branch: 'main' },
		}),
	}),
	SessionHover_Worktree: defineComponentFixture({
		render: ctx => renderSessionHover(ctx, {
			title: 'Fix authentication redirect loop',
			workspace: {
				root: '/home/user/projects/vscode',
				worktree: '/home/user/projects/vscode.worktrees/fix-auth-redirect',
				branch: 'fix-auth-redirect',
			},
			changes: [{ insertions: 96, deletions: 12 }, { insertions: 36, deletions: 6 }],
		}),
	}),
	SessionHover_WorktreeWithPullRequests: defineComponentFixture({
		render: ctx => renderSessionHover(ctx, {
			title: 'Fix authentication redirect loop',
			workspace: {
				root: '/home/user/projects/vscode',
				worktree: '/home/user/projects/vscode.worktrees/fix-auth-redirect',
				branch: 'fix-auth-redirect',
				pullRequests: [
					pullRequest(241533, 'Fix authentication redirect loop', GitHubPullRequestState.Open),
					pullRequest(241540, 'Add a regression test for the redirect loop', 'draft'),
					pullRequest(241001, 'Revert the earlier redirect workaround', GitHubPullRequestState.Merged),
					// Inherited from the checkout: never listed.
					pullRequest(9001, 'Unrelated pull request on the same branch', GitHubPullRequestState.Open, false),
				],
			},
			changes: [{ insertions: 96, deletions: 12 }, { insertions: 36, deletions: 6 }],
		}),
	}),
	SessionHover_WorktreePending: defineComponentFixture({
		render: ctx => renderSessionHover(ctx, {
			title: 'Add reconnect backoff to the agent host transport',
			workspace: { root: '/home/user/projects/agent-host-protocol', branch: 'main' },
			worktreePending: true,
		}),
	}),
	SessionHover_CloudWorkspace: defineComponentFixture({
		render: ctx => renderSessionHover(ctx, {
			title: 'Update onboarding copy',
			sessionType: 'codex',
			workspace: {
				root: 'microsoft/vscode-docs',
				virtual: true,
				branch: 'update-onboarding-copy',
				pullRequests: [pullRequest(87, 'Update onboarding copy', GitHubPullRequestState.Open)],
			},
		}),
	}),
	SessionHover_QuickChat: defineComponentFixture({
		render: ctx => renderSessionHover(ctx, {
			title: '',
			isQuickChat: true,
		}),
	}),
	// Picked up from another application, so the hover closes by naming where
	// the session came from.
	SessionHover_ExternalSession: defineComponentFixture({
		render: ctx => renderSessionHover(ctx, {
			title: 'Fix authentication redirect loop',
			workspace: { root: '/home/user/projects/vscode', branch: 'main' },
			isExternal: true,
		}),
	}),
	SessionHover_LongValues: defineComponentFixture({
		render: ctx => renderSessionHover(ctx, {
			title: 'Investigate why the sessions list hover truncates its workspace path on narrow layouts',
			workspace: {
				root: '/home/user/projects/an-extremely-long-workspace-directory-name-that-has-to-wrap',
				worktree: '/home/user/projects/an-extremely-long-workspace-directory-name-that-has-to-wrap.worktrees/investigate-hover-truncation',
				branch: 'investigate/hover-truncation-on-narrow-layouts',
				pullRequests: [pullRequest(241533, 'Investigate why the sessions list hover truncates its workspace path on narrow layouts', GitHubPullRequestState.Open)],
			},
			changes: [{ insertions: 1204, deletions: 863 }],
		}),
	}),
	// What a thinner data source produces: the editor window resolves a chat
	// session item, which carries no worktree, pull requests or provider labels.
	SessionHover_EditorWindowDataSource: defineComponentFixture({
		render: ctx => renderHoverData(ctx, {
			title: 'Fix authentication redirect loop',
			location: {
				workspace: '/home/user/projects/vscode',
				branch: 'fix-auth-redirect',
				changes: { files: 2, insertions: 132, deletions: 18 },
			},
		}),
	}),
	// The narrowest case the widget must still look right in: a title only.
	SessionHover_TitleOnly: defineComponentFixture({
		render: ctx => renderHoverData(ctx, { title: 'Fix authentication redirect loop' }),
	}),
});
