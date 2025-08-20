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
import * as aria from '../../../../../base/browser/ui/aria/aria.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';

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
	private _focusedItemIndex: number = -1;
	private _currentTodos: IChatTodo[] = [];

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
		this.todoListContainer.setAttribute('role', 'listbox');
		this.todoListContainer.setAttribute('aria-label', localize('chat.todoList.listLabel', 'Todo items'));
		this.todoListContainer.setAttribute('tabindex', '0');

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

		this._register(dom.addDisposableListener(this.todoListContainer, 'keydown', (e) => {
			this.handleTodoListKeyDown(e);
		}));

		this._register(dom.addDisposableListener(this.todoListContainer, 'focus', () => {
			if (this._currentTodos.length > 0 && this._focusedItemIndex === -1) {
				this.setFocusedItem(0);
			}
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
		this._currentTodos = todoList;
		this._focusedItemIndex = -1; // Reset focus when re-rendering

		const titleElement = this.expandoElement.querySelector('.todo-list-title') as HTMLElement;
		if (titleElement) {
			titleElement.textContent = this.getProgressText(todoList);
		}

		let lastActiveIndex = -1;
		let firstCompletedIndex = -1;
		let firstPendingAfterCompletedIndex = -1;

		todoList.forEach((todo, index) => {
			const todoElement = dom.$('.todo-item');
			todoElement.setAttribute('role', 'option');
			todoElement.setAttribute('tabindex', '-1');
			todoElement.setAttribute('data-index', index.toString());
			todoElement.setAttribute('id', `todo-item-${index}`);
			
			// Set ARIA label with status and description
			const statusText = this.getStatusText(todo.status);
			const ariaLabel = todo.description 
				? localize('chat.todoList.itemWithDescription', '{0}, {1}. {2}', todo.title, statusText, todo.description)
				: localize('chat.todoList.item', '{0}, {1}', todo.title, statusText);
			todoElement.setAttribute('aria-label', ariaLabel);

			// Add tooltip if description exists
			if (todo.description && todo.description.trim()) {
				todoElement.title = todo.description;
			}

			const statusIcon = dom.$('.todo-status-icon.codicon');
			statusIcon.classList.add(this.getStatusIconClass(todo.status));
			statusIcon.style.color = this.getStatusIconColor(todo.status);
			statusIcon.setAttribute('aria-hidden', 'true'); // Hide from screen readers as status is in aria-label

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

		// Reset focus when collapsing
		if (!this._isExpanded) {
			this._focusedItemIndex = -1;
		}

		// Restore focus to the list if it was expanded and has todos
		if (this._isExpanded && this._currentTodos.length > 0) {
			setTimeout(() => {
				// Only restore focus if there was a previously focused item, otherwise set to first item
				const targetIndex = this._focusedItemIndex >= 0 ? this._focusedItemIndex : 0;
				this.setFocusedItem(targetIndex);
				this.todoListContainer.focus();
			}, 0);
		}

		this._onDidChangeHeight.fire();
	}

	private handleTodoListKeyDown(e: KeyboardEvent): void {
		if (!this._isExpanded) {
			return; // Don't handle keys when collapsed
		}
		
		const event = new StandardKeyboardEvent(e);
		
		switch (event.keyCode) {
			case KeyCode.UpArrow:
				e.preventDefault();
				this.navigateUp();
				break;
			case KeyCode.DownArrow:
				e.preventDefault();
				this.navigateDown();
				break;
			case KeyCode.Enter:
			case KeyCode.Space:
				e.preventDefault();
				this.toggleCurrentTodoStatus();
				break;
			case KeyCode.Escape:
				e.preventDefault();
				if (this._isExpanded) {
					this.toggleExpanded();
					this.expandoElement.focus();
				}
				break;
		}

		// Handle keyboard shortcuts with modifiers
		if (event.ctrlKey || event.metaKey) {
			if (event.keyCode === KeyCode.Enter && !event.shiftKey) {
				e.preventDefault();
				this.setCurrentTodoStatus('completed');
			} else if (event.keyCode === KeyCode.Enter && event.shiftKey) {
				e.preventDefault();
				this.setCurrentTodoStatus('in-progress');
			}
		}
	}

	private navigateUp(): void {
		if (this._currentTodos.length === 0 || !this._isExpanded) {
			return;
		}
		
		const newIndex = this._focusedItemIndex <= 0 ? this._currentTodos.length - 1 : this._focusedItemIndex - 1;
		this.setFocusedItem(newIndex);
	}

	private navigateDown(): void {
		if (this._currentTodos.length === 0 || !this._isExpanded) {
			return;
		}
		
		const newIndex = this._focusedItemIndex >= this._currentTodos.length - 1 ? 0 : this._focusedItemIndex + 1;
		this.setFocusedItem(newIndex);
	}

	private setFocusedItem(index: number): void {
		if (index < 0 || index >= this._currentTodos.length || !this._isExpanded) {
			return;
		}

		// Remove previous focus styling
		if (this._focusedItemIndex >= 0) {
			const prevElement = this.todoListContainer.querySelector(`[data-index="${this._focusedItemIndex}"]`) as HTMLElement;
			if (prevElement) {
				prevElement.classList.remove('focused');
				prevElement.setAttribute('aria-selected', 'false');
			}
		}

		// Set new focus
		this._focusedItemIndex = index;
		const newElement = this.todoListContainer.querySelector(`[data-index="${index}"]`) as HTMLElement;
		if (newElement) {
			newElement.classList.add('focused');
			newElement.setAttribute('aria-selected', 'true');
			newElement.scrollIntoView({ block: 'nearest' });
		}

		// Update aria-activedescendant
		this.todoListContainer.setAttribute('aria-activedescendant', `todo-item-${index}`);
	}

	private toggleCurrentTodoStatus(): void {
		if (this._focusedItemIndex < 0 || this._focusedItemIndex >= this._currentTodos.length) {
			return;
		}

		const currentTodo = this._currentTodos[this._focusedItemIndex];
		let newStatus: IChatTodo['status'];

		// Cycle through statuses: not-started -> in-progress -> completed -> not-started
		switch (currentTodo.status) {
			case 'not-started':
				newStatus = 'in-progress';
				break;
			case 'in-progress':
				newStatus = 'completed';
				break;
			case 'completed':
				newStatus = 'not-started';
				break;
			default:
				newStatus = 'in-progress';
		}

		this.setCurrentTodoStatus(newStatus);
	}

	private setCurrentTodoStatus(status: IChatTodo['status']): void {
		if (this._focusedItemIndex < 0 || this._focusedItemIndex >= this._currentTodos.length || !this._currentSessionId) {
			return;
		}

		const oldStatus = this._currentTodos[this._focusedItemIndex].status;
		if (oldStatus === status) {
			return;
		}

		// Update the todo status
		const updatedTodos = [...this._currentTodos];
		updatedTodos[this._focusedItemIndex] = { ...updatedTodos[this._focusedItemIndex], status };

		// Save the updated todos
		this.chatTodoListService.setTodos(this._currentSessionId, updatedTodos);
		
		// Announce status change to screen readers
		this.announceTodoStatusChange(updatedTodos[this._focusedItemIndex], oldStatus);
		
		// Re-render to update UI
		this.updateTodoDisplay();
		
		// Restore focus after re-render
		setTimeout(() => {
			this.setFocusedItem(this._focusedItemIndex);
		}, 0);
	}

	private announceTodoStatusChange(todo: IChatTodo, oldStatus: string): void {
		const statusText = this.getStatusText(todo.status);
		const message = localize('chat.todoList.statusChanged', '{0} is now {1}', todo.title, statusText);
		aria.alert(message);
	}

	private getStatusText(status: string): string {
		switch (status) {
			case 'completed':
				return localize('chat.todoList.statusCompleted', 'completed');
			case 'in-progress':
				return localize('chat.todoList.statusInProgress', 'in progress');
			case 'not-started':
			default:
				return localize('chat.todoList.statusNotStarted', 'not started');
		}
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

	private getProgressText(todoList: IChatTodo[]): string {
		if (todoList.length === 0) {
			return localize('chat.todoList.title', 'Todos');
		}

		const completedCount = todoList.filter(todo => todo.status === 'completed').length;
		const totalCount = todoList.length;

		return localize('chat.todoList.titleWithProgress', 'Todos ({0}/{1})', completedCount, totalCount);
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
