/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService.js';
import { IChatCodeBlockInfo } from '../../chat.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

export interface ITodoListData {
	title: string;
	todos: Array<{
		id: string;
		content: string;
		status: 'not-started' | 'in-progress' | 'completed';
	}>;
}

export class ChatTodoListSubPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;
	public override readonly codeblocks: IChatCodeBlockInfo[] = [];

	private _isExpanded: boolean = true;
	private expandoElement!: HTMLElement;
	private todoListContainer!: HTMLElement;

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly todoData: ITodoListData,
	) {
		super(toolInvocation);

		this.domNode = this.createTodoListPart();
	}

	private createTodoListPart(): HTMLElement {
		const container = dom.$('.chat-todo-list-part');

		// Create the header with title and expand/collapse button
		this.expandoElement = dom.$('.todo-expando');
		this.expandoElement.setAttribute('role', 'button');
		this.expandoElement.setAttribute('aria-expanded', 'true');
		this.expandoElement.setAttribute('tabindex', '0');

		const expandIcon = dom.$('.expand-icon.codicon');
		expandIcon.classList.add(this._isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right');

		const titleElement = dom.$('.todo-title');
		titleElement.textContent = `${this.todoData.title} (${this.todoData.todos.length})`;

		this.expandoElement.appendChild(expandIcon);
		this.expandoElement.appendChild(titleElement);

		// Create the todo list container
		this.todoListContainer = dom.$('.todo-list-container');
		this.todoListContainer.style.display = this._isExpanded ? 'block' : 'none';

		this.renderTodoList();

		container.appendChild(this.expandoElement);
		container.appendChild(this.todoListContainer);

		// Add click handler for expand/collapse
		this._register(dom.addDisposableListener(this.expandoElement, 'click', () => {
			this.toggleExpanded();
		}));

		// Add keyboard handler
		this._register(dom.addDisposableListener(this.expandoElement, 'keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.toggleExpanded();
			}
		}));

		return container;
	}

	private renderTodoList(): void {
		dom.clearNode(this.todoListContainer);

		const listElement = dom.$('.todo-list');

		this.todoData.todos.forEach((todo, index) => {
			const todoItem = dom.$('.todo-item');

			// Create status icon
			const statusIcon = dom.$('.todo-status-icon.codicon');
			const iconClass = this.getStatusIconClass(todo.status);
			const iconColor = this.getStatusIconColor(todo.status);
			statusIcon.classList.add(iconClass);
			statusIcon.style.color = iconColor;

			// Create content
			const contentElement = dom.$('.todo-content');
			contentElement.textContent = todo.content;

			todoItem.appendChild(statusIcon);
			todoItem.appendChild(contentElement);

			listElement.appendChild(todoItem);
		});

		this.todoListContainer.appendChild(listElement);
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
				return 'codicon-sync';
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
				return 'var(--vscode-charts-blue)';
		}
	}
}
