/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getCopilotTodoStoreOperationData } from '../../node/copilot/copilotTodoStoreTelemetry.js';

suite('copilotTodoStoreTelemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('classifies SQL operation and target', () => {
		const query = (value: string): Record<string, unknown> => ({ query: value });
		assert.deepStrictEqual({
			readTodos: getCopilotTodoStoreOperationData('sql', query('SELECT * FROM todos')),
			writeTodoDeps: getCopilotTodoStoreOperationData('sql', query('DELETE FROM todo_deps WHERE todo_id = 1')),
			readBoth: getCopilotTodoStoreOperationData('sql', query('SELECT * FROM todos JOIN todo_deps ON todo_deps.todo_id = todos.id')),
			mixedBoth: getCopilotTodoStoreOperationData('sql', query('INSERT INTO todos SELECT * FROM todo_deps')),
			readTodosWhileWritingElsewhere: getCopilotTodoStoreOperationData('sql', query('INSERT INTO archive SELECT * FROM todos')),
			writeTodosWhileReadingElsewhere: getCopilotTodoStoreOperationData('sql', query('INSERT INTO todos SELECT * FROM archive')),
			quotedAndQualified: getCopilotTodoStoreOperationData('sql', query('SELECT * FROM main."todos", [todo_deps]')),
			derivedTableAlias: getCopilotTodoStoreOperationData('sql', query('SELECT * FROM (SELECT * FROM files) AS todos')),
			tableNameInLiteral: getCopilotTodoStoreOperationData('sql', query('SELECT \'todos\', \'todo_deps\'')),
			tableNameInInsertedLiteral: getCopilotTodoStoreOperationData('sql', query('INSERT INTO files(name) VALUES (\'todos\')')),
			verbInLiteral: getCopilotTodoStoreOperationData('sql', query('SELECT * FROM todos WHERE title = \'update todo_deps\'')),
			namesInComments: getCopilotTodoStoreOperationData('sql', query('SELECT * FROM files -- JOIN todos\n/* UPDATE todo_deps */')),
			unclassified: getCopilotTodoStoreOperationData('sql', query('PRAGMA table_info(todos)')),
			unrelatedSql: getCopilotTodoStoreOperationData('sql', query('SELECT * FROM files')),
			unrelatedTool: getCopilotTodoStoreOperationData('bash', { command: 'echo todos' }),
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
