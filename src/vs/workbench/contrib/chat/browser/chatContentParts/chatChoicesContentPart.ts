/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatProgressRenderableResponseContent } from '../../common/chatModel.js';
import { IChatChoices, IChatSendRequestOptions, IChatService } from '../../common/chatService.js';
import { isResponseVM } from '../../common/chatViewModel.js';
import { IChatWidgetService } from '../chat.js';
import { ChatChoicesWidget } from './chatChoicesWidget.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';

export class ChatChoicesContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private get showButtons() {
		return this.choices.disableAfterUse ? !this.choices.isUsed : true;
	}

	constructor(
		private readonly choices: IChatChoices,
		context: IChatContentPartRenderContext,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatService private readonly chatService: IChatService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
	) {
		super();

		const element = context.element;
		const buttonsWidget = this._register(this.instantiationService.createInstance(
			ChatChoicesWidget<string | { title: string }>,
			choices.title,
			choices.message,
			choices.items.map((choice, i) => ({
				label: choiceLabel(choice),
				data: choice,
				isSecondary: i > 0,
			}))
		));
		buttonsWidget.setShowButtons(this.showButtons);

		this._register(buttonsWidget.onDidClick(async e => {
			if (isResponseVM(element)) {
				const prompt = `${e.label}: "${choices.title}"`;
				const options: IChatSendRequestOptions = {
					choiceData: [e.data],
					agentId: element.agent?.id,
					slashCommand: element.slashCommand?.name,
					madeChoice: {
						title: e.label,
						responseId: context.element.id,
					},
					userSelectedModelId: chatWidgetService.getWidgetBySessionId(element.sessionId)?.input.currentLanguageModel,
				};

				const wasShowingButtons = this.showButtons;
				if (await this.chatService.sendRequest(element.sessionId, prompt, options)) {
					choices.isUsed = true;
					if (this.showButtons !== wasShowingButtons) {
						buttonsWidget.setShowButtons(this.showButtons);
						this._onDidChangeHeight.fire();
					}
				}
			}
		}));

		this.domNode = buttonsWidget.domNode;
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		// No other change allowed for this content type
		return other.kind === 'choices';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

const choiceLabel = (choice: string | { title: string }) => typeof choice === 'string' ? choice : choice.title;
