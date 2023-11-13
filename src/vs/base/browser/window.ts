/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindowsCount, getWindows } from 'vs/base/browser/dom';
import { createSingleCallFunction } from 'vs/base/common/functional';
import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';

export type CodeWindow = Window & typeof globalThis & {
	readonly vscodeWindowId: number;
};

// eslint-disable-next-line no-restricted-globals
export const mainWindow = window as CodeWindow;

/**
 * @deprecated to support multi-window scenarios, use `DOM.mainWindow`
 * if you target the main global window or use helpers such as `DOM.getWindow()`
 * or `DOM.getActiveWindow()` to obtain the correct window for the context you are in.
 */
export const $window = mainWindow;

let timeoutsHandleCounter = 0;
const mapTimeoutHandleToDisposable = new Map<number, Set<IDisposable>>();

export function patchMultiWindowAwareTimeout(targetWindow: Window): void {
	const originalSetTimeout = targetWindow.setTimeout;
	Object.defineProperty(targetWindow, 'originalSetTimeout', {
		value: originalSetTimeout,
		writable: false,
		enumerable: false,
		configurable: false
	});

	const originalClearTimeout = targetWindow.clearTimeout;
	Object.defineProperty(targetWindow, 'originalClearTimeout', {
		value: originalClearTimeout,
		writable: false,
		enumerable: false,
		configurable: false
	});

	(targetWindow as any).setTimeout = function (this: unknown, handler: TimerHandler, timeout = 0, ...args: unknown[]): number {
		if (getWindowsCount() === 1 || typeof handler === 'string') {
			return originalSetTimeout.apply(this, [handler, timeout, ...args]);
		}

		const timeoutDisposables = new Set<IDisposable>();
		const timeoutsHandle = timeoutsHandleCounter++;
		mapTimeoutHandleToDisposable.set(timeoutsHandle, timeoutDisposables);

		const handlerFn = createSingleCallFunction(handler, () => {
			dispose(timeoutDisposables);
			mapTimeoutHandleToDisposable.delete(timeoutsHandle);
		});

		for (const { window, disposables } of getWindows()) {
			const timeoutHandle = (window as any).originalSetTimeout.apply(this, [handlerFn, timeout, ...args]);

			const timeoutDisposable = toDisposable(() => {
				(window as any).originalClearTimeout(timeoutHandle);
			});

			disposables.add(timeoutDisposable);
			timeoutDisposables.add(timeoutDisposable);
		}

		return timeoutsHandle;
	};

	(targetWindow as any).clearTimeout = function (this: unknown, handle: number | undefined): void {
		if (getWindowsCount() === 1 || typeof handle !== 'number') {
			return originalClearTimeout.apply(this, [handle]);
		}

		const disposables = mapTimeoutHandleToDisposable.get(handle);
		if (disposables) {
			dispose(disposables);
			mapTimeoutHandleToDisposable.delete(handle);
		}
	};
}
