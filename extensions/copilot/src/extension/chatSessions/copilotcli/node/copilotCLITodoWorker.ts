/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parentPort } from 'worker_threads';
import { RcpResponseHandler, RpcRequest, RpcResponse } from '../../../../util/node/worker';

export interface TodoItem {
	id: string;
	title: string;
	description: string;
	status: 'pending' | 'in_progress' | 'done' | 'blocked';
}

export interface TodoSqlWorkerApi {
	queryTodos(dbPath: string): TodoItem[];
}

const responseHandler = new RcpResponseHandler();

parentPort!.on('message', (msg: RpcRequest | RpcResponse) => {
	if ('fn' in msg) {
		try {
			const result = handleRequest(msg.fn, msg.args);
			parentPort!.postMessage({ id: msg.id, res: result } satisfies RpcResponse);
		} catch (err) {
			parentPort!.postMessage({ id: msg.id, err } satisfies RpcResponse);
		}
	} else {
		responseHandler.handleResponse(msg);
	}
});

function handleRequest(fn: string, args: unknown[]): unknown {
	switch (fn) {
		case 'queryTodos':
			return queryTodos(args[0] as string);
		default:
			throw new Error(`Unknown function: ${fn}`);
	}
}

function queryTodos(dbPath: string): TodoItem[] {
	if (!existsSync(dbPath)) {
		return [];
	}
	let db: DatabaseSync | undefined;
	try {
		db = new DatabaseSync(dbPath, { open: true });
		db.exec('PRAGMA busy_timeout = 2000');
		// Check if the todos table exists
		const tableCheck = db.prepare(
			'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'todos\''
		);
		const tables = tableCheck.all() as Record<string, unknown>[];
		if (tables.length === 0) {
			return [];
		}

		const stmt = db.prepare('SELECT id, title, description, status FROM todos ORDER BY created_at ASC');
		const rows = stmt.all() as Record<string, unknown>[];
		return rows.map(row => ({
			id: String(row.id ?? ''),
			title: String(row.title ?? ''),
			description: String(row.description ?? ''),
			status: String(row.status ?? 'pending') as TodoItem['status'],
		}));
	} finally {
		db?.close();
	}
}
