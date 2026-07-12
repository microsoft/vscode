/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, suite, test, vi } from 'vitest';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { URI } from '../../../../util/vs/base/common/uri';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { ICAPIClientService } from '../../../endpoint/common/capiClient';
import { MockFileSystemService } from '../../../filesystem/node/test/mockFileSystemService';
import { RepoContext } from '../../../git/common/gitService';
import { NullRequestLogger } from '../../../requestLogger/node/nullRequestLogger';
import { TestLogService } from '../../../testing/common/testLogService';
import { RemoteContentExclusion } from '../remoteContentExclusion';
import { MockAuthenticationService } from './mockAuthenticationService';
import { MockCAPIClientService } from './mockCAPIClientService';
import { MockGitService } from './mockGitService';
import { MockWorkspaceService } from './mockWorkspaceService';

suite('RemoteContentExclusion', () => {
	let remoteContentExclusion: RemoteContentExclusion;
	let mockGitService: MockGitService;
	let mockLogService: TestLogService;
	let mockAuthService: MockAuthenticationService;
	let mockCAPIClientService: MockCAPIClientService;
	let mockFileSystemService: MockFileSystemService;
	let mockWorkspaceService: MockWorkspaceService;

	beforeEach(() => {
		mockGitService = new MockGitService();
		mockLogService = new TestLogService();
		mockAuthService = new MockAuthenticationService();
		mockCAPIClientService = new MockCAPIClientService();
		mockFileSystemService = new MockFileSystemService();
		mockWorkspaceService = new MockWorkspaceService();

		remoteContentExclusion = new RemoteContentExclusion(
			mockGitService,
			mockLogService,
			// These mocks implement all the methods used by RemoteContentExclusion,
			// but don't satisfy the full interface signatures (e.g., overloaded methods).
			// Type assertions are needed since the tests only exercise a subset of functionality.
			mockAuthService as unknown as IAuthenticationService,
			mockCAPIClientService as unknown as ICAPIClientService,
			mockFileSystemService,
			mockWorkspaceService,
			new NullRequestLogger()
		);
	});

	describe('repository root caching', () => {
		test('should cache repository lookup and reuse for subsequent files', async () => {
			// Setup: Mock getRepositoryFetchUrls to return a repository
			const repoRoot = '/workspace/my-repo';
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file(repoRoot),
				remoteFetchUrls: ['https://github.com/org/repo.git']
			});

			// First call should hit getRepositoryFetchUrls
			const file1 = URI.file('/workspace/my-repo/src/file1.ts');
			await remoteContentExclusion.isIgnored(file1, CancellationToken.None);

			expect(mockGitService.getRepositoryFetchUrlsCallCount).toBe(1);

			// Second call for a file in the same repo should use cache
			const file2 = URI.file('/workspace/my-repo/src/file2.ts');
			await remoteContentExclusion.isIgnored(file2, CancellationToken.None);

			// Should still be 1 because the second call used the cache
			expect(mockGitService.getRepositoryFetchUrlsCallCount).toBe(1);
		});

		test('should handle nested repositories correctly by matching longest path', async () => {
			// Setup: First, cache the parent repo
			const parentRepoRoot = '/workspace/parent-repo';
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file(parentRepoRoot),
				remoteFetchUrls: ['https://github.com/org/parent.git']
			});

			const parentFile = URI.file('/workspace/parent-repo/src/file.ts');
			await remoteContentExclusion.isIgnored(parentFile, CancellationToken.None);
			expect(mockGitService.getRepositoryFetchUrlsCallCount).toBe(1);

			// Now cache the nested repo via loadRepos (simulating the git extension discovering it)
			const nestedRepoRoot = '/workspace/parent-repo/submodules/nested-repo';
			mockGitService.getRepositoryFetchUrls = vi.fn().mockImplementation(() => {
				mockGitService.getRepositoryFetchUrlsCallCount++;
				return Promise.resolve({
					rootUri: URI.file(nestedRepoRoot),
					remoteFetchUrls: ['https://github.com/org/nested.git']
				});
			});

			// Load the nested repo explicitly
			await remoteContentExclusion.loadRepos([URI.file(nestedRepoRoot)]);
			expect(mockGitService.getRepositoryFetchUrlsCallCount).toBe(2);

			// Reset counter for the actual test
			mockGitService.getRepositoryFetchUrlsCallCount = 0;

			// A file in the nested repo should use the nested repo cache (longest match)
			const nestedFile = URI.file('/workspace/parent-repo/submodules/nested-repo/src/index.ts');
			await remoteContentExclusion.isIgnored(nestedFile, CancellationToken.None);

			// Should be 0 because it used the cache for nested repo (longest match)
			expect(mockGitService.getRepositoryFetchUrlsCallCount).toBe(0);

			// A file in the parent repo (not in nested) should also use cache
			const parentFile2 = URI.file('/workspace/parent-repo/lib/util.ts');
			await remoteContentExclusion.isIgnored(parentFile2, CancellationToken.None);

			// Should still be 0 because it used the cache for parent repo
			expect(mockGitService.getRepositoryFetchUrlsCallCount).toBe(0);
		});

		test('should call getRepositoryFetchUrls for files outside cached repositories', async () => {
			// Setup: Cache a repository
			const repoRoot = '/workspace/repo-a';
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file(repoRoot),
				remoteFetchUrls: ['https://github.com/org/repo-a.git']
			});

			const fileInRepoA = URI.file('/workspace/repo-a/file.ts');
			await remoteContentExclusion.isIgnored(fileInRepoA, CancellationToken.None);
			expect(mockGitService.getRepositoryFetchUrlsCallCount).toBe(1);

			// A file in a different repo should trigger a new lookup
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file('/workspace/repo-b'),
				remoteFetchUrls: ['https://github.com/org/repo-b.git']
			});

			const fileInRepoB = URI.file('/workspace/repo-b/file.ts');
			await remoteContentExclusion.isIgnored(fileInRepoB, CancellationToken.None);

			expect(mockGitService.getRepositoryFetchUrlsCallCount).toBe(2);
		});

		test('should handle files outside any git repository', async () => {
			// Setup: getRepositoryFetchUrls returns undefined for non-git files
			mockGitService.setRepositoryFetchUrls(undefined);

			const nonGitFile = URI.file('/some/random/file.txt');
			const result = await remoteContentExclusion.isIgnored(nonGitFile, CancellationToken.None);

			expect(mockGitService.getRepositoryFetchUrlsCallCount).toBe(1);
			expect(result).toBe(false);
		});

		test('should be case-insensitive when matching paths', async () => {
			// Setup: Cache a repository with lowercase path
			const repoRoot = '/workspace/myrepo';
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file(repoRoot),
				remoteFetchUrls: ['https://github.com/org/repo.git']
			});

			const file1 = URI.file('/workspace/myrepo/file.ts');
			await remoteContentExclusion.isIgnored(file1, CancellationToken.None);
			expect(mockGitService.getRepositoryFetchUrlsCallCount).toBe(1);

			// File with different case should still use the cache
			const file2 = URI.file('/Workspace/MyRepo/another.ts');
			await remoteContentExclusion.isIgnored(file2, CancellationToken.None);

			// Should still be 1 because the path matching is case-insensitive
			expect(mockGitService.getRepositoryFetchUrlsCallCount).toBe(1);
		});

		test('should clear cache entry when repository is closed', async () => {
			// Setup: Cache a repository
			const repoRoot = '/workspace/my-repo';
			mockGitService.setRepositoryFetchUrls({
				rootUri: URI.file(repoRoot),
				remoteFetchUrls: ['https://github.com/org/repo.git']
			});

			const file1 = URI.file('/workspace/my-repo/file.ts');
			await remoteContentExclusion.isIgnored(file1, CancellationToken.None);
			expect(mockGitService.getRepositoryFetchUrlsCallCount).toBe(1);

			// Verify the cache works for a different file in the same repo
			const file2 = URI.file('/workspace/my-repo/other.ts');
			await remoteContentExclusion.isIgnored(file2, CancellationToken.None);
			expect(mockGitService.getRepositoryFetchUrlsCallCount).toBe(1); // Still 1, used cache

			// Simulate repository closing
			mockGitService.fireDidCloseRepository({
				rootUri: URI.file(repoRoot),
				remoteFetchUrls: ['https://github.com/org/repo.git']
			} as RepoContext);

			// After repo is closed, a NEW file (not previously checked) should hit getRepositoryFetchUrls again
			const file3 = URI.file('/workspace/my-repo/newfile.ts');
			await remoteContentExclusion.isIgnored(file3, CancellationToken.None);
			expect(mockGitService.getRepositoryFetchUrlsCallCount).toBe(2);
		});
	});

	describe('loadRepos', () => {
		test('should populate the cache when loading repos', async () => {
			// Setup mock responses for multiple repos
			const repos = [
				{ rootUri: URI.file('/workspace/repo1'), remoteFetchUrls: ['https://github.com/org/repo1.git'] },
				{ rootUri: URI.file('/workspace/repo2'), remoteFetchUrls: ['https://github.com/org/repo2.git'] }
			];

			let callIndex = 0;
			mockGitService.getRepositoryFetchUrls = vi.fn().mockImplementation(() => {
				return Promise.resolve(repos[callIndex++]);
			});

			await remoteContentExclusion.loadRepos([
				URI.file('/workspace/repo1'),
				URI.file('/workspace/repo2')
			]);

			// After loading, files in these repos should use the cache
			mockGitService.getRepositoryFetchUrlsCallCount = 0; // Reset counter

			const file1 = URI.file('/workspace/repo1/src/file.ts');
			await remoteContentExclusion.isIgnored(file1, CancellationToken.None);

			const file2 = URI.file('/workspace/repo2/src/file.ts');
			await remoteContentExclusion.isIgnored(file2, CancellationToken.None);

			// Both should use the cache, so no additional calls
			expect(mockGitService.getRepositoryFetchUrlsCallCount).toBe(0);
		});
	});
});
