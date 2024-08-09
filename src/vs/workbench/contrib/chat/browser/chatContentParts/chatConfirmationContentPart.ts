/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ChatTreeItem } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatConfirmationWidget, IChatConfirmationButton } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatConfirmationWidget';
import { IChatContentPart, IChatContentPartRenderContext } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatContentParts';
import { IChatProgressRenderableResponseContent } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatConfirmation, IChatConfirmationAwaitable, IChatSendRequestOptions, IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatRendererContent, isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';

abstract class BaseChatConfirmationContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	protected readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	protected confirmationWidget: ChatConfirmationWidget;

	constructor(
		confirmation: IChatConfirmation | IChatConfirmationAwaitable,
		onDidClick: (e: IChatConfirmationButton) => void,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		const buttons = confirmation.buttons
			? confirmation.buttons.map(button => ({
				label: button,
				data: 'data' in confirmation && confirmation.data
			}))
			: [
				{ label: localize('accept', "Accept"), data: 'data' in confirmation && confirmation.data },
				{ label: localize('dismiss', "Dismiss"), data: 'data' in confirmation && confirmation.data, isSecondary: true },
			];
		this.confirmationWidget = this._register(this.instantiationService.createInstance(ChatConfirmationWidget, confirmation.title, confirmation.message, buttons));
		this.confirmationWidget.setShowButtons(!confirmation.isUsed);

		this._register(this.confirmationWidget.onDidClick(e => onDidClick(e)));

		this.domNode = this.confirmationWidget.domNode;
	}

	abstract hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean;

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

export class ChatConfirmationContentPart extends BaseChatConfirmationContentPart {
	constructor(
		confirmation: IChatConfirmation,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatService chatService: IChatService,
	) {
		super(
			confirmation,
			async e => {
				const element = context.element;
				if (isResponseVM(element)) {
					const prompt = `${e.label}: "${confirmation.title}"`;
					const data: IChatSendRequestOptions = e.isSecondary ?
						{ rejectedConfirmationData: [e.data] } :
						{ acceptedConfirmationData: [e.data] };
					data.agentId = element.agent?.id;
					data.slashCommand = element.slashCommand?.name;
					data.confirmation = e.label;
					if (await chatService.sendRequest(element.sessionId, prompt, data)) {
						confirmation.isUsed = true;
						this.confirmationWidget.setShowButtons(false);
						this._onDidChangeHeight.fire();
					}
				}
			},
			instantiationService);
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		// No other change allowed for this content type
		return other.kind === 'confirmation';
	}
}

export class ChatAwaitableConfirmationContentPart extends BaseChatConfirmationContentPart {
	constructor(
		confirmation: IChatConfirmationAwaitable,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(
			confirmation,
			e => {
				this.confirmationWidget.setShowButtons(false);
				this._onDidChangeHeight.fire();
				confirmation.isUsed = true;
				confirmation.confirmed.complete(e.label);
			},
			instantiationService);
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		// No other change allowed for this content type
		return other.kind === 'confirmationAwaitable';
	}
}
