/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { readSessionArtifacts, SessionArtifactType, withSessionArtifacts, type ISessionArtifact } from '../../common/sessionArtifacts.js';
import { readSessionGitHubState, readSessionGitState, SessionStatus, withSessionGitHubState, withSessionGitState, type ISessionGitHubState, type ISessionGitState, type ISessionWithDefaultChat, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentHostPullRequestAssociationResolver } from '../../node/agentHostPullRequestAssociationResolver.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import type { AutoMergeMethod, CreatedPullRequest, GitHubIssueOrPullRequest, IAgentHostOctoKitService } from '../../node/shared/agentHostOctoKitService.js';
import { createNoopGitService } from '../common/sessionTestHelpers.js';

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

class TestOctoKitService implements IAgentHostOctoKitService {
	declare readonly _serviceBrand: undefined;

	readonly candidateCalls: Array<readonly string[] | undefined> = [];
	branchResult: CreatedPullRequest | undefined;
	branchError: Error | undefined;
	onFindByBranch: (() => void) | undefined;

	async createPullRequest(_owner: string, _repo: string, _title: string, _body: string, _head: string, _base: string, _draft: boolean, _token: string, _signal: AbortSignal): Promise<CreatedPullRequest> {
		throw new Error('Not implemented');
	}

	async findPullRequestByHeadBranch(_owner: string, _repo: string, _branch: string, _token: string, _signal: AbortSignal, _headOwner?: string, allowedPullRequestUrls?: readonly string[]): Promise<CreatedPullRequest | undefined> {
		this.candidateCalls.push(allowedPullRequestUrls ? [...allowedPullRequestUrls] : undefined);
		this.onFindByBranch?.();
		if (this.branchError) {
			throw this.branchError;
		}
		return this.branchResult;
	}

	async findPullRequestByHeadSha(_owner: string, _repo: string, _sha: string, _token: string, _signal: AbortSignal, _allowedPullRequestUrls?: readonly string[]): Promise<CreatedPullRequest | undefined> {
		return undefined;
	}

	async getIssueOrPullRequest(_owner: string, _repo: string, _number: number, _token: string, _signal: AbortSignal): Promise<GitHubIssueOrPullRequest> {
		throw new Error('Not implemented');
	}

	async enablePullRequestAutoMerge(_pullRequestId: string, _mergeMethod: AutoMergeMethod, _token: string, _signal: AbortSignal): Promise<void> {
		throw new Error('Not implemented');
	}
}

suite('AgentHostPullRequestAssociationResolver', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(options?: {
		readonly gitState?: ISessionGitState;
		readonly gitHubState?: ISessionGitHubState;
		readonly artifacts?: readonly ISessionArtifact[];
	}) {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const octoKitService = new TestOctoKitService();
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			revParse: async () => undefined,
		};
		const resolver = disposables.add(new AgentHostPullRequestAssociationResolver(gitService, octoKitService));
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
			const gitHubState = readSessionGitHubState(getSessionState()._meta);
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
				getAuthToken: () => 'token',
				getCurrentSessionState: getSessionState,
				isRestrictedMode: () => true,
			});
			if (result.kind === 'complete' && result.changed) {
				stateManager.setSessionMeta(SESSION, withSessionGitHubState(getSessionState()._meta, result.gitHubState));
			}
			return result;
		};
		const setArtifacts = (artifacts: readonly ISessionArtifact[]) => {
			stateManager.setSessionMeta(SESSION, withSessionArtifacts(getSessionState()._meta, artifacts));
		};
		const updateGitHubState = (patch: ISessionGitHubState) => {
			stateManager.setSessionMeta(SESSION, withSessionGitHubState(getSessionState()._meta, { ...getGitHubState(), ...patch }));
		};
		const setGitState = (gitState: ISessionGitState) => {
			stateManager.setSessionMeta(SESSION, withSessionGitState(getSessionState()._meta, gitState));
		};

		return { octoKitService, getGitHubState, getSessionState, reconcile, setArtifacts, setGitState, updateGitHubState };
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
			candidateCalls: h.octoKitService.candidateCalls,
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
		h.octoKitService.branchResult = { url: firstArtifact.link, number: 1, state: 'open' };
		await h.reconcile();

		h.setArtifacts([firstArtifact, secondArtifact]);
		h.octoKitService.branchResult = { url: secondArtifact.link, number: 2, state: 'open' };
		await h.reconcile();

		assert.deepStrictEqual({
			candidateCalls: h.octoKitService.candidateCalls,
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
		h.octoKitService.branchResult = { url: secondArtifact.link, number: 2, state: 'open' };
		await h.reconcile();

		h.updateGitHubState({ pullRequestState: 'closed', pullRequestStateUrl: secondArtifact.link });
		h.octoKitService.branchResult = { url: firstArtifact.link, number: 1, state: 'open' };
		await h.reconcile();

		assert.deepStrictEqual({
			candidateCalls: h.octoKitService.candidateCalls,
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
			candidateCalls: h.octoKitService.candidateCalls,
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
		h.octoKitService.branchResult = { url: artifact.link, number: 1, state: 'open' };
		await h.reconcile();

		h.setArtifacts([]);
		await h.reconcile();

		assert.deepStrictEqual({
			candidateCalls: h.octoKitService.candidateCalls,
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
			candidateCalls: h.octoKitService.candidateCalls,
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
		h.octoKitService.branchResult = { url: artifact.link, number: 1, state: 'open' };
		await h.reconcile();

		h.setGitState({ branchName: 'other', baseBranchName: 'main' });
		h.octoKitService.branchResult = undefined;
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
		h.octoKitService.branchResult = { url: firstArtifact.link, number: 1, state: 'open' };
		h.octoKitService.onFindByBranch = () => h.setArtifacts([firstArtifact, secondArtifact]);

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
		h.octoKitService.branchError = new Error('GitHub unavailable');

		const result = await h.reconcile();

		assert.deepStrictEqual(result, {
			kind: 'failed',
			changed: true,
			gitHubState: { owner: 'microsoft', repo: 'vscode' },
			error: new Error('GitHub unavailable'),
		});
	});
});
