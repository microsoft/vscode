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
		const targetWindow = createTestWindow({ hasFocus: false, now: 100, timeOrigin: 100000 });
		const filter = store.add(new WindowMouseWheelEventFilter(targetWindow.window));

		assert.strictEqual(filter.shouldIgnore(createWheelEvent(10, targetWindow.window)), false);

		targetWindow.dispatchFocus(1000);

		assert.strictEqual(filter.shouldIgnore(createWheelEvent(200, targetWindow.window)), true);
		assert.strictEqual(filter.shouldIgnore(createWheelEvent(949, targetWindow.window)), true);
		assert.strictEqual(filter.shouldIgnore(createWheelEvent(950, targetWindow.window)), false);
		assert.strictEqual(filter.shouldIgnore(createWheelEvent(970, targetWindow.window)), false);
		assert.strictEqual(filter.shouldIgnore(createWheelEvent(1000, targetWindow.window)), false);
		assert.strictEqual(filter.shouldIgnore(createWheelEvent(1050, targetWindow.window)), false);
	});

	test('normalizes epoch-based wheel event timestamps', () => {
		const timeOrigin = 1_700_000_000_000;
		const targetWindow = createTestWindow({ hasFocus: false, now: 100, timeOrigin });
		const filter = store.add(new WindowMouseWheelEventFilter(targetWindow.window));

		targetWindow.dispatchFocus(1000);

		assert.strictEqual(filter.shouldIgnore(createWheelEvent(timeOrigin + 200, targetWindow.window)), true);
		assert.strictEqual(filter.shouldIgnore(createWheelEvent(timeOrigin + 970, targetWindow.window)), false);
		assert.strictEqual(filter.shouldIgnore(createWheelEvent(timeOrigin + 1000, targetWindow.window)), false);
	});

	test('compares event timestamps from different windows', () => {
		const targetTimeOrigin = 1_700_000_000_000;
		const targetWindow = createTestWindow({ hasFocus: false, now: 100, timeOrigin: targetTimeOrigin });
		const laterSourceWindow = createTestWindow({ hasFocus: true, now: 100, timeOrigin: targetTimeOrigin + 900 });
		const earlierSourceWindow = createTestWindow({ hasFocus: true, now: 100, timeOrigin: targetTimeOrigin - 1000 });
		const filter = store.add(new WindowMouseWheelEventFilter(targetWindow.window));

		targetWindow.dispatchFocus(1000);

		assert.strictEqual(filter.shouldIgnore(createWheelEvent(200, laterSourceWindow.window)), false);
		assert.strictEqual(filter.shouldIgnore(createWheelEvent(1900, earlierSourceWindow.window)), true);
	});

	test('fails open when the event window time origin is inaccessible', () => {
		const targetWindow = createTestWindow({ hasFocus: false, now: 100, timeOrigin: 100000 });
		const inaccessibleSourceWindow = new Proxy(targetWindow.window, {
			get: (target, property, receiver) => {
				if (property === 'performance') {
					throw new Error('Inaccessible cross-origin property');
				}
				return Reflect.get(target, property, receiver);
			}
		});
		const filter = store.add(new WindowMouseWheelEventFilter(targetWindow.window));

		targetWindow.dispatchFocus(1000);

		assert.strictEqual(filter.shouldIgnore(createWheelEvent(200, inaccessibleSourceWindow)), false);
	});

	test('preserves a delayed first wheel event when the window is already focused', () => {
		const targetWindow = createTestWindow({ hasFocus: true, now: 1000, timeOrigin: 100000 });
		const filter = store.add(new WindowMouseWheelEventFilter(targetWindow.window));

		assert.strictEqual(filter.shouldIgnore(createWheelEvent(900, targetWindow.window)), false);
	});

	test('tracks only window focus events', () => {
		const targetWindow = createTestWindow({ hasFocus: true, now: 100, timeOrigin: 100000 });
		const filter = store.add(new WindowMouseWheelEventFilter(targetWindow.window));

		targetWindow.dispatchDescendantFocus(1000);

		assert.strictEqual(filter.shouldIgnore(createWheelEvent(200, targetWindow.window)), false);

		targetWindow.dispatchFocus(1000);

		assert.strictEqual(filter.shouldIgnore(createWheelEvent(200, targetWindow.window)), true);
	});

	test('tracks focus before a lazy filter is created', () => {
		const targetWindow = createTestWindow({ hasFocus: false, now: 100, timeOrigin: 100000 });
		const tracker = store.add(WindowMouseWheelEventFilter.trackWindowFocus(targetWindow.window));

		targetWindow.dispatchFocus(1000);

		const filter = store.add(new WindowMouseWheelEventFilter(targetWindow.window));
		assert.strictEqual(targetWindow.getFocusListenerCount(), 1);
		assert.strictEqual(filter.shouldIgnore(createWheelEvent(200, targetWindow.window)), true);

		tracker.dispose();
		assert.strictEqual(targetWindow.getFocusListenerCount(), 1);
	});

	test('shares the window focus listener and disposes filters idempotently', () => {
		const targetWindow = createTestWindow({ hasFocus: false, now: 100, timeOrigin: 100000 });
		const firstFilter = store.add(new WindowMouseWheelEventFilter(targetWindow.window));
		const secondFilter = store.add(new WindowMouseWheelEventFilter(targetWindow.window));

		assert.strictEqual(targetWindow.getFocusListenerCount(), 1);

		firstFilter.dispose();
		firstFilter.dispose();

		assert.strictEqual(targetWindow.getFocusListenerCount(), 1);

		targetWindow.dispatchFocus(1000);
		assert.strictEqual(secondFilter.shouldIgnore(createWheelEvent(200, targetWindow.window)), true);

		secondFilter.dispose();
		assert.strictEqual(targetWindow.getFocusListenerCount(), 0);
	});
});

function createTestWindow(options: { hasFocus: boolean; now: number; timeOrigin?: number }): {
	window: Window;
	dispatchFocus(timeStamp: number): void;
	dispatchDescendantFocus(timeStamp: number): void;
	getFocusListenerCount(): number;
} {
	let hasFocus = options.hasFocus;
	let focusListener: ((event: Event) => void) | undefined;
	let focusListenerCapture = false;
	let focusListenerCount = 0;

	const testWindow = {
		document: {
			hasFocus: () => hasFocus
		},
		performance: {
			now: () => options.now,
			timeOrigin: options.timeOrigin ?? 0
		},
		addEventListener: (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
			if (type === 'focus') {
				focusListener = typeof listener === 'function' ? listener : (event: Event) => listener.handleEvent(event);
				focusListenerCapture = options === true || (typeof options === 'object' && options.capture === true);
				focusListenerCount++;
			}
		},
		removeEventListener: (type: string) => {
			if (type === 'focus' && focusListener) {
				focusListener = undefined;
				focusListenerCapture = false;
				focusListenerCount--;
			}
		}
	} as unknown as Window;
	Object.defineProperty(testWindow, 'window', { value: testWindow });

	return {
		window: testWindow,
		dispatchFocus: (timeStamp: number) => {
			hasFocus = true;
			focusListener?.({ timeStamp } as Event);
		},
		dispatchDescendantFocus: (timeStamp: number) => {
			if (focusListenerCapture) {
				focusListener?.({ timeStamp } as Event);
			}
		},
		getFocusListenerCount: () => focusListenerCount
	};
}

function createWheelEvent(timeStamp: number, targetWindow: Window): IMouseWheelEvent {
	return { timeStamp, view: targetWindow } as IMouseWheelEvent;
}
