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

	test('reports the slowest parallel server as the startup window', () => {
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
			slowestServerMs: 28918,
		});
	});

	test('keeps the first settle time when a server is re-reported', () => {
		const clock = new TestClock();
		const tracker = new CopilotMcpReadinessTracker(clock);
		tracker.observe('server', 'pending');
		clock.advanceTo(500);
		tracker.observe('server', 'connected');
		clock.advanceTo(90000);
		tracker.observe('server', 'connected');

		assert.deepStrictEqual(tracker.snapshot(), {
			serverCount: 1, readyCount: 1, failedCount: 0, unresolvedCount: 0, slowestServerMs: 500,
		});
	});

	test('treats needs-auth as unsettled and reports no window until something settles', () => {
		const clock = new TestClock();
		const tracker = new CopilotMcpReadinessTracker(clock);
		tracker.observe('auth', 'needs-auth');
		clock.advanceTo(2000);

		assert.deepStrictEqual([tracker.snapshot(), new CopilotMcpReadinessTracker(new TestClock()).snapshot()], [
			{ serverCount: 1, readyCount: 0, failedCount: 0, unresolvedCount: 1, slowestServerMs: undefined },
			{ serverCount: 0, readyCount: 0, failedCount: 0, unresolvedCount: 0, slowestServerMs: undefined },
		]);
	});
});
