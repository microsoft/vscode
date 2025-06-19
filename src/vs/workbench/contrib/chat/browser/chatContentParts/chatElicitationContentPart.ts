/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { isMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatProgressRenderableResponseContent } from '../../common/chatModel.js';
import { IChatElicitationRequest } from '../../common/chatService.js';
import { ChatConfirmationWidget } from './chatConfirmationWidget.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';

export class ChatElicitationContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		elicitation: IChatElicitationRequest,
		context: IChatContentPartRenderContext,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		const buttons = [
			{ label: localize('accept', "Respond"), data: true },
			{ label: localize('dismiss', "Cancel"), data: false, isSecondary: true },
		];
		const confirmationWidget = this._register(this.instantiationService.createInstance(ChatConfirmationWidget, elicitation.title, elicitation.originMessage, elicitation.message, buttons, context.container));
		confirmationWidget.setShowButtons(elicitation.state === 'pending');

		this._register(confirmationWidget.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

		this._register(confirmationWidget.onDidClick(async e => {
			if (e.data) {
				await elicitation.accept();
			} else {
				await elicitation.reject();
			}

			confirmationWidget.setShowButtons(false);
			if (elicitation.acceptedResult) {
				const messageMd = isMarkdownString(elicitation.message) ? MarkdownString.lift(elicitation.message) : new MarkdownString(elicitation.message);
				messageMd.appendCodeblock('json', JSON.stringify(elicitation.acceptedResult, null, 2));
				confirmationWidget.updateMessage(messageMd);
			}

			this._onDidChangeHeight.fire();
		}));

		this.domNode = confirmationWidget.domNode;
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		// No other change allowed for this content type
		return other.kind === 'elicitation';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
