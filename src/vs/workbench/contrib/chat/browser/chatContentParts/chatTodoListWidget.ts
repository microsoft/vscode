/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { IconLabel } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IChatTodoListService, IChatTodo } from '../../common/chatTodoListService.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { TodoListToolDescriptionFieldSettingId } from '../../common/tools/manageTodoListTool.js';
import { URI } from '../../../../../base/common/uri.js';
import { isEqual } from '../../../../../base/common/resources.js';

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

	constructor(
		private readonly configurationService: IConfigurationService
	) { }

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

		// Update title with tooltip if description exists and description field is enabled
		const includeDescription = this.configurationService.getValue<boolean>(TodoListToolDescriptionFieldSettingId) !== false;
		const title = includeDescription && todo.description && todo.description.trim() ? todo.description : undefined;
		iconLabel.setLabel(todo.title, undefined, { title });

		// Update aria-label
		const statusText = this.getStatusText(todo.status);
		const ariaLabel = includeDescription && todo.description && todo.description.trim()
			? localize('chat.todoList.itemWithDescription', '{0}, {1}, {2}', todo.title, statusText, todo.description)
			: localize('chat.todoList.item', '{0}, {1}', todo.title, statusText);
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

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private _isExpanded: boolean = false;
	private _userManuallyExpanded: boolean = false;
	private expandoButton!: Button;
	private expandIcon!: HTMLElement;
	private titleElement!: HTMLElement;
	private todoListContainer!: HTMLElement;
	private clearButtonContainer!: HTMLElement;
	private clearButton!: Button;
	private _currentSessionResource: URI | undefined;
	private _todoList: WorkbenchList<IChatTodo> | undefined;

	constructor(
		@IChatTodoListService private readonly chatTodoListService: IChatTodoListService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();

		this.domNode = this.createChatTodoWidget();

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
		this._onDidChangeHeight.fire();
	}

	private createChatTodoWidget(): HTMLElement {
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

	private createClearButton(): void {
		this.clearButton = new Button(this.clearButtonContainer, {
			supportIcons: true,
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
			this._userManuallyExpanded = false;
			this._currentSessionResource = sessionResource;
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
		} else {
			this.hideWidget();
		}
	}

	private updateTodoDisplay(): void {
		if (!this._currentSessionResource) {
			return;
		}

		const todoList = this.chatTodoListService.getTodos(this._currentSessionResource);
		const shouldShow = todoList.length > 2;

		if (!shouldShow) {
			this.domNode.classList.remove('has-todos');
			return;
		}

		this.domNode.classList.add('has-todos');
		this.renderTodoList(todoList);
		this.domNode.style.display = 'block';
		this._onDidChangeHeight.fire();
	}

	private renderTodoList(todoList: IChatTodo[]): void {
		this.updateTitleElement(this.titleElement, todoList);

		const allIncomplete = todoList.every(todo => todo.status === 'not-started');
		if (allIncomplete) {
			this._userManuallyExpanded = false;
		}

		// Create or update the WorkbenchList
		if (!this._todoList) {
			this._todoList = this._register(this.instantiationService.createInstance(
				WorkbenchList<IChatTodo>,
				'ChatTodoListRenderer',
				this.todoListContainer,
				new TodoListDelegate(),
				[new TodoListRenderer(this.configurationService)],
				{
					alwaysConsumeMouseWheel: false,
					accessibilityProvider: {
						getAriaLabel: (todo: IChatTodo) => {
							const statusText = this.getStatusText(todo.status);
							const includeDescription = this.configurationService.getValue<boolean>(TodoListToolDescriptionFieldSettingId) !== false;
							return includeDescription && todo.description && todo.description.trim()
								? localize('chat.todoList.itemWithDescription', '{0}, {1}, {2}', todo.title, statusText, todo.description)
								: localize('chat.todoList.item', '{0}, {1}', todo.title, statusText);
						},
						getWidgetAriaLabel: () => localize('chatTodoList', 'Chat Todo List')
					}
				}
			));
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
			this._onDidChangeHeight.fire();
		}
	}

	private toggleExpanded(): void {
		this._isExpanded = !this._isExpanded;
		this._userManuallyExpanded = true;

		this.expandIcon.classList.toggle('codicon-chevron-down', this._isExpanded);
		this.expandIcon.classList.toggle('codicon-chevron-right', !this._isExpanded);

		this.todoListContainer.style.display = this._isExpanded ? 'block' : 'none';

		if (this._currentSessionResource) {
			const todoList = this.chatTodoListService.getTodos(this._currentSessionResource);
			this.updateTitleElement(this.titleElement, todoList);
		}

		this._onDidChangeHeight.fire();
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
		} else {
			// Show first in-progress todo, or if none, the first not-started todo
			const todoToShow = firstInProgressTodo || firstNotStartedTodo;
			if (todoToShow) {
				const icon = dom.$('.codicon');
				if (todoToShow === firstInProgressTodo) {
					icon.classList.add('codicon-record');
					icon.style.color = 'var(--vscode-charts-blue)';
				} else {
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
