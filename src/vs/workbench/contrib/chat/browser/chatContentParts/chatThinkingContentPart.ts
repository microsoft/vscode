/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IChatThinkingPart } from '../../common/chatService.js';
import { IChatContentPartRenderContext, IChatContentPart } from './chatContentParts.js';

export class ChatThinkingContentPart extends Disposable implements IChatContentPart {

	readonly domNode: HTMLElement;
	public readonly codeblocks: undefined;
	public readonly codeblocksPartId: undefined;

	private readonly _onDidChangeHeight = new Emitter<void>();
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	addDisposable<T extends IDisposable>(disposable: T): T {
		return this._register(disposable);
	}

	constructor(
		private readonly content: IChatThinkingPart,
		_context: IChatContentPartRenderContext,
	) {
		super();

		this.domNode = dom.$('div.thinking-content');
		this.domNode.classList.add('chat-thinking');

		const thinkingContainer = dom.$('div.thinking-container');
		dom.append(this.domNode, thinkingContainer);

		const iconContainer = dom.$('div.thinking-icon');
		dom.append(thinkingContainer, iconContainer);
		dom.append(iconContainer, dom.$('span.codicon.codicon-lightbulb'));

		// thinking content
		const textContainer = dom.$('div.thinking-text');
		dom.append(thinkingContainer, textContainer);
		textContainer.textContent = content.value;

		if (content.metadata) {
			const metadataContainer = dom.$('div.thinking-metadata');
			dom.append(thinkingContainer, metadataContainer);
			metadataContainer.textContent = content.metadata;
		}
	}

	hasSameContent(other: IChatThinkingPart): boolean {
		return other.kind === 'thinking' &&
			other.value === this.content.value &&
			other.id === this.content.id &&
			other.metadata === this.content.metadata;
	}

	update(newContent: IChatThinkingPart): void {
		let contentChanged = false;

		if (this.content.value !== newContent.value) {
			const textContainer = this.domNode.querySelector('.thinking-text') as HTMLElement;
			if (textContainer) {
				textContainer.textContent = newContent.value;
				contentChanged = true;
			}
		}

		if (this.content.metadata !== newContent.metadata && newContent.metadata) {
			let metadataContainer = this.domNode.querySelector('.thinking-metadata') as HTMLElement;
			if (!metadataContainer && newContent.metadata) {
				const thinkingContainer = this.domNode.querySelector('.thinking-container') as HTMLElement;
				if (thinkingContainer) {
					metadataContainer = dom.$('div.thinking-metadata');
					dom.append(thinkingContainer, metadataContainer);
					contentChanged = true;
				}
			}

			if (metadataContainer) {
				metadataContainer.textContent = newContent.metadata;
				contentChanged = true;
			}
		}

		if (contentChanged) {
			this._onDidChangeHeight.fire();
		}
	}
}
