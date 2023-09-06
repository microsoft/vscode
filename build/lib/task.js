"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.define = exports.parallel = exports.series = void 0;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFzay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRhc2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsc0NBQXNDO0FBQ3RDLDBDQUEwQztBQW1CMUMsU0FBUyxVQUFVLENBQUMsQ0FBeUM7SUFDNUQsSUFBSSxPQUFhLENBQUUsQ0FBQyxJQUFJLEtBQUssVUFBVSxFQUFFO1FBQ3hDLE9BQU8sSUFBSSxDQUFDO0tBQ1o7SUFDRCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUM7QUFFRCxTQUFTLFdBQVcsQ0FBQyxJQUFZO0lBQ2hDLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7QUFDakMsQ0FBQztBQUVELEtBQUssVUFBVSxRQUFRLENBQUMsSUFBVTtJQUNqQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxXQUFXLElBQUksYUFBYSxDQUFDO0lBQ2hFLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFO1FBQ2pCLFFBQVEsQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztLQUNuRDtJQUNELE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUNuQyxNQUFNLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN2QixNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQzdDLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxHQUFHLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pFLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFO1FBQ2pCLFFBQVEsQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsVUFBVSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsa0JBQWtCLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ2hIO0FBQ0YsQ0FBQztBQUVELEtBQUssVUFBVSxVQUFVLENBQUMsSUFBVTtJQUNuQyw4Q0FBOEM7SUFDOUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtRQUN0QyxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1lBQ3RCLDBCQUEwQjtZQUMxQixJQUFJLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRTtnQkFDWixJQUFJLEdBQUcsRUFBRTtvQkFDUixPQUFPLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztpQkFDbkI7Z0JBQ0QsT0FBTyxFQUFFLENBQUM7WUFDWCxDQUFDLENBQUMsQ0FBQztZQUNILE9BQU87U0FDUDtRQUVELE1BQU0sVUFBVSxHQUFHLElBQUksRUFBRSxDQUFDO1FBRTFCLElBQUksT0FBTyxVQUFVLEtBQUssV0FBVyxFQUFFO1lBQ3RDLHNCQUFzQjtZQUN0QixPQUFPLEVBQUUsQ0FBQztZQUNWLE9BQU87U0FDUDtRQUVELElBQUksVUFBVSxDQUFDLFVBQVUsQ0FBQyxFQUFFO1lBQzNCLG1DQUFtQztZQUNuQyxVQUFVLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNqQyxPQUFPO1NBQ1A7UUFFRCxrQ0FBa0M7UUFDbEMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQ3JDLFVBQVUsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDNUMsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBZ0IsTUFBTSxDQUFDLEdBQUcsS0FBYTtJQUN0QyxNQUFNLE1BQU0sR0FBRyxLQUFLLElBQUksRUFBRTtRQUN6QixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUN0QyxNQUFNLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUN6QjtJQUNGLENBQUMsQ0FBQztJQUNGLE1BQU0sQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO0lBQ3RCLE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQztBQVJELHdCQVFDO0FBRUQsU0FBZ0IsUUFBUSxDQUFDLEdBQUcsS0FBYTtJQUN4QyxNQUFNLE1BQU0sR0FBRyxLQUFLLElBQUksRUFBRTtRQUN6QixNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEQsQ0FBQyxDQUFDO0lBQ0YsTUFBTSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7SUFDdEIsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBTkQsNEJBTUM7QUFFRCxTQUFnQixNQUFNLENBQUMsSUFBWSxFQUFFLElBQVU7SUFDOUMsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1FBQ2hCLDJCQUEyQjtRQUMzQixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRXJELElBQUksUUFBUSxDQUFDLE1BQU0sSUFBSSxRQUFRLENBQUMsUUFBUSxFQUFFO1lBQ3pDLHdEQUF3RDtZQUN4RCxtQ0FBbUM7WUFDbkMsT0FBTyxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztTQUMzRDtRQUVELFFBQVEsQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1FBQ3hCLE9BQU8sSUFBSSxDQUFDO0tBQ1o7SUFFRCx3QkFBd0I7SUFDeEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUM7SUFDckIsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7SUFDeEIsT0FBTyxJQUFJLENBQUM7QUFDYixDQUFDO0FBcEJELHdCQW9CQyJ9