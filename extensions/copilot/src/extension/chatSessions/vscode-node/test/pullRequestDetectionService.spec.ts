/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IGitService, RepoContext } from '../../../../platform/git/common/gitService';
import { PullRequestSearchItem } from '../../../../platform/github/common/githubAPI';
import { IOctoKitService } from '../../../../platform/github/common/githubService';
import { ILogService } from '../../../../platform/log/common/logService';
import { mock } from '../../../../util/common/test/simpleMock';
import { Event } from '../../../../util/vs/base/common/event';
import { URI } from '../../../../util/vs/base/common/uri';
import { ChatSessionWorktreeProperties, IChatSessionWorktreeService } from '../../common/chatSessionWorktreeService';
import { PullRequestDetectionService } from '../pullRequestDetectionService';

class TestWorktreeService extends mock<IChatSessionWorktreeService>() {
	declare readonly _serviceBrand: undefined;
	override getWorktreeProperties = vi.fn(async (): Promise<ChatSessionWorktreeProperties | undefined> => undefined);
	override setWorktreeProperties = vi.fn(async () => { });
}

class TestGitService extends mock<IGitService>() {
	declare readonly _serviceBrand: undefined;
	override onDidOpenRepository = Event.None;
	override onDidCloseRepository = Event.None;
	override onDidFinishInitialization = Event.None;
	override activeRepository = { get: () => undefined } as IGitService['activeRepository'];
	override repositories: RepoContext[] = [];
	override getRepository = vi.fn(async (): Promise<RepoContext | undefined> => this.repositories[0]);

	setRepo(repo: RepoContext): void {
		this.repositories = [repo];
	}
}

class TestOctoKitService extends mock<IOctoKitService>() {
	declare readonly _serviceBrand: undefined;
	override findPullRequestByHeadBranch = vi.fn(async (): Promise<PullRequestSearchItem | undefined> => undefined);
}

class TestLogService extends mock<ILogService>() {
	declare readonly _serviceBrand: undefined;
	override trace = vi.fn();
	override debug = vi.fn();
	override error = vi.fn();
}

function createV2WorktreeProperties(overrides?: Partial<ChatSessionWorktreeProperties>): ChatSessionWorktreeProperties {
	return {
		version: 2,
		baseCommit: 'abc123',
		baseBranchName: 'main',
		branchName: 'copilot/test-branch',
		repositoryPath: '/repo',
		worktreePath: '/worktree',
		...overrides,
	} as ChatSessionWorktreeProperties;
}

function createPrSearchItem(overrides?: Partial<PullRequestSearchItem>): PullRequestSearchItem {
	return {
		id: 'pr-42',
		number: 42,
		title: 'Test PR',
		url: 'https://github.com/owner/repo/pull/42',
		state: 'OPEN',
		isDraft: false,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		author: { login: 'user' },
		repository: { owner: { login: 'owner' }, name: 'repo' },
		additions: 1,
		deletions: 0,
		files: { totalCount: 1 },
		fullDatabaseId: 42,
		headRefOid: 'deadbeef',
		headRefName: 'copilot/test-branch',
		baseRefName: 'main',
		body: '',
		...overrides,
	};
}

function createGitRepo(path: string = '/repo'): RepoContext {
	return {
		rootUri: URI.file(path),
		kind: 'repository',
		remotes: ['origin'],
		remoteFetchUrls: ['https://github.com/owner/repo.git'],
	} as unknown as RepoContext;
}

describe('PullRequestDetectionService', () => {
	let worktreeService: TestWorktreeService;
	let gitService: TestGitService;
	let octoKitService: TestOctoKitService;
	let logService: TestLogService;
	let service: PullRequestDetectionService;

	beforeEach(() => {
		vi.restoreAllMocks();
		worktreeService = new TestWorktreeService();
		gitService = new TestGitService();
		octoKitService = new TestOctoKitService();
		logService = new TestLogService();
		service = new PullRequestDetectionService(worktreeService, gitService, octoKitService, logService);
	});

	describe('detectPullRequest', () => {
		it('does not query GitHub API when no worktree properties exist', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue(undefined);
			service.detectPullRequest('session-1');
			await vi.waitFor(() => expect(worktreeService.getWorktreeProperties).toHaveBeenCalled());
			expect(octoKitService.findPullRequestByHeadBranch).not.toHaveBeenCalled();
		});

		it('does not query GitHub API when version is not 2', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue({
				version: 1,
				autoCommit: true,
				baseCommit: 'abc',
				branchName: 'branch',
				repositoryPath: '/repo',
				worktreePath: '/wt',
			});
			service.detectPullRequest('session-1');
			await vi.waitFor(() => expect(worktreeService.getWorktreeProperties).toHaveBeenCalled());
			expect(octoKitService.findPullRequestByHeadBranch).not.toHaveBeenCalled();
		});

		it('skips detection when pullRequestState is merged', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue(
				createV2WorktreeProperties({ pullRequestState: 'merged' })
			);
			service.detectPullRequest('session-1');
			await vi.waitFor(() => expect(worktreeService.getWorktreeProperties).toHaveBeenCalled());
			expect(octoKitService.findPullRequestByHeadBranch).not.toHaveBeenCalled();
		});

		it('skips detection when branchName is missing', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue(
				createV2WorktreeProperties({ branchName: '' })
			);
			service.detectPullRequest('session-1');
			await vi.waitFor(() => expect(worktreeService.getWorktreeProperties).toHaveBeenCalled());
		});

		it('skips detection when repositoryPath is missing', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue(
				createV2WorktreeProperties({ repositoryPath: '' })
			);
			service.detectPullRequest('session-1');
			await vi.waitFor(() => expect(worktreeService.getWorktreeProperties).toHaveBeenCalled());
		});

		it('updates properties when PR is found', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue(createV2WorktreeProperties());
			gitService.setRepo(createGitRepo());
			octoKitService.findPullRequestByHeadBranch.mockResolvedValue(createPrSearchItem());

			service.detectPullRequest('session-1');
			await vi.waitFor(() => expect(worktreeService.setWorktreeProperties).toHaveBeenCalledWith(
				'session-1',
				expect.objectContaining({
					pullRequestUrl: 'https://github.com/owner/repo/pull/42',
					pullRequestState: 'open',
				}),
			));
		});

		it('fires onDidDetectPullRequest when PR is found on session open', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue(createV2WorktreeProperties());
			gitService.setRepo(createGitRepo());
			octoKitService.findPullRequestByHeadBranch.mockResolvedValue(createPrSearchItem());

			const firedSessionIds: string[] = [];
			service.onDidDetectPullRequest(id => firedSessionIds.push(id));

			service.detectPullRequest('session-1');
			await vi.waitFor(() => expect(firedSessionIds).toEqual(['session-1']));
		});

		it('does not fire onDidDetectPullRequest when no PR found on session open', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue(createV2WorktreeProperties());
			gitService.setRepo(createGitRepo());
			octoKitService.findPullRequestByHeadBranch.mockResolvedValue(undefined);

			const firedSessionIds: string[] = [];
			service.onDidDetectPullRequest(id => firedSessionIds.push(id));

			service.detectPullRequest('session-1');
			await vi.waitFor(() => expect(octoKitService.findPullRequestByHeadBranch).toHaveBeenCalled());
			expect(firedSessionIds).toEqual([]);
		});

		it('does not update properties when PR url and state are unchanged', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue(
				createV2WorktreeProperties({
					pullRequestUrl: 'https://github.com/owner/repo/pull/42',
					pullRequestState: 'open',
				})
			);
			gitService.setRepo(createGitRepo());
			octoKitService.findPullRequestByHeadBranch.mockResolvedValue(createPrSearchItem());

			service.detectPullRequest('session-1');
			await vi.waitFor(() => expect(octoKitService.findPullRequestByHeadBranch).toHaveBeenCalled());
			expect(worktreeService.setWorktreeProperties).not.toHaveBeenCalled();
		});

		it('updates properties when PR state changed', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue(
				createV2WorktreeProperties({
					pullRequestUrl: 'https://github.com/owner/repo/pull/42',
					pullRequestState: 'open',
				})
			);
			gitService.setRepo(createGitRepo());
			octoKitService.findPullRequestByHeadBranch.mockResolvedValue(
				createPrSearchItem({ state: 'CLOSED' })
			);

			service.detectPullRequest('session-1');
			await vi.waitFor(() => expect(worktreeService.setWorktreeProperties).toHaveBeenCalledWith(
				'session-1',
				expect.objectContaining({ pullRequestState: 'closed' }),
			));
		});

		it('does not update properties when no PR is found via GitHub API', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue(createV2WorktreeProperties());
			gitService.setRepo(createGitRepo());
			octoKitService.findPullRequestByHeadBranch.mockResolvedValue(undefined);

			service.detectPullRequest('session-1');
			await vi.waitFor(() => expect(octoKitService.findPullRequestByHeadBranch).toHaveBeenCalled());
			expect(worktreeService.setWorktreeProperties).not.toHaveBeenCalled();
		});

		it('does not throw on error', async () => {
			worktreeService.getWorktreeProperties.mockRejectedValue(new Error('Service down'));
			service.detectPullRequest('session-1');
			await vi.waitFor(() => expect(worktreeService.getWorktreeProperties).toHaveBeenCalled());
		});

		it('does not query GitHub API when git repository is not found', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue(createV2WorktreeProperties());
			gitService.getRepository.mockResolvedValue(undefined);

			service.detectPullRequest('session-1');
			await vi.waitFor(() => expect(gitService.getRepository).toHaveBeenCalled());
			expect(octoKitService.findPullRequestByHeadBranch).not.toHaveBeenCalled();
		});
	});

	describe('handlePullRequestCreated', () => {
		it('does not persist when no worktree properties exist', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue(undefined);
			service.handlePullRequestCreated('session-1', 'https://github.com/owner/repo/pull/42');
			await vi.waitFor(() => expect(worktreeService.getWorktreeProperties).toHaveBeenCalled());
			expect(worktreeService.setWorktreeProperties).not.toHaveBeenCalled();
		});

		it('does not persist when version is not 2', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue({
				version: 1,
				autoCommit: true,
				baseCommit: 'abc',
				branchName: 'branch',
				repositoryPath: '/repo',
				worktreePath: '/wt',
			});
			service.handlePullRequestCreated('session-1', 'https://github.com/owner/repo/pull/42');
			await vi.waitFor(() => expect(worktreeService.getWorktreeProperties).toHaveBeenCalled());
			expect(worktreeService.setWorktreeProperties).not.toHaveBeenCalled();
		});

		it('persists PR URL from session when provided', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue(createV2WorktreeProperties());
			service.handlePullRequestCreated('session-1', 'https://github.com/owner/repo/pull/99');
			await vi.waitFor(() => expect(worktreeService.setWorktreeProperties).toHaveBeenCalledWith(
				'session-1',
				expect.objectContaining({
					pullRequestUrl: 'https://github.com/owner/repo/pull/99',
				}),
			));
		});

		it('fires onDidDetectPullRequest when PR is persisted', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue(createV2WorktreeProperties());
			const firedSessionIds: string[] = [];
			service.onDidDetectPullRequest(id => firedSessionIds.push(id));

			service.handlePullRequestCreated('session-1', 'https://github.com/owner/repo/pull/99');
			await vi.waitFor(() => expect(firedSessionIds).toEqual(['session-1']));
		});

		it('does not fire onDidDetectPullRequest when no PR detected', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue(
				createV2WorktreeProperties({ branchName: '', repositoryPath: '' })
			);
			const firedSessionIds: string[] = [];
			service.onDidDetectPullRequest(id => firedSessionIds.push(id));

			service.handlePullRequestCreated('session-1', undefined);
			await vi.waitFor(() => expect(worktreeService.getWorktreeProperties).toHaveBeenCalled());
			expect(firedSessionIds).toEqual([]);
		});

		it('does not persist when no PR URL and no branch/repo for retry', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue(
				createV2WorktreeProperties({ branchName: '', repositoryPath: '' })
			);
			service.handlePullRequestCreated('session-1', undefined);
			await vi.waitFor(() => expect(worktreeService.getWorktreeProperties).toHaveBeenCalled());
			expect(worktreeService.setWorktreeProperties).not.toHaveBeenCalled();
		});

		it('does not fire event when setWorktreeProperties throws', async () => {
			worktreeService.getWorktreeProperties.mockResolvedValue(createV2WorktreeProperties());
			worktreeService.setWorktreeProperties.mockRejectedValue(new Error('Write failed'));
			const firedSessionIds: string[] = [];
			service.onDidDetectPullRequest(id => firedSessionIds.push(id));

			service.handlePullRequestCreated('session-1', 'https://github.com/owner/repo/pull/42');
			await vi.waitFor(() => expect(worktreeService.setWorktreeProperties).toHaveBeenCalled());
			expect(firedSessionIds).toEqual([]);
		});
	});
});
