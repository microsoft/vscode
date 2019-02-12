/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const fancyLog = require("fancy-log");
const ansiColors = require("ansi-colors");
function _isPromise(p) {
    if (typeof p.then === 'function') {
        return true;
    }
    return false;
}
function _renderTime(time) {
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
async function _execute(task) {
    const name = task.displayName || task.name || `<anonymous>`;
    fancyLog('Starting', ansiColors.cyan(name), '...');
    const startTime = process.hrtime();
    await _doExecute(task);
    const elapsedArr = process.hrtime(startTime);
    const elapsedNanoseconds = (elapsedArr[0] * 1e9 + elapsedArr[1]);
    fancyLog(`Finished`, ansiColors.cyan(name), 'after', ansiColors.green(_renderTime(elapsedNanoseconds / 1e6)));
}
async function _doExecute(task) {
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
function series(...tasks) {
    return async () => {
        for (let i = 0; i < tasks.length; i++) {
            await _execute(tasks[i]);
        }
    };
}
exports.series = series;
function parallel(...tasks) {
    return async () => {
        await Promise.all(tasks.map(t => _execute(t)));
    };
}
exports.parallel = parallel;
