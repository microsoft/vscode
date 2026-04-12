/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { disposableTimeout } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { McpError } from './mcpTypes.js';
import { MCP } from './modelContextProtocol.js';
/**
 * Manages in-memory task state for server-side MCP tasks (sampling and elicitation).
 * Also tracks client-side tasks to survive handler reconnections.
 * Lifecycle is tied to the McpServer instance.
 */
export class McpTaskManager extends Disposable {
    constructor() {
        super(...arguments);
        this._serverTasks = this._register(new DisposableMap());
        this._clientTasks = this._register(new DisposableMap());
        this._onDidUpdateTask = this._register(new Emitter());
        this.onDidUpdateTask = this._onDidUpdateTask.event;
    }
    /**
     * Attach a new handler to this task manager.
     * Updates all client tasks to use the new handler.
     */
    setHandler(handler) {
        for (const task of this._clientTasks.values()) {
            task.setHandler(handler);
        }
    }
    /**
     * Get a client task by ID for status notification handling.
     */
    getClientTask(taskId) {
        return this._clientTasks.get(taskId);
    }
    /**
     * Track a new client task.
     */
    adoptClientTask(task) {
        this._clientTasks.set(task.id, task);
    }
    /**
     * Untracks a client task.
     */
    abandonClientTask(taskId) {
        this._clientTasks.deleteAndDispose(taskId);
    }
    /**
     * Create a new task and execute it asynchronously.
     * Returns the task immediately while execution continues in the background.
     */
    createTask(ttl, executor) {
        const taskId = generateUuid();
        const createdAt = new Date().toISOString();
        const createdAtTime = Date.now();
        const task = {
            taskId,
            status: 'working',
            createdAt,
            ttl,
            lastUpdatedAt: new Date().toISOString(),
            pollInterval: 1000, // Suggest 1 second polling interval
        };
        const store = new DisposableStore();
        const cts = new CancellationTokenSource();
        store.add(toDisposable(() => cts.dispose(true)));
        const executionPromise = this._executeTask(taskId, executor, cts.token);
        // Delete the task after its TTL. Or, if no TTL is given, delete it shortly after the task completes.
        if (ttl) {
            store.add(disposableTimeout(() => this._serverTasks.deleteAndDispose(taskId), ttl));
        }
        else {
            executionPromise.finally(() => {
                const timeout = this._register(disposableTimeout(() => {
                    this._serverTasks.deleteAndDispose(taskId);
                    this._store.delete(timeout);
                }, 60_000));
            });
        }
        this._serverTasks.set(taskId, {
            task,
            cts,
            dispose: () => store.dispose(),
            createdAtTime,
            executionPromise,
        });
        return { task };
    }
    /**
     * Execute a task asynchronously and update its state.
     */
    async _executeTask(taskId, executor, token) {
        try {
            const result = await executor(token);
            this._updateTaskStatus(taskId, 'completed', undefined, result);
        }
        catch (error) {
            if (error instanceof CancellationError) {
                this._updateTaskStatus(taskId, 'cancelled', 'Task was cancelled by the client');
            }
            else if (error instanceof McpError) {
                this._updateTaskStatus(taskId, 'failed', error.message, undefined, {
                    code: error.code,
                    message: error.message,
                    data: error.data,
                });
            }
            else if (error instanceof Error) {
                this._updateTaskStatus(taskId, 'failed', error.message, undefined, {
                    code: MCP.INTERNAL_ERROR,
                    message: error.message,
                });
            }
            else {
                this._updateTaskStatus(taskId, 'failed', 'Unknown error', undefined, {
                    code: MCP.INTERNAL_ERROR,
                    message: 'Unknown error',
                });
            }
        }
    }
    /**
     * Update task status and optionally store result or error.
     */
    _updateTaskStatus(taskId, status, statusMessage, result, error) {
        const entry = this._serverTasks.get(taskId);
        if (!entry) {
            return;
        }
        entry.task.status = status;
        entry.task.lastUpdatedAt = new Date().toISOString();
        if (statusMessage !== undefined) {
            entry.task.statusMessage = statusMessage;
        }
        if (result !== undefined) {
            entry.result = result;
        }
        if (error !== undefined) {
            entry.error = error;
        }
        this._onDidUpdateTask.fire({ ...entry.task });
    }
    /**
     * Get the current state of a task.
     * Returns an error if the task doesn't exist or has expired.
     */
    getTask(taskId) {
        const entry = this._serverTasks.get(taskId);
        if (!entry) {
            throw new McpError(MCP.INVALID_PARAMS, `Task not found: ${taskId}`);
        }
        return { ...entry.task };
    }
    /**
     * Get the result of a completed task.
     * Blocks until the task completes if it's still in progress.
     */
    async getTaskResult(taskId) {
        const entry = this._serverTasks.get(taskId);
        if (!entry) {
            throw new McpError(MCP.INVALID_PARAMS, `Task not found: ${taskId}`);
        }
        if (entry.task.status === 'working' || entry.task.status === 'input_required') {
            await entry.executionPromise;
        }
        // Refresh entry after waiting
        const updatedEntry = this._serverTasks.get(taskId);
        if (!updatedEntry) {
            throw new McpError(MCP.INVALID_PARAMS, `Task not found: ${taskId}`);
        }
        if (updatedEntry.error) {
            throw new McpError(updatedEntry.error.code, updatedEntry.error.message, updatedEntry.error.data);
        }
        if (!updatedEntry.result) {
            throw new McpError(MCP.INTERNAL_ERROR, 'Task completed but no result available');
        }
        return updatedEntry.result;
    }
    /**
     * Cancel a task.
     */
    cancelTask(taskId) {
        const entry = this._serverTasks.get(taskId);
        if (!entry) {
            throw new McpError(MCP.INVALID_PARAMS, `Task not found: ${taskId}`);
        }
        // Check if already in terminal status
        if (entry.task.status === 'completed' || entry.task.status === 'failed' || entry.task.status === 'cancelled') {
            throw new McpError(MCP.INVALID_PARAMS, `Cannot cancel task in ${entry.task.status} status`);
        }
        entry.task.status = 'cancelled';
        entry.task.statusMessage = 'Task was cancelled by the client';
        entry.cts.cancel();
        return { ...entry.task };
    }
    /**
     * List all tasks.
     */
    listTasks() {
        const tasks = [];
        for (const entry of this._serverTasks.values()) {
            tasks.push({ ...entry.task });
        }
        return { tasks };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwVGFza01hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvY29tbW9uL21jcFRhc2tNYW5hZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3JFLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzdILE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUUvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ3pDLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQW1CaEQ7Ozs7R0FJRztBQUNILE1BQU0sT0FBTyxjQUFlLFNBQVEsVUFBVTtJQUE5Qzs7UUFDa0IsaUJBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksYUFBYSxFQUFxQixDQUFDLENBQUM7UUFDdEUsaUJBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksYUFBYSxFQUE0QixDQUFDLENBQUM7UUFDN0UscUJBQWdCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBWSxDQUFDLENBQUM7UUFDNUQsb0JBQWUsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDO0lBaU8vRCxDQUFDO0lBL05BOzs7T0FHRztJQUNILFVBQVUs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