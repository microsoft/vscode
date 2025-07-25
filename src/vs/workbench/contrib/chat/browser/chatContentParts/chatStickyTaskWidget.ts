/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IChatTasksContent } from '../../common/chatService.js';

export class ChatStickyTaskWidget extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private _isExpanded: boolean = true;
	private expandoElement!: HTMLElement;
	private taskListContainer!: HTMLElement;
	private _taskData: IChatTasksContent | undefined;

	constructor() {
		super();

		this.domNode = this.createStickyTaskWidget();
	}

	public get height(): number {
		return this.domNode.style.display === 'none' ? 0 : this.domNode.offsetHeight;
	}

	private createStickyTaskWidget(): HTMLElement {
		const container = dom.$('.chat-sticky-task-widget');
		container.style.display = 'none';

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

	public updateTaskData(taskData: IChatTasksContent | undefined): void {
		this._taskData = taskData;

		if (taskData && taskData.tasks.length > 0) {
			this.renderTaskList();
			this.domNode.style.display = 'block';
		} else {
			this.domNode.style.display = 'none';
		}

		this._onDidChangeHeight.fire();
	}

	private renderTaskList(): void {
		if (!this._taskData || !this._taskData.tasks.length) {
			return;
		}

		this.taskListContainer.textContent = '';

		const titleElement = this.expandoElement.querySelector('.task-title') as HTMLElement;
		if (titleElement) {
			titleElement.textContent = `${localize('chat.task.title', 'Tasks')}`;
		}

		this._taskData.tasks.forEach((task, index) => {
			const taskElement = dom.$('.task-item');

			const statusIcon = dom.$('.task-status-icon.codicon');
			statusIcon.classList.add(this.getStatusIconClass(task.status));
			statusIcon.style.color = this.getStatusIconColor(task.status);

			const taskContent = dom.$('.task-content');

			const titleElement = dom.$('.task-title');
			titleElement.textContent = `${index + 1}. ${task.title}`;

			taskContent.appendChild(titleElement);

			taskElement.appendChild(statusIcon);
			taskElement.appendChild(taskContent);

			this.taskListContainer.appendChild(taskElement);
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
