/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import './media/chatConfirmationWidget.css';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';

export interface IChatConfirmationButton {
	label: string;
	isSecondary?: boolean;
	data: any;
}

export class ChatConfirmationWidget extends Disposable {
	private _onDidClick = this._register(new Emitter<IChatConfirmationButton>());
	get onDidClick(): Event<IChatConfirmationButton> { return this._onDidClick.event; }

	private _domNode: HTMLElement;
	get domNode(): HTMLElement {
		return this._domNode;
	}

	setShowButtons(showButton: boolean): void {
		this.domNode.classList.toggle('hideButtons', !showButton);
	}

	constructor(
		title: string,
		message: string,
		buttons: IChatConfirmationButton[],
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		const elements = dom.h('.chat-confirmation-widget@root', [
			dom.h('.chat-confirmation-widget-title@title'),
			dom.h('.chat-confirmation-widget-message@message'),
			dom.h('.chat-confirmation-buttons-container@buttonsContainer'),
		]);
		this._domNode = elements.root;
		const renderer = this._register(this.instantiationService.createInstance(MarkdownRenderer, {}));

		const renderedTitle = this._register(renderer.render(new MarkdownString(title)));
		elements.title.appendChild(renderedTitle.element);

		const renderedMessage = this._register(renderer.render(new MarkdownString(message)));
		elements.message.appendChild(renderedMessage.element);

		buttons.forEach(buttonData => {
			const button = new Button(elements.buttonsContainer, { ...defaultButtonStyles, secondary: buttonData.isSecondary });
			button.label = buttonData.label;
			this._register(button.onDidClick(() => this._onDidClick.fire(buttonData)));
		});
	}
}
