/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatProgressRenderableResponseContent } from '../../common/chatModel.js';
import { IChatConfirmation, IChatSendRequestOptions, IChatService } from '../../common/chatService.js';
import { isResponseVM } from '../../common/chatViewModel.js';
import { IChatWidgetService } from '../chat.js';
import { SimpleChatConfirmationWidget } from './chatConfirmationWidget.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';

export class ChatConfirmationContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		confirmation: IChatConfirmation,
		context: IChatContentPartRenderContext,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatService private readonly chatService: IChatService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
	) {
		super();

		const element = context.element;
		const buttons = confirmation.buttons
			? confirmation.buttons.map(button => ({
				label: button,
				data: confirmation.data,
				isSecondary: button !== confirmation.buttons?.[0],
			}))
			: [
				{ label: localize('accept', "Accept"), data: confirmation.data },
				{ label: localize('dismiss', "Dismiss"), data: confirmation.data, isSecondary: true },
			];
		const confirmationWidget = this._register(this.instantiationService.createInstance(SimpleChatConfirmationWidget, context, { title: confirmation.title, buttons, message: confirmation.message, silent: confirmation.isLive === false }));
		confirmationWidget.setShowButtons(!confirmation.isUsed);

		this._register(confirmationWidget.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

		this._register(confirmationWidget.onDidClick(async e => {
			if (isResponseVM(element)) {
				const prompt = `${e.label}: "${confirmation.title}"`;
				const options: IChatSendRequestOptions = e.isSecondary ?
					{ rejectedConfirmationData: [e.data] } :
					{ acceptedConfirmationData: [e.data] };
				options.agentId = element.agent?.id;
				options.slashCommand = element.slashCommand?.name;
				options.confirmation = e.label;
				const widget = chatWidgetService.getWidgetBySessionResource(element.sessionResource);
				options.userSelectedModelId = widget?.input.currentLanguageModel;
				options.modeInfo = widget?.input.currentModeInfo;
				options.location = widget?.location;
				Object.assign(options, widget?.getModeRequestOptions());

				if (await this.chatService.sendRequest(element.sessionResource, prompt, options)) {
					confirmation.isUsed = true;
					confirmationWidget.setShowButtons(false);
					this._onDidChangeHeight.fire();
				}
			}
		}));

		this.domNode = confirmationWidget.domNode;
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		// No other change allowed for this content type
		return other.kind === 'confirmation';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
