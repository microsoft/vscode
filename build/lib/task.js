"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.define = exports.parallel = exports.series = void 0;
const fancy_log_1 = __importDefault(require("fancy-log"));
const ansiColors = __importStar(require("ansi-colors"));
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
        (0, fancy_log_1.default)('Starting', ansiColors.cyan(name), '...');
    }
    const startTime = process.hrtime();
    await _doExecute(task);
    const elapsedArr = process.hrtime(startTime);
    const elapsedNanoseconds = (elapsedArr[0] * 1e9 + elapsedArr[1]);
    if (!task._tasks) {
        (0, fancy_log_1.default)(`Finished`, ansiColors.cyan(name), 'after', ansiColors.magenta(_renderTime(elapsedNanoseconds / 1e6)));
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
exports.series = series;
function parallel(...tasks) {
    const result = async () => {
        await Promise.all(tasks.map(t => _execute(t)));
    };
    result._tasks = tasks;
    return result;
}
exports.parallel = parallel;
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
exports.define = define;
