/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fancyLog from 'fancy-log';
import ansiColors from 'ansi-colors';
import * as util from './util.ts';

export interface TaskOptions {
	memoryTracking?: boolean;
}

export interface BaseTask {
	displayName?: string;
	taskName?: string;
	_tasks?: Task[];
	_options?: TaskOptions;
}
export interface PromiseTask extends BaseTask {
	(): Promise<void>;
}
export interface StreamTask extends BaseTask {
	(): NodeJS.ReadWriteStream;
}
export interface CallbackTask extends BaseTask {
	(cb?: (err?: Error) => void): void;
}

export type Task = PromiseTask | StreamTask | CallbackTask;

function _isPromise(p: Promise<void> | NodeJS.ReadWriteStream): p is Promise<void> {
	return typeof (p as Promise<void>).then === 'function';
}

function _renderTime(time: number): string {
	return `${Math.round(time)} ms`;
}

async function _execute(task: Task): Promise<void> {
	const name = task.taskName || task.displayName || `<anonymous>`;
	if (!task._tasks) {
		fancyLog('Starting', ansiColors.cyan(name), '...');
	}
	const startTime = process.hrtime();
	await _doExecute(task);
	const elapsedArr = process.hrtime(startTime);
	const elapsedNanoseconds = (elapsedArr[0] * 1e9 + elapsedArr[1]);
	if (task._options?.memoryTracking) {
		util.printMemoryStats(name);
	}

	if (!task._tasks) {
		fancyLog(`Finished`, ansiColors.cyan(name), 'after', ansiColors.magenta(_renderTime(elapsedNanoseconds / 1e6)));
	}
}

async function _doExecute(task: Task): Promise<void> {
	// Always invoke as if it were a callback task
	return new Promise((resolve, reject) => {
		if (task.length === 1) {
			// this is a callback task
			task((err) => {
				if (err) {
					return reject(err);
				}
				resolve();
			});
			return;
		}

		const taskResult = task();

		if (typeof taskResult === 'undefined') {
			// this is a sync task
			resolve();
			return;
		}

		if (_isPromise(taskResult)) {
			// this is a promise returning task
			taskResult.then(resolve, reject);
			return;
		}

		// this is a stream returning task
		taskResult.on('end', _ => resolve());
		taskResult.on('error', err => reject(err));
	});
}

export function series(...tasks: Task[]): PromiseTask {
	const result = async () => {
		for (let i = 0; i < tasks.length; i++) {
			await _execute(tasks[i]);
		}
	};
	result._tasks = tasks;
	return result;
}

export function parallel(...tasks: Task[]): PromiseTask {
	const result = async () => {
		await Promise.all(tasks.map(t => _execute(t)));
	};
	result._tasks = tasks;
	return result;
}

export function define(name: string, task: Task, options?: TaskOptions): Task {
	if (task._tasks) {
		// This is a composite task
		const lastTask = task._tasks[task._tasks.length - 1];

		if (lastTask._tasks || lastTask.taskName) {
			// This is a composite task without a real task function
			// => generate a fake task function
			return define(name, series(task, () => Promise.resolve()), options);
		}

		lastTask.taskName = name;
		task.displayName = name;
		task._options = options;

		if (options?.memoryTracking) {
			for (const subtask of task._tasks) {
				subtask._options = { ...subtask._options, memoryTracking: true };
			}
		}

		return task;
	}

	// This is a simple task
	task.taskName = name;
	task.displayName = name;
	task._options = options;
	return task;
}
