/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { IMarkdownString, isMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatProgressRenderableResponseContent } from '../../common/chatModel.js';
import { IChatElicitationRequest } from '../../common/chatService.js';
import { IChatAccessibilityService } from '../chat.js';
import { ChatConfirmationWidget, IChatConfirmationButton } from './chatConfirmationWidget.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { IAction } from '../../../../../base/common/actions.js';

export class ChatElicitationContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		elicitation: IChatElicitationRequest,
		context: IChatContentPartRenderContext,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatAccessibilityService private readonly chatAccessibilityService: IChatAccessibilityService
	) {
		super();

		const buttons: IChatConfirmationButton<unknown>[] = [
			{
				label: elicitation.acceptButtonLabel,
				data: true,
				moreActions: elicitation.moreActions?.map((action: IAction) => ({
					label: action.label,
					data: action,
					run: action.run
				}))
			},
		];
		if (elicitation.rejectButtonLabel && elicitation.reject) {
			buttons.push({ label: elicitation.rejectButtonLabel, data: false, isSecondary: true });
		}
		const confirmationWidget = this._register(this.instantiationService.createInstance(ChatConfirmationWidget, context, {
			title: elicitation.title,
			subtitle: elicitation.subtitle,
			buttons,
			message: this.getMessageToRender(elicitation),
			toolbarData: { partType: 'elicitation', partSource: elicitation.source?.type, arg: elicitation }
		}));
		confirmationWidget.setShowButtons(elicitation.state === 'pending');

		if (elicitation.isHidden) {
			this._register(autorun(reader => {
				if (elicitation.isHidden?.read(reader)) {
					this.domNode.remove();
				}
			}));
		}

		this._register(confirmationWidget.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

		this._register(confirmationWidget.onDidClick(async e => {
			let result: boolean | IAction | undefined;
			if (typeof e.data === 'boolean' && e.data === true) {
				result = e.data;
			} else if (e.data && typeof e.data === 'object' && 'run' in e.data && 'label' in e.data) {
				result = e.data as IAction;
			} else {
				result = undefined;
			}
			if (result !== undefined) {
				await elicitation.accept(result);
			} else if (elicitation.reject) {
				await elicitation.reject();
			}

			confirmationWidget.setShowButtons(false);
			confirmationWidget.updateMessage(this.getMessageToRender(elicitation));

			this._onDidChangeHeight.fire();
		}));

		this.chatAccessibilityService.acceptElicitation(elicitation);
		this.domNode = confirmationWidget.domNode;
		this.domNode.tabIndex = 0;
		const messageToRender = this.getMessageToRender(elicitation);
		this.domNode.ariaLabel = elicitation.title + ' ' + (typeof messageToRender === 'string' ? messageToRender : messageToRender.value || '');
	}

	private getMessageToRender(elicitation: IChatElicitationRequest): IMarkdownString | string {
		if (!elicitation.acceptedResult) {
			return elicitation.message;
		}

		const messageMd = isMarkdownString(elicitation.message) ? MarkdownString.lift(elicitation.message) : new MarkdownString(elicitation.message);
		messageMd.appendCodeblock('json', JSON.stringify(elicitation.acceptedResult, null, 2));
		return messageMd;
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		// No other change allowed for this content type
		return other.kind === 'elicitation';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
