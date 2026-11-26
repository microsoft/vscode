/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IPoint, IRectangle } from '../../../window/common/window.js';
import { IMouseMoveForwarderWindow, MouseMoveForwarder } from '../../electron-main/mouseMoveForwarder.js';

suite('MouseMoveForwarder', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** Longer than any cursor sampling interval. */
	const STEP = 100;

	class TestWindow implements IMouseMoveForwarderWindow {
		private readonly _onDidChangeVisibility: Emitter<void>;
		readonly onDidChangeVisibility;
		readonly moves: [number, number][] = [];

		constructor(store: DisposableStore, private _visible: boolean, private readonly _bounds: IRectangle) {
			this._onDidChangeVisibility = store.add(new Emitter<void>());
			this.onDidChangeVisibility = this._onDidChangeVisibility.event;
		}

		setVisible(visible: boolean): void {
			this._visible = visible;
			this._onDidChangeVisibility.fire();
		}

		isVisible(): boolean { return this._visible; }
		getContentBounds(): IRectangle { return this._bounds; }
		sendMouseMove(x: number, y: number): void { this.moves.push([x, y]); }
	}

	test('sends the moves of the cursor over the window, relative to its content, until disposed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const store = disposables.add(new DisposableStore());
		const testWindow = new TestWindow(store, true, { x: 100, y: 50, width: 200, height: 100 });
		let cursor: IPoint = { x: 10, y: 10 };
		const forwarder = store.add(new MouseMoveForwarder(testWindow, () => cursor));

		for (const point of [{ x: 10, y: 10 }, { x: 150, y: 80 }, { x: 150, y: 80 }, { x: 299, y: 149 }, { x: 300, y: 80 }, { x: 150, y: 80 }]) {
			cursor = point;
			await timeout(STEP);
		}
		forwarder.dispose();
		cursor = { x: 200, y: 100 };
		await timeout(STEP);

		assert.deepStrictEqual(testWindow.moves, [[50, 30], [199, 99], [50, 30]]);
	}));

	test('samples the cursor only while the window is visible, and sends where it is once shown again', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const store = disposables.add(new DisposableStore());
		const testWindow = new TestWindow(store, false, { x: 0, y: 0, width: 100, height: 100 });
		let samples = 0;
		store.add(new MouseMoveForwarder(testWindow, () => {
			samples++;
			return { x: 10, y: 20 };
		}));

		await timeout(STEP);
		const samplesBeforeShown = samples;
		testWindow.setVisible(true);
		await timeout(STEP);
		const samplesWhileShown = samples - samplesBeforeShown;
		testWindow.setVisible(false);
		await timeout(STEP);
		const samplesWhileHiddenAgain = samples - samplesBeforeShown - samplesWhileShown;
		testWindow.setVisible(true);
		await timeout(STEP);
		store.dispose();

		assert.deepStrictEqual({ samplesBeforeShown, sampledWhileShown: samplesWhileShown > 0, samplesWhileHiddenAgain, moves: testWindow.moves }, {
			samplesBeforeShown: 0,
			sampledWhileShown: true,
			samplesWhileHiddenAgain: 0,
			moves: [[10, 20], [10, 20]],
		});
	}));
});
