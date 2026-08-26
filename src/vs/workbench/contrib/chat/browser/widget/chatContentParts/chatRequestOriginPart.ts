/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatRequestOrigin.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { Gesture, EventType as TouchEventType } from '../../../../../../base/browser/touch.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IChatWidgetService } from '../../chat.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { ChatRequestOriginKind, IChatRequestOrigin, IChatRequestOriginService } from '../../../common/chatRequestOrigin.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatSideChatOrigin, IChatSideChatService } from '../../../common/chatSideChatService.js';
import { IChatModel } from '../../../common/model/chatModel.js';

/** Shows where a request or side chat originated and opens its source. */
export class ChatRequestOriginPart extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _disposeCts = new CancellationTokenSource();
	private _renderVersion = 0;
	private _openSource: (() => Promise<void>) | undefined;

	constructor(
		sessionResource: URI,
		requestOrigin: IChatRequestOrigin | undefined,
		@IChatService private readonly _chatService: IChatService,
		@IChatSideChatService private readonly _sideChatService: IChatSideChatService,
		@IChatRequestOriginService private readonly _requestOriginService: IChatRequestOriginService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IHoverService hoverService: IHoverService,
	) {
		super();

		this._register(toDisposable(() => this._disposeCts.dispose(true)));
		this.domNode = dom.$('.chat-request-origin.hidden');
		this.domNode.tabIndex = 0;
		this.domNode.setAttribute('role', 'button');
		this._register(Gesture.addTarget(this.domNode));
		this._register(hoverService.setupManagedHover(
			getDefaultHoverDelegate('element'),
			this.domNode,
			localize('chat.requestOrigin.openSource', "Open source chat"),
		));

		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._register(dom.addDisposableListener(this.domNode, eventType, () => {
				this._open();
			}));
		}
		this._register(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if ((event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) && !event.metaKey && !event.ctrlKey && !event.altKey) {
				event.preventDefault();
				event.stopPropagation();
				this._open();
			}
		}));

		if (requestOrigin) {
			this._openSource = () => this._openRequestOrigin(requestOrigin);
			this._renderRequestOrigin(requestOrigin);
			return;
		}

		this._openSource = () => this._sideChatService.revealSideChatSource(sessionResource);
		const origin = this._sideChatService.observeSideChatOrigin(sessionResource);
		this._register(autorun(reader => {
			this._renderSideChatOrigin(origin.read(reader));
		}));
	}

	private _renderRequestOrigin(origin: IChatRequestOrigin): void {
		switch (origin.kind) {
			case ChatRequestOriginKind.Delegation: {
				const isFromAnotherChat = origin.delegationScope === 'chat';
				const isFromAnotherSession = origin.delegationScope === 'session';
				this._renderContent(
					isFromAnotherChat
						? localize('chat.requestOrigin.delegation.chat', "Sent from another chat")
						: isFromAnotherSession
							? localize('chat.requestOrigin.delegation.session', "Sent by another session")
							: localize('chat.requestOrigin.delegation', "Sent by Codex from another chat"),
					undefined,
					isFromAnotherChat
						? localize('chat.requestOrigin.delegationAriaLabel.chat', "Sent from another chat. Select to open the source.")
						: isFromAnotherSession
							? localize('chat.requestOrigin.delegationAriaLabel.session', "Sent by another session. Select to open the source.")
							: localize('chat.requestOrigin.delegationAriaLabel', "Sent by Codex from another chat. Select to open the source chat."),
				);
				break;
			}
		}
	}

	private _renderSideChatOrigin(origin: IChatSideChatOrigin | undefined): void {
		const renderVersion = ++this._renderVersion;

		if (!origin) {
			dom.clearNode(this.domNode);
			this.domNode.classList.add('hidden');
			this.domNode.removeAttribute('aria-label');
			return;
		}
		const title = origin.sourceTitle ?? localize('chat.sideChatOrigin.originalConversation', "Original conversation");
		let quote: string | undefined;
		let shouldLoadSourceSession = false;
		if (origin.selection) {
			quote = this._normalizeQuote(origin.selection.text);
		} else {
			const sourceSession = this._chatService.getSession(origin.sourceSessionResource);
			if (sourceSession) {
				quote = this._getRequestQuote(sourceSession, origin.sourceTurnId);
			} else {
				shouldLoadSourceSession = true;
			}
		}
		this._renderContent(title, quote);

		if (shouldLoadSourceSession) {
			void this._resolveSourceQuote(origin, title, renderVersion);
		}
	}

	private async _resolveSourceQuote(origin: IChatSideChatOrigin, title: string, renderVersion: number): Promise<void> {
		try {
			const reference = await this._chatService.acquireOrLoadSession(
				origin.sourceSessionResource,
				ChatAgentLocation.Chat,
				this._disposeCts.token,
				'ChatRequestOriginPart#resolveSourceQuote',
			);
			if (!reference) {
				return;
			}

			try {
				if (this._disposeCts.token.isCancellationRequested || this._store.isDisposed || renderVersion !== this._renderVersion) {
					return;
				}

				const quote = this._getRequestQuote(reference.object, origin.sourceTurnId);
				if (quote && renderVersion === this._renderVersion && !this._store.isDisposed) {
					this._renderContent(title, quote);
				}
			} finally {
				reference.dispose();
			}
		} catch (error) {
			if (!this._disposeCts.token.isCancellationRequested) {
				onUnexpectedError(error);
			}
		}
	}

	private _getRequestQuote(sourceSession: IChatModel, sourceTurnId: string): string | undefined {
		return this._normalizeQuote(sourceSession.getRequests().find(request => request.id === sourceTurnId)?.message.text);
	}

	private _normalizeQuote(text: string | undefined): string | undefined {
		const quote = text?.replace(/\s+/g, ' ').trim();
		return quote || undefined;
	}

	private _renderContent(title: string, quote: string | undefined, ariaLabel?: string): void {
		dom.clearNode(this.domNode);
		this.domNode.classList.remove('hidden');
		this.domNode.classList.toggle('has-no-quote', !quote);
		this.domNode.classList.toggle('delegation', ariaLabel !== undefined);

		const header = dom.$('.chat-request-origin-header');
		const icon = dom.$('span.chat-request-origin-icon');
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.reply));
		icon.setAttribute('aria-hidden', 'true');
		const titleElement = dom.$('span.chat-request-origin-title');
		titleElement.textContent = title;
		header.append(icon, titleElement);
		this.domNode.appendChild(header);

		if (quote) {
			const quoteElement = dom.$('span.chat-request-origin-quote');
			quoteElement.textContent = quote;
			this.domNode.appendChild(quoteElement);
			this.domNode.setAttribute('aria-label', localize(
				'chat.sideChatOrigin.ariaLabel',
				"Side chat about {0}: {1}. Select to show the original message.",
				title,
				quote,
			));
		} else if (ariaLabel) {
			this.domNode.setAttribute('aria-label', ariaLabel);
		} else {
			this.domNode.setAttribute('aria-label', localize(
				'chat.sideChatOrigin.ariaLabelNoQuote',
				"Side chat about {0}. Select to show the original message.",
				title,
			));
		}
	}

	private async _openRequestOrigin(origin: IChatRequestOrigin): Promise<void> {
		if (!await this._requestOriginService.open(origin)) {
			await this._chatWidgetService.openSession(origin.sourceSessionResource);
		}
	}

	private _open(): void {
		void this._openSource?.().catch(onUnexpectedError);
	}
}
