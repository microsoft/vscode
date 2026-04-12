/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../../../../base/browser/dom.js';
import { trackFocus } from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { IconLabel } from '../../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { localize } from '../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../../platform/list/browser/listService.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatTodoListService } from '../../../common/tools/chatTodoListService.js';
class TodoListDelegate {
    getHeight(element) {
        return 22;
    }
    getTemplateId(element) {
        return TodoListRenderer.TEMPLATE_ID;
    }
}
class TodoListRenderer {
    constructor() {
        this.templateId = TodoListRenderer.TEMPLATE_ID;
    }
    static { this.TEMPLATE_ID = 'todoListRenderer'; }
    renderTemplate(container) {
        const templateDisposables = new DisposableStore();
        const todoElement = dom.append(container, dom.$('li.todo-item'));
        todoElement.setAttribute('role', 'listitem');
        const statusIcon = dom.append(todoElement, dom.$('.todo-status-icon.codicon'));
        statusIcon.setAttribute('aria-hidden', 'true');
        const todoContent = dom.append(todoElement, dom.$('.todo-content'));
        const iconLabel = templateDisposables.add(new IconLabel(todoContent, { supportIcons: false }));
        return { templateDisposables, todoElement, statusIcon, iconLabel };
    }
    renderElement(todo, index, templateData) {
        const { todoElement, statusIcon, iconLabel } = templateData;
        // Update status icon
        statusIcon.className = `todo-status-icon codicon ${this.getStatusIconClass(todo.status)}`;
        statusIcon.style.color = this.getStatusIconColor(todo.status);
        iconLabel.setLabel(todo.title);
        // Update aria-label
        const statusText = this.getStatusText(todo.status);
        const ariaLabel = localize('chat.todoList.item', '{0}, {1}', todo.title, statusText);
        todoElement.setAttribute('aria-label', ariaLabel);
    }
    disposeTemplate(templateData) {
        templateData.templateDisposables.dispose();
    }
    getStatusText(status) {
        switch (status) {
            case 'completed':
                return localize('chat.todoList.status.completed', 'completed');
            case 'in-progress':
                return localize('chat.todoList.status.inProgress', 'in progress');
            case 'not-started':
            default:
                return localize('chat.todoList.status.notStarted', 'not started');
        }
    }
    getStatusIconClass(status) {
        switch (status) {
            case 'completed':
                return 'codicon-pass';
            case 'in-progress':
                return 'codicon-record';
            case 'not-started':
            default:
                return 'codicon-circle-outline';
        }
    }
    getStatusIconColor(status) {
        switch (status) {
            case 'completed':
                return 'var(--vscode-charts-green)';
            case 'in-progress':
                return 'var(--vscode-charts-blue)';
            case 'not-started':
            default:
                return 'var(--vscode-foreground)';
        }
    }
}
let ChatTodoListWidget = class ChatTodoListWidget extends Disposable {
    constructor(chatTodoListService, instantiationService, contextKeyService, telemetryService) {
        super();
        this.chatTodoListService = chatTodoListService;
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.telemetryService = telemetryService;
        this._isExpanded = false;
        this._userManuallyExpanded = false;
        this._inChatTodoListContextKey = ChatContextKeys.inChatTodoList.bindTo(contextKeyService);
        this.domNode = this.createChatTodoWidget();
        // Track focus state for context key
        const focusTracker = this._register(trackFocus(this.domNode));
        this._register(focusTracker.onDidFocus(() => this._inChatTodoListContextKey.set(true)));
        this._register(focusTracker.onDidBlur(() => this._inChatTodoListContextKey.set(false)));
        // Listen to context key changes to update clear button state when request state changes
        this._register(this.contextKeyService.onDidChangeContext(e => {
            if (e.affectsSome(new Set([ChatContextKeys.requestInProgress.key]))) {
                this.updateClearButtonState();
            }
        }));
    }
    get height() {
        return this.domNode.style.display === 'none' ? 0 : this.domNode.offsetHeight;
    }
    hideWidget() {
        this.domNode.style.display = 'none';
    }
    createChatTodoWidget() {
        const container = dom.$('.chat-todo-list-widget');
        container.style.display = 'none';
        const expandoContainer = dom.$('.todo-list-expand');
        this.expandoButton = this._register(new Button(expandoContainer, {
            supportIcons: true
        }));
        this.expandoButton.element.setAttribute('aria-expanded', String(this._isExpanded));
        this.expandoButton.element.setAttribute('aria-controls', 'todo-list-container');
        // Create title section to group icon and title
        const titleSection = dom.$('.todo-list-title-section');
        this.expandIcon = dom.$('.expand-icon.codicon');
        this.expandIcon.classList.add(this._isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right');
        this.expandIcon.setAttribute('aria-hidden', 'true');
        this.titleElement = dom.$('.todo-list-title');
        this.titleElement.id = 'todo-list-title';
        this.titleElement.textContent = localize('chat.todoList.title', 'Todos');
        // Add clear button container to the expand element
        this.clearButtonContainer = dom.$('.todo-clear-button-container');
        this.createClearButton();
        titleSection.appendChild(this.expandIcon);
        titleSection.appendChild(this.titleElement);
        this.expandoButton.element.appendChild(titleSection);
        this.expandoButton.element.appendChild(this.clearButtonContainer);
        this.todoListContainer = dom.$('.todo-list-container');
        this.todoListContainer.style.display = this._isExpanded ? 'block' : 'none';
        this.todoListContainer.id = 'todo-list-container';
        this.todoListContainer.setAttribute('role', 'list');
        this.todoListContainer.setAttribute('aria-labelledby', 'todo-list-title');
        container.appendChild(expandoContainer);
        container.appendChild(this.todoListContainer);
        this._register(this.expandoButton.onDidClick(() => {
            this.toggleExpanded();
        }));
        return container;
    }
    createClearButton() {
        this.clearButton = new Button(this.clearButtonContainer, {
            supportIcons: true,
            ariaLabel: localize('chat.todoList.clearButton', 'Clear all todos'),
        });
        this.clearButton.element.tabIndex = 0;
        this.clearButton.icon = Codicon.clearAll;
        this._register(this.clearButton);
        this._register(this.clearButton.onDidClick(() => {
            const todoCount = this._currentSessionResource ? this.chatTodoListService.getTodos(this._currentSessionResource).length : 0;
            this.telemetryService.publicLog2('chatTodoListWidget', {
                action: 'clear',
                todoCount
            });
            this.clearAllTodos();
        }));
    }
    render(sessionResource) {
        if (!sessionResource) {
            this.hideWidget();
            return;
        }
        if (!isEqual(this._currentSessionResource, sessionResource)) {
            this._userManuallyExpanded = false;
            this._currentSessionResource = sessionResource;
            this.hideWidget();
        }
        this.updateTodoDisplay();
    }
    clear(sessionResource, force = false) {
        if (!sessionResource || this.domNode.style.display === 'none') {
            return;
        }
        const currentTodos = this.chatTodoListService.getTodos(sessionResource);
        const shouldClear = force || (currentTodos.length > 0 && !currentTodos.some(todo => todo.status !== 'completed'));
        if (shouldClear) {
            this.clearAllTodos();
        }
    }
    hasTodos() {
        return this.domNode.classList.contains('has-todos') && !!this._todoList && this._todoList.length > 0;
    }
    hasFocus() {
        return dom.isAncestorOfActiveElement(this.todoListContainer);
    }
    focus() {
        if (!this.hasTodos()) {
            return false;
        }
        if (!this._isExpanded) {
            this.toggleExpanded();
        }
        this._todoList?.domFocus();
        return this.hasFocus();
    }
    updateTodoDisplay() {
        if (!this._currentSessionResource) {
            return;
        }
        const todoList = this.chatTodoListService.getTodos(this._currentSessionResource);
        const shouldShow = todoList.length > 0;
        if (!shouldShow) {
            this.domNode.classList.remove('has-todos');
            return;
        }
        this.domNode.classList.add('has-todos');
        this.renderTodoList(todoList);
        this.domNode.style.display = 'block';
    }
    renderTodoList(todoList) {
        this.updateTitleElement(this.titleElement, todoList);
        const allIncomplete = todoList.every(todo => todo.status === 'not-started');
        if (allIncomplete) {
            this._userManuallyExpanded = false;
        }
        // Create or update the WorkbenchList
        if (!this._todoList) {
            this._todoList = this._register(this.instantiationService.createInstance((WorkbenchList), 'ChatTodoListRenderer', this.todoListContainer, new TodoListDelegate(), [new TodoListRenderer()], {
                alwaysConsumeMouseWheel: false,
                accessibilityProvider: {
                    getAriaLabel: (todo) => {
                        const statusText = this.getStatusText(todo.status);
                        return localize('chat.todoList.item', '{0}, {1}', todo.title, statusText);
                    },
                    getWidgetAriaLabel: () => localize('chatTodoList', 'Chat Todo List')
                }
            }));
        }
        // Update list contents
        const maxItemsShown = 6;
        const itemsShown = Math.min(todoList.length, maxItemsShown);
        const height = itemsShown * 22;
        this._todoList.layout(height);
        this._todoList.getHTMLElement().style.height = `${height}px`;
        this._todoList.splice(0, this._todoList.length, todoList);
        const hasInProgressTask = todoList.some(todo => todo.status === 'in-progress');
        const hasCompletedTask = todoList.some(todo => todo.status === 'completed');
        // Update clear button state based on request progress
        this.updateClearButtonState();
        // Only auto-collapse if there are in-progress or completed tasks AND user hasn't manually expanded
        if ((hasInProgressTask || hasCompletedTask) && this._isExpanded && !this._userManuallyExpanded) {
            this._isExpanded = false;
            this.expandoButton.element.setAttribute('aria-expanded', 'false');
            this.todoListContainer.style.display = 'none';
            this.expandIcon.classList.remove('codicon-chevron-down');
            this.expandIcon.classList.add('codicon-chevron-right');
            this.updateTitleElement(this.titleElement, todoList);
        }
    }
    toggleExpanded() {
        this._isExpanded = !this._isExpanded;
        this._userManuallyExpanded = true;
        this.expandIcon.classList.toggle('codicon-chevron-down', this._isExpanded);
        this.expandIcon.classList.toggle('codicon-chevron-right', !this._isExpanded);
        this.todoListContainer.style.display = this._isExpanded ? 'block' : 'none';
        const todoCount = this._currentSessionResource ? this.chatTodoListService.getTodos(this._currentSessionResource).length : 0;
        this.telemetryService.publicLog2('chatTodoListWidget', {
            action: this._isExpanded ? 'expand' : 'collapse',
            todoCount
        });
        if (this._currentSessionResource) {
            const todoList = this.chatTodoListService.getTodos(this._currentSessionResource);
            this.updateTitleElement(this.titleElement, todoList);
        }
    }
    clearAllTodos() {
        if (!this._currentSessionResource) {
            return;
        }
        this.chatTodoListService.setTodos(this._currentSessionResource, []);
        this.hideWidget();
    }
    updateClearButtonState() {
        if (!this._currentSessionResource) {
            return;
        }
        const todoList = this.chatTodoListService.getTodos(this._currentSessionResource);
        const hasInProgressTask = todoList.some(todo => todo.status === 'in-progress');
        const isRequestInProgress = ChatContextKeys.requestInProgress.getValue(this.contextKeyService) ?? false;
        const shouldDisable = isRequestInProgress && hasInProgressTask;
        this.clearButton.enabled = !shouldDisable;
        // Update tooltip based on state
        if (shouldDisable) {
            this.clearButton.setTitle(localize('chat.todoList.clearButton.disabled', 'Cannot clear todos while a task is in progress'));
        }
        else {
            this.clearButton.setTitle(localize('chat.todoList.clearButton', 'Clear all todos'));
        }
    }
    updateTitleElement(titleElement, todoList) {
        titleElement.textContent = '';
        const completedCount = todoList.filter(todo => todo.status === 'completed').length;
        const totalCount = todoList.length;
        const inProgressTodos = todoList.filter(todo => todo.status === 'in-progress');
        const firstInProgressTodo = inProgressTodos.length > 0 ? inProgressTodos[0] : undefined;
        const notStartedTodos = todoList.filter(todo => todo.status === 'not-started');
        const firstNotStartedTodo = notStartedTodos.length > 0 ? notStartedTodos[0] : undefined;
        const currentTaskNumber = inProgressTodos.length > 0 ? completedCount + 1 : Math.max(1, completedCount);
        const expandButtonLabel = this._isExpanded
            ? localize('chat.todoList.collapseButton', 'Collapse Todos')
            : localize('chat.todoList.expandButton', 'Expand Todos');
        this.expandoButton.element.setAttribute('aria-label', expandButtonLabel);
        this.expandoButton.element.setAttribute('aria-expanded', this._isExpanded ? 'true' : 'false');
        if (this._isExpanded) {
            const titleText = dom.$('span');
            titleText.textContent = totalCount > 0 ?
                localize('chat.todoList.titleWithCount', 'Todos ({0}/{1})', currentTaskNumber, totalCount) :
                localize('chat.todoList.title', 'Todos');
            titleElement.appendChild(titleText);
        }
        else {
            // Show first in-progress todo, or if none, the first not-started todo
            const todoToShow = firstInProgressTodo || firstNotStartedTodo;
            if (todoToShow) {
                const icon = dom.$('.codicon');
                if (todoToShow === firstInProgressTodo) {
                    icon.classList.add('codicon-record');
                    icon.style.color = 'var(--vscode-charts-blue)';
                }
                else {
                    icon.classList.add('codicon-circle-outline');
                    icon.style.color = 'var(--vscode-foreground)';
                }
                icon.style.marginRight = '4px';
                icon.style.verticalAlign = 'middle';
                titleElement.appendChild(icon);
                const todoText = dom.$('span');
                todoText.textContent = localize('chat.todoList.currentTask', '{0} ({1}/{2})', todoToShow.title, currentTaskNumber, totalCount);
                todoText.style.verticalAlign = 'middle';
                todoText.style.overflow = 'hidden';
                todoText.style.textOverflow = 'ellipsis';
                todoText.style.whiteSpace = 'nowrap';
                todoText.style.minWidth = '0';
                titleElement.appendChild(todoText);
            }
            // Show "Done" when all tasks are completed
            else if (completedCount > 0 && completedCount === totalCount) {
                const doneText = dom.$('span');
                doneText.textContent = localize('chat.todoList.titleWithCount', 'Todos ({0}/{1})', totalCount, totalCount);
                doneText.style.verticalAlign = 'middle';
                titleElement.appendChild(doneText);
            }
        }
    }
    getStatusText(status) {
        switch (status) {
            case 'completed':
                return localize('chat.todoList.status.completed', 'completed');
            case 'in-progress':
                return localize('chat.todoList.status.inProgress', 'in progress');
            case 'not-started':
            default:
                return localize('chat.todoList.status.notStarted', 'not started');
        }
    }
};
ChatTodoListWidget = __decorate([
    __param(0, IChatTodoListService),
    __param(1, IInstantiationService),
    __param(2, IContextKeyService),
    __param(3, ITelemetryService)
], ChatTodoListWidget);
export { ChatTodoListWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRvZG9MaXN0V2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRUb2RvTGlzdFdpZGdldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLHVDQUF1QyxDQUFDO0FBQzdELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDNUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBRXJGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUVyRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLGtCQUFrQixFQUFlLE1BQU0sNERBQTRELENBQUM7QUFDN0csT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RSxPQUFPLEVBQWEsb0JBQW9CLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUUvRixNQUFNLGdCQUFnQjtJQUNyQixTQUFTLENBQUMsT0FBa0I7UUFDM0Is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