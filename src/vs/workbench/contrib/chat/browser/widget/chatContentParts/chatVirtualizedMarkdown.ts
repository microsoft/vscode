/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../../common/constants.js';

const $ = dom.$;

/**
 * Configuration for virtualized markdown rendering.
 */
export interface IVirtualizedMarkdownConfig {
	/**
	 * Height threshold in pixels to enable virtualization.
	 * Content shorter than this will be rendered normally.
	 */
	readonly virtualizationThreshold: number;

	/**
	 * Extra margin above/below the viewport to pre-render content.
	 * This helps provide smooth scrolling experience.
	 */
	readonly overscanMargin: number;

	/**
	 * Estimated height per block element for initial layout.
	 */
	readonly estimatedBlockHeight: number;

	/**
	 * Minimum number of blocks to render at once.
	 */
	readonly minBlocksToRender: number;
}

const DEFAULT_CONFIG: IVirtualizedMarkdownConfig = {
	virtualizationThreshold: 2000,  // Enable virtualization for content > 2000px
	overscanMargin: 500,            // Pre-render 500px above/below viewport
	estimatedBlockHeight: 24,       // Assume ~24px per block initially
	minBlocksToRender: 10,          // Always render at least 10 blocks
};

/**
 * Represents a block of content that can be virtualized.
 */
interface IVirtualizedBlock {
	/** Unique identifier for this block */
	readonly id: number;
	/** The DOM element for this block */
	element: HTMLElement;
	/** Whether this block is currently rendered in the DOM */
	isRendered: boolean;
	/** Measured or estimated height of this block */
	height: number;
	/** Top offset from the start of the content */
	top: number;
	/** Whether height has been measured (vs estimated) */
	heightMeasured: boolean;
}

/**
 * Manages virtualized rendering of markdown content.
 * Only renders blocks that are visible within the viewport plus overscan margin.
 */
export class VirtualizedMarkdownManager extends Disposable {
	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private readonly blocks: IVirtualizedBlock[] = [];
	private readonly container: HTMLElement;
	private readonly content: HTMLElement;
	private readonly spacerTop: HTMLElement;
	private readonly spacerBottom: HTMLElement;

	private readonly config: IVirtualizedMarkdownConfig;

	private intersectionObserver: IntersectionObserver | undefined;
	private scrollContainer: HTMLElement | undefined;
	private isVirtualizationEnabled = false;
	private totalHeight = 0;
	private renderedRange = { start: 0, end: 0 };

	private readonly blockDisposables = this._register(new DisposableStore());

	constructor(
		parentElement: HTMLElement,
		private readonly configurationService: IConfigurationService,
	) {
		super();

		this.config = this.getConfig();

		// Create the container structure
		this.container = $('div.virtualized-markdown-container');
		this.spacerTop = $('div.virtualized-markdown-spacer-top');
		this.content = $('div.virtualized-markdown-content');
		this.spacerBottom = $('div.virtualized-markdown-spacer-bottom');

		this.container.appendChild(this.spacerTop);
		this.container.appendChild(this.content);
		this.container.appendChild(this.spacerBottom);

		parentElement.appendChild(this.container);

		this._register(toDisposable(() => {
			this.intersectionObserver?.disconnect();
		}));
	}

	private getConfig(): IVirtualizedMarkdownConfig {
		const enabled = this.configurationService.getValue<boolean>(ChatConfiguration.VirtualizedMarkdown);
		if (!enabled) {
			return {
				...DEFAULT_CONFIG,
				virtualizationThreshold: Number.MAX_SAFE_INTEGER, // Effectively disable
			};
		}
		return DEFAULT_CONFIG;
	}

	/**
	 * Initialize the content to be virtualized.
	 * Parses the markdown DOM into blocks and sets up virtualization if needed.
	 */
	initialize(markdownElement: HTMLElement, scrollContainer?: HTMLElement): void {
		this.scrollContainer = scrollContainer;
		this.parseBlocks(markdownElement);

		// Calculate total height and determine if virtualization is needed
		this.measureBlocksAndCalculateLayout();

		if (this.totalHeight > this.config.virtualizationThreshold) {
			this.enableVirtualization();
		} else {
			this.disableVirtualization(markdownElement);
		}
	}

	/**
	 * Parse the markdown DOM into virtualizable blocks.
	 */
	private parseBlocks(element: HTMLElement): void {
		this.blocks.length = 0;
		let blockId = 0;
		let currentTop = 0;

		// Get all top-level block elements
		const blockElements = this.getBlockElements(element);

		for (const blockElement of blockElements) {
			const block: IVirtualizedBlock = {
				id: blockId++,
				element: blockElement.cloneNode(true) as HTMLElement,
				isRendered: false,
				height: this.config.estimatedBlockHeight,
				top: currentTop,
				heightMeasured: false,
			};
			this.blocks.push(block);
			currentTop += block.height;
		}

		this.totalHeight = currentTop;
	}

	/**
	 * Extract block-level elements from markdown content.
	 */
	private getBlockElements(element: HTMLElement): HTMLElement[] {
		const blocks: HTMLElement[] = [];
		const blockTags = new Set([
			'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
			'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE',
			'HR', 'FIGURE', 'SECTION', 'ARTICLE'
		]);

		for (const child of element.children) {
			if (dom.isHTMLElement(child)) {
				if (blockTags.has(child.tagName)) {
					blocks.push(child);
				} else {
					// Wrap inline content in a container
					const wrapper = $('div.virtualized-inline-wrapper');
					wrapper.appendChild(child.cloneNode(true));
					blocks.push(wrapper);
				}
			}
		}

		// If no block elements found, treat the whole content as one block
		if (blocks.length === 0 && element.childNodes.length > 0) {
			const wrapper = $('div.virtualized-content-wrapper');
			wrapper.innerHTML = element.innerHTML;
			blocks.push(wrapper);
		}

		return blocks;
	}

	/**
	 * Measure actual heights of blocks and update layout.
	 */
	private measureBlocksAndCalculateLayout(): void {
		// Create a temporary hidden container to measure blocks
		const measureContainer = $('div.virtualized-measure-container');
		measureContainer.style.position = 'absolute';
		measureContainer.style.visibility = 'hidden';
		measureContainer.style.width = this.container.offsetWidth + 'px';
		dom.getWindow(this.container).document.body.appendChild(measureContainer);

		let currentTop = 0;
		for (const block of this.blocks) {
			measureContainer.appendChild(block.element);
			block.height = block.element.offsetHeight || this.config.estimatedBlockHeight;
			block.top = currentTop;
			block.heightMeasured = true;
			currentTop += block.height;
			measureContainer.removeChild(block.element);
		}

		this.totalHeight = currentTop;
		measureContainer.remove();
	}

	/**
	 * Enable virtualized rendering.
	 */
	private enableVirtualization(): void {
		this.isVirtualizationEnabled = true;

		// Set up intersection observer for visibility tracking
		this.setupIntersectionObserver();

		// Initial render of visible blocks
		this.updateVisibleBlocks();

		// Listen for scroll events
		if (this.scrollContainer) {
			this.blockDisposables.add(dom.addDisposableListener(
				this.scrollContainer,
				'scroll',
				() => this.onScroll(),
				{ passive: true }
			));
		}
	}

	/**
	 * Disable virtualization and render all content normally.
	 */
	private disableVirtualization(originalElement: HTMLElement): void {
		this.isVirtualizationEnabled = false;
		this.spacerTop.style.height = '0';
		this.spacerBottom.style.height = '0';
		this.content.innerHTML = '';
		this.content.appendChild(originalElement.cloneNode(true));
	}

	/**
	 * Set up IntersectionObserver for efficient visibility detection.
	 */
	private setupIntersectionObserver(): void {
		if (typeof IntersectionObserver === 'undefined') {
			return;
		}

		this.intersectionObserver = new IntersectionObserver(
			(entries) => this.onIntersection(entries),
			{
				root: this.scrollContainer ?? null,
				rootMargin: `${this.config.overscanMargin}px 0px`,
				threshold: 0,
			}
		);

		// Observe the container for visibility changes
		this.intersectionObserver.observe(this.container);
	}

	/**
	 * Handle intersection observer callbacks.
	 */
	private onIntersection(entries: IntersectionObserverEntry[]): void {
		for (const entry of entries) {
			if (entry.target === this.container && entry.isIntersecting) {
				this.updateVisibleBlocks();
			}
		}
	}

	/**
	 * Handle scroll events to update visible blocks.
	 */
	private onScroll(): void {
		if (this.isVirtualizationEnabled) {
			this.updateVisibleBlocks();
		}
	}

	/**
	 * Update which blocks are rendered based on current scroll position.
	 */
	private updateVisibleBlocks(): void {
		if (!this.isVirtualizationEnabled || this.blocks.length === 0) {
			return;
		}

		const viewport = this.getViewport();
		const visibleRange = this.calculateVisibleRange(viewport);

		// Only update if range has changed significantly
		if (visibleRange.start === this.renderedRange.start &&
			visibleRange.end === this.renderedRange.end) {
			return;
		}

		this.renderRange(visibleRange);
		this.renderedRange = visibleRange;
	}

	/**
	 * Get the current viewport bounds relative to the content.
	 */
	private getViewport(): { top: number; bottom: number } {
		const containerRect = this.container.getBoundingClientRect();
		const scrollTop = this.scrollContainer?.scrollTop ?? 0;
		const viewportHeight = this.scrollContainer?.clientHeight ?? dom.getWindow(this.container).innerHeight;

		// Calculate viewport relative to container
		const relativeTop = Math.max(0, scrollTop - containerRect.top - this.config.overscanMargin);
		const relativeBottom = relativeTop + viewportHeight + (2 * this.config.overscanMargin);

		return { top: relativeTop, bottom: relativeBottom };
	}

	/**
	 * Calculate which blocks should be visible in the given viewport.
	 */
	private calculateVisibleRange(viewport: { top: number; bottom: number }): { start: number; end: number } {
		let start = 0;
		let end = this.blocks.length;

		// Binary search for start
		let low = 0;
		let high = this.blocks.length - 1;
		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			const block = this.blocks[mid];
			if (block.top + block.height < viewport.top) {
				low = mid + 1;
			} else {
				high = mid - 1;
			}
		}
		start = Math.max(0, low - 1);

		// Binary search for end
		low = start;
		high = this.blocks.length - 1;
		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			const block = this.blocks[mid];
			if (block.top > viewport.bottom) {
				high = mid - 1;
			} else {
				low = mid + 1;
			}
		}
		end = Math.min(this.blocks.length, high + 2);

		// Ensure minimum blocks are rendered
		const currentRange = end - start;
		if (currentRange < this.config.minBlocksToRender) {
			const deficit = this.config.minBlocksToRender - currentRange;
			const expandStart = Math.floor(deficit / 2);
			const expandEnd = deficit - expandStart;
			start = Math.max(0, start - expandStart);
			end = Math.min(this.blocks.length, end + expandEnd);
		}

		return { start, end };
	}

	/**
	 * Render blocks in the specified range.
	 */
	private renderRange(range: { start: number; end: number }): void {
		// Calculate spacer heights
		const topSpacerHeight = range.start > 0 ? this.blocks[range.start].top : 0;
		const lastRenderedBlock = this.blocks[range.end - 1];
		const bottomSpacerHeight = lastRenderedBlock
			? this.totalHeight - (lastRenderedBlock.top + lastRenderedBlock.height)
			: 0;

		// Update spacers
		this.spacerTop.style.height = `${topSpacerHeight}px`;
		this.spacerBottom.style.height = `${Math.max(0, bottomSpacerHeight)}px`;

		// Clear current content
		dom.clearNode(this.content);

		// Render visible blocks
		for (let i = range.start; i < range.end && i < this.blocks.length; i++) {
			const block = this.blocks[i];
			block.isRendered = true;
			this.content.appendChild(block.element);
		}

		// Mark non-visible blocks as not rendered
		for (let i = 0; i < range.start; i++) {
			this.blocks[i].isRendered = false;
		}
		for (let i = range.end; i < this.blocks.length; i++) {
			this.blocks[i].isRendered = false;
		}

		this._onDidChangeHeight.fire();
	}

	/**
	 * Update content with new markdown (for streaming updates).
	 */
	updateContent(markdownElement: HTMLElement): void {
		this.blockDisposables.clear();
		this.parseBlocks(markdownElement);
		this.measureBlocksAndCalculateLayout();

		if (this.totalHeight > this.config.virtualizationThreshold) {
			if (!this.isVirtualizationEnabled) {
				this.enableVirtualization();
			} else {
				this.updateVisibleBlocks();
			}
		} else {
			this.disableVirtualization(markdownElement);
		}
	}

	/**
	 * Get the total height of all content.
	 */
	getTotalHeight(): number {
		return this.totalHeight;
	}

	/**
	 * Check if virtualization is currently active.
	 */
	isActive(): boolean {
		return this.isVirtualizationEnabled;
	}

	/**
	 * Force a re-render of visible blocks.
	 */
	refresh(): void {
		if (this.isVirtualizationEnabled) {
			this.renderedRange = { start: -1, end: -1 };
			this.updateVisibleBlocks();
		}
	}

	/**
	 * Get the container element.
	 */
	getDomNode(): HTMLElement {
		return this.container;
	}

	/**
	 * Clean up observers and listeners.
	 */
	override dispose(): void {
		this.intersectionObserver?.disconnect();
		this.blocks.length = 0;
		super.dispose();
	}
}

/**
 * Check if virtualized markdown rendering should be used for the given content.
 */
export function shouldUseVirtualizedMarkdown(
	configurationService: IConfigurationService,
	contentLength: number
): boolean {
	const enabled = configurationService.getValue<boolean>(ChatConfiguration.VirtualizedMarkdown);
	if (!enabled) {
		return false;
	}

	// Only virtualize for substantial content
	// Approximate: ~50 chars per line, ~24px per line = 1 char = ~0.5px
	const estimatedHeight = contentLength * 0.5;
	return estimatedHeight > DEFAULT_CONFIG.virtualizationThreshold;
}
