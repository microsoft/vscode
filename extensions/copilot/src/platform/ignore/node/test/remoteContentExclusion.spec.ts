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

	/** Waits until the mock has recorded at least `count` requests, or gives up. */
	async function waitForRequests(count: number): Promise<void> {
		const deadline = Date.now() + 2000;
		while (mockCAPIClientService.requestCount < count && Date.now() < deadline) {
			await new Promise(resolve => setTimeout(resolve, 5));
		}
	}

	/** Gives any scheduled batching window time to elapse and dispatch. */
	function settleBatchWindow(): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, 250));
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

	describe('picking up rule changes', () => {
		test('re-evaluates a file once its rules expire', async () => {
			routeToRepos(['/workspace/repo-a']);
			respondWithRules({});

			const file = URI.file('/workspace/repo-a/secret.ts');
			const beforeRuleAdded = await remoteContentExclusion.isIgnored(file, CancellationToken.None);

			// The server starts excluding the file after the first verdict was memoised.
			respondWithRules({ '/workspace/repo-a': { paths: ['**/secret.ts'] } });
			now += 31 * 60 * 1000;
			const afterRuleAdded = await remoteContentExclusion.isIgnored(file, CancellationToken.None);

			expect({ beforeRuleAdded, afterRuleAdded }).toEqual({ beforeRuleAdded: false, afterRuleAdded: true });
		});

		test('stops excluding a file once the server removes the last rule', async () => {
			routeToRepos(['/workspace/repo-a']);
			respondWithRules({ '/workspace/repo-a': { paths: ['**/secret.ts'] } });

			const file = URI.file('/workspace/repo-a/secret.ts');
			const whileExcluded = await remoteContentExclusion.isIgnored(file, CancellationToken.None);

			// Replacing the rules with an empty set must retire the memoised exclusion.
			respondWithRules({});
			now += 31 * 60 * 1000;
			const afterRuleRemoved = await remoteContentExclusion.isIgnored(file, CancellationToken.None);

			expect({ whileExcluded, afterRuleRemoved }).toEqual({ whileExcluded: true, afterRuleRemoved: false });
		});

		test('keeps memoised verdicts when a refresh returns identical rules', async () => {
			routeToRepos(['/workspace/repo-a']);
			respondWithRules({ '/workspace/repo-a': { paths: ['**/secret.ts'] } });

			await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/secret.ts'), CancellationToken.None);
			const other = URI.file('/workspace/repo-a/index.ts');
			await remoteContentExclusion.isIgnored(other, CancellationToken.None);

			// An unchanged refresh should not force previously computed verdicts to be recomputed.
			now += 31 * 60 * 1000;
			await remoteContentExclusion.isIgnored(other, CancellationToken.None);
			mockGitService.getRepositoryFetchUrlsCallCount = 0;
			const afterUnchangedRefresh = await remoteContentExclusion.isIgnored(other, CancellationToken.None);

			expect({ afterUnchangedRefresh, gitLookups: mockGitService.getRepositoryFetchUrlsCallCount }).toEqual({ afterUnchangedRefresh: false, gitLookups: 0 });
		});
	});

	describe('in-flight requests', () => {
		test('joins a slow in-flight request instead of issuing a duplicate', async () => {
			routeToRepos(['/workspace/repo-a']);
			mockCAPIClientService.blockRequests();

			const first = remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/one.ts'), CancellationToken.None);
			await waitForRequests(1);
			const whileDispatched = mockCAPIClientService.requestCount;

			// A second lookup for the same repo arrives while the request is still open.
			const second = remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/two.ts'), CancellationToken.None);
			await settleBatchWindow();
			const afterSecondLookup = mockCAPIClientService.requestCount;

			mockCAPIClientService.releaseRequests();
			await Promise.all([first, second]);

			expect({ whileDispatched, afterSecondLookup }).toEqual({ whileDispatched: 1, afterSecondLookup: 1 });
		});

		test('releases callers waiting on queued batches when disposed', async () => {
			// More batches than the limiter runs concurrently, so some are still queued on dispose.
			const repoRoots = Array.from({ length: 80 }, (_, i) => `/workspace/repo${i}`);
			routeToRepos(repoRoots);
			mockCAPIClientService.blockRequests();

			const lookups = Promise.all(repoRoots.map(root => remoteContentExclusion.isIgnored(URI.file(`${root}/file.ts`), CancellationToken.None)));
			await waitForRequests(1);

			remoteContentExclusion.dispose();

			// The limiter drops queued batches without running them, so their waiters must be
			// settled by dispose or these lookups would never resolve.
			await expect(lookups).resolves.toHaveLength(80);
			mockCAPIClientService.releaseRequests();
		});
	});

	describe('deferring verdicts until repositories resolve', () => {
		const repoRoot = '/workspace/my-repo';
		const file = URI.file('/workspace/my-repo/src/secret.ts');

		test('applies a repository rule to a file first seen before discovery resolved it', async () => {
			respondWithRules({ [repoRoot]: { paths: ['*'] } });
			// The Git extension has not finished discovering repositories yet.
			mockGitService.isInitialized = false;
			mockGitService.setRepositoryFetchUrls(undefined);

			const beforeDiscovery = await remoteContentExclusion.isIgnored(file, CancellationToken.None);

			mockGitService.isInitialized = true;
			mockGitService.setRepositoryFetchUrls({ rootUri: URI.file(repoRoot), remoteFetchUrls: [remoteFor(repoRoot)] });
			const afterDiscovery = await remoteContentExclusion.isIgnored(file, CancellationToken.None);

			expect({ beforeDiscovery, afterDiscovery }).toEqual({ beforeDiscovery: false, afterDiscovery: true });
		});

		test('does not memoise a verdict reached while repository discovery is still running', async () => {
			mockGitService.isInitialized = false;
			mockGitService.setRepositoryFetchUrls(undefined);

			await remoteContentExclusion.isIgnored(file, CancellationToken.None);
			await remoteContentExclusion.isIgnored(file, CancellationToken.None);

			// Memoising here would pin the file open for the whole rule TTL.
			expect(mockGitService.getRepositoryFetchUrlsCallCount).toBe(2);
		});

		test('memoises a verdict for a file that genuinely belongs to no repository', async () => {
			mockGitService.setRepositoryFetchUrls(undefined);

			const nonGitFile = URI.file('/some/random/file.txt');
			await remoteContentExclusion.isIgnored(nonGitFile, CancellationToken.None);
			await remoteContentExclusion.isIgnored(nonGitFile, CancellationToken.None);

			expect(mockGitService.getRepositoryFetchUrlsCallCount).toBe(1);
		});

		test('applies a repository rule to files evaluated before that repository opened', async () => {
			respondWithRules({ [repoRoot]: { paths: ['*'] } });
			mockGitService.setRepositoryFetchUrls(undefined);

			const beforeOpen = await remoteContentExclusion.isIgnored(file, CancellationToken.None);

			mockGitService.fireDidOpenRepository({ rootUri: URI.file(repoRoot), remoteFetchUrls: [remoteFor(repoRoot)] });
			const afterOpen = await remoteContentExclusion.isIgnored(file, CancellationToken.None);

			expect({ beforeOpen, afterOpen }).toEqual({ beforeOpen: false, afterOpen: true });
		});

		test('does not cache a repository that resolved without a usable remote', async () => {
			// Remotes can arrive after the repository itself does, so an empty remote list is not
			// an answer worth reusing for every other file under that root.
			mockGitService.setRepositoryFetchUrls({ rootUri: URI.file('/workspace/local-only'), remoteFetchUrls: [] });

			await remoteContentExclusion.isIgnored(URI.file('/workspace/local-only/a.ts'), CancellationToken.None);
			await remoteContentExclusion.isIgnored(URI.file('/workspace/local-only/b.ts'), CancellationToken.None);

			expect(mockGitService.getRepositoryFetchUrlsCallCount).toBe(2);
		});

		test('applies a rule once a remote appears on a repository that had none', async () => {
			respondWithRules({ '/workspace/local-only': { paths: ['*'] } });
			const rootUri = URI.file('/workspace/local-only');
			mockGitService.setRepositoryFetchUrls({ rootUri, remoteFetchUrls: [] });

			const localOnlyFile = URI.file('/workspace/local-only/a.ts');
			const beforeRemote = await remoteContentExclusion.isIgnored(localOnlyFile, CancellationToken.None);

			// The user publishes the repository, so it becomes subject to server side rules.
			mockGitService.setRepositoryFetchUrls({ rootUri, remoteFetchUrls: [remoteFor('/workspace/local-only')] });

			expect({ beforeRemote, afterRemote: await remoteContentExclusion.isIgnored(localOnlyFile, CancellationToken.None) })
				.toEqual({ beforeRemote: false, afterRemote: true });
		});

		test('does not match a cached repository root against a file from another scheme', async () => {
			routeToRepos([repoRoot]);
			await remoteContentExclusion.isIgnored(file, CancellationToken.None);
			const afterLocalFile = mockGitService.getRepositoryFetchUrlsCallCount;

			// Same path, different file system: this is not the repository that was cached.
			const virtual = URI.from({ scheme: 'vscode-vfs', authority: 'github', path: file.path });
			await remoteContentExclusion.isIgnored(virtual, CancellationToken.None);

			expect({ afterLocalFile, afterVirtualFile: mockGitService.getRepositoryFetchUrlsCallCount })
				.toEqual({ afterLocalFile: 1, afterVirtualFile: 2 });
		});
	});

	describe('rule scoping', () => {
		test('matches fetched globs against every file rather than only their own repository', async () => {
			routeToRepos(['/workspace/repo-a', '/workspace/repo-b']);
			respondWithRules({ '/workspace/repo-a': { paths: ['**/secret.ts'] } });

			// Rules compile into one flattened matcher list, so a sibling repo is over-blocked rather
			// than under-blocked. Pinned because that safe direction is what makes it acceptable.
			expect({
				excludedRepo: await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/secret.ts'), CancellationToken.None),
				siblingRepo: await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-b/secret.ts'), CancellationToken.None)
			}).toEqual({ excludedRepo: true, siblingRepo: true });
		});

		test('applies organization rules to files inside and outside a repository', async () => {
			routeToRepos(['/workspace/repo-a']);
			// Rules that are not scoped to a repository come back under the non-git pseudo repo.
			mockCAPIClientService.setResponder(repos => rulesResponse(new Map([[NON_GIT_FILE_KEY, { paths: ['**/*.pem'] }]]), repos));

			expect({
				inRepo: await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/key.pem'), CancellationToken.None),
				outsideRepo: await remoteContentExclusion.isIgnored(URI.file('/elsewhere/key.pem'), CancellationToken.None)
			}).toEqual({ inRepo: true, outsideRepo: true });
		});

		test('applies organization content rules to files inside a repository', async () => {
			routeToRepos(['/workspace/repo-a']);
			// The repository itself has no rules, so only the unscoped organization rule can
			// exclude this file. Content rules must reach in-repo files just as globs do.
			mockCAPIClientService.setResponder(repos => rulesResponse(new Map([[NON_GIT_FILE_KEY, { ifAnyMatch: ['BEGIN RSA PRIVATE KEY'] }]]), repos));
			const inRepo = URI.file('/workspace/repo-a/id_rsa');
			const outsideRepo = URI.file('/elsewhere/id_rsa');
			mockFileSystemService.mockFile(inRepo, '-----BEGIN RSA PRIVATE KEY-----');
			mockFileSystemService.mockFile(outsideRepo, '-----BEGIN RSA PRIVATE KEY-----');

			expect({
				inRepo: await remoteContentExclusion.isIgnored(inRepo, CancellationToken.None),
				outsideRepo: await remoteContentExclusion.isIgnored(outsideRepo, CancellationToken.None)
			}).toEqual({ inRepo: true, outsideRepo: true });
		});

		test('excludes every file in a repository that is fully excluded', async () => {
			// The `paths: ["*"]` shape an administrator uses to exclude a whole repository.
			routeToRepos(['/workspace/repo-a']);
			respondWithRules({ '/workspace/repo-a': { paths: ['*'] } });

			expect({
				nested: await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/src/deeply/nested.ts'), CancellationToken.None),
				atRoot: await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/top.ts'), CancellationToken.None)
			}).toEqual({ nested: true, atRoot: true });
		});

		test('resolves a file in a submodule against the innermost repository', async () => {
			routeToRepos(['/workspace/repo-a', '/workspace/repo-a/vendor/sub']);

			await remoteContentExclusion.isIgnored(URI.file('/workspace/repo-a/vendor/sub/index.ts'), CancellationToken.None);

			expect([...mockCAPIClientService.requestedRepos].sort())
				.toEqual([NON_GIT_FILE_KEY, remoteFor('/workspace/repo-a/vendor/sub')].sort());
		});
	});

	describe('content based rules', () => {
		const file = URI.file('/workspace/repo-a/notes.ts');
		const publicFile = URI.file('/workspace/repo-a/public.ts');

		test('excludes a file whose contents match ifAnyMatch', async () => {
			routeToRepos(['/workspace/repo-a']);
			respondWithRules({ '/workspace/repo-a': { ifAnyMatch: ['CONFIDENTIAL'] } });
			mockFileSystemService.mockFile(file, '// CONFIDENTIAL\nexport const a = 1;');
			mockFileSystemService.mockFile(publicFile, 'export const b = 2;');

			expect({
				confidential: await remoteContentExclusion.isIgnored(file, CancellationToken.None),
				unmarked: await remoteContentExclusion.isIgnored(publicFile, CancellationToken.None)
			}).toEqual({ confidential: true, unmarked: false });
		});

		test('excludes a file that lacks a required ifNoneMatch marker', async () => {
			routeToRepos(['/workspace/repo-a']);
			respondWithRules({ '/workspace/repo-a': { ifNoneMatch: ['PUBLIC'] } });
			mockFileSystemService.mockFile(file, 'export const a = 1;');
			mockFileSystemService.mockFile(publicFile, '// PUBLIC\nexport const b = 2;');

			expect({
				unmarked: await remoteContentExclusion.isIgnored(file, CancellationToken.None),
				marked: await remoteContentExclusion.isIgnored(publicFile, CancellationToken.None)
			}).toEqual({ unmarked: true, marked: false });
		});

		test('excludes a file that cannot be read while content rules are in force', async () => {
			routeToRepos(['/workspace/repo-a']);
			respondWithRules({ '/workspace/repo-a': { ifAnyMatch: ['CONFIDENTIAL'] } });

			// Nothing is mocked for this path, so the read fails and the contents are unknown.
			expect(await remoteContentExclusion.isIgnored(file, CancellationToken.None)).toBe(true);
		});

		test('reports regex exclusions only once a regex rule has been fetched', async () => {
			routeToRepos(['/workspace/repo-a']);
			respondWithRules({ '/workspace/repo-a': { ifAnyMatch: ['CONFIDENTIAL'] } });
			const beforeAnyFetch = remoteContentExclusion.isRegexContextExclusionsEnabled;

			mockFileSystemService.mockFile(file, 'export const a = 1;');
			await remoteContentExclusion.isIgnored(file, CancellationToken.None);

			expect({ beforeAnyFetch, afterFetch: remoteContentExclusion.isRegexContextExclusionsEnabled })
				.toEqual({ beforeAnyFetch: false, afterFetch: true });
		});

		test('does not reuse one repository content verdict for the same file in another', async () => {
			routeToRepos(['/workspace/repo-a', '/workspace/repo-b']);
			// Both repos exclude on content, but on different markers, so identical files must
			// reach different verdicts.
			respondWithRules({
				'/workspace/repo-a': { ifAnyMatch: ['SECRET-A'] },
				'/workspace/repo-b': { ifAnyMatch: ['SECRET-B'] }
			});

			const shared = '// SECRET-B\nexport const shared = 1;';
			const inRepoA = URI.file('/workspace/repo-a/shared.ts');
			const inRepoB = URI.file('/workspace/repo-b/shared.ts');
			mockFileSystemService.mockFile(inRepoA, shared);
			mockFileSystemService.mockFile(inRepoB, shared);

			// Both rule sets are loaded up front, so evaluating the second file does not trigger a
			// fetch that would incidentally retire the first file's cached verdict.
			await remoteContentExclusion.loadRepos([URI.file('/workspace/repo-a'), URI.file('/workspace/repo-b')]);

			// repo-a is evaluated first, so its permissive verdict for these contents is cached.
			const repoA = await remoteContentExclusion.isIgnored(inRepoA, CancellationToken.None);

			expect({ repoA, repoB: await remoteContentExclusion.isIgnored(inRepoB, CancellationToken.None) })
				.toEqual({ repoA: false, repoB: true });
		});
	});
});
