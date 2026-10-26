/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitHubCredential, IGitHubCredentials } from '../../../github/common/githubCredentialService.js';
import { IGitHubAccountClient } from '../../../github/common/account/account.js';
import { IActionsClient, ListWorkflowRunsOptions, WorkflowJob, WorkflowRun } from '../../../github/common/core/actions.js';
import { IChecksClient } from '../../../github/common/core/checks.js';
import { GitHubWorkflowRerunOptions, GitHubWorkflowRun, PullRequestMutationApi, PullRequestMutationResult } from '../../../github/common/githubPullRequestMutationService.js';
import { PullRequestCheck, PullRequestCheckSuite, PullRequestRef, PullRequestSnapshot, PullRequestSubscription, PullRequestSubscriptionOptions } from '../../../github/common/githubPullRequestService.js';
import { IGitHubClient } from '../../../github/common/githubService.js';
import { createTestGitHubService, createTestWorkflowJob, createTestWorkflowRun } from './testGitHubService.js';
import { IPullRequestResources } from '../../../github/common/pullRequestResourceService.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentMergeConfigKey, AgentMergeFolderControllerState, agentMergeDisableReasons, readAgentMergeSessionState, withAgentMergeFolderControllerState } from '../../common/agentMerge.js';
import { parseAgentMergePrompt } from '../../common/agentMergePrompt.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { platformSessionSchema } from '../../common/agentHostSchema.js';
import { getWorkingDirectoryKey } from '../../common/agentHostWorkingDirectories.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/protocol/common/actions.js';
import { buildDefaultChatUri, createErrorResponsePart, MessageKind, SessionStatus, withSessionGitHubState, withSessionGitState } from '../../common/state/sessionState.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';
import type { IAgentHostProviderService } from '../../node/agentHostProviderService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentMergeController } from '../../node/agentMergeController.js';
import { AgentMergeTools } from '../../node/agentMergeTools.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';

const ref: PullRequestRef = { host: 'api.github.com', accountId: '1', owner: 'octo', repo: 'repo', number: 1 };
const pullRequestUrl = 'https://github.com/octo/repo/pull/1';
const unchangedRepairCooldown = 10 * 60_000;

suite('Agent Merge workflow reruns', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function withController(fn: (harness: RerunTestHarness) => Promise<void>): Promise<void> {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1_000 }, async () => {
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

	test('retains one typed client while monitoring and releases it when stopped', () => withController(async h => {
		const context = h.controller.getTurnContext(h.session);
		assert.ok(context);
		await h.tools.readFailedCI(h.session);
		await h.tools.readFailedCI(h.session);
		await h.controller.setEnabled(h.session, false);
		assert.deepStrictEqual({
			acquired: h.apiAcquisitions, disposed: h.apiDisposals,
			cancelled: context.signal.aborted, active: h.controller.getTurnContext(h.session) !== undefined,
		}, { acquired: 1, disposed: 1, cancelled: true, active: false });
	}));

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
			run: JSON.parse(result).run,
			whileWaiting,
			afterRerun: h.controllerState(),
			prompts: h.prompts.length,
			reruns: h.mutations.reruns.map(({ runId, expectedRunAttempt, failedJobsOnly }) => ({ runId, expectedRunAttempt, failedJobsOnly })),
			priorities: [...new Set(h.mutations.runOptions.map(options => options?.priority))],
		}, {
			outcome: 'deferred',
			run: {
				id: '1', name: 'CI', event: 'push', status: 'IN_PROGRESS',
				headSha: 'head', runAttempt: 1, runAttemptKnown: true,
				url: 'https://github.com/owner/repo/actions/runs/1',
				createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
			},
			whileWaiting: { enabled: true, totalPromptCount: 1, repeatedPromptCount: 0 },
			afterRerun: { enabled: true, totalPromptCount: 1, repeatedPromptCount: 0 },
			prompts: 1,
			reruns: [{ runId: '1', expectedRunAttempt: 1, failedJobsOnly: true }],
			priorities: [undefined, 'background'],
		});
	}));

	test('suppresses a newly deferred failure during the same turn without revoking its rerun authorization', () => withController(async h => {
		h.mutations.jobs = [createTestWorkflowJob(101, { name: 'macOS', check_run_url: 'https://api.github.com/repos/octo/repo/check-runs/1001' })];
		await h.tools.rerunFailedWorkflow(h.session, '1', true);
		const details = await h.tools.readFailedCI(h.session);
		const repeated = await h.tools.rerunFailedWorkflow(h.session, '1', true);

		assert.deepStrictEqual({
			details: JSON.parse(details).message,
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

	test('handles the end of a repair turn that ends in an error', () => withController(async h => {
		const failedTurn = h.controller.getTurnContext(h.session);
		assert.ok(failedTurn);
		const refreshesBefore = h.authoritativeRefreshes.count;

		h.stateManager.dispatchServerAction(buildDefaultChatUri(h.session), { type: ActionType.ChatError, turnId: failedTurn.turnId, duration: 0, part: createErrorResponsePart({ errorType: 'failed', message: 'Repair failed' }) });
		// Well before the periodic backstop.
		await timeout(1);

		assert.strictEqual(h.authoritativeRefreshes.count - refreshesBefore, 1);
	}));

	test('does not authorize deferred failures from previous turns when a different workflow fails', () => withController(async h => {
		await h.tools.rerunFailedWorkflow(h.session, '1', true);
		await h.completeTurn();
		h.snapshot.set(readySnapshot([
			check('mac', 'macOS', 'COMPLETED', 'FAILURE'),
			check('windows', 'Windows', 'COMPLETED', 'FAILURE', '2'),
		]), undefined);
		h.mutations.runs.push(createTestWorkflowRun(2, { name: 'Windows CI', status: 'in_progress' }));
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
			createTestWorkflowJob(101, { name: 'macOS', check_run_url: 'https://api.github.com/repos/octo/repo/check-runs/1001' }),
			createTestWorkflowJob(102, { name: 'Windows', check_run_url: 'https://api.github.com/repos/octo/repo/check-runs/1002' }),
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
			annotationIds: ['1002'],
			logIds: ['102'],
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
		h.mutations.runs = [createTestWorkflowRun(1, { status: 'completed', conclusion: 'success' })];
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
		h.mutations.runs = [{ ...h.mutations.runs[0], run_attempt: 2, status: 'COMPLETED', conclusion: 'FAILURE' }];
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

suite('Agent Merge repair pacing', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function withHarness(fn: (harness: RerunTestHarness) => Promise<void>): Promise<void> {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = disposables.add(new RerunTestHarness(false));
			try {
				await fn(harness);
				assert.deepStrictEqual(harness.errors, []);
			} finally {
				harness.dispose();
			}
		});
	}

	function seedControllerState(h: RerunTestHarness, controller: AgentMergeFolderControllerState): void {
		const values = h.configurationService.getSessionConfigValues(h.session);
		const folderKey = getWorkingDirectoryKey('file:///repo');
		h.configurationService.updateSessionConfig(h.session, withAgentMergeFolderControllerState(values, folderKey, folderKey, {
			target: readAgentMergeSessionState(values)?.target,
			lastPromptFingerprint: 'previous',
			lastPromptAt: new Date(0).toISOString(),
			...controller,
		}));
	}

	test('starts CI-only repair immediately when enabled while an approval check is pending', () => withHarness(async h => {
		await h.controller.setEnabled(h.session, false);
		h.snapshot.set(readySnapshot([
			check('mac', 'macOS', 'COMPLETED', 'FAILURE'),
			check('other-workflow', 'Approval', 'IN_PROGRESS', undefined, '2'),
		]), undefined);
		h.stateManager.dispatchServerAction(h.session, { type: ActionType.SessionReady });
		await timeout(1);
		await h.controller.setEnabled(h.session, true);
		await timeout(1);

		assert.deepStrictEqual(h.prompts.map(prompt => parseAgentMergePrompt(prompt)?.failedChecks), [['macOS']]);
	}));

	test('starts CI repair for a new head immediately after the previous repair', () => withHarness(async h => {
		h.stateManager.dispatchServerAction(h.session, { type: ActionType.SessionReady });
		await timeout(1);
		h.snapshot.set(readySnapshot([
			check('mac', 'macOS', 'COMPLETED', 'FAILURE'),
			check('windows', 'Windows', 'IN_PROGRESS'),
		], 'fixed-head'), undefined);
		await h.completeTurn();

		assert.deepStrictEqual({
			heads: h.prompts.map(prompt => parseAgentMergePrompt(prompt)?.headSha),
			state: h.controllerState(),
		}, {
			heads: ['head', 'fixed-head'],
			state: { enabled: true, totalPromptCount: 1, repeatedPromptCount: 0 },
		});
	}));

	test('starts repair for a new failure without waiting for other checks to settle', () => withHarness(async h => {
		h.stateManager.dispatchServerAction(h.session, { type: ActionType.SessionReady });
		await timeout(1);
		await h.completeTurn();
		h.snapshot.set(readySnapshot([
			check('mac', 'macOS', 'COMPLETED', 'FAILURE'),
			check('windows', 'Windows', 'COMPLETED', 'FAILURE'),
			check('other-workflow', 'Slow unrelated workflow', 'IN_PROGRESS', undefined, '2'),
		]), undefined);
		await timeout(31_000);

		assert.deepStrictEqual(h.prompts.map(prompt => parseAgentMergePrompt(prompt)?.failedChecks), [['macOS'], ['macOS', 'Windows']]);
	}));

	test('starts the next repair immediately when a previous blocker was resolved on the same head', () => withHarness(async h => {
		h.snapshot.set(readySnapshot([
			check('mac', 'macOS', 'COMPLETED', 'FAILURE'),
			check('windows', 'Windows', 'COMPLETED', 'FAILURE'),
		]), undefined);
		h.stateManager.dispatchServerAction(h.session, { type: ActionType.SessionReady });
		await timeout(1);
		h.snapshot.set(readySnapshot([
			check('mac', 'macOS', 'COMPLETED', 'SUCCESS'),
			check('windows', 'Windows', 'COMPLETED', 'FAILURE'),
		]), undefined);
		await h.completeTurn();

		assert.deepStrictEqual({
			failures: h.prompts.map(prompt => parseAgentMergePrompt(prompt)?.failedChecks),
			state: h.controllerState(),
		}, {
			failures: [['macOS', 'Windows'], ['Windows']],
			state: { enabled: true, totalPromptCount: 1, repeatedPromptCount: 0 },
		});
	}));

	test('polls fresh pull request state within 60 seconds without a snapshot notification', () => withHarness(async h => {
		h.snapshot.set(readySnapshot([check('windows', 'Windows', 'IN_PROGRESS')]), undefined);
		let failureAvailable = false;
		const subscribe = h.client.pullRequests.subscribePullRequest;
		h.client.pullRequests.subscribePullRequest = (ref, options) => {
			const subscription = subscribe(ref, options);
			const refresh = subscription.refresh;
			subscription.refresh = async (...args) => {
				await refresh(...args);
				if (failureAvailable) {
					h.snapshot.set(readySnapshot([
						check('mac', 'macOS', 'COMPLETED', 'FAILURE'),
						check('windows', 'Windows', 'IN_PROGRESS'),
					]), undefined);
				}
			};
			return subscription;
		};
		h.stateManager.dispatchServerAction(h.session, { type: ActionType.SessionReady });
		await timeout(1);
		await timeout(59_998);
		const beforeFirstPoll = { refreshes: h.authoritativeRefreshes.count, prompts: h.prompts.length };
		await timeout(1);
		const afterFirstPoll = { refreshes: h.authoritativeRefreshes.count, prompts: h.prompts.length };
		failureAvailable = true;
		await timeout(59_999);
		const beforeSecondPoll = { refreshes: h.authoritativeRefreshes.count, prompts: h.prompts.length };
		await timeout(1);

		assert.deepStrictEqual({
			beforeFirstPoll,
			afterFirstPoll,
			beforeSecondPoll,
			afterSecondPoll: { refreshes: h.authoritativeRefreshes.count, prompts: h.prompts.length },
		}, {
			beforeFirstPoll: { refreshes: 1, prompts: 0 },
			afterFirstPoll: { refreshes: 2, prompts: 0 },
			beforeSecondPoll: { refreshes: 2, prompts: 0 },
			afterSecondPoll: { refreshes: 3, prompts: 1 },
		});
	}));

	test('keeps polling every 60 seconds while unchanged repairs wait for the 10-minute cooldown', () => withHarness(async h => {
		h.stateManager.dispatchServerAction(h.session, { type: ActionType.SessionReady });
		await timeout(1);
		await h.completeTurn();
		const initialRefreshes = h.authoritativeRefreshes.count;
		await timeout(60_000);
		const afterPoll = { prompts: h.prompts.length, refreshes: h.authoritativeRefreshes.count - initialRefreshes };
		await timeout(unchangedRepairCooldown - 60_000 - 3);
		const beforeCooldown = h.prompts.length;
		await timeout(60_000);

		assert.deepStrictEqual({
			afterPoll,
			beforeCooldown,
			afterCooldown: h.prompts.length,
		}, {
			afterPoll: { prompts: 1, refreshes: 1 },
			beforeCooldown: 1,
			afterCooldown: 2,
		});
	}));

	const pendingWithoutRequiredChecks: readonly { readonly name: string; readonly snapshot: () => PullRequestSnapshot }[] = [
		{
			name: 'a check suite that has not reported check runs yet',
			snapshot: () => readySnapshot([check('mac', 'macOS', 'COMPLETED', 'FAILURE')], 'head', [
				{ id: 'suite', name: 'analysis', status: 'QUEUED', checkRunsReported: false },
			]),
		},
		{
			name: 'an optional check',
			snapshot: () => readySnapshot([
				check('mac', 'macOS', 'COMPLETED', 'FAILURE'),
				{ ...check('other-workflow', 'Lint', 'IN_PROGRESS', undefined, '2'), required: false },
			]),
		},
	];
	for (const { name, snapshot } of pendingWithoutRequiredChecks) {
		test(`starts CI-only repair immediately while ${name} is still running`, () => withHarness(async h => {
			h.snapshot.set(snapshot(), undefined);
			h.stateManager.dispatchServerAction(h.session, { type: ActionType.SessionReady });
			await timeout(1);
			assert.deepStrictEqual(h.prompts.map(prompt => parseAgentMergePrompt(prompt)?.failedChecks), [['macOS']]);
		}));
	}

	test('does not hold repair that also addresses other blockers', () => withHarness(async h => {
		const snapshot = h.snapshot.get();
		h.snapshot.set({ ...snapshot, mergeability: { ...snapshot.mergeability, value: { ...snapshot.mergeability.value!, mergeable: 'CONFLICTING' } } }, undefined);
		h.stateManager.dispatchServerAction(h.session, { type: ActionType.SessionReady });
		await timeout(1);

		assert.deepStrictEqual(h.prompts.map(prompt => parseAgentMergePrompt(prompt)?.actions), [['fixCI', 'resolveConflicts']]);
	}));

	const settledFailure = () => readySnapshot([check('mac', 'macOS', 'COMPLETED', 'FAILURE')]);
	const cases: readonly { readonly name: string; readonly seeded: AgentMergeFolderControllerState; readonly expected: { readonly prompts: number; readonly notices: readonly string[]; readonly state: ReturnType<RerunTestHarness['controllerState']> } }[] = [
		{
			name: 'resets the repair budget when the head changed since the last repair',
			seeded: { totalPromptCount: 6, repeatedPromptCount: 0, lastPromptHeadSha: 'previous-head', lastPromptBlockers: ['check:macOS'] },
			expected: { prompts: 1, notices: [], state: { enabled: true, totalPromptCount: 1, repeatedPromptCount: 0 } },
		},
		{
			name: 'resets the repair budget when a blocker of the last repair was resolved',
			seeded: { totalPromptCount: 6, repeatedPromptCount: 0, lastPromptHeadSha: 'head', lastPromptBlockers: ['check:macOS', 'conflicting'] },
			expected: { prompts: 1, notices: [], state: { enabled: true, totalPromptCount: 1, repeatedPromptCount: 0 } },
		},
		{
			name: 'disables after repeated repairs without progress',
			seeded: { totalPromptCount: 6, repeatedPromptCount: 0, lastPromptHeadSha: 'head', lastPromptBlockers: ['check:macOS'] },
			expected: { prompts: 0, notices: [agentMergeDisableReasons.repairWithoutProgress(6).notice], state: { enabled: false, totalPromptCount: undefined, repeatedPromptCount: undefined } },
		},
		{
			name: 'disables at the lifetime repair limit even when the last repair made progress',
			seeded: { totalPromptCount: 1, repeatedPromptCount: 0, lifetimePromptCount: 20, lastPromptHeadSha: 'previous-head', lastPromptBlockers: ['check:macOS'] },
			expected: { prompts: 0, notices: [agentMergeDisableReasons.repairLimitReached(20).notice], state: { enabled: false, totalPromptCount: undefined, repeatedPromptCount: undefined } },
		},
	];
	const budgetNotices = [
		agentMergeDisableReasons.repairBudgetExhausted().notice,
		agentMergeDisableReasons.repairWithoutProgress(6).notice,
		agentMergeDisableReasons.repairLimitReached(20).notice,
	];
	for (const { name, seeded, expected } of cases) {
		test(name, () => withHarness(async h => {
			h.snapshot.set(settledFailure(), undefined);
			seedControllerState(h, seeded);
			h.stateManager.dispatchServerAction(h.session, { type: ActionType.SessionReady });
			await timeout(1);

			assert.deepStrictEqual({
				prompts: h.prompts.length,
				notices: h.notices.filter(notice => budgetNotices.includes(notice)),
				state: h.controllerState(),
			}, expected);
		}));
	}
});

suite('Agent Merge evaluation authorization', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const scope of ['session', 'global'] as const) {
		for (const phase of ['pull request attachment', 'credentials', 'subscription', 'repair baseline'] as const) {
			test(`rechecks ${scope} configuration after ${phase}`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
				const h = disposables.add(new RerunTestHarness(false));
				try {
					const started = new DeferredPromise<void>();
					const finish = new DeferredPromise<void>();
					const pause = async () => {
						if (!started.isSettled) {
							started.complete();
							await finish.p;
						}
					};
					switch (phase) {
						case 'pull request attachment':
							h.gitStateService.attachSessionGitHubPullRequest = pause;
							break;
						case 'credentials': {
							const getCredential = h.client.credentials.getCredential;
							h.client.credentials.getCredential = async signal => {
								await pause();
								return getCredential(signal);
							};
							break;
						}
						case 'subscription': {
							const subscribe = h.client.pullRequests.subscribePullRequest;
							h.client.pullRequests.subscribePullRequest = (ref, interest) => {
								const subscription = subscribe(ref, interest);
								subscription.refresh = pause;
								return subscription;
							};
							break;
						}
						case 'repair baseline':
							h.gitService.getRepositoryRoot = async () => URI.file('/repo');
							h.gitService.revParse = async () => {
								await pause();
								return 'commit';
							};
							break;
					}
					const setFixCI = (fixCI: boolean) => scope === 'session'
						? h.controller.setEnabled(h.session, true, { fixCI })
						: h.configurationService.updateRootConfig({ [AgentMergeConfigKey.FixCI]: fixCI });
					h.stateManager.dispatchServerAction(h.session, { type: ActionType.SessionReady });
					await started.p;
					await setFixCI(false);
					await finish.complete();
					await timeout(1);
					const whileDisabled = { prompts: h.prompts.length, state: h.controllerState() };
					await setFixCI(true);
					await timeout(1);

					assert.deepStrictEqual({
						whileDisabled,
						actions: h.prompts.map(prompt => parseAgentMergePrompt(prompt)?.actions),
						authorized: h.controller.getTurnContext(h.session)?.configuration.fixCI,
						errors: h.errors,
					}, {
						whileDisabled: { prompts: 0, state: { enabled: true, totalPromptCount: undefined, repeatedPromptCount: undefined } },
						actions: [['fixCI']],
						authorized: true,
						errors: [],
					});
				} finally {
					h.dispose();
				}
			}));
		}
	}

	test('does not overwrite updated options while checking whether a repair changed the commit', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = disposables.add(new RerunTestHarness(false));
		try {
			await h.controller.setEnabled(h.session, true, { mergePullRequest: 'ifUnchanged' });
			const values = h.configurationService.getSessionConfigValues(h.session);
			const agentMerge = readAgentMergeSessionState(values);
			const folderKey = getWorkingDirectoryKey('file:///repo');
			h.configurationService.updateSessionConfig(h.session, withAgentMergeFolderControllerState(values, folderKey, folderKey, { target: agentMerge?.target, repairBaseCommit: 'original' }));
			const started = new DeferredPromise<void>();
			const finish = new DeferredPromise<string>();
			h.gitService.getRepositoryRoot = async () => URI.file('/repo');
			h.gitService.revParse = () => {
				started.complete();
				return finish.p;
			};
			h.stateManager.dispatchServerAction(h.session, { type: ActionType.SessionReady });
			await started.p;
			await h.controller.setEnabled(h.session, true, { fixCI: false, mergePullRequest: 'always' });
			await finish.complete('changed');
			await timeout(1);

			const current = readAgentMergeSessionState(h.configurationService.getSessionConfigValues(h.session));
			assert.deepStrictEqual({
				overrides: current?.overrides,
				baseline: current?.repairBaseCommit,
				prompts: h.prompts,
				errors: h.errors,
			}, {
				overrides: { fixCI: false, mergePullRequest: 'always' },
				baseline: 'original',
				prompts: [],
				errors: [],
			});
		} finally {
			h.dispose();
		}
	}));
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
	readonly notices: string[] = [];
	/** Authoritative pull request refreshes at startup, on polling, and after repair turns. */
	readonly authoritativeRefreshes = { count: 0 };
	readonly controller: AgentMergeController;
	readonly tools: AgentMergeTools;
	readonly client: IGitHubClient;
	apiAcquisitions = 0;
	apiDisposals = 0;
	readonly gitStateService: IAgentHostGitStateService = new class extends mock<IAgentHostGitStateService>() {
		override readonly onDidRefreshSessionGitState = Event.None;
		override readonly onDidChangeSessionGitHubState = Event.None;
		override async refreshSessionGitState(): Promise<void> { }
		override async attachSessionGitHubPullRequest(): Promise<void> { }
	}();
	readonly gitService: IAgentHostGitService = new class extends mock<IAgentHostGitService>() {
		override async getCurrentBranchName(): Promise<string | undefined> { return 'feature'; }
		override async getRepositoryRoot(): Promise<URI | undefined> { return undefined; }
	}();

	constructor(ready = true) {
		super();
		this.configurationService.updateRootConfig({ [AgentMergeConfigKey.Enabled]: true });
		this.stateManager.createSession({
			resource: this.session,
			provider: 'copilot',
			title: 'Agent Merge rerun',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			workingDirectories: ['file:///repo'],
			defaultChat: buildDefaultChatUri(this.session),
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
			'file:///repo',
			{ pullRequestUrls: [pullRequestUrl], pullRequestBranchName: 'feature' },
		));
		const snapshot = this.snapshot;
		const mutations = this.mutations;
		const authoritativeRefreshes = this.authoritativeRefreshes;
		this.client = new class extends mock<IGitHubClient>() {
			override readonly mutations = mutations;
			override readonly credentials = new class extends mock<IGitHubCredentials>() {
				override async getCredential(signal: AbortSignal): Promise<GitHubCredential> {
					return { account: ref, token: 'test-token', generation: 1, signal };
				}
			}();
			override readonly pullRequests = new class extends mock<IPullRequestResources>() {
				override subscribePullRequest(_ref: PullRequestRef, options: PullRequestSubscriptionOptions): PullRequestSubscription {
					// Like the query service, only an interest in optional checks reports them.
					const visible = options.checks?.includeOptional ? snapshot : derived(reader => {
						const value = snapshot.read(reader);
						const checks = value.checks.value;
						return checks ? { ...value, checks: { ...value.checks, value: { ...checks, checks: checks.checks.filter(check => check.required !== false) } } } : value;
					});
					return {
						resource: { ref, snapshot: visible },
						refresh: async (_fragment, _signal, options) => {
							if (options?.authoritative) {
								authoritativeRefreshes.count++;
							}
						},
						update: () => { },
						dispose: () => { },
					};
				}
			}();
		}();
		const gitHubService = createTestGitHubService(this.client);
		gitHubService.acquireRepositoryApiClient = () => {
			this.apiAcquisitions++;
			return upcastPartial<IGitHubAccountClient>({
				actions: mutations.actions, checks: mutations.checks,
				dispose: () => { this.apiDisposals++; },
			});
		};
		this.controller = this._register(new AgentMergeController(
			{
				startTurn: (chat, turnId, prompt) => {
					this.prompts.push(prompt);
					this.stateManager.dispatchServerAction(chat, {
						type: ActionType.ChatTurnStarted,
						turnId,
						startedAt: new Date().toISOString(),
						message: { text: prompt, origin: { kind: MessageKind.User } },
					});
					return true;
				},
				cancelTurn: (chat, turnId) => this.stateManager.dispatchServerAction(chat, {
					type: ActionType.ChatTurnCancelled,
					turnId,
					duration: 0,
				}),
				postNotice: (_chat, _kind, content) => { this.notices.push(content); },
			},
			this.stateManager,
			createTestChatOwnershipService(this.stateManager),
			this.configurationService,
			this.gitStateService,
			this.gitService,
			gitHubService,
			this._register(new AgentHostGitHubEndpointService(this.configurationService, this.logService)),
			new class extends mock<IAgentHostProviderService>() {
				override getProviderForSession(): undefined { return undefined; }
			}(),
			this.logService,
		));
		this.tools = this._register(new AgentMergeTools(() => this.controller.isEnabled(), chat => this.controller.getTurnContext(chat), (chat, enabled, overrides) => this.controller.setEnabled(chat, enabled, overrides), this.logService, this.stateManager, this.configurationService));
		if (ready) {
			this.stateManager.dispatchServerAction(this.session, { type: ActionType.SessionReady });
		}
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

class TestMutations extends mock<PullRequestMutationApi>() {
	readonly runOptions: (ListWorkflowRunsOptions | undefined)[] = [];
	runs: WorkflowRun[] = [createTestWorkflowRun(1, { status: 'in_progress', conclusion: null })];
	jobs: WorkflowJob[] = [];
	readonly reruns: GitHubWorkflowRerunOptions[] = [];
	readonly annotationIds: string[] = [];
	readonly logIds: string[] = [];
	beforeList: (() => Promise<void>) | undefined;
	rerunError: Error | undefined;
	rerunResult: PullRequestMutationResult<GitHubWorkflowRun> = { outcome: 'succeeded' };

	readonly actions = upcastPartial<IActionsClient>({
		listRuns: async (_repository, _signal, options) => {
			this.runOptions.push(options);
			await this.beforeList?.();
			return { total_count: this.runs.length, workflow_runs: this.runs };
		},
		listJobsForAttempt: async () => ({ total_count: this.jobs.length, jobs: this.jobs }),
	});
	readonly checks = upcastPartial<IChecksClient>({
		listAnnotations: async (_repository, id) => {
			this.annotationIds.push(String(id));
			return [];
		},
	});

	override async rerunWorkflow(_ref: PullRequestRef, options: GitHubWorkflowRerunOptions): Promise<PullRequestMutationResult<GitHubWorkflowRun>> {
		this.reruns.push(options);
		if (this.rerunError) {
			throw this.rerunError;
		}
		return this.rerunResult;
	}

	override async downloadWorkflowJobLog(_ref: PullRequestRef, id: string) {
		this.logIds.push(id);
		return { text: 'failure details', truncated: false };
	}
}

function check(id: string, name: string, status: string, conclusion?: string, runId = '1'): PullRequestCheck {
	const numericIds = new Map([['mac', '1001'], ['windows', '1002'], ['other-workflow', '1003'], ['fixed', '1004'], ['new', '1005'], ['mac-attempt-2', '1006']]);
	const numericId = numericIds.get(id);
	assert.ok(numericId, `Missing numeric check ID for ${id}`);
	return { id: numericId, name, type: 'checkRun', required: true, status, conclusion, detailsUrl: `https://github.com/octo/repo/actions/runs/${runId}/job/${numericId}` };
}

function readySnapshot(checks: readonly PullRequestCheck[], headSha = 'head', expectedSuites: readonly PullRequestCheckSuite[] = []): PullRequestSnapshot {
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
		reviewThreads: { status: 'ready', complete: true, headSha, value: [] },
		checks: {
			status: 'ready',
			complete: true,
			headSha,
			value: { headSha, requirednessComplete: true, expectedSuites, expectedSuitesComplete: true, checks },
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
	};
}
