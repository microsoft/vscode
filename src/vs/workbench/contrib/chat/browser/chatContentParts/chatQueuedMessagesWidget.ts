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
import { IChatQueuedRequestSummary, IChatService } from '../../common/chatService.js';

export class ChatQueuedMessagesWidget extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private _isExpanded: boolean = true;
	private expandoElement!: HTMLElement;
	private queuedMessagesContainer!: HTMLElement;
	private _currentSessionId: string | undefined;

	constructor(
		@IChatService private readonly chatService: IChatService
	) {
		super();

		this.domNode = this.createChatQueuedMessagesWidget();
	}

	public get height(): number {
		return this.domNode.style.display === 'none' ? 0 : this.domNode.offsetHeight;
	}

	private createChatQueuedMessagesWidget(): HTMLElement {
		const container = dom.$('.chat-queued-messages-widget');
		container.style.display = 'none';

		this.expandoElement = dom.$('.queued-messages-expand');
		this.expandoElement.setAttribute('role', 'button');
		this.expandoElement.setAttribute('aria-expanded', 'true');
		this.expandoElement.setAttribute('tabindex', '0');
		this.expandoElement.setAttribute('aria-controls', 'queued-messages-container');

		// Create title section to group icon and title
		const titleSection = dom.$('.queued-messages-title-section');

		const expandIcon = dom.$('.expand-icon.codicon');
		expandIcon.classList.add(this._isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right');
		expandIcon.setAttribute('aria-hidden', 'true');

		const titleElement = dom.$('.queued-messages-title');
		titleElement.id = 'queued-messages-title';
		titleElement.textContent = localize('chat.queuedMessages.title', 'Queued Messages');

		titleSection.appendChild(expandIcon);
		titleSection.appendChild(titleElement);

		this.expandoElement.appendChild(titleSection);

		this.queuedMessagesContainer = dom.$('.queued-messages-container');
		this.queuedMessagesContainer.style.display = this._isExpanded ? 'block' : 'none';
		this.queuedMessagesContainer.id = 'queued-messages-container';
		this.queuedMessagesContainer.setAttribute('role', 'list');
		this.queuedMessagesContainer.setAttribute('aria-labelledby', 'queued-messages-title');

		container.appendChild(this.expandoElement);
		container.appendChild(this.queuedMessagesContainer);

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

	public render(sessionId: string | undefined): void {
		if (!sessionId) {
			this.domNode.style.display = 'none';
			return;
		}

		this._currentSessionId = sessionId;

		const queuedRequests = this.chatService.getQueuedRequests(sessionId);
		if (queuedRequests.length > 0) {
			this.renderQueuedMessages(queuedRequests);
			this.domNode.style.display = 'block';
		} else {
			this.domNode.style.display = 'none';
		}

		this._onDidChangeHeight.fire();
	}

	private renderQueuedMessages(queuedRequests: ReadonlyArray<IChatQueuedRequestSummary>): void {
		this.queuedMessagesContainer.textContent = '';

		const titleElement = this.expandoElement.querySelector('.queued-messages-title') as HTMLElement;
		if (titleElement) {
			this.updateTitleElement(titleElement, queuedRequests.length);
		}

		queuedRequests.forEach((request, index) => {
			const messageElement = dom.$('li.queued-message-item');
			messageElement.setAttribute('role', 'listitem');
			messageElement.setAttribute('tabindex', '0');

			// Truncate message for preview
			const preview = this.truncateMessage(request.message, 100);
			messageElement.title = request.message;

			const messageContent = dom.$('.queued-message-content');
			messageContent.textContent = preview;

			// Add delete button
			const deleteButtonContainer = dom.$('.queued-message-delete-button-container');
			const deleteButton = new Button(deleteButtonContainer, {
				supportIcons: true,
				title: localize('chat.queuedMessages.deleteButton', 'Delete queued message'),
				ariaLabel: localize('chat.queuedMessages.deleteButton.ariaLabel', 'Delete queued message: {0}', preview)
			});
			deleteButton.element.tabIndex = 0;
			deleteButton.icon = Codicon.close;
			this._register(deleteButton);

			this._register(deleteButton.onDidClick(() => {
				this.deleteQueuedMessage(request.id);
			}));

			// Add attachments count if present
			if (request.attachments && request.attachments.length > 0) {
				const attachmentsBadge = dom.$('.queued-message-attachments');
				attachmentsBadge.textContent = localize('chat.queuedMessages.attachments', '{0} attachment{1}', request.attachments.length, request.attachments.length === 1 ? '' : 's');
				attachmentsBadge.classList.add('codicon', 'codicon-paperclip');
				messageContent.appendChild(attachmentsBadge);
			}

			const ariaLabel = localize('chat.queuedMessages.item', 'Queued message: {0}', preview);
			messageElement.setAttribute('aria-label', ariaLabel);

			messageElement.appendChild(messageContent);
			messageElement.appendChild(deleteButtonContainer);

			this.queuedMessagesContainer.appendChild(messageElement);
		});
	}

	private truncateMessage(message: string, maxLength: number): string {
		if (message.length <= maxLength) {
			return message;
		}
		return message.substring(0, maxLength) + '...';
	}

	private deleteQueuedMessage(requestId: string): void {
		if (!this._currentSessionId) {
			return;
		}

		this.chatService.removeQueuedRequest(this._currentSessionId, requestId);
		// Re-render after deletion
		this.render(this._currentSessionId);
	}

	private toggleExpanded(): void {
		this._isExpanded = !this._isExpanded;

		const expandIcon = this.expandoElement.querySelector('.expand-icon') as HTMLElement;
		if (expandIcon) {
			expandIcon.classList.toggle('codicon-chevron-down', this._isExpanded);
			expandIcon.classList.toggle('codicon-chevron-right', !this._isExpanded);
		}

		this.queuedMessagesContainer.style.display = this._isExpanded ? 'block' : 'none';

		if (this._currentSessionId) {
			const queuedRequests = this.chatService.getQueuedRequests(this._currentSessionId);
			const titleElement = this.expandoElement.querySelector('.queued-messages-title') as HTMLElement;
			if (titleElement) {
				this.updateTitleElement(titleElement, queuedRequests.length);
			}
		}

		this.expandoElement.setAttribute('aria-expanded', this._isExpanded ? 'true' : 'false');
		this._onDidChangeHeight.fire();
	}

	private updateTitleElement(titleElement: HTMLElement, count: number): void {
		const titleText = count > 0
			? localize('chat.queuedMessages.titleWithCount', 'Queued Messages ({0})', count)
			: localize('chat.queuedMessages.title', 'Queued Messages');

		titleElement.textContent = titleText;

		const expandButtonLabel = this._isExpanded
			? localize('chat.queuedMessages.collapseButton', 'Collapse {0}', titleText)
			: localize('chat.queuedMessages.expandButton', 'Expand {0}', titleText);
		this.expandoElement.setAttribute('aria-label', expandButtonLabel);
	}
}
