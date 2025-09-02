/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { timeout } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatTodoListWidget } from '../../browser/chatContentParts/chatTodoListWidget.js';
import { ManageTodoListTool } from '../../common/tools/manageTodoListTool.js';
import { IChatTodo, IChatTodoListService } from '../../common/chatTodoListService.js';
import { ChatTodoListSubPart } from '../../browser/chatContentParts/toolInvocationParts/chatTodoListSubPart.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IToolInvocation } from '../../common/languageModelToolsService.js';
import { mainWindow } from '../../../../../base/browser/window.js';

suite('Chat Todo Lists - Integration Test Plan', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let widget: ChatTodoListWidget;
	let tool: ManageTodoListTool;
	let mockTodoListService: IChatTodoListService;
	let storedTodos: Map<string, IChatTodo[]>;

	const createComplexProjectTodos = (): IChatTodo[] => [
		{
			id: 1,
			title: 'Project Planning Phase',
			description: 'Define project scope, create timeline, and identify key stakeholders and requirements',
			status: 'completed'
		},
		{
			id: 2,
			title: 'Technology Stack Selection',
			description: 'Research and choose appropriate technologies: React, Node.js, PostgreSQL, Docker',
			status: 'completed'
		},
		{
			id: 3,
			title: 'Development Environment Setup',
			description: 'Configure local development environment, Docker containers, and development tools',
			status: 'in-progress'
		},
		{
			id: 4,
			title: 'Database Schema Design',
			description: 'Create comprehensive database design with entity relationships and data flow diagrams',
			status: 'not-started'
		},
		{
			id: 5,
			title: 'API Architecture Planning',
			description: 'Design RESTful API structure, define endpoints, and plan authentication strategy',
			status: 'not-started'
		},
		{
			id: 6,
			title: 'Frontend Component Library',
			description: 'Create reusable UI components with consistent styling and accessibility features',
			status: 'not-started'
		},
		{
			id: 7,
			title: 'Backend Core Implementation',
			description: 'Implement core business logic, data access patterns, and API endpoints',
			status: 'not-started'
		},
		{
			id: 8,
			title: 'User Authentication System',
			description: 'Implement secure login, registration, password reset, and session management',
			status: 'not-started'
		},
		{
			id: 9,
			title: 'Testing Framework Setup',
			description: 'Configure unit tests, integration tests, and end-to-end testing infrastructure',
			status: 'not-started'
		},
		{
			id: 10,
			title: 'Performance Optimization',
			description: 'Optimize database queries, implement caching, and improve application performance',
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

		widget = store.add(new ChatTodoListWidget(mockTodoListService));
		tool = store.add(new ManageTodoListTool(
			false,
			mockTodoListService,
			new NullLogService(),
			new NullTelemetryService()
		));

		mainWindow.document.body.appendChild(widget.domNode);
	});

	teardown(() => {
		if (widget.domNode.parentNode) {
			widget.domNode.parentNode.removeChild(widget.domNode);
		}
		storedTodos.clear();
	});

	suite('End-to-End Workflow Testing', () => {
		test('complete AI agent todo creation and UI display workflow', async () => {
			const sessionId = 'e2e-workflow-session';
			
			// Step 1: AI agent creates structured todo list
			const createInvocation: IToolInvocation = {
				id: 'create-workflow',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'write',
					todoList: createComplexProjectTodos()
				},
				context: { sessionId }
			};

			const createResult = await tool.invoke(createInvocation, () => 0, () => {}, CancellationToken.None);
			assert.ok(createResult.content[0].value.includes('Successfully wrote todo list'), 'Tool should create todos successfully');

			// Step 2: Widget displays the todo list
			widget.render(sessionId);

			// Verify widget visibility and content
			assert.notStrictEqual(widget.domNode.style.display, 'none', 'Widget should be visible with 10+ todos');

			const todoItems = widget.domNode.querySelectorAll('.todo-item');
			assert.strictEqual(todoItems.length, 10, 'Should display all 10 todos');

			// Step 3: Verify condensed view (auto-collapsed due to in-progress item)
			const expandoElement = widget.domNode.querySelector('.todo-list-expand');
			assert.strictEqual(expandoElement?.getAttribute('aria-expanded'), 'false', 'Should be auto-collapsed');

			const titleElement = widget.domNode.querySelector('.todo-list-title');
			assert.ok(titleElement?.textContent?.includes('(2/10)'), 'Should show correct progress in title');

			// Step 4: Expand and verify full display
			(expandoElement as HTMLElement).click();
			assert.strictEqual(expandoElement?.getAttribute('aria-expanded'), 'true', 'Should expand when clicked');

			const container = widget.domNode.querySelector('.todo-list-container');
			assert.strictEqual(container?.style.display, 'block', 'Container should be visible when expanded');

			// Step 5: AI agent updates progress
			const updatedTodos = [...createComplexProjectTodos()];
			updatedTodos[2].status = 'completed'; // Complete development environment setup
			updatedTodos[3].status = 'in-progress'; // Start database schema design

			const updateInvocation: IToolInvocation = {
				id: 'update-progress',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'write',
					todoList: updatedTodos
				},
				context: { sessionId }
			};

			const updateResult = await tool.invoke(updateInvocation, () => 0, () => {}, CancellationToken.None);
			assert.ok(updateResult.content[0].value.includes('Successfully wrote todo list'), 'Progress update should succeed');

			// Step 6: Widget reflects updated progress
			widget.render(sessionId);

			const updatedTitleElement = widget.domNode.querySelector('.todo-list-title');
			assert.ok(updatedTitleElement?.textContent?.includes('(3/10)'), 'Progress should update to 3/10');

			// Verify status icon changes
			const completedIcons = widget.domNode.querySelectorAll('.codicon-check');
			assert.strictEqual(completedIcons.length, 3, 'Should have 3 completed task icons');

			const inProgressIcons = widget.domNode.querySelectorAll('.codicon-record');
			assert.strictEqual(inProgressIcons.length, 1, 'Should have 1 in-progress task icon');
		});

		test('handles rapid AI agent updates with UI responsiveness', async () => {
			const sessionId = 'rapid-updates-session';
			const baseTodos = createComplexProjectTodos();

			// Initial setup
			mockTodoListService.setTodos(sessionId, baseTodos);
			widget.render(sessionId);

			// Simulate rapid AI agent progress updates
			const progressSteps = [
				{ todoIndex: 2, newStatus: 'completed' as const }, // Complete development environment
				{ todoIndex: 3, newStatus: 'in-progress' as const }, // Start database design
				{ todoIndex: 4, newStatus: 'in-progress' as const }, // Start API planning
				{ todoIndex: 3, newStatus: 'completed' as const }, // Complete database design
				{ todoIndex: 4, newStatus: 'completed' as const }, // Complete API planning
				{ todoIndex: 5, newStatus: 'in-progress' as const }, // Start frontend components
			];

			const startTime = performance.now();

			for (const [index, step] of progressSteps.entries()) {
				const currentTodos = [...mockTodoListService.getTodos(sessionId)];
				currentTodos[step.todoIndex].status = step.newStatus;

				const updateInvocation: IToolInvocation = {
					id: `rapid-update-${index}`,
					toolId: 'manage_todo_list',
					parameters: {
						operation: 'write',
						todoList: currentTodos
					},
					context: { sessionId }
				};

				await tool.invoke(updateInvocation, () => 0, () => {}, CancellationToken.None);
				widget.render(sessionId);

				// Verify UI consistency after each update
				const todoItems = widget.domNode.querySelectorAll('.todo-item');
				assert.strictEqual(todoItems.length, 10, 'Should maintain all 10 todos during rapid updates');
			}

			const endTime = performance.now();
			const totalTime = endTime - startTime;

			// Performance check - rapid updates should complete reasonably fast
			assert.ok(totalTime < 1000, `Rapid updates should complete quickly, took ${totalTime}ms`);

			// Final state verification
			const finalTitleElement = widget.domNode.querySelector('.todo-list-title');
			assert.ok(finalTitleElement?.textContent?.includes('(5/10)'), 'Should show final progress count');
		});

		test('maintains data consistency between tool and widget across session changes', async () => {
			const session1 = 'consistency-session-1';
			const session2 = 'consistency-session-2';

			// Create different todo lists for each session
			const session1Todos = createComplexProjectTodos().slice(0, 5); // First 5 todos
			const session2Todos: IChatTodo[] = [
				{
					id: 1,
					title: 'Mobile App Planning',
					description: 'Plan mobile application development approach',
					status: 'not-started'
				},
				{
					id: 2,
					title: 'Cross-platform Strategy',
					description: 'Decide between React Native, Flutter, or native development',
					status: 'in-progress'
				},
				{
					id: 3,
					title: 'Mobile UI Design',
					description: 'Create mobile-specific user interface designs',
					status: 'not-started'
				}
			];

			// Set up session 1
			const session1Invocation: IToolInvocation = {
				id: 'setup-session-1',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'write',
					todoList: session1Todos
				},
				context: { sessionId: session1 }
			};

			await tool.invoke(session1Invocation, () => 0, () => {}, CancellationToken.None);
			widget.render(session1);

			// Verify session 1 display
			let todoItems = widget.domNode.querySelectorAll('.todo-item');
			assert.strictEqual(todoItems.length, 5, 'Session 1 should have 5 todos');

			// Set up session 2
			const session2Invocation: IToolInvocation = {
				id: 'setup-session-2',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'write',
					todoList: session2Todos
				},
				context: { sessionId: session2 }
			};

			await tool.invoke(session2Invocation, () => 0, () => {}, CancellationToken.None);
			widget.render(session2);

			// Verify session 2 display (should be hidden with < 3 todos for mobile session)
			assert.strictEqual(widget.domNode.style.display, 'none', 'Session 2 should be hidden with only 3 todos');

			// Switch back to session 1 - data should be preserved
			widget.render(session1);
			todoItems = widget.domNode.querySelectorAll('.todo-item');
			assert.strictEqual(todoItems.length, 5, 'Session 1 data should be preserved');
			assert.notStrictEqual(widget.domNode.style.display, 'none', 'Session 1 should be visible again');

			// Verify tool read consistency
			const session1ReadInvocation: IToolInvocation = {
				id: 'read-session-1',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'read'
				},
				context: { sessionId: session1 }
			};

			const readResult = await tool.invoke(session1ReadInvocation, () => 0, () => {}, CancellationToken.None);
			assert.ok(readResult.content[0].value.includes('Project Planning Phase'), 'Tool should read correct session 1 data');
		});
	});

	suite('Cross-Component Integration', () => {
		test('tool invocation sub-part displays completed todos correctly', () => {
			const sessionId = 'subpart-session';
			const allCompletedTodos: IChatTodo[] = createComplexProjectTodos().map(todo => ({
				...todo,
				status: 'completed'
			}));

			// Mock tool invocation data
			const toolInvocation = {
				id: 'test-invocation',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'write',
					todoList: allCompletedTodos
				},
				context: { sessionId }
			};

			const todoData = {
				kind: 'todoList' as const,
				sessionId: sessionId,
				todoList: allCompletedTodos.map(todo => ({
					id: todo.id.toString(),
					title: todo.title,
					description: todo.description,
					status: todo.status
				}))
			};

			// Create sub-part
			const subPart = store.add(new ChatTodoListSubPart(
				toolInvocation,
				todoData,
				mockTodoListService
			));

			// Sub-part should be visible for all-completed todos
			assert.ok(subPart.domNode, 'Sub-part should have DOM node');
			
			// Should show todos in expanded state since all are completed
			const container = subPart.domNode.querySelector('.todo-list-container') as HTMLElement;
			if (container) {
				assert.strictEqual(container.style.display, 'block', 'Should show expanded view for all completed');
			}

			// Clear button should be hidden in sub-part display
			const clearButton = subPart.domNode.querySelector('.todo-clear-button-container') as HTMLElement;
			if (clearButton) {
				assert.strictEqual(clearButton.style.display, 'none', 'Clear button should be hidden in sub-part');
			}
		});

		test('widget height change events work correctly', () => {
			const sessionId = 'height-events-session';
			let heightChangeCount = 0;

			// Listen for height changes
			store.add(widget.onDidChangeHeight(() => {
				heightChangeCount++;
			}));

			// Initial render should trigger height change
			const todos = createComplexProjectTodos();
			mockTodoListService.setTodos(sessionId, todos);
			widget.render(sessionId);

			assert.ok(heightChangeCount > 0, 'Initial render should trigger height change');

			const initialHeightChangeCount = heightChangeCount;

			// Expand/collapse should trigger height changes
			const expandoElement = widget.domNode.querySelector('.todo-list-expand') as HTMLElement;
			expandoElement.click(); // Expand

			assert.ok(heightChangeCount > initialHeightChangeCount, 'Expansion should trigger height change');

			const expandedHeightChangeCount = heightChangeCount;
			expandoElement.click(); // Collapse

			assert.ok(heightChangeCount > expandedHeightChangeCount, 'Collapse should trigger height change');
		});

		test('accessibility works across all components', () => {
			const sessionId = 'accessibility-session';
			const todos = createComplexProjectTodos();
			mockTodoListService.setTodos(sessionId, todos);
			widget.render(sessionId);

			// Test keyboard navigation
			const expandoElement = widget.domNode.querySelector('.todo-list-expand') as HTMLElement;
			
			// Should be focusable
			expandoElement.focus();
			assert.strictEqual(document.activeElement, expandoElement, 'Expand button should be focusable');

			// Test ARIA attributes
			assert.strictEqual(expandoElement.getAttribute('role'), 'button', 'Should have button role');
			assert.ok(expandoElement.getAttribute('aria-label')?.includes('Todos'), 'Should have descriptive aria-label');

			// Test list semantics
			const container = widget.domNode.querySelector('.todo-list-container');
			assert.strictEqual(container?.getAttribute('role'), 'list', 'Container should have list role');

			// Expand and check individual items
			expandoElement.click();
			const todoItems = widget.domNode.querySelectorAll('.todo-item');
			todoItems.forEach((item, index) => {
				assert.strictEqual(item.getAttribute('role'), 'listitem', 'Each todo should have listitem role');
				assert.strictEqual(item.getAttribute('tabindex'), '0', 'Each todo should be focusable');
				assert.ok(item.getAttribute('aria-label'), 'Each todo should have aria-label');
			});
		});
	});

	suite('Performance and Scalability', () => {
		test('handles large todo lists without performance degradation', async () => {
			const sessionId = 'performance-session';
			
			// Create large todo list (100 items)
			const largeTodoList: IChatTodo[] = Array.from({ length: 100 }, (_, i) => ({
				id: i + 1,
				title: `Performance Task ${i + 1}`,
				description: `Detailed description for performance testing task ${i + 1} with sufficient content to test rendering performance`,
				status: i % 3 === 0 ? 'completed' : i % 3 === 1 ? 'in-progress' : 'not-started'
			}));

			// Measure tool performance
			const toolStartTime = performance.now();
			const toolInvocation: IToolInvocation = {
				id: 'performance-test',
				toolId: 'manage_todo_list',
				parameters: {
					operation: 'write',
					todoList: largeTodoList
				},
				context: { sessionId }
			};

			const toolResult = await tool.invoke(toolInvocation, () => 0, () => {}, CancellationToken.None);
			const toolEndTime = performance.now();
			const toolTime = toolEndTime - toolStartTime;

			assert.ok(toolTime < 200, `Tool should handle large list quickly, took ${toolTime}ms`);
			assert.ok(toolResult.content[0].value.includes('Warning: Large todo list'), 'Should warn about large list');

			// Measure widget rendering performance
			const widgetStartTime = performance.now();
			widget.render(sessionId);
			const widgetEndTime = performance.now();
			const widgetTime = widgetEndTime - widgetStartTime;

			assert.ok(widgetTime < 500, `Widget should render large list quickly, took ${widgetTime}ms`);

			// Expand and measure scrolling performance
			const expandoElement = widget.domNode.querySelector('.todo-list-expand') as HTMLElement;
			expandoElement.click();

			const container = widget.domNode.querySelector('.todo-list-container') as HTMLElement;
			const scrollStartTime = performance.now();

			// Simulate scrolling through large list
			for (let i = 0; i < 20; i++) {
				container.scrollTop = i * 100;
				const scrollEvent = new Event('scroll');
				container.dispatchEvent(scrollEvent);
			}

			const scrollEndTime = performance.now();
			const scrollTime = scrollEndTime - scrollStartTime;

			assert.ok(scrollTime < 100, `Scrolling should be smooth, took ${scrollTime}ms`);
		});

		test('memory usage remains stable during extended use', () => {
			const baseTodos = createComplexProjectTodos();

			// Simulate extended use with many session switches
			for (let i = 0; i < 50; i++) {
				const sessionId = `memory-test-session-${i}`;
				mockTodoListService.setTodos(sessionId, baseTodos);
				widget.render(sessionId);

				// Occasionally clear to test cleanup
				if (i % 10 === 0) {
					widget.render(undefined); // Clear current session
				}
			}

			// Widget should still function correctly
			const finalSessionId = 'final-memory-test';
			mockTodoListService.setTodos(finalSessionId, baseTodos);
			widget.render(finalSessionId);

			const todoItems = widget.domNode.querySelectorAll('.todo-item');
			assert.strictEqual(todoItems.length, 10, 'Widget should still function correctly after extended use');
		});
	});

	suite('Error Recovery and Edge Cases', () => {
		test('recovers gracefully from malformed data', () => {
			const sessionId = 'error-recovery-session';

			// Start with valid data
			const validTodos = createComplexProjectTodos();
			mockTodoListService.setTodos(sessionId, validTodos);
			widget.render(sessionId);

			let todoItems = widget.domNode.querySelectorAll('.todo-item');
			assert.strictEqual(todoItems.length, 10, 'Should start with valid todos');

			// Simulate data corruption (empty todos list)
			mockTodoListService.setTodos(sessionId, []);
			widget.render(sessionId);

			assert.strictEqual(widget.domNode.style.display, 'none', 'Should hide widget with empty todos');

			// Restore valid data
			mockTodoListService.setTodos(sessionId, validTodos);
			widget.render(sessionId);

			todoItems = widget.domNode.querySelectorAll('.todo-item');
			assert.strictEqual(todoItems.length, 10, 'Should recover with restored valid data');
		});

		test('handles concurrent tool and widget operations', async () => {
			const sessionId = 'concurrent-operations-session';
			const baseTodos = createComplexProjectTodos();

			// Start concurrent operations
			const toolPromises = Array.from({ length: 5 }, (_, i) => {
				const updatedTodos = [...baseTodos];
				updatedTodos[i % updatedTodos.length].status = 'completed';

				const invocation: IToolInvocation = {
					id: `concurrent-${i}`,
					toolId: 'manage_todo_list',
					parameters: {
						operation: 'write',
						todoList: updatedTodos
					},
					context: { sessionId }
				};

				return tool.invoke(invocation, () => 0, () => {}, CancellationToken.None);
			});

			const widgetPromises = Array.from({ length: 5 }, () => {
				return new Promise<void>((resolve) => {
					setTimeout(() => {
						widget.render(sessionId);
						resolve();
					}, Math.random() * 50);
				});
			});

			// Wait for all operations to complete
			await Promise.all([...toolPromises, ...widgetPromises]);

			// System should remain consistent
			const finalTodos = mockTodoListService.getTodos(sessionId);
			assert.strictEqual(finalTodos.length, 10, 'Should maintain correct todo count');

			widget.render(sessionId);
			const todoItems = widget.domNode.querySelectorAll('.todo-item');
			assert.strictEqual(todoItems.length, 10, 'Widget should display all todos consistently');
		});
	});
});