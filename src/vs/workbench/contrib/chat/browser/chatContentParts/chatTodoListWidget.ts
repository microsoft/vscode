/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
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

		const expandIcon = dom.$('.expand-icon.codicon');
		expandIcon.classList.add(this._isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right');

		const titleElement = dom.$('.todo-list-title');
		titleElement.textContent = localize('chat.todoList.title', 'Tasks');

		this.expandoElement.appendChild(expandIcon);
		this.expandoElement.appendChild(titleElement);

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

		return container;
	}

	public updateSessionId(sessionId: string | undefined): void {
		this._currentSessionId = sessionId;
		this.updateTodoDisplay();
	}

	private updateTodoDisplay(): void {
		if (!this._currentSessionId) {
			this.domNode.style.display = 'none';
			this._onDidChangeHeight.fire();
			return;
		}

		const todoListStorage = this.chatTodoListService.getChatTodoListStorage();
		const todoList = todoListStorage.getTodoList(this._currentSessionId);

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
			titleElement.textContent = `${localize('chat.todoList.title', 'Tasks')}`;
		}

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
			titleElement.textContent = `${index + 1}. ${todo.title}`;

			todoContent.appendChild(titleElement);

			todoElement.appendChild(statusIcon);
			todoElement.appendChild(todoContent);

			this.todoListContainer.appendChild(todoElement);
		});
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
