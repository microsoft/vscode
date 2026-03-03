/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { $, append, clearNode } from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IChatService, ChatRequestQueueKind } from '../../../common/chatService/chatService.js';
import { IChatModel, IChatPendingRequest } from '../../../common/model/chatModel.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';

const ROW_HEIGHT = 22;
const MAX_VISIBLE_ITEMS = 6;

/**
 * Renders a list of pending/queued chat requests with actions to remove or send immediately.
 */
export class ChatQueuedPromptsWidget extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private readonly _modelListeners = this._register(new DisposableStore());
	private _model: IChatModel | undefined;
	private _itemCount = 0;
	private _isExpanded = false;

	get itemCount(): number {
		return this._itemCount;
	}

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatService private readonly chatService: IChatService,
	) {
		super();

		this.domNode = $('.chat-queued-prompts-widget');
	}

	render(model: IChatModel): void {
		this._model = model;
		this._modelListeners.clear();

		this._modelListeners.add(model.onDidChangePendingRequests(() => {
			this._renderItems();
		}));

		this._renderItems();
	}

	clear(): void {
		this._model = undefined;
		this._modelListeners.clear();
		this._itemCount = 0;
		this._isExpanded = false;
		clearNode(this.domNode);
		this._onDidChangeHeight.fire();
	}

	private _renderItems(): void {
		clearNode(this.domNode);

		const model = this._model;
		if (!model) {
			this._itemCount = 0;
			this._onDidChangeHeight.fire();
			return;
		}

		const pendingRequests = model.getPendingRequests();
		this._itemCount = pendingRequests.length;

		if (pendingRequests.length === 0) {
			this._isExpanded = false;
			this._onDidChangeHeight.fire();
			return;
		}

		// Always show the list directly (no header)
		const listContainer = append(this.domNode, $('.chat-queued-prompts-list'));
		listContainer.style.overflowY = 'auto';
		listContainer.style.maxHeight = `${MAX_VISIBLE_ITEMS * ROW_HEIGHT}px`;

		let queuedIndex = 0;
		for (const pending of pendingRequests) {
			this._renderRow(listContainer, model, pending, pending.kind === ChatRequestQueueKind.Steering ? undefined : ++queuedIndex);
		}

		this._onDidChangeHeight.fire();
	}

	private _renderRow(container: HTMLElement, model: IChatModel, pending: IChatPendingRequest, queuedIndex: number | undefined): void {
		const row = append(container, $('.chat-queued-prompt-row'));
		row.style.height = `${ROW_HEIGHT}px`;

		const indicator = append(row, $('span.chat-queued-prompt-indicator'));
		if (pending.kind === ChatRequestQueueKind.Steering) {
			indicator.classList.add(...ThemeIcon.asClassNameArray(Codicon.arrowUp));
		} else if (queuedIndex !== undefined) {
			indicator.textContent = `${queuedIndex}.`;
		}

		const text = append(row, $('span.chat-queued-prompt-text'));
		text.textContent = pending.request.message.text;

		// Send immediately button
		const sendButton = append(row, $('a.chat-queued-prompt-action' + ThemeIcon.asCSSSelector(Codicon.arrowUp)));
		sendButton.title = localize('sendImmediately', "Send Immediately");
		sendButton.tabIndex = 0;
		sendButton.role = 'button';
		sendButton.addEventListener('click', () => {
			this._sendImmediately(model, pending.request.id);
		});

		// Remove button
		const removeButton = append(row, $('a.chat-queued-prompt-action' + ThemeIcon.asCSSSelector(Codicon.close)));
		removeButton.title = localize('removeFromQueue', "Remove from Queue");
		removeButton.tabIndex = 0;
		removeButton.role = 'button';
		removeButton.addEventListener('click', () => {
			this.chatService.removePendingRequest(model.sessionResource, pending.request.id);
		});
	}

	private _sendImmediately(model: IChatModel, requestId: string): void {
		const sessionResource = model.sessionResource;
		const pendingRequests = model.getPendingRequests();
		const targetIndex = pendingRequests.findIndex(r => r.request.id === requestId);
		if (targetIndex !== -1) {
			const targetRequest = pendingRequests[targetIndex];
			const reordered = [
				{ requestId: targetRequest.request.id, kind: targetRequest.kind },
				...pendingRequests.filter((_, i) => i !== targetIndex).map(r => ({ requestId: r.request.id, kind: r.kind }))
			];
			this.chatService.setPendingRequests(sessionResource, reordered);
			this.chatService.cancelCurrentRequestForSession(sessionResource);
			this.chatService.processPendingRequests(sessionResource);
		}
	}
}
