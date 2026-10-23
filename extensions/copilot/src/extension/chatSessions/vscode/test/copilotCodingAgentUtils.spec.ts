/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import { IGitService, RepoContext } from '../../../../platform/git/common/gitService';
import { observableValue } from '../../../../util/vs/base/common/observableInternal/observables/observableValue';
import { URI } from '../../../../util/vs/base/common/uri';
import { getRepoId } from '../copilotCodingAgentUtils';

function makeRepoContext(overrides: Partial<RepoContext>): RepoContext {
	return {
		rootUri: URI.parse('file:///repo'),
		kind: 'repository',
		remotes: ['origin'],
		remoteFetchUrls: [],
		headBranchName: 'main',
		headCommitHash: 'abc123',
		changes: { mergeChanges: [], indexChanges: [], workingTree: [], untrackedChanges: [] },
		...overrides,
	} as RepoContext;
}

/**
 * Minimal mock of IGitService for testing getRepoId.
 * Only `initialize()`, `repositories`, and `activeRepository` are used.
 */
class TestGitService {
	repositories: RepoContext[] = [];
	activeRepository = observableValue<RepoContext | undefined>('test-active-repo', undefined);
	async initialize(): Promise<void> { }
}

describe('getRepoId', () => {
	let gitService: TestGitService;

	beforeEach(() => {
		gitService = new TestGitService();
	});

	it('should return GithubRepoId with host=github.com for github.com repos', async () => {
		const repo = makeRepoContext({
			remoteFetchUrls: ['https://github.com/myorg/myrepo.git'],
		});
		gitService.activeRepository.set(repo, undefined);

		const result = await getRepoId(gitService as unknown as IGitService);
		expect(result).toBeDefined();
		expect(result!.length).toBe(1);
		expect(result![0].org).toBe('myorg');
		expect(result![0].repo).toBe('myrepo');
		expect(result![0].host).toBe('github.com');
	});

	it('should return GithubRepoId with GHE host for ghe.com repos', async () => {
		const repo = makeRepoContext({
			remoteFetchUrls: ['https://myco.ghe.com/org/repo.git'],
		});
		gitService.activeRepository.set(repo, undefined);

		const result = await getRepoId(gitService as unknown as IGitService);
		expect(result).toBeDefined();
		expect(result!.length).toBe(1);
		expect(result![0].org).toBe('org');
		expect(result![0].repo).toBe('repo');
		expect(result![0].host).toBe('myco.ghe.com');
	});

	it('should return GithubRepoId with GHE host for SSH shorthand ghe.com repos', async () => {
		const repo = makeRepoContext({
			remoteFetchUrls: ['msdemo-eu@msdemo-eu.ghe.com:sandbox/repo.git'],
		});
		gitService.activeRepository.set(repo, undefined);

		const result = await getRepoId(gitService as unknown as IGitService);
		expect(result).toBeDefined();
		expect(result!.length).toBe(1);
		expect(result![0].org).toBe('sandbox');
		expect(result![0].repo).toBe('repo');
		expect(result![0].host).toBe('msdemo-eu.ghe.com');
	});

	it('should return empty array for non-GitHub/GHE repos', async () => {
		const repo = makeRepoContext({
			remoteFetchUrls: ['https://gitlab.com/org/repo.git'],
		});
		gitService.activeRepository.set(repo, undefined);

		const result = await getRepoId(gitService as unknown as IGitService);
		expect(result).toBeDefined();
		expect(result!.length).toBe(0);
	});

	it('should return empty array when no remote URLs', async () => {
		const repo = makeRepoContext({
			remoteFetchUrls: [],
		});
		gitService.activeRepository.set(repo, undefined);

		const result = await getRepoId(gitService as unknown as IGitService);
		expect(result).toBeDefined();
		expect(result!.length).toBe(0);
	});

	it('should handle multi-root workspaces with mixed hosts', async () => {
		const repo1 = makeRepoContext({
			rootUri: URI.parse('file:///repo1'),
			remoteFetchUrls: ['https://github.com/org1/repo1.git'],
			kind: 'repository',
		});
		const repo2 = makeRepoContext({
			rootUri: URI.parse('file:///repo2'),
			remoteFetchUrls: ['https://myco.ghe.com/org2/repo2.git'],
			kind: 'repository',
		});
		gitService.repositories = [repo1, repo2];

		const result = await getRepoId(gitService as unknown as IGitService);
		expect(result).toBeDefined();
		expect(result!.length).toBe(2);
		expect(result![0].host).toBe('github.com');
		expect(result![0].org).toBe('org1');
		expect(result![1].host).toBe('myco.ghe.com');
		expect(result![1].org).toBe('org2');
	});

	it('should skip worktree repos in multi-root', async () => {
		const repo1 = makeRepoContext({
			rootUri: URI.parse('file:///repo1'),
			remoteFetchUrls: ['https://github.com/org1/repo1.git'],
			kind: 'repository',
		});
		const worktree = makeRepoContext({
			rootUri: URI.parse('file:///worktree'),
			remoteFetchUrls: ['https://github.com/org1/repo1.git'],
			kind: 'worktree',
		});
		gitService.repositories = [repo1, worktree];

		const result = await getRepoId(gitService as unknown as IGitService);
		expect(result).toBeDefined();
		expect(result!.length).toBe(1);
		expect(result![0].org).toBe('org1');
	});
});
