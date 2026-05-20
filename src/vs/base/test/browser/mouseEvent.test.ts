/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IMouseWheelEvent, WindowMouseWheelEventFilter } from '../../browser/mouseEvent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('mouseEvent', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('ignores wheel events queued before the window regained focus', () => {
		const targetWindow = createTestWindow({ hasFocus: false, now: 100 });
		const filter = store.add(new WindowMouseWheelEventFilter(targetWindow.window));

		assert.strictEqual(filter.shouldIgnore(createWheelEvent(10, targetWindow.window)), false);

		targetWindow.dispatchFocus(1000);

		assert.strictEqual(filter.shouldIgnore(createWheelEvent(200, targetWindow.window)), true);
		assert.strictEqual(filter.shouldIgnore(createWheelEvent(970, targetWindow.window)), false);
		assert.strictEqual(filter.shouldIgnore(createWheelEvent(1000, targetWindow.window)), false);
		assert.strictEqual(filter.shouldIgnore(createWheelEvent(1050, targetWindow.window)), false);
	});

	test('normalizes epoch-based wheel event timestamps', () => {
		const targetWindow = createTestWindow({ hasFocus: false, now: 100, timeOrigin: 100000 });
		const filter = store.add(new WindowMouseWheelEventFilter(targetWindow.window));

		targetWindow.dispatchFocus(101000);

		assert.strictEqual(filter.shouldIgnore(createWheelEvent(100200, targetWindow.window)), true);
		assert.strictEqual(filter.shouldIgnore(createWheelEvent(100970, targetWindow.window)), false);
		assert.strictEqual(filter.shouldIgnore(createWheelEvent(101000, targetWindow.window)), false);
	});
});

function createTestWindow(options: { hasFocus: boolean; now: number; timeOrigin?: number }): { window: Window; dispatchFocus(timeStamp: number): void } {
	let hasFocus = options.hasFocus;
	let focusListener: ((event: Event) => void) | undefined;

	const testWindow = {
		document: {
			hasFocus: () => hasFocus
		},
		performance: {
			now: () => options.now,
			timeOrigin: options.timeOrigin ?? 0
		},
		addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
			if (type === 'focus') {
				focusListener = typeof listener === 'function' ? listener : (event: Event) => listener.handleEvent(event);
			}
		},
		removeEventListener: (type: string) => {
			if (type === 'focus') {
				focusListener = undefined;
			}
		}
	} as unknown as Window;

	return {
		window: testWindow,
		dispatchFocus: (timeStamp: number) => {
			hasFocus = true;
			focusListener?.({ timeStamp } as Event);
		}
	};
}

function createWheelEvent(timeStamp: number, targetWindow: Window): IMouseWheelEvent {
	return { timeStamp, view: targetWindow } as IMouseWheelEvent;
}
