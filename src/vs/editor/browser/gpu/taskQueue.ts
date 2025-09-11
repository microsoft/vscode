/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../base/browser/dom.js';
import { Disposable, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';

/**
 * Copyright (c) 2022 The xterm.js authors. All rights reserved.
 * @license MIT
 */

export interface ITaskQueue extends IDisposable {
	/**
	 * Adds a task to the queue which will run in a future idle callback.
	 * To avoid perceivable stalls on the mainthread, tasks with heavy workload
	 * should split their work into smaller pieces and return `true` to get
	 * called again until the work is done (on falsy return value).
	 */
	enqueue(task: () => boolean | void): void;

	/**
	 * Flushes the queue, running all remaining tasks synchronously.
	 */
	flush(): void;

	/**
	 * Clears any remaining tasks from the queue, these will not be run.
	 */
	clear(): void;
}

interface ITaskDeadline {
	timeRemaining(): number;
}
type CallbackWithDeadline = (deadline: ITaskDeadline) => void;

abstract class TaskQueue extends Disposable implements ITaskQueue {
	private _tasks: (() => boolean | void)[] = [];
	private _idleCallback?: number;
	private _i = 0;

	constructor(
		@ILogService private readonly _logService: ILogService
	) {
		super();
		this._register(toDisposable(() => this.clear()));
	}

	protected abstract _requestCallback(callback: CallbackWithDeadline): number;
	protected abstract _cancelCallback(identifier: number): void;

	public enqueue(task: () => boolean | void): void {
		this._tasks.push(task);
		this._start();
	}

	public flush(): void {
		while (this._i < this._tasks.length) {
			if (!this._tasks[this._i]()) {
				this._i++;
			}
		}
		this.clear();
	}

	public clear(): void {
		if (this._idleCallback) {
			this._cancelCallback(this._idleCallback);
			this._idleCallback = undefined;
		}
		this._i = 0;
		this._tasks.length = 0;
	}

	private _start(): void {
		if (!this._idleCallback) {
			this._idleCallback = this._requestCallback(this._process.bind(this));
		}
	}

	private _process(deadline: ITaskDeadline): void {
		this._idleCallback = undefined;
		let taskDuration = 0;
		let longestTask = 0;
		let lastDeadlineRemaining = deadline.timeRemaining();
		let deadlineRemaining = 0;
		while (this._i < this._tasks.length) {
			taskDuration = Date.now();
			if (!this._tasks[this._i]()) {
				this._i++;
			}
			// other than performance.now, Date.now might not be stable (changes on wall clock changes),
			// this is not an issue here as a clock change during a short running task is very unlikely
			// in case it still happened and leads to negative duration, simply assume 1 msec
			taskDuration = Math.max(1, Date.now() - taskDuration);
			longestTask = Math.max(taskDuration, longestTask);
			// Guess the following task will take a similar time to the longest task in this batch, allow
			// additional room to try avoid exceeding the deadline
			deadlineRemaining = deadline.timeRemaining();
			if (longestTask * 1.5 > deadlineRemaining) {
				// Warn when the time exceeding the deadline is over 20ms, if this happens in practice the
				// task should be split into sub-tasks to ensure the UI remains responsive.
				if (lastDeadlineRemaining - taskDuration < -20) {
					this._logService.warn(`task queue exceeded allotted deadline by ${Math.abs(Math.round(lastDeadlineRemaining - taskDuration))}ms`);
				}
				this._start();
				return;
			}
			lastDeadlineRemaining = deadlineRemaining;
		}
		this.clear();
	}
}

/**
 * A queue of that runs tasks over several tasks via setTimeout, trying to maintain above 60 frames
 * per second. The tasks will run in the order they are enqueued, but they will run some time later,
 * and care should be taken to ensure they're non-urgent and will not introduce race conditions.
 */
export class PriorityTaskQueue extends TaskQueue {
	protected _requestCallback(callback: CallbackWithDeadline): number {
		return getActiveWindow().setTimeout(() => callback(this._createDeadline(16)));
	}

	protected _cancelCallback(identifier: number): void {
		getActiveWindow().clearTimeout(identifier);
	}

	private _createDeadline(duration: number): ITaskDeadline {
		const end = Date.now() + duration;
		return {
			timeRemaining: () => Math.max(0, end - Date.now())
		};
	}
}

class IdleTaskQueueInternal extends TaskQueue {
	protected _requestCallback(callback: IdleRequestCallback): number {
		return getActiveWindow().requestIdleCallback(callback);
	}

	protected _cancelCallback(identifier: number): void {
		getActiveWindow().cancelIdleCallback(identifier);
	}
}

/**
 * A queue of that runs tasks over several idle callbacks, trying to respect the idle callback's
 * deadline given by the environment. The tasks will run in the order they are enqueued, but they
 * will run some time later, and care should be taken to ensure they're non-urgent and will not
 * introduce race conditions.
 *
 * This reverts to a {@link PriorityTaskQueue} if the environment does not support idle callbacks.
 */
export const IdleTaskQueue = ('requestIdleCallback' in getActiveWindow()) ? IdleTaskQueueInternal : PriorityTaskQueue;

/**
 * An object that tracks a single debounced task that will run on the next idle frame. When called
 * multiple times, only the last set task will run.
 */
export class DebouncedIdleTask {
	private _queue: ITaskQueue;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this._queue = instantiationService.createInstance(IdleTaskQueue);
	}

	public set(task: () => boolean | void): void {
		this._queue.clear();
		this._queue.enqueue(task);
	}

	public flush(): void {
		this._queue.flush();
	}
}
