/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';

/**
 * Batches DOM updates during streaming to reduce layout thrashing.
 * Instead of updating the DOM on every token, collects updates and
 * applies them in batches using requestAnimationFrame.
 */
export class MarkdownUpdateBatcher extends Disposable {
	private readonly _onBatchComplete = this._register(new Emitter<void>());
	readonly onBatchComplete: Event<void> = this._onBatchComplete.event;

	private pendingUpdates: (() => void)[] = [];
	private batchScheduled = false;
	private readonly batchDelay: number;

	constructor(batchDelayMs: number = 16) {
		super();
		this.batchDelay = batchDelayMs;
	}

	/**
	 * Queue an update to be executed in the next batch.
	 */
	queueUpdate(update: () => void): void {
		this.pendingUpdates.push(update);
		this.scheduleBatch();
	}

	/**
	 * Schedule a batch execution if not already scheduled.
	 */
	private scheduleBatch(): void {
		if (this.batchScheduled) {
			return;
		}

		this.batchScheduled = true;

		if (this.batchDelay === 0) {
			// Use requestAnimationFrame for frame-synchronized updates
			mainWindow.requestAnimationFrame(() => this.executeBatch());
		} else {
			// Use setTimeout for custom delay
			setTimeout(() => this.executeBatch(), this.batchDelay);
		}
	}

	/**
	 * Execute all pending updates in a single batch.
	 */
	private executeBatch(): void {
		this.batchScheduled = false;

		const updates = this.pendingUpdates;
		this.pendingUpdates = [];

		if (updates.length === 0) {
			return;
		}

		// Execute all updates in a single "frame"
		for (const update of updates) {
			try {
				update();
			} catch (e) {
				console.error('Error executing batched update:', e);
			}
		}

		this._onBatchComplete.fire();
	}

	/**
	 * Force immediate execution of all pending updates.
	 */
	flush(): void {
		if (this.pendingUpdates.length > 0) {
			this.executeBatch();
		}
	}

	/**
	 * Clear all pending updates without executing them.
	 */
	clear(): void {
		this.pendingUpdates = [];
		this.batchScheduled = false;
	}

	/**
	 * Check if there are pending updates.
	 */
	hasPendingUpdates(): boolean {
		return this.pendingUpdates.length > 0;
	}

	override dispose(): void {
		this.clear();
		super.dispose();
	}
}

/**
 * Configuration for lazy block rendering.
 */
export interface ILazyBlockConfig {
	/**
	 * Threshold in pixels from viewport edge to start pre-rendering.
	 */
	preRenderMargin: number;

	/**
	 * Minimum content height to enable lazy rendering.
	 */
	lazyRenderThreshold: number;

	/**
	 * Placeholder height for unrendered blocks.
	 */
	placeholderHeight: number;
}

const DEFAULT_LAZY_CONFIG: ILazyBlockConfig = {
	preRenderMargin: 500,
	lazyRenderThreshold: 2000,
	placeholderHeight: 100,
};

/**
 * Manages lazy rendering of content blocks using IntersectionObserver.
 * Only renders blocks when they are about to become visible.
 */
export class LazyBlockRenderer extends Disposable {
	private readonly _onBlockRendered = this._register(new Emitter<HTMLElement>());
	readonly onBlockRendered: Event<HTMLElement> = this._onBlockRendered.event;

	private readonly _onHeightChange = this._register(new Emitter<void>());
	readonly onHeightChange: Event<void> = this._onHeightChange.event;

	private readonly observer: IntersectionObserver | undefined;
	private readonly pendingBlocks = new Map<HTMLElement, () => HTMLElement>();
	private readonly config: ILazyBlockConfig;

	constructor(
		scrollContainer: HTMLElement | null,
		config?: Partial<ILazyBlockConfig>
	) {
		super();

		this.config = { ...DEFAULT_LAZY_CONFIG, ...config };

		if (typeof IntersectionObserver !== 'undefined') {
			this.observer = new IntersectionObserver(
				(entries) => this.handleIntersection(entries),
				{
					root: scrollContainer,
					rootMargin: `${this.config.preRenderMargin}px 0px`,
					threshold: 0,
				}
			);
		}
	}

	/**
	 * Register a placeholder element that should be lazily rendered.
	 * @param placeholder The placeholder element currently in the DOM
	 * @param renderFn Function to call when block should be rendered, returns the real content
	 */
	registerLazyBlock(placeholder: HTMLElement, renderFn: () => HTMLElement): void {
		this.pendingBlocks.set(placeholder, renderFn);
		this.observer?.observe(placeholder);
	}

	/**
	 * Handle intersection observer callbacks.
	 */
	private handleIntersection(entries: IntersectionObserverEntry[]): void {
		for (const entry of entries) {
			if (!entry.isIntersecting) {
				continue;
			}

			const placeholder = entry.target as HTMLElement;
			const renderFn = this.pendingBlocks.get(placeholder);

			if (renderFn) {
				this.observer?.unobserve(placeholder);
				this.pendingBlocks.delete(placeholder);

				// Render the actual content
				const content = renderFn();
				placeholder.replaceWith(content);

				this._onBlockRendered.fire(content);
				this._onHeightChange.fire();
			}
		}
	}

	/**
	 * Force render all pending blocks.
	 */
	renderAll(): void {
		for (const [placeholder, renderFn] of this.pendingBlocks) {
			this.observer?.unobserve(placeholder);
			const content = renderFn();
			placeholder.replaceWith(content);
			this._onBlockRendered.fire(content);
		}
		this.pendingBlocks.clear();
		this._onHeightChange.fire();
	}

	/**
	 * Create a placeholder element for lazy rendering.
	 */
	createPlaceholder(estimatedHeight?: number): HTMLElement {
		const placeholder = document.createElement('div');
		placeholder.className = 'lazy-block-placeholder';
		placeholder.style.height = `${estimatedHeight ?? this.config.placeholderHeight}px`;
		placeholder.style.minHeight = '20px';
		return placeholder;
	}

	/**
	 * Check if lazy rendering should be used based on content height.
	 */
	shouldUseLazyRendering(totalHeight: number): boolean {
		return totalHeight > this.config.lazyRenderThreshold;
	}

	override dispose(): void {
		this.observer?.disconnect();
		this.pendingBlocks.clear();
		super.dispose();
	}
}

/**
 * Utility to measure and cache element heights efficiently.
 */
export class HeightCache {
	private readonly cache = new Map<string, number>();

	/**
	 * Get cached height or measure and cache it.
	 */
	getHeight(key: string, element: HTMLElement, forceRemeasure = false): number {
		if (!forceRemeasure && this.cache.has(key)) {
			return this.cache.get(key)!;
		}

		const height = element.offsetHeight;
		this.cache.set(key, height);
		return height;
	}

	/**
	 * Invalidate a cached height.
	 */
	invalidate(key: string): void {
		this.cache.delete(key);
	}

	/**
	 * Clear all cached heights.
	 */
	clear(): void {
		this.cache.clear();
	}
}
