/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, clearNode } from '../../../../../base/browser/dom.js';
import { IChatThinkingPart } from '../../common/chatService.js';
import { IChatContentPartRenderContext, IChatContentPart } from './chatContentParts.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { ThinkingDisplayMode } from '../../common/constants.js';
import { ChatTreeItem } from '../chat.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IRenderedMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { localize } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { autorun } from '../../../../../base/common/observable.js';
import './media/chatThinkingContent.css';


function extractTextFromPart(content: IChatThinkingPart): string {
	const raw = Array.isArray(content.value) ? content.value.join('') : (content.value || '');
	return raw.trim();
}

function extractTitleFromThinkingContent(content: string): string | undefined {
	const headerMatch = content.match(/^\*\*([^*]+)\*\*/);
	return headerMatch ? headerMatch[1] : undefined;
}

export class ChatThinkingContentPart extends ChatCollapsibleContentPart implements IChatContentPart {
	public readonly codeblocks: undefined;
	public readonly codeblocksPartId: undefined;

	private id: string | undefined;
	private currentThinkingValue: string;
	private currentTitle: string;
	private defaultTitle = localize('chat.thinking.header', 'Thinking...');
	private textContainer!: HTMLElement;
	private markdownResult: IRenderedMarkdown | undefined;
	private wrapper!: HTMLElement;
	private fixedScrollingMode: boolean = false;
	private lastExtractedTitle: string | undefined;
	private hasMultipleItems: boolean = false;

	constructor(
		content: IChatThinkingPart,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
	) {
		const initialText = extractTextFromPart(content);
		const extractedTitle = extractTitleFromThinkingContent(initialText)
			?? localize('chat.thinking.header', 'Thinking...');

		super(extractedTitle, context);

		this.id = content.id;
		const configuredMode = this.configurationService.getValue<ThinkingDisplayMode>('chat.agent.thinkingStyle') ?? ThinkingDisplayMode.Collapsed;

		this.fixedScrollingMode = configuredMode === ThinkingDisplayMode.FixedScrolling;

		this.currentTitle = extractedTitle;
		if (extractedTitle !== this.defaultTitle) {
			this.lastExtractedTitle = extractedTitle;
		}
		this.currentThinkingValue = initialText;

		if (configuredMode === ThinkingDisplayMode.Collapsed) {
			this.setExpanded(false);
		} else {
			this.setExpanded(true);
		}

		if (this.fixedScrollingMode) {
			this.setExpanded(false);
		}

		const node = this.domNode;
		node.classList.add('chat-thinking-box');
		node.tabIndex = 0;

		if (this.fixedScrollingMode) {
			node.classList.add('chat-thinking-fixed-mode');
			this.currentTitle = this.defaultTitle;
			if (this._collapseButton) {
				this._collapseButton.icon = ThemeIcon.modify(Codicon.loading, 'spin');
			}

			// override for codicon chevron in the collapsible part
			this._register(autorun(r => {
				this.expanded.read(r);
				if (this._collapseButton && this.wrapper) {
					if (this.wrapper.classList.contains('chat-thinking-streaming')) {
						this._collapseButton.icon = ThemeIcon.modify(Codicon.loading, 'spin');
					} else {
						this._collapseButton.icon = Codicon.check;
					}
				}
			}));
		}

		const label = (this.lastExtractedTitle ?? '') + (this.hasMultipleItems ? '...' : '');
		this.setTitle(label);
	}

	// @TODO: @justschen Convert to template for each setting?
	protected override initContent(): HTMLElement {
		this.wrapper = $('.chat-used-context-list.chat-thinking-collapsible');
		if (this.fixedScrollingMode) {
			this.wrapper.classList.add('chat-thinking-streaming');
		}
		this.textContainer = $('.chat-thinking-item.markdown-content');
		this.wrapper.appendChild(this.textContainer);
		if (this.currentThinkingValue) {
			this.renderMarkdown(this.currentThinkingValue);
		}
		this.updateDropdownClickability();
		return this.wrapper;
	}

	private renderMarkdown(content: string, reuseExisting?: boolean): void {
		// Guard against rendering after disposal to avoid leaking disposables
		if (this._store.isDisposed) {
			return;
		}
		const cleanedContent = content.trim();
		if (!cleanedContent) {
			if (this.markdownResult) {
				this.markdownResult.dispose();
				this.markdownResult = undefined;
			}
			clearNode(this.textContainer);
			return;
		}

		// If the entire content is bolded, strip the bold markers for rendering
		let contentToRender = cleanedContent;
		if (cleanedContent.startsWith('**') && cleanedContent.endsWith('**')) {
			contentToRender = cleanedContent.slice(2, -2);
		}

		const target = reuseExisting ? this.markdownResult?.element : undefined;
		if (this.markdownResult) {
			this.markdownResult.dispose();
			this.markdownResult = undefined;
		}

		const rendered = this._register(this.markdownRendererService.render(new MarkdownString(contentToRender), undefined, target));
		this.markdownResult = rendered;
		if (!target) {
			clearNode(this.textContainer);
			this.textContainer.appendChild(rendered.element);
		}
	}

	private setDropdownClickable(clickable: boolean): void {
		if (this._collapseButton) {
			this._collapseButton.element.style.pointerEvents = clickable ? 'auto' : 'none';
		}
	}

	private updateDropdownClickability(): void {
		if (this.wrapper && this.wrapper.children.length > 1) {
			this.setDropdownClickable(true);
			return;
		}

		const contentWithoutTitle = this.currentThinkingValue.trim();
		const titleToCompare = this.lastExtractedTitle ?? this.currentTitle;

		const stripMarkdown = (text: string) => {
			return text
				.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1').trim();
		};

		const strippedContent = stripMarkdown(contentWithoutTitle);
		const shouldDisable = !strippedContent || strippedContent === titleToCompare;
		this.setDropdownClickable(!shouldDisable);
	}

	public resetId(): void {
		this.id = undefined;
	}

	public collapseContent(): void {
		this.setExpanded(false);
	}

	public updateThinking(content: IChatThinkingPart): void {
		// If disposed, ignore late updates coming from renderer diffing
		if (this._store.isDisposed) {
			return;
		}
		const raw = extractTextFromPart(content);
		const next = raw;
		if (next === this.currentThinkingValue) {
			return;
		}
		const previousValue = this.currentThinkingValue;
		const reuseExisting = !!(this.markdownResult && next.startsWith(previousValue) && next.length > previousValue.length);
		this.currentThinkingValue = next;
		this.renderMarkdown(next, reuseExisting);

		if (this.fixedScrollingMode && this.wrapper) {
			this.wrapper.scrollTop = this.wrapper.scrollHeight;
		}

		const extractedTitle = extractTitleFromThinkingContent(raw);
		if (!extractedTitle || extractedTitle === this.currentTitle) {
			return;
		}
		this.lastExtractedTitle = extractedTitle;

		const label = (this.lastExtractedTitle ?? '') + (this.hasMultipleItems ? '...' : '');
		this.setTitle(label);
		this.currentTitle = label;

		this.updateDropdownClickability();
	}

	public finalizeTitleIfDefault(): void {
		if (this.fixedScrollingMode) {
			let finalLabel: string;
			if (this.lastExtractedTitle) {
				finalLabel = localize('chat.thinking.fixed.done.withHeader', '{0}{1}', this.lastExtractedTitle, this.hasMultipleItems ? '...' : '');
			} else {
				finalLabel = localize('chat.thinking.fixed.done.generic', 'Thought for a few seconds');
			}

			this.currentTitle = finalLabel;
			this.wrapper.classList.remove('chat-thinking-streaming');

			if (this._collapseButton) {
				this._collapseButton.icon = Codicon.check;
				this._collapseButton.label = finalLabel;
			}
		} else {
			if (this.currentTitle === this.defaultTitle) {
				const suffix = localize('chat.thinking.fixed.done.generic', 'Thought for a few seconds');
				this.setTitle(suffix);
				this.currentTitle = suffix;
			}
		}
		this.updateDropdownClickability();
	}

	public appendItem(content: HTMLElement): void {
		this.wrapper.appendChild(content);
		if (this.fixedScrollingMode && this.wrapper) {
			this.wrapper.scrollTop = this.wrapper.scrollHeight;
		}
		const dropdownClickable = this.wrapper.children.length > 1;
		this.setDropdownClickable(dropdownClickable);
	}

	// makes a new text container. when we update, we now update this container.
	public setupThinkingContainer(content: IChatThinkingPart, context: IChatContentPartRenderContext) {
		// Avoid creating new containers after disposal
		if (this._store.isDisposed) {
			return;
		}
		this.hasMultipleItems = true;
		this.textContainer = $('.chat-thinking-item.markdown-content');
		this.wrapper.appendChild(this.textContainer);
		this.id = content?.id;
		this.updateThinking(content);
		this.updateDropdownClickability();
	}

	protected override setTitle(title: string): void {
		if (this.fixedScrollingMode && this._collapseButton && this.wrapper.classList.contains('chat-thinking-streaming')) {
			const thinkingLabel = localize('chat.thinking.fixed.progress.withHeader', 'Thinking: {0}', title);
			this._collapseButton.label = thinkingLabel;
		} else {
			super.setTitle(title);
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
