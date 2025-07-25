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

	// Track the accumulated content
	private currentThinkingValue: string;
	private currentMetadata?: string;
	private readonly thinkingChunks: Map<string, string> = new Map();

	private readonly _onDidChangeHeight = new Emitter<void>();
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private readonly textContainer: HTMLElement;
	private readonly thinkingContainer: HTMLElement;
	private metadataContainer?: HTMLElement;

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
	) {
		super();

		this.currentThinkingValue = content.value || '';
		this.currentMetadata = content.metadata;

		// Store the initial chunk
		if (content.id) {
			this.thinkingChunks.set(content.id, content.value || '');
		}

		this.domNode = dom.$('div.thinking-content');

		this.thinkingContainer = dom.$('div.thinking-container');
		dom.append(this.domNode, this.thinkingContainer);

		// Add the thinking header with icon
		const thinkingHeader = dom.$('div.thinking-header');
		dom.append(this.thinkingContainer, thinkingHeader);

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

		// thinking content
		this.textContainer = dom.$('div.thinking-text');
		dom.append(this.thinkingContainer, this.textContainer);

		// Set initial content if any
		if (this.currentThinkingValue) {
			this.textContainer.textContent = this.currentThinkingValue;
		}

		// Add metadata container if needed
		if (this.currentMetadata) {
			this.metadataContainer = dom.$('div.thinking-metadata');
			dom.append(this.thinkingContainer, this.metadataContainer);
			this.metadataContainer.textContent = this.currentMetadata;
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

		// Add this chunk to our collection, avoid duplicates
		if (newContent.id && !this.thinkingChunks.has(newContent.id)) {
			this.thinkingChunks.set(newContent.id, newContent.value || '');

			// Combine all chunks into one continuous text
			const combinedValue = Array.from(this.thinkingChunks.values()).join('');

			// Ensure we store the current value for future comparisons
			if (combinedValue.length > 0 && combinedValue !== this.currentThinkingValue) {
				const existingContent = this.currentThinkingValue || '';

				// Only append the new text that isn't already in the current value
				if (combinedValue.length > existingContent.length) {
					const newTextToAppend = combinedValue.substring(existingContent.length);
					this.currentThinkingValue = combinedValue;
					this.appendText(newTextToAppend);
					contentChanged = true;
				} else {
					// If for some reason the new content is shorter or completely different, just replace
					this.textContainer.textContent = combinedValue;
					this.currentThinkingValue = combinedValue;
					contentChanged = true;
				}
			}
		} else if (newContent.value && newContent.value !== this.currentThinkingValue) {
			// Direct update with new content - accumulate it
			const existingContent = this.currentThinkingValue || '';

			// Make sure we're only adding new content
			if (newContent.value.length > existingContent.length && newContent.value.startsWith(existingContent)) {
				const newTextToAppend = newContent.value.substring(existingContent.length);
				this.currentThinkingValue = newContent.value;
				this.appendText(newTextToAppend);
				contentChanged = true;
			} else if (!existingContent.includes(newContent.value)) {
				// If it's completely new content, just append it
				this.currentThinkingValue = (this.currentThinkingValue || '') + newContent.value;
				this.appendText(newContent.value);
				contentChanged = true;
			}
		}		// Update metadata if provided
		if (newContent.metadata && newContent.metadata !== this.currentMetadata) {
			this.currentMetadata = newContent.metadata;

			if (!this.metadataContainer) {
				this.metadataContainer = dom.$('div.thinking-metadata');
				dom.append(this.thinkingContainer, this.metadataContainer);
				contentChanged = true;
			}

			if (this.metadataContainer) {
				this.metadataContainer.textContent = this.currentMetadata;
				contentChanged = true;
			}
		}

		if (contentChanged) {
			this._onDidChangeHeight.fire();
		}
	}

	/**
	 * Append text to the container
	 * This ensures the text stays visible and accumulates properly
	 */
	private appendText(text: string): void {
		// Directly update the text content of the container
		// This ensures all text stays visible
		const currentText = this.textContainer.textContent || '';
		this.textContainer.textContent = currentText + text;

		// Optionally add a temporary highlight effect to the newest text
		this.textContainer.classList.add('thinking-text-updated');
		setTimeout(() => {
			this.textContainer.classList.remove('thinking-text-updated');
		}, 300);
	}
}
