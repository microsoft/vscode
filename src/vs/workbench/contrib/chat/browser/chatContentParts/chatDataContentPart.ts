/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IChatDataContent } from '../../common/chatService.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { ChatTreeItem } from '../chat.js';
import { IChatOutputRendererService, RenderedOutputPart } from '../chatOutputItemRenderer.js';

const $ = dom.$;

export class ChatDataContentPart extends Disposable implements IChatContentPart {
	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	public readonly domNode: HTMLElement;
	private _renderedOutputPart: RenderedOutputPart | undefined;

	constructor(
		private readonly data: IChatDataContent,
		_context: IChatContentPartRenderContext,
		@IChatOutputRendererService private readonly chatOutputRendererService: IChatOutputRendererService,
	) {
		super();

		this.domNode = $('.chat-data-content-part');
		this._register(dom.addDisposableListener(this.domNode, dom.EventType.FOCUS, () => this.domNode.focus()));

		this.render();
	}

	private async render(): Promise<void> {
		try {
			// Use the chat output renderer service to render the data
			const renderedPart = await this.chatOutputRendererService.renderOutputPart(
				this.data.mimeType,
				this.data.data.buffer,
				this.domNode,
				{ origin: this.getWebviewOrigin() },
				CancellationToken.None
			);

			this._renderedOutputPart = renderedPart;
			this._register(renderedPart);

			// Listen for height changes
			this._register(renderedPart.onDidChangeHeight(() => {
				this._onDidChangeHeight.fire();
			}));
		} catch (error) {
			// If rendering fails, show a fallback message
			this.domNode.textContent = `Cannot render data of type ${this.data.mimeType}`;
		}
	}

	private getWebviewOrigin(): string {
		// Generate a unique origin for this data part
		return `vscode-chat-data-${Date.now()}-${Math.random().toString(36).substring(2)}`;
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'data' && 
			   other.mimeType === this.data.mimeType && 
			   other.data.equals(this.data.data);
	}

	addDisposable(disposable: { dispose(): void }): void {
		this._register(disposable);
	}

	override dispose(): void {
		this._renderedOutputPart?.dispose();
		super.dispose();
	}
}