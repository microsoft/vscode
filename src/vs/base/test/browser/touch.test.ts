/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventType, Gesture } from '../../browser/touch.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
import { mainWindow } from '../../browser/window.js';

suite('Gesture', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('releases cancelled touches on touchcancel', () => {
		const target = document.createElement('div');
		mainWindow.document.body.appendChild(target);
		store.add({ dispose: () => target.remove() });

		// Enable touch device emulation for test
		const originalIsTouchDevice = Gesture.isTouchDevice;
		Gesture.isTouchDevice = () => true;
		store.add({
			dispose: () => {
				Gesture.isTouchDevice = originalIsTouchDevice;
			}
		});

		store.add(Gesture.addTarget(target));

		const events: string[] = [];
		const onStart = () => events.push('start');
		const onEnd = () => events.push('end');
		const onTap = () => events.push('tap');

		target.addEventListener(EventType.Start, onStart);
		target.addEventListener(EventType.End, onEnd);
		target.addEventListener(EventType.Tap, onTap);
		store.add({
			dispose: () => {
				target.removeEventListener(EventType.Start, onStart);
				target.removeEventListener(EventType.End, onEnd);
				target.removeEventListener(EventType.Tap, onTap);
			}
		});

		const createFakeTouch = (id: number, targetEl: EventTarget) => ({
			identifier: id,
			screenX: 10,
			screenY: 10,
			clientX: 10,
			clientY: 10,
			pageX: 10,
			pageY: 10,
			radiusX: 1,
			radiusY: 1,
			rotationAngle: 0,
			force: 1,
			target: targetEl as Element,
		});

		const createFakeTouchList = (...touches: ReturnType<typeof createFakeTouch>[]) => {
			const list: any = touches;
			list.item = (i: number) => touches[i];
			list.identifiedTouch = (id: number) => touches.find(t => t.identifier === id);
			return list;
		};

		const touch0 = createFakeTouch(0, target);

		// Dispatch touchstart
		const startEvent: any = new CustomEvent('touchstart', { bubbles: true, cancelable: true });
		startEvent.touches = createFakeTouchList(touch0);
		startEvent.targetTouches = createFakeTouchList(touch0);
		startEvent.changedTouches = createFakeTouchList(touch0);
		mainWindow.document.dispatchEvent(startEvent);

		assert.deepStrictEqual(events, ['start']);

		// Dispatch touchcancel (system interrupted touch)
		const cancelEvent: any = new CustomEvent('touchcancel', { bubbles: true, cancelable: false });
		cancelEvent.touches = createFakeTouchList();
		cancelEvent.targetTouches = createFakeTouchList();
		cancelEvent.changedTouches = createFakeTouchList(touch0);
		mainWindow.document.dispatchEvent(cancelEvent);

		// Must dispatch EventType.End to notify target, but NOT EventType.Tap
		// A second cancellation for the same identifier must be ignored since touch state was released
		mainWindow.document.dispatchEvent(cancelEvent);
		assert.deepStrictEqual(events, ['start', 'end']);
	});
});
