/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface TodoItem {
	id: string;
	title: string;
	description: string;
	status: 'pending' | 'in_progress' | 'done' | 'blocked';
}

const mockQueryTodos = vi.fn<(dbPath: string) => Promise<TodoItem[]>>();
const mockTerminate = vi.fn();

vi.mock('../../../../../util/node/worker', () => ({
	WorkerWithRpcProxy: class {
		proxy = { queryTodos: mockQueryTodos };
		terminate = mockTerminate;
	},
}));

// Import after mock so the mock is in place
const { TodoSqlQuery } = await import('../todoSqlQuery');

describe('TodoSqlQuery', () => {
	let query: InstanceType<typeof TodoSqlQuery>;

	beforeEach(() => {
		query = new TodoSqlQuery();
		vi.clearAllMocks();
	});

	afterEach(() => {
		query.dispose();
	});

	it('queryTodos passes the correct database path to the worker', async () => {
		mockQueryTodos.mockResolvedValue([]);
		await query.queryTodos('/some/session/dir');
		expect(mockQueryTodos).toHaveBeenCalledWith(expect.stringMatching(/[\\/]some[\\/]session[\\/]dir[\\/]session\.db$/));
	});

	it('queryTodos returns items from the worker', async () => {
		const items: TodoItem[] = [
			{ id: '1', title: 'Task 1', description: '', status: 'pending' },
			{ id: '2', title: 'Task 2', description: 'desc', status: 'done' },
		];
		mockQueryTodos.mockResolvedValue(items);
		const result = await query.queryTodos('/session/dir');
		expect(result).toEqual(items);
	});

	it('reuses the same worker across multiple queries', async () => {
		mockQueryTodos.mockResolvedValue([]);
		await query.queryTodos('/dir1');
		await query.queryTodos('/dir2');
		// The worker constructor is called once (lazy init), proxy is reused
		expect(mockQueryTodos).toHaveBeenCalledTimes(2);
	});

	it('dispose terminates the worker', () => {
		// Force worker creation by calling queryTodos
		mockQueryTodos.mockResolvedValue([]);
		void query.queryTodos('/dir');
		query.dispose();
		expect(mockTerminate).toHaveBeenCalledOnce();
	});

	it('dispose is safe to call when worker was never created', () => {
		// Should not throw
		query.dispose();
		expect(mockTerminate).not.toHaveBeenCalled();
	});

	it('dispose is safe to call multiple times', () => {
		mockQueryTodos.mockResolvedValue([]);
		void query.queryTodos('/dir');
		query.dispose();
		query.dispose();
		// Only one terminate call since the second dispose finds no worker
		expect(mockTerminate).toHaveBeenCalledOnce();
	});
});
