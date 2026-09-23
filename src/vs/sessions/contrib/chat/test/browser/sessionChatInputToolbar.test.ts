/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isManagedHoverTooltipHTMLElement } from '../../../../../base/browser/ui/hover/hover.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { ImmortalReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, observableValue } from '../../../../../base/common/observable.js';
import { SubmenuAction, type IAction } from '../../../../../base/common/actions.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import type { IChatPillEntry } from '../../../../../workbench/browser/chatPills.js';
import { IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import type { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { ISessionChatPillVisibilityService, SessionChatPillKind, SessionChatPillVisibility } from '../../../../../workbench/contrib/chat/common/sessionChatPills.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { BRANCH_CHANGES_CHANGESET_ID, ChatOriginKind, SESSION_CHANGES_CHANGESET_ID, SessionArtifactKind, SessionStatus, type IChat, type IGitHubIssueRef, type IGitHubPullRequestRef, type ISessionArtifact, type ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangesEditorOptions, ISessionChangesService } from '../../../changes/common/sessionChangesService.js';
import { getGitHubHoverDate, getGitHubHoverDescription, getGitHubHoverTitle, getGitHubHoverTitleParts } from '../../../github/browser/githubHover.js';
import { createIssueHoverElement } from '../../../github/browser/issueHover.js';
import { GitHubCIOverallStatus, GitHubIssueState, GitHubIssueStateReason, GitHubPullRequestState, type IGitHubIssue, type IGitHubPullRequest } from '../../../github/common/types.js';
import type { IResolvedSessionPullRequest } from '../../../github/browser/pullRequestIconStatus.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { GitHubPullRequestModel } from '../../../github/browser/models/githubPullRequestModel.js';
import { GitHubIssueModel } from '../../../github/browser/models/githubIssueModel.js';
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
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({}));
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

	for (const worktree of [false, true]) {
		for (const activation of ['click', 'Enter', 'Space'] as const) {
			test(`opens ${worktree ? 'Branch' : 'Session'} Changes from the pill with ${activation} and follows workspace updates`, () => {
				const { instantiationService } = createServices();
				const root = URI.file('/repo');
				const createWorkspace = (worktree: boolean) => upcastPartial<ISessionWorkspace>({
					folders: [{
						root,
						name: 'repo',
						description: undefined,
						workingDirectory: worktree ? URI.file('/worktrees/repo') : root,
						gitRepository: {
							uri: root,
							workTreeUri: worktree ? URI.file('/worktrees/repo') : undefined,
							baseBranchName: 'main',
							gitHubInfo: constObservable(undefined),
						},
					}],
				});
				const workspace = observableValue('workspace', createWorkspace(worktree));
				const session = upcastPartial<IActiveSession>({
					sessionId: 'provider:session',
					capabilities: constObservable({ supportsMultipleChats: false }),
					resource: URI.parse('session:1'),
					chats: constObservable([]),
					workspace,
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
				for (const currentWorktree of [worktree, !worktree]) {
					workspace.set(createWorkspace(currentWorktree), undefined);
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
				}

				assert.deepStrictEqual(calls, [worktree, !worktree].flatMap(currentWorktree => [
					{ action: 'activate', resource: session.resource },
					{ action: 'reveal' },
					{ action: 'open', resource: session.resource, options: { changesetSelection: { kind: 'id', id: currentWorktree ? BRANCH_CHANGES_CHANGESET_ID : SESSION_CHANGES_CHANGESET_ID } } },
				]));
			});
		}
	}

	test('adds rich GitHub hovers only when live details are available', async () => {
		const commands: { readonly id: string; readonly args: readonly unknown[] }[] = [];
		const clipboardWrites: string[] = [];
		const commandService = upcastPartial<ICommandService>({
			executeCommand: async (id, ...args) => {
				commands.push({ id, args });
				return undefined;
			},
		});
		const clipboardService = upcastPartial<IClipboardService>({ writeText: async value => { clipboardWrites.push(value); } });
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
			state: GitHubPullRequestState.Merged,
			author: { login: 'octocat', avatarUrl: '' },
			headRef: 'feature/rich-hover',
			headSha: 'abc123',
			baseRef: 'main',
			isDraft: false,
			createdAt: '2026-09-03T09:00:00Z',
			updatedAt: '2026-09-03T10:00:00Z',
			mergedAt: '2026-09-04T10:00:00Z',
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
			state: GitHubIssueState.Closed,
			stateReason: GitHubIssueStateReason.Completed,
			author: { login: 'octocat', avatarUrl: '' },
			createdAt: '2026-09-03T09:00:00Z',
			updatedAt: '2026-09-03T10:00:00Z',
			closedAt: '2026-09-04T10:00:00Z',
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
		const issueHoverCache = new WeakMap<IGitHubIssueRef, { readonly element: HTMLElement; readonly tabbableElements: readonly HTMLElement[] }>();
		const cachedIssueEntry = buildSessionIssueSections(
			[{ ref: issueRef, issue }],
			undefined,
			commandService,
			clipboardService,
			openerService,
			sessionsService,
			undefined,
			issueHoverCache,
		).flatMap(section => section.entries)[0];
		const refreshedCachedIssueEntry = buildSessionIssueSections(
			[{ ref: issueRef, issue: { ...issue, title: 'Updated issue hover' } }],
			undefined,
			commandService,
			clipboardService,
			openerService,
			sessionsService,
			undefined,
			issueHoverCache,
		).flatMap(section => section.entries)[0];
		const activeIssueEntry = buildSessionIssueSections(
			[{
				ref: issueRef,
				issue: {
					...issue,
					state: GitHubIssueState.Open,
					stateReason: undefined,
					updatedAt: '2026-09-05T10:00:00Z',
					closedAt: undefined,
				},
			}],
			undefined,
			commandService,
			clipboardService,
			openerService,
			sessionsService,
		).flatMap(section => section.entries)[0];
		const duplicateIssueEntry = buildSessionIssueSections(
			[{ ref: issueRef, issue: { ...issue, stateReason: GitHubIssueStateReason.Duplicate } }],
			undefined,
			commandService,
			clipboardService,
			openerService,
			sessionsService,
		).flatMap(section => section.entries)[0];
		const notPlannedIssueEntry = buildSessionIssueSections(
			[{ ref: issueRef, issue: { ...issue, stateReason: GitHubIssueStateReason.NotPlanned } }],
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
		const renderDropdownHover = (entry: IChatPillEntry | undefined) =>
			typeof entry?.hover?.content === 'function' ? entry.hover.content() : undefined;
		const pullRequestHover = await renderHover(pullRequestEntry);
		const issueHover = await renderHover(issueEntry);
		const activeIssueHover = await renderHover(activeIssueEntry);
		const duplicateIssueHover = await renderHover(duplicateIssueEntry);
		const notPlannedIssueHover = await renderHover(notPlannedIssueEntry);
		const pullRequestDropdownHover = renderDropdownHover(pullRequestEntry);
		const issueDropdownHover = renderDropdownHover(issueEntry);
		const cachedIssueDropdownHover = renderDropdownHover(cachedIssueEntry);
		const refreshedCachedIssueDropdownHover = renderDropdownHover(refreshedCachedIssueEntry);
		pullRequestHover?.querySelectorAll<HTMLButtonElement>('.sessions-pr-hover-branch').forEach(branch => branch.click());
		pullRequestEntry?.open();
		unresolvedIssueEntry?.open();

		assert.deepStrictEqual({
			pullRequest: {
				label: pullRequestEntry?.label,
				badge: pullRequestEntry?.badge,
				rowClassName: pullRequestEntry?.className,
				pillHoverContentOwnsPadding: isManagedHoverTooltipHTMLElement(pullRequestEntry?.pillHover) ? pullRequestEntry.pillHover.contentOwnsPadding : undefined,
				className: pullRequestHover?.className,
				contentOrder: [...pullRequestHover?.children ?? []].map(element => element.className),
				provenanceOrder: [...pullRequestHover?.querySelector('.sessions-pr-hover-header')?.children ?? []].map(element => element.className),
				titleOrder: [...pullRequestHover?.querySelector('.sessions-pr-hover-title-content')?.childNodes ?? []].map(node => node.nodeType === 3 ? '#text' : (node as HTMLElement).className),
				dropdownClassName: pullRequestDropdownHover?.className,
				dropdownMatchesStandaloneContent: pullRequestDropdownHover?.textContent === pullRequestHover?.textContent,
				dropdownExpandable: pullRequestEntry?.hover?.expandable,
				dropdownIndicator: pullRequestEntry?.hover?.showIndicator,
				dropdownTabThroughPanel: pullRequestEntry?.hover?.tabThroughPanel,
				dropdownTabbableElements: pullRequestEntry?.hover?.getTabbableElements?.().length,
				dropdownContentOwnsPadding: pullRequestEntry?.hover?.contentOwnsPadding,
				repository: pullRequestHover?.querySelector('.sessions-pr-hover-repository')?.textContent,
				reference: pullRequestHover?.querySelector('.sessions-pr-hover-reference')?.textContent,
				referenceAriaLabel: pullRequestHover?.querySelector('.sessions-pr-hover-reference')?.getAttribute('aria-label'),
				status: pullRequestHover?.querySelector<HTMLElement>('.sessions-pr-hover-status')?.textContent,
				statusKind: pullRequestHover?.querySelector<HTMLElement>('.sessions-pr-hover-status')?.dataset.state,
				statusIconAriaHidden: pullRequestHover?.querySelector('.sessions-pr-hover-status .codicon')?.getAttribute('aria-hidden'),
				date: pullRequestHover?.querySelector('.sessions-pr-hover-date')?.textContent,
				title: pullRequestHover?.querySelector('.sessions-pr-hover-title-content')?.textContent?.replace('#332982', '').trim(),
				titleTailOrder: [...pullRequestHover?.querySelector('.sessions-pr-hover-title-tail')?.childNodes ?? []].map(node => node.nodeType === 3 ? '#text' : (node as HTMLElement).className),
				titleTooltip: pullRequestHover?.querySelector('.sessions-pr-hover-title')?.getAttribute('title'),
				description: pullRequestHover?.querySelector('.sessions-pr-hover-description-content')?.textContent,
				author: pullRequestHover?.querySelector('.sessions-pr-hover-author')?.textContent,
				branches: [...pullRequestHover?.querySelectorAll('.sessions-pr-hover-branch') ?? []].map(element => element.textContent),
				branchArrowAriaHidden: pullRequestHover?.querySelector('.sessions-pr-hover-branch-arrow')?.getAttribute('aria-hidden'),
				branchControls: [...pullRequestHover?.querySelectorAll('.sessions-pr-hover-branch') ?? []].map(element => ({
					tagName: element.tagName,
					ariaLabel: element.getAttribute('aria-label'),
				})),
				unresolvedLabel: unresolvedPullRequestEntry?.label,
				unresolvedBadge: unresolvedPullRequestEntry?.badge,
				unresolvedRowClassName: unresolvedPullRequestEntry?.className,
				unresolvedAriaLabel: unresolvedPullRequestEntry?.ariaLabel,
				unresolvedTooltip: unresolvedPullRequestEntry?.tooltip,
				unresolvedHover: unresolvedPullRequestEntry?.pillHover,
				clipboardWrites,
			},
			issue: {
				label: issueEntry?.label,
				badge: issueEntry?.badge,
				rowClassName: issueEntry?.className,
				pillHoverContentOwnsPadding: isManagedHoverTooltipHTMLElement(issueEntry?.pillHover) ? issueEntry.pillHover.contentOwnsPadding : undefined,
				className: issueHover?.className,
				contentOrder: [...issueHover?.children ?? []].map(element => element.className),
				provenanceOrder: [...issueHover?.querySelector('.sessions-issue-hover-header')?.children ?? []].map(element => element.className),
				titleOrder: [...issueHover?.querySelector('.sessions-issue-hover-title-content')?.childNodes ?? []].map(node => node.nodeType === 3 ? '#text' : (node as HTMLElement).className),
				dropdownClassName: issueDropdownHover?.className,
				dropdownMatchesStandaloneContent: issueDropdownHover?.textContent === issueHover?.textContent,
				dropdownPreservedOnRefresh: cachedIssueDropdownHover === refreshedCachedIssueDropdownHover,
				dropdownUpdatedOnRefresh: refreshedCachedIssueDropdownHover?.textContent?.includes('Updated issue hover'),
				dropdownExpandable: issueEntry?.hover?.expandable,
				dropdownIndicator: issueEntry?.hover?.showIndicator,
				dropdownTabThroughPanel: issueEntry?.hover?.tabThroughPanel,
				dropdownTabbableElements: issueEntry?.hover?.getTabbableElements?.().length,
				dropdownContentOwnsPadding: issueEntry?.hover?.contentOwnsPadding,
				repository: issueHover?.querySelector('.sessions-issue-hover-repository')?.textContent,
				reference: issueHover?.querySelector('.sessions-issue-hover-reference')?.textContent,
				referenceAriaLabel: issueHover?.querySelector('.sessions-issue-hover-reference')?.getAttribute('aria-label'),
				status: issueHover?.querySelector<HTMLElement>('.sessions-issue-hover-status')?.textContent,
				statusKind: issueHover?.querySelector<HTMLElement>('.sessions-issue-hover-status')?.dataset.state,
				statusIconAriaHidden: issueHover?.querySelector('.sessions-issue-hover-status .codicon')?.getAttribute('aria-hidden'),
				date: issueHover?.querySelector('.sessions-issue-hover-date')?.textContent,
				title: issueHover?.querySelector('.sessions-issue-hover-title-content')?.textContent?.replace('#42', '').trim(),
				titleTailOrder: [...issueHover?.querySelector('.sessions-issue-hover-title-tail')?.childNodes ?? []].map(node => node.nodeType === 3 ? '#text' : (node as HTMLElement).className),
				titleTooltip: issueHover?.querySelector('.sessions-issue-hover-title')?.getAttribute('title'),
				description: issueHover?.querySelector('.sessions-issue-hover-description-content')?.textContent,
				author: issueHover?.querySelector('.sessions-issue-hover-author')?.textContent,
				unresolvedLabel: unresolvedIssueEntry?.label,
				unresolvedBadge: unresolvedIssueEntry?.badge,
				unresolvedRowClassName: unresolvedIssueEntry?.className,
				unresolvedAriaLabel: unresolvedIssueEntry?.ariaLabel,
				unresolvedTooltip: unresolvedIssueEntry?.tooltip,
				unresolvedHover: unresolvedIssueEntry?.pillHover,
				unresolvedAriaDescription: unresolvedIssueEntry?.ariaDescription,
				ariaDescription: issueEntry?.ariaDescription,
				openCommands: commands,
			},
			activeIssue: {
				status: activeIssueHover?.querySelector('.sessions-issue-hover-status')?.textContent,
				date: activeIssueHover?.querySelector('.sessions-issue-hover-date')?.textContent,
				ariaDescription: activeIssueEntry?.ariaDescription,
			},
			duplicateIssue: {
				status: duplicateIssueHover?.querySelector('.sessions-issue-hover-status')?.textContent,
				statusKind: duplicateIssueHover?.querySelector<HTMLElement>('.sessions-issue-hover-status')?.dataset.state,
				ariaDescription: duplicateIssueEntry?.ariaDescription,
			},
			notPlannedIssue: {
				status: notPlannedIssueHover?.querySelector('.sessions-issue-hover-status')?.textContent,
				statusKind: notPlannedIssueHover?.querySelector<HTMLElement>('.sessions-issue-hover-status')?.dataset.state,
				ariaDescription: notPlannedIssueEntry?.ariaDescription,
			},
		}, {
			pullRequest: {
				label: 'Restore rich pill hovers',
				badge: '#332982',
				rowClassName: 'chat-pill-github-reference',
				pillHoverContentOwnsPadding: true,
				className: 'sessions-pr-hover',
				contentOrder: [
					'sessions-pr-hover-header',
					'sessions-pr-hover-title',
					'sessions-pr-hover-status-row',
					'sessions-pr-hover-description',
					'sessions-pr-hover-branches',
					'sessions-pr-hover-author',
				],
				provenanceOrder: ['sessions-pr-hover-repository', 'sessions-pr-hover-date'],
				titleOrder: ['#text', 'sessions-pr-hover-title-tail'],
				titleTailOrder: ['#text', 'sessions-pr-hover-reference'],
				dropdownClassName: 'sessions-pr-hover compact',
				dropdownMatchesStandaloneContent: true,
				dropdownExpandable: true,
				dropdownIndicator: false,
				dropdownTabThroughPanel: true,
				dropdownTabbableElements: 4,
				dropdownContentOwnsPadding: true,
				repository: 'microsoft/vscode',
				reference: '#332982',
				referenceAriaLabel: 'Pull Request #332982',
				status: 'Merged',
				statusKind: 'merged',
				statusIconAriaHidden: 'true',
				date: 'on Sep 3',
				title: 'Restore rich pill hovers',
				titleTooltip: 'Restore rich pill hovers',
				description: 'Provides detailed pull request context.',
				author: '@octocat opened this pull request',
				branches: ['main', 'feature/rich-hover'],
				branchArrowAriaHidden: 'true',
				branchControls: [
					{ tagName: 'BUTTON', ariaLabel: 'Copy base branch main' },
					{ tagName: 'BUTTON', ariaLabel: 'Copy head branch feature/rich-hover' },
				],
				unresolvedLabel: 'Recorded pull request title',
				unresolvedBadge: '#332982',
				unresolvedRowClassName: 'chat-pill-github-reference',
				unresolvedAriaLabel: 'Open Pull Request #332982: Recorded pull request title',
				unresolvedTooltip: 'Pull Request #332982: Recorded pull request title\nhttps://github.com/microsoft/vscode/pull/332982',
				unresolvedHover: undefined,
				clipboardWrites: ['main', 'feature/rich-hover'],
			},
			issue: {
				label: 'Rich issue hover',
				badge: '#42',
				rowClassName: 'chat-pill-github-reference',
				pillHoverContentOwnsPadding: true,
				className: 'sessions-issue-hover',
				contentOrder: [
					'sessions-issue-hover-header',
					'sessions-issue-hover-title',
					'sessions-issue-hover-status-row',
					'sessions-issue-hover-description',
					'sessions-issue-hover-author',
				],
				provenanceOrder: ['sessions-issue-hover-repository', 'sessions-issue-hover-date'],
				titleOrder: ['#text', 'sessions-issue-hover-title-tail'],
				titleTailOrder: ['#text', 'sessions-issue-hover-reference'],
				dropdownClassName: 'sessions-issue-hover compact',
				dropdownMatchesStandaloneContent: true,
				dropdownPreservedOnRefresh: true,
				dropdownUpdatedOnRefresh: true,
				dropdownExpandable: true,
				dropdownIndicator: false,
				dropdownTabThroughPanel: true,
				dropdownTabbableElements: 2,
				dropdownContentOwnsPadding: true,
				repository: 'microsoft/vscode',
				reference: '#42',
				referenceAriaLabel: 'Issue #42',
				status: 'Closed',
				statusKind: 'closed',
				statusIconAriaHidden: 'true',
				date: 'on Sep 3',
				title: 'Rich issue hover',
				titleTooltip: 'Rich issue hover',
				description: 'Provides detailed issue context.',
				author: '@octocat opened this issue',
				unresolvedLabel: 'Recorded issue title',
				unresolvedBadge: '#42',
				unresolvedRowClassName: 'chat-pill-github-reference',
				unresolvedAriaLabel: 'Open Issue #42: Recorded issue title',
				unresolvedTooltip: 'Issue #42: Recorded issue title\nhttps://github.com/microsoft/vscode/issues/42',
				unresolvedHover: undefined,
				unresolvedAriaDescription: 'https://github.com/microsoft/vscode/issues/42',
				ariaDescription: 'Closed. https://github.com/microsoft/vscode/issues/42',
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
			activeIssue: {
				status: 'Open',
				date: 'on Sep 3',
				ariaDescription: 'Open. https://github.com/microsoft/vscode/issues/42',
			},
			duplicateIssue: {
				status: 'Duplicate',
				statusKind: 'duplicate',
				ariaDescription: 'Duplicate. https://github.com/microsoft/vscode/issues/42',
			},
			notPlannedIssue: {
				status: 'Not planned',
				statusKind: 'notPlanned',
				ariaDescription: 'Not planned. https://github.com/microsoft/vscode/issues/42',
			},
		});
	});

	test('bounds and normalizes GitHub hover descriptions for assistive technology', () => {
		const description = getGitHubHoverDescription(`<!-- template -->\n## Summary\n\n${'Useful context with [documentation](https://example.com). '.repeat(8)}`, 'No description provided.');
		const unicodeDescription = getGitHubHoverDescription(`${'a'.repeat(198)}😀xy`, 'No description provided.');
		const title = getGitHubHoverTitle(`${'a'.repeat(78)}😀xy`);
		const titleParts = getGitHubHoverTitleParts('A title ending in context');
		const singleTokenTitleParts = getGitHubHoverTitleParts('a'.repeat(100));

		assert.deepStrictEqual({
			startsWithReadableText: description.startsWith('Summary Useful context with documentation.'),
			containsMarkdownSyntax: /<!--|##|\[|\]\(/.test(description),
			length: description.length,
			endsWithEllipsis: description.endsWith('…'),
			unicodeDescription: {
				codePoints: Array.from(unicodeDescription).length,
				endsAtCodePointBoundary: unicodeDescription.endsWith('😀…'),
				containsReplacementCharacter: unicodeDescription.includes('�'),
			},
			title: {
				codePoints: Array.from(title).length,
				endsAtCodePointBoundary: title.endsWith('😀…'),
			},
			titleParts,
			singleTokenTitleParts,
		}, {
			startsWithReadableText: true,
			containsMarkdownSyntax: false,
			length: 200,
			endsWithEllipsis: true,
			unicodeDescription: {
				codePoints: 200,
				endsAtCodePointBoundary: true,
				containsReplacementCharacter: false,
			},
			title: {
				codePoints: 80,
				endsAtCodePointBoundary: true,
			},
			titleParts: { leading: 'A title ending in ', trailing: 'context' },
			singleTokenTitleParts: { leading: `${'a'.repeat(79)}…`, trailing: undefined },
		});
	});

	test('uses the shared GitHub date pattern for valid timestamps', () => {
		assert.deepStrictEqual({
			valid: getGitHubHoverDate('2026-09-03T10:00:00Z'),
			missing: getGitHubHoverDate(undefined),
			invalid: getGitHubHoverDate('not-a-date'),
		}, {
			valid: 'Sep 3',
			missing: undefined,
			invalid: undefined,
		});
	});

	test('reveals a bounded title when keyboard focus reaches its reference link', () => {
		const title = `${'Long issue title '.repeat(8)}ending`;
		const hover = createIssueHoverElement({
			owner: 'microsoft',
			repo: 'vscode',
			number: 42,
			repositoryHref: 'https://github.com/microsoft/vscode',
			referenceHref: 'https://github.com/microsoft/vscode/issues/42',
			issue: {
				number: 42,
				title,
				body: '',
				state: GitHubIssueState.Open,
				stateReason: undefined,
				author: { login: 'octocat', avatarUrl: '' },
				createdAt: '2026-09-03T10:00:00Z',
				updatedAt: '2026-09-03T10:00:00Z',
				closedAt: undefined,
			},
			density: 'compact',
		});
		const titleContent = hover.querySelector('.sessions-issue-hover-title-content');
		const reference = hover.querySelector<HTMLAnchorElement>('.sessions-issue-hover-reference');
		const bounded = titleContent?.textContent;
		reference?.dispatchEvent(new FocusEvent('focus'));
		const focused = titleContent?.textContent;
		reference?.dispatchEvent(new FocusEvent('blur'));

		assert.deepStrictEqual({
			bounded,
			focused,
			restored: titleContent?.textContent,
			fullTitle: hover.querySelector('.sessions-issue-hover-title')?.getAttribute('title'),
		}, {
			bounded: `${getGitHubHoverTitle(title)}\u00a0#42`,
			focused: `${title}\u00a0#42`,
			restored: `${getGitHubHoverTitle(title)}\u00a0#42`,
			fullTitle: title,
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

	for (const keyboard of [false, true]) {
		for (const withChanges of [false, true]) {
			test(`groups and restores filtered subagents from ${withChanges ? 'another pill' : 'the empty toolbar'} using ${keyboard ? 'the keyboard' : 'the mouse'}`, async () => {
				const { instantiationService, visibility } = createServices();
				visibility.toggle(SessionChatPillKind.Subagents);
				let menuActions: readonly IAction[] = [];
				instantiationService.stub(IContextMenuService, {
					showContextMenu: delegate => {
						assert.ok(delegate.getActions);
						menuActions = delegate.getActions();
					},
				});
				let dropdownLabels: readonly (string | undefined)[] = [];
				let hideDropdown: (() => void) | undefined;
				instantiationService.stub(IActionWidgetService, {
					isVisible: false,
					show: (_id, _preview, items, delegate) => {
						dropdownLabels = items.map(item => item.label);
						hideDropdown = () => delegate.onHide?.();
					},
					hide: () => hideDropdown?.(),
				});
				const chat = upcastPartial<IChat>({
					resource: URI.parse('chat:main'),
					title: constObservable('Main'),
					status: constObservable(SessionStatus.InProgress),
				});
				const runningStatus = observableValue('runningStatus', SessionStatus.InProgress);
				const waitingStatus = observableValue('waitingStatus', SessionStatus.NeedsInput);
				const subagents = [
					{ title: 'Running', status: runningStatus },
					{ title: 'Waiting', status: waitingStatus },
					{ title: 'Finished', status: constObservable(SessionStatus.Completed) },
					{ title: 'Failed', status: constObservable(SessionStatus.Error) },
				].map(({ title, status }) => upcastPartial<IChat>({
					resource: URI.parse(`chat:${title}`),
					title: constObservable(title),
					status,
					origin: { kind: ChatOriginKind.Tool, parentChat: chat.resource },
				}));
				const session = upcastPartial<IActiveSession>({
					sessionId: 'provider:session',
					capabilities: constObservable({ supportsMultipleChats: true }),
					resource: URI.parse('session:1'),
					chats: constObservable([chat, ...subagents]),
					workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [] })),
					changesets: constObservable([]),
					changes: constObservable(withChanges ? [{ modifiedUri: URI.file('/change.ts'), insertions: 1, deletions: 0 }] : []),
				});
				const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
				document.body.appendChild(toolbar.element);
				store.add(toDisposable(() => toolbar.element.remove()));
				toolbar.setSession(session, chat);
				const labels = () => Array.from(toolbar.element.querySelectorAll('.chat-pill-label')).map(label => label.textContent);
				const openMenu = (target: HTMLElement) => {
					menuActions = [];
					target.dispatchEvent(keyboard
						? new KeyboardEvent('keydown', { key: 'F10', keyCode: 121, shiftKey: true, bubbles: true })
						: new MouseEvent('contextmenu', { bubbles: true }));
					return menuActions;
				};
				const subagentPill = toolbar.getChatPetPlatformElements().at(-1);
				assert.ok(subagentPill);
				subagentPill.click();
				hideDropdown?.();
				const ownMenu = openMenu(subagentPill);
				const ownOptions = ownMenu.find(action => action instanceof SubmenuAction);
				assert.ok(ownOptions instanceof SubmenuAction);
				const before = ownOptions.actions.map(action => ({ label: action.label, checked: action.checked }));
				await ownOptions.actions[1].run();
				const filtered = labels();
				runningStatus.set(SessionStatus.Completed, undefined);
				waitingStatus.set(SessionStatus.Completed, undefined);
				const afterCompletion = {
					labels: labels(),
					visible: toolbar.visible,
					empty: toolbar.element.classList.contains('empty'),
				};
				const recoveryTarget = toolbar.getChatPetPlatformElements()[0] ?? toolbar.element.querySelector<HTMLElement>('.chat-pills-row-content');
				assert.ok(recoveryTarget);
				const recoveryOptions = openMenu(recoveryTarget).find(action => action instanceof SubmenuAction);
				assert.ok(recoveryOptions instanceof SubmenuAction);
				const after = recoveryOptions.actions.map(action => ({ label: action.label, checked: action.checked }));
				await recoveryOptions.actions[0].run();

				assert.deepStrictEqual({
					dropdownLabels,
					ownMenu: ownMenu.slice(0, 4).map(action => action.label),
					before,
					filtered,
					afterCompletion,
					recoveryOptions: recoveryOptions.label,
					after,
					restored: labels(),
					emptyAfterRestore: toolbar.element.classList.contains('empty'),
				}, {
					dropdownLabels: ['Subagents: In Progress', 'Waiting', 'Running', '', 'Subagents: Completed', 'Failed', 'Finished'],
					ownMenu: ['Hide Subagents', '', 'Subagent Options', ''],
					before: [{ label: 'Show All', checked: true }, { label: 'Show In Progress', checked: false }],
					filtered: [...(withChanges ? ['1 File'] : []), '2 Subagents'],
					afterCompletion: { labels: withChanges ? ['1 File'] : [], visible: true, empty: !withChanges },
					recoveryOptions: 'Subagent Options',
					after: [{ label: 'Show All', checked: false }, { label: 'Show In Progress', checked: true }],
					restored: [...(withChanges ? ['1 File'] : []), '4 Subagents'],
					emptyAfterRestore: false,
				});
			});
		}
	}

	test('exposes live and cached pull request states without treating a closed draft as open', () => {
		const ref: IGitHubPullRequestRef = {
			owner: 'microsoft',
			repo: 'vscode',
			number: 1,
			uri: URI.parse('https://github.com/microsoft/vscode/pull/1'),
		};
		const pullRequests: readonly IResolvedSessionPullRequest[] = [
			{
				ref,
				pullRequest: upcastPartial<IGitHubPullRequest>({
					state: GitHubPullRequestState.Open,
					isDraft: true,
					author: { login: 'octocat', avatarUrl: '' },
					title: 'Open draft',
					body: '',
					baseRef: 'main',
					headRef: 'draft',
					createdAt: '2026-09-01T10:00:00Z',
					updatedAt: '2026-09-05T10:00:00Z',
				}),
				icon: Codicon.gitPullRequestDraft,
				status: {},
				ciStatus: GitHubCIOverallStatus.Pending,
			},
			{
				ref,
				pullRequest: upcastPartial<IGitHubPullRequest>({
					state: GitHubPullRequestState.Closed,
					isDraft: true,
					author: { login: 'octocat', avatarUrl: '' },
					title: 'Closed draft',
					body: '',
					baseRef: 'main',
					headRef: 'draft',
					createdAt: '2026-09-01T10:00:00Z',
					updatedAt: '2026-09-05T10:00:00Z',
					closedAt: '2026-09-04T10:00:00Z',
				}),
				icon: Codicon.gitPullRequestDraft,
				status: {},
			},
			{ ref: { ...ref, state: 'merged' }, pullRequest: upcastPartial<IGitHubPullRequest>({ state: GitHubPullRequestState.Open, isDraft: false }), icon: Codicon.gitPullRequest, status: { hasFailingChecks: true }, ciStatus: GitHubCIOverallStatus.Failure },
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

		const openDraftHover = typeof entries[0].hover?.content === 'function' ? entries[0].hover.content() : undefined;
		const closedDraftHover = typeof entries[1].hover?.content === 'function' ? entries[1].hover.content() : undefined;
		assert.deepStrictEqual({
			states: entries.map(entry => entry.pullRequestState),
			descriptions: entries.slice(0, 3).map(entry => entry.ariaDescription),
			openDraftHover: {
				status: openDraftHover?.querySelector('.sessions-pr-hover-status')?.textContent,
				date: openDraftHover?.querySelector('.sessions-pr-hover-date')?.textContent,
			},
			closedDraftHover: {
				status: closedDraftHover?.querySelector('.sessions-pr-hover-status')?.textContent,
				date: closedDraftHover?.querySelector('.sessions-pr-hover-date')?.textContent,
			},
		}, {
			states: ['draft', 'closed', 'open', 'closed', 'merged', 'merged', 'open'],
			descriptions: [
				'draft. Checks pending. https://github.com/microsoft/vscode/pull/1',
				'closed. https://github.com/microsoft/vscode/pull/1',
				'failing checks. https://github.com/microsoft/vscode/pull/1',
			],
			openDraftHover: { status: 'Draft', date: 'on Sep 1' },
			closedDraftHover: { status: 'Closed', date: 'on Sep 1' },
		});
	});

	test('removes promoted issue and pull request references by stable id and keeps open and copy actions', async () => {
		const ref = (number: number, recordedReferenceId?: string): IGitHubPullRequestRef => ({
			owner: 'microsoft', repo: 'vscode', number,
			uri: URI.parse(`https://github.com/microsoft/vscode/pull/${number}`),
			recordedReferenceId,
		});
		const duplicateUri = URI.parse('https://github.com/microsoft/vscode/pull/1');
		const refs = [{ ...ref(1, 'reference-a'), uri: duplicateUri }, { ...ref(1, 'reference-b'), uri: duplicateUri }, ref(2)];
		const issueRef: IGitHubIssueRef = {
			owner: 'microsoft', repo: 'vscode', number: 3,
			uri: URI.parse('https://github.com/microsoft/vscode/issues/3'),
			recordedReferenceId: 'issue-reference',
		};
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
			remove: async id => { removed.push(id); },
		})[0].entries;
		const issueEntry = buildSessionIssueSections([{ ref: issueRef, issue: undefined }], undefined, commandService, clipboardService, openerService, sessionsService, {
			remove: async id => { removed.push(id); },
		})[0].entries[0];
		const unsupported = buildSessionPullRequestSections(pullRequests, undefined, commandService, clipboardService, openerService, sessionsService)[0].entries;
		await entries[0].promotedAction?.run();
		await entries[1].promotedAction?.run();
		await issueEntry.promotedAction?.run();
		await entries[0].toolbarActions?.[0].run();
		entries[0].open();

		assert.deepStrictEqual({
			ids: entries.map(entry => entry.id),
			removable: [...entries.map(entry => !!entry.promotedAction), !!issueEntry.promotedAction],
			unsupported: unsupported.map(entry => !!entry.promotedAction),
			removed, copied, opened,
		}, {
			ids: ['reference-a', 'reference-b', refs[2].uri.toString()],
			removable: [true, true, false, true],
			unsupported: [false, false, false],
			removed: ['reference-a', 'reference-b', 'issue-reference'],
			copied: [refs[0].uri.toString(true)],
			opened: [{ pullRequest: refs[0] }],
		});
	});

	for (const kind of [SessionArtifactKind.PullRequest, SessionArtifactKind.Issue]) {
		for (const isArtifact of [true, false]) {
			test(`shows and removes a dedicated ${kind} pill for a workspace-less ${isArtifact ? 'artifact' : 'reference'}`, async () => {
				const { instantiationService } = createServices();
				const isPullRequest = kind === SessionArtifactKind.PullRequest;
				const link = URI.parse(`https://github.com/microsoft/vscode/${isPullRequest ? 'pull/42' : 'issues/337297'}`);
				const artifacts = observableValue<readonly ISessionArtifact[]>('artifacts', [{
					id: 'recorded', kind, label: 'Recorded title', isArtifact, isGitHub: true, link,
				}]);
				const chat = upcastPartial<IChat>({ resource: URI.parse('chat:main'), title: constObservable('Chat'), status: constObservable(SessionStatus.Completed) });
				const session = upcastPartial<IActiveSession>({
					sessionId: 'quick-chat', resource: URI.parse('session:quick-chat'), artifacts,
					capabilities: constObservable({ supportsMultipleChats: false, supportsRemoveArtifacts: true }),
					chats: constObservable([chat]), changesets: constObservable([]), changes: constObservable([]),
					workspace: constObservable(undefined),
				});
				const modelRequests = new Set<string>();
				let modelReferenceCalls = 0;
				instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({
					createPullRequestModelReference: (owner, repo, number) => {
						modelReferenceCalls++;
						modelRequests.add(`${owner}/${repo}/pull/${number}`);
						return new ImmortalReference(upcastPartial<GitHubPullRequestModel>({ pullRequest: constObservable(undefined) }));
					},
					createIssueModelReference: (owner, repo, number) => {
						modelReferenceCalls++;
						modelRequests.add(`${owner}/${repo}/issues/${number}`);
						return new ImmortalReference(upcastPartial<GitHubIssueModel>({
							issue: constObservable(undefined), refresh: async () => { }, startPolling: () => toDisposable(() => { }),
						}));
					},
				}));
				instantiationService.stub(ISessionsService, 'setActive', () => { });
				const opened: object[] = [];
				instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
					executeCommand: async (_command, arg) => {
						assert.ok(arg && typeof arg === 'object');
						opened.push(arg);
						return undefined;
					},
				}));
				const removed: { owningSession: boolean; id: string }[] = [];
				instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
					removeSessionArtifact: async (target, id) => {
						removed.push({ owningSession: target === session, id });
						artifacts.set([], undefined);
					},
				}));
				let menu: readonly IAction[] = [];
				instantiationService.stub(IContextMenuService, { showContextMenu: delegate => { menu = delegate.getActions!(); } });
				const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
				toolbar.setSession(session, chat);
				const initialModelReferenceCalls = modelReferenceCalls;
				const recordedEntries = artifacts.get();
				artifacts.set([...recordedEntries, { id: 'file', kind: SessionArtifactKind.File, label: 'Report', isArtifact: true, uri: URI.file('/report.md') }], undefined);
				artifacts.set(recordedEntries, undefined);
				const unrelatedArtifactModelRequests = modelReferenceCalls - initialModelReferenceCalls;
				const pill = toolbar.element.querySelector<HTMLElement>('.chat-dropdown-pill-button');
				assert.ok(pill);
				const initial = {
					label: pill.getAttribute('aria-label'),
					genericPills: toolbar.element.querySelectorAll('.chat-resource-pill-button').length,
				};
				pill.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
				pill.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
				const remove = menu.find(action => action.id === `sessionChatPills.remove${isPullRequest ? 'PullRequest' : 'Issue'}.recorded`);
				assert.ok(remove);
				await remove.run();
				const ref = {
					owner: 'microsoft', repo: 'vscode', number: isPullRequest ? 42 : 337297, uri: link,
					title: 'Recorded title', recordedReferenceId: 'recorded',
				};
				assert.deepStrictEqual({
					initial, opened, removed, modelRequests: [...modelRequests], unrelatedArtifactModelRequests,
					remainingPills: toolbar.element.querySelectorAll('.chat-dropdown-pill-button, .chat-resource-pill-button').length,
				}, {
					initial: { label: `Open ${isPullRequest ? 'Pull Request #42' : 'Issue #337297'}: Recorded title`, genericPills: 0 },
					opened: [isPullRequest ? { pullRequest: { ...ref, createdByThisSession: isArtifact } } : { issue: ref }],
					removed: [{ owningSession: true, id: 'recorded' }],
					modelRequests: [`microsoft/vscode/${isPullRequest ? 'pull/42' : 'issues/337297'}`],
					unrelatedArtifactModelRequests: 0,
					remainingPills: 0,
				});
			});
		}
	}

	test('reference removal reacts to capabilities, targets the owning session, and reports errors without hiding data', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const ref: IGitHubPullRequestRef = { owner: 'microsoft', repo: 'vscode', number: 1, uri: URI.parse('https://github.com/microsoft/vscode/pull/1'), recordedReferenceId: 'pr-reference' };
		const artifacts = observableValue<readonly ISessionArtifact[]>('artifacts', [{
			id: 'pr-reference', kind: SessionArtifactKind.PullRequest, label: 'PR', isArtifact: false, isGitHub: true, link: ref.uri,
		}, {
			id: 'durable-artifact', kind: SessionArtifactKind.File, label: 'Plan', isArtifact: true, uri: URI.file('/repo/plan.md'),
		}]);
		const capabilities = observableValue('capabilities', { supportsMultipleChats: false, supportsRemoveArtifacts: false });
		const gitHubInfo = observableValue('gitHubInfo', { owner: ref.owner, repo: ref.repo, pullRequests: [ref] });
		const chat = upcastPartial<IChat>({ resource: URI.parse('chat:main'), title: constObservable('Chat'), status: constObservable(SessionStatus.Completed) });
		const session = upcastPartial<IActiveSession>({
			sessionId: 'owning-session', resource: URI.parse('session:owning'), artifacts, capabilities,
			chats: constObservable([chat]), changesets: constObservable([]), changes: constObservable([]),
			workspace: constObservable(upcastPartial<ISessionWorkspace>({
				folders: [{
					root: URI.file('/repo'), workingDirectory: URI.file('/repo'), name: 'repo', description: undefined,
					gitRepository: { uri: URI.file('/repo'), workTreeUri: undefined, baseBranchName: 'main', gitHubInfo },
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
				artifacts.set(artifacts.get().filter(artifact => artifact.id !== artifactId), undefined);
				gitHubInfo.set({ owner: ref.owner, repo: ref.repo, pullRequests: [] }, undefined);
			},
		}));
		const errors: string[] = [];
		instantiationService.stub(INotificationService, { error: error => { errors.push(String(error)); } });
		let menu: readonly IAction[] = [];
		instantiationService.stub(IContextMenuService, { showContextMenu: delegate => { menu = delegate.getActions!(); } });
		const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
		toolbar.setSession(session, chat);
		const removal = () => {
			const target = toolbar.element.querySelector<HTMLElement>('.chat-dropdown-pill-button');
			if (!target) {
				return undefined;
			}
			target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
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
			afterSuccess: {
				removable: !!removal(),
				artifactRemovable: (() => {
					const target = toolbar.element.querySelector<HTMLElement>('.chat-resource-pill-button');
					target?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
					return menu.some(action => action.id === 'sessions.artifacts.remove.durable-artifact');
				})(),
				artifacts: artifacts.get().map(artifact => artifact.id),
				label: toolbar.element.querySelector('.chat-pill-label')?.textContent,
			},
		}, {
			unavailable: false,
			afterFailure: { removable: true, artifacts: ['pr-reference', 'durable-artifact'] },
			errors: ['Could not remove Pull Request #1: PR from this session: offline'],
			calls: [{ owningSession: true, artifactId: 'pr-reference' }, { owningSession: true, artifactId: 'pr-reference' }],
			afterSuccess: { removable: false, artifactRemovable: true, artifacts: ['durable-artifact'], label: undefined },
		});
	});

	test('keeps derived changes and browser pills out of session record removal', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const artifacts = observableValue<readonly ISessionArtifact[]>('artifacts', [{
			id: 'durable-artifact', kind: SessionArtifactKind.File, label: 'Plan', isArtifact: true, uri: URI.file('/repo/plan.md'),
		}]);
		const chat = upcastPartial<IChat>({ resource: URI.parse('chat:main'), title: constObservable('Chat'), status: constObservable(SessionStatus.Completed) });
		// A browser the agent opened, and a file diff: both are live/derived state
		// rather than recorded artifact records, so neither may offer record removal.
		const browser = upcastPartial<BrowserEditorInput>({
			id: 'browser-1', title: 'Example Page', url: 'https://example.com', onDidChangeLabel: Event.None,
			model: upcastPartial<BrowserEditorInput['model']>({ owner: { type: 'agent', sessionId: chat.resource.toString() } }),
		});
		const session = upcastPartial<IActiveSession>({
			sessionId: 'owning-session', resource: URI.parse('session:owning'), artifacts,
			capabilities: constObservable({ supportsMultipleChats: false, supportsRemoveArtifacts: true }),
			chats: constObservable([chat]), changesets: constObservable([]),
			changes: constObservable([{ modifiedUri: URI.file('/repo/changed.ts'), insertions: 3, deletions: 1 }]),
			workspace: constObservable(upcastPartial<ISessionWorkspace>({
				folders: [{
					root: URI.file('/repo'), workingDirectory: URI.file('/repo'), name: 'repo', description: undefined,
					gitRepository: { uri: URI.file('/repo'), workTreeUri: undefined, baseBranchName: 'main', gitHubInfo: constObservable(undefined) },
				}],
			})),
		});
		instantiationService.stub(IBrowserViewWorkbenchService, upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None, getKnownBrowserViews: () => new Map([['browser-1', browser]]),
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
		const removeCalls: string[] = [];
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			removeSessionArtifact: async (_target, artifactId) => { removeCalls.push(artifactId); },
		}));
		let menu: readonly IAction[] = [];
		instantiationService.stub(IContextMenuService, { showContextMenu: delegate => { menu = delegate.getActions!(); } });
		const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
		toolbar.setSession(session, chat);

		const pills = Array.from(toolbar.element.querySelectorAll<HTMLElement>(
			'.chat-pill-button, .chat-changes-pill-button, .chat-dropdown-pill-button, .chat-resource-pill-button'));
		const removeActions: IAction[] = [];
		for (const pill of pills) {
			menu = [];
			pill.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
			removeActions.push(...menu.filter(action => /remove/i.test(action.id)));
		}
		for (const action of removeActions) {
			await action.run();
		}

		assert.deepStrictEqual({
			// The browsers and changes pills rendered, so the negative result below is not vacuous.
			renderedPills: pills.length >= 3,
			removeActionIds: removeActions.map(action => action.id),
			removeCalls,
		}, {
			renderedPills: true,
			// Only the recorded artifact is removable; the browser and the file diff are not.
			removeActionIds: ['sessions.artifacts.remove.durable-artifact'],
			removeCalls: ['durable-artifact'],
		});
	});
});
