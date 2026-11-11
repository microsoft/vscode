/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { registerWindow, runAtThisOrScheduleAtNextAnimationFrame, scheduleAtNextAnimationFrame } from '../../browser/dom.js';
import { ensureCodeWindow } from '../../browser/window.js';
import { timeout } from '../../common/async.js';
import { toDisposable } from '../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('Animation frame window lifetime', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let windowId = 11000;

	function createWindow() {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		store.add(toDisposable(() => iframe.remove()));
		const targetWindow = iframe.contentWindow!;
		ensureCodeWindow(targetWindow, windowId++);
		const registration = store.add(registerWindow(targetWindow));
		return { targetWindow, registration, iframe };
	}

	function scheduleCapturedResource(targetWindow: Window) {
		const resource = { calls: 0 };
		scheduleAtNextAnimationFrame(targetWindow, () => resource.calls++).dispose();
		return new WeakRef(resource);
	}

	test('releases canceled callbacks when a window closes before its next frame', async function () {
		if (typeof globalThis.gc !== 'function') {
			this.skip(); // Run the Electron suite with --js-flags=--expose-gc.
		}
		const auxiliary = createWindow();
		const resource = scheduleCapturedResource(auxiliary.targetWindow);
		auxiliary.registration.dispose();
		auxiliary.iframe.remove();
		await timeout(0);
		await globalThis.gc!({ type: 'major', execution: 'async' });

		assert.strictEqual(resource.deref(), undefined, 'A retired window retains canceled animation work');
	});

	test('does not run remaining callbacks after a callback closes its window', async () => {
		const auxiliary = createWindow();
		const calls: string[] = [];
		await new Promise<void>(resolve => {
			scheduleAtNextAnimationFrame(auxiliary.targetWindow, () => {
				calls.push('close');
				auxiliary.registration.dispose();
				auxiliary.iframe.remove();
				resolve();
			}, 100);
			scheduleAtNextAnimationFrame(auxiliary.targetWindow, () => calls.push('retired'));
		});

		assert.deepStrictEqual(calls, ['close']);
	});

	test('preserves live window priority, cancellation and next-frame scheduling', async () => {
		const retired = createWindow();
		const live = createWindow();
		const calls: string[] = [];
		scheduleAtNextAnimationFrame(retired.targetWindow, () => calls.push('retired'));
		retired.registration.dispose();
		retired.iframe.remove();

		await new Promise<void>(resolve => {
			scheduleAtNextAnimationFrame(live.targetWindow, () => calls.push('low'), -100);
			scheduleAtNextAnimationFrame(live.targetWindow, () => calls.push('canceled')).dispose();
			scheduleAtNextAnimationFrame(live.targetWindow, () => {
				calls.push('high');
				runAtThisOrScheduleAtNextAnimationFrame(live.targetWindow, () => calls.push('current'), 50);
				scheduleAtNextAnimationFrame(live.targetWindow, () => {
					calls.push('next');
					live.registration.dispose();
					live.iframe.remove();
					resolve();
				}, 200);
			}, 100);
		});

		assert.deepStrictEqual(calls, ['high', 'current', 'low', 'next']);
	});

	test('runs after requestAnimationFrame was replaced while a frame was pending', async () => {
		// Like a test that fakes requestAnimationFrame and restores it before the faked frame fires.
		const { targetWindow } = createWindow();
		const realRequestAnimationFrame = targetWindow.requestAnimationFrame;
		const calls: string[] = [];
		targetWindow.requestAnimationFrame = () => 0;
		scheduleAtNextAnimationFrame(targetWindow, () => calls.push('during fake'));
		targetWindow.requestAnimationFrame = realRequestAnimationFrame;

		await new Promise<void>(resolve => scheduleAtNextAnimationFrame(targetWindow, () => {
			calls.push('after restore');
			resolve();
		}));

		assert.deepStrictEqual(calls, ['during fake', 'after restore']);
	});

	test('runs when requestAnimationFrame is faked and restored while a native frame is pending', async () => {
		const { targetWindow } = createWindow();
		const realRequestAnimationFrame = targetWindow.requestAnimationFrame;
		const calls: string[] = [];
		const ran = new Promise<void>(resolve => {
			scheduleAtNextAnimationFrame(targetWindow, () => calls.push('before fake'));
			targetWindow.requestAnimationFrame = () => 0;
			scheduleAtNextAnimationFrame(targetWindow, () => {
				calls.push('during fake');
				resolve();
			});
			targetWindow.requestAnimationFrame = realRequestAnimationFrame;
		});

		await ran;

		assert.deepStrictEqual(calls, ['before fake', 'during fake']);
	});

	test('runs when a native frame fires while requestAnimationFrame is faked', async () => {
		const { targetWindow } = createWindow();
		const realRequestAnimationFrame = targetWindow.requestAnimationFrame;
		const calls: string[] = [];
		scheduleAtNextAnimationFrame(targetWindow, () => calls.push('before fake'));
		targetWindow.requestAnimationFrame = () => 0;
		scheduleAtNextAnimationFrame(targetWindow, () => calls.push('during fake'));

		await new Promise<void>(resolve => realRequestAnimationFrame.call(targetWindow, () => resolve()));
		targetWindow.requestAnimationFrame = realRequestAnimationFrame;

		assert.deepStrictEqual(calls, ['before fake', 'during fake']);
	});

	test('a removed unregistered iframe with a frame pending does not block frames of a later one', async () => {
		// Unregistered windows have no window ID, so they share one queue, like iframes that tests create and remove.
		const removed = document.body.appendChild(document.createElement('iframe'));
		store.add(toDisposable(() => removed.remove()));
		scheduleAtNextAnimationFrame(removed.contentWindow!, () => { });
		removed.remove();
		const later = document.body.appendChild(document.createElement('iframe'));
		store.add(toDisposable(() => later.remove()));

		await new Promise<void>(resolve => scheduleAtNextAnimationFrame(later.contentWindow!, resolve));
	});

	test('a superseded frame request does not run the queue', () => {
		const { targetWindow } = createWindow();
		const firstFrames: FrameRequestCallback[] = [];
		const secondFrames: FrameRequestCallback[] = [];
		const calls: string[] = [];
		targetWindow.requestAnimationFrame = callback => firstFrames.push(callback);
		scheduleAtNextAnimationFrame(targetWindow, () => {
			calls.push('frame 1');
			scheduleAtNextAnimationFrame(targetWindow, () => calls.push('frame 2'));
		});
		targetWindow.requestAnimationFrame = callback => secondFrames.push(callback);
		scheduleAtNextAnimationFrame(targetWindow, () => { });

		// Both requests fire in the same frame: only the current one runs the queue, once.
		firstFrames.shift()!(0);
		secondFrames.shift()!(0);
		const sameFrame = [...calls];
		secondFrames.shift()!(16);

		assert.deepStrictEqual({ sameFrame, nextFrame: calls }, { sameFrame: ['frame 1'], nextFrame: ['frame 1', 'frame 2'] });
	});
});
