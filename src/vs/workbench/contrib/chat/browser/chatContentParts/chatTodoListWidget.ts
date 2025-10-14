/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IChatTodoListService, IChatTodo } from '../../common/chatTodoListService.js';
import { TodoListToolDescriptionFieldSettingId } from '../../common/tools/manageTodoListTool.js';

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
	private _editingTodoId: number | null = null;
	private _editInputBox: InputBox | undefined;

	constructor(
		@IChatTodoListService private readonly chatTodoListService: IChatTodoListService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextViewService private readonly contextViewService: IContextViewService
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
			return;
		}

		if (this._currentSessionId !== sessionId) {
			this._userHasScrolledManually = false;
			this._userManuallyExpanded = false;
		}

		const todoList = this.chatTodoListService.getTodos(sessionId);
		if (todoList.length > 2) {
			this.renderTodoList(todoList);
			this.domNode.style.display = 'block';
		} else {
			this.domNode.style.display = 'none';
			return;
		}

		this._currentSessionId = sessionId;
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

		todoList.forEach((todo, index) => {
			const todoElement = dom.$('li.todo-item');
			todoElement.setAttribute('role', 'listitem');
			todoElement.setAttribute('tabindex', '0');
			todoElement.style.display = 'flex';
			todoElement.style.alignItems = 'center';
			todoElement.style.gap = '8px';

			// Add tooltip if description exists and description field is enabled
			const includeDescription = this.configurationService.getValue<boolean>(TodoListToolDescriptionFieldSettingId) !== false;
			if (includeDescription && todo.description && todo.description.trim()) {
				todoElement.title = todo.description;
			}

			const statusIcon = dom.$('.todo-status-icon.codicon');
			statusIcon.classList.add(this.getStatusIconClass(todo.status));
			statusIcon.style.color = this.getStatusIconColor(todo.status);
			// Hide decorative icon from screen readers
			statusIcon.setAttribute('aria-hidden', 'true');

			const titleElement = dom.$('.todo-title');
			titleElement.textContent = todo.title;

			// Add hidden status text for screen readers
			const statusText = this.getStatusText(todo.status);
			const statusElement = dom.$('.todo-status-text');
			statusElement.id = `todo-status-${index}`;
			statusElement.textContent = statusText;
			statusElement.style.position = 'absolute';
			statusElement.style.left = '-10000px';
			statusElement.style.width = '1px';
			statusElement.style.height = '1px';
			statusElement.style.overflow = 'hidden';

			const todoContent = dom.$('.todo-content');
			todoContent.appendChild(titleElement);
			todoContent.appendChild(statusElement);

			// Create action container for buttons
			const actionContainer = dom.$('.todo-actions');
			actionContainer.style.display = 'none'; // Hidden by default
			actionContainer.style.marginLeft = 'auto';
			actionContainer.style.paddingLeft = '8px';

			// Create edit button
			const editButton = this._register(new Button(actionContainer, {
				supportIcons: true,
				title: localize('chat.todo.editTitle', "Edit title"),
				ariaLabel: localize('chat.todo.editTitle.ariaLabel', "Edit title for {0}", todo.title)
			}));
			editButton.icon = Codicon.edit;
			editButton.element.classList.add('todo-edit-button');

			// Edit button click handler
			this._register(editButton.onDidClick(() => {
				this.startEditingTodo(todo, todoElement);
			}));

			// Show/hide actions on hover
			this._register(dom.addDisposableListener(todoElement, 'mouseenter', () => {
				if (this._editingTodoId !== todo.id) {
					actionContainer.style.display = 'flex';
				}
			}));

			this._register(dom.addDisposableListener(todoElement, 'mouseleave', () => {
				// Keep visible if button is focused
				if (!editButton.element.matches(':focus')) {
					actionContainer.style.display = 'none';
				}
			}));

			// Keep visible when button is focused
			this._register(dom.addDisposableListener(editButton.element, 'focus', () => {
				actionContainer.style.display = 'flex';
			}));

			this._register(dom.addDisposableListener(editButton.element, 'blur', () => {
				// Hide when focus leaves and not hovering
				if (!todoElement.matches(':hover')) {
					actionContainer.style.display = 'none';
				}
			}));

			const ariaLabel = includeDescription && todo.description && todo.description.trim()
				? localize('chat.todoList.itemWithDescription', '{0}, {1}, {2}', todo.title, statusText, todo.description)
				: localize('chat.todoList.item', '{0}, {1}', todo.title, statusText);
			todoElement.setAttribute('aria-label', ariaLabel);
			todoElement.setAttribute('aria-describedby', `todo-status-${index}`);
			todoElement.appendChild(statusIcon);
			todoElement.appendChild(todoContent);
			todoElement.appendChild(actionContainer);

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
		const completedTodos = todoList.filter(todo => todo.status === 'completed');
		const lastCompletedTodo = completedTodos.length > 0 ? completedTodos[completedTodos.length - 1] : undefined;

		const progressText = dom.$('span');
		if (totalCount === 0) {
			progressText.textContent = localize('chat.todoList.title', 'Todos');
		} else {
			progressText.textContent = localize('chat.todoList.titleWithProgress', 'Todos ({0}/{1})', completedCount, totalCount);
		}
		titleElement.appendChild(progressText);
		const expandButtonLabel = this._isExpanded
			? localize('chat.todoList.collapseButtonWithProgress', 'Collapse {0}', progressText.textContent)
			: localize('chat.todoList.expandButtonWithProgress', 'Expand {0}', progressText.textContent);
		this.expandoElement.setAttribute('aria-label', expandButtonLabel);
		this.expandoElement.setAttribute('aria-expanded', this._isExpanded ? 'true' : 'false');
		let title = progressText.textContent || '';
		if (!this._isExpanded) {
			let currentTodo: IChatTodo | undefined;
			// Priority 1: Show first in-progress todo (matches manageTodoListTool logic)
			if (firstInProgressTodo) {
				currentTodo = firstInProgressTodo;
				const separator = dom.$('span');
				separator.textContent = ' - ';
				titleElement.appendChild(separator);

				const icon = dom.$('.codicon.codicon-record');
				icon.style.color = 'var(--vscode-charts-blue)';
				icon.style.marginRight = '4px';
				icon.style.verticalAlign = 'middle';
				titleElement.appendChild(icon);

				const inProgressText = dom.$('span');
				inProgressText.textContent = firstInProgressTodo.title;
				inProgressText.style.verticalAlign = 'middle';
				titleElement.appendChild(inProgressText);
			}
			// Priority 2: Show last completed todo if not all completed (matches manageTodoListTool logic)
			else if (completedCount > 0 && completedCount < totalCount && lastCompletedTodo) {
				currentTodo = lastCompletedTodo;

				const separator = dom.$('span');
				separator.textContent = ' - ';
				titleElement.appendChild(separator);

				const icon = dom.$('.codicon.codicon-check');
				icon.style.color = 'var(--vscode-charts-green)';
				icon.style.marginRight = '4px';
				icon.style.verticalAlign = 'middle';
				titleElement.appendChild(icon);

				const completedText = dom.$('span');
				completedText.textContent = lastCompletedTodo.title;
				completedText.style.verticalAlign = 'middle';
				titleElement.appendChild(completedText);
			}
			const includeDescription = this.configurationService.getValue<boolean>(TodoListToolDescriptionFieldSettingId) !== false;
			if (includeDescription && currentTodo && currentTodo.description && currentTodo.description.trim()) {
				title = currentTodo.description;
			}
		}

		const titleSection = this.expandoElement.querySelector('.todo-list-title-section') as HTMLElement;
		if (titleSection) {
			titleSection.title = title;
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

	private startEditingTodo(todo: IChatTodo, todoElement: HTMLElement): void {
		if (this._editingTodoId !== null) {
			this.cancelEditing();
		}

		this._editingTodoId = todo.id;

		// Hide action buttons during edit
		const actionContainer = todoElement.querySelector('.todo-actions') as HTMLElement;
		if (actionContainer) {
			actionContainer.style.display = 'none';
		}

		// Get the title element and replace it with an input box
		const todoContent = todoElement.querySelector('.todo-content') as HTMLElement;
		const titleElement = todoElement.querySelector('.todo-title') as HTMLElement;
		if (!todoContent || !titleElement) {
			return;
		}

		// Hide the title element
		titleElement.style.display = 'none';

		// Create and configure the input box
		const inputBoxContainer = dom.$('.todo-edit-input-container');
		this._editInputBox = new InputBox(inputBoxContainer, this.contextViewService, {
			ariaLabel: localize('chat.todo.editTitleInput', "Edit todo title"),
			inputBoxStyles: defaultInputBoxStyles
		});

		this._editInputBox.value = todo.title;
		todoContent.insertBefore(inputBoxContainer, titleElement);

		// Focus and select all text
		this._editInputBox.focus();
		this._editInputBox.select();

		// Save on Enter
		const onEnter = dom.addDisposableListener(this._editInputBox.inputElement, 'keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				e.stopPropagation();
				this.saveEdit(todo);
			} else if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				this.cancelEditing();
			}
		});

		// Save on blur
		const onBlur = dom.addDisposableListener(this._editInputBox.inputElement, 'blur', () => {
			// Small delay to allow click events on other elements to process
			setTimeout(() => {
				if (this._editingTodoId === todo.id) {
					this.saveEdit(todo);
				}
			}, 100);
		});

		// Store cleanup handlers
		if (this._editInputBox) {
			const inputBox = this._editInputBox;
			this._register({
				dispose: () => {
					onEnter.dispose();
					onBlur.dispose();
					inputBox.dispose();
				}
			});
		}
	}

	private saveEdit(todo: IChatTodo): void {
		if (!this._currentSessionId || !this._editInputBox) {
			this.cancelEditing();
			return;
		}

		const newTitle = this._editInputBox.value.trim();
		if (!newTitle) {
			// Don't allow empty titles, just cancel
			this.cancelEditing();
			return;
		}

		// Update the todo in the service
		const todoList = this.chatTodoListService.getTodos(this._currentSessionId);
		const updatedTodos = todoList.map(t => {
			if (t.id === todo.id) {
				return { ...t, title: newTitle };
			}
			return t;
		});

		this.chatTodoListService.setTodos(this._currentSessionId, updatedTodos);

		// Clear editing state
		this._editingTodoId = null;
		if (this._editInputBox) {
			this._editInputBox.dispose();
			this._editInputBox = undefined;
		}

		// Re-render the list
		this.render(this._currentSessionId);
	}

	private cancelEditing(): void {
		this._editingTodoId = null;
		if (this._editInputBox) {
			this._editInputBox.dispose();
			this._editInputBox = undefined;
		}

		// Re-render to restore original state
		if (this._currentSessionId) {
			this.render(this._currentSessionId);
		}
	}
}
