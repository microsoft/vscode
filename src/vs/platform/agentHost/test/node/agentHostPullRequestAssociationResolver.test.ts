/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { readSessionArtifacts, SessionArtifactType, withSessionArtifacts, type ISessionArtifact } from '../../common/sessionArtifacts.js';
import { buildDefaultChatUri, readSessionGitHubState, readSessionGitState, SessionStatus, withSessionGitHubState, withSessionGitState, type ISessionGitHubState, type ISessionGitState, type ISessionWithDefaultChat } from '../../common/state/sessionState.js';
import { AgentHostPullRequestAssociationResolver, findPullRequestByHeadBranch } from '../../node/agentHostPullRequestAssociationResolver.js';
import { AgentHostGitHubService, IAgentHostGitHubService } from '../../node/agentHostGitHubService.js';
import { IAgentHostAuthenticationService, IAgentHostAuthTokenChangeEvent } from '../../node/agentHostAuthenticationService.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { RepositoryRef } from '../../../github/common/client/types.js';
import { IPullRequestsClient, ListPullRequestsOptions, PullRequestSummary } from '../../../github/common/core/pullRequests.js';
import { GitHubRequestError } from '../../../github/common/githubTypes.js';
import { RequestFetch } from '../../../github/common/types.js';
import { createNoopGitService } from '../common/sessionTestHelpers.js';
import { createTestGitHubService, createTestPullRequestSummary } from './testGitHubService.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';

const SESSION = 'mock:/session-1';
const WORKING_DIRECTORY = 'file:///wd';

type PullRequestArtifact = ISessionArtifact & { readonly link: string };

function pullRequestArtifact(number: number, isArtifact = true): PullRequestArtifact {
	return {
		id: `pr-${number}`,
		type: SessionArtifactType.PullRequest,
		label: `Pull request ${number}`,
		isArtifact,
		link: `https://github.com/microsoft/vscode/pull/${number}`,
		isGitHub: true,
	};
}

class TestPullRequestsClient extends mock<IPullRequestsClient>() {
	readonly pageSizes: Array<number | undefined> = [];
	branchResult: PullRequestSummary | undefined;
	branchError: Error | undefined;
	onFindByBranch: (() => void) | undefined;

	override async list(_repository: RepositoryRef, _signal: AbortSignal, options?: ListPullRequestsOptions): Promise<readonly PullRequestSummary[]> {
		this.pageSizes.push(options?.query?.per_page);
		this.onFindByBranch?.();
		if (this.branchError) {
			throw this.branchError;
		}
		return this.branchResult ? [this.branchResult] : [];
	}

	override async listForCommit(): Promise<readonly PullRequestSummary[]> {
		return [];
	}
}

suite('AgentHostPullRequestAssociationResolver', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(options?: {
		readonly gitState?: ISessionGitState;
		readonly gitHubState?: ISessionGitHubState;
		readonly artifacts?: readonly ISessionArtifact[];
		readonly gitService?: IAgentHostGitService;
		readonly gitHubService?: IAgentHostGitHubService;
		readonly logService?: ILogService;
	}) {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const query = new TestPullRequestsClient();
		const gitService: IAgentHostGitService = options?.gitService ?? {
			...createNoopGitService(),
			revParse: async () => undefined,
		};
		const resolver = disposables.add(new AgentHostPullRequestAssociationResolver(gitService, options?.gitHubService ?? createTestGitHubService(undefined, undefined, { pullRequests: query }), options?.logService ?? new NullLogService()));
		const summary = {
			resource: SESSION,
			defaultChat: buildDefaultChatUri(SESSION),
			provider: 'mock',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			workingDirectories: [WORKING_DIRECTORY],
		};
		stateManager.restoreSession(summary, [], creationTimeChatStorageResource);
		stateManager.setSessionMeta(SESSION, withSessionArtifacts(
			withSessionGitHubState(
				withSessionGitState(undefined, options?.gitState ?? { branchName: 'feature', baseBranchName: 'main' }),
				WORKING_DIRECTORY,
				options?.gitHubState ?? { owner: 'microsoft', repo: 'vscode' },
			),
			options?.artifacts ?? [],
		));

		const getSessionState = (): ISessionWithDefaultChat => {
			const state = stateManager.getSessionState(SESSION);
			assert.ok(state);
			return state;
		};
		const getGitHubState = (): ISessionGitHubState => {
			const gitHubState = readSessionGitHubState(getSessionState()._meta, WORKING_DIRECTORY);
			assert.ok(gitHubState);
			return gitHubState;
		};
		const reconcile = async () => {
			const sessionState = getSessionState();
			const gitState = readSessionGitState(sessionState._meta);
			const result = await resolver.reconcileRestricted({
				sessionKey: SESSION,
				sessionState,
				gitHubState: getGitHubState(),
				gitState,
				hasGitHubToken: () => true,
				getCurrentSessionState: getSessionState,
				isRestrictedMode: () => true,
			});
			if (result.kind === 'complete' && result.changed) {
				stateManager.setSessionMeta(SESSION, withSessionGitHubState(getSessionState()._meta, WORKING_DIRECTORY, result.gitHubState));
			}
			return result;
		};
		const setArtifacts = (artifacts: readonly ISessionArtifact[]) => {
			stateManager.setSessionMeta(SESSION, withSessionArtifacts(getSessionState()._meta, artifacts));
		};
		const updateGitHubState = (patch: ISessionGitHubState) => {
			stateManager.setSessionMeta(SESSION, withSessionGitHubState(getSessionState()._meta, WORKING_DIRECTORY, { ...getGitHubState(), ...patch }));
		};
		const setGitState = (gitState: ISessionGitState) => {
			stateManager.setSessionMeta(SESSION, withSessionGitState(getSessionState()._meta, gitState));
		};

		return { query, resolver, getGitHubState, getSessionState, reconcile, setArtifacts, setGitState, updateGitHubState };
	}

	function createLookupService(fetch: RequestFetch) {
		const authentication = new class extends mock<IAgentHostAuthenticationService>() {
			override readonly onDidChangeAuthToken = Event.None;
			override getAuthAccount() { return undefined; }
			override getAuthToken() { return 'repository-token'; }
		}();
		const service = disposables.add(new AgentHostGitHubService({
			fetch: (input, init) => new URL(String(input)).pathname === '/user' ? Promise.resolve(Response.json({ id: 1 })) : fetch(input, init),
		}, authentication, createTestGitHubEndpointService(), new NullLogService(), NullTelemetryService));
		return service;
	}

	for (const lookup of ['branch', 'sha'] as const) {
		for (const selection of [
			{ name: 'prefers open candidates in caller order, not response order', allowed: [2, 4, 3], selected: 4 },
			{ name: 'accepts a closed candidate when no allowed candidate is open', allowed: [2], selected: 2 },
			{ name: 'does not substitute an unapproved candidate', allowed: [9], selected: undefined },
		]) {
			test(`${lookup} lookup ${selection.name}`, async () => {
				const requests: { path: string; query: Record<string, string> }[] = [];
				const service = createLookupService(async input => {
					const url = new URL(String(input));
					requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) });
					return Response.json(lookup === 'sha' && url.pathname.endsWith('/pulls') && !url.pathname.includes('/commits/')
						? []
						: [1, 3, 2, 4].map(number => createTestPullRequestSummary(number, { state: number === 2 ? 'closed' : 'open' })));
				});
				const h = createHarness({ gitHubService: service, gitService: { ...createNoopGitService(), revParse: async () => 'head' } });
				const allowed = selection.allowed.map(number => ` HTTPS://GITHUB.COM/MICROSOFT/VSCODE/PULL/${number}/// `);
				const result = await h.resolver.resolveForCheckout(h.getSessionState(), 'microsoft', 'vscode',
					{ githubHeadOwner: 'fork', upstreamBranchName: 'upstream/feature/test' }, 'local-branch', allowed);
				assert.deepStrictEqual({ selected: result?.number, requests }, {
					selected: selection.selected,
					requests: [
						{ path: '/repos/microsoft/vscode/pulls', query: { head: 'fork:feature/test', state: 'all', sort: 'updated', direction: 'desc', per_page: '100' } },
						...(lookup === 'sha' || selection.selected === undefined ? [{ path: '/repos/microsoft/vscode/commits/head/pulls', query: { per_page: '100' } }] : []),
					],
				});
			});
		}
	}

	test('an unrestricted branch lookup asks for one most-recent PR and an empty approved set does no work', async () => {
		const requests: Record<string, string>[] = [];
		const service = createLookupService(async input => {
			requests.push(Object.fromEntries(new URL(String(input)).searchParams));
			return Response.json([createTestPullRequestSummary(9, { state: 'closed' })]);
		});
		const h = createHarness({ gitHubService: service });
		const empty = await h.resolver.resolveForCheckout(h.getSessionState(), 'microsoft', 'vscode', undefined, 'feature', []);
		const result = await h.resolver.resolveForCheckout(h.getSessionState(), 'microsoft', 'vscode', undefined, 'feature');
		assert.deepStrictEqual({ empty, number: result?.number, requests }, {
			empty: undefined, number: 9,
			requests: [{ head: 'microsoft:feature', state: 'all', sort: 'updated', direction: 'desc', per_page: '1' }],
		});
	});

	for (const scenario of [
		{ name: 'does not match a contained commit even when approved', values: [createTestPullRequestSummary(1, { head: { label: 'o:branch', ref: 'branch', sha: 'other', repo: null } })], allowed: [1], selected: undefined },
		{ name: 'prefers the unique open exact head over closed heads', values: [createTestPullRequestSummary(1, { state: 'closed' }), createTestPullRequestSummary(2)], selected: 2 },
		{ name: 'accepts a unique closed head', values: [createTestPullRequestSummary(1, { state: 'closed' })], selected: 1 },
		{ name: 'rejects ambiguous open heads', values: [createTestPullRequestSummary(1), createTestPullRequestSummary(2)], selected: undefined },
		{ name: 'rejects ambiguous closed heads', values: [createTestPullRequestSummary(1, { state: 'closed' }), createTestPullRequestSummary(2, { state: 'closed' })], selected: undefined },
	]) {
		test(`head-SHA lookup ${scenario.name}`, async () => {
			const service = createLookupService(async input => Response.json(new URL(String(input)).pathname.includes('/commits/') ? scenario.values : []));
			const h = createHarness({ gitHubService: service, gitService: { ...createNoopGitService(), revParse: async () => 'head' } });
			const result = await h.resolver.resolveForCheckout(h.getSessionState(), 'microsoft', 'vscode', undefined, 'feature',
				scenario.allowed?.map(number => `https://github.com/microsoft/vscode/pull/${number}`));
			assert.strictEqual(result?.number, scenario.selected);
		});
	}

	for (const count of [99, 100]) {
		test(`head-SHA lookup requires a complete first page (${count} results)`, async () => {
			const warnings: string[] = [];
			const responses = Array.from({ length: count }, (_, index) => createTestPullRequestSummary(index + 1, {
				head: { label: 'o:branch', ref: 'branch', sha: index === 0 ? 'head' : 'other', repo: null },
			}));
			const service = createLookupService(async input => Response.json(new URL(String(input)).pathname.includes('/commits/') ? responses : []));
			const h = createHarness({
				gitHubService: service, gitService: { ...createNoopGitService(), revParse: async () => 'head' },
				logService: new class extends NullLogService { override warn(message: string) { warnings.push(message); } }(),
			});
			const result = await h.resolver.resolveForCheckout(h.getSessionState(), 'microsoft', 'vscode', undefined, 'feature');
			assert.deepStrictEqual({ number: result?.number, warnings }, {
				number: count === 99 ? 1 : undefined,
				warnings: count === 99 ? [] : ['[AgentHostPullRequestAssociationResolver] Not resolving a pull request for head: the first page of associated pull requests is full'],
			});
		});
	}

	for (const response of [
		{ name: 'missing commit', body: '{"message":"No commit found for SHA: head"}', status: 422, missing: true },
		{ name: 'different validation failure', body: '{"message":"Validation Failed"}', status: 422, missing: false },
	]) {
		test(`head-SHA lookup classifies ${response.name} without retrying`, async () => {
			const paths: string[] = [];
			const service = createLookupService(async input => {
				const path = new URL(String(input)).pathname;
				paths.push(path);
				return path.includes('/commits/') ? new Response(response.body, { status: response.status }) : Response.json([]);
			});
			const h = createHarness({ gitHubService: service, gitService: { ...createNoopGitService(), revParse: async () => 'head' } });
			const pending = h.resolver.resolveForCheckout(h.getSessionState(), 'microsoft', 'vscode', undefined, 'feature');
			if (response.missing) {
				assert.strictEqual(await pending, undefined);
			} else {
				await assert.rejects(pending, error => error instanceof GitHubRequestError && error.statusCode === response.status);
			}
			assert.deepStrictEqual(paths, ['/repos/microsoft/vscode/pulls', '/repos/microsoft/vscode/commits/head/pulls']);
		});
	}

	test('a branch-only verification never falls back to a contained commit', async () => {
		const paths: string[] = [];
		const service = createLookupService(async input => {
			paths.push(new URL(String(input)).pathname);
			return Response.json([]);
		});
		const h = createHarness({ gitHubService: service, gitService: { ...createNoopGitService(), revParse: async () => assert.fail('Must not read HEAD') } });
		const result = await h.resolver.resolveForCheckout(h.getSessionState(), 'microsoft', 'vscode', undefined, 'feature', undefined, WORKING_DIRECTORY, true);
		assert.deepStrictEqual({ result, paths }, { result: undefined, paths: ['/repos/microsoft/vscode/pulls'] });
	});

	test('approved lookups coalesce across callers, cancel independently and reuse their ETag', async () => {
		const started = new DeferredPromise<AbortSignal>();
		const release = new DeferredPromise<void>();
		const etags: (string | null)[] = [];
		const service = createLookupService(async (_input, init) => {
			const etag = new Headers(init?.headers).get('If-None-Match');
			etags.push(etag);
			if (etag) {
				return new Response(null, { status: 304 });
			}
			assert.ok(init?.signal);
			await started.complete(init.signal);
			await release.p;
			return Response.json([createTestPullRequestSummary(3), createTestPullRequestSummary(4)], { headers: { ETag: '"lookup"' } });
		});
		const client = disposables.add(service.acquireRepositoryApiClient(new AbortController().signal));
		const repository = { owner: 'microsoft', repo: 'vscode' };
		const controller = new AbortController();
		const firstOptions = { allowedPullRequestUrls: ['https://github.com/microsoft/vscode/pull/3'] };
		const rejected = assert.rejects(findPullRequestByHeadBranch(client.pullRequests, repository, 'microsoft:branch', controller.signal, firstOptions));
		const peer = findPullRequestByHeadBranch(client.pullRequests, repository, 'microsoft:branch', new AbortController().signal, { allowedPullRequestUrls: ['https://github.com/microsoft/vscode/pull/4'] });
		const wireSignal = await started.p;
		controller.abort();
		await rejected;
		await release.complete();
		const selected = await peer;
		const revalidated = await findPullRequestByHeadBranch(client.pullRequests, repository, 'microsoft:branch', new AbortController().signal, firstOptions);
		assert.deepStrictEqual({ peer: selected?.number, revalidated: revalidated?.number, etags, aborted: wireSignal.aborted }, {
			peer: 4, revalidated: 3, etags: [null, '"lookup"'], aborted: false,
		});
	});

	for (const transition of ['token renewal', 'account change', 'disposal'] as const) {
		test(`head-SHA fallback handles ${transition} during the git lookup`, async () => {
			const endpoint = createTestGitHubEndpointService();
			const changed = disposables.add(new Emitter<IAgentHostAuthTokenChangeEvent>());
			let token = 'first-token';
			let accountId = 'first-account';
			const authentication = new class extends mock<IAgentHostAuthenticationService>() {
				override readonly onDidChangeAuthToken = changed.event;
				override getAuthAccount() { return { providerId: 'github', accountId }; }
				override getAuthToken() { return token; }
			}();
			const requests: string[] = [];
			const url = 'https://github.com/microsoft/vscode/pull/7';
			const gitHubService = disposables.add(new AgentHostGitHubService({
				fetch: async (input, init) => {
					const path = new URL(String(input)).pathname;
					requests.push(`${init?.method}:${path}:${new Headers(init?.headers).get('Authorization')}`);
					if (path === '/user') {
						return new Response(JSON.stringify({ id: accountId === 'first-account' ? 101 : 202 }));
					}
					if (path === '/repos/microsoft/vscode/pulls') {
						return new Response('[]');
					}
					assert.strictEqual(path, '/repos/microsoft/vscode/commits/exact-head/pulls');
					return Response.json([createTestPullRequestSummary(7, { html_url: url, node_id: 'PR7', head: { label: 'microsoft:feature', ref: 'feature', sha: 'exact-head', repo: null } })]);
				},
			}, authentication, endpoint, new NullLogService(), NullTelemetryService));
			const h = createHarness({
				gitHubService,
				gitService: {
					...createNoopGitService(),
					revParse: async () => {
						token = 'renewed-token';
						if (transition === 'account change') {
							accountId = 'second-account';
						}
						changed.fire({ resource: endpoint.getRepoResource().resource, scopes: ['repo'], token });
						if (transition === 'disposal') {
							resolver.dispose();
						}
						return 'exact-head';
					},
				},
			});
			const resolver = h.resolver;
			const pending = resolver.resolveForCheckout(h.getSessionState(), 'microsoft', 'vscode', undefined, 'feature', [url]);
			const result = transition === 'token renewal' ? await pending : await assert.rejects(pending).then(() => undefined);

			assert.deepStrictEqual({ result: result && { number: result.number, id: result.node_id, url: result.html_url, state: result.state }, requests }, {
				result: transition === 'token renewal' ? {
					number: 7, id: 'PR7', url, state: 'open',
				} : undefined,
				requests: [
					'GET:/user:Bearer first-token',
					'GET:/repos/microsoft/vscode/pulls:Bearer first-token',
					...(transition === 'token renewal' ? ['GET:/user:Bearer renewed-token', 'GET:/repos/microsoft/vscode/commits/exact-head/pulls:Bearer renewed-token'] : []),
				],
			});
		});
	}

	test('ignores PR references and removes an automatically discovered PR', async () => {
		const reference = pullRequestArtifact(2, false);
		const h = createHarness({
			gitHubState: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
				pullRequestBranchName: 'feature',
			},
			artifacts: [reference],
		});

		await h.reconcile();

		assert.deepStrictEqual({
			gitHubState: h.getGitHubState(),
			artifacts: readSessionArtifacts(h.getSessionState()._meta),
			pageSizes: h.query.pageSizes,
		}, {
			gitHubState: { owner: 'microsoft', repo: 'vscode' },
			artifacts: [reference],
			pageSizes: [],
		});
	});

	test('rechecks the same branch when a newer PR artifact is added', async () => {
		const firstArtifact = pullRequestArtifact(1);
		const secondArtifact = pullRequestArtifact(2);
		const h = createHarness({ artifacts: [firstArtifact] });
		h.query.branchResult = createTestPullRequestSummary(1, { html_url: firstArtifact.link, state: 'open' });
		await h.reconcile();

		h.setArtifacts([firstArtifact, secondArtifact]);
		h.query.branchResult = createTestPullRequestSummary(2, { html_url: secondArtifact.link, state: 'open' });
		await h.reconcile();

		assert.deepStrictEqual({
			pageSizes: h.query.pageSizes,
			gitHubState: h.getGitHubState(),
		}, {
			pageSizes: [100, 100],
			gitHubState: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrls: [
					'https://github.com/microsoft/vscode/pull/2',
					'https://github.com/microsoft/vscode/pull/1',
				],
				pullRequestBranchName: 'feature',
			},
		});
	});

	test('rechecks multiple artifacts when the selected PR closes', async () => {
		const firstArtifact = pullRequestArtifact(1);
		const secondArtifact = pullRequestArtifact(2);
		const h = createHarness({ artifacts: [firstArtifact, secondArtifact] });
		h.query.branchResult = createTestPullRequestSummary(2, { html_url: secondArtifact.link, state: 'open' });
		await h.reconcile();

		h.updateGitHubState({ pullRequestState: 'closed', pullRequestStateUrl: secondArtifact.link });
		h.query.branchResult = createTestPullRequestSummary(1, { html_url: firstArtifact.link, state: 'open' });
		await h.reconcile();

		assert.deepStrictEqual({
			pageSizes: h.query.pageSizes,
			gitHubState: h.getGitHubState(),
		}, {
			pageSizes: [100, 100],
			gitHubState: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrls: [
					'https://github.com/microsoft/vscode/pull/1',
					'https://github.com/microsoft/vscode/pull/2',
				],
				pullRequestBranchName: 'feature',
			},
		});
	});

	test('trusts an explicitly associated PR without requiring an artifact lookup', async () => {
		const pullRequestUrl = 'https://github.com/microsoft/vscode/pull/1';
		const h = createHarness({
			gitHubState: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrls: [pullRequestUrl],
				associatedPullRequestUrls: [pullRequestUrl],
				pullRequestBranchName: 'feature',
			},
		});

		const result = await h.reconcile();

		assert.deepStrictEqual({
			result,
			pageSizes: h.query.pageSizes,
			gitHubState: h.getGitHubState(),
		}, {
			result: {
				kind: 'complete',
				changed: false,
				gitHubState: {
					owner: 'microsoft',
					repo: 'vscode',
					pullRequestUrls: [pullRequestUrl],
					associatedPullRequestUrls: [pullRequestUrl],
					pullRequestBranchName: 'feature',
				},
			},
			pageSizes: [],
			gitHubState: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrls: [pullRequestUrl],
				associatedPullRequestUrls: [pullRequestUrl],
				pullRequestBranchName: 'feature',
			},
		});
	});

	test('removes branch association when its PR artifact is removed', async () => {
		const artifact = pullRequestArtifact(1);
		const h = createHarness({ artifacts: [artifact] });
		h.query.branchResult = createTestPullRequestSummary(1, { html_url: artifact.link, state: 'open' });
		await h.reconcile();

		h.setArtifacts([]);
		await h.reconcile();

		assert.deepStrictEqual({
			pageSizes: h.query.pageSizes,
			gitHubState: h.getGitHubState(),
		}, {
			pageSizes: [100],
			gitHubState: { owner: 'microsoft', repo: 'vscode' },
		});
	});

	test('keeps an off-branch PR artifact visible without repeatedly querying it', async () => {
		const artifact = pullRequestArtifact(2);
		const h = createHarness({ artifacts: [artifact] });

		await h.reconcile();
		await h.reconcile();

		assert.deepStrictEqual({
			pageSizes: h.query.pageSizes,
			gitHubState: h.getGitHubState(),
			artifacts: readSessionArtifacts(h.getSessionState()._meta),
		}, {
			pageSizes: [100],
			gitHubState: { owner: 'microsoft', repo: 'vscode' },
			artifacts: [artifact],
		});
	});

	test('retains a verified PR under its previous branch after the checkout changes', async () => {
		const artifact = pullRequestArtifact(1);
		const h = createHarness({ artifacts: [artifact] });
		h.query.branchResult = createTestPullRequestSummary(1, { html_url: artifact.link, state: 'open' });
		await h.reconcile();

		h.setGitState({ branchName: 'other', baseBranchName: 'main' });
		h.query.branchResult = undefined;
		await h.reconcile();

		assert.deepStrictEqual(h.getGitHubState(), {
			owner: 'microsoft',
			repo: 'vscode',
			pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
			pullRequestBranchName: 'feature',
		});
	});

	test('requests a retry when artifacts change during a lookup', async () => {
		const firstArtifact = pullRequestArtifact(1);
		const secondArtifact = pullRequestArtifact(2);
		const h = createHarness({ artifacts: [firstArtifact] });
		h.query.branchResult = createTestPullRequestSummary(1, { html_url: firstArtifact.link, state: 'open' });
		h.query.onFindByBranch = () => h.setArtifacts([firstArtifact, secondArtifact]);

		const result = await h.reconcile();

		assert.deepStrictEqual({
			result,
			gitHubState: h.getGitHubState(),
			artifacts: readSessionArtifacts(h.getSessionState()._meta),
		}, {
			result: { kind: 'retry' },
			gitHubState: { owner: 'microsoft', repo: 'vscode' },
			artifacts: [firstArtifact, secondArtifact],
		});
	});

	test('returns restricted state together with lookup failures', async () => {
		const artifact = pullRequestArtifact(2);
		const h = createHarness({
			gitHubState: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
				pullRequestBranchName: 'feature',
			},
			artifacts: [artifact],
		});
		h.query.branchError = new Error('GitHub unavailable');

		const result = await h.reconcile();

		assert.deepStrictEqual(result, {
			kind: 'failed',
			changed: true,
			gitHubState: { owner: 'microsoft', repo: 'vscode' },
			error: new Error('GitHub unavailable'),
		});
	});
});
