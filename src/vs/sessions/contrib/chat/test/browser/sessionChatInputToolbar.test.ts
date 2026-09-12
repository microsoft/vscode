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
		const pullRequestDropdownHover = renderDropdownHover(pullRequestEntry);
		const issueDropdownHover = renderDropdownHover(issueEntry);
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
				openCommands: commands,
			},
			activeIssue: {
				status: activeIssueHover?.querySelector('.sessions-issue-hover-status')?.textContent,
				date: activeIssueHover?.querySelector('.sessions-issue-hover-date')?.textContent,
			},
			duplicateIssue: {
				status: duplicateIssueHover?.querySelector('.sessions-issue-hover-status')?.textContent,
				statusKind: duplicateIssueHover?.querySelector<HTMLElement>('.sessions-issue-hover-status')?.dataset.state,
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
			},
			duplicateIssue: {
				status: 'Duplicate',
				statusKind: 'duplicate',
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

	test('offers removal only for matching PR artifacts including legacy records and keeps open and copy actions', async () => {
		const ref = (number: number): IGitHubPullRequestRef => ({
			owner: 'microsoft', repo: 'vscode', number,
			uri: URI.parse(`https://github.com/microsoft/vscode/pull/${number}`),
		});
		const refs = [ref(1), ref(2), ref(3), ref(4), ref(5)];
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
		artifacts.push({ id: 'legacy', kind: SessionArtifactKind.PullRequest, label: 'Legacy PR', isArtifact: true, link: refs[4].uri });
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
		await entries[4].removeAction?.run();
		await entries[0].toolbarActions?.[0].run();
		entries[0].open();

		assert.deepStrictEqual({
			removable: entries.map(entry => !!entry.removeAction),
			unsupported: unsupported.map(entry => !!entry.removeAction),
			removed, copied, opened,
		}, {
			removable: [true, false, false, false, true],
			unsupported: [false, false, false, false, false],
			removed: ['artifact-1', 'duplicate', 'legacy'],
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
