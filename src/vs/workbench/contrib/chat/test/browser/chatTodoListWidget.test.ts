/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ChatTodoListWidget } from '../../browser/chatContentParts/chatTodoListWidget.js';
import { IChatTodoListService, IChatTodoListStorage, IChatTodo } from '../../common/chatTodoListService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('ChatTodoListWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let mockChatTodoListService: IChatTodoListService;
	let mockStorage: IChatTodoListStorage;
	let widget: ChatTodoListWidget;

	setup(() => {
		instantiationService = new TestInstantiationService();

		// Mock storage
		mockStorage = {
			getTodoList: (_sessionId: string): IChatTodo[] => {
				return [
					{
						id: 1,
						title: 'Fix the bug in login module',
						description: 'There is a critical bug in the login validation',
						status: 'in-progress'
					},
					{
						id: 2,
						title: 'Update documentation',
						description: 'Update the API documentation',
						status: 'not-started'
					},
					{
						id: 3,
						title: 'Write unit tests',
						description: 'Add unit tests for the new feature',
						status: 'completed'
					}
				];
			},
			setTodoList: (sessionId: string, todoList: IChatTodo[]): void => {
				// Mock implementation
			}
		};

		// Mock service
		mockChatTodoListService = {
			getChatTodoListStorage: () => mockStorage,
			_serviceBrand: undefined
		};

		instantiationService.stub(IChatTodoListService, mockChatTodoListService);

		widget = instantiationService.createInstance(ChatTodoListWidget);
		store.add(widget);
	});

	teardown(() => {
		widget.dispose();
	});

	test("should show in-progress todo title when collapsed", () => {
		// Set up a session with todos
		widget.updateSessionId("test-session");

		// Simulate collapsing the widget
		(widget as any)._isExpanded = false;

		// Get the progress text
		const progressText = (widget as any).getProgressText([
			{
				id: 1,
				title: "Fix the bug in login module",
				description: "There is a critical bug in the login validation",
				status: "in-progress",
			},
			{
				id: 2,
				title: "Update documentation",
				description: "Update the API documentation",
				status: "not-started",
			},
		]);

		// Should show the in-progress todo title when collapsed
		assert.strictEqual(progressText, "Fix the bug in login module");
	});

	test("should show count format when expanded", () => {
		// Set up a session with todos
		widget.updateSessionId("test-session");

		// Simulate expanding the widget
		(widget as any)._isExpanded = true;

		// Get the progress text
		const progressText = (widget as any).getProgressText([
			{
				id: 1,
				title: "Fix the bug in login module",
				description: "There is a critical bug in the login validation",
				status: "in-progress",
			},
			{
				id: 2,
				title: "Update documentation",
				description: "Update the API documentation",
				status: "not-started",
			},
			{
				id: 3,
				title: "Write unit tests",
				description: "Add unit tests for the new feature",
				status: "completed",
			},
		]);

		// Should show the count format when expanded
		assert.strictEqual(progressText, "Todos (1/3)");
	});

	test("should fall back to count format when no in-progress todo exists", () => {
		// Set up a session with todos
		widget.updateSessionId("test-session");

		// Simulate collapsing the widget
		(widget as any)._isExpanded = false;

		// Get the progress text with no in-progress todos
		const progressText = (widget as any).getProgressText([
			{
				id: 1,
				title: "Fix the bug in login module",
				description: "There is a critical bug in the login validation",
				status: "completed",
			},
			{
				id: 2,
				title: "Update documentation",
				description: "Update the API documentation",
				status: "not-started",
			},
		]);

		// Should fall back to count format when no in-progress todo
		assert.strictEqual(progressText, "Todos (1/2)");
	});

	test("should show default title when no todos exist", () => {
		// Set up a session with no todos
		widget.updateSessionId("test-session");

		// Get the progress text with empty todo list
		const progressText = (widget as any).getProgressText([]);

		// Should show default title when no todos
		assert.strictEqual(progressText, "Todos");
	});
});
