/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { trackFocus } from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { IconLabel } from '../../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../../base/browser/ui/list/list.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IContextKeyService, IContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../../platform/list/browser/listService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatTodo, IChatTodoListService } from '../../../common/tools/chatTodoListService.js';

class TodoListDelegate implements IListVirtualDelegate<IChatTodo> {
	getHeight(element: IChatTodo): number {
		return 22;
	}

	getTemplateId(element: IChatTodo): string {
		return TodoListRenderer.TEMPLATE_ID;
	}
}

interface ITodoListTemplate {
	readonly templateDisposables: DisposableStore;
	readonly todoElement: HTMLElement;
	readonly statusIcon: HTMLElement;
	readonly iconLabel: IconLabel;
}

class TodoListRenderer implements IListRenderer<IChatTodo, ITodoListTemplate> {
	static TEMPLATE_ID = 'todoListRenderer';
	readonly templateId: string = TodoListRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): ITodoListTemplate {
		const templateDisposables = new DisposableStore();
		const todoElement = dom.append(container, dom.$('li.todo-item'));
		todoElement.setAttribute('role', 'listitem');

		const statusIcon = dom.append(todoElement, dom.$('.todo-status-icon.codicon'));
		statusIcon.setAttribute('aria-hidden', 'true');

		const todoContent = dom.append(todoElement, dom.$('.todo-content'));
		const iconLabel = templateDisposables.add(new IconLabel(todoContent, { supportIcons: false }));

		return { templateDisposables, todoElement, statusIcon, iconLabel };
	}

	renderElement(todo: IChatTodo, index: number, templateData: ITodoListTemplate): void {
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

	disposeTemplate(templateData: ITodoListTemplate): void {
		templateData.templateDisposables.dispose();
	}

	private getStatusText(status: string): string {
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

	private getStatusIconClass(status: string): string {
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

	private getStatusIconColor(status: string): string {
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

export class ChatTodoListWidget extends Disposable {
	public readonly domNode: HTMLElement;

	private expandoButton!: Button;
	private expandIcon!: HTMLElement;
	private titleElement!: HTMLElement;
	private todoListContainer!: HTMLElement;
	private clearButtonContainer!: HTMLElement;
	private clearButton!: Button;
	private _currentSessionResource: URI | undefined;
	private _todoList: WorkbenchList<IChatTodo> | undefined;

	private readonly _inChatTodoListContextKey: IContextKey<boolean>;

	constructor(
		@IChatTodoListService private readonly chatTodoListService: IChatTodoListService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();

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

	public get height(): number {
		return this.domNode.style.display === 'none' ? 0 : this.domNode.offsetHeight;
	}

	private hideWidget(): void {
		this.domNode.style.display = 'none';
	}

	private createChatTodoWidget(): HTMLElement {
		const container = dom.$('.chat-todo-list-widget');
		container.style.display = 'none';

		// allow-any-unicode-next-line
		// Todo list at the top — always visible (scrollable)
		this.todoListContainer = dom.$('.todo-list-container');
		this.todoListContainer.style.display = 'block';
		this.todoListContainer.id = 'todo-list-container';
		this.todoListContainer.setAttribute('role', 'list');
		this.todoListContainer.setAttribute('aria-labelledby', 'todo-list-title');

		// allow-any-unicode-next-line
		// Footer bar at the bottom (hidden — tab bar provides context)
		const expandoContainer = dom.$('.todo-list-expand');
		expandoContainer.style.display = 'none';
		this.expandoButton = this._register(new Button(expandoContainer, {
			supportIcons: true
		}));

		// Create title section (no chevron icon)
		const titleSection = dom.$('.todo-list-title-section');

		// Keep expandIcon reference for compatibility but hide it
		this.expandIcon = dom.$('.expand-icon.codicon');
		this.expandIcon.style.display = 'none';

		this.titleElement = dom.$('.todo-list-title');
		this.titleElement.id = 'todo-list-title';
		this.titleElement.textContent = localize('chat.todoList.title', 'Todos');

		// Add clear button container to the expand element
		this.clearButtonContainer = dom.$('.todo-clear-button-container');
		this.createClearButton();

		titleSection.appendChild(this.titleElement);

		this.expandoButton.element.appendChild(titleSection);
		this.expandoButton.element.appendChild(this.clearButtonContainer);

		// List first, footer bar second (list opens upward from the bar)
		container.appendChild(this.todoListContainer);
		container.appendChild(expandoContainer);

		return container;
	}

	private createClearButton(): void {
		this.clearButton = new Button(this.clearButtonContainer, {
			supportIcons: true,
			ariaLabel: localize('chat.todoList.clearButton', 'Clear all todos'),
		});
		this.clearButton.element.tabIndex = 0;
		this.clearButton.icon = Codicon.clearAll;
		this._register(this.clearButton);

		this._register(this.clearButton.onDidClick(() => {
			this.clearAllTodos();
		}));
	}

	public render(sessionResource: URI | undefined): void {
		if (!sessionResource) {
			this.hideWidget();
			return;
		}

		if (!isEqual(this._currentSessionResource, sessionResource)) {
			this._currentSessionResource = sessionResource;
			this.hideWidget();
		}

		this.updateTodoDisplay();
	}

	public clear(sessionResource: URI | undefined, force: boolean = false): void {
		if (!sessionResource || this.domNode.style.display === 'none') {
			return;
		}

		const currentTodos = this.chatTodoListService.getTodos(sessionResource);
		const shouldClear = force || (currentTodos.length > 0 && !currentTodos.some(todo => todo.status !== 'completed'));
		if (shouldClear) {
			this.clearAllTodos();
		}
	}

	public hasTodos(): boolean {
		return this.domNode.classList.contains('has-todos') && !!this._todoList && this._todoList.length > 0;
	}

	public getTodoStats(): { completed: number; total: number } | undefined {
		if (!this._currentSessionResource) {
			return undefined;
		}
		const todos = this.chatTodoListService.getTodos(this._currentSessionResource);
		if (todos.length === 0) {
			return undefined;
		}
		const completedCount = todos.filter(todo => todo.status === 'completed').length;
		const hasInProgress = todos.some(todo => todo.status === 'in-progress');
		const currentTaskNumber = hasInProgress ? completedCount + 1 : Math.max(1, completedCount);
		return { completed: currentTaskNumber, total: todos.length };
	}

	public hasFocus(): boolean {
		return dom.isAncestorOfActiveElement(this.todoListContainer);
	}

	public focus(): boolean {
		if (!this.hasTodos()) {
			return false;
		}

		this._todoList?.domFocus();
		return this.hasFocus();
	}

	private updateTodoDisplay(): void {
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

	private renderTodoList(todoList: IChatTodo[]): void {
		this.updateTitleElement(this.titleElement, todoList);

		// Create or update the WorkbenchList
		if (!this._todoList) {
			this._todoList = this._register(this.instantiationService.createInstance(
				WorkbenchList<IChatTodo>,
				'ChatTodoListRenderer',
				this.todoListContainer,
				new TodoListDelegate(),
				[new TodoListRenderer()],
				{
					alwaysConsumeMouseWheel: false,
					accessibilityProvider: {
						getAriaLabel: (todo: IChatTodo) => {
							const statusText = this.getStatusText(todo.status);
							return localize('chat.todoList.item', '{0}, {1}', todo.title, statusText);
						},
						getWidgetAriaLabel: () => localize('chatTodoList', 'Chat Todo List')
					}
				}
			));
		}

		// Show ~3 items at a time, scrollable
		const maxItemsShown = 3;
		const itemsShown = Math.min(todoList.length, maxItemsShown);
		const height = itemsShown * 22;
		this._todoList.layout(height);
		this._todoList.getHTMLElement().style.height = `${height}px`;
		this._todoList.splice(0, this._todoList.length, todoList);

		// Update clear button state based on request progress
		this.updateClearButtonState();
	}

	private clearAllTodos(): void {
		if (!this._currentSessionResource) {
			return;
		}

		this.chatTodoListService.setTodos(this._currentSessionResource, []);
		this.hideWidget();
	}

	private updateClearButtonState(): void {
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
		} else {
			this.clearButton.setTitle(localize('chat.todoList.clearButton', 'Clear all todos'));
		}
	}

	private updateTitleElement(titleElement: HTMLElement, todoList: IChatTodo[]): void {
		titleElement.textContent = '';

		const completedCount = todoList.filter(todo => todo.status === 'completed').length;
		const totalCount = todoList.length;
		const inProgressTodos = todoList.filter(todo => todo.status === 'in-progress');
		const currentTaskNumber = inProgressTodos.length > 0 ? completedCount + 1 : Math.max(1, completedCount);

		const titleText = dom.$('span');
		titleText.textContent = totalCount > 0 ?
			localize('chat.todoList.titleWithCount', 'Todos ({0}/{1})', currentTaskNumber, totalCount) :
			localize('chat.todoList.title', 'Todos');
		titleElement.appendChild(titleText);
	}

	private getStatusText(status: string): string {
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
}
