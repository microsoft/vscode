/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { IChatThinkingPart } from '../../common/chatService.js';
import { IChatContentPartRenderContext, IChatContentPart } from './chatContentParts.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';

export class ChatThinkingContentPart extends Disposable implements IChatContentPart {

	readonly domNode: HTMLElement;
	public readonly codeblocks: undefined;
	public readonly codeblocksPartId: undefined;

	// Track the accumulated content
	private currentThinkingValue: string;
	private currentMetadata?: string;
	private readonly thinkingChunks: Map<string, string> = new Map();
	private isCollapsed = false;

	private readonly _onDidChangeHeight = new Emitter<void>();
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private readonly textContainer: HTMLElement;
	private readonly thinkingContainer: HTMLElement;
	private readonly thinkingContentWrapper: HTMLElement;
	private readonly collapseButton: HTMLElement;
	private readonly headerContainer: HTMLElement;
	private metadataContainer?: HTMLElement;
	private readonly renderer: MarkdownRenderer;

	// Track markdown rendering results for disposal
	private markdownResult: IDisposable | undefined;
	private metadataMarkdownResult: IDisposable | undefined;

	// Animation handling
	private animationRequestId?: number;
	private animationFrame = 0;
	private readonly MAX_ANIMATION_FRAMES = 3;
	private readonly ANIMATION_FRAME_INTERVAL = 400; // ms

	addDisposable<T extends IDisposable>(disposable: T): T {
		return this._register(disposable);
	}

	constructor(
		content: IChatThinkingPart,
		_context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		// Create markdown renderer
		this.renderer = instantiationService.createInstance(MarkdownRenderer, {});

		this.currentThinkingValue = content.value || '';
		this.currentMetadata = content.metadata;

		// Store the initial chunk
		if (content.id) {
			this.thinkingChunks.set(content.id, content.value || '');
		}

		// Create the main wrapper element
		this.domNode = dom.$('div.chat-thinking-wrapper');
		this.domNode.setAttribute('role', 'region');
		this.domNode.setAttribute('aria-label', 'Thinking process');

		// Create the thinking content container with styling
		this.thinkingContentWrapper = dom.$('div.thinking-content');
		dom.append(this.domNode, this.thinkingContentWrapper);

		// Create a header container for the thinking part
		this.headerContainer = dom.$('div.thinking-header-container');
		dom.append(this.thinkingContentWrapper, this.headerContainer);

		// Add the thinking header with icon
		const thinkingHeader = dom.$('div.thinking-header');
		dom.append(this.headerContainer, thinkingHeader);

		const thinkingLabel = dom.$('span.thinking-label');
		thinkingLabel.textContent = 'Thinking';
		dom.append(thinkingHeader, thinkingLabel);

		// Add animated dots
		const animatedDots = dom.$('span.thinking-dots');
		dom.append(thinkingLabel, animatedDots);
		this.startDotsAnimation();

		const iconContainer = dom.$('div.thinking-icon');
		dom.append(thinkingHeader, iconContainer);
		dom.append(iconContainer, dom.$('span.codicon.codicon-lightbulb'));

		// Add collapse/expand button
		this.collapseButton = dom.$('div.thinking-collapse-button');
		dom.append(this.headerContainer, this.collapseButton);
		dom.append(this.collapseButton, dom.$('span.codicon.codicon-chevron-up'));

		// Make the header clickable to toggle collapse state
		this.headerContainer.classList.add('collapsible');
		this._register(dom.addDisposableListener(this.headerContainer, dom.EventType.CLICK, () => this.toggleCollapsed()));
		this._register(dom.addDisposableListener(this.headerContainer, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				this.toggleCollapsed();
				event.preventDefault();
				event.stopPropagation();
			}
		}));
		this.headerContainer.tabIndex = 0;
		this.headerContainer.setAttribute('aria-label', 'Toggle thinking content visibility');

		// Create the content container
		this.thinkingContainer = dom.$('div.thinking-container');
		dom.append(this.thinkingContentWrapper, this.thinkingContainer);

		// thinking content
		this.textContainer = dom.$('div.thinking-text.markdown-content');
		dom.append(this.thinkingContainer, this.textContainer);

		// Set initial content if any
		if (this.currentThinkingValue) {
			this.renderMarkdown(this.currentThinkingValue);
		}

		// Add metadata container if needed
		if (this.currentMetadata) {
			this.metadataContainer = dom.$('div.thinking-metadata');
			dom.append(this.thinkingContainer, this.metadataContainer);

			// Render metadata as markdown too
			const metadataMarkdown = this.renderer.render(new MarkdownString(this.currentMetadata));
			this.metadataMarkdownResult = metadataMarkdown;
			this.metadataContainer.appendChild(metadataMarkdown.element);
		}

		// Register cleanup for animation
		this._register({
			dispose: () => {
				if (this.animationRequestId) {
					clearTimeout(this.animationRequestId);
					this.animationRequestId = undefined;
				}
			}
		});
	}

	private startDotsAnimation(): void {
		const updateDots = () => {
			const dots = this.domNode.querySelector('.thinking-dots');
			if (dots) {
				this.animationFrame = (this.animationFrame + 1) % this.MAX_ANIMATION_FRAMES;
				const dotsText = '.'.repeat(this.animationFrame + 1);
				dots.textContent = dotsText;
			}

			this.animationRequestId = setTimeout(() => {
				if (this.domNode && this.domNode.isConnected) {
					const window = dom.getWindow(this.domNode);
					window.requestAnimationFrame(updateDots);
				}
			}, this.ANIMATION_FRAME_INTERVAL) as any;
		};

		const window = dom.getWindow(this.domNode);
		window.requestAnimationFrame(updateDots);
	}

	hasSameContent(other: any): boolean {
		// Check if this is a thinking part
		if (other.kind !== 'thinking') {
			return false;
		}

		// For thinking parts, we consider them the same part if we already
		// have a thinking content part, since we want to accumulate them
		return true;
	}

	update(newContent: IChatThinkingPart): void {
		let contentChanged = false;

		// Handle both individual thinking chunks and combined thinking content
		if (newContent.id && newContent.id.startsWith('combined-thinking-')) {
			// This is a combined thinking part, potentially replace our content
			if (newContent.value && newContent.value !== this.currentThinkingValue) {
				// Format the combined content to ensure proper line breaks between sections
				const formattedValue = newContent.value
					.split(/(<\|im_sep\|>|<\|lim_sep\|>)/g)  // Split on markers
					.filter(part => part && !part.match(/(<\|im_sep\|>|<\|lim_sep\|>)/)) // Remove the markers
					.map(part => part.trim())  // Clean up each part
					.join('\n\n');  // Join with double newlines

				// Direct replacement of content with markdown rendering
				this.currentThinkingValue = formattedValue;
				this.renderMarkdown(formattedValue);
				contentChanged = true;
			}
		}
		// Add this chunk to our collection, avoid duplicates
		else if (newContent.id && !this.thinkingChunks.has(newContent.id)) {
			this.thinkingChunks.set(newContent.id, newContent.value || '');

			// Combine all chunks with newlines between them
			const combinedValue = Array.from(this.thinkingChunks.values())
				.map(chunk => chunk.trim())  // Remove any trailing whitespace
				.join('\n\n');               // Add two newlines between chunks for clear separation

			// Ensure we store the current value for future comparisons
			if (combinedValue.length > 0 && combinedValue !== this.currentThinkingValue) {
				const existingContent = this.currentThinkingValue || '';

				// Only append the new text that isn't already in the current value
				if (combinedValue.length > existingContent.length) {
					const newText = newContent.value || '';
					// Always ensure we have newlines between content
					const formattedNewText = existingContent ? `\n\n${newText.trim()}` : newText;
					this.currentThinkingValue = combinedValue;
					this.appendText(formattedNewText);
					contentChanged = true;
				} else {
					// If for some reason the new content is shorter or completely different, just replace
					this.currentThinkingValue = combinedValue;
					this.renderMarkdown(combinedValue);
					contentChanged = true;
				}
			}
		} else if (newContent.value && newContent.value !== this.currentThinkingValue) {
			// Check if this content is already a substring of what we have
			const existingContent = this.currentThinkingValue || '';

			if (existingContent.includes(newContent.value)) {
				// Already included, nothing to do
				return;
			} else if (newContent.value.length > existingContent.length && newContent.value.includes(existingContent)) {
				// New content contains all existing content and more
				this.currentThinkingValue = newContent.value;
				this.renderMarkdown(newContent.value);
				contentChanged = true;
			} else if (newContent.value.length > existingContent.length && newContent.value.startsWith(existingContent)) {
				// Only append the new part
				const newTextToAppend = newContent.value.substring(existingContent.length);
				// Always ensure we have double newlines for clear visual separation
				const formattedNewText = newTextToAppend.startsWith('\n') ? newTextToAppend : `\n\n${newTextToAppend.trim()}`;
				this.currentThinkingValue = newContent.value;
				this.appendText(formattedNewText);
				contentChanged = true;
			} else {
				// Completely different content - might be from a different stream
				// Always add double newlines for visual separation
				const separator = '\n\n';
				const newFullContent = existingContent + separator + newContent.value.trim();
				this.currentThinkingValue = newFullContent;
				this.renderMarkdown(newFullContent);
				contentChanged = true;
			}
		}

		// Update metadata if provided
		if (newContent.metadata && newContent.metadata !== this.currentMetadata) {
			this.currentMetadata = newContent.metadata;

			if (!this.metadataContainer) {
				this.metadataContainer = dom.$('div.thinking-metadata');
				dom.append(this.thinkingContainer, this.metadataContainer);
				contentChanged = true;
			}

			if (this.metadataContainer) {
				dom.clearNode(this.metadataContainer);

				// Dispose any previous metadata markdown result
				if (this.metadataMarkdownResult) {
					this.metadataMarkdownResult.dispose();
					this.metadataMarkdownResult = undefined;
				}

				// Render the metadata
				const metadataMarkdown = this.renderer.render(new MarkdownString(this.currentMetadata));
				this.metadataMarkdownResult = metadataMarkdown;
				this.metadataContainer.appendChild(metadataMarkdown.element);
				contentChanged = true;
			}
		}

		// Add a subtle highlight effect to the thinking content container when updated
		if (contentChanged) {
			// Flash effect on update
			this.thinkingContentWrapper.classList.add('thinking-updated');
			setTimeout(() => {
				this.thinkingContentWrapper.classList.remove('thinking-updated');
			}, 500);

			// If we're collapsed and got an update, auto-expand to show new content
			if (this.isCollapsed) {
				this.isCollapsed = false;
				this.thinkingContainer.classList.remove('collapsed');
				this.thinkingContentWrapper.classList.remove('collapsed');

				// Update the collapse button icon
				const collapseIcon = this.collapseButton.querySelector('.codicon');
				if (collapseIcon) {
					collapseIcon.classList.add('codicon-chevron-up');
					collapseIcon.classList.remove('codicon-chevron-down');
				}

				// Update accessibility attribute
				this.domNode.setAttribute('aria-expanded', 'true');
			}

			this._onDidChangeHeight.fire();
		}
	}

	/**
	 * Render markdown content in the thinking container
	 */
	private renderMarkdown(content: string): void {
		// Clean up previous markdown rendering if any
		if (this.markdownResult) {
			this.markdownResult.dispose();
			this.markdownResult = undefined;
		}

		// Clear the container
		dom.clearNode(this.textContainer);

		// Render new markdown
		const markdownResult = this.renderer.render(new MarkdownString(content));
		this.markdownResult = markdownResult;

		// Add the rendered element to the container
		this.textContainer.appendChild(markdownResult.element);

		// Highlight the newly rendered content
		this.textContainer.classList.add('thinking-text-updated');
		setTimeout(() => {
			this.textContainer.classList.remove('thinking-text-updated');
		}, 300);
	}

	/**
	 * Append text to the container
	 * This ensures the text stays visible and accumulates properly
	 */
	private appendText(text: string): void {
		// We want each new part to be on its own line, clearly separated

		// First, identify if the text should be treated as a new section
		const isNewSection = text.trim().length > 0 &&
			(text.startsWith('\n') || !this.currentThinkingValue.endsWith('\n\n'));

		// Format the full text to render
		let textToRender;

		if (isNewSection && this.currentThinkingValue.trim().length > 0) {
			// This is a new section, make sure we have proper separation
			textToRender = this.currentThinkingValue;
			// Make sure we have at least double newlines between sections
			if (!textToRender.endsWith('\n\n')) {
				if (textToRender.endsWith('\n')) {
					textToRender += '\n';
				} else {
					textToRender += '\n\n';
				}
			}
		} else {
			textToRender = this.currentThinkingValue;
		}

		// Render the full markdown
		this.renderMarkdown(textToRender);

		// Highlight the newly rendered content
		this.textContainer.classList.add('thinking-text-updated');
		setTimeout(() => {
			this.textContainer.classList.remove('thinking-text-updated');
		}, 300);
	}

	/**
	 * Toggle the collapsed state of the thinking part
	 */
	private toggleCollapsed(): void {
		this.isCollapsed = !this.isCollapsed;

		// Update the visual state
		this.thinkingContainer.classList.toggle('collapsed', this.isCollapsed);
		this.thinkingContentWrapper.classList.toggle('collapsed', this.isCollapsed);

		// Update the collapse button icon
		const collapseIcon = this.collapseButton.querySelector('.codicon');
		if (collapseIcon) {
			collapseIcon.classList.toggle('codicon-chevron-up', !this.isCollapsed);
			collapseIcon.classList.toggle('codicon-chevron-down', this.isCollapsed);
		}

		// Update accessibility attributes
		this.domNode.setAttribute('aria-expanded', this.isCollapsed ? 'false' : 'true');

		// Notify about the height change
		this._onDidChangeHeight.fire();
	}

	/**
	 * Clean up resources when this part is disposed
	 */
	override dispose(): void {
		// Clean up markdown rendering results
		if (this.markdownResult) {
			this.markdownResult.dispose();
			this.markdownResult = undefined;
		}

		if (this.metadataMarkdownResult) {
			this.metadataMarkdownResult.dispose();
			this.metadataMarkdownResult = undefined;
		}

		super.dispose();
	}
}
