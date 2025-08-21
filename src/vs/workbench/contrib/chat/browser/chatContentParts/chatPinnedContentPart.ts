/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatRendererContent } from '../../common/chatViewModel.js';
import { $ } from '../../../../../base/browser/dom.js';
import { ChatTreeItem } from '../chat.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { IChatContentPartRenderContext } from './chatContentParts.js';
import * as nls from '../../../../../nls.js';

export class ChatPinnedContentPart extends ChatCollapsibleContentPart {
	private body!: HTMLElement;
	private timerStartTime: number | undefined;

	constructor(
		private content: HTMLElement | undefined,
		context: IChatContentPartRenderContext,
	) {
		super(nls.localize('chat.pinned.thinking.header.base', "Thinking"), context);
		this.setExpanded(true);
		this.domNode.classList.add('chat-thinking-box');
		this.domNode.tabIndex = 0;

		if (this.content) {
			this.appendItem(this.content);
		}

		this._register({ dispose: () => this.clearTimer() });
	}

	protected override initContent(): HTMLElement {
		const container = $('.chat-used-context-list.chat-thinking-items');
		this.body = container;
		return container;
	}

	update(content: HTMLElement) {
		if (content.parentElement === this.body) {
			return;
		}

		this.appendItem(content);
	}

	private appendItem(node: HTMLElement) {
		const wrapper = $('.chat-thinking-item');
		wrapper.setAttribute('role', 'listitem');
		wrapper.appendChild(node);
		this.body.appendChild(wrapper);
		this.refreshTitle();
	}

	private refreshTitle(elapsedTime?: number) {
		const elapsedText = this.formatElapsed(elapsedTime);
		let title: string;
		if (elapsedText) {
			title = nls.localize('chat.pinned.thinking.header.count.time', "Thought for {0}", elapsedText);
		} else {
			title = nls.localize('chat.pinned.thinking.header.count', "Thinking...");
		}
		this.setTitle(title);
	}

	// Timer controls
	public startTimer(): void {
		this.clearTimer();
		this.timerStartTime = Date.now();
		this.refreshTitle();
	}

	public stopTimerAndFinalize(): void {
		if (!this.timerStartTime) {
			return;
		}
		const now = Date.now();
		const elapsedTime = Math.max(0, now - this.timerStartTime);
		this.clearTimer();
		this.refreshTitle(elapsedTime);
	}

	private clearTimer(): void {
		this.timerStartTime = undefined;
	}

	private formatElapsed(elapsedTime?: number): string | undefined {
		if (!elapsedTime) {
			return undefined;
		}

		const totalSeconds = Math.max(1, Math.ceil(elapsedTime / 1000));
		return `${totalSeconds}s`;
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		return other.kind === 'thinking' || other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized';
	}
}
