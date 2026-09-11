/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatInteractivity, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { buildAgentsDashboardSummary, buildSessionRows, getArchivedSessionWorktrees, getMergedPullRequestSessions } from '../../common/agentsDashboardModel.js';
import { IWorktreeDashboardEntry, WorktreeEntryStatus } from '../../common/worktreeDashboard.js';

const stubChat: IChat = {
	resource: URI.parse('test:///chat'),
	createdAt: new Date(),
	title: constObservable('Chat'),
	updatedAt: constObservable(new Date()),
	status: constObservable(SessionStatus.Completed),
	changes: constObservable([]),
	checkpoints: constObservable(undefined),
	modelId: constObservable(undefined),
	modelSource: constObservable(undefined),
	mode: constObservable(undefined),
	isArchived: constObservable(false),
	isRead: constObservable(true),
	interactivity: constObservable(ChatInteractivity.Full),
	description: constObservable(undefined),
	lastTurnEnd: constObservable(undefined),
};

function stubSession(options: {
	sessionId: string;
	title: string;
	updatedAt: Date;
	status?: SessionStatus;
	isArchived?: boolean;
	workspaceLabel?: string;
	workspaceUri?: URI;
	workTreeUri?: URI;
	pullRequestState?: 'open' | 'closed' | 'merged';
	modelId?: string;
	changedFileCount?: number;
	credits?: number;
}): ISession {
	const workspaceUri = options.workspaceUri ?? URI.file(`/repo/${options.workspaceLabel}`);
	return {
		sessionId: options.sessionId,
		providerId: 'test',
		resource: URI.parse(`test:///${options.sessionId}`),
		sessionType: 'test',
		icon: Codicon.vm,
		createdAt: options.updatedAt,
		workspace: constObservable(options.workspaceLabel ? {
			uri: workspaceUri,
			label: options.workspaceLabel,
			icon: Codicon.repo,
			folders: [{
				root: workspaceUri,
				workingDirectory: workspaceUri,
				name: options.workspaceLabel,
				description: undefined,
				gitRepository: {
					uri: workspaceUri,
					workTreeUri: options.workTreeUri,
					baseBranchName: 'main',
					gitHubInfo: constObservable(options.pullRequestState ? {
						owner: 'microsoft',
						repo: 'vscode',
						pullRequest: {
							number: 1,
							uri: URI.parse('https://github.com/microsoft/vscode/pull/1'),
							state: options.pullRequestState,
						},
					} : undefined),
				},
			}],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		} : undefined),
		title: constObservable(options.title),
		updatedAt: constObservable(options.updatedAt),
		status: constObservable(options.status ?? SessionStatus.Completed),
		changesets: constObservable([]),
		changes: constObservable([]),
		changesSummary: constObservable(options.changedFileCount === undefined ? undefined : {
			files: options.changedFileCount,
			additions: 0,
			deletions: 0,
		}),
		usage: constObservable(options.credits === undefined ? undefined : { credits: options.credits }),
		modelId: constObservable(options.modelId),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived: constObservable(options.isArchived ?? false),
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		chats: constObservable([stubChat]),
		mainChat: constObservable(stubChat),
		capabilities: constObservable({ supportsMultipleChats: false }),
	};
}

function stubWorktreeEntry(status: WorktreeEntryStatus, sizeBytes?: number, session?: ISession): IWorktreeDashboardEntry {
	return {
		repositoryRoot: URI.file('/repo'),
		worktreePath: URI.file('/repo.worktrees/x'),
		name: 'x',
		branchName: 'agents/x',
		status,
		session,
		hasUncommittedChanges: undefined,
		sizeBytes,
	};
}

suite('AgentsDashboardModel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('buildSessionRows sorts most-recently-updated first and reports archive state', () => {
		const older = stubSession({ sessionId: 'a', title: 'Older', updatedAt: new Date('2024-01-01T00:00:00.000Z'), status: SessionStatus.Completed, workspaceLabel: 'repo-a' });
		const newer = stubSession({ sessionId: 'b', title: 'Newer', updatedAt: new Date('2024-01-02T00:00:00.000Z'), status: SessionStatus.InProgress });
		const archived = stubSession({ sessionId: 'c', title: 'Archived', updatedAt: new Date('2023-12-01T00:00:00.000Z'), isArchived: true });

		const rows = buildSessionRows([older, newer, archived]);

		assert.deepStrictEqual(rows.map(row => ({ title: row.title, status: row.status, archived: row.archived })), [
			{ title: 'Newer', status: SessionStatus.InProgress, archived: false },
			{ title: 'Older', status: SessionStatus.Completed, archived: false },
			{ title: 'Archived', status: SessionStatus.Completed, archived: true },
		]);
	});

	test('buildSessionRows exposes dashboard-only session metrics', () => {
		const worktreePath = URI.file('/repo.worktrees/x');
		const session = stubSession({
			sessionId: 'metrics',
			title: 'Metrics',
			updatedAt: new Date('2024-01-02T00:00:00.000Z'),
			workspaceLabel: 'vscode',
			workspaceUri: worktreePath,
			workTreeUri: worktreePath,
			pullRequestState: 'merged',
			modelId: 'claude-sonnet',
			changedFileCount: 7,
			credits: 1.5,
		});
		const worktree = stubWorktreeEntry(WorktreeEntryStatus.SessionIdle, 4096, session);

		const [row] = buildSessionRows([session], [worktree]);

		assert.deepStrictEqual({
			archived: row.archived,
			workingDirectories: row.workingDirectories,
			chatCount: row.chatCount,
			worktreeSizeBytes: row.worktreeSizeBytes,
			credits: row.credits,
		}, {
			archived: false,
			workingDirectories: [{ path: worktreePath.fsPath, isWorktree: true }],
			chatCount: 1,
			worktreeSizeBytes: 4096,
			credits: 1.5,
		});
	});

	test('buildAgentsDashboardSummary reports done sessions, pull requests, and storage', () => {
		const active = stubSession({ sessionId: 'active', title: 'Active', updatedAt: new Date(), status: SessionStatus.InProgress, credits: 1 });
		const attention = stubSession({ sessionId: 'attention', title: 'Attention', updatedAt: new Date(), status: SessionStatus.NeedsInput, credits: 0.5 });
		const delivered = stubSession({ sessionId: 'delivered', title: 'Delivered', updatedAt: new Date(), isArchived: true, workspaceLabel: 'repo', pullRequestState: 'merged' });
		const rows = buildSessionRows(
			[active, attention, delivered],
			[
				stubWorktreeEntry(WorktreeEntryStatus.SessionActive, 1024, active),
				stubWorktreeEntry(WorktreeEntryStatus.SessionIdle, 2048, attention),
			],
		);

		assert.deepStrictEqual(buildAgentsDashboardSummary(rows), {
			sessions: 3,
			activeSessions: 2,
			archivedSessions: 1,
			doneSessions: 1,
			pullRequests: 1,
			worktreeSizeBytes: 3072,
		});
	});

	test('smart action selectors exclude active sessions and unrelated worktrees', () => {
		const merged = stubSession({ sessionId: 'merged', title: 'Merged', updatedAt: new Date(), workspaceLabel: 'repo', pullRequestState: 'merged' });
		const activeMerged = stubSession({ sessionId: 'active-merged', title: 'Active merged', updatedAt: new Date(), status: SessionStatus.InProgress, workspaceLabel: 'repo', pullRequestState: 'merged' });
		const open = stubSession({ sessionId: 'open', title: 'Open', updatedAt: new Date(), workspaceLabel: 'repo', pullRequestState: 'open' });
		const archivedWorktree = stubWorktreeEntry(WorktreeEntryStatus.SessionArchived, 1000);
		const idleWorktree = stubWorktreeEntry(WorktreeEntryStatus.SessionIdle, 1000);

		assert.deepStrictEqual({
			sessions: getMergedPullRequestSessions([merged, activeMerged, open]).map(session => session.sessionId),
			worktrees: getArchivedSessionWorktrees([archivedWorktree, idleWorktree]).map(entry => entry.status),
		}, {
			sessions: ['merged'],
			worktrees: [WorktreeEntryStatus.SessionArchived],
		});
	});
});
