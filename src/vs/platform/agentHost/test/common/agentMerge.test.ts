/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentMergeConfiguration, AGENT_MERGE_UNKNOWN_COMMIT, agentMergeConfigurationChangedNotice, agentMergeDisableReasons, agentMergeEnabledNotice, evaluateAgentMerge, getNonMergeSessionConfigValues, isAgentMergePullRequestReadyForReview, readAgentMergeSessionState, shouldStopMergingAfterAgentChanges } from '../../common/agentMerge.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { PullRequestSnapshot } from '../../../github/common/githubPullRequestService.js';

suite('Agent Merge gate', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const configuration: AgentMergeConfiguration = {
		addressReviews: true,
		fixCI: true,
		resolveConflicts: true,
		mergePullRequest: 'always',
		mergeMethod: 'auto',
		replyAttribution: true,
	};

	test('prompts only for authorized maintainer feedback and failed required checks', () => {
		const snapshot = readySnapshot({
			reviewThreads: [{
				id: 'thread-1',
				isResolved: false,
				path: 'src/example.ts',
				line: 42,
				comments: [
					{ id: 'comment-1', author: { login: 'maintainer', association: 'MEMBER' }, body: 'Please fix this' },
					{ id: 'comment-2', author: { login: 'outsider', association: 'CONTRIBUTOR' }, body: 'Unauthorized' },
					{ id: 'comment-3', author: { login: 'maintainer', association: 'MEMBER' }, body: 'Actually rename it instead' },
				],
			}],
			topLevelComments: [
				{ id: 'old', author: { login: 'maintainer', association: 'OWNER' }, body: 'Old', createdAt: '2026-08-01T00:00:00.000Z' },
				{ id: 'new', author: { login: 'outsider', association: 'CONTRIBUTOR' }, body: 'Ignore me', createdAt: '2026-08-03T00:00:00.000Z' },
			],
			checks: [
				{ id: 'required', type: 'checkRun', name: 'Build', required: true, status: 'COMPLETED', conclusion: 'FAILURE' },
				{ id: 'optional', type: 'checkRun', name: 'Lint', required: false, status: 'COMPLETED', conclusion: 'FAILURE' },
			],
		});

		// Every authorized comment is carried so a later follow-up cannot be lost.
		const expectedContext = {
			pullRequestUrl: 'https://github.com/octo/repo/pull/1',
			title: 'Change',
			headSha: 'head',
			baseRef: 'main',
			headRef: 'feature',
			reviewThreads: [{
				id: 'thread-1',
				path: 'src/example.ts',
				line: 42,
				comments: [
					{ author: 'maintainer', body: 'Please fix this' },
					{ author: 'maintainer', body: 'Actually rename it instead' },
				],
			}],
			reviewSummaries: [],
			newComments: [],
			failedChecks: ['Build'],
			behind: false,
			conflicting: false,
			commentWatermark: '2026-08-02T00:00:00.000Z',
		};
		assert.deepStrictEqual(evaluateAgentMerge(snapshot, configuration, '2026-08-02T00:00:00.000Z'), {
			kind: 'prompt',
			actions: ['addressReviews', 'fixCI'],
			fingerprint: JSON.stringify({ actions: ['addressReviews', 'fixCI'], context: expectedContext }),
			context: expectedContext,
		});
	});

	test('repairs draft pull requests without merging them', () => {
		const repair = evaluateAgentMerge(readySnapshot({
			draft: true,
			reviewThreads: [{
				id: 'thread-1',
				isResolved: false,
				comments: [{ id: 'comment-1', author: { login: 'maintainer', association: 'MEMBER' }, body: 'Please fix this' }],
			}],
			checks: [{ id: 'required', type: 'checkRun', name: 'Build', required: true, status: 'COMPLETED', conclusion: 'FAILURE' }],
		}), configuration, '2026-08-02T00:00:00.000Z');
		const ready = evaluateAgentMerge(readySnapshot({ draft: true }), configuration, '2026-08-02T00:00:00.000Z');

		assert.deepStrictEqual({
			repair: repair.kind === 'prompt' ? repair.actions : repair.kind,
			ready: ready.kind,
		}, {
			repair: ['addressReviews', 'fixCI'],
			ready: 'noWork',
		});
	});

	test('reports when required checks and review feedback are ready', () => {
		const watermark = '2026-08-02T00:00:00.000Z';
		assert.deepStrictEqual({
			ready: isAgentMergePullRequestReadyForReview(readySnapshot({ draft: true }), watermark),
			notDraft: isAgentMergePullRequestReadyForReview(readySnapshot(), watermark),
			pendingChecks: isAgentMergePullRequestReadyForReview(readySnapshot({
				draft: true,
				checks: [{ id: 'required', type: 'checkRun', name: 'Build', required: true, status: 'IN_PROGRESS' }],
			}), watermark),
			failingChecks: isAgentMergePullRequestReadyForReview(readySnapshot({
				draft: true,
				checks: [{ id: 'required', type: 'checkRun', name: 'Build', required: true, status: 'COMPLETED', conclusion: 'FAILURE' }],
			}), watermark),
			reviewComments: isAgentMergePullRequestReadyForReview(readySnapshot({
				draft: true,
				reviewThreads: [{
					id: 'thread-1',
					isResolved: false,
					comments: [{ id: 'comment-1', author: { login: 'maintainer', association: 'MEMBER' }, body: 'Please fix this' }],
				}],
			}), watermark),
			newComments: isAgentMergePullRequestReadyForReview(readySnapshot({
				draft: true,
				topLevelComments: [{ id: 'comment-1', author: { login: 'maintainer', association: 'MEMBER' }, body: 'Please fix this', createdAt: '2026-08-03T00:00:00.000Z' }],
			}), watermark),
		}, {
			ready: true,
			notDraft: undefined,
			pendingChecks: false,
			failingChecks: false,
			reviewComments: false,
			newComments: false,
		});
	});

	test('merges only from complete ready state', () => {
		assert.deepStrictEqual(evaluateAgentMerge(readySnapshot(), configuration, '2026-08-02T00:00:00.000Z').kind, 'merge');
	});

	test('does not let a later commented review dismiss changes requested', () => {
		const result = evaluateAgentMerge(readySnapshot({
			submittedReviews: [
				{ id: 'changes', author: { id: '1', login: 'maintainer', association: 'MEMBER' }, state: 'CHANGES_REQUESTED', body: 'Fix this', submittedAt: '2026-08-01T00:00:00.000Z' },
				{ id: 'comment', author: { id: '1', login: 'maintainer', association: 'MEMBER' }, state: 'COMMENTED', body: 'More context', submittedAt: '2026-08-02T00:00:00.000Z' },
			],
		}), configuration, '2026-08-02T00:00:00.000Z');

		assert.deepStrictEqual(result.kind === 'prompt' ? result.actions : result.kind, ['addressReviews']);
	});

	test('waits without a turn while required checks are pending', () => {
		const result = evaluateAgentMerge(readySnapshot({
			checks: [{ id: 'required', type: 'checkRun', name: 'Build', required: true, status: 'IN_PROGRESS' }],
		}), configuration, '2026-08-02T00:00:00.000Z');

		assert.deepStrictEqual(result, {
			kind: 'noWork',
			waitingOnChecks: true,
			fingerprint: JSON.stringify({
				actions: [],
				context: {
					pullRequestUrl: 'https://github.com/octo/repo/pull/1',
					title: 'Change',
					headSha: 'head',
					baseRef: 'main',
					headRef: 'feature',
					reviewThreads: [],
					reviewSummaries: [],
					newComments: [],
					failedChecks: [],
					behind: false,
					conflicting: false,
					commentWatermark: '2026-08-02T00:00:00.000Z',
				},
			}),
		});
	});

	test('keeps feedback bounded for a comment-heavy pull request', () => {
		const result = evaluateAgentMerge(readySnapshot({
			reviewThreads: Array.from({ length: 40 }, (_, index) => ({
				id: `thread-${index}`,
				isResolved: false,
				comments: Array.from({ length: 20 }, (_, comment) => ({
					id: `comment-${index}-${comment}`,
					author: { login: 'maintainer', association: 'MEMBER' },
					body: 'x'.repeat(5_000),
				})),
			})),
		}), configuration, '2026-08-02T00:00:00.000Z');

		const context = result.kind === 'prompt' ? result.context : undefined;
		const totalBodyLength = (context?.reviewThreads ?? [])
			.flatMap(thread => thread.comments)
			.reduce((total, comment) => total + comment.body.length, 0);
		assert.deepStrictEqual({
			threads: context?.reviewThreads.length,
			commentsPerThread: context?.reviewThreads[0]?.comments.length,
			withinBudget: totalBodyLength <= 20_000,
		}, {
			threads: 10,
			commentsPerThread: 5,
			withinBudget: true,
		});
	});

	test('names the fragment holding evaluation back and why', () => {
		const failing = readySnapshot();
		assert.deepStrictEqual([
			evaluateAgentMerge({
				...failing,
				checks: {
					status: 'error',
					complete: false,
					error: { kind: 'authorization', statusCode: 200, message: 'Resource protected by organization SAML enforcement.' },
				},
			}, configuration, '2026-08-02T00:00:00.000Z'),
			evaluateAgentMerge({
				...failing,
				mergeability: { status: 'loading', complete: false },
			}, configuration, '2026-08-02T00:00:00.000Z'),
		], [
			{ kind: 'indeterminate', reason: 'Pull request checks could not be loaded (authorization): Resource protected by organization SAML enforcement.', cause: 'checks:authorization' },
			{ kind: 'indeterminate', reason: 'Pull request mergeability state is incomplete or stale (status=loading, complete=false)', cause: 'mergeability:incomplete' },
		]);
	});

	test('keeps client and controller state in separate config values', () => {
		assert.deepStrictEqual(readAgentMergeSessionState({
			[SessionConfigKey.AgentMerge]: { enabled: true, overrides: { fixCI: false } },
			[SessionConfigKey.AgentMergeController]: {
				target: {
					branchName: 'feature',
					pullRequestUrl: 'https://github.com/octo/repo/pull/1',
					enabledAt: '2026-08-01T00:00:00.000Z',
					commentWatermark: '2026-08-02T00:00:00.000Z',
				},
				lastPromptFingerprint: 'fingerprint',
			},
		}), {
			enabled: true,
			overrides: { fixCI: false },
			target: {
				branchName: 'feature',
				pullRequestUrl: 'https://github.com/octo/repo/pull/1',
				enabledAt: '2026-08-01T00:00:00.000Z',
				commentWatermark: '2026-08-02T00:00:00.000Z',
			},
			lastPromptFingerprint: 'fingerprint',
		});
	});

	test('reads the merge choice as an enum, migrating the retired boolean form', () => {
		const overridesFor = (mergePullRequest: unknown) => readAgentMergeSessionState({
			[SessionConfigKey.AgentMerge]: { enabled: true, overrides: { mergePullRequest } },
		})?.overrides;

		assert.deepStrictEqual({
			legacyTrue: overridesFor(true),
			legacyFalse: overridesFor(false),
			ifUnchanged: overridesFor('ifUnchanged'),
			unknown: overridesFor('bogus'),
		}, {
			legacyTrue: { mergePullRequest: 'always' },
			legacyFalse: { mergePullRequest: 'never' },
			ifUnchanged: { mergePullRequest: 'ifUnchanged' },
			unknown: undefined,
		});
	});

	test('explains what Agent Merge does when it starts', () => {
		assert.strictEqual(agentMergeEnabledNotice({ branchName: 'feature' }, {
			...configuration,
			mergePullRequest: 'never',
		}), [
			'Agent Merge is enabled for `feature`. It will wait for a pull request on this branch, then monitor it.',
			'It will ask the agent to address new pull request review comments.',
			'It will ask the agent to fix failing CI checks.',
			'It will ask the agent to resolve merge conflicts and update the branch when it falls behind.',
			'Replies it posts will identify Agent Merge as the source.',
			'After each update, it will wait for new CI results and review comments.',
			'It will not merge the pull request automatically and will keep monitoring it.',
		].map((line, index) => index === 0 ? `${line}\n` : `- ${line}`).join('\n'));
	});

	test('reports when Agent Merge merges a pull request', () => {
		assert.strictEqual(
			agentMergeDisableReasons.pullRequestMerged(123, 'https://github.com/octo/repo/pull/123').notice,
			'Agent Merge merged pull request [#123](https://github.com/octo/repo/pull/123).',
		);
	});

	test('describes effective Agent Merge configuration changes', () => {
		const previous: AgentMergeConfiguration = {
			...configuration,
			mergePullRequest: 'never',
			mergeMethod: 'auto',
			replyAttribution: true,
		};
		const current: AgentMergeConfiguration = {
			...previous,
			addressReviews: false,
			fixCI: false,
			resolveConflicts: false,
			mergePullRequest: 'always',
			mergeMethod: 'squash',
			replyAttribution: false,
		};

		assert.strictEqual(agentMergeConfigurationChangedNotice(previous, current), [
			'Agent Merge settings changed.',
			'It will no longer address new pull request review comments or wait for them before merging.',
			'It will no longer fix failing CI checks.',
			'It will no longer resolve merge conflicts or update a behind branch.',
			'It will now merge the pull request automatically when it is ready.',
			'It will now squash-merge the pull request.',
		].map((line, index) => index === 0 ? `${line}\n` : `- ${line}`).join('\n'));
	});

	test('describes an already-bound pull request without claiming disabled review behavior', () => {
		assert.strictEqual(agentMergeEnabledNotice({
			branchName: 'feature',
			pullRequestUrl: 'https://github.com/octo/repo/pull/1',
		}, {
			...configuration,
			addressReviews: false,
			mergePullRequest: 'always',
			mergeMethod: 'squash',
		}), [
			'Agent Merge is enabled for `feature` and is monitoring its pull request.',
			'It will ask the agent to fix failing CI checks.',
			'It will ask the agent to resolve merge conflicts and update the branch when it falls behind.',
			'After each update, it will wait for new CI results.',
			'When the pull request is ready, Agent Merge will merge it automatically.',
			'It will squash-merge the pull request.',
		].map((line, index) => index === 0 ? `${line}\n` : `- ${line}`).join('\n'));
	});

	test('announces reply-attribution changes only while review replies are enabled', () => {
		assert.deepStrictEqual({
			enabled: agentMergeConfigurationChangedNotice(configuration, { ...configuration, replyAttribution: false }),
			reviewsDisabled: agentMergeConfigurationChangedNotice(
				{ ...configuration, addressReviews: false },
				{ ...configuration, addressReviews: false, replyAttribution: false },
			),
		}, {
			enabled: 'Agent Merge settings changed.\n\n- Replies it posts will no longer identify Agent Merge as the source.',
			reviewsDisabled: undefined,
		});
	});

	test('omits an Agent Merge configuration notice when effective behavior is unchanged', () => {
		assert.strictEqual(agentMergeConfigurationChangedNotice(configuration, { ...configuration }), undefined);
	});

	test('only merges automatically when the merge choice is not "never"', () => {
		const gateFor = (mergePullRequest: AgentMergeConfiguration['mergePullRequest']) =>
			evaluateAgentMerge(readySnapshot(), { ...configuration, mergePullRequest }, '2026-08-02T00:00:00.000Z').kind;

		assert.deepStrictEqual({
			always: gateFor('always'),
			ifUnchanged: gateFor('ifUnchanged'),
			never: gateFor('never'),
		}, {
			always: 'merge',
			ifUnchanged: 'merge',
			never: 'noWork',
		});
	});

	test('stops merging automatically once a repair turn changes the worktree', () => {
		const ifUnchanged: AgentMergeConfiguration = { ...configuration, mergePullRequest: 'ifUnchanged' };
		const enabled = { enabled: true };

		assert.deepStrictEqual({
			noRepairYet: shouldStopMergingAfterAgentChanges(ifUnchanged, enabled, 'sha1'),
			repairCommittedNothing: shouldStopMergingAfterAgentChanges(ifUnchanged, { ...enabled, repairBaseCommit: 'sha1' }, 'sha1'),
			repairCommitted: shouldStopMergingAfterAgentChanges(ifUnchanged, { ...enabled, repairBaseCommit: 'sha1' }, 'sha2'),
			// Fails closed: an unreadable worktree after a repair turn, and an
			// unreadable one when the baseline was taken, both count as changed.
			worktreeUnreadable: shouldStopMergingAfterAgentChanges(ifUnchanged, { ...enabled, repairBaseCommit: 'sha1' }, undefined),
			baselineUnknown: shouldStopMergingAfterAgentChanges(ifUnchanged, { ...enabled, repairBaseCommit: AGENT_MERGE_UNKNOWN_COMMIT }, 'sha1'),
			always: shouldStopMergingAfterAgentChanges({ ...configuration, mergePullRequest: 'always' }, { ...enabled, repairBaseCommit: 'sha1' }, 'sha2'),
			never: shouldStopMergingAfterAgentChanges({ ...configuration, mergePullRequest: 'never' }, { ...enabled, repairBaseCommit: 'sha1' }, 'sha2'),
		}, {
			noRepairYet: false,
			repairCommittedNothing: false,
			repairCommitted: true,
			worktreeUnreadable: true,
			baselineUnknown: true,
			always: false,
			never: false,
		});
	});

	test('returns pre-merge picker values when merge-injected values are active', () => {
		const values = {
			[SessionConfigKey.AgentMerge]: { enabled: true },
			[SessionConfigKey.AgentMergeController]: {
				injectedConfiguration: {
					previous: {
						autoApprove: 'default',
						mode: 'interactive',
						permissionMode: 'acceptEdits',
					},
					applied: {
						autoApprove: 'assisted',
						mode: 'autopilot',
						permissionMode: 'auto',
					},
				},
			},
			autoApprove: 'assisted',
			mode: 'autopilot',
			permissionMode: 'auto',
			permissions: { allow: ['shell'] },
		};
		assert.deepStrictEqual(getNonMergeSessionConfigValues(values), {
			[SessionConfigKey.AgentMerge]: { enabled: true },
			[SessionConfigKey.AgentMergeController]: values[SessionConfigKey.AgentMergeController],
			autoApprove: 'default',
			mode: 'interactive',
			permissionMode: 'acceptEdits',
			permissions: { allow: ['shell'] },
		});
	});

	test('leaves session config unchanged when merge is disabled', () => {
		const values = {
			[SessionConfigKey.AgentMerge]: { enabled: false },
			autoApprove: 'autoApprove',
			mode: 'plan',
			permissionMode: 'plan',
		};
		assert.deepStrictEqual(getNonMergeSessionConfigValues(values), values);
	});
});

function readySnapshot(overrides?: {
	readonly draft?: boolean;
	readonly topLevelComments?: NonNullable<PullRequestSnapshot['topLevelComments']['value']>;
	readonly submittedReviews?: NonNullable<PullRequestSnapshot['submittedReviews']['value']>;
	readonly reviewThreads?: NonNullable<PullRequestSnapshot['reviewThreads']['value']>;
	readonly checks?: NonNullable<PullRequestSnapshot['checks']['value']>['checks'];
}): PullRequestSnapshot {
	return {
		ref: { host: 'github.com', accountId: '1', owner: 'octo', repo: 'repo', number: 1 },
		generation: 1,
		headGeneration: 1,
		core: {
			status: 'ready',
			complete: true,
			value: {
				repositoryNameWithOwner: 'octo/repo',
				number: 1,
				title: 'Change',
				url: 'https://github.com/octo/repo/pull/1',
				state: 'open',
				draft: overrides?.draft ?? false,
				headSha: 'head',
				headRef: 'feature',
				baseSha: 'base',
				baseRef: 'main',
			},
		},
		topLevelComments: { status: 'ready', complete: true, value: overrides?.topLevelComments ?? [] },
		submittedReviews: { status: 'ready', complete: true, value: overrides?.submittedReviews ?? [] },
		inlineComments: { status: 'missing', complete: false },
		reviewThreads: { status: 'ready', complete: true, headSha: 'head', value: overrides?.reviewThreads ?? [] },
		checks: {
			status: 'ready',
			complete: true,
			headSha: 'head',
			value: { headSha: 'head', requirednessComplete: true, expectedSuites: [], expectedSuitesComplete: true, checks: overrides?.checks ?? [] },
		},
		mergeability: {
			status: 'ready',
			complete: true,
			headSha: 'head',
			value: {
				headSha: 'head',
				baseSha: 'base',
				mergeable: 'MERGEABLE',
				mergeStateStatus: 'CLEAN',
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
