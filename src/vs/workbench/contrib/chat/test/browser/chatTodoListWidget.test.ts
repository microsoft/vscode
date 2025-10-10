/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatTodoListWidget } from '../../browser/chatContentParts/chatTodoListWidget.js';
import { IChatTodo, IChatTodoListService } from '../../common/chatTodoListService.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';

suite('ChatTodoListWidget Accessibility', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let widget: ChatTodoListWidget;
	let mockTodoListService: IChatTodoListService;
	let mockConfigurationService: IConfigurationService;

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
			setTodos: (sessionId: string, todos: IChatTodo[]) => { },
			getCustomTitle: (sessionId: string) => undefined,
			setCustomTitle: (sessionId: string, title: string | undefined) => { }
		};

		// Mock the configuration service
		// eslint-disable-next-line local/code-no-any-casts
		mockConfigurationService = {
			_serviceBrand: undefined,
			getValue: (key: string) => key === 'chat.todoListTool.descriptionField' ? true : undefined
		} as any;

		widget = store.add(new ChatTodoListWidget(mockTodoListService, mockConfigurationService));
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
			setTodos: (sessionId: string, todos: IChatTodo[]) => { },
			getCustomTitle: (sessionId: string) => undefined,
			setCustomTitle: (sessionId: string, title: string | undefined) => { }
		};

		// eslint-disable-next-line local/code-no-any-casts
		const emptyConfigurationService: IConfigurationService = {
			_serviceBrand: undefined,
			getValue: (key: string) => key === 'chat.todoListTool.descriptionField' ? true : undefined
		} as any;

		const emptyWidget = store.add(new ChatTodoListWidget(emptyTodoListService, emptyConfigurationService));
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

	test('edit button is present and visible on hover', () => {
		widget.render('test-session');

		const editButtonContainer = widget.domNode.querySelector('.todo-edit-button-container');
		assert.ok(editButtonContainer, 'Should have edit button container');

		const editButton = editButtonContainer?.querySelector('.monaco-button');
		assert.ok(editButton, 'Should have edit button');
		assert.strictEqual(editButton?.getAttribute('tabindex'), '0', 'Edit button should be focusable');
	});

	test('custom title is used when set', () => {
		// Create a mock service that returns a custom title
		const customTodoListService: IChatTodoListService = {
			_serviceBrand: undefined,
			getTodos: (sessionId: string) => sampleTodos,
			setTodos: (sessionId: string, todos: IChatTodo[]) => { },
			getCustomTitle: (sessionId: string) => 'My Custom Title',
			setCustomTitle: (sessionId: string, title: string | undefined) => { }
		};

		// eslint-disable-next-line local/code-no-any-casts
		const configService: IConfigurationService = {
			_serviceBrand: undefined,
			getValue: (key: string) => key === 'chat.todoListTool.descriptionField' ? true : undefined
		} as any;

		const customWidget = store.add(new ChatTodoListWidget(customTodoListService, configService));
		mainWindow.document.body.appendChild(customWidget.domNode);

		customWidget.render('test-session');

		const titleElement = customWidget.domNode.querySelector('#todo-list-title');
		assert.ok(titleElement, 'Should have title element');

		// Title should show custom title with progress
		const titleText = titleElement?.textContent;
		assert.ok(titleText?.includes('My Custom Title'), `Title should include custom title, but got: "${titleText}"`);
		assert.ok(titleText?.includes('(1/3)'), `Title should include progress, but got: "${titleText}"`);
	});

	test('title editing saves and cancels correctly', () => {
		let savedTitle: string | undefined;
		const editableTodoListService: IChatTodoListService = {
			_serviceBrand: undefined,
			getTodos: (sessionId: string) => sampleTodos,
			setTodos: (sessionId: string, todos: IChatTodo[]) => { },
			getCustomTitle: (sessionId: string) => undefined,
			setCustomTitle: (sessionId: string, title: string | undefined) => {
				savedTitle = title;
			}
		};

		// eslint-disable-next-line local/code-no-any-casts
		const configService: IConfigurationService = {
			_serviceBrand: undefined,
			getValue: (key: string) => key === 'chat.todoListTool.descriptionField' ? true : undefined
		} as any;

		const editableWidget = store.add(new ChatTodoListWidget(editableTodoListService, configService));
		mainWindow.document.body.appendChild(editableWidget.domNode);

		editableWidget.render('test-session');

		// Find and click the edit button
		const editButton = editableWidget.domNode.querySelector('.todo-edit-button-container .monaco-button') as HTMLElement;
		assert.ok(editButton, 'Should have edit button');

		// Simulate clicking the edit button
		editButton.click();

		// Check if input field is created
		const titleInput = editableWidget.domNode.querySelector('.todo-title-input') as HTMLInputElement;
		assert.ok(titleInput, 'Should have title input field after clicking edit');
		assert.strictEqual(titleInput.value, 'Todos', 'Input should have default value');

		// Change the value and press Enter
		titleInput.value = 'My New Title';
		const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
		titleInput.dispatchEvent(enterEvent);

		// Title should be saved
		assert.strictEqual(savedTitle, 'My New Title', 'Should save the new title');
	});
});
