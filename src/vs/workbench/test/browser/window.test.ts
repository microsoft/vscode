/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IRegisteredCodeWindow } from '../../../base/browser/dom.js';
import { CodeWindow, mainWindow } from '../../../base/browser/window.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { BaseWindow } from '../../browser/window.js';
import { TestEnvironmentService, TestHostService } from './workbenchTestServices.js';

suite('Window', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	class TestWindow extends BaseWindow {

		constructor(window: CodeWindow, dom: { getWindowsCount: () => number; getWindows: () => Iterable<IRegisteredCodeWindow> }) {
			super(window, dom, new TestHostService(), TestEnvironmentService);
		}

		protected override enableWindowFocusOnElementFocus(): void { }
	}

	test('multi window aware setTimeout()', async function () {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const disposables = new DisposableStore();

			let windows: IRegisteredCodeWindow[] = [];
			const dom = {
				getWindowsCount: () => windows.length,
				getWindows: () => windows
			};

			const setTimeoutCalls: number[] = [];
			const clearTimeoutCalls: number[] = [];

			function createWindow(id: number, slow?: boolean) {
				const res = {
					setTimeout: function (callback: Function, delay: number, ...args: any[]): number {
						setTimeoutCalls.push(id);

						return mainWindow.setTimeout(() => callback(id), slow ? delay * 2 : delay, ...args);
					},
					clearTimeout: function (timeoutId: number): void {
						clearTimeoutCalls.push(id);

						return mainWindow.clearTimeout(timeoutId);
					}
				} as any;

				disposables.add(new TestWindow(res, dom));

				return res;
			}

			const window1 = createWindow(1);
			windows = [{ window: window1, disposables }];

			// Window Count: 1

			let called = false;
			await new Promise<void>((resolve, reject) => {
				window1.setTimeout(() => {
					if (!called) {
						called = true;
						resolve();
					} else {
						reject(new Error('timeout called twice'));
					}
				}, 1);
			});

			assert.strictEqual(called, true);
			assert.deepStrictEqual(setTimeoutCalls, [1]);
			assert.deepStrictEqual(clearTimeoutCalls, []);
			called = false;
			setTimeoutCalls.length = 0;
			clearTimeoutCalls.length = 0;

			await new Promise<void>((resolve, reject) => {
				window1.setTimeout(() => {
					if (!called) {
						called = true;
						resolve();
					} else {
						reject(new Error('timeout called twice'));
					}
				}, 0);
			});

			assert.strictEqual(called, true);
			assert.deepStrictEqual(setTimeoutCalls, [1]);
			assert.deepStrictEqual(clearTimeoutCalls, []);
			called = false;
			setTimeoutCalls.length = 0;
			clearTimeoutCalls.length = 0;

			// Window Count: 3

			let window2 = createWindow(2);
			const window3 = createWindow(3);
			windows = [
				{ window: window2, disposables },
				{ window: window1, disposables },
				{ window: window3, disposables }
			];

			await new Promise<void>((resolve, reject) => {
				window1.setTimeout(() => {
					if (!called) {
						called = true;
						resolve();
					} else {
						reject(new Error('timeout called twice'));
					}
				}, 1);
			});

			assert.strictEqual(called, true);
			assert.deepStrictEqual(setTimeoutCalls, [2, 1, 3]);
			assert.deepStrictEqual(clearTimeoutCalls, [2, 1, 3]);
			called = false;
			setTimeoutCalls.length = 0;
			clearTimeoutCalls.length = 0;

			// Window Count: 2 (1 fast, 1 slow)

			window2 = createWindow(2, true);
			windows = [
				{ window: window2, disposables },
				{ window: window1, disposables },
			];

			await new Promise<void>((resolve, reject) => {
				window1.setTimeout((windowId: number) => {
					if (!called && windowId === 1) {
						called = true;
						resolve();
					} else if (called) {
						reject(new Error('timeout called twice'));
					} else {
						reject(new Error('timeout called for wrong window'));
					}
				}, 1);
			});

			assert.strictEqual(called, true);
			assert.deepStrictEqual(setTimeoutCalls, [2, 1]);
			assert.deepStrictEqual(clearTimeoutCalls, [2, 1]);
			called = false;
			setTimeoutCalls.length = 0;
			clearTimeoutCalls.length = 0;

			disposables.dispose();
		});
	});
});
