/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatErrorLevel, IChatResponseErrorDetailsConfirmationButton, IChatSendRequestOptions, IChatService } from '../../common/chatService.js';
import { assertIsResponseVM, IChatRendererContent } from '../../common/chatViewModel.js';
import { IChatWidgetService } from '../chat.js';
import { ChatCustomConfirmationWidget } from './chatConfirmationWidget.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';

const $ = dom.$;

export class ChatErrorConfirmationContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		kind: ChatErrorLevel,
		content: IMarkdownString,
		private readonly errorDetails: IChatRendererContent,
		confirmationButtons: IChatResponseErrorDetailsConfirmationButton[],
		renderer: MarkdownRenderer,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IChatService chatService: IChatService,
	) {
		super();

		const element = context.element;
		assertIsResponseVM(element);

		const messageElement = $('.chat-notification-widget');
		let icon;
		let iconClass;
		switch (kind) {
			case ChatErrorLevel.Warning:
				icon = Codicon.warning;
				iconClass = '.chat-warning-codicon';
				break;
			case ChatErrorLevel.Error:
				icon = Codicon.error;
				iconClass = '.chat-error-codicon';
				break;
			case ChatErrorLevel.Info:
				icon = Codicon.info;
				iconClass = '.chat-info-codicon';
				break;
		}
		messageElement.appendChild($(iconClass, undefined, renderIcon(icon)));
		const markdownContent = this._register(renderer.render(content));
		messageElement.appendChild(markdownContent.element);

		const confirmationWidget = this._register(instantiationService.createInstance(ChatCustomConfirmationWidget, '', undefined, messageElement, confirmationButtons, context.container));
		this.domNode = confirmationWidget.domNode;
		confirmationWidget.setShowButtons(true);

		this._register(confirmationWidget.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

		this._register(confirmationWidget.onDidClick(async e => {
			const prompt = e.label;
			const options: IChatSendRequestOptions = e.isSecondary ?
				{ rejectedConfirmationData: [e.data] } :
				{ acceptedConfirmationData: [e.data] };
			options.agentId = element.agent?.id;
			options.slashCommand = element.slashCommand?.name;
			options.confirmation = e.label;
			const widget = chatWidgetService.getWidgetBySessionId(element.sessionId);
			options.userSelectedModelId = widget?.input.currentLanguageModel;
			options.mode = widget?.input.currentMode;
			if (await chatService.sendRequest(element.sessionId, prompt, options)) {
				confirmationWidget.setShowButtons(false);
				this._onDidChangeHeight.fire();
			}
		}));
	}

	hasSameContent(other: IChatRendererContent): boolean {
		return other.kind === this.errorDetails.kind;
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
