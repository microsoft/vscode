/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../vs/base/common/async';
import { BugIndicatingError, CancellationError } from '../vs/base/common/errors';

export type Task<T = void> = () => (Promise<T> | T);

/**
 * Processes tasks in the order they were scheduled.
*/
export class TaskQueue {
	private _runningTask: Task<any> | undefined = undefined;
	private _pendingTasks: { task: Task<any>; deferred: DeferredPromise<any>; setUndefinedWhenCleared: boolean }[] = [];

	/**
	 * Waits for the current and pending tasks to finish, then runs and awaits the given task.
	 * If the task is skipped because of clearPending, the promise is rejected with a CancellationError.
	*/
	public schedule<T>(task: Task<T>): Promise<T> {
		const deferred = new DeferredPromise<T>();
		this._pendingTasks.push({ task, deferred, setUndefinedWhenCleared: false });
		this._runIfNotRunning();
		return deferred.p;
	}

	/**
	 * Waits for the current and pending tasks to finish, then runs and awaits the given task.
	 * If the task is skipped because of clearPending, the promise is resolved with undefined.
	*/
	public scheduleSkipIfCleared<T>(task: Task<T>): Promise<T | undefined> {
		const deferred = new DeferredPromise<T>();
		this._pendingTasks.push({ task, deferred, setUndefinedWhenCleared: true });
		this._runIfNotRunning();
		return deferred.p;
	}

	private _runIfNotRunning(): void {
		if (this._runningTask === undefined) {
			this._processQueue();
		}
	}

	private async _processQueue(): Promise<void> {
		if (this._pendingTasks.length === 0) {
			return;
		}

		const next = this._pendingTasks.shift();
		if (!next) {
			return;
		}

		if (this._runningTask) {
			throw new BugIndicatingError();
		}

		this._runningTask = next.task;

		try {
			const result = await next.task();
			next.deferred.complete(result);
		} catch (e) {
			next.deferred.error(e);
		} finally {
			this._runningTask = undefined;
			this._processQueue();
		}
	}

	/**
	 * Clears all pending tasks. Does not cancel the currently running task.
	*/
	public clearPending(): void {
		const tasks = this._pendingTasks;
		this._pendingTasks = [];
		for (const task of tasks) {
			if (task.setUndefinedWhenCleared) {
				task.deferred.complete(undefined);
			} else {
				task.deferred.error(new CancellationError());
			}
		}
	}
}

export class BatchedProcessor<TArg, TResult> {
	private _queue: { arg: TArg; promise: DeferredPromise<TResult> }[] = [];
	private _timeout: any | null = null;

	constructor(
		private readonly _fn: (args: TArg[]) => Promise<TResult[]>,
		private readonly _waitingTimeMs: number
	) { }

	request(arg: TArg): Promise<TResult> {
		if (this._timeout === null) {
			this._timeout = setTimeout(() => this._flush(), this._waitingTimeMs);
		}

		const p = new DeferredPromise<TResult>();
		this._queue.push({ arg, promise: p });
		return p.p;
	}

	private async _flush() {
		const queue = this._queue;
		this._queue = [];
		this._timeout = null;

		const args = queue.map(e => e.arg);

		let results: TResult[];
		try {
			results = await this._fn(args);
		} catch (e) {
			for (const entry of queue) {
				entry.promise.error(e);
			}
			return;
		}

		for (const [i, result] of results.entries()) {
			queue[i].promise.complete(result);
		}
	}
}

export function raceFilter<T>(promises: Promise<T>[], filter: (result: T) => boolean): Promise<T | undefined> {
	return new Promise((resolve, reject) => {
		if (promises.length === 0) {
			resolve(undefined);
			return;
		}

		let resolved = false;
		let unresolvedCount = promises.length;
		for (const promise of promises) {
			promise.then(result => {
				unresolvedCount--;
				if (!resolved) {
					if (filter(result)) {
						resolved = true;
						resolve(result);
					} else if (unresolvedCount === 0) {
						// Last one has to resolve the promise
						resolve(undefined);
					}
				}
			}).catch(reject);
		}
	});
}
