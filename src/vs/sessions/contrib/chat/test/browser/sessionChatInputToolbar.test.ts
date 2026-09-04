/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isManagedHoverTooltipHTMLElement } from '../../../../../base/browser/ui/hover/hover.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable, derived } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import type { IChatPillEntry } from '../../../../../workbench/browser/chatPills.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { type IGitHubIssueRef, type IGitHubPullRequestRef, type ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { GitHubIssueState, GitHubPullRequestState, type IGitHubIssue, type IGitHubPullRequest } from '../../../github/common/types.js';
import { buildSessionIssueSections, buildSessionPullRequestSections, computeSessionInputPillStats } from '../../browser/sessionChatInputToolbar.js';

suite('SessionChatInputToolbar', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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
});
