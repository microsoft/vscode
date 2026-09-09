/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { mock } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitHubCredential, IGitHubCredentials } from '../../../github/common/githubCredentialService.js';
import { GitHubWorkflowJob, GitHubWorkflowRerunOptions, GitHubWorkflowRun, PullRequestMutationResult } from '../../../github/common/githubPullRequestMutationService.js';
import { PullRequestCheck, PullRequestRef, PullRequestSnapshot, PullRequestSubscription } from '../../../github/common/githubPullRequestService.js';
import { IGitHubService } from '../../../github/common/githubService.js';
import { IPullRequestMutations } from '../../../github/common/pullRequestMutationService.js';
import { IPullRequestResources } from '../../../github/common/pullRequestResourceService.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentMergeConfigKey, readAgentMergeSessionState } from '../../common/agentMerge.js';
import { parseAgentMergePrompt } from '../../common/agentMergePrompt.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { platformSessionSchema } from '../../common/agentHostSchema.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/protocol/common/actions.js';
import { buildDefaultChatUri, MessageKind, SessionStatus, withSessionGitHubState, withSessionGitState } from '../../common/state/sessionState.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';
import type { IAgentHostProviderService } from '../../node/agentHostProviderService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentMergeController } from '../../node/agentMergeController.js';
import { AgentMergeTools } from '../../node/agentMergeTools.js';

const ref: PullRequestRef = { host: 'api.github.com', accountId: '1', owner: 'octo', repo: 'repo', number: 1 };
const pullRequestUrl = 'https://github.com/octo/repo/pull/1';

suite('Agent Merge workflow reruns', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function withController(fn: (harness: RerunTestHarness) => Promise<void>): Promise<void> {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = disposables.add(new RerunTestHarness());
			try {
				await timeout(1);
				await fn(harness);
				assert.deepStrictEqual(harness.errors, []);
			} finally {
				harness.dispose();
			}
		});
	}

	test('starts CI repair and accepts a fixed head while sibling jobs are still running', () => withController(async h => {
		const prompt = parseAgentMergePrompt(h.prompts[0]);
		h.snapshot.set(readySnapshot([check('fixed', 'Build', 'IN_PROGRESS')], 'fixed-head'), undefined);
		await h.completeTurn();

		assert.deepStrictEqual({
			actions: prompt?.actions,
			failedChecks: prompt?.failedChecks,
			prompts: h.prompts.length,
			reruns: h.mutations.reruns,
			head: h.snapshot.get().core.value?.headSha,
		}, {
			actions: ['fixCI'],
			failedChecks: ['macOS'],
			prompts: 1,
			reruns: [],
			head: 'fixed-head',
		});
	}));

	test('defers a running workflow without spending more repair turns and reruns it exactly once', () => withController(async h => {
		const result = await h.tools.rerunFailedWorkflow(h.session, '1', true);
		await h.tools.rerunFailedWorkflow(h.session, '1', true);
		await h.completeTurn();
		await timeout(2 * 60 * 60_000);
		const whileWaiting = h.controllerState();

		h.mutations.runs = [{ ...h.mutations.runs[0], status: 'COMPLETED', conclusion: 'FAILURE' }];
		h.snapshot.set(readySnapshot([
			check('mac', 'macOS', 'COMPLETED', 'FAILURE'),
			check('windows', 'Windows', 'COMPLETED', 'SUCCESS'),
			check('other-workflow', 'Slow unrelated workflow', 'IN_PROGRESS', undefined, '2'),
		]), undefined);
		await timeout(31_000);
		await timeout(20 * 60_000);

		assert.deepStrictEqual({
			outcome: JSON.parse(result).outcome,
			whileWaiting,
			afterRerun: h.controllerState(),
			prompts: h.prompts.length,
			reruns: h.mutations.reruns.map(({ runId, expectedRunAttempt, failedJobsOnly }) => ({ runId, expectedRunAttempt, failedJobsOnly })),
		}, {
			outcome: 'deferred',
			whileWaiting: { enabled: true, totalPromptCount: 1, repeatedPromptCount: 0 },
			afterRerun: { enabled: true, totalPromptCount: 1, repeatedPromptCount: 0 },
			prompts: 1,
			reruns: [{ runId: '1', expectedRunAttempt: 1, failedJobsOnly: true }],
		});
	}));

	test('suppresses a newly deferred failure during the same turn without revoking its rerun authorization', () => withController(async h => {
		h.mutations.jobs = [{ id: 'mac-job', checkRunId: 'mac', runId: '1', name: 'macOS', conclusion: 'FAILURE' }];
		await h.tools.rerunFailedWorkflow(h.session, '1', true);
		const details = await h.tools.readFailedCI(h.session);
		const repeated = await h.tools.rerunFailedWorkflow(h.session, '1', true);

		assert.deepStrictEqual({
			details,
			annotationIds: h.mutations.annotationIds,
			logIds: h.mutations.logIds,
			repeatedOutcome: JSON.parse(repeated).outcome,
			reruns: h.mutations.reruns,
		}, {
			details: 'No failed required CI details are available.',
			annotationIds: [],
			logIds: [],
			repeatedOutcome: 'deferred',
			reruns: [],
		});
	}));

	test('does not authorize deferred failures from previous turns when a different workflow fails', () => withController(async h => {
		await h.tools.rerunFailedWorkflow(h.session, '1', true);
		await h.completeTurn();
		h.snapshot.set(readySnapshot([
			check('mac', 'macOS', 'COMPLETED', 'FAILURE'),
			check('windows', 'Windows', 'COMPLETED', 'FAILURE', '2'),
		]), undefined);
		h.mutations.runs.push({ id: '2', name: 'Windows CI', headSha: 'head', runAttempt: 1, status: 'IN_PROGRESS' });
		await timeout(31_000);

		await assert.rejects(h.tools.rerunFailedWorkflow(h.session, '1', true), /not associated with a failed required check/);
		const result = await h.tools.rerunFailedWorkflow(h.session, '2', true);
		assert.strictEqual(JSON.parse(result).outcome, 'deferred');
	}));

	test('diagnoses newly failed sibling jobs without reading the deferred failure again', () => withController(async h => {
		await h.tools.rerunFailedWorkflow(h.session, '1', true);
		await h.completeTurn();
		h.snapshot.set(readySnapshot([
			check('mac', 'macOS', 'COMPLETED', 'FAILURE'),
			check('windows', 'Windows', 'COMPLETED', 'FAILURE'),
		]), undefined);
		h.mutations.jobs = [
			{ id: 'mac-job', checkRunId: 'mac', runId: '1', name: 'macOS', conclusion: 'FAILURE' },
			{ id: 'windows-job', checkRunId: 'windows', runId: '1', name: 'Windows', conclusion: 'FAILURE' },
		];
		await timeout(31_000);
		await h.tools.readFailedCI(h.session);
		await h.tools.rerunFailedWorkflow(h.session, '1', true);
		await h.completeTurn();
		await timeout(40 * 60_000);

		assert.deepStrictEqual({
			failures: h.prompts.map(prompt => parseAgentMergePrompt(prompt)?.failedChecks),
			annotationIds: h.mutations.annotationIds,
			logIds: h.mutations.logIds,
			reruns: h.mutations.reruns,
			state: h.controllerState(),
		}, {
			failures: [['macOS'], ['Windows']],
			annotationIds: ['windows'],
			logIds: ['windows-job'],
			reruns: [],
			state: { enabled: true, totalPromptCount: 2, repeatedPromptCount: 0 },
		});
	}));

	test('reruns an already completed workflow immediately without waiting for other checks', () => withController(async h => {
		h.mutations.runs = [{ ...h.mutations.runs[0], status: 'COMPLETED', conclusion: 'FAILURE' }];
		const result = await h.tools.rerunFailedWorkflow(h.session, '1', false);

		assert.deepStrictEqual({
			outcome: JSON.parse(result).outcome,
			reruns: h.mutations.reruns.map(({ runId, failedJobsOnly }) => ({ runId, failedJobsOnly })),
		}, {
			outcome: 'succeeded',
			reruns: [{ runId: '1', failedJobsOnly: false }],
		});
	}));

	test('coalesces a repeat request when a deferred workflow finishes during the repair turn', () => withController(async h => {
		await h.tools.rerunFailedWorkflow(h.session, '1', false);
		h.mutations.runs = [{ ...h.mutations.runs[0], status: 'COMPLETED', conclusion: 'FAILURE' }];
		const result = await h.tools.rerunFailedWorkflow(h.session, '1', true);
		await h.completeTurn();
		await timeout(20 * 60_000);

		assert.deepStrictEqual({
			outcome: JSON.parse(result).outcome,
			reruns: h.mutations.reruns.map(({ runId, failedJobsOnly }) => ({ runId, failedJobsOnly })),
			prompts: h.prompts.length,
		}, {
			outcome: 'deferred',
			reruns: [{ runId: '1', failedJobsOnly: false }],
			prompts: 1,
		});
	}));

	for (const outcome of ['failed', 'indeterminate'] as const) {
		test(`returns a ${outcome} deferred submission to budgeted repair instead of resubmitting automatically`, () => withController(async h => {
			await h.tools.rerunFailedWorkflow(h.session, '1', true);
			await h.completeTurn();
			if (outcome === 'failed') {
				h.mutations.rerunError = new Error('Unable to rerun workflow');
			} else {
				h.mutations.rerunResult = { outcome: 'indeterminate' };
			}
			h.mutations.runs = [{ ...h.mutations.runs[0], status: 'COMPLETED', conclusion: 'FAILURE' }];
			h.controller.refresh();
			await timeout(11 * 60_000);

			assert.deepStrictEqual({
				errors: h.errors.splice(0),
				reruns: h.mutations.reruns.length,
				prompts: h.prompts.length,
				state: h.controllerState(),
			}, {
				errors: outcome === 'failed' ? ['Error: Unable to rerun workflow'] : [],
				reruns: 1,
				prompts: 2,
				state: { enabled: true, totalPromptCount: 2, repeatedPromptCount: 1 },
			});
		}));
	}

	test('rejects a workflow not associated with an authorized failed check', () => withController(async h => {
		await assert.rejects(h.tools.rerunFailedWorkflow(h.session, '99', true), /not associated with a failed required check/);
		assert.deepStrictEqual(h.mutations.reruns, []);
	}));

	test('distinguishes a missing workflow from a completed successful workflow', () => withController(async h => {
		h.mutations.runs = [];
		await assert.rejects(h.tools.rerunFailedWorkflow(h.session, '1', true), /no longer available for this pull request head/);
		h.mutations.runs = [{ id: '1', name: 'CI', headSha: 'head', runAttempt: 1, status: 'COMPLETED', conclusion: 'SUCCESS' }];
		await assert.rejects(h.tools.rerunFailedWorkflow(h.session, '1', true), /no longer has a failed conclusion/);
	}));

	test('discards deferred reruns when the pull request head changes', () => withController(async h => {
		await h.tools.rerunFailedWorkflow(h.session, '1', true);
		await h.completeTurn();
		h.mutations.runs = [{ ...h.mutations.runs[0], status: 'COMPLETED', conclusion: 'FAILURE' }];
		h.snapshot.set(readySnapshot([check('new', 'Build', 'IN_PROGRESS')], 'new-head'), undefined);
		await timeout(31_000);
		await timeout(20 * 60_000);

		assert.deepStrictEqual({ reruns: h.mutations.reruns, prompts: h.prompts.length }, { reruns: [], prompts: 1 });
	}));

	for (const change of ['session disabled', 'feature disabled', 'CI repair disabled', 'PR closed', 'branch changed'] as const) {
		test(`discards deferred reruns when ${change}`, () => withController(async h => {
			await h.tools.rerunFailedWorkflow(h.session, '1', true);
			await h.completeTurn();
			h.mutations.runs = [{ ...h.mutations.runs[0], status: 'COMPLETED', conclusion: 'FAILURE' }];
			switch (change) {
				case 'session disabled':
					h.configurationService.updateSessionConfig(h.session, { [SessionConfigKey.AgentMerge]: { enabled: false } });
					break;
				case 'feature disabled':
					h.configurationService.updateRootConfig({ [AgentMergeConfigKey.Enabled]: false });
					break;
				case 'CI repair disabled':
					h.configurationService.updateSessionConfig(h.session, { [SessionConfigKey.AgentMerge]: { enabled: true, overrides: { fixCI: false } } });
					break;
				case 'PR closed': {
					const snapshot = h.snapshot.get();
					h.snapshot.set({ ...snapshot, core: { ...snapshot.core, value: { ...snapshot.core.value!, state: 'closed' } } }, undefined);
					break;
				}
				case 'branch changed':
					h.stateManager.setSessionMeta(h.session, withSessionGitState(h.stateManager.getSessionState(h.session)?._meta, { branchName: 'main' }));
					h.controller.refresh();
					break;
			}
			await timeout(31_000);
			await timeout(20 * 60_000);

			assert.deepStrictEqual(h.mutations.reruns, []);
		}));
	}

	test('does not rerun an attempt already retried elsewhere and handles new failures of the same name', () => withController(async h => {
		await h.tools.rerunFailedWorkflow(h.session, '1', true);
		await h.completeTurn();
		h.mutations.runs = [{ ...h.mutations.runs[0], runAttempt: 2, status: 'COMPLETED', conclusion: 'FAILURE' }];
		h.controller.refresh();
		await timeout(1);
		const beforeCheckRefresh = { reruns: [...h.mutations.reruns], prompts: h.prompts.length };
		h.snapshot.set(readySnapshot([check('mac-attempt-2', 'macOS', 'COMPLETED', 'FAILURE')]), undefined);
		await timeout(31_000);

		assert.deepStrictEqual({
			beforeCheckRefresh,
			reruns: h.mutations.reruns,
			failures: h.prompts.map(prompt => parseAgentMergePrompt(prompt)?.failedChecks),
		}, {
			beforeCheckRefresh: { reruns: [], prompts: 1 },
			reruns: [],
			failures: [['macOS'], ['macOS']],
		});
	}));

	for (const change of ['head', 'authorization', 'session disabled', 'resolved failure', 'incomplete checks', 'new failure'] as const) {
		test(`rechecks ${change} after looking up a deferred workflow`, () => withController(async h => {
			await h.tools.rerunFailedWorkflow(h.session, '1', true);
			await h.completeTurn();
			const lookupStarted = new DeferredPromise<void>();
			const finishLookup = new DeferredPromise<void>();
			h.mutations.beforeList = async () => {
				h.mutations.beforeList = undefined;
				lookupStarted.complete();
				await finishLookup.p;
			};
			h.mutations.runs = [{ ...h.mutations.runs[0], status: 'COMPLETED', conclusion: 'FAILURE' }];
			h.controller.refresh();
			await lookupStarted.p;
			switch (change) {
				case 'head':
					h.snapshot.set(readySnapshot([check('new', 'Build', 'IN_PROGRESS')], 'new-head'), undefined);
					break;
				case 'authorization':
					h.configurationService.updateRootConfig({ [AgentMergeConfigKey.FixCI]: false });
					break;
				case 'session disabled':
					h.configurationService.updateSessionConfig(h.session, { [SessionConfigKey.AgentMerge]: { enabled: false } });
					break;
				case 'resolved failure':
					h.snapshot.set(readySnapshot([]), undefined);
					break;
				case 'incomplete checks': {
					const snapshot = h.snapshot.get();
					h.snapshot.set({ ...snapshot, checks: { ...snapshot.checks, status: 'stale', complete: false } }, undefined);
					break;
				}
				case 'new failure':
					h.snapshot.set(readySnapshot([
						check('mac', 'macOS', 'COMPLETED', 'FAILURE'),
						check('windows', 'Windows', 'COMPLETED', 'FAILURE'),
					]), undefined);
					break;
			}
			await finishLookup.complete();
			await timeout(31_000);

			assert.deepStrictEqual({
				reruns: h.mutations.reruns,
				prompts: h.prompts.length,
			}, { reruns: [], prompts: change === 'new failure' ? 2 : 1 });
		}));
	}
});

class RerunTestHarness extends Disposable {
	readonly session = 'copilot:/agent-merge-rerun';
	readonly errors: string[] = [];
	readonly logService = new class extends NullLogService {
		constructor(private readonly errors: string[]) { super(); }
		override error(message: string | Error): void { this.errors.push(String(message)); }
	}(this.errors);
	readonly stateManager = this._register(new AgentHostStateManager(this.logService));
	readonly configurationService = this._register(new AgentConfigurationService(this.stateManager, this.logService));
	readonly snapshot = observableValue(this, readySnapshot([
		check('mac', 'macOS', 'COMPLETED', 'FAILURE'),
		check('windows', 'Windows', 'IN_PROGRESS'),
	]));
	readonly mutations = new TestMutations();
	readonly prompts: string[] = [];
	readonly controller: AgentMergeController;
	readonly tools: AgentMergeTools;

	constructor() {
		super();
		this.configurationService.updateRootConfig({ [AgentMergeConfigKey.Enabled]: true });
		this.stateManager.createSession({
			resource: this.session,
			provider: 'copilot',
			title: 'Agent Merge rerun',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
		});
		this.stateManager.setSessionConfig(this.session, {
			schema: platformSessionSchema.toProtocol(),
			values: {
				[SessionConfigKey.AgentMerge]: { enabled: true },
				[SessionConfigKey.AgentMergeController]: {
					target: { branchName: 'feature', pullRequestUrl, enabledAt: new Date(0).toISOString(), commentWatermark: new Date(0).toISOString() },
				},
			},
		});
		this.stateManager.setSessionMeta(this.session, withSessionGitHubState(
			withSessionGitState(undefined, { branchName: 'feature', baseBranchName: 'main' }),
			{ pullRequestUrls: [pullRequestUrl], pullRequestBranchName: 'feature' },
		));
		const snapshot = this.snapshot;
		const mutations = this.mutations;
		const gitHubService = new class extends mock<IGitHubService>() {
			override readonly mutations = mutations;
			override readonly credentials = new class extends mock<IGitHubCredentials>() {
				override async getCredential(signal: AbortSignal): Promise<GitHubCredential> {
					return { account: ref, token: 'test-token', generation: 1, signal };
				}
			}();
			override readonly pullRequests = new class extends mock<IPullRequestResources>() {
				override subscribePullRequest(): PullRequestSubscription {
					return {
						resource: { ref, snapshot },
						refresh: async () => { },
						update: () => { },
						dispose: () => { },
					};
				}
			}();
		}();
		this.controller = this._register(new AgentMergeController(
			{
				startTurn: (session, turnId, prompt) => {
					this.prompts.push(prompt);
					this.stateManager.dispatchServerAction(buildDefaultChatUri(session), {
						type: ActionType.ChatTurnStarted,
						turnId,
						startedAt: new Date().toISOString(),
						message: { text: prompt, origin: { kind: MessageKind.User } },
					});
					return true;
				},
				cancelTurn: (session, turnId) => this.stateManager.dispatchServerAction(buildDefaultChatUri(session), {
					type: ActionType.ChatTurnCancelled,
					turnId,
					duration: 0,
				}),
				postNotice: () => { },
			},
			this.stateManager,
			this.configurationService,
			new class extends mock<IAgentHostGitStateService>() {
				override readonly onDidRefreshSessionGitState = Event.None;
				override readonly onDidChangeSessionGitHubState = Event.None;
				override async attachSessionGitHubPullRequest(): Promise<void> { }
			}(),
			new class extends mock<IAgentHostGitService>() { }(),
			gitHubService,
			this._register(new AgentHostGitHubEndpointService(this.configurationService, this.logService)),
			new class extends mock<IAgentHostProviderService>() {
				override getProviderForSession(): undefined { return undefined; }
			}(),
			this.logService,
		));
		this.tools = new AgentMergeTools(() => this.controller.isEnabled(), session => this.controller.getTurnContext(session), gitHubService, this.logService);
		this.stateManager.dispatchServerAction(this.session, { type: ActionType.SessionReady });
	}

	async completeTurn(): Promise<void> {
		const context = this.controller.getTurnContext(this.session);
		assert.ok(context);
		this.stateManager.dispatchServerAction(buildDefaultChatUri(this.session), {
			type: ActionType.ChatTurnComplete,
			turnId: context.turnId,
			duration: 0,
		});
		await timeout(1);
	}

	controllerState() {
		const state = readAgentMergeSessionState(this.configurationService.getSessionConfigValues(this.session));
		return { enabled: state?.enabled, totalPromptCount: state?.totalPromptCount, repeatedPromptCount: state?.repeatedPromptCount };
	}
}

class TestMutations extends mock<IPullRequestMutations>() {
	runs: GitHubWorkflowRun[] = [{ id: '1', name: 'CI', headSha: 'head', runAttempt: 1, status: 'IN_PROGRESS' }];
	jobs: GitHubWorkflowJob[] = [];
	readonly reruns: GitHubWorkflowRerunOptions[] = [];
	readonly annotationIds: string[] = [];
	readonly logIds: string[] = [];
	beforeList: (() => Promise<void>) | undefined;
	rerunError: Error | undefined;
	rerunResult: PullRequestMutationResult<GitHubWorkflowRun> = { outcome: 'succeeded' };

	override async listWorkflowRuns(): Promise<readonly GitHubWorkflowRun[]> {
		await this.beforeList?.();
		return this.runs;
	}

	override async rerunWorkflow(_ref: PullRequestRef, options: GitHubWorkflowRerunOptions): Promise<PullRequestMutationResult<GitHubWorkflowRun>> {
		this.reruns.push(options);
		if (this.rerunError) {
			throw this.rerunError;
		}
		return this.rerunResult;
	}

	override async listCheckAnnotations(_ref: PullRequestRef, id: string) {
		this.annotationIds.push(id);
		return [];
	}

	override async listWorkflowJobs(): Promise<readonly GitHubWorkflowJob[]> {
		return this.jobs;
	}

	override async downloadWorkflowJobLog(_ref: PullRequestRef, id: string) {
		this.logIds.push(id);
		return { text: 'failure details', truncated: false };
	}
}

function check(id: string, name: string, status: string, conclusion?: string, runId = '1'): PullRequestCheck {
	return { id, name, type: 'checkRun', required: true, status, conclusion, detailsUrl: `https://github.com/octo/repo/actions/runs/${runId}/job/${id}` };
}

function readySnapshot(checks: readonly PullRequestCheck[], headSha = 'head'): PullRequestSnapshot {
	return {
		ref,
		generation: 1,
		headGeneration: 1,
		core: {
			status: 'ready',
			complete: true,
			value: {
				repositoryNameWithOwner: 'octo/repo',
				headRepositoryNameWithOwner: 'octo/repo',
				number: 1,
				title: 'Change',
				url: pullRequestUrl,
				state: 'open',
				draft: false,
				headSha,
				headRef: 'feature',
				baseSha: 'base',
				baseRef: 'main',
			},
		},
		topLevelComments: { status: 'ready', complete: true, value: [] },
		submittedReviews: { status: 'ready', complete: true, value: [] },
		inlineComments: { status: 'missing', complete: false },
		reviewThreads: { status: 'ready', complete: true, headSha, value: [] },
		checks: {
			status: 'ready',
			complete: true,
			headSha,
			value: { headSha, requirednessComplete: true, expectedSuites: [], expectedSuitesComplete: true, checks },
		},
		mergeability: {
			status: 'ready',
			complete: true,
			headSha,
			value: {
				headSha,
				baseSha: 'base',
				mergeable: 'MERGEABLE',
				mergeStateStatus: 'BLOCKED',
				viewerCanUpdate: true,
				viewerCanMerge: true,
				viewerCanEnableAutoMerge: true,
				allowedMergeMethods: ['SQUASH'],
				autoMergeEnabled: false,
				mergeQueueRequired: false,
				queueRequirementKnown: true,
			},
		},
		participants: { status: 'missing', complete: false },
	};
}
