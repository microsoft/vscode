/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatTodoListContent, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService.js';
import { IChatTodoListService } from '../../../common/chatTodoListService.js';
import { IChatCodeBlockInfo } from '../../chat.js';
import { ChatTodoListWidget } from '../chatTodoListWidget.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

export class ChatTodoListSubPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;
	public readonly codeblocks: IChatCodeBlockInfo[] = [];

	private readonly todoWidget: ChatTodoListWidget | undefined;

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly todoData: IChatTodoListContent,
		@IChatTodoListService todoListService: IChatTodoListService,
	) {
		super(toolInvocation);

		this.domNode = document.createElement('div');
		const allCompleted = this.todoData.todoList.length > 0 && this.todoData.todoList.every(t => t.status === 'completed');
		if (!allCompleted) {
			return;
		}

		this.todoWidget = this._register(new ChatTodoListWidget(todoListService));
		this.domNode = this.todoWidget.domNode;
		const clearButtonContainer = this.domNode.querySelector('.todo-clear-button-container') as HTMLElement;
		if (clearButtonContainer) {
			clearButtonContainer.style.display = 'none';
		}

		this.todoWidget.render(this.todoData.sessionId);
		try {
			const expandIcon = this.domNode.querySelector('.expand-icon') as HTMLElement | null;
			if (expandIcon) {
				expandIcon.classList.add('codicon-chevron-down');
				expandIcon.classList.remove('codicon-chevron-right');
			}
			const expando = this.domNode.querySelector('.todo-list-expand') as HTMLElement | null;
			if (expando) {
				expando.setAttribute('aria-expanded', 'true');
			}
			const container = this.domNode.querySelector('.todo-list-container') as HTMLElement | null;
			if (container) {
				container.style.display = 'block';
				container.style.maxHeight = 'none';
				container.style.overflow = 'visible';
			}
			this.domNode.classList.remove('scrolled');
		} catch (e) {
		}

		this._register(this.todoWidget.onDidChangeHeight(() => {
			this._onDidChangeHeight.fire();
		}));
	}
}
