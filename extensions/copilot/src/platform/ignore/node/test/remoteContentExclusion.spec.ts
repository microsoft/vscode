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
import { MockCAPIClientService, failureResponse, rateLimitedResponse, rulesResponse, type MockExclusionRules } from './mockCAPIClientService';
import { MockGitService } from './mockGitService';
import { MockWorkspaceService } from './mockWorkspaceService';

/** Key the implementation uses for global rules that apply outside any git repository. */
const NON_GIT_FILE_KEY = 'non-git-file';

suite('RemoteContentExclusion', () => {
	let remoteContentExclusion: RemoteContentExclusion;
	let mockGitService: MockGitService;
	let mockLogService: TestLogService;
	let mockAuthService: MockAuthenticationService;
	let mockCAPIClientService: MockCAPIClientService;
	let mockFileSystemService: MockFileSystemService;
	let mockWorkspaceService: MockWorkspaceService;
	let now: number;

	function remoteFor(repoRoot: string): string {
		return `https://github.com/org/${repoRoot.split('/').pop()}.git`;
	}

	/** Routes each file to the repo whose root is the longest matching prefix of its path. */
	function routeToRepos(repoRoots: string[]): void {
		const byLongestRoot = [...repoRoots].sort((a, b) => b.length - a.length);
		mockGitService.getRepositoryFetchUrls = vi.fn().mockImplementation((uri: URI) => {
			mockGitService.getRepositoryFetchUrlsCallCount++;
			const root = byLongestRoot.find(candidate => uri.path === candidate || uri.path.startsWith(candidate + '/'));
			return Promise.resolve(root ? { rootUri: URI.file(root), remoteFetchUrls: [remoteFor(root)] } : undefined);
		});
	}

	function respondWithRules(rules: Record<string, MockExclusionRules>): void {
		const byRepo = new Map(Object.entries(rules).map(([repoRoot, value]) => [remoteFor(repoRoot), value]));
		mockCAPIClientService.setResponder(repos => rulesResponse(byRepo, repos));
	}

	beforeEach(() => {
		now = Date.UTC(2026, 0, 1);
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
			new NullRequestLogger(),
			() => now
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

	describe('request coalescing', () => {
		test('batches concurrent lookups instead of refreshing every repo per caller', async () => {
			const repoRoots = Array.from({ length: 25 }, (_, i) => `/workspace/repo${i}`);
			routeToRepos(repoRoots);

			await Promise.all(repoRoots.map(root => remoteContentExclusion.isIgnored(URI.file(`${root}/src/file.ts`), CancellationToken.None)));

			// 25 repos plus the non-git pseudo repo, sent 10 per request, each asked for exactly once.
			expect({
				requests: mockCAPIClientService.requestCount,
				reposSent: mockCAPIClientService.requestedRepos.length,
				uniqueReposSent: new Set(mockCAPIClientService.requestedRepos).size
			}).toEqual({ requests: 3, reposSent: 26, uniqueReposSent: 26 });
		});

		test('only fetches repos that are missing from the cache', async () => {
			routeToRepos(['/workspace/repo-a', '/workspace/repo-b']);

			await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/one.ts'), CancellationToken.None);
			mockCAPIClientService.reset();

			// Same repo again: everything needed is already cached.
			await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/two.ts'), CancellationToken.None);
			const afterCachedRepo = mockCAPIClientService.requestedRepos;

			// New repo: only the new remote is requested, not the whole cache.
			await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-b/one.ts'), CancellationToken.None);

			expect({ afterCachedRepo, afterNewRepo: mockCAPIClientService.requestedRepos }).toEqual({
				afterCachedRepo: [],
				afterNewRepo: [remoteFor('/workspace/repo-b')]
			});
		});

		test('caches an empty ruleset so repos without rules are not refetched', async () => {
			routeToRepos(['/workspace/repo-a']);

			// The default responder reports no rules for the requested repos.
			await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/one.ts'), CancellationToken.None);
			mockCAPIClientService.reset();

			await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/two.ts'), CancellationToken.None);

			expect(mockCAPIClientService.requestCount).toBe(0);
		});

		test('refreshes rules once they expire', async () => {
			routeToRepos(['/workspace/repo-a']);

			await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/one.ts'), CancellationToken.None);
			mockCAPIClientService.reset();

			now += 31 * 60 * 1000;
			await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/two.ts'), CancellationToken.None);

			expect([...mockCAPIClientService.requestedRepos].sort()).toEqual([NON_GIT_FILE_KEY, remoteFor('/workspace/repo-a')].sort());
		});
	});

	describe('failure handling', () => {
		test('retries a repo whose fetch failed rather than treating it as unrestricted', async () => {
			routeToRepos(['/workspace/repo-a']);

			let attempts = 0;
			mockCAPIClientService.setResponder(repos => {
				attempts++;
				return attempts === 1
					? rateLimitedResponse(60)
					: rulesResponse(new Map([[remoteFor('/workspace/repo-a'), { paths: ['**/secret.ts'] }]]), repos);
			});

			const secret = URI.file('/workspace/repo-a/secret.ts');
			const whileFailing = await remoteContentExclusion.isIgnored(secret, CancellationToken.None);

			// Past the backoff window the rules load and the same file is now correctly excluded.
			now += 5 * 60 * 1000;
			const afterRecovery = await remoteContentExclusion.isIgnored(secret, CancellationToken.None);

			expect({ whileFailing, afterRecovery }).toEqual({ whileFailing: false, afterRecovery: true });
		});

		test('stops issuing requests while the backoff is in effect', async () => {
			routeToRepos(['/workspace/repo-a']);
			mockCAPIClientService.setResponder(() => rateLimitedResponse(600));

			await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/one.ts'), CancellationToken.None);
			const afterFirst = mockCAPIClientService.requestCount;

			await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/two.ts'), CancellationToken.None);

			expect({ afterFirst, afterSecond: mockCAPIClientService.requestCount }).toEqual({ afterFirst: 1, afterSecond: 1 });
		});

		test('waits for the reported reset window when rate limited', async () => {
			routeToRepos(['/workspace/repo-a']);
			const resetEpochSeconds = Math.floor((now + 10 * 60 * 1000) / 1000);
			mockCAPIClientService.setResponder(() => failureResponse(403, {
				'x-ratelimit-remaining': '0',
				'x-ratelimit-reset': String(resetEpochSeconds)
			}));

			await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/one.ts'), CancellationToken.None);

			// Still inside the window the server reported, so no further calls are made.
			now += 5 * 60 * 1000;
			await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/two.ts'), CancellationToken.None);
			const duringWindow = mockCAPIClientService.requestCount;

			// Retrying after the reset also proves the quota 403 was classified as a rate limit
			// rather than an auth failure, which would have blocked the token for an hour.
			now += 6 * 60 * 1000;
			await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/three.ts'), CancellationToken.None);

			expect({ duringWindow, afterWindow: mockCAPIClientService.requestCount }).toEqual({ duringWindow: 1, afterWindow: 2 });
		});
	});

	describe('rule matching', () => {
		test('excludes files matching a fetched glob rule', async () => {
			routeToRepos(['/workspace/repo-a']);
			respondWithRules({ '/workspace/repo-a': { paths: ['**/*.env'] } });

			expect({
				env: await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/config.env'), CancellationToken.None),
				source: await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/index.ts'), CancellationToken.None)
			}).toEqual({ env: true, source: false });
		});

		test('ignores malformed patterns rather than failing every lookup', async () => {
			routeToRepos(['/workspace/repo-a']);
			respondWithRules({ '/workspace/repo-a': { paths: ['**/*.env'], ifAnyMatch: ['/(unclosed/'] } });

			expect(await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/config.env'), CancellationToken.None)).toBe(true);
		});
	});
});
