/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import './media/chatConfirmationWidget.css';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';

export interface IChatConfirmationButton {
	label: string;
	isSecondary?: boolean;
	tooltip?: string;
	data: any;
}

abstract class BaseChatConfirmationWidget extends Disposable {
	private _onDidClick = this._register(new Emitter<IChatConfirmationButton>());
	get onDidClick(): Event<IChatConfirmationButton> { return this._onDidClick.event; }

	protected _onDidChangeHeight = this._register(new Emitter<void>());
	get onDidChangeHeight(): Event<void> { return this._onDidChangeHeight.event; }

	private _domNode: HTMLElement;
	get domNode(): HTMLElement {
		return this._domNode;
	}

	setShowButtons(showButton: boolean): void {
		this.domNode.classList.toggle('hideButtons', !showButton);
	}

	private readonly messageElement: HTMLElement;
	protected readonly markdownRenderer: MarkdownRenderer;

	constructor(
		title: string,
		buttons: IChatConfirmationButton[],
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
	) {
		super();

		const elements = dom.h('.chat-confirmation-widget@root', [
			dom.h('.chat-confirmation-widget-title@title'),
			dom.h('.chat-confirmation-widget-message@message'),
			dom.h('.chat-confirmation-buttons-container@buttonsContainer'),
		]);
		this._domNode = elements.root;
		this.markdownRenderer = this.instantiationService.createInstance(MarkdownRenderer, {});

		const renderedTitle = this._register(this.markdownRenderer.render(new MarkdownString(title), {
			asyncRenderCallback: () => this._onDidChangeHeight.fire(),
		}));
		elements.title.append(renderedTitle.element);
		this.messageElement = elements.message;
		buttons.forEach(buttonData => {
			const button = this._register(new Button(elements.buttonsContainer, { ...defaultButtonStyles, secondary: buttonData.isSecondary, title: buttonData.tooltip }));
			button.label = buttonData.label;
			this._register(button.onDidClick(() => this._onDidClick.fire(buttonData)));
		});
	}

	protected renderMessage(element: HTMLElement): void {
		this.messageElement.append(element);
	}
}

export class ChatConfirmationWidget extends BaseChatConfirmationWidget {
	constructor(
		title: string,
		private readonly message: string | IMarkdownString,
		buttons: IChatConfirmationButton[],
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(title, buttons, instantiationService);

		const renderedMessage = this._register(this.markdownRenderer.render(
			typeof this.message === 'string' ? new MarkdownString(this.message) : this.message,
			{ asyncRenderCallback: () => this._onDidChangeHeight.fire() }
		));
		this.renderMessage(renderedMessage.element);
	}
}

export class ChatCustomConfirmationWidget extends BaseChatConfirmationWidget {
	constructor(
		title: string,
		messageElement: HTMLElement,
		buttons: IChatConfirmationButton[],
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(title, buttons, instantiationService);
		this.renderMessage(messageElement);
	}
}
