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
			setTodos: (sessionId: string, todos: IChatTodo[]) => { }
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
			setTodos: (sessionId: string, todos: IChatTodo[]) => { }
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
});

suite('ChatTodoListWidget Inline Editing', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let widget: ChatTodoListWidget;
	let mockTodoListService: IChatTodoListService;
	let mockConfigurationService: IConfigurationService;
	let storedTodos: IChatTodo[];

	const sampleTodos: IChatTodo[] = [
		{ id: 1, title: 'First task', status: 'not-started' },
		{ id: 2, title: 'Second task', status: 'in-progress', description: 'This is a task description' },
		{ id: 3, title: 'Third task', status: 'completed' }
	];

	setup(() => {
		storedTodos = [...sampleTodos.map(t => ({ ...t }))];

		// Mock the todo list service with state
		mockTodoListService = {
			_serviceBrand: undefined,
			getTodos: (sessionId: string) => storedTodos,
			setTodos: (sessionId: string, todos: IChatTodo[]) => {
				storedTodos = todos;
			}
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

	test('title elements are clickable for editing', () => {
		widget.render('test-session');

		const titleElements = widget.domNode.querySelectorAll('.todo-title');
		assert.ok(titleElements.length > 0, 'Should have title elements');

		// Check that title elements have the proper data attributes
		const firstTitle = titleElements[0] as HTMLElement;
		assert.strictEqual(firstTitle.getAttribute('data-todo-id'), '1');
		assert.strictEqual(firstTitle.getAttribute('data-field'), 'title');
	});

	test('description elements are clickable for editing', () => {
		widget.render('test-session');

		const descElements = widget.domNode.querySelectorAll('.todo-description');
		assert.ok(descElements.length > 0, 'Should have description elements');

		// Check that description elements have the proper data attributes
		const firstDesc = descElements[0] as HTMLElement;
		assert.strictEqual(firstDesc.getAttribute('data-todo-id'), '2');
		assert.strictEqual(firstDesc.getAttribute('data-field'), 'description');
	});

	test('edit input has proper accessibility attributes', (done) => {
		widget.render('test-session');

		const titleElement = widget.domNode.querySelector('.todo-title') as HTMLElement;
		assert.ok(titleElement, 'Should have a title element');

		// Simulate click to enter edit mode
		titleElement.click();

		// Wait for edit mode to be rendered
		setTimeout(() => {
			const editInput = widget.domNode.querySelector('.todo-edit-input') as HTMLInputElement;
			assert.ok(editInput, 'Should have an edit input after clicking title');
			assert.ok(editInput.getAttribute('aria-label')?.includes('Edit todo title'));
			assert.ok(editInput.getAttribute('aria-describedby')?.includes('todo-edit-validation'));
			done();
		}, 50);
	});

	test('edit input shows validation message for empty title', (done) => {
		widget.render('test-session');

		const titleElement = widget.domNode.querySelector('.todo-title') as HTMLElement;
		titleElement.click();

		setTimeout(() => {
			const editInput = widget.domNode.querySelector('.todo-edit-input') as HTMLInputElement;
			assert.ok(editInput, 'Should have an edit input');

			// Clear the input to trigger validation
			editInput.value = '';
			editInput.dispatchEvent(new Event('input'));

			setTimeout(() => {
				const validationMessage = widget.domNode.querySelector('.todo-edit-validation') as HTMLElement;
				assert.ok(validationMessage, 'Should have a validation message element');
				assert.ok(validationMessage.textContent?.includes('cannot be empty'), 'Should show empty validation message');

				const container = editInput.closest('.todo-edit-container');
				assert.ok(container?.classList.contains('todo-edit-error'), 'Should have error class');
				done();
			}, 50);
		}, 50);
	});

	test('edit input shows validation message for too long title', (done) => {
		widget.render('test-session');

		const titleElement = widget.domNode.querySelector('.todo-title') as HTMLElement;
		titleElement.click();

		setTimeout(() => {
			const editInput = widget.domNode.querySelector('.todo-edit-input') as HTMLInputElement;
			assert.ok(editInput, 'Should have an edit input');

			// Set a very long title to trigger validation
			editInput.value = 'a'.repeat(201);
			editInput.dispatchEvent(new Event('input'));

			setTimeout(() => {
				const validationMessage = widget.domNode.querySelector('.todo-edit-validation') as HTMLElement;
				assert.ok(validationMessage.textContent?.includes('200 characters'), 'Should show length validation message');

				const container = editInput.closest('.todo-edit-container');
				assert.ok(container?.classList.contains('todo-edit-error'), 'Should have error class');
				done();
			}, 50);
		}, 50);
	});

	test('todo item has editing class when in edit mode', (done) => {
		widget.render('test-session');

		const titleElement = widget.domNode.querySelector('.todo-title') as HTMLElement;
		const todoItem = titleElement.closest('.todo-item');
		assert.ok(todoItem, 'Should have a todo item');
		assert.ok(!todoItem.classList.contains('todo-item-editing'), 'Should not have editing class initially');

		titleElement.click();

		setTimeout(() => {
			widget.render('test-session'); // Re-render to apply editing class
			const updatedTodoItem = widget.domNode.querySelector('.todo-item-editing');
			assert.ok(updatedTodoItem, 'Should have editing class after entering edit mode');
			done();
		}, 50);
	});

	test('screen reader announcements are made for edit mode', (done) => {
		widget.render('test-session');

		const titleElement = widget.domNode.querySelector('.todo-title') as HTMLElement;
		titleElement.click();

		setTimeout(() => {
			// Check for screen reader announcement
			const announcement = widget.domNode.querySelector('.todo-screen-reader-announcement') as HTMLElement;
			if (announcement) {
				assert.ok(announcement.textContent?.includes('Editing'), 'Should announce edit mode');
				assert.strictEqual(announcement.getAttribute('role'), 'status');
				assert.strictEqual(announcement.getAttribute('aria-live'), 'polite');
			}
			done();
		}, 50);
	});
});
