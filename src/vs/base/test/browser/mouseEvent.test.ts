/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IMouseWheelEvent, isStaleMouseWheelEvent } from '../../browser/mouseEvent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('mouseEvent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('detects stale mouse wheel events', () => {
		const now = Date.now();
		const performanceNow = performance.now();

		const recentRelativeEvent = { timeStamp: performanceNow } as IMouseWheelEvent;
		const staleRelativeEvent = { timeStamp: performanceNow - 2000 } as IMouseWheelEvent;
		const recentEpochEvent = { timeStamp: now } as IMouseWheelEvent;
		const staleEpochEvent = { timeStamp: now - 2000 } as IMouseWheelEvent;
		const unknownTimestampEvent = { timeStamp: 0 } as IMouseWheelEvent;

		assert.deepStrictEqual([
			isStaleMouseWheelEvent(recentRelativeEvent, now),
			isStaleMouseWheelEvent(staleRelativeEvent, now),
			isStaleMouseWheelEvent(recentEpochEvent, now),
			isStaleMouseWheelEvent(staleEpochEvent, now),
			isStaleMouseWheelEvent(unknownTimestampEvent, now),
		], [false, true, false, true, false]);
	});
});
