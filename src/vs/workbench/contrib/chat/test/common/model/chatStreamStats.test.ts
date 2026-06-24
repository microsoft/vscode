/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ChatStreamStatsTracker, type IChatStreamStatsInternal } from '../../../common/model/chatStreamStats.js';

suite('ChatStreamStatsTracker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTracker(): ChatStreamStatsTracker {
		return new ChatStreamStatsTracker(store.add(new NullLogService()));
	}

	test('drops bootstrap once sufficient markdown streamed', () => runWithFakedTimers<void>({ startTime: 0, useFakeTimers: true }, async () => {
		const tracker = createTracker();

		let data = tracker.update({ totalWordCount: 10 }) as IChatStreamStatsInternal | undefined;
		assert.ok(data);
		assert.strictEqual(data.bootstrapActive, true);
		assert.strictEqual(data.totalTime, 250);

		await timeout(100);
		data = tracker.update({ totalWordCount: 35 }) as IChatStreamStatsInternal | undefined;
		assert.ok(data);
		assert.strictEqual(data.bootstrapActive, false);
		assert.strictEqual(data.totalTime, 100);
		assert.strictEqual(data.lastWordCount, 35);
	}));

	test('large initial chunk uses higher bootstrap minimum', () => runWithFakedTimers<void>({ startTime: 0, useFakeTimers: true }, async () => {
		const tracker = createTracker();

		const data = tracker.update({ totalWordCount: 40 }) as IChatStreamStatsInternal | undefined;
		assert.ok(data);
		assert.strictEqual(data.bootstrapActive, true);
		assert.strictEqual(data.totalTime, 500);
	}));

	test('ignores updates without new words', () => runWithFakedTimers<void>({ startTime: 0, useFakeTimers: true }, async () => {
		const tracker = createTracker();

		const first = tracker.update({ totalWordCount: 5 });
		assert.ok(first);

		await timeout(50);
		const second = tracker.update({ totalWordCount: 5 });
		assert.strictEqual(second, undefined);
	}));

	test('ignores zero-word totals until words arrive', () => runWithFakedTimers<void>({ startTime: 0, useFakeTimers: true }, async () => {
		const tracker = createTracker();

		const zero = tracker.update({ totalWordCount: 0 });
		assert.strictEqual(zero, undefined);
		assert.strictEqual(tracker.internalData.lastWordCount, 0);
		assert.strictEqual(tracker.internalData.totalTime, 0);

		await timeout(100);
		const data = tracker.update({ totalWordCount: 12 }) as IChatStreamStatsInternal | undefined;
		assert.ok(data);
		assert.strictEqual(data.bootstrapActive, true);
		assert.strictEqual(data.totalTime, 500);
	}));

	test('unchanged totals do not advance timers', () => runWithFakedTimers<void>({ startTime: 0, useFakeTimers: true }, async () => {
		const tracker = createTracker();

		const first = tracker.update({ totalWordCount: 6 }) as IChatStreamStatsInternal | undefined;
		assert.ok(first);
		const initialTotalTime = first.totalTime;
		const initialLastUpdateTime = first.lastUpdateTime;

		await timeout(400);
		const second = tracker.update({ totalWordCount: 6 });
		assert.strictEqual(second, undefined);

		assert.strictEqual(tracker.internalData.totalTime, initialTotalTime);
		assert.strictEqual(tracker.internalData.lastUpdateTime, initialLastUpdateTime);
	}));

	test('records first markdown time but keeps bootstrap active', () => runWithFakedTimers<void>({ startTime: 0, useFakeTimers: true }, async () => {
		const tracker = createTracker();

		const data = tracker.update({ totalWordCount: 12 }) as IChatStreamStatsInternal | undefined;
		assert.ok(data);
		assert.strictEqual(data.bootstrapActive, true);
		assert.strictEqual(data.firstMarkdownTime, 0);
		assert.strictEqual(data.totalTime, 500);
	}));

	test('implied rate uses elapsed time after bootstrap drops', () => runWithFakedTimers<void>({ startTime: 0, useFakeTimers: true }, async () => {
		const tracker = createTracker();
		assert.ok(tracker.update({ totalWordCount: 10 }));

		await timeout(300);
		const data = tracker.update({ totalWordCount: 40 }) as IChatStreamStatsInternal | undefined;
		assert.ok(data);
		assert.strictEqual(data.bootstrapActive, false);
		assert.strictEqual(data.totalTime, 300);
		const expectedRate = 30 / 0.3;
		assert.ok(Math.abs(data.impliedWordLoadRate - expectedRate) < 0.0001);
	}));

	test('keeps bootstrap active until both thresholds satisfied', () => runWithFakedTimers<void>({ startTime: 0, useFakeTimers: true }, async () => {
		const tracker = createTracker();
		let data = tracker.update({ totalWordCount: 8 }) as IChatStreamStatsInternal | undefined;
		assert.ok(data);
		assert.strictEqual(data.bootstrapActive, true);
		assert.strictEqual(data.wordCountAtBootstrapExit, undefined);
		assert.strictEqual(data.totalTime, 250);

		await timeout(200);
		data = tracker.update({ totalWordCount: 12 }) as IChatStreamStatsInternal | undefined;
		assert.ok(data);
		assert.strictEqual(data.bootstrapActive, false);
		assert.strictEqual(data.wordCountAtBootstrapExit, 8);
		assert.strictEqual(data.totalTime, 200);
	}));

	test('caps interval contribution to max interval time', () => runWithFakedTimers<void>({ startTime: 0, useFakeTimers: true }, async () => {
		const tracker = createTracker();
		assert.ok(tracker.update({ totalWordCount: 5 }));

		await timeout(2000);
		const data = tracker.update({ totalWordCount: 9 }) as IChatStreamStatsInternal | undefined;
		assert.ok(data);
		assert.strictEqual(data.bootstrapActive, true);
		assert.strictEqual(data.totalTime, 250 + 250);
	}));

	test('uses larger interval cap for large updates', () => runWithFakedTimers<void>({ startTime: 0, useFakeTimers: true }, async () => {
		const tracker = createTracker();
		assert.ok(tracker.update({ totalWordCount: 10 }));

		await timeout(200);
		const exitData = tracker.update({ totalWordCount: 40 }) as IChatStreamStatsInternal | undefined;
		assert.ok(exitData);
		assert.strictEqual(exitData.bootstrapActive, false);
		const baselineTotal = exitData.totalTime;

		await timeout(2000);
		const postData = tracker.update({ totalWordCount: 90 }) as IChatStreamStatsInternal | undefined;
		assert.ok(postData);
		assert.strictEqual(postData.bootstrapActive, false);
		assert.strictEqual(postData.totalTime, baselineTotal + 1000);
	}));

	test('tracks words since bootstrap exit for rate calculation', () => runWithFakedTimers<void>({ startTime: 0, useFakeTimers: true }, async () => {
		const tracker = createTracker();
		assert.ok(tracker.update({ totalWordCount: 12 }));

		await timeout(200);
		const exitData = tracker.update({ totalWordCount: 45 }) as IChatStreamStatsInternal | undefined;
		assert.ok(exitData);
		assert.strictEqual(exitData.bootstrapActive, false);
		assert.strictEqual(exitData.wordCountAtBootstrapExit, 12);
		assert.strictEqual(exitData.totalTime, 200);

		await timeout(200);
		const postBootstrap = tracker.update({ totalWordCount: 60 }) as IChatStreamStatsInternal | undefined;
		assert.ok(postBootstrap);
		assert.strictEqual(postBootstrap.bootstrapActive, false);
		assert.strictEqual(postBootstrap.totalTime, 400);
		assert.strictEqual(postBootstrap.wordCountAtBootstrapExit, 12);
		const expectedRate = (60 - 12) / 0.4;
		assert.strictEqual(postBootstrap.impliedWordLoadRate, expectedRate);
	}));
});
