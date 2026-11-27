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

	test('keeps the scheduling order of equal-priority callbacks added during the frame', async () => {
		const live = createWindow();
		const calls: string[] = [];

		await new Promise<void>(resolve => {
			scheduleAtNextAnimationFrame(live.targetWindow, () => calls.push('a'));
			scheduleAtNextAnimationFrame(live.targetWindow, () => calls.push('b'));
			scheduleAtNextAnimationFrame(live.targetWindow, () => {
				calls.push('frame');
				// Both of these join the queue that is currently being drained, so they have
				// to be ordered against the callbacks that are still waiting.
				runAtThisOrScheduleAtNextAnimationFrame(live.targetWindow, () => calls.push('late'), -100);
				runAtThisOrScheduleAtNextAnimationFrame(live.targetWindow, () => calls.push('inserted'));
				resolve();
			}, 100);
		});

		assert.deepStrictEqual(calls, ['frame', 'a', 'b', 'inserted', 'late']);
	});

	test('orders in-frame callbacks before, between and after the callbacks that are pending', async () => {
		const live = createWindow();
		const calls: string[] = [];

		await new Promise<void>(resolve => {
			scheduleAtNextAnimationFrame(live.targetWindow, () => calls.push('a'));
			scheduleAtNextAnimationFrame(live.targetWindow, () => calls.push('b'));
			scheduleAtNextAnimationFrame(live.targetWindow, () => calls.push('low'), -100);
			scheduleAtNextAnimationFrame(live.targetWindow, () => {
				calls.push('inserter');
				// `before` outranks everything still waiting, `between` has the default priority
				// of the pending `a`/`b`, and `after` is behind all of them.
				runAtThisOrScheduleAtNextAnimationFrame(live.targetWindow, () => calls.push('before'), 1000);
				runAtThisOrScheduleAtNextAnimationFrame(live.targetWindow, () => calls.push('between'));
				runAtThisOrScheduleAtNextAnimationFrame(live.targetWindow, () => calls.push('after'), -1000);
				resolve();
			}, 100);
		});

		assert.deepStrictEqual(calls, ['inserter', 'before', 'a', 'b', 'between', 'low', 'after']);
	});
});
