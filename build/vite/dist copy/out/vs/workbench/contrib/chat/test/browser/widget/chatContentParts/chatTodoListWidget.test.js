/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { isAncestorOfActiveElement } from '../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { Event } from '../../../../../../../base/common/event.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatTodoListWidget } from '../../../../browser/widget/chatContentParts/chatTodoListWidget.js';
import { IChatTodoListService } from '../../../../common/tools/chatTodoListService.js';
const testSessionUri = URI.parse('chat-session://test/session1');
suite('ChatTodoListWidget Accessibility', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let widget;
    const sampleTodos = [
        { id: 1, title: 'First task', status: 'not-started' },
        { id: 2, title: 'Second task', status: 'in-progress' },
        { id: 3, title: 'Third task', status: 'completed' }
    ];
    setup(() => {
        // Mock the todo list service
        const mockTodoListService = {
            _serviceBrand: undefined,
            onDidUpdateTodos: Event.None,
            getTodos: (sessionResource) => sampleTodos,
            setTodos: (sessionResource, todos) => { },
            migrateTodos: (oldSessionResource, newSessionResource) => { }
        };
        // Mock the configuration service
        const mockConfigurationService = new TestConfigurationService();
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
        const firstItem = todoItems[0];
        assert.strictEqual(firstItem.getAttribute('role'), 'listitem');
        assert.ok(firstItem.getAttribute('aria-label')?.includes('First task'));
        assert.ok(firstItem.getAttribute('aria-label')?.includes('not started'));
        // Check second item (in-progress)
        const secondItem = todoItems[1];
        assert.ok(secondItem.getAttribute('aria-label')?.includes('Second task'));
        assert.ok(secondItem.getAttribute('aria-label')?.includes('in progress'));
        // Check third item (completed)
        const thirdItem = todoItems[2];
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
        const firstItem = todoItems[0];
        const firstAriaLabel = firstItem.getAttribute('aria-label');
        assert.ok(firstAriaLabel?.includes('First task'), 'First item aria-label should include title');
        assert.ok(firstAriaLabel?.includes('not started'), 'First item aria-label should include status');
        // Check second item (in-progress) - aria-label should include title and status
        const secondItem = todoItems[1];
        const secondAriaLabel = secondItem.getAttribute('aria-label');
        assert.ok(secondAriaLabel?.includes('Second task'), 'Second item aria-label should include title');
        assert.ok(secondAriaLabel?.includes('in progress'), 'Second item aria-label should include status');
        // Check third item (completed) - aria-label should include title and status
        const thirdItem = todoItems[2];
        const thirdAriaLabel = thirdItem.getAttribute('aria-label');
        assert.ok(thirdAriaLabel?.includes('Third task'), 'Third item aria-label should include title');
        assert.ok(thirdAriaLabel?.includes('completed'), 'Third item aria-label should include status');
    });
    test('widget displays properly when no todos exist', () => {
        // Create a new mock service with empty todos
        const emptyTodoListService = {
            _serviceBrand: undefined,
            onDidUpdateTodos: Event.None,
            getTodos: (sessionResource) => [],
            setTodos: (sessionResource, todos) => { },
            migrateTodos: (oldSessionResource, newSessionResource) => { }
        };
        const emptyConfigurationService = new TestConfigurationService();
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
    test('focus expands and places focus on the todo list', () => {
        widget.render(testSessionUri);
        const expandoButton = widget.domNode.querySelector('.todo-list-expand .monaco-button');
        assert.strictEqual(expandoButton?.getAttribute('aria-expanded'), 'false', 'Todo list should start collapsed');
        const focused = widget.focus();
        assert.strictEqual(focused, true, 'Focus should succeed when todos are present');
        assert.strictEqual(expandoButton?.getAttribute('aria-expanded'), 'true', 'Focus should expand the todo list');
        const todoListContainer = widget.domNode.querySelector('.todo-list-container');
        assert.ok(todoListContainer, 'Todo list container should exist');
        assert.ok(isAncestorOfActiveElement(todoListContainer), 'Todo list container should contain the active element after focusing');
    });
    test('hasTodos reports visibility state', () => {
        widget.render(testSessionUri);
        assert.strictEqual(widget.hasTodos(), true, 'Widget should report todos are present');
        const emptyTodoListService = {
            _serviceBrand: undefined,
            onDidUpdateTodos: Event.None,
            getTodos: () => [],
            setTodos: () => { },
            migrateTodos: () => { }
        };
        const emptyConfigurationService = new TestConfigurationService({ 'chat.todoListTool.descriptionField': true });
        const instantiationService = workbenchInstantiationService(undefined, store);
        instantiationService.stub(IChatTodoListService, emptyTodoListService);
        instantiationService.stub(IConfigurationService, emptyConfigurationService);
        const emptyWidget = store.add(instantiationService.createInstance(ChatTodoListWidget));
        mainWindow.document.body.appendChild(emptyWidget.domNode);
        emptyWidget.render(testSessionUri);
        assert.strictEqual(emptyWidget.hasTodos(), false, 'Widget should report no todos when the list is empty');
        if (emptyWidget.domNode.parentNode) {
            emptyWidget.domNode.parentNode.removeChild(emptyWidget.domNode);
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRvZG9MaXN0V2lkZ2V0LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0VG9kb0xpc3RXaWRnZXQudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDckYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDekcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0scUZBQXFGLENBQUM7QUFDL0gsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDeEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDdkcsT0FBTyxFQUFhLG9CQUFvQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFFbEcsTUFBTSxjQUFjLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO0FBRWpFLEtBQUssQ0FBQyxrQ0FBa0MsRUFBRSxHQUFHLEVBQUU7SUFDOUMsTUFBTSxLQUFLLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUV4RCxJQUFJLE1BQTBCLENBQUM7SUFFL0IsTUFBTSxXQUFXLEdBQWdCO1FB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