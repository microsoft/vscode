/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { GitHubCredential, IGitHubCredentials } from '../../../github/common/githubCredentialService.js';
import { IGitHubCapabilities } from '../../../github/common/githubHostCapabilitiesService.js';
import { PullRequestChecks, PullRequestCore, PullRequestFragment, PullRequestMergeability, PullRequestReviewThread } from '../../../github/common/githubPullRequestService.js';
import { GitHubQueryService } from '../../../github/common/githubQueryServiceImpl.js';
import { IGitHubService } from '../../../github/common/githubService.js';
import { GitHubRequestError, GitHubTransport } from '../../../github/common/githubTransport.js';
import { IGitHubEndpointProvider } from '../../../github/common/githubTypes.js';
import { IPullRequestQuery, PullRequestFragmentResult } from '../../../github/common/pullRequestQueryService.js';
import { PullRequestResourceService } from '../../../github/common/pullRequestResourceService.js';
import { FakeGitHubScheduler } from '../../../github/test/node/fakeGitHubScheduler.js';
import { nodeFetch } from '../../../github/test/node/nodeFetch.js';
import { gitHubJsonResponse, gitHubRateLimitResponse, gitHubRestStep, ProgrammableGitHubServer } from '../../../github/test/node/programmableGitHubServer.js';
import { NullLogService } from '../../../log/common/log.js';
import { registerBuiltinWorkflowChecks } from '../../common/builtinWorkflowChecks.js';
import { builtinWorkflowCheckpointTypes } from '../../common/builtinWorkflows.js';
import { IWorkflowCheck, IWorkflowCheckRegistry, ResolvedWorkflowCheckpoint, WorkflowCheckContext, WorkflowObject, WorkflowRun } from '../../common/workflow.js';

const headSha = 'a'.repeat(40);
const baseSha = 'b'.repeat(40);
const releaseSha = 'c'.repeat(40);
const integratedSha = 'd'.repeat(40);
const planRoot = URI.from({ scheme: Schemas.file, path: '/workflow-workspace' });
const planUri = URI.joinPath(planRoot, 'plan.md');

class TestCheckRegistry implements IWorkflowCheckRegistry {
	readonly checks = new Map<string, IWorkflowCheck>();

	register(check: IWorkflowCheck) {
		assert.ok(!this.checks.has(check.id));
		this.checks.set(check.id, check);
		return toDisposable(() => this.checks.delete(check.id));
	}

	get(id: string): IWorkflowCheck | undefined {
		return this.checks.get(id);
	}
}

class TestPullRequestQuery implements IPullRequestQuery {
	readonly calls: PullRequestFragment[] = [];
	readonly incomplete = new Set<PullRequestFragment>();
	threads: readonly PullRequestReviewThread[] = [];
	failure: GitHubRequestError | undefined;
	nextCore: PullRequestCore | undefined;
	checks: PullRequestChecks = {
		headSha,
		requirednessComplete: true,
		expectedSuitesComplete: true,
		expectedSuites: [],
		checks: [{ id: 'ci', type: 'checkRun', name: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS', required: true }],
	};
	mergeability: PullRequestMergeability = {
		headSha,
		baseSha,
		mergeable: 'MERGEABLE',
		mergeStateStatus: 'DRAFT',
		viewerCanUpdate: true,
		viewerCanMerge: true,
		viewerCanEnableAutoMerge: true,
		allowedMergeMethods: ['MERGE', 'SQUASH', 'REBASE'],
		autoMergeEnabled: false,
		mergeQueueRequired: false,
		queueRequirementKnown: true,
	};

	constructor(public core: PullRequestCore) { }

	async fetch(fragment: PullRequestFragment): Promise<PullRequestFragmentResult> {
		this.calls.push(fragment);
		if (this.failure) {
			throw this.failure;
		}
		const complete = !this.incomplete.has(fragment);
		switch (fragment) {
			case 'core': {
				const value = this.core;
				if (this.nextCore) {
					this.core = this.nextCore;
					this.nextCore = undefined;
				}
				return { fragment, value, complete: true };
			}
			case 'checks': return { fragment, value: this.checks, complete, headSha: this.checks.headSha };
			case 'reviewThreads': return { fragment, value: this.threads, complete, headSha };
			case 'mergeability': return { fragment, value: this.mergeability, complete, headSha: this.mergeability.headSha };
			default: throw new Error(`Unexpected workflow fragment ${fragment}`);
		}
	}
}

suite('BuiltinWorkflowChecks', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(server?: ProgrammableGitHubServer) {
		const lifetime = disposables.add(new DisposableStore());
		const services = lifetime.add(new DisposableStore());
		const clock = lifetime.add(new FakeGitHubScheduler());
		const endpoint: IGitHubEndpointProvider = server?.createEndpointService() ?? {
			onDidChange: Event.None,
			getApiBaseUri: () => 'https://api.github.com',
			getGraphQlUri: () => 'https://api.github.com/graphql',
		};
		const host = new URL(endpoint.getApiBaseUri()).host;
		const origin = `https://${host === 'api.github.com' ? 'github.com' : host}`;
		const repository = `${origin}/octo/repo`;
		const pullRequest = `${repository}/pull/7`;
		const credential: GitHubCredential = { account: { host, accountId: '101' }, token: 'test-token', generation: 1, signal: new AbortController().signal };
		const credentials: IGitHubCredentials = {
			onDidInvalidate: Event.None,
			getCredential: async signal => {
				if (signal.aborted) {
					throw signal.reason;
				}
				return credential;
			},
			resolveCredential: async () => credential,
			handleRequestError: () => { },
		};
		const capabilities: IGitHubCapabilities = {
			getCapabilities: async () => ({ graphql: true, reviewThreads: true, mergeQueue: true, checkContextRequiredness: true, internalMergeStatus: false }),
			clear: () => { },
		};
		const transport = services.add(new GitHubTransport(nodeFetch, clock));
		const query = services.add(new GitHubQueryService(clock, undefined, credentials, transport, endpoint, capabilities, new NullLogService()));
		const pullRequestQuery = new TestPullRequestQuery({
			repositoryNameWithOwner: 'octo/repo', number: 7, title: 'Feature', url: pullRequest,
			state: 'open', draft: true, headSha, headRef: 'feature', baseSha, baseRef: 'main',
		});
		const pullRequests = services.add(new PullRequestResourceService(clock, undefined, credentials, pullRequestQuery, new NullLogService()));
		const githubService = upcastPartial<IGitHubService>({ endpoint, credentials, transport, capabilities, query, pullRequests });
		const fileService = services.add(new FileService(new NullLogService()));
		services.add(fileService.registerProvider(Schemas.file, services.add(new InMemoryFileSystemProvider())));
		const registry = new TestCheckRegistry();
		const registration = services.add(registerBuiltinWorkflowChecks(registry, { fileService, githubService, allowedResourceRoots: () => [planRoot] }));
		const evaluate = (id: string, changes: Partial<WorkflowCheckContext> = {}, token = CancellationToken.None) => registry.get(id)!.evaluate(context(repository, pullRequest, changes), token);
		return { registry, registration, fileService, githubService, pullRequestQuery, repository, pullRequest, clock, lifetime, evaluate };
	}

	async function withServer(fn: (server: ProgrammableGitHubServer) => Promise<void>): Promise<void> {
		const server = await ProgrammableGitHubServer.start();
		try {
			await fn(server);
		} finally {
			await server.disposeAsync();
		}
	}

	test('checks saved file existence, not plan content or quality', async () => {
		const { evaluate, fileService } = setup();
		await fileService.writeFile(planUri, VSBuffer.fromString(''));
		const result = await evaluate('vscode.workspace/file-exists@1', { proof: { uri: planUri.toString() } });
		assert.deepStrictEqual(result.kind === 'satisfied' ? { kind: result.kind, output: result.output, evidence: result.evidence?.map(item => item.kind) } : result, {
			kind: 'satisfied', output: { uri: planUri.toString() }, evidence: ['file'],
		});
	});

	test('rejects missing files, directories, traversal, foreign roots and network proof URLs', async () => {
		const { evaluate, fileService } = setup();
		await fileService.createFolder(planRoot);
		const results = [];
		for (const uri of [
			planUri.toString(),
			planRoot.toString(),
			URI.from({ scheme: Schemas.file, path: '/elsewhere/plan.md' }).toString(),
			URI.from({ scheme: Schemas.file, path: '/workflow-workspace/../elsewhere/plan.md' }).toString(),
			'https://example.invalid/plan.md',
		]) {
			results.push((await evaluate('vscode.workspace/file-exists@1', { proof: { uri } })).kind);
		}
		assert.deepStrictEqual(results, ['rejected', 'rejected', 'rejected', 'rejected', 'rejected']);
	});

	test('binds successor checks to the same repository and pull request', async () => {
		const { evaluate, repository, pullRequestQuery } = setup();
		const results = [];
		for (const uri of [`${repository}/pull/8`, 'https://github.com/other/repo/pull/7', `${repository}/issues/7`, 'https://other.invalid/octo/repo/pull/7']) {
			results.push((await evaluate('vscode.github/pull-request-ready@1', { proof: { uri } })).kind);
		}
		assert.deepStrictEqual({ results, requests: pullRequestQuery.calls }, { results: ['rejected', 'rejected', 'rejected', 'rejected'], requests: [] });
	});

	test('does not stat a plan whose real path escapes the allowed root', async () => {
		const { githubService, repository, pullRequest } = setup();
		const registry = new TestCheckRegistry();
		const fileService = upcastPartial<IFileService>({
			realpath: async resource => resource.path === planUri.path ? URI.from({ scheme: Schemas.file, path: '/outside/plan.md' }) : resource,
			stat: async () => assert.fail('An out-of-scope real path must not be statted'),
		});
		disposables.add(registerBuiltinWorkflowChecks(registry, { githubService, fileService, allowedResourceRoots: () => [planRoot] }));
		const result = await registry.get('vscode.workspace/file-exists@1')!.evaluate(context(repository, pullRequest, { proof: { uri: planUri.toString() } }), CancellationToken.None);
		assert.strictEqual(result.kind, 'rejected');
	});

	test('uses the allowed remote resource authority rather than interpreting it as HTTP credentials', async () => {
		const { githubService, fileService, repository, pullRequest } = setup();
		const root = URI.from({ scheme: Schemas.vscodeRemote, authority: 'ssh-remote+user@host', path: '/workspace' });
		const resource = URI.joinPath(root, 'plan.md');
		disposables.add(fileService.registerProvider(Schemas.vscodeRemote, disposables.add(new InMemoryFileSystemProvider())));
		await fileService.writeFile(resource, VSBuffer.fromString(''));
		const registry = new TestCheckRegistry();
		disposables.add(registerBuiltinWorkflowChecks(registry, { githubService, fileService, allowedResourceRoots: () => [root] }));
		const result = await registry.get('vscode.workspace/file-exists@1')!.evaluate(context(repository, pullRequest, { proof: { uri: resource.toString() } }), CancellationToken.None);
		assert.strictEqual(result.kind, 'satisfied');
	});

	test('checks draft and open states without mutating GitHub', async () => {
		const { evaluate, pullRequestQuery, githubService } = setup();
		const draft = await evaluate('vscode.github/pull-request-draft@1');
		const notOpen = await evaluate('vscode.github/pull-request-open@1');
		pullRequestQuery.core = { ...pullRequestQuery.core, draft: false };
		const open = await evaluate('vscode.github/pull-request-open@1');
		assert.deepStrictEqual({ states: [draft.kind, notOpen.kind, open.kind], hasMutationClient: githubService.mutations !== undefined }, {
			states: ['satisfied', 'rejected', 'satisfied'], hasMutationClient: false,
		});
	});

	test('captures the PR title and checkpoint-specific state in durable evidence', async () => {
		const { evaluate, pullRequestQuery, pullRequest } = setup();
		const draft = await evaluate('vscode.github/pull-request-draft@1');
		pullRequestQuery.core = { ...pullRequestQuery.core, draft: false, state: 'merged', mergeCommitSha: integratedSha, title: 'Merged feature title' };
		const merged = await evaluate('vscode.github/pull-request-merged@1');
		assert.deepStrictEqual([draft, merged].map(result => result.kind === 'satisfied' ? result.evidence : result), [
			[{ kind: 'pullRequest', uri: pullRequest, label: 'Feature', state: 'draft' }],
			[{ kind: 'pullRequest', uri: pullRequest, label: 'Merged feature title', state: 'merged' }],
		]);
	});

	test('returns the authoritative integrated commit and base repository, not a fork or pre-squash head', async () => {
		const { evaluate, pullRequestQuery, repository, pullRequest } = setup();
		pullRequestQuery.core = {
			...pullRequestQuery.core, state: 'merged', draft: false, mergeCommitSha: integratedSha, headRepositoryNameWithOwner: 'fork/repo',
		};
		const result = await evaluate('vscode.github/pull-request-merged@1');
		assert.deepStrictEqual(result.kind === 'satisfied' ? result.output : result, { repository, pullRequest, headSha, integratedCommit: integratedSha });
	});

	test('does not substitute the old head when GitHub omits the post-merge commit', async () => {
		const { evaluate, pullRequestQuery } = setup();
		pullRequestQuery.core = { ...pullRequestQuery.core, state: 'merged' };
		assert.strictEqual((await evaluate('vscode.github/pull-request-merged@1')).kind, 'blocked');
	});

	test('v2 records the actual GitHub merge timestamp, ignoring dates in proof and preserving v1 outputs', async () => {
		const { evaluate, pullRequestQuery, repository, pullRequest } = setup();
		pullRequestQuery.core = {
			...pullRequestQuery.core, state: 'merged', draft: false, mergeCommitSha: integratedSha, mergedAt: '2026-09-18T15:30:00Z',
		};
		const proof = { uri: pullRequest, mergedAt: '2026-10-09T09:00:00Z' };
		const legacy = await evaluate('vscode.github/pull-request-merged@1', { proof });
		const current = await evaluate('vscode.github/pull-request-merged@2', { proof });
		assert.deepStrictEqual([legacy, current].map(result => result.kind === 'satisfied' ? result.output : result), [
			{ repository, pullRequest, headSha, integratedCommit: integratedSha },
			{ repository, pullRequest, headSha, integratedCommit: integratedSha, mergedAt: '2026-09-18T15:30:00.000Z' },
		]);
	});

	test('v2 blocks absent, invalid and timezone-free merge timestamps instead of using observation time', async () => {
		const { evaluate, pullRequestQuery } = setup();
		const results = [];
		for (const mergedAt of [undefined, '', 'not-a-date', '2026-09-18', '2026-09-18T09:00:00', '2026-02-30T09:00:00Z']) {
			pullRequestQuery.core = { ...pullRequestQuery.core, state: 'merged', draft: false, mergeCommitSha: integratedSha, mergedAt };
			results.push((await evaluate('vscode.github/pull-request-merged@2')).kind);
		}
		assert.deepStrictEqual(results, ['blocked', 'blocked', 'blocked', 'blocked', 'blocked', 'blocked']);
	});

	test('accepts complete passing current-head readiness and stops observing immediately', async () => {
		const { evaluate, pullRequestQuery, clock } = setup();
		const result = await evaluate('vscode.github/pull-request-ready@1');
		const requestsAtCompletion = pullRequestQuery.calls.length;
		clock.advanceBy(1_000_000);
		assert.deepStrictEqual({ kind: result.kind, furtherRequests: pullRequestQuery.calls.length - requestsAtCompletion, pending: clock.pendingCount }, {
			kind: 'satisfied', furtherRequests: 0, pending: 0,
		});
	});

	test('does not treat truncated checks, threads, or mergeability as ready', async () => {
		const results = [];
		for (const fragment of ['checks', 'reviewThreads', 'mergeability'] as const) {
			const { evaluate, pullRequestQuery } = setup();
			pullRequestQuery.incomplete.add(fragment);
			results.push((await evaluate('vscode.github/pull-request-ready@1')).kind);
		}
		assert.deepStrictEqual(results, ['waiting', 'waiting', 'waiting']);
	});

	test('requires complete check requiredness, expected suites and current-head fragments', async () => {
		const results = [];
		for (const checks of [
			{ requirednessComplete: false },
			{ expectedSuitesComplete: false },
			{ checks: [{ id: 'ci', type: 'checkRun' as const, name: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS' }] },
			{ expectedSuites: [{ id: 'suite', name: 'CI', status: 'QUEUED', checkRunsReported: false }] },
			{ headSha: releaseSha },
		]) {
			const { evaluate, pullRequestQuery } = setup();
			pullRequestQuery.checks = { ...pullRequestQuery.checks, ...checks };
			results.push((await evaluate('vscode.github/pull-request-ready@1')).kind);
		}
		assert.deepStrictEqual(results, ['waiting', 'waiting', 'waiting', 'waiting', 'waiting']);
	});

	test('does not accept a green snapshot after the pull request head changes', async () => {
		const { evaluate, pullRequestQuery } = setup();
		pullRequestQuery.nextCore = { ...pullRequestQuery.core, headSha: releaseSha };
		assert.strictEqual((await evaluate('vscode.github/pull-request-ready@1')).kind, 'waiting');
	});

	test('rejects failed required checks, unresolved outdated threads, and conflicts', async () => {
		const results = [];
		for (const failure of ['checks', 'threads', 'conflicts']) {
			const { evaluate, pullRequestQuery } = setup();
			if (failure === 'checks') {
				pullRequestQuery.checks = { ...pullRequestQuery.checks, checks: [{ id: 'ci', type: 'checkRun', name: 'CI', required: true, status: 'COMPLETED', conclusion: 'FAILURE' }] };
			} else if (failure === 'threads') {
				pullRequestQuery.threads = [{ id: 'thread', isResolved: false, isOutdated: true, comments: [] }];
			} else {
				pullRequestQuery.mergeability = { ...pullRequestQuery.mergeability, mergeable: 'CONFLICTING' };
			}
			results.push((await evaluate('vscode.github/pull-request-ready@1')).kind);
		}
		assert.deepStrictEqual(results, ['rejected', 'rejected', 'rejected']);
	});

	test('surfaces authentication and rate-limit failures rather than recording readiness', async () => {
		const results = [];
		for (const kind of ['authentication', 'rateLimit'] as const) {
			const { evaluate, pullRequestQuery } = setup();
			pullRequestQuery.failure = new GitHubRequestError('Unavailable', kind);
			const result = await evaluate('vscode.github/pull-request-ready@1');
			results.push({ kind: result.kind, reason: result.kind === 'satisfied' ? undefined : Boolean(result.reason) });
		}
		assert.deepStrictEqual(results, [{ kind: 'blocked', reason: true }, { kind: 'waiting', reason: true }]);
	});

	test('checks a matching test plan issue and disposes observation without checking content quality', async () => {
		await withServer(async server => {
			const { evaluate, repository, clock } = setup(server);
			const issue = `${repository}/issues/9`;
			server.enqueue(gitHubRestStep({ path: '/repos/octo/repo/issues/9', response: gitHubJsonResponse(rawIssue(repository, 9)) }));
			const result = await evaluate('vscode.github/issue-exists@1', { proof: { uri: issue } });
			clock.advanceBy(1_000_000);
			assert.deepStrictEqual(result.kind === 'satisfied' ? { output: result.output, requests: server.requests.length, pending: clock.pendingCount } : result, {
				output: { repository, issue }, requests: 1, pending: 0,
			});
			server.assertSatisfied();
		});
	});

	test('backs off transient GitHub failures and exposes a persistent failure instead of waiting forever', async () => {
		const { evaluate, pullRequestQuery } = setup();
		pullRequestQuery.failure = new GitHubRequestError('Temporarily unavailable', 'server');
		let previousState: WorkflowObject | undefined;
		const results = [];
		for (let attempt = 0; attempt < 3; attempt++) {
			const result = await evaluate('vscode.github/pull-request-ready@1', { previousState });
			results.push([result.kind, result.kind === 'waiting' ? result.retryAfterMs : undefined]);
			previousState = result.kind === 'waiting' ? result.state : undefined;
		}
		assert.deepStrictEqual(results, [['waiting', 300_000], ['waiting', 600_000], ['blocked', undefined]]);
	});

	test('does not mistake a pull request or mismatched canonical issue URL for the test plan issue', async () => {
		await withServer(async server => {
			const { evaluate, repository } = setup(server);
			server.enqueue(
				gitHubRestStep({ path: '/repos/octo/repo/issues/8', response: gitHubJsonResponse({ ...rawIssue(repository, 8), pull_request: {} }) }),
				gitHubRestStep({ path: '/repos/octo/repo/issues/9', response: gitHubJsonResponse({ ...rawIssue(repository, 9), html_url: `${repository}/issues/10` }) }),
			);
			assert.deepStrictEqual([
				(await evaluate('vscode.github/issue-exists@1', { proof: { uri: `${repository}/issues/8` } })).kind,
				(await evaluate('vscode.github/issue-exists@1', { proof: { uri: `${repository}/issues/9` } })).kind,
			], ['blocked', 'blocked']);
			server.assertSatisfied();
		});
	});

	test('finds an already-published stable release after draft, preview, and non-containing releases', async () => {
		await withServer(async server => {
			const { evaluate, repository } = setup(server);
			const releases = [
				rawRelease(repository, 4, { draft: true }),
				rawRelease(repository, 3, { prerelease: true }),
				rawRelease(repository, 2),
				rawRelease(repository, 1),
			];
			server.enqueue(
				releasesStep(releases),
				tagStep('v2', releaseSha),
				ancestryStep(integratedSha, releaseSha, false),
				tagStep('v1', headSha),
				ancestryStep(integratedSha, headSha, true),
				releasesStep(releases),
				tagStep('v1', headSha),
			);
			const result = await evaluate('vscode.github/commit-in-release@1', releaseContext(repository));
			assert.deepStrictEqual(result.kind === 'satisfied' ? result.output : result, {
				repository, integratedCommit: integratedSha, release: `${repository}/releases/tag/v1`, releaseId: '1', releaseTag: 'v1',
				releaseCommit: headSha, tagSha: headSha, publishedAt: '2026-09-01T12:00:00Z',
			});
			server.assertSatisfied();
		});
	});

	test('continues an incomplete negative release search and still rechecks the newest page', async () => {
		await withServer(async server => {
			const { evaluate, repository } = setup(server);
			const ignored = [rawRelease(repository, 1, { prerelease: true })];
			const link = `<${server.apiBaseUrl}/repos/octo/repo/releases?per_page=10&page=2>; rel="next"`;
			server.enqueue(
				releasesStep(ignored, 1, link),
				releasesStep(ignored, 2, link),
				releasesStep(ignored, 1, link),
				releasesStep([rawRelease(repository, 7)], 3),
				tagStep('v7', releaseSha),
				ancestryStep(integratedSha, releaseSha, true),
				releasesStep([rawRelease(repository, 7)], 3),
				tagStep('v7', releaseSha),
			);
			const first = await evaluate('vscode.github/commit-in-release@1', releaseContext(repository));
			assert.strictEqual(first.kind, 'waiting');
			const second = await evaluate('vscode.github/commit-in-release@1', { ...releaseContext(repository), previousState: first.kind === 'waiting' ? first.state : undefined });
			assert.deepStrictEqual({
				firstPage: first.kind === 'waiting' ? first.state?.nextPage : undefined,
				second: second.kind,
				pages: server.requests.filter(request => request.servicePath === '/repos/octo/repo/releases').map(request => new URL(request.url).searchParams.get('page')),
			}, { firstPage: 3, second: 'satisfied', pages: ['1', '2', '1', '3', '3'] });
			server.assertSatisfied();
		});
	});

	test('does not guess release membership for a cherry-picked commit or accept a moved tag', async () => {
		await withServer(async server => {
			const { evaluate, repository } = setup(server);
			server.enqueue(
				releasesStep([rawRelease(repository, 1)]),
				tagStep('v1', releaseSha),
				ancestryStep(integratedSha, releaseSha, false),
				releasesStep([rawRelease(repository, 1)]),
				tagStep('v1', releaseSha),
				ancestryStep(integratedSha, releaseSha, true),
				releasesStep([rawRelease(repository, 1)]),
				tagStep('v1', headSha),
			);
			assert.deepStrictEqual([
				(await evaluate('vscode.github/commit-in-release@1', releaseContext(repository))).kind,
				(await evaluate('vscode.github/commit-in-release@1', releaseContext(repository))).kind,
			], ['waiting', 'waiting']);
			server.assertSatisfied();
		});
	});

	test('release rate limiting becomes a visible durable wait, not success', async () => {
		await withServer(async server => {
			const { evaluate, repository } = setup(server);
			server.enqueue(gitHubRestStep({ path: '/repos/octo/repo/releases', query: { per_page: 10, page: 1 }, response: gitHubRateLimitResponse({ retryAfterSeconds: 60 }) }));
			const result = await evaluate('vscode.github/commit-in-release@1', releaseContext(repository));
			assert.deepStrictEqual(result.kind === 'waiting' ? { kind: result.kind, delay: result.retryAfterMs, visible: !!result.reason } : result, {
				kind: 'waiting', delay: 900_000, visible: true,
			});
			server.assertSatisfied();
		});
	});

	test('does not turn a release that becomes a draft during observation into a successful condition', async () => {
		await withServer(async server => {
			const { evaluate, repository } = setup(server);
			server.enqueue(
				releasesStep([rawRelease(repository, 1)]),
				tagStep('v1', releaseSha),
				ancestryStep(integratedSha, releaseSha, true),
				releasesStep([rawRelease(repository, 1, { draft: true })]),
				tagStep('v1', releaseSha),
			);
			assert.strictEqual((await evaluate('vscode.github/commit-in-release@1', releaseContext(repository))).kind, 'waiting');
			server.assertSatisfied();
		});
	});

	test('cancels an in-flight release observation without leaving a subscription or accepting proof', async () => {
		await withServer(async server => {
			const { evaluate, repository, clock, lifetime } = setup(server);
			const requested = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			server.enqueue(gitHubRestStep({
				path: '/repos/octo/repo/releases',
				query: { per_page: 10, page: 1 },
				assert: () => requested.complete(),
				waitFor: release.p,
				response: gitHubJsonResponse([]),
			}));
			const cancellation = disposables.add(new CancellationTokenSource());
			const result = evaluate('vscode.github/commit-in-release@1', releaseContext(repository), cancellation.token);
			const rejected = assert.rejects(result, { name: 'Canceled' });
			await requested.p;
			cancellation.cancel();
			await rejected;
			await release.complete();
			lifetime.dispose();
			assert.strictEqual(clock.pendingCount, 0);
			server.assertSatisfied();
		});
	});

	test('unregisters every check on disposal', () => {
		const { registration, registry } = setup();
		assert.strictEqual(registry.checks.size, 9);
		registration.dispose();
		assert.strictEqual(registry.checks.size, 0);
	});
});

function context(repository: string, pullRequest: string, changes: Partial<WorkflowCheckContext>): WorkflowCheckContext {
	const type = builtinWorkflowCheckpointTypes.find(type => type.id === 'vscode.workflow/draft-pr')!;
	const checkpoint: ResolvedWorkflowCheckpoint = { id: 'checkpoint', type, label: type.label, instructions: type.instructions, inputs: {} };
	const run: WorkflowRun = {
		id: 'run', version: 1, revision: 0, session: 'session', chat: 'chat', workspace: planRoot.toString(), task: 'Feature',
		inputs: { repository }, snapshot: { id: 'test/feature', version: 1, label: 'Feature', checkpoints: [checkpoint] },
		stopAfter: checkpoint.id, status: 'running', checkpointIndex: 0, receipts: [], firstTurns: {},
		createdAt: 0, updatedAt: 0, activityAt: 0,
	};
	return { run, checkpoint, inputs: { repository, pullRequest }, proof: { uri: pullRequest }, options: {}, ...changes };
}

function releaseContext(repository: string): Partial<WorkflowCheckContext> {
	return { inputs: { repository, commit: integratedSha }, options: { release: 'published-stable' }, proof: undefined };
}

function rawRelease(repository: string, id: number, changes: object = {}): object {
	return { id, tag_name: `v${id}`, html_url: `${repository}/releases/tag/v${id}`, draft: false, prerelease: false, published_at: '2026-09-01T12:00:00Z', ...changes };
}

function rawIssue(repository: string, number: number): object {
	return {
		number, title: 'Test plan item', body: '', html_url: `${repository}/issues/${number}`, state: 'open',
		assignees: [], labels: [], created_at: '2026-09-01T12:00:00Z', updated_at: '2026-09-01T12:00:00Z',
	};
}

function releasesStep(releases: readonly object[], page = 1, link?: string) {
	return gitHubRestStep({ path: '/repos/octo/repo/releases', query: { per_page: 10, page }, response: gitHubJsonResponse(releases, { link }) });
}

function tagStep(name: string, sha: string) {
	return gitHubRestStep({ path: `/repos/octo/repo/git/ref/tags/${name}`, response: gitHubJsonResponse({ ref: `refs/tags/${name}`, object: { type: 'commit', sha } }) });
}

function ancestryStep(base: string, head: string, ancestor: boolean) {
	return gitHubRestStep({
		path: `/repos/octo/repo/compare/${base}...${head}`, query: { per_page: 1, page: 2 },
		response: gitHubJsonResponse({ base_commit: { sha: base }, merge_base_commit: { sha: ancestor ? base : head }, status: ancestor ? 'ahead' : 'diverged' }),
	});
}
