/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatProgressMessage, IChatToolInvocation, IChatToolInvocationSerialized } from '../../common/chatService.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { ChatTreeItem } from '../chat.js';
import { ChatConfirmationWidget } from './chatConfirmationWidget.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatProgressContentPart } from './chatProgressContentPart.js';

export class ChatToolInvocationPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private _onNeedsRerender = this._register(new Emitter<void>());
	public readonly onNeedsRerender = this._onNeedsRerender.event;

	constructor(
		private readonly toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		context: IChatContentPartRenderContext,
		renderer: MarkdownRenderer,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		if (toolInvocation.kind === 'toolInvocation' && toolInvocation.confirmationMessages) {
			const title = toolInvocation.confirmationMessages.title;
			const message = toolInvocation.confirmationMessages.message;
			const confirmWidget = this._register(instantiationService.createInstance(
				ChatConfirmationWidget,
				title,
				message,
				[{ label: localize('continue', "Continue"), data: true }, { label: localize('cancel', "Cancel"), data: false, isSecondary: true }]));
			this.domNode = confirmWidget.domNode;
			this._register(confirmWidget.onDidClick(button => {
				toolInvocation.confirmed.complete(button.data);
				this._onNeedsRerender.fire();
			}));
		} else {
			const message = toolInvocation.invocationMessage + '…';
			const progressMessage: IChatProgressMessage = {
				kind: 'progressMessage',
				content: { value: message }
			};
			const iconOverride = toolInvocation.isConfirmed === false ? Codicon.error : undefined;
			const progressPart = this._register(instantiationService.createInstance(ChatProgressContentPart, progressMessage, renderer, context, undefined, true, iconOverride));
			this.domNode = progressPart.domNode;
		}
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		const thisHasConfirmationMessages = this.toolInvocation.kind === 'toolInvocation' && !!this.toolInvocation.confirmationMessages;
		const otherHasConfirmationMessages = other.kind === 'toolInvocation' && !!other.confirmationMessages;
		return other.kind === 'toolInvocation' && (thisHasConfirmationMessages === otherHasConfirmationMessages);
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
