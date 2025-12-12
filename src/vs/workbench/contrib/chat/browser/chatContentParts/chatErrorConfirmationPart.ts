/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button, IButtonOptions } from '../../../../../base/browser/ui/button/button.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IMarkdownRenderer } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ChatErrorLevel, IChatResponseErrorDetailsConfirmationButton, IChatSendRequestOptions, IChatService } from '../../common/chatService.js';
import { assertIsResponseVM, IChatErrorDetailsPart, IChatRendererContent } from '../../common/chatViewModel.js';
import { IChatWidgetService } from '../chat.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatErrorWidget } from './chatErrorContentPart.js';

const $ = dom.$;

export class ChatErrorConfirmationContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		kind: ChatErrorLevel,
		content: IMarkdownString,
		private readonly errorDetails: IChatErrorDetailsPart,
		confirmationButtons: IChatResponseErrorDetailsConfirmationButton[],
		renderer: IMarkdownRenderer,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IChatService chatService: IChatService,
	) {
		super();

		const element = context.element;
		assertIsResponseVM(element);

		this.domNode = $('.chat-error-confirmation');
		this.domNode.append(this._register(new ChatErrorWidget(kind, content, renderer)).domNode);

		const buttonOptions: IButtonOptions = { ...defaultButtonStyles };

		const buttonContainer = dom.append(this.domNode, $('.chat-buttons-container'));
		confirmationButtons.forEach(buttonData => {
			const button = this._register(new Button(buttonContainer, buttonOptions));
			button.label = buttonData.label;

			this._register(button.onDidClick(async () => {
				const prompt = buttonData.label;
				const options: IChatSendRequestOptions = buttonData.isSecondary ?
					{ rejectedConfirmationData: [buttonData.data] } :
					{ acceptedConfirmationData: [buttonData.data] };
				options.agentId = element.agent?.id;
				options.slashCommand = element.slashCommand?.name;
				options.confirmation = buttonData.label;
				const widget = chatWidgetService.getWidgetBySessionResource(element.sessionResource);
				options.userSelectedModelId = widget?.input.currentLanguageModel;
				Object.assign(options, widget?.getModeRequestOptions());
				if (await chatService.sendRequest(element.sessionResource, prompt, options)) {
					this._onDidChangeHeight.fire();
				}
			}));
		});
	}

	hasSameContent(other: IChatRendererContent): boolean {
		return other.kind === this.errorDetails.kind && other.isLast === this.errorDetails.isLast;
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
