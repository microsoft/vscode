/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { registerWindow } from '../../browser/dom.js';
import { PixelRatio } from '../../browser/pixelRatio.js';
import { ensureCodeWindow, mainWindow } from '../../browser/window.js';
import { timeout } from '../../common/async.js';
import { toDisposable } from '../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('PixelRatio', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let windowId = 10000;

	function createWindow() {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		store.add(toDisposable(() => iframe.remove()));
		const targetWindow = iframe.contentWindow!;
		ensureCodeWindow(targetWindow, windowId++);
		const registration = store.add(registerWindow(targetWindow));
		return { targetWindow, registration };
	}

	test('releases the second window monitor after another window closes first', async function () {
		if (typeof globalThis.gc !== 'function') {
			this.skip(); // Run the Electron suite with --js-flags=--expose-gc.
		}
		const first = createWindow();
		const second = createWindow();
		PixelRatio.getInstance(first.targetWindow);
		const monitor = new WeakRef(PixelRatio.getInstance(second.targetWindow));

		first.registration.dispose();
		const liveMonitorPreserved = PixelRatio.getInstance(second.targetWindow) === monitor.deref();
		second.registration.dispose();
		await timeout(0);
		await globalThis.gc!({ type: 'major', execution: 'async' });

		assert.deepStrictEqual({ liveMonitorPreserved, released: monitor.deref() === undefined }, {
			liveMonitorPreserved: true,
			released: true,
		});
	});

	test('releases a monitor after a window without a monitor closes first', async function () {
		if (typeof globalThis.gc !== 'function') {
			this.skip(); // Run the Electron suite with --js-flags=--expose-gc.
		}
		const unrelated = createWindow();
		const monitored = createWindow();
		const monitor = new WeakRef(PixelRatio.getInstance(monitored.targetWindow));

		unrelated.registration.dispose();
		monitored.registration.dispose();
		monitored.registration.dispose();
		await timeout(0);
		await globalThis.gc!({ type: 'major', execution: 'async' });

		assert.strictEqual(monitor.deref(), undefined, 'An unrelated window close consumed monitor cleanup');
	});

	test('preserves the main window monitor when an auxiliary window closes', () => {
		const mainMonitor = PixelRatio.getInstance(mainWindow);
		const auxiliary = createWindow();
		const auxiliaryMonitor = PixelRatio.getInstance(auxiliary.targetWindow);
		assert.ok(auxiliaryMonitor.value > 0);

		auxiliary.registration.dispose();

		assert.strictEqual(PixelRatio.getInstance(mainWindow), mainMonitor);
	});
});
