"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.series = series;
exports.parallel = parallel;
exports.define = define;
const fancyLog = require("fancy-log");
const ansiColors = require("ansi-colors");
function _isPromise(p) {
    if (typeof p.then === 'function') {
        return true;
    }
    return false;
}
function _renderTime(time) {
    return `${Math.round(time)} ms`;
}
async function _execute(task) {
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
async function _doExecute(task) {
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
function series(...tasks) {
    const result = async () => {
        for (let i = 0; i < tasks.length; i++) {
            await _execute(tasks[i]);
        }
    };
    result._tasks = tasks;
    return result;
}
function parallel(...tasks) {
    const result = async () => {
        await Promise.all(tasks.map(t => _execute(t)));
    };
    result._tasks = tasks;
    return result;
}
function define(name, task) {
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
//# sourceMappingURL=task.js.map