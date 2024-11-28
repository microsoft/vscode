/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
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

	private _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		context: IChatContentPartRenderContext,
		renderer: MarkdownRenderer,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.domNode = dom.$('.chat-tool-invocation-part');

		// This part is a bit different, since IChatToolInvocation is not an immutable model object. So this part is able to rerender itself.
		// If this turns out to be a typical pattern, we could come up with a more reusable pattern, like telling the list to rerender an element
		// when the model changes, or trying to make the model immutable and swap out one content part for a new one based on user actions in the view.
		const partStore = this._register(new DisposableStore());
		const render = () => {
			dom.clearNode(this.domNode);

			const subPart = partStore.add(instantiationService.createInstance(ChatToolInvocationSubPart, toolInvocation, context, renderer));
			this.domNode.appendChild(subPart.domNode);
			partStore.add(subPart.onNeedsRerender(() => {
				render();
				this._onDidChangeHeight.fire();
			}));
		};
		render();
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

class ChatToolInvocationSubPart extends Disposable {
	public readonly domNode: HTMLElement;

	private _onNeedsRerender = this._register(new Emitter<void>());
	public readonly onNeedsRerender = this._onNeedsRerender.event;

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
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
			}));
			toolInvocation.confirmed.p.then(() => this._onNeedsRerender.fire());
		} else {
			const content = typeof toolInvocation.invocationMessage === 'string' ?
				new MarkdownString().appendText(toolInvocation.invocationMessage + '…') :
				new MarkdownString(toolInvocation.invocationMessage.value + '…');
			const progressMessage: IChatProgressMessage = {
				kind: 'progressMessage',
				content
			};
			const iconOverride = toolInvocation.isConfirmed === false ?
				Codicon.error :
				toolInvocation.isComplete ?
					Codicon.check : undefined;
			const progressPart = this._register(instantiationService.createInstance(ChatProgressContentPart, progressMessage, renderer, context, undefined, true, iconOverride));
			this.domNode = progressPart.domNode;
		}

		if (toolInvocation.kind === 'toolInvocation' && !toolInvocation.isComplete) {
			toolInvocation.isCompleteDeferred.p.then(() => this._onNeedsRerender.fire());
		}
	}
}
