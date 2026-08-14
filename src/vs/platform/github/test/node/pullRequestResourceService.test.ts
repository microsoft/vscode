/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { PullRequestCore, PullRequestFragment, PullRequestRef, PullRequestSubscriptionOptions } from '../../common/githubPullRequestService.js';
import { GitHubCredential, GitHubCredentialInvalidation, IGitHubCredentials } from '../../common/githubCredentialService.js';
import { GitHubRequestError } from '../../common/githubTransport.js';
import { IPullRequestQuery, PullRequestFragmentResult } from '../../common/pullRequestQueryService.js';
import { PullRequestPollingPolicy, PullRequestResourceService } from '../../common/pullRequestResourceService.js';
import { FakeGitHubScheduler } from './fakeGitHubScheduler.js';

const account = { host: 'github.example.test', accountId: '101' };
const ref: PullRequestRef = { ...account, owner: 'old-owner', repo: 'old-repo', number: 7 };

const policy: PullRequestPollingPolicy = {
	dormantGrace: 20,
	fragmentBodyGrace: 5,
	maximumDormantEntries: 2,
	coreVisible: 1_000,
	coreBackground: 2_000,
	conversationVisible: 10,
	conversationBackground: 100,
	checksPendingVisible: 5,
	checksPendingBackground: 50,
	checksBackstop: 500,
	mergeabilityVisible: 20,
	mergeabilityBackground: 200,
	participants: 300,
	failureRetryBase: 5,
	failureRetryMaximum: 20,
	jitter: 0,
};

function core(headSha: string, repositoryNameWithOwner = 'new-owner/new-repo'): PullRequestCore {
	return {
		id: 'PR_7',
		repositoryId: 'R_1',
		repositoryNameWithOwner,
		number: 7,
		title: 'PR',
		url: 'https://github.example.test/new-owner/new-repo/pull/7',
		state: 'open',
		draft: false,
		headSha,
		headRef: 'feature',
		baseSha: 'base',
		baseRef: 'main',
	};
}

interface IQueryCall {
	readonly fragment: PullRequestFragment;
	readonly ref: PullRequestRef;
	readonly options: PullRequestSubscriptionOptions;
	readonly signal: AbortSignal;
}

class TestPullRequestQueryService implements IPullRequestQuery {

	readonly calls: IQueryCall[] = [];
	readonly handlers = new Map<PullRequestFragment, (call: IQueryCall) => Promise<PullRequestFragmentResult> | PullRequestFragmentResult>();
	headSha = 'head-1';

	async fetch(
		fragment: PullRequestFragment,
		requestRef: PullRequestRef,
		_core: PullRequestCore | undefined,
		options: PullRequestSubscriptionOptions,
		_credential: GitHubCredential,
		signal: AbortSignal,
	): Promise<PullRequestFragmentResult> {
		const call = { fragment, ref: requestRef, options, signal };
		this.calls.push(call);
		const handler = this.handlers.get(fragment);
		if (handler) {
			return handler(call);
		}
		switch (fragment) {
			case 'core': return { fragment, value: core(this.headSha), complete: true };
			case 'topLevelComments': return { fragment, value: [{ id: 'C1', body: options.conversation?.includeBodies ? 'body' : undefined }], complete: true };
			case 'submittedReviews': return { fragment, value: [], complete: true };
			case 'inlineComments': return { fragment, value: [], complete: true };
			case 'reviewThreads': return { fragment, value: [], complete: true, headSha: this.headSha };
			case 'checks': return {
				fragment,
				value: {
					headSha: this.headSha,
					requirednessComplete: true,
					expectedSuites: [],
					expectedSuitesComplete: true,
					checks: [{ id: 'check', type: 'checkRun', name: 'CI', status: 'IN_PROGRESS', required: true }],
				},
				complete: true,
				headSha: this.headSha,
			};
			case 'mergeability': return {
				fragment,
				value: {
					headSha: this.headSha,
					baseSha: 'base',
					mergeable: 'MERGEABLE',
					viewerCanUpdate: true,
					viewerCanMerge: true,
					viewerCanEnableAutoMerge: true,
					allowedMergeMethods: ['SQUASH'],
					autoMergeEnabled: false,
					mergeQueueRequired: false,
					queueRequirementKnown: true,
				},
				complete: true,
				headSha: this.headSha,
			};
			case 'participants': return { fragment, value: { participants: [] }, complete: true };
		}
	}
}

class TestGitHubCredentialService implements IGitHubCredentials {

	private readonly _onDidInvalidate = new Emitter<GitHubCredentialInvalidation>();
	readonly onDidInvalidate = this._onDidInvalidate.event;
	private readonly _controller = new AbortController();
	readonly credential: GitHubCredential = { account, token: 'token', generation: 1, signal: this._controller.signal };

	async getCredential(signal: AbortSignal): Promise<GitHubCredential> {
		if (signal.aborted) {
			throw signal.reason;
		}
		return this.credential;
	}

	resolveCredential(): Promise<GitHubCredential> {
		return Promise.resolve(this.credential);
	}

	handleRequestError(): void { }

	invalidate(reason: GitHubCredentialInvalidation['reason']): void {
		this._controller.abort(new Error('credential invalidated'));
		this._onDidInvalidate.fire({ credential: this.credential, reason });
	}

	dispose(): void {
		this._onDidInvalidate.dispose();
	}
}

suite('PullRequestResourceService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(): {
		readonly clock: FakeGitHubScheduler;
		readonly credentials: TestGitHubCredentialService;
		readonly queries: TestPullRequestQueryService;
		readonly service: PullRequestResourceService;
	} {
		const clock = new FakeGitHubScheduler({ now: 0 });
		const credentials = disposables.add(new TestGitHubCredentialService());
		const queries = new TestPullRequestQueryService();
		const service = disposables.add(new PullRequestResourceService(clock, policy, credentials, queries, new NullLogService()));
		return { clock, credentials, queries, service };
	}

	test('shares resources while keeping fragment priority and polling independent', async () => {
		const { clock, queries, service } = setup();
		const comments = service.subscribePullRequest(ref, {
			priority: 'visible',
			conversation: { topLevelComments: true, includeBodies: true },
		});
		await comments.refresh();
		queries.calls.length = 0;
		const checks = service.subscribePullRequest({ ...ref, owner: 'OLD-OWNER', repo: 'OLD-REPO' }, {
			priority: 'background',
			checks: { required: true },
		});

		assert.strictEqual(comments.resource, checks.resource);
		await checks.refresh('checks');
		assert.deepStrictEqual(queries.calls.map(call => call.fragment), ['checks']);
		queries.calls.length = 0;

		const canonical = service.subscribePullRequest({ ...ref, owner: 'new-owner', repo: 'new-repo' }, { priority: 'background' });
		assert.strictEqual(canonical.resource, comments.resource);
		assert.deepStrictEqual({
			snapshot: comments.resource.snapshot.get(),
		}, {
			snapshot: {
				ref: { ...ref, owner: 'new-owner', repo: 'new-repo' },
				generation: 2,
				headGeneration: 1,
				core: {
					value: core('head-1'),
					status: 'ready',
					complete: true,
					observedAt: new Date(0).toISOString(),
					attemptedAt: new Date(0).toISOString(),
				},
				topLevelComments: {
					value: [{ id: 'C1', body: 'body' }],
					status: 'ready',
					complete: true,
					observedAt: new Date(0).toISOString(),
					attemptedAt: new Date(0).toISOString(),
					headSha: undefined,
				},
				submittedReviews: { status: 'missing', complete: false },
				inlineComments: { status: 'missing', complete: false },
				reviewThreads: { status: 'missing', complete: false },
				checks: {
					value: {
						headSha: 'head-1',
						requirednessComplete: true,
						expectedSuites: [],
						expectedSuitesComplete: true,
						checks: [{ id: 'check', type: 'checkRun', name: 'CI', status: 'IN_PROGRESS', required: true }],
					},
					status: 'ready',
					complete: true,
					observedAt: new Date(0).toISOString(),
					attemptedAt: new Date(0).toISOString(),
					headSha: 'head-1',
				},
				mergeability: { status: 'missing', complete: false },
				participants: { status: 'missing', complete: false },
			},
		});

		comments.update({
			priority: 'background',
			conversation: { topLevelComments: true, includeBodies: false },
		});
		queries.calls.length = 0;
		clock.advanceBy(10);
		await flushAsync();
		assert.deepStrictEqual(comments.resource.snapshot.get().topLevelComments.value, [{ id: 'C1' }]);
		assert.strictEqual(queries.calls.length, 0);

		checks.dispose();
		queries.calls.length = 0;
		clock.advanceBy(90);
		await flushAsync();
		assert.deepStrictEqual(queries.calls.map(call => call.fragment), ['topLevelComments']);

		comments.dispose();
		canonical.dispose();
		queries.calls.length = 0;
		clock.advanceBy(10_000);
		await flushAsync();
		assert.deepStrictEqual(queries.calls, []);
	});

	test('retains dormant identity briefly, then expires it', async () => {
		const { clock, service } = setup();
		const first = service.subscribePullRequest(ref, { priority: 'background' });
		await first.refresh('core');
		const resource = first.resource;
		first.dispose();

		clock.advanceBy(19);
		const resumed = service.subscribePullRequest(ref, { priority: 'background' });
		assert.strictEqual(resumed.resource, resource);
		resumed.dispose();

		clock.advanceBy(20);
		const replaced = service.subscribePullRequest(ref, { priority: 'background' });
		assert.notStrictEqual(replaced.resource, resource);
		replaced.dispose();
	});

	test('converges colliding canonical aliases onto shared state and scheduling', async () => {
		const { clock, queries, service } = setup();
		const canonical = service.subscribePullRequest({
			...ref,
			owner: 'new-owner',
			repo: 'new-repo',
		}, {
			priority: 'visible',
			conversation: { topLevelComments: true },
		});
		const renamed = service.subscribePullRequest(ref, {
			priority: 'background',
			checks: { required: true },
		});
		await renamed.refresh('checks');
		await canonical.refresh('topLevelComments');

		assert.deepStrictEqual({
			distinctResources: canonical.resource !== renamed.resource,
			sharedSnapshot: canonical.resource.snapshot.get() === renamed.resource.snapshot.get(),
			ref: renamed.resource.ref,
			generation: renamed.resource.snapshot.get().generation,
			fragments: queries.calls.map(call => call.fragment),
			comments: renamed.resource.snapshot.get().topLevelComments.value,
			checks: canonical.resource.snapshot.get().checks.value?.checks,
		}, {
			distinctResources: true,
			sharedSnapshot: true,
			ref: { ...ref, owner: 'new-owner', repo: 'new-repo' },
			generation: 2,
			fragments: ['core', 'checks', 'topLevelComments'],
			comments: [{ id: 'C1', body: undefined }],
			checks: [{ id: 'check', type: 'checkRun', name: 'CI', status: 'IN_PROGRESS', required: true }],
		});
		canonical.dispose();
		renamed.dispose();
		queries.calls.length = 0;
		clock.advanceBy(10_000);
		await flushAsync();
		assert.deepStrictEqual(queries.calls, []);
	});

	test('continues a full refresh on the canonical entry after merging', async () => {
		const { queries, service } = setup();
		let coreCall = 0;
		queries.handlers.set('core', () => ({
			fragment: 'core',
			value: core('head-1', coreCall++ === 0 ? 'old-owner/old-repo' : 'new-owner/new-repo'),
			complete: true,
		}));
		const renamed = service.subscribePullRequest(ref, {
			priority: 'visible',
			conversation: { topLevelComments: true },
		});
		await renamed.refresh();
		const canonical = service.subscribePullRequest({
			...ref,
			owner: 'new-owner',
			repo: 'new-repo',
		}, { priority: 'background' });
		queries.calls.length = 0;

		await renamed.refresh();

		assert.deepStrictEqual({
			distinctResources: canonical.resource !== renamed.resource,
			sharedSnapshot: canonical.resource.snapshot.get() === renamed.resource.snapshot.get(),
			calls: queries.calls.map(call => call.fragment),
			comments: canonical.resource.snapshot.get().topLevelComments,
		}, {
			distinctResources: true,
			sharedSnapshot: true,
			calls: ['core', 'topLevelComments'],
			comments: {
				value: [{ id: 'C1', body: undefined }],
				status: 'ready',
				complete: true,
				observedAt: new Date(0).toISOString(),
				attemptedAt: new Date(0).toISOString(),
				headSha: undefined,
			},
		});
		canonical.dispose();
		renamed.dispose();
	});

	test('detaches one cancelled refresh waiter without cancelling shared work', async () => {
		const { queries, service } = setup();
		const release = new DeferredPromise<void>();
		const started = new DeferredPromise<void>();
		queries.handlers.set('core', async call => {
			await started.complete();
			await release.p;
			assert.strictEqual(call.signal.aborted, false);
			return { fragment: 'core', value: core('head-1'), complete: true };
		});
		const first = service.subscribePullRequest(ref, { priority: 'interactive' });
		const second = service.subscribePullRequest(ref, { priority: 'interactive' });
		const cancellation = disposables.add(new CancellationTokenSource());

		const cancelled = first.refresh('core', cancellation.token);
		const shared = second.refresh('core');
		await started.p;
		cancellation.cancel();
		await assert.rejects(() => cancelled);
		await release.complete();
		await shared;

		assert.deepStrictEqual({
			callCount: queries.calls.length,
			status: first.resource.snapshot.get().core.status,
		}, {
			callCount: 1,
			status: 'ready',
		});
		first.dispose();
		second.dispose();
	});

	test('authoritative refresh and typed invalidation supersede older work', async () => {
		const { clock, queries, service } = setup();
		const subscription = service.subscribePullRequest(ref, {
			priority: 'interactive',
			checks: { required: true },
		});
		await subscription.refresh('core');
		await subscription.refresh('checks');

		const authoritativeStarted = new DeferredPromise<void>();
		const releaseAuthoritativeOld = new DeferredPromise<void>();
		let authoritativeCall = 0;
		let authoritativeOldSignal: AbortSignal | undefined;
		queries.handlers.set('checks', async call => {
			authoritativeCall++;
			if (authoritativeCall === 1) {
				authoritativeOldSignal = call.signal;
				await authoritativeStarted.complete();
				await releaseAuthoritativeOld.p;
				return checksResult('old');
			}
			return checksResult('authoritative');
		});
		const oldRefresh = subscription.refresh('checks');
		await authoritativeStarted.p;
		const authoritative = subscription.refresh('checks', CancellationToken.None, { authoritative: true });
		await authoritative;
		await releaseAuthoritativeOld.complete();
		await oldRefresh;

		assert.deepStrictEqual({
			oldAborted: authoritativeOldSignal?.aborted,
			checkId: subscription.resource.snapshot.get().checks.value?.checks[0]?.id,
			callCount: authoritativeCall,
		}, {
			oldAborted: true,
			checkId: 'authoritative',
			callCount: 2,
		});

		const invalidationStarted = new DeferredPromise<void>();
		const releaseInvalidationOld = new DeferredPromise<void>();
		let invalidationCall = 0;
		let invalidationOldSignal: AbortSignal | undefined;
		queries.handlers.set('checks', async call => {
			invalidationCall++;
			if (invalidationCall === 1) {
				invalidationOldSignal = call.signal;
				await invalidationStarted.complete();
				await releaseInvalidationOld.p;
				return checksResult('stale');
			}
			return checksResult('fresh');
		});
		const invalidatedRefresh = subscription.refresh('checks');
		await invalidationStarted.p;
		service.invalidatePullRequest(ref, ['checks']);
		assert.deepStrictEqual({
			oldAborted: invalidationOldSignal?.aborted,
			status: subscription.resource.snapshot.get().checks.status,
			complete: subscription.resource.snapshot.get().checks.complete,
		}, {
			oldAborted: true,
			status: 'stale',
			complete: false,
		});
		clock.flushDue();
		await flushAsync();
		await releaseInvalidationOld.complete();
		await invalidatedRefresh;

		assert.deepStrictEqual({
			checkId: subscription.resource.snapshot.get().checks.value?.checks[0]?.id,
			callCount: invalidationCall,
		}, {
			checkId: 'fresh',
			callCount: 2,
		});

		subscription.update({ priority: 'background' });
		queries.calls.length = 0;
		service.invalidatePullRequest(ref, ['checks']);
		clock.flushDue();
		await flushAsync();
		assert.strictEqual(queries.calls.length, 0);
		subscription.dispose();
	});

	test('supersedes in-flight work when a subscriber expands the data shape', async () => {
		const { queries, service } = setup();
		const firstStarted = new DeferredPromise<void>();
		const releaseFirst = new DeferredPromise<void>();
		let call = 0;
		queries.handlers.set('topLevelComments', async queryCall => {
			call++;
			if (call === 1) {
				await firstStarted.complete();
				await releaseFirst.p;
			}
			return {
				fragment: 'topLevelComments',
				value: [{ id: `C${call}`, body: queryCall.options.conversation?.includeBodies ? 'body' : undefined }],
				complete: true,
			};
		});
		const topology = service.subscribePullRequest(ref, {
			priority: 'background',
			conversation: { topLevelComments: true },
		});
		await topology.refresh('core');
		const first = topology.refresh('topLevelComments');
		await firstStarted.p;

		const bodies = service.subscribePullRequest(ref, {
			priority: 'visible',
			conversation: { topLevelComments: true, includeBodies: true },
		});
		await bodies.refresh('topLevelComments');
		await releaseFirst.complete();
		await first;

		assert.deepStrictEqual({
			callCount: call,
			comments: bodies.resource.snapshot.get().topLevelComments.value,
		}, {
			callCount: 2,
			comments: [{ id: 'C2', body: 'body' }],
		});
		topology.dispose();
		bodies.dispose();
	});

	test('retries transient failures with bounded scheduled backoff', async () => {
		const { clock, queries, service } = setup();
		let commentsCall = 0;
		queries.handlers.set('topLevelComments', () => {
			commentsCall++;
			if (commentsCall === 1) {
				throw new GitHubRequestError('temporary', 'server', 502);
			}
			return { fragment: 'topLevelComments', value: [{ id: 'C1' }], complete: true };
		});
		const subscription = service.subscribePullRequest(ref, {
			priority: 'visible',
			conversation: { topLevelComments: true },
		});
		await subscription.refresh('core');
		await assert.rejects(() => subscription.refresh('topLevelComments'), /temporary/);

		clock.advanceBy(4);
		await flushAsync();
		assert.strictEqual(commentsCall, 1);
		clock.advanceBy(1);
		await flushAsync();

		assert.deepStrictEqual({
			commentsCall,
			state: subscription.resource.snapshot.get().topLevelComments,
		}, {
			commentsCall: 2,
			state: {
				value: [{ id: 'C1' }],
				status: 'ready',
				complete: true,
				observedAt: new Date(5).toISOString(),
				attemptedAt: new Date(5).toISOString(),
				headSha: undefined,
			},
		});
		subscription.dispose();
	});

	test('rejects old-head and invalidated credential results', async () => {
		const { credentials, queries, service } = setup();
		let coreCall = 0;
		queries.handlers.set('core', () => {
			coreCall++;
			return { fragment: 'core', value: core(coreCall === 1 ? 'head-1' : 'head-2'), complete: true };
		});
		const checksStarted = new DeferredPromise<void>();
		const releaseChecks = new DeferredPromise<void>();
		let checksCall = 0;
		queries.handlers.set('checks', async () => {
			checksCall++;
			if (checksCall === 1) {
				await checksStarted.complete();
				await releaseChecks.p;
				return {
					fragment: 'checks',
					value: { headSha: 'head-1', checks: [], requirednessComplete: true, expectedSuites: [], expectedSuitesComplete: true },
					complete: true,
					headSha: 'head-1',
				};
			}
			return {
				fragment: 'checks',
				value: { headSha: 'head-2', checks: [], requirednessComplete: true, expectedSuites: [], expectedSuitesComplete: true },
				complete: true,
				headSha: 'head-2',
			};
		});
		const subscription = service.subscribePullRequest(ref, { priority: 'interactive', checks: { required: true } });
		await subscription.refresh('core');
		const oldChecks = subscription.refresh('checks');
		await checksStarted.p;
		queries.headSha = 'head-2';
		await subscription.refresh('core');
		await releaseChecks.complete();
		await oldChecks;

		assert.deepStrictEqual({
			status: subscription.resource.snapshot.get().checks.status,
			complete: subscription.resource.snapshot.get().checks.complete,
		}, {
			status: 'missing',
			complete: false,
		});
		await subscription.refresh('checks');
		assert.strictEqual(subscription.resource.snapshot.get().checks.headSha, 'head-2');
		assert.deepStrictEqual({
			generation: subscription.resource.snapshot.get().generation,
			headGeneration: subscription.resource.snapshot.get().headGeneration,
		}, {
			generation: 2,
			headGeneration: 2,
		});

		const oldResource = subscription.resource;
		credentials.invalidate('account');
		await assert.rejects(() => subscription.refresh('core'), /no longer active/);
		const replacement = service.subscribePullRequest(ref, { priority: 'interactive' });
		assert.notStrictEqual(replacement.resource, oldResource);
		replacement.dispose();
		subscription.dispose();
	});

	test('rejects review thread results after the core head changes', async () => {
		const { queries, service } = setup();
		const threadsStarted = new DeferredPromise<void>();
		const releaseThreads = new DeferredPromise<void>();
		let threadsCall = 0;
		queries.handlers.set('reviewThreads', async () => {
			threadsCall++;
			if (threadsCall === 1) {
				await threadsStarted.complete();
				await releaseThreads.p;
				return { fragment: 'reviewThreads', value: [], complete: true, headSha: 'head-1' };
			}
			return { fragment: 'reviewThreads', value: [], complete: true, headSha: 'head-2' };
		});
		const subscription = service.subscribePullRequest(ref, {
			priority: 'interactive',
			conversation: { reviewThreads: true },
		});
		await subscription.refresh('core');
		const oldThreads = subscription.refresh('reviewThreads');
		await threadsStarted.p;
		queries.headSha = 'head-2';
		await subscription.refresh('core');
		await releaseThreads.complete();
		await oldThreads;

		assert.deepStrictEqual(subscription.resource.snapshot.get().reviewThreads, {
			status: 'missing',
			complete: false,
			attemptedAt: new Date(0).toISOString(),
			headSha: undefined,
			error: undefined,
		});
		await subscription.refresh('reviewThreads');
		assert.strictEqual(subscription.resource.snapshot.get().reviewThreads.headSha, 'head-2');
		subscription.dispose();
	});

	test('stops polling terminal pull requests and keeps failed fragments incomplete', async () => {
		const { clock, queries, service } = setup();
		queries.handlers.set('core', () => ({
			fragment: 'core',
			value: { ...core('head-1'), state: 'merged', mergedAt: '2026-08-12T00:00:00.000Z' },
			complete: true,
		}));
		queries.handlers.set('topLevelComments', () => {
			throw new GitHubRequestError('comments failed', 'server', 500);
		});
		const subscription = service.subscribePullRequest(ref, {
			priority: 'visible',
			conversation: { topLevelComments: true },
		});

		await subscription.refresh('core');
		await assert.rejects(() => subscription.refresh('topLevelComments'), /comments failed/);
		assert.deepStrictEqual({
			coreState: subscription.resource.snapshot.get().core.value?.state,
			commentsStatus: subscription.resource.snapshot.get().topLevelComments.status,
			commentsComplete: subscription.resource.snapshot.get().topLevelComments.complete,
		}, {
			coreState: 'merged',
			commentsStatus: 'error',
			commentsComplete: false,
		});

		queries.calls.length = 0;
		clock.advanceBy(10_000);
		await flushAsync();
		assert.deepStrictEqual(queries.calls, []);
		subscription.dispose();
	});
});

function checksResult(id: string): PullRequestFragmentResult {
	return {
		fragment: 'checks',
		value: {
			headSha: 'head-1',
			requirednessComplete: true,
			expectedSuites: [],
			expectedSuitesComplete: true,
			checks: [{ id, type: 'checkRun', name: id, status: 'COMPLETED' }],
		},
		complete: true,
		headSha: 'head-1',
	};
}

async function flushAsync(): Promise<void> {
	for (let index = 0; index < 10; index++) {
		await Promise.resolve();
	}
}
