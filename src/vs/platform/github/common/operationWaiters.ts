/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IRequestScheduler } from './scheduler.js';

/** One caller waiting for an operation, with its own cancellation and deadline. */
interface IOperationWaiter<T> {
	readonly cancellationToken: CancellationToken;
	resolve(value: T): void;
	reject(error: unknown): void;
	blockedUntil(time: number): void;
}

/** Caller policy for a known cooldown that may exceed its remaining deadline. */
export interface IWaiterCooldownPolicy {
	readonly error: (delay: number) => Error;
	readonly onBlockedUntil?: (time: number) => void;
}

/** Owner-managed operation lifetime, distinct from the individual callers waiting for it. */
export interface IInFlightOperation<T> {
	readonly controller: CancellationTokenSource;
	readonly deadline: number;
	readonly waiters: OperationWaiters<T>;
}

/** Fans an operation's result and cooldown updates out to independently budgeted callers. */
export class OperationWaiters<T> {
	private readonly _waiters = new Set<IOperationWaiter<T>>();
	private _blockedUntil: number | undefined;

	get size(): number { return this._waiters.size; }

	hasToken(cancellationToken: CancellationToken): boolean {
		for (const waiter of this._waiters) {
			if (waiter.cancellationToken === cancellationToken) {
				return true;
			}
		}
		return false;
	}

	resolve(value: T): void {
		for (const waiter of this._waiters) {
			waiter.resolve(value);
		}
	}

	reject(error: unknown): void {
		for (const waiter of this._waiters) {
			waiter.reject(error);
		}
	}

	setBlockedUntil(time: number): void {
		this._blockedUntil = time;
		for (const waiter of this._waiters) {
			waiter.blockedUntil(time);
		}
	}

	wait(
		cancellationToken: CancellationToken,
		deadline: number,
		scheduler: Pick<IRequestScheduler, 'now' | 'schedule'>,
		timeoutError: () => Error,
		cooldown?: IWaiterCooldownPolicy,
	): Promise<T> {
		if (cancellationToken.isCancellationRequested) {
			return Promise.reject(new CancellationError());
		}
		return new Promise((resolve, reject) => {
			const lifetime = new DisposableStore();
			const cleanup = () => {
				lifetime.dispose();
				this._waiters.delete(waiter);
			};
			const waiter: IOperationWaiter<T> = {
				cancellationToken,
				resolve: response => {
					cleanup();
					if (deadline <= scheduler.now()) {
						reject(timeoutError());
					} else {
						resolve(response);
					}
				},
				reject: error => {
					cleanup();
					reject(error);
				},
				blockedUntil: time => {
					cooldown?.onBlockedUntil?.(time);
					if (cooldown && time > scheduler.now() && time >= deadline) {
						cleanup();
						reject(cooldown.error(time - scheduler.now()));
					}
				},
			};
			this._waiters.add(waiter);
			lifetime.add(cancellationToken.onCancellationRequested(() => {
				cleanup();
				reject(new CancellationError());
			}));
			lifetime.add(scheduler.schedule(() => {
				cleanup();
				reject(timeoutError());
			}, Math.max(0, deadline - scheduler.now())));
			if (this._blockedUntil !== undefined) {
				waiter.blockedUntil(this._blockedUntil);
			}
		});
	}
}
