/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AsyncProgress } from '../../common/progress.js';

suite('Progress', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('multiple report calls are processed in sequence', async () => {
		await runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 100 }, async () => {
			const executionOrder: string[] = [];
			const timeout = (time: number) => {
				return new Promise<void>(resolve => setTimeout(resolve, time));
			};
			const executor = async (value: number) => {
				executionOrder.push(`start ${value}`);
				if (value === 1) {
					// 1 is slowest
					await timeout(100);
				} else if (value === 2) {
					// 2 is also slow
					await timeout(50);
				} else {
					// 3 is fast
					await timeout(10);
				}
				executionOrder.push(`end ${value}`);
			};
			const progress = new AsyncProgress<number>(executor);

			progress.report(1);
			progress.report(2);
			progress.report(3);

			await timeout(1000);

			assert.deepStrictEqual(executionOrder, [
				'start 1',
				'end 1',
				'start 2',
				'end 2',
				'start 3',
				'end 3',
			]);
		});
	});
});
