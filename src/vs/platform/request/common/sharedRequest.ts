/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../base/common/lifecycle.js';

export interface ISharedRequest<T> {
	readonly controller: AbortController;
	readonly deadline: number;
	readonly waiters: Set<{ resolve(value: T): void; reject(error: unknown): void; blockedUntil?(time: number): void }>;
	blockedUntil?: number;
}

export function updateSharedRequestCooldown<T>(shared: ISharedRequest<T>, blockedUntil: number): void {
	shared.blockedUntil = blockedUntil;
	for (const waiter of shared.waiters) {
		waiter.blockedUntil?.(blockedUntil);
	}
}

export function waitForSharedRequest<T>(
	shared: ISharedRequest<T>,
	signal: AbortSignal,
	deadline: number,
	scheduler: { now(): number; schedule(callback: () => void, delay: number): IDisposable },
	timeoutError: () => Error,
	cooldown?: { readonly error: (delay: number) => Error; readonly onBlockedUntil?: (time: number) => void },
): Promise<T> {
	if (signal.aborted) {
		return Promise.reject(signal.reason);
	}
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			cleanup();
			reject(signal.reason);
		};
		const timer = scheduler.schedule(() => {
			cleanup();
			reject(timeoutError());
		}, Math.max(0, deadline - scheduler.now()));
		const cleanup = () => {
			timer.dispose();
			signal.removeEventListener('abort', onAbort);
			shared.waiters.delete(waiter);
		};
		const waiter = {
			resolve: (response: T) => {
				cleanup();
				if (deadline <= scheduler.now()) {
					reject(timeoutError());
				} else {
					resolve(response);
				}
			},
			reject: (error: unknown) => {
				cleanup();
				reject(error);
			},
			blockedUntil: (time: number) => {
				cooldown?.onBlockedUntil?.(time);
				if (cooldown && time > scheduler.now() && time >= deadline) {
					cleanup();
					reject(cooldown.error(time - scheduler.now()));
				}
			},
		};
		shared.waiters.add(waiter);
		signal.addEventListener('abort', onAbort, { once: true });
		if (shared.blockedUntil !== undefined) {
			waiter.blockedUntil(shared.blockedUntil);
		}
	});
}
