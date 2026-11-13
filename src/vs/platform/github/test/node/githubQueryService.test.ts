/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { hasKey } from '../../../../base/common/types.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { waitForState } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { GitHubRepositoryRef } from '../../common/githubQueryService.js';
import { GitHubHostCapabilities } from '../../common/githubTypes.js';
import { GitHubCredential, GitHubCredentialInvalidation, IGitHubCredentials } from '../../common/githubCredentialService.js';
import { IGitHubCapabilities } from '../../common/githubHostCapabilitiesService.js';
import { GitHubEntityPollingPolicy, GitHubQueryService } from '../../common/githubQueryServiceImpl.js';
import { GitHubTransport } from '../../common/githubTransport.js';
import { FakeScheduler } from './fakeScheduler.js';
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
	reviewThreads: true,
	checkContextRequiredness: true,
};

class TestCapabilitiesService implements IGitHubCapabilities {

	constructor(readonly value: GitHubHostCapabilities = availableCapabilities) { }

	getCapabilities(): Promise<GitHubHostCapabilities> {
		return Promise.resolve(this.value);
	}

}

class SequencedCapabilitiesService implements IGitHubCapabilities {
	private _index = 0;

	constructor(private readonly _values: readonly GitHubHostCapabilities[]) { }

	getCapabilities(): Promise<GitHubHostCapabilities> {
		return Promise.resolve(this._values[Math.min(this._index++, this._values.length - 1)]);
	}

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
		readonly clock: FakeScheduler;
		readonly credentials: TestCredentialService;
		readonly service: GitHubQueryService;
	} {
		const account = { host: new URL(server.apiBaseUrl).host, accountId: '101' };
		const ref = { ...account, owner: 'octo', repo: 'repo' };
		const clock = new FakeScheduler({ now: 0 });
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
			nameWithOwner: 'octo/repo',
			primaryLanguage: { name: 'TypeScript' },
			stargazerCount: 42,
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

	test('requests only the repository fields needed for canonicalization and link presentation', async () => {
		await withServer(async server => {
			server.enqueue(gitHubGraphQLStep({
				assert: request => assert.strictEqual(request.graphQl?.query?.replace(/\s+/g, ' ').trim(),
					'query HydrateGitHubResources($owner0: String!, $repo0: String!) { r0: repository(owner: $owner0, name: $repo0) { nameWithOwner primaryLanguage { name } stargazerCount } rateLimit { limit remaining used resetAt } }'),
				response: gitHubGraphQLResponse({ r0: graphQLRepository() }),
			}));
			const { ref, service } = setup(server);
			const subscription = disposables.add(service.subscribeRepository(ref, { priority: 'visible' }));
			await service.hydrateResources([{ kind: 'repository', ref }], signal());
			assert.deepStrictEqual(subscription.resource.state.get().value, {
				nameWithOwner: 'octo/repo', language: 'TypeScript', stars: 42,
			});
			server.assertSatisfied();
		});
	});

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
					nameWithOwner: 'octo/repo',
					language: 'TypeScript',
					stars: 42,
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

	test('selects issue author IDs through the Node interface', async () => {
		await withServer(async server => {
			let query: string | undefined;
			server.enqueue(gitHubGraphQLStep({
				assert: request => { query = request.graphQl?.query; },
				response: gitHubGraphQLResponse({
					r0: { issue: { ...graphQLIssue(), author: { id: 'U2', login: 'author' } } },
				}),
			}));
			const { ref, service } = setup(server);
			const issueRef = { ...ref, number: 7 };
			const subscription = disposables.add(service.subscribeIssue(issueRef, { priority: 'visible' }));
			await service.hydrateResources([{ kind: 'issue', ref: issueRef }], signal());
			assert.deepStrictEqual({
				authorIdOnNode: query?.replace(/\s+/g, ' ').includes('author { login ... on Node { id } }'),
				author: subscription.resource.state.get().value?.author,
			}, {
				authorIdOnNode: true,
				author: { id: 'U2', login: 'author' },
			});
			server.assertSatisfied();
		});
	});

	for (const failure of ['batch', 'entry'] as const) {
		test(`recovers an observed repository after ${failure}-level hydration failure`, async () => {
			await withServer(async server => {
				server.enqueue(
					gitHubGraphQLStep({
						queryIncludes: 'HydrateGitHubResources',
						response: failure === 'batch'
							? gitHubGraphQLResponse(undefined, [{ message: 'denied', type: 'FORBIDDEN' }])
							: gitHubGraphQLResponse({ r0: {} }),
					}),
					gitHubRestStep({ method: 'GET', path: '/repos/octo/repo', response: gitHubJsonResponse(repositoryResponse('octo/repo')) }),
				);
				const { ref, clock, service } = setup(server);
				const repository = disposables.add(service.subscribeRepository(ref, { priority: 'visible' }));
				const hydration = service.hydrateResources([{ kind: 'repository', ref }], signal());
				if (failure === 'batch') {
					await assert.rejects(hydration, { kind: 'authorization' });
				} else {
					await hydration;
				}
				const failed = repository.resource.state.get();
				const retryAt = clock.nextDueTime;
				clock.flushDue();
				await waitForState(repository.resource.state, state => state.status === 'ready', state => state.error);
				assert.deepStrictEqual({
					status: failed.status, complete: failed.complete, error: failed.error?.kind, retryAt,
					recovered: repository.resource.state.get().value?.nameWithOwner,
					requests: server.requests.map(request => request.graphQl ? 'graphql' : request.servicePath),
				}, {
					status: 'error', complete: false, error: failure === 'batch' ? 'authorization' : 'malformedResponse', retryAt: 0,
					recovered: 'octo/repo', requests: ['graphql', '/repos/octo/repo'],
				});
				server.assertSatisfied();
			});
		});
	}

	test('marks missing repository and issue hydration results incomplete without polling them', async () => {
		await withServer(async server => {
			server.enqueue(gitHubGraphQLStep({
				queryIncludes: 'HydrateGitHubResources',
				response: gitHubGraphQLResponse({ r0: null, r1: { issue: null } }),
			}));
			const { ref, clock, service } = setup(server);
			const issueRef = { ...ref, number: 7 };
			const repository = disposables.add(service.subscribeRepository(ref, { priority: 'visible' }));
			const issue = disposables.add(service.subscribeIssue(issueRef, { priority: 'visible' }));
			await service.hydrateResources([{ kind: 'repository', ref }, { kind: 'issue', ref: issueRef }], signal());
			assert.deepStrictEqual({
				states: [repository.resource.state.get(), issue.resource.state.get()].map(state => ({
					status: state.status, complete: state.complete, error: state.error?.kind, value: state.value,
				})),
				issueRef: issue.resource.ref,
				timers: clock.pendingCount,
				requests: server.requests.length,
			}, {
				states: [
					{ status: 'error', complete: false, error: 'notFound', value: undefined },
					{ status: 'error', complete: false, error: 'notFound', value: undefined },
				],
				issueRef, timers: 0, requests: 1,
			});
			server.assertSatisfied();
		});
	});

	test('updates entity polling cadence and rejects updates after disposal', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubRestStep({ method: 'GET', path: '/repos/octo/repo/issues/7', response: gitHubJsonResponse(issueResponse('open')) }),
				gitHubRestStep({ method: 'GET', path: '/repos/octo/repo/issues/7', response: gitHubJsonResponse(issueResponse('open')) }),
			);
			const { ref, clock, service } = setup(server);
			const issue = disposables.add(service.subscribeIssue({ ...ref, number: 7 }, { priority: 'background' }));
			await issue.refresh();
			const dueTimes = [clock.nextDueTime];
			issue.update({ priority: 'visible' });
			dueTimes.push(clock.nextDueTime);
			clock.advanceBy(10);
			await issue.refresh();
			dueTimes.push(clock.nextDueTime);
			issue.update({ priority: 'background' });
			dueTimes.push(clock.nextDueTime);
			clock.advanceBy(10);
			issue.dispose();
			assert.throws(() => issue.update({ priority: 'visible' }), /disposed/);
			clock.advanceBy(20);
			assert.deepStrictEqual({ dueTimes, requests: server.requests.length, timers: clock.pendingCount }, {
				dueTimes: [100, 10, 20, 110], requests: 2, timers: 0,
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
					response: gitHubGraphQLResponse({ r0: { issue: graphQLIssue() } }),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/issues/7',
					assert: async () => refreshStarted.complete(),
					waitFor: releaseRefresh.p,
					response: gitHubJsonResponse({ ...issueResponse('open'), title: 'REST issue' }),
				}),
			);
			const { account, service } = setup(server);
			const ref = { ...account, owner: 'octo', repo: 'repo', number: 7 };
			const issue = disposables.add(service.subscribeIssue(ref, { priority: 'visible' }));
			const hydration = service.hydrateResources([{ kind: 'issue', ref }], signal());
			await hydrationStarted.p;

			const refresh = issue.refresh();
			await releaseHydration.complete();
			await hydration;
			await refreshStarted.p;
			assert.strictEqual(issue.resource.state.get().status, 'loading');
			await releaseRefresh.complete();
			await refresh;

			assert.strictEqual(issue.resource.state.get().value?.title, 'REST issue');
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
			assert.strictEqual(repositoryA.resource, repositoryB.resource);
			clock.flushDue();
			await waitForState(repositoryA.resource.state, state => state.status === 'ready', state => state.error);

			// The server answers requests in arrival order, so poll the issue only once the repository has loaded.
			const issueA = service.subscribeIssue({ ...account, owner: 'octo', repo: 'repo', number: 7 }, { priority: 'visible' });
			const issueB = service.subscribeIssue({ ...account, owner: 'OCTO', repo: 'REPO', number: 7 }, { priority: 'background' });
			assert.strictEqual(issueA.resource, issueB.resource);
			clock.flushDue();
			await issueA.refresh();
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
						nameWithOwner: 'new-owner/new-repo',
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

	test('loads and shares immutable commit resources without polling', async () => {
		await withServer(async server => {
			server.enqueue(gitHubRestStep({
				method: 'GET',
				path: '/repos/octo/repo/commits/abc123',
				response: gitHubJsonResponse({
					sha: 'abc123',
					html_url: 'https://example.test/octo/repo/commit/abc123',
					author: { id: 2, login: 'author' },
					commit: {
						message: 'Commit subject\n\nCommit body',
						author: { name: 'Author Name', date: '2026-09-22T12:00:00Z' },
					},
				}, { etag: '"commit"' }),
			}));
			const { account, clock, service } = setup(server);
			const commitA = service.subscribeCommit({ ...account, owner: 'octo', repo: 'repo', sha: 'abc123' }, { priority: 'visible' });
			const commitB = service.subscribeCommit({ ...account, owner: 'OCTO', repo: 'REPO', sha: 'ABC123' }, { priority: 'background' });

			assert.strictEqual(commitA.resource, commitB.resource);
			await commitA.refresh();
			clock.advanceBy(1_000);

			assert.deepStrictEqual(commitA.resource.state.get().value, {
				sha: 'abc123',
				message: 'Commit subject\n\nCommit body',
				url: 'https://example.test/octo/repo/commit/abc123',
				author: { id: '2', login: 'author' },
				committedAt: '2026-09-22T12:00:00Z',
			});
			assert.deepStrictEqual(server.requests.map(request => request.servicePath), ['/repos/octo/repo/commits/abc123']);
			commitA.dispose();
			commitB.dispose();
			server.assertSatisfied();
		});
	});

	test('retains dormant entity identity briefly and purges resources on account change', async () => {
		await withServer(async server => {
			const resumedPoll = new DeferredPromise<void>();
			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/issues/7',
					response: gitHubJsonResponse(issueResponse('open')),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/issues/7',
					assert: async () => resumedPoll.complete(),
					response: gitHubJsonResponse(issueResponse('open')),
				}),
			);
			const { credentials, clock, ref, service } = setup(server);
			const issueRef = { ...ref, number: 7 };
			const first = service.subscribeIssue(issueRef, { priority: 'background' });
			await first.refresh();
			const resource = first.resource;
			first.dispose();

			clock.advanceBy(19);
			const resumed = service.subscribeIssue(issueRef, { priority: 'background' });
			assert.strictEqual(resumed.resource, resource);
			clock.advanceBy(100);
			await resumedPoll.p;
			credentials.invalidate();
			await assert.rejects(() => resumed.refresh(), /disposed/);
			const replaced = service.subscribeIssue(issueRef, { priority: 'background' });
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
					path: '/repos/octo/repo/issues/7',
					assert: async () => firstStarted.complete(),
					waitFor: releaseFirst.p,
					response: gitHubJsonResponse(issueResponse('open')),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/issues/7',
					assert: async () => resumedStarted.complete(),
					response: gitHubJsonResponse(issueResponse('open')),
				}),
			);
			const { clock, ref, service } = setup(server);
			const issueRef = { ...ref, number: 7 };
			const first = service.subscribeIssue(issueRef, { priority: 'background' });
			const firstRefresh = first.refresh();
			await firstStarted.p;
			first.dispose();
			await assert.rejects(() => firstRefresh);

			const resumed = service.subscribeIssue(issueRef, { priority: 'background' });
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

	test('fails closed without GraphQL and memoizes schema-invalid query variants', async () => {
		await withServer(async server => {
			const unavailable: GitHubHostCapabilities = {
				graphql: false,
				mergeQueue: false,
				reviewThreads: false,
				checkContextRequiredness: false,
			};
			const disabled = setup(server, unavailable);
			await assert.rejects(
				() => disabled.service.hydrateResources([{ kind: 'repository', ref: disabled.ref }], signal()),
				error => error instanceof Error && error.message.includes('GraphQL is unavailable'),
			);
			assert.strictEqual(server.requests.length, 0);

			server.enqueue(gitHubGraphQLStep({
				queryIncludes: 'HydrateGitHubResources',
				response: gitHubGraphQLResponse(undefined, [{ message: 'Unknown field', extensions: { code: 'undefinedField' } }]),
			}));
			const enabled = setup(server);
			await assert.rejects(
				() => enabled.service.hydrateResources([{ kind: 'repository', ref: enabled.ref }], signal()),
				error => error instanceof Error && error.message.includes('Unknown field'),
			);
			await assert.rejects(
				() => enabled.service.hydrateResources([{ kind: 'repository', ref: enabled.ref }], signal()),
				error => error instanceof Error && error.message.includes('unsupported'),
			);

			assert.strictEqual(server.requests.length, 1);
			server.assertSatisfied();
		});
	});

	for (const type of ['RATE_LIMIT', 'RATE_LIMITED']) {
		test(`surfaces GraphQL ${type} without accepting partial query data`, async () => {
			await withServer(async server => {
				const errors = [{ type, message: 'Query rate limited' }];
				server.enqueue(gitHubGraphQLStep({
					queryIncludes: 'HydrateGitHubResources',
					response: gitHubGraphQLResponse({ r0: graphQLRepository() }, errors),
				}));
				const { service, ref } = setup(server);

				await assert.rejects(() => service.hydrateResources([{ kind: 'repository', ref }], signal()), {
					name: 'GitHubRequestError', kind: 'rateLimit', statusCode: 200, graphQLErrors: errors,
				});
				server.assertSatisfied();
			});
		});
	}

	test('retries transient capability and untyped GraphQL failures', async () => {
		await withServer(async server => {
			server.enqueue(
				gitHubGraphQLStep({
					queryIncludes: 'HydrateGitHubResources',
					response: gitHubGraphQLResponse(undefined, [{ message: 'Something went wrong while executing your query' }]),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'HydrateGitHubResources',
					response: gitHubGraphQLResponse({ r0: graphQLRepository() }),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'HydrateGitHubResources',
					response: gitHubGraphQLResponse({ r0: graphQLRepository() }),
				}),
			);
			const transientQuery = setup(server);
			const queryRepository = disposables.add(transientQuery.service.subscribeRepository(transientQuery.ref, { priority: 'background' }));
			await assert.rejects(
				() => transientQuery.service.hydrateResources([{ kind: 'repository', ref: transientQuery.ref }], signal()),
				error => error instanceof Error && error.message.includes('Something went wrong'),
			);
			await transientQuery.service.hydrateResources([{ kind: 'repository', ref: transientQuery.ref }], signal());

			const transientCapabilities = setup(server, new SequencedCapabilitiesService([
				{ ...availableCapabilities, graphql: false },
				availableCapabilities,
			]));
			const capabilitiesRepository = disposables.add(transientCapabilities.service.subscribeRepository(transientCapabilities.ref, { priority: 'background' }));
			await assert.rejects(
				() => transientCapabilities.service.hydrateResources([{ kind: 'repository', ref: transientCapabilities.ref }], signal()),
				error => error instanceof Error && error.message.includes('GraphQL is unavailable'),
			);
			await transientCapabilities.service.hydrateResources([{ kind: 'repository', ref: transientCapabilities.ref }], signal());

			assert.deepStrictEqual({
				queryRepository: queryRepository.resource.state.get().value?.nameWithOwner,
				capabilitiesRepository: capabilitiesRepository.resource.state.get().value?.nameWithOwner,
				requests: server.requests.length,
			}, { queryRepository: 'octo/repo', capabilitiesRepository: 'octo/repo', requests: 3 });
			server.assertSatisfied();
		});
	});

	test('spaces out retries the longer an entity keeps failing', async () => {
		await withServer(async server => {
			const { clock, ref, service } = setup(server);
			server.enqueue(...Array.from({ length: 3 }, () => gitHubRestStep({
				method: 'GET',
				path: '/repos/octo/repo/issues/7',
				response: gitHubJsonResponse({ message: 'Not Found' }, { status: 404 }),
			})));
			const subscription = service.subscribeIssue({ ...ref, number: 7 }, { priority: 'visible' });

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
			const jittered = disposables.add(new FakeScheduler({ now: 0, jitterValues: [7] }));
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
				path: '/repos/octo/repo/issues/7',
				response: gitHubJsonResponse({ message: 'Not Found' }, { status: 404 }),
			}));
			const subscription = service.subscribeIssue({ host: new URL(server.apiBaseUrl).host, accountId: '101', owner: 'octo', repo: 'repo', number: 7 }, { priority: 'background' });

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
	return { full_name: nameWithOwner };
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
