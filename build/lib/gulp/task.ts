/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fancyLog from 'fancy-log';
import ansiColors from 'ansi-colors';
// eslint-disable-next-line local/code-no-direct-gulp-import
import g from 'gulp';

export type Task = PromiseTask | StreamTask | CallbackTask;

export interface PromiseTask extends BaseTask {
	(): Promise<void>;
}
export interface StreamTask extends BaseTask {
	(): NodeJS.ReadWriteStream;
}
export interface CallbackTask extends BaseTask {
	(cb?: (err?: Error) => void): void;
}

export interface BaseTask {
	displayName?: string;
	taskName?: string;
	_tasks?: Task[];
}

export function task(name: string, fn: Task): Task;
export function task(fn: Task): Task;
export function task(name: string): Task | undefined;
export function task(nameOrFn: string | Task, fn?: Task): Task | undefined {
	// Lookup form: task('name')
	if (typeof nameOrFn === 'string' && fn === undefined) {
		return g.task(nameOrFn) as Task | undefined;
	}
	const taskFn = typeof nameOrFn === 'string' ? fn! : nameOrFn;
	const name = typeof nameOrFn === 'string'
		? nameOrFn
		: (taskFn.taskName || taskFn.displayName);
	if (!name) {
		throw new Error(`task() requires a name (pass as first argument or via define())`);
	}
	if (!taskFn.displayName) {
		taskFn.displayName = name;
	}

	g.task(name, taskFn as g.TaskFunction);
	return taskFn;
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

export function define(name: string, task: Task): Task {
	if (task._tasks) {
		// This is a composite task
		const lastTask = task._tasks[task._tasks.length - 1];

		if (lastTask._tasks || lastTask.taskName) {
			// This is a composite task without a real task function
			// => generate a fake task function
			return define(name, series(task, () => Promise.resolve()));
		}

		lastTask.taskName = name;
		task.displayName = name;
		return task;
	}

	// This is a simple task
	task.taskName = name;
	task.displayName = name;
	return task;
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

function _isPromise(p: Promise<void> | NodeJS.ReadWriteStream): p is Promise<void> {
	return typeof (p as Promise<void>).then === 'function';
}

function _renderTime(time: number): string {
	return `${Math.round(time)} ms`;
}
