/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IdleValue, IntervalTimer, runWhenIdle } from 'vs/base/common/async';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';

//#region -- intervals ------------

export function disposableWindowInterval(targetWindow: Window & typeof globalThis, handler: () => boolean /* stop interval */, interval: number, iterations: number): IDisposable {
	let iteration = 0;
	const timer = targetWindow.setInterval(() => {
		iteration++;
		if (iteration >= iterations || handler()) {
			disposable.dispose();
		}
	}, interval);
	const disposable = toDisposable(() => {
		targetWindow.clearInterval(timer);
	});
	return disposable;
}

export class WindowIntervalTimer extends IntervalTimer {

	override cancelAndSet(runner: () => void, interval: number, targetWindow: Window & typeof globalThis): void {
		return super.cancelAndSet(runner, interval, targetWindow);
	}
}

//#endregion

//#region -- run on idle ------------

export function runWhenWindowIdle(targetWindow: typeof globalThis, callback: (idle: IdleDeadline) => void, timeout?: number): IDisposable {
	return runWhenIdle(targetWindow, callback, timeout);
}

export class WindowIdleValue<T> extends IdleValue<T> {

	constructor(targetWindow: Window & typeof globalThis, executor: () => T) {
		super(targetWindow, executor);
	}
}

//#endregion
