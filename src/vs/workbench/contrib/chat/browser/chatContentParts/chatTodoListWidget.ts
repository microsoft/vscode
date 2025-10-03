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
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IChatTodoListService, IChatTodo } from '../../common/chatTodoListService.js';
import { TodoListToolDescriptionFieldSettingId } from '../../common/tools/manageTodoListTool.js';
import { TodoEditManager } from '../todoEditManager.js';

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
	private _editManager: TodoEditManager;

	constructor(
		@IChatTodoListService private readonly chatTodoListService: IChatTodoListService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		this._editManager = this._register(new TodoEditManager(2000)); // 2 second auto-save delay
		this.domNode = this.createChatTodoWidget();

		// Listen for edit events
		this._register(this._editManager.onDidSaveEdit(({ todo, field, newValue }) => {
			if (!this._currentSessionId) {
				return;
			}

			const todos = this.chatTodoListService.getTodos(this._currentSessionId);
			const todoIndex = todos.findIndex(t => t.id === todo.id);
			if (todoIndex === -1) {
				return;
			}

			// Update the todo with new value
			const updatedTodo = { ...todos[todoIndex] };
			if (field === 'title') {
				updatedTodo.title = newValue;
			} else {
				updatedTodo.description = newValue;
			}

			// Add to edit history
			if (!updatedTodo.editHistory) {
				updatedTodo.editHistory = [];
			}
			updatedTodo.editHistory.push({
				timestamp: Date.now(),
				field,
				oldValue: todo[field] || '',
				newValue
			});

			// Clear editing state
			updatedTodo.isEditing = false;
			delete updatedTodo.originalValue;

			// Save the updated todo list
			const newTodos = [...todos];
			newTodos[todoIndex] = updatedTodo;
			this.chatTodoListService.setTodos(this._currentSessionId, newTodos);

			// Re-render to show updated value
			this.updateTodoDisplay();
		}));
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

		const includeDescription = this.configurationService.getValue<boolean>(TodoListToolDescriptionFieldSettingId) !== false;

		todoList.forEach((todo, index) => {
			const todoElement = this.renderTodoItem(todo, index, includeDescription);
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

	private renderTodoItem(todo: IChatTodo, index: number, includeDescription: boolean): HTMLElement {
		const todoElement = dom.$('li.todo-item');
		todoElement.setAttribute('role', 'listitem');
		todoElement.setAttribute('tabindex', '0');

		// Add tooltip if description exists and description field is enabled
		if (includeDescription && todo.description && todo.description.trim()) {
			todoElement.title = todo.description;
		}

		const statusIcon = dom.$('.todo-status-icon.codicon');
		statusIcon.classList.add(this.getStatusIconClass(todo.status));
		statusIcon.style.color = this.getStatusIconColor(todo.status);
		// Hide decorative icon from screen readers
		statusIcon.setAttribute('aria-hidden', 'true');

		const todoContent = dom.$('.todo-content');

		// Check if this todo is being edited
		const isTitleEditing = this._editManager.isEditing(todo.id, 'title');
		const isDescriptionEditing = includeDescription && this._editManager.isEditing(todo.id, 'description');

		// Render title (editable or static)
		if (isTitleEditing) {
			const titleInput = this.createEditInput(todo, 'title', index);
			todoContent.appendChild(titleInput);
		} else {
			const titleElement = dom.$('.todo-title');
			titleElement.textContent = todo.title;
			titleElement.setAttribute('data-todo-id', String(todo.id));
			titleElement.setAttribute('data-field', 'title');
			
			// Make title clickable to enter edit mode
			this._register(dom.addDisposableListener(titleElement, 'click', (e) => {
				e.stopPropagation();
				this.enterEditMode(todo, 'title');
			}));

			// Double-click for edit mode (alternative activation)
			this._register(dom.addDisposableListener(titleElement, 'dblclick', (e) => {
				e.stopPropagation();
				this.enterEditMode(todo, 'title');
			}));

			todoContent.appendChild(titleElement);
		}

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
		todoContent.appendChild(statusElement);

		// Render description if enabled
		if (includeDescription && todo.description) {
			if (isDescriptionEditing) {
				const descInput = this.createEditInput(todo, 'description', index);
				todoContent.appendChild(descInput);
			} else {
				const descElement = dom.$('.todo-description');
				descElement.textContent = todo.description;
				descElement.setAttribute('data-todo-id', String(todo.id));
				descElement.setAttribute('data-field', 'description');

				// Make description clickable to enter edit mode
				this._register(dom.addDisposableListener(descElement, 'click', (e) => {
					e.stopPropagation();
					this.enterEditMode(todo, 'description');
				}));

				this._register(dom.addDisposableListener(descElement, 'dblclick', (e) => {
					e.stopPropagation();
					this.enterEditMode(todo, 'description');
				}));

				todoContent.appendChild(descElement);
			}
		}

		const ariaLabel = includeDescription && todo.description && todo.description.trim()
			? localize('chat.todoList.itemWithDescription', '{0}, {1}, {2}', todo.title, statusText, todo.description)
			: localize('chat.todoList.item', '{0}, {1}', todo.title, statusText);
		todoElement.setAttribute('aria-label', ariaLabel);
		todoElement.setAttribute('aria-describedby', `todo-status-${index}`);
		
		// Add editing class if any field is being edited
		if (isTitleEditing || isDescriptionEditing) {
			todoElement.classList.add('todo-item-editing');
		}

		todoElement.appendChild(statusIcon);
		todoElement.appendChild(todoContent);

		return todoElement;
	}

	private createEditInput(todo: IChatTodo, field: 'title' | 'description', index: number): HTMLElement {
		const container = dom.$('.todo-edit-container');
		container.setAttribute('data-todo-id', String(todo.id));
		container.setAttribute('data-field', field);

		const input = dom.$('input.todo-edit-input') as HTMLInputElement;
		input.type = 'text';
		input.value = field === 'title' ? todo.title : (todo.description || '');
		input.placeholder = field === 'title' 
			? localize('chat.todoList.titlePlaceholder', 'Enter todo title...')
			: localize('chat.todoList.descriptionPlaceholder', 'Enter description...');
		
		// Set ARIA attributes
		input.setAttribute('aria-label', field === 'title'
			? localize('chat.todoList.editTitle', 'Edit todo title')
			: localize('chat.todoList.editDescription', 'Edit todo description'));
		input.setAttribute('aria-describedby', `todo-edit-validation-${todo.id}-${field}`);

		// Validation message container
		const validationMessage = dom.$('.todo-edit-validation');
		validationMessage.id = `todo-edit-validation-${todo.id}-${field}`;
		validationMessage.setAttribute('role', 'alert');
		validationMessage.setAttribute('aria-live', 'polite');

		// Focus the input
		setTimeout(() => {
			input.focus();
			input.select();
		}, 0);

		// Handle input changes
		this._register(dom.addDisposableListener(input, 'input', () => {
			this._editManager.updateEditValue(todo.id, field, input.value);
			
			// Validate input
			const validation = this._editManager.validateEdit(field, input.value);
			if (!validation.isValid) {
				container.classList.add('todo-edit-error');
				validationMessage.textContent = validation.errorMessage || '';
				validationMessage.style.display = 'block';
			} else {
				container.classList.remove('todo-edit-error');
				validationMessage.textContent = '';
				validationMessage.style.display = 'none';
			}
		}));

		// Handle keyboard shortcuts
		this._register(dom.addDisposableListener(input, 'keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this.saveEdit(todo, field);
			} else if (e.key === 'Escape') {
				e.preventDefault();
				this.cancelEdit(todo, field);
			}
		}));

		// Handle blur (save changes)
		this._register(dom.addDisposableListener(input, 'blur', () => {
			// Small delay to allow click handlers to fire first
			setTimeout(() => {
				if (this._editManager.isEditing(todo.id, field)) {
					this.saveEdit(todo, field);
				}
			}, 100);
		}));

		container.appendChild(input);
		container.appendChild(validationMessage);

		return container;
	}

	private enterEditMode(todo: IChatTodo, field: 'title' | 'description'): void {
		if (!this._currentSessionId) {
			return;
		}

		// Start edit session
		this._editManager.startEdit(todo, field);

		// Mark todo as editing
		const todos = this.chatTodoListService.getTodos(this._currentSessionId);
		const todoIndex = todos.findIndex(t => t.id === todo.id);
		if (todoIndex === -1) {
			return;
		}

		const updatedTodo = { ...todos[todoIndex] };
		updatedTodo.isEditing = true;
		if (!updatedTodo.originalValue) {
			updatedTodo.originalValue = {
				title: updatedTodo.title,
				description: updatedTodo.description
			};
		}

		const newTodos = [...todos];
		newTodos[todoIndex] = updatedTodo;
		this.chatTodoListService.setTodos(this._currentSessionId, newTodos);

		// Re-render to show edit input
		this.updateTodoDisplay();

		// Announce to screen readers
		const announcement = field === 'title'
			? localize('chat.todoList.editModeTitle', 'Editing todo title. Press Enter to save, Escape to cancel.')
			: localize('chat.todoList.editModeDescription', 'Editing todo description. Press Enter to save, Escape to cancel.');
		this.announceToScreenReader(announcement);
	}

	private saveEdit(todo: IChatTodo, field: 'title' | 'description'): void {
		if (!this._currentSessionId) {
			return;
		}

		// Validate before saving
		const session = this._editManager.getEditSession(todo.id, field);
		if (!session) {
			return;
		}

		const validation = this._editManager.validateEdit(field, session.currentValue);
		if (!validation.isValid) {
			// Don't save invalid input
			this.announceToScreenReader(validation.errorMessage || localize('chat.todoList.invalidInput', 'Invalid input'));
			return;
		}

		// Get the new value
		const newValue = this._editManager.saveEdit(todo.id, field);
		if (newValue === undefined) {
			return;
		}

		// Fire the save event (which is handled in the constructor)
		this._editManager['_onDidSaveEdit'].fire({ todo, field, newValue });

		// Announce to screen readers
		const announcement = field === 'title'
			? localize('chat.todoList.savedTitle', 'Todo title saved')
			: localize('chat.todoList.savedDescription', 'Todo description saved');
		this.announceToScreenReader(announcement);
	}

	private cancelEdit(todo: IChatTodo, field: 'title' | 'description'): void {
		if (!this._currentSessionId) {
			return;
		}

		// Cancel the edit session
		this._editManager.cancelEdit(todo, field);

		// Clear editing flag from todo
		const todos = this.chatTodoListService.getTodos(this._currentSessionId);
		const todoIndex = todos.findIndex(t => t.id === todo.id);
		if (todoIndex !== -1) {
			const updatedTodo = { ...todos[todoIndex] };
			updatedTodo.isEditing = false;
			delete updatedTodo.originalValue;

			const newTodos = [...todos];
			newTodos[todoIndex] = updatedTodo;
			this.chatTodoListService.setTodos(this._currentSessionId, newTodos);
		}

		// Re-render to show static text
		this.updateTodoDisplay();

		// Announce to screen readers
		this.announceToScreenReader(localize('chat.todoList.editCancelled', 'Edit cancelled'));
	}

	private announceToScreenReader(message: string): void {
		const announcement = dom.$('.todo-screen-reader-announcement');
		announcement.setAttribute('role', 'status');
		announcement.setAttribute('aria-live', 'polite');
		announcement.style.position = 'absolute';
		announcement.style.left = '-10000px';
		announcement.style.width = '1px';
		announcement.style.height = '1px';
		announcement.style.overflow = 'hidden';
		announcement.textContent = message;

		this.domNode.appendChild(announcement);

		// Remove after announcement
		setTimeout(() => {
			if (announcement.parentNode) {
				announcement.parentNode.removeChild(announcement);
			}
		}, 1000);
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
}
