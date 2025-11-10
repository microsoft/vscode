/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-restricted-syntax */

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatTodoListWidget } from '../../browser/chatContentParts/chatTodoListWidget.js';
import { IChatTodo, IChatTodoListService } from '../../common/chatTodoListService.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { URI } from '../../../../../base/common/uri.js';

const testSessionUri = URI.parse('chat-session://test/session1');

suite('ChatTodoListWidget Accessibility', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let widget: ChatTodoListWidget;

	const sampleTodos: IChatTodo[] = [
		{ id: 1, title: 'First task', status: 'not-started' },
		{ id: 2, title: 'Second task', status: 'in-progress', description: 'This is a task description' },
		{ id: 3, title: 'Third task', status: 'completed' }
	];

	setup(() => {
		// Mock the todo list service
		const mockTodoListService: IChatTodoListService = {
			_serviceBrand: undefined,
			onDidUpdateTodos: Event.None,
			getTodos: (sessionResource: URI) => sampleTodos,
			setTodos: (sessionResource: URI, todos: IChatTodo[]) => { }
		};

		// Mock the configuration service
		const mockConfigurationService = new TestConfigurationService({ 'chat.todoListTool.descriptionField': true });

		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IChatTodoListService, mockTodoListService);
		instantiationService.stub(IConfigurationService, mockConfigurationService);
		widget = store.add(instantiationService.createInstance(ChatTodoListWidget));
		mainWindow.document.body.appendChild(widget.domNode);
	});

	teardown(() => {
		if (widget.domNode.parentNode) {
			widget.domNode.parentNode.removeChild(widget.domNode);
		}
	});

	test('creates proper semantic list structure', () => {
		widget.render(testSessionUri);

		const todoListContainer = widget.domNode.querySelector('.todo-list-container');
		assert.ok(todoListContainer, 'Should have todo list container');
		assert.strictEqual(todoListContainer?.getAttribute('aria-labelledby'), 'todo-list-title');
		assert.strictEqual(todoListContainer?.getAttribute('role'), 'list');

		const titleElement = widget.domNode.querySelector('#todo-list-title');
		assert.ok(titleElement, 'Should have title element with ID todo-list-title');
		// When collapsed, title shows progress and current task without "Todos" prefix
		assert.ok(titleElement?.textContent, 'Title should have content');

		// The todo list container itself acts as the list (no nested ul element)
		const todoItems = todoListContainer?.querySelectorAll('li.todo-item');
		assert.ok(todoItems && todoItems.length > 0, 'Should have todo items in the list container');
	});

	test('todo items have proper accessibility attributes', () => {
		widget.render(testSessionUri);

		const todoItems = widget.domNode.querySelectorAll('.todo-item');
		assert.strictEqual(todoItems.length, 3, 'Should have 3 todo items');

		// Check first item (not-started)
		const firstItem = todoItems[0] as HTMLElement;
		assert.strictEqual(firstItem.getAttribute('role'), 'listitem');
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
		widget.render(testSessionUri);

		const statusIcons = widget.domNode.querySelectorAll('.todo-status-icon');
		statusIcons.forEach(icon => {
			assert.strictEqual(icon.getAttribute('aria-hidden'), 'true', 'Status icons should be hidden from screen readers');
		});
	});

	test('expand button has proper accessibility attributes', () => {
		widget.render(testSessionUri);

		// The expandoButton is now a Monaco Button, so we need to check its element
		const expandoContainer = widget.domNode.querySelector('.todo-list-expand');
		assert.ok(expandoContainer, 'Should have expando container');

		const expandoButton = expandoContainer?.querySelector('.monaco-button');
		assert.ok(expandoButton, 'Should have Monaco button');
		assert.strictEqual(expandoButton?.getAttribute('aria-expanded'), 'false'); // Should be collapsed due to in-progress task
		assert.strictEqual(expandoButton?.getAttribute('aria-controls'), 'todo-list-container');

		// The title element should have progress information
		const titleElement = expandoButton?.querySelector('.todo-list-title');
		assert.ok(titleElement, 'Should have title element');
		const titleText = titleElement?.textContent;
		// When collapsed, title shows progress and current task: " (2/3) - Second task"
		// Progress is 2/3 because: 1 completed + 1 in-progress (current) = task 2 of 3
		assert.ok(titleText?.includes('(2/3)'), `Title should show progress format, but got: "${titleText}"`);
		assert.ok(titleText?.includes('Second task'), `Title should show current task when collapsed, but got: "${titleText}"`);
	});

	test('todo items have complete aria-label with status information', () => {
		widget.render(testSessionUri);

		const todoItems = widget.domNode.querySelectorAll('.todo-item');
		assert.strictEqual(todoItems.length, 3, 'Should have 3 todo items');

		// Check first item (not-started) - aria-label should include title and status
		const firstItem = todoItems[0] as HTMLElement;
		const firstAriaLabel = firstItem.getAttribute('aria-label');
		assert.ok(firstAriaLabel?.includes('First task'), 'First item aria-label should include title');
		assert.ok(firstAriaLabel?.includes('not started'), 'First item aria-label should include status');

		// Check second item (in-progress with description) - aria-label should include title, status, and description
		const secondItem = todoItems[1] as HTMLElement;
		const secondAriaLabel = secondItem.getAttribute('aria-label');
		assert.ok(secondAriaLabel?.includes('Second task'), 'Second item aria-label should include title');
		assert.ok(secondAriaLabel?.includes('in progress'), 'Second item aria-label should include status');
		assert.ok(secondAriaLabel?.includes('This is a task description'), 'Second item aria-label should include description');

		// Check third item (completed) - aria-label should include title and status
		const thirdItem = todoItems[2] as HTMLElement;
		const thirdAriaLabel = thirdItem.getAttribute('aria-label');
		assert.ok(thirdAriaLabel?.includes('Third task'), 'Third item aria-label should include title');
		assert.ok(thirdAriaLabel?.includes('completed'), 'Third item aria-label should include status');
	});

	test('widget displays properly when no todos exist', () => {
		// Create a new mock service with empty todos
		const emptyTodoListService: IChatTodoListService = {
			_serviceBrand: undefined,
			onDidUpdateTodos: Event.None,
			getTodos: (sessionResource: URI) => [],
			setTodos: (sessionResource: URI, todos: IChatTodo[]) => { }
		};

		const emptyConfigurationService = new TestConfigurationService({ 'chat.todoListTool.descriptionField': true });

		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IChatTodoListService, emptyTodoListService);
		instantiationService.stub(IConfigurationService, emptyConfigurationService);
		const emptyWidget = store.add(instantiationService.createInstance(ChatTodoListWidget));
		mainWindow.document.body.appendChild(emptyWidget.domNode);

		emptyWidget.render(testSessionUri);

		// Widget should be hidden when no todos
		assert.strictEqual(emptyWidget.domNode.style.display, 'none', 'Widget should be hidden when no todos');
	});

	test('clear button has proper accessibility', () => {
		widget.render(testSessionUri);

		const clearButton = widget.domNode.querySelector('.todo-clear-button-container .monaco-button');
		assert.ok(clearButton, 'Should have clear button');
		assert.strictEqual(clearButton?.getAttribute('tabindex'), '0', 'Clear button should be focusable');
	});

	test('title element displays progress correctly and is accessible', () => {
		widget.render(testSessionUri);

		const titleElement = widget.domNode.querySelector('#todo-list-title');
		assert.ok(titleElement, 'Should have title element with ID');

		// Title should show progress format: " (2/3)" since one todo is completed and one is in-progress
		// When collapsed, it also shows the current task: " (2/3) - Second task"
		// Progress is 2/3 because: 1 completed + 1 in-progress (current) = task 2 of 3
		const titleText = titleElement?.textContent;
		assert.ok(titleText?.includes('(2/3)'), `Title should show progress format, but got: "${titleText}"`);
		assert.ok(titleText?.includes('Second task'), `Title should show current task when collapsed, but got: "${titleText}"`);

		// Verify aria-labelledby connection works
		const todoListContainer = widget.domNode.querySelector('.todo-list-container');
		assert.strictEqual(todoListContainer?.getAttribute('aria-labelledby'), 'todo-list-title');
	});
});
