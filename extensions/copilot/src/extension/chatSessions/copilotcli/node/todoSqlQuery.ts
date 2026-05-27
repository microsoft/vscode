/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'path';
import { WorkerWithRpcProxy, type RpcProxy } from '../../../../util/node/worker';
import type { TodoItem, TodoSqlWorkerApi } from './copilotCLITodoWorker';

const DATABASE_FILENAME = 'session.db';

/**
 * Queries the session SQLite database for todo items using a worker thread
 * to avoid blocking the extension host with synchronous I/O.
 *
 * The worker is created lazily on first use and reused for subsequent queries.
 * Call {@link dispose} to terminate the worker when no longer needed.
 */
export class TodoSqlQuery {
	private _worker: WorkerWithRpcProxy<TodoSqlWorkerApi> | undefined;
	private _proxy: RpcProxy<TodoSqlWorkerApi> | undefined;

	private ensureWorker(): RpcProxy<TodoSqlWorkerApi> {
		if (!this._proxy) {
			this._worker = new WorkerWithRpcProxy<TodoSqlWorkerApi>(
				join(__dirname, 'copilotCLITodoWorker.js')
			);
			this._proxy = this._worker.proxy;
		}
		return this._proxy;
	}

	/**
	 * Query todos from the session database.
	 * @param sessionDir - The session state directory (e.g. ~/.copilot/session-state/{session-id})
	 * @returns Array of todo items, or empty array if database or table doesn't exist
	 */
	async queryTodos(sessionDir: string): Promise<TodoItem[]> {
		const dbPath = join(sessionDir, DATABASE_FILENAME);
		const proxy = this.ensureWorker();
		return proxy.queryTodos(dbPath);
	}

	dispose(): void {
		this._worker?.terminate();
		this._worker = undefined;
		this._proxy = undefined;
	}
}

export type { TodoItem };
