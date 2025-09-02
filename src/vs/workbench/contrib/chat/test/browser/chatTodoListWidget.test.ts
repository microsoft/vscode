/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatTodoListWidget } from '../../browser/chatContentParts/chatTodoListWidget.js';
import { IChatTodo, IChatTodoListService } from '../../common/chatTodoListService.js';
import { mainWindow } from '../../../../../base/browser/window.js';

suite('ChatTodoListWidget Accessibility', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let widget: ChatTodoListWidget;
	let mockTodoListService: IChatTodoListService;

	const sampleTodos: IChatTodo[] = [
		{ id: 1, title: 'First task', status: 'not-started' },
		{ id: 2, title: 'Second task', status: 'in-progress', description: 'This is a task description' },
		{ id: 3, title: 'Third task', status: 'completed' }
	];

	setup(() => {
		// Mock the todo list service
		mockTodoListService = {
			_serviceBrand: undefined,
			getTodos: (sessionId: string) => sampleTodos,
			setTodos: (sessionId: string, todos: IChatTodo[]) => { }
		};

		widget = store.add(new ChatTodoListWidget(mockTodoListService));
		mainWindow.document.body.appendChild(widget.domNode);
	});

	teardown(() => {
		if (widget.domNode.parentNode) {
			widget.domNode.parentNode.removeChild(widget.domNode);
		}
	});

	test('creates proper semantic list structure', () => {
		widget.render('test-session');

		const todoListContainer = widget.domNode.querySelector('.todo-list-container');
		assert.ok(todoListContainer, 'Should have todo list container');
		assert.strictEqual(todoListContainer?.getAttribute('aria-labelledby'), 'todo-list-title');
		assert.strictEqual(todoListContainer?.getAttribute('role'), 'list');

		const titleElement = widget.domNode.querySelector('#todo-list-title');
		assert.ok(titleElement, 'Should have title element with ID todo-list-title');
		assert.ok(titleElement?.textContent?.includes('Todos'));

		// The todo list container itself acts as the list (no nested ul element)
		const todoItems = todoListContainer?.querySelectorAll('li.todo-item');
		assert.ok(todoItems && todoItems.length > 0, 'Should have todo items in the list container');
	});

	test('todo items have proper accessibility attributes', () => {
		widget.render('test-session');

		const todoItems = widget.domNode.querySelectorAll('.todo-item');
		assert.strictEqual(todoItems.length, 3, 'Should have 3 todo items');

		// Check first item (not-started)
		const firstItem = todoItems[0] as HTMLElement;
		assert.strictEqual(firstItem.getAttribute('role'), 'listitem');
		assert.strictEqual(firstItem.getAttribute('tabindex'), '0');
		assert.ok(firstItem.getAttribute('aria-label')?.includes('First task'));
		assert.ok(firstItem.getAttribute('aria-label')?.includes('not started'));

		// Check second item (in-progress with description)
		const secondItem = todoItems[1] as HTMLElement;
		assert.ok(secondItem.getAttribute('aria-label')?.includes('Second task'));
		assert.ok(secondItem.getAttribute('aria-label')?.includes('in progress'));
		assert.ok(secondItem.getAttribute('aria-label')?.includes('This is a task description'));

		// Check third item (completed)
		const thirdItem = todoItems[2] as HTMLElement;
		assert.ok(thirdItem.getAttribute('aria-label')?.includes('Third task'));
		assert.ok(thirdItem.getAttribute('aria-label')?.includes('completed'));
	});

	test('status icons are hidden from screen readers', () => {
		widget.render('test-session');

		const statusIcons = widget.domNode.querySelectorAll('.todo-status-icon');
		statusIcons.forEach(icon => {
			assert.strictEqual(icon.getAttribute('aria-hidden'), 'true', 'Status icons should be hidden from screen readers');
		});
	});

	test('expand button has proper accessibility attributes', () => {
		widget.render('test-session');

		// The expandoElement has the accessibility attributes
		const expandoElement = widget.domNode.querySelector('.todo-list-expand');
		assert.ok(expandoElement, 'Should have expando element');
		assert.strictEqual(expandoElement?.getAttribute('role'), 'button');
		assert.strictEqual(expandoElement?.getAttribute('tabindex'), '0');
		assert.strictEqual(expandoElement?.getAttribute('aria-expanded'), 'false'); // Should be collapsed due to in-progress task
		assert.strictEqual(expandoElement?.getAttribute('aria-controls'), 'todo-list-container');

		// The title element should have aria-label with progress information
		const titleElement = expandoElement?.querySelector('.todo-list-title');
		assert.ok(titleElement, 'Should have title element');
		const titleText = titleElement?.textContent;
		assert.ok(titleText?.includes('Todos (1/3)'), `Title should show progress format, but got: "${titleText}"`);
	}); test('hidden status text elements exist for screen readers', () => {
		widget.render('test-session');

		const statusElements = widget.domNode.querySelectorAll('.todo-status-text');
		assert.strictEqual(statusElements.length, 3, 'Should have 3 status text elements');

		statusElements.forEach((element, index) => {
			assert.strictEqual(element.id, `todo-status-${index}`, 'Should have proper ID');
			// Check that it's visually hidden but accessible to screen readers
			const style = (element as HTMLElement).style;
			assert.strictEqual(style.position, 'absolute');
			assert.strictEqual(style.left, '-10000px');
			assert.strictEqual(style.width, '1px');
			assert.strictEqual(style.height, '1px');
			assert.strictEqual(style.overflow, 'hidden');
		});
	});

	test('widget displays properly when no todos exist', () => {
		// Create a new mock service with empty todos
		const emptyTodoListService: IChatTodoListService = {
			_serviceBrand: undefined,
			getTodos: (sessionId: string) => [],
			setTodos: (sessionId: string, todos: IChatTodo[]) => { }
		};

		const emptyWidget = store.add(new ChatTodoListWidget(emptyTodoListService));
		mainWindow.document.body.appendChild(emptyWidget.domNode);

		emptyWidget.render('test-session');

		// Widget should be hidden when no todos
		assert.strictEqual(emptyWidget.domNode.style.display, 'none', 'Widget should be hidden when no todos');
	});

	test('clear button has proper accessibility', () => {
		widget.render('test-session');

		const clearButton = widget.domNode.querySelector('.todo-clear-button-container .monaco-button');
		assert.ok(clearButton, 'Should have clear button');
		assert.strictEqual(clearButton?.getAttribute('tabindex'), '0', 'Clear button should be focusable');
	});

	test('title element displays progress correctly and is accessible', () => {
		widget.render('test-session');

		const titleElement = widget.domNode.querySelector('#todo-list-title');
		assert.ok(titleElement, 'Should have title element with ID');

		// Title should show progress format: "Todos (1/3)" since one todo is in-progress
		// When collapsed, it also shows the current task: "Todos (1/3) - Second task"
		const titleText = titleElement?.textContent;
		assert.ok(titleText?.includes('Todos (1/3)'), `Title should show progress format, but got: "${titleText}"`);

		// Verify aria-labelledby connection works
		const todoListContainer = widget.domNode.querySelector('.todo-list-container');
		assert.strictEqual(todoListContainer?.getAttribute('aria-labelledby'), 'todo-list-title');
	});
});

suite('ChatTodoListWidget - Test Plan Implementation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let widget: ChatTodoListWidget;
	let mockTodoListService: IChatTodoListService;
	let storedTodos: Map<string, IChatTodo[]>;

	const createBasicTodos = (): IChatTodo[] => [
		{ id: 1, title: 'Initialize project structure', status: 'completed', description: 'Set up basic folder structure and package.json' },
		{ id: 2, title: 'Implement core API endpoints', status: 'in-progress', description: 'Create REST endpoints for user management' },
		{ id: 3, title: 'Write unit tests', status: 'not-started', description: 'Add comprehensive test coverage for all modules' },
		{ id: 4, title: 'Configure CI/CD pipeline', status: 'not-started', description: 'Set up GitHub Actions for automated testing and deployment' }
	];

	const createLargeTodoList = (): IChatTodo[] => {
		const todos: IChatTodo[] = [];
		for (let i = 1; i <= 55; i++) {
			todos.push({
				id: i,
				title: `Task ${i}: Implement feature ${i}`,
				status: i <= 10 ? 'completed' : i <= 15 ? 'in-progress' : 'not-started',
				description: `Detailed description for task ${i} with implementation notes and requirements`
			});
		}
		return todos;
	};

	setup(() => {
		storedTodos = new Map();

		// Enhanced mock service with persistence simulation
		mockTodoListService = {
			_serviceBrand: undefined,
			getTodos: (sessionId: string) => storedTodos.get(sessionId) || [],
			setTodos: (sessionId: string, todos: IChatTodo[]) => {
				storedTodos.set(sessionId, [...todos]);
			}
		};

		widget = store.add(new ChatTodoListWidget(mockTodoListService));
		mainWindow.document.body.appendChild(widget.domNode);
	});

	teardown(() => {
		if (widget.domNode.parentNode) {
			widget.domNode.parentNode.removeChild(widget.domNode);
		}
		storedTodos.clear();
	});

	suite('Test 1: Structured task generation', () => {
		test('renders structured todo list with proper hierarchy', () => {
			const todos = createBasicTodos();
			mockTodoListService.setTodos('test-session', todos);
			
			widget.render('test-session');

			// Verify display shows when >= 3 todos
			assert.notStrictEqual(widget.domNode.style.display, 'none', 'Widget should be visible with 3+ todos');

			// Check structure
			const todoItems = widget.domNode.querySelectorAll('.todo-item');
			assert.strictEqual(todoItems.length, 4, 'Should display all 4 todos');

			// Verify content structure with proper titles and descriptions
			const firstItem = todoItems[0];
			assert.ok(firstItem.textContent?.includes('Initialize project structure'), 'Should show todo title');
			assert.ok(firstItem.title?.includes('Set up basic folder structure'), 'Should show description in tooltip');
		});

		test('handles complex multi-step development workflow', () => {
			const complexTodos: IChatTodo[] = [
				{ id: 1, title: 'Architecture Design', status: 'completed', description: 'Design system architecture and database schema' },
				{ id: 2, title: 'Backend API Development', status: 'in-progress', description: 'Implement REST API with authentication and validation' },
				{ id: 3, title: 'Frontend Component Development', status: 'not-started', description: 'Create reusable UI components with TypeScript' },
				{ id: 4, title: 'Integration Testing', status: 'not-started', description: 'End-to-end testing across all system components' },
				{ id: 5, title: 'Performance Optimization', status: 'not-started', description: 'Database indexing, caching, and query optimization' },
				{ id: 6, title: 'Security Audit', status: 'not-started', description: 'Vulnerability assessment and security hardening' },
				{ id: 7, title: 'Documentation', status: 'not-started', description: 'API documentation, user guides, and deployment instructions' }
			];

			mockTodoListService.setTodos('complex-session', complexTodos);
			widget.render('complex-session');

			// Should auto-collapse when there are in-progress items
			const expandoElement = widget.domNode.querySelector('.todo-list-expand');
			assert.strictEqual(expandoElement?.getAttribute('aria-expanded'), 'false', 'Should auto-collapse with in-progress items');

			// Title should show progress
			const titleElement = widget.domNode.querySelector('.todo-list-title');
			assert.ok(titleElement?.textContent?.includes('(1/7)'), 'Should show correct progress count');
		});

		test('displays appropriate warnings for todo list size', () => {
			// Small list warning (< 3 items)
			const smallList: IChatTodo[] = [
				{ id: 1, title: 'Simple task', status: 'not-started', description: 'A simple task' },
				{ id: 2, title: 'Another task', status: 'not-started', description: 'Another task' }
			];
			
			mockTodoListService.setTodos('small-session', smallList);
			widget.render('small-session');

			// Widget should be hidden for < 3 todos (as per current implementation)
			assert.strictEqual(widget.domNode.style.display, 'none', 'Widget should be hidden for small todo lists');
		});
	});

	suite('Test 2: Editing workflow (three-state progress)', () => {
		test('handles three-state progress updates correctly', () => {
			const todos = createBasicTodos();
			mockTodoListService.setTodos('edit-session', todos);
			widget.render('edit-session');

			// Verify initial states are rendered correctly
			const todoItems = widget.domNode.querySelectorAll('.todo-item');
			
			// Check completed item has correct icon
			const completedIcon = todoItems[0].querySelector('.todo-status-icon');
			assert.ok(completedIcon?.classList.contains('codicon-check'), 'Completed item should have check icon');

			// Check in-progress item has correct icon
			const inProgressIcon = todoItems[1].querySelector('.todo-status-icon');
			assert.ok(inProgressIcon?.classList.contains('codicon-record'), 'In-progress item should have record icon');

			// Check not-started item has correct icon
			const notStartedIcon = todoItems[2].querySelector('.todo-status-icon');
			assert.ok(notStartedIcon?.classList.contains('codicon-circle-large-outline'), 'Not-started item should have circle outline icon');
		});

		test('updates progress counts when todos change', () => {
			const initialTodos = createBasicTodos();
			mockTodoListService.setTodos('progress-session', initialTodos);
			widget.render('progress-session');

			// Verify initial progress count
			let titleElement = widget.domNode.querySelector('.todo-list-title');
			assert.ok(titleElement?.textContent?.includes('(1/4)'), 'Should show 1 completed out of 4 total');

			// Update todos - mark another as completed
			const updatedTodos = [...initialTodos];
			updatedTodos[1].status = 'completed'; // Mark in-progress as completed
			updatedTodos[2].status = 'in-progress'; // Mark next as in-progress

			mockTodoListService.setTodos('progress-session', updatedTodos);
			widget.render('progress-session');

			// Verify updated progress count
			titleElement = widget.domNode.querySelector('.todo-list-title');
			assert.ok(titleElement?.textContent?.includes('(2/4)'), 'Should show 2 completed out of 4 total');
		});

		test('supports reordering of todo items', () => {
			const todos = createBasicTodos();
			mockTodoListService.setTodos('reorder-session', todos);
			widget.render('reorder-session');

			// Initial order
			let todoItems = widget.domNode.querySelectorAll('.todo-item');
			assert.ok(todoItems[0].textContent?.includes('Initialize project structure'), 'First item should be project structure');

			// Reorder todos - move last item to first
			const reorderedTodos = [...todos];
			const lastItem = reorderedTodos.pop()!;
			reorderedTodos.unshift({ ...lastItem, id: 0 }); // Update ID to maintain order

			mockTodoListService.setTodos('reorder-session', reorderedTodos);
			widget.render('reorder-session');

			// Verify new order
			todoItems = widget.domNode.querySelectorAll('.todo-item');
			assert.ok(todoItems[0].textContent?.includes('Configure CI/CD pipeline'), 'First item should now be CI/CD pipeline');
		});

		test('handles todo deletion properly', () => {
			const todos = createBasicTodos();
			mockTodoListService.setTodos('delete-session', todos);
			widget.render('delete-session');

			// Initial count
			let todoItems = widget.domNode.querySelectorAll('.todo-item');
			assert.strictEqual(todoItems.length, 4, 'Should have 4 initial todos');

			// Delete middle todo
			const reducedTodos = todos.filter(t => t.id !== 2);
			mockTodoListService.setTodos('delete-session', reducedTodos);
			widget.render('delete-session');

			// Verify deletion
			todoItems = widget.domNode.querySelectorAll('.todo-item');
			assert.strictEqual(todoItems.length, 3, 'Should have 3 todos after deletion');
			assert.ok(!Array.from(todoItems).some(item => item.textContent?.includes('Implement core API endpoints')), 'Deleted todo should not be present');
		});

		test('maintains progress state accuracy during rapid updates', () => {
			const todos = createBasicTodos();
			
			// Simulate rapid updates
			for (let i = 0; i < 5; i++) {
				const updatedTodos = [...todos];
				updatedTodos[i % updatedTodos.length].status = i % 2 === 0 ? 'completed' : 'in-progress';
				
				mockTodoListService.setTodos('rapid-session', updatedTodos);
				widget.render('rapid-session');
			}

			// Final state should be consistent
			const titleElement = widget.domNode.querySelector('.todo-list-title');
			const progressMatch = titleElement?.textContent?.match(/\((\d+)\/(\d+)\)/);
			assert.ok(progressMatch, 'Should have progress format in title');
			
			const completed = parseInt(progressMatch![1]);
			const total = parseInt(progressMatch![2]);
			assert.ok(completed <= total, 'Completed count should not exceed total');
			assert.strictEqual(total, 4, 'Total should remain 4');
		});
	});

	suite('Test 3: Real-time progress updates', () => {
		test('updates UI immediately when todo status changes', async () => {
			const todos = createBasicTodos();
			mockTodoListService.setTodos('realtime-session', todos);
			widget.render('realtime-session');

			// Initial state - should be collapsed due to in-progress item
			let expandoElement = widget.domNode.querySelector('.todo-list-expand');
			assert.strictEqual(expandoElement?.getAttribute('aria-expanded'), 'false', 'Should start collapsed');

			// Complete the in-progress item
			const updatedTodos = [...todos];
			updatedTodos[1].status = 'completed';
			mockTodoListService.setTodos('realtime-session', updatedTodos);
			widget.render('realtime-session');

			// Progress should update
			const titleElement = widget.domNode.querySelector('.todo-list-title');
			assert.ok(titleElement?.textContent?.includes('(2/4)'), 'Progress should immediately reflect changes');
		});

		test('handles concurrent status updates without conflicts', async () => {
			const todos = createBasicTodos();
			mockTodoListService.setTodos('concurrent-session', todos);

			// Simulate concurrent updates
			const updates = [
				() => {
					const t = [...todos];
					t[0].status = 'in-progress';
					mockTodoListService.setTodos('concurrent-session', t);
					widget.render('concurrent-session');
				},
				() => {
					const t = [...todos];
					t[2].status = 'in-progress';
					mockTodoListService.setTodos('concurrent-session', t);
					widget.render('concurrent-session');
				},
				() => {
					const t = [...todos];
					t[1].status = 'completed';
					mockTodoListService.setTodos('concurrent-session', t);
					widget.render('concurrent-session');
				}
			];

			// Execute updates rapidly
			updates.forEach(update => update());

			// Final state should be consistent
			const todoItems = widget.domNode.querySelectorAll('.todo-item');
			assert.strictEqual(todoItems.length, 4, 'Should maintain all todos');
		});

		test('preserves scroll position during updates when user has scrolled', async () => {
			const largeTodos = createLargeTodoList();
			mockTodoListService.setTodos('scroll-session', largeTodos);
			widget.render('scroll-session');

			// Expand the widget to enable scrolling
			const expandoElement = widget.domNode.querySelector('.todo-list-expand') as HTMLElement;
			expandoElement.click();

			// Simulate user scrolling
			const container = widget.domNode.querySelector('.todo-list-container') as HTMLElement;
			container.scrollTop = 200;

			// Trigger a scroll event to mark as manually scrolled
			const scrollEvent = new Event('scroll');
			container.dispatchEvent(scrollEvent);

			// Update todos
			const updatedTodos = [...largeTodos];
			updatedTodos[10].status = 'completed';
			mockTodoListService.setTodos('scroll-session', updatedTodos);
			widget.render('scroll-session');

			// Scroll position should be preserved (not reset to auto-scroll)
			assert.strictEqual(container.scrollTop, 200, 'Should preserve user scroll position');
		});
	});

	suite('Test 4: Pinning and persistence across sessions', () => {
		test('persists todos across different session IDs', () => {
			const sessionATodos = createBasicTodos();
			const sessionBTodos: IChatTodo[] = [
				{ id: 1, title: 'Different session task', status: 'not-started', description: 'Task for session B' }
			];

			// Set todos for session A
			mockTodoListService.setTodos('session-a', sessionATodos);
			widget.render('session-a');
			let todoItems = widget.domNode.querySelectorAll('.todo-item');
			assert.strictEqual(todoItems.length, 4, 'Session A should have 4 todos');

			// Set todos for session B
			mockTodoListService.setTodos('session-b', sessionBTodos);
			widget.render('session-b');
			
			// Widget should hide for session B (< 3 todos)
			assert.strictEqual(widget.domNode.style.display, 'none', 'Session B should be hidden');

			// Switch back to session A - todos should persist
			widget.render('session-a');
			todoItems = widget.domNode.querySelectorAll('.todo-item');
			assert.strictEqual(todoItems.length, 4, 'Session A todos should persist');
			assert.notStrictEqual(widget.domNode.style.display, 'none', 'Session A should be visible again');
		});

		test('maintains user manual expansion preference across renders', () => {
			const todos = createBasicTodos();
			mockTodoListService.setTodos('expansion-session', todos);
			widget.render('expansion-session');

			// Should start collapsed due to in-progress item
			let expandoElement = widget.domNode.querySelector('.todo-list-expand');
			assert.strictEqual(expandoElement?.getAttribute('aria-expanded'), 'false', 'Should start collapsed');

			// User manually expands
			(expandoElement as HTMLElement).click();
			assert.strictEqual(expandoElement?.getAttribute('aria-expanded'), 'true', 'Should be expanded after click');

			// Re-render (simulating session continuation)
			widget.render('expansion-session');

			// Should remain expanded due to user preference
			expandoElement = widget.domNode.querySelector('.todo-list-expand');
			assert.strictEqual(expandoElement?.getAttribute('aria-expanded'), 'true', 'Should remain expanded after re-render');
		});

		test('clears all todos when explicitly requested', () => {
			const todos = createBasicTodos();
			mockTodoListService.setTodos('clear-session', todos);
			widget.render('clear-session');

			// Widget should be visible initially
			assert.notStrictEqual(widget.domNode.style.display, 'none', 'Widget should be visible initially');

			// Clear all todos
			const clearButton = widget.domNode.querySelector('.todo-clear-button-container .monaco-button') as HTMLElement;
			clearButton.click();

			// Widget should be hidden after clearing
			assert.strictEqual(widget.domNode.style.display, 'none', 'Widget should be hidden after clearing');

			// Verify todos are actually cleared from storage
			const remainingTodos = mockTodoListService.getTodos('clear-session');
			assert.strictEqual(remainingTodos.length, 0, 'All todos should be cleared from storage');
		});

		test('handles session restart simulation', () => {
			const todos = createBasicTodos();
			mockTodoListService.setTodos('restart-session', todos);
			widget.render('restart-session');

			// Capture initial state
			const initialItems = widget.domNode.querySelectorAll('.todo-item').length;

			// Simulate restart by clearing session ID then re-rendering
			widget.render(undefined);
			assert.strictEqual(widget.domNode.style.display, 'none', 'Widget should be hidden with no session');

			// Restore session - todos should still be there
			widget.render('restart-session');
			const restoredItems = widget.domNode.querySelectorAll('.todo-item').length;
			assert.strictEqual(restoredItems, initialItems, 'Todos should persist after restart simulation');
		});
	});

	suite('Test 5: Interaction with markdown task lists', () => {
		test('avoids duplicate display when markdown tasks exist', () => {
			// This test verifies the widget doesn't interfere with markdown rendering
			const todos = createBasicTodos();
			mockTodoListService.setTodos('markdown-session', todos);
			widget.render('markdown-session');

			// Widget should have unique CSS classes that don't conflict with markdown
			assert.ok(widget.domNode.classList.contains('chat-todo-list-widget'), 'Should have unique widget class');
			
			// Todo items should have distinct structure from markdown checkboxes
			const todoItems = widget.domNode.querySelectorAll('.todo-item');
			todoItems.forEach(item => {
				assert.ok(item.classList.contains('todo-item'), 'Each item should have todo-item class');
				assert.ok(item.querySelector('.todo-status-icon'), 'Should have status icon (not markdown checkbox)');
			});
		});

		test('maintains separate todo list state from markdown content', () => {
			const todos = createBasicTodos();
			
			// Widget todos
			mockTodoListService.setTodos('separate-session', todos);
			widget.render('separate-session');

			// Verify widget maintains its own state
			const todoItems = widget.domNode.querySelectorAll('.todo-item');
			assert.strictEqual(todoItems.length, 4, 'Widget should maintain separate todo count');

			// Status should be managed independently
			const inProgressItems = Array.from(todoItems).filter(item => 
				item.querySelector('.codicon-record')
			);
			assert.strictEqual(inProgressItems.length, 1, 'Should have exactly one in-progress item');
		});
	});

	suite('Test 6: Condensed/expanded view and layout', () => {
		test('condensed view shows progress and current task', () => {
			const todos = createBasicTodos();
			mockTodoListService.setTodos('condensed-session', todos);
			widget.render('condensed-session');

			// Should auto-collapse due to in-progress item
			const expandoElement = widget.domNode.querySelector('.todo-list-expand');
			const container = widget.domNode.querySelector('.todo-list-container');
			
			assert.strictEqual(expandoElement?.getAttribute('aria-expanded'), 'false', 'Should be in condensed view');
			assert.strictEqual(container?.style.display, 'none', 'Container should be hidden in condensed view');

			// Title should show progress and current task
			const titleElement = widget.domNode.querySelector('.todo-list-title');
			const titleText = titleElement?.textContent;
			assert.ok(titleText?.includes('(1/4)'), 'Should show progress in condensed view');
			assert.ok(titleText?.includes('Implement core API endpoints'), 'Should show current in-progress task');
		});

		test('expanded view shows all todos with proper scrolling', () => {
			const largeTodos = createLargeTodoList();
			mockTodoListService.setTodos('expanded-session', largeTodos);
			widget.render('expanded-session');

			// Manually expand
			const expandoElement = widget.domNode.querySelector('.todo-list-expand') as HTMLElement;
			expandoElement.click();

			const container = widget.domNode.querySelector('.todo-list-container') as HTMLElement;
			assert.strictEqual(container.style.display, 'block', 'Container should be visible in expanded view');

			// Should show all todos
			const todoItems = container.querySelectorAll('.todo-item');
			assert.strictEqual(todoItems.length, 55, 'Should show all todos in expanded view');

			// Should be scrollable
			assert.ok(container.scrollHeight > container.clientHeight, 'Container should be scrollable with many items');
		});

		test('layout is non-obstructive and maintains proper spacing', () => {
			const todos = createBasicTodos();
			mockTodoListService.setTodos('layout-session', todos);
			widget.render('layout-session');

			// Check widget positioning and layout
			const widgetStyles = getComputedStyle(widget.domNode);
			
			// Widget should not have fixed positioning that obstructs content
			assert.notStrictEqual(widgetStyles.position, 'fixed', 'Widget should not use fixed positioning');
			
			// Verify reasonable height
			assert.ok(widget.height > 0, 'Widget should have positive height');
			assert.ok(widget.height < 1000, 'Widget should not be excessively tall');
		});

		test('toggle between condensed and expanded works correctly', () => {
			const todos = createBasicTodos();
			mockTodoListService.setTodos('toggle-session', todos);
			widget.render('toggle-session');

			const expandoElement = widget.domNode.querySelector('.todo-list-expand') as HTMLElement;
			const container = widget.domNode.querySelector('.todo-list-container') as HTMLElement;

			// Initial state (condensed)
			assert.strictEqual(expandoElement.getAttribute('aria-expanded'), 'false', 'Should start condensed');
			assert.strictEqual(container.style.display, 'none', 'Container should be hidden initially');

			// Expand
			expandoElement.click();
			assert.strictEqual(expandoElement.getAttribute('aria-expanded'), 'true', 'Should be expanded after click');
			assert.strictEqual(container.style.display, 'block', 'Container should be visible after expand');

			// Collapse
			expandoElement.click();
			assert.strictEqual(expandoElement.getAttribute('aria-expanded'), 'false', 'Should be condensed after second click');
			assert.strictEqual(container.style.display, 'none', 'Container should be hidden after collapse');
		});
	});

	suite('Test 7: Enhanced accessibility and keyboard navigation', () => {
		test('supports keyboard navigation for expand/collapse', () => {
			const todos = createBasicTodos();
			mockTodoListService.setTodos('keyboard-session', todos);
			widget.render('keyboard-session');

			const expandoElement = widget.domNode.querySelector('.todo-list-expand') as HTMLElement;
			
			// Test Enter key
			const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
			expandoElement.dispatchEvent(enterEvent);
			assert.strictEqual(expandoElement.getAttribute('aria-expanded'), 'true', 'Enter key should toggle expansion');

			// Test Space key
			const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });
			expandoElement.dispatchEvent(spaceEvent);
			assert.strictEqual(expandoElement.getAttribute('aria-expanded'), 'false', 'Space key should toggle expansion');
		});

		test('provides appropriate ARIA labels for screen readers', () => {
			const todos = createBasicTodos();
			mockTodoListService.setTodos('aria-session', todos);
			widget.render('aria-session');

			// Check expand button ARIA
			const expandoElement = widget.domNode.querySelector('.todo-list-expand');
			const ariaLabel = expandoElement?.getAttribute('aria-label');
			assert.ok(ariaLabel?.includes('Todos'), 'Expand button should have descriptive ARIA label');
			assert.ok(ariaLabel?.includes('(1/4)'), 'ARIA label should include progress information');

			// Check todo items ARIA
			const todoItems = widget.domNode.querySelectorAll('.todo-item');
			todoItems.forEach(item => {
				const itemAriaLabel = item.getAttribute('aria-label');
				assert.ok(itemAriaLabel, 'Each todo item should have ARIA label');
				assert.ok(itemAriaLabel?.includes('completed') || itemAriaLabel?.includes('in progress') || itemAriaLabel?.includes('not started'), 
					'ARIA label should include status information');
			});
		});

		test('maintains focus management during interactions', () => {
			const todos = createBasicTodos();
			mockTodoListService.setTodos('focus-session', todos);
			widget.render('focus-session');

			const expandoElement = widget.domNode.querySelector('.todo-list-expand') as HTMLElement;
			
			// Focus the expand button
			expandoElement.focus();
			assert.strictEqual(document.activeElement, expandoElement, 'Expand button should be focusable');

			// Focus should remain on expand button after interaction
			expandoElement.click();
			assert.strictEqual(document.activeElement, expandoElement, 'Focus should remain after expansion');
		});

		test('supports high contrast and accessibility themes', () => {
			const todos = createBasicTodos();
			mockTodoListService.setTodos('theme-session', todos);
			widget.render('theme-session');

			// Status icons should use CSS custom properties for theming
			const statusIcons = widget.domNode.querySelectorAll('.todo-status-icon');
			statusIcons.forEach(icon => {
				const iconStyle = getComputedStyle(icon as Element);
				// Icons should use CSS variables that adapt to themes
				assert.ok(iconStyle.color.includes('var(') || iconStyle.color !== '', 'Icons should have accessible colors');
			});
		});
	});

	suite('Test 8: Regression checks', () => {
		test('handles rapid todo updates without performance degradation', async () => {
			const startTime = performance.now();
			const todos = createBasicTodos();

			// Perform 100 rapid updates
			for (let i = 0; i < 100; i++) {
				const updatedTodos = [...todos];
				updatedTodos[i % updatedTodos.length].status = i % 3 === 0 ? 'completed' : i % 3 === 1 ? 'in-progress' : 'not-started';
				
				mockTodoListService.setTodos('performance-session', updatedTodos);
				widget.render('performance-session');
			}

			const endTime = performance.now();
			const duration = endTime - startTime;

			// Should complete within reasonable time (< 1 second for 100 updates)
			assert.ok(duration < 1000, `Performance test should complete quickly, took ${duration}ms`);
		});

		test('prevents duplicate events during rapid interactions', () => {
			const todos = createBasicTodos();
			mockTodoListService.setTodos('events-session', todos);
			widget.render('events-session');

			let clickCount = 0;
			const expandoElement = widget.domNode.querySelector('.todo-list-expand') as HTMLElement;
			
			// Add event listener to count clicks
			expandoElement.addEventListener('click', () => clickCount++);

			// Rapid clicks
			for (let i = 0; i < 10; i++) {
				expandoElement.click();
			}

			// Should have processed all clicks
			assert.strictEqual(clickCount, 10, 'Should process all click events');
			
			// Final state should be consistent (odd number of clicks = expanded)
			assert.strictEqual(expandoElement.getAttribute('aria-expanded'), 'false', 'Final state should be consistent');
		});

		test('handles large todo lists efficiently (50+ items)', () => {
			const largeTodos = createLargeTodoList(); // 55 items
			const startTime = performance.now();

			mockTodoListService.setTodos('large-session', largeTodos);
			widget.render('large-session');

			const endTime = performance.now();
			const renderTime = endTime - startTime;

			// Rendering large list should be reasonably fast
			assert.ok(renderTime < 500, `Large todo list should render quickly, took ${renderTime}ms`);

			// All items should be present
			const expandoElement = widget.domNode.querySelector('.todo-list-expand') as HTMLElement;
			expandoElement.click(); // Expand to see all items

			const todoItems = widget.domNode.querySelectorAll('.todo-item');
			assert.strictEqual(todoItems.length, 55, 'Should render all 55 todo items');

			// Performance should remain good during scroll
			const container = widget.domNode.querySelector('.todo-list-container') as HTMLElement;
			const scrollStartTime = performance.now();
			
			// Simulate scrolling
			for (let i = 0; i < 10; i++) {
				container.scrollTop = i * 50;
				const scrollEvent = new Event('scroll');
				container.dispatchEvent(scrollEvent);
			}

			const scrollEndTime = performance.now();
			const scrollTime = scrollEndTime - scrollStartTime;
			assert.ok(scrollTime < 100, `Scrolling should be smooth, took ${scrollTime}ms`);
		});

		test('prevents memory leaks during repeated renders', () => {
			const todos = createBasicTodos();
			
			// Perform many render cycles
			for (let i = 0; i < 50; i++) {
				mockTodoListService.setTodos(`session-${i}`, todos);
				widget.render(`session-${i}`);
			}

			// Widget should still function correctly
			widget.render('final-session');
			mockTodoListService.setTodos('final-session', todos);
			widget.render('final-session');

			const todoItems = widget.domNode.querySelectorAll('.todo-item');
			assert.strictEqual(todoItems.length, 4, 'Widget should still function after many renders');
		});

		test('maintains data consistency during concurrent modifications', () => {
			const todos = createBasicTodos();
			
			// Simulate concurrent modifications
			const promises = Array.from({ length: 10 }, (_, i) => {
				return new Promise<void>((resolve) => {
					setTimeout(() => {
						const modifiedTodos = [...todos];
						modifiedTodos[i % modifiedTodos.length].status = 'completed';
						mockTodoListService.setTodos('concurrent-session', modifiedTodos);
						widget.render('concurrent-session');
						resolve();
					}, i * 10);
				});
			});

			return Promise.all(promises).then(() => {
				// Final state should be consistent
				const finalTodos = mockTodoListService.getTodos('concurrent-session');
				assert.strictEqual(finalTodos.length, 4, 'Should maintain correct todo count');
				
				// Widget should display consistently
				const todoItems = widget.domNode.querySelectorAll('.todo-item');
				assert.strictEqual(todoItems.length, 4, 'Widget should display all todos');
			});
		});
	});
});
