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
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { MarkdownRenderer, IMarkdownRenderResult } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { localize } from '../../../../../nls.js';

function extractTextFromPart(content: IChatThinkingPart): string {
	const raw = Array.isArray(content.value) ? content.value.join('') : (content.value || '');
	return raw.replace(/<\|im_sep\|>\*{4,}/g, '').trim();
}

function extractTitleFromThinkingContent(content: string): string | undefined {
	const headerMatch = content.match(/^\*\*([^*]+)\*\*\s*\n\n/);
	return headerMatch ? headerMatch[1].trim() : undefined;
}

export class ChatThinkingContentPart extends ChatCollapsibleContentPart implements IChatContentPart {
	public readonly codeblocks: undefined;
	public readonly codeblocksPartId: undefined;

	private id: string | undefined;
	private currentThinkingValue: string;
	private currentTitle: string;
	private defaultTitle = localize('chat.thinking.header', 'Thinking...');
	private readonly renderer: MarkdownRenderer;
	private textContainer!: HTMLElement;
	private currentHeaderElement: HTMLElement | undefined;
	private markdownResult: IMarkdownRenderResult | undefined;
	private wrapper!: HTMLElement;
	private perItemCollapsedMode: boolean = false;

	constructor(
		content: IChatThinkingPart,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		const initialText = extractTextFromPart(content);
		const extractedTitle = extractTitleFromThinkingContent(initialText)
			?? localize('chat.thinking.header', 'Thinking...');

		super(extractedTitle, context);

		this.renderer = instantiationService.createInstance(MarkdownRenderer, {});
		this.id = content.id;

		const mode = this.configurationService.getValue<string>('chat.agent.thinkingStyle') ?? 'none';
		this.perItemCollapsedMode = mode === 'collapsedPerItem';

		this.currentTitle = extractedTitle;
		this.currentThinkingValue = this.parseContent(initialText);
		if (mode === 'expanded' || mode === 'collapsedPreview') {
			this.setExpanded(true);
		} else if (mode === 'collapsed') {
			this.setExpanded(false);
		}

		if (this.perItemCollapsedMode) {
			this.setExpanded(true);
			const header = this.domNode.querySelector('.chat-used-context-label');
			if (header) {
				header.remove();
				this.domNode.classList.add('chat-thinking-no-outer-header');
				this._onDidChangeHeight.fire();
			}
		}

		const node = this.domNode;
		node.classList.add('chat-thinking-box');
		node.tabIndex = 0;

	}

	private parseContent(content: string): string {
		let cleaned = content.replace(/<\|im_sep\|>\*{4,}/g, '').trim();
		if (this.perItemCollapsedMode) {
			cleaned = cleaned.replace(/^\*\*[^*]+\*\*\s*\n+(?:\s*\n)*/, '').trim();
		}
		return cleaned;
	}

	protected override initContent(): HTMLElement {
		this.wrapper = $('.chat-used-context-list.chat-thinking-collapsible');
		this.wrapper.classList.toggle('chat-thinking-per-item-mode', this.perItemCollapsedMode);
		if (this.perItemCollapsedMode) {
			this.createThinkingItemContainer();
		} else {
			this.textContainer = $('.chat-thinking-item.markdown-content');
			this.wrapper.appendChild(this.textContainer);
		}
		if (this.currentThinkingValue) {
			this.renderMarkdown(this.currentThinkingValue);
		}
		return this.wrapper;
	}

	private createThinkingItemContainer(): void {
		const itemWrapper = $('.chat-thinking-item-wrapper');

		const header = $('.chat-thinking-item-header');

		const labelSpan = document.createElement('span');
		labelSpan.classList.add('chat-thinking-item-header-label');
		labelSpan.textContent = this.currentTitle ?? this.defaultTitle;
		header.appendChild(labelSpan);

		const icon = $('.codicon.codicon-chevron-right.chat-thinking-item-caret', { 'aria-hidden': 'true' });
		header.appendChild(icon);

		header.tabIndex = 0;

		const body = $('.chat-thinking-item.markdown-content');

		const toggle = () => {
			const collapsed = body.classList.toggle('hidden');
			itemWrapper.classList.toggle('collapsed', collapsed);
			icon.classList.toggle('codicon-chevron-right', collapsed);
			icon.classList.toggle('codicon-chevron-down', !collapsed);
			this._onDidChangeHeight.fire();
		};

		header.addEventListener('click', toggle);
		header.addEventListener('keydown', e => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggle();
			}
		});

		itemWrapper.appendChild(header);
		itemWrapper.appendChild(body);
		this.wrapper.appendChild(itemWrapper);

		body.classList.toggle('hidden', this.perItemCollapsedMode);
		itemWrapper.classList.toggle('collapsed', this.perItemCollapsedMode);
		icon.classList.toggle('codicon-chevron-right', this.perItemCollapsedMode);
		icon.classList.toggle('codicon-chevron-down', !this.perItemCollapsedMode);

		this.textContainer = body;
		this.currentHeaderElement = header;
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

	public collapseContent(): void {
		this.setExpanded(false);
	}

	public updateThinking(content: IChatThinkingPart): void {
		const raw = extractTextFromPart(content);
		const next = this.parseContent(raw);
		if (next === this.currentThinkingValue) {
			return;
		}
		this.currentThinkingValue = next;
		this.renderMarkdown(next);

		// if title is present now (e.g., arrived mid-stream), update the header label
		const maybeTitle = extractTitleFromThinkingContent(raw);
		if (maybeTitle && maybeTitle !== this.currentTitle) {
			this.setTitle(maybeTitle);
			this.currentTitle = maybeTitle;
		}
	}

	public finalizeTitleIfDefault(): void {
		if (this.currentTitle === this.defaultTitle) {
			const done = localize('chat.pinned.thinking.header.done', 'Thought for a few seconds...');
			this.setTitle(done);
			this.currentTitle = done;
		}
	}

	public appendItem(content: HTMLElement): void {
		this.wrapper.appendChild(content);
	}

	// makes a new text container. when we update, we now update this container.
	public setupThinkingContainer(content: IChatThinkingPart, context: IChatContentPartRenderContext) {
		if (this.perItemCollapsedMode) {
			this.createThinkingItemContainer();
		} else {
			this.textContainer = $('.chat-thinking-item.markdown-content');
			this.wrapper.appendChild(this.textContainer);
		}
		this.id = content?.id;
		this.updateThinking(content);
	}

	protected override setTitle(title: string): void {
		if (!this.perItemCollapsedMode) {
			super.setTitle(title);
		}
		if (this.currentHeaderElement) {
			const labelSpan = this.currentHeaderElement.querySelector('.chat-thinking-item-header-label');
			if (labelSpan) {
				labelSpan.textContent = title;
			} else {
				this.currentHeaderElement.textContent = title;
			}
		}
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {

		// only need this check if we are adding tools into thinking dropdown.
		// if (other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized') {
		// 	return true;
		// }

		if (other.kind !== 'thinking') {
			return false;
		}

		const otherId = other?.id;
		const thisId = this.id;

		// one off case where we have no ids, we compare text instead.
		if (otherId === undefined && thisId === undefined) {
			const rawValue = other.value;
			const otherValueStr = typeof rawValue === 'string' ? rawValue : Array.isArray(rawValue) ? rawValue.join('') : '';
			const otherValueNormalized = otherValueStr.trim();
			return this.parseContent(otherValueNormalized) === this.currentThinkingValue;
		}

		return otherId !== thisId;
	}

	override dispose(): void {
		if (this.markdownResult) {
			this.markdownResult.dispose();
			this.markdownResult = undefined;
		}
		super.dispose();
	}
}
