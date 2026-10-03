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

	test('tracks the latest window focus time for wheel event filtering', () => {
		const originalDateNow = Date.now;
		const now = 2_200;

		try {
			Date.now = () => now;

			const focusedWindow = {
				document: { hasFocus: () => true },
				performance: { timeOrigin: 1_000 },
				addEventListener: () => { },
			} as unknown as Window;

			const staleAfterAlreadyFocusedEvent = { timeStamp: 1_000, view: focusedWindow } as IMouseWheelEvent;
			assert.strictEqual(isMouseWheelEventFromBeforeWindowFocus(staleAfterAlreadyFocusedEvent), true);

			let focusListener: ((event: Event) => void) | undefined;
			const initiallyUnfocusedWindow = {
				document: { hasFocus: () => false },
				performance: { timeOrigin: 1_000 },
				addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
					if (type === 'focus' && typeof listener === 'function') {
						focusListener = listener;
					}
				},
			} as unknown as Window;

			const staleBeforeFocusEvent = { timeStamp: 1_000, view: initiallyUnfocusedWindow } as IMouseWheelEvent;
			assert.strictEqual(isMouseWheelEventFromBeforeWindowFocus(staleBeforeFocusEvent), false);

			focusListener?.(new Event('focus'));
			assert.strictEqual(isMouseWheelEventFromBeforeWindowFocus(staleBeforeFocusEvent), true);
		} finally {
			Date.now = originalDateNow;
		}
	});
});
