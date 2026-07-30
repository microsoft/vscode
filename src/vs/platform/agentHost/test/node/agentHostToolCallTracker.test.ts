/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ToolCallContributorKind, type ToolCallContributor, type ToolCallResult } from '../../common/state/sessionState.js';
import { deriveToolInvokedResult, getTodoStoreOperationData, toolSourceKindFromContributor } from '../../node/agentHostToolCallTracker.js';

function result(success: boolean, code?: string): ToolCallResult {
	return {
		success,
		pastTenseMessage: 'done',
		error: code !== undefined || !success ? { message: 'failed', code } : undefined,
	};
}

suite('agentHostToolCallTracker', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('deriveToolInvokedResult maps success/cancel/error buckets', () => {
		const actual = {
			success: deriveToolInvokedResult(result(true)),
			denied: deriveToolInvokedResult(result(false, 'denied')),
			rejected: deriveToolInvokedResult(result(false, 'rejected')),
			cancelled: deriveToolInvokedResult(result(false, 'cancelled')),
			otherCode: deriveToolInvokedResult(result(false, 'timeout')),
			noCode: deriveToolInvokedResult(result(false)),
		};
		assert.deepStrictEqual(actual, {
			success: 'success',
			denied: 'userCancelled',
			rejected: 'userCancelled',
			cancelled: 'userCancelled',
			otherCode: 'error',
			noCode: 'error',
		});
	});

	test('toolSourceKindFromContributor maps contributor kind', () => {
		const mcp: ToolCallContributor = { kind: ToolCallContributorKind.MCP, customizationId: 'c1' };
		const client: ToolCallContributor = { kind: ToolCallContributorKind.Client, clientId: 'x' };
		const actual = {
			none: toolSourceKindFromContributor(undefined),
			mcp: toolSourceKindFromContributor(mcp),
			client: toolSourceKindFromContributor(client),
		};
		assert.deepStrictEqual(actual, {
			none: 'agentHost',
			mcp: 'mcp',
			client: 'client',
		});
	});

	test('getTodoStoreOperationData classifies SQL operation and target', () => {
		assert.deepStrictEqual({
			readTodos: getTodoStoreOperationData('sql', JSON.stringify({ query: 'SELECT * FROM todos' })),
			writeTodoDeps: getTodoStoreOperationData('sql', JSON.stringify({ query: 'DELETE FROM todo_deps WHERE todo_id = 1' })),
			readBoth: getTodoStoreOperationData('sql', JSON.stringify({ query: 'SELECT * FROM todos JOIN todo_deps ON todo_deps.todo_id = todos.id' })),
			mixedBoth: getTodoStoreOperationData('sql', JSON.stringify({ query: 'INSERT INTO todos SELECT * FROM todo_deps' })),
			readTodosWhileWritingElsewhere: getTodoStoreOperationData('sql', JSON.stringify({ query: 'INSERT INTO archive SELECT * FROM todos' })),
			writeTodosWhileReadingElsewhere: getTodoStoreOperationData('sql', JSON.stringify({ query: 'INSERT INTO todos SELECT * FROM archive' })),
			quotedAndQualified: getTodoStoreOperationData('sql', JSON.stringify({ query: 'SELECT * FROM main."todos", [todo_deps]' })),
			derivedTableAlias: getTodoStoreOperationData('sql', JSON.stringify({ query: 'SELECT * FROM (SELECT * FROM files) AS todos' })),
			tableNameInLiteral: getTodoStoreOperationData('sql', JSON.stringify({ query: 'SELECT \'todos\', \'todo_deps\'' })),
			tableNameInInsertedLiteral: getTodoStoreOperationData('sql', JSON.stringify({ query: 'INSERT INTO files(name) VALUES (\'todos\')' })),
			verbInLiteral: getTodoStoreOperationData('sql', JSON.stringify({ query: 'SELECT * FROM todos WHERE title = \'update todo_deps\'' })),
			namesInComments: getTodoStoreOperationData('sql', JSON.stringify({ query: 'SELECT * FROM files -- JOIN todos\n/* UPDATE todo_deps */' })),
			unclassified: getTodoStoreOperationData('sql', JSON.stringify({ query: 'PRAGMA table_info(todos)' })),
			unrelatedSql: getTodoStoreOperationData('sql', JSON.stringify({ query: 'SELECT * FROM files' })),
			unrelatedTool: getTodoStoreOperationData('bash', JSON.stringify({ command: 'echo todos' })),
		}, {
			readTodos: {
				operation: 'read',
				target: 'todos',
			},
			writeTodoDeps: {
				operation: 'write',
				target: 'todo_deps',
			},
			readBoth: {
				operation: 'read',
				target: 'both',
			},
			mixedBoth: {
				operation: 'mixed',
				target: 'both',
			},
			readTodosWhileWritingElsewhere: {
				operation: 'read',
				target: 'todos',
			},
			writeTodosWhileReadingElsewhere: {
				operation: 'write',
				target: 'todos',
			},
			quotedAndQualified: {
				operation: 'read',
				target: 'both',
			},
			derivedTableAlias: undefined,
			tableNameInLiteral: undefined,
			tableNameInInsertedLiteral: undefined,
			verbInLiteral: {
				operation: 'read',
				target: 'todos',
			},
			namesInComments: undefined,
			unclassified: undefined,
			unrelatedSql: undefined,
			unrelatedTool: undefined,
		});
	});
});
