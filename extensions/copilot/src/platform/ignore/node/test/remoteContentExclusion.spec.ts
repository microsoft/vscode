/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, suite, test, vi } from 'vitest';
import { Barrier } from '../../../../util/vs/base/common/async';
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

	describe('concurrent isIgnored calls', () => {
		test('concurrent call must not cache false while rules are being fetched', async () => {
			// Reproduces the exact race condition from github/Copilot-Controls#650:
			//
			// Timeline without fix:
			//   1. Call A and Call B both enter isIgnored(), both yield at getRepositoryFetchUrls
			//   2. Call A resumes first: shouldFetchContentExclusionRules() seeds empty patterns
			//      in _contentExclusionCache, sets _lastRuleFetch, starts CAPI fetch — yields
			//   3. Call B resumes: shouldFetchContentExclusionRules() returns false (already seeded),
			//      stale-time check passes (_lastRuleFetch just set), skips fetch entirely.
			//      Matches against EMPTY patterns → caches false → returns false. BUG!
			//   4. CAPI fetch completes with real rules, but Call B's stale false persists.
			//
			// With fix: Call B sees _contentExclusionFetchPromise is set and waits for it.

			const repoRoot = '/workspace/my-repo';

			// Per-call barriers so we can control exactly when each call's
			// getRepositoryFetchUrls resolves.
			const gitBarrierA = new Barrier();
			const gitBarrierB = new Barrier();
			let gitCallIndex = 0;
			mockGitService.getRepositoryFetchUrls = vi.fn().mockImplementation(() => {
				const barrier = gitCallIndex === 0 ? gitBarrierA : gitBarrierB;
				gitCallIndex++;
				return barrier.wait().then(() => ({
					rootUri: URI.file(repoRoot),
					remoteFetchUrls: ['https://github.com/org/repo.git']
				}));
			});

			// CAPI fetch is gated by its own barrier so it doesn't resolve
			// until we explicitly release it — after Call B has had a chance
			// to reach the pattern matching code.
			const capiBarrier = new Barrier();
			const rulesEntry = {
				rules: [{ paths: ['**/keyword/**'], source: { name: 'org', type: 'Organization' } }],
				last_updated_at: Date.now()
			};
			mockCAPIClientService.setMockResponse({
				ok: true,
				// Return one entry per repo key in the batch (non-git-file + repo URL)
				json: () => capiBarrier.wait().then(() => [rulesEntry, rulesEntry]),
			} as any);

			const fileA = URI.file('/workspace/my-repo/keyword/keyword.py');
			const fileB = URI.file('/workspace/my-repo/keyword/extra.py');

			// Start both calls — both will block at getRepositoryFetchUrls
			const resultA = remoteContentExclusion.isIgnored(fileA, CancellationToken.None);
			const resultB = remoteContentExclusion.isIgnored(fileB, CancellationToken.None);

			// Step 2: Let Call A resume first. It will call shouldFetchContentExclusionRules()
			// (seeding empty patterns), then start the CAPI fetch which blocks on capiBarrier.
			gitBarrierA.open();
			// Flush microtasks so Call A progresses through shouldFetchContentExclusionRules
			// and into makeContentExclusionRequest before Call B gets to run.
			await flushMicrotasks();

			// Step 3: Now let Call B resume. Without the fix, it would skip the
			// fetch and match against empty patterns. With the fix, it sees the
			// in-progress _contentExclusionFetchPromise and waits.
			gitBarrierB.open();
			await flushMicrotasks();

			// Step 4: Release the CAPI response so real rules load.
			capiBarrier.open();

			// Both files are inside keyword/ and must be excluded.
			expect(await resultA).toBe(true);
			expect(await resultB).toBe(true);
		});

		test('post-fetch cache clear invalidates stale entries from concurrent callers', async () => {
			// Tests the second part of the fix: clearing _ignoreGlobResultCache
			// at the end of _contentExclusionRequest().
			//
			// If a concurrent call somehow wrote a false entry during the fetch,
			// the post-fetch clear ensures the very next call re-evaluates against
			// the real rules instead of returning the stale cached false.

			const repoRoot = '/workspace/my-repo';

			// Call A resolves immediately, Call B is gated by a barrier.
			const gitBarrierB = new Barrier();
			let gitCallIndex = 0;
			mockGitService.getRepositoryFetchUrls = vi.fn().mockImplementation(() => {
				const immediate = gitCallIndex === 0;
				gitCallIndex++;
				if (immediate) {
					return Promise.resolve({
						rootUri: URI.file(repoRoot),
						remoteFetchUrls: ['https://github.com/org/repo.git']
					});
				}
				return gitBarrierB.wait().then(() => ({
					rootUri: URI.file(repoRoot),
					remoteFetchUrls: ['https://github.com/org/repo.git']
				}));
			});

			// CAPI responds with rules after a barrier
			const capiBarrier = new Barrier();
			const rulesEntry = {
				rules: [{ paths: ['**/keyword/**'], source: { name: 'org', type: 'Organization' } }],
				last_updated_at: Date.now()
			};
			mockCAPIClientService.setMockResponse({
				ok: true,
				// Return one entry per repo key in the batch (non-git-file + repo URL)
				json: () => capiBarrier.wait().then(() => [rulesEntry, rulesEntry]),
			} as any);

			const fileA = URI.file('/workspace/my-repo/keyword/keyword.py');
			const fileB = URI.file('/workspace/my-repo/keyword/extra.py');
			const fileC = URI.file('/workspace/my-repo/keyword/third.py');

			// Call A starts — its git resolves immediately, triggers CAPI fetch, blocks on capiBarrier
			const resultA = remoteContentExclusion.isIgnored(fileA, CancellationToken.None);
			await flushMicrotasks();

			// Call B starts — blocks at gitBarrierB
			const resultB = remoteContentExclusion.isIgnored(fileB, CancellationToken.None);

			// Release Call B's git barrier. It will now enter the shouldFetch/else-if
			// path. With the fix, it waits on the CAPI fetch.
			gitBarrierB.open();
			await flushMicrotasks();

			// Release CAPI — rules load, post-fetch cache clear runs
			capiBarrier.open();

			expect(await resultA).toBe(true);
			expect(await resultB).toBe(true);

			// A third sequential call should also correctly exclude (post-fetch
			// cache clear wiped any stale entries, so this re-evaluates with real rules)
			const resultC = await remoteContentExclusion.isIgnored(fileC, CancellationToken.None);
			expect(resultC).toBe(true);
		});

		test('should exclude non-git files when rules arrive after call starts', async () => {
			// Tests delayed CAPI response with the non-git-file path (no repository)
			mockGitService.setRepositoryFetchUrls(undefined);

			// Use a barrier to control when the CAPI request resolves
			const capiBarrier = new Barrier();
			mockCAPIClientService.setMockResponse({
				ok: true,
				json: () => capiBarrier.wait().then(() => [{
					rules: [{ paths: ['**/secret/**'], source: { name: 'org', type: 'Organization' } }],
					last_updated_at: Date.now()
				}]),
			} as any);

			const secretFile = URI.file('/project/secret/config.py');

			// Start isIgnored — it will trigger a fetch that blocks on the capiBarrier
			const resultPromise = remoteContentExclusion.isIgnored(secretFile, CancellationToken.None);

			// Release CAPI response so rules load
			capiBarrier.open();

			expect(await resultPromise).toBe(true);
		});
	});
});

/** Flush pending microtasks by yielding to the event loop. */
function flushMicrotasks(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}
