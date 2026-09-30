/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { RELAY_ACTIVITY_INTERVAL_MS, RelayActivityReporter } from '../../common/relayActivity.js';

suite('RelayActivityReporter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let clock: sinon.SinonFakeTimers;

	setup(() => {
		clock = sinon.useFakeTimers();
	});

	teardown(() => {
		clock.restore();
	});

	test('reports bytes of an unfinished message at most once per interval', () => {
		const reports: number[] = [];
		const reporter = new RelayActivityReporter(() => reports.push(Date.now()));

		for (let elapsed = 0; elapsed <= 2.5 * RELAY_ACTIVITY_INTERVAL_MS; elapsed += RELAY_ACTIVITY_INTERVAL_MS / 10) {
			reporter.dataReceived();
			clock.tick(RELAY_ACTIVITY_INTERVAL_MS / 10);
		}

		assert.deepStrictEqual(reports, [0, RELAY_ACTIVITY_INTERVAL_MS, 2 * RELAY_ACTIVITY_INTERVAL_MS]);
	});

	test('does not report bytes that arrive right after a relayed message', () => {
		const reports: number[] = [];
		const reporter = new RelayActivityReporter(() => reports.push(Date.now()));

		// The chunk that completes a message is relayed before its bytes are observed.
		reporter.messageReceived();
		reporter.dataReceived();
		clock.tick(RELAY_ACTIVITY_INTERVAL_MS - 1);
		reporter.dataReceived();
		clock.tick(1);
		reporter.dataReceived();

		assert.deepStrictEqual(reports, [RELAY_ACTIVITY_INTERVAL_MS]);
	});

	test('reports after the clock jumps backwards', () => {
		const reports: number[] = [];
		const reporter = new RelayActivityReporter(() => reports.push(Date.now()));

		clock.setSystemTime(60_000);
		reporter.dataReceived();
		clock.setSystemTime(30_000);
		reporter.dataReceived();

		assert.deepStrictEqual(reports, [60_000, 30_000]);
	});
});
