/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableLongTimeout } from '../../../base/common/async.js';
import { IDisposable, toDisposable } from '../../../base/common/lifecycle.js';

/** Clock, timer and jitter abstraction for deterministic request scheduling. */
export interface IRequestScheduler {
	now(): number;
	schedule(callback: () => void, delay: number): IDisposable;
	jitter(maximum: number): number;
}

/** Runtime scheduler using bounded native timer intervals. */
export const systemRequestScheduler: IRequestScheduler = {
	now: () => Date.now(),
	schedule: (callback, delay) => disposableLongTimeout(callback, delay),
	jitter: maximum => Math.floor(Math.random() * (Math.max(0, maximum) + 1)),
};

export function schedulerDelay(scheduler: IRequestScheduler, delay: number, signal: AbortSignal): Promise<void> {
	if (signal.aborted) {
		return Promise.reject(signal.reason);
	}
	return new Promise<void>((resolve, reject) => {
		const scheduled: { value?: IDisposable } = {};
		let completedSynchronously = false;
		const onAbort = () => {
			scheduled.value?.dispose();
			abortListener.dispose();
			reject(signal.reason);
		};
		const abortListener = toDisposable(() => signal.removeEventListener('abort', onAbort));
		signal.addEventListener('abort', onAbort, { once: true });
		scheduled.value = scheduler.schedule(() => {
			completedSynchronously = true;
			scheduled.value?.dispose();
			abortListener.dispose();
			resolve();
		}, Math.max(0, delay));
		if (completedSynchronously) {
			scheduled.value.dispose();
		}
	});
}
