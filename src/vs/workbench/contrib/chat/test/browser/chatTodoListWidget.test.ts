/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatTodoListWidget } from '../../browser/chatContentParts/chatTodoListWidget.js';
import { IChatTodoListService, IChatTodo } from '../../common/chatTodoListService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';

class MockChatTodoListService implements IChatTodoListService {
	declare readonly _serviceBrand: undefined;
	
	private todos: Map<string, IChatTodo[]> = new Map();

	getTodos(sessionId: string): IChatTodo[] {
		return this.todos.get(sessionId) || [];
	}

	setTodos(sessionId: string, todos: IChatTodo[]): void {
		this.todos.set(sessionId, todos);
	}
}

suite('ChatTodoListWidget', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();
	let widget: ChatTodoListWidget;
	let mockTodoService: MockChatTodoListService;

	const createTestTodos = (): IChatTodo[] => [
		{ id: 1, title: 'First task', description: 'First description', status: 'not-started' },
		{ id: 2, title: 'Second task', description: 'Second description', status: 'in-progress' },
		{ id: 3, title: 'Third task', description: 'Third description', status: 'completed' },
	];

	setup(() => {
		mockTodoService = new MockChatTodoListService();
		
		// Create a test instantiation service with the mock
		const instantiationService = new TestInstantiationService();
		instantiationService.set(IChatTodoListService, mockTodoService);
		
		widget = ds.add(instantiationService.createInstance(ChatTodoListWidget));
	});

	test('initial state', () => {
		assert.strictEqual(widget.height, 0);
		assert.strictEqual(widget.domNode.style.display, 'none');
	});

	test('render with todos shows widget', () => {
		const sessionId = 'test-session';
		const todos = createTestTodos();
		mockTodoService.setTodos(sessionId, todos);
		
		widget.render(sessionId);
		
		assert.notStrictEqual(widget.domNode.style.display, 'none');
		assert.strictEqual(widget.height > 0, true);
	});

	test('render without todos hides widget', () => {
		const sessionId = 'test-session';
		
		widget.render(sessionId);
		
		assert.strictEqual(widget.domNode.style.display, 'none');
		assert.strictEqual(widget.height, 0);
	});

	test('ARIA attributes are set correctly', () => {
		const sessionId = 'test-session';
		const todos = createTestTodos();
		mockTodoService.setTodos(sessionId, todos);
		
		widget.render(sessionId);
		
		// Check main container has proper ARIA attributes
		const container = widget.domNode.querySelector('.todo-list-container') as HTMLElement;
		assert.strictEqual(container.getAttribute('role'), 'listbox');
		assert.strictEqual(container.getAttribute('aria-label'), 'Todo items');
		assert.strictEqual(container.getAttribute('tabindex'), '0');
		
		// Check todo items have proper ARIA attributes
		const todoItems = container.querySelectorAll('.todo-item');
		assert.strictEqual(todoItems.length, 3);
		
		todoItems.forEach((item, index) => {
			assert.strictEqual(item.getAttribute('role'), 'option');
			assert.strictEqual(item.getAttribute('data-index'), index.toString());
			assert.strictEqual(item.getAttribute('id'), `todo-item-${index}`);
			assert.notStrictEqual(item.getAttribute('aria-label'), null);
		});
	});

	test('status text helper returns correct values', () => {
		// Access private method for testing - in real implementation this would be public or testable another way
		const widget_any = widget as any;
		
		assert.strictEqual(widget_any.getStatusText('not-started'), 'not started');
		assert.strictEqual(widget_any.getStatusText('in-progress'), 'in progress');
		assert.strictEqual(widget_any.getStatusText('completed'), 'completed');
	});

	test('progress text shows correct format', () => {
		const sessionId = 'test-session';
		const todos = createTestTodos();
		mockTodoService.setTodos(sessionId, todos);
		
		widget.render(sessionId);
		
		// Access private method for testing
		const widget_any = widget as any;
		const progressText = widget_any.getProgressText(todos);
		
		// Should show "Todos (1/3)" - 1 completed out of 3 total
		assert.strictEqual(progressText, 'Todos (1/3)');
	});
});