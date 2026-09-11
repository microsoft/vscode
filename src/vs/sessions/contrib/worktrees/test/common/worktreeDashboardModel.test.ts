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
import { correlateWorktrees } from '../../common/worktreeDashboardModel.js';
import { WorktreeEntryStatus } from '../../common/worktreeDashboard.js';

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
	repositoryRoot: URI;
	worktreePath: URI;
	status?: SessionStatus;
	isArchived?: boolean;
	branchName?: string;
	uncommittedChanges?: number;
}): ISession {
	return {
		sessionId: options.sessionId,
		providerId: 'test',
		resource: URI.parse(`test:///${options.sessionId}`),
		sessionType: 'test',
		icon: Codicon.vm,
		createdAt: new Date('2024-01-01T00:00:00.000Z'),
		workspace: constObservable({
			uri: options.repositoryRoot,
			label: 'repo',
			icon: Codicon.repo,
			folders: [{
				root: options.repositoryRoot,
				workingDirectory: options.worktreePath,
				name: 'repo',
				description: undefined,
				gitRepository: {
					uri: options.repositoryRoot,
					workTreeUri: options.worktreePath,
					branchName: options.branchName,
					baseBranchName: 'main',
					uncommittedChanges: options.uncommittedChanges,
					gitHubInfo: constObservable(undefined),
				},
			}],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		}),
		title: constObservable(options.sessionId),
		updatedAt: constObservable(new Date('2024-01-01T00:00:00.000Z')),
		status: constObservable(options.status ?? SessionStatus.Completed),
		changesets: constObservable([]),
		changes: constObservable([]),
		modelId: constObservable(undefined),
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

suite('WorktreeDashboardModel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function snapshot(entries: ReturnType<typeof correlateWorktrees>) {
		return entries.map(entry => ({
			repositoryRoot: entry.repositoryRoot.path,
			worktreePath: entry.worktreePath.path,
			name: entry.name,
			branchName: entry.branchName,
			status: entry.status,
			sessionId: entry.session?.sessionId,
			hasUncommittedChanges: entry.hasUncommittedChanges,
			sizeBytes: entry.sizeBytes,
		}));
	}

	test('correlates active, idle, archived, orphaned, and missing worktrees', () => {
		const repositoryRoot = URI.file('/repo');
		const activePath = URI.file('/repo.worktrees/active');
		const idlePath = URI.file('/repo.worktrees/idle');
		const archivedPath = URI.file('/repo.worktrees/archived');
		const missingPath = URI.file('/repo.worktrees/missing');
		const orphanedPath = URI.file('/repo.worktrees/orphaned');
		const sessions = [
			stubSession({ sessionId: 'active-session', repositoryRoot, worktreePath: activePath, status: SessionStatus.InProgress, branchName: 'agents/active', uncommittedChanges: 2 }),
			stubSession({ sessionId: 'idle-session', repositoryRoot, worktreePath: idlePath, status: SessionStatus.Completed, branchName: 'agents/idle', uncommittedChanges: 0 }),
			stubSession({ sessionId: 'archived-session', repositoryRoot, worktreePath: archivedPath, status: SessionStatus.Completed, isArchived: true, branchName: 'agents/archived' }),
			stubSession({ sessionId: 'missing-session', repositoryRoot, worktreePath: missingPath, status: SessionStatus.Completed, branchName: 'agents/missing', uncommittedChanges: 1 }),
		];
		const entries = correlateWorktrees(sessions, new Map([
			[repositoryRoot.toString(), [
				{ repositoryRoot, path: activePath, name: 'active' },
				{ repositoryRoot, path: idlePath, name: 'idle' },
				{ repositoryRoot, path: archivedPath, name: 'archived' },
				{ repositoryRoot, path: orphanedPath, name: 'orphaned', branchName: 'agents/orphaned' },
			]],
		]), {
			existingWorktreePaths: new Set([activePath.toString(), idlePath.toString(), archivedPath.toString()]),
			sizesByPath: new Map([
				[activePath.toString(), 1024],
				[idlePath.toString(), 2048],
				[orphanedPath.toString(), 4096],
				// A size for the missing worktree must never surface, since it
				// no longer exists on disk.
				[missingPath.toString(), 8192],
			]),
		});

		assert.deepStrictEqual(snapshot(entries), [
			{
				repositoryRoot: '/repo',
				worktreePath: '/repo.worktrees/active',
				name: 'active',
				branchName: 'agents/active',
				status: WorktreeEntryStatus.SessionActive,
				sessionId: 'active-session',
				hasUncommittedChanges: true,
				sizeBytes: 1024,
			},
			{
				repositoryRoot: '/repo',
				worktreePath: '/repo.worktrees/archived',
				name: 'archived',
				branchName: 'agents/archived',
				status: WorktreeEntryStatus.SessionArchived,
				sessionId: 'archived-session',
				hasUncommittedChanges: undefined,
				sizeBytes: undefined,
			},
			{
				repositoryRoot: '/repo',
				worktreePath: '/repo.worktrees/idle',
				name: 'idle',
				branchName: 'agents/idle',
				status: WorktreeEntryStatus.SessionIdle,
				sessionId: 'idle-session',
				hasUncommittedChanges: false,
				sizeBytes: 2048,
			},
			{
				repositoryRoot: '/repo',
				worktreePath: '/repo.worktrees/missing',
				name: 'missing',
				branchName: 'agents/missing',
				status: WorktreeEntryStatus.Missing,
				sessionId: 'missing-session',
				hasUncommittedChanges: true,
				sizeBytes: undefined,
			},
			{
				repositoryRoot: '/repo',
				worktreePath: '/repo.worktrees/orphaned',
				name: 'orphaned',
				branchName: 'agents/orphaned',
				status: WorktreeEntryStatus.Orphaned,
				sessionId: undefined,
				hasUncommittedChanges: undefined,
				sizeBytes: 4096,
			},
		]);
	});

	test('accepts worktrees outside the default root and ignores the parent repository checkout', () => {
		const repositoryRoot = URI.file('/repo');
		const unmanagedPath = URI.file('/repo');
		const checkoutSession = stubSession({
			sessionId: 'repository-session',
			repositoryRoot,
			worktreePath: unmanagedPath,
			status: SessionStatus.NeedsInput,
			branchName: 'main',
		});
		const customWorktreePath = URI.file('/custom/worktrees/feature');
		const worktreeSession = stubSession({
			sessionId: 'custom-worktree-session',
			repositoryRoot,
			worktreePath: customWorktreePath,
			status: SessionStatus.Completed,
			branchName: 'agents/feature',
		});

		const entries = correlateWorktrees([checkoutSession, worktreeSession], new Map([[repositoryRoot.toString(), []]]), {
			existingWorktreePaths: new Set([unmanagedPath.toString(), customWorktreePath.toString()]),
			sizesByPath: new Map([[customWorktreePath.toString(), 1024]]),
		});

		assert.deepStrictEqual(snapshot(entries), [{
			repositoryRoot: '/repo',
			worktreePath: '/custom/worktrees/feature',
			name: 'feature',
			branchName: 'agents/feature',
			status: WorktreeEntryStatus.SessionIdle,
			sessionId: 'custom-worktree-session',
			hasUncommittedChanges: undefined,
			sizeBytes: 1024,
		}]);
	});
});
