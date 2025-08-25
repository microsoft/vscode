/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
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

		const titleElement = widget.domNode.querySelector('#todo-list-title');
		assert.ok(titleElement, 'Should have title element with ID todo-list-title');
		assert.ok(titleElement?.textContent?.includes('Todos'));

		const todoList = todoListContainer?.querySelector('ul.todo-list');
		assert.ok(todoList, 'Should have UL element for list');
		assert.strictEqual(todoList?.getAttribute('role'), 'list');
		assert.ok(todoList?.getAttribute('aria-label')?.includes('Todo items'));
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

		// The titleSection now has the accessibility attributes instead of the expand button
		const titleSection = widget.domNode.querySelector('.todo-list-title-section');
		assert.ok(titleSection, 'Should have title section');
		assert.strictEqual(titleSection?.getAttribute('role'), 'button');
		assert.strictEqual(titleSection?.getAttribute('tabindex'), '0');
		assert.strictEqual(titleSection?.getAttribute('aria-expanded'), 'false'); // Should be collapsed due to in-progress task
		assert.strictEqual(titleSection?.getAttribute('aria-controls'), 'todo-list-container');

		// The aria-label should now include progress information, not just "Toggle todo list visibility"
		const ariaLabel = titleSection?.getAttribute('aria-label');
		assert.ok(ariaLabel?.includes('Todos (1/3)'), `Title section aria-label should include progress, but got: "${ariaLabel}"`);
		assert.ok(ariaLabel?.includes('Expand'), `Title section aria-label should include "Expand", but got: "${ariaLabel}"`);
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
