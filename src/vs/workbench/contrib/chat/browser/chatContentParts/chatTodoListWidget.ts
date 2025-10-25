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
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IChatTodoListService, IChatTodo } from '../../common/chatTodoListService.js';
import { TodoListToolDescriptionFieldSettingId } from '../../common/tools/manageTodoListTool.js';

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
	readonly statusElement: HTMLElement;
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
		const statusElement = dom.append(todoContent, dom.$('.todo-status-text'));
		statusElement.style.position = 'absolute';
		statusElement.style.left = '-10000px';
		statusElement.style.width = '1px';
		statusElement.style.height = '1px';
		statusElement.style.overflow = 'hidden';

		return { templateDisposables, todoElement, statusIcon, iconLabel, statusElement };
	}

	renderElement(todo: IChatTodo, index: number, templateData: ITodoListTemplate): void {
		const { todoElement, statusIcon, iconLabel, statusElement } = templateData;

		// Update status icon
		statusIcon.className = 'todo-status-icon codicon ' + this.getStatusIconClass(todo.status);
		statusIcon.style.color = this.getStatusIconColor(todo.status);

		// Update title with tooltip if description exists and description field is enabled
		const includeDescription = this.configurationService.getValue<boolean>(TodoListToolDescriptionFieldSettingId) !== false;
		const title = includeDescription && todo.description && todo.description.trim() ? todo.description : undefined;
		iconLabel.setLabel(todo.title, undefined, { title });

		// Update hidden status text for screen readers
		const statusText = this.getStatusText(todo.status);
		statusElement.id = `todo-status-${index}`;
		statusElement.textContent = statusText;

		// Update aria-label
		const ariaLabel = includeDescription && todo.description && todo.description.trim()
			? localize('chat.todoList.itemWithDescription', '{0}, {1}, {2}', todo.title, statusText, todo.description)
			: localize('chat.todoList.item', '{0}, {1}', todo.title, statusText);
		todoElement.setAttribute('aria-label', ariaLabel);
		todoElement.setAttribute('aria-describedby', `todo-status-${index}`);
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

	private _isExpanded: boolean = true;
	private _userManuallyExpanded: boolean = false;
	private expandoElement!: HTMLElement;
	private todoListContainer!: HTMLElement;
	private clearButtonContainer!: HTMLElement;
	private clearButton!: Button;
	private _currentSessionId: string | undefined;
	private _userHasScrolledManually: boolean = false;
	private _todoList: WorkbenchList<IChatTodo> | undefined;
	private readonly _listDisposables = this._register(new DisposableStore());

	constructor(
		@IChatTodoListService private readonly chatTodoListService: IChatTodoListService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		this.domNode = this.createChatTodoWidget();
	}

	public get height(): number {
		return this.domNode.style.display === 'none' ? 0 : this.domNode.offsetHeight;
	}

	private createChatTodoWidget(): HTMLElement {
		const container = dom.$('.chat-todo-list-widget');
		container.style.display = 'none';

		this.expandoElement = dom.$('.todo-list-expand');
		this.expandoElement.setAttribute('role', 'button');
		this.expandoElement.setAttribute('aria-expanded', 'true');
		this.expandoElement.setAttribute('tabindex', '0');
		this.expandoElement.setAttribute('aria-controls', 'todo-list-container');

		// Create title section to group icon and title
		const titleSection = dom.$('.todo-list-title-section');

		const expandIcon = dom.$('.expand-icon.codicon');
		expandIcon.classList.add(this._isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right');
		expandIcon.setAttribute('aria-hidden', 'true');

		const titleElement = dom.$('.todo-list-title');
		titleElement.id = 'todo-list-title';
		titleElement.textContent = localize('chat.todoList.title', 'Todos');

		// Add clear button container to the expand element
		this.clearButtonContainer = dom.$('.todo-clear-button-container');
		this.createClearButton();

		titleSection.appendChild(expandIcon);
		titleSection.appendChild(titleElement);

		this.expandoElement.appendChild(titleSection);
		this.expandoElement.appendChild(this.clearButtonContainer);

		this.todoListContainer = dom.$('.todo-list-container');
		this.todoListContainer.style.display = this._isExpanded ? 'block' : 'none';
		this.todoListContainer.id = 'todo-list-container';
		this.todoListContainer.setAttribute('role', 'list');
		this.todoListContainer.setAttribute('aria-labelledby', 'todo-list-title');

		container.appendChild(this.expandoElement);
		container.appendChild(this.todoListContainer);

		this._register(dom.addDisposableListener(this.expandoElement, 'click', () => {
			this.toggleExpanded();
		}));

		this._register(dom.addDisposableListener(this.expandoElement, 'keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.toggleExpanded();
			}
		}));

		this._register(dom.addDisposableListener(this.todoListContainer, 'scroll', () => {
			this.updateScrollShadow();
			this._userHasScrolledManually = true;
		}));

		return container;
	}

	private createClearButton(): void {
		this.clearButton = new Button(this.clearButtonContainer, {
			supportIcons: true,
			title: localize('chat.todoList.clearButton', 'Clear all todos'),
			ariaLabel: localize('chat.todoList.clearButton.ariaLabel', 'Clear all todos')
		});
		this.clearButton.element.tabIndex = 0;
		this.clearButton.icon = Codicon.clearAll;
		this._register(this.clearButton);

		this._register(this.clearButton.onDidClick(() => {
			this.clearAllTodos();
		}));
	}

	public render(sessionId: string | undefined): void {
		if (!sessionId) {
			this.domNode.style.display = 'none';
			this._onDidChangeHeight.fire();
			return;
		}

		if (this._currentSessionId !== sessionId) {
			this._userHasScrolledManually = false;
			this._userManuallyExpanded = false;
			this._currentSessionId = sessionId;
		}

		this.updateTodoDisplay();
	}

	public clear(sessionId: string | undefined, force: boolean = false): void {
		if (!sessionId || this.domNode.style.display === 'none') {
			return;
		}

		const currentTodos = this.chatTodoListService.getTodos(sessionId);
		const shouldClear = force || !currentTodos.some(todo => todo.status !== 'completed');
		if (shouldClear) {
			this.clearAllTodos();
		}
	}

	private updateTodoDisplay(): void {
		if (!this._currentSessionId) {
			return;
		}

		const todoList = this.chatTodoListService.getTodos(this._currentSessionId);
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
		const titleElement = this.expandoElement.querySelector('.todo-list-title') as HTMLElement;
		if (titleElement) {
			this.updateTitleElement(titleElement, todoList);
		}

		const allIncomplete = todoList.every(todo => todo.status === 'not-started');
		if (allIncomplete) {
			this._userHasScrolledManually = false;
			this._userManuallyExpanded = false;
		}

		let lastActiveIndex = -1;
		let firstCompletedIndex = -1;
		let firstPendingAfterCompletedIndex = -1;

		// Track indices for smart scrolling
		todoList.forEach((todo, index) => {
			if (todo.status === 'completed' && firstCompletedIndex === -1) {
				firstCompletedIndex = index;
			}
			if (todo.status === 'in-progress' || todo.status === 'completed') {
				lastActiveIndex = index;
			}
			if (firstCompletedIndex !== -1 && todo.status === 'not-started' && firstPendingAfterCompletedIndex === -1) {
				firstPendingAfterCompletedIndex = index;
			}
		});

		// Create or update the WorkbenchList
		if (!this._todoList) {
			this._todoList = this.instantiationService.createInstance(
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
			);

			this._listDisposables.add(this._todoList);
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

		// Only auto-collapse if there are in-progress or completed tasks AND user hasn't manually expanded
		if ((hasInProgressTask || hasCompletedTask) && this._isExpanded && !this._userManuallyExpanded) {
			this._isExpanded = false;
			this.expandoElement.setAttribute('aria-expanded', 'false');
			this.todoListContainer.style.display = 'none';

			const expandIcon = this.expandoElement.querySelector('.expand-icon') as HTMLElement;
			if (expandIcon) {
				expandIcon.classList.remove('codicon-chevron-down');
				expandIcon.classList.add('codicon-chevron-right');
			}

			this.updateTitleElement(titleElement, todoList);
			this._onDidChangeHeight.fire();
		}

		// Auto-scroll to show the most relevant item
		this.scrollToRelevantItem(lastActiveIndex, firstCompletedIndex, firstPendingAfterCompletedIndex, todoList.length);
	}

	private toggleExpanded(): void {
		this._isExpanded = !this._isExpanded;
		this._userManuallyExpanded = true;

		const expandIcon = this.expandoElement.querySelector('.expand-icon') as HTMLElement;
		if (expandIcon) {
			expandIcon.classList.toggle('codicon-chevron-down', this._isExpanded);
			expandIcon.classList.toggle('codicon-chevron-right', !this._isExpanded);
		}

		this.todoListContainer.style.display = this._isExpanded ? 'block' : 'none';

		if (this._currentSessionId) {
			const todoList = this.chatTodoListService.getTodos(this._currentSessionId);
			const titleElement = this.expandoElement.querySelector('.todo-list-title') as HTMLElement;
			if (titleElement) {
				this.updateTitleElement(titleElement, todoList);
			}
		}

		this._onDidChangeHeight.fire();
	}

	private clearAllTodos(): void {
		if (!this._currentSessionId) {
			return;
		}

		this.chatTodoListService.setTodos(this._currentSessionId, []);
		this.domNode.style.display = 'none';
		this._onDidChangeHeight.fire();
	}

	private scrollToRelevantItem(lastActiveIndex: number, firstCompletedIndex: number, firstPendingAfterCompletedIndex: number, totalItems: number): void {
		if (totalItems <= 6 || this._userHasScrolledManually) {
			return;
		}

		setTimeout(() => {
			const items = this.todoListContainer.querySelectorAll('.todo-item');

			if (lastActiveIndex === -1 && firstCompletedIndex === -1) {
				this.todoListContainer.scrollTo({
					top: 0,
					behavior: 'instant'
				});
				return;
			}

			let targetIndex = lastActiveIndex;

			// Only show next pending if no in-progress items exist
			if (firstCompletedIndex !== -1 && firstPendingAfterCompletedIndex !== -1 && lastActiveIndex < firstCompletedIndex) {
				targetIndex = firstPendingAfterCompletedIndex;
			}

			if (targetIndex >= 0 && targetIndex < items.length) {
				const targetElement = items[targetIndex] as HTMLElement;
				targetElement.scrollIntoView({
					behavior: 'smooth',
					block: 'center',
					inline: 'nearest'
				});
			}
		}, 50);
	}

	private updateScrollShadow(): void {
		this.domNode.classList.toggle('scrolled', this.todoListContainer.scrollTop > 0);
	}

	private updateTitleElement(titleElement: HTMLElement, todoList: IChatTodo[]): void {
		titleElement.textContent = '';

		const completedCount = todoList.filter(todo => todo.status === 'completed').length;
		const totalCount = todoList.length;
		const inProgressTodos = todoList.filter(todo => todo.status === 'in-progress');
		const firstInProgressTodo = inProgressTodos.length > 0 ? inProgressTodos[0] : undefined;
		const notStartedTodos = todoList.filter(todo => todo.status === 'not-started');
		const firstNotStartedTodo = notStartedTodos.length > 0 ? notStartedTodos[0] : undefined;

		// Calculate current task number (1-indexed)
		const currentTaskNumber = inProgressTodos.length > 0 ? completedCount + 1 : Math.max(1, completedCount);
		const progressCount = totalCount > 0 ? ` (${currentTaskNumber}/${totalCount})` : '';

		const titleText = dom.$('span');
		titleText.textContent = this._isExpanded
			? localize('chat.todoList.title', 'Todos') + progressCount
			: progressCount;
		titleElement.appendChild(titleText);

		const expandButtonLabel = this._isExpanded
			? localize('chat.todoList.collapseButton', 'Collapse Todos {0}', progressCount)
			: localize('chat.todoList.expandButton', 'Expand Todos {0}', progressCount);
		this.expandoElement.setAttribute('aria-label', expandButtonLabel);
		this.expandoElement.setAttribute('aria-expanded', this._isExpanded ? 'true' : 'false');
		if (!this._isExpanded) {
			// Show first in-progress todo, or if none, the first not-started todo
			const todoToShow = firstInProgressTodo || firstNotStartedTodo;
			if (todoToShow) {
				const separator = dom.$('span');
				separator.textContent = ' - ';
				separator.style.marginLeft = '4px';
				titleElement.appendChild(separator);

				const icon = dom.$('.codicon');
				if (todoToShow === firstInProgressTodo) {
					icon.classList.add('codicon-record');
					icon.style.color = 'var(--vscode-charts-blue)';
				} else {
					icon.classList.add('codicon-circle-outline');
					icon.style.color = 'var(--vscode-foreground)';
				}
				icon.style.marginLeft = '4px';
				icon.style.marginRight = '4px';
				icon.style.verticalAlign = 'middle';
				titleElement.appendChild(icon);

				const todoText = dom.$('span');
				todoText.textContent = todoToShow.title;
				todoText.style.verticalAlign = 'middle';
				todoText.style.overflow = 'hidden';
				todoText.style.textOverflow = 'ellipsis';
				todoText.style.whiteSpace = 'nowrap';
				todoText.style.minWidth = '0';
				titleElement.appendChild(todoText);
			}
			// Show "Done" when all tasks are completed
			else if (completedCount > 0 && completedCount === totalCount) {
				const separator = dom.$('span');
				separator.textContent = ' - ';
				separator.style.marginLeft = '4px';
				titleElement.appendChild(separator);

				const doneText = dom.$('span');
				doneText.textContent = localize('chat.todoList.allDone', 'Done');
				doneText.style.marginLeft = '4px';
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
