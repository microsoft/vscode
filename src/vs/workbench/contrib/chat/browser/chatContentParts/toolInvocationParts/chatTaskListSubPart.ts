/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { localize } from '../../../../../../nls.js';
import { IChatTasksContent, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService.js';
import { IChatCodeBlockInfo } from '../../chat.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

export class ChatTaskListSubPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;
	public override readonly codeblocks: IChatCodeBlockInfo[] = [];

	private _isExpanded: boolean = true;
	private expandoElement!: HTMLElement;
	private taskListContainer!: HTMLElement;

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly taskData: IChatTasksContent,
	) {
		super(toolInvocation);

		this.domNode = this.createTaskListPart();
	}

	private createTaskListPart(): HTMLElement {
		const container = dom.$('.chat-task-list-part');

		this.expandoElement = dom.$('.task-expando');
		this.expandoElement.setAttribute('role', 'button');
		this.expandoElement.setAttribute('aria-expanded', 'true');
		this.expandoElement.setAttribute('tabindex', '0');

		const expandIcon = dom.$('.expand-icon.codicon');
		expandIcon.classList.add(this._isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right');

		const titleElement = dom.$('.task-title');
		titleElement.textContent = localize('chat.task.title', 'Tasks');

		this.expandoElement.appendChild(expandIcon);
		this.expandoElement.appendChild(titleElement);

		this.taskListContainer = dom.$('.task-list-container');
		this.taskListContainer.style.display = this._isExpanded ? 'block' : 'none';

		this.renderTaskList();

		container.appendChild(this.expandoElement);
		container.appendChild(this.taskListContainer);

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

	private renderTaskList(): void {
		dom.clearNode(this.taskListContainer);

		const listElement = dom.$('.task-list');

		this.taskData.tasks.forEach((task, index) => {
			const taskItem = dom.$('.task-item');

			const statusIcon = dom.$('.task-status-icon.codicon');
			const iconClass = this.getStatusIconClass(task.status);
			const iconColor = this.getStatusIconColor(task.status);
			statusIcon.classList.add(iconClass);
			statusIcon.style.color = iconColor;

			// Create content
			const contentElement = dom.$('.task-content');
			contentElement.textContent = task.title;

			taskItem.appendChild(statusIcon);
			taskItem.appendChild(contentElement);

			listElement.appendChild(taskItem);
		});

		this.taskListContainer.appendChild(listElement);
	}

	private toggleExpanded(): void {
		this._isExpanded = !this._isExpanded;

		const expandIcon = this.expandoElement.querySelector('.expand-icon') as HTMLElement;
		if (expandIcon) {
			expandIcon.classList.toggle('codicon-chevron-down', this._isExpanded);
			expandIcon.classList.toggle('codicon-chevron-right', !this._isExpanded);
		}

		this.expandoElement.setAttribute('aria-expanded', this._isExpanded.toString());
		this.taskListContainer.style.display = this._isExpanded ? 'block' : 'none';

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
