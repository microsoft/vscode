// Type definitions for Orchestrator
// Project: https://github.com/orchestrator/orchestrator
// Definitions by: Qubo <https://github.com/tkQubo>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare type Strings = string|string[];

declare module "orchestrator" {
    class Orchestrator {
        add: Orchestrator.AddMethod;
        /**
         * Have you defined a task with this name?
         * @param name The task name to query
         */
        hasTask(name: string): boolean;
        start: Orchestrator.StartMethod;
        stop(): void;

        /**
         * Listen to orchestrator internals
         * @param event Event name to listen to:
         * <ul>
         *   <li>start: from start() method, shows you the task sequence
         *   <li>stop: from stop() method, the queue finished successfully
         *   <li>err: from stop() method, the queue was aborted due to a task error
         *   <li>task_start: from _runTask() method, task was started
         *   <li>task_stop: from _runTask() method, task completed successfully
         *   <li>task_err: from _runTask() method, task errored
         *   <li>task_not_found: from start() method, you're trying to start a task that doesn't exist
         *   <li>task_recursion: from start() method, there are recursive dependencies in your task list
         * </ul>
         * @param cb Passes single argument: e: event details
         */
        on(event: string, cb: (e: Orchestrator.OnCallbackEvent) => any): Orchestrator;

        /**
         * Listen to all orchestrator events from one callback
         * @param cb Passes single argument: e: event details
         */
        onAll(cb: (e: Orchestrator.OnAllCallbackEvent) => any): void;
    }

    namespace Orchestrator {
        interface AddMethodCallback {
            /**
             * Accept a callback
             * @param callback
             */
            (callback?: Function): any;
            /**
             * Return a promise
             */
            (): Q.Promise<any>;
            /**
             * Return a stream: (task is marked complete when stream ends)
             */
            (): any; //TODO: stream type should be here e.g. map-stream
        }

        /**
         * Define a task
         */
        interface AddMethod {
            /**
             * Define a task
             * @param name The name of the task.
             * @param deps An array of task names to be executed and completed before your task will run.
             * @param fn The function that performs the task's operations. For asynchronous tasks, you need to provide a hint when the task is complete:
             * <ul>
             *     <li>Take in a callback</li>
             *     <li>Return a stream or a promise</li>
             * </ul>
             */
            (name: string, deps?: string[], fn?: AddMethodCallback|Function): Orchestrator;
            /**
             * Define a task
             * @param name The name of the task.
             * @param fn The function that performs the task's operations. For asynchronous tasks, you need to provide a hint when the task is complete:
             * <ul>
             *     <li>Take in a callback</li>
             *     <li>Return a stream or a promise</li>
             * </ul>
             */
            (name: string, fn?: AddMethodCallback|Function): Orchestrator;
        }

        /**
         * Start running the tasks
         */
        interface StartMethod {
            /**
             * Start running the tasks
             * @param tasks Tasks to be executed. You may pass any number of tasks as individual arguments.
             * @param cb Callback to call after run completed.
             */
            (tasks: Strings, cb?: (error?: any) => any): Orchestrator;
            /**
             * Start running the tasks
             * @param tasks Tasks to be executed. You may pass any number of tasks as individual arguments.
             * @param cb Callback to call after run completed.
             */
            (...tasks: Strings[]/*, cb?: (error: any) => any */): Orchestrator;
            //TODO: TypeScript 1.5.3 cannot express varargs followed by callback as a last argument...
            (task1: Strings, task2: Strings, cb?: (error?: any) => any): Orchestrator;
            (task1: Strings, task2: Strings, task3: Strings, cb?: (error?: any) => any): Orchestrator;
            (task1: Strings, task2: Strings, task3: Strings, task4: Strings, cb?: (error?: any) => any): Orchestrator;
            (task1: Strings, task2: Strings, task3: Strings, task4: Strings, task5: Strings, cb?: (error?: any) => any): Orchestrator;
            (task1: Strings, task2: Strings, task3: Strings, task4: Strings, task5: Strings, task6: Strings, cb?: (error?: any) => any): Orchestrator;
        }

        interface OnCallbackEvent {
            message: string;
            task: string;
            err: any;
            duration?: number;
        }

        interface OnAllCallbackEvent extends OnCallbackEvent {
            src: string;
        }

    }

    export = Orchestrator;
}