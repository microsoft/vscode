/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { registerWindow } from '../../browser/dom.js';
import { PixelRatio } from '../../browser/pixelRatio.js';
import { ensureCodeWindow, mainWindow } from '../../browser/window.js';
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

	test('releases the second window monitor after another window closes first', () => {
		const first = createWindow();
		const second = createWindow();
		PixelRatio.getInstance(first.targetWindow);
		const monitor = PixelRatio.getInstance(second.targetWindow);

		first.registration.dispose();
		const liveMonitorPreserved = PixelRatio.getInstance(second.targetWindow) === monitor;
		second.registration.dispose();
		store.add(registerWindow(second.targetWindow));

		assert.deepStrictEqual({ liveMonitorPreserved, released: PixelRatio.getInstance(second.targetWindow) !== monitor }, {
			liveMonitorPreserved: true,
			released: true,
		});
	});

	test('releases a monitor after a window without a monitor closes first', () => {
		const unrelated = createWindow();
		const monitored = createWindow();
		const monitor = PixelRatio.getInstance(monitored.targetWindow);

		unrelated.registration.dispose();
		monitored.registration.dispose();
		monitored.registration.dispose();
		store.add(registerWindow(monitored.targetWindow));

		assert.notStrictEqual(PixelRatio.getInstance(monitored.targetWindow), monitor, 'An unrelated window close consumed monitor cleanup');
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
