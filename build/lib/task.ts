/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fancyLog from 'fancy-log';
import * as ansiColors from 'ansi-colors';

export interface BaseTask {
	displayName?: string;
	taskName?: string;
	_tasks?: Task[];
}
export interface PromiseTask extends BaseTask {
	(): Promise<void>;
}
export interface StreamTask extends BaseTask {
	(): NodeJS.ReadWriteStream;
}
export interface CallbackTask extends BaseTask {
	(cb?: (err?: any) => void): void;
}

export type Task = PromiseTask | StreamTask | CallbackTask;

function _isPromise(p: Promise<void> | NodeJS.ReadWriteStream): p is Promise<void> {
	if (typeof (<any>p).then === 'function') {
		return true;
	}
	return false;
}

function _renderTime(time: number): string {
	if (time < 1000) {
		return `${time.toFixed(2)} ms`;
	}
	let seconds = time / 1000;
	if (seconds < 60) {
		return `${seconds.toFixed(1)} s`;
	}
	let minutes = Math.floor(seconds / 60);
	seconds -= minutes * 60;
	return `${minutes} m and ${seconds} s`;
}

const DONT_SHOW_PLEASE = `DONT_SHOW_PLEASE`;

async function _execute(task: Task): Promise<void> {
	const name = task.taskName || task.displayName || `<anonymous>`;
	if (name !== DONT_SHOW_PLEASE) {
		fancyLog('Starting', ansiColors.cyan(name), '...');
	}
	const startTime = process.hrtime();
	await _doExecute(task);
	const elapsedArr = process.hrtime(startTime);
	const elapsedNanoseconds = (elapsedArr[0] * 1e9 + elapsedArr[1]);
	if (name !== DONT_SHOW_PLEASE) {
		fancyLog(`Finished`, ansiColors.cyan(name), 'after', ansiColors.green(_renderTime(elapsedNanoseconds / 1e6)));
	}
}

async function _doExecute(task: Task): Promise<void> {
	// Always invoke as if it were a callback task
	return new Promise((resolve, reject) => {
		if (task.length === 1) {
			// this is a calback task
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
		task.taskName = DONT_SHOW_PLEASE;
		task.displayName = name;
		return task;
	}

	// This is a simple task
	task.taskName = name;
	task.displayName = name;
	return task;
}