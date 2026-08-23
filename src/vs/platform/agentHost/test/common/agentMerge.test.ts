/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentMergeConfiguration, evaluateAgentMerge, readAgentMergeSessionState } from '../../common/agentMerge.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { PullRequestSnapshot } from '../../../github/common/githubPullRequestService.js';

suite('Agent Merge gate', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const configuration: AgentMergeConfiguration = {
		addressReviews: true,
		fixCI: true,
		resolveConflicts: true,
		mergePullRequest: true,
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
});

function readySnapshot(overrides?: {
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
				draft: false,
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
