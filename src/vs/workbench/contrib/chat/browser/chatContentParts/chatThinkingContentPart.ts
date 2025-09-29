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
import { ButtonWithIcon } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';

function stripImSepMarkers(text: string): string {
	return text.replace(/<\|im_sep\|>(\*{4,})?/g, '');
}

function extractTextFromPart(content: IChatThinkingPart): string {
	const raw = Array.isArray(content.value) ? content.value.join('') : (content.value || '');
	return stripImSepMarkers(raw).trim();
}

function extractTitleFromThinkingContent(content: string): string | undefined {
	const headerMatch = content.match(/^\*\*([^*]+)\*\*\s*/);
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
	private markdownResult: IMarkdownRenderResult | undefined;
	private wrapper!: HTMLElement;
	private perItemCollapsedMode: boolean = false;
	private fixedScrollingMode: boolean = false;
	private fixedCollapsed: boolean = true;
	private fixedScrollViewport: HTMLElement | undefined;
	private fixedContainer: HTMLElement | undefined;
	private headerButton: ButtonWithIcon | undefined;
	private caret: HTMLElement | undefined;
	private lastExtractedTitle: string | undefined;
	private hasMultipleItems: boolean = false;

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
		this.fixedScrollingMode = mode === 'fixedScrolling';

		this.currentTitle = extractedTitle;
		if (extractedTitle !== this.defaultTitle) {
			this.lastExtractedTitle = extractedTitle;
		}
		this.currentThinkingValue = this.parseContent(initialText);
		if (mode === 'expanded' || mode === 'collapsedPreview' || mode === 'fixedScrolling') {
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
		} else if (this.fixedScrollingMode) {
			const header = this.domNode.querySelector('.chat-used-context-label');
			if (header) {
				header.remove();
				this.domNode.classList.add('chat-thinking-no-outer-header', 'chat-thinking-fixed-mode');
				this._onDidChangeHeight.fire();
			}
			this.currentTitle = this.defaultTitle;
		}

		const node = this.domNode;
		node.classList.add('chat-thinking-box');
		node.tabIndex = 0;
	}

	private parseContent(content: string): string {
		let cleaned = stripImSepMarkers(content).trim();
		if (this.perItemCollapsedMode) {
			cleaned = cleaned.replace(/^\*\*[^*]+\*\*\s*\n+(?:\s*\n)*/, '').trim();
		}
		return cleaned;
	}

	// @TODO: @justschen Convert to template for each setting?
	protected override initContent(): HTMLElement {
		this.wrapper = $('.chat-used-context-list.chat-thinking-collapsible');
		this.wrapper.classList.toggle('chat-thinking-per-item-mode', this.perItemCollapsedMode);
		if (this.perItemCollapsedMode) {
			this.createThinkingItemContainer();
			if (this.currentThinkingValue) {
				this.renderMarkdown(this.currentThinkingValue);
			}
			return this.wrapper;
		} else if (this.fixedScrollingMode) {
			this.fixedContainer = $('.chat-thinking-fixed-height-controller');
			const header = $('.chat-thinking-fixed-header');

			const button = this.headerButton = this._register(new ButtonWithIcon(header, {}));
			button.label = this.defaultTitle;
			button.icon = ThemeIcon.modify(Codicon.loading, 'spin');
			this.caret = $('.codicon.codicon-chevron-right.chat-thinking-fixed-caret');
			button.element.appendChild(this.caret);

			this.fixedScrollViewport = this.wrapper;
			this.textContainer = $('.chat-thinking-item.markdown-content');
			this.wrapper.appendChild(this.textContainer);

			this.fixedContainer.appendChild(header);
			this.fixedContainer.appendChild(this.wrapper);

			this._register(button.onDidClick(() => this.setFixedCollapsedState(!this.fixedCollapsed, true)));

			if (this.currentThinkingValue) {
				this.renderMarkdown(this.currentThinkingValue);
			}
			this.setFixedCollapsedState(this.fixedCollapsed);
			return this.fixedContainer;
		} else {
			this.textContainer = $('.chat-thinking-item.markdown-content');
			this.wrapper.appendChild(this.textContainer);
			if (this.currentThinkingValue) {
				this.renderMarkdown(this.currentThinkingValue);
			}
			return this.wrapper;
		}
	}

	// handles chevrons outside of icons because the icon is already filled
	private setFixedCollapsedState(collapsed: boolean, userInitiated?: boolean): void {
		if (!this.fixedScrollingMode || !this.fixedContainer) {
			return;
		}
		this.fixedCollapsed = collapsed;
		this.fixedContainer.classList.toggle('collapsed', collapsed);
		if (this.caret) {
			this.caret.classList.toggle('codicon-chevron-right', collapsed);
			this.caret.classList.toggle('codicon-chevron-down', !collapsed);
		}
		if (this.fixedCollapsed && userInitiated) {
			const fixedScrollViewport = this.fixedScrollViewport ?? this.wrapper;
			if (fixedScrollViewport) {
				fixedScrollViewport.scrollTop = fixedScrollViewport.scrollHeight;
			}
		}
		this._onDidChangeHeight.fire();
	}

	private createThinkingItemContainer(): void {
		const itemWrapper = $('.chat-thinking-item-wrapper');
		const header = $('.chat-thinking-item-header');
		const button = this.headerButton = this._register(new ButtonWithIcon(header, {}));
		button.label = this.currentTitle ?? this.defaultTitle;
		button.icon = Codicon.chevronRight;

		const body = $('.chat-thinking-item.markdown-content');

		const setPerItemCollapsedState = (collapsed: boolean) => {
			body.classList.toggle('hidden', collapsed);
			itemWrapper.classList.toggle('collapsed', collapsed);
			if (this.headerButton) {
				this.headerButton.icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
			}
			this._onDidChangeHeight.fire();
		};

		const toggle = () => setPerItemCollapsedState(!body.classList.contains('hidden'));

		this._register(button.onDidClick(() => toggle()));

		itemWrapper.appendChild(header);
		itemWrapper.appendChild(body);
		this.wrapper.appendChild(itemWrapper);

		setPerItemCollapsedState(this.perItemCollapsedMode);
		this.textContainer = body;
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

		if (this.fixedScrollingMode) {
			const container = this.fixedScrollViewport ?? this.textContainer;
			if (container) {
				container.scrollTop = container.scrollHeight;
			}
		}

		const extractedTitle = extractTitleFromThinkingContent(raw);
		if (!extractedTitle || extractedTitle === this.currentTitle) {
			return;
		}
		this.lastExtractedTitle = extractedTitle;

		if (this.fixedScrollingMode && this.headerButton) {
			const label = localize('chat.thinking.fixed.progress.withHeader', 'Thinking: {0}{1}', this.lastExtractedTitle, (!this.perItemCollapsedMode && this.hasMultipleItems) ? '...' : '');
			this.headerButton.label = label;
		} else if (!this.perItemCollapsedMode) {
			const label = localize('chat.thinking.progress.withHeader', '{0}{1}', this.lastExtractedTitle, (!this.perItemCollapsedMode && this.hasMultipleItems) ? '...' : '');
			this.setTitle(label);
			this.currentTitle = label;
		} else {
			this.setTitle(this.lastExtractedTitle);
			this.currentTitle = this.lastExtractedTitle;
		}
	}

	public finalizeTitleIfDefault(): void {
		if (this.fixedScrollingMode) {
			let finalLabel: string;
			if (this.lastExtractedTitle) {
				finalLabel = localize('chat.thinking.fixed.done.withHeader', '{0}{1}', this.lastExtractedTitle, (!this.perItemCollapsedMode && this.hasMultipleItems) ? '...' : '');
			} else {
				finalLabel = localize('chat.thinking.fixed.done.generic', 'Thought for a few seconds');
			}
			if (this.headerButton) {
				this.headerButton.label = finalLabel;
				this.headerButton.icon = Codicon.passFilled;
			}

			this.currentTitle = finalLabel;

			if (this.fixedContainer) {
				this.fixedContainer.classList.toggle('finished', true);
				this.setFixedCollapsedState(true);
			}
			return;
		}

		if (this.currentTitle === this.defaultTitle) {
			const suffix = localize('chat.thinking.fixed.done.generic', 'Thought for a few seconds');
			this.setTitle(suffix);
			this.currentTitle = suffix;
		}

		if (this.fixedScrollingMode) {
			if (this.fixedContainer) {
				this.fixedContainer.classList.add('finished');
				this.setFixedCollapsedState(true);
				if (this.headerButton) {
					this.headerButton.icon = Codicon.passFilled;
				}
			}
		}
	}

	public appendItem(content: HTMLElement): void {
		this.wrapper.appendChild(content);
	}

	// makes a new text container. when we update, we now update this container.
	public setupThinkingContainer(content: IChatThinkingPart, context: IChatContentPartRenderContext) {
		this.hasMultipleItems = true;
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
		if (!this.perItemCollapsedMode && !this.fixedScrollingMode) {
			super.setTitle(title);
		}
		if (this.headerButton) {
			this.headerButton.label = title;
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
