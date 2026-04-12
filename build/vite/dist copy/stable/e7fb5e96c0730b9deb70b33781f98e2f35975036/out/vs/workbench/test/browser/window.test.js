/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { mainWindow } from '../../../base/browser/window.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { BaseWindow } from '../../browser/window.js';
import { TestContextMenuService, TestEnvironmentService, TestHostService, TestLayoutService } from './workbenchTestServices.js';
suite('Window', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    class TestWindow extends BaseWindow {
        constructor(window, dom) {
            super(window, dom, new TestHostService(), TestEnvironmentService, new TestContextMenuService(), new TestLayoutService());
        }
        enableWindowFocusOnElementFocus() { }
    }
    test('multi window aware setTimeout()', async function () {
        return runWithFakedTimers({ useFakeTimers: true }, async () => {
            const disposables = new DisposableStore();
            let windows = [];
            const dom = {
                getWindowsCount: () => windows.length,
                getWindows: () => windows
            };
            const setTimeoutCalls = [];
            const clearTimeoutCalls = [];
            function createWindow(id, slow) {
                // eslint-disable-next-line local/code-no-any-casts
                const res = {
                    setTimeout: function (callback, delay, ...args) {
                        setTimeoutCalls.push(id);
                        return mainWindow.setTimeout(() => callback(id), slow ? delay * 2 : delay, ...args);
                    },
                    clearTimeout: function (timeoutId) {
                        clearTimeoutCalls.push(id);
                        return mainWindow.clearTimeout(timeoutId);
                    }
                };
                disposables.add(new TestWindow(res, dom));
                return res;
            }
            const window1 = createWindow(1);
            windows = [{ window: window1, disposables }];
            // Window Count: 1
            let called = false;
            await new Promise((resolve, reject) => {
                window1.setTimeout(() => {
                    if (!called) {
                        called = true;
                        resolve();
                    }
                    else {
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
            await new Promise((resolve, reject) => {
                window1.setTimeout(() => {
                    if (!called) {
                        called = true;
                        resolve();
                    }
                    else {
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
            await new Promise((resolve, reject) => {
                window1.setTimeout(() => {
                    if (!called) {
                        called = true;
                        resolve();
                    }
                    else {
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
            await new Promise((resolve, reject) => {
                window1.setTimeout((windowId) => {
                    if (!called && windowId === 1) {
                        called = true;
                        resolve();
                    }
                    else if (called) {
                        reject(new Error('timeout called twice'));
                    }
                    else {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvdGVzdC9icm93c2VyL3dpbmRvdy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUU1QixPQUFPLEVBQWMsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDekUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNyRCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsc0JBQXNCLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFaEksS0FBSyxDQUFDLFFBQVEsRUFBRSxHQUFHLEVBQUU7SUFFcEIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxNQUFNLFVBQVcsU0FBUSxVQUFVO1FBRWxDLFlBQVksTUFBa0IsRUFBRSxHQUF5RjtZQUN4SCxLQUFLLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxJQUFJLGVBQWUsRUFBRSxFQUFFLHNCQUFzQixFQUFFLElBQUksc0JBQXNCLEVBQUUsRUFBRSxJQUFJLGlCQUFpQixFQUFFLENBQUMsQ0FBQztRQUMxSCxDQUFDO1FBRWtCLCtCQUErQixLQUFXLENBQUM7S0FDOUQ7SUFFRCxJQUFJLENBQUMsaUNBQWlDLEVBQUUsS0FBSztRQUM1QyxPQUFPLGtCQUFrQixDQUFDLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzdELE1BQU0sV0FBVyxH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