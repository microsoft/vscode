/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { createManageTodoListToolData, ManageTodoListTool } from '../../../common/tools/manageTodoListTool.js';
import { IToolData, IToolInvocation } from '../../../common/languageModelToolsService.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IChatTodoListService } from '../../../common/chatTodoListService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';

suite('ManageTodoListTool Description Field Setting', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function getSchemaProperties(toolData: IToolData): { properties: any; required: string[] } {
		assert.ok(toolData.inputSchema);
		// eslint-disable-next-line local/code-no-any-casts
		const schema = toolData.inputSchema as any;
		const properties = schema?.properties?.todoList?.items?.properties;
		const required = schema?.properties?.todoList?.items?.required;

		assert.ok(properties, 'Schema properties should be defined');
		assert.ok(required, 'Schema required fields should be defined');

		return { properties, required };
	}

	test('createManageTodoListToolData should include description field when enabled', () => {
		const toolData = createManageTodoListToolData(false, true);
		const { properties, required } = getSchemaProperties(toolData);

		assert.strictEqual('description' in properties, true);
		assert.strictEqual(required.includes('description'), true);
		assert.deepStrictEqual(required, ['id', 'title', 'description', 'status']);
	});

	test('createManageTodoListToolData should exclude description field when disabled', () => {
		const toolData = createManageTodoListToolData(false, false);
		const { properties, required } = getSchemaProperties(toolData);

		assert.strictEqual('description' in properties, false);
		assert.strictEqual(required.includes('description'), false);
		assert.deepStrictEqual(required, ['id', 'title', 'status']);
	});

	test('createManageTodoListToolData should use default value for includeDescription', () => {
		const toolDataDefault = createManageTodoListToolData(false);
		const { properties, required } = getSchemaProperties(toolDataDefault);

		// Default should be true (includes description)
		assert.strictEqual('description' in properties, true);
		assert.strictEqual(required.includes('description'), true);
	});
});

suite('ManageTodoListTool Validation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	class MockChatTodoListService implements IChatTodoListService {
		readonly _serviceBrand: undefined;
		private todos = new Map<string, any[]>();

		getTodos(sessionId: string) {
			return this.todos.get(sessionId) || [];
		}

		setTodos(sessionId: string, todos: any[]) {
			this.todos.set(sessionId, todos);
		}
	}

	test('should reject todo list with less than 3 items', async () => {
		const todoListService = new MockChatTodoListService();
		const tool = new ManageTodoListTool(
			false,
			true,
			todoListService,
			new NullLogService(),
			NullTelemetryService
		);

		const invocation: IToolInvocation = {
			callId: 'test-call-1',
			toolId: 'manage_todo_list',
			parameters: {
				operation: 'write',
				todoList: [
					{ id: 1, title: 'Task 1', description: 'Description 1', status: 'not-started' },
					{ id: 2, title: 'Task 2', description: 'Description 2', status: 'not-started' }
				]
			},
			context: { sessionId: 'test-session' }
		};

		const result = await tool.invoke(invocation, () => 0, undefined, CancellationToken.None);

		assert.ok(result.content);
		assert.strictEqual(result.content.length, 1);
		assert.strictEqual(result.content[0].kind, 'text');
		assert.ok(result.content[0].value.includes('too simple'));
		assert.ok(result.content[0].value.includes('fewer than 3 items'));

		// Verify that todos were NOT saved
		const savedTodos = todoListService.getTodos('test-session');
		assert.strictEqual(savedTodos.length, 0);
	});

	test('should reject todo list with 1 item', async () => {
		const todoListService = new MockChatTodoListService();
		const tool = new ManageTodoListTool(
			false,
			true,
			todoListService,
			new NullLogService(),
			NullTelemetryService
		);

		const invocation: IToolInvocation = {
			callId: 'test-call-2',
			toolId: 'manage_todo_list',
			parameters: {
				operation: 'write',
				todoList: [
					{ id: 1, title: 'Single Task', description: 'Description', status: 'not-started' }
				]
			},
			context: { sessionId: 'test-session' }
		};

		const result = await tool.invoke(invocation, () => 0, undefined, CancellationToken.None);

		assert.ok(result.content);
		assert.strictEqual(result.content.length, 1);
		assert.strictEqual(result.content[0].kind, 'text');
		assert.ok(result.content[0].value.includes('too simple'));

		// Verify that todos were NOT saved
		const savedTodos = todoListService.getTodos('test-session');
		assert.strictEqual(savedTodos.length, 0);
	});

	test('should accept todo list with exactly 3 items', async () => {
		const todoListService = new MockChatTodoListService();
		const tool = new ManageTodoListTool(
			false,
			true,
			todoListService,
			new NullLogService(),
			NullTelemetryService
		);

		const invocation: IToolInvocation = {
			callId: 'test-call-3',
			toolId: 'manage_todo_list',
			parameters: {
				operation: 'write',
				todoList: [
					{ id: 1, title: 'Task 1', description: 'Description 1', status: 'not-started' },
					{ id: 2, title: 'Task 2', description: 'Description 2', status: 'not-started' },
					{ id: 3, title: 'Task 3', description: 'Description 3', status: 'not-started' }
				]
			},
			context: { sessionId: 'test-session' }
		};

		const result = await tool.invoke(invocation, () => 0, undefined, CancellationToken.None);

		assert.ok(result.content);
		assert.strictEqual(result.content.length, 1);
		assert.strictEqual(result.content[0].kind, 'text');
		assert.ok(result.content[0].value.includes('Successfully wrote todo list'));

		// Verify that todos were saved
		const savedTodos = todoListService.getTodos('test-session');
		assert.strictEqual(savedTodos.length, 3);
	});

	test('should accept todo list with more than 3 items', async () => {
		const todoListService = new MockChatTodoListService();
		const tool = new ManageTodoListTool(
			false,
			true,
			todoListService,
			new NullLogService(),
			NullTelemetryService
		);

		const invocation: IToolInvocation = {
			callId: 'test-call-4',
			toolId: 'manage_todo_list',
			parameters: {
				operation: 'write',
				todoList: [
					{ id: 1, title: 'Task 1', description: 'Description 1', status: 'not-started' },
					{ id: 2, title: 'Task 2', description: 'Description 2', status: 'not-started' },
					{ id: 3, title: 'Task 3', description: 'Description 3', status: 'not-started' },
					{ id: 4, title: 'Task 4', description: 'Description 4', status: 'not-started' }
				]
			},
			context: { sessionId: 'test-session' }
		};

		const result = await tool.invoke(invocation, () => 0, undefined, CancellationToken.None);

		assert.ok(result.content);
		assert.strictEqual(result.content.length, 1);
		assert.strictEqual(result.content[0].kind, 'text');
		assert.ok(result.content[0].value.includes('Successfully wrote todo list'));

		// Verify that todos were saved
		const savedTodos = todoListService.getTodos('test-session');
		assert.strictEqual(savedTodos.length, 4);
	});
});
