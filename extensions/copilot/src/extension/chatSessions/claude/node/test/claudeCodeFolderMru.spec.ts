/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IGitService } from '../../../../../platform/git/common/gitService';
import { RepositoryAccessDetails } from '../../../../../platform/git/vscode/git';
import { TestWorkspaceService } from '../../../../../platform/test/node/testWorkspaceService';
import { mock } from '../../../../../util/common/test/simpleMock';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../../util/vs/base/common/event';
import { URI } from '../../../../../util/vs/base/common/uri';
import { IClaudeCodeSessionInfo } from '../sessionParser/claudeSessionSchema';
import { IClaudeCodeSessionService } from '../sessionParser/claudeCodeSessionService';
import { ClaudeCodeFolderMruService } from '../claudeCodeFolderMru';

// #region Test Helpers

class TestGitService extends mock<IGitService>() {
	declare readonly _serviceBrand: undefined;
	override onDidOpenRepository = Event.None;
	override onDidCloseRepository = Event.None;
	override onDidFinishInitialization = Event.None;
	recentRepos: RepositoryAccessDetails[] = [];
	override getRecentRepositories(): Iterable<RepositoryAccessDetails> {
		return this.recentRepos;
	}
}

class TestClaudeCodeSessionService extends mock<IClaudeCodeSessionService>() {
	declare _serviceBrand: undefined;
	sessions: IClaudeCodeSessionInfo[] = [];
	override getAllSessions = vi.fn(async () => this.sessions);
}

function makeSession(overrides: Partial<IClaudeCodeSessionInfo> & { id: string }): IClaudeCodeSessionInfo {
	return {
		label: 'test',
		created: 1000,
		...overrides,
	};
}

// #endregion

describe('ClaudeCodeFolderMruService', () => {
	let sessionService: TestClaudeCodeSessionService;
	let gitService: TestGitService;
	let workspaceService: TestWorkspaceService;
	let service: ClaudeCodeFolderMruService;

	beforeEach(() => {
		sessionService = new TestClaudeCodeSessionService();
		gitService = new TestGitService();
		workspaceService = new TestWorkspaceService([]);
		service = new ClaudeCodeFolderMruService(sessionService, gitService, workspaceService);
	});

	// #region Session extraction

	it('returns empty array when no sessions exist', async () => {
		const result = await service.getRecentlyUsedFolders(CancellationToken.None);
		expect(result).toEqual([]);
	});

	it('converts session cwd to folder URI', async () => {
		sessionService.sessions = [
			makeSession({ id: 's1', cwd: '/Users/test/project', lastRequestEnded: 2000 }),
		];

		const result = await service.getRecentlyUsedFolders(CancellationToken.None);

		expect(result).toHaveLength(1);
		expect(result[0].folder.toString()).toBe(URI.file('/Users/test/project').toString());
		expect(result[0].lastAccessed).toBe(2000);
	});

	it('skips sessions without cwd', async () => {
		sessionService.sessions = [makeSession({ id: 's1' })];

		const result = await service.getRecentlyUsedFolders(CancellationToken.None);
		expect(result).toEqual([]);
	});

	it('skips sessions with .claude/worktrees/ cwd', async () => {
		sessionService.sessions = [
			makeSession({ id: 's1', cwd: '/Users/test/.claude/worktrees/branch-1' }),
		];

		const result = await service.getRecentlyUsedFolders(CancellationToken.None);
		expect(result).toEqual([]);
	});

	it('skips sessions with .worktrees/copilot- cwd', async () => {
		sessionService.sessions = [
			makeSession({ id: 's1', cwd: '/Users/test/repo/.worktrees/copilot-abc123' }),
		];

		const result = await service.getRecentlyUsedFolders(CancellationToken.None);
		expect(result).toEqual([]);
	});

	// #endregion

	// #region Timestamp fallback

	it('uses lastRequestEnded as primary timestamp', async () => {
		sessionService.sessions = [
			makeSession({ id: 's1', cwd: '/a', created: 100, lastRequestStarted: 200, lastRequestEnded: 300 }),
		];
		const result = await service.getRecentlyUsedFolders(CancellationToken.None);
		expect(result[0].lastAccessed).toBe(300);
	});

	it('falls back to lastRequestStarted', async () => {
		sessionService.sessions = [
			makeSession({ id: 's1', cwd: '/a', created: 100, lastRequestStarted: 200 }),
		];
		const result = await service.getRecentlyUsedFolders(CancellationToken.None);
		expect(result[0].lastAccessed).toBe(200);
	});

	it('falls back to created', async () => {
		sessionService.sessions = [
			makeSession({ id: 's1', cwd: '/a', created: 100 }),
		];
		const result = await service.getRecentlyUsedFolders(CancellationToken.None);
		expect(result[0].lastAccessed).toBe(100);
	});

	// #endregion

	// #region Git repository merging

	it('merges git repo into matching session entry', async () => {
		sessionService.sessions = [
			makeSession({ id: 's1', cwd: '/Users/test/project', lastRequestEnded: 100 }),
		];
		const folderUri = URI.file('/Users/test/project');
		gitService.recentRepos = [{ rootUri: folderUri, lastAccessTime: 200 }];

		const result = await service.getRecentlyUsedFolders(CancellationToken.None);

		expect(result).toHaveLength(1);
		expect(result[0].repository).toEqual(folderUri);
		expect(result[0].lastAccessed).toBe(200);
	});

	it('adds standalone git repos not in sessions', async () => {
		const repoUri = URI.file('/Users/test/other-repo');
		gitService.recentRepos = [{ rootUri: repoUri, lastAccessTime: 500 }];

		const result = await service.getRecentlyUsedFolders(CancellationToken.None);

		expect(result).toHaveLength(1);
		expect(result[0].folder).toEqual(repoUri);
		expect(result[0].repository).toEqual(repoUri);
		expect(result[0].lastAccessed).toBe(500);
	});

	it('filters git repos with .claude/worktrees/ path', async () => {
		gitService.recentRepos = [
			{ rootUri: URI.file('/Users/test/.claude/worktrees/branch'), lastAccessTime: 100 },
		];

		const result = await service.getRecentlyUsedFolders(CancellationToken.None);
		expect(result).toEqual([]);
	});

	it('filters git repos with .worktrees/copilot- path', async () => {
		gitService.recentRepos = [
			{ rootUri: URI.file('/Users/test/repo/.worktrees/copilot-abc123'), lastAccessTime: 100 },
		];

		const result = await service.getRecentlyUsedFolders(CancellationToken.None);
		expect(result).toEqual([]);
	});

	// #endregion

	// #region Workspace folders

	it('adds workspace folders not already present', async () => {
		const folder = URI.file('/Users/test/workspace');
		workspaceService = new TestWorkspaceService([folder]);
		service = new ClaudeCodeFolderMruService(sessionService, gitService, workspaceService);

		const result = await service.getRecentlyUsedFolders(CancellationToken.None);

		expect(result).toHaveLength(1);
		expect(result[0].folder).toEqual(folder);
		expect(result[0].repository).toBeUndefined();
	});

	it('does not duplicate workspace folders already in sessions', async () => {
		const folder = URI.file('/Users/test/project');
		sessionService.sessions = [
			makeSession({ id: 's1', cwd: '/Users/test/project', lastRequestEnded: 100 }),
		];
		workspaceService = new TestWorkspaceService([folder]);
		service = new ClaudeCodeFolderMruService(sessionService, gitService, workspaceService);

		const result = await service.getRecentlyUsedFolders(CancellationToken.None);
		expect(result).toHaveLength(1);
	});

	// #endregion

	// #region Sorting, caching, deletion

	it('sorts entries by lastAccessed descending', async () => {
		sessionService.sessions = [
			makeSession({ id: 's1', cwd: '/Users/test/old', lastRequestEnded: 100 }),
			makeSession({ id: 's2', cwd: '/Users/test/new', lastRequestEnded: 300 }),
			makeSession({ id: 's3', cwd: '/Users/test/mid', lastRequestEnded: 200 }),
		];

		const result = await service.getRecentlyUsedFolders(CancellationToken.None);
		expect(result.map(e => e.lastAccessed)).toEqual([300, 200, 100]);
	});

	it('deleteRecentlyUsedFolder filters the folder from results', async () => {
		const folder = URI.file('/Users/test/project');
		sessionService.sessions = [
			makeSession({ id: 's1', cwd: '/Users/test/project', lastRequestEnded: 100 }),
		];

		await service.deleteRecentlyUsedFolder(folder);
		const result = await service.getRecentlyUsedFolders(CancellationToken.None);
		expect(result).toEqual([]);
	});

	it('returns cached entries on subsequent calls', async () => {
		sessionService.sessions = [
			makeSession({ id: 's1', cwd: '/Users/test/project', lastRequestEnded: 100 }),
		];

		const first = await service.getRecentlyUsedFolders(CancellationToken.None);
		expect(first).toHaveLength(1);

		// Add another session — second call returns stale cache immediately
		sessionService.sessions.push(
			makeSession({ id: 's2', cwd: '/Users/test/other', lastRequestEnded: 200 }),
		);
		const second = await service.getRecentlyUsedFolders(CancellationToken.None);
		expect(second).toHaveLength(1);
	});

	// #endregion
});
