/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	PullRequestFragment,
	PullRequestRef,
	PullRequestResource,
	PullRequestSnapshot,
	PullRequestSubscription,
	PullRequestSubscriptionOptions,
} from '../../common/githubPullRequestService.js';
import { GitHubCredential, GitHubCredentialInvalidation, IGitHubCredentials } from '../../common/githubCredentialService.js';
import { GitHubTransport } from '../../common/githubTransport.js';
import { PullRequestMutationService } from '../../common/pullRequestMutationService.js';
import { IPullRequestResources } from '../../common/pullRequestResourceService.js';
import { FakeGitHubScheduler } from './fakeGitHubScheduler.js';
import { nodeFetch } from './nodeFetch.js';
import {
	gitHubDisconnectResponse,
	gitHubGraphQLResponse,
	gitHubGraphQLStep,
	gitHubJsonResponse,
	gitHubRawResponse,
	gitHubRedirectResponse,
	gitHubRestStep,
	ProgrammableGitHubServer,
} from './programmableGitHubServer.js';

const operationMarker = '<!-- vscode-agent-host-operation:operation-1 -->';

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

	dispose(): void {
		this._controller.abort(new Error('disposed'));
		this._onDidInvalidate.dispose();
	}
}

class TestResourceService implements IPullRequestResources {

	readonly invalidations: { readonly fragments: readonly PullRequestFragment[] }[] = [];
	readonly snapshot;
	readonly resource: PullRequestResource;
	refreshHandler: ((fragment: PullRequestFragment | undefined) => void | Promise<void>) | undefined;

	constructor(ref: PullRequestRef, initial: PullRequestSnapshot) {
		this.snapshot = observableValue(this, initial);
		this.resource = { ref, snapshot: this.snapshot };
	}

	subscribePullRequest(_ref: PullRequestRef, _options: PullRequestSubscriptionOptions): PullRequestSubscription {
		let disposed = false;
		return {
			resource: this.resource,
			update: () => { },
			refresh: async (fragment?: PullRequestFragment, token: CancellationToken = CancellationToken.None) => {
				if (disposed) {
					throw new Error('subscription disposed');
				}
				if (token.isCancellationRequested) {
					throw new Error('cancelled');
				}
				await raceCancellationError(Promise.resolve(this.refreshHandler?.(fragment)), token);
			},
			dispose: () => {
				disposed = true;
			},
		};
	}

	invalidatePullRequest(_ref: PullRequestRef, fragments: readonly PullRequestFragment[]): void {
		this.invalidations.push({ fragments });
	}

	clear(): void { }

	setSnapshot(snapshot: PullRequestSnapshot): void {
		this.snapshot.set(snapshot, undefined);
	}
}

suite('PullRequestMutationService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function withServers(
		fn: (api: ProgrammableGitHubServer, download: ProgrammableGitHubServer) => Promise<void>,
	): Promise<void> {
		const api = await ProgrammableGitHubServer.start();
		const download = await ProgrammableGitHubServer.start();
		try {
			await fn(api, download);
		} finally {
			await api.disposeAsync();
			await download.disposeAsync();
		}
	}

	function setup(server: ProgrammableGitHubServer, snapshot = completeSnapshot(server), scheduler?: FakeGitHubScheduler): {
		readonly ref: PullRequestRef;
		readonly resources: TestResourceService;
		readonly service: PullRequestMutationService;
	} {
		const account = { host: new URL(server.apiBaseUrl).host, accountId: '101' };
		const ref = { ...account, owner: 'octo', repo: 'repo', number: 7 };
		const credentials = disposables.add(new TestCredentialService(account));
		const transport = disposables.add(new GitHubTransport(nodeFetch, undefined, true));
		const resources = new TestResourceService(ref, { ...snapshot, ref });
		const service = disposables.add(new PullRequestMutationService(scheduler, credentials, transport, resources, server.createEndpointService()));
		return { ref, resources, service };
	}

	test('reconciles an ambiguous top-level comment without duplicating it', async () => {
		await withServers(async server => {
			server.enqueue(gitHubRestStep({
				method: 'POST',
				path: '/repos/octo/repo/issues/7/comments',
				assert: request => assert.deepStrictEqual(request.bodyJson, { body: `hello\n\n${operationMarker}` }),
				response: gitHubDisconnectResponse(),
			}));
			const { ref, resources, service } = setup(server);
			resources.refreshHandler = fragment => {
				assert.strictEqual(fragment, 'topLevelComments');
				const snapshot = resources.snapshot.get();
				resources.setSnapshot({
					...snapshot,
					topLevelComments: {
						status: 'ready',
						complete: true,
						value: [{ id: '1', body: `hello\n\n${operationMarker}` }],
					},
				});

			};

			const result = await service.addComment(ref, { operationId: 'operation-1', body: 'hello' }, signal());

			assert.deepStrictEqual({
				result,
				requestCount: server.requests.length,
			}, {
				result: {
					outcome: 'reconciled',
					value: { id: '1', body: `hello\n\n${operationMarker}` },
				},
				requestCount: 1,
			});
			server.assertSatisfied();
		});
	});

	test('creates pull requests and enables auto-merge through typed operations', async () => {
		await withServers(async server => {
			server.enqueue(
				gitHubRestStep({
					method: 'POST',
					path: '/repos/octo/repo/pulls',
					assert: request => assert.deepStrictEqual(request.bodyJson, {
						title: 'PR',
						body: 'Body',
						head: 'feature',
						base: 'main',
						draft: true,
					}),
					response: gitHubJsonResponse({
						number: 8,
						node_id: 'PR8',
						html_url: 'https://example.test/pull/8',
						created_at: '2026-01-01T00:00:00Z',
					}),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostEnablePullRequestAutoMerge',
					assert: request => assert.deepStrictEqual(request.graphQl?.variables, {
						pullRequestId: 'PR8',
						mergeMethod: 'SQUASH',
					}),
					response: gitHubGraphQLResponse({
						enablePullRequestAutoMerge: { pullRequest: { id: 'PR8' } },
					}),
				}),
			);
			const { ref, service } = setup(server);

			const created = await service.createPullRequest(ref, {
				title: 'PR',
				body: 'Body',
				head: 'feature',
				base: 'main',
				draft: true,
			}, signal());
			await service.enableAutoMerge(ref, { pullRequestId: 'PR8', method: 'SQUASH' }, signal());

			assert.deepStrictEqual(created, {
				ref: { ...ref, number: 8 },
				id: 'PR8',
				url: 'https://example.test/pull/8',
				createdAt: '2026-01-01T00:00:00Z',
			});
			server.assertSatisfied();
		});
	});

	test('retries only after a complete refresh proves a comment marker absent', async () => {
		await withServers(async server => {
			server.enqueue(
				gitHubRestStep({
					method: 'POST',
					path: '/repos/octo/repo/issues/7/comments',
					response: gitHubDisconnectResponse(),
				}),
				gitHubRestStep({
					method: 'POST',
					path: '/repos/octo/repo/issues/7/comments',
					response: gitHubJsonResponse({ id: 2, body: `hello\n\n${operationMarker}` }),
				}),
			);
			const { ref, resources, service } = setup(server);
			resources.refreshHandler = () => {
				const snapshot = resources.snapshot.get();
				resources.setSnapshot({
					...snapshot,
					topLevelComments: { status: 'ready', complete: true, value: [] },
				});
			};

			const result = await service.addComment(ref, { operationId: 'operation-1', body: 'hello' }, signal());

			assert.deepStrictEqual({ result, requestCount: server.requests.length }, {
				result: {
					outcome: 'succeeded',
					value: {
						id: '2',
						nodeId: undefined,
						body: `hello\n\n${operationMarker}`,
						url: undefined,
						createdAt: undefined,
						updatedAt: undefined,
						author: undefined,
					},
				},
				requestCount: 2,
			});
			server.assertSatisfied();
		});
	});

	test('returns indeterminate when comment reconciliation remains incomplete', async () => {
		await withServers(async server => {
			server.enqueue(gitHubRestStep({
				method: 'POST',
				path: '/repos/octo/repo/issues/7/comments',
				response: gitHubDisconnectResponse(),
			}));
			const { ref, resources, service } = setup(server);
			resources.refreshHandler = () => {
				const snapshot = resources.snapshot.get();
				resources.setSnapshot({
					...snapshot,
					topLevelComments: { status: 'ready', complete: false, value: [] },
				});
			};

			const result = await service.addComment(ref, { operationId: 'operation-1', body: 'hello' }, signal());

			assert.deepStrictEqual({ result, requestCount: server.requests.length }, {
				result: { outcome: 'indeterminate' },
				requestCount: 1,
			});
			server.assertSatisfied();
		});
	});

	test('never resolves a review thread when the reply fails', async () => {
		await withServers(async server => {
			server.enqueue(gitHubGraphQLStep({
				queryIncludes: 'AgentHostAddPullRequestReviewThreadReply',
				response: gitHubGraphQLResponse(undefined, [{ message: 'reply rejected', type: 'FORBIDDEN' }]),
			}));
			const { ref, service } = setup(server);

			await assert.rejects(
				() => service.replyAndResolveThread(ref, {
					operationId: 'operation-1',
					threadId: 'T1',
					body: 'reply',
					resolve: true,
				}, signal()),
				/reply rejected/,
			);

			assert.strictEqual(server.requests.length, 1);
			server.assertSatisfied();
		});
	});

	test('resolves only after an ambiguous reply is reconciled as successful', async () => {
		await withServers(async server => {
			server.enqueue(
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostAddPullRequestReviewThreadReply',
					response: gitHubDisconnectResponse(),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostResolvePullRequestReviewThread',
					response: gitHubGraphQLResponse({
						resolveReviewThread: { thread: { id: 'T1', isResolved: true } },
					}),
				}),
			);
			const { ref, resources, service } = setup(server);
			resources.refreshHandler = () => {
				const snapshot = resources.snapshot.get();
				resources.setSnapshot({
					...snapshot,
					reviewThreads: {
						status: 'ready',
						complete: true,
						headSha: 'head-1',
						value: [{
							id: 'T1',
							isResolved: false,
							comments: [{ id: '2', body: `reply\n\n${operationMarker}` }],
						}],
					},
				});
			};

			const result = await service.replyAndResolveThread(ref, {
				operationId: 'operation-1',
				threadId: 'T1',
				body: 'reply',
				resolve: true,
			}, signal());

			assert.deepStrictEqual({
				result,
				operations: server.requests.map(request => ({
					reply: request.graphQl?.query?.includes('AgentHostAddPullRequestReviewThreadReply'),
					resolve: request.graphQl?.query?.includes('AgentHostResolvePullRequestReviewThread'),
				})),
				invalidations: resources.invalidations,
			}, {
				result: {
					reply: { outcome: 'reconciled', value: { id: '2', body: `reply\n\n${operationMarker}` } },
					resolved: true,
				},
				operations: [
					{ reply: true, resolve: false },
					{ reply: false, resolve: true },
				],
				invalidations: [
					{ fragments: ['inlineComments'] },
					{ fragments: ['reviewThreads'] },
				],
			});
			server.assertSatisfied();
		});
	});

	test('leaves a review thread open when resolution fails', async () => {
		await withServers(async server => {
			server.enqueue(
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostAddPullRequestReviewThreadReply',
					response: gitHubGraphQLResponse({
						addPullRequestReviewThreadReply: {
							comment: { id: 'C2', databaseId: 2, body: `reply\n\n${operationMarker}` },
						},
					}),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostResolvePullRequestReviewThread',
					response: gitHubGraphQLResponse(undefined, [{ message: 'resolve rejected', type: 'FORBIDDEN' }]),
				}),
				gitHubGraphQLStep({
					queryIncludes: 'AgentHostResolvePullRequestReviewThread',
					response: gitHubGraphQLResponse({
						resolveReviewThread: { thread: { id: 'T1', isResolved: true } },
					}),
				}),
			);
			const snapshot = completeSnapshot(server);
			const { ref, resources, service } = setup(server, {
				...snapshot,
				reviewThreads: {
					status: 'ready',
					complete: true,
					headSha: 'head-1',
					value: [{ id: 'T1', isResolved: false, comments: [] }],
				},
			});

			const result = await service.replyAndResolveThread(ref, {
				operationId: 'operation-1',
				threadId: 'T1',
				body: 'reply',
				resolve: true,
			}, signal());

			assert.deepStrictEqual({
				result,
				threadOpen: resources.snapshot.get().reviewThreads.value?.[0].isResolved === false,
				invalidations: resources.invalidations,
			}, {
				result: {
					reply: {
						outcome: 'succeeded',
						value: {
							id: '2',
							nodeId: 'C2',
							body: `reply\n\n${operationMarker}`,
							url: undefined,
							createdAt: undefined,
							updatedAt: undefined,
							author: undefined,
						},
					},
					resolved: false,
					resolveError: {
						message: 'GitHub GraphQL mutation failed: resolve rejected',
						kind: 'authorization',
						statusCode: 200,
					},
				},
				threadOpen: true,
				invalidations: [{ fragments: ['reviewThreads', 'inlineComments'] }],
			});
			await service.resolveThread(ref, 'T1', signal());
			assert.deepStrictEqual(server.requests.map(request => request.graphQl?.query?.includes('AgentHostAddPullRequestReviewThreadReply')), [
				true,
				false,
				false,
			]);
			server.assertSatisfied();
		});
	});

	test('does not reconcile or retry deterministic GraphQL mutation errors', async () => {
		await withServers(async server => {
			server.enqueue(gitHubGraphQLStep({
				queryIncludes: 'AgentHostAddPullRequestReviewThreadReply',
				response: gitHubGraphQLResponse(undefined, [{ message: 'thread missing', type: 'NOT_FOUND' }]),
			}));
			const { ref, resources, service } = setup(server);
			let refreshCount = 0;
			resources.refreshHandler = () => {
				refreshCount++;
			};

			await assert.rejects(
				() => service.replyToThread(ref, {
					operationId: 'operation-1',
					threadId: 'T1',
					body: 'reply',
				}, signal()),
				error => error instanceof Error && error.message.includes('thread missing'),
			);

			assert.deepStrictEqual({ requestCount: server.requests.length, refreshCount }, {
				requestCount: 1,
				refreshCount: 0,
			});
			server.assertSatisfied();
		});
	});

	test('does not duplicate an unconfirmed workflow rerun', async () => {
		await withServers(async server => {
			server.enqueue(
				gitHubRestStep({
					method: 'POST',
					path: '/repos/octo/repo/actions/runs/10/rerun-failed-jobs',
					response: gitHubDisconnectResponse(),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/actions/runs/10',
					response: gitHubJsonResponse(workflowRun(10, 1, 'completed')),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/actions/runs/10',
					response: gitHubJsonResponse(workflowRun(10, 1, 'completed')),
				}),
				gitHubRestStep({
					method: 'POST',
					path: '/repos/octo/repo/actions/runs/10/rerun-failed-jobs',
					response: gitHubJsonResponse({}, { status: 201 }),
				}),
			);
			const { ref, service } = setup(server);
			const options = {
				operationId: 'operation-1',
				runId: '10',
				expectedRunAttempt: 1,
				failedJobsOnly: true,
			};

			const first = await service.rerunWorkflow(ref, options, signal());
			const second = await service.rerunWorkflow(ref, options, signal());

			assert.deepStrictEqual({
				first,
				second,
				methods: server.requests.map(request => request.method),
			}, {
				first: { outcome: 'indeterminate', value: workflowRunNormalized('10', 1, 'COMPLETED') },
				second: { outcome: 'succeeded' },
				methods: ['POST', 'GET', 'GET', 'POST'],
			});
			server.assertSatisfied();
		});
	});

	test('paginates workflow diagnostics and strips credentials from redacted log redirects', async () => {
		await withServers(async (server, download) => {
			server.enqueue(
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/actions/runs',
					query: { head_sha: 'head-1', per_page: 100 },
					response: gitHubJsonResponse({ workflow_runs: [workflowRun(10, 1, 'completed')] }, {
						link: `<${server.apiBaseUrl}/repos/octo/repo/actions/runs?head_sha=head-1&per_page=100&page=2>; rel="next"`,
					}),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/actions/runs',
					query: { head_sha: 'head-1', per_page: 100, page: 2 },
					response: gitHubJsonResponse({ workflow_runs: [workflowRun(11, 1, 'queued')] }),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/actions/runs/10/jobs',
					query: { per_page: 100 },
					response: gitHubJsonResponse({ jobs: [{ id: 20, name: 'test', status: 'completed', conclusion: 'failure', check_run_id: 30 }] }),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/check-runs/30/annotations',
					query: { per_page: 100 },
					response: gitHubJsonResponse([{ path: 'src/a.ts', start_line: 2, end_line: 3, annotation_level: 'failure', message: 'bad' }]),
				}),
				gitHubRestStep({
					method: 'GET',
					path: '/repos/octo/repo/actions/jobs/20/logs',
					response: gitHubRedirectResponse(`${download.apiBaseUrl}/signed/log`),
				}),
			);
			download.enqueue(gitHubRestStep({
				method: 'GET',
				path: '/signed/log',
				assert: request => assert.strictEqual(request.headers.authorization, undefined),
				response: gitHubRawResponse('::add-mask::supersecret\nsupersecret\ntoken=visible\nghp_1234567890123456'),
			}));
			const { ref, service } = setup(server);

			const runs = await service.listWorkflowRuns(ref, 'head-1', signal());
			const jobs = await service.listWorkflowJobs(ref, '10', signal());
			const annotations = await service.listCheckAnnotations(ref, '30', signal());
			const log = await service.downloadWorkflowJobLog(ref, '20', signal());

			assert.deepStrictEqual({
				runs: runs.map(run => ({ id: run.id, status: run.status })),
				jobs,
				annotations,
				log,
			}, {
				runs: [{ id: '10', status: 'COMPLETED' }, { id: '11', status: 'QUEUED' }],
				jobs: [{
					id: '20',
					runId: '10',
					name: 'test',
					status: 'COMPLETED',
					conclusion: 'FAILURE',
					checkRunId: '30',
					url: undefined,
					startedAt: undefined,
					completedAt: undefined,
				}],
				annotations: [{
					path: 'src/a.ts',
					startLine: 2,
					endLine: 3,
					level: 'failure',
					message: 'bad',
					title: undefined,
					rawDetails: undefined,
				}],
				log: {
					text: '::add-mask::***\n***\ntoken=***\n***',
					truncated: false,
				},
			});
			server.assertSatisfied();
			download.assertSatisfied();
		});
	});

	test('sends the expected head when updating a branch', async () => {
		await withServers(async server => {
			server.enqueue(gitHubRestStep({
				method: 'PUT',
				path: '/repos/octo/repo/pulls/7/update-branch',
				assert: request => assert.deepStrictEqual(request.bodyJson, { expected_head_sha: 'head-1' }),
				response: gitHubJsonResponse({ message: 'Updating pull request branch.' }, { status: 202 }),
			}));
			const { ref, resources, service } = setup(server);

			await service.updateBranch(ref, { expectedHeadSha: 'head-1' }, signal());

			assert.deepStrictEqual(resources.invalidations, [{ fragments: ['core', 'checks', 'mergeability'] }]);
			server.assertSatisfied();
		});
	});

	test('prepares and directly merges only with complete generation-anchored state', async () => {
		await withServers(async server => {
			server.enqueue(gitHubRestStep({
				method: 'PUT',
				path: '/repos/octo/repo/pulls/7/merge',
				assert: request => assert.deepStrictEqual(request.bodyJson, {
					sha: 'head-1',
					merge_method: 'squash',
				}),
				response: gitHubJsonResponse({ merged: true, sha: 'merge-sha', message: 'merged' }),
			}));
			const { ref, service } = setup(server);
			const preparation = await service.prepareMerge(ref, 'head-1', signal());

			const result = await service.merge(preparation, {
				method: 'SQUASH',
				authorization: { confirmed: true, authorizationId: 'approval-1' },
			}, signal());

			assert.deepStrictEqual(result, { outcome: 'succeeded', sha: 'merge-sha', message: 'merged' });
			server.assertSatisfied();
		});
	});

	test('rejects invalidated merge preparation before network access', async () => {
		await withServers(async server => {
			const { ref, resources, service } = setup(server);
			const preparation = await service.prepareMerge(ref, 'head-1', signal());
			resources.setSnapshot({ ...resources.snapshot.get(), headGeneration: preparation.headGeneration + 1 });

			await assert.rejects(
				() => service.merge(preparation, {
					method: 'SQUASH',
					authorization: { confirmed: true, authorizationId: 'approval-1' },
				}, signal()),
				/invalidated/,
			);
			assert.strictEqual(server.requests.length, 0);
		});
	});

	test('expires unused merge preparations without retaining a poller', async () => {
		await withServers(async server => {
			const scheduler = new FakeGitHubScheduler({ now: 0 });
			const { ref, service } = setup(server, completeSnapshot(server), scheduler);
			const preparation = await service.prepareMerge(ref, 'head-1', signal());
			scheduler.advanceBy(5 * 60_000);

			await assert.rejects(
				() => service.merge(preparation, {
					method: 'SQUASH',
					authorization: { confirmed: true, authorizationId: 'approval-1' },
				}, signal()),
				/invalid or has already been consumed/,
			);
			assert.strictEqual(server.requests.length, 0);
		});
	});

	test('cancels authoritative merge preparation refreshes', async () => {
		await withServers(async server => {
			const { ref, resources, service } = setup(server);
			const started = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			resources.refreshHandler = async () => {
				await started.complete();
				await release.p;
			};
			const controller = new AbortController();
			const preparation = service.prepareMerge(ref, 'head-1', controller.signal);
			await started.p;
			controller.abort(new Error('cancel preparation'));

			await assert.rejects(() => preparation, /cancel preparation/);
			await release.complete();
			assert.strictEqual(server.requests.length, 0);
		});
	});

	test('reconciles an ambiguous merge after core proves the pull request merged', async () => {
		await withServers(async server => {
			server.enqueue(gitHubRestStep({
				method: 'PUT',
				path: '/repos/octo/repo/pulls/7/merge',
				response: gitHubDisconnectResponse(),
			}));
			const { ref, resources, service } = setup(server);
			const preparation = await service.prepareMerge(ref, 'head-1', signal());
			resources.refreshHandler = fragment => {
				if (fragment === 'core') {
					const snapshot = resources.snapshot.get();
					resources.setSnapshot({
						...snapshot,
						core: { ...snapshot.core, value: { ...snapshot.core.value!, state: 'merged' } },
					});
				}
			};

			const result = await service.merge(preparation, {
				method: 'SQUASH',
				authorization: { confirmed: true, authorizationId: 'approval-1' },
			}, signal());

			assert.deepStrictEqual(result, { outcome: 'reconciled', message: 'Pull request was merged' });
			server.assertSatisfied();
		});
	});

	test('does not enqueue a pull request already in the merge queue', async () => {
		await withServers(async server => {
			const snapshot = completeSnapshot(server, true, 'MQE1');
			const { ref, service } = setup(server, snapshot);
			const preparation = await service.prepareMerge(ref, 'head-1', signal());

			const result = await service.enqueue(
				preparation,
				{ confirmed: true, authorizationId: 'approval-1' },
				signal(),
			);

			assert.deepStrictEqual(result, { outcome: 'alreadyQueued', mergeQueueEntryId: 'MQE1' });
			assert.strictEqual(server.requests.length, 0);
		});
	});

	test('enqueues with the pull request node ID and expected head OID', async () => {
		await withServers(async server => {
			server.enqueue(gitHubGraphQLStep({
				queryIncludes: 'AgentHostEnqueuePullRequest',
				assert: request => assert.deepStrictEqual(request.graphQl?.variables, {
					pullRequestId: 'PR7',
					expectedHeadOid: 'head-1',
				}),
				response: gitHubGraphQLResponse({
					enqueuePullRequest: { mergeQueueEntry: { id: 'MQE2' } },
				}),
			}));
			const { ref, service } = setup(server, completeSnapshot(server, true));
			const preparation = await service.prepareMerge(ref, 'head-1', signal());

			const result = await service.enqueue(
				preparation,
				{ confirmed: true, authorizationId: 'approval-1' },
				signal(),
			);

			assert.deepStrictEqual(result, { outcome: 'succeeded', mergeQueueEntryId: 'MQE2' });
			server.assertSatisfied();
		});
	});
});

function signal(): AbortSignal {
	return new AbortController().signal;
}

function completeSnapshot(server: ProgrammableGitHubServer, mergeQueueRequired = false, mergeQueueEntryId?: string): PullRequestSnapshot {
	const account = { host: new URL(server.apiBaseUrl).host, accountId: '101' };
	const ref = { ...account, owner: 'octo', repo: 'repo', number: 7 };
	return {
		ref,
		generation: 1,
		headGeneration: 1,
		core: {
			status: 'ready',
			complete: true,
			value: {
				id: 'PR7',
				repositoryNameWithOwner: 'octo/repo',
				number: 7,
				title: 'PR',
				url: 'https://example.test/pr/7',
				state: 'open',
				draft: false,
				headSha: 'head-1',
				headRef: 'feature',
				baseSha: 'base-1',
				baseRef: 'main',
			},
		},
		topLevelComments: { status: 'missing', complete: false },
		submittedReviews: { status: 'ready', complete: true, value: [] },
		inlineComments: { status: 'missing', complete: false },
		reviewThreads: { status: 'ready', complete: true, value: [], headSha: 'head-1' },
		checks: {
			status: 'ready',
			complete: true,
			headSha: 'head-1',
			value: {
				headSha: 'head-1',
				checks: [],
				requirednessComplete: true,
				expectedSuites: [],
				expectedSuitesComplete: true,
			},
		},
		mergeability: {
			status: 'ready',
			complete: true,
			headSha: 'head-1',
			value: {
				headSha: 'head-1',
				baseSha: 'base-1',
				mergeable: 'MERGEABLE',
				viewerCanUpdate: true,
				viewerCanMerge: true,
				viewerCanEnableAutoMerge: true,
				allowedMergeMethods: ['SQUASH'],
				autoMergeEnabled: false,
				mergeQueueRequired,
				queueRequirementKnown: true,
				mergeQueueEntryId,
			},
		},
		participants: { status: 'missing', complete: false },
	};
}

function workflowRun(id: number, attempt: number, status: string): object {
	return {
		id,
		name: 'CI',
		status,
		conclusion: status === 'completed' ? 'failure' : null,
		head_sha: 'head-1',
		run_attempt: attempt,
	};
}

function workflowRunNormalized(id: string, attempt: number, status: string): object {
	return {
		id,
		name: 'CI',
		event: undefined,
		status,
		conclusion: status === 'COMPLETED' ? 'FAILURE' : undefined,
		headSha: 'head-1',
		runAttempt: attempt,
		url: undefined,
		createdAt: undefined,
		updatedAt: undefined,
	};
}
