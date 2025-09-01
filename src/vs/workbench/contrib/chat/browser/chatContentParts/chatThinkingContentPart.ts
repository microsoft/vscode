/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, clearNode } from '../../../../../base/browser/dom.js';
import { IChatThinkingPart } from '../../common/chatService.js';
import { IChatContentPartRenderContext, IChatContentPart } from './chatContentParts.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { ChatTreeItem } from '../chat.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { MarkdownRenderer, IMarkdownRenderResult } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { localize } from '../../../../../nls.js';

export class ChatThinkingContentPart extends ChatCollapsibleContentPart implements IChatContentPart {
	public readonly codeblocks: undefined;
	public readonly codeblocksPartId: undefined;

	private id: string | undefined;
	private currentThinkingValue: string;
	private appliedTitle: string;
	private hasExplicitTitle: boolean;
	private readonly renderer: MarkdownRenderer;
	private textContainer!: HTMLElement;
	private markdownResult: IMarkdownRenderResult | undefined;
	private wrapper!: HTMLElement;

	constructor(
		content: IChatThinkingPart,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const initialText = ChatThinkingContentPart.extractTextFromPart(content);
		const extractedTitle = ChatThinkingContentPart.extractTitleFromThinkingContent(initialText)
			?? localize('chat.thinking.header', 'Thinking...');

		super(extractedTitle, context);

		this.renderer = instantiationService.createInstance(MarkdownRenderer, {});
		this.id = content.id;
		this.currentThinkingValue = initialText;
		this.appliedTitle = extractedTitle;
		this.hasExplicitTitle = extractedTitle !== localize('chat.thinking.header', 'Thinking...');

		const node = super.domNode;
		node.classList.add('chat-thinking-box');
		node.tabIndex = 0;

		this.setExpanded(false);
	}

	private parseContent(content: string): string {
		const noSep = content.replace(/<\|im_sep\|>\*{4,}/g, '').trim();
		return noSep;
	}

	private static extractTextFromPart(content: IChatThinkingPart): string {
		const raw = Array.isArray(content.value) ? content.value.join('') : (content.value || '');
		return raw.replace(/<\|im_sep\|>\*{4,}/g, '').trim();
	}

	private static extractTitleFromThinkingContent(content: string): string | undefined {
		const headerMatch = content.match(/^\*\*([^*]+)\*\*\s*\n\n/);
		return headerMatch ? headerMatch[1].trim() : undefined;
	}

	protected override initContent(): HTMLElement {
		this.wrapper = $('.chat-used-context-list.chat-thinking-collapsible');
		this.textContainer = $('.chat-thinking-item.markdown-content');
		this.wrapper.appendChild(this.textContainer);

		if (this.currentThinkingValue) {
			this.renderMarkdown(this.currentThinkingValue);
		}

		return this.wrapper;
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
		this.markdownResult = this._register(this.renderer.render(new MarkdownString(cleanedContent)));
		this.textContainer.appendChild(this.markdownResult.element);
	}

	public resetId(): void {
		this.id = undefined;
	}

	public updateThinking(content: IChatThinkingPart): void {
		const raw = ChatThinkingContentPart.extractTextFromPart(content);
		const next = this.parseContent(raw);
		if (next === this.currentThinkingValue) {
			return;
		}
		this.currentThinkingValue = next;
		this.renderMarkdown(next);

		// if title is present now (e.g., arrived mid-stream), update the header label
		const maybeTitle = ChatThinkingContentPart.extractTitleFromThinkingContent(raw);
		if (maybeTitle && maybeTitle !== this.appliedTitle) {
			this.setTitle(maybeTitle);
			this.appliedTitle = maybeTitle;
			this.hasExplicitTitle = true;
		}
	}

	public finalizeTitleIfDefault(): void {
		if (!this.hasExplicitTitle) {
			const done = localize('chat.pinned.thinking.header.done', 'Thought for a few seconds...');
			this.setTitle(done);
			this.appliedTitle = done;
		}
	}

	public appendItem(content: HTMLElement): void {
		this.wrapper.appendChild(content);
	}

	// makes a new text container
	// when we do update, we now update this container.
	public setupThinkingContainer(content: IChatThinkingPart, context: IChatContentPartRenderContext) {
		this.textContainer = $('.chat-thinking-item.markdown-content');
		this.wrapper.appendChild(this.textContainer);
		this.id = content?.id;
		this.updateThinking(content);
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {

		if (other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized') {
			return true;
		}

		if (other.kind !== 'thinking') {
			return false;
		}

		return other?.id !== this.id;
	}

	override dispose(): void {
		if (this.markdownResult) {
			this.markdownResult.dispose();
			this.markdownResult = undefined;
		}
		super.dispose();
	}
}
