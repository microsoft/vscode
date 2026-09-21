/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../../base/common/event.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { createManageTodoListToolData, ManageTodoListTool } from '../../../../common/tools/builtinTools/manageTodoListTool.js';
import { IChatTodo, IChatTodoListService } from '../../../../common/tools/chatTodoListService.js';
import { IToolData, ToolInvocationPresentation } from '../../../../common/tools/languageModelToolsService.js';
import { IJSONSchema } from '../../../../../../../base/common/jsonSchema.js';

suite('ManageTodoListTool Schema', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function getSchemaProperties(toolData: IToolData): { properties: Record<string, IJSONSchema>; required: string[] } {
		assert.ok(toolData.inputSchema);
		const schema = toolData.inputSchema;
		const todolistItems = schema?.properties?.todoList?.items as IJSONSchema | undefined;
		const properties = todolistItems?.properties as Record<string, IJSONSchema> | undefined;
		const required = todolistItems?.required;

		assert.ok(properties, 'Schema properties should be defined');
		assert.ok(required, 'Schema required fields should be defined');

		return { properties, required };
	}

	test('createManageTodoListToolData returns valid tool data with proper schema', () => {
		const toolData = createManageTodoListToolData();

		assert.ok(toolData.id, 'Tool should have an id');
		assert.ok(toolData.inputSchema, 'Tool should have an input schema');
		assert.strictEqual(toolData.inputSchema?.type, 'object', 'Schema should be an object type');
	});

	test('createManageTodoListToolData schema has required todoList field', () => {
		const toolData = createManageTodoListToolData();

		assert.ok(toolData.inputSchema?.required?.includes('todoList'), 'todoList should be required');
		assert.ok(toolData.inputSchema?.properties?.todoList, 'todoList property should exist');
	});

	test('createManageTodoListToolData todoList items have correct required fields', () => {
		const toolData = createManageTodoListToolData();
		const { properties, required } = getSchemaProperties(toolData);

		assert.ok('id' in properties, 'Schema should have id property');
		assert.ok('title' in properties, 'Schema should have title property');
		assert.ok('status' in properties, 'Schema should have status property');
		assert.deepStrictEqual(required, ['id', 'title', 'status'], 'Required fields should be id, title, status');
	});

	test('createManageTodoListToolData status has correct enum values', () => {
		const toolData = createManageTodoListToolData();
		const { properties } = getSchemaProperties(toolData);

		const statusProperty = properties['status'];
		assert.ok(statusProperty, 'Status property should exist');
		assert.deepStrictEqual(statusProperty.enum, ['not-started', 'in-progress', 'completed'], 'Status should have correct enum values');
	});
});

suite('ManageTodoListTool prepareToolInvocation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionResource = URI.parse('vscode-chat://session/1');

	function createMockTodoListService(todos: IChatTodo[] = []): IChatTodoListService {
		return {
			_serviceBrand: undefined,
			onDidUpdateTodos: Event.None,
			getTodos: () => todos,
			setTodos: () => { },
			migrateTodos: () => { },
		};
	}

	function createTool(todos: IChatTodo[] = []): ManageTodoListTool {
		return store.add(new ManageTodoListTool(
			createMockTodoListService(todos),
			new NullLogService(),
			NullTelemetryService,
		));
	}

	test('presentation is Hidden when todoList param is empty', async () => {
		const tool = createTool();
		const result = await tool.prepareToolInvocation({
			parameters: { todoList: [] },
			toolCallId: 'call-1',
			chatSessionResource: sessionResource,
		}, CancellationToken.None);

		assert.strictEqual(result?.presentation, ToolInvocationPresentation.Hidden);
	});

	test('presentation is undefined when todoList param has items', async () => {
		const tool = createTool();
		const result = await tool.prepareToolInvocation({
			parameters: {
				todoList: [{ id: 1, title: 'Task 1', status: 'not-started' }],
			},
			toolCallId: 'call-1',
			chatSessionResource: sessionResource,
		}, CancellationToken.None);

		assert.strictEqual(result?.presentation, undefined);
	});

	test('presentation is Hidden for read operation with no existing todos', async () => {
		const tool = createTool([]);
		const result = await tool.prepareToolInvocation({
			parameters: { operation: 'read' },
			toolCallId: 'call-1',
			chatSessionResource: sessionResource,
		}, CancellationToken.None);

		assert.strictEqual(result?.presentation, ToolInvocationPresentation.Hidden);
	});

	test('presentation is undefined for read operation with existing todos', async () => {
		const tool = createTool([{ id: 1, title: 'Existing', status: 'in-progress' }]);
		const result = await tool.prepareToolInvocation({
			parameters: { operation: 'read' },
			toolCallId: 'call-1',
			chatSessionResource: sessionResource,
		}, CancellationToken.None);

		assert.strictEqual(result?.presentation, undefined);
	});

	test('returns undefined when no chatSessionResource is provided', async () => {
		const tool = createTool();
		const result = await tool.prepareToolInvocation({
			parameters: { todoList: [{ id: 1, title: 'Task', status: 'not-started' }] },
			toolCallId: 'call-1',
			chatSessionResource: undefined,
		}, CancellationToken.None);

		assert.strictEqual(result, undefined);
	});
});
