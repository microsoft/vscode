/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../base/common/lifecycle.js';

export interface IGitHubScheduler {
	now(): number;
	schedule(callback: () => void, delay: number): IDisposable;
	jitter(maximum: number): number;
}

export const systemGitHubScheduler: IGitHubScheduler = {
	now: () => Date.now(),
	schedule: (callback, delay) => {
		const handle = setTimeout(callback, delay);
		return toDisposable(() => clearTimeout(handle));
	},
	jitter: maximum => Math.floor(Math.random() * (Math.max(0, maximum) + 1)),
};

export function schedulerDelay(scheduler: IGitHubScheduler, delay: number, signal: AbortSignal): Promise<void> {
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
