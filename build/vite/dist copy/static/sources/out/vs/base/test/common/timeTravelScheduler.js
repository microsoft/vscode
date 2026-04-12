/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { compareBy, numberComparator, tieBreakComparators } from '../../common/arrays.js';
import { Emitter, Event } from '../../common/event.js';
import { Disposable } from '../../common/lifecycle.js';
import { setTimeout0, setTimeout0IsFaster } from '../../common/platform.js';
const scheduledTaskComparator = tieBreakComparators(compareBy(i => i.time, numberComparator), compareBy(i => i.id, numberComparator));
export class TimeTravelScheduler {
    constructor(startTimeMs) {
        this.taskCounter = 0;
        this._nowMs = 0;
        this.queue = new SimplePriorityQueue([], scheduledTaskComparator);
        this.taskScheduledEmitter = new Emitter();
        this.onTaskScheduled = this.taskScheduledEmitter.event;
        this._nowMs = startTimeMs;
    }
    schedule(task) {
        if (task.time < this._nowMs) {
            throw new Error(`Scheduled time (${task.time}) must be equal to or greater than the current time (${this._nowMs}).`);
        }
        const extendedTask = { ...task, id: this.taskCounter++ };
        this.queue.add(extendedTask);
        this.taskScheduledEmitter.fire({ task });
        return { dispose: () => this.queue.remove(extendedTask) };
    }
    get now() {
        return this._nowMs;
    }
    get hasScheduledTasks() {
        return this.queue.length > 0;
    }
    getScheduledTasks() {
        return this.queue.toSortedArray();
    }
    runNext() {
        const task = this.queue.removeMin();
        if (task) {
            this._nowMs = task.time;
            task.run();
        }
        return task;
    }
    installGlobally() {
        return overwriteGlobals(this);
    }
}
export class AsyncSchedulerProcessor extends Disposable {
    get history() { return this._history; }
    constructor(scheduler, options) {
        super();
        this.scheduler = scheduler;
        this.isProcessing = false;
        this._history = new Array();
        this.queueEmptyEmitter = new Emitter();
        this.onTaskQueueEmpty = this.queueEmptyEmitter.event;
        this.maxTaskCount = options && options.maxTaskCount ? options.maxTaskCount : 100;
        this.useSetImmediate = options && options.useSetImmediate ? options.useSetImmediate : false;
        this._register(scheduler.onTaskScheduled(() => {
            if (this.isProcessing) {
                return;
            }
            else {
                this.isProcessing = true;
                this.schedule();
            }
        }));
    }
    schedule() {
        // This allows promises created by a previous task to settle and schedule tasks before the next task is run.
        // Tasks scheduled in those promises might have to run before the current next task.
        Promise.resolve().then(() => {
            if (this.useSetImmediate) {
                originalGlobalValues.setImmediate(() => this.process());
            }
            else if (setTimeout0IsFaster) {
                setTimeout0(() => this.process());
            }
            else {
                originalGlobalValues.setTimeout(() => this.process());
            }
        });
    }
    process() {
        const executedTask = this.scheduler.runNext();
        if (executedTask) {
            this._history.push(executedTask);
            if (this.history.length >= this.maxTaskCount && this.scheduler.hasScheduledTasks) {
                const lastTasks = this._history.slice(Math.max(0, this.history.length - 10)).map(h => `${h.source.toString()}: ${h.source.stackTrace}`);
                const e = new Error(`Queue did not get empty after processing ${this.history.length} items. These are the last ${lastTasks.length} scheduled tasks:\n${lastTasks.join('\n\n\n')}`);
                this.lastError = e;
                throw e;
            }
        }
        if (this.scheduler.hasScheduledTasks) {
            this.schedule();
        }
        else {
            this.isProcessing = false;
            this.queueEmptyEmitter.fire();
        }
    }
    waitForEmptyQueue() {
        if (this.lastError) {
            const error = this.lastError;
            this.lastError = undefined;
            throw error;
        }
        if (!this.isProcessing) {
            return Promise.resolve();
        }
        else {
            return Event.toPromise(this.onTaskQueueEmpty).then(() => {
                if (this.lastError) {
                    throw this.lastError;
                }
            });
        }
    }
}
export async function runWithFakedTimers(options, fn) {
    const useFakeTimers = options.useFakeTimers === undefined ? true : options.useFakeTimers;
    if (!useFakeTimers) {
        return fn();
    }
    const scheduler = new TimeTravelScheduler(options.startTime ?? 0);
    const schedulerProcessor = new AsyncSchedulerProcessor(scheduler, { useSetImmediate: options.useSetImmediate, maxTaskCount: options.maxTaskCount });
    const globalInstallDisposable = scheduler.installGlobally();
    let didThrow = true;
    let result;
    try {
        result = await fn();
        didThrow = false;
    }
    finally {
        globalInstallDisposable.dispose();
        try {
            if (!didThrow) {
                // We process the remaining scheduled tasks.
                // The global override is no longer active, so during this, no more tasks will be scheduled.
                await schedulerProcessor.waitForEmptyQueue();
            }
        }
        finally {
            schedulerProcessor.dispose();
        }
    }
    return result;
}
export const originalGlobalValues = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setImmediate: globalThis.setImmediate?.bind(globalThis),
    clearImmediate: globalThis.clearImmediate?.bind(globalThis),
    requestAnimationFrame: globalThis.requestAnimationFrame?.bind(globalThis),
    cancelAnimationFrame: globalThis.cancelAnimationFrame?.bind(globalThis),
    Date: globalThis.Date,
};
function setTimeout(scheduler, handler, timeout = 0) {
    if (typeof handler === 'string') {
        throw new Error('String handler args should not be used and are not supported');
    }
    return scheduler.schedule({
        time: scheduler.now + timeout,
        run: () => {
            handler();
        },
        source: {
            toString() { return 'setTimeout'; },
            stackTrace: new Error().stack,
        }
    });
}
function setInterval(scheduler, handler, interval) {
    if (typeof handler === 'string') {
        throw new Error('String handler args should not be used and are not supported');
    }
    const validatedHandler = handler;
    let iterCount = 0;
    const stackTrace = new Error().stack;
    let disposed = false;
    let lastDisposable;
    function schedule() {
        iterCount++;
        const curIter = iterCount;
        lastDisposable = scheduler.schedule({
            time: scheduler.now + interval,
            run() {
                if (!disposed) {
                    schedule();
                    validatedHandler();
                }
            },
            source: {
                toString() { return `setInterval (iteration ${curIter})`; },
                stackTrace,
            }
        });
    }
    schedule();
    return {
        dispose: () => {
            if (disposed) {
                return;
            }
            disposed = true;
            lastDisposable.dispose();
        }
    };
}
function overwriteGlobals(scheduler) {
    // eslint-disable-next-line local/code-no-any-casts
    globalThis.setTimeout = ((handler, timeout) => setTimeout(scheduler, handler, timeout));
    globalThis.clearTimeout = (timeoutId) => {
        if (typeof timeoutId === 'object' && timeoutId && 'dispose' in timeoutId) {
            timeoutId.dispose();
        }
        else {
            originalGlobalValues.clearTimeout(timeoutId);
        }
    };
    // eslint-disable-next-line local/code-no-any-casts
    globalThis.setInterval = ((handler, timeout) => setInterval(scheduler, handler, timeout));
    globalThis.clearInterval = (timeoutId) => {
        if (typeof timeoutId === 'object' && timeoutId && 'dispose' in timeoutId) {
            timeoutId.dispose();
        }
        else {
            originalGlobalValues.clearInterval(timeoutId);
        }
    };
    globalThis.Date = createDateClass(scheduler);
    return {
        dispose: () => {
            Object.assign(globalThis, originalGlobalValues);
        }
    };
}
function createDateClass(scheduler) {
    const OriginalDate = originalGlobalValues.Date;
    function SchedulerDate(...args) {
        // the Date constructor called as a function, ref Ecma-262 Edition 5.1, section 15.9.2.
        // This remains so in the 10th edition of 2019 as well.
        if (!(this instanceof SchedulerDate)) {
            return new OriginalDate(scheduler.now).toString();
        }
        // if Date is called as a constructor with 'new' keyword
        if (args.length === 0) {
            return new OriginalDate(scheduler.now);
        }
        // eslint-disable-next-line local/code-no-any-casts
        return new OriginalDate(...args);
    }
    for (const prop in OriginalDate) {
        if (OriginalDate.hasOwnProperty(prop)) {
            // eslint-disable-next-line local/code-no-any-casts
            SchedulerDate[prop] = OriginalDate[prop];
        }
    }
    SchedulerDate.now = function now() {
        return scheduler.now;
    };
    SchedulerDate.toString = function toString() {
        return OriginalDate.toString();
    };
    SchedulerDate.prototype = OriginalDate.prototype;
    SchedulerDate.parse = OriginalDate.parse;
    SchedulerDate.UTC = OriginalDate.UTC;
    SchedulerDate.prototype.toUTCString = OriginalDate.prototype.toUTCString;
    // eslint-disable-next-line local/code-no-any-casts
    return SchedulerDate;
}
class SimplePriorityQueue {
    constructor(items, compare) {
        this.compare = compare;
        this.isSorted = false;
        this.items = items;
    }
    get length() {
        return this.items.length;
    }
    add(value) {
        this.items.push(value);
        this.isSorted = false;
    }
    remove(value) {
        const idx = this.items.indexOf(value);
        if (idx !== -1) {
            this.items.splice(idx, 1);
            this.isSorted = false;
        }
    }
    removeMin() {
        this.ensureSorted();
        return this.items.shift();
    }
    getMin() {
        this.ensureSorted();
        return this.items[0];
    }
    toSortedArray() {
        this.ensureSorted();
        return [...this.items];
    }
    ensureSorted() {
        if (!this.isSorted) {
            this.items.sort(this.compare);
            this.isSorted = true;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGltZVRyYXZlbFNjaGVkdWxlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDMUYsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUN2RCxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sMkJBQTJCLENBQUM7QUFDcEUsT0FBTyxFQUFFLFdBQVcsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBeUI1RSxNQUFNLHVCQUF1QixHQUFHLG1CQUFtQixDQUNsRCxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLGdCQUFnQixDQUFDLEVBQ3hDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsZ0JBQWdCLENBQUMsQ0FDdEMsQ0FBQztBQUVGLE1BQU0sT0FBTyxtQkFBbUI7SUFRL0IsWUFBWSxXQUFtQjtRQVB2QixnQkFBVyxHQUFHLENBQUMsQ0FBQztRQUNoQixXQUFNLEdBQWUsQ0FBQyxDQUFDO1FBQ2QsVUFBSyxHQUF5QyxJQUFJLG1CQUFtQixDQUF3QixFQUFFLEVBQUUsdUJBQXVCLENBQUMsQ0FBQztRQUUxSCx5QkFBb0IsR0FBRyxJQUFJLE9BQU8sRUFBMkIsQ0FBQztRQUMvRCxvQkFBZSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUM7UUFHakUsSUFBSSxDQUFDLE1BQU0sR0FBRyxXQUFXLENBQUM7SUFDM0IsQ0FBQztJQUVELFFBQVEsQ0FBQyxJQUFtQjtR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