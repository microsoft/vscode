/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IChatTodoListService, IChatTodo } from '../../common/chatTodoListService.js';

export class ChatTodoListWidget extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private _isExpanded: boolean = true;
	private expandoElement!: HTMLElement;
	private todoListContainer!: HTMLElement;
	private clearButtonContainer!: HTMLElement;
	private clearButton!: Button;
	private _currentSessionId: string | undefined;

	constructor(
		@IChatTodoListService private readonly chatTodoListService: IChatTodoListService
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

		// Create title section to group icon and title
		const titleSection = dom.$('.todo-list-title-section');

		const expandIcon = dom.$('.expand-icon.codicon');
		expandIcon.classList.add(this._isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right');

		const titleElement = dom.$('.todo-list-title');
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
		this._currentSessionId = sessionId;
		this.updateTodoDisplay();
	}

	public clear(sessionId: string | undefined): void {
		if (!sessionId || this.domNode.style.display === 'none') {
			return;
		}

		const currentTodos = this.chatTodoListService.getTodos(sessionId);
		const todoListCompleted = !currentTodos.some(todo => todo.status !== 'completed');
		if (todoListCompleted) {
			this.clearAllTodos();
		}
	}

	private updateTodoDisplay(): void {
		if (!this._currentSessionId) {
			this.domNode.style.display = 'none';
			this._onDidChangeHeight.fire();
			return;
		}

		const todoList = this.chatTodoListService.getTodos(this._currentSessionId);

		if (todoList.length > 0) {
			this.renderTodoList(todoList);
			this.domNode.style.display = 'block';
		} else {
			this.domNode.style.display = 'none';
		}

		this._onDidChangeHeight.fire();
	}

	private renderTodoList(todoList: IChatTodo[]): void {
		this.todoListContainer.textContent = '';

		const titleElement = this.expandoElement.querySelector('.todo-list-title') as HTMLElement;
		if (titleElement) {
			titleElement.textContent = this.getProgressText(todoList);
		}

		let lastActiveIndex = -1;
		let firstCompletedIndex = -1;
		let firstPendingAfterCompletedIndex = -1;

		todoList.forEach((todo, index) => {
			const todoElement = dom.$('.todo-item');

			// Add tooltip if description exists
			if (todo.description && todo.description.trim()) {
				todoElement.title = todo.description;
			}

			const statusIcon = dom.$('.todo-status-icon.codicon');
			statusIcon.classList.add(this.getStatusIconClass(todo.status));
			statusIcon.style.color = this.getStatusIconColor(todo.status);

			const todoContent = dom.$('.todo-content');

			const titleElement = dom.$('.todo-title');
			titleElement.textContent = todo.title;

			todoContent.appendChild(titleElement);

			todoElement.appendChild(statusIcon);
			todoElement.appendChild(todoContent);

			this.todoListContainer.appendChild(todoElement);

			// Track indices for smart scrolling
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

		// Auto-scroll to show the most relevant item
		this.scrollToRelevantItem(lastActiveIndex, firstCompletedIndex, firstPendingAfterCompletedIndex, todoList.length);
	}

	private toggleExpanded(): void {
		this._isExpanded = !this._isExpanded;

		const expandIcon = this.expandoElement.querySelector('.expand-icon') as HTMLElement;
		if (expandIcon) {
			expandIcon.classList.toggle('codicon-chevron-down', this._isExpanded);
			expandIcon.classList.toggle('codicon-chevron-right', !this._isExpanded);
		}

		this.expandoElement.setAttribute('aria-expanded', this._isExpanded.toString());
		this.todoListContainer.style.display = this._isExpanded ? 'block' : 'none';

		this._onDidChangeHeight.fire();
	}

	private clearAllTodos(): void {
		if (!this._currentSessionId) {
			return;
		}

		this.chatTodoListService.setTodos(this._currentSessionId, []);
		this.updateTodoDisplay();
	}

	private scrollToRelevantItem(lastActiveIndex: number, firstCompletedIndex: number, firstPendingAfterCompletedIndex: number, totalItems: number): void {
		if (totalItems <= 6) {
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

	private getCurrentActiveTodo(todoList: IChatTodo[]): IChatTodo | undefined {
		// First, look for in-progress todos (highest priority)
		const inProgressTodos = todoList.filter(todo => todo.status === 'in-progress');
		if (inProgressTodos.length > 0) {
			return inProgressTodos[0]; // Return the first in-progress todo
		}

		// Fallback to first not-started todo
		const notStartedTodos = todoList.filter(todo => todo.status === 'not-started');
		if (notStartedTodos.length > 0) {
			return notStartedTodos[0]; // Return the first not-started todo
		}

		return undefined; // No active todos found
	}

	private getProgressText(todoList: IChatTodo[]): string {
		if (todoList.length === 0) {
			return localize('chat.todoList.title', 'Todos');
		}

		const completedCount = todoList.filter(todo => todo.status === 'completed').length;
		const totalCount = todoList.length;
		const baseText = localize('chat.todoList.titleWithProgress', 'Todos ({0}/{1})', completedCount, totalCount);

		// Get the current active todo to display in header
		const activeTodo = this.getCurrentActiveTodo(todoList);
		if (activeTodo) {
			// Truncate long titles to prevent header from becoming too wide
			const maxTitleLength = 30;
			const truncatedTitle = activeTodo.title.length > maxTitleLength
				? activeTodo.title.substring(0, maxTitleLength) + '...'
				: activeTodo.title;

			if (activeTodo.status === 'in-progress') {
				return localize('chat.todoList.titleWithWorkingOn', '{0} - Working on: {1}', baseText, truncatedTitle);
			} else {
				return localize('chat.todoList.titleWithNext', '{0} - Next: {1}', baseText, truncatedTitle);
			}
		}

		return baseText;
	}

	private getStatusIconClass(status: string): string {
		switch (status) {
			case 'completed':
				return 'codicon-check';
			case 'in-progress':
				return 'codicon-record';
			case 'not-started':
			default:
				return 'codicon-circle-large-outline';
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
