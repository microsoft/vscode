/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, clearNode } from '../../../../../base/browser/dom.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatThinkingPart, IChatToolInvocation, IChatToolInvocationSerialized } from '../../common/chatService.js';
import { IChatContentPartRenderContext, IChatContentPart } from './chatContentParts.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { ThinkingDisplayMode, ChatAgentLocation } from '../../common/constants.js';
import { ChatTreeItem } from '../chat.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IRenderedMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { IMarkdownRenderer } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { localize } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { autorun } from '../../../../../base/common/observable.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';
import { IChatAgentService } from '../../common/chatAgents.js';
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
	private extractedTitles: string[] = [];
	private toolInvocationCount: number = 0;
	private streamingCompleted: boolean = false;
	private isActive: boolean = true;

	constructor(
		content: IChatThinkingPart,
		context: IChatContentPartRenderContext,
		private readonly chatContentMarkdownRenderer: IMarkdownRenderer,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatMarkdownAnchorService private readonly chatMarkdownAnchorService: IChatMarkdownAnchorService,
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

		if (this._collapseButton && !this.streamingCompleted) {
			this._collapseButton.icon = ThemeIcon.modify(Codicon.loading, 'spin');
		}

		const label = this.lastExtractedTitle ?? '';
		if (!this.fixedScrollingMode && !this._isExpanded.get()) {
			this.setTitle(label);
		}

		if (this._collapseButton) {
			this._register(this._collapseButton.onDidClick(() => {
				if (this.streamingCompleted || this.fixedScrollingMode) {
					return;
				}

				const expanded = this.isExpanded();
				if (expanded) {
					this.setTitle(this.defaultTitle, true);
					this.currentTitle = this.defaultTitle;
				} else if (this.lastExtractedTitle) {
					const collapsedLabel = this.lastExtractedTitle ?? '';
					this.setTitle(collapsedLabel);
					this.currentTitle = collapsedLabel;
				}
			}));
		}
	}

	// @TODO: @justschen Convert to template for each setting?
	protected override initContent(): HTMLElement {
		this.wrapper = $('.chat-used-context-list.chat-thinking-collapsible');
		// if (this.fixedScrollingMode) {
		this.wrapper.classList.add('chat-thinking-streaming');
		// }
		if (this.currentThinkingValue) {
			this.textContainer = $('.chat-thinking-item.markdown-content');
			this.wrapper.appendChild(this.textContainer);
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

		const rendered = this._register(this.chatContentMarkdownRenderer.render(new MarkdownString(contentToRender), undefined, target));
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

		// only set title to last extracted thinking part if not clickable (meaning title matches content) and streaming is completed.
		// don't need LLM title generation if title matches content since it's the only thing.
		if (!clickable && this.streamingCompleted) {
			super.setTitle(this.lastExtractedTitle ?? this.currentTitle);
		}
	}

	private updateDropdownClickability(): void {
		if (!this.wrapper) {
			return;
		}

		if (this.wrapper.children.length > 1 || this.toolInvocationCount > 0) {
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
		if (extractedTitle && extractedTitle !== this.currentTitle && !this.extractedTitles.includes(extractedTitle)) {
			this.extractedTitles.push(extractedTitle);
			this.lastExtractedTitle = extractedTitle;
		} else if (extractedTitle && extractedTitle !== this.currentTitle) {
			this.lastExtractedTitle = extractedTitle;
		}

		if (!extractedTitle || extractedTitle === this.currentTitle) {
			return;
		}

		const label = this.lastExtractedTitle ?? '';
		if (!this.fixedScrollingMode && !this._isExpanded.get()) {
			this.setTitle(label);
		}

		this.updateDropdownClickability();
	}

	public getIsActive(): boolean {
		return this.isActive;
	}

	public markAsInactive(): void {
		this.isActive = false;
	}

	public finalizeTitleIfDefault(agentService?: IChatAgentService, agentId?: string, sessionResource?: URI): void {
		// let finalLabel: string;
		// if (this.toolInvocationCount > 0) {
		// 	finalLabel = localize('chat.thinking.finished.withTools', 'Finished thinking and invoked {0} tool{1}', this.toolInvocationCount, this.toolInvocationCount === 1 ? '' : 's');
		// } else {
		// 	finalLabel = localize('chat.thinking.finished', 'Finished Thinking');
		// }

		// this.currentTitle = finalLabel;
		this.wrapper.classList.remove('chat-thinking-streaming');
		this.streamingCompleted = true;

		if (this._collapseButton) {
			this._collapseButton.icon = Codicon.check;
			// this._collapseButton.label = finalLabel;
		}

		this.updateDropdownClickability();

		// Generate a better title via LLM in the background without blocking
		if (this.extractedTitles.length > 0 && agentService && agentId && sessionResource) {
			this.generateTitleViaLLM(agentService, agentId, sessionResource);
		}
	}

	private async generateTitleViaLLM(agentService: IChatAgentService, agentId: string, sessionResource: URI): Promise<void> {
		try {
			const titlesContext = this.extractedTitles.join(', ');
			const message = `Generate a concise header for thinking that contains the following thoughts: ${titlesContext}`;
			const generatedTitle = await agentService.getChatTitle(agentId, [{
				request: {
					sessionId: sessionResource.toString(), // Use toString as fallback
					sessionResource: sessionResource,
					requestId: this.id || '',
					agentId: agentId,
					message: message,
					command: undefined,
					variables: { variables: [] },
					location: ChatAgentLocation.Chat,
					editedFileEvents: [],
				},
				response: [],
				result: {}
			}], CancellationToken.None);

			if (generatedTitle && !this._store.isDisposed) {
				// Update the title with the generated one
				this.currentTitle = generatedTitle;
				if (this._collapseButton) {
					this._collapseButton.label = generatedTitle;
				}
			} else {
				// If title generation fails, the default title is already set
				let finalLabel: string;
				if (this.toolInvocationCount > 0) {
					finalLabel = localize('chat.thinking.finished.withTools', 'Finished thinking and invoked {0} tool{1}', this.toolInvocationCount, this.toolInvocationCount === 1 ? '' : 's');
				} else {
					finalLabel = localize('chat.thinking.finished', 'Finished Thinking');
				}

				this.currentTitle = finalLabel;
				this.wrapper.classList.remove('chat-thinking-streaming');
				this.streamingCompleted = true;

				if (this._collapseButton) {
					this._collapseButton.icon = Codicon.check;
					this._collapseButton.label = finalLabel;
				}

				this.updateDropdownClickability();
			}
		} catch (error) {
			// If title generation fails, the default title is already set
			let finalLabel: string;
			if (this.toolInvocationCount > 0) {
				finalLabel = localize('chat.thinking.finished.withTools', 'Finished thinking and invoked {0} tool{1}', this.toolInvocationCount, this.toolInvocationCount === 1 ? '' : 's');
			} else {
				finalLabel = localize('chat.thinking.finished', 'Finished Thinking');
			}

			this.currentTitle = finalLabel;
			this.wrapper.classList.remove('chat-thinking-streaming');
			this.streamingCompleted = true;

			if (this._collapseButton) {
				this._collapseButton.icon = Codicon.check;
				this._collapseButton.label = finalLabel;
			}

			this.updateDropdownClickability();
		}
	}

	public appendItem(content: HTMLElement, toolInvocationId?: string, toolInvocation?: IChatToolInvocation | IChatToolInvocationSerialized): void {
		this.wrapper.appendChild(content);
		if (toolInvocationId) {
			this.toolInvocationCount++;
			let toolCallLabel: string;

			if (toolInvocation?.invocationMessage) {
				const message = typeof toolInvocation.invocationMessage === 'string' ? toolInvocation.invocationMessage : toolInvocation.invocationMessage.value;
				toolCallLabel = localize('chat.thinking.called.tool.withMessage', '{0}', message);
			} else {
				toolCallLabel = localize('chat.thinking.called.tool', 'Invoked `{0}`', toolInvocationId);
			}

			// Add tool call to extracted titles for LLM title generation
			if (!this.extractedTitles.includes(toolCallLabel)) {
				this.extractedTitles.push(toolCallLabel);
			}

			if (!this.fixedScrollingMode && !this._isExpanded.get()) {
				this.setTitle(toolCallLabel);
			}
		}
		if (this.fixedScrollingMode && this.wrapper) {
			this.wrapper.scrollTop = this.wrapper.scrollHeight;
		}
		this.updateDropdownClickability();
	}

	// makes a new text container. when we update, we now update this container.
	public setupThinkingContainer(content: IChatThinkingPart, context: IChatContentPartRenderContext) {
		// Avoid creating new containers after disposal
		if (this._store.isDisposed) {
			return;
		}
		this.textContainer = $('.chat-thinking-item.markdown-content');
		if (content.value) {
			this.wrapper.appendChild(this.textContainer);
			this.id = content.id;
			this.updateThinking(content);
		}
		this.updateDropdownClickability();
	}

	protected override setTitle(title: string, omitPrefix?: boolean): void {
		if (!title) {
			return;
		}

		if (omitPrefix) {
			this.setTitleWithWidgets(new MarkdownString(title), this.instantiationService, this.chatMarkdownAnchorService, this.chatContentMarkdownRenderer);
			this.currentTitle = title;
			return;
		}
		const thinkingLabel = localize('chat.thinking.fixed.progress.withHeader', 'Thinking: {0}', title);
		this.lastExtractedTitle = title;
		this.currentTitle = thinkingLabel;
		this.setTitleWithWidgets(new MarkdownString(thinkingLabel), this.instantiationService, this.chatMarkdownAnchorService, this.chatContentMarkdownRenderer);
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
