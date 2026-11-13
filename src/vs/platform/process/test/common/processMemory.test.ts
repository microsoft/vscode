/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AwakeUptimeClock } from '../../common/processMemory.js';

suite('AwakeUptimeClock', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const MINUTE = 60 * 1000;

	test('reaches each milestone once, and not while the machine sleeps', () => {
		const clock = new AwakeUptimeClock(0, 0);
		const reached: { atMinute: number; milestone: number }[] = [];
		let now = 0;
		const run = (minutes: number, step: number) => {
			for (let elapsed = 0; elapsed < minutes; elapsed += step) {
				now += step * MINUTE;
				const milestone = clock.advance(now);
				if (milestone !== undefined) {
					reached.push({ atMinute: now / MINUTE, milestone });
				}
			}
		};

		run(30, 1);
		run(120, 120); // asleep
		run(3 * 24 * 60 + 60, 10);

		assert.deepStrictEqual(reached, [
			{ atMinute: 15, milestone: 15 },
			{ atMinute: 180, milestone: 60 },
			{ atMinute: 360, milestone: 240 },
			{ atMinute: 600, milestone: 480 },
			{ atMinute: 1560, milestone: 1440 },
			{ atMinute: 3000, milestone: 2880 },
			{ atMinute: 4440, milestone: 4320 },
		]);
	});

	test('only reaches the latest milestone when it starts late', () => {
		const clock = new AwakeUptimeClock(0, 300 * MINUTE);

		assert.deepStrictEqual([clock.advance(300 * MINUTE), clock.advance(301 * MINUTE)], [240, undefined]);
	});
});
