/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IChatTodo, IChatTodoListService } from '../../../../common/tools/chatTodoListService.js';
import { createManageTodoListToolData, ManageTodoListTool } from '../../../../common/tools/builtinTools/manageTodoListTool.js';
import { IToolData, IToolInvocation } from '../../../../common/tools/languageModelToolsService.js';
import { IJSONSchema } from '../../../../../../../base/common/jsonSchema.js';

const testSessionUri = URI.parse('chat-session://test/session1');

class MockChatTodoListService implements IChatTodoListService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidUpdateTodos = new Emitter<URI>();
	readonly onDidUpdateTodos: Event<URI> = this._onDidUpdateTodos.event;

	private readonly _store = new Map<string, IChatTodo[]>();
	readonly setTodosCalls: { sessionResource: URI; todos: IChatTodo[] }[] = [];

	getTodos(sessionResource: URI): IChatTodo[] {
		return this._store.get(sessionResource.toString()) ?? [];
	}

	setTodos(sessionResource: URI, todos: IChatTodo[]): void {
		this.setTodosCalls.push({ sessionResource, todos: [...todos] });
		this._store.set(sessionResource.toString(), [...todos]);
		this._onDidUpdateTodos.fire(sessionResource);
	}

	migrateTodos(_oldSessionResource: URI, _newSessionResource: URI): void { }

	dispose(): void {
		this._onDidUpdateTodos.dispose();
	}
}

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

suite('ManageTodoListTool Invocation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let tool: ManageTodoListTool;
	let mockService: MockChatTodoListService;

	setup(() => {
		mockService = new MockChatTodoListService();
		store.add({ dispose: () => mockService.dispose() });
		tool = store.add(new ManageTodoListTool(
			mockService,
			new NullLogService(),
			NullTelemetryService,
		));
	});

	function createInvocation(parameters: Record<string, any>): IToolInvocation {
		return {
			parameters,
			context: { sessionResource: testSessionUri },
			callId: 'test-call-1',
			toolId: 'manage_todo_list',
		};
	}

	const noopCountTokens = async () => 0;
	const noopProgress = { report() { } };

	test('invoke write operation persists todos to service', async () => {
		const todos = [
			{ id: 1, title: 'Task 1', status: 'not-started' as const },
			{ id: 2, title: 'Task 2', status: 'not-started' as const },
			{ id: 3, title: 'Task 3', status: 'not-started' as const },
		];

		const result = await tool.invoke(
			createInvocation({ todoList: todos }),
			noopCountTokens, noopProgress, CancellationToken.None
		);

		assert.ok(result.content[0].kind === 'text');
		assert.ok((result.content[0] as { kind: 'text'; value: string }).value.includes('Successfully wrote todo list'));
		assert.deepStrictEqual(mockService.getTodos(testSessionUri), todos);
	});

	test('invoke read operation returns current state', async () => {
		mockService.setTodos(testSessionUri, [
			{ id: 1, title: 'Task 1', status: 'completed' },
			{ id: 2, title: 'Task 2', status: 'in-progress' },
		]);

		const result = await tool.invoke(
			createInvocation({ operation: 'read', todoList: [], chatSessionResource: testSessionUri.toString() }),
			noopCountTokens, noopProgress, CancellationToken.None
		);

		assert.ok(result.content[0].kind === 'text');
		const text = (result.content[0] as { kind: 'text'; value: string }).value;
		assert.ok(text.includes('Task 1'), 'Read result should include task titles');
		assert.ok(text.includes('[x]'), 'Read result should show completed status');
		assert.ok(text.includes('[-]'), 'Read result should show in-progress status');
	});

	test('prepareToolInvocation generates correct pastTenseMessage for creating todos', async () => {
		const result = await tool.prepareToolInvocation({
			parameters: {
				todoList: [
					{ id: 1, title: 'Task 1', status: 'not-started' },
					{ id: 2, title: 'Task 2', status: 'not-started' },
					{ id: 3, title: 'Task 3', status: 'not-started' },
				]
			},
			toolCallId: 'call-1',
			chatSessionResource: testSessionUri,
		}, CancellationToken.None);

		assert.ok(result);
		assert.ok(result.pastTenseMessage);
		const message = typeof result.pastTenseMessage === 'string' ? result.pastTenseMessage : result.pastTenseMessage.value;
		assert.ok(message.includes('3'), 'Should mention count of created todos');
	});

	test('prepareToolInvocation generates correct pastTenseMessage for starting a todo', async () => {
		mockService.setTodos(testSessionUri, [
			{ id: 1, title: 'Task 1', status: 'not-started' },
			{ id: 2, title: 'Task 2', status: 'not-started' },
		]);

		const result = await tool.prepareToolInvocation({
			parameters: {
				todoList: [
					{ id: 1, title: 'Task 1', status: 'in-progress' },
					{ id: 2, title: 'Task 2', status: 'not-started' },
				]
			},
			toolCallId: 'call-1',
			chatSessionResource: testSessionUri,
		}, CancellationToken.None);

		assert.ok(result);
		const message = typeof result.pastTenseMessage === 'string' ? result.pastTenseMessage : result.pastTenseMessage!.value;
		assert.ok(message.includes('Task 1'), 'Should mention the started task');
		assert.ok(message.includes('1/2'), 'Should show progress');
	});

	test('steering mid-task: service state and pastTenseMessage stay consistent after out-of-order rendering', async () => {
		// Request 1: agent creates the TODO list and starts task 2
		await tool.invoke(
			createInvocation({
				todoList: [
					{ id: 1, title: 'Set up project', status: 'completed' },
					{ id: 2, title: 'Add auth middleware', status: 'in-progress' },
					{ id: 3, title: 'Write tests', status: 'not-started' },
				]
			}),
			noopCountTokens, noopProgress, CancellationToken.None
		);

		// User steers: "skip auth, mark it done, jump to tests"
		// Request 2: prepareToolInvocation runs first (service still has request 1 state)
		const prepareResult = await tool.prepareToolInvocation({
			parameters: {
				todoList: [
					{ id: 1, title: 'Set up project', status: 'completed' },
					{ id: 2, title: 'Add auth middleware', status: 'completed' },
					{ id: 3, title: 'Write tests', status: 'in-progress' },
				]
			},
			toolCallId: 'call-steered',
			chatSessionResource: testSessionUri,
		}, CancellationToken.None);

		// pastTenseMessage should reflect the transition (task 3 started)
		const message = typeof prepareResult!.pastTenseMessage === 'string'
			? prepareResult!.pastTenseMessage
			: prepareResult!.pastTenseMessage!.value;
		assert.ok(message.includes('Write tests'), 'pastTenseMessage should reference the newly started task');
		assert.ok(message.includes('3/3'), 'pastTenseMessage should show position of started task');

		// Request 2: then invoke() runs and updates the service
		await tool.invoke(
			createInvocation({
				todoList: [
					{ id: 1, title: 'Set up project', status: 'completed' },
					{ id: 2, title: 'Add auth middleware', status: 'completed' },
					{ id: 3, title: 'Write tests', status: 'in-progress' },
				]
			}),
			noopCountTokens, noopProgress, CancellationToken.None
		);

		// Service now has the steered state
		assert.deepStrictEqual(mockService.getTodos(testSessionUri), [
			{ id: 1, title: 'Set up project', status: 'completed' },
			{ id: 2, title: 'Add auth middleware', status: 'completed' },
			{ id: 3, title: 'Write tests', status: 'in-progress' },
		]);
	});

	test('prepareToolInvocation generates correct pastTenseMessage for completing a todo', async () => {
		mockService.setTodos(testSessionUri, [
			{ id: 1, title: 'Task 1', status: 'completed' },
			{ id: 2, title: 'Task 2', status: 'in-progress' },
			{ id: 3, title: 'Task 3', status: 'not-started' },
		]);

		const result = await tool.prepareToolInvocation({
			parameters: {
				todoList: [
					{ id: 1, title: 'Task 1', status: 'completed' },
					{ id: 2, title: 'Task 2', status: 'completed' },
					{ id: 3, title: 'Task 3', status: 'not-started' },
				]
			},
			toolCallId: 'call-1',
			chatSessionResource: testSessionUri,
		}, CancellationToken.None);

		assert.ok(result);
		const message = typeof result.pastTenseMessage === 'string' ? result.pastTenseMessage : result.pastTenseMessage!.value;
		assert.ok(message.includes('Task 2'), 'Should mention the completed task');
		assert.ok(message.includes('2/3'), 'Should show progress');
	});
});
