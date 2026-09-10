/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isManagedHoverTooltipHTMLElement } from '../../../../../base/browser/ui/hover/hover.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { ImmortalReference } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, observableValue } from '../../../../../base/common/observable.js';
import type { IAction } from '../../../../../base/common/actions.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import type { IChatPillEntry } from '../../../../../workbench/browser/chatPills.js';
import { IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { ISessionChatPillVisibilityService, SessionChatPillKind, SessionChatPillVisibility } from '../../../../../workbench/contrib/chat/common/sessionChatPills.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { ChatOriginKind, SessionArtifactKind, SessionStatus, type IChat, type IGitHubIssueRef, type IGitHubPullRequestRef, type ISessionArtifact, type ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { GitHubIssueState, GitHubPullRequestState, type IGitHubIssue, type IGitHubPullRequest } from '../../../github/common/types.js';
import type { IResolvedSessionPullRequest } from '../../../github/browser/pullRequestIconStatus.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { GitHubPullRequestModel } from '../../../github/browser/models/githubPullRequestModel.js';
import { buildSessionIssueSections, buildSessionPullRequestSections, computeSessionInputPillStats, SessionChatInputToolbar } from '../../browser/sessionChatInputToolbar.js';

suite('SessionChatInputToolbar', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses session-scoped changes rather than the last turn', () => {
		const session = upcastPartial<IActiveSession>({
			sessionId: 'provider:session',
			workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [] })),
			changesets: constObservable([]),
			changes: constObservable([{
				modifiedUri: URI.file('/session-change.ts'),
				insertions: 10,
				deletions: 4,
			}]),
		});
		const cache = upcastPartial<ISessionChangesStatsCache>({
			get: () => ({ files: 2, insertions: 8, deletions: 3 }),
		});
		const stats = derived(reader => computeSessionInputPillStats(session, cache, reader));
		const pendingSession = upcastPartial<IActiveSession>({
			...session,
			worktreePending: constObservable(true),
		});
		const pendingStats = derived(reader => computeSessionInputPillStats(pendingSession, cache, reader));

		assert.deepStrictEqual({
			session: stats.get(),
			pendingWorktree: pendingStats.get(),
		}, {
			session: {
				files: 1,
				insertions: 10,
				deletions: 4,
			},
			pendingWorktree: {
				files: 0,
				insertions: 0,
				deletions: 0,
			},
		});
	});

	test('adds rich GitHub hovers only when live details are available', async () => {
		const commandService = upcastPartial<ICommandService>({ executeCommand: async () => undefined });
		const clipboardService = upcastPartial<IClipboardService>({ writeText: async () => { } });
		const openerService = upcastPartial<IOpenerService>({ open: async () => true });
		const sessionsService = upcastPartial<ISessionsService>({ setActive: () => { } });
		const pullRequestRef: IGitHubPullRequestRef = {
			owner: 'microsoft',
			repo: 'vscode',
			number: 332982,
			uri: URI.parse('https://github.com/microsoft/vscode/pull/332982'),
		};
		const pullRequest: IGitHubPullRequest = {
			number: pullRequestRef.number,
			title: 'Restore rich pill hovers',
			body: 'Provides detailed pull request context.',
			state: GitHubPullRequestState.Open,
			author: { login: 'octocat', avatarUrl: '' },
			headRef: 'feature/rich-hover',
			headSha: 'abc123',
			baseRef: 'main',
			isDraft: false,
			createdAt: '2026-09-03T09:00:00Z',
			updatedAt: '2026-09-03T10:00:00Z',
			mergedAt: undefined,
			mergeable: true,
			mergeableState: 'clean',
		};
		const issueRef: IGitHubIssueRef = {
			owner: 'microsoft',
			repo: 'vscode',
			number: 42,
			uri: URI.parse('https://github.com/microsoft/vscode/issues/42'),
		};
		const issue: IGitHubIssue = {
			number: issueRef.number,
			title: 'Rich issue hover',
			body: 'Provides detailed issue context.',
			state: GitHubIssueState.Open,
			stateReason: undefined,
			author: { login: 'octocat', avatarUrl: '' },
			createdAt: '2026-09-03T09:00:00Z',
			updatedAt: '2026-09-03T10:00:00Z',
			closedAt: undefined,
		};
		const pullRequestEntry = buildSessionPullRequestSections(
			[{ ref: pullRequestRef, pullRequest, icon: Codicon.gitPullRequest, status: {} }],
			undefined,
			commandService,
			clipboardService,
			openerService,
			sessionsService,
		).flatMap(section => section.entries)[0];
		const unresolvedPullRequestEntry = buildSessionPullRequestSections(
			[{ ref: pullRequestRef, pullRequest: undefined, icon: Codicon.gitPullRequest, status: {} }],
			undefined,
			commandService,
			clipboardService,
			openerService,
			sessionsService,
		).flatMap(section => section.entries)[0];
		const issueEntry = buildSessionIssueSections(
			[{ ref: issueRef, issue }],
			undefined,
			commandService,
			clipboardService,
			openerService,
			sessionsService,
		).flatMap(section => section.entries)[0];
		const unresolvedIssueEntry = buildSessionIssueSections(
			[{ ref: issueRef, issue: undefined }],
			undefined,
			commandService,
			clipboardService,
			openerService,
			sessionsService,
		).flatMap(section => section.entries)[0];

		const renderHover = async (entry: IChatPillEntry | undefined) => {
			if (!isManagedHoverTooltipHTMLElement(entry?.pillHover)) {
				return undefined;
			}
			return await entry.pillHover.element(CancellationToken.None);
		};
		const pullRequestHover = await renderHover(pullRequestEntry);
		const issueHover = await renderHover(issueEntry);

		assert.deepStrictEqual({
			pullRequest: {
				className: pullRequestHover?.className,
				repository: pullRequestHover?.querySelector('.sessions-pr-hover-repository')?.textContent,
				title: pullRequestHover?.querySelector('.sessions-pr-hover-title')?.textContent,
				description: pullRequestHover?.querySelector('.sessions-pr-hover-description-content')?.textContent,
				branches: [...pullRequestHover?.querySelectorAll('.sessions-pr-hover-branch') ?? []].map(element => element.textContent),
				unresolvedHover: unresolvedPullRequestEntry?.pillHover,
			},
			issue: {
				className: issueHover?.className,
				repository: issueHover?.querySelector('.sessions-issue-hover-repository')?.textContent,
				title: issueHover?.querySelector('.sessions-issue-hover-title')?.textContent,
				description: issueHover?.querySelector('.sessions-issue-hover-description-content')?.textContent,
				unresolvedHover: unresolvedIssueEntry?.pillHover,
			},
		}, {
			pullRequest: {
				className: 'sessions-pr-hover',
				repository: 'microsoft/vscode',
				title: 'Restore rich pill hovers',
				description: 'Provides detailed pull request context.',
				branches: ['main', 'feature/rich-hover'],
				unresolvedHover: undefined,
			},
			issue: {
				className: 'sessions-issue-hover',
				repository: 'microsoft/vscode#42',
				title: 'Rich issue hover',
				description: 'Provides detailed issue context.',
				unresolvedHover: undefined,
			},
		});
	});

	test('hides the pills in a subagent chat', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const chat = upcastPartial<IChat>({
			resource: URI.parse('chat:main'),
			title: constObservable('Main chat'),
			status: constObservable(SessionStatus.InProgress),
		});
		const subagentChat = upcastPartial<IChat>({
			resource: URI.parse('chat:subagent'),
			title: constObservable('Subagent'),
			status: constObservable(SessionStatus.InProgress),
			origin: { kind: ChatOriginKind.Tool, parentChat: chat.resource },
		});
		const forkedChat = upcastPartial<IChat>({
			resource: URI.parse('chat:fork'),
			title: constObservable('Fork'),
			status: constObservable(SessionStatus.InProgress),
			origin: { kind: ChatOriginKind.Fork, parentChat: chat.resource },
		});
		const session = upcastPartial<IActiveSession>({
			sessionId: 'provider:session',
			capabilities: constObservable({ supportsMultipleChats: true }),
			resource: URI.parse('session:1'),
			chats: constObservable([chat, subagentChat, forkedChat]),
			workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [] })),
			changesets: constObservable([]),
			changes: constObservable([{
				modifiedUri: URI.file('/session-change.ts'),
				insertions: 10,
				deletions: 4,
			}]),
		});
		instantiationService.stub(IBrowserViewWorkbenchService, upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
		}));
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
		visibility.toggle(SessionChatPillKind.Subagents);
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		instantiationService.stub(ISessionChangesStatsCache, upcastPartial<ISessionChangesStatsCache>({ get: () => undefined }));
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({}));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			visibleSessions: constObservable([]),
			activeSession: constObservable(undefined),
		}));
		const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
		const read = () => ({
			pills: Array.from(toolbar.element.querySelectorAll('.chat-pill-label')).map(label => label.textContent),
			visible: toolbar.visible,
		});

		toolbar.setSession(session, chat);
		const main = read();
		toolbar.setSession(session, subagentChat);
		const subagent = read();
		toolbar.setSession(session, forkedChat);

		assert.deepStrictEqual({ main, subagent, fork: read() }, {
			main: { pills: ['1 File', 'Subagent'], visible: true },
			subagent: { pills: [], visible: false },
			fork: { pills: ['1 File'], visible: true },
		});
	});

	test('exposes live and cached pull request states without treating a closed draft as open', () => {
		const ref: IGitHubPullRequestRef = {
			owner: 'microsoft',
			repo: 'vscode',
			number: 1,
			uri: URI.parse('https://github.com/microsoft/vscode/pull/1'),
		};
		const pullRequests: readonly IResolvedSessionPullRequest[] = [
			{ ref, pullRequest: upcastPartial<IGitHubPullRequest>({ state: GitHubPullRequestState.Open, isDraft: true }), icon: Codicon.gitPullRequestDraft, status: {} },
			{ ref, pullRequest: upcastPartial<IGitHubPullRequest>({ state: GitHubPullRequestState.Closed, isDraft: true }), icon: Codicon.gitPullRequestDraft, status: {} },
			{ ref: { ...ref, state: 'merged' }, pullRequest: upcastPartial<IGitHubPullRequest>({ state: GitHubPullRequestState.Open, isDraft: false }), icon: Codicon.gitPullRequest, status: {} },
			{ ref: { ...ref, liveState: 'closed', state: 'open' }, pullRequest: undefined, icon: Codicon.gitPullRequest, status: {} },
			{ ref: { ...ref, state: 'merged' }, pullRequest: undefined, icon: Codicon.gitPullRequest, status: {} },
			{ ref, pullRequest: undefined, icon: Codicon.gitPullRequestDone, status: {} },
			{ ref, pullRequest: undefined, icon: undefined, status: {} },
		];
		const entries = buildSessionPullRequestSections(
			pullRequests,
			undefined,
			upcastPartial<ICommandService>({}),
			upcastPartial<IClipboardService>({}),
			upcastPartial<IOpenerService>({}),
			upcastPartial<ISessionsService>({}),
		).flatMap(section => section.entries);

		assert.deepStrictEqual(entries.map(entry => entry.pullRequestState), ['draft', 'closed', 'open', 'closed', 'merged', 'merged', 'open']);
	});

	test('offers removal only for matching PR artifacts and keeps open and copy actions', async () => {
		const ref = (number: number): IGitHubPullRequestRef => ({
			owner: 'microsoft', repo: 'vscode', number,
			uri: URI.parse(`https://github.com/microsoft/vscode/pull/${number}`),
		});
		const refs = [ref(1), ref(2), ref(3), ref(4)];
		const artifacts: ISessionArtifact[] = refs.slice(0, 3).map((ref, index) => ({
			id: `artifact-${ref.number}`,
			kind: index === 2 ? SessionArtifactKind.Issue : SessionArtifactKind.PullRequest,
			label: `PR ${ref.number}`,
			isArtifact: index !== 1,
			isGitHub: true,
			link: ref.uri,
		}));
		artifacts[0] = { ...artifacts[0], link: URI.parse('https://github.com/Microsoft/VSCode/pull/1/') };
		artifacts.push({ ...artifacts[0], id: 'duplicate', link: refs[0].uri });
		const removed: string[] = [];
		const copied: string[] = [];
		const opened: object[] = [];
		const pullRequests = refs.map(ref => ({ ref, pullRequest: undefined, icon: Codicon.gitPullRequest, status: {} }));
		const commandService = upcastPartial<ICommandService>({
			executeCommand: async (_command, arg) => {
				assert.ok(arg && typeof arg === 'object');
				opened.push(arg);
				return undefined;
			},
		});
		const clipboardService = upcastPartial<IClipboardService>({ writeText: async value => { copied.push(value); } });
		const openerService = upcastPartial<IOpenerService>({});
		const sessionsService = upcastPartial<ISessionsService>({});
		const entries = buildSessionPullRequestSections(pullRequests, undefined, commandService, clipboardService, openerService, sessionsService, {
			artifacts,
			remove: async ids => { removed.push(...ids); },
		})[0].entries;
		const unsupported = buildSessionPullRequestSections(pullRequests, undefined, commandService, clipboardService, openerService, sessionsService)[0].entries;
		await entries[0].removeAction?.run();
		await entries[0].toolbarActions?.[0].run();
		entries[0].open();

		assert.deepStrictEqual({
			removable: entries.map(entry => !!entry.removeAction),
			unsupported: unsupported.map(entry => !!entry.removeAction),
			removed, copied, opened,
		}, {
			removable: [true, false, false, false],
			unsupported: [false, false, false, false],
			removed: ['artifact-1', 'duplicate'],
			copied: [refs[0].uri.toString(true)],
			opened: [{ pullRequest: refs[0] }],
		});
	});

	test('removal reacts to capabilities, targets the owning session, and reports errors without hiding the artifact', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const ref: IGitHubPullRequestRef = { owner: 'microsoft', repo: 'vscode', number: 1, uri: URI.parse('https://github.com/microsoft/vscode/pull/1') };
		const artifacts = observableValue<readonly ISessionArtifact[]>('artifacts', [{
			id: 'pr-artifact', kind: SessionArtifactKind.PullRequest, label: 'PR', isArtifact: true, isGitHub: true, link: ref.uri,
		}]);
		const capabilities = observableValue('capabilities', { supportsMultipleChats: false, supportsRemoveArtifacts: false });
		const chat = upcastPartial<IChat>({ resource: URI.parse('chat:main'), title: constObservable('Chat'), status: constObservable(SessionStatus.Completed) });
		const session = upcastPartial<IActiveSession>({
			sessionId: 'owning-session', resource: URI.parse('session:owning'), artifacts, capabilities,
			chats: constObservable([chat]), changesets: constObservable([]), changes: constObservable([]),
			workspace: constObservable(upcastPartial<ISessionWorkspace>({
				folders: [{
					root: URI.file('/repo'), workingDirectory: URI.file('/repo'), name: 'repo', description: undefined,
					gitRepository: { uri: URI.file('/repo'), workTreeUri: undefined, baseBranchName: 'main', gitHubInfo: constObservable({ owner: ref.owner, repo: ref.repo, pullRequests: [ref] }) },
				}],
			})),
		});
		instantiationService.stub(IBrowserViewWorkbenchService, upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None, getKnownBrowserViews: () => new Map(),
		}));
		instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({
			createPullRequestModelReference: () => new ImmortalReference(upcastPartial<GitHubPullRequestModel>({ pullRequest: constObservable(undefined) })),
		}));
		instantiationService.stub(ISessionChatPillVisibilityService, store.add(instantiationService.createInstance(SessionChatPillVisibility)));
		instantiationService.stub(ISessionChangesStatsCache, upcastPartial<ISessionChangesStatsCache>({ get: () => undefined }));
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			visibleSessions: constObservable([]), activeSession: constObservable(undefined),
		}));
		const calls: { owningSession: boolean; artifactId: string }[] = [];
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			removeSessionArtifact: async (target, artifactId) => {
				calls.push({ owningSession: target === session, artifactId });
				if (calls.length === 1) {
					throw new Error('offline');
				}
				artifacts.set([], undefined);
			},
		}));
		const errors: string[] = [];
		instantiationService.stub(INotificationService, { error: error => { errors.push(String(error)); } });
		let menu: readonly IAction[] = [];
		instantiationService.stub(IContextMenuService, { showContextMenu: delegate => { menu = delegate.getActions!(); } });
		const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
		toolbar.setSession(session, chat);
		const removal = () => {
			toolbar.element.querySelector<HTMLElement>('.chat-dropdown-pill-button')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
			return menu.find(action => action.id.startsWith('sessionChatPills.removePullRequest.'));
		};
		const unavailable = !!removal();
		capabilities.set({ supportsMultipleChats: false, supportsRemoveArtifacts: true }, undefined);
		await removal()?.run();
		const afterFailure = { removable: !!removal(), artifacts: artifacts.get().map(artifact => artifact.id) };
		await removal()?.run();

		assert.deepStrictEqual({
			unavailable, afterFailure, errors,
			calls,
			afterSuccess: { removable: !!removal(), artifacts: artifacts.get(), label: toolbar.element.querySelector('.chat-pill-label')?.textContent },
		}, {
			unavailable: false,
			afterFailure: { removable: true, artifacts: ['pr-artifact'] },
			errors: ['Could not remove pull request artifact: offline'],
			calls: [{ owningSession: true, artifactId: 'pr-artifact' }, { owningSession: true, artifactId: 'pr-artifact' }],
			afterSuccess: { removable: false, artifacts: [], label: '#1' },
		});
	});
});
