/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { readSessionArtifacts, SessionArtifactType, withSessionArtifacts, type ISessionArtifact } from '../../common/sessionArtifacts.js';
import { readSessionGitHubState, readSessionGitState, SessionStatus, withSessionGitHubState, withSessionGitState, type ISessionGitHubState, type ISessionGitState, type ISessionWithDefaultChat, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentHostPullRequestAssociationResolver } from '../../node/agentHostPullRequestAssociationResolver.js';
import { IAgentHostGitHubService } from '../../node/agentHostGitHubService.js';
import { IAgentHostAuthenticationService, IAgentHostAuthTokenChangeEvent } from '../../node/agentHostAuthenticationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { GitHubPullRequestLookup, GitHubPullRequestLookupOptions, GitHubRepositoryRef } from '../../../github/common/githubQueryService.js';
import { IGitHubQuery } from '../../../github/common/githubQueryServiceImpl.js';
import { createNoopGitService } from '../common/sessionTestHelpers.js';
import { createTestAgentHostGitHubService, createTestGitHubClient, createTestGitHubService, createTestPullRequest } from './testGitHubService.js';
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

class TestGitHubQuery extends mock<IGitHubQuery>() {
	readonly candidateCalls: Array<readonly string[] | undefined> = [];
	branchResult: GitHubPullRequestLookup | undefined;
	branchError: Error | undefined;
	onFindByBranch: (() => void) | undefined;

	override async findPullRequestByHeadBranch(_ref: GitHubRepositoryRef, _branch: string, _headOwner: string | undefined, _signal: AbortSignal, options?: GitHubPullRequestLookupOptions): Promise<GitHubPullRequestLookup | undefined> {
		const allowedPullRequestUrls = options?.allowedPullRequestUrls;
		this.candidateCalls.push(allowedPullRequestUrls ? [...allowedPullRequestUrls] : undefined);
		this.onFindByBranch?.();
		if (this.branchError) {
			throw this.branchError;
		}
		return this.branchResult;
	}

	override async findPullRequestByHeadSha(): Promise<GitHubPullRequestLookup | undefined> {
		return undefined;
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
	}) {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const query = new TestGitHubQuery();
		const gitService: IAgentHostGitService = options?.gitService ?? {
			...createNoopGitService(),
			revParse: async () => undefined,
		};
		const resolver = disposables.add(new AgentHostPullRequestAssociationResolver(gitService, options?.gitHubService ?? createTestGitHubService(createTestGitHubClient({ query }))));
		const summary: SessionSummary = {
			resource: SESSION,
			provider: 'mock',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			workingDirectories: [WORKING_DIRECTORY],
		};
		stateManager.restoreSession(summary, []);
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
			const gitHubService = disposables.add(createTestAgentHostGitHubService({
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
					return new Response(JSON.stringify([{ number: 7, html_url: url, node_id: 'PR7', state: 'open', head: { sha: 'exact-head' } }]));
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

			assert.deepStrictEqual({ result, requests }, {
				result: transition === 'token renewal' ? {
					ref: { host: 'api.github.com', accountId: '101', owner: 'microsoft', repo: 'vscode', number: 7 },
					id: 'PR7', url, createdAt: undefined, state: 'open',
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
			candidateCalls: h.query.candidateCalls,
		}, {
			gitHubState: { owner: 'microsoft', repo: 'vscode' },
			artifacts: [reference],
			candidateCalls: [],
		});
	});

	test('rechecks the same branch when a newer PR artifact is added', async () => {
		const firstArtifact = pullRequestArtifact(1);
		const secondArtifact = pullRequestArtifact(2);
		const h = createHarness({ artifacts: [firstArtifact] });
		h.query.branchResult = createTestPullRequest(1, { url: firstArtifact.link, state: 'open' });
		await h.reconcile();

		h.setArtifacts([firstArtifact, secondArtifact]);
		h.query.branchResult = createTestPullRequest(2, { url: secondArtifact.link, state: 'open' });
		await h.reconcile();

		assert.deepStrictEqual({
			candidateCalls: h.query.candidateCalls,
			gitHubState: h.getGitHubState(),
		}, {
			candidateCalls: [
				['https://github.com/microsoft/vscode/pull/1'],
				['https://github.com/microsoft/vscode/pull/2', 'https://github.com/microsoft/vscode/pull/1'],
			],
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
		h.query.branchResult = createTestPullRequest(2, { url: secondArtifact.link, state: 'open' });
		await h.reconcile();

		h.updateGitHubState({ pullRequestState: 'closed', pullRequestStateUrl: secondArtifact.link });
		h.query.branchResult = createTestPullRequest(1, { url: firstArtifact.link, state: 'open' });
		await h.reconcile();

		assert.deepStrictEqual({
			candidateCalls: h.query.candidateCalls,
			gitHubState: h.getGitHubState(),
		}, {
			candidateCalls: [
				['https://github.com/microsoft/vscode/pull/2', 'https://github.com/microsoft/vscode/pull/1'],
				['https://github.com/microsoft/vscode/pull/2', 'https://github.com/microsoft/vscode/pull/1'],
			],
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
			candidateCalls: h.query.candidateCalls,
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
			candidateCalls: [],
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
		h.query.branchResult = createTestPullRequest(1, { url: artifact.link, state: 'open' });
		await h.reconcile();

		h.setArtifacts([]);
		await h.reconcile();

		assert.deepStrictEqual({
			candidateCalls: h.query.candidateCalls,
			gitHubState: h.getGitHubState(),
		}, {
			candidateCalls: [['https://github.com/microsoft/vscode/pull/1']],
			gitHubState: { owner: 'microsoft', repo: 'vscode' },
		});
	});

	test('keeps an off-branch PR artifact visible without repeatedly querying it', async () => {
		const artifact = pullRequestArtifact(2);
		const h = createHarness({ artifacts: [artifact] });

		await h.reconcile();
		await h.reconcile();

		assert.deepStrictEqual({
			candidateCalls: h.query.candidateCalls,
			gitHubState: h.getGitHubState(),
			artifacts: readSessionArtifacts(h.getSessionState()._meta),
		}, {
			candidateCalls: [['https://github.com/microsoft/vscode/pull/2']],
			gitHubState: { owner: 'microsoft', repo: 'vscode' },
			artifacts: [artifact],
		});
	});

	test('retains a verified PR under its previous branch after the checkout changes', async () => {
		const artifact = pullRequestArtifact(1);
		const h = createHarness({ artifacts: [artifact] });
		h.query.branchResult = createTestPullRequest(1, { url: artifact.link, state: 'open' });
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
		h.query.branchResult = createTestPullRequest(1, { url: firstArtifact.link, state: 'open' });
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
