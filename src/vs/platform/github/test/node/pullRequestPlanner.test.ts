/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitHubHostCapabilities } from '../../common/githubTypes.js';
import { unionPullRequestInterests } from '../../common/pullRequestInterests.js';
import { PullRequestRequestPlanner } from '../../common/pullRequestRequestPlanner.js';
import { PullRequestScheduler } from '../../common/pullRequestScheduler.js';
import { FakeGitHubScheduler } from './fakeGitHubScheduler.js';

suite('PullRequest planning', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('unions interests and priority independently per fragment', () => {
		const interests = unionPullRequestInterests([
			{
				priority: 'visible',
				conversation: { topLevelComments: true, includeBodies: true },
			},
			{
				priority: 'background',
				checks: { required: true },
			},
			{
				priority: 'interactive',
				conversation: { topLevelComments: true, reviewThreads: true },
			},
		]);

		assert.deepStrictEqual([...interests], [
			['core', { priority: 'interactive', includeBodies: false, requiredChecks: false, includeOptionalChecks: false }],
			['topLevelComments', { priority: 'interactive', includeBodies: true, requiredChecks: false, includeOptionalChecks: false }],
			['checks', { priority: 'background', requiredChecks: true, includeOptionalChecks: false }],
			['reviewThreads', { priority: 'interactive', includeBodies: false }],
		]);
	});

	test('selects capability-aware independent request plans', () => {
		const planner = new PullRequestRequestPlanner();
		const available: GitHubHostCapabilities = {
			graphql: true,
			mergeQueue: true,
			internalMergeStatus: false,
			reviewThreads: true,
			checkContextRequiredness: true,
		};
		const unavailable: GitHubHostCapabilities = {
			graphql: false,
			mergeQueue: false,
			internalMergeStatus: false,
			reviewThreads: false,
			checkContextRequiredness: false,
		};

		assert.deepStrictEqual({
			core: planner.plan('core', 'visible', available),
			threads: planner.plan('reviewThreads', 'interactive', available),
			checks: planner.plan('checks', 'background', unavailable),
			mergeability: planner.plan('mergeability', 'visible', unavailable),
			unavailableThreads: planner.plan('reviewThreads', 'background', unavailable),
		}, {
			core: { fragment: 'core', strategy: 'rest', priority: 'visible', completeWhenSuccessful: true },
			threads: { fragment: 'reviewThreads', strategy: 'graphql', priority: 'interactive', completeWhenSuccessful: true },
			checks: { fragment: 'checks', strategy: 'restChecksFallback', priority: 'background', completeWhenSuccessful: false },
			mergeability: { fragment: 'mergeability', strategy: 'restMergeabilityFallback', priority: 'visible', completeWhenSuccessful: false },
			unavailableThreads: { fragment: 'reviewThreads', strategy: 'unavailable', priority: 'background', completeWhenSuccessful: false },
		});
	});

	test('uses one timer for ordered due-time work', () => {
		const clock = new FakeGitHubScheduler({ now: 100 });
		const scheduler = disposables.add(new PullRequestScheduler(clock));
		const calls: string[] = [];

		scheduler.schedule('later', 120, () => calls.push('later'));
		scheduler.schedule('first', 110, () => calls.push('first'));
		scheduler.schedule('second', 110, () => calls.push('second'));
		assert.strictEqual(clock.pendingCount, 1);

		clock.advanceTo(110);
		assert.deepStrictEqual({ calls, pendingTimers: clock.pendingCount }, {
			calls: ['first', 'second'],
			pendingTimers: 1,
		});

		scheduler.cancel('later');
		assert.strictEqual(clock.pendingCount, 0);
	});
});
