/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IMouseWheelEvent, isMouseWheelEventFromBeforeWindowFocus } from '../../browser/mouseEvent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('mouseEvent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('detects wheel events that predate the latest window focus', () => {
		const targetWindow = { performance: { timeOrigin: 1_000 } } as unknown as Window;

		const staleRelativeEvent = { timeStamp: 1_000, view: targetWindow } as IMouseWheelEvent;
		const recentRelativeEvent = { timeStamp: 1_300, view: targetWindow } as IMouseWheelEvent;
		const nearFocusRelativeEvent = { timeStamp: 1_260, view: targetWindow } as IMouseWheelEvent;
		const staleEpochEvent = { timeStamp: 2_000_000_000_000, view: targetWindow } as IMouseWheelEvent;
		const unknownTimestampEvent = { timeStamp: 0, view: targetWindow } as IMouseWheelEvent;

		assert.strictEqual(isMouseWheelEventFromBeforeWindowFocus(staleRelativeEvent, 2_200), true);
		assert.strictEqual(isMouseWheelEventFromBeforeWindowFocus(recentRelativeEvent, 2_200), false);
		assert.strictEqual(isMouseWheelEventFromBeforeWindowFocus(nearFocusRelativeEvent, 2_300), false);
		assert.strictEqual(isMouseWheelEventFromBeforeWindowFocus(staleEpochEvent, 2_000_000_000_200), true);
		assert.strictEqual(isMouseWheelEventFromBeforeWindowFocus(unknownTimestampEvent, 2_200), false);
		assert.strictEqual(isMouseWheelEventFromBeforeWindowFocus(staleRelativeEvent, 0), false);
	});
});
