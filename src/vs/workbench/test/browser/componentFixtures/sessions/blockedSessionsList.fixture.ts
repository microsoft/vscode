/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon, themeColorFromId } from '../../../../../base/common/themables.js';
import { Event } from '../../../../../base/common/event.js';
import { IObservable, constObservable } from '../../../../../base/common/observable.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { EditorMarkdownCodeBlockRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js';
// eslint-disable-next-line local/code-import-patterns
import { IChat, IGitHubInfo, ISession, ISessionChangesSummary, ISessionFileChange, ISessionFolder, ISessionGitRepository, ISessionWorkspace, SessionStatus } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { IActiveSession, ISessionsManagementService } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsService } from '../../../../../sessions/services/sessions/browser/sessionsService.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsListModelService } from '../../../../../sessions/services/sessions/browser/sessionsListModelService.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsProvidersService } from '../../../../../sessions/services/sessions/browser/sessionsProvidersService.js';
// eslint-disable-next-line local/code-import-patterns
import { BlockedSessionsList, registerBlockedSessionsItemActions } from '../../../../../sessions/contrib/sessions/browser/blockedSessionsList.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionCIFixModel, ISessionCIFixState } from '../../../../../sessions/contrib/sessions/browser/views/sessionsList.js';
import { IVoicePlaybackService } from '../../../../contrib/chat/common/voicePlaybackService.js';
import { IChatService } from '../../../../contrib/chat/common/chatService/chatService.js';
import { IChatModel } from '../../../../contrib/chat/common/model/chatModel.js';
import { IAgentSessionsService } from '../../../../contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IAgentSession, IAgentSessionsModel } from '../../../../contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { AgentSessionApprovalKind, AgentSessionApprovalModel, IAgentSessionApprovalInfo } from '../../../../contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

// The blocked-sessions list reuses the shared session-row styles.
// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/contrib/sessions/browser/media/sessionsList.css';

// ============================================================================
// Mock helpers
// ============================================================================

function createMockWorkspace(label: string, branchName: string, pullRequest?: IGitHubInfo['pullRequest']): ISessionWorkspace {
	const root = URI.file(`/home/user/projects/${label}`);
	const gitHubInfo: IGitHubInfo | undefined = pullRequest ? { owner: 'microsoft', repo: label, pullRequest } : undefined;

	const gitRepository: ISessionGitRepository = {
		uri: root,
		workTreeUri: undefined,
		branchName,
		baseBranchName: 'main',
		hasGitHubRemote: true,
		gitHubInfo: constObservable(gitHubInfo),
	};

	const folder: ISessionFolder = {
		root,
		workingDirectory: root,
		name: label,
		description: undefined,
		gitRepository,
	};

	return {
		uri: root,
		label,
		icon: Codicon.folder,
		folders: [folder],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
}

function createMockChangesSummary(files: number, additions: number, deletions: number): ISessionChangesSummary {
	return { files, additions, deletions };
}

interface IBlockedSessionOptions {
	title: string;
	status: SessionStatus;
	/** How long ago the session was last updated, in minutes. */
	minutesAgo: number;
	workspace?: ISessionWorkspace;
	/** Rendered in the details row for sessions that need input. */
	description?: string;
	/** Diff stats shown for completed sessions. */
	changesSummary?: ISessionChangesSummary;
	/** A terminal command awaiting approval; renders an approval row with an Allow button. */
	approvalCommand?: string;
}

function createBlockedSession(options: IBlockedSessionOptions, approvals?: Map<string, IAgentSessionApprovalInfo>): ISession {
	const updatedAt = new Date(Date.now() - options.minutesAgo * 60 * 1000);
	const description: IMarkdownString | undefined = options.description ? new MarkdownString(options.description) : undefined;

	// A session awaiting a tool approval carries a chat whose resource the (mock)
	// approval model keys the pending approval on.
	let chats: readonly IChat[] = [];
	if (options.approvalCommand !== undefined && approvals) {
		const chatResource = URI.parse(`vscode-chat://chat/${Math.random().toString(36).slice(2)}`);
		approvals.set(chatResource.toString(), {
			kind: AgentSessionApprovalKind.Terminal,
			label: options.approvalCommand,
			languageId: undefined,
			since: new Date(),
			confirm: () => { },
		});
		chats = [new class extends mock<IChat>() {
			override readonly resource = chatResource;
		}()];
	}

	return new class extends mock<ISession>() {
		override readonly sessionId = `local:${options.title}`;
		override readonly resource = URI.parse(`vscode-session://session/${Math.random().toString(36).slice(2)}`);
		override readonly providerId = 'local';
		override readonly sessionType = 'local';
		override readonly icon = Codicon.account;
		override readonly createdAt = updatedAt;
		override readonly title: IObservable<string> = constObservable(options.title);
		override readonly updatedAt: IObservable<Date> = constObservable(updatedAt);
		override readonly status: IObservable<SessionStatus> = constObservable(options.status);
		override readonly workspace: IObservable<ISessionWorkspace | undefined> = constObservable(options.workspace);
		override readonly isArchived: IObservable<boolean> = constObservable<boolean>(false);
		override readonly isRead: IObservable<boolean> = constObservable<boolean>(true);
		override readonly changes: IObservable<readonly ISessionFileChange[]> = constObservable<readonly ISessionFileChange[]>([]);
		override readonly changesSummary: IObservable<ISessionChangesSummary | undefined> = constObservable<ISessionChangesSummary | undefined>(options.changesSummary);
		override readonly description: IObservable<IMarkdownString | undefined> = constObservable<IMarkdownString | undefined>(description);
		override readonly chats: IObservable<readonly IChat[]> = constObservable<readonly IChat[]>(chats);
	}();
}

function createApprovalModel(approvals: Map<string, IAgentSessionApprovalInfo>): AgentSessionApprovalModel {
	return new class extends mock<AgentSessionApprovalModel>() {
		override getApproval(resource: URI): IObservable<IAgentSessionApprovalInfo | undefined> {
			return constObservable(approvals.get(resource.toString()));
		}
	}();
}

/**
 * Build a set of sessions together with a matching approval model: each session
 * whose spec has an `approvalCommand` shows a pending terminal approval row.
 */
function buildApprovalScenario(specs: readonly IBlockedSessionOptions[]): { sessions: ISession[]; approvalModel: AgentSessionApprovalModel } {
	const approvals = new Map<string, IAgentSessionApprovalInfo>();
	const sessions = specs.map(spec => createBlockedSession(spec, approvals));
	return { sessions, approvalModel: createApprovalModel(approvals) };
}

/** A CI-fix spec: a blocked session whose PR is failing CI, with the counts shown in its row. */
interface ICIBlockedSessionOptions extends IBlockedSessionOptions {
	ci: ISessionCIFixState;
}

function createCIFixModel(states: ReadonlyMap<string, ISessionCIFixState>): ISessionCIFixModel {
	return {
		getCIFix: (session: ISession) => constObservable(states.get(session.resource.toString())),
		fixCI: () => { },
	};
}

/**
 * Build a set of sessions together with a matching CI-fix model: each session
 * whose spec has a `ci` summary shows a "Fix CI" row with those counts.
 */
function buildCIFixScenario(specs: readonly ICIBlockedSessionOptions[]): { sessions: ISession[]; ciFixModel: ISessionCIFixModel } {
	const states = new Map<string, ISessionCIFixState>();
	const sessions = specs.map(spec => {
		const session = createBlockedSession(spec);
		states.set(session.resource.toString(), spec.ci);
		return session;
	});
	return { sessions, ciFixModel: createCIFixModel(states) };
}

function createMockListModelService(): ISessionsListModelService {
	return new class extends mock<ISessionsListModelService>() {
		override readonly onDidChange = Event.None;
		override isSessionPinned(): boolean { return false; }
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

// A failing-CI pull request (red) and a pull request with unresolved comments
// (yellow) — the two non-needs-input reasons a session counts as blocked.
const failingChecksPr: IGitHubInfo['pullRequest'] = {
	number: 4821,
	uri: URI.parse('https://github.com/microsoft/vscode/pull/4821'),
	icon: { ...Codicon.gitPullRequest, color: themeColorFromId('charts.red') },
};

const unresolvedCommentsPr: IGitHubInfo['pullRequest'] = {
	number: 4750,
	uri: URI.parse('https://github.com/microsoft/vscode/pull/4750'),
	icon: { ...Codicon.gitPullRequest, color: themeColorFromId('charts.yellow') },
};

// ============================================================================
// Render helper
// ============================================================================

function renderBlockedList(ctx: ComponentFixtureContext, sessions: readonly ISession[], approvalModel?: AgentSessionApprovalModel, ciFixModel?: ISessionCIFixModel): void {
	const { container, disposableStore } = ctx;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.define(IListService, ListService);
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			// `SessionsFlatList` creates an `AgentSessionApprovalModel` (reads
			// `IChatService.chatModels`) and observes each session through the
			// agent-sessions model. Both are stubbed to no-ops for the fixture.
			reg.defineInstance(IChatService, new class extends mock<IChatService>() {
				override readonly chatModels: IObservable<Iterable<IChatModel>> = constObservable<Iterable<IChatModel>>([]);
			}());
			reg.defineInstance(IAgentSessionsService, new class extends mock<IAgentSessionsService>() {
				override readonly model = new class extends mock<IAgentSessionsModel>() {
					override observeSession(): IObservable<IAgentSession | undefined> {
						return constObservable<IAgentSession | undefined>(undefined);
					}
				}();
			}());
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]> = constObservable<readonly (IActiveSession | undefined)[]>([]);
			}());
			reg.defineInstance(ISessionsListModelService, createMockListModelService());
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override markRead(): Promise<void> { return Promise.resolve(); }
			}());
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProviders() { return []; }
				override getProvider() { return undefined; }
			}());
			// `SessionsFlatList`/`SessionItemRenderer` read the voice pending-response
			// indicator state; stub it as always-empty for the fixture.
			reg.defineInstance(IVoicePlaybackService, new class extends mock<IVoicePlaybackService>() {
				override readonly pendingResponseVersion: IObservable<number> = constObservable(0);
				override hasPendingResponse() { return false; }
			}());
		},
	});

	// Render terminal-approval labels as real (monospace) code blocks — otherwise
	// the markdown renderer emits empty code-block spans and the command is blank.
	(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration('editor', { fontFamily: 'monospace' });
	instantiationService.get(IMarkdownRendererService).setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));
	disposableStore.add(registerBlockedSessionsItemActions());

	// The blocked-sessions list is shown as a floating dropdown anchored below
	// the command center box in the agents window; approximate that surface (and
	// its backdrop) here so the widget's own background/border/shadow read as
	// they do in production.
	container.style.width = '392px';
	container.style.padding = '16px';
	container.style.backgroundColor = 'var(--vscode-titleBar-activeBackground, var(--vscode-editor-background))';

	const list = disposableStore.add(instantiationService.createInstance(BlockedSessionsList, container, {
		onSessionOpen: () => { },
		onIgnoreSession: () => { },
		approvalModel,
		ciFixModel,
	}));
	list.setSessions(sessions);
}

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'sessions/' }, {

	// A mix of the three reasons a session is "blocked": it needs input, its PR
	// has failing CI checks, or its PR has unresolved comments.
	BlockedSessionsList_Mixed: defineComponentFixture({
		render: (ctx) => renderBlockedList(ctx, [
			createBlockedSession({
				title: 'Fix authentication redirect loop',
				status: SessionStatus.NeedsInput,
				minutesAgo: 3,
				workspace: createMockWorkspace('vscode', 'feature/auth-fix'),
				description: 'Waiting for you to confirm running the database migration.',
			}),
			createBlockedSession({
				title: 'Add telemetry for startup performance',
				status: SessionStatus.Completed,
				minutesAgo: 62,
				workspace: createMockWorkspace('vscode', 'perf/startup-telemetry', failingChecksPr),
				changesSummary: createMockChangesSummary(8, 240, 58),
			}),
			createBlockedSession({
				title: 'Refactor the notification service',
				status: SessionStatus.Completed,
				minutesAgo: 184,
				workspace: createMockWorkspace('vscode', 'refactor/notifications', unresolvedCommentsPr),
				changesSummary: createMockChangesSummary(12, 96, 140),
			}),
		]),
	}),

	// A single session that needs input — the most common blocked state.
	BlockedSessionsList_SingleNeedsInput: defineComponentFixture({
		render: (ctx) => renderBlockedList(ctx, [
			createBlockedSession({
				title: 'Update the onboarding walkthrough copy',
				status: SessionStatus.NeedsInput,
				minutesAgo: 1,
				workspace: createMockWorkspace('vscode', 'docs/onboarding'),
				description: 'Which tone should the welcome step use — formal or friendly?',
			}),
		]),
	}),

	// Enough sessions to fill the dropdown and show the bounded, scrollable height.
	BlockedSessionsList_Many: defineComponentFixture({
		render: (ctx) => renderBlockedList(ctx, [
			createBlockedSession({ title: 'Fix authentication redirect loop', status: SessionStatus.NeedsInput, minutesAgo: 3, workspace: createMockWorkspace('vscode', 'feature/auth-fix'), description: 'Waiting for you to confirm running the database migration.' }),
			createBlockedSession({ title: 'Add telemetry for startup performance', status: SessionStatus.Completed, minutesAgo: 62, workspace: createMockWorkspace('vscode', 'perf/startup-telemetry', failingChecksPr), changesSummary: createMockChangesSummary(8, 240, 58) }),
			createBlockedSession({ title: 'Refactor the notification service', status: SessionStatus.Completed, minutesAgo: 184, workspace: createMockWorkspace('vscode', 'refactor/notifications', unresolvedCommentsPr), changesSummary: createMockChangesSummary(12, 96, 140) }),
			createBlockedSession({ title: 'Migrate settings sync to the new store', status: SessionStatus.NeedsInput, minutesAgo: 240, workspace: createMockWorkspace('vscode', 'feature/settings-store'), description: 'Should I keep the legacy keys for one more release?' }),
			createBlockedSession({ title: 'Investigate flaky terminal integration test', status: SessionStatus.Completed, minutesAgo: 320, workspace: createMockWorkspace('vscode', 'fix/flaky-terminal-test', failingChecksPr), changesSummary: createMockChangesSummary(3, 41, 12) }),
			createBlockedSession({ title: 'Polish the command center hover states', status: SessionStatus.Completed, minutesAgo: 600, workspace: createMockWorkspace('vscode', 'polish/command-center', unresolvedCommentsPr), changesSummary: createMockChangesSummary(5, 64, 9) }),
		]),
	}),

	// One session with a pending terminal approval — shows the approval row + Allow button.
	BlockedSessionsList_OneApproval: defineComponentFixture({
		render: (ctx) => {
			const { sessions, approvalModel } = buildApprovalScenario([
				{ title: 'Build the production bundle', status: SessionStatus.NeedsInput, minutesAgo: 1, workspace: createMockWorkspace('vscode', 'release/prod-build'), approvalCommand: 'npm run build:prod' },
			]);
			renderBlockedList(ctx, sessions, approvalModel);
		},
	}),

	// Two sessions awaiting approval — a short command and a long single-line command.
	BlockedSessionsList_TwoApprovals: defineComponentFixture({
		render: (ctx) => {
			const { sessions, approvalModel } = buildApprovalScenario([
				{ title: 'Push the auth fix', status: SessionStatus.NeedsInput, minutesAgo: 2, workspace: createMockWorkspace('vscode', 'feature/auth-fix'), approvalCommand: 'git push --force-with-lease origin feature/auth-fix' },
				{ title: 'Publish the release image', status: SessionStatus.NeedsInput, minutesAgo: 6, workspace: createMockWorkspace('vscode', 'release/docker'), approvalCommand: 'docker run --rm -it -v "$(pwd)":/workspace -w /workspace -e NODE_ENV=production -e REGISTRY=ghcr.io/microsoft --network host node:20-alpine npm run build:image -- --push --tag latest --no-cache' },
			]);
			renderBlockedList(ctx, sessions, approvalModel);
		},
	}),

	// Five sessions awaiting approval, spanning short, long single-line and
	// multi-line terminal commands (the approval row shows up to three lines).
	BlockedSessionsList_FiveApprovals: defineComponentFixture({
		render: (ctx) => {
			const { sessions, approvalModel } = buildApprovalScenario([
				{ title: 'Install dependencies', status: SessionStatus.NeedsInput, minutesAgo: 1, workspace: createMockWorkspace('vscode', 'chore/deps'), approvalCommand: 'npm ci' },
				{ title: 'Rebase onto main', status: SessionStatus.NeedsInput, minutesAgo: 3, workspace: createMockWorkspace('vscode', 'feature/rebase'), approvalCommand: 'git rebase --onto main feature/old-base feature/new-work' },
				{ title: 'Provision the review environment', status: SessionStatus.NeedsInput, minutesAgo: 7, workspace: createMockWorkspace('vscode', 'infra/review-env'), approvalCommand: 'kubectl apply -f ./deploy/review.yaml --namespace review-pr-4821 && kubectl rollout status deployment/web --namespace review-pr-4821 --timeout=180s && kubectl get pods --namespace review-pr-4821 -o wide' },
				{ title: 'Format changed files', status: SessionStatus.NeedsInput, minutesAgo: 12, workspace: createMockWorkspace('vscode', 'chore/format'), approvalCommand: 'for f in $(git diff --name-only main); do\n  npx prettier --write "$f"\n  git add "$f"\ndone' },
				{ title: 'Reset and reinstall', status: SessionStatus.NeedsInput, minutesAgo: 20, workspace: createMockWorkspace('vscode', 'fix/clean-install'), approvalCommand: 'rm -rf node_modules\nrm -f package-lock.json\nnpm cache clean --force\nnpm install\nnpm run test:integration' },
			]);
			renderBlockedList(ctx, sessions, approvalModel);
		},
	}),

	// One session whose PR is failing CI — shows the orange "Fix CI" row.
	BlockedSessionsList_OneFixCI: defineComponentFixture({
		render: (ctx) => {
			const { sessions, ciFixModel } = buildCIFixScenario([
				{ title: 'Add telemetry for startup performance', status: SessionStatus.Completed, minutesAgo: 62, workspace: createMockWorkspace('vscode', 'perf/startup-telemetry', failingChecksPr), changesSummary: createMockChangesSummary(8, 240, 58), ci: { failed: 2, pending: 3 } },
			]);
			renderBlockedList(ctx, sessions, undefined, ciFixModel);
		},
	}),

	// A mix of a failing-CI session (fix-CI row) and a terminal-approval session
	// (allow row) — the two per-session action rows shown side by side.
	BlockedSessionsList_FixCIAndApproval: defineComponentFixture({
		render: (ctx) => {
			const { sessions: ciSessions, ciFixModel } = buildCIFixScenario([
				{ title: 'Add telemetry for startup performance', status: SessionStatus.Completed, minutesAgo: 62, workspace: createMockWorkspace('vscode', 'perf/startup-telemetry', failingChecksPr), changesSummary: createMockChangesSummary(8, 240, 58), ci: { failed: 5, pending: 0 } },
				{ title: 'Investigate flaky terminal integration test', status: SessionStatus.Completed, minutesAgo: 320, workspace: createMockWorkspace('vscode', 'fix/flaky-terminal-test', failingChecksPr), changesSummary: createMockChangesSummary(3, 41, 12), ci: { failed: 1, pending: 7 } },
			]);
			const { sessions: approvalSessions, approvalModel } = buildApprovalScenario([
				{ title: 'Push the auth fix', status: SessionStatus.NeedsInput, minutesAgo: 2, workspace: createMockWorkspace('vscode', 'feature/auth-fix'), approvalCommand: 'git push --force-with-lease origin feature/auth-fix' },
			]);
			renderBlockedList(ctx, [...ciSessions, ...approvalSessions], approvalModel, ciFixModel);
		},
	}),
});
