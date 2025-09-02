/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { timeout } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ManageTodoListTool, createManageTodoListToolData } from '../../common/tools/manageTodoListTool.js';
import { IChatTodo, IChatTodoListService } from '../../common/chatTodoListService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IToolInvocation } from '../../common/languageModelToolsService.js';

suite('ManageTodoListTool - Test Plan Implementation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let tool: ManageTodoListTool;
	let mockTodoListService: IChatTodoListService;
	let storedTodos: Map<string, IChatTodo[]>;

	const createSampleTodos = (): IChatTodo[] => [
		{
			id: 1,
			title: 'Set up project repository',
			description: 'Initialize Git repository, create README, and set up basic project structure',
			status: 'completed'
		},
		{
			id: 2,
			title: 'Design database schema',
			description: 'Create entity-relationship diagram and define database tables with proper relationships',
			status: 'in-progress'
		},
		{
			id: 3,
			title: 'Implement user authentication',
			description: 'Add login/logout functionality with JWT tokens and secure password hashing',
			status: 'not-started'
		},
		{
			id: 4,
			title: 'Create API endpoints',
			description: 'Develop REST API endpoints for user management, data access, and business logic',
			status: 'not-started'
		}
	];

	setup(() => {
		storedTodos = new Map();

		mockTodoListService = {
			_serviceBrand: undefined,
			getTodos: (sessionId: string) => storedTodos.get(sessionId) || [],
			setTodos: (sessionId: string, todos: IChatTodo[]) => {
				storedTodos.set(sessionId, [...todos]);
			}
		};

		tool = store.add(new ManageTodoListTool(
			false, // not write-only mode
			mockTodoListService,
			new NullLogService(),
			new NullTelemetryService()
		));
	});

	teardown(() => {
		storedTodos.clear();
	});

	suite('Structured Task Generation (Test 1)', () => {
		test('tool data has proper schema for structured tasks', () => {
			const toolData = createManageTodoListToolData(false);
			
			assert.strictEqual(toolData.id, 'manage_todo_list', 'Should have correct tool ID');
			assert.strictEqual(toolData.toolReferenceName, 'todos', 'Should have correct reference name');
			assert.strictEqual(toolData.displayName, 'Update Todo List', 'Should have correct display name');

			// Verify schema structure
			const schema = toolData.inputSchema;
			assert.ok(schema.properties.operation, 'Should have operation property');
			assert.ok(schema.properties.todoList, 'Should have todoList property');
			
			// Check todoList array schema
			const todoListSchema = schema.properties.todoList;
			assert.strictEqual(todoListSchema.type, 'array', 'todoList should be array type');
			assert.ok(todoListSchema.items, 'todoList should have items schema');
			
			const itemSchema = todoListSchema.items;
			assert.ok(itemSchema.properties.id, 'Todo items should have id field');
			assert.ok(itemSchema.properties.title, 'Todo items should have title field');
			assert.ok(itemSchema.properties.description, 'Todo items should have description field');
			assert.ok(itemSchema.properties.status, 'Todo items should have status field');
		});

		test('handles complex development workflow creation', async () => {
			const complexWorkflow: IChatTodo[] = [
				{
					id: 1,
					title: 'Requirements Analysis',
					description: 'Gather and document functional and non-functional requirements from stakeholders',
					status: 'completed'
				},
				{
					id: 2,
					title: 'System Architecture Design',
					description: 'Create high-level system architecture, component diagrams, and technology stack decisions',
					status: 'completed'
				},
				{
					id: 3,
					title: 'Database Design',
					description: 'Design normalized database schema, create ER diagrams, and plan data migration strategy',
					status: 'in-progress'
				},
				{
					id: 4,
					title: 'API Specification',
					description: 'Define REST API endpoints, request/response formats, and OpenAPI documentation',
					status: 'not-started'
				},
				{
					id: 5,
					title: 'Frontend Wireframes',
					description: 'Create user interface mockups and define user experience flows',
					status: 'not-started'
				},
				{
					id: 6,
					title: 'Backend Implementation',
					description: 'Implement core business logic, data access layer, and API endpoints',
					status: 'not-started'
				},
				{
					id: 7,
					title: 'Frontend Implementation',
					description: 'Build user interface components and integrate with backend APIs',
					status: 'not-started'
				},
				{
					id: 8,
					title: 'Testing Suite',
					description: 'Develop unit tests, integration tests, and end-to-end testing scenarios',
					status: 'not-started'
				},
				{
					id: 9,
					title: 'Performance Optimization',
					description: 'Profile application performance, optimize database queries, and implement caching',
					status: 'not-started'
				},
				{
					id: 10,
					title: 'Security Implementation',
					description: 'Implement authentication, authorization, input validation, and security best practices',
					status: 'not-started'
				}
			];

			const invocation: IToolInvocation = {
				id: 'test-invocation',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'write',
					todoList: complexWorkflow
				},
				context: { sessionId: 'complex-workflow-session' }
			};

			const result = await tool.invoke(invocation, () => 0, () => {}, CancellationToken.None);

			assert.ok(result.content[0].value.includes('Successfully wrote todo list'), 'Should confirm successful creation');
			
			// Verify todos were stored
			const storedTodos = mockTodoListService.getTodos('complex-workflow-session');
			assert.strictEqual(storedTodos.length, 10, 'Should store all 10 workflow todos');
			
			// Verify structure preservation
			assert.strictEqual(storedTodos[2].title, 'Database Design', 'Should preserve todo titles');
			assert.strictEqual(storedTodos[2].status, 'in-progress', 'Should preserve todo statuses');
			assert.ok(storedTodos[2].description?.includes('normalized database schema'), 'Should preserve detailed descriptions');
		});

		test('validates todo list structure and provides warnings', async () => {
			// Test small todo list warning
			const smallTodoList: IChatTodo[] = [
				{ id: 1, title: 'Small task', description: 'A simple task', status: 'not-started' }
			];

			const smallListInvocation: IToolInvocation = {
				id: 'small-list-test',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'write',
					todoList: smallTodoList
				},
				context: { sessionId: 'small-list-session' }
			};

			const smallResult = await tool.invoke(smallListInvocation, () => 0, () => {}, CancellationToken.None);
			assert.ok(smallResult.content[0].value.includes('Warning: Small todo list'), 'Should warn about small todo list');

			// Test large todo list warning
			const largeTodoList: IChatTodo[] = Array.from({ length: 15 }, (_, i) => ({
				id: i + 1,
				title: `Task ${i + 1}`,
				description: `Description for task ${i + 1}`,
				status: 'not-started' as const
			}));

			const largeListInvocation: IToolInvocation = {
				id: 'large-list-test',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'write',
					todoList: largeTodoList
				},
				context: { sessionId: 'large-list-session' }
			};

			const largeResult = await tool.invoke(largeListInvocation, () => 0, () => {}, CancellationToken.None);
			assert.ok(largeResult.content[0].value.includes('Warning: Large todo list'), 'Should warn about large todo list');
		});

		test('supports agentic task breakdown and refinement', async () => {
			// Simulate AI agent breaking down a high-level task into specific todos
			const initialHighLevelTask = 'Implement user management system';
			
			const brokenDownTodos: IChatTodo[] = [
				{
					id: 1,
					title: 'Design user data model',
					description: 'Define User entity with fields: id, username, email, password_hash, created_at, last_login',
					status: 'not-started'
				},
				{
					id: 2,
					title: 'Implement user registration',
					description: 'Create /api/register endpoint with email validation, password strength requirements, and duplicate checking',
					status: 'not-started'
				},
				{
					id: 3,
					title: 'Implement user authentication',
					description: 'Create /api/login endpoint with JWT token generation and secure session management',
					status: 'not-started'
				},
				{
					id: 4,
					title: 'Add password reset functionality',
					description: 'Implement password reset via email with secure token generation and expiration',
					status: 'not-started'
				},
				{
					id: 5,
					title: 'Create user profile management',
					description: 'Allow users to view and update their profile information with proper validation',
					status: 'not-started'
				},
				{
					id: 6,
					title: 'Implement user role system',
					description: 'Add role-based access control with admin, moderator, and user roles',
					status: 'not-started'
				}
			];

			const invocation: IToolInvocation = {
				id: 'breakdown-test',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'write',
					todoList: brokenDownTodos
				},
				context: { sessionId: 'breakdown-session' }
			};

			const result = await tool.invoke(invocation, () => 0, () => {}, CancellationToken.None);
			assert.ok(result.content[0].value.includes('Successfully wrote todo list'), 'Should accept broken down tasks');

			// Verify task breakdown quality
			const todos = mockTodoListService.getTodos('breakdown-session');
			assert.strictEqual(todos.length, 6, 'Should have 6 specific tasks');
			
			// Each todo should have specific, actionable descriptions
			todos.forEach(todo => {
				assert.ok(todo.description && todo.description.length > 50, 'Each todo should have detailed description');
				assert.ok(todo.title.length <= 50, 'Titles should be concise');
			});
		});
	});

	suite('Real-time Progress Tracking (Test 3)', () => {
		test('read operation provides current progress state', async () => {
			// Set up initial todos
			const todos = createSampleTodos();
			mockTodoListService.setTodos('progress-session', todos);

			const readInvocation: IToolInvocation = {
				id: 'read-test',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'read'
				},
				context: { sessionId: 'progress-session' }
			};

			const result = await tool.invoke(readInvocation, () => 0, () => {}, CancellationToken.None);
			const content = result.content[0].value;

			// Should contain markdown task list format
			assert.ok(content.includes('# Todo List'), 'Should have todo list header');
			assert.ok(content.includes('[x]'), 'Should show completed tasks with [x]');
			assert.ok(content.includes('[-]'), 'Should show in-progress tasks with [-]');
			assert.ok(content.includes('[ ]'), 'Should show not-started tasks with [ ]');
			
			// Verify specific content
			assert.ok(content.includes('Set up project repository'), 'Should include todo titles');
			assert.ok(content.includes('Initialize Git repository'), 'Should include todo descriptions');
		});

		test('tracks progress updates efficiently', async () => {
			const todos = createSampleTodos();
			mockTodoListService.setTodos('tracking-session', todos);

			// Simulate progress update - mark task as completed
			const updatedTodos = [...todos];
			updatedTodos[1].status = 'completed'; // Database schema design completed

			const updateInvocation: IToolInvocation = {
				id: 'update-test',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'write',
					todoList: updatedTodos
				},
				context: { sessionId: 'tracking-session' }
			};

			const startTime = performance.now();
			const result = await tool.invoke(updateInvocation, () => 0, () => {}, CancellationToken.None);
			const endTime = performance.now();

			// Should be fast
			assert.ok(endTime - startTime < 100, 'Progress updates should be fast');
			assert.ok(result.content[0].value.includes('Successfully wrote todo list'), 'Should confirm update');

			// Verify state change
			const currentTodos = mockTodoListService.getTodos('tracking-session');
			const completedCount = currentTodos.filter(t => t.status === 'completed').length;
			assert.strictEqual(completedCount, 2, 'Should have 2 completed todos after update');
		});

		test('handles incremental progress tracking', async () => {
			const todos = createSampleTodos();
			mockTodoListService.setTodos('incremental-session', todos);

			// Simulate agent making incremental progress
			const progressSteps = [
				// Step 1: Start working on API endpoints
				{ todoId: 4, newStatus: 'in-progress' as const },
				// Step 2: Complete database design
				{ todoId: 2, newStatus: 'completed' as const },
				// Step 3: Complete API endpoints
				{ todoId: 4, newStatus: 'completed' as const },
				// Step 4: Start authentication work
				{ todoId: 3, newStatus: 'in-progress' as const }
			];

			for (const [index, step] of progressSteps.entries()) {
				const currentTodos = [...mockTodoListService.getTodos('incremental-session')];
				const todoIndex = currentTodos.findIndex(t => t.id === step.todoId);
				currentTodos[todoIndex].status = step.newStatus;

				const invocation: IToolInvocation = {
					id: `step-${index}`,
					toolId: 'manage_todo_list',
					parameters: {
						operation: 'write',
						todoList: currentTodos
					},
					context: { sessionId: 'incremental-session' }
				};

				const result = await tool.invoke(invocation, () => 0, () => {}, CancellationToken.None);
				assert.ok(result.content[0].value.includes('Successfully wrote todo list'), `Step ${index + 1} should succeed`);
			}

			// Verify final state
			const finalTodos = mockTodoListService.getTodos('incremental-session');
			const completedCount = finalTodos.filter(t => t.status === 'completed').length;
			const inProgressCount = finalTodos.filter(t => t.status === 'in-progress').length;
			
			assert.strictEqual(completedCount, 3, 'Should have 3 completed todos');
			assert.strictEqual(inProgressCount, 1, 'Should have 1 in-progress todo');
		});
	});

	suite('Session Management and Persistence (Test 4)', () => {
		test('maintains separate todo lists for different sessions', async () => {
			const sessionATodos = createSampleTodos();
			const sessionBTodos: IChatTodo[] = [
				{
					id: 1,
					title: 'Different project setup',
					description: 'Initialize a different type of project',
					status: 'not-started'
				}
			];

			// Write to session A
			const sessionAInvocation: IToolInvocation = {
				id: 'session-a-write',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'write',
					todoList: sessionATodos
				},
				context: { sessionId: 'session-a' }
			};

			await tool.invoke(sessionAInvocation, () => 0, () => {}, CancellationToken.None);

			// Write to session B
			const sessionBInvocation: IToolInvocation = {
				id: 'session-b-write',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'write',
					todoList: sessionBTodos
				},
				context: { sessionId: 'session-b' }
			};

			await tool.invoke(sessionBInvocation, () => 0, () => {}, CancellationToken.None);

			// Verify separation
			const sessionATodosStored = mockTodoListService.getTodos('session-a');
			const sessionBTodosStored = mockTodoListService.getTodos('session-b');

			assert.strictEqual(sessionATodosStored.length, 4, 'Session A should have 4 todos');
			assert.strictEqual(sessionBTodosStored.length, 1, 'Session B should have 1 todo');
			assert.notStrictEqual(sessionATodosStored[0].title, sessionBTodosStored[0].title, 'Sessions should have different todos');
		});

		test('handles session continuation and restoration', async () => {
			const todos = createSampleTodos();
			
			// Initial session setup
			const initialInvocation: IToolInvocation = {
				id: 'initial-write',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'write',
					todoList: todos
				},
				context: { sessionId: 'continuation-session' }
			};

			await tool.invoke(initialInvocation, () => 0, () => {}, CancellationToken.None);

			// Simulate session interruption and continuation by reading
			const readInvocation: IToolInvocation = {
				id: 'continuation-read',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'read'
				},
				context: { sessionId: 'continuation-session' }
			};

			const result = await tool.invoke(readInvocation, () => 0, () => {}, CancellationToken.None);
			
			// Should restore complete state
			assert.ok(result.content[0].value.includes('Set up project repository'), 'Should restore all todo titles');
			assert.ok(result.content[0].value.includes('[x]'), 'Should restore completion status');
			assert.ok(result.content[0].value.includes('[-]'), 'Should restore in-progress status');
		});

		test('handles default session fallback correctly', async () => {
			const todos = createSampleTodos();

			// Test with no session ID
			const noSessionInvocation: IToolInvocation = {
				id: 'no-session-test',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'write',
					todoList: todos
				}
				// No context.sessionId
			};

			const result = await tool.invoke(noSessionInvocation, () => 0, () => {}, CancellationToken.None);
			assert.ok(result.content[0].value.includes('Successfully wrote todo list'), 'Should handle missing session ID');

			// Should use default session
			const defaultTodos = mockTodoListService.getTodos('default');
			assert.strictEqual(defaultTodos.length, 4, 'Should store in default session');
		});
	});

	suite('Error Handling and Edge Cases', () => {
		test('handles malformed todo list gracefully', async () => {
			const invalidInvocation: IToolInvocation = {
				id: 'invalid-test',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'write'
					// Missing todoList
				},
				context: { sessionId: 'error-session' }
			};

			const result = await tool.invoke(invalidInvocation, () => 0, () => {}, CancellationToken.None);
			assert.ok(result.content[0].value.includes('Error: todoList is required'), 'Should handle missing todoList');
		});

		test('handles invalid operation parameter', async () => {
			const invalidOpInvocation: IToolInvocation = {
				id: 'invalid-op-test',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'invalid-operation',
					todoList: createSampleTodos()
				},
				context: { sessionId: 'error-session' }
			};

			const result = await tool.invoke(invalidOpInvocation, () => 0, () => {}, CancellationToken.None);
			assert.ok(result.content[0].value.includes('Error: Unknown operation'), 'Should handle invalid operation');
		});

		test('provides helpful feedback for empty todo lists', async () => {
			const readEmptyInvocation: IToolInvocation = {
				id: 'read-empty-test',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'read'
				},
				context: { sessionId: 'empty-session' }
			};

			const result = await tool.invoke(readEmptyInvocation, () => 0, () => {}, CancellationToken.None);
			assert.ok(result.content[0].value.includes('No todo list found'), 'Should handle empty todo lists gracefully');
		});
	});

	suite('Write-Only Mode Support', () => {
		test('write-only tool functions correctly', () => {
			const writeOnlyTool = store.add(new ManageTodoListTool(
				true, // write-only mode
				mockTodoListService,
				new NullLogService(),
				new NullTelemetryService()
			));

			// Should work with just todoList parameter
			const writeOnlyInvocation: IToolInvocation = {
				id: 'write-only-test',
				toolId: 'manage_todo_list',
				parameters: {
					todoList: createSampleTodos()
				},
				context: { sessionId: 'write-only-session' }
			};

			return writeOnlyTool.invoke(writeOnlyInvocation, () => 0, () => {}, CancellationToken.None).then(result => {
				assert.ok(result.content[0].value.includes('Successfully wrote todo list'), 'Write-only mode should work');

				const todos = mockTodoListService.getTodos('write-only-session');
				assert.strictEqual(todos.length, 4, 'Should store todos in write-only mode');
			});
		});

		test('write-only tool data has correct schema', () => {
			const writeOnlyToolData = createManageTodoListToolData(true);
			
			// Should require todoList
			assert.ok(writeOnlyToolData.inputSchema.required?.includes('todoList'), 'Should require todoList in write-only mode');
			
			// Should not have operation parameter
			assert.ok(!writeOnlyToolData.inputSchema.properties.operation, 'Should not have operation parameter in write-only mode');
		});
	});
});