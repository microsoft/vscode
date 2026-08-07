/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { MockFileSystemService } from '../../../../platform/filesystem/node/test/mockFileSystemService';
import { RepoContext } from '../../../../platform/git/common/gitService';
import { MockGitService } from '../../../../platform/ignore/node/test/mockGitService';
import { ILogService } from '../../../../platform/log/common/logService';
import { mock } from '../../../../util/common/test/simpleMock';
import { constObservable } from '../../../../util/vs/base/common/observableInternal';
import { URI } from '../../../../util/vs/base/common/uri';
import { ClaudeWorkspaceFolderService } from '../claudeWorkspaceFolderServiceImpl';

class MockLogService extends mock<ILogService>() {
	override trace = vi.fn();
	override info = vi.fn();
	override warn = vi.fn();
	override error = vi.fn();
	override debug = vi.fn();
}

class MockExtensionContext extends mock<IVSCodeExtensionContext>() {
	override globalStorageUri = vscode.Uri.file('/mock/global/storage');
}

function createMockRepoContext(overrides?: Partial<RepoContext>): RepoContext {
	return {
		rootUri: URI.file('/mock/repo'),
		kind: 0 as any,
		isUsingVirtualFileSystem: false,
		headIncomingChanges: undefined,
		headOutgoingChanges: undefined,
		headBranchName: 'feature-branch',
		headCommitHash: 'abc123',
		upstreamBranchName: undefined,
		upstreamRemote: undefined,
		isRebasing: false,
		remotes: [],
		worktrees: [],
		changes: {
			mergeChanges: [],
			indexChanges: [],
			workingTree: [],
			untrackedChanges: [],
		},
		headBranchNameObs: constObservable('feature-branch'),
		headCommitHashObs: constObservable('abc123'),
		upstreamBranchNameObs: constObservable(undefined),
		upstreamRemoteObs: constObservable(undefined),
		isRebasingObs: constObservable(false),
		isIgnored: vi.fn().mockResolvedValue(false),
		...overrides,
	};
}

describe('ClaudeWorkspaceFolderService', () => {
	let gitService: MockGitService;
	let logService: MockLogService;
	let extensionContext: MockExtensionContext;
	let fileSystemService: MockFileSystemService;
	let service: ClaudeWorkspaceFolderService;

	beforeEach(() => {
		gitService = new MockGitService();
		logService = new MockLogService();
		extensionContext = new MockExtensionContext();
		fileSystemService = new MockFileSystemService();
		service = new ClaudeWorkspaceFolderService(gitService, logService, extensionContext, fileSystemService);
	});

	describe('getWorkspaceChanges', () => {
		it('returns empty array when repository is not found', async () => {
			gitService.getRepository = vi.fn().mockResolvedValue(undefined);

			const result = await service.getWorkspaceChanges('/nonexistent', 'main', undefined);

			expect(result).toEqual([]);
			expect(logService.warn).toHaveBeenCalled();
		});

		it('returns empty array when repository has no changes object', async () => {
			gitService.getRepository = vi.fn().mockResolvedValue(
				createMockRepoContext({ changes: undefined }),
			);

			const result = await service.getWorkspaceChanges('/mock/repo', 'main', undefined);

			expect(result).toEqual([]);
		});

		it('returns cached result on second call with same inputs', async () => {
			const repo = createMockRepoContext();
			gitService.getRepository = vi.fn().mockResolvedValue(repo);
			gitService.exec = vi.fn().mockResolvedValue('');

			const result1 = await service.getWorkspaceChanges('/mock/repo', 'feature-branch', undefined);
			const result2 = await service.getWorkspaceChanges('/mock/repo', 'feature-branch', undefined);

			expect(result1).toBe(result2);
			expect(gitService.exec).toHaveBeenCalledTimes(1);
		});

		it('bypasses cache when forceRefresh is true', async () => {
			const repo = createMockRepoContext();
			gitService.getRepository = vi.fn().mockResolvedValue(repo);
			gitService.exec = vi.fn().mockResolvedValue('');

			await service.getWorkspaceChanges('/mock/repo', 'feature-branch', undefined);
			await service.getWorkspaceChanges('/mock/repo', 'feature-branch', undefined, true);

			expect(gitService.exec).toHaveBeenCalledTimes(2);
		});

		it('returns empty array on git exec error', async () => {
			const repo = createMockRepoContext();
			gitService.getRepository = vi.fn().mockResolvedValue(repo);
			gitService.exec = vi.fn().mockRejectedValue(new Error('git failed'));

			const result = await service.getWorkspaceChanges('/mock/repo', 'feature-branch', undefined);

			expect(result).toEqual([]);
			expect(logService.error).toHaveBeenCalled();
		});
	});

	describe('base branch auto-resolution', () => {
		it('calls getBranchBase when gitBaseBranch is undefined and gitBranch is provided', async () => {
			const repo = createMockRepoContext();
			gitService.getRepository = vi.fn().mockResolvedValue(repo);
			gitService.getBranchBase = vi.fn().mockResolvedValue({ name: 'main', commit: 'def456', type: 0 });
			gitService.exec = vi.fn().mockResolvedValue('');
			gitService.getMergeBase = vi.fn().mockResolvedValue('def456');

			await service.getWorkspaceChanges('/mock/repo', 'feature-branch', undefined);

			expect(gitService.getBranchBase).toHaveBeenCalledWith(repo.rootUri, 'feature-branch');
			expect(gitService.exec).toHaveBeenCalledWith(
				repo.rootUri,
				expect.arrayContaining(['--merge-base', 'main']),
			);
		});

		it('does not call getBranchBase when gitBaseBranch is explicitly provided', async () => {
			const repo = createMockRepoContext();
			gitService.getRepository = vi.fn().mockResolvedValue(repo);
			gitService.getBranchBase = vi.fn();
			gitService.exec = vi.fn().mockResolvedValue('');

			await service.getWorkspaceChanges('/mock/repo', 'feature-branch', 'develop');

			expect(gitService.getBranchBase).not.toHaveBeenCalled();
			expect(gitService.exec).toHaveBeenCalledWith(
				repo.rootUri,
				expect.arrayContaining(['--merge-base', 'develop']),
			);
		});

		it('handles getBranchBase returning undefined gracefully', async () => {
			const repo = createMockRepoContext();
			gitService.getRepository = vi.fn().mockResolvedValue(repo);
			gitService.getBranchBase = vi.fn().mockResolvedValue(undefined);
			gitService.exec = vi.fn().mockResolvedValue('');

			const result = await service.getWorkspaceChanges('/mock/repo', 'feature-branch', undefined);

			expect(result).toEqual([]);
			expect(gitService.exec).toHaveBeenCalledWith(
				repo.rootUri,
				expect.not.arrayContaining(['--merge-base']),
			);
		});

		it('handles getBranchBase throwing an error gracefully', async () => {
			const repo = createMockRepoContext();
			gitService.getRepository = vi.fn().mockResolvedValue(repo);
			gitService.getBranchBase = vi.fn().mockRejectedValue(new Error('branch not found'));
			gitService.exec = vi.fn().mockResolvedValue('');

			const result = await service.getWorkspaceChanges('/mock/repo', 'feature-branch', undefined);

			expect(result).toEqual([]);
			expect(logService.warn).toHaveBeenCalledWith(
				expect.stringContaining('Failed to resolve base branch'),
			);
		});

		it('does not call getBranchBase when headCommitHash is undefined', async () => {
			const repo = createMockRepoContext({ headCommitHash: undefined });
			gitService.getRepository = vi.fn().mockResolvedValue(repo);
			gitService.getBranchBase = vi.fn();
			gitService.exec = vi.fn().mockResolvedValue('');

			await service.getWorkspaceChanges('/mock/repo', 'feature-branch', undefined);

			expect(gitService.getBranchBase).not.toHaveBeenCalled();
		});
	});

	describe('dispose', () => {
		it('clears the cache on dispose', async () => {
			const repo = createMockRepoContext();
			gitService.getRepository = vi.fn().mockResolvedValue(repo);
			gitService.exec = vi.fn().mockResolvedValue('');

			await service.getWorkspaceChanges('/mock/repo', 'feature-branch', undefined);

			service.dispose();

			gitService.exec = vi.fn().mockResolvedValue('');
			await service.getWorkspaceChanges('/mock/repo', 'feature-branch', undefined);

			expect(gitService.exec).toHaveBeenCalledTimes(1);
		});
	});
});
