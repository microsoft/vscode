/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, clearNode } from '../../../../../base/browser/dom.js';
import { IChatThinkingPart } from '../../common/chatService.js';
import { IChatContentPartRenderContext } from './chatContentParts.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { MarkdownRenderer, IMarkdownRenderResult } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { localize } from '../../../../../nls.js';

export class ChatThinkingContentPart extends ChatCollapsibleContentPart {

	private currentThinkingValue: string;
	private readonly renderer: MarkdownRenderer;
	private textContainer!: HTMLElement;
	private markdownResult: IMarkdownRenderResult | undefined;

	constructor(
		content: IChatThinkingPart,
		_context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(localize('thinkingHeader', "Thinking..."), _context);

		this.renderer = instantiationService.createInstance(MarkdownRenderer, {});
		this.currentThinkingValue = this.parseContent(content.value || '');

		this.domNode.classList.add('chat-thinking-box');
		this.domNode.tabIndex = 0;

		this.setExpanded(false);
	}

	private parseContent(content: string): string {
		// Remove <|im_sep|>****
		return content
			.replace(/<\|im_sep\|>\*{4,}/g, '')
			.trim();
	}

	private renderMarkdown(content: string): void {
		if (this.markdownResult) {
			this.markdownResult.dispose();
			this.markdownResult = undefined;
		}

		const cleanedContent = this.parseContent(content);
		if (!cleanedContent) {
			return;
		}

		clearNode(this.textContainer);
		this.markdownResult = this.renderer.render(new MarkdownString(cleanedContent));
		this.textContainer.appendChild(this.markdownResult.element);
	}

	protected override initContent(): HTMLElement {
		const container = $('.chat-used-context-list chat-thinking-content');
		this.textContainer = $('.chat-thinking-text.markdown-content');
		container.appendChild(this.textContainer);
		if (this.currentThinkingValue) {
			this.renderMarkdown(this.currentThinkingValue);
		}
		return container;
	}

	updateInProgressHeader(elapsedMs: number) {
		const seconds = Math.max(1, Math.floor(elapsedMs / 1000));
		this.setTitle(seconds === 1
			? localize('thinkingSingular', "Thought for 1 second")
			: localize('thinkingPlural', "Thought for {0} seconds", seconds));
	}

	hasSameContent(other: any): boolean {
		return other.kind === 'thinking';
	}

	override dispose(): void {
		if (this.markdownResult) {
			this.markdownResult.dispose();
			this.markdownResult = undefined;
		}
		super.dispose();
	}
}
