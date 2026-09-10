/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentsDashboardHistoryEvent, AgentsDashboardHistoryEventType, buildAgentsDashboardHistoryBuckets } from '../../common/agentsDashboardHistory.js';

suite('AgentsDashboardHistory', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('builds daily throughput, outcome, duration, and disk buckets', () => {
		const now = new Date(2026, 8, 8, 15).getTime();
		const yesterday = new Date(2026, 8, 7, 12).getTime();
		const today = new Date(2026, 8, 8, 10).getTime();
		const events: AgentsDashboardHistoryEvent[] = [
			{ id: 'started', type: AgentsDashboardHistoryEventType.SessionStarted, timestamp: yesterday },
			{ id: 'done-1', type: AgentsDashboardHistoryEventType.SessionDone, timestamp: yesterday, durationMs: 30 * 60_000 },
			{ id: 'done-2', type: AgentsDashboardHistoryEventType.SessionDone, timestamp: yesterday + 1, durationMs: 90 * 60_000 },
			{ id: 'pr-created', type: AgentsDashboardHistoryEventType.PullRequestCreated, timestamp: yesterday },
			{ id: 'pr-merged', type: AgentsDashboardHistoryEventType.PullRequestMerged, timestamp: today },
			{ id: 'disk-1', type: AgentsDashboardHistoryEventType.DiskUsage, timestamp: yesterday, value: 1024, medianSessionBytes: 512, largestSessionBytes: 768 },
			{ id: 'disk-2', type: AgentsDashboardHistoryEventType.DiskUsage, timestamp: today, value: 4096, medianSessionBytes: 1536, largestSessionBytes: 2560 },
			{ id: 'disk-3', type: AgentsDashboardHistoryEventType.DiskUsage, timestamp: today + 1, value: 2048, medianSessionBytes: 1024, largestSessionBytes: 1536 },
		];

		const buckets = buildAgentsDashboardHistoryBuckets(events, 'week', now);
		const yesterdayBucket = buckets.find(bucket => yesterday >= bucket.start && yesterday < bucket.end)!;
		const todayBucket = buckets.find(bucket => today >= bucket.start && today < bucket.end)!;

		assert.deepStrictEqual({
			yesterday: {
				started: yesterdayBucket.sessionsStarted,
				done: yesterdayBucket.sessionsDone,
				created: yesterdayBucket.pullRequestsCreated,
				merged: yesterdayBucket.pullRequestsMerged,
				medianDuration: yesterdayBucket.medianCompletionDurationMs,
				disk: yesterdayBucket.diskUsageBytes,
			},
			today: {
				merged: todayBucket.pullRequestsMerged,
				disk: todayBucket.diskUsageBytes,
				medianStorage: todayBucket.medianSessionStorageBytes,
				largestStorage: todayBucket.largestSessionStorageBytes,
			},
		}, {
			yesterday: {
				started: 1,
				done: 2,
				created: 1,
				merged: 0,
				medianDuration: 60 * 60_000,
				disk: 1024,
			},
			today: {
				merged: 1,
				disk: 2048,
				medianStorage: 1024,
				largestStorage: 1536,
			},
		});
	});
});
