/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatTodoListStorage, IChatTodo } from '../../common/chatTodoListService.js';
import { InMemoryStorageService } from '../../../../test/common/workbenchTestServices.js';

suite('ChatTodoListStorage - Persistence Test Plan', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let storage: ChatTodoListStorage;
	let storageService: InMemoryStorageService;

	const createTestTodos = (): IChatTodo[] => [
		{
			id: 1,
			title: 'Implement authentication',
			description: 'Add user login and registration with JWT tokens',
			status: 'completed'
		},
		{
			id: 2,
			title: 'Create database schema',
			description: 'Design and implement PostgreSQL database schema with proper relationships',
			status: 'in-progress'
		},
		{
			id: 3,
			title: 'Build API endpoints',
			description: 'Develop RESTful API endpoints for all core functionality',
			status: 'not-started'
		},
		{
			id: 4,
			title: 'Setup CI/CD pipeline',
			description: 'Configure automated testing and deployment using GitHub Actions',
			status: 'not-started'
		}
	];

	setup(() => {
		storageService = new InMemoryStorageService();
		storage = store.add(new ChatTodoListStorage(storageService));
	});

	suite('Test 4: Pinning and Persistence Across Sessions', () => {
		test('persists todos in workspace storage', () => {
			const sessionId = 'persistence-test-session';
			const todos = createTestTodos();

			// Store todos
			storage.setTodoList(sessionId, todos);

			// Retrieve todos
			const retrievedTodos = storage.getTodoList(sessionId);

			assert.strictEqual(retrievedTodos.length, 4, 'Should retrieve all stored todos');
			assert.strictEqual(retrievedTodos[0].title, 'Implement authentication', 'Should preserve todo titles');
			assert.strictEqual(retrievedTodos[1].status, 'in-progress', 'Should preserve todo statuses');
			assert.strictEqual(retrievedTodos[2].description, 'Develop RESTful API endpoints for all core functionality', 'Should preserve descriptions');
		});

		test('maintains separate storage for different sessions', () => {
			const sessionA = 'session-a';
			const sessionB = 'session-b';
			
			const todosA = createTestTodos();
			const todosB: IChatTodo[] = [
				{
					id: 1,
					title: 'Different project task',
					description: 'Task for a different project',
					status: 'not-started'
				}
			];

			// Store different todos for each session
			storage.setTodoList(sessionA, todosA);
			storage.setTodoList(sessionB, todosB);

			// Verify separation
			const retrievedA = storage.getTodoList(sessionA);
			const retrievedB = storage.getTodoList(sessionB);

			assert.strictEqual(retrievedA.length, 4, 'Session A should have 4 todos');
			assert.strictEqual(retrievedB.length, 1, 'Session B should have 1 todo');
			assert.notStrictEqual(retrievedA[0].title, retrievedB[0].title, 'Sessions should have different todos');
		});

		test('handles empty sessions gracefully', () => {
			const emptySession = 'empty-session';
			
			// Try to retrieve from non-existent session
			const retrievedTodos = storage.getTodoList(emptySession);
			
			assert.strictEqual(retrievedTodos.length, 0, 'Empty session should return empty array');
			assert.ok(Array.isArray(retrievedTodos), 'Should return array even for empty session');
		});

		test('updates existing session todos correctly', () => {
			const sessionId = 'update-test-session';
			const initialTodos = createTestTodos();

			// Store initial todos
			storage.setTodoList(sessionId, initialTodos);

			// Update todos - mark first as completed, add new todo
			const updatedTodos = [...initialTodos];
			updatedTodos[1].status = 'completed'; // Complete database schema
			updatedTodos.push({
				id: 5,
				title: 'Deploy to production',
				description: 'Deploy application to production environment with monitoring',
				status: 'not-started'
			});

			storage.setTodoList(sessionId, updatedTodos);

			// Verify updates
			const retrievedTodos = storage.getTodoList(sessionId);
			assert.strictEqual(retrievedTodos.length, 5, 'Should have 5 todos after update');
			assert.strictEqual(retrievedTodos[1].status, 'completed', 'Should update todo status');
			assert.strictEqual(retrievedTodos[4].title, 'Deploy to production', 'Should add new todo');
		});

		test('persists complex todo structures with all fields', () => {
			const sessionId = 'complex-structure-session';
			const complexTodos: IChatTodo[] = [
				{
					id: 1,
					title: 'Complex task with all fields',
					description: 'This is a very detailed description with multiple lines of text, special characters !@#$%^&*(), and numbers 12345. It includes implementation details, acceptance criteria, and technical requirements that need to be preserved exactly.',
					status: 'in-progress'
				},
				{
					id: 2,
					title: 'Task with minimal fields',
					status: 'not-started'
					// No description - testing optional field
				},
				{
					id: 999,
					title: 'Task with large ID',
					description: 'Testing with non-sequential ID',
					status: 'completed'
				}
			];

			storage.setTodoList(sessionId, complexTodos);
			const retrieved = storage.getTodoList(sessionId);

			// Verify complex field preservation
			assert.strictEqual(retrieved[0].description, complexTodos[0].description, 'Should preserve complex descriptions exactly');
			assert.strictEqual(retrieved[1].description, undefined, 'Should handle missing optional fields');
			assert.strictEqual(retrieved[2].id, 999, 'Should preserve large ID numbers');
		});

		test('handles rapid storage operations without data loss', () => {
			const sessionId = 'rapid-operations-session';
			const baseTodos = createTestTodos();

			// Perform rapid storage operations
			for (let i = 0; i < 20; i++) {
				const todos = [...baseTodos];
				todos[0].status = i % 2 === 0 ? 'completed' : 'in-progress';
				todos.push({
					id: 100 + i,
					title: `Rapid operation task ${i}`,
					description: `Task created during rapid operation ${i}`,
					status: 'not-started'
				});

				storage.setTodoList(sessionId, todos);
			}

			// Verify final state
			const finalTodos = storage.getTodoList(sessionId);
			assert.strictEqual(finalTodos.length, 24, 'Should have base todos plus 20 additional todos');
			assert.strictEqual(finalTodos[0].status, 'in-progress', 'Should have final status from last operation');
			assert.strictEqual(finalTodos[23].title, 'Rapid operation task 19', 'Should have last added todo');
		});

		test('storage survives service recreation (simulated restart)', () => {
			const sessionId = 'restart-simulation-session';
			const todos = createTestTodos();

			// Store todos with first storage instance
			storage.setTodoList(sessionId, todos);

			// Create new storage instance (simulating restart)
			const newStorage = new ChatTodoListStorage(storageService);

			// Should retrieve todos from persistent storage
			const retrievedTodos = newStorage.getTodoList(sessionId);
			assert.strictEqual(retrievedTodos.length, 4, 'Should retrieve todos after restart simulation');
			assert.strictEqual(retrievedTodos[0].title, 'Implement authentication', 'Should preserve todo data after restart');
		});

		test('handles storage with many concurrent sessions', () => {
			const sessionCount = 50;
			const sessionsData: { [key: string]: IChatTodo[] } = {};

			// Create many sessions with different todo data
			for (let i = 0; i < sessionCount; i++) {
				const sessionId = `concurrent-session-${i}`;
				const todos: IChatTodo[] = [
					{
						id: 1,
						title: `Session ${i} primary task`,
						description: `Main task for session ${i}`,
						status: i % 3 === 0 ? 'completed' : i % 3 === 1 ? 'in-progress' : 'not-started'
					},
					{
						id: 2,
						title: `Session ${i} secondary task`,
						description: `Secondary task for session ${i}`,
						status: 'not-started'
					}
				];

				sessionsData[sessionId] = todos;
				storage.setTodoList(sessionId, todos);
			}

			// Verify all sessions maintained separate data
			for (let i = 0; i < sessionCount; i++) {
				const sessionId = `concurrent-session-${i}`;
				const retrieved = storage.getTodoList(sessionId);
				const expected = sessionsData[sessionId];

				assert.strictEqual(retrieved.length, 2, `Session ${i} should have 2 todos`);
				assert.strictEqual(retrieved[0].title, expected[0].title, `Session ${i} should have correct title`);
				assert.strictEqual(retrieved[0].status, expected[0].status, `Session ${i} should have correct status`);
			}
		});

		test('clears session data when setting empty array', () => {
			const sessionId = 'clear-test-session';
			const todos = createTestTodos();

			// Store initial todos
			storage.setTodoList(sessionId, todos);
			assert.strictEqual(storage.getTodoList(sessionId).length, 4, 'Should have initial todos');

			// Clear todos by setting empty array
			storage.setTodoList(sessionId, []);
			assert.strictEqual(storage.getTodoList(sessionId).length, 0, 'Should clear all todos');

			// Should remain cleared
			assert.strictEqual(storage.getTodoList(sessionId).length, 0, 'Should remain cleared on subsequent reads');
		});

		test('preserves todo object references correctly', () => {
			const sessionId = 'reference-test-session';
			const todos = createTestTodos();

			storage.setTodoList(sessionId, todos);
			const retrieved = storage.getTodoList(sessionId);

			// Should be deep copies, not same references
			assert.notStrictEqual(retrieved, todos, 'Should not return same array reference');
			assert.notStrictEqual(retrieved[0], todos[0], 'Should not return same object references');

			// But should have same values
			assert.deepStrictEqual(retrieved[0], todos[0], 'Should have same values');

			// Modifying retrieved should not affect original
			retrieved[0].title = 'Modified title';
			const freshRetrieval = storage.getTodoList(sessionId);
			assert.notStrictEqual(freshRetrieval[0].title, 'Modified title', 'Modifications should not affect stored data');
		});
	});

	suite('Storage Performance and Edge Cases', () => {
		test('handles large individual descriptions', () => {
			const sessionId = 'large-description-session';
			const largeDescription = 'This is a very large description. '.repeat(1000); // ~35KB of text

			const todos: IChatTodo[] = [
				{
					id: 1,
					title: 'Task with large description',
					description: largeDescription,
					status: 'not-started'
				}
			];

			storage.setTodoList(sessionId, todos);
			const retrieved = storage.getTodoList(sessionId);

			assert.strictEqual(retrieved[0].description, largeDescription, 'Should handle large descriptions');
		});

		test('handles Unicode and special characters', () => {
			const sessionId = 'unicode-test-session';
			const unicodeTodos: IChatTodo[] = [
				{
					id: 1,
					title: '🚀 Deploy to 生产环境',
					description: 'Task with emojis 🎯 and Chinese characters 中文测试 and symbols ©®™',
					status: 'not-started'
				},
				{
					id: 2,
					title: 'Test with quotes "double" and \'single\' and backslashes \\',
					description: 'JSON special chars: {"key": "value", "array": [1, 2, 3]}',
					status: 'in-progress'
				}
			];

			storage.setTodoList(sessionId, unicodeTodos);
			const retrieved = storage.getTodoList(sessionId);

			assert.strictEqual(retrieved[0].title, '🚀 Deploy to 生产环境', 'Should preserve Unicode characters');
			assert.strictEqual(retrieved[1].description, 'JSON special chars: {"key": "value", "array": [1, 2, 3]}', 'Should preserve JSON-like strings');
		});

		test('performance with frequent read/write operations', () => {
			const sessionId = 'performance-test-session';
			const todos = createTestTodos();

			const startTime = performance.now();

			// Perform many read/write operations
			for (let i = 0; i < 100; i++) {
				storage.setTodoList(sessionId, todos);
				storage.getTodoList(sessionId);
			}

			const endTime = performance.now();
			const duration = endTime - startTime;

			// Should complete within reasonable time
			assert.ok(duration < 1000, `Performance test should complete quickly, took ${duration}ms`);
		});
	});
});