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
				comments: [{ id: 'comment-1', author: { login: 'maintainer', association: 'MEMBER' }, body: 'Please fix this' }],
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

		assert.deepStrictEqual(evaluateAgentMerge(snapshot, configuration, '2026-08-02T00:00:00.000Z'), {
			kind: 'prompt',
			actions: ['addressReviews', 'fixCI'],
			fingerprint: JSON.stringify({
				actions: ['addressReviews', 'fixCI'],
				context: {
					pullRequestUrl: 'https://github.com/octo/repo/pull/1',
					title: 'Change',
					headSha: 'head',
					baseRef: 'main',
					headRef: 'feature',
					reviewThreads: [{ id: 'thread-1', path: 'src/example.ts', line: 42, author: 'maintainer', body: 'Please fix this' }],
					reviewSummaries: [],
					newComments: [],
					failedChecks: ['Build'],
					behind: false,
					conflicting: false,
					commentWatermark: '2026-08-02T00:00:00.000Z',
				},
			}),
			context: {
				pullRequestUrl: 'https://github.com/octo/repo/pull/1',
				title: 'Change',
				headSha: 'head',
				baseRef: 'main',
				headRef: 'feature',
				reviewThreads: [{ id: 'thread-1', path: 'src/example.ts', line: 42, author: 'maintainer', body: 'Please fix this' }],
				reviewSummaries: [],
				newComments: [],
				failedChecks: ['Build'],
				behind: false,
				conflicting: false,
				commentWatermark: '2026-08-02T00:00:00.000Z',
			},
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
