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

	test('aria-label indicates edit capability', () => {
		widget.render('test-session');

		const todoItems = widget.domNode.querySelectorAll('.todo-item');
		assert.strictEqual(todoItems.length, 3, 'Should have 3 todo items');

		// Check that aria-label includes "press Enter to edit"
		todoItems.forEach((item) => {
			const ariaLabel = item.getAttribute('aria-label');
			assert.ok(ariaLabel?.includes('press Enter to edit'), 'Aria label should indicate edit capability');
		});
	});
});

suite('ChatTodoListWidget Inline Editing', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let widget: ChatTodoListWidget;
	let mockTodoListService: IChatTodoListService;
	let mockConfigurationService: IConfigurationService;
	let todosStorage: IChatTodo[];

	const createSampleTodos = (): IChatTodo[] => [
		{ id: 1, title: 'First task', status: 'not-started' },
		{ id: 2, title: 'Second task', status: 'in-progress', description: 'This is a task description' },
		{ id: 3, title: 'Third task', status: 'completed' }
	];

	setup(() => {
		todosStorage = createSampleTodos();

		// Mock the todo list service with mutable storage
		mockTodoListService = {
			_serviceBrand: undefined,
			getTodos: (sessionId: string) => todosStorage,
			setTodos: (sessionId: string, todos: IChatTodo[]) => {
				todosStorage = todos;
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

	test('double-click activates edit mode', () => {
		widget.render('test-session');

		const todoItems = widget.domNode.querySelectorAll('.todo-item');
		const firstItem = todoItems[0] as HTMLElement;

		// Simulate double-click
		const dblClickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
		firstItem.dispatchEvent(dblClickEvent);

		// Check that input box appears
		const inputContainer = widget.domNode.querySelector('.todo-edit-input-container');
		assert.ok(inputContainer, 'Input container should be created');

		const inputBox = inputContainer?.querySelector('.monaco-inputbox');
		assert.ok(inputBox, 'InputBox should be created');
	});

	test('Enter key activates edit mode when todo is focused', () => {
		widget.render('test-session');

		const todoItems = widget.domNode.querySelectorAll('.todo-item');
		const firstItem = todoItems[0] as HTMLElement;

		// Simulate Enter key press
		const keydownEvent = new KeyboardEvent('keydown', {
			key: 'Enter',
			bubbles: true,
			cancelable: true
		});
		firstItem.dispatchEvent(keydownEvent);

		// Check that input box appears
		const inputContainer = widget.domNode.querySelector('.todo-edit-input-container');
		assert.ok(inputContainer, 'Input container should be created');
	});

	test('Escape key cancels edit mode', () => {
		widget.render('test-session');

		const todoItems = widget.domNode.querySelectorAll('.todo-item');
		const firstItem = todoItems[0] as HTMLElement;
		const originalTitle = todosStorage[0].title;

		// Start editing
		const dblClickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
		firstItem.dispatchEvent(dblClickEvent);

		// Verify input box exists
		let inputContainer = widget.domNode.querySelector('.todo-edit-input-container');
		assert.ok(inputContainer, 'Input container should exist');

		// Get input element and change value
		const inputElement = inputContainer?.querySelector('input') as HTMLInputElement;
		assert.ok(inputElement, 'Input element should exist');
		inputElement.value = 'Modified title';

		// Simulate Escape key
		const escapeEvent = new KeyboardEvent('keydown', {
			key: 'Escape',
			bubbles: true,
			cancelable: true
		});
		inputElement.dispatchEvent(escapeEvent);

		// Wait for re-render
		setTimeout(() => {
			// Check that edit was cancelled and title unchanged
			const updatedTodos = mockTodoListService.getTodos('test-session');
			assert.strictEqual(updatedTodos[0].title, originalTitle, 'Title should remain unchanged');

			// Input box should be gone
			inputContainer = widget.domNode.querySelector('.todo-edit-input-container');
			assert.ok(!inputContainer, 'Input container should be removed');
		}, 200);
	});

	test('saving with Enter key updates todo title', (done) => {
		widget.render('test-session');

		const todoItems = widget.domNode.querySelectorAll('.todo-item');
		const firstItem = todoItems[0] as HTMLElement;
		const newTitle = 'Updated First Task';

		// Start editing
		const dblClickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
		firstItem.dispatchEvent(dblClickEvent);

		// Get input element and change value
		const inputContainer = widget.domNode.querySelector('.todo-edit-input-container');
		const inputElement = inputContainer?.querySelector('input') as HTMLInputElement;
		assert.ok(inputElement, 'Input element should exist');
		inputElement.value = newTitle;

		// Simulate Enter key to save
		const enterEvent = new KeyboardEvent('keydown', {
			key: 'Enter',
			bubbles: true,
			cancelable: true
		});
		inputElement.dispatchEvent(enterEvent);

		// Wait for save and re-render
		setTimeout(() => {
			const updatedTodos = mockTodoListService.getTodos('test-session');
			assert.strictEqual(updatedTodos[0].title, newTitle, 'Title should be updated');
			done();
		}, 200);
	});

	test('empty title is not saved', (done) => {
		widget.render('test-session');

		const todoItems = widget.domNode.querySelectorAll('.todo-item');
		const firstItem = todoItems[0] as HTMLElement;
		const originalTitle = todosStorage[0].title;

		// Start editing
		const dblClickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
		firstItem.dispatchEvent(dblClickEvent);

		// Get input element and clear value
		const inputContainer = widget.domNode.querySelector('.todo-edit-input-container');
		const inputElement = inputContainer?.querySelector('input') as HTMLInputElement;
		inputElement.value = '   '; // Only whitespace

		// Simulate Enter key to save
		const enterEvent = new KeyboardEvent('keydown', {
			key: 'Enter',
			bubbles: true,
			cancelable: true
		});
		inputElement.dispatchEvent(enterEvent);

		// Wait for save attempt and re-render
		setTimeout(() => {
			const updatedTodos = mockTodoListService.getTodos('test-session');
			assert.strictEqual(updatedTodos[0].title, originalTitle, 'Title should remain unchanged when empty');
			done();
		}, 200);
	});

	test('editing one todo at a time', () => {
		widget.render('test-session');

		const todoItems = widget.domNode.querySelectorAll('.todo-item');
		const firstItem = todoItems[0] as HTMLElement;
		const secondItem = todoItems[1] as HTMLElement;

		// Start editing first item
		const dblClick1 = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
		firstItem.dispatchEvent(dblClick1);

		let inputContainers = widget.domNode.querySelectorAll('.todo-edit-input-container');
		assert.strictEqual(inputContainers.length, 1, 'Should have one input container');

		// Start editing second item (should cancel first edit)
		const dblClick2 = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
		secondItem.dispatchEvent(dblClick2);

		// After re-render, should still have only one input
		setTimeout(() => {
			inputContainers = widget.domNode.querySelectorAll('.todo-edit-input-container');
			assert.strictEqual(inputContainers.length, 1, 'Should still have only one input container');
		}, 100);
	});
});
