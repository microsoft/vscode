/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableLongTimeout } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';

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

export function schedulerDelay(scheduler: IRequestScheduler, delay: number, token: CancellationToken): Promise<void> {
	if (token.isCancellationRequested) {
		return Promise.reject(new CancellationError());
	}
	return new Promise<void>((resolve, reject) => {
		const lifetime = new DisposableStore();
		const timer = lifetime.add(new MutableDisposable());
		lifetime.add(token.onCancellationRequested(() => {
			lifetime.dispose();
			reject(new CancellationError());
		}));
		timer.value = scheduler.schedule(() => {
			lifetime.dispose();
			resolve();
		}, Math.max(0, delay));
	});
}
