/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CopilotMcpReadinessTracker } from '../../node/copilot/copilotMcpReadiness.js';

/** Controllable stand-in for the tracker's stopwatch. */
class TestClock {
	private _now = 0;
	advanceTo(ms: number): void { this._now = ms; }
	elapsed(): number { return this._now; }
}

suite('CopilotMcpReadinessTracker', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports the slowest individual server startup', () => {
		const clock = new TestClock();
		const tracker = new CopilotMcpReadinessTracker(clock);
		for (const name of ['fast', 'slow', 'broken', 'waiting']) {
			tracker.observe(name, 'pending');
		}
		clock.advanceTo(12);
		tracker.observe('broken', 'failed');
		clock.advanceTo(6920);
		tracker.observe('fast', 'connected');
		clock.advanceTo(28918);
		tracker.observe('slow', 'connected');

		assert.deepStrictEqual(tracker.snapshot(), {
			serverCount: 4,
			readyCount: 2,
			failedCount: 1,
			unresolvedCount: 1,
			stoppedCount: 0,
			slowestServerMs: 28918,
		});
	});

	test('excludes idle time between an early server settling and a later one starting', () => {
		const clock = new TestClock();
		const tracker = new CopilotMcpReadinessTracker(clock);
		tracker.observe('a', 'pending');
		clock.advanceTo(100);
		tracker.observe('a', 'connected');

		// Ten minutes later a second server is added and takes one second.
		clock.advanceTo(600_000);
		tracker.observe('b', 'pending');
		clock.advanceTo(601_000);
		tracker.observe('b', 'connected');

		assert.deepStrictEqual(tracker.snapshot(), {
			serverCount: 2, readyCount: 2, failedCount: 0, unresolvedCount: 0, stoppedCount: 0, slowestServerMs: 1000,
		});
	});

	test('keeps the first duration when a server is re-reported', () => {
		const clock = new TestClock();
		const tracker = new CopilotMcpReadinessTracker(clock);
		tracker.observe('server', 'pending');
		clock.advanceTo(500);
		tracker.observe('server', 'connected');
		clock.advanceTo(90000);
		tracker.observe('server', 'connected');

		assert.deepStrictEqual(tracker.snapshot(), {
			serverCount: 1, readyCount: 1, failedCount: 0, unresolvedCount: 0, stoppedCount: 0, slowestServerMs: 500,
		});
	});

	test('reports no duration for startups it did not observe end to end', () => {
		const clock = new TestClock();
		// Still starting.
		const unresolved = new CopilotMcpReadinessTracker(clock);
		unresolved.observe('auth', 'needs-auth');
		// First seen already connected, e.g. an inventory seed after the fact.
		const seeded = new CopilotMcpReadinessTracker(clock);
		seeded.observe('already-up', 'connected');
		clock.advanceTo(2000);

		assert.deepStrictEqual([unresolved.snapshot(), seeded.snapshot(), new CopilotMcpReadinessTracker(new TestClock()).snapshot()], [
			{ serverCount: 1, readyCount: 0, failedCount: 0, unresolvedCount: 1, stoppedCount: 0, slowestServerMs: undefined },
			{ serverCount: 1, readyCount: 1, failedCount: 0, unresolvedCount: 0, stoppedCount: 0, slowestServerMs: undefined },
			{ serverCount: 0, readyCount: 0, failedCount: 0, unresolvedCount: 0, stoppedCount: 0, slowestServerMs: undefined },
		]);
	});

	test('excludes servers that never start, and times one that starts after being disabled', () => {
		const clock = new TestClock();
		const allStopped = new CopilotMcpReadinessTracker(clock);
		allStopped.observe('off', 'disabled');
		allStopped.observe('absent', 'not_configured');

		// Disabled first, then enabled and takes a second: the disabled
		// observation must not anchor or short-circuit the measurement.
		const enabledLater = new CopilotMcpReadinessTracker(clock);
		enabledLater.observe('later', 'disabled');
		clock.advanceTo(1000);
		enabledLater.observe('later', 'pending');
		clock.advanceTo(2000);
		enabledLater.observe('later', 'connected');

		assert.deepStrictEqual([allStopped.snapshot(), enabledLater.snapshot()], [
			{ serverCount: 2, readyCount: 0, failedCount: 0, unresolvedCount: 0, stoppedCount: 2, slowestServerMs: undefined },
			{ serverCount: 1, readyCount: 1, failedCount: 0, unresolvedCount: 0, stoppedCount: 0, slowestServerMs: 1000 },
		]);
	});
});
