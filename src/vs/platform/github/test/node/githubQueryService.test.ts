/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { hasKey } from '../../../../base/common/types.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { GitHubRepositoryRef } from '../../common/githubQueryService.js';
import { GitHubHostCapabilities } from '../../common/githubTypes.js';
import { GitHubCredential, GitHubCredentialInvalidation, IGitHubCredentials } from '../../common/githubCredentialService.js';
import { IGitHubCapabilities } from '../../common/githubHostCapabilitiesService.js';
import { GitHubEntityPollingPolicy, GitHubQueryService } from '../../common/githubQueryServiceImpl.js';
import { GitHubTransport } from '../../common/githubTransport.js';
import { FakeGitHubScheduler } from './fakeGitHubScheduler.js';
import { nodeFetch } from './nodeFetch.js';
import {
	gitHubGraphQLResponse,
	gitHubGraphQLStep,
	gitHubJsonResponse,
	gitHubRestStep,
	ProgrammableGitHubServer,
} from './programmableGitHubServer.js';

const policy: GitHubEntityPollingPolicy = {
	dormantGrace: 20,
	maximumDormantEntries: 2,
	visible: 10,
	background: 100,
	failureBackoff: { immediateRetries: 0, base: 30, maximum: 300, jitter: 0 },
	jitter: 0,
};

const availableCapabilities: GitHubHostCapabilities = {
	graphql: true,
	mergeQueue: true,
	internalMergeStatus: false,
	reviewThreads: true,
	checkContextRequiredness: true,
};

class TestCapabilitiesService implements IGitHubCapabilities {

	constructor(readonly value: GitHubHostCapabilities = availableCapabilities) { }

	getCapabilities(): Promise<GitHubHostCapabilities> {
		return Promise.resolve(this.value);
	}

	clear(): void { }
}

class SequencedCapabilitiesService implements IGitHubCapabilities {
	private _index = 0;

	constructor(private readonly _values: readonly GitHubHostCapabilities[]) { }

	getCapabilities(): Promise<GitHubHostCapabilities> {
		return Promise.resolve(this._values[Math.min(this._index++, this._values.length - 1)]);
	}

	clear(): void { }
}

class TestCredentialService implements IGitHubCredentials, IDisposable {

	private readonly _onDidInvalidate = new Emitter<GitHubCredentialInvalidation>();
	readonly onDidInvalidate = this._onDidInvalidate.event;
	private readonly _controller = new AbortController();

	constructor(private readonly _account: { readonly host: string; readonly accountId: string }) { }

	getCredential(signal: AbortSignal): Promise<GitHubCredential> {
		if (signal.aborted) {
			return Promise.reject(signal.reason);
		}
		return Promise.resolve({
			account: this._account,
			token: 'token',
			generation: 1,
			signal: this._controller.signal,
		});
	}

	resolveCredential(_token: string, signal: AbortSignal): Promise<GitHubCredential> {
		return this.getCredential(signal);
	}

	handleRequestError(): void { }

	invalidate(): void {
		const credential: GitHubCredential = {
			account: this._account,
			token: 'token',
			generation: 1,
			signal: this._controller.signal,
		};
		this._controller.abort(new Error('invalidated'));
		this._onDidInvalidate.fire({ credential, reason: 'account' });
	}

	dispose(): void {
		this._controller.abort(new Error('disposed'));
		this._onDidInvalidate.dispose();
	}
}

suite('GitHubQueryService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function withServer(fn: (server: ProgrammableGitHubServer) => Promise<void>): Promise<void> {
		const server = await ProgrammableGitHubServer.start();
		try {
			await fn(server);
		} finally {
			await server.disposeAsync();
		}
	}

	function setup(server: ProgrammableGitHubServer, capabilities: GitHubHostCapabilities | IGitHubCapabilities = availableCapabilities): {
		readonly account: { readonly host: string; readonly accountId: string };
		readonly ref: GitHubRepositoryRef;
		readonly clock: FakeGitHubScheduler;
		readonly credentials: TestCredentialService;
		readonly service: GitHubQueryService;
	} {
		const account = { host: new URL(server.apiBaseUrl).host, accountId: '101' };
		const ref = { ...account, owner: 'octo', repo: 'repo' };
		const clock = new FakeGitHubScheduler({ now: 0 });
		const credentials = disposables.add(new TestCredentialService(account));
		const transport = disposables.add(new GitHubTransport(nodeFetch));
		const capabilityService = hasKey(capabilities, { getCapabilities: true }) ? capabilities : new TestCapabilitiesService(capabilities);
		const service = disposables.add(new GitHubQueryService(
			clock,
			policy,
			credentials,
			transport,
			server.createEndpointService(),
			capabilityService,
			new NullLogService(),
		));
		return { account, ref, clock, credentials, service };
	}

	function graphQLRepository(): object {
		return {
			id: 'R1',
			owner: { id: 'U1', login: 'octo' },
			name: 'repo',
			nameWithOwner: 'octo/repo',
			primaryLanguage: { name: 'TypeScript' },
			stargazerCount: 42,
			defaultBranchRef: { name: 'main' },
			isPrivate: false,
			description: 'Repository',
			url: 'https://example.test/octo/repo',
			isArchived: false,
			isFork: false,
		};
	}

	function graphQLIssue(): object {
		return {
			id: 'I7',
			number: 7,
			title: 'Issue',
			body: 'Body',
			url: 'https://example.test/octo/repo/issues/7',
			state: 'CLOSED',
			stateReason: 'NOT_PLANNED',
			author: null,
			assignees: { nodes: [{ id: 'U3', login: 'assignee' }] },
			labels: { nodes: [{ name: 'bug' }] },
			createdAt: '2026-08-18T00:00:00Z',
			updatedAt: '2026-08-18T01:00:00Z',
			closedAt: '2026-08-18T02:00:00Z',
		};
	}

	test('hydrates repository and issue resources in one GraphQL request', async () => {
		await withServer(async server => {
			server.enqueue(gitHubGraphQLStep({
				queryIncludes: 'HydrateGitHubResources',
				assert: request => assert.deepStrictEqual(request.graphQl?.variables, {
					owner0: 'octo',
					repo0: 'repo',
					owner1: 'octo',
					repo1: 'repo',
					number1: 7,
				}),
				response: gitHubGraphQLResponse({
					r0: graphQLRepository(),
					r1: {
						issue: graphQLIssue(),
					},
				}),
			}));
			const { account, service } = setup(server);
			const repositoryRef = { ...account, owner: 'octo', repo: 'repo' };
			const issueRef = { ...account, owner: 'octo', repo: 'repo', number: 7 };
			const repository = service.subscribeRepository(repositoryRef, { priority: 'visible' });
			const issue = service.subscribeIssue(issueRef, { priority: 'visible' });

			await service.hydrateResources([
				{ kind: 'repository', ref: repositoryRef },
				{ kind: 'issue', ref: issueRef },
			], signal());
			await service.hydrateResources([
				{ kind: 'repository', ref: repositoryRef },
				{ kind: 'issue', ref: issueRef },
			], signal());

			assert.deepStrictEqual({
				repository: repository.resource.state.get().value,
				issue: issue.resource.state.get().value,
			}, {
				repository: {
					id: 'R1',
					owner: { id: 'U1', login: 'octo' },
					name: 'repo',
					nameWithOwner: 'octo/repo',
					language: 'TypeScript',
					stars: 42,
					defaultBranch: 'main',
					private: false,
					description: 'Repository',
					url: 'https://example.test/octo/repo',
					archived: false,
					fork: false,
				},
				issue: {
					id: 'I7',
					number: 7,
					title: 'Issue',
					body: 'Body',
					url: 'https://example.test/octo/repo/issues/7',
					state: 'closed',
					stateReason: 'not_planned',
					author: { login: 'ghost' },
					assignees: [{ id: 'U3', login: 'assignee' }],
					labels: ['bug'],
					createdAt: '2026-08-18T00:00:00Z',
					updatedAt: '2026-08-18T01:00:00Z',
					closedAt: '2026-08-18T02:00:00Z',
				},
			});
			server.assertSatisfied();
		});
	});

	test('does not overwrite a newer REST refresh with stale hydration data', async () => {
		await withServer(async server => {
			const hydrationStarted = new DeferredPromise<void>();
			const releaseHydration = new DeferredPromise<void>();
			const refreshStarted = new DeferredPromise<void>();
			const releaseRefresh = new DeferredPromise<void>();
			server.enqueue(
				gitHubGraphQLStep({
					queryIncludes: 'HydrateGitHubResources',
					assert: async () => hydrationStarted.complete(),
					waitFor: releaseHydration.p,
					response: gitHubGraphQLResponse({ r0: graphQLRepository() }),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo',
					assert: async () => refreshStarted.complete(),
					waitFor: releaseRefresh.p,
					response: gitHubJsonResponse(repositoryResponse('new-owner/new-repo')),
				}),
			);
			const { account, service } = setup(server);
			const ref = { ...account, owner: 'octo', repo: 'repo' };
			const repository = service.subscribeRepository(ref, { priority: 'visible' });
			const hydration = service.hydrateResources([{ kind: 'repository', ref }], signal());
			await hydrationStarted.p;

			const refresh = repository.refresh();
			await releaseHydration.complete();
			await hydration;
			await refreshStarted.p;
			assert.strictEqual(repository.resource.state.get().status, 'loading');
			await releaseRefresh.complete();
			await refresh;

			assert.strictEqual(repository.resource.state.get().value?.nameWithOwner, 'new-owner/new-repo');
			server.assertSatisfied();
		});
	});

	test('shares repository and issue resources, canonicalizes aliases, and stops terminal issue polling', async () => {
		await withServer(async server => {
			const repositoryPolled = new DeferredPromise<void>();
			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo',
					response: gitHubJsonResponse(repositoryResponse('new-owner/new-repo'), { etag: '"repo"' }),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/issues/7',
					response: gitHubJsonResponse(issueResponse('closed'), { etag: '"issue"' }),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/new-owner/new-repo',
					assert: async () => repositoryPolled.complete(),
					response: gitHubJsonResponse(repositoryResponse('new-owner/new-repo'), { etag: '"repo-2"' }),
				}),
			);
			const { account, clock, service } = setup(server);
			const repositoryA = service.subscribeRepository({ ...account, owner: 'octo', repo: 'repo' }, { priority: 'visible' });
			const repositoryB = service.subscribeRepository({ ...account, owner: 'OCTO', repo: 'REPO' }, { priority: 'background' });
			const issueA = service.subscribeIssue({ ...account, owner: 'octo', repo: 'repo', number: 7 }, { priority: 'visible' });
			const issueB = service.subscribeIssue({ ...account, owner: 'OCTO', repo: 'REPO', number: 7 }, { priority: 'background' });

			assert.strictEqual(repositoryA.resource, repositoryB.resource);
			assert.strictEqual(issueA.resource, issueB.resource);
			await Promise.all([repositoryA.refresh(), issueA.refresh()]);
			const canonical = service.subscribeRepository({ ...account, owner: 'new-owner', repo: 'new-repo' }, { priority: 'background' });

			assert.deepStrictEqual({
				canonicalShared: canonical.resource === repositoryA.resource,
				repositoryRef: repositoryA.resource.ref,
				repository: repositoryA.resource.state.get(),
				issue: issueA.resource.state.get(),
			}, {
				canonicalShared: true,
				repositoryRef: { ...account, owner: 'new-owner', repo: 'new-repo' },
				repository: {
					value: {
						id: 'R1',
						owner: { id: '1', login: 'new-owner' },
						name: 'new-repo',
						nameWithOwner: 'new-owner/new-repo',
						defaultBranch: 'main',
						private: true,
						description: 'repo',
						url: 'https://example.test/new-owner/new-repo',
						archived: false,
						fork: false,
					},
					status: 'ready',
					complete: true,
					observedAt: new Date(0).toISOString(),
					attemptedAt: new Date(0).toISOString(),
				},
				issue: {
					value: {
						id: 'I7',
						number: 7,
						title: 'Issue',
						body: 'Body',
						url: 'https://example.test/issues/7',
						state: 'closed',
						stateReason: 'completed',
						author: { id: '2', login: 'author' },
						assignees: [{ id: '3', login: 'assignee' }],
						labels: ['bug'],
						createdAt: '2026-01-01T00:00:00Z',
						updatedAt: '2026-01-02T00:00:00Z',
						closedAt: '2026-01-03T00:00:00Z',
					},
					status: 'ready',
					complete: true,
					observedAt: new Date(0).toISOString(),
					attemptedAt: new Date(0).toISOString(),
				},
			});

			clock.advanceBy(10);
			await repositoryPolled.p;
			assert.deepStrictEqual(server.requests.map(request => request.servicePath), [
				'/repos/octo/repo',
				'/repos/octo/repo/issues/7',
				'/repos/new-owner/new-repo',
			]);

			repositoryA.dispose();
			repositoryB.dispose();
			canonical.dispose();
			issueA.dispose();
			issueB.dispose();
			server.assertSatisfied();
		});
	});

	test('retains dormant entity identity briefly and purges resources on account change', async () => {
		await withServer(async server => {
			const resumedPoll = new DeferredPromise<void>();
			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo',
					response: gitHubJsonResponse(repositoryResponse('octo/repo')),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo',
					assert: async () => resumedPoll.complete(),
					response: gitHubJsonResponse(repositoryResponse('octo/repo')),
				}),
			);
			const { credentials, clock, ref, service } = setup(server);
			const first = service.subscribeRepository(ref, { priority: 'background' });
			await first.refresh();
			const resource = first.resource;
			first.dispose();

			clock.advanceBy(19);
			const resumed = service.subscribeRepository(ref, { priority: 'background' });
			assert.strictEqual(resumed.resource, resource);
			clock.advanceBy(100);
			await resumedPoll.p;
			credentials.invalidate();
			await assert.rejects(() => resumed.refresh(), /disposed/);
			const replaced = service.subscribeRepository(ref, { priority: 'background' });
			assert.notStrictEqual(replaced.resource, resource);
			resumed.dispose();
			replaced.dispose();
			server.assertSatisfied();
		});
	});

	test('immediately restarts an aborted first load when a dormant resource resumes', async () => {
		await withServer(async server => {
			const firstStarted = new DeferredPromise<void>();
			const releaseFirst = new DeferredPromise<void>();
			const resumedStarted = new DeferredPromise<void>();
			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo',
					assert: async () => firstStarted.complete(),
					waitFor: releaseFirst.p,
					response: gitHubJsonResponse(repositoryResponse('octo/repo')),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo',
					assert: async () => resumedStarted.complete(),
					response: gitHubJsonResponse(repositoryResponse('octo/repo')),
				}),
			);
			const { clock, ref, service } = setup(server);
			const first = service.subscribeRepository(ref, { priority: 'background' });
			const firstRefresh = first.refresh();
			await firstStarted.p;
			first.dispose();
			await assert.rejects(() => firstRefresh);

			const resumed = service.subscribeRepository(ref, { priority: 'background' });
			clock.flushDue();
			await resumedStarted.p;
			await resumed.refresh();
			await releaseFirst.complete();

			assert.deepStrictEqual({
				sameResource: resumed.resource === first.resource,
				status: resumed.resource.state.get().status,
				requestCount: server.requests.length,
			}, {
				sameResource: true,
				status: 'ready',
				requestCount: 2,
			});
			resumed.dispose();
			server.assertSatisfied();
		});
	});

	test('paginates comparisons and reports changed-file completeness explicitly', async () => {
		await withServer(async server => {
			const firstCommits = Array.from({ length: 100 }, (_, index) => comparisonCommit(`c${index}`));
			const files = Array.from({ length: 300 }, (_, index) => changedFile(`f${index}.ts`));
			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/compare/base...head',
					query: { per_page: 100, page: 1 },
					response: gitHubJsonResponse(compareResponse(firstCommits, files, 101)),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/compare/base...head',
					query: { per_page: 100, page: 2 },
					response: gitHubJsonResponse(compareResponse([comparisonCommit('head-sha')], files, 101)),
				}),
			);
			const { ref, service } = setup(server);

			const result = await service.compare(ref, 'base', 'head', signal());

			assert.deepStrictEqual({
				baseSha: result.baseSha,
				mergeBaseSha: result.mergeBaseSha,
				headSha: result.headSha,
				commitCount: result.commits.length,
				commitsComplete: result.commitsComplete,
				fileCount: result.files.length,
				filesComplete: result.filesComplete,
			}, {
				baseSha: 'base-sha',
				mergeBaseSha: 'merge-base-sha',
				headSha: 'head-sha',
				commitCount: 101,
				commitsComplete: true,
				fileCount: 300,
				filesComplete: false,
			});
			server.assertSatisfied();
		});
	});

	test('fails closed when comparison commits or files are incomplete', async () => {
		await withServer(async server => {
			server.enqueue(gitHubRestStep({
				method: 'GET',
				path: '/repos/octo/repo/compare/base...head',
				query: { per_page: 100, page: 1 },
				response: gitHubJsonResponse({
					base_commit: { sha: 'base-sha' },
					merge_base_commit: { sha: 'merge-base-sha' },
					status: 'ahead',
					ahead_by: 2,
					behind_by: 0,
					total_commits: 2,
					commits: [comparisonCommit('partial')],
				}),
			}));
			const { ref, service } = setup(server);

			const result = await service.compare(ref, 'base', 'head', signal());

			assert.deepStrictEqual({
				headSha: result.headSha,
				commitsComplete: result.commitsComplete,
				files: result.files,
				filesComplete: result.filesComplete,
			}, {
				headSha: undefined,
				commitsComplete: false,
				files: [],
				filesComplete: false,
			});
			server.assertSatisfied();
		});
	});

	test('lists pull request pages and viewer-specific searches', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostListPullRequests',
					response: gitHubGraphQLResponse({
						repository: {
							pullRequests: {
								nodes: [pullRequestNode(1)],
								pageInfo: { endCursor: 'cursor-1', hasNextPage: true },
							},
						},
					}),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostSearchPullRequests',
					assert: request => assert.strictEqual((request.graphQl?.variables as { query?: string })?.query?.includes('review-requested:@me'), true),
					response: gitHubGraphQLResponse({ search: { nodes: [pullRequestNode(2)] } }),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostSearchPullRequests',
					assert: request => assert.strictEqual((request.graphQl?.variables as { query?: string })?.query?.includes('assignee:@me'), true),
					response: gitHubGraphQLResponse({ search: { nodes: [pullRequestNode(3)] } }),
				}),
			);
			const { ref, service } = setup(server);

			const page = await service.listPullRequests(ref, undefined, signal());
			const reviews = await service.listPullRequestsWaitingForReview(ref, signal());
			const assigned = await service.listPullRequestsAssignedToViewer(ref, signal());

			assert.deepStrictEqual({
				page,
				reviewRequested: reviews.map(item => ({ number: item.number, flag: item.reviewRequestedFromViewer })),
				assigned: assigned.map(item => ({ number: item.number, flag: item.assignedToViewer })),
			}, {
				page: {
					pullRequests: [pullRequestSummary(1, false, false)],
					cursor: 'cursor-1',
					hasNextPage: true,
				},
				reviewRequested: [{ number: 2, flag: true }],
				assigned: [{ number: 3, flag: true }],
			});
			server.assertSatisfied();
		});
	});

	test('builds complete pull request context from paginated files and comments', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/pulls/7',
					response: gitHubJsonResponse({
						number: 7,
						html_url: 'https://example.test/pull/7',
						title: 'PR',
						body: 'Description',
						user: { login: 'author' },
						draft: false,
						base: { ref: 'main' },
						head: { ref: 'feature' },
						updated_at: '2026-01-04T00:00:00Z',
					}),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/pulls/7/files',
					query: { per_page: 100, page: 1 },
					response: gitHubJsonResponse([{ filename: 'a.ts', status: 'modified', additions: 1, deletions: 2, patch: '@@ patch' }]),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/issues/7/comments',
					query: { per_page: 100, page: 1 },
					response: gitHubJsonResponse([{ body: 'issue', user: { login: 'a' }, created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' }]),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/pulls/7/comments',
					query: { per_page: 100, page: 1 },
					response: gitHubJsonResponse([{ body: 'review', user: { login: 'b' }, path: 'a.ts', line: null, original_line: 4, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-03T00:00:00Z' }]),
				}),
			);
			const { account, service } = setup(server);

			const result = await service.getPullRequestContext({ ...account, owner: 'octo', repo: 'repo', number: 7 }, signal());

			assert.deepStrictEqual({
				patch: result.patch,
				comments: result.comments,
				filesComplete: result.filesComplete,
				commentsComplete: result.commentsComplete,
			}, {
				patch: 'diff --git a/a.ts b/a.ts\n@@ patch',
				comments: [
					{ kind: 'review', author: 'b', body: 'review', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-03T00:00:00Z', path: 'a.ts', line: 4 },
					{ kind: 'issue', author: 'a', body: 'issue', createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', path: undefined, line: undefined },
				],
				filesComplete: true,
				commentsComplete: true,
			});
			server.assertSatisfied();
		});
	});

	test('marks pull request context files incomplete at GitHub maximum', async () => {
		await withServer(async server => {
			const fullPage = Array.from({ length: 100 }, (_, index) => ({
				filename: `file-${index}.ts`,
				status: 'modified',
				additions: 1,
				deletions: 0,
			}));
			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/pulls/7',
					response: gitHubJsonResponse({
						number: 7,
						html_url: 'https://example.test/pull/7',
						title: 'PR',
						body: null,
						user: { login: 'author' },
						draft: false,
						base: { ref: 'main' },
						head: { ref: 'feature' },
						updated_at: '2026-01-04T00:00:00Z',
					}),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/pulls/7/files',
					query: { per_page: 100, page: 1 },
					response: gitHubJsonResponse(fullPage),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/issues/7/comments',
					query: { per_page: 100, page: 1 },
					response: gitHubJsonResponse([]),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/pulls/7/comments',
					query: { per_page: 100, page: 1 },
					response: gitHubJsonResponse([]),
				}),
				...Array.from({ length: 29 }, (_, index) => gitHubRestStep({
					method: 'GET' as const,
					path: '/repos/octo/repo/pulls/7/files',
					query: { per_page: 100, page: index + 2 },
					response: gitHubJsonResponse(fullPage),
				})),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/pulls/7/files',
					query: { per_page: 100, page: 31 },
					response: gitHubJsonResponse([]),
				}),
			);
			const { account, service } = setup(server);

			const result = await service.getPullRequestContext({ ...account, owner: 'octo', repo: 'repo', number: 7 }, signal());

			assert.strictEqual(result.filesComplete, false);
			server.assertSatisfied();
		});
	});

	test('preserves behavior-compatible branch and head-SHA lookup semantics', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/pulls',
					query: { head: 'fork:feature/test', state: 'all', sort: 'updated', direction: 'desc', per_page: 1 },
					response: gitHubJsonResponse([{ number: 9, node_id: 'PR9', html_url: 'https://example.test/pull/9', created_at: '2026-01-01T00:00:00Z' }]),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/commits/sha/pulls',
					query: { per_page: 100 },
					response: gitHubJsonResponse([
						{ number: 1, html_url: 'https://example.test/pull/1', state: 'closed', head: { sha: 'sha' } },
						{ number: 2, html_url: 'https://example.test/pull/2', state: 'open', head: { sha: 'other' } },
					]),
				}),
			);
			const { ref, service } = setup(server);

			const byBranch = await service.findPullRequestByHeadBranch(ref, 'feature/test', 'fork', signal());
			const bySha = await service.findPullRequestByHeadSha(ref, 'sha', signal());

			assert.deepStrictEqual({
				byBranch,
				bySha,
			}, {
				byBranch: {
					ref: { ...ref, number: 9 },
					id: 'PR9',
					url: 'https://example.test/pull/9',
					createdAt: '2026-01-01T00:00:00Z',
				},
				bySha: {
					ref: { ...ref, number: 1 },
					id: undefined,
					url: 'https://example.test/pull/1',
					createdAt: undefined,
				},
			});
			server.assertSatisfied();
		});
	});

	test('returns no head-SHA lookup when the first page is full', async () => {
		await withServer(async server => {
			server.enqueue(gitHubRestStep({
				method: 'GET',
				path: '/repos/octo/repo/commits/sha/pulls',
				query: { per_page: 100 },
				response: gitHubJsonResponse(Array.from({ length: 100 }, (_, index) => ({
					number: index + 1,
					html_url: `https://example.test/pull/${index + 1}`,
					state: 'open',
					head: { sha: index === 0 ? 'sha' : 'other' },
				}))),
			}));
			const { ref, service } = setup(server);

			assert.strictEqual(await service.findPullRequestByHeadSha(ref, 'sha', signal()), undefined);
			server.assertSatisfied();
		});
	});

	test('queries recent work, complete review-thread summaries, and batched issue linkage', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostRecentAssignedIssues',
					response: gitHubGraphQLResponse({
						search: { nodes: [{ number: 1, title: 'Issue', url: 'https://example.test/issues/1', updatedAt: '2026-01-01T00:00:00Z' }] },
					}),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostRecentAuthoredPullRequests',
					response: gitHubGraphQLResponse({
						search: {
							nodes: [{
								number: 2,
								title: 'PR',
								url: 'https://example.test/pull/2',
								updatedAt: '2026-01-02T00:00:00Z',
								commits: { nodes: [{ commit: { committedDate: '2026-01-03T00:00:00Z', statusCheckRollup: { state: 'SUCCESS' } } }] },
							}],
						},
					}),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostPullRequestReviewThreadSummary',
					response: gitHubGraphQLResponse({
						repository: {
							pullRequest: {
								reviewThreads: {
									nodes: [{ isResolved: false, comments: { nodes: [{ createdAt: '2026-01-04T00:00:00Z' }] } }],
									pageInfo: { hasNextPage: true, endCursor: 'threads-1' },
								},
							},
						},
					}),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostPullRequestReviewThreadSummary',
					assert: request => assert.strictEqual((request.graphQl?.variables as { after?: string }).after, 'threads-1'),
					response: gitHubGraphQLResponse({
						repository: {
							pullRequest: {
								reviewThreads: {
									nodes: [{ isResolved: true, comments: { nodes: [] } }],
									pageInfo: { hasNextPage: false, endCursor: null },
								},
							},
						},
					}),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostIssueLinkage',
					response: gitHubGraphQLResponse({
						repository: {
							issue0: { closedByPullRequestsReferences: { totalCount: 1 } },
							issue1: { closedByPullRequestsReferences: { totalCount: 0 } },
						},
					}),
				}),
			);
			const { account, ref, service } = setup(server);

			const issues = await service.getRecentAssignedIssues(ref, signal());
			const pullRequests = await service.getRecentAuthoredPullRequests(ref, signal());
			const threads = await service.getPullRequestReviewThreadSummary({ ...account, owner: 'octo', repo: 'repo', number: 2 }, signal());
			const linked = await service.getIssuesWithLinkedPullRequests(ref, [1, 2, 1, -1], signal());

			assert.deepStrictEqual({
				issues,
				pullRequests,
				threads,
				linked,
			}, {
				issues: [{ number: 1, title: 'Issue', url: 'https://example.test/issues/1', updatedAt: '2026-01-01T00:00:00Z' }],
				pullRequests: [{
					number: 2,
					title: 'PR',
					url: 'https://example.test/pull/2',
					updatedAt: '2026-01-02T00:00:00Z',
					statusCheckRollupState: 'SUCCESS',
					latestCommitAt: '2026-01-03T00:00:00Z',
				}],
				threads: [
					{ isResolved: false, latestCommentAt: '2026-01-04T00:00:00Z' },
					{ isResolved: true, latestCommentAt: undefined },
				],
				linked: [1],
			});
			server.assertSatisfied();
		});
	});

	test('fails closed without GraphQL and memoizes schema-invalid query variants', async () => {
		await withServer(async server => {
			const unavailable: GitHubHostCapabilities = {
				graphql: false,
				mergeQueue: false,
				internalMergeStatus: false,
				reviewThreads: false,
				checkContextRequiredness: false,
			};
			const disabled = setup(server, unavailable);
			await assert.rejects(
				() => disabled.service.getRecentAssignedIssues(disabled.ref, signal()),
				error => error instanceof Error && error.message.includes('GraphQL is unavailable'),
			);
			assert.strictEqual(server.requests.length, 0);

			server.enqueue(gitHubGraphQLStep({
				queryIncludes: 'AgentHostRecentAssignedIssues',
				response: gitHubGraphQLResponse(undefined, [{ message: 'Unknown field', extensions: { code: 'undefinedField' } }]),
			}));
			const enabled = setup(server);
			await assert.rejects(
				() => enabled.service.getRecentAssignedIssues(enabled.ref, signal()),
				error => error instanceof Error && error.message.includes('Unknown field'),
			);
			await assert.rejects(
				() => enabled.service.getRecentAssignedIssues(enabled.ref, signal()),
				error => error instanceof Error && error.message.includes('unsupported'),
			);

			assert.strictEqual(server.requests.length, 1);
			server.assertSatisfied();
		});
	});

	test('retries transient capability and untyped GraphQL failures', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostRecentAssignedIssues',
					response: gitHubGraphQLResponse(undefined, [{ message: 'Something went wrong while executing your query' }]),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostRecentAssignedIssues',
					response: gitHubGraphQLResponse({ search: { nodes: [] } }),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostRecentAssignedIssues',
					response: gitHubGraphQLResponse({ search: { nodes: [] } }),
				}),
			);
			const transientQuery = setup(server);
			await assert.rejects(
				() => transientQuery.service.getRecentAssignedIssues(transientQuery.ref, signal()),
				error => error instanceof Error && error.message.includes('Something went wrong'),
			);
			assert.deepStrictEqual(await transientQuery.service.getRecentAssignedIssues(transientQuery.ref, signal()), []);

			const transientCapabilities = setup(server, new SequencedCapabilitiesService([
				{ ...availableCapabilities, graphql: false },
				availableCapabilities,
			]));
			await assert.rejects(
				() => transientCapabilities.service.getRecentAssignedIssues(transientCapabilities.ref, signal()),
				error => error instanceof Error && error.message.includes('GraphQL is unavailable'),
			);
			assert.deepStrictEqual(await transientCapabilities.service.getRecentAssignedIssues(transientCapabilities.ref, signal()), []);

			assert.strictEqual(server.requests.length, 3);
			server.assertSatisfied();
		});
	});

	test('spaces out retries the longer an entity keeps failing', async () => {
		await withServer(async server => {
			const { clock, ref, service } = setup(server);
			server.enqueue(...Array.from({ length: 3 }, () => gitHubRestStep({
				method: 'GET',
				path: '/repos/octo/repo',
				response: gitHubJsonResponse({ message: 'Not Found' }, { status: 404 }),
			})));
			const subscription = service.subscribeRepository(ref, { priority: 'visible' });

			await assert.rejects(() => subscription.refresh());
			const firstRetryAt = clock.nextDueTime;
			clock.advanceTo(firstRetryAt!);
			await assert.rejects(() => subscription.refresh());
			const secondRetryAt = clock.nextDueTime;
			clock.advanceTo(secondRetryAt!);
			await assert.rejects(() => subscription.refresh());

			// The visible cadence is 10ms, so a failure must never be retried at it.
			assert.deepStrictEqual({
				firstRetryAt,
				secondRetryAt,
				thirdRetryAt: clock.nextDueTime,
				requestCount: server.requests.length,
			}, {
				firstRetryAt: 30,
				secondRetryAt: 90,
				thirdRetryAt: 210,
				requestCount: 3,
			});
			subscription.dispose();
			server.assertSatisfied();
		});
	});

	test('jitters a failure retry that the poll cadence, not the backoff, decides', async () => {
		await withServer(async server => {
			// A background entity polls far slower than the first backoff steps,
			// so the cadence wins. It still has to be spread: credential
			// invalidation and rate-limit releases fail whole batches at the very
			// same instant, and an unjittered retry keeps them phase-locked.
			const jittered = disposables.add(new FakeGitHubScheduler({ now: 0, jitterValues: [7] }));
			const credentials = disposables.add(new TestCredentialService({ host: new URL(server.apiBaseUrl).host, accountId: '101' }));
			const transport = disposables.add(new GitHubTransport(nodeFetch));
			const service = disposables.add(new GitHubQueryService(
				jittered,
				{ ...policy, failureBackoff: { ...policy.failureBackoff, jitter: 10 } },
				credentials,
				transport,
				server.createEndpointService(),
				new TestCapabilitiesService(),
				new NullLogService(),
			));
			server.enqueue(gitHubRestStep({
				method: 'GET',
				path: '/repos/octo/repo',
				response: gitHubJsonResponse({ message: 'Not Found' }, { status: 404 }),
			}));
			const subscription = service.subscribeRepository({ host: new URL(server.apiBaseUrl).host, accountId: '101', owner: 'octo', repo: 'repo' }, { priority: 'background' });

			await assert.rejects(() => subscription.refresh());

			// The background cadence is 100ms and the first backoff step is 30ms.
			assert.strictEqual(jittered.nextDueTime, 107);
			subscription.dispose();
			server.assertSatisfied();
		});
	});
});

function signal(): AbortSignal {
	return new AbortController().signal;
}

function repositoryResponse(nameWithOwner: string): object {
	const [owner, name] = nameWithOwner.split('/');
	return {
		node_id: 'R1',
		owner: { id: 1, login: owner },
		name,
		full_name: nameWithOwner,
		default_branch: 'main',
		private: true,
		description: 'repo',
		html_url: `https://example.test/${nameWithOwner}`,
		archived: false,
		fork: false,
	};
}

function issueResponse(state: 'open' | 'closed'): object {
	return {
		node_id: 'I7',
		number: 7,
		title: 'Issue',
		body: 'Body',
		html_url: 'https://example.test/issues/7',
		state,
		state_reason: state === 'closed' ? 'completed' : null,
		user: { id: 2, login: 'author' },
		assignees: [{ id: 3, login: 'assignee' }],
		labels: [{ name: 'bug' }],
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-02T00:00:00Z',
		closed_at: state === 'closed' ? '2026-01-03T00:00:00Z' : null,
	};
}

function comparisonCommit(sha: string): object {
	return {
		sha,
		html_url: `https://example.test/commit/${sha}`,
		author: { id: 1, login: 'author' },
		commit: { message: sha, committer: { date: '2026-01-01T00:00:00Z' } },
	};
}

function changedFile(filename: string): object {
	return {
		filename,
		status: 'modified',
		additions: 1,
		deletions: 2,
		changes: 3,
		patch: '@@ patch',
	};
}

function compareResponse(commits: readonly object[], files: readonly object[], totalCommits: number): object {
	return {
		base_commit: { sha: 'base-sha' },
		merge_base_commit: { sha: 'merge-base-sha' },
		status: 'ahead',
		ahead_by: totalCommits,
		behind_by: 0,
		total_commits: totalCommits,
		commits,
		files,
	};
}

function pullRequestNode(number: number): object {
	return {
		number,
		title: `PR ${number}`,
		author: { databaseId: number, login: `author-${number}` },
		headRefName: `feature-${number}`,
		isDraft: false,
		updatedAt: '2026-01-01T00:00:00Z',
		additions: number,
		deletions: number + 1,
	};
}

function pullRequestSummary(number: number, reviewRequested: boolean, assigned: boolean): object {
	return {
		number,
		title: `PR ${number}`,
		author: { id: String(number), login: `author-${number}` },
		headRef: `feature-${number}`,
		checkoutRef: `refs/pull/${number}/head`,
		draft: false,
		updatedAt: '2026-01-01T00:00:00Z',
		additions: number,
		deletions: number + 1,
		reviewRequestedFromViewer: reviewRequested,
		assignedToViewer: assigned,
	};
}
