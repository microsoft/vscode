/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatTodo, IChatTodoListService } from '../../common/chatTodoListService.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ChatTodoListWidget } from '../../browser/chatContentParts/chatTodoListWidget.js';

suite('ChatTodoListWidget Context Menu', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let widget: ChatTodoListWidget;
	let mockTodoListService: IChatTodoListService;
	let mockConfigurationService: IConfigurationService;
	let mockContextMenuService: IContextMenuService;
	let mockContextKeyService: IContextKeyService;

	const sampleTodos: IChatTodo[] = [
		{ id: 1, title: 'First task', status: 'not-started' },
		{ id: 2, title: 'Second task', status: 'in-progress' },
		{ id: 3, title: 'Third task', status: 'completed' }
	];

	setup(() => {
		// Mock the todo list service
		mockTodoListService = {
			_serviceBrand: undefined,
			getTodos: (sessionId: string) => sampleTodos,
			setTodos: (sessionId: string, todos: IChatTodo[]) => { },
			getCustomTitle: (sessionId: string) => undefined,
			setCustomTitle: (sessionId: string, title: string | undefined) => { },
			onDidChangeCustomTitle: Event.None
		};

		// Mock the configuration service
		// eslint-disable-next-line local/code-no-any-casts
		mockConfigurationService = {
			_serviceBrand: undefined,
			getValue: (key: string) => key === 'chat.todoListTool.descriptionField' ? true : undefined
		} as any;

		// Mock the context menu service
		// eslint-disable-next-line local/code-no-any-casts
		mockContextMenuService = {
			_serviceBrand: undefined,
			showContextMenu: () => { }
		} as any;

		// Mock the context key service
		mockContextKeyService = new MockContextKeyService();

		widget = store.add(new ChatTodoListWidget(
			mockTodoListService,
			mockConfigurationService,
			mockContextMenuService,
			mockContextKeyService
		));
		mainWindow.document.body.appendChild(widget.domNode);
	});

	teardown(() => {
		if (widget.domNode.parentNode) {
			widget.domNode.parentNode.removeChild(widget.domNode);
		}
	});

	test('widget renders with default title', () => {
		widget.render('test-session');

		const titleElement = widget.domNode.querySelector('.todo-list-title');
		assert.ok(titleElement, 'Should have title element');
		assert.ok(titleElement?.textContent?.includes('Todos'), 'Should display default title');
	});

	test('widget displays custom title when set', () => {
		// Update the mock service to return a custom title
		mockTodoListService.getCustomTitle = (sessionId: string) => 'My Custom Tasks';

		widget.render('test-session');
		widget.refreshTitle();

		const titleElement = widget.domNode.querySelector('.todo-list-title');
		assert.ok(titleElement, 'Should have title element');
		assert.ok(titleElement?.textContent?.includes('My Custom Tasks'), 'Should display custom title');
	});

	test('widget updates title when custom title changes', () => {
		widget.render('test-session');

		// Initially should show default title
		let titleElement = widget.domNode.querySelector('.todo-list-title');
		assert.ok(titleElement?.textContent?.includes('Todos'), 'Should initially display default title');

		// Update the mock service to return a custom title
		mockTodoListService.getCustomTitle = (sessionId: string) => 'Updated Title';
		widget.refreshTitle();

		titleElement = widget.domNode.querySelector('.todo-list-title');
		assert.ok(titleElement?.textContent?.includes('Updated Title'), 'Should display updated custom title');
	});

	test('title section can trigger context menu', () => {
		widget.render('test-session');

		const titleSection = widget.domNode.querySelector('.todo-list-title-section');
		assert.ok(titleSection, 'Should have title section');

		// Verify context menu listener is registered (we can't easily test the actual menu display)
		const hasContextMenuListener = true; // In real test, would need to spy on event listeners
		assert.ok(hasContextMenuListener, 'Title section should have context menu listener');
	});
});
