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
		// Compute initial title using the same logic as ChatListItemRenderer#extractTitleFromThinkingContent
		const initialText = ChatThinkingContentPart.extractTextFromPart(content);
		const extractedTitle = ChatThinkingContentPart.extractTitleFromThinkingContent(initialText)
			?? localize('chat.thinking.header', 'Thinking...');

		super(extractedTitle, context);

		this.renderer = instantiationService.createInstance(MarkdownRenderer, {});
		this.id = content.id;
		this.currentThinkingValue = initialText;
		this.appliedTitle = extractedTitle;
		this.hasExplicitTitle = extractedTitle !== localize('chat.thinking.header', 'Thinking...');

		// Force init and add styling classes
		const node = super.domNode;
		node.classList.add('chat-thinking-box');
		node.tabIndex = 0;

		// Default to collapsed; user can expand to view details
		this.setExpanded(false);
	}

	private parseContent(content: string): string {
		// Remove separators and leading title line if present
		const noSep = content.replace(/<\|im_sep\|>\*{4,}/g, '').trim();
		return ChatThinkingContentPart.stripLeadingTitle(noSep);
	}

	private static extractTextFromPart(content: IChatThinkingPart): string {
		const raw = Array.isArray(content.value) ? content.value.join('') : (content.value || '');
		// Only remove separators here; title stripping is handled in parseContent so we can still extract it
		return raw.replace(/<\|im_sep\|>\*{4,}/g, '').trim();
	}

	// Matches first bold header followed by a blank line: **Title**\n\n
	private static extractTitleFromThinkingContent(content: string): string | undefined {
		const headerMatch = content.match(/^\*\*([^*]+)\*\*\s*\n\n/);
		return headerMatch ? headerMatch[1].trim() : undefined;
	}

	protected override initContent(): HTMLElement {
		// Use the same container class as other collapsible parts so existing CSS rules
		// for expand/collapse apply (e.g., when the parent has 'chat-used-context-collapsed').
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
		this.markdownResult = this.renderer.render(new MarkdownString(cleanedContent));
		this.textContainer.appendChild(this.markdownResult.element);
	}

	public updateId(content?: IChatThinkingPart, stop?: boolean) {
		if (stop) {
			this.id = '';
			return;
		}
		this.id = content?.id;
	}

	public updateThinking(content: IChatThinkingPart): void {
		const raw = ChatThinkingContentPart.extractTextFromPart(content);
		const next = this.parseContent(raw);
		if (next === this.currentThinkingValue) {
			return;
		}
		this.currentThinkingValue = next;
		this.renderMarkdown(next);

		// If a title is present now (e.g., arrived mid-stream), update the header label
		const maybeTitle = ChatThinkingContentPart.extractTitleFromThinkingContent(raw);
		if (maybeTitle && maybeTitle !== this.appliedTitle) {
			this.setTitle(maybeTitle);
			this.appliedTitle = maybeTitle;
			this.hasExplicitTitle = true;
		}
		if (this.domNode.isConnected) {
			queueMicrotask(() => this._onDidChangeHeight.fire());
		}
	}

	// Called when the thinking block is considered complete; if no explicit title was found,
	// set a friendly summary title.
	public finalizeTitleIfDefault(): void {
		if (!this.hasExplicitTitle) {
			const done = localize('chat.pinned.thinking.header.done', 'Thought for a few seconds...');
			this.setTitle(done);
			this.appliedTitle = done;
		}
	}

	public updateBodyContent(content: HTMLElement): void {
		this.domNode.appendChild(content);
		if (this.domNode.isConnected) {
			queueMicrotask(() => this._onDidChangeHeight.fire());
		}
	}

	public appendItem(content: HTMLElement): void {
		this.wrapper.appendChild(content);
		if (this.wrapper.isConnected) {
			queueMicrotask(() => this._onDidChangeHeight.fire());
		}
	}

	// makes a new text container
	// when we do update, we now update this container.
	public updateNew(content: IChatThinkingPart, context: IChatContentPartRenderContext) {
		this.textContainer = $('.chat-thinking-item.markdown-content');
		this.wrapper.appendChild(this.textContainer);
		this.updateThinking(content);
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {

		if (other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized') {
			return true;
		}

		if (other.kind !== 'thinking') {
			return false;
		}


		// ID-first comparison: different IDs => different content; same IDs => compare body
		const otherId: string | undefined = (other as any).id;
		if (this.id !== undefined || otherId !== undefined) {
			// If either side has an ID, require them to match to be considered the same
			if (this.id !== otherId) {
				return true;
			}
			return false;

		}

		// If no IDs on either side, fall back to content comparison
		const next = this.parseContent(Array.isArray(other.value) ? other.value.join('') : (other.value || ''));
		return next === this.currentThinkingValue;
	}

	private static stripLeadingTitle(content: string): string {
		// Remove the first bold header followed by a blank line if present
		return content.replace(/^\*\*[^*]+\*\*\s*\n\n/, '').trim();
	}

	override dispose(): void {
		if (this.markdownResult) {
			this.markdownResult.dispose();
			this.markdownResult = undefined;
		}
		super.dispose();
	}
}
