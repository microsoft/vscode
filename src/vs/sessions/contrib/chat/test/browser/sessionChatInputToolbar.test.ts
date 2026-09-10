/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isManagedHoverTooltipHTMLElement } from '../../../../../base/browser/ui/hover/hover.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, derived } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import type { IChatPillEntry } from '../../../../../workbench/browser/chatPills.js';
import { IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { ISessionChatPillVisibilityService, SessionChatPillKind, SessionChatPillVisibility } from '../../../../../workbench/contrib/chat/common/sessionChatPills.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { ChatOriginKind, SESSION_CHANGES_CHANGESET_ID, SessionStatus, type IChat, type IGitHubIssueRef, type IGitHubPullRequestRef, type ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangesEditorOptions, ISessionChangesService } from '../../../changes/common/sessionChangesService.js';
import { GitHubIssueState, GitHubPullRequestState, type IGitHubIssue, type IGitHubPullRequest } from '../../../github/common/types.js';
import type { IResolvedSessionPullRequest } from '../../../github/browser/pullRequestIconStatus.js';
import { buildSessionIssueSections, buildSessionPullRequestSections, computeSessionInputPillStats, SessionChatInputToolbar } from '../../browser/sessionChatInputToolbar.js';

suite('SessionChatInputToolbar', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createServices() {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IBrowserViewWorkbenchService, upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
		}));
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		instantiationService.stub(ISessionChangesStatsCache, upcastPartial<ISessionChangesStatsCache>({ get: () => undefined }));
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			visibleSessions: constObservable([]),
			activeSession: constObservable(undefined),
		}));
		return { instantiationService, visibility };
	}

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

	for (const activation of ['click', 'Enter', 'Space'] as const) {
		test(`opens Session Changes from the changes pill with ${activation}`, () => {
			const { instantiationService } = createServices();
			const session = upcastPartial<IActiveSession>({
				sessionId: 'provider:session',
				resource: URI.parse('session:1'),
				chats: constObservable([]),
				workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [] })),
				changesets: constObservable([]),
				changes: constObservable([{
					modifiedUri: URI.file('/session-change.ts'),
					insertions: 10,
					deletions: 4,
				}]),
			});
			const calls: { action: string; resource?: URI; options?: ISessionChangesEditorOptions }[] = [];
			instantiationService.stub(ISessionsService, 'setActive', (session: IActiveSession | undefined) => {
				calls.push({ action: 'activate', resource: session?.resource });
			});
			instantiationService.stub(IAgentWorkbenchLayoutService, upcastPartial<IAgentWorkbenchLayoutService>({
				revealEditorPartExplicitly: () => { calls.push({ action: 'reveal' }); },
			}));
			instantiationService.stub(ISessionChangesService, upcastPartial<ISessionChangesService>({
				openChangesEditor: async (resource, options) => {
					calls.push({ action: 'open', resource, options });
					return undefined;
				},
			}));
			const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
			toolbar.setSession(session, undefined);
			const pill = toolbar.element.querySelector<HTMLElement>('.chat-changes-pill-button');
			assert.ok(pill);

			if (activation === 'click') {
				pill.click();
			} else {
				pill.dispatchEvent(new KeyboardEvent('keydown', {
					key: activation === 'Enter' ? 'Enter' : ' ',
					keyCode: activation === 'Enter' ? 13 : 32,
					bubbles: true,
				}));
			}

			assert.deepStrictEqual(calls, [
				{ action: 'activate', resource: session.resource },
				{ action: 'reveal' },
				{ action: 'open', resource: session.resource, options: { changesetSelection: { kind: 'id', id: SESSION_CHANGES_CHANGESET_ID } } },
			]);
		});
	}

	test('adds rich GitHub hovers only when live details are available', async () => {
		const commands: { readonly id: string; readonly args: readonly unknown[] }[] = [];
		const commandService = upcastPartial<ICommandService>({
			executeCommand: async (id, ...args) => {
				commands.push({ id, args });
				return undefined;
			},
		});
		const clipboardService = upcastPartial<IClipboardService>({ writeText: async () => { } });
		const openerService = upcastPartial<IOpenerService>({ open: async () => true });
		const sessionsService = upcastPartial<ISessionsService>({ setActive: () => { } });
		const pullRequestRef: IGitHubPullRequestRef = {
			owner: 'microsoft',
			repo: 'vscode',
			number: 332982,
			uri: URI.parse('https://github.com/microsoft/vscode/pull/332982'),
			title: 'Recorded pull request title',
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
			title: 'Recorded issue title',
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
		pullRequestEntry?.open();
		unresolvedIssueEntry?.open();

		assert.deepStrictEqual({
			pullRequest: {
				label: pullRequestEntry?.label,
				className: pullRequestHover?.className,
				repository: pullRequestHover?.querySelector('.sessions-pr-hover-repository')?.textContent,
				title: pullRequestHover?.querySelector('.sessions-pr-hover-title')?.textContent,
				description: pullRequestHover?.querySelector('.sessions-pr-hover-description-content')?.textContent,
				branches: [...pullRequestHover?.querySelectorAll('.sessions-pr-hover-branch') ?? []].map(element => element.textContent),
				unresolvedLabel: unresolvedPullRequestEntry?.label,
				unresolvedAriaLabel: unresolvedPullRequestEntry?.ariaLabel,
				unresolvedTooltip: unresolvedPullRequestEntry?.tooltip,
				unresolvedHover: unresolvedPullRequestEntry?.pillHover,
			},
			issue: {
				label: issueEntry?.label,
				className: issueHover?.className,
				repository: issueHover?.querySelector('.sessions-issue-hover-repository')?.textContent,
				title: issueHover?.querySelector('.sessions-issue-hover-title')?.textContent,
				description: issueHover?.querySelector('.sessions-issue-hover-description-content')?.textContent,
				unresolvedLabel: unresolvedIssueEntry?.label,
				unresolvedAriaLabel: unresolvedIssueEntry?.ariaLabel,
				unresolvedTooltip: unresolvedIssueEntry?.tooltip,
				unresolvedHover: unresolvedIssueEntry?.pillHover,
				openCommands: commands,
			},
		}, {
			pullRequest: {
				label: 'Pull Request #332982: Restore rich pill hovers',
				className: 'sessions-pr-hover',
				repository: 'microsoft/vscode',
				title: 'Restore rich pill hovers',
				description: 'Provides detailed pull request context.',
				branches: ['main', 'feature/rich-hover'],
				unresolvedLabel: 'Pull Request #332982: Recorded pull request title',
				unresolvedAriaLabel: 'Open Pull Request #332982: Recorded pull request title',
				unresolvedTooltip: 'Pull Request #332982: Recorded pull request title\nhttps://github.com/microsoft/vscode/pull/332982',
				unresolvedHover: undefined,
			},
			issue: {
				label: 'Issue #42: Rich issue hover',
				className: 'sessions-issue-hover',
				repository: 'microsoft/vscode#42',
				title: 'Rich issue hover',
				description: 'Provides detailed issue context.',
				unresolvedLabel: 'Issue #42: Recorded issue title',
				unresolvedAriaLabel: 'Open Issue #42: Recorded issue title',
				unresolvedTooltip: 'Issue #42: Recorded issue title\nhttps://github.com/microsoft/vscode/issues/42',
				unresolvedHover: undefined,
				openCommands: [
					{
						id: 'workbench.agentSessions.action.openPullRequest',
						args: [{ pullRequest: pullRequestRef }],
					},
					{
						id: 'workbench.agentSessions.action.openIssue',
						args: [{ issue: issueRef }],
					},
				],
			},
		});
	});

	test('hides the pills in a subagent chat', () => {
		const { instantiationService, visibility } = createServices();
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
		visibility.toggle(SessionChatPillKind.Subagents);
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
});
